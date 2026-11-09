import {storageSessionToken} from './api';
import {DiagramLibraryConflictError,type DiagramLibraryBackgroundRequest,type DiagramLibraryBackgroundResult} from './diagramLibrary';
import {WEB_APP} from './webRuntime';

export interface DiagramLibrarySaveRequest {id:number;request:DiagramLibraryBackgroundRequest;url:string;token:string;webPreferences?:[string,string][]}
export type DiagramLibrarySaveReply={id:number;type:'result';result:DiagramLibraryBackgroundResult;webUpdates?:[string,string][]}|{id:number;type:'error';message:string;conflict?:boolean};

/** The worker owns the expensive validator and synchronous disk bridge. The
 * main thread receives only a small receipt, never a second parsed project. */
export function createDiagramLibrarySaveClient(factory:()=>Worker=()=>new Worker(new URL('../workers/diagramLibrarySave.worker.ts',import.meta.url),{type:'module'})){
  let worker:Worker|undefined,serial=0,closing=false,generation=0;
  const webBaselines=new Map<number,[string,string][]>();
  const pending=new Map<number,{resolve:(result:DiagramLibraryBackgroundResult)=>void;reject:(error:Error)=>void}>(),idle:(()=>void)[]=[];
  const finish=()=>{if(!pending.size)for(const resolve of idle.splice(0))resolve();};
  const fail=(error:Error)=>{worker?.terminate();worker=undefined;for(const request of pending.values())request.reject(error);pending.clear();webBaselines.clear();finish();};
  const save=async(request:DiagramLibraryBackgroundRequest):Promise<DiagramLibraryBackgroundResult>=>{
    if(closing)return Promise.reject(new Error('绘图保存服务正在关闭，当前内容尚未提交。'));
    const startedGeneration=generation;
    const browser=WEB_APP?await import('./browserStorage'):undefined;
    if(browser)await browser.flushBrowserPreferences();
    if(closing||generation!==startedGeneration)throw new Error('绘图保存服务已关闭，当前内容尚未提交。');
    const webPreferences=browser?.browserPreferenceSnapshot();
    const id=++serial;
    return new Promise((resolve,reject)=>{
      pending.set(id,{resolve,reject});
      try{
        if(!worker){
          const created=factory();worker=created;
          created.onmessage=async(event:MessageEvent<DiagramLibrarySaveReply>)=>{
            if(worker!==created)return;
            const reply=event.data,job=pending.get(reply?.id);if(!job)return;
            if(reply.type==='result'&&reply.result){
              try{if(WEB_APP){const storage=await import('./browserStorage');const baseline=webBaselines.get(reply.id);if(!baseline||!reply.webUpdates)throw Error('浏览器绘图保存缺少提交记录。');await storage.commitBrowserPreferences(baseline,reply.webUpdates);}pending.delete(reply.id);webBaselines.delete(reply.id);job.resolve(reply.result);finish();}
              catch(error){pending.delete(reply.id);webBaselines.delete(reply.id);job.reject(error instanceof Error?error:new Error(String(error)));finish();}
            }
            else if(reply.type==='error'&&typeof reply.message==='string'){pending.delete(reply.id);webBaselines.delete(reply.id);job.reject(reply.conflict?new DiagramLibraryConflictError():new Error(reply.message));finish();}
            else fail(new Error('后台绘图保存返回了无效消息。'));
          };
          created.onerror=event=>{if(worker===created)fail(new Error('后台绘图保存线程异常：'+event.message));};
          created.onmessageerror=()=>{if(worker===created)fail(new Error('后台绘图保存消息传输失败。'));};
        }
        const token=storageSessionToken();if(!token)throw new Error('本地存储尚未连接，未提交绘图。');
        if(webPreferences)webBaselines.set(id,webPreferences);
        worker.postMessage({id,request,url:new URL('/api/storage/preferences',location.href).href,token,webPreferences} satisfies DiagramLibrarySaveRequest);
      }catch(error){pending.delete(id);webBaselines.delete(id);reject(error instanceof Error?error:new Error(String(error)));finish();}
    });
  };
  return {save,async dispose(){generation++;closing=true;if(pending.size)await new Promise<void>(resolve=>idle.push(resolve));worker?.terminate();worker=undefined;closing=false;}};
}
