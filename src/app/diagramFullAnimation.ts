import type {DiagramProject} from './diagramProject';
import {buildDiagramStepAnimation,type DiagramStepAnimationClip} from './diagramStepAnimation';
import {prepareSimulationDocument} from '../engine/simmodel';
import {planDiagramStepPlayback} from '../engine/simStepPlanning';
import type {SimulationStepPlanningResult} from '../engine/simStepPlanningClient';
import {createSimulationStepPathEvaluator} from '../engine/simStepPath';
import {createSimulationStepDynamicEvaluator} from '../engine/simStepDynamic';
import {createSimulationStepFlexEvaluator} from '../engine/simStepFlex';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

type V=[number,number,number];
type Row=[number,number,number];
export interface DiagramAnimationBoundary {
  cp:number[][];indices:Uint32Array;sourceFaces:number[];positions:Float32Array;orders:Row[];
}
export interface DiagramFullAnimationEntry {
  index:number;clip:DiagramStepAnimationClip;plan:SimulationStepPlanningResult;duration:number;still:boolean;
  cameraFrame:{center:V;radius:number};
}
const sub=(a:ArrayLike<number>,b:ArrayLike<number>):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:V)=>a.map(n=>n/Math.hypot(...a)) as V;
const point=(a:ArrayLike<number>,i:number):V=>[a[i*3],a[i*3+1],a[i*3+2]];

/** Locate by material coordinates, not vertex IDs or projected screen points.
 * New creases may subdivide a face; barycentric material correspondence still
 * identifies the same point on the preceding physical paper. */
function locate(boundary:DiagramAnimationBoundary,p:number[]){
  for(let t=0;t<boundary.indices.length/3;t++){
    const ids=Array.from(boundary.indices.slice(t*3,t*3+3)),[a,b,c]=ids.map(v=>boundary.cp[v]);
    const d=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(d)<1e-16)continue;
    const v=((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/d;
    const w=((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/d,u=1-v-w;
    if(Math.min(u,v,w)<-1e-7)continue;
    return {position:[0,1,2].map(k=>u*boundary.positions[ids[0]*3+k]+v*boundary.positions[ids[1]*3+k]+w*boundary.positions[ids[2]*3+k]) as V,face:boundary.sourceFaces[t],winding:Math.sign(d)};
  }
  throw Error('前后步骤的材料范围不一致，无法连续衔接。');
}

/** Only a proper rigid world transform is permitted. A changed folding branch,
 * residual deformation or edited CP must stop instead of morphing the paper. */
export function alignDiagramAnimationStart(prepared:PreparedOrigamiModel,clip:DiagramStepAnimationClip,previous:DiagramAnimationBoundary):DiagramStepAnimationClip{
  const cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]]),wanted=cp.map(p=>locate(previous,p).position);
  const initial=clip.animation.initialPositions,a=point(initial,0);
  let b=0,c=0;for(let i=1;i<wanted.length;i++)if(Math.hypot(...sub(point(initial,i),a))>Math.hypot(...sub(point(initial,b),a)))b=i;
  const ab=sub(point(initial,b),a);
  for(let i=1;i<wanted.length;i++)if(Math.hypot(...cross(ab,sub(point(initial,i),a)))>Math.hypot(...cross(ab,sub(point(initial,c),a))))c=i;
  const basis=(p:V,q:V,r:V)=>{const x=unit(sub(q,p)),z=unit(cross(x,sub(r,p))),y=cross(z,x);return [x,y,z];};
  const from=basis(a,point(initial,b),point(initial,c)),to=basis(wanted[0],wanted[b],wanted[c]);
  const positions=wanted.flatMap((_,i)=>{
    const delta=sub(point(initial,i),a),local=from.map(axis=>dot(axis,delta));
    return [0,1,2].map(k=>wanted[0][k]+to.reduce((sum,axis,j)=>sum+axis[k]*local[j],0));
  });
  if(positions.some(n=>!Number.isFinite(n))||wanted.some((p,i)=>Math.hypot(...sub(p,point(positions,i)))>2e-5))throw Error('上一步终态与本步起态不一致，无法连续衔接；请检查前后折角、固定侧或重新计算折图。');
  const children=new Map<number,Map<number,number>>();
  for(let t=0;t<prepared.indices.length/3;t++){
    const vertices=Array.from(prepared.indices.slice(t*3,t*3+3)).map(v=>cp[v]);
    const center=[0,1].map(k=>vertices.reduce((s,p)=>s+p[k],0)/3),parent=locate(previous,center),[p,q,r]=vertices;
    const winding=Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
    const child=prepared.triangleSourceFaces![t],values=children.get(parent.face)??new Map<number,number>();values.set(child,winding*parent.winding);children.set(parent.face,values);
  }
  const rows=new Map<string,Row>();
  for(const [a,b,sign] of previous.orders)for(const [x] of children.get(a)??[])for(const [y,orientation] of children.get(b)??[]){
    if(x===y)continue;
    const row:Row=[x,y,sign*orientation],key=`${x}:${y}`,old=rows.get(key);
    if(old&&old[2]!==row[2])throw Error('前后步骤的纸层关系不一致，无法连续衔接。');
    rows.set(key,row);
  }
  return {...clip,animation:{...clip.animation,initialPositions:positions},initialContactOrder:{sourceFaceCount:prepared.sourceFaceCount!,faceOrders:[...rows.values()]}};
}

export function diagramAnimationBoundary(entry:DiagramFullAnimationEntry):DiagramAnimationBoundary{
  const {prepared}=prepareSimulationDocument(entry.plan.fold??entry.clip.fold),animation=entry.plan.animation;
  const positions=animation.dynamic?createSimulationStepDynamicEvaluator(prepared,animation,animation.dynamic).evaluate(1):animation.flex?createSimulationStepFlexEvaluator(prepared,animation,animation.flex).evaluate(1):createSimulationStepPathEvaluator(prepared,animation,animation.motion!).evaluate(1);
  return {cp:prepared.fold.vertices_coords.map(p=>[p[0],-p[2]]),indices:prepared.indices,sourceFaces:prepared.triangleSourceFaces!,positions,orders:animation.layerTimeline?.at(-1)?.faceOrders??[]};
}

/** Worker-owned immutable project; bounded heavy plans, compact boundary
 * snapshots for deterministic seeking without retaining every trajectory. */
export class DiagramFullAnimationSession {
  private start=-1;
  private cache=new Map<number,DiagramFullAnimationEntry>();
  private endpoints=new Map<number,DiagramAnimationBoundary>();
  constructor(private project:DiagramProject){}
  prepare(index:number,start:number,onProgress:(index:number,message:string)=>void=()=>{}):DiagramFullAnimationEntry{
    if(!Number.isInteger(index)||!Number.isInteger(start)||start<0||index<start||index>=this.project.steps.length)throw Error('演示步骤范围无效。');
    if(start!==this.start){this.start=start;this.cache.clear();this.endpoints.clear();}
    for(let i=start;i<=index;i++){
      if(i<index&&this.endpoints.has(i))continue;
      const cached=this.cache.get(i);if(cached){if(i===index)return cached;continue;}
      try{
        onProgress(i,'正在准备步骤与材料衔接…');
        let clip=buildDiagramStepAnimation(this.project,this.project.steps[i].id,{allowStill:true});
        const {prepared}=prepareSimulationDocument(clip.fold),previous=this.endpoints.get(i-1);
        if(previous)clip=alignDiagramAnimationStart(prepared,clip,previous);
        const plan=planDiagramStepPlayback(clip.fold,{...clip.animation,collisionPolicy:'allow',motionPolicy:'allow-dynamic'},message=>onProgress(i,message),{initialGeometry:clip.initialGeometry,initialContactOrder:clip.initialContactOrder});
        const still=clip.animation.ranges.every(r=>r.fromAngle===r.toAngle&&(r.viaAngle===undefined||r.viaAngle===r.fromAngle));
        const center:V=[0,0,0];for(let v=0;v<prepared.vertexCount;v++)for(let axis=0;axis<3;axis++)center[axis]+=plan.animation.initialPositions[v*3+axis]/prepared.vertexCount;
        const extent=[0,1,2].map(axis=>{const values=prepared.fold.vertices_coords.map(p=>p[axis]);return Math.max(...values)-Math.min(...values);});
        // FOLD uses source units (e.g. millimetres), playback uses normalized
        // solver units. Recover their ratio from an actual material edge.
        let longest=0,scale=1;
        for(const [a,b] of prepared.edgesVertices){
          const length=Math.hypot(...sub(prepared.fold.vertices_coords[a],prepared.fold.vertices_coords[b]));
          if(length>longest){longest=length;scale=Math.hypot(...sub(point(plan.animation.initialPositions,a),point(plan.animation.initialPositions,b)))/length;}
        }
        const cameraFrame={center,radius:Math.max(.01,Math.hypot(...extent)*scale*.8)};
        const entry={index:i,clip,plan,still,cameraFrame,duration:still?1200:4000*Math.max(1,plan.animation.motion?.batches?.length??plan.animation.flex?.batches?.length??1)};
        this.endpoints.set(i,diagramAnimationBoundary(entry));this.cache.set(i,entry);
        while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value!);
        if(i===index)return entry;
      }catch(error){throw Object.assign(new Error(error instanceof Error?error.message:'此步骤无法演示。'),{stepIndex:i});}
    }
    throw Error('未找到演示步骤。');
  }
}
