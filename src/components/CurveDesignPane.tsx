import {useEffect,useId,useMemo,useRef,useState,type PointerEvent,type MouseEvent} from 'react';
import {curveBandBoundary,curveDesignGeometry,curveDesignSampleMesh,
  type CurveDesign,type CurvePoint2,type CurvePoint3} from '../app/curveDesign';
import type {ModelViewState} from '../app/modelViewState';
import {defaultModelColors} from '../app/modelColors';
import './CurveDesignPane.css';

type Camera={pan:CurvePoint2;zoom:number;yaw:number;elevation:number};
type Frame={center:number[];span:number};
type Drag={id:number;panel:0|1;mode:'pan'|'orbit';point:CurvePoint2;camera:Camera;matrix:DOMMatrix;distance:number};
const freshCamera=():Camera=>({pan:[0,0],zoom:1,yaw:-35,elevation:28});
const fmt=(v:number)=>Number(v.toPrecision(6)).toString();
const line=(points:CurvePoint2[])=>points.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ');
const frameOf=(points:number[][]):Frame=>{
  const lo=points[0].map((_,i)=>Math.min(...points.map(p=>p[i]))),hi=points[0].map((_,i)=>Math.max(...points.map(p=>p[i])));
  return {center:lo.map((v,i)=>v+(hi[i]-v)/2),span:Math.max(...lo.map((v,i)=>hi[i]-v))||1};
};
const tickValues=(low:number,high:number,target:number)=>{
  const power=10**Math.floor(Math.log10(target)),r=target/power,step=(r<=1?1:r<=2?2:r<=5?5:10)*power;
  if(!Number.isFinite(step)||step<=0)return [];
  const first=Math.ceil(low/step),last=Math.floor(high/step);
  return Array.from({length:Math.max(0,Math.min(24,last-first+1))},(_,i)=>(first+i)*step);
};
/** Place ruler labels at the actual clipped grid-line intersections after rotation. */
function rulerLabel(a:CurvePoint2,b:CurvePoint2,axis:'x'|'y'){
  const candidates:CurvePoint2[]=[],dx=b[0]-a[0],dy=b[1]-a[1];
  if(dx)for(const x of [25,775]){const t=(x-a[0])/dx,y=a[1]+t*dy;if(t>=0&&t<=1&&y>=25&&y<=575)candidates.push([x,y]);}
  if(dy)for(const y of [25,575]){const t=(y-a[1])/dy,x=a[0]+t*dx;if(t>=0&&t<=1&&x>=25&&x<=775)candidates.push([x,y]);}
  if(!candidates.length)return null;
  candidates.sort((p,q)=>axis==='x'?q[1]-p[1]:p[0]-q[0]);const p=candidates[0];
  return {x:Math.max(28,Math.min(765,p[0])),y:p[1]===575?592:p[1]===25?18:p[1]-4,
    textAnchor:(p[0]===25?'start':p[0]===775?'end':'middle') as 'start'|'end'|'middle'};
}

/** One existing-workspace pane: continuous designs are always shown as sampled wire surfaces. */
export default function CurveDesignPane({design,view,fitToken=0,onEdit}:{
  design:CurveDesign;view?:ModelViewState;fitToken?:number;onEdit?:()=>void;
}){
  const geometry=useMemo(()=>curveDesignGeometry(design),[design]),mesh=useMemo(()=>curveDesignSampleMesh(geometry),[geometry]),
    all2=useMemo(()=>[...geometry.left2D.flat(),...geometry.right2D.flat(),...geometry.crease2D],[geometry]),
    currentFrame2=useMemo(()=>frameOf(all2),[all2]),currentFrame3=useMemo(()=>frameOf(mesh.vertices),[mesh]);
  const [frames,setFrames]=useState<[Frame,Frame]>(()=>[currentFrame2,currentFrame3]),
    [cameras,setCameras]=useState<[Camera,Camera]>(()=>[freshCamera(),freshCamera()]),
    [mode,setMode]=useState<'both'|'planar'|'spatial'>('both'),[triangles,setTriangles]=useState(false),[selected,setSelected]=useState(0),[rulerFont,setRulerFont]=useState(22);
  const svg2=useRef<SVGSVGElement>(null),svg3=useRef<SVGSVGElement>(null),drag=useRef<Drag|null>(null),moved=useRef(false),clipId=useId();
  const colors=view?.colors??defaultModelColors(),side=view?.side==='back'?-1:1,rotation=(view?.rotation??0)*Math.PI/180,
    selectedIndex=Math.min(selected,geometry.crease2D.length-1),s=design.result.sample.rows[selectedIndex].s;
  const reset=()=>{setFrames([currentFrame2,currentFrame3]);setCameras([freshCamera(),freshCamera()]);};
  // Parameter/colour/side changes preserve placement. Only an explicit fit resets it.
  useEffect(reset,[fitToken]);
  const updateCamera=(panel:0|1,change:(camera:Camera)=>Camera)=>setCameras(old=>{
    const next:[Camera,Camera]=[old[0],old[1]];next[panel]=change(old[panel]);return next;
  });
  useEffect(()=>{
    const cleanups=[svg2.current,svg3.current].flatMap((svg,index)=>{
      if(!svg)return [];
      const wheel=(event:WheelEvent)=>{
        event.preventDefault();const matrix=svg.getScreenCTM()?.inverse();if(!matrix)return;
        const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);
        updateCamera(index as 0|1,camera=>{
          const zoom=Math.max(.05,Math.min(40,camera.zoom*Math.exp(-event.deltaY*.0015))),factor=zoom/camera.zoom;
          return {...camera,zoom,pan:[p.x-400-(p.x-400-camera.pan[0])*factor,p.y-300-(p.y-300-camera.pan[1])*factor]};
        });
      };
      svg.addEventListener('wheel',wheel,{passive:false});return [()=>svg.removeEventListener('wheel',wheel)];
    });return ()=>cleanups.forEach(cleanup=>cleanup());
  },[]);
  useEffect(()=>{
    const svg=svg2.current;if(!svg)return;
    const resize=()=>{const box=svg.getBoundingClientRect(),scale=Math.min(box.width/800,box.height/600);
      if(scale>0)setRulerFont(11/scale);};
    const observer=new ResizeObserver(resize);observer.observe(svg);resize();return ()=>observer.disconnect();
  },[]);
  const planar=(point:number[]):CurvePoint2=>{
    const camera=cameras[0],scale=470/frames[0].span*camera.zoom,x=(point[0]-frames[0].center[0])*side,y=point[1]-frames[0].center[1],
      a=Math.cos(rotation)*x-Math.sin(rotation)*y,b=Math.sin(rotation)*x+Math.cos(rotation)*y;
    return [400+camera.pan[0]+scale*a,300+camera.pan[1]-scale*b];
  };
  const inversePlanar=(x:number,y:number):CurvePoint2=>{
    const camera=cameras[0],scale=470/frames[0].span*camera.zoom,a=(x-400-camera.pan[0])/scale,b=-(y-300-camera.pan[1])/scale;
    return [frames[0].center[0]+side*(Math.cos(rotation)*a+Math.sin(rotation)*b),frames[0].center[1]-Math.sin(rotation)*a+Math.cos(rotation)*b];
  };
  const spatial=(point:CurvePoint3):CurvePoint2=>{
    const camera=cameras[1],scale=420/frames[1].span*camera.zoom,az=camera.yaw*Math.PI/180,el=camera.elevation*Math.PI/180,
      x=(point[0]-frames[1].center[0])*side,y=point[1]-frames[1].center[1],z=(point[2]-frames[1].center[2])*side,
      px=Math.cos(az)*x-Math.sin(az)*y,depth=Math.sin(az)*x+Math.cos(az)*y,py=Math.cos(el)*z-Math.sin(el)*depth,
      a=Math.cos(rotation)*px-Math.sin(rotation)*py,b=Math.sin(rotation)*px+Math.cos(rotation)*py;
    return [400+camera.pan[0]+scale*a,300+camera.pan[1]-scale*b];
  };
  const corners=[[25,25],[775,25],[25,575],[775,575]].map(([x,y])=>inversePlanar(x,y)),
    x0=Math.min(...corners.map(p=>p[0])),x1=Math.max(...corners.map(p=>p[0])),y0=Math.min(...corners.map(p=>p[1])),y1=Math.max(...corners.map(p=>p[1])),
    tickStep=frames[0].span/cameras[0].zoom/5,xTicks=tickValues(x0,x1,tickStep),yTicks=tickValues(y0,y1,tickStep),
    crease2=geometry.crease2D.map(planar),crease3=geometry.crease3D.map(spatial),projectedMesh=triangles?mesh.vertices.map(spatial):[],
    meshPaths={front:'',back:''};
  if(triangles)for(const face of mesh.faces){
    const points=face.vertices.map(i=>projectedMesh[i]),[a,b,c]=points,
      front=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0;
    meshPaths[front?'front':'back']+=line([...points,points[0]]);
  }
  const start=(panel:0|1,event:PointerEvent<SVGSVGElement>)=>{
    if(event.button!==0&&event.button!==1)return;
    const matrix=event.currentTarget.getScreenCTM()?.inverse();if(!matrix)return;
    event.preventDefault();moved.current=false;drag.current={id:event.pointerId,panel,
      mode:panel===0||event.shiftKey||event.button===1?'pan':'orbit',point:[event.clientX,event.clientY],camera:cameras[panel],matrix,distance:0};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=(event:PointerEvent<SVGSVGElement>)=>{
    const current=drag.current;if(!current||current.id!==event.pointerId)return;
    const dx=event.clientX-current.point[0],dy=event.clientY-current.point[1];current.distance=Math.hypot(dx,dy);moved.current=current.distance>3;
    updateCamera(current.panel,()=>current.mode==='orbit'?{...current.camera,yaw:current.camera.yaw+dx*.4,elevation:Math.max(-89,Math.min(89,current.camera.elevation+dy*.35))}:
      {...current.camera,pan:[current.camera.pan[0]+current.matrix.a*dx+current.matrix.c*dy,current.camera.pan[1]+current.matrix.b*dx+current.matrix.d*dy]});
  };
  const finish=(event:PointerEvent<SVGSVGElement>)=>{if(drag.current?.id===event.pointerId){drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}};
  const pick=(panel:0|1,event:MouseEvent<SVGSVGElement>)=>{
    if(moved.current)return;const matrix=event.currentTarget.getScreenCTM()?.inverse();if(!matrix)return;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix),points=panel===0?crease2:crease3;
    let best=-1,distance=22;points.forEach((point,i)=>{const d=Math.hypot(point[0]-p.x,point[1]-p.y);if(d<distance){distance=d;best=i;}});
    if(best>=0)setSelected(best);
  };
  const drawing=(panel:0|1)=>{
    const project=panel===0?planar:(point:number[])=>spatial(point as CurvePoint3),grids=panel===0?[geometry.left2D,geometry.right2D]:[geometry.left3D,geometry.right3D],
      crease=panel===0?crease2:crease3,marker=crease[selectedIndex];
    return <>
      {panel===1&&triangles&&<g className="cdp-triangles" fill="none"><path d={meshPaths.front} stroke={colors.front}/><path d={meshPaths.back} stroke={colors.back}/></g>}
      {grids.map((grid,which)=><g key={which}>
        <path className="cdp-boundary" d={line(curveBandBoundary(grid as number[][][]).map(project))+' Z'}/>
        <path className="cdp-rulings" d={grid.map(row=>line([project(row[0]),project(row[row.length-1])])).join(' ')}/>
        <path className="cdp-active-ruling" d={line([project(grid[selectedIndex][0]),project(grid[selectedIndex][grid[selectedIndex].length-1])])}/>
      </g>)}
      <path className="cdp-curve" d={line(crease)}/>
      {crease.map((point,i)=><circle key={i} className="cdp-sample" cx={point[0]} cy={point[1]} r={i===selectedIndex?5:2.2}/>) }
      <circle className="cdp-marker" cx={marker[0]} cy={marker[1]} r="7"/>
    </>;
  };
  return <section className="curve-design-pane" aria-label="曲面设计画布" data-curve-design={design.query.family} data-curve-display={mode}>
    <header className="cdp-toolbar"><div className="cdp-name"><small>曲面设计 · mm</small><strong title={design.name}>{design.name}</strong></div>
      <div className="cdp-view-switch" role="group" aria-label="曲面显示布局">{([['both','同屏'],['planar','二维'],['spatial','三维']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)}>{label}</button>)}</div>
      <button type="button" onClick={reset}>适合画布</button>{onEdit&&<button type="button" className="cdp-edit" onClick={onEdit}>编辑参数</button>}
    </header>
    <div className={`cdp-stage ${mode}`}>
      <section className="cdp-panel" hidden={mode==='spatial'} aria-label="二维展开图">
        <header><strong>二维展开</strong><span>坐标刻度 / mm</span></header>
        <svg ref={svg2} viewBox="0 0 800 600" role="img" aria-label="毫米刻度二维展开，点击青色曲线选点" onPointerDown={e=>start(0,e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={()=>{drag.current=null;}} onClick={e=>pick(0,e)} onContextMenu={e=>e.preventDefault()}>
          <defs><clipPath id={`${clipId}-2d`}><rect x="25" y="25" width="750" height="550"/></clipPath></defs>
          <g clipPath={`url(#${clipId}-2d)`}><g className="cdp-grid">{xTicks.map(x=><path key={`x${x}`} d={line([planar([x,y0]),planar([x,y1])])}/>)}{yTicks.map(y=><path key={`y${y}`} d={line([planar([x0,y]),planar([x1,y])])}/>)}</g>{drawing(0)}</g>
          <g className="cdp-ticks">{xTicks.map(x=>{const label=rulerLabel(planar([x,y0]),planar([x,y1]),'x');return label&&<text key={`x${x}`} {...label} y={label.y>575?600-rulerFont*.25:label.y<25?rulerFont+2:label.y} style={{fontSize:rulerFont}}>{rotation?'X ':''}{fmt(x)}</text>;})}{yTicks.map(y=>{const label=rulerLabel(planar([x0,y]),planar([x1,y]),'y');return label&&<text key={`y${y}`} {...label} y={label.y>575?600-rulerFont*.25:label.y<25?rulerFont+2:label.y} style={{fontSize:rulerFont}}>{rotation?'Y ':''}{fmt(y)}</text>;})}</g>
          <text x="790" y={600-rulerFont*.25} textAnchor="end" className="cdp-axis-name" style={{fontSize:rulerFont}}>X</text><text x="7" y={rulerFont+4} className="cdp-axis-name" style={{fontSize:rulerFont}}>Y</text>
        </svg>
        <footer>宽 {fmt(Math.max(...all2.map(p=>p[0]))-Math.min(...all2.map(p=>p[0])))} × 高 {fmt(Math.max(...all2.map(p=>p[1]))-Math.min(...all2.map(p=>p[1])))} mm</footer>
      </section>
      <section className="cdp-panel" hidden={mode==='planar'} aria-label="三维曲面网格">
        <header><strong>三维曲面</strong><label><input type="checkbox" checked={triangles} onChange={e=>setTriangles(e.target.checked)}/>三角网面</label></header>
        <svg ref={svg3} viewBox="0 0 800 600" role="img" aria-label="三维曲面采样线框，拖动旋转" data-surface-render="wireframe" onPointerDown={e=>start(1,e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={()=>{drag.current=null;}} onClick={e=>pick(1,e)} onContextMenu={e=>e.preventDefault()}>{drawing(1)}</svg>
        <footer><span>{view?.side==='back'?'背面视角':'正面视角'}</span><span className="cdp-colors"><i style={{background:colors.front}}/>正<i style={{background:colors.back}}/>反</span><span>线框显示全部网面</span></footer>
      </section>
    </div>
    <div className="cdp-readout"><label>曲线点<input aria-label="曲面曲线点编号" type="number" min="1" max={geometry.crease2D.length} value={selectedIndex+1} onChange={e=>{const value=Number(e.target.value);if(Number.isInteger(value)&&value>=1&&value<=geometry.crease2D.length)setSelected(value-1);}}/><span>/ {geometry.crease2D.length}</span></label>
      <output title={`s=${s}；二维：${geometry.crease2D[selectedIndex].join(', ')}；三维：${geometry.crease3D[selectedIndex].join(', ')}`}>s {fmt(s)} <span>二维 ({geometry.crease2D[selectedIndex].map(fmt).join(', ')})</span><span>三维 ({geometry.crease3D[selectedIndex].map(fmt).join(', ')}) mm</span></output>
    </div>
    <div className="cdp-caption"><span className="cdp-legend"><i className="curve"/>曲线<i className="ruling"/>母线<i className="boundary"/>边界</span><span title="三维左键旋转；Shift 或中键平移；滚轮缩放。曲面为数值采样，未验证全局重叠或自碰撞。">拖动 · Shift 平移 · 滚轮缩放；网面不代表实体遮挡</span></div>
  </section>;
}
