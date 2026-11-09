import {useId,useMemo,useRef,useState} from 'react';
import {Icon} from './Fields';
import AppDialog from './AppDialog';
import './DiagramLibrary.css';
import './CreaseLibrary.css';

export interface CreaseLibraryDocument {
  id:string;
  name:string;
  updated:string;
  segments:number;
  kind?:'curve-design';
  samples?:number;
  draft:boolean;
  thumbnail:string;
  folderId:string|null;
  openedAt:number;
}

export interface CreaseLibraryFolder {
  id:string;
  name:string;
  parentId:string|null;
  createdAt:number;
}

export interface CreaseLibraryProps {
  documents:CreaseLibraryDocument[];
  folders:CreaseLibraryFolder[];
  lastOpenId:string|null;
  currentId:string|null;
  currentName:string;
  onOpen:(id:string)=>void;
  onNew:()=>void;
  onNewExample?:(kind:'accordion'|'waterbomb')=>void;
  onImport:()=>void;
  onSaveCurrent:()=>void;
  onContinueCurrent?:()=>void;
  canSaveCurrent?:boolean;
  onCreateFolder:(name:string,parentId:string|null)=>void;
  onRename:(id:string,name:string)=>void;
  onMove:(id:string,folderId:string|null)=>void;
  onDelete:(id:string)=>Promise<boolean>;
  busy?:boolean;
  error?:string;
  loading?:boolean;
  onRefresh?:()=>void;
}

type Location={kind:'all'|'recent'}|{kind:'folder';id:string|null};
type Dialog={kind:'folder';name:string;parentId:string|null}|{kind:'rename'|'delete';id:string;name:string};
const modifiedTime=(entry:CreaseLibraryDocument)=>Date.parse(entry.updated)||0;
const dateText=(entry:CreaseLibraryDocument)=>{
  const stamp=modifiedTime(entry);
  return stamp?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp):'未记录时间';
};
const detailText=(entry:CreaseLibraryDocument)=>entry.kind==='curve-design'?`曲面设计 · ${entry.samples??0} 个采样点`:`${entry.segments} 条折痕`;
const svgSource=(svg:string)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function Preview({entry,large=false}:{entry:CreaseLibraryDocument;large?:boolean}) {
  const [failedThumbnail,setFailedThumbnail]=useState<string|null>(null);
  const thumbnail=entry.thumbnail&&entry.thumbnail!==failedThumbnail?entry.thumbnail:null;
  const placeholder=entry.segments===0&&entry.kind!=='curve-design'?'空白折痕':'CP 预览暂不可用';
  return <div className={'diagram-library-preview'+(large?' is-large':'')}>
    {thumbnail?<img src={svgSource(thumbnail)} alt={`${entry.name} CP 缩略图`} draggable={false} onError={()=>setFailedThumbnail(thumbnail)}/>:<div className="crease-library-preview-placeholder" role="img" aria-label={`${entry.name}：${placeholder}`}><svg viewBox="0 0 320 220" aria-hidden="true"><rect x="76" y="26" width="168" height="168"/></svg><span>{placeholder}</span></div>}
    <span className={'diagram-library-status'+(entry.draft?' is-draft':'')}>{entry.draft?'草稿':'已保存'}</span>
  </div>;
}

export default function CreaseLibrary({documents:allDocuments,folders:allFolders,lastOpenId,currentId,currentName,onOpen,onNew,onNewExample,onImport,onSaveCurrent,onContinueCurrent,canSaveCurrent=true,onCreateFolder,onRename,onMove,onDelete,busy=false,error='',loading=false,onRefresh}:CreaseLibraryProps) {
  const [location,setLocation]=useState<Location>({kind:'all'});
  const [search,setSearch]=useState('');
  const [dialog,setDialog]=useState<Dialog|null>(null);
  const dialogInput=useRef<HTMLInputElement>(null);
  const dialogFormId=useId();
  const deleteCancel=useRef<HTMLButtonElement>(null),deletePending=useRef(false);
  const [deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
  const locked=busy||loading||deleting;
  const last=allDocuments.find(entry=>entry.id===lastOpenId);
  const folderId=location.kind==='folder'?location.id:null;
  const folders=allFolders.filter(folder=>folder.parentId===folderId);
  const folderName=location.kind==='folder'?(location.id===null?'未分类':allFolders.find(folder=>folder.id===location.id)?.name??'文件夹'):location.kind==='recent'?'最近工程':'全部工程';
  const ancestors=useMemo(()=>{
    const path:CreaseLibraryFolder[]=[],visited=new Set<string>();
    let id=folderId;
    while(id&&!visited.has(id)){
      visited.add(id);
      const folder=allFolders.find(item=>item.id===id);
      if(!folder)break;
      path.unshift(folder);
      id=folder.parentId;
    }
    return path;
  },[allFolders,folderId]);
  const documents=allDocuments.filter(entry=>(location.kind!=='folder'||entry.folderId===folderId)&&(!search.trim()||entry.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
    .sort((a,b)=>location.kind==='recent'?b.openedAt-a.openedAt:modifiedTime(b)-modifiedTime(a));
  const folderPath=(id:string|null):string=>{
    if(id===null)return '未分类';
    const names:string[]=[],visited=new Set<string>();
    let folder=allFolders.find(item=>item.id===id);
    while(folder&&!visited.has(folder.id)){
      visited.add(folder.id);
      names.unshift(folder.name);
      const parentId=folder.parentId;
      folder=allFolders.find(item=>item.id===parentId);
    }
    return names.join(' / ')||'未分类';
  };
  function openDialog(next:Dialog){setDeleteError('');setDialog(next);}
  async function confirmDelete(){
    if(!dialog||dialog.kind!=='delete'||locked||deletePending.current)return;
    deletePending.current=true;setDeleting(true);setDeleteError('');
    try{if(await onDelete(dialog.id))setDialog(null);else setDeleteError('删除未完成，当前内容仍保留。请检查错误后重试。');}
    catch(cause){setDeleteError(cause instanceof Error?cause.message:'删除未完成，请重试。');}
    finally{deletePending.current=false;setDeleting(false);}
  }
  function submitDialog(){
    if(!dialog||dialog.kind==='delete'||locked||!dialog.name.trim())return;
    if(dialog.kind==='folder')onCreateFolder(dialog.name.trim(),dialog.parentId);
    else onRename(dialog.id,dialog.name.trim());
    setDialog(null);
  }
  return <section className="diagram-library crease-library" data-crease-library aria-label="折痕编辑文档" aria-busy={locked}>
    <aside className="diagram-library-sidebar">
      <header><Icon name="folder"/><strong>折痕文档</strong></header>
      <nav aria-label="折痕文件夹">
        <button aria-current={location.kind==='all'?'page':undefined} onClick={()=>setLocation({kind:'all'})}><Icon name="grid"/>全部工程<span>{allDocuments.length}</span></button>
        <button aria-current={location.kind==='recent'?'page':undefined} onClick={()=>setLocation({kind:'recent'})}><Icon name="undo"/>最近工程</button>
        <div className="diagram-library-nav-heading"><span>文件夹</span><button aria-label="新建文件夹" title="新建文件夹" disabled={locked} onClick={()=>openDialog({kind:'folder',name:'',parentId:null})}>+</button></div>
        <button aria-current={location.kind==='folder'&&location.id===null?'page':undefined} onClick={()=>setLocation({kind:'folder',id:null})}><Icon name="folder"/>未分类<span>{allDocuments.filter(entry=>entry.folderId===null).length}</span></button>
        {allFolders.map(folder=><button key={folder.id} className="diagram-library-folder-nav" aria-current={location.kind==='folder'&&location.id===folder.id?'page':undefined} onClick={()=>setLocation({kind:'folder',id:folder.id})} title={folderPath(folder.id)}><Icon name="folder"/><span>{folder.name}</span><small>{allDocuments.filter(entry=>entry.folderId===folder.id).length}</small></button>)}
      </nav>
      <footer>折痕、纸张与曲面设计<br/>保存在本机文档库</footer>
    </aside>
    <main className="diagram-library-main">
      <header className="diagram-library-heading">
        <div><h1>我的折痕</h1><span>{allDocuments.length} 份工程 · {allFolders.length} 个文件夹</span></div>
        <div className="diagram-library-actions">
          {onContinueCurrent&&<button onClick={onContinueCurrent} disabled={locked}>继续当前折痕</button>}
          <button onClick={onSaveCurrent} disabled={locked||!canSaveCurrent} title={`保存“${currentName}”到文档库`}><Icon name="save"/>保存当前</button>
          <button onClick={onImport} disabled={locked}><Icon name="folder"/>导入工程</button>
          {onNewExample&&<details className="crease-library-examples" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector<HTMLElement>('summary')?.focus();}}}><summary aria-label="新建示例工程">示例工程</summary><div><button onClick={event=>{onNewExample('accordion');event.currentTarget.closest('details')?.removeAttribute('open');}} disabled={locked}>手风琴折</button><button onClick={event=>{onNewExample('waterbomb');event.currentTarget.closest('details')?.removeAttribute('open');}} disabled={locked}>水雷基础形</button></div></details>}
          <button className="diagram-library-primary" onClick={onNew} disabled={locked}>＋ 新建空白</button>
        </div>
      </header>
      {error&&<div className="diagram-library-error" role="alert"><span>{error}</span>{onRefresh&&<button onClick={onRefresh} disabled={locked}>重试</button>}</div>}
      {loading?<div className="crease-library-loading" role="status" aria-live="polite">正在加载折痕文档…</div>:<>
        {last&&<section className="diagram-library-resume" aria-label="上次编辑的折痕">
          <button className="diagram-library-resume-image" onClick={()=>onOpen(last.id)} disabled={locked} aria-label={`继续上次折痕：${last.name}`}><Preview entry={last} large/></button>
          <div><h2>{last.name}</h2><span>上次编辑 · {detailText(last)} · {dateText(last)} 修改</span><small>{folderPath(last.folderId)}{last.id===currentId?' · 当前工程':''}</small><button className="diagram-library-primary" onClick={()=>onOpen(last.id)} disabled={locked}>继续编辑 <span aria-hidden="true">→</span></button></div>
        </section>}
        <section className="diagram-library-files" aria-label={folderName}>
          <div className="diagram-library-files-heading"><div><h2>{folderName}</h2>{location.kind==='folder'&&ancestors.length>0&&<nav aria-label="文件夹路径"><button onClick={()=>setLocation({kind:'all'})}>全部</button>{ancestors.map(folder=><span key={folder.id}> / <button onClick={()=>setLocation({kind:'folder',id:folder.id})}>{folder.name}</button></span>)}</nav>}</div><label><Icon name="grid"/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} aria-label="搜索折痕" placeholder="搜索折痕名称…"/></label></div>
          {!search.trim()&&location.kind!=='recent'&&folders.length>0&&<div className="diagram-library-folder-grid">{folders.map(folder=><button key={folder.id} onClick={()=>setLocation({kind:'folder',id:folder.id})} className="diagram-library-folder-card"><Icon name="folder"/><strong>{folder.name}</strong><small>{allDocuments.filter(entry=>entry.folderId===folder.id).length} 份工程</small></button>)}</div>}
          <div className="diagram-library-document-grid">
            {documents.map(entry=><article className={'diagram-library-document'+(entry.id===currentId?' is-current':'')} key={entry.id} data-crease-library-document={entry.id}>
              <button className="diagram-library-document-open" onClick={()=>onOpen(entry.id)} disabled={locked} aria-label={`打开折痕：${entry.name}`}>
                <Preview entry={entry}/><div><strong>{entry.name}</strong><span>{detailText(entry)} <span>·</span> {dateText(entry)}</span></div>
              </button>
              <footer><button onClick={()=>openDialog({kind:'rename',id:entry.id,name:entry.name})} disabled={locked} aria-label={`重命名折痕：${entry.name}`}>重命名</button><label><span>移动到</span><select value={entry.folderId??''} onChange={event=>onMove(entry.id,event.target.value||null)} disabled={locked} aria-label={`移动折痕：${entry.name}`}><option value="">未分类</option>{allFolders.map(folder=><option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select></label><button className="diagram-library-delete" disabled={locked} onClick={()=>openDialog({kind:'delete',id:entry.id,name:entry.name})} aria-label={`删除折痕：${entry.name}`}>删除</button></footer>
            </article>)}
          </div>
          {documents.length===0&&<div className="diagram-library-empty"><Icon name="folder"/><h3>{search.trim()?'没有匹配的折痕':'这里还没有折痕'}</h3><p>{search.trim()?'尝试其他名称。':'新建空白折痕，或将现有折痕工程导入文档库。'}</p>{!search.trim()&&<div className="crease-library-empty-actions"><button className="diagram-library-primary" onClick={onNew} disabled={locked}>＋ 新建空白</button><button onClick={onImport} disabled={locked}>导入工程</button></div>}</div>}
          {location.kind==='folder'&&!search.trim()&&<button className="diagram-library-add-folder" onClick={()=>openDialog({kind:'folder',name:'',parentId:folderId})} disabled={locked}>＋ 在这里新建文件夹</button>}
        </section>
      </>}
    </main>
    {dialog&&<AppDialog title={dialog.kind==='delete'?'删除折痕工程':dialog.kind==='folder'?'新建文件夹':'重命名折痕'} onClose={()=>setDialog(null)} size="small" className="diagram-library-window" busy={locked} closeDisabled={locked} initialFocusRef={dialog.kind==='delete'?deleteCancel:dialogInput} footer={<><button ref={deleteCancel} type="button" onClick={()=>setDialog(null)} disabled={locked}>取消</button>{dialog.kind==='delete'?<button className="is-danger" type="button" disabled={locked} onClick={()=>void confirmDelete()}>{deleting?'正在删除…':'删除工程'}</button>:<button className="diagram-library-primary" type="submit" form={dialogFormId} disabled={locked||!dialog.name.trim()}>确定</button>}</>}>
      {dialog.kind==='delete'?<div data-delete-document="crease" data-delete-document-id={dialog.id}><p>确定删除折痕工程 <strong className="document-delete-name">“{dialog.name}”</strong> 吗？</p><p>已保存版本、自动草稿及匹配的恢复副本将一并删除，无法通过撤销恢复。</p>{dialog.id===currentId&&<p>当前工程及其未导出的模型也会关闭。</p>}{deleteError&&<p role="alert" className="document-delete-error">{error||deleteError}</p>}</div>:<form id={dialogFormId} className="ui-dialog-form" onSubmit={event=>{event.preventDefault();submitDialog();}}><label>{dialog.kind==='folder'?'文件夹名称':'折痕名称'}<input ref={dialogInput} autoFocus value={dialog.name} maxLength={160} disabled={locked} onChange={event=>setDialog({...dialog,name:event.target.value})}/></label></form>}
    </AppDialog>}
  </section>;
}
