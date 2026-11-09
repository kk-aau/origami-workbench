import type {ArtworkProject} from './artworkProject';
import {artworkSerializationInput} from './artworkSerialization';

export type ArtworkSerializationRequest={id:number;project:ArtworkProject}|{id:number;project:Omit<ArtworkProject,'editor'>;editorText:string};
export type ArtworkSerializationReply={id:number;type:'result';text:string}|{id:number;type:'error';message:string};

/** Persistent worker retains only the last validated model snapshots. Scope
 * changes/unmount terminate both queued work and its cache; a later scope can
 * create a fresh worker. There is no synchronous fallback to the UI thread. */
export function createArtworkSerializationClient(factory:()=>Worker=()=>new Worker(new URL('../workers/artworkSerialization.worker.ts',import.meta.url),{type:'module'})){
 let worker:Worker|undefined,serial=0;
 const pending=new Map<number,{resolve:(text:string)=>void;reject:(error:Error)=>void}>();
 const cancel=(error:Error=new DOMException('完整作品暂存已取消。','AbortError'))=>{
  worker?.terminate();worker=undefined;
  for(const request of pending.values())request.reject(error);pending.clear();
 };
 return {
  serialize(project:ArtworkProject,editorText?:string):Promise<string>{
   const id=++serial;
   return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    try{
     if(!worker){
      const created=factory();worker=created;
      created.onmessage=(event:MessageEvent<ArtworkSerializationReply>)=>{
       if(worker!==created)return;
       const reply=event.data,request=pending.get(reply?.id);if(!request)return;
       if(reply.type==='result'&&typeof reply.text==='string'){pending.delete(reply.id);request.resolve(reply.text);}
       else if(reply.type==='error'&&typeof reply.message==='string'){pending.delete(reply.id);request.reject(new Error(reply.message));}
       else cancel(new Error('完整作品保存线程返回了无效结果。'));
      };
      created.onerror=event=>{if(worker===created)cancel(new Error(`完整作品保存线程异常：${event.message||'请检查可用内存并重试。'}`));};
      created.onmessageerror=()=>{if(worker===created)cancel(new Error('无法读取完整作品保存结果。'));};
     }
     // Native postMessage snapshots the projected input synchronously once.
     const projected=artworkSerializationInput(project);
     if(editorText===undefined)worker.postMessage({id,project:projected} satisfies ArtworkSerializationRequest);
     else {
      const {editor:_,...remainder}=projected;
      worker.postMessage({id,project:remainder,editorText} satisfies ArtworkSerializationRequest);
     }
    }catch(error){cancel(error instanceof Error?error:new Error(String(error)));}
   });
  },
  cancel,
 };
}
