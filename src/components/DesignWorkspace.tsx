import {useLibraryFileIdentity,type LaunchWorkspaceFile,type WorkspaceFile} from '../app/workspaceFileWindow';
import {forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import {api,safeName,saveDownload} from '../app/api';
import {BaseDesignLibrary,type BaseDesignEntry,type BaseDesignSummary} from '../app/baseDesignLibrary';
import {prepareBaseDesignFile} from '../app/baseDesignFile';
import {newBaseDesign,serializeBaseDesign,validateBaseDesign,designResultDocument,designBuildFeedback,TREE_CP_STATUS,type BaseDesignProject,type DesignKind,type DesignResult,type TreeDesign,type BoxDesign,type XY} from '../app/baseDesign';
import type {Doc} from '../core/types';
import {Icon,NumberField} from './Fields';
import {flushSync} from 'react-dom';
import DesignCanvas,{defaultDesignLayers,type DesignLayers} from './DesignCanvas';
import DesignObjectList from './DesignObjectList';
import {indexDesignGraph} from '../app/designCanvasRendering';
import {blankBaseDesign,addDesignNode,moveTreeNodes,splitTreeEdge,deleteTreeSelection,designNodes,designEdges,toggleDesignSelection,emptyDesignSelection,defaultDesignCamera,createDesignGestureQueue,type DesignCamera,type DesignEditCommand,type DesignSelection,type DesignView} from '../app/baseDesignInteraction';
import './design-workspace.css';

export interface DesignWorkspaceHandle {
 currentCP:()=>Doc|null;
 startFile:(file:WorkspaceFile)=>Promise<void>;
 open:()=>void;save:()=>void;export:()=>void;capture:()=>BaseDesignProject|null;
 checkpoint:()=>boolean;settle:()=>Promise<boolean>;ready:()=>Promise<void>;prepareRestore:(project:BaseDesignProject|null)=>(()=>void)|null;storageChanged:()=>void;
 undo:()=>void;redo:()=>void;library:()=>void;status:()=>{name:string|null;dirty:boolean;busy:boolean;present:boolean};
}
type Selection={node:number}|{edge:number};
type Props={launchFile?:LaunchWorkspaceFile;active:boolean;onAdopt:(doc:Doc)=>Promise<boolean>;onMessage:(message:string)=>void;onArtworkChange:()=>void};
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const names={tree:'树形基础形',box:'方格 / Box Pleating'};

export default forwardRef<DesignWorkspaceHandle,Props>(function DesignWorkspace({launchFile,active,onAdopt,onMessage,onArtworkChange},ref){
 const library=useMemo(()=>new BaseDesignLibrary(),[]),entry=useRef<BaseDesignEntry|null>(null);
 const [entries,setEntries]=useState<readonly BaseDesignSummary[]>([]),[project,setProject]=useState<BaseDesignProject|null>(null),current=useRef(project);current.current=project;
 useLibraryFileIdentity(launchFile?'design':null,entry.current?.id??null);
 const [failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),busyRef=useRef('');
 const [libraryLoading,setLibraryLoading]=useState(true),libraryTask=useRef<Promise<void>|null>(null),libraryRead=useRef(0),hasActivated=useRef(false);
 const [result,setResult]=useState<{source:BaseDesignProject;value:DesignResult}|null>(null),[selection,setSelection]=useState<Selection|null>(null),[view,setView]=useState<DesignView|'split'>('split');
 const [past,setPast]=useState<BaseDesignProject[]>([]),[future,setFuture]=useState<BaseDesignProject[]>([]);
 const [outputWidth,setOutputWidth]=useState(400),[savedText,setSavedText]=useState<string|null>(null);
 const [selected,setSelected]=useState<DesignSelection>(emptyDesignSelection),[canvasTool,setCanvasTool]=useState<'select'|'branch'>('select'),[branchLength,setBranchLength]=useState(3);
 const [cameras,setCameras]=useState<Record<DesignView,DesignCamera>>({tree:defaultDesignCamera(),packing:defaultDesignCamera(),cp:defaultDesignCamera()}),[layers,setLayers]=useState<DesignLayers>(defaultDesignLayers);
 const [gestureActive,setGestureActive]=useState(false),[gesturePreview,setGesturePreview]=useState<DesignResult|null>(null);
 const gestureSource=useRef<BaseDesignProject|null>(null),gestureQueue=useRef<ReturnType<typeof createDesignGestureQueue<DesignResult>>|null>(null);
 type TabState={entry:BaseDesignEntry;project:BaseDesignProject;savedText:string|null;dirty:boolean;past:BaseDesignProject[];future:BaseDesignProject[];result:typeof result;selected:DesignSelection;view:DesignView|'split';cameras:typeof cameras;tool:typeof canvasTool;branchLength:number;outputWidth:number};
 const tabCache=useRef(new Map<string,TabState>()),[tabs,setTabs]=useState<{id:string;name:string;kind:DesignKind}[]>([]);
 function rememberTab(){const record=entry.current,p=current.current;if(!record||!p)return;tabCache.current.set(record.id,{entry:record,project:p,savedText,dirty,past,future,result,selected,view,cameras,tool:canvasTool,branchLength,outputWidth});setTabs(items=>items.map(t=>t.id===record.id?{...t,name:p.name}:t));}
 function activateTab(id:string){if(busyRef.current||!checkpoint())return;try{const cached=tabCache.current.get(id),record=cached?.entry??library.get(id);if(record)activate(record.project,record);}catch(e){setFailure(message(e));}}
 function openEntry(item:BaseDesignSummary,local=false){try{if(launchFile&&!local){void launchFile({kind:'design-stored',item}).catch(e=>setFailure(message(e)));return;}const record=library.get(item.id);if(!record||record.revision!==item.revision)throw Error('此设计已变化，请刷新文档库后重试。');activate(record.project,record);}catch(e){setFailure(message(e));}}
 function closeTab(id:string){if(busyRef.current)return;const isCurrent=entry.current?.id===id&&!!current.current;if(isCurrent&&!checkpoint())return;
  if(isCurrent){const other=tabs.filter(t=>t.id!==id).at(-1),next=other?tabCache.current.get(other.id):null;activate(next?.project??null,next?.entry??null);}
  tabCache.current.delete(id);setTabs(items=>items.filter(t=>t.id!==id));
 }
 function copyDesign(){const p=current.current;if(!p||busyRef.current)return;try{const next={...p,name:p.name+' 副本'} as BaseDesignProject,record=library.write(next,null);activate(next,record);refresh();onMessage('已另存独立设计副本，原文档保留。');}catch(e){setFailure(message(e));}}
 const input=useRef<HTMLInputElement>(null),job=useRef<{controller:AbortController;cancelled:boolean;stopping?:Promise<void>}|null>(null),alive=useRef(true),fileRead=useRef<AbortController|null>(null);
 const pendingEdit=useRef<Promise<DesignResult|null>|null>(null),savingFile=useRef(false);
 const dirty=useMemo(()=>!!project&&serializeBaseDesign(project)!==savedText,[project,savedText]);
 const derived=result?.source===project?result.value:null;
 const cpOutput=useMemo(()=>{if(!project||!derived||gestureActive)return {doc:null,error:''};if(derived.kind==='tree'&&!derived.fold||derived.kind==='box'&&!derived.ready)return {doc:null,error:''};try{return {doc:designResultDocument(project,derived,outputWidth),error:''};}catch(e){return {doc:null,error:message(e)};}},[project,derived,outputWidth,gestureActive]);
 const cp=cpOutput.doc;
 function readyWorkspace(force=false):Promise<void>{
  if(libraryTask.current&&!force)return libraryTask.current;
  if(library.isReady()&&!force)return Promise.resolve();
  const ticket=++libraryRead.current;setLibraryLoading(true);
  const task=library.ready(force).then(()=>{if(alive.current&&ticket===libraryRead.current){setEntries(library.listSummaries());setLibraryLoading(false);setFailure('');}},error=>{if(alive.current&&ticket===libraryRead.current){setLibraryLoading(false);setFailure(message(error));}throw error;});
  libraryTask.current=task;void task.finally(()=>{if(libraryTask.current===task)libraryTask.current=null;}).catch(()=>{});return task;
 }
 function refresh(){if(!library.isReady()){void readyWorkspace().catch(()=>{});return;}try{setEntries(library.listSummaries());}catch(e){setFailure(message(e));}}
 function checkpoint(saved=false):boolean {
  const p=current.current;if(!p)return true;
  try{const text=serializeBaseDesign(p);if(!saved&&entry.current&&text===serializeBaseDesign(entry.current.project))return true;entry.current=library.write(p,entry.current,saved);setEntries(library.listSummaries());return true;}catch(e){setFailure(message(e));return false;}
 }
 function stop(){if(gestureSource.current){cancelGesture();setNotice('已取消拖动，原设计保留。');return;}const running=job.current;if(!running||running.stopping)return;running.cancelled=true;running.stopping=api('design/cancel',{}).then(()=>{},e=>{if(alive.current)setFailure('停止请求未确认：'+message(e));});running.controller.abort();}
 useEffect(()=>{alive.current=true;void readyWorkspace().catch(()=>{});return()=>{alive.current=false;fileRead.current?.abort();void gestureQueue.current?.cancel();const running=job.current;if(running){running.cancelled=true;running.controller.abort();void api('design/cancel',{}).catch(()=>{});}};},[]);
 useEffect(()=>{if(!project)return;const timer=setTimeout(()=>checkpoint(),600);return()=>clearTimeout(timer);},[project]);
 useEffect(()=>{if(!active)cancelGesture();else{const force=hasActivated.current&&!libraryTask.current;hasActivated.current=true;void readyWorkspace(force).catch(()=>{});}},[active]);
 useEffect(()=>{const hide=()=>{if(document.hidden)checkpoint();};const unload=(e:BeforeUnloadEvent)=>{if(window.desktop?.role==='document')return;const stored=checkpoint();if([...tabCache.current.values()].some(t=>t.entry.id!==entry.current?.id&&serializeBaseDesign(t.project)!==t.savedText)||current.current&&(!stored||dirty||busyRef.current)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);document.addEventListener('visibilitychange',hide);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',hide);};});
 function publish(next:BaseDesignProject,history=true){validateBaseDesign(next);if(entry.current)tabCache.current.delete(entry.current.id);const old=current.current;if(history&&old){setPast(items=>[...items,old]);setFuture([]);}current.current=next;setProject(next);setFailure('');setNotice('');onArtworkChange();}
 function activate(next:BaseDesignProject|null,record:BaseDesignEntry|null=null){rememberTab();const cached=record?tabCache.current.get(record.id):null;
  if(cached){current.current=cached.project;entry.current=cached.entry;setProject(cached.project);setSavedText(cached.savedText);setPast(cached.past);setFuture(cached.future);setResult(cached.result);setSelected(cached.selected);setSelection(cached.selected.nodes.length===1?{node:cached.selected.nodes[0]}:cached.selected.edges.length===1?{edge:cached.selected.edges[0]}:null);setView(cached.view);setCameras(cached.cameras);setCanvasTool(cached.tool);setBranchLength(cached.branchLength);setOutputWidth(cached.outputWidth);setFailure(record?.revision!==cached.entry.revision?'此设计已在另一窗口更新。本窗口内容已保留，可先另存设计副本。':'');setNotice('');onArtworkChange();return;}
  if(next&&record)setTabs(items=>[...items.filter(t=>t.id!==record.id),{id:record.id,name:next.name,kind:next.kind}]);
  current.current=next;entry.current=record;setProject(next);setSavedText(record?.saved??null);setPast([]);setFuture([]);setResult(null);clearSelected();setCameras({tree:defaultDesignCamera(),packing:defaultDesignCamera(),cp:defaultDesignCamera()});setView(next&&designNodes(next).length?'split':'tree');setCanvasTool(next&&designNodes(next).length?'select':'branch');setBranchLength(next?.kind==='tree'?1:3);setFailure('');setNotice('');onArtworkChange();}
 async function create(kind:DesignKind,example=false,local=false){if(busyRef.current)return;try{if(launchFile&&!local){await launchFile({kind:'design-new',design:kind,example});return;}await readyWorkspace();if(!checkpoint())return;const next=example?newBaseDesign(kind):blankBaseDesign(kind),record=library.write(next,null);activate(next,record);refresh();}catch(e){setFailure(message(e));}}
 function prepareRestore(next:BaseDesignProject|null){if(!library.isReady()){setFailure('设计文档库尚未读取完成，请稍后重试。');return null;}if(busyRef.current){setFailure('设计计算进行中，请先停止再打开完整作品。');return null;}fileRead.current?.abort();if(!checkpoint())return null;try{if(next)validateBaseDesign(next);const record=next?library.write(next,null):null;return ()=>{activate(next,record);refresh();};}catch(e){setFailure(message(e));return null;}}
 function history(direction:'undo'|'redo'){if(busyRef.current)return;const source=direction==='undo'?past:future,next=source.at(-1),old=current.current;if(!next||!old)return;if(direction==='undo'){setPast(source.slice(0,-1));setFuture(items=>[...items,old]);}else{setFuture(source.slice(0,-1));setPast(items=>[...items,old]);}publish(next,false);clearSelected();}
 async function compute(action:string,extra:Record<string,unknown>={},source=current.current):Promise<DesignResult|null>{
  if(busyRef.current)return null;
  const running:{controller:AbortController;cancelled:boolean;stopping?:Promise<void>}={controller:new AbortController(),cancelled:false};job.current=running;
  busyRef.current=action;setBusy(action);setFailure('');setNotice('');
  try{
   // An explicit signal keeps manual computations free of the API's default timeout.
   const answer=await api<DesignResult>('design/compute',{kind:source?.kind,action,project:source?.model,...extra},running.controller.signal);
   if(!alive.current||running.cancelled||job.current!==running||current.current!==source)return null;
   const next=validateBaseDesign({format:'zhezhi-base-design',version:1,name:source?.name??names[answer.kind],kind:answer.kind,model:answer.project});
   const changed=!source||serializeBaseDesign(next)!==serializeBaseDesign(source);
   if(changed)publish(next);const stable=changed?next:source!;
   if(action==='export')return answer;
   setResult({source:stable,value:answer});
   if(action==='build'){
    const feedback=designBuildFeedback(stable,answer,outputWidth);
    if(feedback.doc){setView('cp');setCanvasTool('select');setCameras(previous=>({...previous,cp:defaultDesignCamera()}));setNotice(feedback.message);}
    else setFailure(feedback.message);
   }else setNotice(answer.kind==='tree'?(answer.report?answer.report.converged?'优化已收敛。请生成折痕图。':'优化未收敛；当前结果可继续调整。':''):answer.ready?'':'布局已更新，请处理右侧提示后继续生成。');
   return answer;
  }catch(e){if(alive.current){if(running.cancelled)setNotice('已停止计算，保留开始计算前的工程。');else setFailure(message(e));}return null;}
  finally{await running.stopping;if(job.current===running){job.current=null;busyRef.current='';if(alive.current)setBusy('');}}
 }
 async function readFile(file:File,local=false){
  if(launchFile&&!local){try{await launchFile({kind:'file',file});}catch(error){setFailure(message(error));}return;}
  if(busyRef.current)return;
  fileRead.current?.abort();const controller=new AbortController();fileRead.current=controller;
  // Reading/importing is transactional: never replace a good editable source on failure.
  try{
   await readyWorkspace();controller.signal.throwIfAborted();if(busyRef.current||!checkpoint())return;
   const source=current.current;
   const stillCurrent=()=>{controller.signal.throwIfAborted();if(!alive.current)return false;if(current.current===source&&!busyRef.current)return true;onMessage('读取设计期间当前工程已变化或正在操作，原内容已保留；请重新打开文件。');return false;};
   const text=(await file.text()).replace(/^\uFEFF/,'');let next:BaseDesignProject;
   if(!stillCurrent())return;
   if(/\.tmd[45]?$/i.test(file.name)||/^\s*tree\s/i.test(text)){
    const value=await importNative('tree',text);if(!value)return;next=validateBaseDesign({format:'zhezhi-base-design',version:1,name:file.name.replace(/\.tmd[45]?$/i,''),kind:'tree',model:value.project});
   }else{
    const parsed=await prepareBaseDesignFile(text,controller.signal);if(!stillCurrent())return;
    if(parsed.type==='design')next=parsed.project;
    else {const value=await importNative('box',text);if(!value)return;next=validateBaseDesign({format:'zhezhi-base-design',version:1,name:value.kind==='box'?value.project.design.title||file.name:file.name,kind:'box',model:value.project});}
   }
   if(!stillCurrent())return;
   const record=library.write(next,null);activate(next,record);refresh();onMessage('设计工程已打开，原文档保留在设计文档库。');
  }catch(e){if(!controller.signal.aborted&&alive.current)setFailure(message(e));}
  finally{if(fileRead.current===controller)fileRead.current=null;}
 }
 async function importNative(kind:DesignKind,text:string){
  if(busyRef.current)return null;const running:{controller:AbortController;cancelled:boolean;stopping?:Promise<void>}={controller:new AbortController(),cancelled:false};job.current=running;busyRef.current='import';setBusy('import');setFailure('');
  try{return await api<DesignResult>('design/compute',{kind,action:'import',text},running.controller.signal).then(value=>running.cancelled?null:value);}
  catch(e){if(!running.cancelled)throw e;setNotice('已取消导入，原工程保留。');return null;}
  finally{await running.stopping;if(job.current===running){job.current=null;busyRef.current='';setBusy('');}}
 }
 async function open(){if(busyRef.current)return;try{await readyWorkspace();if(window.desktop?.openProject){const file=await window.desktop.openProject('design');if(file)await readFile(new File([file.bytes],file.name));}else input.current?.click();}catch(e){setFailure(message(e));}}
 async function save(){if(savingFile.current)return;savingFile.current=true;try{if(!await settleFields())return;const p=current.current;if(!p)return;const text=serializeBaseDesign(p),response=await saveDownload(new Blob([text],{type:'application/json'}),safeName(p.name)+'.design.json');if(response.status==='cancelled')return;if(current.current===p&&response.status==='saved'){setSavedText(text);checkpoint(true);}onMessage(response.status==='saved'?'基础形设计工程已保存。':'已发起设计工程下载；请确认浏览器下载结果。');}catch(e){setFailure(message(e));}finally{savingFile.current=false;}}
 async function exportNative(){const p=current.current;if(!p||busyRef.current)return;try{let text:string,extension:string;if(p.kind==='tree'){const answer=await compute('export');if(!answer||answer.kind!=='tree'||!answer.nativeFile)return;text=answer.nativeFile;extension='.tmd5';}else{text=JSON.stringify(p.model);extension='.bps';}const response=await saveDownload(new Blob([text],{type:'text/plain'}),safeName(p.name)+extension);if(response.status!=='cancelled')onMessage(response.status==='saved'?'设计源文件已保存。':'已发起源文件下载，请确认下载结果。');}catch(e){setFailure(message(e));}}
 async function exportCp(){if(!cp)return;try{const response=await saveDownload(new Blob([JSON.stringify(cp)],{type:'application/json'}),safeName(cp.name)+'.zhezhi.json');if(response.status!=='cancelled')onMessage(response.status==='saved'?'折痕工程副本已保存。':'已发起折痕工程下载，请确认下载结果。');}catch(e){setFailure(message(e));}}
 useImperativeHandle(ref,()=>({currentCP:()=>cp,startFile:async(file)=>{
  await readyWorkspace();
  if(file.kind==='design-new')await create(file.design,file.example,true);
  else if(file.kind==='design-stored'){openEntry(file.item,true);if(entry.current?.id!==file.item.id)await window.desktop?.documents?.setLibraryIdentity(null);}
  else if(file.kind==='file')await readFile(file.file,true);
 },open:()=>void open(),save:()=>void save(),export:()=>void exportNative(),capture:()=>current.current,checkpoint:()=>checkpoint(),settle:settleFields,ready:()=>readyWorkspace(),prepareRestore,storageChanged:()=>{void readyWorkspace(true).catch(()=>{});},undo:()=>history('undo'),redo:()=>history('redo'),library:()=>{if(!busyRef.current&&checkpoint())activate(null);},status:()=>({name:current.current?.name??null,present:!!current.current,dirty:dirty||[...tabCache.current.values()].some(item=>item.entry.id!==entry.current?.id&&item.dirty),busy:!!busyRef.current||savingFile.current||gestureActive})}));
 useEffect(()=>{if(!active)return;const key=(e:KeyboardEvent)=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=e.key.toLowerCase();if(!['s','o','z','y'].includes(k))return;if(['z','y'].includes(k)&&(e.target instanceof HTMLElement&&e.target.closest('input,textarea')))return;e.preventDefault();e.stopPropagation();if(k==='o')void open();else if(k==='s')void save();else history(k==='y'||e.shiftKey?'redo':'undo');};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active,project,past,future,busy]);
 function treeEdit(update:(m:TreeDesign)=>TreeDesign){const p=current.current;if(!p||p.kind!=='tree'||busyRef.current)return;try{publish({...p,model:update(p.model)});}catch(e){setFailure(message(e));}}
 function boxEdit(command:Record<string,unknown>){const task=compute('edit',{command});pendingEdit.current=task;void task.finally(()=>{if(pendingEdit.current===task)pendingEdit.current=null;});}
 async function settleFields(){try{await readyWorkspace();}catch{return false;}if(fileRead.current){onMessage('设计文件正在读取，请完成后再保存。');return false;}flushSync(()=>{if(document.activeElement instanceof HTMLElement&&document.activeElement.closest('.design-workspace'))document.activeElement.blur();});const pending=pendingEdit.current;if(pending&&!await pending)return false;if(busyRef.current){onMessage('当前设计正在计算或拖动，请完成或停止后再保存。');return false;}if(document.querySelector('.design-workspace [aria-invalid="true"]')){setFailure('请先修正参数框中的无效数值。');return false;}return true;}

 function applySelection(next:DesignSelection){if(!next.nodes.length&&!next.edges.length)setCanvasTool('select');setSelected(next);setSelection(next.nodes.length===1?{node:next.nodes[0]}:next.nodes.length===0&&next.edges.length===1?{edge:next.edges[0]}:null);}
 function clearSelected(){applySelection(emptyDesignSelection());}
 function select(id:number,type:'node'|'edge',extend=false){applySelection(toggleDesignSelection(selected,type,id,extend));}
 function gestureIdle(){gestureSource.current=null;gestureQueue.current=null;busyRef.current='';if(alive.current){setGestureActive(false);setGesturePreview(null);}}
 function beginGesture(){const source=current.current;if(!source||busyRef.current)return false;busyRef.current='gesture';gestureSource.current=source;setGestureActive(true);setFailure('');
  if(source.kind==='box')gestureQueue.current=createDesignGestureQueue<DesignResult>({
   request:(command,signal)=>api('design/compute',{kind:'box',action:'edit',project:source.model,command},signal),
   preview:value=>{if(alive.current&&current.current===source)setGesturePreview(value);},
   commit:value=>{if(!alive.current||current.current!==source)return;const next=validateBaseDesign({...source,model:value.project});const changed=serializeBaseDesign(next)!==serializeBaseDesign(source);if(changed)publish(next);setResult({source:changed?next:source,value});},
   error:e=>{if(alive.current)setFailure(message(e));},stop:()=>api('design/cancel',{}),idle:gestureIdle,
  });
  return true;
 }
 function previewGesture(command:DesignEditCommand){gestureQueue.current?.submit({...command,dragging:true});}
 function commitGesture(command:DesignEditCommand){const source=gestureSource.current;if(!source)return;
  if(source.kind==='tree'){try{if(current.current===source&&command.type==='moveNodes')publish({...source,model:moveTreeNodes(source.model,command.positions as {id:number;x:number;y:number}[])});}catch(e){setFailure(message(e));}finally{gestureIdle();}}
  else gestureQueue.current?.submit({...command,dragging:false},true);
 }
 function cancelGesture(){if(gestureQueue.current)void gestureQueue.current.cancel();else if(gestureSource.current)gestureIdle();}
 function addAt(point:XY){const p=current.current;if(!p||busyRef.current)return;try{const next=addDesignNode(p,selected.nodes.length===1?selected.nodes[0]:null,point,branchLength);publish(next);applySelection({nodes:[designNodes(next).at(-1)!.id],edges:[]});}catch(e){setFailure(message(e));}}
 function splitAt(id:number){const p=current.current;if(!p||busyRef.current)return;if(p.kind==='tree'){try{const next={...p,model:splitTreeEdge(p.model,id)};publish(next);applySelection({nodes:[next.model.nodes.at(-1)!.id],edges:[]});}catch(e){setFailure(message(e));}}else{const e=designEdges(p).find(e=>e.id===id);if(e)boxEdit({type:'splitEdge',n1:e.n1,n2:e.n2});}}
 function deleteSelected(){const p=current.current;if(!p||busyRef.current||!selected.nodes.length)return;try{if(p.kind==='tree')publish({...p,model:deleteTreeSelection(p.model,selected.nodes)});else if(selected.nodes.length===p.model.design.tree.nodes.length)publish({...p,model:{...(blankBaseDesign('box').model as BoxDesign),design:{...(blankBaseDesign('box').model as BoxDesign).design,title:p.name}}});else boxEdit({type:'removeLeaves',ids:selected.nodes});clearSelected();}catch(e){setFailure(message(e));}}
 function renameSelected(type:'node'|'edge'){requestAnimationFrame(()=>{const field=document.querySelector<HTMLInputElement>(type==='node'?'.design-node-name input':'input[aria-label="分支长度"]');field?.focus();field?.select();});}


 let tree=project?.kind==='tree'?project.model:null,box=project?.kind==='box'?(gesturePreview?.kind==='box'?gesturePreview.project:project.model):null;
 const selectedNode=selection&&'node'in selection?selection.node:null,selectedEdge=selection&&'edge'in selection?selection.edge:null;
 const nodes=useMemo(()=>tree?tree.nodes.map(n=>({id:n.id,name:n.label||`节点 ${n.id}`,...n.loc})):box?box.design.tree.nodes:[],[tree,box]);
 const edges=useMemo(()=>tree?tree.edges.map(e=>({id:e.id,n1:e.nodes[0],n2:e.nodes[1],length:e.length})):box?box.design.tree.edges.map((e,id)=>({...e,id})):[],[tree,box]);
 const graphIndex=useMemo(()=>indexDesignGraph(nodes,edges),[nodes,edges]),selectedNodes=useMemo(()=>new Set(selected.nodes),[selected.nodes]),selectedEdges=useMemo(()=>new Set(selected.edges),[selected.edges]);
 const node=nodes.find(n=>n.id===selectedNode),edge=edges.find(e=>e.id===selectedEdge),flap=box?.design.layout.flaps.find(f=>f.id===selectedNode);
 const canRemove=selected.nodes.length>0&&(selected.nodes.length===nodes.length||selected.nodes.some(id=>graphIndex.degree.get(id)===1));
 const sourceReady=!!cp&&!busy&&!gestureActive;
 return <section className="design-workspace" aria-label="基础形设计工作区" aria-busy={libraryLoading}>
  <input hidden ref={input} type="file" accept=".json,.tmd,.tmd4,.tmd5,.bps" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void readFile(file);}}/>
  {tabs.length>0&&<div className="design-tabs" role="tablist" aria-label="打开的基础形设计">{tabs.map(t=><div key={t.id} className="design-tab"><button role="tab" aria-selected={entry.current?.id===t.id&&!!project} disabled={!!busy||gestureActive} onClick={()=>activateTab(t.id)}><span>{entry.current?.id===t.id&&project?project.name:t.name}</span><small>{t.kind==='tree'?'树形':'方格'}</small></button><button aria-label={`关闭设计 ${t.name}`} disabled={!!busy||gestureActive} title="关闭标签，设计保留在文档库" onClick={()=>closeTab(t.id)}>×</button></div>)}<button disabled={!!busy||gestureActive} onClick={()=>{if(checkpoint()){activate(null);refresh();}}}>＋ 新建设计</button></div>}
  <header className="design-toolbar"><h1>基础形设计</h1>{project&&<><span className="design-kind">{names[project.kind]}</span><input aria-label="设计工程名称" disabled={!!busy||gestureActive} value={project.name} onChange={e=>{const name=e.target.value;if(name.trim())publish({...project,name,...(project.kind==='box'?{model:{...project.model,design:{...project.model.design,title:name}}}:{})} as BaseDesignProject);}}/><span className="muted small">{dirty?'未保存':'已保存'}</span></>}<span className="spacer"/>{project&&<button disabled={!!busy||gestureActive} onClick={()=>{if(checkpoint()){activate(null);refresh();}}}>设计文档</button>}<button disabled={!!busy||gestureActive} onClick={()=>void open()}><Icon name="folder"/>打开设计</button>{project&&<button className="primary" disabled={!!busy||gestureActive} onClick={()=>void save()}><Icon name="save"/>保存设计</button>}</header>
  {failure&&<div className="design-message error" role="alert"><span>{failure}</span>{project&&<button disabled={!!busy||gestureActive} onClick={copyDesign}>另存设计副本</button>}<button onClick={()=>setFailure('')} aria-label="关闭设计错误">×</button></div>}
  {!busy&&!failure&&notice&&<div className="design-message" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="关闭设计提示">×</button></div>}
  {libraryLoading&&<div className="design-message" role="status">正在读取设计文档…</div>}
  {busy&&<div className="design-message" role="status"><span>{busy==='import'?'正在导入设计…':busy==='build'?'正在生成折痕图…':busy.startsWith('optimize')?'正在优化基础形布局…':'正在计算设计…'}计算在本机完成。</span><button className="outline" onClick={stop}>停止计算</button></div>}
  {!project?<div className="design-library" inert={libraryLoading}><h2>从骨架设计基础形</h2><p>先确定纸瓣与分支长度，再安排纸张上的布局，生成折痕图。</p><div className="design-methods">
   <button onClick={()=>create('tree')}><svg viewBox="0 0 120 80" aria-hidden="true"><path d="M60 40 20 15M60 40 100 15M60 40 100 65M60 40 20 65"/>{[[20,15],[100,15],[100,65],[20,65]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="12"/>)}<circle cx="60" cy="40" r="4"/></svg><span><strong>树形基础形</strong><small>TreeMaker · 圆打包、路径约束与比例优化</small></span><span aria-hidden="true">→</span></button>
   <button onClick={()=>create('box')}><svg viewBox="0 0 120 80" aria-hidden="true"><path d="M25 5H95V75H25ZM25 25H95M25 45H95M25 65H95M45 5V75M65 5V75M85 5V75"/><path d="m25 25 20 20 20-20 30 30M45 45l-20 20M65 25 85 5"/></svg><span><strong>方格 / Box Pleating</strong><small>方格打包、矩形纸瓣与河道构造</small></span><span aria-hidden="true">→</span></button>
  </div><div className="design-samples"><span>从示例开始</span><button onClick={()=>create('tree',true)}>树形示例</button><button onClick={()=>create('box',true)}>方格示例</button></div><div className="design-library-heading"><h2>设计文档</h2><button onClick={()=>void readyWorkspace(true).catch(()=>{})}>刷新</button></div>{libraryLoading?null:entries.length?<table><thead><tr><th>工程</th><th>方法</th><th>最近暂存</th><th>操作</th></tr></thead><tbody>{entries.map(item=><tr key={item.id}><th><button onClick={()=>openEntry(item)}>{item.name}</button><small>{item.saved?'已保存文件':'含未保存草稿'}</small></th><td>{names[item.kind]}</td><td>{new Date(item.updated).toLocaleString('zh-CN')}</td><td><button onClick={()=>{if(!window.confirm(`删除设计文档「${item.name}」？已导出的文件不受影响。`))return;try{library.remove(item);refresh();}catch(e){setFailure(message(e));}}}>删除</button></td></tr>)}</tbody></table>:<p className="design-empty">还没有设计文档。选择上方方法新建，或打开 .design.json、TreeMaker、BPS 工程。</p>}</div>:<>
  <div className="design-actions"><button disabled={!!busy||gestureActive||!past.length} onClick={()=>history('undo')}><Icon name="undo"/>撤销</button><button disabled={!!busy||gestureActive||!future.length} onClick={()=>history('redo')}><Icon name="redo"/>重做</button><span className="design-separator"/><button disabled={!!busy||gestureActive} onClick={()=>void compute('optimize')}>优化布局</button>{tree&&<><button disabled={!!busy||gestureActive} onClick={()=>void compute('optimizeEdges')}>优化长度</button><button disabled={!!busy||gestureActive} onClick={()=>void compute('optimizeStrain')}>优化应变</button></>}<button className="primary" disabled={!!busy||gestureActive} onClick={()=>void compute('build')}>生成折痕图</button><span className="spacer"/><button disabled={!sourceReady} onClick={()=>void exportCp()}>导出 CP</button><button className="outline" disabled={!sourceReady} onClick={()=>{if(cp&&checkpoint())void onAdopt(cp);}}>送到折痕编辑 →</button></div>
  <div className="design-body">
   <aside className="design-structure" aria-label="设计骨架"><div className="design-section-heading"><h2>骨架节点</h2><span>{nodes.length}</span></div><p className="small muted">选择节点添加分支；拖动节点调整位置。</p><DesignObjectList className="design-node-list" label="骨架节点列表" items={nodes} selected={selectedNodes} onSelect={(id,event)=>select(id,'node',event.shiftKey||event.ctrlKey||event.metaKey)} describe={n=>`选择节点 N${n.id} ${n.name}`} render={n=><><span>{n.name||`节点 ${n.id}`}</span><small>N{n.id}</small></>}/><div className="button-pair"><button disabled={!!busy||gestureActive||!node} onClick={()=>{setCanvasTool('branch');if(view==='cp'||view==='packing')setView('tree');}}>延伸分支</button><button disabled={!!busy||gestureActive||!canRemove} onClick={deleteSelected}>删除叶节点</button></div>
    {node&&<fieldset disabled={!!busy||gestureActive}><legend>节点 N{node.id}</legend><DesignNameField key={node.id} value={tree?tree.nodes.find(n=>n.id===node.id)!.label:node.name} onCommit={name=>tree?treeEdit(m=>({...m,nodes:m.nodes.map(n=>n.id===node.id?{...n,label:name}:n)})):boxEdit({type:'renameNode',id:node.id,name})}/><NumberField label="节点 X" value={node.x} min={0} max={tree?tree.paper.width:null} step={tree ? .01 : 1} onChange={x=>tree?treeEdit(m=>({...m,nodes:m.nodes.map(n=>n.id===node.id?{...n,loc:{...n.loc,x}}:n)})):boxEdit({type:'moveNode',id:node.id,x,y:node.y})}/><NumberField label="节点 Y" value={node.y} min={0} max={tree?tree.paper.height:null} step={tree ? .01 : 1} onChange={y=>tree?treeEdit(m=>({...m,nodes:m.nodes.map(n=>n.id===node.id?{...n,loc:{...n.loc,y}}:n)})):boxEdit({type:'moveNode',id:node.id,x:node.x,y})}/>{tree&&<><label className="checkbox"><input type="checkbox" checked={tree.conditions.some(c=>c.type==='node_fixed'&&c.node===node.id)} onChange={e=>treeEdit(m=>({...m,conditions:[...m.conditions.filter(c=>!(c.type==='node_fixed'&&c.node===node.id)),...(e.target.checked?[{type:'node_fixed',node:node.id,x_fixed:true,y_fixed:true,x_fix_value:node.x,y_fix_value:node.y}]:[])]}))}/>固定此节点位置</label><button onClick={()=>treeEdit(m=>({...m,conditions:[...m.conditions.filter(c=>!(c.type==='node_on_edge'&&c.node===node.id)),{type:'node_on_edge',node:node.id}]}))}>约束到纸边</button><button onClick={()=>treeEdit(m=>({...m,conditions:m.conditions.filter(c=>!Object.entries(c).some(([key,value])=>/^node[123]?$/.test(key)&&value===node.id))}))}>清除此节点约束</button></>}</fieldset>}
    <h2>分支长度</h2><DesignObjectList className="design-edge-list" label="骨架分支列表" items={edges} selected={selectedEdges} onSelect={(id,event)=>select(id,'edge',event.shiftKey||event.ctrlKey||event.metaKey)} describe={e=>`选择分支 N${e.n1} 到 N${e.n2}`} render={e=><><span>N{e.n1} — N{e.n2}</span><small>{Number(e.length.toFixed(4))}</small></>}/>{edge&&<fieldset disabled={!!busy||gestureActive}><legend>分支 N{edge.n1} — N{edge.n2}</legend><NumberField label="分支长度" value={edge.length} min={tree ? .000001 : 1} max={null} step={tree ? .1 : 1} onChange={length=>tree?treeEdit(m=>({...m,edges:m.edges.map(e=>e.id===edge.id?{...e,length}:e)})):boxEdit({type:'edgeLength',n1:edge.n1,n2:edge.n2,length})}/>{box&&<button onClick={()=>boxEdit({type:'splitEdge',n1:edge.n1,n2:edge.n2})}>插入中间节点</button>}{tree&&<><NumberField label="分支应变" value={tree.edges.find(e=>e.id===edge.id)!.strain} min={-.999999} max={null} step={.01} onChange={strain=>treeEdit(m=>({...m,edges:m.edges.map(e=>e.id===edge.id?{...e,strain}:e)}))}/><NumberField label="分支刚度" value={tree.edges.find(e=>e.id===edge.id)!.stiffness} min={.000001} max={null} step={.1} onChange={stiffness=>treeEdit(m=>({...m,edges:m.edges.map(e=>e.id===edge.id?{...e,stiffness}:e)}))}/></>}</fieldset>}
   </aside>
   <div className="design-stage">
    <div className="design-viewbar"><div role="group" aria-label="设计视图">{(['split','tree','packing','cp'] as const).map(v=><button key={v} disabled={gestureActive} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='split'?'分屏':v==='tree'?'树形骨架':v==='packing'?'纸张布局':'折痕图'}</button>)}</div><details className="design-layer-menu"><summary>图层</summary><div>{(Object.keys(layers) as (keyof DesignLayers)[]).map(key=><label className="checkbox" key={key}><input type="checkbox" checked={layers[key]} onChange={e=>setLayers(value=>({...value,[key]:e.target.checked}))}/>{{labels:'名称与编号',lengths:'分支长度',grid:'网格',regions:'打包范围',rivers:'河道与折线'}[key]}</label>)}</div></details></div>
    <div className="design-draw-tools"><div role="group" aria-label="画布工具"><button aria-pressed={canvasTool==='select'} disabled={gestureActive} onClick={()=>setCanvasTool('select')}>选择</button><button aria-pressed={canvasTool==='branch'} disabled={gestureActive} onClick={()=>{setCanvasTool('branch');if(view==='cp'||view==='packing')setView('tree');}}>画分支</button></div>{canvasTool==='branch'?<NumberField label="新分支长度" value={branchLength} min={project.kind==='box'?1:.000001} max={null} step={project.kind==='box'?1:.1} disabled={!!busy||gestureActive} onChange={setBranchLength}/>:<span className="muted small">Shift 多选 · 滚轮缩放 · 空格 / 中键平移</span>}<span className="spacer"/><button className="design-selection-count" style={{visibility:selected.nodes.length+selected.edges.length?'visible':'hidden'}} disabled={gestureActive||!selected.nodes.length&&!selected.edges.length} onClick={clearSelected}>取消选择 · {selected.nodes.length+selected.edges.length}</button><button className="outline design-cancel-gesture" style={{visibility:gestureActive?'visible':'hidden'}} disabled={!gestureActive} onClick={stop}>取消拖动</button></div>
    <div className="design-viewports" data-layout={view==='split'?'split':'single'}>{(view==='split'?['tree','packing'] as DesignView[]:[view]).map(pane=><DesignCanvas key={pane} project={project} result={gesturePreview??derived} cp={cp} view={pane} selection={selected} camera={cameras[pane]} onCamera={camera=>setCameras(previous=>({...previous,[pane]:camera}))} layers={layers} tool={canvasTool} branchLength={branchLength} active={active} disabled={!!busy} gesturing={gestureActive} onSelect={select} onSelection={applySelection} onBegin={beginGesture} onPreview={previewGesture} onCommit={commitGesture} onCancel={cancelGesture} onAdd={addAt} onSplit={splitAt} onDelete={deleteSelected} onRename={renameSelected}/>)}</div>
   </div>
   <aside className="design-inspector" aria-label="基础形设计参数"><fieldset disabled={!!busy||gestureActive}><legend>纸张与布局</legend>{tree?<><NumberField label="纸张宽" value={tree.paper.width} min={.000001} max={null} step={.1} onChange={width=>treeEdit(m=>({...m,paper:{...m.paper,width}}))}/><NumberField label="纸张高" value={tree.paper.height} min={.000001} max={null} step={.1} onChange={height=>treeEdit(m=>({...m,paper:{...m.paper,height}}))}/><NumberField label="打包比例" value={tree.paper.scale} min={.000001} max={null} step={.01} onChange={scale=>treeEdit(m=>({...m,paper:{...m.paper,scale}}))}/><label className="checkbox"><input type="checkbox" checked={tree.paper.has_symmetry} onChange={e=>treeEdit(m=>({...m,paper:{...m.paper,has_symmetry:e.target.checked}}))}/>启用对称线</label>{tree.paper.has_symmetry&&<><NumberField label="对称线 X" value={tree.paper.sym_loc.x} min={-1e6} max={null} step={.1} onChange={x=>treeEdit(m=>({...m,paper:{...m.paper,sym_loc:{...m.paper.sym_loc,x}}}))}/><NumberField label="对称线 Y" value={tree.paper.sym_loc.y} min={-1e6} max={null} step={.1} onChange={y=>treeEdit(m=>({...m,paper:{...m.paper,sym_loc:{...m.paper.sym_loc,y}}}))}/><NumberField label="对称线角度" value={tree.paper.sym_angle} min={-360} max={360} onChange={sym_angle=>treeEdit(m=>({...m,paper:{...m.paper,sym_angle}}))}/></>}</>:box&&<><label className="design-text-field">网格<select value={box.design.layout.sheet.type} onChange={e=>boxEdit({type:'sheet',grid:e.target.value,width:box!.design.layout.sheet.width,height:box!.design.layout.sheet.height})}><option value="rect">矩形网格</option><option value="diag">对角网格</option></select></label><NumberField label="网格宽" value={box.design.layout.sheet.width} min={1} max={null} onChange={width=>boxEdit({type:'sheet',grid:box!.design.layout.sheet.type,width,height:box!.design.layout.sheet.height})}/><NumberField label="网格高" value={box.design.layout.sheet.height} min={1} max={null} onChange={height=>boxEdit({type:'sheet',grid:box!.design.layout.sheet.type,width:box!.design.layout.sheet.width,height})}/><div className="button-pair"><button onClick={()=>boxEdit({type:'rotate',clockwise:true})}>旋转布局</button><button onClick={()=>boxEdit({type:'flip',horizontal:true})}>镜像布局</button></div><button onClick={()=>void compute('optimize',{random:true})}>重新搜索布局</button></>}</fieldset>
    {flap&&box&&<fieldset disabled={!!busy||gestureActive}><legend>纸瓣 N{flap.id}</legend><NumberField label="纸瓣 X" value={flap.x} min={0} max={null} onChange={x=>boxEdit({type:'moveFlap',id:flap.id,x,y:flap.y})}/><NumberField label="纸瓣 Y" value={flap.y} min={0} max={null} onChange={y=>boxEdit({type:'moveFlap',id:flap.id,x:flap.x,y})}/><NumberField label="纸瓣宽" value={flap.width} min={0} max={null} onChange={width=>boxEdit({type:'resizeFlap',id:flap.id,width,height:flap.height})}/><NumberField label="纸瓣高" value={flap.height} min={0} max={null} onChange={height=>boxEdit({type:'resizeFlap',id:flap.id,width:flap.width,height})}/></fieldset>}
    {derived?.kind==='box'&&derived.graphics.stretches.length>0&&<section><h2>河道图案</h2>{derived.graphics.stretches.map(s=><div className="design-stretch" key={s.id}><strong>纸瓣 {s.flapIds?.join(' / ')??s.id}</strong><small>{s.patternFound?`构型 ${s.configurationIndex+1}/${s.configurationCount} · 图案 ${s.patternIndex+1}/${s.patternCount}`:'未找到图案，请调整纸瓣位置或分支长度'}</small><div className="button-pair"><button disabled={!!busy||gestureActive||s.configurationCount<2} onClick={()=>boxEdit({type:'stretchConfig',id:s.id,delta:1})}>切换构型</button><button disabled={!!busy||gestureActive||s.patternCount<2} onClick={()=>boxEdit({type:'stretchPattern',id:s.id,delta:1})}>切换图案</button></div></div>)}</section>}
    <section className="design-result" aria-live="polite"><h2>计算结果</h2>{gestureActive?<p className="muted">拖动预览尚未提交，松开后更新设计。Esc 取消本次操作。</p>:!derived?<p className="muted">{result?'设计已修改，请重新生成折痕图。':'先优化布局，再生成折痕图。'}</p>:derived.kind==='tree'?<><p>{TREE_CP_STATUS[derived.snapshot.cp_status_report.status]??'尚未完成构造'}</p><dl><dt>路径约束</dt><dd>{derived.snapshot.summary.is_feasible?'满足':'尚未满足'}</dd><dt>叶节点</dt><dd>{derived.snapshot.summary.leaf_nodes}</dd><dt>活动路径</dt><dd>{derived.snapshot.summary.active_paths} / {derived.snapshot.summary.leaf_paths}</dd></dl>{derived.report&&!derived.report.converged&&<p className="warning">优化器未收敛，可调整节点或长度后重试。</p>}</>:<><p>{derived.ready?'完整折痕图已生成':derived.packingError?'布局未满足打包约束':derived.graphics.patternNotFound?'部分河道未找到图案':'存在未解决的纸瓣交汇'}</p>{derived.packingError&&<p className="small warning">{derived.packingError}</p>}{derived.graphics.invalidJunctions.map(j=><p key={j.id} className="warning">纸瓣 N{j.flapIds[0]} / N{j.flapIds[1]} 的交汇需要调整。</p>)}</>}{notice&&<p>{notice}</p>}{cpOutput.error&&<p className="warning" role="alert">折痕图未通过编辑区校验：{cpOutput.error}</p>}{cp&&<p>{cp.segments.length} 条折痕与边界，可导出或送到折痕编辑。</p>}</section>
    <section><h2>输出尺寸</h2><NumberField label="CP 纸张宽" value={outputWidth} min={.001} max={null} step={10} suffix="mm" onChange={setOutputWidth}/><button disabled={!!busy||gestureActive} onClick={()=>void exportNative()}>导出 {tree?'TreeMaker .tmd5':'BPS .bps'} 源文件</button><p className="small muted">生成的 CP 可继续编辑和模拟；布局构造不等于已验证连续折叠路径。</p></section>
   </aside>
  </div></>}
 </section>;
});

/** Keep text editing local until blur; one rename is one cancellable engine edit. */
function DesignNameField({value,onCommit}:{value:string;onCommit:(value:string)=>void}){
 const [draft,setDraft]=useState(value);
 useEffect(()=>setDraft(value),[value]);
 return <label className="design-text-field design-node-name">名称<input value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)onCommit(draft);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(value);}}}/></label>;
}
