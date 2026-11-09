import {runDiagramLibraryBackgroundSave} from '../app/diagramLibraryBackgroundSave';
import {DiagramLibraryConflictError} from '../app/diagramLibrary';
import {setPreferenceService,type Preferences} from '../app/preferenceStorage';
import type {DiagramLibrarySaveRequest,DiagramLibrarySaveReply} from '../app/diagramLibrarySaveTask';

const scope=globalThis as unknown as {onmessage:((event:MessageEvent<DiagramLibrarySaveRequest>)=>void)|null;postMessage(reply:DiagramLibrarySaveReply):void};
scope.onmessage=event=>{
  const {id,request,url,token}=event.data;
  try{
    const preference=(action:'get'|'set'|'compareAndSet',key:string,value?:string,expectedValue?:string|null):string|null|boolean=>{
      const xhr=new XMLHttpRequest();xhr.open(action==='get'?'GET':'POST',action==='get'?url+'?key='+encodeURIComponent(key):url,false);
      xhr.setRequestHeader('X-Zhezhi-Token',token);
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
};
