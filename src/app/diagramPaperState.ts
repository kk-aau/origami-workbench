import {inheritDiagramFixedAnchor} from './diagramStepInheritance';
import {hasNonFlatFoldAngles} from './diagramSpatialPose';
import {isDiagramPaperPoseIsometric,repairDiagramPaperStatesInPlace} from './diagramPaperPose';
export {isDiagramPaperPoseIsometric} from './diagramPaperPose';
import {validateDiagramProject,updateDiagramAnnotations,updateDiagramFoldLink,type DiagramPose,type DiagramProject,type DiagramStep} from './diagramProject';
import {validateDiagramAnnotations,isDiagramCPLine,type DiagramAnnotation} from './diagramAnnotations';
import {followDiagramPaperAnnotations} from './diagramPaperFollow';
import {refreshDiagramFoldDrawing,isLinkedFoldLine} from './diagramFoldTransactions';
import {alignDiagramPaperAnchors} from './diagramPaperDeformation';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const participatesInCP=(a:DiagramAnnotation)=>isDiagramCPLine(a)||isLinkedFoldLine(a)&&a.foldFaces?.length!==0;
// CP F handles must be regenerated in each pose. Preserve current M/V artwork
// in the flat archive just as before, including the user's stroke properties.
const cacheAnnotations=(annotations:DiagramAnnotation[],linked:boolean)=>annotations.filter(a=>!linked||!(isDiagramCPLine(a)&&a.style==='crease'));
function stepOf(project:DiagramProject,stepId:string):DiagramStep {
  const step=project.steps.find(s=>s.id===stepId);if(!step)throw Error('找不到折序步骤。');return step;
}
function copyStep(project:DiagramProject,stepId:string){
  const original=stepOf(project,stepId),step=structuredClone(original);
  return {step,next:{...project,steps:project.steps.map(item=>item===original?step:item)}};
}
function sameSource(a:DiagramPose,b:DiagramPose):boolean {
  return a.sourceStateId===b.sourceStateId&&a.sourceRevision===b.sourceRevision&&same(a.sourceDoc,b.sourceDoc);
}
function currentSource(project:DiagramProject,pose:DiagramPose):void {
  const source=project.states.find(s=>s.id===pose.sourceStateId);
  if(!source||source.revision!==pose.sourceRevision||!same(source.doc,pose.sourceDoc))throw Error('来源 CP 已更新，请重新计算平整状态，不能恢复旧 CP 的扯角姿态。');
}

export function isDiagramPaperPulled(step:DiagramStep):boolean {
  return step.paperStates?.active==='pulled'||!!step.pose&&!isDiagramPaperPoseIsometric(step.pose);
}

/** Archive a legacy pulled pose after its flat source was computed. The two
 * states must retain the same real source ID, revision and indexed topology. */
export function initializeDiagramPaperStates(project:DiagramProject,stepId:string,flatPose:DiagramPose,pulledPose:DiagramPose,active:'flat'|'pulled',flatAnnotations?:DiagramAnnotation[]):DiagramProject {
  validateDiagramProject(project);const current=stepOf(project,stepId);
  if(!sameSource(flatPose,pulledPose))throw Error('平整与扯角状态必须来自同一 CP 快照。');
  [flatPose,pulledPose]=alignDiagramPaperAnchors(flatPose,pulledPose);
  currentSource(project,flatPose);
  if(!isDiagramPaperPoseIsometric(flatPose))throw Error('平整状态必须保留原纸面的边长与面形，请重新计算平折结果。');
  const linked=!!current.foldLink?.enabled,saved=cacheAnnotations(flatAnnotations??(current.pose?followDiagramPaperAnnotations(current.pose,flatPose,current.annotations??[]):current.annotations??[]),linked);validateDiagramAnnotations(saved);
  const {next,step}=copyStep(project,stepId);
  const base=flatPose.spatial?'spatial':'flat';
  step.paperStates={active:active==='flat'?base:'pulled',[base]:structuredClone(flatPose),pulled:structuredClone(pulledPose),[base==='spatial'?'spatialAnnotations':'flatAnnotations']:structuredClone(saved)};
  const target=active==='flat'?flatPose:pulledPose;
  step.pose=structuredClone(target);
  if(active==='flat')step.annotations=structuredClone(saved);
  else if(current.pose&&(!same(current.pose.result.geometry.vertices,pulledPose.result.geometry.vertices)||!same(current.pose.paperDeformation,pulledPose.paperDeformation)))step.annotations=followDiagramPaperAnnotations(current.pose,pulledPose,(current.annotations??[]).filter(a=>!step.foldLink?.enabled||!participatesInCP(a)));
  validateDiagramProject(next);
  return step.foldLink?.enabled?refreshDiagramFoldDrawing(next,stepId):next;
}

/** Call after committing the moved pose and followed drawing in the same
 * history transaction. Supply pre-drag annotations to preserve their exact
 * flat coordinates and IDs when recording the first pull. */
export function recordDiagramPaperPull(project:DiagramProject,stepId:string,previousPose:DiagramPose,previousAnnotations?:DiagramAnnotation[]):DiagramProject {
  validateDiagramProject(project);const current=stepOf(project,stepId);if(!current.pose)throw Error('请先计算纸面姿态。');
  if(!sameSource(previousPose,current.pose))throw Error('拖角前后的来源 CP 不一致，不能保存纸面状态。');
  currentSource(project,current.pose);
  if(current.paperStates?.spatial&&current.paperStates.active==='flat')throw Error('已有立体状态，请先切换到立体状态再拖角。');
  const {next,step}=copyStep(project,stepId),base=previousPose.spatial?'spatial':'flat';
  if(!step.paperStates){
    if(!isDiagramPaperPoseIsometric(previousPose))throw Error('当前工程缺少原始纸面状态，请先恢复后再拖角。');
    step.paperStates={active:'pulled',[base]:structuredClone(previousPose),pulled:structuredClone(step.pose!)};
  }else if(step.paperStates.active!=='pulled')step.paperStates[base]=structuredClone(previousPose);
  const paper=step.paperStates;
  if(current.paperStates?.active!=='pulled'){
    const saved=cacheAnnotations(previousAnnotations??current.annotations??[],!!step.foldLink?.enabled);validateDiagramAnnotations(saved);
    paper[base==='spatial'?'spatialAnnotations':'flatAnnotations']=structuredClone(saved);
  }
  paper.pulled=structuredClone(step.pose!);paper.active='pulled';
  const original=paper.spatial??paper.flat;
  if(!original)throw Error('拖角状态缺少原始纸面。');
  const [aligned,pulled]=alignDiagramPaperAnchors(original,paper.pulled);
  if(paper.spatial)paper.spatial=aligned;else paper.flat=aligned;
  paper.pulled=pulled;step.pose=structuredClone(pulled);
  validateDiagramProject(next);return next;
}

/** Cache each computed view only for the identical CP revision. */
export function retainDiagramPaperStates(project:DiagramProject,stepId:string,previous:DiagramStep):DiagramProject {
  const original=stepOf(project,stepId);if(!original.pose)return project;
  const step={...original,pose:original.pose},next={...project,steps:project.steps.map(item=>item===original?step:item)};
  const active=!isDiagramPaperPoseIsometric(step.pose)?'pulled':step.pose.spatial?'spatial':'flat';
  const states:NonNullable<DiagramStep['paperStates']>={active};
  if(previous.pose&&sameSource(previous.pose,step.pose)){
    Object.assign(states,structuredClone(previous.paperStates??{}));
    const mode=isDiagramPaperPulled(previous)?'pulled':previous.pose.spatial?'spatial':'flat';states[mode]=structuredClone(previous.pose);
  }
  states.active=active;states[active]=structuredClone(step.pose);step.paperStates=states;repairDiagramPaperStatesInPlace(step);
  validateDiagramProject(next);return next;
}

/** Switching is a drawing transaction. The CP states and their revisions stay
 * unchanged; linked lines are projected from their material coordinates. */
export function switchDiagramPaperState(project:DiagramProject,stepId:string,active:'flat'|'spatial'|'pulled'):DiagramProject {
  validateDiagramProject(project);const original=stepOf(project,stepId),paper=original.paperStates;
  if(active==='spatial'&&original.pose&&!hasNonFlatFoldAngles(original.pose.sourceDoc))throw Error('折痕角度均为 0° 或 180°，请使用平整状态。');
  if(!paper||!original.pose||!paper[active])throw Error('尚未生成这个纸面状态，请先计算。');
  if(!['flat','spatial','pulled'].includes(active))throw Error('纸面状态无效。');
  currentSource(project,original.pose);currentSource(project,paper[active]!);
  if(active!=='pulled'&&!isDiagramPaperPoseIsometric(paper[active]!))throw Error('这个纸面状态仍有拖角变形，请重新计算后再固定纸面。');
  if(active===paper.active)return project;
  const {next,step}=copyStep(project,stepId),states=step.paperStates!,annotations=step.annotations??[];
  const [previous,target]=alignDiagramPaperAnchors(step.pose!,states[active]!);
  states[states.active]=structuredClone(previous);
  states[active]=structuredClone(target);
  const linked=!!step.foldLink?.enabled;
  let mapped:DiagramAnnotation[];
  if(states.active!=='pulled')states[states.active==='spatial'?'spatialAnnotations':'flatAnnotations']=structuredClone(cacheAnnotations(annotations,linked));
  const saved=active==='spatial'?states.spatialAnnotations:active==='flat'?states.flatAnnotations:undefined;
  if(saved){
    const symbols=new Map(annotations.filter(a=>a.kind==='symbol').map(a=>[a.id,a])),used=new Set<string>();
    mapped=saved.flatMap<DiagramAnnotation>(annotation=>{
      // Cached linked handles supply this mode's authored paint and timing.
      // The CP refresh below still rebuilds their authoritative geometry.
      if(annotation.kind==='line')return [annotation];
      const current=symbols.get(annotation.id);if(!current)return [];used.add(current.id);return [current];
    });
    mapped.push(...annotations.filter(a=>a.kind==='symbol'&&!used.has(a.id)));
  }else{
    mapped=followDiagramPaperAnnotations(previous,target,cacheAnnotations(annotations,linked));
  }
  states.active=active;step.pose=structuredClone(target);
  let prepared=updateDiagramAnnotations(next,stepId,mapped);
  if(step.foldLink?.fixed&&active!=='pulled'){
    const physical=paper.active==='pulled'?paper.spatial??paper.flat:original.pose;
    const fixed=physical?inheritDiagramFixedAnchor(physical,target,step.foldLink.fixed,step.foldLink.fixed.target?.stateId??target.sourceStateId):undefined;
    const {fixed:_oldFixed,...config}=step.foldLink;
    prepared=updateDiagramFoldLink(prepared,stepId,{...config,...(fixed?{fixed}:{})});
  }
  if(linked)prepared=refreshDiagramFoldDrawing(prepared,stepId);
  validateDiagramProject(prepared);return prepared;
}
