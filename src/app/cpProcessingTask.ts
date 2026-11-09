import type {Doc} from '../core/types';
import type {CPPathAnalysis,CPPathOptimization,CPPathOptimizerOptions} from '../core/cpPathOptimizer';
import type {verifyCPProcessingExport} from '../core/cpProcessingExport';

export interface CPProcessingRequest {doc:Doc;options:CPPathOptimizerOptions}
export type CPReadbackReport=ReturnType<typeof verifyCPProcessingExport>;
export interface CPProcessingFiles {dxf:string;report:CPReadbackReport;warnings:string[]}
export type CPProcessingReply=
  |{status:'ready';plan:CPPathOptimization;files:CPProcessingFiles}
  |{status:'blocked';analysis:CPPathAnalysis;message:string}
  |{status:'error'|'cancelled'|'timeout';message:string};
export interface CPProcessingTask {promise:Promise<CPProcessingReply>;cancel():void}

/** A disposable worker owns each preview, including serialization/readback. */
export function startCPProcessingPreview(request:CPProcessingRequest,timeoutMs=60_000):CPProcessingTask {
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false,resolve!:(reply:CPProcessingReply)=>void;
  const promise=new Promise<CPProcessingReply>(r=>resolve=r);
  const finish=(reply:CPProcessingReply)=>{
    if(settled)return;settled=true;if(timer!==undefined)clearTimeout(timer);worker?.terminate();resolve(reply);
  };
  try {
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>120_000)throw Error('加工预览时限须为 1—120,000 毫秒。');
    worker=new Worker(new URL('../workers/cpProcessing.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(event:MessageEvent<CPProcessingReply>)=>finish(event.data);
    worker.onerror=event=>finish({status:'error',message:`加工路径线程异常：${event.message||'未知错误'}`});
    worker.onmessageerror=()=>finish({status:'error',message:'无法读取加工路径预览。'});
    worker.postMessage(structuredClone(request));
    if(!settled)timer=setTimeout(()=>finish({status:'timeout',message:'加工路径优化超时，未导出文件，请缩小加工范围后重试。'}),timeoutMs);
  }catch(cause){finish({status:'error',message:cause instanceof Error?cause.message:String(cause)});}
  return {promise,cancel:()=>finish({status:'cancelled',message:'已取消加工预览。'})};
}
