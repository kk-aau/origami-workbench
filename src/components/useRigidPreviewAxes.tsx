import {useMemo,useState} from 'react';
import DiagramRotationGizmo from './DiagramRotationGizmo';
import type {RigidQuadScene} from '../app/rigidQuadView';
const identity=[1,0,0,0,1,0,0,0,1];
const mul=(a:number[],b:number[])=>Array.from({length:9},(_,k)=>{const i=Math.floor(k/3),j=k%3;return a[3*i]*b[j]+a[3*i+1]*b[j+3]+a[3*i+2]*b[j+6];});
export function useRigidPreviewAxes(azimuth:number,elevation:number,back=false,rotation=0){
 const [extra,setExtra]=useState(identity),[shown,setShown]=useState(true);
 const y=azimuth*Math.PI/180,e=(back?180-elevation:elevation)*Math.PI/180,s=rotation*Math.PI/180,cy=Math.cos(y),sy=Math.sin(y),ce=Math.cos(e),se=Math.sin(e),c=Math.cos(s),sn=Math.sin(s);
 const base=mul([c,-sn,0,sn,c,0,0,0,1],[cy,-sy,0,-ce*sy,-ce*cy,se,-se*sy,-se*cy,-ce]),inverse=[base[0],base[3],base[6],base[1],base[4],base[7],base[2],base[5],base[8]];
 const camera={yaw:0,elevation:0,rotation:mul(base,extra)};
 const rotateScene=useMemo(()=> (scene:RigidQuadScene):RigidQuadScene=>{
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of scene.vertices)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}const center=lo.map((n,i)=>(n+hi[i])/2);
  return {...scene,vertices:scene.vertices.map(p=>[0,1,2].map(i=>center[i]+extra[3*i]*(p[0]-center[0])+extra[3*i+1]*(p[1]-center[1])+extra[3*i+2]*(p[2]-center[2])) as [number,number,number])};
 },[extra]);
 const controls=<div ref={node=>{if(node?.parentElement)node.parentElement.style.position='relative';}} style={{position:'absolute',left:8,bottom:38,zIndex:5}}><button type="button" aria-pressed={shown} onClick={()=>setShown(v=>!v)}>三轴旋转环</button>{shown&&<DiagramRotationGizmo camera={camera} onChange={next=>setExtra(mul(inverse,next.rotation!))} onEnd={next=>setExtra(mul(inverse,next.rotation!))}/>}</div>;
 return {rotateScene,controls};
}
