import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {diagramLibraryIsDraft,type DiagramLibraryIndex,type DiagramLibraryEntry} from '../app/diagramLibrary';
import type {DiagramProject} from '../app/diagramProject';
import {Icon} from './Fields';
import AppDialog from './AppDialog';
import './DiagramLibrary.css';

export interface DiagramLibraryProps {
  index:DiagramLibraryIndex;currentId:string|null;currentProject:DiagramProject;
  getThumbnail:(id:string)=>string|null|Promise<string|null>;
  onOpen:(id:string)=>void;onNew:()=>void;onImport:()=>void;onSaveCurrent?:()=>void;
  onCreateFolder:(name:string,parentId:string|null)=>void;
  onRename:(id:string,name:string)=>void;onMove:(id:string,folderId:string|null)=>void;onDelete:(id:string)=>void;
  onContinueCurrent?:()=>void;busy?:boolean;error?:string;
}
type Location={kind:'all'|'recent'}|{kind:'folder';id:string|null};
type Dialog={kind:'folder';name:string;parentId:string|null}|{kind:'rename';id:string;name:string};
const dateText=(stamp:number)=>new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp);
const svgSource=(svg:string)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function Preview({entry,getThumbnail,large=false}:{entry:DiagramLibraryEntry;getThumbnail:DiagramLibraryProps['getThumbnail'];large?:boolean}) {
  const element=useRef<HTMLDivElement>(null),[thumbnail,setThumbnail]=useState<string|null>(null);
  useEffect(()=>{
    let live=true,started=false;setThumbnail(null);
    const load=()=>{if(started)return;started=true;void Promise.resolve().then(()=>getThumbnail(entry.id)).then(value=>{if(live)setThumbnail(value);},()=>{});};
    const node=element.current;
    if(!node||typeof IntersectionObserver==='undefined'){load();return()=>{live=false;};}
    const observer=new IntersectionObserver(entries=>{if(entries.some(item=>item.isIntersecting)){observer.disconnect();load();}},{root:node.closest('.diagram-library-main'),rootMargin:'160px'});
    observer.observe(node);return()=>{live=false;observer.disconnect();};
  },[getThumbnail,entry.id,entry.draftKey,entry.savedKey]);
  return <div ref={element} className={'diagram-library-preview'+(large?' is-large':'')}>
    {thumbnail?<img loading="lazy" decoding="async" src={svgSource(thumbnail)} alt={`${entry.name}绘图缩略图`} draggable={false}/>:<div className="diagram-library-preview-empty"><Icon name="folder"/><span>折序绘图</span></div>}
    <span className={'diagram-library-status'+(diagramLibraryIsDraft(entry)?' is-draft':'')}>{diagramLibraryIsDraft(entry)?'草稿':'已保存'}</span>
  </div>;
}

export default function DiagramLibrary({index,currentId,currentProject,getThumbnail,onOpen,onNew,onImport,onSaveCurrent,onCreateFolder,onRename,onMove,onDelete,onContinueCurrent,busy=false,error=''}:DiagramLibraryProps) {
  const [location,setLocation]=useState<Location>({kind:'all'}),[search,setSearch]=useState(''),[dialog,setDialog]=useState<Dialog|null>(null);
  const dialogInput=useRef<HTMLInputElement>(null),dialogFormId=useId();
  const last=index.documents.find(entry=>entry.id===index.lastOpenId),folderId=location.kind==='folder'?location.id:null;
  const folders=index.folders.filter(folder=>folder.parentId===folderId);
  const folderName=location.kind==='folder'?(location.id===null?'未分类':index.folders.find(folder=>folder.id===location.id)?.name??'文件夹'):location.kind==='recent'?'最近绘图':'全部绘图';
  const ancestors=useMemo(()=>{const path=[];let id=folderId;while(id){const folder=index.folders.find(item=>item.id===id);if(!folder)break;path.unshift(folder);id=folder.parentId;}return path;},[index.folders,folderId]);
  const documents=index.documents.filter(entry=>(location.kind!=='folder'||entry.folderId===folderId)&&(!search.trim()||entry.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
    .sort((a,b)=>location.kind==='recent'?b.openedAt-a.openedAt:b.modifiedAt-a.modifiedAt);
  const folderPath=(id:string|null):string=>{if(id===null)return '未分类';const names=[];let folder=index.folders.find(item=>item.id===id);while(folder){names.unshift(folder.name);folder=index.folders.find(item=>item.id===folder!.parentId);}return names.join(' / ');};
  function submitDialog(){if(!dialog||busy||!dialog.name.trim())return;if(dialog.kind==='folder')onCreateFolder(dialog.name.trim(),dialog.parentId);else onRename(dialog.id,dialog.name.trim());setDialog(null);}
  return <section className="diagram-library" data-diagram-library aria-label="折序绘图文档">
    <aside className="diagram-library-sidebar">
      <header><Icon name="folder"/><strong>折序文档</strong></header>
      <nav aria-label="绘图文件夹">
        <button aria-current={location.kind==='all'?'page':undefined} onClick={()=>setLocation({kind:'all'})}><Icon name="grid"/>全部绘图<span>{index.documents.length}</span></button>
        <button aria-current={location.kind==='recent'?'page':undefined} onClick={()=>setLocation({kind:'recent'})}><Icon name="undo"/>最近绘图</button>
        <div className="diagram-library-nav-heading"><span>文件夹</span><button aria-label="新建文件夹" title="新建文件夹" disabled={busy} onClick={()=>setDialog({kind:'folder',name:'',parentId:null})}>+</button></div>
        <button aria-current={location.kind==='folder'&&location.id===null?'page':undefined} onClick={()=>setLocation({kind:'folder',id:null})}><Icon name="folder"/>未分类<span>{index.documents.filter(entry=>entry.folderId===null).length}</span></button>
        {index.folders.map(folder=><button key={folder.id} className="diagram-library-folder-nav" aria-current={location.kind==='folder'&&location.id===folder.id?'page':undefined} onClick={()=>setLocation({kind:'folder',id:folder.id})} title={folderPath(folder.id)}><Icon name="folder"/><span>{folder.name}</span><small>{index.documents.filter(entry=>entry.folderId===folder.id).length}</small></button>)}
      </nav>
      <footer>绘图、步骤、CP 与纸层状态<br/>保存在本机文档库</footer>
    </aside>
    <main className="diagram-library-main">
      <header className="diagram-library-heading">
        <div><p>折序绘图</p><h1>我的绘图</h1><span>{index.documents.length} 份绘图 · {index.folders.length} 个文件夹</span></div>
        <div className="diagram-library-actions">
          {onContinueCurrent&&<button onClick={onContinueCurrent} disabled={busy}>继续当前绘图</button>}
          {onSaveCurrent&&<button onClick={onSaveCurrent} disabled={busy} title={`保存“${currentProject.name}”到文档库`}><Icon name="save"/>保存当前</button>}
          <button onClick={onImport} disabled={busy}><Icon name="folder"/>导入工程</button>
          <button className="diagram-library-primary" onClick={onNew} disabled={busy}>＋ 新建绘图</button>
        </div>
      </header>
      {error&&<div className="diagram-library-error" role="alert">{error}</div>}
      {last&&<section className="diagram-library-resume" aria-label="上次绘图">
        <button className="diagram-library-resume-image" onClick={()=>onOpen(last.id)} disabled={busy} aria-label={`继续上次绘图：${last.name}`}><Preview entry={last} getThumbnail={getThumbnail} large/></button>
        <div><p>上次绘图</p><h2>{last.name}</h2><span>{last.stepCount} 个步骤 · {dateText(last.modifiedAt)} 修改</span><small>{folderPath(last.folderId)}{last.id===currentId?' · 当前工程':''}</small><button className="diagram-library-primary" onClick={()=>onOpen(last.id)} disabled={busy}>继续绘图 <span aria-hidden="true">→</span></button></div>
      </section>}
      <section className="diagram-library-files" aria-label={folderName}>
        <div className="diagram-library-files-heading"><div><h2>{folderName}</h2>{location.kind==='folder'&&ancestors.length>0&&<nav aria-label="文件夹路径"><button onClick={()=>setLocation({kind:'all'})}>全部</button>{ancestors.map(folder=><span key={folder.id}> / <button onClick={()=>setLocation({kind:'folder',id:folder.id})}>{folder.name}</button></span>)}</nav>}</div><label><Icon name="grid"/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} aria-label="搜索绘图" placeholder="搜索绘图名称…"/></label></div>
        {!search.trim()&&location.kind!=='recent'&&folders.length>0&&<div className="diagram-library-folder-grid">{folders.map(folder=><button key={folder.id} onClick={()=>setLocation({kind:'folder',id:folder.id})} className="diagram-library-folder-card"><Icon name="folder"/><strong>{folder.name}</strong><small>{index.documents.filter(entry=>entry.folderId===folder.id).length} 份绘图</small></button>)}</div>}
        <div className="diagram-library-document-grid">
          {documents.map(entry=><article className={'diagram-library-document'+(entry.id===currentId?' is-current':'')} key={entry.id} data-diagram-library-document={entry.id}>
            <button className="diagram-library-document-open" onClick={()=>onOpen(entry.id)} disabled={busy} aria-label={`打开绘图：${entry.name}`}>
              <Preview entry={entry} getThumbnail={getThumbnail}/><div><strong>{entry.name}</strong><span>{entry.stepCount} 个步骤 <span>·</span> {dateText(entry.modifiedAt)}</span></div>
            </button>
            <footer><button onClick={()=>setDialog({kind:'rename',id:entry.id,name:entry.name})} disabled={busy} aria-label={`重命名绘图：${entry.name}`}>重命名</button><label><span>移动到</span><select value={entry.folderId??''} onChange={event=>onMove(entry.id,event.target.value||null)} disabled={busy} aria-label={`移动绘图：${entry.name}`}><option value="">未分类</option>{index.folders.map(folder=><option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select></label><button className="diagram-library-delete" onClick={()=>onDelete(entry.id)} disabled={busy} aria-label={`删除绘图：${entry.name}`}>删除</button></footer>
          </article>)}
        </div>
        {documents.length===0&&<div className="diagram-library-empty"><Icon name="folder"/><h3>{search.trim()?'没有匹配的绘图':'这里还没有绘图'}</h3><p>{search.trim()?'尝试其他名称。':'新建绘图，或将现有折序工程导入文档库。'}</p>{!search.trim()&&<button onClick={onNew} disabled={busy}>＋ 新建绘图</button>}</div>}
        {location.kind==='folder'&&!search.trim()&&<button className="diagram-library-add-folder" onClick={()=>setDialog({kind:'folder',name:'',parentId:folderId})} disabled={busy}>＋ 在这里新建文件夹</button>}
      </section>
    </main>
    {dialog&&<AppDialog title={dialog.kind==='folder'?'新建文件夹':'重命名绘图'} onClose={()=>setDialog(null)} size="small" className="diagram-library-window" busy={busy} closeDisabled={busy} initialFocusRef={dialogInput} footer={<><button type="button" onClick={()=>setDialog(null)} disabled={busy}>取消</button><button className="diagram-library-primary" type="submit" form={dialogFormId} disabled={busy||!dialog.name.trim()}>确定</button></>}><form id={dialogFormId} className="ui-dialog-form" onSubmit={event=>{event.preventDefault();submitDialog();}}><label>{dialog.kind==='folder'?'文件夹名称':'绘图名称'}<input ref={dialogInput} autoFocus value={dialog.name} maxLength={160} disabled={busy} onChange={event=>setDialog({...dialog,name:event.target.value})}/></label></form></AppDialog>}
  </section>;
}
