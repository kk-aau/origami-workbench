import type {DiagramProject} from './diagramProject';
import type {DiagramFullAnimationEntry} from './diagramFullAnimation';

export function startDiagramFullAnimation(project:DiagramProject){
  const worker=new Worker(new URL('../workers/diagramFullAnimation.worker.ts',import.meta.url),{type:'module'});
  let serial=0,closed=false;
  const pending=new Map<number,{resolve:(entry:DiagramFullAnimationEntry)=>void;reject:(error:Error)=>void;progress?:(index:number,message:string)=>void}>();
  const cancel=(error:Error=new DOMException('全程演示已停止。','AbortError'))=>{if(closed)return;closed=true;worker.terminate();for(const item of pending.values())item.reject(error);pending.clear();};
  worker.onerror=()=>cancel(new Error('全程演示计算线程异常，请重试。'));
  worker.onmessageerror=()=>cancel(new Error('无法读取演示计算结果。'));
  worker.onmessage=(event:MessageEvent<{id:number;type:string;entry:DiagramFullAnimationEntry;index:number;message:string}>)=>{
    const m=event.data,item=pending.get(m.id);if(!item||closed)return;
    if(m.type==='progress'){item.progress?.(m.index,m.message);return;}
    pending.delete(m.id);
    if(m.type==='result')item.resolve(m.entry);else item.reject(Object.assign(new Error(m.message),{stepIndex:m.index}));
  };
  try{worker.postMessage({type:'init',project});}catch(error){cancel();throw error;}
  return {cancel,prepare(index:number,start:number,progress?:(index:number,message:string)=>void){
    return new Promise<DiagramFullAnimationEntry>((resolve,reject)=>{
      if(closed){reject(new Error('演示已停止，请重新准备。'));return;}
      const id=++serial;pending.set(id,{resolve,reject,progress});
      try{worker.postMessage({type:'prepare',id,index,start});}catch(error){pending.delete(id);reject(error);}
    });
  }};
}
