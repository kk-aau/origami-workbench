import {useEffect,useId,useMemo,useRef,useState,type PointerEvent} from 'react';
import type {DiagramSpatialDiagnostic} from '../app/diagramSpatialDiagnostic';
import type {DiagramSpatialPose} from '../app/diagramSpatialPose';
import {arcballCamera} from '../app/diagramArcball';
import AppDialog from './AppDialog';
import DiagramRotationGizmo from './DiagramRotationGizmo';
import './DiagramSpatialDiagnosticView.css';

type Point3=[number,number,number];
type Camera=DiagramSpatialPose['camera'];
export interface DiagramSpatialDiagnosticViewProps {diagnostic:DiagramSpatialDiagnostic;onClose:()=>void}
const names:Record<DiagramSpatialDiagnostic['kind'],string>={
  intersection:'纸面相交', 'layer-cycle':'局部层序循环',
  'missing-layer-order':'缺少上下层关系', 'layer-conflict':'纸层关系冲突',
};
const guidance:Record<DiagramSpatialDiagnostic['kind'],string>={
  intersection:'转动查看相交区域，并在 CP 中找到对应纸面；检查附近折角与作用纸层。',
  'layer-cycle':'查看同一重叠区域内的循环关系，检查这些纸面已设置的上下关系与作用纸层。',
  'missing-layer-order':'这些纸面重叠，但当前资料不能确定上下关系；返回后检查或指定上下关系。',
  'layer-conflict':'当前纸层关系无法同时满足。高亮表示涉及的纸面，尚不能定位到唯一错误折痕。',
};
function centerAndRadius(points:readonly Point3[]){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
  const center=(points.length?lo.map((x,k)=>(x+hi[k])/2):[0,0,0]) as Point3;
  let radius=1e-6;for(const p of points)radius=Math.max(radius,Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]));
  return {center,radius};
}
// Projection only: the diagnostic must never invoke the failed layer solver.
function project(points:readonly Point3[],camera:Camera):Point3[]{
  const yaw=camera.yaw*Math.PI/180,e=camera.elevation*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw),ce=Math.cos(e),se=Math.sin(e);
  const r=camera.rotation??[c,s,0,-s*ce,c*ce,-se,-s*se,c*se,ce],pivot=camera.pivot??[0,0,0];
  return points.map(p=>{const x=p[0]-pivot[0],y=p[1]-pivot[1],z=p[2]-pivot[2];return [r[0]*x+r[1]*y+r[2]*z,r[3]*x+r[4]*y+r[5]*z,r[6]*x+r[7]*y+r[8]*z];});
}
const ringPath=(points:readonly (readonly number[])[])=>points.length?`M${points.map(p=>`${p[0]},${p[1]}`).join('L')}Z`:'';
const facePath=(vertices:readonly (readonly number[])[],face:number[],holes:number[][]=[])=>[face,...holes].map(ring=>ringPath(ring.map(i=>vertices[i]))).join('');
const average=(points:readonly (readonly number[])[])=>points.reduce((p,q)=>[p[0]+q[0]/points.length,p[1]+q[1]/points.length],[0,0]);
const defaultCamera=(pivot:Point3):Camera=>({yaw:-24,elevation:32,pivot});

/** Read-only candidate geometry. Transparency intentionally exposes all involved faces. */
export default function DiagramSpatialDiagnosticView({diagnostic,onClose}:DiagramSpatialDiagnosticViewProps){
  const d=diagnostic,patternId=`spatial-diagnostic-${useId().replace(/:/g,'')}`;
  const related=useMemo(()=>new Set(d.faceIds),[d]);
  const relatedVertices=useMemo(()=>Array.from(new Set(d.faceIds.flatMap(i=>d.faces[i]??[]))).map(i=>d.vertices3D[i]),[d]);
  const fit=useMemo(()=>centerAndRadius(relatedVertices.length?relatedVertices:d.vertices3D),[d,relatedVertices]);
  const [camera,setCamera]=useState<Camera>(()=>defaultCamera(fit.center));
  const [radius,setRadius]=useState(fit.radius),[zoom,setZoom]=useState(1);
  const [selected,setSelected]=useState<number|null>(d.faceIds[0]??null);
  const [onlyRelated,setOnlyRelated]=useState(false),[fadeOthers,setFadeOthers]=useState(true);
  const spatialSvg=useRef<SVGSVGElement>(null),frame=useRef<number|null>(null),pending=useRef<Camera|null>(null);
  const drag=useRef<{id:number;x:number;y:number;left:number;top:number;width:number;height:number;camera:Camera}|null>(null);
  const ignoreClick=useRef(false);
  const faceIds=useMemo(()=>d.faces.map((_,i)=>i).filter(i=>!onlyRelated||related.has(i)).sort((a,b)=>Number(related.has(a))-Number(related.has(b))||Number(a===selected)-Number(b===selected)),[d,onlyRelated,related,selected]);
  const projected=useMemo(()=>project(d.vertices3D,camera),[d,camera]);
  const regions3D=useMemo(()=>(d.region??[]).map(region=>project(region.vertices3D,camera)),[d,camera]);
  const cpBox=useMemo(()=>{
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const [x,y] of d.verticesCP){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    const width=Math.max(1e-6,maxX-minX),height=Math.max(1e-6,maxY-minY),pad=Math.max(width,height)*.08;
    return {viewBox:`${minX-pad} ${minY-pad} ${width+2*pad} ${height+2*pad}`,size:Math.max(width,height)};
  },[d]);
  const extent=radius*1.28/zoom;
  useEffect(()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;pending.current=null;drag.current=null;setCamera(defaultCamera(fit.center));setRadius(fit.radius);setZoom(1);setSelected(d.faceIds[0]??null);},[d,fit]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
  useEffect(()=>{
    const svg=spatialSvg.current;if(!svg)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();e.stopPropagation();setZoom(z=>Math.max(.1,Math.min(30,z*Math.exp(-e.deltaY*.0015))));};
    svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);
  },[]);
  const queueCamera=(next:Camera)=>{pending.current=next;if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;if(pending.current)setCamera(pending.current);pending.current=null;});};
  const cancelPending=()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;pending.current=null;};
  const reset=()=>{cancelPending();setCamera(defaultCamera(fit.center));setRadius(fit.radius);setZoom(1);};
  const focusProblem=()=>{
    cancelPending();
    const face=selected!==null&&related.has(selected)?selected:d.faceIds[0];
    setSelected(face??null);
    const regions=d.region?.filter(r=>r.faceId===face).flatMap(r=>r.vertices3D);
    const points=regions?.length?regions:face!==undefined?d.faces[face].map(i=>d.vertices3D[i]):relatedVertices;
    const target=centerAndRadius(points);setCamera(c=>({...c,pivot:target.center}));setRadius(Math.max(fit.radius*.03,target.radius));setZoom(1);
  };
  const pointerDown=(e:PointerEvent<SVGSVGElement>)=>{
    if(e.button!==0)return;e.preventDefault();ignoreClick.current=false;
    const box=e.currentTarget.getBoundingClientRect();e.currentTarget.setPointerCapture(e.pointerId);
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:box.left,top:box.top,width:box.width,height:box.height,camera};
  };
  const pointerMove=(e:PointerEvent<SVGSVGElement>)=>{
    const active=drag.current;if(!active||active.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-active.x,e.clientY-active.y)>4)ignoreClick.current=true;
    if(ignoreClick.current)queueCamera(arcballCamera(active.camera,[active.x-active.left,active.y-active.top],[e.clientX-active.left,e.clientY-active.top],active));
  };
  const pointerEnd=(e:PointerEvent<SVGSVGElement>)=>{
    if(drag.current?.id!==e.pointerId)return;drag.current=null;
    if(e.type==='pointerup'&&!ignoreClick.current){const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-diagnostic-face]');if(hit&&e.currentTarget.contains(hit))setSelected(Number(hit.getAttribute('data-diagnostic-face')));}
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const selectFace=(id:number)=>{if(!ignoreClick.current)setSelected(id);};
  const badge=(id:number,location:string)=><button key={`${location}-${id}`} type="button" className="diagram-diagnostic-face-button" aria-label={`${location}纸面 F${id+1}`} aria-pressed={selected===id} onClick={()=>setSelected(id)}>F{id+1}</button>;
  const cycle=d.cycle?.length?[...d.cycle,...(d.cycle[0]===d.cycle[d.cycle.length-1]?[]:[d.cycle[0]])]:[];
  return <AppDialog title={`查看折叠问题 · ${names[d.kind]}`} onClose={onClose} size="workspace" className="diagram-spatial-diagnostic" closeLabel="退出诊断" bodyClassName="diagram-diagnostic-body"
    footer={<><span className="diagram-diagnostic-readonly">仅查看失败候选；当前绘图与已保存关系未改变。</span><button type="button" className="primary" onClick={onClose}>返回绘图</button></>}>
    <div className="diagram-diagnostic-summary" role="status"><strong>{names[d.kind]}</strong><p>{d.message}</p><p>{guidance[d.kind]}</p></div>
    <div className="diagram-diagnostic-toolbar">
      <button type="button" onClick={focusProblem}>定位问题</button><button type="button" onClick={reset}>复位视角</button>
      <label><input type="checkbox" checked={onlyRelated} onChange={e=>setOnlyRelated(e.target.checked)}/>只看相关纸面</label>
      <label><input type="checkbox" checked={fadeOthers} disabled={onlyRelated} onChange={e=>setFadeOthers(e.target.checked)}/>淡化其他纸面</label>
    </div>
    <div className="diagram-diagnostic-views">
      <section className="diagram-diagnostic-pane" aria-label="失败候选三维视图">
        <div className="diagram-diagnostic-pane-heading"><strong>三维位置</strong><span>透明显示，查看被遮住的纸层</span></div>
        <div className="diagram-diagnostic-stage">
          <svg ref={spatialSvg} className="diagram-diagnostic-spatial" viewBox={`${-extent} ${-extent} ${extent*2} ${extent*2}`} role="group" aria-label="三维诊断，拖动旋转、滚轮缩放，也可用方向键和加减号" tabIndex={0}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
            onLostPointerCapture={()=>{drag.current=null;}}
            onKeyDown={e=>{
              const steps:Record<string,[number,number]>={ArrowLeft:[-35,0],ArrowRight:[35,0],ArrowUp:[0,-35],ArrowDown:[0,35]};
              if(steps[e.key]){e.preventDefault();const [x,y]=steps[e.key];setCamera(c=>arcballCamera(c,[200,200],[200+x,200+y],{width:400,height:400}));}
              else if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(z=>Math.min(30,z*1.2));}
              else if(e.key==='-'){e.preventDefault();setZoom(z=>Math.max(.1,z/1.2));}
              else if(e.key==='Home'){e.preventDefault();reset();}
            }}>
            {faceIds.map(id=><path key={id} data-diagnostic-face={id} data-selected={selected===id} className={`diagram-diagnostic-paper ${related.has(id)?'is-related':'is-context'} ${selected===id?'is-selected':''} ${fadeOthers?'fade-context':''}`} d={facePath(projected,d.faces[id],d.facesHoles?.[id])} fillRule="evenodd" vectorEffect="non-scaling-stroke" onClick={()=>selectFace(id)}><title>F{id+1}{related.has(id)?' · 涉及问题':''}</title></path>)}
            {regions3D.map((region,i)=><path key={i} className="diagram-diagnostic-region" d={ringPath(region)} vectorEffect="non-scaling-stroke"/>)}
            {d.faceIds.filter(id=>id===selected).map(id=>{const [x,y]=average(d.faces[id].map(i=>projected[i]));return <text key={id} x={x} y={y} className="diagram-diagnostic-face-label" fontSize={extent*.09}>F{id+1}</text>;})}
          </svg>
          <DiagramRotationGizmo camera={camera} onStart={cancelPending} onChange={setCamera} onEnd={setCamera}/>
          <div className="diagram-diagnostic-zoom"><button type="button" aria-label="缩小三维诊断" onClick={()=>setZoom(z=>Math.max(.1,z/1.25))}>−</button><button type="button" aria-label="放大三维诊断" onClick={()=>setZoom(z=>Math.min(30,z*1.25))}>＋</button></div>
        </div>
        <p className="diagram-diagnostic-pane-note">拖动旋转 · 滚轮缩放 · 点击纸面联动 CP</p>
      </section>
      <section className="diagram-diagnostic-pane" aria-label="对应 CP 视图">
        <div className="diagram-diagnostic-pane-heading"><strong>对应 CP</strong><span>{selected===null?'点击纸面选择':`已选择 F${selected+1}`}</span></div>
        <div className="diagram-diagnostic-stage">
          <svg className="diagram-diagnostic-cp" viewBox={cpBox.viewBox} role="group" aria-label="诊断 CP，点击纸面与三维视图联动">
            <defs><pattern id={patternId} width={cpBox.size*.028} height={cpBox.size*.028} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2={cpBox.size*.028} stroke="#bc5325" strokeWidth={cpBox.size*.004}/></pattern></defs>
            {faceIds.map(id=><path key={id} data-diagnostic-cp-face={id} data-selected={selected===id} className={`diagram-diagnostic-paper ${related.has(id)?'is-related':'is-context'} ${selected===id?'is-selected':''} ${fadeOthers?'fade-context':''}`} d={facePath(d.verticesCP,d.faces[id],d.facesHoles?.[id])} fillRule="evenodd" vectorEffect="non-scaling-stroke" onClick={()=>setSelected(id)}><title>F{id+1}{related.has(id)?' · 涉及问题':''}</title></path>)}
            {d.region?.map((region,i)=><path key={i} className="diagram-diagnostic-region" d={ringPath(region.verticesCP)} style={{fill:`url(#${patternId})`}} vectorEffect="non-scaling-stroke"/>)}
            {d.faceIds.map(id=>{const [x,y]=average(d.faces[id].map(i=>d.verticesCP[i]));return <text key={id} x={x} y={y} className="diagram-diagnostic-face-label" fontSize={cpBox.size*.038}>F{id+1}</text>;})}
          </svg>
        </div>
        <p className="diagram-diagnostic-pane-note">橙色为涉及纸面 · 深色边框为当前选择 · 斜纹为问题区域</p>
      </section>
    </div>
    <div className="diagram-diagnostic-details">
      <div className="diagram-diagnostic-face-list"><span>涉及纸面</span>{d.faceIds.map(id=>badge(id,'选择'))}</div>
      {cycle.length>0&&<div className="diagram-diagnostic-cycle" aria-label="局部层序循环链"><span>循环关系</span>{cycle.map((id,i)=><span key={i}>{i>0&&<span aria-hidden="true"> → </span>}{badge(id,'循环中的')}</span>)}</div>}
      {!d.region?.length&&<p>当前证据定位到相关纸面，未提供更小的精确区域；高亮不表示整张纸面都画错。</p>}
    </div>
  </AppDialog>;
}
