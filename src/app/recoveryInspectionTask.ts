import type {RecoveryCandidate,RecoveryInspection,RecoveryInspectionRequest,RecoveryInspectionReply} from './recoveryInspection';
export type {RecoveryCandidate,RecoveryInspection} from './recoveryInspection';
export interface RecoveryInspectionTask {promise:Promise<RecoveryInspection>;cancel():void}

function candidate(value:unknown):value is RecoveryCandidate{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const record=value as RecoveryCandidate;
 return ['name','source','restore','backup'].every(key=>Object.hasOwn(record,key))&&Object.keys(record).every(key=>['name','source','restore','backup','projectId','baseRevision','updated','signature'].includes(key))
  &&typeof record.name==='string'&&record.name.length<=160&&(record.source==='server'||record.source==='browser')
  &&record.restore instanceof Blob&&record.restore.size>0&&record.backup instanceof Blob&&record.backup.size>0
  &&(record.projectId===undefined||typeof record.projectId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(record.projectId))
  &&(record.baseRevision===undefined||typeof record.baseRevision==='string'&&/^[a-f0-9]{64}$/.test(record.baseRevision))
  &&(record.updated===undefined||typeof record.updated==='string'&&Number.isFinite(Date.parse(record.updated)))
  &&(record.signature===undefined||typeof record.signature==='string');
}
function choice(value:unknown):value is RecoveryInspection{
 if(!value||typeof value!=='object'||Array.isArray(value)||!['alternatives','recovery','warnings'].every(key=>Object.hasOwn(value,key))
  ||Object.keys(value).some(key=>!['alternatives','recovery','warnings','unreadableSources'].includes(key)))return false;
 const record=value as RecoveryInspection;
 return (record.recovery===null||candidate(record.recovery))&&Array.isArray(record.alternatives)&&record.alternatives.length<=1&&record.alternatives.every(candidate)
  &&Array.isArray(record.warnings)&&record.warnings.every(message=>typeof message==='string')&&(record.recovery!==null||record.alternatives.length===0)
  &&(!Object.hasOwn(record,'unreadableSources')||Array.isArray(record.unreadableSources)&&record.unreadableSources.length>=1&&record.unreadableSources.length<=2
    &&record.unreadableSources.every(source=>source==='server'||source==='browser')&&new Set(record.unreadableSources).size===record.unreadableSources.length);
}

/** No synchronous fallback or timer: checking a large old recovery stays in
 * its owned Worker until complete or explicitly cancelled by the caller. */
export function startRecoveryInspection(server:Blob|null,browser:Blob|null,
 factory:()=>Worker=()=>new Worker(new URL('../workers/recoveryInspection.worker.ts',import.meta.url),{type:'module'})):RecoveryInspectionTask{
 let worker:Worker|undefined,settled=false,resolve!:(value:RecoveryInspection)=>void,reject!:(error:Error)=>void;
 const promise=new Promise<RecoveryInspection>((res,rej)=>{resolve=res;reject=rej;});
 const finish=(value?:RecoveryInspection,error?:Error)=>{
  if(settled)return;settled=true;worker?.terminate();worker=undefined;if(error)reject(error);else resolve(value!);
 };
 try{
  if(server!==null&&!(server instanceof Blob)||browser!==null&&!(browser instanceof Blob))throw new Error('恢复副本检查输入无效。');
  worker=factory();worker.onmessage=(event:MessageEvent<RecoveryInspectionReply>)=>{
   if(settled)return;const reply=event.data;
   if(reply?.type==='result'&&choice(reply.choice))finish(reply.choice);
   else if(reply?.type==='error'&&typeof reply.message==='string')finish(undefined,new Error(reply.message));
   else finish(undefined,new Error('恢复副本检查线程返回了无效结果，当前工程未改变。'));
  };
  worker.onerror=event=>finish(undefined,new Error(`恢复副本检查线程异常：${event.message||'请检查可用内存并重试。'}`));
  worker.onmessageerror=()=>finish(undefined,new Error('无法读取恢复副本检查结果，当前工程未改变。'));
  worker.postMessage({server,browser} satisfies RecoveryInspectionRequest);
 }catch(error){finish(undefined,error instanceof Error?error:new Error(String(error)));}
 return {promise,cancel:()=>finish(undefined,new DOMException('已取消检查恢复副本。','AbortError'))};
}
