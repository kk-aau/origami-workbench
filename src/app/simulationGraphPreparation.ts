import type {Doc} from '../core/types';
import type {SimulationPose} from '../engine/simPose';
import type {SimulationGraphPreparation} from '../engine/simulationGraphPreparation';
import {artworkTransferChunks,createArtworkTransferReceiver,type ArtworkTransferOperation} from './artworkImportTransfer';

export type SimulationGraphPreparationRequest={type:'begin'}|{type:'input';index:number;operations:ArtworkTransferOperation[]}|{type:'input-complete';chunks:number}|{type:'continue-result';index:number};
export type SimulationGraphPreparationReply={type:'continue-input';index:number}|{type:'result-begin'}|{type:'result-chunk';index:number;operations:ArtworkTransferOperation[]}|{type:'result-complete';chunks:number}|{type:'error';message:string};

/** Both directions use bounded, acknowledged chunks. In particular a CP with
 * a large unknown metadata string never becomes one blocking postMessage.
 * The owner cancels when the immutable input document is superseded. */
export function startSimulationGraphPreparation(doc:Doc,pose?:SimulationPose,factory:()=>Worker=()=>new Worker(new URL('../workers/simulationGraphPreparation.worker.ts',import.meta.url),{type:'module'})){
 let worker:Worker|undefined,done=false,uploaded=0,uploadComplete=false;
 let outgoing:ReturnType<typeof artworkTransferChunks>|undefined=artworkTransferChunks({doc,hasPose:pose!==undefined,...(pose?{poseSource:pose.source}:{})});
 let incoming:{receiver:ReturnType<typeof createArtworkTransferReceiver>;chunks:number}|undefined;
 let failTask!:(error:Error)=>void;
 const promise=new Promise<SimulationGraphPreparation>((resolve,reject)=>{
  const clear=()=>{outgoing?.return(undefined);outgoing=undefined;incoming=undefined;worker?.terminate();};
  const fail=(error:Error)=>{if(done)return;done=true;clear();reject(error);};failTask=fail;
  try{
   worker=factory();
   worker.onmessage=(event:MessageEvent<SimulationGraphPreparationReply>)=>{
    if(done)return;
    try{
     const reply=event.data;
     if(reply?.type==='continue-input'){
      if(uploadComplete||reply.index!==uploaded||!outgoing)throw Error('三维折痕输入分批顺序错误。');
      const next=outgoing.next();
      if(next.done){uploadComplete=true;outgoing=undefined;worker!.postMessage({type:'input-complete',chunks:uploaded} satisfies SimulationGraphPreparationRequest);}
      else worker!.postMessage({type:'input',index:uploaded++,operations:next.value} satisfies SimulationGraphPreparationRequest);
      return;
     }
     if(reply?.type==='result-begin'){
      if(!uploadComplete||incoming)throw Error('三维折痕输入尚未完整接收。');
      incoming={receiver:createArtworkTransferReceiver(),chunks:0};worker!.postMessage({type:'continue-result',index:0} satisfies SimulationGraphPreparationRequest);return;
     }
     if(reply?.type==='result-chunk'){
      if(!incoming||reply.index!==incoming.chunks)throw Error('三维折痕结果分批顺序错误。');
      incoming.receiver.receive(reply.operations);incoming.chunks++;worker!.postMessage({type:'continue-result',index:incoming.chunks} satisfies SimulationGraphPreparationRequest);return;
     }
     if(reply?.type==='result-complete'){
      if(!incoming||!Number.isSafeInteger(reply.chunks)||reply.chunks<1||reply.chunks!==incoming.chunks)throw Error('三维折痕结果尚未接收完整。');
      const result=incoming.receiver.finish() as SimulationGraphPreparation;
      if(!result||!Array.isArray(result.warnings)||result.warnings.some(warning=>typeof warning!=='string')||typeof result.matchesPose!=='boolean'||result.graph===null&&!pose||result.graph!==null&&(!result.graph||!Array.isArray(result.graph.vertices_coords)||!Array.isArray(result.graph.edges_vertices)||!Array.isArray(result.graph.edges_assignment)||!Array.isArray(result.graph.edges_foldAngle)))throw Error('三维折痕准备结果无效。');
      done=true;clear();resolve(result);return;
     }
     throw Error(reply?.type==='error'?reply.message:'三维折痕准备线程返回无效消息。');
    }catch(error){fail(error instanceof Error?error:new Error(String(error)));}
   };
   worker.onerror=event=>fail(Error(event.message||'三维折痕准备线程异常。'));
   worker.onmessageerror=()=>fail(Error('三维折痕准备数据传输失败。'));
   worker.postMessage({type:'begin'} satisfies SimulationGraphPreparationRequest);
  }catch(error){fail(error instanceof Error?error:new Error(String(error)));}
 });
 return {promise,cancel(){failTask(new DOMException('三维折痕准备已取消。','AbortError'));}};
}
