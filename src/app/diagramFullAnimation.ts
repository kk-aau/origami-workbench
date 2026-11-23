import {mapDiagramMaterialOrders,registerDiagramPositions,sampleDiagramMaterialPoint} from './diagramAnimationRegistration';
import {IDENTITY_MAT3,multiplyMat3,transposeMat3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {DiagramProject} from './diagramProject';
import {buildDiagramStepAnimation,type DiagramStepAnimationClip} from './diagramStepAnimation';
import {prepareSimulationDocument} from '../engine/simmodel';
import {planDiagramStepPlayback} from '../engine/simStepPlanning';
import {diagramSinkGuide} from './diagramSinkGuide';
import {createSinkPoseClock,type SinkPoseClock} from './diagramPlaybackProgress';
import {targetForDiagramSinkLeg} from './diagramSinkTarget';
import {planDiagramSinkLeg} from './diagramSinkPlayback';
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
  automaticSinkPhase?:0|1;
  opensSink?:boolean;
  sinkPoseClock?:SinkPoseClock;
  cameraFrame:{center:V;radius:number};
}
const sub=(a:ArrayLike<number>,b:ArrayLike<number>):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const point=(a:ArrayLike<number>,i:number):V=>[a[i*3],a[i*3+1],a[i*3+2]];

/** Only a proper rigid world transform is permitted. A changed folding branch,
 * residual deformation or edited CP must stop instead of morphing the paper. */
export function alignDiagramAnimationStart(prepared:PreparedOrigamiModel,clip:DiagramStepAnimationClip,previous:DiagramAnimationBoundary):DiagramStepAnimationClip{
  const cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]]),wanted=cp.map(p=>sampleDiagramMaterialPoint(previous,p).position);
  let camera=clip.camera;
  const positions=registerDiagramPositions(clip.animation.initialPositions,wanted,cp.map((_,i)=>i),'上一步终态与本步起态不一致，无法连续衔接；请检查前后折角、固定侧或重新计算折图。',rotation=>{
    if(camera)camera={...camera,orient:multiplyMat3(camera.orient??IDENTITY_MAT3,transposeMat3(rotation))};
  });
  const faceOrders=mapDiagramMaterialOrders(prepared,previous,previous.orders);
  return {...clip,camera,animation:{...clip.animation,initialPositions:positions},initialDisplayOrder:undefined,initialContactOrder:{sourceFaceCount:prepared.sourceFaceCount!,faceOrders}};
}

export function diagramAnimationEvaluator(entry:Pick<DiagramFullAnimationEntry,'clip'|'plan'>){
  const {prepared}=prepareSimulationDocument(entry.plan.fold??entry.clip.fold),animation=entry.plan.animation;
  const path=animation.dynamic?createSimulationStepDynamicEvaluator(prepared,animation,animation.dynamic):animation.flex?createSimulationStepFlexEvaluator(prepared,animation,animation.flex):createSimulationStepPathEvaluator(prepared,animation,animation.motion!);
  return {prepared,path};
}

export function diagramAnimationBoundary(entry:DiagramFullAnimationEntry):DiagramAnimationBoundary{
  const {prepared,path}=diagramAnimationEvaluator(entry),animation=entry.plan.animation;
  const positions=path.evaluate(1);
  return {cp:prepared.fold.vertices_coords.map(p=>[p[0],-p[2]]),indices:prepared.indices,sourceFaces:prepared.triangleSourceFaces!,positions,orders:animation.layerTimeline?.at(-1)?.faceOrders??[]};
}

/** Worker-owned immutable project; bounded heavy plans, compact boundary
 * snapshots for deterministic seeking without retaining every trajectory. */
export class DiagramFullAnimationSession {
  private start=-1;
  private cache=new Map<number,DiagramFullAnimationEntry>();
  private endpoints=new Map<number,DiagramAnimationBoundary>();
  constructor(private project:DiagramProject){}
  /** A standalone sink was already solved in its own starting world frame.
   * Retain its closing boundary so later steps use exactly that same frame. */
  startWithPreparedSink(start:number,opening:DiagramFullAnimationEntry,closing:DiagramFullAnimationEntry){
    this.start=start;this.cache.clear();this.endpoints.clear();
    this.remember({...opening,index:start});
    this.remember({...closing,index:start+1});
  }
  private remember(entry:DiagramFullAnimationEntry){
    this.endpoints.set(entry.index,diagramAnimationBoundary(entry));
    this.cache.set(entry.index,entry);
    while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value!);
  }
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
        const progress=(message:string)=>onProgress(i,message);
        const forward=()=>planDiagramStepPlayback(clip.fold,clip.animation,progress,clip);
        const guide=diagramSinkGuide(this.project,this.project.steps[i].id);
        let plan:SimulationStepPlanningResult;
        if(guide&&(i===guide.startIndex||i===guide.guideIndex)){
          const target=targetForDiagramSinkLeg(this.project,i,clip,i===guide.startIndex?guide.pose:undefined);
          if(i===guide.startIndex&&!target)throw Error('沉折中间图缺少已保存的空间姿态。');
          plan=planDiagramSinkLeg(prepared,clip,target,forward,progress);
        }else plan=forward();
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
        const sinkLeg=guide&&(i===guide.startIndex||i===guide.guideIndex);
        const entry={index:i,clip,plan,still,cameraFrame,...(sinkLeg?{opensSink:i===guide.startIndex,sinkPoseClock:createSinkPoseClock(plan.animation)}:{}),
          duration:still?1200:4000*Math.max(1,plan.animation.motion?.batches?.length??plan.animation.flex?.batches?.length??1)};
        this.remember(entry);
        if(i===index)return entry;
      }catch(error){throw Object.assign(new Error(error instanceof Error?error.message:'此步骤无法演示。'),{stepIndex:i});}
    }
    throw Error('未找到演示步骤。');
  }
}
