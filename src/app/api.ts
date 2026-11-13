import {WEB_APP} from './webRuntime';
import {documentScopeHeaders} from './documentRequestScope';
let sessionToken='';
export function storageSessionToken(){return sessionToken;}
export async function connect(){if(WEB_APP){const result=await (await import('./browserApi')).browserRequest('health','GET');sessionToken=result.token;return result;}try{const r=await fetch('/api/health',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error();const j=await r.json();sessionToken=j.token;return j;}catch{throw new Error('本地服务未连接，请从启动入口打开工作台。');}}
async function request<T=any>(url:string,method:'GET'|'POST'|'DELETE',value?:unknown,signal?:AbortSignal,serialized?:string,rawText:boolean|'blob'=false):Promise<T>{
  if(WEB_APP){const result=await (await import('./browserApi')).browserRequest(url,method,serialized===undefined?value:JSON.parse(serialized),signal);return (rawText==='blob'?new Blob([JSON.stringify(result)],{type:'application/json'}):rawText?JSON.stringify(result):result) as T;}
  let res:Response;
  try{res=await fetch('/api/'+url,{method,headers:{...documentScopeHeaders(),...(method==='GET'?(/^(storage|activity)([/?]|$)/.test(url)?{'X-Zhezhi-Token':sessionToken}:{}):{'Content-Type':'application/json','X-Zhezhi-Token':sessionToken})},body:serialized??(value===undefined?undefined:JSON.stringify(value)),signal:signal??AbortSignal.timeout(70000)});}catch(e){if((e as Error).name==='AbortError')throw e;throw new Error((e as Error).name==='TimeoutError'?'本地操作等待超时，请重试或检查启动窗口。':'无法连接本地服务。请重新运行启动入口，再刷新页面；当前作品可先导出完整工程。');}
  if(rawText&&res.ok)return (rawText==='blob'?await res.blob():await res.text()) as T;
  let data:any;try{data=await res.json();}catch{throw new Error('本地服务返回格式异常，请检查启动日志。');}if(!res.ok)throw Object.assign(new Error(data.error||'本地操作未完成，请重试。'),{status:res.status,code:data.code});return data;
}
export function api<T=any>(url:string,value?:unknown,signal?:AbortSignal):Promise<T>{return request<T>(url,value===undefined?'GET':'POST',value,signal);}
/** Keep large saved records as HTTP text until the existing import Worker parses them. */
export function apiText(url:string,signal?:AbortSignal):Promise<string>{return request<string>(url,'GET',undefined,signal,undefined,true);}
/** Keep recovery bytes out of the UI parser; Workers read the immutable Blob. */
export function apiBlob(url:string,signal?:AbortSignal):Promise<Blob>{return request<Blob>(url,'GET',undefined,signal,undefined,'blob');}
/** Reuse an already serialized immutable document instead of walking it again. */
export function apiSerialized<T=any>(url:string,text:string,signal?:AbortSignal):Promise<T>{return request<T>(url,'POST',undefined,signal,text);}
export function deleteProject(id:string,signal?:AbortSignal):Promise<{id:string;deleted:boolean;warning?:string}>{return request('projects/'+encodeURIComponent(id),'DELETE',undefined,signal);}
/** Analysis requests share the tessellation worker and can wait for its lease. */
export async function apiWhenIdle<T=any>(url:string,value:unknown,signal?:AbortSignal):Promise<T>{
  const waiting=AbortSignal.any([AbortSignal.timeout(70000),...(signal?[signal]:[])]);
  while(true){
    waiting.throwIfAborted();
    try{return await api<T>(url,value,waiting);}
    catch(cause){
      const status=(cause as Error&{status?:number})?.status;
      if(waiting.aborted||!(cause instanceof Error)||!([409,429].includes(status??0))||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
      await new Promise<void>((resolve,reject)=>{
        const abort=()=>{clearTimeout(timer);waiting.removeEventListener('abort',abort);reject(waiting.reason);};
        const timer=setTimeout(()=>{waiting.removeEventListener('abort',abort);resolve();},250);
        waiting.addEventListener('abort',abort,{once:true});
      });
    }
  }
}
export type ExportSaveResult=import('../desktop').DesktopExportResult|{status:'browser'};
/** Native exports resolve only after the chosen file is safely written. */
export async function saveDownload(blob:Blob,name:string,options?:import('../desktop').DesktopExportOptions):Promise<ExportSaveResult> {
  if(options?.signal?.aborted)return {status:'cancelled'};
  type ExportWindow=Window&{Blob?:typeof Blob;__TAURI_INTERNALS__?:unknown;__TAURI__?:unknown};
  let runtime=window as ExportWindow;
  // The simulator runs in a same-origin iframe. File ownership stays with the
  // top-level application; never give that iframe its own browser download path.
  if(typeof runtime.desktop?.saveExport!=='function'){
    // Tauri IPC markers can also exist inside the iframe while the application
    // bridge intentionally lives only on the main window. Prefer that bridge.
    try{const parent=window.parent as ExportWindow;if(parent&&parent!==window&&parent.location.origin===window.location.origin&&(parent.desktop||parent.__TAURI_INTERNALS__||parent.__TAURI__))runtime=parent;}catch{/* A cross-origin parent is not an application file bridge. */}
  }
  if(typeof runtime.desktop?.saveExport==='function'){
    // Blob constructors differ between realms. Wrap the immutable Blob in the
    // owning window without converting the full file into a byte array or JSON.
    const content=runtime===window?blob:new (runtime.Blob??Blob)([blob],{type:blob.type});
    return runtime.desktop.saveExport(content,name,options);
  }
  // An older host (or failed injection) must not silently turn desktop Save As
  // into a browser download. Ordinary browsers, including localhost, stay usable.
  if(runtime.desktop?.isDesktop||runtime.__TAURI_INTERNALS__||runtime.__TAURI__){
    throw new Error('桌面保存接口未就绪或版本不匹配，请从最新迁移版入口重新打开应用后导出。当前内容仍保留。');
  }
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;
  try{anchor.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
  return {status:'browser'};
}
/** Older export callers may ignore the promise; keep failures visible anyway. */
export function downloadBlob(blob:Blob,name:string,options?:import('../desktop').DesktopExportOptions) {
  const result=saveDownload(blob,name,options);
  void result.catch(error=>window.dispatchEvent(new CustomEvent('zhezhi-export-error',{detail:error instanceof Error?error.message:String(error)})));
  return result;
}
export function download(text:string,name:string,type='application/json',options?:import('../desktop').DesktopExportOptions) {return downloadBlob(new Blob([text],{type}),name,options);}
export function safeName(name:string) {return name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'折纸作品';}

/** Local vector conversion; cancellation has no file-system side effects. */
export async function convertSVGToPDFPage(svg:string,signal?:AbortSignal):Promise<Uint8Array> {
  signal?.throwIfAborted();
  if(WEB_APP)return (await import('./browserPDF')).browserSVGToPDF(svg,signal);
  const response=await fetch('/api/export/pdf-page',{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':sessionToken},body:JSON.stringify({svg}),signal});
  if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(error?.error??'本机矢量 PDF 服务不可用，请启动更新后的迁移版。');}
  if(!response.headers.get('content-type')?.startsWith('application/pdf'))throw new Error('本机服务返回的 PDF 格式无效，未保存文件。');
  const data=new Uint8Array(await response.arrayBuffer());signal?.throwIfAborted();return data;
}
