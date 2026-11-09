import {useEffect,useId,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {Point} from '../core/types';
import {diagramZoomRegionBounds,diagramZoomRegionPath,diagramZoomWaveSideAt,diagramZoomWavyDivider,validateDiagramZoomRegion,type DiagramZoomBounds,type DiagramZoomCircleRegion,type DiagramZoomRegion} from '../app/diagramZoomGeometry';
import {diagramCalloutNamespaceMarkup,diagramCalloutSourceMarkup} from '../app/diagramCalloutSVG';
import AppDialog from './AppDialog';
import './DiagramZoomRegionDialog.css';

export interface DiagramZoomRegionDialogProps {
  svg:string;bounds:DiagramZoomBounds;initial?:DiagramZoomRegion;
  onConfirm:(region:DiagramZoomRegion)=>void;onClose:()=>void;
}
interface Gesture {
  id:number;target:SVGSVGElement;inverse:DOMMatrix;start:Point;
  circle:DiagramZoomCircleRegion;wave:Point[]|null;side:'left'|'right'|null;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const clonePoints=(points:Point[])=>points.map(p=>[...p] as Point);
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'选区无效，请重新选择。';

/** Selects presentation-only artwork; no CP or physical paper data is edited. */
export default function DiagramZoomRegionDialog({svg,bounds,initial,onConfirm,onClose}:DiagramZoomRegionDialogProps){
  const [kind,setKind]=useState<'circle'|'wave'>(initial?.kind??'circle');
  const [circle,setCircle]=useState<DiagramZoomCircleRegion>(()=>initial?.kind==='circle'?structuredClone(initial):{kind:'circle',center:[bounds.x+bounds.width/2,bounds.y+bounds.height/2],radius:Math.min(bounds.width,bounds.height)*.22});
  const [wave,setWave]=useState<Point[]|null>(()=>initial?.kind==='wave'?clonePoints(initial.points):null);
  const [side,setSide]=useState<'left'|'right'|null>(()=>initial?.kind==='wave'?initial.side:null);
  const [gestureActive,setGestureActive]=useState(false),[draftWave,setDraftWave]=useState<Point[]|null>(null),[error,setError]=useState('');
  const sourceRef=useRef<SVGSVGElement>(null),gesture=useRef<Gesture|null>(null),id='diagram-step-zoom-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const prepared=useMemo(()=>{try{const markup=diagramCalloutSourceMarkup(svg);return {source:diagramCalloutNamespaceMarkup(markup,id+'-source'),detail:diagramCalloutNamespaceMarkup(markup,id+'-detail'),error:''};}catch(error){return {source:'',detail:'',error:errorMessage(error)};}},[svg,id]);
  const selection=useMemo(()=>{
    try{const region:DiagramZoomRegion|null=kind==='circle'?circle:wave&&side?{kind:'wave',points:wave,bounds,side}:null;
      if(!region)return {region:null,path:'',frame:bounds,error:''};validateDiagramZoomRegion(region);
      return {region,path:diagramZoomRegionPath(region),frame:diagramZoomRegionBounds(region),error:''};
    }catch(error){return {region:null,path:'',frame:bounds,error:errorMessage(error)};}
  },[kind,circle,wave,side,bounds]);
  const units=Math.max(bounds.width/620,bounds.height/440),detailUnits=Math.max(selection.frame.width/320,selection.frame.height/400),pad=Math.max(selection.frame.width,selection.frame.height)*.045;
  const previewFrame={x:selection.frame.x-pad,y:selection.frame.y-pad,width:selection.frame.width+pad*2,height:selection.frame.height+pad*2};
  const currentWave=draftWave??wave,dividerPath=currentWave?.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ');
  function release(active:Gesture){if(active.target.hasPointerCapture(active.id))active.target.releasePointerCapture(active.id);}
  function cancelGesture(){const active=gesture.current;if(!active)return;gesture.current=null;setCircle(active.circle);setWave(active.wave);setSide(active.side);setDraftWave(null);setGestureActive(false);release(active);}
  useEffect(()=>{window.addEventListener('blur',cancelGesture);return()=>{window.removeEventListener('blur',cancelGesture);const active=gesture.current;gesture.current=null;if(active)release(active);};},[]);
  function local(inverse:DOMMatrix,x:number,y:number):Point{return [clamp(inverse.a*x+inverse.c*y+inverse.e,bounds.x,bounds.x+bounds.width),clamp(inverse.b*x+inverse.d*y+inverse.f,bounds.y,bounds.y+bounds.height)];}
  function begin(event:ReactPointerEvent<SVGSVGElement>){
    if(event.button!==0)return;const matrix=sourceRef.current?.getScreenCTM();if(!matrix)return;
    event.preventDefault();const inverse=matrix.inverse(),start=local(inverse,event.clientX,event.clientY);setError('');
    if(kind==='wave'&&wave){try{const picked=diagramZoomWaveSideAt(wave,bounds,start);if(!picked)throw new Error('请点击波浪线分割出的一侧区域，避开分界线。');setSide(picked);}catch(error){setError(errorMessage(error));}return;}
    gesture.current={id:event.pointerId,target:event.currentTarget,inverse,start,circle,wave,side};setGestureActive(true);event.currentTarget.setPointerCapture(event.pointerId);
  }
  function update(active:Gesture,x:number,y:number,final=false){
    const at=local(active.inverse,x,y);
    if(kind==='circle')setCircle({kind:'circle',center:active.start,radius:Math.max(.001,Math.hypot(at[0]-active.start[0],at[1]-active.start[1]))});
    else try{const points=diagramZoomWavyDivider(active.start,at,bounds);if(final){setWave(points);setSide(null);setDraftWave(null);}else setDraftWave(points);}catch(error){setDraftWave(null);if(final)setError(errorMessage(error));}
  }
  function move(event:ReactPointerEvent<SVGSVGElement>){const active=gesture.current;if(!active||active.id!==event.pointerId)return;event.preventDefault();if(!(event.buttons&1)||event.buttons&2){cancelGesture();return;}update(active,event.clientX,event.clientY);}
  function end(event:ReactPointerEvent<SVGSVGElement>){const active=gesture.current;if(!active||active.id!==event.pointerId)return;event.preventDefault();const at=local(active.inverse,event.clientX,event.clientY);if(event.button!==0||Math.hypot(at[0]-active.start[0],at[1]-active.start[1])<units*3){cancelGesture();return;}update(active,event.clientX,event.clientY,true);gesture.current=null;setGestureActive(false);release(active);}
  function changeKind(next:'circle'|'wave'){cancelGesture();setKind(next);setError('');}
  function redraw(){cancelGesture();setWave(null);setSide(null);setDraftWave(null);setError('');sourceRef.current?.focus();}
  function numberChange(field:'x'|'y'|'radius',text:string){
    if(text.trim()==='')return;const value=Number(text);if(!Number.isFinite(value))return;
    setError('');setCircle(old=>field==='radius'?{...old,radius:Math.max(.001,value)}:{...old,center:field==='x'?[value,old.center[1]]:[old.center[0],value]});
  }
  function confirm(){if(!selection.region||prepared.error||gestureActive)return;try{onConfirm(structuredClone(selection.region));}catch(error){setError(errorMessage(error));}}
  const instruction=kind==='circle'?'在左图按住鼠标，从圆心拖到边缘；也可输入数值精调。':wave?'点击波浪线的一侧，保留该区域作为后续步骤的放大画面。':'在左图拖出一条波浪分界线，再点击要保留的一侧。';
  const combinedError=prepared.error||selection.error||error;
  return <AppDialog title="设置下一步放大区域" onClose={onClose} size="large" className="diagram-zoom-region-dialog" bodyClassName="diagram-zoom-region-body" closeDisabled={gestureActive}
    onKeyDown={event=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();cancelGesture();}}}
    onCancel={()=>{if(gesture.current)cancelGesture();}}
    footer={<><span>从下一步开始保持放大；放置缩小符号后，下一步恢复原样。</span><button type="button" onClick={onClose}>取消</button><button type="button" className="is-primary" disabled={!selection.region||!!prepared.error||gestureActive} onClick={confirm}>使用此选区</button></>}>
    <div className="diagram-zoom-region-toolbar"><div role="group" aria-label="放大区域形状"><button type="button" aria-pressed={kind==='circle'} onClick={()=>changeKind('circle')}>圆形选区</button><button type="button" aria-pressed={kind==='wave'} onClick={()=>changeKind('wave')}>波浪线分区</button></div>{kind==='wave'&&<button type="button" disabled={!wave&&!draftWave} onClick={redraw}>重画分界线</button>}</div>
    <p className="diagram-zoom-region-instruction" id={id+'-instructions'}>{instruction}</p>
    <div className="diagram-zoom-region-grid">
      <section className="diagram-zoom-region-source"><h3>在当前全图中选区</h3><svg ref={sourceRef} data-zoom-region-source viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="img" aria-label="选择下一步放大区域" aria-describedby={id+'-instructions'} tabIndex={0}
        onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} onContextMenu={event=>{event.preventDefault();cancelGesture();}}
        onKeyDown={event=>{if(kind==='wave'&&wave&&(event.key==='1'||event.key==='2')){event.preventDefault();setSide(event.key==='1'?'left':'right');setError('');}}}>
        <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="white"/><g pointerEvents="none" dangerouslySetInnerHTML={{__html:prepared.source}}/>
        {selection.region&&!draftWave&&<path data-zoom-selected-region d={selection.path} fill="#426d59" fillOpacity=".16" stroke="#426d59" strokeWidth={units*1.6} pointerEvents="none"/>}
        {kind==='circle'&&<circle cx={circle.center[0]} cy={circle.center[1]} r={units*2.7} fill="#426d59" pointerEvents="none"/>}
        {kind==='wave'&&dividerPath&&<path data-zoom-wave-divider d={dividerPath} fill="none" stroke="#293d35" strokeWidth={units*2} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>}
      </svg>
      {kind==='circle'?<div className="diagram-zoom-region-fields"><label>圆心 X<input type="number" aria-label="放大圆心 X" value={Number(circle.center[0].toFixed(3))} step=".5" onChange={event=>numberChange('x',event.target.value)}/></label><label>圆心 Y<input type="number" aria-label="放大圆心 Y" value={Number(circle.center[1].toFixed(3))} step=".5" onChange={event=>numberChange('y',event.target.value)}/></label><label>半径<input type="number" aria-label="放大选区半径" min=".001" value={Number(circle.radius.toFixed(3))} step=".5" onChange={event=>numberChange('radius',event.target.value)}/></label><span>单位：mm</span></div>:
        <div className="diagram-zoom-wave-choice"><label>保留区域<select aria-label="保留波浪线分区" value={side??''} disabled={!wave} onChange={event=>{setSide(event.target.value===''?null:event.target.value as 'left'|'right');setError('');}}><option value="">在上图点击选区</option><option value="left">区域一</option><option value="right">区域二</option></select></label><span>{side?'绿色高亮区域将被保留。':'先画线，再选择其中一个区域。'}</span></div>}
      </section>
      <section className="diagram-zoom-region-detail"><h3>下一步放大预览</h3>{selection.region?<svg data-zoom-region-preview viewBox={`${previewFrame.x} ${previewFrame.y} ${previewFrame.width} ${previewFrame.height}`} role="img" aria-label="下一步放大后的画面"><defs><clipPath id={id+'-clip'} clipPathUnits="userSpaceOnUse"><path d={selection.path}/></clipPath></defs><g clipPath={`url(#${id}-clip)`}><path d={selection.path} fill="white"/><g dangerouslySetInnerHTML={{__html:prepared.detail}}/></g><path d={selection.path} fill="none" stroke="#426d59" strokeWidth={detailUnits*1.5}/></svg>:<div className="diagram-zoom-region-empty">{wave?'点击左图的一侧区域，查看放大效果。':'画出波浪分界线后，即可选择要保留的部分。'}</div>}<p>只改变步骤展示范围，不修改折痕、纸层或三维状态。</p></section>
    </div>
    {combinedError&&<p className="diagram-zoom-region-error" role="alert">{combinedError}</p>}
  </AppDialog>;
}
