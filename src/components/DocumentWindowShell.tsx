import {useCallback,useEffect,useLayoutEffect,useRef,useState,type DragEvent,type MouseEvent} from 'react';
import type {DesktopDocumentBounds,DesktopDocumentCommand,DesktopDocumentMenuItem,DesktopDocumentSnapshot} from '../desktop';
import {activateLayoutDocument,createDocumentWindowLayout,documentGroups,moveLayoutDocument,reconcileDocumentWindowLayout,type DocumentGroup,type DocumentWindowLayout} from '../app/documentWindowLayout';
import {readTheme,THEME_KEY} from '../app/theme';
import {preferenceStorage} from '../app/preferenceStorage';
import WindowControls,{handleDesktopTitlebarMouseDown} from './WindowControls';
import {ChromeIcon} from './HeaderMenu';
import './DocumentWindowShell.css';

const workspaceNames={edit:'折痕编辑',design:'基础形设计',tess:'镶嵌设计',sim:'三维模拟',diagram:'折序绘图'};
const dragType='application/x-zhezhi-document';
type MenuKind='file'|'edit'|'workspace';
interface DraggedDocument {id:string;windowId:string}
const message=(cause:unknown)=>cause instanceof Error?cause.message:String(cause);
const workspaceFiles={edit:'折痕',design:'设计',tess:'折痕',sim:'折痕',diagram:'折序'};
function TabGlyph({kind}:{kind:'close'|'plus'|'more'}){
 const paths={close:'m5 5 10 10M15 5 5 15',plus:'M10 4v12M4 10h12',more:'m5 8 5 5 5-5'};
 return <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]}/></svg>;
}

/** Native child Webviews own the documents. This component only owns chrome and layout. */
export default function DocumentWindowShell(){
 const service=window.desktop?.documents;
 const [snapshot,setSnapshot]=useState<DesktopDocumentSnapshot|null>(null),[layout,setLayout]=useState<DocumentWindowLayout>(()=>createDocumentWindowLayout());
 const [failure,setFailure]=useState(''),[working,setWorking]=useState(false),[draggedId,setDraggedId]=useState<string|null>(null),[fallbackMenu,setFallbackMenu]=useState<{kind:MenuKind;items:DesktopDocumentMenuItem[];x:number;y:number}|null>(null);
 const [dropSlot,setDropSlot]=useState<{id:string;after:boolean}|null>(null);
 const snapshotRef=useRef(snapshot),layoutRef=useRef(layout),stage=useRef<HTMLDivElement>(null),paneElements=useRef(new Map<string,HTMLDivElement>()),disposed=useRef(false);
 const pendingBounds=useRef<DesktopDocumentBounds[]|null>(null),sendingBounds=useRef(false),lastBounds=useRef(''),dragged=useRef<(DraggedDocument&{handled:boolean})|null>(null);
 const tabButtons=useRef(new Map<string,HTMLButtonElement>());
 const clearDragHints=useCallback(()=>{setDraggedId(null);setDropSlot(null);},[]);
 useEffect(()=>{
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')clearDragHints();};
  window.addEventListener('dragend',clearDragHints);window.addEventListener('drop',clearDragHints);window.addEventListener('pointerdown',clearDragHints);window.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('dragend',clearDragHints);window.removeEventListener('drop',clearDragHints);window.removeEventListener('pointerdown',clearDragHints);window.removeEventListener('keydown',escape);};
 },[clearDragHints]);
 snapshotRef.current=snapshot;layoutRef.current=layout;
 useLayoutEffect(()=>{document.documentElement.dataset.theme=readTheme();const update=()=>{void preferenceStorage.getItemAsync(THEME_KEY).then(()=>{if(!disposed.current)document.documentElement.dataset.theme=readTheme();}).catch(()=>{});};window.addEventListener('focus',update);return()=>window.removeEventListener('focus',update);},[]);
 const ingest=useCallback((value:DesktopDocumentSnapshot)=>{
  if(disposed.current)return;
  const prior=snapshotRef.current;if(prior&&value.windowId===prior.windowId&&value.revision<prior.revision)return;
  snapshotRef.current=value;setSnapshot(value);
  const owner=value.windows.find(item=>item.id===value.windowId),owned=value.documents.filter(item=>!item.home&&item.windowId===value.windowId).map(item=>item.id);
  setLayout(before=>reconcileDocumentWindowLayout(before,owner?.documentIds.filter(id=>owned.includes(id))??owned,owner?.activeId));
 },[]);
 const refresh=useCallback(async()=>{if(!service)return null;const value=await service.list();ingest(value);return value;},[service,ingest]);
 const run=useCallback(async(action:()=>Promise<unknown>)=>{setFailure('');setWorking(true);try{return await action();}catch(cause){setFailure(message(cause));return undefined;}finally{if(!disposed.current)setWorking(false);}},[]);
 useEffect(()=>{
  disposed.current=false;if(!service)return;
  const off=service.subscribe(ingest);
  void service.list().then(ingest).catch(cause=>{if(!disposed.current)setFailure(message(cause));});
  return()=>{disposed.current=true;off();};
 },[service,ingest,refresh]);

 const ownViews=snapshot?.documents.filter(item=>item.windowId===snapshot.windowId)??[];
 const home=ownViews.find(item=>item.home),ownDocuments=ownViews.filter(item=>!item.home),documents=new Map((snapshot?.documents??[]).map(item=>[item.id,item]));
 const active=documents.get(layout.activeId??'');
 const command=useCallback(async(value:DesktopDocumentCommand,id=layoutRef.current.activeId??home?.id)=>{
  if(!service||!id)throw Error('请先新建或选择作品。');
  if(id===home?.id&&!['new','open','settings','library'].includes(value)&&!value.startsWith('workspace:'))return;
  await service.sendCommand(id,value);
 },[service,home?.id]);
 const activate=useCallback(async(id:string)=>{if(!service)return;setLayout(value=>activateLayoutDocument(value,id));try{await service.activate(id);}catch(cause){setFailure(message(cause));await refresh().catch(()=>{});}},[service,refresh]);
 const create=()=>run(()=>command('new'));
 const selectedTabs=documentGroups(layout.root).map(group=>group.selectedId).join(',');
 useLayoutEffect(()=>{for(const group of documentGroups(layoutRef.current.root)){if(group.selectedId)tabButtons.current.get(group.selectedId)?.closest<HTMLElement>('[data-document-tab]')?.scrollIntoView({block:'nearest',inline:'nearest'});}},[selectedTabs]);

 const sendBounds=useCallback(async()=>{
  if(!service||sendingBounds.current)return;sendingBounds.current=true;
  try{while(pendingBounds.current&&!disposed.current){
   const rects=pendingBounds.current;pendingBounds.current=null;const signature=JSON.stringify(rects);if(signature===lastBounds.current)continue;
   try{await service.setBounds(rects);lastBounds.current=signature;}
   catch(cause){
    let obsolete=false;
    try{const latest=await service.list();const owned=new Set(latest.documents.filter(item=>item.windowId===latest.windowId).map(item=>item.id));obsolete=rects.some(rect=>!owned.has(rect.id));ingest(latest);}catch{/* Keep the original layout error when ownership cannot be checked. */}
    if(obsolete)lastBounds.current='';else if(!disposed.current)setFailure('作品视图布局未更新：'+message(cause));
   }
  }}
  finally{sendingBounds.current=false;}
 },[service,ingest]);
 const measure=useCallback(()=>{
  const current=snapshotRef.current;if(!service||!current)return;
  for(const group of documentGroups(layoutRef.current.root)){if(group.selectedId)tabButtons.current.get(group.selectedId)?.closest<HTMLElement>('[data-document-tab]')?.scrollIntoView({block:'nearest',inline:'nearest'});}
  const rectangles=new Map<string,DOMRect>();for(const group of documentGroups(layoutRef.current.root)){const element=paneElements.current.get(group.id);const id=element?.dataset.nativeDocument;if(element&&id)rectangles.set(id,element.getBoundingClientRect());}
  pendingBounds.current=current.documents.filter(item=>item.windowId===current.windowId).map(({id})=>{
   const box=rectangles.get(id);
   // A hidden native view keeps its last size. Zero dimensions skip the native resize.
   if(!box||box.width<1||box.height<1)return {id,x:0,y:0,width:0,height:0,visible:false};
   return {id,x:box.x,y:box.y,width:box.width,height:box.height,visible:true};
  });
  void sendBounds();
 },[service,sendBounds]);
 const ownership=ownViews.map(item=>item.id).join(',');
 useLayoutEffect(()=>{
  let request=0;const update=()=>{cancelAnimationFrame(request);request=requestAnimationFrame(measure);};
  const observer=new ResizeObserver(update);if(stage.current)observer.observe(stage.current);for(const element of paneElements.current.values())observer.observe(element);
  window.addEventListener('resize',update);update();
  return()=>{observer.disconnect();window.removeEventListener('resize',update);cancelAnimationFrame(request);};
 },[layout,ownership,measure]);
 useEffect(()=>{document.title=active?`${active.title||'未命名作品'} · 折纸工坊`:'折纸工坊';},[active?.title]);

 async function act(id:string){
  setFallbackMenu(null);
  if(id==='new'){await create();return;}
  if(id==='open'||id==='workspace-open'){await command('open');return;}
  if(id==='close'){if(active)await service?.close(active.id);await refresh();return;}
  if(id==='close-window'){await window.desktop?.window?.close();return;}
  await command(id as DesktopDocumentCommand);
 }
 function menuItems(kind:MenuKind):DesktopDocumentMenuItem[]{
  const enabled=!!active?.ready,editable=enabled&&!active?.busy&&!active?.saving;
  if(kind==='file')return[{id:'new',label:'新建作品\tCtrl+N'},{id:'open',label:'打开作品…\tCtrl+O',enabled:!!service},{id:'save-artwork',label:'保存完整作品…\tCtrl+S',enabled:editable},{id:'file-workspace-separator',label:'',separator:true},{id:'workspace-open',label:`打开${workspaceFiles[active?.workspace??'edit']}工程…`,enabled:editable},{id:'save',label:`保存${workspaceFiles[active?.workspace??'edit']}工程`,enabled:editable},{id:'export',label:'导出当前工作区…',enabled:editable},{id:'print',label:(active?.workspace==='diagram'?'打印折序…':'打印折痕图…')+'\tCtrl+P',enabled:editable&&active?.workspace!=='design'},{id:'file-separator',label:'',separator:true},{id:'library',label:'打开文档库',enabled:editable},{id:'artwork-overview',label:'作品总览与恢复副本',enabled},{id:'settings',label:'工作区选项…',enabled},{id:'file-close-separator',label:'',separator:true},{id:'close',label:'关闭当前作品\tCtrl+W',enabled:!!active},{id:'close-window',label:'关闭窗口'}];
  if(kind==='edit')return[{id:'undo',label:'撤销\tCtrl+Z',enabled:editable},{id:'redo',label:'重做\tCtrl+Shift+Z',enabled:editable}];
  if(kind==='workspace')return (Object.keys(workspaceNames) as (keyof typeof workspaceNames)[]).map(value=>({id:'workspace:'+value,label:workspaceNames[value],checked:active?.workspace===value,enabled:!!(active??home)?.ready}));
  return [];
 }
 async function openMenu(kind:MenuKind,event:MouseEvent<HTMLButtonElement>){
  const box=event.currentTarget.getBoundingClientRect(),items=menuItems(kind);
  if(service){await run(async()=>{const selected=await service.popupMenu(items,{x:box.left,y:box.bottom});if(selected)await act(selected);});}
  else setFallbackMenu(value=>value?.kind===kind?null:{kind,items,x:box.left,y:box.bottom});
 }
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.repeat||event.isComposing||event.altKey||!(event.ctrlKey||event.metaKey))return;
   const target=event.target as HTMLElement|null;if(target?.closest('input,textarea,select,[contenteditable=true]'))return;
   const value=event.key.toLowerCase();let action:string|undefined;
   if(value==='n')action='new';else if(value==='w')action='close';else if(value==='s')action='save-artwork';else if(value==='o')action='open';else if(value==='z')action=event.shiftKey?'redo':'undo';else if(value==='y')action='redo';
   if(action){event.preventDefault();void run(()=>act(action!));}
  };
  window.addEventListener('keydown',key);
  const off=window.desktop?.onCommand(value=>{if(value==='open'){void run(()=>act('open'));return;}if(value==='save'){void run(()=>command('save-artwork'));return;}if(value==='print'){void run(()=>command('print'));return;}void run(()=>command(value));});
  return()=>{window.removeEventListener('keydown',key);off?.();};
 });
 useEffect(()=>{if(!fallbackMenu)return;const close=()=>setFallbackMenu(null),escape=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};window.addEventListener('pointerdown',close);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',escape);};},[fallbackMenu]);

 function dragStart(event:DragEvent,id:string){const item=documents.get(id);if(!item)return;const value={id,windowId:item.windowId};dragged.current={...value,handled:false};setDraggedId(id);event.dataTransfer.setData(dragType,JSON.stringify(value));event.dataTransfer.setData('text/plain',id);event.dataTransfer.effectAllowed='move';}
 function dragValue(event:DragEvent):DraggedDocument|null {try{const value=JSON.parse(event.dataTransfer.getData(dragType));return typeof value?.id==='string'&&typeof value.windowId==='string'?value:null;}catch{return null;}}
 function dragOver(event:DragEvent){if(!event.dataTransfer.types.includes(dragType))return;event.preventDefault();event.dataTransfer.dropEffect='move';if(!draggedId)setDraggedId(dragged.current?.id??'external');}
 async function drop(event:DragEvent,groupId:string,index?:number){
  const value=dragValue(event);if(!value||!service)return;
  event.preventDefault();event.stopPropagation();clearDragHints();
  if(value.windowId!==snapshotRef.current?.windowId)return;
  setLayout(current=>moveLayoutDocument(current,value.id,groupId,index));
  await activate(value.id);
 }
 function dragEnd(){dragged.current=null;clearDragHints();}
 async function closeTab(id:string){
  if(!service)return false;
  const before=layoutRef.current,group=documentGroups(before.root).find(group=>group.documentIds.includes(id)),index=group?.documentIds.indexOf(id)??-1;
  const adjacent=group?.documentIds[index+1]??group?.documentIds[index-1],selected=group?.selectedId===id,active=before.activeId===id;
  await service.close(id);const latest=await refresh();if(latest?.documents.some(item=>item.id===id))return false;
  if(selected&&adjacent&&latest?.documents.some(item=>item.id===adjacent&&item.windowId===latest.windowId)){
   setLayout(current=>{const next=activateLayoutDocument(current,adjacent);return active?next:{...next,activeId:current.activeId};});
   if(active)await service.activate(adjacent);
  }
  return true;
 }
 async function tabAction(action:string,id:string){
  if(!service)return;
  const current=snapshotRef.current,item=current?.documents.find(item=>item.id===id&&item.windowId===current.windowId);if(!item)return;
  if(action==='tab-close'){await closeTab(id);return;}
  if(action==='tab-close-others'||action==='tab-close-right'){
   const group=documentGroups(layoutRef.current.root).find(group=>group.documentIds.includes(id));
   const ids=action==='tab-close-right'?group?.documentIds.slice(group.documentIds.indexOf(id)+1)??[]:current!.documents.filter(other=>!other.home&&other.windowId===current!.windowId&&other.id!==id).map(other=>other.id);
   for(const other of ids)if(!await closeTab(other))break;
   return;
  }
  if(action==='tab-options'){await activate(id);await command('settings',id);return;}
  if(action==='tab-save')await command('save-artwork',id);
 }
 async function tabContext(event:MouseEvent,id:string){
  event.preventDefault();event.stopPropagation();if(!service||working)return;
  const current=snapshotRef.current,item=current?.documents.find(item=>item.id===id);if(!item)return;
  const group=documentGroups(layoutRef.current.root).find(group=>group.documentIds.includes(id));
  const items:DesktopDocumentMenuItem[]=[{id:'tab-save',label:'保存完整作品',enabled:item.ready&&!item.busy&&!item.saving},{id:'tab-options',label:'工作区选项…',enabled:item.ready},{id:'tab-close-separator',label:'',separator:true},{id:'tab-close',label:'关闭作品'},{id:'tab-close-others',label:'关闭其他作品',enabled:ownDocuments.length>1},{id:'tab-close-right',label:'关闭右侧作品',enabled:!!group&&group.documentIds.indexOf(id)<group.documentIds.length-1}];
  const box=event.currentTarget.getBoundingClientRect();await run(async()=>{const selected=await service.popupMenu(items,{x:event.clientX||box.left+8,y:event.clientY||box.bottom});if(selected)await tabAction(selected,id);});
 }
 async function showTabList(event:MouseEvent<HTMLButtonElement>,group:DocumentGroup){
  if(!service)return;const box=event.currentTarget.getBoundingClientRect();
  await run(async()=>{let page=0;while(true){const ids=group.documentIds.slice(page*96,(page+1)*96);const items:DesktopDocumentMenuItem[]=ids.map(id=>({id:'select:'+id,label:(documents.get(id)?.title||'未命名作品').slice(0,100)+(documents.get(id)?.dirty?' · 未保存':''),checked:id===group.selectedId}));if(group.documentIds.length>96)items.push({id:'page-separator',label:'',separator:true},{id:'page-prev',label:'上一页',enabled:page>0},{id:'page-next',label:'下一页',enabled:(page+1)*96<group.documentIds.length});const selected=await service.popupMenu(items,{x:Math.max(0,box.right-220),y:box.bottom});if(selected==='page-prev'){page--;continue;}if(selected==='page-next'){page++;continue;}if(selected?.startsWith('select:'))await activate(selected.slice(7));break;}});
 }
 async function focusTab(id:string){await activate(id);window.focus();requestAnimationFrame(()=>tabButtons.current.get(id)?.focus({preventScroll:true}));}
 function groupView(group:DocumentGroup){
  const selected=documents.get(group.selectedId??'')??home,isActive=!!group.documentIds.includes(layout.activeId??'');
  return <section className="document-window-pane" data-active={isActive} data-group-id={group.id} aria-label={selected?.title||'作品组'}>
   {group.documentIds.length>0&&<div className="document-pane-heading" onDragOver={dragOver} onDragLeave={event=>{const box=event.currentTarget.getBoundingClientRect();if(event.clientX<=box.left||event.clientX>=box.right||event.clientY<=box.top||event.clientY>=box.bottom)clearDragHints();}} onDrop={event=>void drop(event,group.id)}>
    <div className="document-pane-tabs" role="tablist" aria-label="作品标签" onWheel={event=>{if(Math.abs(event.deltaY)>Math.abs(event.deltaX))event.currentTarget.scrollLeft+=event.deltaY;}} onDragOverCapture={event=>{if(!event.dataTransfer.types.includes(dragType))return;const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left+24)event.currentTarget.scrollLeft-=10;else if(event.clientX>box.right-24)event.currentTarget.scrollLeft+=10;}}>
     {group.documentIds.map((id,index)=>{const item=documents.get(id);if(!item)return null;return <div className="document-window-tab" key={id} draggable onDragStart={event=>{if((event.target as HTMLElement).closest('.document-tab-close')){event.preventDefault();return;}dragStart(event,id);}} onDragEnd={dragEnd} onDragOver={event=>{dragOver(event);if(!event.dataTransfer.types.includes(dragType))return;event.stopPropagation();const box=event.currentTarget.getBoundingClientRect(),after=event.clientX>box.x+box.width/2;setDropSlot(before=>before?.id===id&&before.after===after?before:{id,after});}} onDrop={event=>{const box=event.currentTarget.getBoundingClientRect();void drop(event,group.id,index+(event.clientX>box.x+box.width/2?1:0));}} onContextMenu={event=>void tabContext(event,id)} onAuxClick={event=>{if(event.button===1){event.preventDefault();void run(()=>closeTab(id));}}} onPointerDown={event=>{if(event.button===1)event.preventDefault();}} data-selected={group.selectedId===id} data-active={layout.activeId===id} data-document-tab={id} data-dragging={draggedId===id} data-drop={dropSlot?.id===id?(dropSlot.after?'after':'before'):undefined}>
      <button type="button" role="tab" tabIndex={group.selectedId===id?0:-1} aria-selected={group.selectedId===id} ref={element=>{if(element)tabButtons.current.set(id,element);else tabButtons.current.delete(id);}} title={`${item.title}${item.dirty?' · 未保存':''} · 双击打开工作区选项`} onClick={()=>void activate(id)} onDoubleClick={()=>void run(()=>tabAction('tab-options',id))} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?group.documentIds.length-1:(index+(event.key==='ArrowRight'?1:-1)+group.documentIds.length)%group.documentIds.length;void focusTab(group.documentIds[next]);}}><ChromeIcon name={item.workspace}/><span className="document-tab-title">{item.title||'未命名作品'}</span><span className="document-tab-mark" data-dirty={item.dirty} data-busy={item.busy||item.saving} aria-label={item.saving?'保存中':item.busy?'正在处理':item.dirty?'未保存':undefined}/></button>
      <button type="button" className="document-tab-close" tabIndex={group.selectedId===id?0:-1} draggable={false} title={'关闭作品：'+item.title} aria-label={'关闭作品：'+item.title} onClick={()=>void run(()=>closeTab(id))}><TabGlyph kind="close"/></button>
     </div>;})}
    </div>
    <div className="document-pane-tools"><button type="button" className="document-pane-add" disabled={!service||working} onClick={()=>void create()} title="新建作品（Ctrl+N）" aria-label="新建作品"><TabGlyph kind="plus"/></button><button type="button" className="document-pane-list" disabled={working} onClick={event=>void showTabList(event,group)} title={`窗口内 ${group.documentIds.length} 个作品`} aria-label="作品列表" aria-haspopup="menu"><TabGlyph kind="more"/></button></div>
   </div>}
   <div className="document-native-view-slot" ref={element=>{if(element)paneElements.current.set(group.id,element);else paneElements.current.delete(group.id);}} data-native-document={selected?.id??''} onPointerDown={()=>{if(group.selectedId)void activate(group.selectedId);}}>{selected&&!selected.ready&&<div className="document-view-wait" role="status">正在打开{selected.title?'“'+selected.title+'”':'作品'}…</div>}</div>
  </section>;
 }
 return <div className="document-window-shell" data-window-id={snapshot?.windowId??''}>
  <header className="document-window-header" onMouseDown={handleDesktopTitlebarMouseDown}>
   <div className="document-window-brand"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M3 3h22v22H3ZM3 3l22 22M25 3 3 25M14 3v22"/></svg><span>折纸工坊</span></div>
   <nav className="document-window-menus" aria-label="应用菜单" data-no-window-drag>{(['file','edit','workspace'] as MenuKind[]).map((kind,index)=><button type="button" key={kind} onClick={event=>void openMenu(kind,event)} aria-haspopup="menu" disabled={working}>{['文件','编辑',active?workspaceNames[active.workspace]:'工作区'][index]}{kind==='workspace'&&<ChromeIcon name="down"/>}</button>)}</nav>
   <div className="document-window-drag-space" aria-hidden="true"/>
   <div className="document-window-actions" data-no-window-drag>
    <button type="button" title="打开作品（Ctrl+O）" aria-label="打开作品" onClick={()=>void run(()=>act('open'))} disabled={!service||working}>打开</button>
    <button type="button" className="primary" onClick={()=>void run(()=>command('save-artwork'))} disabled={!active?.ready||active?.saving||active?.busy||working}>{active?.saving?'保存中…':'保存作品'}</button>
    <button type="button" className="document-options-button" aria-label="工作区选项" title="工作区选项、帮助与工程信息" disabled={!active?.ready||working} onClick={()=>void run(()=>command('settings'))}><ChromeIcon name="settings"/></button>
   </div>
   <WindowControls onError={setFailure}/>
  </header>
  <main className="document-window-stage" ref={stage} onDragOver={dragOver} onDragLeave={event=>{if(!event.relatedTarget&&!dragged.current)setDraggedId(null);}}>
   {service?groupView(documentGroups(layout.root)[0]):<div className="document-window-empty">请从桌面版打开作品窗口</div>}
  </main>
  <footer className="document-window-status"><span className="document-window-online">● 本机运行</span><span>{active?`${active.title||'未命名作品'} · ${workspaceNames[active.workspace]}${active.dirty?' · 尚未保存':''}`:'文档区'}</span><span className="document-window-status-spacer"/>{failure?<span role="alert" className="document-window-error" title={failure}>{failure}</span>:<span>{ownDocuments.length} 个作品{working?' · 正在处理':''}</span>}</footer>
  {fallbackMenu&&<div className="document-window-fallback-menu" role="menu" aria-label="应用菜单" style={{left:fallbackMenu.x,top:fallbackMenu.y}} onPointerDown={event=>event.stopPropagation()}>{fallbackMenu.items.map(item=>item.separator?<hr key={item.id}/>:<button type="button" key={item.id} disabled={item.enabled===false} role={item.checked!==undefined?'menuitemcheckbox':'menuitem'} aria-checked={item.checked} onClick={()=>void run(()=>act(item.id))}>{item.checked?'✓ ':''}{item.label.replace('\t','　')}</button>)}</div>}
 </div>;
}
