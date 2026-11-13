import {preferenceStorage} from './preferenceStorage';
import {exportDiagramProject,importDiagramProject,type DiagramProject} from './diagramProject';
import {drawingSVG,diagramDrawingFrame,diagramZoomArtwork} from './diagramDrawing';
import {diagramStepZoom} from './diagramStepZoom';
import {diagramCalloutCPMarkup} from './diagramCalloutSVG';
import {defaultCreaseDisplay} from './creaseDisplay';
import {projectDiagramFoldCP} from './diagramFoldLink';
import {diagramDrawingRotationFrame,rotateDiagramDrawingSVG} from './diagramDrawingRotation';
import {sameDiagramProjectContent} from './diagramProjectContent';
import {api} from './api';
import {WEB_APP} from './webRuntime';

export const DIAGRAM_LIBRARY_KEY='zhezhi.diagram-library.v1';
export const DIAGRAM_LEGACY_DRAFT_KEY='zhezhi.diagram-project.v1';
const DOCUMENT_KEY=/^zhezhi\.diagram-library-doc-[a-p]{32}\.v1$/;
const THUMBNAIL_LIMIT=120_000;

export interface DiagramLibraryFolder {id:string;name:string;parentId:string|null;createdAt:number}
export interface DiagramLibraryEntry {
  id:string;name:string;folderId:string|null;createdAt:number;modifiedAt:number;openedAt:number;
  stepCount:number;savedAt:number|null;draftKey:string|null;savedKey:string|null;
  /** Unreferenced revision slots are reused; each drawing needs at most three
   * payload keys rather than accumulating one empty key per autosave. */
  spareKeys?:string[];
}
export interface DiagramLibraryIndex {
  format:'zhezhi-diagram-library';version:1;documents:DiagramLibraryEntry[];folders:DiagramLibraryFolder[];lastOpenId:string|null;
  /** Exact legacy snapshots deleted by the user must not be re-imported if
   * best-effort payload cleanup fails or browser preferences migrate later. */
  deletedLegacy?:string[];
}
type StorageAccess=Pick<Storage,'getItem'|'setItem'>&{compareAndSet?:(key:string,expectedValue:string|null,value:string)=>boolean;getItemAsync?:(key:string)=>Promise<string|null>;retainRecords?:(keys:readonly string[])=>()=>void};
export class DiagramLibraryConflictError extends Error {readonly code='DIAGRAM_LIBRARY_CONFLICT';constructor(){super('绘图已在其他窗口修改或删除，本次保存未覆盖原内容。请下载当前工程备份，或另存为新绘图后继续。');}}
interface StoredDocument {format:'zhezhi-diagram-library-document';version:1;project:DiagramProject;thumbnail:string|null}
export type DiagramLibraryBackgroundRequest=({project:DiagramProject}|{promoteDraftKey:string})&{settings:DiagramLibrarySaveOptions;openedHead?:string;legacyDraft?:boolean};
export interface DiagramLibraryBackgroundResult {entry:DiagramLibraryEntry;index:DiagramLibraryIndex;thumbnail:string|null;warnings:string[]}
interface LibraryOptions {
  now?:()=>number;idFactory?:()=>string;onWarning?:(message:string)=>void;
  /** The worker receives the editor's original head, never a freshly loaded
   * external revision falsely adopted as this window's base. */
  openedHeads?:ReadonlyMap<string,string>;
  backgroundSave?:(request:DiagramLibraryBackgroundRequest)=>Promise<DiagramLibraryBackgroundResult>;
  prepareThumbnail?:(storedText:string)=>Promise<string|null>;
}
export interface DiagramLibrarySaveOptions {id?:string;folderId?:string|null;kind:'draft'|'saved';onlyIfLibraryMissing?:boolean}
export interface DiagramLibraryDeleteResult {index:DiagramLibraryIndex;warning:string|null}
export const emptyDiagramLibrary=():DiagramLibraryIndex=>({format:'zhezhi-diagram-library',version:1,documents:[],folders:[],lastOpenId:null});
export const diagramLibraryIsDraft=(entry:DiagramLibraryEntry)=>entry.draftKey!==entry.savedKey||entry.savedKey===null;
/** A migration can rename an imported document or assign it a new id. Match
 * its full drawing before allowing the open workspace to save into that id. */
export function findDiagramLibraryDocument(index:DiagramLibraryIndex,project:DiagramProject,load:(id:string)=>DiagramProject,preferredId:string|null):DiagramLibraryEntry|null {
  const signatureOf=(value:DiagramProject)=>JSON.stringify({...importDiagramProject(exportDiagramProject(value)),name:''});
  const signature=signatureOf(project);
  const candidates=[...index.documents.filter(entry=>entry.id===preferredId),...index.documents.filter(entry=>entry.id!==preferredId)];
  for(const entry of candidates){try{if(signatureOf(load(entry.id))===signature)return entry;}catch{/* An unreadable document cannot be a save destination. */}}
  return null;
}
const nameOf=(name:string)=>{const value=name.trim();if(!value||value.length>160)throw new Error('名称须为 1 到 160 个字符。');return value;};
const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=160;
const time=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const key=(value:unknown)=>value===null||typeof value==='string'&&DOCUMENT_KEY.test(value);
const same=(a:DiagramProject,b:DiagramProject)=>JSON.stringify(a)===JSON.stringify(b);

function validateIndex(value:unknown):asserts value is DiagramLibraryIndex {
  const index=value as DiagramLibraryIndex;
  if(!index||index.format!=='zhezhi-diagram-library'||index.version!==1||!Array.isArray(index.documents)||!Array.isArray(index.folders))throw new Error('折序文档目录格式损坏，请先导出当前工程。');
  const ids=new Set<string>();
  for(const folder of index.folders){
    if(!folder||!validId(folder.id)||ids.has(folder.id)||typeof folder.name!=='string'||nameOf(folder.name)!==folder.name||!time(folder.createdAt)||(folder.parentId!==null&&!validId(folder.parentId)))throw new Error('折序文件夹目录损坏。');
    ids.add(folder.id);
  }
  const folderIds=new Set(index.folders.map(folder=>folder.id));
  for(const folder of index.folders){
    const ancestors=new Set([folder.id]);let parent=folder.parentId;
    while(parent!==null){if(!folderIds.has(parent)||ancestors.has(parent))throw new Error('折序文件夹关系损坏。');ancestors.add(parent);parent=index.folders.find(item=>item.id===parent)!.parentId;}
  }
  for(const doc of index.documents){
    if(!doc||!validId(doc.id)||ids.has(doc.id)||typeof doc.name!=='string'||nameOf(doc.name)!==doc.name||!time(doc.createdAt)||!time(doc.modifiedAt)||!time(doc.openedAt)||!Number.isSafeInteger(doc.stepCount)||doc.stepCount<1||doc.savedAt!==null&&!time(doc.savedAt)||!key(doc.draftKey)||!key(doc.savedKey)||!doc.draftKey&&!doc.savedKey||(doc.savedAt===null)!==(doc.savedKey===null)||doc.folderId!==null&&!folderIds.has(doc.folderId))throw new Error('折序绘图目录损坏。');
    ids.add(doc.id);
  }
  const liveKeys=new Set(index.documents.flatMap(doc=>[doc.draftKey,doc.savedKey].filter((key):key is string=>!!key))),spareKeys=new Set<string>();
  for(const doc of index.documents)if(doc.spareKeys!==undefined){
    if(!Array.isArray(doc.spareKeys)||doc.spareKeys.length>2||doc.spareKeys.some(snapshotKey=>typeof snapshotKey!=='string'||!DOCUMENT_KEY.test(snapshotKey)||liveKeys.has(snapshotKey)||spareKeys.has(snapshotKey)))throw new Error('折序绘图修订目录损坏。');
    for(const snapshotKey of doc.spareKeys)spareKeys.add(snapshotKey);
  }
  if(index.lastOpenId!==null&&!index.documents.some(doc=>doc.id===index.lastOpenId))throw new Error('上次绘图记录损坏。');
  if(index.deletedLegacy!==undefined&&(!Array.isArray(index.deletedLegacy)||index.deletedLegacy.some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))))throw new Error('折序旧草稿删除记录损坏。');
}

function fallbackCP(project:DiagramProject):string {
  const step=project.steps.find(item=>item.id===project.activeStepId)??project.steps[0],doc=project.states.find(state=>state.id===step.beforeId)!.doc;
  const w=doc.paper.width,h=doc.paper.height,pad=Math.max(w,h)*.08;
  const lines=doc.segments.slice(0,550).map(segment=>`<path d="M ${segment.a.join(' ')} L ${segment.b.join(' ')}" fill="none" stroke="${segment.assignment==='M'?'#b06957':segment.assignment==='V'?'#65899d':'#526b5b'}" stroke-width="${Math.max(w,h)*.002}"${segment.assignment==='V'?' stroke-dasharray="3 2"':''}/>`).join('');
  const zoom=diagramStepZoom(project,step.id)?.region,frame=zoom?diagramDrawingFrame(null,[],undefined,[],true,[],zoom):{x:-pad,y:-pad,width:w+pad*2,height:h+pad*2};
  return rotateDiagramDrawingSVG(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}">${diagramZoomArtwork(`<rect x="0" y="0" width="${w}" height="${h}" fill="#f5ecd5"/>${lines}`,zoom,'library-cp')}</svg>`,step.canvas?.drawingRotation??0);
}

/** Store a preview of the actual drawing, including its folded paper and symbols. */
export function diagramLibraryThumbnail(project:DiagramProject):string {
  const step=project.steps.find(item=>item.id===project.activeStepId)??project.steps[0];
  if(step.paperVisible!==false&&!step.pose&&!step.simulationSurface&&!(step.annotations?.length)&&!step.images?.length&&!step.callouts?.length)return fallbackCP(project);
  try{
    const before=project.states.find(state=>state.id===step.beforeId)!,after=project.states.find(state=>state.id===step.afterId)!;
    const preview=step.paperVisible!==false&&step.pose&&step.foldLink?.enabled?projectDiagramFoldCP(step.pose,before.doc,after.doc,project.states.find(state=>state.id===step.pose!.sourceStateId),step.foldLink.precreases).preview:undefined;
    const zoom=diagramStepZoom(project,step.id)?.region,drawingRotation=step.canvas?.drawingRotation??0,thumbnailFrame=diagramDrawingRotationFrame(diagramDrawingFrame(step.pose,step.annotations??[],undefined,step.images,step.paperVisible,step.callouts,zoom,step.simulationSurface),drawingRotation);
    const svg=drawingSVG(step.pose,step.annotations??[],'','',preview,step.images,step.paperVisible,undefined,step.callouts,(stateId,sourceUnits,hideExistingCreases)=>{const state=project.states.find(item=>item.id===stateId);return state?diagramCalloutCPMarkup(state.doc,defaultCreaseDisplay(),{units:sourceUnits,hideExistingCreases}):'';},{units:Math.max(thumbnailFrame.width/240,thumbnailFrame.height/180)},zoom,drawingRotation,step.simulationSurface);
    return svg.length<=THUMBNAIL_LIMIT||step.images?.length||step.simulationSurface?svg:fallbackCP(project);
  }catch{return fallbackCP(project);}
}

/** Snapshots are immutable until the index is committed. A failed save leaves
 * the previous saved version and draft intact. Only superseded revision keys
 * are cleared, never other drawings or the separate manually saved snapshot. */
export function createDiagramLibrary(storage:StorageAccess=preferenceStorage,options:LibraryOptions={}) {
  const now=options.now??Date.now,idFactory=options.idFactory??(()=>crypto.randomUUID());
  let cachedIndex:DiagramLibraryIndex|undefined;
  let readRaw:string|null=null;
  let committedDirectory:{baseline:string|null;text:string}|undefined;
  let legacyMigration:Promise<DiagramLibraryIndex>|undefined;
  const openedHeads=new Map<string,string>(options.openedHeads);
  const confirmedContent=new Map<string,{project:DiagramProject;entry:DiagramLibraryEntry}>();
  const rememberContent=(id:string,project:DiagramProject,entry:DiagramLibraryEntry)=>{
    confirmedContent.delete(id);confirmedContent.set(id,{project,entry:structuredClone(entry)});
    while(confirmedContent.size>2)confirmedContent.delete(confirmedContent.keys().next().value!);
  };
  type BackgroundJob={project:DiagramProject;settings:DiagramLibrarySaveOptions;legacyDraft:boolean;coalesce:boolean;waiters:{resolve:(entry:DiagramLibraryEntry)=>void;reject:(error:unknown)=>void}[]};
  const backgroundQueue:BackgroundJob[]=[],backgroundIdle:(()=>void)[]=[];
  let backgroundRunning=false;
  const hasPendingSave=()=>backgroundRunning||backgroundQueue.length>0;
  const head=(entry:DiagramLibraryEntry)=>JSON.stringify([entry.draftKey,entry.savedKey,entry.modifiedAt,entry.name]);
  const compare=(key:string,expected:string|null,value:string)=>{
    if(storage.compareAndSet)return storage.compareAndSet(key,expected,value);
    // Custom synchronous stores used by import validation and embedders retain
    // their contract. Official disk-backed stores use an atomic CAS operation.
    if(storage.getItem(key)!==expected)return false;storage.setItem(key,value);return storage.getItem(key)===value;
  };
  // The desktop bridge reads its preference file on every getItem. Keep small
  // thumbnail strings for the library grid and at most two parsed snapshots.
  // Explicit document opens always re-read and validate the current payload.
  const documentCache=new Map<string,StoredDocument>(),thumbnailCache=new Map<string,string|null>(),thumbnailLoads=new Map<string,Promise<string|null>>();
  const discardCache=(snapshotKey:string)=>{documentCache.delete(snapshotKey);thumbnailCache.delete(snapshotKey);thumbnailLoads.delete(snapshotKey);};
  const cacheDocument=(snapshotKey:string,value:StoredDocument)=>{documentCache.delete(snapshotKey);documentCache.set(snapshotKey,value);thumbnailCache.set(snapshotKey,value.thumbnail);while(documentCache.size>2)documentCache.delete(documentCache.keys().next().value!);};
  const read=():DiagramLibraryIndex=>{
    const stored=storage.getItem(DIAGRAM_LIBRARY_KEY);
    const raw=committedDirectory&&stored===committedDirectory.baseline?committedDirectory.text:stored;
    if(committedDirectory&&stored!==committedDirectory.baseline)committedDirectory=undefined;
    readRaw=raw;if(raw===null||raw===''){cachedIndex=emptyDiagramLibrary();return emptyDiagramLibrary();}
    let index:unknown;try{index=JSON.parse(raw);}catch{throw new Error('折序文档目录损坏，请先导出当前工程。');}
    validateIndex(index);
    for(const entry of index.documents){const previous=cachedIndex?.documents.find(doc=>doc.id===entry.id);if(previous&&previous.modifiedAt!==entry.modifiedAt){if(entry.draftKey)discardCache(entry.draftKey);if(entry.savedKey)discardCache(entry.savedKey);}}
    cachedIndex=structuredClone(index);return structuredClone(index);
  };
  const readAsync=async()=>{if(storage.getItemAsync)await storage.getItemAsync(DIAGRAM_LIBRARY_KEY);return read();};
  const write=(index:DiagramLibraryIndex,expected=readRaw)=>{if(hasPendingSave())throw Error('绘图正在后台保存，请等待完成后重试。');validateIndex(index);const text=JSON.stringify(index);if(!compare(DIAGRAM_LIBRARY_KEY,expected,text))throw new DiagramLibraryConflictError();committedDirectory=undefined;readRaw=text;cachedIndex=structuredClone(index);};
  const requireEntry=(index:DiagramLibraryIndex,id:string)=>{const entry=index.documents.find(doc=>doc.id===id);if(!entry)throw new Error('找不到这个折序绘图。');return entry;};
  const newId=(index:DiagramLibraryIndex)=>{const id=idFactory();if(!validId(id)||index.documents.some(doc=>doc.id===id)||index.folders.some(folder=>folder.id===id))throw new Error('绘图编号重复，请重试。');return id;};
  const newKey=()=>`zhezhi.diagram-library-doc-${Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>'abcdefghijklmnop'[n>>4]+'abcdefghijklmnop'[n&15]).join('')}.v1`;
  const decode=(snapshotKey:string,fresh=false):StoredDocument=>{
    if(fresh)discardCache(snapshotKey);else{const cached=documentCache.get(snapshotKey);if(cached)return cached;}
    const raw=storage.getItem(snapshotKey);if(!raw)throw new Error('绘图内容缺失，请导入备份工程。');
    let value:StoredDocument;try{value=JSON.parse(raw);}catch{throw new Error('绘图内容损坏，请导入备份工程。');}
    if(!value||typeof value!=='object'||value.format!=='zhezhi-diagram-library-document'||value.version!==1||!value.project||value.thumbnail!==null&&(typeof value.thumbnail!=='string'||value.thumbnail.length>THUMBNAIL_LIMIT))throw new Error('绘图内容格式损坏。');
    cacheDocument(snapshotKey,value);return value;
  };
  const clear=(snapshotKey:string,expectedValue:string|null,committed=true)=>{discardCache(snapshotKey);try{compare(snapshotKey,expectedValue,'');return true;}catch{if(committed)try{options.onWarning?.('绘图已保存，旧修订暂未清理；请检查本机存储空间。');}catch{/* Notification failure cannot change a committed snapshot. */}return false;}};
  const save=(project:DiagramProject,settings:DiagramLibrarySaveOptions):DiagramLibraryEntry=>{
    if(hasPendingSave())throw Error('绘图正在后台保存，请等待完成后重试。');
    const validProject=importDiagramProject(exportDiagramProject(project));
    let staged:{key:string;body:string;snapshot:StoredDocument;thumbnail:string}|undefined;
    try{for(let attempt=0;attempt<4;attempt++){
      const index=read(),expected=readRaw,previous=settings.id?index.documents.find(entry=>entry.id===settings.id):null;
      if(settings.onlyIfLibraryMissing&&expected!==null)throw new DiagramLibraryConflictError();
      if(settings.id&&!previous)throw new DiagramLibraryConflictError();
      const existingKey=previous?.draftKey??previous?.savedKey;
      const previousBodies=new Map<string,string|null>();
      for(const oldKey of new Set([previous?.draftKey,previous?.savedKey]))if(oldKey&&index.documents.filter(entry=>entry.draftKey===oldKey||entry.savedKey===oldKey).length===1)try{previousBodies.set(oldKey,storage.getItem(oldKey));}catch{/* Optional cleanup must not prevent a protected save. */}
      if(previous){
        const opened=openedHeads.get(previous.id);
        if(opened!==undefined&&opened!==head(previous))throw new DiagramLibraryConflictError();
        if(opened===undefined){
          if(!existingKey||!same(decode(existingKey,true).project,validProject))throw new DiagramLibraryConflictError();
          openedHeads.set(previous.id,head(previous));
        }
      }
      const folderId=settings.folderId===undefined?previous?.folderId??null:settings.folderId;
      if(folderId!==null&&!index.folders.some(folder=>folder.id===folderId))throw new Error('找不到目标文件夹。');
      const stamp=now(),name=nameOf(validProject.name),id=previous?.id??newId(index);
      let snapshotKey:string|null=null;
      if(existingKey)try{if(same(decode(existingKey).project,validProject))snapshotKey=existingKey;}catch{/* A fresh snapshot can repair this opened drawing. */}
      if(!snapshotKey){
        if(!staged){
          const thumbnail=diagramLibraryThumbnail(validProject),snapshot:StoredDocument={format:'zhezhi-diagram-library-document',version:1,project:validProject,thumbnail:thumbnail.length<=THUMBNAIL_LIMIT?thumbnail:null},body=JSON.stringify(snapshot);
          let key:string|undefined;
          // A spare slot is claimed atomically. Another window cannot replace
          // an immutable staged payload while racing for the same slot.
          for(const candidate of previous?.spareKeys??[])if(compare(candidate,'',body)||compare(candidate,null,body)){key=candidate;break;}
          if(!key){key=newKey();if(!compare(key,null,body))throw new DiagramLibraryConflictError();}
          staged={key,body,snapshot,thumbnail};cacheDocument(key,snapshot);thumbnailCache.set(key,thumbnail);
        }
        snapshotKey=staged.key;
      }
      const entry:DiagramLibraryEntry={id,name,folderId,createdAt:previous?.createdAt??stamp,modifiedAt:snapshotKey!==existingKey?stamp:previous?.modifiedAt??stamp,openedAt:stamp,stepCount:validProject.steps.length,
        savedAt:settings.kind==='saved'?stamp:previous?.savedAt??null,draftKey:snapshotKey,savedKey:settings.kind==='saved'?snapshotKey:previous?.savedKey??null};
      const otherKeys=new Set(index.documents.filter(doc=>doc.id!==id).flatMap(doc=>[doc.draftKey,doc.savedKey,...(doc.spareKeys??[])]));
      entry.spareKeys=[...new Set([...(previous?.spareKeys??[]),previous?.draftKey,previous?.savedKey])].filter((key):key is string=>!!key&&key!==entry.draftKey&&key!==entry.savedKey&&!otherKeys.has(key)).slice(0,2);
      index.documents=previous?index.documents.map(doc=>doc.id===id?entry:doc):[...index.documents,entry];index.lastOpenId=id;
      try{write(index,expected);}catch(error){if(error instanceof DiagramLibraryConflictError&&attempt<3)continue;throw error;}
      openedHeads.set(entry.id,head(entry));staged=undefined;
      let live=index;try{live=read();}catch{/* Cleanup is optional after commit. */}
      const liveKeys=new Set(live.documents.flatMap(doc=>[doc.savedKey,doc.draftKey].filter((key):key is string=>!!key)));
      for(const [oldKey,oldBody] of previousBodies)if(!liveKeys.has(oldKey))clear(oldKey,oldBody);
      rememberContent(entry.id,project,entry);
      return structuredClone(entry);
    }}catch(error){
      if(staged){discardCache(staged.key);try{compare(staged.key,staged.body,'');}catch{/* Preserve a failed stage when cleanup cannot be verified. */}}
      throw error;
    }
    throw new DiagramLibraryConflictError();
  };
  const promoteDraft=(id:string,draftKey:string):DiagramLibraryEntry=>{
    if(hasPendingSave())throw Error('绘图正在后台保存，请等待完成后重试。');
    for(let attempt=0;attempt<4;attempt++){
      const index=read(),expected=readRaw,previous=requireEntry(index,id);
      if(openedHeads.get(id)!==head(previous)||previous.draftKey!==draftKey)throw new DiagramLibraryConflictError();
      if(previous.savedKey===draftKey)return structuredClone(previous);
      const oldKey=previous.savedKey,oldBody=oldKey?storage.getItem(oldKey):null,stamp=now();
      const entry={...previous,savedKey:draftKey,savedAt:stamp,openedAt:stamp};
      const otherKeys=new Set(index.documents.filter(doc=>doc.id!==id).flatMap(doc=>[doc.draftKey,doc.savedKey,...(doc.spareKeys??[])]));
      entry.spareKeys=[...new Set([...(previous.spareKeys??[]),oldKey])].filter((key):key is string=>!!key&&key!==draftKey&&!otherKeys.has(key)).slice(0,2);
      index.documents=index.documents.map(doc=>doc.id===id?entry:doc);index.lastOpenId=id;
      try{write(index,expected);}catch(error){if(error instanceof DiagramLibraryConflictError&&attempt<3)continue;throw error;}
      openedHeads.set(id,head(entry));
      let live=index;try{live=read();}catch{/* Cleanup remains optional after the marker is committed. */}
      if(oldKey&&!live.documents.some(doc=>doc.savedKey===oldKey||doc.draftKey===oldKey))clear(oldKey,oldBody);
      return structuredClone(entry);
    }
    throw new DiagramLibraryConflictError();
  };
  const runBackground=async()=>{
    if(backgroundRunning)return;
    const job=backgroundQueue.shift();if(!job)return;
    backgroundRunning=true;
    try{
      if(!options.backgroundSave)throw Error('后台绘图保存服务尚未准备好，当前内容仍保留。');
      const confirmed=job.settings.id?confirmedContent.get(job.settings.id):undefined;
      const unchanged=!!confirmed&&(job.settings.folderId===undefined||job.settings.folderId===confirmed.entry.folderId)&&sameDiagramProjectContent(confirmed.project,job.project);
      if(unchanged&&(job.settings.kind==='draft'||confirmed.entry.savedKey===confirmed.entry.draftKey)){
        rememberContent(confirmed.entry.id,job.project,confirmed.entry);
        for(const waiter of job.waiters)waiter.resolve(structuredClone(confirmed.entry));return;
      }
      const directoryBaseline=storage.getItem(DIAGRAM_LIBRARY_KEY);
      const result=await options.backgroundSave({...unchanged&&confirmed.entry.draftKey?{promoteDraftKey:confirmed.entry.draftKey}:{project:job.project},settings:job.settings,openedHead:job.settings.id?openedHeads.get(job.settings.id):undefined,legacyDraft:job.legacyDraft});
      validateIndex(result.index);
      if(!result.entry||!result.index.documents.some(entry=>entry.id===result.entry.id&&JSON.stringify(entry)===JSON.stringify(result.entry))||job.settings.id&&result.entry.id!==job.settings.id||result.thumbnail!==null&&typeof result.thumbnail!=='string'||!Array.isArray(result.warnings)||result.warnings.some(warning=>typeof warning!=='string'))throw Error('后台绘图保存返回了无效结果。');
      // Saving may race a later external revision. Claim only the exact head
      // committed by our worker; the next read still detects that external edit.
      openedHeads.set(result.entry.id,head(result.entry));
      rememberContent(result.entry.id,job.project,result.entry);
      cachedIndex=structuredClone(result.index);readRaw=JSON.stringify(result.index);
      committedDirectory={baseline:directoryBaseline,text:readRaw};
      // The exact worker receipt already confirms persistence. A later optional
      // cache refresh must not turn that successful save into an error.
      if(storage.getItemAsync)try{await storage.getItemAsync(DIAGRAM_LIBRARY_KEY);}catch{try{options.onWarning?.('绘图已保存，目录刷新暂未完成；当前内容仍保留。');}catch{/* A notification cannot undo the confirmed commit. */}}
      documentCache.clear();
      const liveKeys=new Set(result.index.documents.flatMap(entry=>[entry.draftKey,entry.savedKey]));
      for(const key of thumbnailCache.keys())if(!liveKeys.has(key))thumbnailCache.delete(key);
      if(result.entry.draftKey&&result.thumbnail!==null)thumbnailCache.set(result.entry.draftKey,result.thumbnail);
      for(const warning of result.warnings)try{options.onWarning?.(warning);}catch{/* Notifications cannot undo a committed save. */}
      for(const waiter of job.waiters)waiter.resolve(structuredClone(result.entry));
    }catch(error){for(const waiter of job.waiters)waiter.reject(error);}
    finally{
      backgroundRunning=false;
      if(backgroundQueue.length)void runBackground();
      else for(const resolve of backgroundIdle.splice(0))resolve();
    }
  };
  // As with edit/history snapshots, callers retain immutable project branches
  // while requests are queued. Only the latest confirmed snapshot can skip work.
  const saveAsync=(project:DiagramProject,settings:DiagramLibrarySaveOptions,saveOptions:{legacyDraft?:boolean;coalesce?:boolean}={}):Promise<DiagramLibraryEntry>=>new Promise((resolve,reject)=>{
    const last=backgroundQueue.at(-1),coalesce=saveOptions.coalesce===true;
    if(coalesce&&last?.coalesce&&last.settings.id===settings.id&&last.settings.kind===settings.kind){
      last.project=project;last.settings={...settings};last.legacyDraft=saveOptions.legacyDraft===true;last.waiters.push({resolve,reject});
    }else backgroundQueue.push({project,settings:{...settings},legacyDraft:saveOptions.legacyDraft===true,coalesce,waiters:[{resolve,reject}]});
    void runBackground();
  });
  return {
    read,readAsync,save,saveAsync,hasPendingSave,promoteDraft,
    migrateLegacyAsync(prepare:(text:string)=>Promise<DiagramProject>):Promise<DiagramLibraryIndex>{
      if(legacyMigration)return legacyMigration;
      const task=(async()=>{
        await readAsync();if(storage.getItem(DIAGRAM_LIBRARY_KEY)!==null)return read();
        const legacy=storage.getItemAsync?await storage.getItemAsync(DIAGRAM_LEGACY_DRAFT_KEY):storage.getItem(DIAGRAM_LEGACY_DRAFT_KEY);
        if(legacy){
          const project=await prepare(legacy);await readAsync();if(storage.getItem(DIAGRAM_LIBRARY_KEY)!==null)return read();
          try{await saveAsync(project,{kind:'draft',onlyIfLibraryMissing:true});}
          catch(error){if(!(error instanceof DiagramLibraryConflictError))throw error;await readAsync();if(storage.getItem(DIAGRAM_LIBRARY_KEY)===null)throw error;}
          return readAsync();
        }
        return emptyDiagramLibrary();
      })();
      legacyMigration=task;void task.finally(()=>{if(legacyMigration===task)legacyMigration=undefined;}).catch(()=>{});return task;
    },
    async loadAsync(id:string,prepare:(text:string)=>Promise<DiagramProject>,version:'latest'|'saved'='latest'):Promise<DiagramProject>{
      const entry=requireEntry(await readAsync(),id),snapshotKey=version==='saved'?entry.savedKey:entry.draftKey??entry.savedKey;
      if(!snapshotKey)throw new Error('这个绘图尚无手动保存版本。');
      const raw=storage.getItemAsync?await storage.getItemAsync(snapshotKey):storage.getItem(snapshotKey);
      if(!raw)throw new Error('绘图内容缺失，请导入备份工程。');
      let project=await prepare(raw);const latest=requireEntry(await readAsync(),id);
      if(head(entry)!==head(latest))throw new DiagramLibraryConflictError();
      if(project.name!==entry.name)project={...project,name:entry.name};openedHeads.set(id,head(entry));
      if(version==='latest'||snapshotKey===entry.draftKey)rememberContent(id,project,entry);else confirmedContent.delete(id);
      return project;
    },
    async getThumbnailAsync(id:string):Promise<string|null>{
      const entry=requireEntry(cachedIndex??read(),id),snapshotKey=(entry.draftKey??entry.savedKey)!;
      if(thumbnailCache.has(snapshotKey))return thumbnailCache.get(snapshotKey)??null;
      const loading=thumbnailLoads.get(snapshotKey);if(loading)return loading;
      const task=(async()=>{
        if(storage===preferenceStorage&&!WEB_APP){
          const result=await api<{thumbnail:string|null}>('storage/thumbnail?key='+encodeURIComponent(snapshotKey));
          if(result.thumbnail!==null&&typeof result.thumbnail!=='string')throw Error('绘图缩略图格式无效。');
          if(result.thumbnail!==null||!options.prepareThumbnail)return result.thumbnail;
          const raw=storage.getItemAsync?await storage.getItemAsync(snapshotKey):storage.getItem(snapshotKey);
          return raw?options.prepareThumbnail(raw):null;
        }
        if(storage.getItemAsync)await storage.getItemAsync(snapshotKey);
        const document=decode(snapshotKey);return document.thumbnail??diagramLibraryThumbnail(document.project);
      })();
      thumbnailLoads.set(snapshotKey,task);
      try{const thumbnail=await task;if(thumbnailLoads.get(snapshotKey)===task)thumbnailCache.set(snapshotKey,thumbnail);return thumbnail;}
      finally{if(thumbnailLoads.get(snapshotKey)===task)thumbnailLoads.delete(snapshotKey);}
    },
    getCachedThumbnail:(snapshotKey:string|null):string|null=>snapshotKey?thumbnailCache.get(snapshotKey)??null:null,
    waitForPendingSaves:():Promise<void>=>hasPendingSave()?new Promise(resolve=>backgroundIdle.push(resolve)):Promise.resolve(),
    hasExternalChanges(id:string):boolean {
      const entry=read().documents.find(entry=>entry.id===id),opened=openedHeads.get(id);
      return !entry||opened!==undefined&&opened!==head(entry);
    },
    migrateLegacy():DiagramLibraryIndex {
      // Never overwrite an existing library, even an empty one the user created.
      if(storage.getItem(DIAGRAM_LIBRARY_KEY)!==null)return read();
      const legacy=storage.getItem(DIAGRAM_LEGACY_DRAFT_KEY);
      if(legacy){save(importDiagramProject(legacy),{kind:'draft'});return read();}
      return emptyDiagramLibrary();
    },
    load(id:string,version:'latest'|'saved'='latest'):DiagramProject {
      const entry=requireEntry(read(),id),snapshotKey=version==='saved'?entry.savedKey:entry.draftKey??entry.savedKey;
      if(!snapshotKey)throw new Error('这个绘图尚无手动保存版本。');
      const project=importDiagramProject(JSON.stringify(decode(snapshotKey,true).project));project.name=entry.name;openedHeads.set(id,head(entry));
      if(version==='latest'||snapshotKey===entry.draftKey)rememberContent(id,project,entry);else confirmedContent.delete(id);
      return project;
    },
    getThumbnail(id:string):string|null {
      const entry=requireEntry(cachedIndex??read(),id),snapshotKey=(entry.draftKey??entry.savedKey)!;
      const cached=thumbnailCache.get(snapshotKey);if(cached)return cached;
      const document=decode(snapshotKey),thumbnail=document.thumbnail??diagramLibraryThumbnail(document.project);thumbnailCache.set(snapshotKey,thumbnail);return thumbnail;
    },
    markOpen(id:string):void {const index=read(),entry=requireEntry(index,id);entry.openedAt=now();index.lastOpenId=id;write(index);},
    createFolder(name:string,parentId:string|null=null):DiagramLibraryFolder {
      const index=read();if(parentId!==null&&!index.folders.some(folder=>folder.id===parentId))throw new Error('找不到父文件夹。');
      const folder:DiagramLibraryFolder={id:newId(index),name:nameOf(name),parentId,createdAt:now()};
      if(index.folders.some(item=>item.parentId===parentId&&item.name===folder.name))throw new Error('同一位置已有这个名称的文件夹。');
      index.folders.push(folder);write(index);return structuredClone(folder);
    },
    renameDocument(id:string,name:string):void {
      const index=read(),entry=requireEntry(index,id),previousHead=head(entry),opened=openedHeads.get(id);
      entry.name=nameOf(name);entry.modifiedAt=now();write(index);
      // Renaming our own open revision advances only our metadata token. A
      // stale editor must not adopt somebody else's newer drawing content.
      if(opened===previousHead)openedHeads.set(id,head(entry));
    },
    moveDocument(id:string,folderId:string|null):void {const index=read(),entry=requireEntry(index,id);if(folderId!==null&&!index.folders.some(folder=>folder.id===folderId))throw new Error('找不到目标文件夹。');entry.folderId=folderId;write(index);},
    async deleteDocument(id:string):Promise<DiagramLibraryDeleteResult> {
      let release=()=>{};
      try{
      if(storage.getItemAsync){
        await readAsync();
        const entry=requireEntry(read(),id);
        const keys=[...new Set([entry.draftKey,entry.savedKey,...(entry.spareKeys??[]),DIAGRAM_LEGACY_DRAFT_KEY])].filter((key):key is string=>!!key);
        release=storage.retainRecords?.(keys)??release;
        await Promise.all(keys.map(key=>storage.getItemAsync!(key)));
      }
      const index=read(),originalIndex=readRaw,entry=requireEntry(index,id),legacy=storage.getItem(DIAGRAM_LEGACY_DRAFT_KEY);
      const keys=new Set([entry.draftKey,entry.savedKey,...(entry.spareKeys??[])]);
      const otherKeys=new Set(index.documents.filter(doc=>doc.id!==id).flatMap(doc=>[doc.draftKey,doc.savedKey,...(doc.spareKeys??[])])),ownedBodies=new Map<string,string|null>();
      for(const snapshotKey of keys)if(snapshotKey&&!otherKeys.has(snapshotKey))ownedBodies.set(snapshotKey,storage.getItem(snapshotKey));
      let legacyProject:string|undefined;
      if(legacy)try{
        const normalized=JSON.stringify(importDiagramProject(legacy));
        for(const snapshotKey of keys)if(snapshotKey){
          try{if(JSON.stringify(importDiagramProject(exportDiagramProject(decode(snapshotKey,true).project)))===normalized){legacyProject=normalized;break;}}
          catch{/* A damaged payload must not prevent deleting its directory entry. */}
        }
      }catch{/* An unrelated or unreadable legacy backup is preserved. */}
      if(legacyProject){
        if(!globalThis.crypto?.subtle)throw new Error('无法校验旧草稿删除记录，绘图尚未删除，请重试。');
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(legacyProject));
        const signature=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
        index.deletedLegacy=[...new Set([...(index.deletedLegacy??[]),signature])];
      }
      if(storage.getItem(DIAGRAM_LIBRARY_KEY)!==originalIndex||storage.getItem(DIAGRAM_LEGACY_DRAFT_KEY)!==legacy)throw new Error('绘图库或旧草稿在删除期间发生变化，绘图尚未删除，请重试。');
      index.documents=index.documents.filter(doc=>doc.id!==id);
      if(index.lastOpenId===id)index.lastOpenId=null;
      // Commit the authoritative directory before touching any payload. Even
      // an empty directory remains a legacy-migration tombstone after restart.
      write(index,originalIndex);openedHeads.delete(id);
      const retained=new Set(index.documents.flatMap(doc=>[doc.draftKey,doc.savedKey,...(doc.spareKeys??[])]));
      let cleanupFailed=false;
      for(const [snapshotKey,body] of ownedBodies){
        if(!retained.has(snapshotKey)&&!clear(snapshotKey,body,false))cleanupFailed=true;
      }
      if(legacyProject)try{if(storage.getItem(DIAGRAM_LEGACY_DRAFT_KEY)===legacy&&!clear(DIAGRAM_LEGACY_DRAFT_KEY,legacy,false))cleanupFailed=true;}
      catch{cleanupFailed=true;}
      const warning=cleanupFailed?'绘图已删除，但部分旧修订暂未清理；请检查本机存储空间。这些修订不会重新出现在文档库。':null;
      if(warning)try{options.onWarning?.(warning);}catch{/* Cleanup/reporting cannot undo a committed deletion. */}
      return {index:structuredClone(index),warning};
      }finally{release();}
    },
  };
}
