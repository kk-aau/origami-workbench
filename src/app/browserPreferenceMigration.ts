import {createDiagramLibrary,emptyDiagramLibrary,diagramLibraryThumbnail,DIAGRAM_LIBRARY_KEY,DIAGRAM_LEGACY_DRAFT_KEY,type DiagramLibraryIndex,type DiagramLibraryEntry,type DiagramLibraryFolder} from './diagramLibrary';
import {importDiagramProject,type DiagramProject} from './diagramProject';

type StorageAccess=Pick<Storage,'getItem'|'setItem'>&{compareAndSet?:(key:string,expectedValue:string|null,value:string)=>boolean};
const DOCUMENT_KEY=/^zhezhi\.diagram-library-doc-[a-p]{32}\.v1$/;
const ID=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=160;
interface ImportReceipts {version:1;documents:Record<string,string>;folders:Record<string,string>;legacy:Record<string,string>}
type MigrationIndex=DiagramLibraryIndex&{browserImports?:ImportReceipts};
interface StagedWrite {key:string;value:string;previous:string|null}
export interface BrowserPreferenceMigrationResult {importedDocuments:number;importedFolders:number;copiedValues:number;indexChanged:boolean}
export interface BrowserPreferenceMigrationOptions {keys?:readonly string[]}

async function fingerprint(value:string):Promise<string> {
  if(!globalThis.crypto?.subtle)throw new Error('当前浏览器无法校验绘图迁移，原浏览器数据已保留。');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
function cachedStorage(storage:StorageAccess) {
  const values=new Map<string,string|null>();
  return {getItem(key:string){if(!values.has(key))values.set(key,storage.getItem(key));return values.get(key)!;},setItem(){throw new Error('迁移规划期间不能写入存储。');}};
}
function receiptsOf(index:MigrationIndex):ImportReceipts {
  if(index.browserImports===undefined)return {version:1,documents:{},folders:{},legacy:{}};
  const value=index.browserImports;
  if(!value||value.version!==1||['documents','folders','legacy'].some(kind=>{
    const items=value[kind as 'documents'];return !items||typeof items!=='object'||Array.isArray(items)||Object.entries(items).some(([key,id])=>!/^[a-f0-9]{64}$/.test(key)||!ID(id));
  }))throw new Error('浏览器绘图迁移记录损坏，原浏览器数据已保留。');
  return structuredClone(value);
}
async function readLibrary(storage:StorageAccess) {
  const cached=cachedStorage(storage),raw=cached.getItem(DIAGRAM_LIBRARY_KEY),library=createDiagramLibrary(cached),index=library.read() as MigrationIndex;
  const snapshots=new Map<string,{raw:string;signature:string}>();
  for(const entry of index.documents)for(const [key,version] of [[entry.savedKey,'saved'],[entry.draftKey??entry.savedKey,'latest']] as const) {
    if(!key||snapshots.has(key))continue;
    // Reuse the library's wrapper and complete project validation. The encoded
    // project name is retained for identity; an index rename is only a label.
    library.load(entry.id,version);
    const body=cached.getItem(key)!;const project=importDiagramProject(JSON.stringify(JSON.parse(body).project));
    snapshots.set(key,{raw:body,signature:await fingerprint(JSON.stringify(project))});
  }
  return {cached,raw,index,snapshots};
}
const latestKey=(entry:DiagramLibraryEntry)=>entry.draftKey??entry.savedKey;
function distinctName(name:string,siblings:readonly {name:string}[],suffix='浏览器副本') {
  if(!siblings.some(item=>item.name===name))return name;
  let n=1;for(;;){const tail=`（${suffix}${n===1?'':' '+n}）`,candidate=name.slice(0,160-tail.length)+tail;if(!siblings.some(item=>item.name===candidate))return candidate;n++;}
}

/** Merge immutable snapshots first, then commit the directory and its import
 * receipts together. Receipts live in the index so an index-write failure can
 * never falsely mark an unreferenced payload as imported. Ordinary library
 * operations preserve this optional internal index field unchanged. */
export async function migrateBrowserPreferenceStorage(source:StorageAccess,target:StorageAccess,options:BrowserPreferenceMigrationOptions={}):Promise<BrowserPreferenceMigrationResult> {
  const compare=(key:string,expected:string|null,value:string)=>{
    if(target.compareAndSet)return target.compareAndSet(key,expected,value);
    // Read-only validation/embedded synchronous stores have no inter-process
    // writers. Official service/desktop targets always supply atomic CAS.
    if(target.getItem(key)!==expected)return false;target.setItem(key,value);return target.getItem(key)===value;
  };
  const local=await readLibrary(source),disk=await readLibrary(target),merged=structuredClone(disk.index) as MigrationIndex;
  const deletedLegacy=new Set([...(local.index.deletedLegacy??[]),...(disk.index.deletedLegacy??[])]);
  if(deletedLegacy.size)merged.deletedLegacy=[...deletedLegacy];
  const receipts=receiptsOf(disk.index),writes:StagedWrite[]=[],usedIds=new Set([...merged.documents,...merged.folders].map(item=>item.id));
  const occupiedKeys=new Set(merged.documents.flatMap(entry=>[entry.draftKey,entry.savedKey,...(entry.spareKeys??[])].filter((key):key is string=>!!key)));
  const liveTargetKeys=new Set(disk.index.documents.flatMap(entry=>[entry.draftKey,entry.savedKey].filter((key):key is string=>!!key)));
  const bodyMap=new Map<string,string>(),targetSnapshots=new Map(disk.snapshots),folderMap=new Map<string,string|null>();
  let importedDocuments=0,importedFolders=0;
  function allocateId(preferred:string,signature:string) {
    if(ID(preferred)&&!usedIds.has(preferred)){usedIds.add(preferred);return preferred;}
    const base='browser-'+signature.slice(0,32);let value=base,n=2;
    while(usedIds.has(value))value=base+'-'+n++;usedIds.add(value);return value;
  }
  async function placeBody(sourceKey:string,raw:string,signature:string) {
    const identity=await fingerprint('body:'+sourceKey+':'+raw);
    if(bodyMap.has(identity))return bodyMap.get(identity)!;
    // Only current live payloads are protected by the final index CAS. An
    // identical orphan/spare body may still be awaiting another writer's cleanup.
    if(liveTargetKeys.has(sourceKey)&&disk.cached.getItem(sourceKey)===raw){bodyMap.set(identity,sourceKey);return sourceKey;}
    let key=sourceKey,n=0;
    while(occupiedKeys.has(key)||disk.cached.getItem(key)!==null) {
      const digest=await fingerprint(`payload:${sourceKey}:${signature}:${n++}`);
      key=`zhezhi.diagram-library-doc-${Array.from(digest.slice(0,32),digit=>'abcdefghijklmnop'[parseInt(digit,16)]).join('')}.v1`;
    }
    const previous=disk.cached.getItem(key);if(previous!==raw)writes.push({key,value:raw,previous});
    occupiedKeys.add(key);bodyMap.set(identity,key);targetSnapshots.set(key,{raw,signature});return key;
  }
  const folderSignatures=new Map<string,string>();
  function folderPath(id:string|null):string {
    if(id===null)return '';
    const row=local.index.folders.find(folder=>folder.id===id)!;
    return folderPath(row.parentId)+'/'+JSON.stringify([row.id,row.name]);
  }
  const remaining=[...local.index.folders];
  while(remaining.length) {
    const index=remaining.findIndex(folder=>folder.parentId===null||folderMap.has(folder.parentId));
    if(index<0)throw new Error('浏览器绘图文件夹关系损坏，原数据已保留。');
    const folder=remaining.splice(index,1)[0];
    const signature=await fingerprint('folder:'+folderPath(folder.id));folderSignatures.set(folder.id,signature);
    const prior=receipts.folders[signature];
    if(prior){folderMap.set(folder.id,merged.folders.some(row=>row.id===prior)?prior:null);continue;}
    const parentId=folder.parentId===null?null:folderMap.get(folder.parentId)??null;
    const matching=merged.folders.find(row=>row.name===folder.name&&row.parentId===parentId);
    if(matching){folderMap.set(folder.id,matching.id);receipts.folders[signature]=matching.id;continue;}
    const id=allocateId(folder.id,signature),siblings=merged.folders.filter(row=>row.parentId===parentId);
    const added:DiagramLibraryFolder={...folder,id,parentId,name:distinctName(folder.name,siblings)};
    merged.folders.push(added);folderMap.set(folder.id,id);receipts.folders[signature]=id;importedFolders++;
  }
  for(const entry of local.index.documents) {
    const latest=local.snapshots.get(latestKey(entry)!)!,saved=entry.savedKey?local.snapshots.get(entry.savedKey)!:null;
    const signature=await fingerprint(JSON.stringify(['document',entry.id,entry.name,entry.folderId?folderSignatures.get(entry.folderId):null,latest.signature,saved?.signature??null]));
    if(receipts.documents[signature])continue;
    const existing=merged.documents.find(row=>row.id===entry.id),existingLatest=existing?targetSnapshots.get(latestKey(existing)!):null,existingSaved=existing?.savedKey?targetSnapshots.get(existing.savedKey):null;
    if(existing&&existingLatest?.signature===latest.signature&&(!saved||existingSaved?.signature===saved.signature)){receipts.documents[signature]=existing.id;continue;}
    const id=allocateId(entry.id,signature),name=distinctName(entry.name,merged.documents);
    const draftKey=entry.draftKey?await placeBody(entry.draftKey,local.snapshots.get(entry.draftKey)!.raw,local.snapshots.get(entry.draftKey)!.signature):null;
    const savedKey=entry.savedKey?await placeBody(entry.savedKey,local.snapshots.get(entry.savedKey)!.raw,local.snapshots.get(entry.savedKey)!.signature):null;
    const added:DiagramLibraryEntry={...entry,id,name,folderId:entry.folderId===null?null:folderMap.get(entry.folderId)??null,draftKey,savedKey};delete added.spareKeys;
    merged.documents.push(added);receipts.documents[signature]=id;importedDocuments++;
  }
  async function preserveLegacy(raw:string|null,origin:'browser'|'service') {
    if(!raw)return null;
    const project=importDiagramProject(raw),signature=await fingerprint(JSON.stringify(project));
    if(deletedLegacy.has(signature))return null;
    const receipt=await fingerprint('legacy:'+origin+':'+signature);
    if(receipts.legacy[receipt])return {id:receipts.legacy[receipt],signature};
    const existing=merged.documents.find(entry=>[entry.draftKey,entry.savedKey].some(key=>key&&targetSnapshots.get(key)?.signature===signature));
    if(existing){receipts.legacy[receipt]=existing.id;return {id:existing.id,signature};}
    const id=allocateId('',receipt),name=distinctName(project.name,merged.documents,origin==='browser'?'浏览器旧草稿':'原目录旧草稿'),stamp=Date.now();
    const body=JSON.stringify({format:'zhezhi-diagram-library-document',version:1,project,thumbnail:diagramLibraryThumbnail(project)});
    const digest=await fingerprint('legacy-payload:'+signature),originalKey=`zhezhi.diagram-library-doc-${Array.from(digest.slice(0,32),digit=>'abcdefghijklmnop'[parseInt(digit,16)]).join('')}.v1`;
    const draftKey=await placeBody(originalKey,body,signature);
    merged.documents.push({id,name,folderId:null,createdAt:stamp,modifiedAt:stamp,openedAt:stamp,stepCount:project.steps.length,savedAt:null,draftKey,savedKey:null});receipts.legacy[receipt]=id;importedDocuments++;
    return {id,signature};
  }
  const diskLegacy=disk.cached.getItem(DIAGRAM_LEGACY_DRAFT_KEY),localLegacy=source.getItem(DIAGRAM_LEGACY_DRAFT_KEY);
  await preserveLegacy(diskLegacy,'service');const importedLegacy=await preserveLegacy(localLegacy,'browser');
  if(localLegacy!==null&&diskLegacy===null&&(!localLegacy||importedLegacy)) {
    writes.unshift({key:DIAGRAM_LEGACY_DRAFT_KEY,value:localLegacy,previous:null});
    // Copying the legacy backup creates this service-side fingerprint as well;
    // record it now, so a later edited drawing cannot resurrect the old backup.
    if(importedLegacy)receipts.legacy[await fingerprint('legacy:service:'+importedLegacy.signature)]=importedLegacy.id;
  }
  if(merged.lastOpenId===null) {
    const localLast=local.index.documents.find(entry=>entry.id===local.index.lastOpenId);
    if(localLast){const latest=local.snapshots.get(latestKey(localLast)!)!,saved=localLast.savedKey?local.snapshots.get(localLast.savedKey)!:null;
      const signature=await fingerprint(JSON.stringify(['document',localLast.id,localLast.name,localLast.folderId?folderSignatures.get(localLast.folderId):null,latest.signature,saved?.signature??null])),id=receipts.documents[signature];
      merged.lastOpenId=merged.documents.some(entry=>entry.id===id)?id:null;
    }
    if(merged.lastOpenId===null&&merged.documents.length)merged.lastOpenId=merged.documents.at(-1)!.id;
  }
  if(Object.values(receipts).some(value=>typeof value==='object'&&Object.keys(value).length))merged.browserImports=receipts;
  const indexText=JSON.stringify(merged),indexChanged=indexText!==(disk.raw||JSON.stringify(emptyDiagramLibrary()));
  const staged=new Map(writes.map(write=>[write.key,write.value]));
  // Validate folder/document references and every staged saved/latest body before
  // the first persistent write. The standard library validator remains the source.
  const check=createDiagramLibrary({getItem:key=>key===DIAGRAM_LIBRARY_KEY?indexText:staged.get(key)??disk.cached.getItem(key),setItem(){throw Error('只读校验');}});
  for(const entry of check.read().documents){check.load(entry.id);if(entry.savedKey)check.load(entry.id,'saved');}
  for(const key of options.keys??[]) {
    if(key===DIAGRAM_LIBRARY_KEY||key===DIAGRAM_LEGACY_DRAFT_KEY||DOCUMENT_KEY.test(key))continue;
    const value=source.getItem(key);if(value!==null)compare(key,null,value);
  }
  let copiedValues=0;
  for(const write of writes) {
    const current=target.getItem(write.key);
    if(current===write.value)continue;
    if(current!==write.previous||!compare(write.key,write.previous,write.value))throw new Error('保存目录在其他窗口中发生变化，迁移尚未提交，请重试。');
    copiedValues++;
  }
  if(indexChanged) {
    if(!compare(DIAGRAM_LIBRARY_KEY,disk.raw,indexText))throw new Error('绘图库在其他窗口中发生变化，迁移尚未提交，原浏览器绘图仍已保留，请重试。');
    copiedValues++;
  }
  return {importedDocuments,importedFolders,copiedValues,indexChanged};
}
