import { OrigamiModel } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import { ReferenceSolver } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import { WebglSolver } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/webglSolver';
import { SimulationClock } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/simulationClock';
import { boundingRadius, cameraUniforms, centroid, projectVertices } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type { RenderSettings,MeshPositionFrame,MeshTopology } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import type { SolverBackend, SolverPoseSnapshot } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';
import {validateSimulationPose,type SimulationPose} from './simPose';
import type { PreparedOrigamiModel } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type { SimulatorCommand, SimulatorStatus, SimulationImageCapture, SimulationImageCaptureReply } from './simulator';
import { prepareSimulationDocument } from './simmodel';
import type {SimulationMeshQuality} from './simFlexibleMesh';
import {SimulationContactGuard} from './simContact';
import {SimulationFoldLimitGuard} from './simFoldLimit';
import {scaleSimulationImageSettings,simulationImageDimensions,simulationImageFromBackgrounds,flipSimulationImageRows} from './simImageExport';
import {displaySettings,simulationFoldSnapshot,DEFAULT_SIMULATION_DISPLAY_OPTIONS,mergeSimulationDisplayOptions,type SimulationDisplayOptions,type SimulationDisplayMode,type SimulationCameraPreset,type SimulationCreaseStyle} from './simDisplay';
import {SimulationSurfaceLayers,SIMULATION_SURFACE_GAP_SCALE,SIMULATION_SURFACE_GAP_CAP,selectSimulationSurfaceBaseGap,resizeSimulationSurfaceGap,blendSimulationSurface,simulationSurfaceStrain,simulationCreasePlaneNormal,type SimulationSurfaceMesh} from './simSurfaceLayers';
import {simulationSourceSignature,validateSimulationLayerOrder} from './simLayerOrder';
import {SimulationLayerEndpoint} from './simLayerEndpoint';
import {SimulationRasterizer} from './simRaster';
import {meshTopologyFor} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';
import {pickSimulationVertex,simulationDragTarget,type PickedSimulationVertex} from './simInteraction';
import {simulationSculptSupports} from './simSculpt';
import {simulationObjText,simulationStlText} from './simExport';
import {simulationPaperColorSettings} from './simColors';
import {DEFAULT_SIMULATION_VIEW,mountSimulationViewCube,orbitSimulationView,simulationCameraAngles} from './simViewCube';
import {validateSimulationStepAnimation,simulationStepFoldProfile,seedSimulationStepAnimation,type SimulationStepAnimation} from './simStepAnimation';
import {simulationStepLayerOrderAt} from './simStepLayerTimeline';
import {simulationStepCameraBounds} from './simStepCamera';
import {simulationStepDisplayAssignments} from './simStepEdges';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS,mergeSimulationSolverSettings,simulationSolverFrameStepCap,simulationFoldProgress,type SimulationSolverSettings} from './simSettings';
import {SimulationAngleAnalyzer,type SimulationAngleDiagnostics,type SimulationSolveState} from './simConvergence';
import {saveDownload} from '../app/api';

let canvas = document.querySelector<HTMLCanvasElement>('#simulation')!;
const statusLabel = document.querySelector<HTMLDivElement>('#status')!;
let backend: SolverBackend | null = null;
let prepared: PreparedOrigamiModel | null = null;
let clock = new SimulationClock();
let revision: string | number | undefined;
let warnings: string[] = [];
let backendName: 'webgl2' | 'cpu' | undefined;
let running = false;
let lowVelocityStable=false;
let angleAnalyzer:SimulationAngleAnalyzer|null=null;
let anglePositions=new Float32Array(),angleHistory=new Float32Array();
let angleSampleTime=-Infinity,angleSampleStep=-1,angleSamplePoseRevision=-1;
let targetProgress = 0;
let positions: Float32Array = new Float32Array();
let center: [number, number, number] = [0, 0, 0];
let radius = 1;
let cameraRadius = 1;
const view = {...DEFAULT_SIMULATION_VIEW};
let dirty = true;
let lastStatusTime = 0;
let failed = false;
let frameRequest = 0;
let displayMode:SimulationDisplayMode='paper';
let displayOptions:SimulationDisplayOptions={...DEFAULT_SIMULATION_DISPLAY_OPTIONS};
let creaseStyle:SimulationCreaseStyle='assignment';
let surfaceLayers:SimulationSurfaceLayers|null=null;
let surfaceMesh:SimulationSurfaceMesh|null=null;
let surfaceTargetMesh:SimulationSurfaceMesh|null=null;
let surfaceGapLayout:SimulationSurfaceMesh|null=null;
let surfaceCreaseNormal:readonly [number,number,number]|undefined;
const layerEndpoint=new SimulationLayerEndpoint();
let layerOrderState:'pending'|'ready'|'unavailable'='unavailable';
let layerOrderMessage='尚未确认平折层序。';
let layerDisplayState:'inactive'|'blending'|'active'='inactive';
let layerOrderKey='';
let sourceSignature='';
let sourceFaceCount=0;
let lastMessage='';
let surfaceBlend=-1;
let grabbedVertex=false;
let surfaceStep=-1;
let surfaceGap=-1;
// Manual layer-gap scaling stays disabled. Ordinary simulation endpoints use
// the automatic microscopic contact display; animation retains its own path.
const surfaceGapEnabled=false;
let layerGapMultiplier=0;
let layerGapError:string|undefined;
let surfaceTopology:MeshTopology|null=null;
let surfaceSourceIndices:Uint32Array|null=null;
let surfacePaperFrame:MeshPositionFrame|undefined;
let surfaceStrainFrame:MeshPositionFrame|undefined;
let cameraPreset:SimulationCameraPreset|'free'='isometric';
let solverSettings:SimulationSolverSettings={...DEFAULT_SIMULATION_SOLVER_SETTINGS};
let frameSteps:number|undefined;
let maxVelocity:number|undefined;
let releaseActiveGrab=()=>{};
let updateGrabMarker=()=>{};
let updateGrabShift=(_shift:boolean)=>{};
let clearGrabPointer=()=>{};
let isPointerInteractionActive=()=>false;
let grabEnabled=false;
let pinEnabled=false;
let sourceFold:unknown=null;
let meshQuality:SimulationMeshQuality='original';
let collisionEnabled=false;
let collisionMessage='';
let contactGuard:SimulationContactGuard|null=null;
let limitFoldAngles=false;
let foldLimitGuard:SimulationFoldLimitGuard|null=null;
let contactSettledTicks=0;
let poseRestored=false;
let poseEditRevision=0;
const pinnedVertices=new Map<number,[number,number,number]>();
type PoseEdit={solver:SolverPoseSnapshot;progress:number;settings:SimulationSolverSettings};
const poseUndo:PoseEdit[]=[],poseRedo:PoseEdit[]=[];
function capturePoseEdit():PoseEdit{return {solver:backend!.capturePose(),progress:targetProgress,settings:{...solverSettings}};}
function rememberPose(before:PoseEdit){
  lowVelocityStable=false;
  poseEditRevision++;
  poseUndo.push(before);poseRedo.length=0;
  // Large CPs can carry substantial geometry. Bound both count and memory.
  let bytes=0;for(let i=poseUndo.length-1;i>=0;i--){bytes+=JSON.stringify(poseUndo[i]).length*2;if(poseUndo.length-i>20||bytes>32*1024*1024){poseUndo.splice(0,i+1);break;}}
  updateGrabControls();
}
function restorePoseEdit(next:PoseEdit){
  if(foldLimitGuard&&!foldLimitGuard.allowed(next.solver))throw Error('该历史姿态超过 180° 或纸面退化；请关闭折角上限后恢复。');
  backend!.setMaterial({...next.settings,integrationType:'euler'});
  backend!.restorePose(next.solver);backend!.setMaterial(next.settings);
  backend!.setFoldPercent(next.progress*100);targetProgress=next.progress;solverSettings={...next.settings};
  pinnedVertices.clear();for(const pin of next.solver.pins)pinnedVertices.set(pin.index,[...pin.position]);
  running=false;maxVelocity=0;frameSteps=0;rebuildClock();layerEndpoint.reset();surfaceBlend=-1;surfaceStep=-1;dirty=true;updateGrabControls();
}
function historyPose(direction:'undo'|'redo'){
  if(!backend||failed||stepAnimation||collisionEnabled)return;
  releaseActiveGrab();const from=direction==='undo'?poseUndo:poseRedo,to=direction==='undo'?poseRedo:poseUndo,next=from.at(-1);if(!next)return;
  try{const current=capturePoseEdit();restorePoseEdit(next);from.pop();to.push(current);poseEditRevision++;updateGrabControls();report('paused',direction==='undo'?'已撤销三维操作，保持暂停。':'已重做三维操作，保持暂停。');}catch(error){reportExportError(error);}
}
function capturePose(finishGesture=true):SimulationPose{
  if(!backend||!prepared||failed||stepAnimation)throw new Error('请先载入有效的普通三维模型再保存姿态。');
  if(!finishGesture&&isPointerInteractionActive())throw new Error('三维交互进行中，稍后暂存');
  releaseActiveGrab();
  return {version:1,source:structuredClone(sourceFold),...(meshQuality==='original'?{}:{mesh:meshQuality}),...(collisionEnabled?{collision:true}:{}),solver:backend.capturePose(),progress:targetProgress,settings:{...solverSettings},view:{yaw:view.yaw,pitch:view.pitch,zoom:view.zoom}};
}
function updatePinMarkers(){
  const container=document.querySelector<HTMLElement>('#pinned-vertices')!;
  if(!backend||!prepared||failed||!pinnedVertices.size){container.replaceChildren();return;}
  const camera=cameraUniforms(view,center,cameraRadius,canvas.width,canvas.height),rect=canvas.getBoundingClientRect();
  const dots=[...pinnedVertices].map(([index,position])=>{const dot=document.createElement('i'),screen=projectVertices(new Float32Array(position),camera).screen;
    dot.style.left=`${rect.left+screen[0]*rect.width/canvas.width}px`;dot.style.top=`${rect.top+screen[1]*rect.height/canvas.height}px`;dot.dataset.vertex=String(index);return dot;});
  container.replaceChildren(...dots);
}
let stepAnimation:SimulationStepAnimation|null=null;
let seekStepDynamic:((progress:number)=>void)|undefined;
const cpuRaster=new SimulationRasterizer();
let cpuImage:ImageData|null=null;
const updateViewCube=mountSimulationViewCube(document.querySelector<HTMLElement>('#orientation-cube')!,chooseCameraPreset,(dx,dy)=>{releaseActiveGrab();orbitCamera(dx,dy);},()=>{
  if(backend&&!failed)report(running?'running':'paused','已旋转视角。');
});

function orbitCamera(dx:number,dy:number){
  Object.assign(view,orbitSimulationView(view,dx,dy));cameraPreset='free';
  canvas.dataset.view=cameraPreset;canvas.dataset.yaw=String(view.yaw);canvas.dataset.pitch=String(view.pitch);
  updateViewCube(view);dirty=true;
}
function chooseCameraPreset(preset:SimulationCameraPreset){
  releaseActiveGrab();
  const angles=simulationCameraAngles[preset];view.yaw=angles[0];view.pitch=angles[1];
  if(preset==='isometric')Object.assign(view,DEFAULT_SIMULATION_VIEW);
  cameraPreset=preset;canvas.dataset.view=preset;canvas.dataset.yaw=String(view.yaw);canvas.dataset.pitch=String(view.pitch);
  updateViewCube(view);dirty=true;
  if(backend&&!failed)report(running?'running':'paused',preset==='isometric'?'已恢复立体视角。':'已切换观察方向。');
}

const settings: RenderSettings = {
  // The upstream orbit camera is a reflection: its GL front-facing flag is inverted.
  // Paper +Y (mountain ridges rise toward it) is therefore the renderer's backColor.
  frontColor: [0.41, 0.61, 0.52], backColor: [0.98, 0.96, 0.88],
  mountainColor: [0.76, 0.20, 0.23], valleyColor: [0.18, 0.38, 0.72], borderColor: [0.22, 0.30, 0.27],
  lightDir: [-0.3, 0.5, 1], background: [0.941, 0.953, 0.937],
  showFaces: true, showEdges: true, lighting: true, creaseWidthPx: 1.6, faceAlpha: 1,
  creaseDash: { border: null, mountain: null, valley: [5, 3] },
  // Avoid pulling a hidden layer's creases through the surface above it.
  creaseDepthBias: 0.000002, creaseWritesDepth: false,
};

function report(status: SimulatorStatus['status'], message: string, error?: string) {
  if(running||grabbedVertex)lowVelocityStable=false;
  const solveState:SimulationSolveState=!backend||!prepared||failed?'unavailable':running||grabbedVertex?'solving':lowVelocityStable?'low-velocity':'paused';
  lastMessage=message;
  const layerText=layerGapError??(layerOrderState==='ready'?(layerDisplayState==='active'?`已按平折层序消除重叠闪色 · ${surfaceMesh?.layerCount??1} 层。`:layerDisplayState==='blending'?'正在应用平折显示层序。':'平折层序已确认，接近平折并稳定后应用。'):layerOrderMessage);
  const displayMessage=prepared&&!error?`${message}\n${layerText}`:message;
  const diagnostics = backend?.readDiagnostics();
  const payload: SimulatorStatus = {
    type: 'zhezhi-sim-status', status, message:displayMessage, revision, backend: backendName,
    strain: diagnostics?.maxNodalStrain ?? diagnostics?.maxEdgeStrain,
    steps: backend?.stepCount, view:cameraPreset, creaseStyle:stepAnimation?'crease':creaseStyle, warnings, ...(error ? { error } : {}),
    layerOrder:layerOrderState,layerDisplay:layerDisplayState,layerMessage:layerOrderMessage,layerCount:layerDisplayState==='inactive'?1:surfaceMesh?.layerCount??1,
    layerGapMultiplier,layerGap:layerDisplayState==='inactive'?0:surfaceMesh?.layerGap??0,...(layerGapError?{layerGapError}:{}),
    animation:!!stepAnimation,progress:targetProgress,solverSettings:{...solverSettings},displayOptions:{...displayOptions},poseRestored,
    meshQuality,meshVertices:prepared?.vertexCount,meshTriangles:prepared?.faceCount,
    collisionEnabled,collisionMessage,
    pinnedVertices:pinnedVertices.size,canUndoPose:poseUndo.length>0,canRedoPose:poseRedo.length>0,poseEditRevision,interactionActive:grabbedVertex,
    solveState,angleDiagnostics:readAngleDiagnostics(),
    ...(diagnostics?.meanNodalStrain===undefined?{}:{meanNodalStrain:diagnostics.meanNodalStrain}),
    ...(frameSteps===undefined?{}:{frameSteps}),...(maxVelocity===undefined?{}:{maxVelocity}),
  };
  statusLabel.textContent = warnings.length ? `${displayMessage}\n${warnings.join('；')}` : displayMessage;
  statusLabel.classList.toggle('error', status === 'error');
  // Never broadcast input models to another origin, even if this view is embedded elsewhere.
  if (window.parent !== window) window.parent.postMessage(payload, location.origin);
  canvas.dataset.status = status;
  canvas.dataset.solveState=solveState;
  canvas.dataset.backend = backendName ?? '';
  canvas.dataset.steps = String(backend?.stepCount ?? 0);
  canvas.dataset.displayMode=displayMode;
  for(const [key,value] of Object.entries(displayOptions))canvas.dataset[`display${key[0].toUpperCase()}${key.slice(1)}`]=String(value);
  canvas.dataset.creaseStyle=stepAnimation?'crease':creaseStyle;
  canvas.dataset.targetProgress=String(targetProgress);
  canvas.dataset.view=cameraPreset;
  canvas.dataset.yaw=String(view.yaw);canvas.dataset.pitch=String(view.pitch);
  for(const [key,value] of Object.entries(solverSettings))canvas.dataset[key]=String(value);
  canvas.dataset.frameSteps=frameSteps===undefined?'':String(frameSteps);
  canvas.dataset.maxVelocity=maxVelocity===undefined?'':String(maxVelocity);
  canvas.dataset.layerOrder=layerOrderState;canvas.dataset.layerDisplay=layerDisplayState;
  canvas.dataset.animation=String(!!stepAnimation);
  canvas.dataset.meshQuality=meshQuality;canvas.dataset.meshVertices=String(prepared?.vertexCount??0);canvas.dataset.meshTriangles=String(prepared?.faceCount??0);
  canvas.dataset.collisionEnabled=String(collisionEnabled);canvas.dataset.collisionMessage=collisionMessage;
  canvas.dataset.previewFoldPercent=stepAnimation?'100':'';
  canvas.dataset.previewInitialFoldPercent=stepAnimation?'100':'';
  canvas.dataset.layerGapMultiplier=String(layerGapMultiplier);
  canvas.dataset.layerGapError=layerGapError??'';
  canvas.dataset.pinned=String(pinnedVertices.size);canvas.dataset.poseUndo=String(poseUndo.length);canvas.dataset.poseRedo=String(poseRedo.length);
}

/** Sample physical geometry and unwrapped history together. Target playback may
 * report every 50 ms; cap GPU readbacks at 4 Hz until a final paused pose. */
function readAngleDiagnostics():SimulationAngleDiagnostics{
  if(!backend||!prepared||!angleAnalyzer||failed)return {status:'unavailable',creaseCount:0,unassignedCreaseCount:0,reason:'尚无有效的三维求解结果。'};
  if(stepAnimation)return angleAnalyzer.unavailable('步骤动画使用独立姿态轨迹，折角历史不是自由求解结果，暂不判断目标角偏差。');
  const now=performance.now(),changed=backend.stepCount!==angleSampleStep||poseEditRevision!==angleSamplePoseRevision;
  if(angleSampleStep<0||poseEditRevision!==angleSamplePoseRevision||changed&&(!running||now-angleSampleTime>=250)){
    try{
      backend.readPositions(anglePositions);backend.readCreaseAngles(angleHistory);
      angleAnalyzer.measure(anglePositions,angleHistory);
      angleSampleTime=now;angleSampleStep=backend.stepCount;angleSamplePoseRevision=poseEditRevision;
    }catch{return angleAnalyzer.unavailable('暂时无法读取实际折角，请等待下一次数值更新。');}
  }
  return angleAnalyzer.evaluate(targetProgress);
}

function fail(error: unknown) {
  running = false;
  failed = true;
  releaseActiveGrab();
  const message = error instanceof Error && /[\u3400-\u9fff]/.test(error.message)
    ? error.message : '模拟引擎无法处理此模型，请检查纸面和折线，或重新载入后重试。';
  report('error', message, message);
  // Technical details stay in developer diagnostics, never in an untranslated dialog.
  console.error('[折纸工坊：模拟]', error);
}

function resize() {
  releaseActiveGrab();
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(innerWidth * dpr));
  canvas.height = Math.max(1, Math.round(innerHeight * dpr));
  dirty = true;
}

function updateGrabControls(){
  const disabled=!!stepAnimation||solverSettings.integrationType==='verlet';
  if(disabled){grabEnabled=false;pinEnabled=false;}
  if(collisionEnabled||limitFoldAngles)grabEnabled=false;
  const button=document.querySelector<HTMLButtonElement>('#vertex-grab');
  if(button){button.disabled=disabled||collisionEnabled||limitFoldAngles;button.title=limitFoldAngles?'关闭折角上限后可拖动塑形':collisionEnabled?'关闭纸面碰撞保护后可拖动塑形':'';button.setAttribute('aria-pressed',String(grabEnabled));}
  const pinButton=document.querySelector<HTMLButtonElement>('#vertex-pin');if(pinButton){pinButton.disabled=disabled;pinButton.setAttribute('aria-pressed',String(pinEnabled));}
  for(const [id,off] of [['pose-undo',!poseUndo.length],['pose-redo',!poseRedo.length],['pins-clear',!pinnedVertices.size]] as const){const item=document.querySelector<HTMLButtonElement>('#'+id);if(item)item.disabled=!!stepAnimation||!backend||off||collisionEnabled&&id!=='pins-clear';}
  canvas.dataset.interaction=pinEnabled?'pin':grabEnabled?'grab':'orbit';
  canvas.setAttribute('aria-label',disabled?'折纸三维模拟。拖动旋转视角，滚轮缩放。':grabEnabled?'折纸三维模拟。悬停亮点后拖动顶点塑形，滚轮缩放。关闭顶点塑形可旋转视角。':'折纸三维模拟。拖动旋转视角，滚轮缩放。按住 Shift 后拖动亮点调整纸面。');
  document.querySelector('#hint')!.textContent=stepAnimation?'步骤动画 · 拖动旋转 · 滚轮缩放':solverSettings.integrationType==='verlet'?'Verlet 积分 · 顶点塑形暂不可用 · 拖动旋转 · 滚轮缩放':grabEnabled?'拖动亮点塑形 · 远处纸面自动支撑 · 松手保留形状':'拖动旋转 · 滚轮缩放 · Shift+拖动亮点塑形';
  if(pinEnabled){canvas.setAttribute('aria-label','三维固定点。点击可见顶点固定，再次点击解除。');document.querySelector('#hint')!.textContent='点击顶点固定／解除 · 固定后切换顶点塑形 · Ctrl+Z 撤销';}
  if(collisionEnabled&&!pinEnabled){canvas.setAttribute('aria-label','纸面碰撞保护已开启。拖动旋转视角，滚轮缩放。');document.querySelector('#hint')!.textContent='纸面碰撞保护 · 拖动旋转 · 滚轮缩放 · 暂停顶点塑形';}
  if(limitFoldAngles&&!pinEnabled){canvas.setAttribute('aria-label','折角上限 180° 已开启。拖动旋转视角，滚轮缩放。');document.querySelector('#hint')!.textContent='折角上限 180° · 拖动旋转 · 滚轮缩放 · 关闭上限后可拖动塑形';}
  updateGrabMarker();
  updatePinMarkers();
}

function rebuildClock(){
  lowVelocityStable=false;
  contactSettledTicks=0;
  clock=new SimulationClock({budgetMs:6,chunkSteps:stepAnimation?1:backendName==='webgl2'?8:4,
    maxStepsPerFrame:stepAnimation?1:simulationSolverFrameStepCap(solverSettings,backendName??'webgl2'),
    convergenceTicks:stepAnimation?1:3,blowupStrain:0});
}

function rebuildContactGuard(){
  contactGuard=null;contactSettledTicks=0;
  if(!collisionEnabled||!prepared||!backend||stepAnimation)return;
  contactGuard=new SimulationContactGuard(prepared,backend,{maxTimeMs:40,maxPairs:250_000,maxBisections:8});
  const checked=contactGuard.initialize();
  collisionMessage=checked.status==='clear'?'已检查当前姿态，后续每个积分步均限制穿透。':checked.reason??'当前接触状态无法确认，已暂停；可复位后重试。';
  if(checked.status!=='clear'){running=false;lowVelocityStable=false;}
}

function advanceWithContact(count:number){
  if(!contactGuard)rebuildContactGuard();
  const result=contactGuard!.step(count);
  if(result.status!=='clear'){
    running=false;lowVelocityStable=false;contactSettledTicks=0;
    collisionMessage=result.reason??'纸面接触限制了本次运动，已暂停。';
  }else if(result.constrainedSteps){
    collisionMessage='已限制接触区域的穿透运动，其他纸面继续折叠。';
  }
  return result;
}

function advanceWithGuards(count:number){
  const advance=()=>{
    if(collisionEnabled)return advanceWithContact(1);
    backend!.step(1);return {status:'clear' as const,advancedSteps:1};
  };
  const result=foldLimitGuard?foldLimitGuard.step(count,advance):advanceWithContact(count);
  if(result.status!=='clear'){running=false;lowVelocityStable=false;contactSettledTicks=0;}
  return result;
}

function advanceGuardedFrame(){
  const deadline=performance.now()+6,cap=simulationSolverFrameStepCap(solverSettings,backendName??'webgl2');
  let result=advanceWithGuards(1),steps=result.advancedSteps,constrained=result.constrainedSteps??0;
  // Every actual integrator step is still checked. The frame budget only
  // decides when to yield to painting; it never skips collision intervals.
  while(result.status==='clear'&&result.advancedSteps>0&&steps<cap&&performance.now()<deadline){
    result=advanceWithGuards(1);steps+=result.advancedSteps;constrained+=result.constrainedSteps??0;
  }
  return {...result,advancedSteps:steps,constrainedSteps:constrained};
}

function applySolverSettings(patch:unknown){
  const next=mergeSimulationSolverSettings(solverSettings,patch);
  if(!next)return;
  if(stepAnimation&&next.integrationType==='verlet'){
    report(running?'running':'paused','步骤动画使用固定顶点，暂只支持 Euler 积分。');return;
  }
  if(pinnedVertices.size&&next.integrationType==='verlet'){report(running?'running':'paused','请先解除固定点，再切换 Verlet 积分。');return;}
  if(Object.keys(next).every(key=>next[key as keyof SimulationSolverSettings]===solverSettings[key as keyof SimulationSolverSettings]))return;
  try{
    const continueSolving=running&&!grabbedVertex;
    releaseActiveGrab();
    backend?.setMaterial(next);
    poseRedo.length=0;
    solverSettings=next;rebuildClock();frameSteps=0;maxVelocity=undefined;
    updateGrabControls();dirty=true;
    if(backend&&!failed){running=continueSolving;report(running?'running':'paused',running?'求解参数已更新，正在重新求解…':'求解参数已更新，保留当前姿态；继续求解后应用。');}
    else report('ready','求解参数已更新，等待折痕图。');
  }catch(error){fail(error);}
}

function mountCanvas() {
  releaseActiveGrab();
  const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
  canvas.replaceWith(replacement);
  canvas = replacement;
  updateGrabControls();
  let drag: { x: number; y: number; id: number; vertex?:PickedSimulationVertex; camera?:ReturnType<typeof cameraUniforms>; wasRunning?:boolean; constrained?:boolean; before?:PoseEdit; supports?:SolverPoseSnapshot['pins'] } | null = null;
  isPointerInteractionActive=()=>drag!==null;
  let pointer:{x:number;y:number;shift:boolean}|null=null;
  const marker=document.querySelector<HTMLElement>('#vertex-marker')!;
  const canGrab=()=>!!backend&&!!prepared&&!failed&&!stepAnimation&&solverSettings.integrationType==='euler'&&(!collisionEnabled&&!limitFoldAngles||pinEnabled);
  const pickAt=(x:number,y:number,camera:ReturnType<typeof cameraUniforms>)=>pickSimulationVertex(positions,camera,x,y,14*canvas.width/canvas.clientWidth,
    displayOptions.showFaces&&displayMode!=='wireframe'&&displayMode!=='xray'?prepared!.indices:undefined);
  updateGrabMarker=()=>{
    marker.hidden=true;delete canvas.dataset.hovered;
    if(!canGrab()||!drag?.vertex&&(!pointer||!grabEnabled&&!pinEnabled&&!pointer.shift))return;
    backend!.readPositions(positions);
    const camera=cameraUniforms(view,center,cameraRadius,canvas.width,canvas.height);
    const picked=drag?.vertex??pickAt(pointer!.x,pointer!.y,camera);
    if(!picked)return;
    const projected=projectVertices(positions.subarray(picked.index*3,picked.index*3+3),camera).screen;
    const rect=canvas.getBoundingClientRect();
    marker.style.left=`${rect.left+projected[0]*rect.width/canvas.width}px`;
    marker.style.top=`${rect.top+projected[1]*rect.height/canvas.height}px`;
    marker.dataset.state=drag?.vertex?'grab':'hover';marker.hidden=false;
    canvas.dataset.hovered=String(picked.index);
  };
  updateGrabShift=shift=>{if(pointer)pointer.shift=shift;updateGrabMarker();};
  clearGrabPointer=()=>{pointer=null;updateGrabMarker();};
  const endDrag=(announce=true)=>{
    const active=drag;drag=null;grabbedVertex=false;delete canvas.dataset.grabbed;
    try{
      if(active?.constrained&&backend){
        backend.setVertexConstraint(active.vertex!.index,pinnedVertices.get(active.vertex!.index)??null);
        // Replace the temporary supports in one upload, including disconnected
        // pieces, without leaving them in saved poses or the user pin list.
        if(active.before){
          const current=failed?active.before.solver:backend.capturePose();
          backend.restorePose({...current,pins:active.before.solver.pins});
        }
        backend.setMaterial(solverSettings);
        if(!failed){
          // Sculpting is a pose edit, not a transient force on the old fold
          // target. Freeze the edited geometry exactly where it was released.
          backend.arrestDynamics();
          clock.invalidate();dirty=true;
          running=false;maxVelocity=0;frameSteps=0;
          if(active.before)rememberPose(active.before);
          report('paused','已保留塑形结果。继续求解或调整折叠进度后，才重新按折叠目标计算。');
        }
      }else if(active?.vertex&&backend&&!failed){
        // A click without a drag must not change the pose or pause playback.
        running=active.wasRunning??false;
      }else if(announce&&active&&!active.vertex&&backend&&!failed){
        report(running?'running':'paused','已旋转视角。');
      }
    }catch(error){fail(error);}
    finally{
      if(active&&canvas.hasPointerCapture(active.id))canvas.releasePointerCapture(active.id);
      updateGrabMarker();
    }
  };
  releaseActiveGrab=()=>endDrag(false);
  const pointerPosition=(event:PointerEvent)=>{
    const rect=canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0||drag) return;
    const point=pointerPosition(event);
    pointer={...point,shift:event.shiftKey};
    if(event.shiftKey||grabEnabled||pinEnabled){
      if(!canGrab())return;
      try{
        backend!.readPositions(positions);
        const camera=cameraUniforms(view,center,cameraRadius,canvas.width,canvas.height);
        const pick=pickAt(point.x,point.y,camera);
        if(pick){
          if(pinEnabled){
            const before=capturePoseEdit(),existing=pinnedVertices.has(pick.index);
            const target:[number,number,number]=[positions[pick.index*3],positions[pick.index*3+1],positions[pick.index*3+2]];
            backend!.setVertexConstraint(pick.index,existing?null:target);
            if(existing)pinnedVertices.delete(pick.index);else pinnedVertices.set(pick.index,target);
            backend!.arrestDynamics();clock.invalidate();dirty=true;rememberPose(before);
            report(running?'running':'paused',existing?'已解除该固定点。':`已固定顶点，共 ${pinnedVertices.size} 个固定点。`);updateGrabMarker();return;
          }
          if(pinnedVertices.has(pick.index)){report(running?'running':'paused','该顶点已固定；请在“固定点”中点击解除后再塑形。');return;}
          // Preserve the pointer's initial offset within the hit radius. A
          // click near a vertex must not make it jump on the first movement.
          drag={...point,id:event.pointerId,vertex:{...pick,screen:[point.x,point.y]},camera,wasRunning:running};
          running=false;
          canvas.dataset.grabbed=String(pick.index);
        }
      }catch(error){fail(error);return;}
      updateGrabMarker();
      // In Grab mode a miss is a miss, never an unexpected camera orbit.
      if(!drag)return;
    }
    // Orbit uses viewport CSS pixels; picking alone uses drawing-buffer pixels.
    drag??={x:event.clientX,y:event.clientY,id:event.pointerId};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    const point=pointerPosition(event);pointer={...point,shift:event.shiftKey};
    if (!drag){updateGrabMarker();return;}
    if(event.pointerId!==drag.id)return;
    if(drag.vertex&&drag.camera){
      try{
        if(!drag.constrained&&Math.hypot(point.x-drag.x,point.y-drag.y)<2*canvas.width/canvas.clientWidth)return;
        if(!drag.constrained){
          const before=capturePoseEdit();
          const supports=simulationSculptSupports(prepared!,before.solver.positions,drag.vertex.index,before.solver.pins);
          if(supports===null){
            endDrag(false);report(running?'running':'paused','此处没有可用的支撑面，请先设置固定点，再拖动塑形。');return;
          }
          drag.before=before;drag.supports=supports??[];drag.constrained=true;
          // Remove the old target's restoring force only during this gesture.
          // Keep sheet lengths and panel stiffness, and anchor a remote face
          // at its CURRENT pose to remove whole-sheet translation/rotation.
          backend!.restorePose({...before.solver,pins:[...before.solver.pins,...drag.supports]});
          backend!.setMaterial({creaseStiffness:0});
          grabbedVertex=true;layerEndpoint.reset();surfaceBlend=-1;
          running=true;
          report('running',`正在局部塑形第 ${drag.vertex.index+1} 个顶点，松手保留当前形状。`);
        }
        backend!.setVertexConstraint(drag.vertex.index,simulationDragTarget(drag.vertex,drag.camera,point.x,point.y));
        running=true;dirty=true;clock.invalidate();
      }catch(error){fail(error);}
      return;
    }
    orbitCamera(event.clientX-drag.x,event.clientY-drag.y);
    drag.x = event.clientX; drag.y = event.clientY;
    dirty = true;
  });
  canvas.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)endDrag();});
  canvas.addEventListener('pointercancel',event=>{if(drag?.id===event.pointerId)endDrag();});
  canvas.addEventListener('lostpointercapture',event=>{if(drag?.id===event.pointerId)endDrag();});
  canvas.addEventListener('pointerleave',()=>{pointer=null;if(!drag)updateGrabMarker();});
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    releaseActiveGrab();
    view.zoom = Math.max(0.15, Math.min(5, view.zoom * Math.exp(-event.deltaY * 0.001)));
    dirty = true;
  }, { passive: false });
  resize();
}

function load(fold: unknown, nextRevision: string | number,animation?:SimulationStepAnimation,pose?:SimulationPose,mesh:SimulationMeshQuality='original',preparedResult?:ReturnType<typeof prepareSimulationDocument>,angleLimit=false) {
  // Reject malformed saved geometry before touching a currently usable model.
  if(pose){try{pose=validateSimulationPose(pose);fold=pose.source;}catch(error){reportExportError(error);return;}}
  meshQuality=animation?'original':pose?.mesh??mesh;
  collisionEnabled=animation?false:pose?pose.collision===true:collisionEnabled;
  contactGuard=null;collisionMessage='';
  limitFoldAngles=angleLimit;foldLimitGuard=null;
  releaseActiveGrab();
  poseUndo.length=0;poseRedo.length=0;poseEditRevision=0;pinnedVertices.clear();pinEnabled=false;poseRestored=!!pose;sourceFold=structuredClone(fold);
  if(pose){solverSettings={...pose.settings};targetProgress=pose.progress;}
  running = false;
  lowVelocityStable=false;angleAnalyzer=null;
  revision = nextRevision;
  failed = false;
  warnings = [];
  stepAnimation=null;
  seekStepDynamic=undefined;
  frameSteps=undefined;maxVelocity=undefined;
  surfaceGap=-1;layerGapError=undefined;sourceSignature=simulationSourceSignature(fold);
  sourceFaceCount=(fold as {faces_vertices?:unknown[]})?.faces_vertices?.length??0;
  layerOrderState='pending';layerOrderMessage='正在确认平折层序…';layerDisplayState='inactive';layerOrderKey='';grabbedVertex=false;layerEndpoint.reset();surfaceBlend=-1;surfaceTargetMesh=null;surfaceGapLayout=null;
  backend?.dispose();
  backend = null;
  prepared = null;
  backendName = undefined;
  report('running', '正在构建模拟网格…');
  try {
    const result = preparedResult??prepareSimulationDocument(fold,{mesh:meshQuality});
    prepared = result.prepared;
    angleAnalyzer=new SimulationAngleAnalyzer(prepared);anglePositions=new Float32Array(prepared.vertexCount*3);angleHistory=new Float32Array(prepared.creaseParams.length);
    angleSampleTime=-Infinity;angleSampleStep=-1;angleSamplePoseRevision=-1;
    sourceFaceCount=prepared.sourceFaceCount??sourceFaceCount;
    warnings = result.warnings;
    // Profiles are not implemented by the GPU backend. Validate atomically,
    // then use the CPU solver instead of silently playing the wrong targets.
    stepAnimation=animation===undefined?null:validateSimulationStepAnimation(animation,prepared,sourceSignature);
    if(stepAnimation){
      targetProgress=0;grabEnabled=false;layerOrderState='unavailable';layerOrderMessage='步骤动画显示实际求解姿态，尚未确认终态层序。';
      solverSettings={...solverSettings,integrationType:'euler'};
    }
    updateGrabControls();
    const model = new OrigamiModel(prepared);
    positions = model.originalPositions.slice();
    center = centroid(positions);
    radius = boundingRadius(positions, center);
    cameraRadius=radius;
    if(stepAnimation){const frame=simulationStepCameraBounds(prepared,stepAnimation);center=frame.center;cameraRadius=frame.radius;}
    surfaceLayers=!stepAnimation?new SimulationSurfaceLayers(prepared,radius):null;surfaceMesh=null;surfaceStep=-1;surfaceTopology=null;surfaceSourceIndices=null;surfacePaperFrame=undefined;surfaceStrainFrame=undefined;
    mountCanvas();
    const options = { ...solverSettings, foldPercent: targetProgress * 100 };
    // ?backend=cpu is a local deterministic fallback test, not a remote service.
    const forceCpu = !!stepAnimation||new URLSearchParams(location.search).get('backend') === 'cpu';
    if (!forceCpu) {
      try {
        backend = new WebglSolver(canvas, model, options);
        backendName = 'webgl2';
        (backend as WebglSolver).onContextLost(() => fail(new Error('显卡上下文已丢失，模拟已停止。请重新载入模型，或启用兼容模式。')));
      } catch (error) {
        console.warn('[折纸工坊：WebGL2 回退]', error);
        backend = null;
      }
    }
    if (!backend) {
      if (prepared.vertexCount > 1200 || prepared.faceCount > 2400) throw new Error('当前设备不支持所需 WebGL2 浮点运算；CPU 兼容模式最多支持 1,200 个顶点和 2,400 个三角面，请缩小模型。');
      // A canvas that already requested WebGL cannot acquire a 2D context.
      mountCanvas();
      if (!canvas.getContext('2d')) throw new Error('浏览器无法创建绘图画布，请换用支持 Canvas 的浏览器。');
      const referenceSolver = new ReferenceSolver(model, options);
      backend = referenceSolver;
      backendName = 'cpu';
      if(stepAnimation){seekStepDynamic=seedSimulationStepAnimation(referenceSolver,stepAnimation);backend.readPositions(positions);warnings.push(stepAnimation.dynamic?'正在按三维数值求解结果演示，纸面可能存在小幅形变。':stepAnimation.flex?'正在演示局部柔性压痕，临时曲面网格不会写入 CP。':'正在按步骤原始折角演示本步折叠。');}
      else warnings.push('使用 CPU 兼容模式；大型模型较慢。');
    }
    foldLimitGuard=limitFoldAngles&&!stepAnimation?new SimulationFoldLimitGuard(prepared,backend):null;
    rebuildClock();
    canvas.dataset.stepMethod=stepAnimation?.dynamic?'dynamic':stepAnimation?.flex?'local-flex':stepAnimation?.motion?.method??'';
    canvas.dataset.stepSettleStart=stepAnimation?.dynamic?.settleStart===undefined?'':String(stepAnimation.dynamic.settleStart);
    canvas.dataset.stepEndAngleError=stepAnimation?.dynamic?String(stepAnimation.dynamic.endAngleError):'';
    if(pose){restorePoseEdit(pose);Object.assign(view,pose.view);cameraPreset='free';updateViewCube(view);}
    running = !stepAnimation&&!pose;
    rebuildContactGuard();
    dirty = true;
    updateGrabControls();
    report('loaded', stepAnimation?`已载入操作前纸面 · ${prepared.faceCount} 个三角面 · 等待播放步骤动画。`:`${backendName === 'webgl2' ? 'GPU' : 'CPU 兼容'} · ${prepared.faceCount} 个三角面 · 目标折叠 ${Math.round(targetProgress * 100)}%`);
    if(pose)report('paused','已恢复保存的三维姿态和固定点，保持暂停。');
    if(collisionEnabled&&!running)report('paused',collisionMessage);
  } catch (error) { clearModel(nextRevision);fail(error); }
}

function drawCpu(output:HTMLCanvasElement=canvas,exportScale=1,background?:[number,number,number]) {
  if (!backend || !prepared) return;
  const context = output.getContext('2d');
  if(!context)throw new Error('浏览器无法创建模拟图像画布。');
  backend.readPositions(positions);
  const strain=displayMode==='strain'?new Float32Array(prepared.vertexCount):null;
  if(strain)backend.readStrain(strain);
  const camera=cameraUniforms(view,center,cameraRadius,output.width,output.height);
  const display=renderState(camera);
  const renderSettings=scaleSimulationImageSettings(display.settings,exportScale);
  if(background)renderSettings.background=background;
  const faceOrders=stepAnimation?.layerTimeline?simulationStepLayerOrderAt(prepared,stepAnimation,stepAnimation.layerTimeline,targetProgress,positions):[];
  const triangleSourceFaces=surfaceMesh&&display.surface&&surfaceMesh.sourceTriangles
    ?Array.from(surfaceMesh.sourceTriangles,t=>prepared!.triangleSourceFaces?.[t]??t)
    :prepared.triangleSourceFaces??prepared.facesVertices.map((_,f)=>f);
  canvas.dataset.colorLayerRelations=String(faceOrders.length);
  const shownPositions=display.surface?.positions??positions;
  const assignments=stepAnimation?simulationStepDisplayAssignments(prepared,stepAnimation,shownPositions,camera,targetProgress):null;
  const displayModel=surfaceMesh&&display.surface?surfaceMesh:prepared;
  const pixels=cpuRaster.render(shownPositions,assignments?{...displayModel,edgesAssignment:assignments}:displayModel,camera,renderSettings,display.surface?.strain??strain??undefined,
    faceOrders.length?{triangleSourceFaces,faceOrders}:undefined,stepAnimation?settings.creaseWidthPx*Math.min(2,devicePixelRatio||1)*exportScale:undefined);
  if(assignments){
    canvas.dataset.visibleStepCreases=String(assignments.filter(a=>a==='M'||a==='V').length);
    canvas.dataset.boundaryStepCreases=String(assignments.filter((a,e)=>a==='B'&&prepared!.edgesAssignment[e]!=='B').length);
  }
  if(!cpuImage||cpuImage.width!==output.width||cpuImage.height!==output.height)cpuImage=context.createImageData(output.width,output.height);
  cpuImage.data.set(pixels);context.putImageData(cpuImage,0,0);
  return pixels;
}

/** Apply certified local layer relations only to a stable, near-flat endpoint.
 * The solver positions and mesh exports always remain unchanged. */
function renderState(camera:ReturnType<typeof cameraUniforms>):{settings:RenderSettings;surface?:MeshPositionFrame}{
  const output=scaleSimulationImageSettings(displaySettings(settings,displayMode,stepAnimation?'crease':creaseStyle,displayOptions),Math.min(2,devicePixelRatio||1));
  if(stepAnimation){output.mountainColor=[...settings.borderColor];output.valleyColor=[...settings.borderColor];}
  // A microscopic display offset resolves GPU depth ties only after a stable
  // flat contact and a complete layer certificate. It never enters the solver,
  // captures of the physical pose, or the original material triangulation.
  const displayGapMultiplier=surfaceGapEnabled?layerGapMultiplier:1;
  const blend=layerEndpoint.update(performance.now(),!stepAnimation&&!!backend&&!!prepared&&targetProgress===1&&clock.converged&&!grabbedVertex&&displayGapMultiplier>0&&layerOrderState==='ready'&&displayMode!=='wireframe'&&displayMode!=='xray');
  if(!backend||!prepared||blend===0){
    layerDisplayState='inactive';canvas.dataset.layerDisplay=layerDisplayState;
    canvas.dataset.surfaceLayers='1';canvas.dataset.layerGap='0';canvas.dataset.sourceTriangles=String(prepared?.faceCount??0);canvas.dataset.surfaceTriangles=String(prepared?.faceCount??0);canvas.dataset.surfaceVertices=String(prepared?.vertexCount??0);canvas.dataset.surfaceTopology='original';layerGapError=undefined;canvas.dataset.layerGapError='';return {settings:output};
  }
  const moved=surfaceStep!==backend.stepCount;
  if(moved)backend.readPositions(positions);
  if(moved){
    // Solve the overlap arrangement once per material pose. Camera-dependent
    // spacing only resizes this layout; it never repeats planar subdivision.
    surfaceGapLayout=surfaceLayers?.build(positions,radius*SIMULATION_SURFACE_GAP_CAP,{maxGap:radius*SIMULATION_SURFACE_GAP_CAP*1000})??null;
    surfaceStep=backend.stepCount;
  }
  const [ia,ib,ic]=prepared.indices,ab=[0,1,2].map(k=>positions[ib*3+k]-positions[ia*3+k]),ac=[0,1,2].map(k=>positions[ic*3+k]-positions[ia*3+k]);
  const normal:[number,number,number]=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  const layerNormals=surfaceGapLayout?.layerNormals.length?surfaceGapLayout.layerNormals:[normal];
  const surfaceNormalDepth=Math.min(...layerNormals.map(n=>Math.abs(camera.rotation[6]*n[0]+camera.rotation[7]*n[1]+camera.rotation[8]*n[2])/Math.max(1e-15,Math.hypot(...n))));
  const gl=backendName==='webgl2'?canvas.getContext('webgl2'):null,depthBits=gl?Number(gl.getParameter(gl.DEPTH_BITS))||24:53;
  const selectedGap=selectSimulationSurfaceBaseGap(camera,radius,depthBits,surfaceNormalDepth),gapQuantum=radius*1e-7;
  const selectedRoundedGap=displayGapMultiplier*Math.min(radius*SIMULATION_SURFACE_GAP_CAP,SIMULATION_SURFACE_GAP_SCALE*Math.ceil(selectedGap/SIMULATION_SURFACE_GAP_SCALE/gapQuantum)*gapQuantum);
  if(moved||surfaceGap!==selectedRoundedGap){
    surfaceGap=selectedRoundedGap;
    const resized=surfaceGapLayout?resizeSimulationSurfaceGap(surfaceGapLayout,surfaceGap):null;
    // Keep a legal image on a rejected sub-resolution value, and report that
    // it was not applied instead of silently pretending the multiplier worked.
    if(surfaceGapLayout&&!resized){
      layerGapError='这个间距无法稳定显示局部纸面，请试一个相近的数值。';
      if(moved||!surfaceTargetMesh)surfaceTargetMesh=surfaceGapLayout;
    }else{surfaceTargetMesh=resized;layerGapError=surfaceLayers?.getIssue();}
    canvas.dataset.layerGapError=layerGapError??'';surfaceBlend=-1;
    surfaceCreaseNormal=surfaceTargetMesh?simulationCreasePlaneNormal(positions,prepared.indices,surfaceTargetMesh.layerNormals):undefined;
  }
  if(surfaceBlend!==blend){
    surfaceMesh=surfaceTargetMesh?blendSimulationSurface(surfaceTargetMesh,positions,blend):null;surfaceBlend=blend;
    if(surfaceMesh){
      if(surfaceSourceIndices!==surfaceMesh.indices){
        surfaceTopology=meshTopologyFor(surfaceMesh,Math.ceil(Math.sqrt(surfaceMesh.sourceVertices.length)));
        surfaceSourceIndices=surfaceMesh.indices;
      }
      surfacePaperFrame={positions:surfaceMesh.positions,topology:surfaceTopology!};
    }else surfacePaperFrame=undefined;
    surfaceStrainFrame=undefined;
  }
  canvas.dataset.surfaceLayers=String(surfaceMesh?.layerCount??1);
  canvas.dataset.layerGap=String(surfaceMesh?.layerGap??0);
  canvas.dataset.sourceTriangles=String(prepared.faceCount);
  canvas.dataset.surfaceTriangles=String(surfaceMesh?.indices.length?surfaceMesh.indices.length/3:prepared.faceCount);
  canvas.dataset.surfaceVertices=String(surfaceMesh?.sourceVertices.length??prepared.vertexCount);
  canvas.dataset.surfaceTopology=surfaceMesh?(surfaceMesh.indices.length===prepared.indices.length&&!surfaceMesh.sourceVertexWeights?'original-panels':'subdivided'):'original';
  canvas.dataset.hingeLayerSpans=String(surfaceMesh?.hingeLayerSpans?.length??0);
  layerDisplayState=surfaceMesh?(blend<1?'blending':'active'):'inactive';canvas.dataset.layerDisplay=layerDisplayState;
  if(!surfaceMesh||!surfacePaperFrame)return {settings:output};
  output.creasePlaneNormal=surfaceCreaseNormal;
  // At a grazing angle a fixed edge bias can jump the tiny normal layer gap.
  const normalDepth=Math.min(...surfaceMesh.layerNormals.map(n=>Math.abs(camera.rotation[6]*n[0]+camera.rotation[7]*n[1]+camera.rotation[8]*n[2])));
  const far=camera.camDist+camera.depthRange;
  const bias=surfaceMesh.layerGap*blend*normalDepth*(camera.camDist**2-camera.depthRange**2)/(camera.depthRange*far*far*4);
  output.creaseDepthBias=Math.min(output.creaseDepthBias??.000002,bias);
  if(displayMode==='strain'&&!surfaceStrainFrame){
    const originalStrain=new Float32Array(prepared.vertexCount);backend.readStrain(originalStrain);
    surfaceStrainFrame={...surfacePaperFrame,strain:simulationSurfaceStrain(surfaceMesh,originalStrain)};
  }
  return {settings:output,surface:displayMode==='strain'?surfaceStrainFrame:surfacePaperFrame};
}

function clearModel(nextRevision:string|number){
  foldLimitGuard=null;
  lowVelocityStable=false;angleAnalyzer=null;
  releaseActiveGrab();
  poseUndo.length=0;poseRedo.length=0;poseEditRevision=0;pinnedVertices.clear();sourceFold=null;poseRestored=false;contactGuard=null;contactSettledTicks=0;collisionMessage='';
  stepAnimation=null;
  seekStepDynamic=undefined;
  frameSteps=undefined;maxVelocity=undefined;
  running=false;failed=true;revision=nextRevision;backend?.dispose();backend=null;prepared=null;backendName=undefined;
  surfaceLayers=null;surfaceMesh=null;surfaceStep=-1;surfaceTopology=null;surfaceSourceIndices=null;surfacePaperFrame=undefined;surfaceStrainFrame=undefined;
  surfaceTargetMesh=null;surfaceGapLayout=null;sourceSignature='';sourceFaceCount=0;layerOrderState='unavailable';layerOrderMessage='尚未确认平折层序。';layerOrderKey='';layerDisplayState='inactive';layerEndpoint.reset();surfaceBlend=-1;grabbedVertex=false;
  mountCanvas();canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
  report('error','当前折痕无法载入，旧模拟已清空。');
}

function download(name:string,type:string,content:string){
  return downloadBlob(name,new Blob([content],{type}));
}

async function downloadBlob(name:string,blob:Blob){
  const result=await saveDownload(blob,name);
  report(running?'running':'paused',result.status==='saved'?`文件已保存：${name}`:result.status==='cancelled'?'已取消导出。':'已发起文件下载，请确认下载结果。');
}

async function exportCurrent(kind:'fold'|'svg'|'obj'|'stl'){
  if(!backend||!prepared||failed)throw new Error('请先载入有效折痕图，再导出三维结果。');
  if(kind==='svg'&&prepared.faceCount>2000)throw new Error('矢量视图导出最多支持 2,000 个三角面，请缩小模型。');
  backend.readPositions(positions);
  if(kind==='fold'){
    return download('折纸三维模拟-当前状态.fold','application/json',JSON.stringify(simulationFoldSnapshot(prepared,positions,targetProgress,backend.stepCount),null,2));
  }
  if(kind==='obj'){
    return download('折纸三维模拟-当前状态.obj','text/plain',simulationObjText(prepared,positions));
  }
  if(kind==='stl'){
    return download('折纸三维模拟-当前状态.stl','model/stl',simulationStlText(prepared,positions));
  }
  const camera=cameraUniforms(view,center,cameraRadius,canvas.width,canvas.height),display=renderState(camera);
  const topology=display.surface?.topology??meshTopologyFor(prepared);
  const strain=displayMode==='strain'?new Float32Array(prepared.vertexCount):null;
  if(strain)backend.readStrain(strain);
  const result=renderMeshToSvg(display.surface?.positions??positions,topology,camera,display.settings,{perspective:true,strain:display.surface?.strain??strain});
  if(!result)throw new Error('当前视图没有可导出的模型。');
  return download('折纸三维模拟-当前视图.svg','image/svg+xml',result.svg);
}

async function exportPng(scale=1){
  if(!backend||!prepared||failed)throw new Error('请先载入有效折痕图，再导出当前视图。');
  const {width,height}=simulationImageDimensions(canvas.width,canvas.height,scale);
  const output=document.createElement('canvas');output.width=width;output.height=height;
  if(backend instanceof WebglSolver){
    // WebGL readPixels starts at the bottom row, while ImageData starts at the top.
    const camera=cameraUniforms(view,center,cameraRadius,width,height),display=renderState(camera);
    display.settings=scaleSimulationImageSettings(display.settings,scale);
    const pixels=backend.renderToImage(camera,display.settings,width,height,display.surface);
    const context=output.getContext('2d');
    if(!context)throw new Error('浏览器无法创建 PNG 图像画布。');
    const image=context.createImageData(width,height);
    image.data.set(flipSimulationImageRows(pixels,width,height));
    context.putImageData(image,0,0);
  }else{
    drawCpu(output,scale);
  }
  const blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(result=>result?resolve(result):reject(new Error('浏览器无法编码 PNG 图像。')),'image/png'));
  return downloadBlob('折纸三维模拟-当前视图.png',blob);
}

function captureCurrentImage(scale:1|2|4,transparent:boolean):SimulationImageCapture{
  if(!backend||!prepared||failed)throw new Error('请先载入有效折痕图，再截取当前视图。');
  const {width,height}=simulationImageDimensions(canvas.width,canvas.height,scale);
  const output=document.createElement('canvas');output.width=width;output.height=height;
  const context=output.getContext('2d');
  if(!context)throw new Error('浏览器无法创建 PNG 图像画布。');
  let black:Uint8ClampedArray,white:Uint8ClampedArray;
  const camera=cameraUniforms(view,center,cameraRadius,width,height),display=renderState(camera);
  const imageSettings=scaleSimulationImageSettings(display.settings,scale);
  // Two renders preserve white paper and translucent faces, unlike deleting pixels
  // that happen to share the viewport background colour. Neither render steps the solver.
  if(backend instanceof WebglSolver){
    black=flipSimulationImageRows(backend.renderToImage(camera,{...imageSettings,background:[0,0,0],backgroundAlpha:1},width,height,display.surface),width,height);
    white=flipSimulationImageRows(backend.renderToImage(camera,{...imageSettings,background:[1,1,1],backgroundAlpha:1},width,height,display.surface),width,height);
  }else{
    black=drawCpu(output,scale,[0,0,0])!.slice();
    white=drawCpu(output,scale,[1,1,1])!.slice();
  }
  const image=context.createImageData(width,height);
  image.data.set(simulationImageFromBackgrounds(black,white,transparent?undefined:imageSettings.background));
  context.putImageData(image,0,0);
  const dataUrl=output.toDataURL('image/png');
  if(!dataUrl.startsWith('data:image/png;base64,'))throw new Error('浏览器无法编码 PNG 图像，请重新截取。');
  return {dataUrl,width,height};
}

function reportExportError(error:unknown){
  const message=error instanceof Error?error.message:'无法导出当前模拟结果。';
  report(running?'running':'paused',message);
  console.error('[折纸工坊：模拟导出]',error);
}

function tick(now: number) {
  if (backend && !failed) {
    try {
      if (running && !document.hidden) {
        const contact=(collisionEnabled||foldLimitGuard)&&!stepAnimation?advanceGuardedFrame():null;
        const contactVelocity=contact?backend.maxVelocity():0;
        if(contact)contactSettledTicks=contact.status==='clear'&&!contact.constrainedSteps&&contactVelocity<1e-5?contactSettledTicks+1:0;
        const step = contact?{steps:contact.advancedSteps,maxVelocity:contactVelocity,converged:contact.status==='clear'&&contactSettledTicks>=3}:clock.runFrame(backend);
        frameSteps=step.steps;maxVelocity=step.maxVelocity;
        if(contact&&contact.status!=='clear')report('paused',contact.reason??collisionMessage);
        const diagnostics = backend.readDiagnostics();
        const strain = diagnostics.maxNodalStrain ?? diagnostics.maxEdgeStrain ?? 0;
        if (!Number.isFinite(strain) || !Number.isFinite(step.maxVelocity) || strain > 0.3) {
          throw new Error('模型应变过大或数值不稳定，已停止模拟。请降低折叠比例并检查折痕图，再重新载入。');
        }
        dirty ||= step.steps > 0||!!contact&&contact.status!=='clear';
        if (step.converged) {
          lowVelocityStable=!stepAnimation&&!grabbedVertex;
          running = false;
          report('paused', stepAnimation?`本步姿态已更新 · 进度 ${Math.round(targetProgress*100)}%`:`${backendName === 'webgl2' ? 'GPU' : 'CPU 兼容'} 数值暂稳 · 应变 ${(strain * 100).toFixed(2)}% · 不代表已验证可折`);
        } else if (running&&now - lastStatusTime > 900) {
          lastStatusTime = now;
          report('running', stepAnimation?`正在折叠 · 进度 ${Math.round(targetProgress*100)}%`:`${backendName === 'webgl2' ? 'GPU' : 'CPU 兼容'} 求解中 · 目标 ${Math.round(targetProgress * 100)}% · 应变 ${(strain * 100).toFixed(2)}%`);
        }
      }
      if (dirty||layerEndpoint.needsFrame) {
        const previousLayerDisplay=layerDisplayState,previousGapError=layerGapError;
        if (backend instanceof WebglSolver){
          const camera=cameraUniforms(view,center,cameraRadius,canvas.width,canvas.height),display=renderState(camera);
          backend.render(camera,display.settings,null,display.surface);
        }
        else drawCpu();
        updateGrabMarker();updatePinMarkers();
        dirty = false;
        if(previousLayerDisplay!==layerDisplayState||previousGapError!==layerGapError)report(running?'running':'paused',lastMessage);
      }
    } catch (error) { fail(error); }
  }
  frameRequest = requestAnimationFrame(tick);
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const message = event.data as SimulatorCommand | undefined;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'zhezhi-sim-ping') {
    report('ready', prepared ? '本地模拟引擎已连接。' : '本地模拟引擎就绪，等待折痕图。');
    return;
  }
  if (message.type === 'zhezhi-sim-load') {
    if (typeof message.revision !== 'string' && typeof message.revision !== 'number') return;
    if(message.mesh!==undefined&&!['original','standard','fine'].includes(message.mesh))return;
    load(message.fold, message.revision,message.animation,message.pose,message.mesh,undefined,message.limitFoldAngles===true);
    return;
  }
  if(message.type==='zhezhi-sim-mesh'){
    if(!backend||!sourceFold||failed||stepAnimation||revision===undefined||!['original','standard','fine'].includes(message.quality)||message.quality===meshQuality)return;
    try{
      // Rebuilding is an explicit reset action. Validate before disposing the
      // old mesh, so an unsupported refinement leaves the usable pose intact.
      const result=prepareSimulationDocument(sourceFold,{mesh:message.quality});
      if(backendName==='cpu'&&(result.prepared.vertexCount>1200||result.prepared.faceCount>2400))throw Error('此精细度超出当前 CPU 兼容模式容量，请选择较低精细度；当前姿态已保留。');
      targetProgress=0;load(sourceFold,revision,undefined,undefined,message.quality,result,limitFoldAngles);
    }catch(error){reportExportError(error);}
    return;
  }
  if(message.type==='zhezhi-sim-fold-limit'){
    if(typeof message.enabled!=='boolean'||stepAnimation)return;
    releaseActiveGrab();limitFoldAngles=message.enabled;
    foldLimitGuard=limitFoldAngles&&prepared&&backend?new SimulationFoldLimitGuard(prepared,backend):null;
    rebuildClock();updateGrabControls();dirty=true;
    if(backend&&!failed)report(running?'running':'paused',limitFoldAngles?'已开启折角上限：实际折角达到 180° 后停止继续加大。':'已关闭 180° 折角限制。');
    return;
  }
  if(message.type==='zhezhi-sim-collision'){
    if(typeof message.enabled!=='boolean'||stepAnimation||collisionEnabled===message.enabled)return;
    releaseActiveGrab();collisionEnabled=message.enabled;collisionMessage='';contactGuard=null;
    rebuildContactGuard();rebuildClock();updateGrabControls();dirty=true;
    if(backend&&!failed)report(running?'running':'paused',collisionEnabled?collisionMessage:'已关闭纸面碰撞保护，恢复普通模拟。');
    return;
  }
  if(message.type==='zhezhi-sim-capture-pose'){
    if(typeof message.requestId!=='string'||!message.requestId||message.requestId.length>120||message.revision!==revision)return;
    const response={type:'zhezhi-sim-pose',requestId:message.requestId,revision};
    try{window.parent.postMessage({...response,pose:capturePose(message.finishGesture!==false)},location.origin);}catch(error){window.parent.postMessage({...response,error:error instanceof Error?error.message:'三维姿态保存失败。'},location.origin);}return;
  }
  if(message.type==='zhezhi-sim-undo-pose'||message.type==='zhezhi-sim-redo-pose'){historyPose(message.type==='zhezhi-sim-undo-pose'?'undo':'redo');return;}
  if (message.type === 'zhezhi-sim-clear') {
    if(typeof message.revision==='string'||typeof message.revision==='number')clearModel(message.revision);
    return;
  }
  if(message.type==='zhezhi-sim-capture-image'){
    if(typeof message.requestId!=='string'||!message.requestId||message.requestId.length>120||(typeof message.revision!=='string'&&typeof message.revision!=='number'))return;
    const response={type:'zhezhi-sim-image' as const,requestId:message.requestId,revision:message.revision};
    let reply:SimulationImageCaptureReply;
    try{
      if(message.revision!==revision)throw new Error('模拟模型或步骤已切换，请重新截取当前画面。');
      if(![1,2,4].includes(message.scale)||typeof message.transparent!=='boolean')throw new Error('截图参数无效，请重新截取。');
      reply={...response,image:captureCurrentImage(message.scale,message.transparent)};
    }catch(error){reply={...response,error:error instanceof Error?error.message:'无法截取当前模拟图片，请重试。'};}
    window.parent.postMessage(reply,location.origin);
    return;
  }
  if(message.type==='zhezhi-sim-layer-order'){
    if(message.revision!==revision||!prepared||failed||!['pending','ready','unavailable'].includes(message.state))return;
    const order=message.state==='ready'?validateSimulationLayerOrder(message.order,sourceSignature,sourceFaceCount):null;
    if(message.state==='ready'&&!order)return;
    const key=order?JSON.stringify(order.faceOrders):'';
    if(key!==layerOrderKey){
      layerOrderKey=key;surfaceLayers?.setLayerOrder(order);surfaceStep=-1;surfaceBlend=-1;surfaceTargetMesh=null;surfaceGapLayout=null;layerEndpoint.reset();layerDisplayState='inactive';
    }
    layerOrderState=order?'ready':message.state==='pending'?'pending':'unavailable';
    layerOrderMessage=typeof message.message==='string'?message.message.slice(0,300):order?'平折层序已确认。':'当前无可用平折层序。';
    dirty=true;report(running?'running':'paused',lastMessage);return;
  }
  if(message.type==='zhezhi-sim-view'){
    if(!['paper','wireframe','xray','strain','normals'].includes(message.mode))return;
    displayMode=message.mode;canvas.dataset.displayMode=displayMode;dirty=true;return;
  }
  if(message.type==='zhezhi-sim-display-settings'){
    const next=mergeSimulationDisplayOptions(displayOptions,message.settings);
    if(!next)return;
    displayOptions=next;dirty=true;
    if(backend&&!failed)report(running?'running':'paused',lastMessage);
    return;
  }
  if(message.type==='zhezhi-sim-crease-style'){
    if(!['assignment','crease','diagram'].includes(message.style))return;
    creaseStyle=message.style;canvas.dataset.creaseStyle=creaseStyle;dirty=true;return;
  }
  if(message.type==='zhezhi-sim-camera'){
    if(!Object.hasOwn(simulationCameraAngles,message.preset))return;
    chooseCameraPreset(message.preset);return;
  }
  if(message.type==='zhezhi-sim-camera-frame'){
    if(!stepAnimation||message.revision!==revision||!Array.isArray(message.center)||message.center.length!==3||!message.center.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))||!Number.isFinite(message.radius)||message.radius<=0)return;
    center=[...message.center] as [number,number,number];cameraRadius=message.radius;dirty=true;return;
  }
  if(message.type==='zhezhi-sim-layer-gap'){
    if(!surfaceGapEnabled)return;
    if(typeof message.multiplier!=='number'||!Number.isFinite(message.multiplier)||message.multiplier<0||message.multiplier>1000)return;
    if(layerGapMultiplier===message.multiplier)return;
    layerGapMultiplier=message.multiplier;layerGapError=undefined;surfaceGap=-1;surfaceBlend=-1;
    canvas.dataset.layerGapMultiplier=String(layerGapMultiplier);canvas.dataset.layerGapError='';dirty=true;
    if(backend&&!failed)report(running?'running':'paused',layerGapMultiplier===0?'已关闭纸层间距显示。':`纸层间距已调整为 ${layerGapMultiplier} 倍。`);
    return;
  }
  if(message.type==='zhezhi-sim-material'){
    const {creaseStiffness:stiffness,damping:drag}=message;
    applySolverSettings({creaseStiffness:stiffness,damping:drag});return;
  }
  if(message.type==='zhezhi-sim-solver-settings'){
    applySolverSettings(message.settings);return;
  }
  if(message.type==='zhezhi-sim-colors'){
    const colors=simulationPaperColorSettings(message.front,message.back,message.line);
    if(!colors)return;
    const diagramInk=message.diagramLine===undefined?undefined:simulationPaperColorSettings(message.front,message.back,message.diagramLine)?.borderColor;
    if(message.diagramLine!==undefined&&!diagramInk)return;
    Object.assign(settings,colors);if(diagramInk)settings.diagramInkColor=diagramInk;dirty=true;return;
  }
  if(message.type==='zhezhi-sim-export-png'){
    void exportPng(message.scale??1).catch(reportExportError);
    return;
  }
  if(message.type==='zhezhi-sim-export-fold'||message.type==='zhezhi-sim-export-svg'||message.type==='zhezhi-sim-export-obj'||message.type==='zhezhi-sim-export-stl'){
    void exportCurrent(message.type==='zhezhi-sim-export-fold'?'fold':message.type==='zhezhi-sim-export-svg'?'svg':message.type==='zhezhi-sim-export-obj'?'obj':'stl').catch(reportExportError);
    return;
  }
  if(message.type==='zhezhi-sim-step'){
    if(!backend||!prepared||failed||running)return;
    try{poseRedo.length=0;updateGrabControls();const before=backend.stepCount;const contact=(collisionEnabled||foldLimitGuard)&&!stepAnimation?advanceWithGuards(20):null;if(!contact)backend.step(20);maxVelocity=backend.maxVelocity();frameSteps=contact?.advancedSteps??backend.stepCount-before;const strain=backend.readDiagnostics().maxNodalStrain??0;
      if(!Number.isFinite(strain)||!Number.isFinite(maxVelocity)||strain>.3)throw new Error('模型应变过大或数值不稳定，已停止单步求解。请复位或重新载入。');
      dirty=true;lowVelocityStable=false;clock.invalidate();report('paused',contact&&contact.status!=='clear'?(contact.reason??collisionMessage):stepAnimation?`本步姿态已更新 · 进度 ${Math.round(targetProgress*100)}%`:`已推进 ${frameSteps} 个数值步 · 目标 ${Math.round(targetProgress*100)}% · 应变 ${(strain*100).toFixed(2)}%`);
    }catch(error){fail(error);}return;
  }
  if (message.type === 'zhezhi-sim-progress' && typeof message.value === 'number' && Number.isFinite(message.value)) {
    try{
      releaseActiveGrab();
      targetProgress = simulationFoldProgress(message.value,!!stepAnimation);
      canvas.dataset.targetProgress=String(targetProgress);
      if (!backend || failed) return;
      poseRedo.length=0;updateGrabControls();
      if(seekStepDynamic)seekStepDynamic(targetProgress);
      else{
        if(stepAnimation)backend.setFoldProfile(simulationStepFoldProfile(stepAnimation,targetProgress));
        backend.setFoldPercent(targetProgress * 100);
      }
      clock.invalidate(); running = true;
      contactSettledTicks=0;
      dirty=true;
      report('running', stepAnimation?`正在折叠 · 进度 ${Math.round(targetProgress*100)}%`:`正在求解目标折叠 ${Math.round(targetProgress * 100)}%…`);
    }catch(error){fail(error);}
    return;
  }
  if (message.type === 'zhezhi-sim-reset' && backend) {
    try {
      releaseActiveGrab();
      const before=!stepAnimation&&!failed?capturePoseEdit():null;
      for(const index of pinnedVertices.keys())backend.setVertexConstraint(index,null);pinnedVertices.clear();
      if(stepAnimation&&backend instanceof ReferenceSolver)seekStepDynamic=seedSimulationStepAnimation(backend,stepAnimation);
      else{backend.reset(); backend.setFoldPercent(0);}
      clock.reset();
      maxVelocity=backend.maxVelocity();frameSteps=0; // Refresh the GPU's cached strain after clearing its textures.
      targetProgress = 0; running = false; lowVelocityStable=false;dirty = true; failed = false;
      rebuildContactGuard();
      layerEndpoint.reset();surfaceBlend=-1;surfaceStep=-1;
      if(before)rememberPose(before);updateGrabControls();
      report('paused', stepAnimation?'已恢复操作前的纸面姿态，步骤动画进度 0%。':'已恢复输入模型的初始状态，目标折叠 0%。');
    } catch { fail(new Error('当前模拟上下文不可恢复，请重新载入模型。')); }
    return;
  }
  if (!backend || failed) return;
  if (message.type === 'zhezhi-sim-pause') {
    releaseActiveGrab();
    running = false; lowVelocityStable=false;report('paused', '模拟已暂停，仍可拖动查看。');
  } else if (message.type === 'zhezhi-sim-resume') {
    releaseActiveGrab();
    poseRedo.length=0;updateGrabControls();
    clock.invalidate(); running = true; report('running', stepAnimation?'继续步骤动画。':'继续本地数值求解…');
  }
});
window.addEventListener('resize', resize);
window.addEventListener('blur',()=>{releaseActiveGrab();clearGrabPointer();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseActiveGrab();clearGrabPointer();}});
window.addEventListener('keydown',event=>{if(event.key==='Shift')updateGrabShift(true);if(event.key==='Escape')releaseActiveGrab();
  if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())&&!(event.target instanceof HTMLInputElement)&&!(event.target instanceof HTMLTextAreaElement)){
    event.preventDefault();historyPose(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo');
  }
});
window.addEventListener('keyup',event=>{if(event.key==='Shift')updateGrabShift(false);});
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(frameRequest);releaseActiveGrab();
  // visibilitychange/blur may follow pagehide. Detach before disposal so
  // their marker cleanup cannot read textures from the destroyed backend.
  const disposed=backend;backend=null;prepared=null;running=false;
  clearGrabPointer();disposed?.dispose();
});
document.querySelector<HTMLButtonElement>('#vertex-grab')?.addEventListener('click',()=>{
  if(stepAnimation||solverSettings.integrationType==='verlet'){updateGrabControls();return;}
  releaseActiveGrab();
  pinEnabled=false;
  grabEnabled=!grabEnabled;
  updateGrabControls();
});
document.querySelector('#vertex-pin')?.addEventListener('click',()=>{releaseActiveGrab();pinEnabled=!pinEnabled;grabEnabled=false;updateGrabControls();});
document.querySelector('#pose-undo')?.addEventListener('click',()=>historyPose('undo'));
document.querySelector('#pose-redo')?.addEventListener('click',()=>historyPose('redo'));
document.querySelector('#pins-clear')?.addEventListener('click',()=>{
  if(!backend||!pinnedVertices.size||failed)return;
  try{releaseActiveGrab();const before=capturePoseEdit();for(const index of pinnedVertices.keys())backend.setVertexConstraint(index,null);
    pinnedVertices.clear();backend.arrestDynamics();clock.invalidate();dirty=true;rememberPose(before);report(running?'running':'paused','已解除全部固定点，可撤销恢复。');}catch(error){reportExportError(error);}
});
document.querySelector('#view-reset')?.addEventListener('click', () => {
  chooseCameraPreset('isometric');
});
mountCanvas();
updateViewCube(view);
report('ready', '本地模拟引擎就绪，等待折痕图。');
frameRequest = requestAnimationFrame(tick);
