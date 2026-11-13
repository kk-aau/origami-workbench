import {runDiagramLibraryBackgroundSave} from '../app/diagramLibraryBackgroundSave';
import {DiagramLibraryConflictError,type DiagramLibraryBackgroundRequest} from '../app/diagramLibrary';
import {setPreferenceService,type Preferences} from '../app/preferenceStorage';
import type {DiagramLibrarySaveRequest,DiagramLibrarySaveReply} from '../app/diagramLibrarySaveTask';
import {documentWorkingPreferenceKey} from '../app/documentRuntime';

const scope=globalThis as unknown as {onmessage:((event:MessageEvent<DiagramLibrarySaveRequest>)=>void)|null;postMessage(reply:DiagramLibrarySaveReply):void};
// Blob.text is asynchronous; preserve the original serial transaction ordering
// and preference-service lifetime even if several callers post in one turn.
let queue=Promise.resolve();
scope.onmessage=event=>{queue=queue.then(()=>save(event.data));};
async function save(input:DiagramLibrarySaveRequest):Promise<void>{
  const {id,url,token,webPreferences}=input;
  try{
    if(input.documentId!==undefined)documentWorkingPreferenceKey('zhezhi.diagram-project.v1',input.documentId);
    let request:DiagramLibraryBackgroundRequest;
    if('projectBlob' in input.request){
      const {projectBlob,...rest}=input.request;
      if(!(projectBlob instanceof Blob)||projectBlob.type!=='application/json'||!projectBlob.size)throw Error('后台绘图保存数据无效，当前内容尚未提交。');
      // Still run the full library codec and conflict checks below. The Blob is
      // a transport optimization, never a persisted validation certificate.
      request={...rest,project:JSON.parse(await projectBlob.text())};
    }else request=input.request;
    if(webPreferences){
      const values=new Map(webPreferences),updates=new Map<string,string>();
      const storage:Preferences={getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);updates.set(key,value);},compareAndSet(key,expected,value){if((values.get(key)??null)!==expected)return false;values.set(key,value);updates.set(key,value);return true;}};
      setPreferenceService(storage);
      const result=runDiagramLibraryBackgroundSave(request,storage);
      scope.postMessage({id,type:'result',result,webUpdates:[...updates]});return;
    }
    const preference=(action:'get'|'set'|'compareAndSet',key:string,value?:string,expectedValue?:string|null):string|null|boolean=>{
      key=documentWorkingPreferenceKey(key,input.documentId);
      const xhr=new XMLHttpRequest();xhr.open(action==='get'?'GET':'POST',action==='get'?url+'?key='+encodeURIComponent(key):url,false);
      xhr.setRequestHeader('X-Zhezhi-Token',token);
      if(input.documentId)xhr.setRequestHeader('X-Zhezhi-Document',input.documentId);
      if(action!=='get')xhr.setRequestHeader('Content-Type','application/json');
      xhr.send(action==='get'?null:JSON.stringify({key,value,...(action==='compareAndSet'?{expectedValue}:{})}));
      let answer:{value?:string|null;error?:string};try{answer=JSON.parse(xhr.responseText);}catch{throw Error('存储服务未返回有效数据。');}
      if(action==='compareAndSet'&&xhr.status===409)return false;
      if(xhr.status!==200)throw Error(answer.error||'保存目录暂不可用，请重试。');
      return action==='compareAndSet'?true:answer.value??null;
    };
    const storage:Preferences={getItem:key=>preference('get',key) as string|null,setItem:(key,value)=>{preference('set',key,value);},compareAndSet:(key,expected,value)=>preference('compareAndSet',key,value,expected)===true};
    // Thumbnail paint uses the same live style preferences as the main app.
    setPreferenceService(storage);
    scope.postMessage({id,type:'result',result:runDiagramLibraryBackgroundSave(request,storage)});
  }catch(error){scope.postMessage({id,type:'error',message:error instanceof Error?error.message:String(error),conflict:error instanceof DiagramLibraryConflictError});}
  finally{setPreferenceService(undefined);}
}
