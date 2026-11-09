import {validateDoc,type Doc} from '../core/types';
import {exportModelSnapshot} from '../core/modelSnapshot';
import {upgradeProject} from '../core/project';
import {splitEditableSegments} from './planarize';
import {prepareModelSnapshot} from './modelSnapshot';
import {emptyFoldedModelCollection,foldedModelCollectionReducer,type FoldedModelCollection} from './foldedModelCollection';
import {copyModelView} from './modelViewState';
import {foldSourceCpKey,validateFoldSourceCpKey} from './foldSelection';

const FORMAT='zhezhi-model-collection';
function record(value:unknown,keys:string[],label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw new Error(`${label}字段不完整或格式不支持。`);
  return value as Record<string,unknown>;
}
function label(value:unknown,kind:string):string{
  if(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f]/.test(value))throw new Error(`${kind}必须为 1—200 字符的非空文本。`);
  return value;
}

/** The editor document can differ from any model's calculation-time source. Save both. */
export function exportModelCollection(doc:Doc,collection:FoldedModelCollection,snapshotExport:typeof exportModelSnapshot=exportModelSnapshot):string{
  validateDoc(doc);
  if(!collection.entries.length||!collection.activeId||!collection.entries.some(e=>e.id===collection.activeId))throw new Error('请先选择要保存的活动模型；进行中的计算不包含在集合内。');
  const ids=new Set<string>();
  const models=collection.entries.map(entry=>{
    const id=label(entry.id,'模型编号'),name=label(entry.name,'模型名称');
    if(ids.has(id))throw new Error('模型编号重复。');ids.add(id);
    if(!entry.history.present)throw new Error('集合包含无结果的模型，未保存。');
    const cpKey=entry.source.cpKey??foldSourceCpKey(entry.source.doc);validateFoldSourceCpKey(cpKey);
    return {id,name,cpKey,snapshot:JSON.parse(snapshotExport(entry.source.doc,entry.history.present)),view:copyModelView(entry.view)};
  });
  return JSON.stringify({format:FORMAT,version:3,editor:doc,activeId:collection.activeId,models});
}

/** Validate every entry before publishing anything; corrupted later entries cannot partially replace work. */
export function prepareModelCollection(text:string):{doc:Doc;collection:FoldedModelCollection}{
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new Error('模型集合不是有效 JSON。');}
  const value=record(parsed,['format','version','editor','activeId','models'],'模型集合');
  if(value.format!==FORMAT||![1,2,3].includes(value.version as number))throw new Error('不支持的模型集合格式或版本。');
  validateDoc(value.editor);
  const doc=splitEditableSegments(upgradeProject(value.editor));validateDoc(doc);
  const activeId=label(value.activeId,'活动模型编号');
  if(!Array.isArray(value.models)||!value.models.length)throw new Error('模型集合不能为空。');
  // Validate cheap envelope checks for every entry before rebuilding any topology.
  const ids=new Set<string>(),entries=value.models.map(raw=>{
    const hasKey=value.version===3&&!!raw&&typeof raw==='object'&&Object.hasOwn(raw,'cpKey');
    const entry=record(raw,value.version===1?['id','name','snapshot']:['id','name','snapshot','view',...(hasKey?['cpKey']:[])],'集合模型'),id=label(entry.id,'模型编号'),name=label(entry.name,'模型名称');
    if(hasKey)validateFoldSourceCpKey(entry.cpKey);
    const view=copyModelView(entry.view as Parameters<typeof copyModelView>[0]);
    if(ids.has(id))throw new Error('模型编号重复。');ids.add(id);return {id,name,snapshot:entry.snapshot,view,cpKey:entry.cpKey as string|undefined};
  });
  if(!ids.has(activeId))throw new Error('活动模型不在集合中。');
  // Each validated saved entry is restored independently. Legacy files may
  // exceed today's creation quota; restoration never deletes their results.
  const restored=entries.map(entry=>{
    const prepared=prepareModelSnapshot(JSON.stringify(entry.snapshot),{preserveStartingFace:true});
    let collection=foldedModelCollectionReducer(emptyFoldedModelCollection(),{type:'add',id:entry.id,name:entry.name,source:{doc:prepared.doc,graph:prepared.graph,...(entry.cpKey===undefined?{}:{cpKey:entry.cpKey})},result:prepared.result});
    collection=foldedModelCollectionReducer(collection,{type:'view',id:entry.id,view:entry.view});
    return collection.entries[0];
  });
  return {doc,collection:{entries:restored,activeId,generation:0}};
}
