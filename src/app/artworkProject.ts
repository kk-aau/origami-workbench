import {validateDoc,type Doc} from '../core/types';
import {prepareProjectImport} from './prepareProjectImport';
import {exportModelCollection,prepareModelCollection} from './modelCollectionFile';
import {emptyFoldedModelCollection,foldedModelCollectionReducer,type FoldedModelCollection} from './foldedModelCollection';
import {exportDiagramProject,importDiagramProject,type DiagramProject} from './diagramProject';
import {readTessParams,type TessParams} from './tessellation';
import {parseCurveDesign,type CurveDesign} from './curveDesign';
import {validateSimulationPose,type SimulationPose} from '../engine/simPose';
import {exportModelSnapshot} from '../core/modelSnapshot';
import {validateBaseDesign,type BaseDesignProject} from './baseDesign';

export const ARTWORK_FORMAT='zhezhi-artwork';
export interface ArtworkConstruction {tessellation:TessParams;curve:CurveDesign|null}
/** Sources remain independent: a saved model or drawing can predate the editor CP. */
export interface ArtworkProject {
  editor:Doc;
  models:FoldedModelCollection;
  diagram:DiagramProject|null;
  simulation:SimulationPose|null;
  construction:ArtworkConstruction;
  design?:BaseDesignProject|null;
}

function record(value:unknown,keys:string[],label:string):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw new Error(`${label}字段不完整或版本不支持。`);
  return value as Record<string,unknown>;
}
function construction(value:unknown):ArtworkConstruction {
  const raw=record(value,['tessellation','curve'],'作品构造参数'),tessellation=readTessParams(raw.tessellation);
  if(!tessellation)throw new Error('作品中的镶嵌构造参数无效，未替换当前作品。');
  return {tessellation:structuredClone(tessellation),curve:raw.curve===null?null:parseCurveDesign(raw.curve)};
}

/** The standalone collection requires a selected model. Artwork also preserves
 * the legitimate detached state without discarding its other saved models. */
function exportModels(editor:Doc,collection:FoldedModelCollection,snapshotExport:typeof exportModelSnapshot):unknown {
  if(!collection.entries.length){
    if(collection.activeId!==null)throw new Error('空模型集合不能包含活动模型编号。');
    return null;
  }
  const normalized={...collection,activeId:collection.activeId??collection.entries[0].id};
  const raw=JSON.parse(exportModelCollection(editor,normalized,snapshotExport));
  return {activeId:collection.activeId,entries:raw.models};
}
function prepareModels(editor:Doc,value:unknown):FoldedModelCollection {
  if(value===null)return emptyFoldedModelCollection();
  const raw=record(value,['activeId','entries'],'作品模型集合');
  if(!Array.isArray(raw.entries)||!raw.entries.length)throw new Error('作品模型集合为空，请使用空值表示尚未建立模型。');
  if(raw.activeId!==null&&(typeof raw.activeId!=='string'||!raw.activeId.trim()))throw new Error('作品活动模型编号无效。');
  const first=raw.entries[0],fallback=first&&typeof first==='object'?first.id:undefined;
  const version=raw.entries.some(entry=>entry&&typeof entry==='object'&&Object.hasOwn(entry,'cpKey'))?3:2;
  const {collection}=prepareModelCollection(JSON.stringify({format:'zhezhi-model-collection',version,editor,activeId:raw.activeId??fallback,models:raw.entries}));
  return raw.activeId===null?foldedModelCollectionReducer(collection,{type:'detach'}):collection;
}

/** Downloading is a backup operation, not an acknowledgement that independent
 * documents reached their storage destinations. Never mutate their dirty state. */
export interface ArtworkExportCodecs {snapshot?:typeof exportModelSnapshot;diagram?:typeof exportDiagramProject}
export function exportArtworkProject(project:ArtworkProject,codecs:ArtworkExportCodecs={}):string {
  validateDoc(project.editor);
  const design=project.design?validateBaseDesign(project.design):null;
  const payload={format:ARTWORK_FORMAT,version:design?2:1,...(design?{design}:{}),editor:project.editor,
    models:exportModels(project.editor,project.models,codecs.snapshot??exportModelSnapshot),
    diagram:project.diagram===null?null:JSON.parse((codecs.diagram??exportDiagramProject)(project.diagram)),
    simulation:project.simulation===null?null:validateSimulationPose(project.simulation),
    construction:construction(project.construction)};
  return JSON.stringify(payload);
}

/** Every part is prepared before publication. No caller should update a
 * workspace until this returns, even when an invalid part appears last. */
export function prepareArtworkProject(text:string):ArtworkProject {
  let parsed:unknown;
  try{parsed=JSON.parse(text);}catch{throw new Error('完整作品不是有效 JSON。');}
  const version=parsed&&typeof parsed==='object'?(parsed as {version?:unknown}).version:null;
  const raw=record(parsed,['format','version','editor','models','diagram','simulation','construction',...(version===2?['design']:[])],'完整作品');
  if(raw.format!==ARTWORK_FORMAT||![1,2].includes(raw.version as number))throw new Error('不支持的完整作品格式或版本。');
  validateDoc(raw.editor);
  const editor=prepareProjectImport(raw.editor),settings=construction(raw.construction),
    models=prepareModels(editor,raw.models),
    diagram=raw.diagram===null?null:importDiagramProject(JSON.stringify(raw.diagram)),
    simulation=raw.simulation===null?null:validateSimulationPose(raw.simulation);
  return {editor,models,diagram,simulation,construction:settings,...(version===2?{design:raw.design===null?null:validateBaseDesign(raw.design)}:{})};
}
