import {browserRequest} from '../../src/app/browserApi';
import {browserRead,browserPreferences,flushBrowserPreferences,browserPreferenceSnapshot,commitBrowserPreferences} from '../../src/app/browserStorage';
import {connect} from '../../src/app/api';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject} from '../../src/app/diagramProject';
import {createDiagramLibrary} from '../../src/app/diagramLibrary';
import {createDiagramLibrarySaveClient} from '../../src/app/diagramLibrarySaveTask';
const checks:string[]=[];
function check(ok:unknown,label:string){if(!ok)throw Error(label);checks.push(label);}
async function rejects(action:()=>Promise<unknown>,label:string,code?:string){try{await action();}catch(e){check(!code||(e as {code?:string}).code===code,label);return;}throw Error('Expected rejection: '+label);}
try{
 await connect();
 if(location.search==='?reopen'){
  const saved=JSON.parse(sessionStorage.getItem('web-regression-reopen')!);
  const project=await browserRequest('projects/'+saved.id+'?draft=1','GET');
  check(project.doc.name==='草稿'&&project.draft,'draft survives page reload');
  const library=createDiagramLibrary(browserPreferences);check(library.load(saved.diagramId).name==='Browser diagram','diagram survives page reload');
  check(browserPreferences.getItem('zhezhi.test-large.v1')?.length===8*1024*1024,'8 MiB preference survives reload');
 }else{
  const id=crypto.randomUUID(),doc=blankDoc('手动保存',100,100);
  const saved=await browserRequest('projects','POST',{id,doc,baseRevision:null});
  check((await browserRequest('projects/'+id,'GET')).doc.segments.length===4,'saved CP contains all geometry');
  check((await browserRequest('projects?library=1','GET')).projects.find((entry:{id:string})=>entry.id===id)?.thumbnail?.includes('<svg'),'saved CP has library thumbnail');
  const draft=await browserRequest('projects/draft','POST',{id,doc:{...doc,name:'草稿'},baseRevision:saved.revision});
  check((await browserRequest('projects/'+id+'?draft=1','GET')).draft,'latest draft selected');
  check((await browserRequest('projects/'+id,'GET')).doc.name==='手动保存','manual saved version retained separately');
  await rejects(()=>browserRequest('projects','POST',{id,doc,baseRevision:saved.revision}),'stale revision cannot overwrite draft','project_conflict');
  const invalid={...doc,paper:{width:NaN,height:100}};
  await rejects(()=>browserRequest('projects','POST',{id,doc:invalid,baseRevision:draft.revision}),'invalid geometry rejected');
  check((await browserRequest('projects/'+id+'?draft=1','GET')).revision===draft.revision,'failed writes preserve current revision');
  const other=crypto.randomUUID();await browserRequest('projects','POST',{id:other,doc,baseRevision:null});await browserRequest('projects/'+other,'DELETE');
  await rejects(()=>browserRequest('projects/draft','POST',{id:other,doc,baseRevision:null}),'late saves cannot resurrect deleted projects','project_deleted');
  const controller=new AbortController();controller.abort();await rejects(()=>browserRequest('projects','POST',{doc},controller.signal),'cancel before save writes nothing');
  browserPreferences.setItem('zhezhi.test-large.v1','x'.repeat(8*1024*1024));await flushBrowserPreferences();
  check((await browserRead<string>('preference:zhezhi.test-large.v1'))?.length===8*1024*1024,'IndexedDB saves beyond localStorage-sized document');
  const client=createDiagramLibrarySaveClient(),library=createDiagramLibrary(browserPreferences,{backgroundSave:client.save});
  const entry=await library.saveAsync(createDiagramProject(blankDoc('Browser diagram',100,100)),{kind:'saved'});
  check(library.load(entry.id).states[0].doc.paper.width===100,'real worker commits complete diagram to IndexedDB');
  check(!!await browserRead('preference:'+entry.savedKey),'worker receipt follows actual database commit');await client.dispose();
  sessionStorage.setItem('web-regression-reopen',JSON.stringify({id,diagramId:entry.id}));
  const stale=browserPreferenceSnapshot();browserPreferences.setItem('zhezhi.test-conflict.v1',crypto.randomUUID());await flushBrowserPreferences();
  await rejects(()=>commitBrowserPreferences(stale,[['zhezhi.test-conflict.v1','older']]),'conflicting worker does not overwrite newer metadata','DIAGRAM_LIBRARY_CONFLICT');
  browserPreferences.setItem('zhezhi.test-retry.v1','ok');await flushBrowserPreferences();check(browserPreferences.getItem('zhezhi.test-retry.v1')==='ok','normal save remains available after conflict');
  await rejects(()=>browserRequest('design/compute','POST',{}),'native-only computation has explicit capability error','desktop_required');
  // Simulate a synchronous storage failure after the first staged put.
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){if(key==='preference:zhezhi.test-abort-second.v1')throw new DOMException('Injected quota failure','QuotaExceededError');return original.call(this,value,key!);};
  try{await rejects(()=>commitBrowserPreferences(browserPreferenceSnapshot(),[['zhezhi.test-abort-first.v1','partial'],['zhezhi.test-abort-second.v1','failure']]),'failed transaction never acknowledges a save');}
  finally{IDBObjectStore.prototype.put=original;}
  check(await browserRead('preference:zhezhi.test-abort-first.v1')===undefined,'transaction abort rolls back earlier payload writes');
  check((await browserRequest('projects/'+id+'?draft=1','GET')).doc.name==='草稿','unrelated saved project retained after storage failure');
 }
 document.getElementById('result')!.textContent=JSON.stringify({passed:true,checks},null,2);
}catch(error){document.getElementById('result')!.textContent=JSON.stringify({passed:false,checks,error:error instanceof Error?error.stack:String(error)},null,2);}
