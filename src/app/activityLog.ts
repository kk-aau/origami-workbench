import {api,storageSessionToken} from './api';

type Detail=string|number|boolean|null;
type ActivityEvent={action:string;level:'info'|'warning'|'error';details:Record<string,Detail>};
const allowed=new Set(['fileName','format','stage','result','count','segments','objects','bytes','durationMs','status','method','reason','source','line','column','version','sessionId','workspace','previous','target','tool']);
const sessionId=crypto.randomUUID(),pending:ActivityEvent[]=[];
let writing:Promise<boolean>|null=null;

/** Bounded, best-effort diagnostics. Logging must never delay an editor action. */
export function recordActivity(action:string,details:Record<string,Detail>={},level:ActivityEvent['level']='info'):void {
  if(!/^[a-z][a-z0-9_.-]{0,79}$/.test(action))return;
  const safe:Record<string,Detail>={sessionId};
  for(const [key,value] of Object.entries(details)){
    if(!allowed.has(key)||typeof value==='number'&&!Number.isFinite(value))continue;
    if(typeof value==='string')safe[key]=(key==='fileName'||key==='source'?(value.split(/[\\/]/).pop()??'').split(/[?#]/)[0]:value).slice(0,800);
    else if(value===null||typeof value==='number'||typeof value==='boolean')safe[key]=value;
  }
  if(pending.length>=100)pending.shift();
  pending.push({action,level,details:safe});
  void flushActivityLog();
}

/** Also used before viewing/exporting to include the latest queued actions. */
export function flushActivityLog():Promise<boolean>{
  if(writing)return writing;
  if(!pending.length)return Promise.resolve(true);
  if(!storageSessionToken())return Promise.resolve(false);
  writing=(async()=>{
    while(pending.length){
      const event=pending[0];
      try{await api('activity',event,AbortSignal.timeout(3000));}
      catch{return false;}
      const index=pending.indexOf(event);if(index>=0)pending.splice(index,1);
    }
    return true;
  })().finally(()=>{writing=null;});
  return writing;
}

export function installRuntimeActivityLogging():()=>void {
  const error=(event:ErrorEvent)=>recordActivity('runtime.error',{reason:event.message||'资源加载失败',source:event.filename||'',line:event.lineno||0,column:event.colno||0},'error');
  const rejection=(event:PromiseRejectionEvent)=>recordActivity('runtime.unhandledrejection',{reason:event.reason instanceof Error?event.reason.message:typeof event.reason==='string'?event.reason:'未处理的异步异常'},'error');
  window.addEventListener('error',error);window.addEventListener('unhandledrejection',rejection);
  return()=>{window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejection);};
}
