import type {Doc} from '../core/types';
import {isDiagramPaperPulled} from './diagramPaperState';
import {updateDiagramCP,updateDiagramFoldLink,type DiagramProject} from './diagramProject';
import {adoptDiagramFoldCP} from './diagramFoldTransactions';

export interface DiagramCPEditAccess {
  editable:boolean;
  reason:string;
  /** Shared before states are edited as the preceding step's after state. */
  ownerStepId?:string;
}

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Policy for direct whole-CP editing/import/adoption only. Picking a before-CP
 * edge to apply an operation to the current after CP is a separate transaction. */
export function getDiagramCPEditAccess(project:DiagramProject,stepId:string,stateId:string):DiagramCPEditAccess {
  const index=project.steps.findIndex(step=>step.id===stepId),step=project.steps[index];
  if(!step)return {editable:false,reason:'找不到当前折序步骤。'};
  const state=project.states.find(item=>item.id===stateId);
  if(!state||stateId!==step.beforeId&&stateId!==step.afterId)return {editable:false,reason:'此 CP 不属于当前步骤，不能在此处修改。'};
  if(stateId===step.beforeId&&index>0)return {editable:false,reason:'操作前 CP 与上一步的操作后 CP 共享；请到上一步修改操作后 CP。',ownerStepId:project.steps[index-1].id};
  if(step.paperStates?.active==='pulled')return {editable:false,reason:'请切回平整状态或立体状态后再编辑 CP 折痕。'};
  if(stateId===step.beforeId&&step.foldLink?.enabled)return {editable:false,reason:'初始 CP 是本步折线联动的映射来源；请先停用联动再修改初始 CP，并重新计算操作前 CP。'};
  if(stateId===step.afterId&&step.foldLink?.enabled){
    const before=project.states.find(item=>item.id===step.beforeId),pose=step.pose;
    if(!before||!pose||pose.result.geometry.status!=='ready'||!pose.result.geometry.vertices.length||pose.sourceStateId!==before.id||pose.sourceRevision!==before.revision||!same(pose.sourceDoc,before.doc))return {editable:false,reason:'请先计算操作前 CP，再编辑联动的操作后 CP。'};
  }
  try{
    if(step.pose?.result.geometry.status==='ready'&&isDiagramPaperPulled(step))return {editable:false,reason:'请切回平整状态或立体状态后再编辑 CP 折痕。'};
  }catch{return {editable:false,reason:'当前纸面状态无法验证，请重新计算操作前 CP 后再编辑。'};}
  return {editable:true,reason:''};
}

/** Atomic guarded whole-CP write. The UI normalizes newly supplied documents
 * before calling this function so it can also display normalization warnings.
 * Dependent poses stay as explicit stale snapshots; no geometry is invented. */
export function applyDiagramCPEdit(project:DiagramProject,stepId:string,stateId:string,doc:Doc):DiagramProject {
  const access=getDiagramCPEditAccess(project,stepId,stateId);
  if(!access.editable)throw Error(access.reason);
  const step=project.steps.find(item=>item.id===stepId)!,state=project.states.find(item=>item.id===stateId)!;
  if(same(state.doc,doc))return project;
  if(stateId===step.afterId&&step.foldLink?.enabled)return adoptDiagramFoldCP(project,stepId,doc);
  let next=updateDiagramCP(project,stateId,doc);
  if(stateId===step.beforeId&&step.foldLink){
    const {fixed:_fixed,generated:_generated,...settings}=step.foldLink;
    next=updateDiagramFoldLink(next,stepId,{...settings,selectedFaces:[]});
  }
  return next;
}

/** A returned before-CP also belongs to the previous step when it is shared. */
export function applyReturnedDiagramCP(project:DiagramProject,stepId:string,stateId:string,revision:number,doc:Doc):DiagramProject {
  const step=project.steps.find(item=>item.id===stepId),state=project.states.find(item=>item.id===stateId);
  if(!step||!state||stateId!==step.beforeId&&stateId!==step.afterId)throw Error('来源步骤或 CP 已被移除。');
  if(state.revision!==revision)throw Error('来源 CP 已修改，请从折序重新打开 CP，以免覆盖新修改。');
  if(same(state.doc,doc))return project;
  const access=getDiagramCPEditAccess(project,stepId,stateId);
  if(access.ownerStepId)return applyDiagramCPEdit(project,access.ownerStepId,stateId,doc);
  if(stateId===step.beforeId&&step.foldLink?.enabled){
    // Replacing the initial source invalidates its references to old edges/faces.
    // Apply the ordinary before-state cleanup, then restore the user's link mode.
    const unlocked=updateDiagramFoldLink(project,stepId,{...step.foldLink,enabled:false});
    const updated=applyDiagramCPEdit(unlocked,stepId,stateId,doc);
    const link=updated.steps.find(item=>item.id===stepId)!.foldLink!;
    return updateDiagramFoldLink(updated,stepId,{...link,enabled:true});
  }
  return applyDiagramCPEdit(project,stepId,stateId,doc);
}
