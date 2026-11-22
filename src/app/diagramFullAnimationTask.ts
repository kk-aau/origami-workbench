import type {DiagramProject} from './diagramProject';
import type {DiagramFullAnimationEntry} from './diagramFullAnimation';

export function startDiagramFullAnimation(project:DiagramProject,sink?:{first:number;last:number}){
  let offset=sink?.first??0;
  // A spatial start may inherit its contact order from an earlier flat pose.
  while(sink&&offset>0){
    const step=project.steps[offset];
    if(!(step.paperStates?.spatial??step.paperStates?.flat??step.pose)?.spatial||project.steps[offset-1].afterId!==step.beforeId)break;
    offset--;
  }
  const input:DiagramProject=sink?{format:project.format,version:project.version,name:project.name,
    activeStepId:project.steps[sink.first].id,states:project.states.slice(offset,sink.last+3),
    steps:project.steps.slice(offset,sink.last+2).map(({id,title,description,beforeId,afterId,pose,paperStates,annotations,canvas,foldLink})=>
      ({id,title,description,beforeId,afterId,pose,paperStates,annotations,canvas,foldLink}))}:project;
  const worker=new Worker(new URL('../workers/diagramFullAnimation.worker.ts',import.meta.url),{type:'module'});
  let serial=0,closed=false;
  const pending=new Map<number,{resolve:(entry:DiagramFullAnimationEntry)=>void;reject:(error:Error)=>void;progress?:(index:number,message:string)=>void}>();
  const cancel=(error:Error=new DOMException('全程演示已停止。','AbortError'))=>{if(closed)return;closed=true;worker.terminate();for(const item of pending.values())item.reject(error);pending.clear();};
  worker.onerror=()=>cancel(new Error('全程演示计算线程异常，请重试。'));
  worker.onmessageerror=()=>cancel(new Error('无法读取演示计算结果。'));
  worker.onmessage=(event:MessageEvent<{id:number;type:string;entry:DiagramFullAnimationEntry;index:number;message:string}>)=>{
    const m=event.data,item=pending.get(m.id);if(!item||closed)return;
    if(m.type==='progress'){item.progress?.(m.index+offset,m.message);return;}
    pending.delete(m.id);
    if(m.type==='result')item.resolve(offset?{...m.entry,index:m.entry.index+offset}:m.entry);else item.reject(Object.assign(new Error(m.message),{stepIndex:m.index+offset}));
  };
  try{worker.postMessage({type:'init',project:input,...(sink?{sink:{first:sink.first-offset,last:sink.last-offset}}:{})});}catch(error){cancel();throw error;}
  return {cancel,prepare(index:number,start:number,progress?:(index:number,message:string)=>void,position=0){
    return new Promise<DiagramFullAnimationEntry>((resolve,reject)=>{
      if(closed){reject(new Error('演示已停止，请重新准备。'));return;}
      const id=++serial;pending.set(id,{resolve,reject,progress});
      try{worker.postMessage({type:'prepare',id,index:index-offset,start:start-offset,position});}catch(error){pending.delete(id);reject(error);}
    });
  }};
}
