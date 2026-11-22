import type {DiagramProject, DiagramStep, DiagramCPState} from './diagramProject';
import type {DiagramStepAnimationClip} from './diagramStepAnimation';
import type {SimulationStepPlanningResult} from '../engine/simStepPlanningClient';

// Count plain worker data without serializing another copy on the UI thread.
const CACHE_BUDGET=32*1024*1024;
function estimatedBytes(value:unknown,limit:number):number {
  if(typeof value==='string')return 16+value.length*2;
  if(!value||typeof value!=='object')return 8;
  if(ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return 64+value.byteLength;
  let bytes=48;
  if(Array.isArray(value)){
    for(const element of value){
      bytes+=8+estimatedBytes(element,limit-bytes);
      if(bytes>limit)break;
    }
  }else{
    for(const [key,element] of Object.entries(value)){
      bytes+=16+key.length*2+estimatedBytes(element,limit-bytes);
      if(bytes>limit)break;
    }
  }
  return bytes;
}

interface Preparation {
  bytes:number;
  clip?: DiagramStepAnimationClip;
  plan?: SimulationStepPlanningResult;
}
type Dependency = DiagramStep | DiagramCPState;
// One completed or in-flight preparation per document WebView. Old projects
// and embedded artwork can be collected even while this WebView stays open.
let recent: {name:string; index:number; inputs:WeakRef<Dependency>[]; preparation:Preparation} | undefined;

export function diagramAnimationPreparation(project:DiagramProject, stepId:string) {
  const index=project.steps.findIndex(step=>step.id===stepId);
  if(index<0)throw new Error('找不到要播放的折序步骤。');
  const current=project.steps[index];
  const poseOf=(step:DiagramStep)=>step.paperStates?.spatial??step.paperStates?.flat??step.pose;
  let first=index;
  // Only spatial poses walk backward to recover contact order. Keep the
  // first flat ancestor as it supplies the seed order for that chain.
  while(first>0&&poseOf(project.steps[first])?.spatial){
    const previous=project.steps[first-1];
    if(previous.afterId!==project.steps[first].beforeId)break;
    first--;
  }
  const steps=project.steps.slice(first,index+1),states=project.states.slice(first,index+2);
  const inputs:Dependency[]=[...steps,...states];
  if(!recent||recent.name!==project.name||recent.index!==index||recent.inputs.length!==inputs.length||
    !recent.inputs.every((ref,i)=>ref.deref()===inputs[i])){
    recent={name:project.name,index,inputs:inputs.map(item=>new WeakRef(item)),preparation:{bytes:0}};
  }
  const preparation=recent.preparation;
  return {
    index, preparation,
    rememberClip(clip:DiagramStepAnimationClip){
      const bytes=estimatedBytes(clip,CACHE_BUDGET);
      if(bytes<=CACHE_BUDGET){preparation.bytes=bytes;preparation.clip=clip;}
    },
    rememberPlan(plan:SimulationStepPlanningResult){
      const remaining=CACHE_BUDGET-preparation.bytes;
      if(preparation.clip&&estimatedBytes(plan,remaining)<=remaining)preparation.plan=plan;
    },
    workerProject():DiagramProject {
      const retained=steps.map((step):DiagramStep=>{
        const {id,title,description,beforeId,afterId}=step;
        if(step!==current)return {id,title,description,beforeId,afterId,pose:poseOf(step)};
        const {pose,paperStates,foldLink,annotations,canvas}=step;
        return {id,title,description,beforeId,afterId,pose,paperStates,foldLink,annotations,canvas};
      });
      return {format:project.format,version:project.version,name:project.name,steps:retained,states,activeStepId:stepId};
    },
  };
}
