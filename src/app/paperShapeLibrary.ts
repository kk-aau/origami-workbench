import {preferenceStorage,type Preferences} from './preferenceStorage';
import {validatePaperShape,type PaperShape} from './paperShapes';

export const PAPER_SHAPE_LIBRARY_KEY='zhezhi.paper-shapes.v1';
export interface SavedPaperShape {id:string;name:string;shape:PaperShape;createdAt:number}
type StorageAccess=Preferences;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CONTROL=/[\u0000-\u001f\u007f-\u009f]/;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,allowed:string[])=>Object.keys(value).every(key=>allowed.includes(key));
function nameOf(value:unknown):string{
 if(typeof value!=='string'||CONTROL.test(value)||!value.trim()||value.trim().length>160)throw Error('纸形名称须为 1 到 160 个字符，且不能包含控制字符。');
 return value.trim();
}
function decode(text:string|null):SavedPaperShape[]{
 if(text===null)return [];
 let value:unknown;try{value=JSON.parse(text);}catch{throw Error('纸形库 JSON 损坏，原数据已保留。');}
 if(!record(value)||!keys(value,['version','shapes'])||value.version!==1||!Array.isArray(value.shapes))throw Error('纸形库格式不支持或已损坏，原数据已保留。');
 const seen=new Set<string>();
 return value.shapes.map(item=>{
  if(!record(item)||!keys(item,['id','name','shape','createdAt'])||typeof item.id!=='string'||!UUID.test(item.id)||seen.has(item.id)||typeof item.name!=='string'||nameOf(item.name)!==item.name||!Number.isSafeInteger(item.createdAt)||(item.createdAt as number)<0)throw Error('纸形库条目损坏，原数据已保留。');
  seen.add(item.id);
  let shape:PaperShape;
  try{shape=validatePaperShape(item.shape);}catch(error){throw Error('纸形库包含无效边界，原数据已保留：'+(error instanceof Error?error.message:String(error)));}
  return {id:item.id,name:item.name,shape:structuredClone(shape),createdAt:item.createdAt as number};
 });
}
function write(storage:StorageAccess,expected:string|null,shapes:SavedPaperShape[]):void{
 const value=JSON.stringify({version:1,shapes});
 const conflict=()=>Error('纸形库已在其他窗口修改，本次未覆盖原数据，请刷新后重试。');
 // Official desktop/service stores implement atomic CAS. An explicitly supplied
 // single-page store can still be used without introducing a second data path.
 if(storage.compareAndSet){if(!storage.compareAndSet(PAPER_SHAPE_LIBRARY_KEY,expected,value))throw conflict();}
 else{
  if(storage.getItem(PAPER_SHAPE_LIBRARY_KEY)!==expected)throw conflict();
  storage.setItem(PAPER_SHAPE_LIBRARY_KEY,value);
 }
}
export function readPaperShapeLibrary(storage:StorageAccess=preferenceStorage):SavedPaperShape[]{
 return decode(storage.getItem(PAPER_SHAPE_LIBRARY_KEY));
}
export function savePaperShape(name:string,shape:PaperShape,storage:StorageAccess=preferenceStorage):SavedPaperShape[]{
 const label=nameOf(name),checked=structuredClone(validatePaperShape(shape)),text=storage.getItem(PAPER_SHAPE_LIBRARY_KEY),saved=decode(text);
 const entry:SavedPaperShape={id:crypto.randomUUID(),name:label,shape:checked,createdAt:Date.now()};
 const next=[entry,...saved];
 write(storage,text,next);return structuredClone(next);
}
export function removePaperShape(id:string,storage:StorageAccess=preferenceStorage):SavedPaperShape[]{
 if(typeof id!=='string'||!UUID.test(id))throw Error('纸形编号无效。');
 const text=storage.getItem(PAPER_SHAPE_LIBRARY_KEY),saved=decode(text);
 if(!saved.some(item=>item.id===id))throw Error('找不到此纸形模板，可能已在其他窗口删除，请刷新后重试。');
 const next=saved.filter(item=>item.id!==id);
 write(storage,text,next);return structuredClone(next);
}
