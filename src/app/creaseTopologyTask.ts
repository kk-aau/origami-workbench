import type {Doc,Point} from '../core/types';
import type {SnapPoint} from './snapPoints';
import {CREASE_TOPOLOGY_CHUNK,type CreaseTopologyReply,type CreaseTopologyRequest,type CreaseTopologyResult} from './creaseTopologyProtocol';
export * from './creaseTopologyProtocol';
export interface CreaseTopologyTask {promise:Promise<CreaseTopologyResult>;cancel():void}

/** Both directions are bounded messages. Never clone an entire million-line
 * document in one UI task, and never publish a partially received point set. */
export function startCreaseTopology(doc:Pick<Doc,'paper'|'segments'>,readOnly=false,onStage?:(message:string)=>void,
 factory:()=>Worker=()=>new Worker(new URL('../workers/creaseTopology.worker.ts',import.meta.url),{type:'module'}),includeVertices=true):CreaseTopologyTask {
 let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false,uploaded=0;
 let expected:{points:number;vertices:number}|undefined;
 const points:SnapPoint[]=[],vertices:Point[]=[];
 let resolve!:(result:CreaseTopologyResult)=>void;
 const promise=new Promise<CreaseTopologyResult>(yes=>{resolve=yes;});
 const finish=(result:CreaseTopologyResult)=>{
  if(settled)return;settled=true;if(timer!==undefined)clearTimeout(timer);worker?.terminate();
  if(result.status!=='ready'){points.length=0;vertices.length=0;}
  resolve(result);
 };
 const fail=(error:unknown)=>finish({status:'error',message:error instanceof Error?error.message:String(error)});
 const send=(message:CreaseTopologyRequest)=>worker!.postMessage(message);
 const upload=()=>{
  if(settled)return;
  try{
   const end=Math.min(uploaded+CREASE_TOPOLOGY_CHUNK,doc.segments.length);
   if(end>uploaded){send({type:'segments',offset:uploaded,segments:doc.segments.slice(uploaded,end)});uploaded=end;}
   if(uploaded<doc.segments.length)timer=setTimeout(upload,0);
   else {onStage?.('正在计算完整交点与吸附位置');send({type:'compute'});}
  }catch(error){fail(error);}
 };
 try{
  worker=factory();
  worker.onmessage=(event:MessageEvent<CreaseTopologyReply>)=>{
   if(settled)return;
   try{
    const reply=event.data;
    if(reply?.type==='error'){fail(new Error(reply.message));return;}
    if(reply?.type==='result-begin'){
     if(expected||uploaded!==doc.segments.length||![reply.points,reply.vertices].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('交点线程返回的数量无效。');
     expected={points:reply.points,vertices:reply.vertices};onStage?.('正在接收完整交点');send({type:'next'});return;
    }
    if(reply?.type==='points'){
     if(!expected||reply.offset!==points.length||!Array.isArray(reply.points)||!reply.points.length||reply.points.length>CREASE_TOPOLOGY_CHUNK||points.length+reply.points.length>expected.points)throw new Error('交点数据不完整或顺序错误。');
     for(const point of reply.points)points.push(point);
     send({type:'next'});return;
    }
    if(reply?.type==='vertices'){
     if(!expected||points.length!==expected.points||reply.offset!==vertices.length||!Array.isArray(reply.vertices)||!reply.vertices.length||reply.vertices.length>CREASE_TOPOLOGY_CHUNK||vertices.length+reply.vertices.length>expected.vertices)throw new Error('顶点数据不完整或顺序错误。');
     for(const point of reply.vertices)vertices.push(point);
     send({type:'next'});return;
    }
    if(reply?.type==='complete'&&expected&&points.length===expected.points&&vertices.length===expected.vertices){finish({status:'ready',value:{points,vertices}});return;}
    throw new Error('交点线程未返回完整结果。');
   }catch(error){fail(error);}
  };
  worker.onerror=event=>{event.preventDefault();fail(new Error('交点计算线程异常：'+(event.message||'请检查可用内存后重试。')));};
  worker.onmessageerror=()=>fail(new Error('无法读取交点计算结果，请重试。'));
  send({type:'begin',paper:{...doc.paper},count:doc.segments.length,readOnly,includeVertices});
  onStage?.('正在准备交点计算');timer=setTimeout(upload,0);
 }catch(error){fail(error);}
 return {promise,cancel:()=>finish({status:'cancelled',message:'交点准备已取消；重试完成后可继续编辑。'})};
}
