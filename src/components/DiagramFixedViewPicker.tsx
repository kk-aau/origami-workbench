import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {DiagramPose} from '../app/diagramProject';
import {arcballCamera,centeredOrbitCamera} from '../app/diagramArcball';
import {diagramOrbitMesh} from '../app/diagramOrbitMesh';
import {defaultModelColors} from '../app/modelColors';
import {preferenceStorage} from '../app/preferenceStorage';
import {cameraFromViewSphere,fixedPaperSphereFrame,inBasis,maxViewDivisions,transposeBasis,turnBasis,viewSphereBasis,viewSphereBasisFromCamera,viewSphereGrid,type Vector3,type ViewSpherePoint} from '../app/diagramViewSphere';
import type {DiagramFoldMatrix} from '../app/diagramFoldLinkTypes';
import {DiagramOrbitRenderer} from './diagramOrbitRenderer';
import './DiagramFixedViewPicker.css';

const settingsKey='diagram.fixed-view.divisions.v1';
function readDivisions():Vector3{
  try{const v=JSON.parse(preferenceStorage.getItem(settingsKey)??'null');
    if(Array.isArray(v)&&v.length===3&&v.every(n=>Number.isInteger(n)&&n>=1&&n<=maxViewDivisions))return v as Vector3;
  }catch{/* The selector also works without a preference store. */}
  return [2,2,2];
}
const axes=['X','Y','Z'];
const coordinate=(p:Vector3)=>p.map(v=>Number(v.toFixed(2))).join(', ');
const size=360,radius=155,middle=size/2;
function arcPath(u:Vector3,v:Vector3,rear:boolean){
  const start=Math.atan2(v[2],u[2])-Math.PI/2+(rear?Math.PI:0);
  return Array.from({length:49},(_,i)=>{
    const t=start+i*Math.PI/48,c=Math.cos(t),s=Math.sin(t);
    return (i?'L':'M')+(middle+radius*(u[0]*c+v[0]*s)).toFixed(2)+' '+(middle+radius*(u[1]*c+v[1]*s)).toFixed(2);
  }).join('');
}
type Camera=NonNullable<DiagramPose['spatial']>['camera'];
type CommonProps={title?:string;initialCamera?:Camera;drawingRotation:number;disabled?:boolean;onClose:()=>void;onApply:(camera:Camera)=>Promise<boolean>};
type Props=CommonProps&{pose:DiagramPose;face:number;fixedMatrix?:DiagramFoldMatrix;viewSide?:'front'|'back'};
export default function DiagramFixedViewPicker({pose,face,fixedMatrix,drawingRotation,viewSide,...dialogProps}:Props){
  const spatial=pose.spatial!,back=pose.view?.side==='back';
  const reference=useMemo(()=>fixedPaperSphereFrame(spatial.camera,spatial.faceTransforms[face].rotation,fixedMatrix,back,drawingRotation),[spatial,face,fixedMatrix,back,drawingRotation]);
  const camera=useMemo(()=>centeredOrbitCamera(dialogProps.initialCamera??spatial.camera,spatial.vertices),[dialogProps.initialCamera,spatial]);
  return <DiagramViewSphereDialog {...dialogProps} referenceLabel={'基准纸面 F'+(face+1)} camera={camera} reference={reference} back={viewSide?viewSide==='back':back} drawingRotation={drawingRotation}
    renderModel={basis=><RigidSphereModel pose={pose} basis={basis}/>}/>;
}

function RigidSphereModel({pose,basis}:{pose:DiagramPose;basis:number[]}){
  const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<DiagramOrbitRenderer|null>(null);
  const [wire,setWire]=useState(false);
  const mesh=useMemo(()=>diagramOrbitMesh(pose),[pose]);
  useEffect(()=>{
    let r:DiagramOrbitRenderer|undefined;
    try{r=new DiagramOrbitRenderer(canvas.current!);r.setMesh(mesh);renderer.current=r;setWire(false);}
    catch{setWire(true);}
    return()=>{r?.dispose();renderer.current=null;};
  },[mesh]);
  useEffect(()=>{renderer.current?.draw(new Float32Array(transposeBasis(basis)),pose.view?.colors??defaultModelColors(),210,210);},[basis,mesh,pose.view?.colors]);
  return <><canvas ref={canvas} hidden={wire} aria-label="球心的折纸作品"/>
    {wire&&<svg viewBox="0 0 360 360" aria-label="球心的折纸作品"><path className="fixed-view-wire" d={Array.from({length:mesh.lines.length/6},(_,i)=>[0,3].map((k,j)=>{
      const p=inBasis(basis,Array.from(mesh.lines.slice(6*i+k,6*i+k+3)) as Vector3);
      return (j?'L':'M')+(middle+p[0]*84)+' '+(middle+p[1]*84);
    }).join('')).join('')}/></svg>}</>;
}

type SphereProps=CommonProps&{camera:Camera;reference:number[];back:boolean;referenceLabel:string;renderModel:(modelBasis:number[],camera:Camera)=>ReactNode};
export function DiagramViewSphereDialog({title='固定视角',referenceLabel,initialCamera,camera,reference,back,drawingRotation,disabled=false,onApply,onClose,renderModel}:SphereProps){
  const dialog=useRef<HTMLDialogElement>(null);
  const drag=useRef<{id:number;x:number;y:number;basis:number[]}|null>(null);
  const [divisions,setDivisions]=useState(readDivisions),[selected,setSelected]=useState<ViewSpherePoint|null>(null);
  const [issue,setIssue]=useState(''),[applying,setApplying]=useState(false);
  const [initialBasis]=useState(()=>initialCamera?viewSphereBasisFromCamera(initialCamera,reference,back,drawingRotation):viewSphereBasis([1,2,.65]));
  const [basis,setBasis]=useState(initialBasis);
  const grid=useMemo(()=>viewSphereGrid(divisions),[divisions]);
  const modelBasis=useMemo(()=>turnBasis(basis,transposeBasis(reference)),[basis,reference]);
  const previewCamera=useMemo(()=>basis===initialBasis&&initialCamera?initialCamera:cameraFromViewSphere(camera,basis,reference,back,drawingRotation),[basis,initialBasis,initialCamera,camera,reference,back,drawingRotation]);
  useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
  const locked=disabled||applying;
  const pick=(point:ViewSpherePoint)=>{if(!locked){setBasis(viewSphereBasis(point.direction));setSelected(point);setIssue('');}};
  const updateCount=(axis:number,count:number)=>{
    const next=[...divisions] as Vector3;next[axis]=count;setDivisions(next);setSelected(null);setIssue('');
    try{preferenceStorage.setItem(settingsKey,JSON.stringify(next));}catch{/* Use in-session settings. */}
  };
  const apply=async()=>{
    if(locked)return;
    setApplying(true);
    try{
      if(await onApply(previewCamera))onClose();
      else setIssue('此方向的纸面遮挡未能确认，请另选视角。');
    }catch(error){setIssue(error instanceof Error?error.message:'视角应用失败，请重试。');}
    finally{setApplying(false);}
  };
  const circles=grid.circles.map(({u,v})=>({u:inBasis(basis,u),v:inBasis(basis,v)}));
  const visible=grid.points.map(point=>({point,p:inBasis(basis,point.direction)})).filter(({p})=>p[2]>=-1e-8).sort((a,b)=>a.p[2]-b.p[2]);
  return <dialog ref={dialog} className="diagram-fixed-view" aria-label={title} onCancel={e=>{e.preventDefault();if(!locked)onClose();}} onKeyDown={e=>e.stopPropagation()}>
    <header><h2>{title}</h2><span>{referenceLabel}</span><button type="button" aria-label={'关闭'+title} disabled={locked} onClick={onClose}>×</button></header>
    <div className="fixed-view-stage">
      {renderModel(modelBasis,previewCamera)}
      <svg viewBox="0 0 360 360" aria-label="选择球面观察方向" onPointerDown={e=>{
        if(locked||e.button!==0)return;
        drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,basis};
        // Leave point clicks on their own element for keyboard and pointer activation.
        if(!(e.target as Element).closest('[role="button"]'))e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerMove={e=>{
        const d=drag.current;if(!d||d.id!==e.pointerId||!(e.buttons&1)||Math.hypot(e.clientX-d.x,e.clientY-d.y)<4)return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect=e.currentTarget.getBoundingClientRect();
        const next=arcballCamera({yaw:0,elevation:0,rotation:d.basis},[d.x-rect.left,d.y-rect.top],[e.clientX-rect.left,e.clientY-rect.top],rect);
        setBasis(next.rotation!);setSelected(null);setIssue('');
      }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
        <circle cx={middle} cy={middle} r={radius} className="fixed-view-rim"/>
        {[true,false].map(rear=><g key={String(rear)} className={rear?'fixed-view-rear':'fixed-view-front'}>{circles.map(({u,v},i)=><path key={i} d={arcPath(u,v,rear)}/>)}</g>)}
        {visible.map(({point,p})=>{
          const axis=point.direction.findIndex(v=>Math.abs(v)>1-1e-10);
          const axisName=axis<0?'':(point.direction[axis]>0?'+':'−')+axes[axis];
          const label=point.kind+' '+axisName+' ('+coordinate(point.direction)+')';
          return <g key={point.kind+point.direction.join()} transform={`translate(${middle+radius*p[0]} ${middle+radius*p[1]})`} className="fixed-view-point" data-kind={point.kind} role="button" aria-label={label} aria-pressed={point===selected} tabIndex={locked?-1:0}
            onClick={()=>pick(point)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(point);}}}>
            <title>{label}</title><circle r="7" fill="transparent"/><circle className="fixed-view-dot" r={point.kind==='端点'?4.2:3.3}/>{axisName&&<text x={p[0]>.8?-8:8} y="-6" textAnchor={p[0]>.8?'end':'start'}>{axisName}</text>}
          </g>;
        })}
      </svg>
    </div>
    <div className="fixed-view-settings"><span title="每个切面绕轴旋转半圈后重合，角间隔为 180° 除以等分数">绕轴等分</span>{axes.map((axis,i)=><label key={axis}>{axis}<select disabled={locked} aria-label={axis+' 轴角度等分数'} value={divisions[i]} onChange={e=>updateCount(i,Number(e.target.value))}>{Array.from({length:maxViewDivisions},(_,j)=><option key={j+1}>{j+1}</option>)}</select></label>)}
      <button disabled={locked} onClick={()=>{setBasis(turnBasis([-1,0,0,0,1,0,0,0,-1],basis));setSelected(null);setIssue('');}}>看另一侧</button></div>
    <footer><span role="status">{issue||(applying?'正在确认视角…':selected?selected.kind+' · '+coordinate(selected.direction):'拖动球体或点击方向点，应用当前预览')}</span><button type="button" className="diagram-primary" disabled={locked} onClick={()=>void apply()}>应用视角</button></footer>
  </dialog>;
}
