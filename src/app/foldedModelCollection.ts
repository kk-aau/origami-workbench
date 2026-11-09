import type {Doc,FoldGraph,FlatFoldResult} from '../core/types';
import {copyModelView,validateModelBoardPlacement,type ModelBoardPlacement,type ModelViewState} from './modelViewState';
import {emptyFoldedModelHistory,foldedModelHistoryReducer,hasUnsavedModelEdits,type FoldedModelHistory,type FoldedModelAction} from './foldedModelHistory';
import {foldSourceCpKey,validateFoldSourceCpKey} from './foldSelection';

export interface FoldedModelEntry {
  id:string;name:string;
  source:{doc:Doc;graph:FoldGraph;cpKey?:string};
  history:FoldedModelHistory;
  view?:ModelViewState;
}
export interface FoldedModelCollection {
  entries:FoldedModelEntry[];
  activeId:string|null;
  /** Geometry/selection generation; view-only changes do not invalidate analysis tickets. */
  generation:number;
}
export interface ModelAnalysisTicket {id:string;generation:number;revision:number;source?:FoldedModelEntry['source']}
export const MAX_FOLDED_MODELS_PER_CP=4;
export function countFoldedModelsForCp(state:FoldedModelCollection,key:string):number{
  return state.entries.filter(entry=>(entry.source.cpKey??foldSourceCpKey(entry.source.doc))===key).length;
}
export const emptyFoldedModelCollection=():FoldedModelCollection=>({entries:[],activeId:null,generation:0});
export const activeFoldedModel=(state:FoldedModelCollection)=>state.entries.find(e=>e.id===state.activeId)??null;
export const collectionHasUnsavedEdits=(state:FoldedModelCollection)=>state.entries.some(e=>hasUnsavedModelEdits(e.history));
export function modelAnalysisTicket(state:FoldedModelCollection):ModelAnalysisTicket|null{
  const active=activeFoldedModel(state);
  return active?.history.present?{id:active.id,generation:state.generation,revision:active.history.revision,source:active.source}:null;
}
export type ModelCollectionAction=
  |{type:'add';id:string;name:string;source:FoldedModelEntry['source'];result:FlatFoldResult}
  |{type:'snapshot-copy';id:string;name:string}
  |{type:'select';id:string}
  |{type:'remove';id:string}
  |{type:'rename';id:string;name:string}
  |{type:'view';id:string;view:ModelViewState}
  |{type:'canvas-view';id:string;source:FoldedModelEntry['source'];view:ModelViewState}
  |{type:'board';id:string;placement:ModelBoardPlacement}
  |{type:'edit';action:Exclude<FoldedModelAction,{type:'analysis'}>}
  |{type:'analysis';ticket:ModelAnalysisTicket;result:FlatFoldResult}
  |{type:'clear'};

/** UI must confirm destructive remove/clear. New results are bounded per CP;
 * old imported collections retain every existing result. */
export function foldedModelCollectionReducer(state:FoldedModelCollection,action:ModelCollectionAction|{type:'detach'}):FoldedModelCollection{
  const active=activeFoldedModel(state);
  const next=(entries:FoldedModelEntry[],activeId=state.activeId):FoldedModelCollection=>({entries,activeId,generation:state.generation+1});
  if(action.type==='board'){
    const entry=state.entries.find(e=>e.id===action.id);if(!entry)return state;
    validateModelBoardPlacement(action.placement);
    if(JSON.stringify(entry.view?.board)===JSON.stringify(action.placement))return state;
    return {...state,entries:state.entries.map(e=>e.id===entry.id?{...e,view:{...copyModelView(e.view),board:{...action.placement}}}:e)};
  }
  if(action.type==='view'||action.type==='canvas-view'){
    // A callback from an unmounted/inactive model cannot update the newly selected one.
    const target=action.type==='canvas-view'?state.entries.find(e=>e.id===action.id&&e.source===action.source):active?.id===action.id?active:null;
    if(!target)return state;
    const view=copyModelView(action.view);
    if(JSON.stringify(target.view)===JSON.stringify(view))return state;
    return {...state,entries:state.entries.map(e=>e.id===target.id?{...e,view}:e)};
  }
  if(action.type==='detach')return state.activeId===null?state:next(state.entries,null);
  if(action.type==='add'||action.type==='snapshot-copy'){
    if(!action.id.trim()||state.entries.some(e=>e.id===action.id))throw new Error('模型编号为空或已存在。');
    const source=action.type==='add'?action.source:active?.source;
    const result=action.type==='add'?action.result:active?.history.present;
    if(!source||!result||result.geometry.status!=='ready')throw new Error('只能保留具有有效几何的模型。');
    const cpKey=source.cpKey??foldSourceCpKey(source.doc);validateFoldSourceCpKey(cpKey);
    if(countFoldedModelsForCp(state,cpKey)>=MAX_FOLDED_MODELS_PER_CP)throw new Error(`每张 CP 最多保留 ${MAX_FOLDED_MODELS_PER_CP} 个平折结果，请先删除这张 CP 的一个结果再生成。`);
    const entry:FoldedModelEntry={id:action.id,name:action.name.trim()||'未命名模型',source:structuredClone({...source,cpKey}),history:foldedModelHistoryReducer(emptyFoldedModelHistory(),{type:'replace',result})};
    entry.view=copyModelView(action.type==='snapshot-copy'?active?.view:undefined);
    if(entry.view.board)entry.view.board={...entry.view.board,x:Math.min(100000,entry.view.board.x+24),y:Math.min(100000,entry.view.board.y+24),visible:true};
    // Snapshot copy preserves exact current geometry/candidate, not the originating undo stack.
    return next([...state.entries,entry],entry.id);
  }
  if(action.type==='clear')return state.entries.length?next([],null):state;
  if(action.type==='select')return action.id!==state.activeId&&state.entries.some(e=>e.id===action.id)?next(state.entries,action.id):state;
  if(action.type==='remove'){
    const index=state.entries.findIndex(e=>e.id===action.id);if(index<0)return state;
    const entries=state.entries.filter(e=>e.id!==action.id);
    return next(entries,state.activeId===action.id?(entries[Math.max(0,index-1)]?.id??null):state.activeId);
  }
  if(action.type==='rename'){
    const name=action.name.trim();if(!name||!state.entries.some(e=>e.id===action.id&&e.name!==name))return state;
    return next(state.entries.map(e=>e.id===action.id?{...e,name}:e));
  }
  const target=action.type==='analysis'&&action.ticket.source?state.entries.find(e=>e.id===action.ticket.id&&e.source===action.ticket.source):active;
  if(!target)return state;
  if(action.type==='analysis'&&(action.ticket.id!==target.id||action.ticket.revision!==target.history.revision||!action.ticket.source&&action.ticket.generation!==state.generation))return state;
  const history=foldedModelHistoryReducer(target.history,action.type==='analysis'?{type:'analysis',revision:action.ticket.revision,result:action.result}:action.action);
  if(history===target.history)return state;
  return next(state.entries.map(e=>e.id===target.id?{...e,history}:e));
}
