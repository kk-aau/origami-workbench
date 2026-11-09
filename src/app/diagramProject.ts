import {followDiagramDepthAnnotations} from './diagramPaperFollow';
import {repairDiagramPaperStatesInPlace} from './diagramPaperPose';
import {validateDoc,type Doc,type FlatFoldResult,type Point} from '../core/types';
import {exportModelSnapshot,importModelSnapshot} from '../core/modelSnapshot';
import {modelProjectionCenter} from './modelProjection';
import {copyModelView,validateModelView,type ModelViewState} from './modelViewState';
import {validateDiagramAnnotations,type DiagramAnnotation} from './diagramAnnotations';
import {editDiagramPaperBindings,resolveDiagramPaperBindings} from './diagramPaperBinding';
import {validateDiagramImages,type DiagramImage} from './diagramImages';
import {validateDiagramCallouts,type DiagramCallout} from './diagramCallouts';
import {cleanDiagramAnimationTimings} from './diagramAnimationTiming';
import {SYMBOL_CATALOG} from './diagramSymbolCatalog';
import {diagramSymbolTurnDegrees} from './diagramSymbolRotation';
import type {DiagramFoldLinkSettings} from './diagramFoldLinkTypes';
import {DEFAULT_GRID_DIVISIONS,GRID_MIN,GRID_MAX} from './gridControls';
import {validateDiagramAnglePreset} from './diagramAnglePreset';
import {validateDiagramPaperDeformation,type DiagramPaperDeformation} from './diagramPaperDeformation';
import {validateDiagramSpatialPose,restoreDiagramSpatialLayers,cloneDiagramPoseWithSpatialProof,type DiagramSpatialPose} from './diagramSpatialPose';
import {assertDiagramReturnTargetRemovable,syncDiagramReturnAnnotationCaches,syncDiagramReturnLabels,validateDiagramReturnReferences} from './diagramReturnReference';
import {validateDiagramSimulationSurface,validateDiagramSimulationSurfaceView,type DiagramSimulationSurface} from './diagramSimulationSurface';
import {validateSimulationPose,type SimulationPose} from '../engine/simPose';
import {defaultModelColors,validateModelColors,type ModelColors} from './modelColors';
export type {DiagramSimulationSurface} from './diagramSimulationSurface';
export type {DiagramAnnotation,DiagramLineAnnotation,DiagramSymbolAnnotation,DiagramLineStyle,DiagramStrokePattern,DiagramSymbolKind,DiagramSymbolParams} from './diagramAnnotations';
export type {DiagramImage} from './diagramImages';
export type {DiagramCallout,DiagramCalloutSource,DiagramCalloutCircle,DiagramCalloutComparison} from './diagramCallouts';

/** Paper-grid preferences belong to each step; physical spacing fields remain for legacy files. */
export interface DiagramCanvasSettings {
  grid:boolean;snap:boolean;gridSpacing:number;gridSubdivisions:number;diagonalGrid:boolean;
  /** Each axis of the source paper is divided independently, as in the crease editor. */
  gridDivisions?:number;
  /** Construction references are drawn only on hover and never become CP edges. */
  constructionPoints?:Point[];
  anglePreset?:number;
  /** Whole illustration rotation, shared by the canvas, thumbnails and exports. */
  drawingRotation?:number;
}
export function defaultDiagramCanvas(paperWidth=200):DiagramCanvasSettings{
  const width=Number.isFinite(paperWidth)&&paperWidth>0?paperWidth:200;
  return {grid:true,snap:true,gridSpacing:Math.max(.1,Math.min(10_000,width/DEFAULT_GRID_DIVISIONS)),gridSubdivisions:1,diagonalGrid:false,gridDivisions:DEFAULT_GRID_DIVISIONS};
}

export interface DiagramCPState {id:string;doc:Doc;revision:number}
export interface DiagramPose {
  /** Calculation-time CP and revision; editing a CP does not replace this snapshot. */
  sourceStateId:string;
  sourceRevision:number;
  sourceDoc:Doc;
  result:FlatFoldResult;
  /** Physical 3D coordinates; result contains only their illustration projection. */
  spatial?:DiagramSpatialPose;
  view?:ModelViewState;
  /** Illustration paint order only. It is not a solver layer certificate. */
  displayOrder?:number[];
  /** Zero-based layer-solver candidate preference. Persist the choice without
   * trusting an old certificate; reopening analyses the saved geometry again. */
  layerSolutionIndex?:number;
  /** Hidden source paper faces affect only the illustration, never CP topology
   * or the solver's physical paper layer identities. */
  hiddenFaces?:number[];
  /** Drawing-only material nodes; neither source CP nor solver topology is extended. */
  paperDeformation?:DiagramPaperDeformation;
}
export interface DiagramPaperStates {
  active:'flat'|'spatial'|'pulled';flat?:DiagramPose;spatial?:DiagramPose;pulled?:DiagramPose;
  /** Flat drawing coordinates avoid accumulating split lines on repeated
   * round trips. Symbols stay independent and use their current positions. */
  flatAnnotations?:DiagramAnnotation[];
  spatialAnnotations?:DiagramAnnotation[];
}
export interface DiagramStep {
  id:string;title:string;description:string;beforeId:string;afterId:string;pose:DiagramPose|null;
  /** Actual captured flexible material; exclusive with rigid pose/paperStates. */
  simulationSurface?:DiagramSimulationSurface;
  /** The first committed symbol may name an untitled step exactly once. This
   * remains true after clearing its title or deleting all drawing symbols. */
  firstSymbolPlaced?:boolean;
  /** Independent drawing overlay; absent in older version 1 project files. */
  annotations?:DiagramAnnotation[];
  /** Embedded raster artwork does not add or modify CP edges. */
  images?:DiagramImage[];
  /** Derived circular illustration insets never become physical CP edges. */
  callouts?:DiagramCallout[];
  /** Defaults to true for existing projects; false makes raster artwork primary. */
  paperVisible?:boolean;
  /** Absent in older version 1 project files. */
  canvas?:DiagramCanvasSettings;
  /** Explicit opt-in for editable drawing creases and CP synchronization. */
  foldLink?:DiagramFoldLinkSettings;
  /** Explicit illustration mode; snapshot.modified is not a mode flag. */
  paperStates?:DiagramPaperStates;
  /** Automatic orientation is derived from the preceding step's view and
   * instruction symbols. Explicit side/angle edits opt this step out. */
  viewMode?:'auto'|'manual';
  /** A not-yet-calculated step can inherit orientation without inventing a
   * geometry snapshot or copying the preceding canvas camera. */
  pendingView?:Pick<ModelViewState,'side'|'rotation'>;
  /** Keep the authored illustration direction independently of physical fixed faces. */
  orientationLocked?:boolean;
}
export interface DiagramProject {
  format:'zhezhi-diagram';version:1;name:string;
  /** Ordered boundary states: N steps always reference N + 1 CP states. */
  states:DiagramCPState[];steps:DiagramStep[];activeStepId:string;
}
export type DiagramIdFactory=()=>string;
const newId:DiagramIdFactory=()=>crypto.randomUUID();
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const natural=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

function record(value:unknown,required:string[],optional:string[],label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||
      Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw new Error(`${label}字段不完整或版本不支持。`);
  return value as Record<string,unknown>;
}
function identifier(value:unknown,label:string):asserts value is string {
  if(typeof value!=='string'||!value.trim())throw new Error(`${label}缺失。`);
}
function requireState(project:DiagramProject,id:string):DiagramCPState {
  const state=project.states.find(state=>state.id===id);
  if(!state)throw new Error('指定的 CP 状态不存在。');
  return state;
}
function requireStep(project:DiagramProject,id:string):DiagramStep {
  const step=project.steps.find(step=>step.id===id);
  if(!step)throw new Error('指定的折序步骤不存在。');
  return step;
}
/** Projects in edit history are immutable snapshots. Returned unchanged branches
 * are shared read-only data: subsequent edits must use the update functions,
 * rather than mutate their Doc, pose or step. New external inputs are detached. */
function copyStepForEdit(project:DiagramProject,id:string,deep=false):{next:DiagramProject;step:DiagramStep} {
  const original=requireStep(project,id),step=deep?structuredClone(original):{...original};
  return {next:{...project,steps:project.steps.map(item=>item===original?step:item)},step};
}
function generateId(existing:Set<string>,factory:DiagramIdFactory):string {
  const id=factory();identifier(id,'新对象编号');
  if(existing.has(id))throw new Error('新对象编号重复。');
  existing.add(id);return id;
}
function projectIds(project:DiagramProject):Set<string> {
  return new Set([...project.states.map(state=>state.id),...project.steps.map(step=>step.id)]);
}

function validateDisplayOrder(value:unknown,count:number):asserts value is number[] {
  if(!Array.isArray(value)||value.length!==count||new Set(value).size!==count||
      value.some(index=>!natural(index)||index>=count))throw new Error('折图绘制顺序必须包含全部纸面且不能重复。');
}
function validateHiddenFaces(value:unknown,count:number):asserts value is number[] {
  if(!Array.isArray(value)||value.length>count||new Set(value).size!==value.length||
      value.some(face=>!natural(face)||face>=count))throw new Error('隐藏纸面必须为有效、不重复的原纸面编号。');
}

/** Cutaway targets belong to the original indexed paper faces, not the paint
 * order or the triangles used to render one face. Keep legacy line styles and
 * their independently validated foldFaces outside this symbol-only check. */
function validateCutawayFaces(annotations:readonly DiagramAnnotation[]|undefined,pose:DiagramPose|null):void {
  for(const annotation of annotations??[])if(annotation.kind==='symbol'&&annotation.symbol==='tearWindow'&&annotation.cutawayFaces?.length){
    const faces=pose?.result?.geometry?.faces;
    if(!Array.isArray(faces)||annotation.cutawayFaces.some(face=>face>=faces.length))throw new Error('撕纸透视的隐藏纸层超出对应姿态的原纸面范围，请重新选择纸层。');
  }
}

/** Folded coordinates, solver order and vertex pulling do not change the
 * original face IDs. Indexed boundary/incidence changes do, even when the
 * number of faces stays the same. Source identity is checked separately. */
function samePaperFaceTopology(a:FlatFoldResult,b:FlatFoldResult):boolean {
  const topology=(result:FlatFoldResult)=>{
    const geometry=result.geometry,graph=geometry.graph;
    return {vertices:geometry.vertices.length,faces:geometry.faces,edges:graph?.edges_vertices,
      facesVertices:graph?.faces_vertices,facesEdges:graph?.faces_edges,edgesFaces:graph?.edges_faces,facesFaces:graph?.faces_faces,
      holes:graph?.faces_holes,holeEdges:graph?.faces_holeEdges,holeFaces:graph?.faces_holeFaces};
  };
  return same(topology(a),topology(b));
}

function clearCutawayFaces(annotations:DiagramAnnotation[]|undefined):void {
  for(const annotation of annotations??[])if(annotation.kind==='symbol'&&annotation.symbol==='tearWindow'&&annotation.cutawayFaces?.length)annotation.cutawayFaces=[];
}

export function validateDiagramCanvas(value:unknown):asserts value is DiagramCanvasSettings {
  const canvas=record(value,['grid','snap','gridSpacing','gridSubdivisions','diagonalGrid'],['gridDivisions','constructionPoints','anglePreset','drawingRotation'],'折序画布');
  if(typeof canvas.grid!=='boolean'||typeof canvas.snap!=='boolean'||typeof canvas.diagonalGrid!=='boolean')throw new Error('折序画布网格与吸附设置必须为布尔值。');
  if(typeof canvas.gridSpacing!=='number'||!Number.isFinite(canvas.gridSpacing)||canvas.gridSpacing<0.1||canvas.gridSpacing>10_000)throw new Error('折序画布网格间距必须为 0.1 到 10,000 之间的有限毫米值。');
  if(typeof canvas.gridSubdivisions!=='number'||!Number.isInteger(canvas.gridSubdivisions)||canvas.gridSubdivisions<1||canvas.gridSubdivisions>32)throw new Error('折序画布网格分格数必须为 1 到 32 之间的整数。');
  if(Object.hasOwn(canvas,'gridDivisions')&&(typeof canvas.gridDivisions!=='number'||!Number.isInteger(canvas.gridDivisions)||canvas.gridDivisions<GRID_MIN||canvas.gridDivisions>GRID_MAX))throw new Error(`折序画布网格等分须为 ${GRID_MIN}～${GRID_MAX} 之间的整数。`);
  if(Object.hasOwn(canvas,'anglePreset'))validateDiagramAnglePreset(canvas.anglePreset);
  if(Object.hasOwn(canvas,'drawingRotation')&&(typeof canvas.drawingRotation!=='number'||!Number.isFinite(canvas.drawingRotation)||canvas.drawingRotation< -180||canvas.drawingRotation>=180))throw new Error('整图旋转须为 −180° 到 180° 之间的有限角度，不含 180°。');
  if(Object.hasOwn(canvas,'constructionPoints')&&(!Array.isArray(canvas.constructionPoints)||canvas.constructionPoints.length>500||canvas.constructionPoints.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1_000_000))))throw new Error('定位点须为有效坐标，且最多保留 500 个。');
}

/** Persist only bounded, independently validated fold-link state. Face IDs are
 * local to a pose; a new step inherits the mode, never these indexed choices. */
export function validateDiagramFoldLink(value:unknown):asserts value is DiagramFoldLinkSettings {
  const settings=record(value,['enabled','layers','selectedFaces'],['fixed','generated','precreases','drawingVersion'],'折图与 CP 联动');
  if(typeof settings.enabled!=='boolean'||!['all','top','selected'].includes(settings.layers as string))throw new Error('折图与 CP 联动开关或纸层范围无效。');
  if(Object.hasOwn(settings,'drawingVersion')&&settings.drawingVersion!==1)throw new Error('折线绑定版本无效。');
  if(!Array.isArray(settings.selectedFaces)||
      new Set(settings.selectedFaces).size!==settings.selectedFaces.length||settings.selectedFaces.some(face=>!natural(face)))throw new Error('联动纸面索引必须为 不重复的非负安全整数。');
  if(Object.hasOwn(settings,'fixed')) {
    const fixed=record(settings.fixed,['point','matrix'],['target','spatialTransform'],'联动固定纸面');
    if(!Array.isArray(fixed.point)||fixed.point.length!==2||fixed.point.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1_000_000))throw new Error('联动固定点坐标无效或超出范围。');
    if(!Array.isArray(fixed.matrix)||fixed.matrix.length!==6||fixed.matrix.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1_000_000))throw new Error('联动固定纸面矩阵无效或超出范围。');
    const [a,b,c,d]=fixed.matrix as number[],tolerance=1e-6;
    if(fixed.spatialTransform){
      const t=record(fixed.spatialTransform,['rotation','translation'],[],'空间固定纸面');
      if(!Array.isArray(t.rotation)||t.rotation.length!==9||!Array.isArray(t.translation)||t.translation.length!==3||[...t.rotation,...t.translation].some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e6))throw Error('空间固定纸面变换无效。');
      const r=t.rotation as number[];
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(r[i*3]*r[j*3]+r[i*3+1]*r[j*3+1]+r[i*3+2]*r[j*3+2]-(i===j?1:0))>tolerance)throw Error('空间固定纸面必须保持真实等距。');
      if(Math.abs(r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6])-1)>tolerance||Math.abs(a*d-b*c)<1e-10)throw Error('空间固定纸面旋转或投影无效。');
    }else if(Math.abs(a*a+b*b-1)>tolerance||Math.abs(c*c+d*d-1)>tolerance||
        Math.abs(a*c+b*d)>tolerance||Math.abs(Math.abs(a*d-b*c)-1)>tolerance)throw new Error('联动固定纸面矩阵必须为等距变换，不能缩放或拉伸纸面。');
    if(Object.hasOwn(fixed,'target')) {
      const target=record(fixed.target,['stateId','kind','point'],[],'联动固定选择');
      identifier(target.stateId,'固定选择来源 CP 编号');
      if(!['face','vertex'].includes(target.kind as string))throw new Error('联动固定选择必须为纸面或顶点。');
      if(!Array.isArray(target.point)||target.point.length!==2||target.point.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1_000_000))throw new Error('联动固定选择坐标无效或超出范围。');
    }
  }
  if(Object.hasOwn(settings,'generated')) {
    if(!Array.isArray(settings.generated))throw new Error('联动新增折痕必须为数组。');
    for(const raw of settings.generated) {
      const segment=record(raw,['id','a','b','assignment','angle'],['displayColor'],'联动新增折痕');
      if(!['M','V','U','F'].includes(segment.assignment as string))throw new Error('联动新增折痕仅支持山折、谷折、未指派或展开折线。');
      if(segment.assignment==='F'&&segment.angle!==0)throw new Error('预折后展开的折痕角度必须为 0 度。');
    }
    validateDoc({name:'generated',paper:{width:1,height:1},segments:settings.generated});
  }
  if(Object.hasOwn(settings,'precreases')) {
    if(!Array.isArray(settings.precreases))throw new Error('预折意图必须为数组。');
    for(const raw of settings.precreases) {
      const segment=record(raw,['id','a','b','assignment','angle'],['displayColor'],'预折意图');
      if(segment.assignment!=='M'&&segment.assignment!=='V'||typeof segment.angle!=='number'||!Number.isFinite(segment.angle)||Math.abs(segment.angle)>180||(segment.assignment==='M'?segment.angle>0:segment.angle<0))throw new Error('预折意图必须保留有效的山折或谷折方向及 0～180° 折角。');
    }
    validateDoc({name:'precreases',paper:{width:1,height:1},segments:settings.precreases});
  }
}

/** Validate the source-to-result indexed topology, allowing manually moved vertices. */
function checkedResult(source:Doc,value:unknown):FlatFoldResult {
  const result=value as FlatFoldResult;
  if(!result||typeof result!=='object'||!result.geometry||!result.layers||
      result.geometry.status!=='ready'||typeof result.geometry.message!=='string'||
      !Array.isArray(result.geometry.vertices)||!Array.isArray(result.geometry.faces)||
      !['solved','no-solution','unknown','unsupported','timeout','cancelled','error'].includes(result.layers.status)||
      typeof result.layers.message!=='string'||!Array.isArray(result.warnings)||result.warnings.some(w=>typeof w!=='string')) {
    throw new Error('步骤姿态必须具有有效的平折结果几何。');
  }
  if(result.geometry.modified!==undefined&&typeof result.geometry.modified!=='boolean')throw new Error('步骤姿态的编辑标记无效。');
  if(result.layers.faceOrder!==undefined)validateDisplayOrder(result.layers.faceOrder,result.geometry.faces.length);
  // The existing model format validates finite coordinates, starting face,
  // colour constraints and exact face/edge numbering without requiring isometry.
  exportModelSnapshot(source,result);
  return result;
}

function validatePose(value:unknown,states:Map<string,DiagramCPState>,checkGeometry:boolean):DiagramPose {
  const pose=record(value,['sourceStateId','sourceRevision','sourceDoc','result'],['view','displayOrder','hiddenFaces','layerSolutionIndex','paperDeformation','spatial'],'步骤姿态');
  identifier(pose.sourceStateId,'姿态来源 CP 编号');const source=states.get(pose.sourceStateId);
  if(!source||!natural(pose.sourceRevision)||pose.sourceRevision>source.revision)throw new Error('步骤姿态引用了未知的 CP 状态或修订号。');
  validateDoc(pose.sourceDoc);
  if(pose.sourceRevision===source.revision&&!same(pose.sourceDoc,source.doc))throw new Error('步骤姿态来源与对应 CP 修订不一致。');
  if(pose.view!==undefined)validateModelView(pose.view);
  if(Object.hasOwn(pose,'layerSolutionIndex')&&!natural(pose.layerSolutionIndex))throw new Error('纸层方案编号必须为有效的非负安全整数。');
  if(checkGeometry)checkedResult(pose.sourceDoc,pose.result);
  if(Object.hasOwn(pose,'spatial'))validateDiagramSpatialPose(pose as unknown as DiagramPose,checkGeometry);
  if(Object.hasOwn(pose,'paperDeformation'))validateDiagramPaperDeformation(pose as unknown as DiagramPose);
  if(pose.displayOrder!==undefined) {
    const result=pose.result as FlatFoldResult;
    if(!result?.geometry||!Array.isArray(result.geometry.faces))throw new Error('步骤姿态缺少纸面几何。');
    validateDisplayOrder(pose.displayOrder,result.geometry.faces.length);
  }
  if(Object.hasOwn(pose,'hiddenFaces')) {
    const result=pose.result as FlatFoldResult;
    if(!result?.geometry||!Array.isArray(result.geometry.faces))throw new Error('步骤姿态缺少纸面几何。');
    validateHiddenFaces(pose.hiddenFaces,result.geometry.faces.length);
  }
  return pose as unknown as DiagramPose;
}
function syncPaperState(step:DiagramStep):void {
  if(step.paperStates&&step.pose)step.paperStates[step.paperStates.active]=cloneDiagramPoseWithSpatialProof(step.pose);
}

const sameOrientation=(a:Pick<ModelViewState,'side'|'rotation'>,b:Pick<ModelViewState,'side'|'rotation'>)=>a.side===b.side&&Math.abs(a.rotation-b.rotation)<1e-8;
function viewAfterSymbols(view:ModelViewState,annotations:readonly DiagramAnnotation[],drawingRotation=0,nextDrawingRotation=drawingRotation):ModelViewState {
  const next=copyModelView(view);next.cameras={};
  for(const annotation of annotations)if(annotation.kind==='symbol'){
    if(annotation.symbol==='flip'){
      // Flip the picture currently on screen. R(a)M followed by M is R(-a),
      // so retaining the old angle would mirror the pre-rotation paper instead.
      next.side=next.side==='front'?'back':'front';
      next.rotation=((360-next.rotation-2*drawingRotation)%360+360)%360;
    }
    const degrees=diagramSymbolTurnDegrees(annotation);
    next.rotation=((next.rotation+degrees)%360+360)%360;
  }
  // The instruction acts on the visible paper. A new step may choose a fresh
  // drawing frame, so transfer that frame angle into paper view only.
  next.rotation=((next.rotation+drawingRotation-nextDrawingRotation)%360+360)%360;
  return next;
}

/** The next step's view includes the PREVIOUS step's instructions exactly once.
 * Existing pose views remain authoritative until the auto synchronizer runs. */
export function getDiagramStepInitialView(project:DiagramProject,stepId:string):ModelViewState {
  const target=project.steps.findIndex(step=>step.id===stepId);if(target<0)throw new Error('指定的折序步骤不存在。');
  let view=copyModelView(undefined);
  for(let i=0;i<=target;i++){
    const step=project.steps[i];
    if(step.pose)view=copyModelView(step.pose.view);
    else if(step.viewMode==='manual'&&step.pendingView)view={...copyModelView(undefined),...step.pendingView};
    else if(i>0&&step.viewMode!=='manual'){
      const previous=project.steps[i-1];
      // Older files may have a fixed face without a saved display center.
      if(previous.foldLink?.fixed&&previous.pose&&!previous.pose.spatial&&!view.projectionCenter)view={...view,projectionCenter:modelProjectionCenter(previous.pose.result.geometry.vertices)};
      view=viewAfterSymbols(view,previous.annotations??[],previous.canvas?.drawingRotation??0,step.canvas?.drawingRotation??0);
    }
    else view=copyModelView(undefined);
  }
  view.cameras={};return view;
}

/** Infer old unmarked files from their original adjacent orientations, before
 * changing a symbol. An obvious manual angle is preserved. Matching the old
 * basis also upgrades drawings created before instruction actions existed. */
function inheritLegacyViewModes(next:DiagramProject,reference:DiagramProject):void {
  if(!next.steps.slice(1).some(step=>step.viewMode===undefined))return;
  const original=new Map(reference.steps.map((step,index)=>[step.id,{step,index}]));
  const originalViews:ModelViewState[]=[];let originalView=copyModelView(undefined);
  for(let i=0;i<reference.steps.length;i++){
    const step=reference.steps[i];
    if(step.pose)originalView=copyModelView(step.pose.view);
    else if(step.viewMode==='manual'&&step.pendingView)originalView={...copyModelView(undefined),...step.pendingView};
    else if(i>0&&step.viewMode!=='manual')originalView=viewAfterSymbols(originalView,reference.steps[i-1].annotations??[],reference.steps[i-1].canvas?.drawingRotation??0,step.canvas?.drawingRotation??0);
    else originalView=copyModelView(undefined);
    originalViews.push(originalView);
  }
  for(let i=1;i<next.steps.length;i++){
    const target=next.steps[i];if(target.viewMode!==undefined)continue;
    const previousEntry=original.get(target.id),oldIndex=previousEntry?.index??-1,old=previousEntry?.step;
    let viewMode:DiagramStep['viewMode'];
    if(!old?.pose||oldIndex<1)viewMode=old?.viewMode??'auto';
    else if(old.viewMode!==undefined)viewMode=old.viewMode;
    else{
      const previous=reference.steps[oldIndex-1],basis=originalViews[oldIndex-1],instruction=viewAfterSymbols(basis,previous.annotations??[],previous.canvas?.drawingRotation??0,old.canvas?.drawingRotation??0),shown=copyModelView(old.pose.view);
      viewMode=sameOrientation(shown,basis)||sameOrientation(shown,instruction)?'auto':'manual';
    }
    next.steps[i]={...target,viewMode};
  }
}

function syncStepViewsInPlace(next:DiagramProject,reference:DiagramProject=next):void {
  inheritLegacyViewModes(next,reference);
  const first=next.steps[0];
  if(first.viewMode==='auto'||first.pendingView){const changed={...first};if(changed.viewMode==='auto')changed.viewMode='manual';delete changed.pendingView;next.steps[0]=changed;}
  let basis=copyModelView(next.steps[0].pose?.view);basis.cameras={};
  for(let i=1;i<next.steps.length;i++){
    let step=next.steps[i];
    if(step.viewMode!=='auto'){
      basis=step.pose?copyModelView(step.pose.view):{...copyModelView(undefined),...(step.pendingView??{})};basis.cameras={};continue;
    }
    const previous=next.steps[i-1],view=viewAfterSymbols(basis,previous.annotations??[],previous.canvas?.drawingRotation??0,step.canvas?.drawingRotation??0),orientation={side:view.side,rotation:view.rotation};
    if(!step.pose){
      if(step.pendingView?.side!==orientation.side||step.pendingView.rotation!==orientation.rotation)next.steps[i]={...step,pendingView:orientation};
      basis=view;continue;
    }
    const apply=(pose:DiagramPose)=>{
      const old=copyModelView(pose.view),changed=!sameOrientation(old,orientation);
      if(pose.view&&old.side===orientation.side&&old.rotation===orientation.rotation)return pose;
      return {...pose,view:{...old,...orientation,cameras:changed?{}:old.cameras}};
    };
    const pose=apply(step.pose);let paperStates=step.paperStates;
    if(paperStates){
      for(const mode of ['flat','spatial','pulled'] as const){const old:DiagramPose|undefined=paperStates[mode];if(!old)continue;const updated=apply(old);if(updated!==old)paperStates={...paperStates,[mode]:updated};}
    }
    if(pose!==step.pose||paperStates!==step.paperStates||step.pendingView){
      const changed={...step,pose,...(paperStates?{paperStates:{...paperStates}}:{})};delete changed.pendingView;
      if(pose!==step.pose)syncPaperState(changed);
      next.steps[i]=changed;
    }
    basis=copyModelView(pose.view);basis.cameras={};
  }
}

/** Reapply derived orientation after undo/redo or loading an older project.
 * It does not accumulate effects, modify CPs, or overwrite manual orientation.
 * The workspace separately reprojects any view-dependent drawing overlays. */
export function resyncDiagramStepViews(project:DiagramProject,reference:DiagramProject=project):DiagramProject {
  validateProject(project,false);const next={...project,steps:[...project.steps]};syncStepViewsInPlace(next,reference);return syncDiagramReturnLabels(next);
}

function validateProject(value:unknown,checkGeometry:boolean):asserts value is DiagramProject {
  const project=record(value,['format','version','name','states','steps','activeStepId'],[],'折序工程');
  if(project.format!=='zhezhi-diagram'||project.version!==1)throw new Error('不支持的折序工程格式或版本。');
  if(typeof project.name!=='string'||!Array.isArray(project.states)||!Array.isArray(project.steps)||
      !project.steps.length||project.states.length!==project.steps.length+1)throw new Error('折序工程必须为 N 个步骤对应 N＋1 个 CP 状态。');
  identifier(project.activeStepId,'当前步骤编号');
  const ids=new Set<string>(),states=new Map<string,DiagramCPState>();
  for(const raw of project.states) {
    const state=record(raw,['id','doc','revision'],[],'CP 状态');identifier(state.id,'CP 状态编号');
    if(ids.has(state.id)||!natural(state.revision))throw new Error('CP 状态编号重复或修订号无效。');
    validateDoc(state.doc);ids.add(state.id);states.set(state.id,state as unknown as DiagramCPState);
  }
  for(let index=0;index<project.steps.length;index++) {
    const step=record(project.steps[index],['id','title','description','beforeId','afterId','pose'],['annotations','images','callouts','paperVisible','canvas','foldLink','paperStates','firstSymbolPlaced','viewMode','pendingView','orientationLocked','simulationSurface'],'折序步骤');identifier(step.id,'步骤编号');
    if(ids.has(step.id)||typeof step.title!=='string'||typeof step.description!=='string')throw new Error('步骤编号重复或说明格式无效。');
    if(Object.hasOwn(step,'firstSymbolPlaced')&&typeof step.firstSymbolPlaced!=='boolean')throw new Error('步骤首次符号记录必须为布尔值。');
    if(Object.hasOwn(step,'viewMode')&&step.viewMode!=='auto'&&step.viewMode!=='manual')throw new Error('步骤视角继承模式无效。');
    if(Object.hasOwn(step,'orientationLocked')&&typeof step.orientationLocked!=='boolean')throw new Error('整图朝向锁定设置必须为布尔值。');
    if(Object.hasOwn(step,'pendingView')){
      const pending=record(step.pendingView,['side','rotation'],[],'待生成步骤视角');
      if(!['auto','manual'].includes(step.viewMode as string)||step.pose!==null||pending.side!=='front'&&pending.side!=='back'||typeof pending.rotation!=='number'||!Number.isFinite(pending.rotation)||pending.rotation<0||pending.rotation>=360)throw new Error('待生成步骤视角无效。');
    }
    ids.add(step.id);
    if(step.beforeId!==project.states[index].id||step.afterId!==project.states[index+1].id)throw new Error('步骤前后 CP 不连续，或引用了未知的 CP 状态。');
    if(Object.hasOwn(step,'annotations'))validateDiagramAnnotations(step.annotations);
    if(Object.hasOwn(step,'images'))validateDiagramImages(step.images);
    if(Object.hasOwn(step,'callouts'))validateDiagramCallouts(step.callouts,[step.beforeId as string,step.afterId as string]);
    if(Object.hasOwn(step,'paperVisible')&&typeof step.paperVisible!=='boolean')throw new Error('步骤纸面显示设置必须为布尔值。');
    if(Object.hasOwn(step,'canvas'))validateDiagramCanvas(step.canvas);
    if(Object.hasOwn(step,'foldLink'))validateDiagramFoldLink(step.foldLink);
    if(Object.hasOwn(step,'simulationSurface')){
      validateDiagramSimulationSurface(step.simulationSurface,checkGeometry);
      const surface=step.simulationSurface,source=states.get(surface.sourceStateId);
      if(!source||surface.sourceRevision>source.revision||surface.sourceRevision===source.revision&&!same(surface.sourceDoc,source.doc))throw Error('模拟曲面引用了未知或不一致的 CP 修订。');
      if(step.pose!==null||Object.hasOwn(step,'paperStates'))throw Error('模拟曲面不能同时作为刚性折图或平折层序结果。');
    }
    if(step.pose===null){
      if(Object.hasOwn(step,'paperStates'))throw new Error('纸面状态缺少当前步骤姿态。');
      validateCutawayFaces(step.annotations as DiagramAnnotation[]|undefined,null);continue;
    }
    const pose=validatePose(step.pose,states,checkGeometry);
    validateCutawayFaces(step.annotations as DiagramAnnotation[]|undefined,pose);
    if(Object.hasOwn(step,'paperStates')) {
      const paper=record(step.paperStates,['active'],['flat','spatial','pulled','flatAnnotations','spatialAnnotations'],'纸面状态');
      if(!['flat','spatial','pulled'].includes(paper.active as string)||!paper[paper.active as string])throw new Error('当前纸面状态缺少对应姿态。');
      const snapshots=['flat','spatial','pulled'].flatMap(key=>paper[key]?[validatePose(paper[key],states,checkGeometry)]:[]);
      if(snapshots.some(p=>p.sourceStateId!==pose!.sourceStateId||p.sourceRevision!==pose!.sourceRevision||!same(p.sourceDoc,pose!.sourceDoc)))throw new Error('各纸面状态必须来自同一 CP 快照。');
      if(paper.spatial&&!(paper.spatial as DiagramPose).spatial)throw Error('立体状态缺少空间姿态。');
      if(!same(pose,paper[paper.active as string]))throw new Error('当前纸面状态与步骤姿态不一致。');
      if(Object.hasOwn(paper,'spatialAnnotations')){validateDiagramAnnotations(paper.spatialAnnotations);validateCutawayFaces(paper.spatialAnnotations,paper.spatial as DiagramPose);}
      if(Object.hasOwn(paper,'flatAnnotations')){
        validateDiagramAnnotations(paper.flatAnnotations);validateCutawayFaces(paper.flatAnnotations,paper.flat as DiagramPose);
      }
    }
  }
  if(!project.steps.some(step=>step.id===project.activeStepId))throw new Error('当前步骤不在折序工程中。');
  validateDiagramReturnReferences(project as unknown as DiagramProject);
}

export function validateDiagramProject(value:unknown):asserts value is DiagramProject {
  validateProject(value,true);
}

/** Create independent before/after states from the current CP; no Doc metadata changes. */
export function createDiagramProject(doc:Doc,idFactory:DiagramIdFactory=newId):DiagramProject {
  validateDoc(doc);const ids=new Set<string>(),beforeId=generateId(ids,idFactory),afterId=generateId(ids,idFactory),stepId=generateId(ids,idFactory);
  return {format:'zhezhi-diagram',version:1,name:doc.name||'折序工程',
    states:[{id:beforeId,doc:structuredClone(doc),revision:0},{id:afterId,doc:structuredClone(doc),revision:0}],
    steps:[{id:stepId,title:'',description:'',beforeId,afterId,pose:null,annotations:[],canvas:defaultDiagramCanvas(doc.paper.width),foldLink:{enabled:false,layers:'top',selectedFaces:[]}}],activeStepId:stepId};
}

/** Append a step whose before state is exactly the former last after state. */
export function appendDiagramStep(project:DiagramProject,idFactory:DiagramIdFactory=newId,options:{inheritSurface?:boolean}={}):DiagramProject {
  const previousSurface=options.inheritSurface===false?undefined:project.steps.at(-1)?.simulationSurface;
  if(previousSurface&&!same(previousSurface.sourceDoc,project.states.at(-1)?.doc))throw Error('模拟曲面之后的 CP 已变化，请在三维模拟中将新的当前姿态应用到下一步；不能按刚性折角自动替换曲面。');
  validateProject(project,false);const ids=projectIds(project),stateId=generateId(ids,idFactory),stepId=generateId(ids,idFactory);
  const next={...project,states:[...project.states],steps:[...project.steps]};
  const before=next.states.at(-1)!;
  const previousStep=next.steps.at(-1)!,previous=previousStep.foldLink;
  next.states.push({id:stateId,doc:structuredClone(before.doc),revision:0});
  next.steps.push({id:stepId,title:'',description:'',beforeId:before.id,afterId:stateId,pose:null,annotations:[],canvas:defaultDiagramCanvas(before.doc.paper.width),
    viewMode:'auto',
    ...(previousStep.orientationLocked?{orientationLocked:true}:{}),
    ...(previous?{foldLink:{enabled:previous.enabled,layers:previous.layers,selectedFaces:[]}}:{})});
  if(previousSurface)inheritSimulationSurfaceView(previousStep,next.steps.at(-1)!,before);
  next.activeStepId=stepId;syncStepViewsInPlace(next,project);return syncDiagramReturnLabels(next);
}

/** A symbol-only next step starts with the current drawn paper, including its
 * edited geometry and layer choice. Re-solving the unchanged CP would discard
 * that canvas and restore an earlier folded state. */
export function inheritDiagramCurrentPose(project:DiagramProject,sourceStepId:string,targetStepId:string):DiagramProject {
  validateProject(project,false);
  const index=project.steps.findIndex(step=>step.id===sourceStepId),source=project.steps[index],target=project.steps[index+1];
  if(!source?.pose||target?.id!==targetStepId||target.pose||source.simulationSurface)throw Error('当前步骤没有可继承的纸面姿态。');
  const state=requireState(project,target.beforeId);
  if(!same(source.pose.sourceDoc,state.doc))throw Error('CP 已变化，需要重新计算当前纸面。');
  const {next,step}=copyStepForEdit(project,targetStepId),view=viewAfterSymbols(copyModelView(source.pose.view),source.annotations??[],source.canvas?.drawingRotation??0,step.canvas?.drawingRotation??0);
  const rebind=(pose:DiagramPose):DiagramPose=>({...structuredClone(pose),sourceStateId:state.id,sourceRevision:state.revision,sourceDoc:structuredClone(state.doc),view:copyModelView(view)});
  step.pose=rebind(source.pose);
  if(source.paperStates){
    step.paperStates=structuredClone(source.paperStates);
    for(const mode of ['flat','spatial','pulled'] as const)if(step.paperStates[mode])step.paperStates[mode]=rebind(step.paperStates[mode]!);
    step.paperStates[step.paperStates.active]=structuredClone(step.pose);
    delete step.paperStates.flatAnnotations;delete step.paperStates.spatialAnnotations;
  }
  step.viewMode='manual';delete step.pendingView;
  validateProject(next,false);
  return next;
}

/** A drawing instruction changes only the curve's presentation, never its material.
 * Opposite camera vectors show the other side; page turns stay in 2D roll. */
function inheritSimulationSurfaceView(previous:DiagramStep,target:DiagramStep,source:DiagramCPState):void {
  const surface=structuredClone(previous.simulationSurface!);
  surface.sourceStateId=source.id;surface.sourceRevision=source.revision;surface.sourceDoc=structuredClone(source.doc);
  let screenRoll=(surface.displayRotation??0)+(previous.canvas?.drawingRotation??0),flipped=false;
  for(const annotation of previous.annotations??[])if(annotation.kind==='symbol'){
    if(annotation.symbol==='flip'){flipped=!flipped;screenRoll=-screenRoll;}
    screenRoll+=diagramSymbolTurnDegrees(annotation);
  }
  if(flipped){surface.pose.view.yaw+=Math.PI;surface.pose.view.pitch=-surface.pose.view.pitch;}
  surface.displayRotation=((screenRoll-(target.canvas?.drawingRotation??0))%360+360)%360;
  target.simulationSurface=surface;target.pose=null;delete target.paperStates;delete target.pendingView;target.viewMode='manual';target.paperVisible=true;
}

/** Navigate to the following step, appending only at the end of the CP chain.
 * Existing next-step poses and overlays are never replaced by navigation.
 * The caller may compute a missing pose from the selected step's before CP.
 */
export function advanceDiagramStep(project:DiagramProject,idFactory:DiagramIdFactory=newId):DiagramProject {
  validateProject(project,false);
  const index=project.steps.findIndex(step=>step.id===project.activeStepId),following=project.steps[index+1];
  if(!following)return appendDiagramStep(project,idFactory);
  const current=project.steps[index];
  if(current.simulationSurface){
    // An explicitly captured or edited following curve remains authoritative.
    if(following.simulationSurface)return selectDiagramStep(project,following.id);
    const source=requireState(project,current.afterId);
    if(!same(current.simulationSurface.sourceDoc,source.doc))throw Error('模拟曲面之后的 CP 已变化，请在三维模拟中将新的当前姿态应用到下一步；不能按刚性折角自动替换曲面。');
    const next=applyDiagramSimulationSurface(project,current.id,current.simulationSurface.pose,{colors:current.simulationSurface.colors,idFactory});
    inheritSimulationSurfaceView(current,requireStep(next,following.id),source);
    return next;
  }
  let next=selectDiagramStep(project,following.id);
  const previous=project.steps[index],basis=copyModelView(previous.pose?.view),shown=copyModelView(following.pose?.view);
  // Older versions forced inherited locked views into manual mode and skipped
  // instruction symbols. Repair only an explicit Next action whose successor
  // still matches that old inherited side/rotation; authored directions stay.
  // A separately chosen 3D camera is independent of these instructions and is
  // retained by the view synchronizer, so it must not suppress a pending flip.
  if(previous.orientationLocked&&following.orientationLocked&&following.viewMode==='manual'&&previous.pose&&following.pose?.sourceStateId===following.beforeId&&
      sameOrientation(shown,basis)&&!sameOrientation(viewAfterSymbols(basis,previous.annotations??[],previous.canvas?.drawingRotation??0,following.canvas?.drawingRotation??0),basis)&&
      (previous.canvas?.drawingRotation??0)===(following.canvas?.drawingRotation??0)){
    next={...next,steps:next.steps.map(step=>step.id===following.id?{...step,viewMode:'auto'}:step)};
  }
  return resyncDiagramStepViews(next,project);
}

/** Insert after this step. Copy its pose, retaining the actual calculation source. */
export function duplicateDiagramStep(project:DiagramProject,stepId:string,idFactory:DiagramIdFactory=newId):DiagramProject {
  validateProject(project,false);const source=requireStep(project,stepId),ids=projectIds(project),stateId=generateId(ids,idFactory),copyId=generateId(ids,idFactory);
  const next={...project,states:[...project.states],steps:[...project.steps]},index=next.steps.findIndex(step=>step.id===stepId),after=requireState(project,source.afterId);
  next.states.splice(index+2,0,{id:stateId,doc:structuredClone(after.doc),revision:0});
  next.steps.splice(index+1,0,{...structuredClone(source),id:copyId,title:isDefaultStepTitle(source.title)?'':source.title,beforeId:source.afterId,afterId:stateId});
  const duplicate=next.steps[index+1];duplicate.viewMode='manual';delete duplicate.pendingView;
  for(const callout of duplicate.callouts??[])if(callout.source.kind==='cp'){
    callout.source.stateId=callout.source.stateId===source.beforeId?duplicate.beforeId:duplicate.afterId;
    if(callout.comparison)callout.comparison.stateId=callout.comparison.stateId===source.beforeId?duplicate.beforeId:duplicate.afterId;
  }
  if(next.steps[index+2]){next.steps[index+2]=structuredClone(next.steps[index+2]);rebindStepBefore(next.steps[index+2],stateId);}
  next.activeStepId=copyId;syncStepViewsInPlace(next,project);return syncDiagramReturnLabels(next);
}

/** Remove one operation and its after boundary. The following operation starts
 * at the preserved before boundary. A removed pose source is rebound only to a
 * state with the exact calculation-time Doc; otherwise keep its drawing and
 * require a fresh model instead of manufacturing a matching source revision.
 */
export function removeDiagramStep(project:DiagramProject,stepId:string):DiagramProject {
  validateProject(project,false);requireStep(project,stepId);
  if(project.steps.length===1)throw new Error('折序工程至少需要保留一个步骤。');
  assertDiagramReturnTargetRemovable(project,stepId);
  const next={...project,states:[...project.states],steps:[...project.steps]},index=next.steps.findIndex(step=>step.id===stepId);
  const removed=next.steps[index],removedStateId=removed.afterId;
  next.steps.splice(index,1);next.states.splice(index+1,1);
  if(next.steps[index]){next.steps[index]=structuredClone(next.steps[index]);rebindStepBefore(next.steps[index],removed.beforeId);}
  if(next.activeStepId===stepId)next.activeStepId=next.steps[Math.min(index,next.steps.length-1)].id;
  for(let i=0;i<next.steps.length;i++) {
    let step=next.steps[i];
    if(step.simulationSurface?.sourceStateId!==removedStateId&&step.pose?.sourceStateId!==removedStateId&&step.foldLink?.fixed?.target?.stateId!==removedStateId)continue;
    step=next.steps[i]=structuredClone(step);
    if(step.simulationSurface?.sourceStateId===removedStateId){
      const surface=step.simulationSurface,source=next.states.find(state=>state.id===removed.beforeId&&same(state.doc,surface.sourceDoc))??next.states.find(state=>same(state.doc,surface.sourceDoc));
      if(source){surface.sourceStateId=source.id;surface.sourceRevision=source.revision;}
      else delete step.simulationSurface;
    }
    if(step.pose?.sourceStateId===removedStateId) {
      const source=next.states.find(state=>state.id===removed.beforeId&&same(state.doc,step.pose!.sourceDoc))??
        next.states.find(state=>same(state.doc,step.pose!.sourceDoc));
      if(source) {
        step.pose.sourceStateId=source.id;step.pose.sourceRevision=source.revision;
        if(step.paperStates)for(const pose of [step.paperStates.flat,step.paperStates.spatial,step.paperStates.pulled].filter((pose):pose is DiagramPose=>!!pose)){pose.sourceStateId=source.id;pose.sourceRevision=source.revision;}
      }else {
        if(step.annotations)step.annotations=resolveDiagramPaperBindings(step.pose,step.annotations);
        step.pose=null;
        clearCutawayFaces(step.annotations);
        delete step.paperStates;
        if(step.foldLink) {
          step.foldLink.selectedFaces=[];delete step.foldLink.fixed;
        }
      }
    }
    if(step.foldLink?.fixed?.target?.stateId===removedStateId)delete step.foldLink.fixed.target;
  }
  syncStepViewsInPlace(next,project);validateProject(next,false);return syncDiagramReturnLabels(next);
}

/** Navigation retains the immutable CP/illustration snapshots without copying them. */
export function selectDiagramStep(project:DiagramProject,stepId:string):DiagramProject {
  validateProject(project,false);requireStep(project,stepId);
  return project.activeStepId===stepId?project:{...project,activeStepId:stepId};
}

export function updateDiagramStep(project:DiagramProject,stepId:string,patch:{title?:string;description?:string}):DiagramProject {
  validateProject(project,false);requireStep(project,stepId);
  record(patch,[],['title','description'],'步骤修改');
  if(patch.title!==undefined&&typeof patch.title!=='string'||patch.description!==undefined&&typeof patch.description!=='string')throw new Error('步骤标题与说明必须为文本。');
  const {next,step}=copyStepForEdit(project,stepId);
  if(patch.title!==undefined)step.title=patch.title;
  if(patch.description!==undefined)step.description=patch.description;
  return next;
}

const isDefaultStepTitle=(title:string)=>/^步骤\s*\d+$/.test(title.trim());

/** Commit the overlay and its first symbol's suggested title together. User
 * titles and every CP state/pose remain untouched; later symbols never rename
 * a step, including after its symbols or title have been cleared. */
export function updateDiagramAnnotations(project:DiagramProject,stepId:string,annotations:DiagramAnnotation[]):DiagramProject {
  validateProject(project,false);
  return applyDiagramAnnotations(project,stepId,annotations);
}

/** Loading can restore many independent overlays. Validate the project at the
 * batch boundaries instead of scanning every CP again for each step. All
 * per-overlay validation and normal editing/bookkeeping still run below. */
export function updateDiagramAnnotationsBatch(project:DiagramProject,updates:ReadonlyArray<{stepId:string;annotations:DiagramAnnotation[]}>):DiagramProject {
  if(!updates.length)return project;
  validateProject(project,false);
  let next=project;
  for(const {stepId,annotations} of updates)next=applyDiagramAnnotations(next,stepId,annotations);
  validateProject(next,false);
  return next;
}

function applyDiagramAnnotations(project:DiagramProject,stepId:string,annotations:DiagramAnnotation[]):DiagramProject {
  annotations=cleanDiagramAnimationTimings(annotations);
  const original=requireStep(project,stepId);validateDiagramAnnotations(annotations);
  validateCutawayFaces(annotations,original.pose);
  annotations=editDiagramPaperBindings(original.pose,original.annotations??[],annotations);
  const {next,step}=copyStepForEdit(project,stepId),hadSymbol=original.annotations?.some(annotation=>annotation.kind==='symbol')??false;
  const first=annotations.find(annotation=>annotation.kind==='symbol');
  if(!original.firstSymbolPlaced&&(hadSymbol||first)){
    step.firstSymbolPlaced=true;
    if(!hadSymbol&&first?.kind==='symbol'&&(!original.title.trim()||isDefaultStepTitle(original.title)))step.title=SYMBOL_CATALOG.find(item=>item.kind===first.symbol)!.label;
  }
  step.annotations=structuredClone(annotations);
  next.steps[next.steps.indexOf(step)]=syncDiagramReturnAnnotationCaches(step);
  // An instruction is applied to the next canvas. Existing later canvases are
  // saved artwork, not a live rotation of every future page.
  const actions=(items:readonly DiagramAnnotation[])=>items.filter(item=>item.kind==='symbol'&&(item.symbol==='flip'||diagramSymbolTurnDegrees(item)!==0)).map(item=>item.kind==='symbol'?[item.symbol,diagramSymbolTurnDegrees(item)]:[]);
  if(!same(actions(original.annotations??[]),actions(annotations))){
    const index=next.steps.findIndex(item=>item.id===stepId);
    // Anchor the first later canvas at its current orientation. That manual
    // boundary preserves the remaining tail without copying or freezing it.
    for(let i=index+2;i<next.steps.length;i++){
      const old=project.steps[i],orientation=getDiagramStepInitialView(project,old.id);
      if(next.steps[i].viewMode==='manual'&&(old.pose||old.simulationSurface||next.steps[i].pendingView?.side===orientation.side&&next.steps[i].pendingView?.rotation===orientation.rotation))break;
      next.steps[i]={...next.steps[i],viewMode:'manual',...(!old.pose&&!old.simulationSurface?{pendingView:{side:orientation.side,rotation:orientation.rotation}}:{})};
      break;
    }
    syncStepViewsInPlace(next,project);
  }
  return syncDiagramReturnLabels(next);
}

export function updateDiagramCanvas(project:DiagramProject,stepId:string,canvas:DiagramCanvasSettings):DiagramProject {
  validateProject(project,false);requireStep(project,stepId);validateDiagramCanvas(canvas);
  const {next,step}=copyStepForEdit(project,stepId);step.canvas=structuredClone(canvas);return next;
}

/** Validate and enforce the existing project size before history/autosave commit,
 * so an oversized insertion leaves the original document completely intact. */
export function updateDiagramImages(project:DiagramProject,stepId:string,images:DiagramImage[],paperVisible?:boolean):DiagramProject {
  validateProject(project,false);requireStep(project,stepId);validateDiagramImages(images);
  if(paperVisible!==undefined&&typeof paperVisible!=='boolean')throw new Error('步骤纸面显示设置必须为布尔值。');
  const {next,step}=copyStepForEdit(project,stepId);step.images=structuredClone(images);
  if(paperVisible!==undefined)step.paperVisible=paperVisible;
  exportDiagramProject(next);return next;
}

/** A CP inset follows the semantic before boundary when the chain changes. */
function rebindStepBefore(step:DiagramStep,stateId:string):void {
  const previous=step.beforeId;step.beforeId=stateId;
  for(const callout of step.callouts??[])if(callout.source.kind==='cp'){
    if(callout.source.stateId===previous)callout.source.stateId=stateId;
    if(callout.comparison?.stateId===previous)callout.comparison.stateId=stateId;
  }
}

export function updateDiagramCallouts(project:DiagramProject,stepId:string,callouts:DiagramCallout[]):DiagramProject {
  validateProject(project,false);const original=requireStep(project,stepId);
  validateDiagramCallouts(callouts,[original.beforeId,original.afterId]);
  const {next,step}=copyStepForEdit(project,stepId);step.callouts=structuredClone(callouts);
  exportDiagramProject(next);return next;
}

/** A mode change never interprets existing drawing annotations as real CPs. */
export function updateDiagramFoldLink(project:DiagramProject,stepId:string,settings:DiagramFoldLinkSettings):DiagramProject {
  validateProject(project,false);requireStep(project,stepId);validateDiagramFoldLink(settings);
  const {next,step}=copyStepForEdit(project,stepId);step.foldLink=structuredClone(settings);
  // Keep the reflection/rotation origin when the fold changes the model bounds.
  // This records a view frame only; physical anchor matrices and CPs stay intact.
  if(settings.fixed&&step.pose&&!step.pose.spatial&&!step.pose.view?.projectionCenter){
    step.pose={...step.pose,view:{...copyModelView(step.pose.view),projectionCenter:modelProjectionCenter(step.pose.result.geometry.vertices)}};
    if(step.paperStates)step.paperStates={...step.paperStates};
    syncPaperState(step);
  }
  return next;
}

/** Shared intermediate states update both adjacent steps; existing poses remain snapshots. */
export function updateDiagramCP(project:DiagramProject,stateId:string,doc:Doc):DiagramProject {
  validateProject(project,false);validateDoc(doc);const state=requireState(project,stateId);
  if(state.revision===Number.MAX_SAFE_INTEGER)throw new Error('CP 修订号已超过可保存范围。');
  const target={...state,doc:structuredClone(doc),revision:state.revision+1};
  return {...project,states:project.states.map(item=>item===state?target:item)};
}

/** Put the simulator's actual surface in the following drawing. A curve is a
 * captured material state, not a replacement CP or a rigid fold certificate. */
export function applyDiagramSimulationSurface(project:DiagramProject,stepId:string,input:SimulationPose,options:{colors?:ModelColors;idFactory?:DiagramIdFactory}={}):DiagramProject {
  validateProject(project,false);
  const sourceStep=requireStep(project,stepId),source=requireState(project,sourceStep.afterId);
  const pose=validateSimulationPose(input);
  const surface:DiagramSimulationSurface={version:1,sourceStateId:source.id,sourceRevision:source.revision,sourceDoc:structuredClone(source.doc),pose,
    colors:structuredClone(options.colors??sourceStep.simulationSurface?.colors??sourceStep.pose?.view?.colors??defaultModelColors())};
  validateDiagramSimulationSurface(surface,true);
  const index=project.steps.findIndex(step=>step.id===stepId);
  const following=project.steps[index+1];
  const staged=following?project:appendDiagramStep({...project,activeStepId:stepId},options.idFactory??newId,{inheritSurface:false});
  const targetId=following?.id??staged.activeStepId,{next,step}=copyStepForEdit(staged,targetId);
  // Preserve authored overlay placements while removing old material anchors.
  // CP-generated crease artwork belongs to the replaced geometry only.
  step.annotations=structuredClone(resolveDiagramPaperBindings(step.pose,step.annotations??[])).filter(annotation=>!annotation.id.startsWith('cp-existing:')).map(annotation=>{
    if(annotation.kind==='symbol'){delete annotation.paperBinding;if(annotation.cutawayFaces)annotation.cutawayFaces=[];}
    if(annotation.kind==='line'){delete annotation.cameraSource;delete annotation.foldFaces;}
    return annotation;
  });
  step.pose=null;delete step.paperStates;delete step.pendingView;
  step.simulationSurface=surface;step.paperVisible=true;step.viewMode='manual';
  // Curved triangles are not the rigid face mapping used by CP-linked tools.
  // Ordinary annotations stay usable; CP editing remains an independent act.
  step.foldLink={enabled:false,layers:step.foldLink?.layers??'top',selectedFaces:[]};
  next.activeStepId=step.id;
  validateProject(next,false);
  return next;
}

/** Rotate a captured curve without changing its physical vertices or angles. */
export function updateDiagramSimulationSurfaceView(project:DiagramProject,stepId:string,view:SimulationPose['view']):DiagramProject {
  validateProject(project,false);validateDiagramSimulationSurfaceView(view);
  const {next,step}=copyStepForEdit(project,stepId),surface=step.simulationSurface;
  if(!surface)throw Error('当前步骤没有可转动的模拟曲面。');
  step.simulationSurface={...surface,pose:{...surface.pose,view:{...view}}};
  return next;
}

export function updateDiagramSimulationSurfaceColors(project:DiagramProject,stepId:string,colors:ModelColors):DiagramProject {
  validateProject(project,false);validateModelColors(colors);
  const {next,step}=copyStepForEdit(project,stepId),surface=step.simulationSurface;
  if(!surface)throw Error('当前步骤没有模拟曲面。');
  step.simulationSurface={...surface,colors:{...colors}};return next;
}

export function adoptDiagramPose(project:DiagramProject,stepId:string,stateId:string,result:FlatFoldResult,view?:ModelViewState,spatial?:DiagramSpatialPose):DiagramProject {
  validateProject(project,false);const previous=requireStep(project,stepId).pose,source=requireState(project,stateId);
  checkedResult(source.doc,result);const copiedView=copyModelView(view??(requireStep(project,stepId).orientationLocked?getDiagramStepInitialView(project,stepId):undefined)),{next}=copyStepForEdit(project,stepId);
  let step=requireStep(next,stepId);delete step.paperStates;delete step.simulationSurface;
  if(step.annotations)step.annotations=structuredClone(resolveDiagramPaperBindings(step.pose,step.annotations));
  // A coincident face count does not establish a mapping to a newly adopted
  // source. Retain the window artwork, but require its layer choice again.
  if(!previous||previous.sourceStateId!==source.id||previous.sourceRevision!==source.revision||
      !same(previous.sourceDoc,source.doc)||!samePaperFaceTopology(previous.result,result))clearCutawayFaces(step.annotations);
  inheritLegacyViewModes(next,project);
  step=requireStep(next,stepId);
  if(view!==undefined&&step.viewMode==='auto'){
    const index=next.steps.findIndex(candidate=>candidate.id===stepId);
    const previousStep=next.steps[index-1],basis=index>0?getDiagramStepInitialView(next,previousStep.id):copyModelView(undefined);
    const inherited=index>0?viewAfterSymbols(basis,previousStep.annotations??[],previousStep.canvas?.drawingRotation??0,step.canvas?.drawingRotation??0):basis;
    if(!sameOrientation(copiedView,inherited))step.viewMode='manual';
  }
  step.pose={sourceStateId:source.id,sourceRevision:source.revision,sourceDoc:structuredClone(source.doc),result:structuredClone(result),view:copiedView,...(spatial?{spatial:structuredClone(spatial)}:{}),
    ...(result.layers.faceOrder?{displayOrder:[...result.layers.faceOrder]}:{}),
    ...(result.layers.status==='solved'&&natural(result.layers.solutionIndex)?{layerSolutionIndex:result.layers.solutionIndex}:{})};
  if(spatial)validateDiagramSpatialPose(step.pose,true);
  delete step.pendingView;syncStepViewsInPlace(next,project);
  return next;
}

export function updateDiagramPoseResult(project:DiagramProject,stepId:string,result:FlatFoldResult,spatial?:DiagramSpatialPose|null):DiagramProject {
  validateProject(project,false);const pose=requireStep(project,stepId).pose;
  if(!pose)throw new Error('请先为当前步骤采用一个平折模型。');
  checkedResult(pose.sourceDoc,result);const {next}=copyStepForEdit(project,stepId,true);
  const step=requireStep(next,stepId),target=step.pose!;
  if(step.annotations)step.annotations=resolveDiagramPaperBindings(step.pose,step.annotations);
  if(!samePaperFaceTopology(pose.result,result)){
    clearCutawayFaces(step.annotations);delete step.paperStates;delete target.layerSolutionIndex;
  }
  if(!same(pose.result.geometry.vertices,result.geometry.vertices)||pose.result.geometry.startingFace!==result.geometry.startingFace||
      !same(pose.result.layers.constraints??[],result.layers.constraints??[])||!same(pose.result.layers.relativeConstraints??[],result.layers.relativeConstraints??[]))delete target.layerSolutionIndex;
  if(spatial===null&&target.spatial&&step.paperStates){step.paperStates.spatial=structuredClone(target);step.paperStates.spatialAnnotations=structuredClone(step.annotations??[]);step.paperStates.active='pulled';}
  target.result=structuredClone(result);
  if(spatial===null)delete target.spatial;
  else if(spatial!==undefined)target.spatial=structuredClone(spatial);
  if(target.spatial)validateDiagramSpatialPose(target,true);
  // A fresh solver result becomes the saved illustration order. Manual geometry
  // edits invalidate the certificate but keep the existing appearance instead.
  if(result.layers.status==='solved'&&result.layers.faceOrder)target.displayOrder=[...result.layers.faceOrder];
  if(result.layers.status==='solved'&&natural(result.layers.solutionIndex))target.layerSolutionIndex=result.layers.solutionIndex;
  if(samePaperFaceTopology(pose.result,result)&&same(pose.result.geometry.vertices,result.geometry.vertices))step.annotations=followDiagramDepthAnnotations(pose,target,step.annotations??[]);
  syncPaperState(step);
  return next;
}

/** Commit a paper edit while retaining the exact solver/source snapshot contract. */
export function updateDiagramPaperPose(project:DiagramProject,stepId:string,nextPose:DiagramPose):DiagramProject {
  const previous=requireStep(project,stepId).pose;if(!previous)throw Error('请先为当前步骤采用一个平折模型。');
  if(previous.sourceStateId!==nextPose.sourceStateId||previous.sourceRevision!==nextPose.sourceRevision||!same(previous.sourceDoc,nextPose.sourceDoc)||!samePaperFaceTopology(previous.result,nextPose.result))throw Error('纸面修形不能改变来源 CP 或原纸面拓扑。');
  validateDiagramPaperDeformation(nextPose);
  const next=updateDiagramPoseResult(project,stepId,nextPose.result,nextPose.spatial??null),step=requireStep(next,stepId);
  if(nextPose.paperDeformation)step.pose!.paperDeformation=structuredClone(nextPose.paperDeformation);else delete step.pose!.paperDeformation;
  if(!same(previous.paperDeformation,nextPose.paperDeformation))delete step.pose!.layerSolutionIndex;
  syncPaperState(step);return next;
}

/** Update only the drawing viewport of an already loaded immutable project.
 * Camera rectangles cannot change paper geometry, appearance or inherited
 * orientation. Validate their complete view contract, but do not serialize and
 * revalidate every unrelated CP/pose on each pan or wheel gesture. Import,
 * geometry edits and export retain their full validation paths. */
export function updateDiagramPoseViewport(project:DiagramProject,stepId:string,cameras:ModelViewState['cameras']):DiagramProject {
  const original=requireStep(project,stepId),pose=original.pose;
  if(!pose)throw new Error('请先为当前步骤采用一个平折模型。');
  if(original.simulationSurface)throw new Error('模拟曲面不能同时作为刚性折图。');
  const view=copyModelView({...copyModelView(pose.view),cameras});
  const paper=original.paperStates;
  if(paper){
    if(!['flat','spatial','pulled'].includes(paper.active)||!paper[paper.active]||
      paper[paper.active]!==pose&&!same(paper[paper.active],pose))throw new Error('当前纸面状态与步骤姿态不一致。');
  }
  if(same(pose.view?.cameras??{},view.cameras))return project;
  const {next,step}=copyStepForEdit(project,stepId);
  step.pose={...pose,view};
  // The immutable pose is also the active snapshot. Keep the untouched modes
  // and their geometry identities; no deep clone or orientation propagation.
  if(paper)step.paperStates={...paper,[paper.active]:step.pose};
  return next;
}

export function updateDiagramPoseView(project:DiagramProject,stepId:string,view:ModelViewState):DiagramProject {
  validateProject(project,false);if(!requireStep(project,stepId).pose)throw new Error('请先为当前步骤采用一个平折模型。');
  const copied=copyModelView(view),{next}=copyStepForEdit(project,stepId);
  inheritLegacyViewModes(next,project);
  const step=requireStep(next,stepId);
  if(!sameOrientation(copyModelView(step.pose!.view),copied)){step.viewMode='manual';delete step.pendingView;}
  step.pose={...step.pose!,view:copied};if(step.paperStates)step.paperStates={...step.paperStates};
  syncPaperState(step);syncStepViewsInPlace(next,project);return next;
}

/** Lock the current direction without moving artwork or changing physical CP anchors.
 * Unlocking leaves the authored view in manual mode until the user changes it. */
export function updateDiagramOrientationLock(project:DiagramProject,stepId:string,locked:boolean):DiagramProject {
  validateProject(project,false);requireStep(project,stepId);
  if(typeof locked!=='boolean')throw new Error('整图朝向锁定设置必须为布尔值。');
  const {next,step}=copyStepForEdit(project,stepId);step.orientationLocked=locked;
  if(locked&&step.pose){step.viewMode='manual';delete step.pendingView;}
  else if(locked){step.viewMode='auto';const view=getDiagramStepInitialView(next,stepId);step.pendingView={side:view.side,rotation:view.rotation};}
  return next;
}

/** Visibility is one display preference shared by the flat and pulled
 * illustration snapshots; source CPs, coordinates and layer order stay intact. */
export function updateDiagramHiddenFaces(project:DiagramProject,stepId:string,faces:number[]):DiagramProject {
  validateProject(project,false);const current=requireStep(project,stepId),pose=current.pose;
  if(!pose)throw new Error('请先为当前步骤采用一个平折模型。');
  validateHiddenFaces(faces,pose.result.geometry.faces.length);
  const {next,step}=copyStepForEdit(project,stepId,true),hidden=[...faces].sort((a,b)=>a-b);
  step.pose!.hiddenFaces=[...hidden];
  if(step.paperStates)for(const cached of [step.paperStates.flat,step.paperStates.spatial,step.paperStates.pulled].filter((pose):pose is DiagramPose=>!!pose)){
    validateHiddenFaces(hidden,cached.result.geometry.faces.length);cached.hiddenFaces=[...hidden];
  }
  syncPaperState(step);return next;
}

export function updateDiagramPoseDisplayOrder(project:DiagramProject,stepId:string,order:number[]):DiagramProject {
  validateProject(project,false);const pose=requireStep(project,stepId).pose;
  if(!pose)throw new Error('请先为当前步骤采用一个平折模型。');
  validateDisplayOrder(order,pose.result.geometry.faces.length);
  const {next,step}=copyStepForEdit(project,stepId,true);step.pose!.displayOrder=[...order];syncPaperState(step);return next;
}

/** Keep the user's candidate preference when clearing untrusted solver caches. */
function preparePoseSnapshot(pose:DiagramPose,previous?:DiagramPose):void {
  if(pose.spatial){restoreDiagramSpatialLayers(pose,previous);return;}
  if(pose.layerSolutionIndex===undefined&&pose.result.layers.status==='solved'&&natural(pose.result.layers.solutionIndex))pose.layerSolutionIndex=pose.result.layers.solutionIndex;
  const edgeOn=pose.result.geometry.graph?.zhezhi_spatialEdgeOnFaces;
  pose.result=importModelSnapshot(exportModelSnapshot(pose.sourceDoc,pose.result)).result;
  if(edgeOn)pose.result.geometry.graph!.zhezhi_spatialEdgeOnFaces=structuredClone(edgeOn);
}

/** Persist geometry snapshots, views and illustration order without old solver certificates. */
export function exportDiagramProject(project:DiagramProject):string {
  validateDiagramProject(project);const next=syncDiagramReturnLabels(project);
  // Prepare one detached step at a time. Saving still produces the same full
  // portable project, without allocating a second complete geometry bank.
  const steps:string[]=[];let previous:DiagramStep|undefined;
  for(const original of next.steps){
    const step=structuredClone(original),basis=previous?.paperStates?.spatial??previous?.paperStates?.flat??previous?.pose??undefined;
    if(step.pose){
      repairDiagramPaperStatesInPlace(step);preparePoseSnapshot(step.pose,basis);
      if(step.paperStates){for(const pose of [step.paperStates.flat,step.paperStates.spatial,step.paperStates.pulled].filter((pose):pose is DiagramPose=>!!pose))preparePoseSnapshot(pose,basis);syncPaperState(step);}
    }
    steps.push(JSON.stringify(step));previous=step;
  }
  return '{'+Object.entries(next).map(([key,value])=>JSON.stringify(key)+':'+(key==='steps'?'['+steps.join(',')+']':JSON.stringify(value))).join(',')+'}';
}

/** Fully prepare all CPs and snapshots before returning a replacement project. */
export function importDiagramProject(text:string):DiagramProject {
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw new Error('折序工程不是有效 JSON。');}
  validateDiagramProject(value);
  // JSON.parse already creates a private object graph. Normalizing that graph
  // avoids a second full copy of large multi-step projects at import time.
  const next=syncDiagramReturnLabels(value);
  for(const [i,step] of next.steps.entries())if(step.pose) {
    repairDiagramPaperStatesInPlace(step);
    preparePoseSnapshot(step.pose,next.steps[i-1]?.paperStates?.spatial??next.steps[i-1]?.paperStates?.flat??next.steps[i-1]?.pose??undefined);
    if(step.paperStates){for(const pose of [step.paperStates.flat,step.paperStates.spatial,step.paperStates.pulled].filter((pose):pose is DiagramPose=>!!pose))preparePoseSnapshot(pose,next.steps[i-1]?.paperStates?.spatial??next.steps[i-1]?.paperStates?.flat??next.steps[i-1]?.pose??undefined);syncPaperState(step);}
  }
  return next;
}
