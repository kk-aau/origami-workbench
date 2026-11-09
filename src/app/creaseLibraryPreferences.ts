import {preferenceStorage} from './preferenceStorage';

export const CREASE_LIBRARY_KEY='zhezhi.crease-library.v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CONTROL=/[\u0000-\u001f\u007f-\u009f]/;
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;

export interface CreaseLibraryFolder {id:string;name:string;parentId:string|null;createdAt:number}
export interface CreaseLibraryPreferences {
  version:1;
  folders:CreaseLibraryFolder[];
  documents:Record<string,{folderId:string|null;openedAt:number}>;
  lastOpenId:string|null;
}

export const emptyCreaseLibraryPreferences=():CreaseLibraryPreferences=>({version:1,folders:[],documents:{},lastOpenId:null});
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const timestamp=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const folderId=(value:unknown):value is string=>typeof value==='string'&&!!value&&value.length<=160&&value.trim()===value&&!CONTROL.test(value);
const documentId=(value:unknown):value is string=>typeof value==='string'&&UUID.test(value);
const keys=(value:Record<string,unknown>,expected:string[])=>Object.keys(value).every(key=>expected.includes(key));
const nameOf=(value:string)=>{
  if(typeof value!=='string'||CONTROL.test(value))throw new Error('文件夹名称须为 1 到 160 个字符，且不能包含控制字符。');
  const name=value.trim();
  if(!name||name.length>160)throw new Error('文件夹名称须为 1 到 160 个字符，且不能包含控制字符。');
  return name;
};

function validate(value:unknown):asserts value is CreaseLibraryPreferences {
  if(!record(value)||!keys(value,['version','folders','documents','lastOpenId'])||value.version!==1||!Array.isArray(value.folders)||!record(value.documents))throw new Error('折痕文档目录格式损坏，原目录未修改。');
  const folders=new Map<string,CreaseLibraryFolder>();
  for(const item of value.folders){
    if(!record(item)||!keys(item,['id','name','parentId','createdAt'])||!folderId(item.id)||folders.has(item.id)||typeof item.name!=='string'||nameOf(item.name)!==item.name||!timestamp(item.createdAt)||(item.parentId!==null&&!folderId(item.parentId)))throw new Error('折痕文件夹目录损坏，原目录未修改。');
    folders.set(item.id,item as unknown as CreaseLibraryFolder);
  }
  // A checked path is visited once, including deeply nested folders.
  const checked=new Set<string>();
  for(const item of folders.values()){
    const path=new Set<string>();let id:string|null=item.id;
    while(id!==null&&!checked.has(id)){
      if(path.has(id)||!folders.has(id))throw new Error('折痕文件夹关系损坏：存在循环或缺失的上级文件夹。');
      path.add(id);id=folders.get(id)!.parentId;
    }
    for(const ancestor of path)checked.add(ancestor);
  }
  for(const [id,item] of Object.entries(value.documents)){
    if(!documentId(id)||!record(item)||!keys(item,['folderId','openedAt'])||!timestamp(item.openedAt)||(item.folderId!==null&&(typeof item.folderId!=='string'||!folders.has(item.folderId))))throw new Error('折痕文档分类或最近打开记录损坏，原目录未修改。');
  }
  if(value.lastOpenId!==null&&(!documentId(value.lastOpenId)||!Object.hasOwn(value.documents,value.lastOpenId)))throw new Error('上次折痕文档记录损坏，原目录未修改。');
}

/** Stores only organization and open history; project files remain independent. */
export function readCreaseLibraryPreferences(storage:StorageAccess=preferenceStorage):CreaseLibraryPreferences {
  const text=storage.getItem(CREASE_LIBRARY_KEY);
  if(text===null)return emptyCreaseLibraryPreferences();
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw new Error('折痕文档目录 JSON 损坏，原目录未修改。');}
  validate(value);return structuredClone(value);
}

export function saveCreaseLibraryPreferences(value:CreaseLibraryPreferences,storage:StorageAccess=preferenceStorage):void {
  validate(value);storage.setItem(CREASE_LIBRARY_KEY,JSON.stringify(value));
}

export function createCreaseLibraryFolder(value:CreaseLibraryPreferences,name:string,parentId:string|null=null,idFactory:()=>string=()=>crypto.randomUUID(),now:number=Date.now()):CreaseLibraryPreferences {
  validate(value);const trimmed=nameOf(name);
  if(parentId!==null&&!value.folders.some(folder=>folder.id===parentId))throw new Error('找不到上级文件夹。');
  const id=idFactory();
  if(!folderId(id)||value.folders.some(folder=>folder.id===id))throw new Error('文件夹编号无效或重复，请重试。');
  if(!timestamp(now))throw new Error('文件夹创建时间无效。');
  return {...value,folders:[...value.folders,{id,name:trimmed,parentId,createdAt:now}],documents:{...value.documents}};
}

export function moveCreaseLibraryDocument(value:CreaseLibraryPreferences,id:string,targetFolderId:string|null):CreaseLibraryPreferences {
  validate(value);
  if(!documentId(id))throw new Error('折痕文档编号无效。');
  if(targetFolderId!==null&&!value.folders.some(folder=>folder.id===targetFolderId))throw new Error('找不到目标文件夹。');
  return {...value,folders:[...value.folders],documents:{...value.documents,[id]:{folderId:targetFolderId,openedAt:value.documents[id]?.openedAt??0}}};
}

export function markCreaseLibraryDocumentOpen(value:CreaseLibraryPreferences,id:string,now:number=Date.now()):CreaseLibraryPreferences {
  validate(value);
  if(!documentId(id))throw new Error('折痕文档编号无效。');
  if(!timestamp(now))throw new Error('折痕文档打开时间无效。');
  return {...value,folders:[...value.folders],documents:{...value.documents,[id]:{folderId:value.documents[id]?.folderId??null,openedAt:now}},lastOpenId:id};
}

export function removeCreaseLibraryDocument(value:CreaseLibraryPreferences,id:string):CreaseLibraryPreferences {
  validate(value);
  if(!documentId(id))throw new Error('折痕文档编号无效。');
  const documents={...value.documents};delete documents[id];
  return {...value,folders:[...value.folders],documents,lastOpenId:value.lastOpenId===id?null:value.lastOpenId};
}
