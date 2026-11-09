import {validateToolShortcuts,type ToolShortcuts} from './toolShortcuts';
import type {OriconfigArchive} from './oriconfigArchive';
import type {OrieditaHotkeyPreview} from './orieditaHotkeys';

export interface OriconfigRequest {bytes:Uint8Array;bindings:ToolShortcuts}
export type OriconfigReply={status:'complete';archive:OriconfigArchive;hotkeys:OrieditaHotkeyPreview|null}|{status:'error'|'timeout'|'cancelled';message:string};
export interface OriconfigTask {promise:Promise<OriconfigReply>;cancel():void}
/** Preview only. Never writes preferences, document state or files. */
export function startOriconfigPreview(bytes:Uint8Array,bindings:ToolShortcuts,timeoutMs=3000):OriconfigTask{
 let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false,resolve!:(reply:OriconfigReply)=>void;
 const promise=new Promise<OriconfigReply>(r=>resolve=r);
 const finish=(reply:OriconfigReply)=>{if(settled)return;settled=true;if(timer!==undefined)clearTimeout(timer);worker?.terminate();resolve(reply);};
 try{
  if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Error('预检时限须为 1—60000 毫秒。');
  if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>4*1024*1024)throw new Error('设置包为空或超过 4 MB。');
  const request:OriconfigRequest={bytes:bytes.slice(),bindings:validateToolShortcuts(bindings)};
  worker=new Worker(new URL('../workers/oriconfig.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<OriconfigReply>)=>finish(event.data);
  worker.onerror=event=>finish({status:'error',message:`设置包预检线程异常：${event.message||'未知错误'}`});
  worker.onmessageerror=()=>finish({status:'error',message:'无法读取设置包预检结果。'});
  worker.postMessage(request,[request.bytes.buffer]);
  if(!settled)timer=setTimeout(()=>finish({status:'timeout',message:'设置包预检超时，未修改任何设置。'}),timeoutMs);
 }catch(e){finish({status:'error',message:`设置包预检失败：${e instanceof Error?e.message:String(e)}`});}
 return {promise,cancel:()=>finish({status:'cancelled',message:'已取消设置包预检，未修改任何设置。'})};
}
