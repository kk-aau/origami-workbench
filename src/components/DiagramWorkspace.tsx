import {prepareExistingCreases,refreshChangedViewDrawings} from '../app/diagramProjectPreparation';
import {startDiagramProjectImport} from '../app/diagramProjectImportTask';
import {updateDiagramSimulationSurfaceView} from '../app/diagramProject';
import {applyDiagramSimulationEditable} from '../app/diagramSimulationEditable';
import {startDiagramSimulationEditable} from '../app/diagramSimulationEditableTask';
import {startDiagramGeometry} from '../app/diagramGeometryTask';
import type {DiagramGeometryKind,DiagramGeometryArgs} from '../app/diagramGeometryOperations';
import {createDiagramLibrarySaveClient} from '../app/diagramLibrarySaveTask';
import {sameDiagramProjectContent,diagramProjectNeedsReplacementConfirmation} from '../app/diagramProjectContent';
import DiagramSimulationSurfaceOrbit from './DiagramSimulationSurfaceOrbit';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
import {readAdaptiveLineStyle} from '../app/adaptiveLineStyle';
import {forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {flushSync} from 'react-dom';
import type {Doc, FlatFoldResult, FlatLayerPreference, FoldGraph, Point} from '../core/types';
import {buildDiagramFold} from '../core/geometry';
import {materialFaceInside} from '../core/materialRings';
import {startFlatFold, startFlatLayerReanalysis, type FlatFoldTask} from '../core/workerClient';
import {diagramLayerAnalysisKey,applyDiagramLayerAnalysis,applyDiagramStepLayerAnalysis,requestedDiagramLayerSolutionIndex,applyDiagramLayerSolution,diagramPaperLayerAnalysisReason} from '../app/diagramLayerAnalysis';
import {diagramLayerDisplayState,diagramLayerDisplaySignature,startDiagramLayerDisplayPreparation} from '../app/diagramLayerDisplay';
import {diagramLocalSurface,diagramLocalSurfaceIssue} from '../app/diagramLocalSurface';
import {resolveStartingFace,clearStartingFace} from '../app/flatFoldSettings';
import {setDiagramStartingFace as setStartingFace} from '../app/diagramFoldSettings';
import {buildDiagramPoseFold} from '../app/diagramFoldGeometry';
import {download, safeName} from '../app/api';
import {recordActivity} from '../app/activityLog';
import {readProjectFile} from '../app/importFile';
import {selectProjectFile} from '../app/selectProjectFile';
import {preferenceStorage} from '../app/preferenceStorage';
import {blankDoc} from '../app/state';
import {diagramPDFStepLabel,defaultDiagramPDFOptions,type DiagramPDFOptions} from '../app/diagramPDFLayout';
import {diagramThumbnailSizes} from '../app/diagramThumbnailLayout';
import {DiagramThumbnailCache} from '../app/diagramThumbnailCache';
import {defaultModelColors,type ModelColors} from '../app/modelColors';
import {defaultModelView, type ModelViewState} from '../app/modelViewState';
import {adjustGridDivisions,GRID_MIN,GRID_MAX} from '../app/gridControls';
import {diagramPaperGrid} from '../app/diagramGrid';
import {editDiagramEqualDivisionRatio} from '../app/diagramEqualDivision';
import {selectFoldedVertex, type FoldedVertexSelection} from '../app/foldedVertexEdit';
import {diagramPaperVertices,moveDiagramPaperVertices} from '../app/diagramPaperDeformation';
import {diagramIllustrationMesh} from '../app/diagramIllustrationMesh';
import {
  createDiagramProject, appendDiagramStep, advanceDiagramStep, inheritDiagramCurrentPose, duplicateDiagramStep, removeDiagramStep, selectDiagramStep,
  updateDiagramStep, updateDiagramCP, adoptDiagramPose, updateDiagramPoseResult,updateDiagramPaperPose,
  updateDiagramPoseView, updateDiagramPoseViewport, updateDiagramOrientationLock, updateDiagramHiddenFaces, updateDiagramAnnotations, updateDiagramCanvas, updateDiagramFoldLink,updateDiagramCallouts, defaultDiagramCanvas, exportDiagramProject, importDiagramProject,
  getDiagramStepInitialView, resyncDiagramStepViews,
  type DiagramProject, type DiagramPose, type DiagramCPState, type DiagramCanvasSettings,
} from '../app/diagramProject';
import {normalizeDiagramCP,normalizeDiagramProjectCP} from '../app/diagramCP';
import {diagramFoldFacesAtPoint,pickDiagramFoldAnchor,diagramFoldStartingFace,alignDiagramFoldResult,projectDiagramFoldCP,diffDiagramFoldCP,mapDiagramFoldLines} from '../app/diagramFoldLink';
import {defaultDiagramFoldLink,reconcileDiagramFoldAnnotations,changeDiagramFoldLayerScope,applyDiagramSimulationFoldAngles,adoptDiagramFoldCP,refreshDiagramFoldDrawing,updateDiagramFoldDrawingFromCP} from '../app/diagramFoldTransactions';
import {hasDiagramActiveFoldChanges,chooseDiagramPrecreaseAnchor} from '../app/diagramPrecreaseAdvance';
import {diagramStepLayerPreferences,inheritDiagramFixedAnchor} from '../app/diagramStepInheritance';
import {getDiagramReturnTarget} from '../app/diagramReturnReference';
import {advanceDiagramReturnStep,diagramReturnAggregationPose} from '../app/diagramReturnStep';
import type {DiagramFoldLinkSettings} from '../app/diagramFoldLinkTypes';
import {modelProjection} from '../app/modelProjection';
import {followDiagramPaperAnnotations} from '../app/diagramPaperFollow';
import {recordDiagramPaperPull,retainDiagramPaperStates,switchDiagramPaperState,initializeDiagramPaperStates,isDiagramPaperPulled,isDiagramPaperPoseIsometric} from '../app/diagramPaperState';
import DiagramCPWorkspace from './DiagramCPWorkspace';
import {applyDiagramCPEdit,getDiagramCPEditAccess} from '../app/diagramCPEditing';
import DiagramDrawingCanvas, {type DiagramDrawingTool} from './DiagramDrawingCanvas';
import DiagramSpatialOrbit from './DiagramSpatialOrbit';
import {applyDiagramSpatialCamera} from '../app/diagramSpatialCameraTransaction';
import DiagramSymbolDock from './DiagramSymbolDock';
import DiagramThumbnail from './DiagramThumbnail';
import DiagramPrecisionToolbar,{type DiagramPrecisionSettings} from './DiagramPrecisionToolbar';
import DiagramCPInteractive,{type DiagramCPHit} from './DiagramCPInteractive';
import DiagramLayerStack from './DiagramLayerStack';
import DiagramLibrary from './DiagramLibrary';
import DiagramPDFExport from './DiagramPDFExport';
import DiagramStepAnimation from './DiagramStepAnimation';
import DiagramFullAnimation from './DiagramFullAnimation';
import DiagramCalloutDialog from './DiagramCalloutDialog';
import DiagramZoomRegionDialog from './DiagramZoomRegionDialog';
import {diagramStepZoom,diagramStepZooms,diagramZoomPaperBounds,tryMapDiagramZoomArea,diagramStepZoomIssue} from '../app/diagramStepZoom';
import {diagramZoomRegionBounds,type DiagramZoomBounds,type DiagramZoomRegion} from '../app/diagramZoomGeometry';
import {prepareDiagramZoomInteraction} from '../app/diagramZoomInteraction';
import './DiagramZoomControls.css';
import {diagramCalloutLocator,diagramCalloutTargets,type DiagramCallout} from '../app/diagramCallouts';
import {diagramCalloutCPMarkup} from '../app/diagramCalloutSVG';
import {defaultCreaseDisplay} from '../app/creaseDisplay';
import DiagramSimulationCapture from './DiagramSimulationCapture';
import DiagramImageControls from './DiagramImageControls';
import {prepareDiagramImage,type PreparedDiagramImage} from '../app/diagramImageImport';
import {insertDiagramImage} from '../app/diagramImageInsert';
import {isDiagramImageAnnotationVisible,type DiagramImage} from '../app/diagramImages';
import {updateDiagramImages} from '../app/diagramProject';
import type {SimulationImageCapture} from '../engine/simulator';
import DiagramCreaseTimingControls from './DiagramCreaseTimingControls';
import FoldAnglePanel from './FoldAnglePanel';
import {hasSpatialFoldAngles,hasNonFlatFoldAngles,DEFAULT_DIAGRAM_SPATIAL_CAMERA,type DiagramSpatialPose} from '../app/diagramSpatialPose';
import type {SimulationPose} from '../engine/simPose';
import {startDiagramAngleTask} from '../app/diagramAngleTask';
import type {DiagramSimulationAngleOptions} from '../app/diagramSimulationAngles';
import {startDiagramSpatialPose,startDiagramSpatialReprojection,startDiagramSpatialLayerAdjustment} from '../app/diagramSpatialTask';
import {sameSpatialCamera} from '../app/diagramArcball';
import type {SpatialLayerRequest} from '../app/diagramSpatialLayerSolver';
import {setDiagramLineAnimationTiming} from '../app/diagramAnimationTiming';
import {buildDiagramStepAnimation,type DiagramStepAnimationClip} from '../app/diagramStepAnimation';
import {createDiagramAutoArrow} from '../app/diagramAutoArrow';
import ToolCommandBar,{type ToolCommandBarHandle} from './ToolCommandBar';
import {DIAGRAM_COMMANDS,isDiagramDrawingCommand,type DiagramCommand} from '../app/diagramCommands';
import {useToolCommands} from '../app/toolCommandPreferences';
import {readToolCommandInput,saveToolCommandInput,toolCommandCharacter,TOOL_COMMAND_INPUT_CHANGED} from '../app/toolCommandInput';
import {createDiagramLibrary,emptyDiagramLibrary,findDiagramLibraryDocument,DiagramLibraryConflictError,DIAGRAM_LIBRARY_KEY,type DiagramLibraryIndex} from '../app/diagramLibrary';
import {mapDiagramCPSelection,fixedDiagramCPSelection,fixedDiagramCPItem} from '../app/diagramCPSelection';
import {diagramCPEdgeSegment,diagramCPEdgeProperties,diagramCPEdgeFoldAngle,editDiagramCPEdge,findDiagramCPEdge,type DiagramCPEdgeGeometry,type DiagramCPEdgeAssignment} from '../app/diagramCPEdgeEdit';
import {diagramCreaseCPEdges} from '../app/diagramCreaseSelection';
import {selectedDiagramLineRange,type DiagramLineFaceSelection} from '../app/diagramLinePick';
import {isolateDiagramLineEdits} from '../app/diagramLineEditScope';
import {isDiagramCPLine,type DiagramAnnotation,type DiagramLineAnnotation,type DiagramLineAnimationTiming,type DiagramLineStyle,type DiagramSymbolKind,type DiagramSymbolParams,type DiagramSymbolAnnotation} from '../app/diagramAnnotations';
import {SYMBOL_LABELS,LINE_LABELS} from '../app/diagramAnnotationSVG';
import {diagramPoseView as poseView,diagramPresentation,drawingSVG} from '../app/diagramDrawing';
import {canBindDiagramArrow,resolveDiagramPaperBindings} from '../app/diagramPaperBinding';
import {DiagramArrowBindingControls} from './DiagramArrowBindingControls';
import {SYMBOL_CATALOG,getSymbolParameters} from '../app/diagramSymbolCatalog';
import {getDiagramCadSymbol} from '../app/diagramCadSymbolCatalog';
import {isDiagramRotationSymbol,diagramSymbolTurnAngle} from '../app/diagramSymbolRotation';
import {copyDiagramAnnotations,mirrorCopyDiagramAnnotations,transformDiagramAnnotations} from '../app/diagramDrawingTools';
import {annotationBounds,symbolNativeGrips,symbolNativeBaseline,isDiagramRepeatSymbol,diagramRepeatVisualAngle,setDiagramRepeatVisualAngle} from '../app/diagramAnnotationSVG';
import UnfoldedVertexMap from './UnfoldedVertexMap';
import PanelDivider from './PanelDivider';
import {Icon, NumberField} from './Fields';
import AppDialog from './AppDialog';
import DiagramLineStyleControls,{DiagramLineAppearanceControls} from './DiagramLineStyleControls';
import ColorPicker from '../ui/ColorPicker';
import {readDiagramLineDefaults,saveDiagramLineDefaults,changeGlobalDiagramLineStyle,changeDiagramLineCategory,applyDiagramLineAppearance,resolveDiagramLineAppearance,overrideDiagramLineAppearance,resetDiagramLineAppearance,type DiagramLineAppearance,type DiagramLineDefaults} from '../app/diagramLineStyles';
import './DiagramWorkspace.css';
import './DiagramWorkspaceLayout.css';
import './DiagramComparison.css';
import DiagramLocalLayers from './DiagramLocalLayers';
import {prepareDiagramLocalLayerProbe} from '../app/diagramLocalLayerProbe';
import './DiagramSaveConflict.css';

export interface DiagramWorkspaceHandle {
  save():Promise<void>; open():void; export():void; print():void; library():Promise<void>; enter():void; checkpoint():Promise<boolean>; storageChanged():void;
  /** Immutable drawing snapshot; eager callers receive a validated detached copy. */
  capture(options?:{flush?:boolean;deferValidation?:boolean;checkpointOnly?:boolean}):DiagramProject|null;
  /** Preserve the previous library draft and import as a new document. */
  restore(project:DiagramProject|null):Promise<boolean>;
}
export interface DiagramWorkspaceProps {
  showCursorHint?:boolean;
  onCursorHintChange?:(enabled:boolean)=>void;
  doc:Doc;
  model:{doc:Doc; result:FlatFoldResult}|null;
  onMessage:(message:string)=>void;
  /** Open a detached CP copy in the ordinary editor; CP chain stays intact. */
  onRevealCP?:(doc:Doc)=>boolean;
  active?:boolean;
  incomingImage?:{id:string;image:PreparedDiagramImage}|null;
  onImageReceived?:(id:string)=>void;
  onArtworkChange?:()=>void;
}
const STORAGE_KEY='zhezhi.diagram-project.v1';
const HISTORY_LIMIT=24;
const OBLIQUE_DIAGRAM_CAMERA:DiagramSpatialPose['camera']={yaw:0,elevation:30};
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const emptySelection=():FoldedVertexSelection=>({group:[], selected:[]});
const round=(n:number)=>Number(n.toFixed(4));
const isExistingCrease=(a:DiagramAnnotation):a is DiagramLineAnnotation&{id:`cp-existing:${string}`}=>a.kind==='line'&&a.id.startsWith('cp-existing:');
const hasCPSourceBindings=(step:DiagramProject['steps'][number])=>!!step.foldLink?.enabled||step.foldLink?.generated!==undefined||(step.annotations??[]).some(annotation=>isDiagramCPLine(annotation)||annotation.kind==='line'&&annotation.foldFaces!==undefined);
function symbolBase(annotation:DiagramSymbolAnnotation):Point {
  const grips=symbolNativeGrips(annotation);
  return grips.find(g=>g.id==='center')?.point??grips.find(g=>g.id==='base')?.point??annotation.position;
}
const TOOL_HINTS:Partial<Record<DiagramDrawingTool,string>>={
  select:'空白处拖框多选 · Shift 增减选择 · 拖动移动 · Ctrl+D 复制 · Delete 删除',
  line:'拖动绘制 / 点击两端 · 垂直 / 角平分自动吸附 · Shift 限制方向 · Alt 暂停吸附 · Esc 取消',
  polyline:'依次点击绘制连续折线 · 垂直 / 角平分自动吸附 · Enter 结束 · Alt 暂停吸附 · Esc 结束',
  pan:'按住左键平移；滚轮缩放',erase:'点击或按住扫过擦除绘图对象 · Esc 取消',
  perpendicular:'点击绘图折线或纸边，再点击通过点绘制垂线',parallel:'点击绘图折线或纸边，再点击通过点绘制平行线',
  bisector:'选择两条相交绘图线或纸边，再点击角平分线端点',
  trim:'点击两条交线之间要剪掉的绘图线段',extend:'点击绘图线的端部，延长到其他绘图线',
  vertex:'点击纸角选择成员，再拖动修形',
  fixed:'点击本次保持不动的纸面内部；重合纸层可在左侧指定',
  layer:'点击纸面，在左侧选择参与本次折叠的层',
  'ratio-point':'依次点击第一端 A、第二端 B，按比例生成吸附定位点',
  'special-point':'依次点击第一端 A、第二端 B，按根式比例生成吸附定位点',
  'mirror-copy':'选中对象后点两点确定镜像轴，预览后确认复制 · Shift 45° · Alt 暂停吸附 · 右键 / Esc 取消',
};
function sourceGraph(pose:DiagramPose|null):FoldGraph|null {
  if(!pose)return null;
  try{return buildDiagramPoseFold(pose).graph;}catch{return null;}
}
/** View changes do not enter drawing history; keep them when undoing a drawing edit. */
function keepCurrentViews(next:DiagramProject,current:DiagramProject):DiagramProject {
  let result:DiagramProject={...next,steps:next.steps.map(step=>{
    const latestStep=current.steps.find(s=>s.id===step.id),latest=latestStep?.pose;
    if(latestStep?.canvas?.drawingRotation!==undefined)step={...step,canvas:{...(step.canvas??defaultDiagramCanvas(next.states.find(state=>state.id===step.beforeId)!.doc.paper.width)),drawingRotation:latestStep.canvas.drawingRotation}};
    if(latestStep?.orientationLocked!==undefined)step={...step,orientationLocked:latestStep.orientationLocked};
    if(step.pose&&latest&&step.pose.sourceStateId===latest.sourceStateId&&step.pose.sourceRevision===latest.sourceRevision){
      const view=poseView(latest);
      const pose={...step.pose,view:structuredClone(view)};
      return {...step,pose,...(latestStep?.viewMode==='manual'?{viewMode:'manual' as const}:{}),...(step.paperStates?{paperStates:{...step.paperStates,[step.paperStates.active]:structuredClone(pose)}}:{})};
    }
    return step;
  })};
  result=resyncDiagramStepViews(result,next);
  return refreshChangedViewDrawings(result,next);
}

function DiagramIntegerField({label,value,min,max,disabled,onChange}:{label:string;value:number;min:number;max:number;disabled?:boolean;onChange:(value:number)=>void}) {
  const [revision,setRevision]=useState(0);
  return <NumberField key={revision} label={label} value={value} min={min} max={max} step={1} disabled={disabled} onChange={next=>{
    const integer=Math.round(next);onChange(integer);if(integer!==next)setRevision(n=>n+1);
  }}/>;
}

function DiagramCadAttributeField({label,value,disabled,onChange}:{label:string;value:string;disabled?:boolean;onChange:(value:string)=>boolean}) {
  const [draft,setDraft]=useState(value),skipCommit=useRef(false);
  useEffect(()=>setDraft(value),[value]);
  return <label className="diagram-text-field"><span>{label}</span><input aria-label={label} value={draft} maxLength={200} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={e=>{if(skipCommit.current){skipCommit.current=false;return;}if(e.target.value!==value&&!onChange(e.target.value))setDraft(value);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();skipCommit.current=true;setDraft(value);e.currentTarget.blur();}}}/></label>;
}

function RenameDiagramDialog({name,onRename,onClose}:{name:string;onRename:(name:string)=>Promise<string|null>;onClose:()=>void}) {
  const [value,setValue]=useState(name),[error,setError]=useState(''),form=useRef<HTMLFormElement>(null),input=useRef<HTMLInputElement>(null),composing=useRef(false),submitting=useRef(false);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;input.current?.focus();input.current?.select();return()=>{if(previous?.isConnected)previous.focus();};},[]);
  return <div className="diagram-modal-backdrop"><form ref={form} className="diagram-confirm-modal diagram-rename-dialog ui-dialog" role="dialog" aria-modal="true" aria-label="重命名当前绘图" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onSubmit={async event=>{event.preventDefault();if(composing.current||submitting.current)return;submitting.current=true;try{const failure=await onRename(value.trim());if(failure)setError(failure);else onClose();}finally{submitting.current=false;}}} onKeyDown={event=>{
    event.stopPropagation();if(composing.current||event.nativeEvent.isComposing||event.keyCode===229){if(event.key==='Enter')event.preventDefault();return;}if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key==='Tab'){const controls=[...form.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}><h2>重命名绘图</h2><label>绘图名称<input ref={input} aria-label="绘图名称" value={value} maxLength={160} onChange={event=>{setValue(event.target.value);setError('');}}/></label>{error&&<p role="alert">{error}</p>}<div><button type="button" onClick={onClose}>取消</button><button className="diagram-primary" type="submit" disabled={!value.trim()}>保存名称</button></div></form></div>;
}

function DiagramFileOpeningDialog({state,onCancel}:{state:{name:string;stage:string;cancellable:boolean};onCancel:()=>void}){
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus({preventScroll:true});return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  return <div className="diagram-modal-backdrop"><section ref={dialog} tabIndex={-1} className="diagram-confirm-modal ui-dialog" role="dialog" aria-modal="true" aria-label="正在打开折序工程" onKeyDown={event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();if(state.cancellable)onCancel();}
    if(event.key==='Tab'){event.preventDefault();(dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')??dialog.current)?.focus();}
  }}><h2>打开「{state.name}」</h2><p role="status" aria-live="polite">{state.stage}</p><div><button disabled={!state.cancellable} onClick={onCancel}>取消打开</button></div></section></div>;
}

function ReplaceProjectDialog({name,onCancel,onSave,onOpen}:{name:string;onCancel:()=>void;onSave:()=>void;onOpen:()=>void}) {
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus({preventScroll:true});return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  return <div className="diagram-modal-backdrop"><section ref={dialog} tabIndex={-1} className="diagram-confirm-modal ui-dialog" role="dialog" aria-modal="true" aria-label="替换折序工程" onKeyDown={e=>{
    e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onCancel();}else if(e.key==='Tab'){
      const controls=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),first=controls[0],last=controls.at(-1);
      if(first&&last&&((e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget))||(!e.shiftKey&&document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus();}
    }
  }}><h2>打开「{name}」</h2><p>当前折序草稿会被替换。可以先保存当前工程，再打开。</p><div><button onClick={onCancel}>取消</button><button onClick={onSave}>保存当前工程</button><button className="diagram-primary" onClick={onOpen}>打开并替换</button></div></section></div>;
}

const DiagramWorkspace=forwardRef<DiagramWorkspaceHandle,DiagramWorkspaceProps>(function DiagramWorkspace({doc,model,onMessage,onRevealCP,active=true,incomingImage,onImageReceived,onArtworkChange,showCursorHint=true,onCursorHintChange},ref){
  const recovered=useRef(false),recoveryError=useRef(''),recoveredLibraryId=useRef<string|null>(null);
  const [saveClient]=useState(createDiagramLibrarySaveClient);
  useEffect(()=>()=>{void (async()=>{await repository.current?.waitForPendingSaves();await saveClient.dispose();})();},[saveClient]);
  const repository=useRef<ReturnType<typeof createDiagramLibrary>|null>(null);
  if(!repository.current)repository.current=createDiagramLibrary(preferenceStorage,{onWarning:warning=>message(warning),backgroundSave:saveClient.save});
  const library=repository.current;
  const [libraryIndex,setLibraryIndex]=useState<DiagramLibraryIndex>(()=>{try{return library.read();}catch(e){recoveryError.current=errorText(e);return emptyDiagramLibrary();}});
  const [libraryOpen,setLibraryOpen]=useState(true),[libraryError,setLibraryError]=useState(recoveryError.current),[pdfOpen,setPDFOpen]=useState(false);
  const returnFromCPEditor=useRef(false);
  const [project,setProject]=useState<DiagramProject>(()=>{
    try{if(libraryIndex.lastOpenId){const restored=prepareExistingCreases(normalizeDiagramProjectCP(library.load(libraryIndex.lastOpenId)).project);recoveredLibraryId.current=libraryIndex.lastOpenId;recovered.current=true;return restored;}}
    catch(e){recoveryError.current='上次绘图未能恢复：'+errorText(e);}
    try{const raw=preferenceStorage.getItem(DIAGRAM_LIBRARY_KEY)===null?preferenceStorage.getItem(STORAGE_KEY):null;if(raw){const restored=prepareExistingCreases(normalizeDiagramProjectCP(importDiagramProject(raw)).project);recovered.current=true;return restored;}}
    catch(e){recoveryError.current='本地折序草稿未能恢复：'+errorText(e)+'。已建立空白折序工程。';}
    return createDiagramProject(blankDoc('折序工程',doc.paper.width,doc.paper.height));
  });
  const [documentId,setDocumentId]=useState<string|null>(recoveredLibraryId.current),documentIdRef=useRef(documentId);documentIdRef.current=documentId;
  const [saveConflict,setSaveConflict]=useState<string|null>(null),saveConflictRef=useRef<string|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<{id:string;name:string}|null>(null),deleteTargetRef=useRef(deleteTarget);
  const [deleting,setDeleting]=useState(false),deletingRef=useRef(false),deleteCancel=useRef<HTMLButtonElement>(null);
  const fileGeneration=useRef(0),libraryAction=useRef(false);
  const getLibraryThumbnail=useCallback((id:string)=>library.getThumbnail(id),[library]);
  const projectRef=useRef(project);projectRef.current=project;
  const checkpointProject=useRef(project);
  const manuallySavedProject=useRef<DiagramProject|null>(!recovered.current||libraryIndex.documents.some(entry=>entry.id===recoveredLibraryId.current&&entry.savedKey!==null&&entry.savedKey===entry.draftKey)?project:null);
  const past=useRef<DiagramProject[]>([]),future=useRef<DiagramProject[]>([]);
  const [historyVersion,setHistoryVersion]=useState(0),[selection,setSelection]=useState(emptySelection);
  const [tool,setTool]=useState<DiagramDrawingTool>('select'),[tab,setTab]=useState<'model'|'drawing'|'step'|'project'>('drawing');
  const [propertiesOpen,setPropertiesOpen]=useState(false);
  const workspaceElement=useRef<HTMLDivElement>(null),commandBar=useRef<ToolCommandBarHandle>(null);
  const stepRail=useRef<HTMLElement>(null);
  const [directCommands,setDirectCommands]=useState(readToolCommandInput),[commandActivation,setCommandActivation]=useState(0);
  const commands=useToolCommands('diagram',DIAGRAM_COMMANDS);
  useEffect(()=>{try{saveToolCommandInput(directCommands);}catch{}},[directCommands]);
  useEffect(()=>{const refresh=()=>setDirectCommands(readToolCommandInput());window.addEventListener(TOOL_COMMAND_INPUT_CHANGED,refresh);return()=>window.removeEventListener(TOOL_COMMAND_INPUT_CHANGED,refresh);},[]);
  const [lineDefaults,setLineDefaults]=useState(readDiagramLineDefaults);
  const [adaptiveLines]=useAdaptiveLineStyle();
  const [lineStyle,setLineStyle]=useState<DiagramLineStyle>('valley'),[symbol,setSymbol]=useState<DiagramSymbolKind>('fold');
  const [foldAction,setFoldAction]=useState<NonNullable<DiagramLineAnnotation['foldAction']>>('fold');
  const foldAngle=180;
  const [spatialCamera,setSpatialCamera]=useState<DiagramSpatialPose['camera']>({...DEFAULT_DIAGRAM_SPATIAL_CAMERA});
  const [orbitMode,setOrbitMode]=useState(false);
  const [drawingColor,setDrawingColor]=useState(()=>lineDefaults.valley.color),[drawingWidth,setDrawingWidth]=useState(()=>lineDefaults.valley.width),[drawingPattern,setDrawingPattern]=useState(()=>lineDefaults.valley.strokePattern),[selectedAnnotationIds,setSelectedAnnotationIds]=useState<string[]>([]);
  const [selectedLineFaces,setSelectedLineFaces]=useState<DiagramLineFaceSelection>({});
  const [zoomDialog,setZoomDialog]=useState<{stepId:string;generation:number;annotation:DiagramSymbolAnnotation;isNew:boolean;basis:DiagramZoomBounds;bounds:DiagramZoomBounds;initial?:DiagramZoomRegion}|null>(null);
  const [selectedCalloutId,setSelectedCalloutId]=useState<string|null>(null),[calloutDialog,setCalloutDialog]=useState<{type:'paper'|'cp';editId?:string;sourcePoint?:Point}|null>(null);
  // Saved crease/default layer ranges are material settings, not a current UI
  // selection. Only an explicit layer-editing action may display that scope.
  const [layerScopeEditing,setLayerScopeEditing]=useState(false);
  const [fixedHighlightShown,setFixedHighlightShown]=useState(false);
  const showFixedHighlight=fixedHighlightShown||tool==='fixed';
  const [cpWidth,setCPWidth]=useState(280),[overview,setOverview]=useState(false),[showSymbolBaseline,setShowSymbolBaseline]=useState(false);
  const [editCP,setEditCP]=useState<string|null>(null),[confirmReplace,setConfirmReplace]=useState<DiagramProject|File|null>(null);
  const [fileOpening,setFileOpening]=useState<{name:string;stage:string;cancellable:boolean}|null>(null);
  const fileImportTask=useRef<ReturnType<typeof startDiagramProjectImport>|null>(null);
  const replacementLog=useRef<{action:'diagram.open'|'diagram.new';fileName?:string;bytes?:number}>({action:'diagram.open'});
  const [renameOpen,setRenameOpen]=useState(false);
  const [stepAnimation,setStepAnimation]=useState<{clip:DiagramStepAnimationClip;revision:string;title:string;source:DiagramProject}|null>(null);
  const [selectedImageId,setSelectedImageId]=useState<string|null>(null),[imageFitToken,setImageFitToken]=useState(0),[imageBusy,setImageBusy]=useState(false);
  const [captureTarget,setCaptureTarget]=useState<{stepId:string;generation:number}|null>(null);
  const imageInput=useRef<HTMLInputElement>(null),imageImportAbort=useRef<AbortController|null>(null),receivedImages=useRef(new Set<string>());
  const [fullAnimation,setFullAnimation]=useState<DiagramProject|null>(null);
  const animationOpen=!!stepAnimation||!!fullAnimation;
  const closeFullAnimation=useCallback(()=>setFullAnimation(null),[]);
  useEffect(()=>{if(!active||libraryOpen||fullAnimation&&fullAnimation!==project)setFullAnimation(null);},[active,libraryOpen,project,fullAnimation]);
  const closeStepAnimation=useCallback(()=>setStepAnimation(null),[]);
  useEffect(()=>{if(!active||libraryOpen||stepAnimation&&stepAnimation.source!==project)setStepAnimation(null);},[active,libraryOpen,project,stepAnimation]);
  const [storageMessage,setStorageMessage]=useState(recovered.current?'已恢复本地草稿':'独立工程已建立'),[localMessage,setLocalMessage]=useState(recoveryError.current);
  const [busy,setBusy]=useState<{stepId:string;stateId:string;kind:'fold'|'layers'|'camera'}|null>(null),[computeMessage,setComputeMessage]=useState('');
  const task=useRef<{cancel():void}|null>(null),ticket=useRef(0),mounted=useRef(true);
  const analysedLayers=useRef(new Map<string,{layers?:FlatFoldResult['layers'];error?:string}>()),consumedLayerRetry=useRef(0);
  const stopLayerAnalysis=useRef<(()=>void)|null>(null);
  const [layerRetry,setLayerRetry]=useState<{key:string;revision:number}|null>(null);
  const [layerAnalysis,setLayerAnalysis]=useState<{key:string;running:boolean;error?:string}|null>(null);
  const [thumbnailLayerErrors,setThumbnailLayerErrors]=useState(new Map<string,{key:string;message:string}>());
  const [thumbnailVisibility,setThumbnailVisibility]=useState(()=>({rail:new Set<string>(),overview:new Set<string>()}));
  const onThumbnailVisibility=useCallback((id:string,visible:boolean,surface:'rail'|'overview')=>{
    setThumbnailVisibility(previous=>{
      if(previous[surface].has(id)===visible)return previous;
      const next=new Set(previous[surface]);if(visible)next.add(id);else next.delete(id);
      return {...previous,[surface]:next};
    });
  },[]);
  const svgPreparation=useRef<ReturnType<typeof startDiagramLayerDisplayPreparation>|null>(null),svgSaveController=useRef<AbortController|null>(null),[svgExporting,setSVGExporting]=useState(false);
  const backupSaveLock=useRef(false),[backupSaving,setBackupSaving]=useState(false);
  const [layerChoice,setLayerChoice]=useState<{key:string;face:number;direction:'up'|'down'|'top'|'bottom'|'relative';error?:string;feedback?:string}|null>(null);
  const [layerOrderEditing,setLayerOrderEditing]=useState(false),[layerOrderFace,setLayerOrderFace]=useState<number|undefined>();
  const pendingNext=useRef<{stepId:string;stateId:string;history:boolean;fixed?:DiagramFoldLinkSettings['fixed'];view?:ModelViewState;sourcePose?:DiagramPose;sourceFixed?:DiagramFoldLinkSettings['fixed']}|null>(null);
  const openInput=useRef<HTMLInputElement>(null),cpInput=useRef<HTMLInputElement>(null),importTarget=useRef<{stateId:string;project:DiagramProject}|null>(null);
  const activeRef=useRef(active);activeRef.current=active;
  const propertyScroll=useRef<HTMLDivElement>(null);
  const step=project.steps.find(s=>s.id===project.activeStepId)??project.steps[0],stepIndex=project.steps.findIndex(s=>s.id===step.id);
  const before=project.states.find(s=>s.id===step.beforeId)!,after=project.states.find(s=>s.id===step.afterId)!,pose=step.pose;
  const images=step.images??[],paperVisible=step.paperVisible!==false;
  const thumbnailLayers=useMemo(()=>new Map(active&&!libraryOpen?project.steps.filter(item=>item.id===step.id||thumbnailVisibility.rail.has(item.id)||overview&&thumbnailVisibility.overview.has(item.id)).map(item=>[item.id,diagramLayerDisplayState(project,item.id)]):[]),[project,step.id,active,libraryOpen,overview,thumbnailVisibility]);
  const thumbnailLayerCandidate=project.steps.find(item=>{
    const state=thumbnailLayers.get(item.id);
    return item.id!==step.id&&state?.status==='pending'&&!!state.key&&thumbnailLayerErrors.get(item.id)?.key!==state.key;
  });
  const thumbnailLayerCandidateId=thumbnailLayerCandidate?.id,thumbnailLayerCandidateKey=thumbnailLayerCandidateId?thumbnailLayers.get(thumbnailLayerCandidateId)?.key:null;
  const projectGeneration=fileGeneration.current;
  useLayoutEffect(()=>{
    if(!active||libraryOpen)return;
    const rail=stepRail.current,card=rail?.querySelector<HTMLElement>('[aria-current="step"]');
    if(!rail||!card)return;
    const reveal=()=>{
      const viewport=rail.getBoundingClientRect(),selected=card.getBoundingClientRect();
      if(!rail.clientHeight||!selected.height)return;
      const top=viewport.top+rail.clientTop+8,bottom=viewport.top+rail.clientTop+rail.clientHeight-8;
      if(selected.top<top)rail.scrollTop+=selected.top-top;
      else if(selected.bottom>bottom)rail.scrollTop+=selected.bottom-bottom;
    };
    reveal();
    const observer=new ResizeObserver(reveal);observer.observe(rail);observer.observe(card);
    return()=>observer.disconnect();
  },[step.id,stepIndex,project.steps.length,projectGeneration,active,libraryOpen]);
  function thumbnailPreparation(id:string,checkHidden=false):{pending:boolean;message?:string}|undefined{
    const state=thumbnailLayers.get(id)??(checkHidden?diagramLayerDisplayState(project,id):undefined);if(!state||state.status==='ready')return;
    const error=thumbnailLayerErrors.get(id);
    return error?.key===state.key?{pending:false,message:error.message+' 点击此步骤可重新分析。'}:{pending:state.status==='pending',message:state.message};
  }
  const thumbnailZooms=useMemo(()=>diagramStepZooms(project),[project.steps,project.states]);
  const thumbnailCache=useMemo(()=>new DiagramThumbnailCache(),[projectGeneration]);
  useEffect(()=>()=>thumbnailCache.clear(),[thumbnailCache]);
  useEffect(()=>thumbnailCache.prune(new Set(project.steps.map(item=>item.id))),[thumbnailCache,project.steps]);
  const [pdfSettings,setPDFSettings]=useState<{generation:number;options:DiagramPDFOptions}|null>(null);
  const pdfOptions=useMemo(()=>pdfSettings?.generation===projectGeneration?pdfSettings.options:defaultDiagramPDFOptions(project),
    [pdfSettings,projectGeneration,project.name,project.steps.length,project.states[0]?.doc.paper.width,project.states[0]?.doc.paper.height]);
  const onPDFOptionsChange=useCallback((options:DiagramPDFOptions)=>setPDFSettings({generation:projectGeneration,options}),[projectGeneration]);
  // Captions and page layout are committed with the thumbnail, not planned on
  // every pointer edit. PDF dialog changes update the same panel sizes here.
  const thumbnailImageSizes=useMemo(()=>{
    try{return diagramThumbnailSizes(project,pdfOptions);}
    catch{return diagramThumbnailSizes(project,{...defaultDiagramPDFOptions(project),title:project.name.slice(0,120)});}
  },[step.id,overview,pdfOpen,active,libraryOpen,projectGeneration,pdfOptions,project.steps.length]);
  const thumbnailEditingId=active&&!libraryOpen&&!overview&&!pdfOpen?step.id:null;
  const thumbnailEditingSession=useMemo(()=>({}),[thumbnailEditingId,projectGeneration]);
  const previousThumbnailEdit=useRef<{id:string;session:object;cache:DiagramThumbnailCache}|null>(null);
  useLayoutEffect(()=>{
    const previous=previousThumbnailEdit.current;
    if(previous&&(previous.id!==thumbnailEditingId||previous.session!==thumbnailEditingSession||previous.cache!==thumbnailCache)&&previous.cache===thumbnailCache){
      const item=project.steps.find(value=>value.id===previous.id),size=thumbnailImageSizes.get(previous.id);
      // Flush the step being left even if its card is currently offscreen.
      if(item&&size)thumbnailCache.request(item.id,{step:item,states:project.states,lineDefaults,adaptiveLines,zoom:thumbnailZooms.get(item.id)?.region,size,preparation:thumbnailPreparation(item.id,true)});
    }
    previousThumbnailEdit.current=thumbnailEditingId?{id:thumbnailEditingId,session:thumbnailEditingSession,cache:thumbnailCache}:null;
  });
  const stateIndices=useMemo(()=>new Map(project.states.map((state,index)=>[state.id,index])),[project.states]);
  const effectiveZoom=thumbnailZooms.get(step.id)??null;
  const zoomIssue=useMemo(()=>diagramStepZoomIssue(project,step.id),[project,step.id]);
  const paperZoomBounds=useMemo(()=>diagramZoomPaperBounds(pose,images,paperVisible,before.doc.paper,step.simulationSurface),[pose,images,paperVisible,before.doc.paper,step.simulationSurface]);
  const [comparison,setComparison]=useState(false),[comparisonPhase,setComparisonPhase]=useState<'before'|'after'>('before'),[comparisonLayers,setComparisonLayers]=useState(false),[comparisonSymbols,setComparisonSymbols]=useState(false);
  const centralCP=editCP===before.id?before:editCP===after.id?after:null;
  const centralCPAccess=centralCP?getDiagramCPEditAccess(project,step.id,centralCP.id):null;
  useEffect(()=>{if(editCP&&!centralCP)setEditCP(null);},[editCP,centralCP]);
  const annotations=useMemo(()=>resolveDiagramPaperBindings(pose,step.annotations??[]),[pose,step.annotations]);
  const selectedAnnotations=annotations.filter(a=>selectedAnnotationIds.includes(a.id)&&(paperVisible||isDiagramImageAnnotationVisible(a))).map(a=>a.kind==='line'?selectedDiagramLineRange(a,selectedLineFaces):a),selectedAnnotation=selectedAnnotations.length===1?selectedAnnotations[0]:undefined;
  const selectedLines=selectedAnnotations.filter((a):a is DiagramLineAnnotation=>a.kind==='line');
  const selectedZoomSymbol=selectedAnnotation?.kind==='symbol'&&selectedAnnotation.symbol==='zoom'?selectedAnnotation:null;
  const selectedReturnSymbol=selectedAnnotation?.kind==='symbol'&&selectedAnnotation.symbol==='return'?selectedAnnotation:null;
  const hasReturnInstruction=annotations.some(annotation=>annotation.kind==='symbol'&&annotation.symbol==='return'&&!!annotation.returnStepId);
  const returnTargetReadiness=useRef(new WeakMap<object,boolean>());
  function returnTargetReady(candidate:typeof project.steps[number]):boolean {
    const cached=returnTargetReadiness.current.get(candidate);if(cached!==undefined)return cached;
    const ready=diagramReturnAggregationPose(candidate)?.result.geometry.status==='ready';
    returnTargetReadiness.current.set(candidate,ready);return ready;
  }
  const selectedZoomRegion=selectedZoomSymbol?.zoomArea?tryMapDiagramZoomArea(selectedZoomSymbol.zoomArea,paperZoomBounds):null;
  const selectedTearWindow=selectedAnnotation?.kind==='symbol'&&selectedAnnotation.symbol==='tearWindow'?selectedAnnotation:null;
  const selectedExisting=selectedAnnotations.filter(isExistingCrease),selectedFoldLines=selectedLines.filter(a=>a.style==='valley'||a.style==='mountain');
  const selectedSourceFoldLines=annotations.filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain')&&selectedAnnotationIds.includes(a.id));
  const canvasSettings=useMemo(()=>step.canvas??defaultDiagramCanvas(before.doc.paper.width),[step.canvas,before.doc.paper.width]);
  const canvasGrid=useMemo(()=>diagramPaperGrid(canvasSettings,pose?.sourceDoc??before.doc),[canvasSettings,pose?.sourceDoc,before.doc]);
  const [transformAngle,setTransformAngle]=useState(45),[transformScale,setTransformScale]=useState(1.25);
  const [precision,setPrecision]=useState<DiagramPrecisionSettings>({ratioA:1,ratioB:1,expression:'√2-1'});
  const selectedSymbolDefinition=selectedAnnotation?.kind==='symbol'?SYMBOL_CATALOG.find(item=>item.kind===selectedAnnotation.symbol):null;
  const selectedSymbolParameters=selectedAnnotation?.kind==='symbol'?getSymbolParameters(selectedAnnotation):null;
  const selectedIsCad=selectedAnnotation?.kind==='symbol'&&(selectedAnnotation.cadProperties!==undefined||!!selectedSymbolDefinition?.sourceOnly);
  const selectedCadDefinition=selectedAnnotation?.kind==='symbol'&&selectedIsCad?getDiagramCadSymbol(selectedAnnotation.symbol):undefined;
  const selectedSymbolBase=selectedAnnotation?.kind==='symbol'?symbolBase(selectedAnnotation):null;
  const nativeBaseline=selectedAnnotation?.kind==='symbol'?symbolNativeBaseline(selectedAnnotation):null;
  const selectedSymbolBaseline=nativeBaseline?{length:Math.hypot(nativeBaseline.end[0]-nativeBaseline.start[0],nativeBaseline.end[1]-nativeBaseline.start[1]),angle:Math.atan2(nativeBaseline.end[1]-nativeBaseline.start[1],nativeBaseline.end[0]-nativeBaseline.start[0])*180/Math.PI,rooted:nativeBaseline.rooted}:null;
  const [draftSymbolText,setDraftSymbolText]=useState('');
  useEffect(()=>{setDraftSymbolText(selectedAnnotation?.kind==='symbol'?selectedAnnotation.text??'':'');},[selectedAnnotation?.id,selectedAnnotation?.kind==='symbol'?selectedAnnotation.text:undefined]);
  const graph=useMemo(()=>pose?.paperDeformation?.nodes.length?diagramIllustrationMesh(pose).graph:sourceGraph(pose),[pose?.sourceStateId,pose?.sourceRevision,pose?.sourceDoc,pose?.paperDeformation]);
  const originState=pose?project.states.find(s=>s.id===pose.sourceStateId):null,originIndex=originState?project.states.indexOf(originState):-1;
  const otherSource=!!pose&&pose.sourceStateId!==before.id&&pose.sourceStateId!==after.id;
  const stale=!!pose&&originState?.revision!==pose.sourceRevision;
  const layerAnalysisKey=useMemo(()=>diagramLayerAnalysisKey(project,step.id),[step.id,pose,project.states]);
  const layerAnalysisUnavailableReason=useMemo(()=>pose?diagramPaperLayerAnalysisReason(pose):undefined,[pose]);
  const layerAnalysing=!!layerAnalysisKey&&layerAnalysis?.key===layerAnalysisKey&&layerAnalysis.running;
  const layerAnalysisError=layerAnalysis?.key===layerAnalysisKey?layerAnalysis.error:undefined;
  useEffect(()=>{setLayerOrderEditing(false);setLayerOrderFace(undefined);setLayerChoice(null);},[step.id,pose?.sourceStateId,pose?.sourceRevision,pose?.result.geometry]);
  const [draftTitle,setDraftTitle]=useState(step.title),[draftDescription,setDraftDescription]=useState(step.description),[draftName,setDraftName]=useState(project.name);
  const pendingCaptions=useRef<{stepId:string;title?:string;description?:string}|null>(null);
  useEffect(()=>{setDraftTitle(step.title);setDraftDescription(step.description);setDraftName(project.name);},[step.id,step.title,step.description,project.name]);
  useEffect(()=>{if(propertyScroll.current)propertyScroll.current.scrollTop=0;},[tab]);
  const simulationSurface=step.simulationSurface;
  const currentView=pose?poseView(pose):{...defaultModelView(),...(simulationSurface?{colors:simulationSurface.colors}:{})};
  useEffect(()=>{setSpatialCamera({...pose?.spatial?.camera??DEFAULT_DIAGRAM_SPATIAL_CAMERA});},[step.id,pose?.spatial?.camera]);
  useEffect(()=>{setOrbitMode(false);},[step.id]);
  const paperPresentation=useMemo(()=>pose?diagramPresentation(pose):null,[pose]);
  const localSurfaceEnabled=!!pose&&!currentView.xray&&!paperPresentation?.manual&&!annotations.some(annotation=>annotation.kind==='symbol'&&annotation.symbol==='tearWindow'&&annotation.cutawayFaces?.length);
  const paperLocalSurface=useMemo(()=>pose&&localSurfaceEnabled?diagramLocalSurface(pose,currentView.side):null,[pose,localSurfaceEnabled,currentView.side]);
  const localSurfaceIssue=pose&&localSurfaceEnabled?diagramLocalSurfaceIssue(pose,currentView.side):undefined;
  const paperLayerStatus=!pose?'':paperPresentation?.manual?'绘图遮挡顺序':pose.result.layers.status==='solved'
    ?paperPresentation?.hasOrder?'层序已确认':paperLocalSurface?'局部层序已确认 · 分区显示':'局部层序已确认'
    :'层序未确认';
  const paperDisplayStatus=paperLayerStatus+(pose&&!paperPresentation?.solid&&!paperLocalSurface?(currentView.xray?' · 透视':' · 透明预览'):'');
  const foldLink=step.foldLink??defaultDiagramFoldLink();
  const paperPulled=useMemo(()=>step.paperVisible!==false&&isDiagramPaperPulled(step),[step]);
  const orbitHistory=useMemo(()=>{if(!orbitMode||!pose?.spatial)return [];const history=project.steps.slice(0,stepIndex+1).flatMap(item=>item.paperStates?.spatial?[item.paperStates.spatial]:item.paperStates?.flat?[item.paperStates.flat]:item.pose?[item.pose]:[]);if(history.at(-1)!==pose)history.push(pose);return history;},[orbitMode,project,stepIndex,pose]);
  useEffect(()=>{if(!active||libraryOpen||overview||centralCP||step.paperVisible===false||(!pose?.spatial&&!simulationSurface)||paperPulled||stale||pdfOpen||editCP||confirmReplace||fileOpening||animationOpen||captureTarget||calloutDialog||zoomDialog)setOrbitMode(false);},[active,libraryOpen,overview,centralCP,step.paperVisible,!!pose?.spatial,!!simulationSurface,paperPulled,stale,pdfOpen,editCP,confirmReplace,fileOpening,animationOpen,captureTarget,calloutDialog,zoomDialog]);
  const legacyPaperFaces=useMemo(()=>{
    if(!pose||pose.result.geometry.graph?.zhezhi_flatCreases==='marks'||!pose.sourceDoc.segments.some(s=>s.assignment==='F'))return false;
    try{return JSON.stringify(buildDiagramFold(pose.sourceDoc).graph.faces_vertices)!==JSON.stringify(pose.result.geometry.faces);}catch{return false;}
  },[pose]);
  const [cpHovered,setCPHovered]=useState<{stateId:string;hit:DiagramCPHit}|null>(null);
  type PaperHover={kind:'drawing';point:Point}|{kind:'cp';point?:Point}|{kind:'layer';face:number};
  const [paperHover,setPaperHover]=useState<PaperHover|null>(null);
  const hoverFrame=useRef<number|null>(null),pendingPaperHover=useRef<PaperHover|null>(null);
  const queuePaperHover=useCallback((value:PaperHover|null)=>{
    pendingPaperHover.current=value;
    if(hoverFrame.current===null)hoverFrame.current=requestAnimationFrame(()=>{hoverFrame.current=null;setPaperHover(pendingPaperHover.current);});
  },[]);
  useEffect(()=>()=>{if(hoverFrame.current!==null)cancelAnimationFrame(hoverFrame.current);},[]);
  useEffect(()=>{queuePaperHover(null);},[step.id,pose?.result,pose?.paperDeformation,pose?.view?.side,pose?.view?.rotation,active,centralCP,overview,paperVisible]);
  const localLayerModel=useMemo(()=>{
    if(!pose||stale||!paperVisible)return null;
    try{return prepareDiagramLocalLayerProbe(pose);}catch{return null;}
  },[pose?.result,pose?.sourceDoc,pose?.paperDeformation,pose?.view?.side,pose?.view?.rotation,pose?.view?.projectionCenter,pose?.hiddenFaces,stale,paperVisible]);
  const [cpSelected,setCPSelected]=useState<{stateId:string;hit:DiagramCPHit;point?:Point;edge?:DiagramCPEdgeGeometry}|null>(null);
  const selectedCPEdge=useMemo(()=>{
    if(cpSelected?.hit.kind!=='edge')return null;
    const state=project.states.find(item=>item.id===cpSelected.stateId);
    try{return state?diagramCPEdgeSegment(state,cpSelected.hit.index):null;}catch{return null;}
  },[cpSelected,project.states]);
  const selectedCPEdgeProperties=useMemo(()=>{
    if(cpSelected?.hit.kind!=='edge')return null;
    try{return diagramCPEdgeProperties(project,step.id,cpSelected.stateId,cpSelected.hit.index);}catch{return null;}
  },[cpSelected,project,step.id]);
  const selectedCPEdgeAngle=useMemo(()=>{
    if(cpSelected?.hit.kind!=='edge')return 'mixed' as const;
    try{return diagramCPEdgeFoldAngle(project,step.id,cpSelected.stateId,cpSelected.hit.index);}catch{return 'mixed' as const;}
  },[cpSelected,project,step.id]);
  const selectedCreaseEdges=useMemo(()=>({
    before:pose?diagramCreaseCPEdges(pose,selectedLines,foldLink,before,originState??undefined):[],
    after:pose?diagramCreaseCPEdges(pose,selectedLines,foldLink,after,originState??undefined):[],
  }),[pose,selectedAnnotationIds,selectedLineFaces,annotations,foldLink,before,after,originState]);
  useEffect(()=>{if(tab!=='drawing')setPropertiesOpen(true);},[tab]);
  useEffect(()=>{if(selectedAnnotation?.kind==='symbol'&&selectedAnnotation.symbol!=='tearWindow'&&!selectedLines.length)setPropertiesOpen(true);},[selectedAnnotation?.id]);
  useEffect(()=>{try{saveDiagramLineDefaults(lineDefaults);}catch(error){message('线段默认样式未能保存：'+errorText(error));}},[lineDefaults]);
  const cpMap=(pick:{stateId:string;hit:DiagramCPHit}|null)=>{
    if(!pick||!pose)return {highlight:undefined,error:''};
    const state=project.states.find(s=>s.id===pick.stateId);if(!state)return {highlight:undefined,error:'选择的 CP 不在当前工程中。'};
    try{const mapped=mapDiagramCPSelection(pose,state,pick.hit,originState??undefined);return {highlight:{...mapped,label:`CP${project.states.indexOf(state)} ${{face:'F',vertex:'V',edge:'E'}[pick.hit.kind]}${pick.hit.index+1} · ${mapped.faces.map(f=>'F'+(f+1)).join('/')}`},error:''};}catch(e){return {highlight:undefined,error:errorText(e)};}
  };
  const cpHoverMap=useMemo(()=>cpMap(cpHovered),[cpHovered,pose,project.states]);
  const localLayerProbe=useMemo(()=>{
    if(!localLayerModel||!paperHover||busy||centralCP||overview||!active)return null;
    try{
      if(paperHover.kind==='drawing')return localLayerModel.at(paperHover.point);
      if(paperHover.kind==='layer')return localLayerModel.faceSample(paperHover.face);
      if(cpHovered?.hit.kind!=='face'||!cpHoverMap.highlight?.faces.length)return null;
      return paperHover.point?localLayerModel.fromCP(paperHover.point,cpHoverMap.highlight.faces):localLayerModel.faceSample(cpHoverMap.highlight.faces[0]);
    }catch{return null;}
  },[localLayerModel,paperHover,cpHovered,cpHoverMap,busy,centralCP,overview,active]);
  const localPaperHighlight=useMemo(()=>localLayerProbe&&paperHover?.kind!=='cp'?localLayerModel?.highlight(localLayerProbe.face):undefined,[localLayerModel,localLayerProbe?.face,paperHover?.kind]);
  const cpSelectedMap=useMemo(()=>cpMap(cpSelected),[cpSelected,pose,project.states]);
  const fixedTargetState=foldLink.enabled&&foldLink.fixed?(foldLink.fixed.target?project.states.find(s=>s.id===foldLink.fixed!.target!.stateId):after):undefined;
  const fixedCPHit=useMemo(()=>{
    if(!fixedTargetState||!foldLink.fixed)return null;
    try{return foldLink.fixed.target?fixedDiagramCPItem(fixedTargetState,foldLink.fixed):{kind:'face' as const,index:diagramFoldStartingFace(fixedTargetState.doc,foldLink.fixed)};}catch{return null;}
  },[fixedTargetState,foldLink.fixed]);
  const cpFixedMap=useMemo(()=>cpMap(fixedTargetState&&fixedCPHit?{stateId:fixedTargetState.id,hit:fixedCPHit}:null),[fixedTargetState,fixedCPHit,pose,project.states]);
  const fixedSourceFaces=useMemo(()=>foldLink.enabled&&foldLink.fixed&&graph&&!stale?(graph.faces_vertices??[]).flatMap((_,face)=>materialFaceInside(graph,face,foldLink.fixed!.point)?[face]:[]):[],[foldLink.enabled,foldLink.fixed,graph,stale]);
  useEffect(()=>{setCPHovered(null);setCPSelected(null);setSelectedLineFaces({});setLayerScopeEditing(false);},[step.id,before.id,after.id,pose?.sourceStateId,pose?.sourceRevision]);
  useEffect(()=>{
    setCPHovered(null);
    setCPSelected(previous=>{
      if(previous?.hit.kind!=='edge'||!previous.edge)return null;
      const state=project.states.find(item=>item.id===previous.stateId);if(!state)return null;
      try{const index=findDiagramCPEdge(state,previous.edge);return index<0?null:{...previous,hit:{kind:'edge',index}};}catch{return null;}
    });
  },[before.revision,after.revision]);
  const [foldFaceCandidates,setFoldFaceCandidates]=useState<number[]>([]);
  const [foldPickPoint,setFoldPickPoint]=useState<Point|null>(null);
  const [foldPickKind,setFoldPickKind]=useState<'fixed'|'layer'>('layer');
  const foldAppearanceKey=JSON.stringify({...currentView,cameras:undefined});
  const [foldPreview,setFoldPreview]=useState<{preview:ReturnType<typeof projectDiagramFoldCP>['preview'];error:string;valid:boolean;pending?:boolean}>({preview:[],error:'',valid:false});
  const foldPreviewTask=useRef<{cancel():void}|null>(null);
  useEffect(()=>{
    setFoldPreview({preview:[],error:'',valid:false});
    if(!active||libraryOpen||busy||!foldLink.enabled||!pose)return;
    if(pose.sourceStateId!==before.id){setFoldPreview({preview:[],error:'请计算操作前 CP，以它作为本步折线的映射基底。',valid:false});return;}
    const job=startDiagramGeometry('project',[pose,before.doc,after.doc,before,foldLink.precreases]);let live=true;
    foldPreviewTask.current=job;setFoldPreview({preview:[],error:'正在计算折痕显示…',valid:false,pending:true});
    void job.promise.then(mapped=>{if(live)setFoldPreview({preview:mapped.preview,error:mapped.warnings.join(''),valid:true});})
      .catch(error=>{if(live)setFoldPreview({preview:[],error:errorText(error),valid:false});});
    return()=>{live=false;if(foldPreviewTask.current===job)foldPreviewTask.current=null;job.cancel();};
  // A camera commit replaces the pose/view shell, but does not change material
  // projection. Keep every other pose field and view setting as dependencies.
  },[active,libraryOpen,!!busy,!!pose,pose?.sourceStateId,pose?.sourceRevision,pose?.sourceDoc,pose?.result,pose?.spatial,pose?.displayOrder,pose?.layerSolutionIndex,pose?.hiddenFaces,pose?.paperDeformation,foldAppearanceKey,before,after,foldLink.enabled,foldLink.precreases]);
  const foldCanvasPreview=useMemo(()=>foldPreview.preview.map((line,index)=>({id:'fold-preview-'+index,a:line.a,b:line.b,face:line.face,visibility:line.visibility,existing:line.existing,unfolding:line.unfolding,strokeSpan:line.strokeSpan,style:line.style??(line.assignment==='V'?'valley':line.assignment==='M'?'mountain':line.assignment==='F'?'crease':'auxiliary') as DiagramLineStyle})),[foldPreview.preview]);
  const selectedCallout=step.callouts?.find(callout=>callout.id===selectedCalloutId);
  const calloutCPMarkup=useCallback((stateId:string,sourceUnits?:number,hideExistingCreases?:boolean)=>{const state=[before,after].find(item=>item.id===stateId);return state?diagramCalloutCPMarkup(state.doc,defaultCreaseDisplay(),{enabled:adaptiveLines,units:sourceUnits,hideExistingCreases}):'';},[before,after,adaptiveLines]);
  const calloutMainSVG=useMemo(()=>calloutDialog?drawingSVG(pose,annotations,'','',foldPreview.valid?foldPreview.preview:undefined,images,paperVisible,lineDefaults,[],undefined,undefined,undefined,0,simulationSurface):undefined,[simulationSurface,calloutDialog,pose,annotations,foldPreview,images,paperVisible,lineDefaults,adaptiveLines]);
  useEffect(()=>{setSelectedCalloutId(null);setCalloutDialog(null);},[step.id]);
  useEffect(()=>{if(selectedCalloutId&&!step.callouts?.some(callout=>callout.id===selectedCalloutId))setSelectedCalloutId(null);},[step.callouts,selectedCalloutId]);
  const selectedFoldFaceSets=useMemo(()=>{
    if(!pose||!foldLink.enabled)return [];
    try{return selectedSourceFoldLines.map(line=>line.foldFaces??mapDiagramFoldLines(pose,[line],foldLink,before).preview.map(part=>part.face));}catch{return [];}
  },[pose,selectedSourceFoldLines,foldLink,before]);
  const selectedFoldFaces=[...new Set(selectedFoldFaceSets.flat())].sort((a,b)=>a-b);
  const commonFoldFaces=selectedFoldFaces.filter(face=>selectedFoldFaceSets.every(faces=>faces.includes(face)));
  const layerScopeActive=selectedSourceFoldLines.length>0||layerScopeEditing&&selectedAnnotationIds.length===0&&!cpSelected;
  const displayedFoldFaces=selectedSourceFoldLines.length?selectedFoldFaces:layerScopeActive&&foldLink.layers==='selected'?foldLink.selectedFaces:[];
  const fixedDisplayPoint=foldLink.fixed?.target?.kind==='vertex'?foldLink.fixed.target.point:foldLink.fixed?.point;
  const fixedCanvasPoint=pose&&foldLink.enabled&&foldLink.fixed&&fixedDisplayPoint?modelProjection(pose.result.geometry.vertices,currentView.side==='back',currentView.rotation,currentView?.projectionCenter).project([
    foldLink.fixed.matrix[0]*fixedDisplayPoint[0]+foldLink.fixed.matrix[2]*fixedDisplayPoint[1]+foldLink.fixed.matrix[4],
    foldLink.fixed.matrix[1]*fixedDisplayPoint[0]+foldLink.fixed.matrix[3]*fixedDisplayPoint[1]+foldLink.fixed.matrix[5],
  ]):undefined;
  const selectionPoint=pose&&selection.selected.length?diagramPaperVertices(pose)[selection.selected[0]]:null;
  useEffect(()=>{setSelectedImageId(null);setCaptureTarget(null);setZoomDialog(null);imageImportAbort.current?.abort();},[step.id]);
  useEffect(()=>{if(!active||libraryOpen){setCaptureTarget(null);setZoomDialog(null);imageImportAbort.current?.abort();}},[active,libraryOpen]);
  useEffect(()=>()=>imageImportAbort.current?.abort(),[]);
  useEffect(()=>{
    if(!active||!incomingImage||receivedImages.current.has(incomingImage.id))return;
    receivedImages.current.add(incomingImage.id);
    try{setLibraryOpen(false);addPreparedImage(incomingImage.image,projectRef.current.activeStepId,fileGeneration.current);}
    catch(error){message(errorText(error));}
    onImageReceived?.(incomingImage.id);
  },[active,incomingImage?.id]);
  function addPreparedImage(input:PreparedDiagramImage,stepId:string,generation:number){
    if(!mounted.current||!activeRef.current||generation!==fileGeneration.current||projectRef.current.activeStepId!==stepId)throw new Error('工程或步骤已切换，图片未插入；请在目标步骤重试。');
    flushFields();
    const result=insertDiagramImage(projectRef.current,stepId,input,'image-'+crypto.randomUUID());
    commit(result.project);resetDrawingSelection();setSelectedImageId(result.image.id);setImageFitToken(value=>value+1);
    setTool('select');setOverview(false);setEditCP(null);setLibraryOpen(false);
    message(`已将「${input.name}」插入「${result.project.name}」当前步骤，可拖动图片或四角调整。`);
  }
  async function importImage(file:File){
    imageImportAbort.current?.abort();const controller=new AbortController();imageImportAbort.current=controller;
    const stepId=projectRef.current.activeStepId,generation=fileGeneration.current;setImageBusy(true);
    try{const image=await prepareDiagramImage(file,controller.signal);if(!controller.signal.aborted)addPreparedImage(image,stepId,generation);}
    catch(error){if(!controller.signal.aborted)message(errorText(error));}
    finally{if(imageImportAbort.current===controller){imageImportAbort.current=null;setImageBusy(false);}}
  }
  async function insertSimulationImage(capture:SimulationImageCapture,name:string,stepId:string,generation:number,signal?:AbortSignal){
    const image=await prepareDiagramImage({dataUrl:capture.dataUrl,name,source:'simulation'},signal);
    if(signal?.aborted)throw new DOMException('截图已取消。','AbortError');
    addPreparedImage(image,stepId,generation);
  }
  function changeImages(next:DiagramImage[],showPaper=paperVisible){
    try{commit(updateDiagramImages(projectRef.current,step.id,next,next.length?showPaper:true));if(selectedImageId&&!next.some(image=>image.id===selectedImageId))setSelectedImageId(null);}
    catch(error){message(errorText(error));}
  }
  function selectImage(id:string|null){
    // Canvas clicks dismiss an image selection while defining mirror axes and
    // other construction points. Only choosing an image replaces drawing picks.
    if(id!==null){resetDrawingSelection();setTool('select');}
    setSelectedImageId(id);
  }
  function openSimulationCapture(){
    if(busy||imageBusy)return;flushFields();resetDrawingSelection();setCaptureTarget({stepId:step.id,generation:fileGeneration.current});
  }
  async function applySimulationSurface(simulation:SimulationPose,signal:AbortSignal,colors:ModelColors){
    const original=projectRef.current,target=captureTarget;
    if(signal.aborted)return;
    if(!target||original.activeStepId!==target.stepId||fileGeneration.current!==target.generation)throw Error('工程或步骤已变化，请重新打开三维模拟。');
    const source=original.steps.find(item=>item.id===target.stepId)!,cp=original.states.find(item=>item.id===source.afterId)!;
    const solving=startDiagramSimulationEditable(cp.doc,simulation),abort=()=>solving.cancel();
    signal.addEventListener('abort',abort,{once:true});
    try{
      const answer=await solving.promise;
      if(signal.aborted)return;
      if(projectRef.current!==original||fileGeneration.current!==target.generation)throw Error('工程已变化，未应用旧模拟结果。');
      const next=applyDiagramSimulationEditable(original,target.stepId,answer,colors);
      cancelTask();resetDrawingSelection();setTool('select');setEditCP(null);setOverview(false);commit(next);setImageFitToken(value=>value+1);
      message(`已生成可编辑的下一步立体纸面，可转动视角、选择纸层并绘制折线。为闭合纸面，折角最大调整 ${answer.maximumCorrection.toFixed(2)}°，已同步到 CP。`);
    }finally{signal.removeEventListener('abort',abort);}
  }
  function changeSimulationView(view:SimulationPose['view']){
    commit(updateDiagramSimulationSurfaceView(projectRef.current,step.id,view));
  }
  async function applySimulationAngles(simulation:SimulationPose,signal:AbortSignal,options:DiagramSimulationAngleOptions={}){
    const original=projectRef.current,s=original.steps.find(item=>item.id===original.activeStepId)!,cp=original.states.find(item=>item.id===s.afterId)!;
    if(signal.aborted)return;
    let cancel=()=>{};const abort=()=>cancel();signal.addEventListener('abort',abort,{once:true});
    try{
      const solving=startDiagramAngleTask(cp.doc,simulation,options);cancel=solving.cancel;const answer=await solving.promise;
      if(signal.aborted)return;
      if(projectRef.current!==original||fileGeneration.current!==captureTarget?.generation)throw Error('工程已变化，未应用旧模拟结果。');
      const next=applyDiagramSimulationFoldAngles(original,s.id,answer.doc);
      commit(next);resetDrawingSelection();
      const capped=answer.cappedCreases?`${answer.cappedCreases} 条同向过折已按 180° 处理（最大超出 ${answer.maxOverfold.toFixed(2)}°）。`:'';
      message(`${capped}已将模拟进度 ${(answer.progress*100).toFixed(1)}% 的折角对应到本步折痕；${answer.closureVerified?'闭合验证通过，折后结果将在下一步生成。':'闭合未确认（校验已关闭），后续计算仍按实际几何处理。'}`);
    }finally{signal.removeEventListener('abort',abort);}
  }
  function message(text:string){setLocalMessage(text);onMessage(text);}
  function cancelTask(){ticket.current++;task.current?.cancel();task.current=null;pendingNext.current=null;setBusy(null);setComputeMessage('');setLayerChoice(null);}
  async function geometry<K extends DiagramGeometryKind>(kind:K,args:DiagramGeometryArgs<K>,request:number,text:string){
    const job=startDiagramGeometry(kind,args,operations=>{if(mounted.current&&ticket.current===request)setComputeMessage(text+`（已处理 ${operations.toLocaleString()} 次几何操作，可停止）`);});
    task.current=job;setComputeMessage(text);
    const result=await job.promise;
    if(!mounted.current||ticket.current!==request)throw new DOMException('已停止折序计算。','AbortError');
    return result;
  }
  function commit(next:DiagramProject,history=true){
    if(next===projectRef.current)return;
    next=refreshChangedViewDrawings(next,projectRef.current);
    if(history){past.current=[...past.current,projectRef.current].slice(-HISTORY_LIMIT);future.current=[];setHistoryVersion(n=>n+1);}
    projectRef.current=next;setProject(next);
    if(history)recordActivity('diagram.edit',{count:next.steps.length});
  }
  function replaceProjectSnapshot(next:DiagramProject){
    // A complete saved drawing already contains coordinates for its saved
    // view. Loading it is not an incremental observation-angle edit.
    projectRef.current=next;setProject(next);
  }
  function undo(){if(!past.current.length)return;cancelTask();resetDrawingSelection();future.current.push(projectRef.current);const next=keepCurrentViews(past.current.pop()!,projectRef.current);projectRef.current=next;setProject(next);setSelection(emptySelection());setHistoryVersion(n=>n+1);recordActivity('diagram.undo',{count:next.steps.length});}
  function redo(){if(!future.current.length)return;cancelTask();resetDrawingSelection();past.current.push(projectRef.current);const next=keepCurrentViews(future.current.pop()!,projectRef.current);projectRef.current=next;setProject(next);setSelection(emptySelection());setHistoryVersion(n=>n+1);recordActivity('diagram.redo',{count:next.steps.length});}
  // Keep native text undo while typing. Persistence and leave protection also
  // include the focused field, without recording each character as a drawing edit.
  function projectWithPendingCaptions(){
    const current=projectRef.current,pending=pendingCaptions.current,target=pending&&current.steps.find(item=>item.id===pending.stepId);
    if(!pending||!target)return current;
    const title=pending.title?.trim()??target.title,description=pending.description??target.description;
    return title===target.title&&description===target.description?current:updateDiagramStep(current,target.id,{title,description});
  }
  function editCaption(field:'title'|'description',value:string){
    pendingCaptions.current={...(pendingCaptions.current?.stepId===step.id?pendingCaptions.current:{}),stepId:step.id,[field]:value};
    if(field==='title')setDraftTitle(value);else setDraftDescription(value);
    setStorageMessage('有未暂存修改');
  }
  function finishCaption(field:'title'|'description',value:string){
    const pending=pendingCaptions.current;
    if(pending?.stepId===step.id){delete pending[field];if(pending.title===undefined&&pending.description===undefined)pendingCaptions.current=null;}
    const current=projectRef.current,target=current.steps.find(item=>item.id===step.id);if(!target)return;
    const text=field==='title'?value.trim():value;
    if(text!==target[field])commit(updateDiagramStep(current,step.id,{[field]:text}));
    else if(field==='title')setDraftTitle(target.title);
  }
  function flushFields(){const element=document.activeElement;if(element instanceof HTMLElement&&element.closest('[data-diagram-workspace]')&&element.matches('input,textarea,select'))flushSync(()=>element.blur());}
  function openFullAnimation(){if(busy)return;flushFields();setFullAnimation(projectRef.current);}
  function openStepAnimation(){
    if(busy)return;
    flushFields();
    try{
      const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!;
      const clip=buildDiagramStepAnimation(current,s.id),index=current.steps.findIndex(item=>item.id===s.id);
      setStepAnimation({clip,revision:`diagram-animation:${s.id}:${crypto.randomUUID()}`,title:`第 ${index+1} 步${s.title?' · '+s.title:''}`,source:current});
    }catch(error){message(errorText(error));}
  }
  function generateMainArrow(){
    if(busy)return;flushFields();
    try{
      const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!;
      const result=createDiagramAutoArrow(current,s.id,{color:drawingColor,width:drawingWidth});
      commit(updateDiagramAnnotations(current,s.id,[...(s.annotations??[]),result.annotation]));
      clearDrawingSelection(true);setSelectedAnnotationIds([result.annotation.id]);setTool('select');setTab('drawing');setPropertiesOpen(true);setOverview(false);
      message(`已生成${result.action==='precrease'?'预折':result.action==='unfold'?'展开':'折叠'}主箭头，绑定 F${result.sourceFace+1}，可拖动和调整。${result.warnings.join(' ')}`);
    }catch(error){message(errorText(error));}
  }
  function refreshLibrary(){setLibraryIndex(library.read());}
  function clearSaveConflict(){saveConflictRef.current=null;setSaveConflict(null);}
  function markSaveConflict(reason=new DiagramLibraryConflictError().message){
    saveConflictRef.current=reason;setSaveConflict(reason);manuallySavedProject.current=null;setLibraryError(reason);
    setStorageMessage('其他窗口已更新 · 本窗口未保存');
  }
  async function renameCurrentProject(name:string):Promise<string|null> {
    if(libraryAction.current)return '正在保存绘图，请稍后重试。';
    if(!name||name.length>160)return '名称须为 1 到 160 个字符。';
    if(name===projectRef.current.name)return null;
    libraryAction.current=true;
    try{await library.waitForPendingSaves();if(documentIdRef.current)library.renameDocument(documentIdRef.current,name);commit({...projectRef.current,name});setDraftName(name);refreshLibrary();message('绘图名称已更新，文档库同步使用新名称。');return null;}
    catch(error){return errorText(error);}
    finally{finishLibraryAction();}
  }
  function storageChanged(){
    manuallySavedProject.current=null;setStorageMessage('保存位置已切换 · 正在核对绘图');
    try{
      const index=library.read(),entry=findDiagramLibraryDocument(index,projectRef.current,id=>library.load(id),documentIdRef.current);
      documentIdRef.current=entry?.id??null;setDocumentId(entry?.id??null);setLibraryIndex(index);setLibraryError('');clearSaveConflict();
      if(entry){const next={...projectRef.current,name:entry.name};commit(next,false);setDraftName(entry.name);manuallySavedProject.current=entry.savedKey===entry.draftKey?next:null;rememberCheckpoint(next,false);}
      setStorageMessage(manuallySavedProject.current?'已保存到文档库':entry?'草稿已暂存':'当前绘图尚未保存到新目录');
    }catch(e){documentIdRef.current=null;setDocumentId(null);setLibraryError(errorText(e));message('保存目录已切换，绘图目录暂未读取；当前绘图仍保留，可保存为新的绘图。');}
  }
  function rememberCheckpoint(snapshot:DiagramProject,notify=true){
    const changed=!sameDiagramProjectContent(checkpointProject.current,snapshot);checkpointProject.current=snapshot;
    if(notify&&changed)artworkChangeRef.current?.();
  }
  async function checkpointDraft(snapshot?:DiagramProject):Promise<boolean> {
    if(!library.hasPendingSave()&&sameDiagramProjectContent(snapshot??projectWithPendingCaptions(),checkpointProject.current))return true;
    if(saveConflictRef.current)return false;
    const generation=fileGeneration.current;
    try{
      // Resolve the first save's ID before queuing another new-document save.
      if(!documentIdRef.current&&library.hasPendingSave())await library.waitForPendingSaves();
      if(generation!==fileGeneration.current||!mounted.current)return false;
      do{
        const source=projectRef.current,captions=JSON.stringify(pendingCaptions.current),current=snapshot??projectWithPendingCaptions();
        if(sameDiagramProjectContent(current,checkpointProject.current))return true;
        const entry=await library.saveAsync(current,{id:documentIdRef.current??undefined,kind:'draft'},{legacyDraft:true});
        if(generation!==fileGeneration.current||!mounted.current)return false;
        documentIdRef.current=entry.id;setDocumentId(entry.id);refreshLibrary();setLibraryError('');rememberCheckpoint(current);setStorageMessage(sameDiagramProjectContent(projectWithPendingCaptions(),current)?'草稿已暂存':'有未暂存修改 · 切换步骤或保存时写入');
        if(snapshot||source===projectRef.current&&captions===JSON.stringify(pendingCaptions.current))return true;
        // Leaving waits for edits made while the previous snapshot was saving.
      }while(!saveConflictRef.current);
      return false;
    }catch(e){
      if(generation!==fileGeneration.current||!mounted.current)return false;
      recordActivity('diagram.save.error',{stage:'draft',reason:errorText(e),count:(snapshot??projectRef.current).steps.length},'error');
      if(e instanceof DiagramLibraryConflictError)markSaveConflict(e.message);else setLibraryError(errorText(e));
      message('绘图暂存未完成：'+errorText(e)+'。当前内容仍保留，可下载工程备份。');return false;
    }
  }
  async function save(){
    while(libraryAction.current&&mounted.current)await new Promise(resolve=>setTimeout(resolve,50));
    if(!mounted.current)return;
    flushFields();const generation=fileGeneration.current;
    recordActivity('diagram.save.start',{count:projectRef.current.steps.length});
    if(saveConflictRef.current){message(saveConflictRef.current);return;}
    try{
      if(!documentIdRef.current&&library.hasPendingSave())await library.waitForPendingSaves();
      if(generation!==fileGeneration.current||!mounted.current)return;
      const snapshot=projectRef.current;
      if(documentIdRef.current&&manuallySavedProject.current&&sameDiagramProjectContent(snapshot,manuallySavedProject.current)&&sameDiagramProjectContent(snapshot,checkpointProject.current)){message('内容没有变化，已保存的工程保持不变。');return;}
      const entry=await library.saveAsync(snapshot,{id:documentIdRef.current??undefined,kind:'saved'});
      if(generation!==fileGeneration.current||!mounted.current)return;
      documentIdRef.current=entry.id;setDocumentId(entry.id);refreshLibrary();setLibraryError('');manuallySavedProject.current=snapshot;rememberCheckpoint(snapshot);
      const unchanged=sameDiagramProjectContent(projectRef.current,snapshot);
      setStorageMessage(unchanged?'已保存到文档库':'已保存 · 后续修改待暂存');recordActivity('diagram.save.success',{count:snapshot.steps.length});
      message(unchanged?'折序工程已保存到文档库，包含步骤、CP、纸层状态、折痕与符号。':'保存完成；保存期间的新修改仍在当前画布，下次切换步骤或保存时写入。');
    }catch(e){if(generation!==fileGeneration.current||!mounted.current)return;recordActivity('diagram.save.error',{reason:errorText(e)},'error');if(e instanceof DiagramLibraryConflictError)markSaveConflict(e.message);else setLibraryError(errorText(e));message('保存未完成：'+errorText(e)+'。当前内容仍保留，可下载工程备份。');}
  }
  async function saveAsNewDrawing(){
    if(libraryAction.current)return;libraryAction.current=true;
    flushFields();const generation=fileGeneration.current;
    try{
      await library.waitForPendingSaves();
      if(generation!==fileGeneration.current||!mounted.current)return;
      const current=projectRef.current,suffix='（副本）',next={...current,name:current.name.slice(0,160-suffix.length)+suffix};
      const entry=await library.saveAsync(next,{kind:'saved'});
      if(generation!==fileGeneration.current||!mounted.current)return;
      documentIdRef.current=entry.id;setDocumentId(entry.id);
      const latest=projectRef.current===current?next:{...projectRef.current,name:next.name};
      replaceProjectSnapshot(latest);setDraftName(next.name);clearSaveConflict();refreshLibrary();setLibraryError('');manuallySavedProject.current=next;rememberCheckpoint(next);setStorageMessage('已另存到文档库');
      recordActivity('diagram.save.success',{stage:'save-as',count:next.steps.length});message('当前完整绘图已另存为「'+next.name+'」，原绘图及其他窗口的版本均保留。');
    }catch(error){setLibraryError(errorText(error));message('另存未完成：'+errorText(error)+'。当前内容仍保留，可下载工程备份。');}
    finally{finishLibraryAction();}
  }
  async function downloadProjectBackup(){
    if(backupSaveLock.current)return;backupSaveLock.current=true;setBackupSaving(true);
    try{
      flushFields();
      const result=await download(exportDiagramProject(projectRef.current),safeName(projectRef.current.name)+'.diagram.json');
      if(!mounted.current)return;
      if(result.status==='cancelled'){message('已取消保存工程备份。');return;}
      message(result.status==='saved'?'完整折序工程备份保存完成。':'已发起完整折序工程备份浏览器下载，请确认下载结果。');
    }catch(e){if(mounted.current)message('工程备份保存失败：'+errorText(e));}
    finally{backupSaveLock.current=false;if(mounted.current)setBackupSaving(false);}
  }
  function activateLibraryProject(next:DiagramProject,id:string|null,knownSaved?:boolean){
    clearSaveConflict();
    imageImportAbort.current?.abort();setCaptureTarget(null);setZoomDialog(null);setSelectedImageId(null);
    svgPreparation.current?.cancel();svgPreparation.current=null;svgSaveController.current?.abort();setSVGExporting(false);setThumbnailLayerErrors(new Map());
    fileGeneration.current++;
    pendingCaptions.current=null;
    cancelTask();past.current=[];future.current=[];replaceProjectSnapshot(next);documentIdRef.current=id;setDocumentId(id);setHistoryVersion(n=>n+1);
    setLayerScopeEditing(false);
    setSelection(emptySelection());setSelectedAnnotationIds([]);setSelectedLineFaces({});setCPSelected(null);setCPHovered(null);setFoldFaceCandidates([]);setFoldPickPoint(null);setEditCP(null);setConfirmReplace(null);setOverview(false);setTool('select');setTab('drawing');setLibraryOpen(false);
    const entry=id&&knownSaved===undefined?library.read().documents.find(item=>item.id===id):null;
    manuallySavedProject.current=(knownSaved??!!(entry?.savedKey&&entry.savedKey===entry.draftKey))?next:null;rememberCheckpoint(next);
  }
  function captureArtworkDiagram(options?:{flush?:boolean;deferValidation?:boolean;checkpointOnly?:boolean}):DiagramProject|null {
    if(options?.checkpointOnly)return libraryOpen&&!documentIdRef.current&&!recovered.current?null:checkpointProject.current;
    if(options?.flush!==false)flushFields();
    if(libraryOpen&&!documentIdRef.current&&!recovered.current)return null;
    let snapshot=projectWithPendingCaptions();
    if(options?.flush===false){
      const input=document.activeElement;
      if(input instanceof HTMLInputElement&&input.closest('[data-diagram-workspace]')){
        if(input.getAttribute('aria-label')==='折序工程名称'&&draftName.trim())snapshot={...snapshot,name:draftName.trim()};
        if(input.getAttribute('aria-label')==='符号编号文字'&&selectedAnnotation?.kind==='symbol')snapshot=updateDiagramAnnotations(snapshot,step.id,(snapshot.steps.find(item=>item.id===step.id)?.annotations??[]).map(item=>item.id===selectedAnnotation.id?{...item,text:draftSymbolText}:item));
      }
    }
    // The artwork worker runs the same full export validator. Other callers
    // still receive the eagerly validated standalone snapshot. Editing replaces
    // immutable branches; postMessage performs the required detached copy even
    // if the caller first awaits simulation capture.
    return options?.deferValidation?snapshot:importDiagramProject(exportDiagramProject(snapshot));
  }
  async function restoreArtworkDiagram(value:DiagramProject|null):Promise<boolean> {
    if(libraryAction.current)return false;libraryAction.current=true;
    flushFields();
    try{
      // Validate and normalize before writing any draft or changing the open
      // drawing. Existing library IDs never come from an artwork file.
      const next=value===null?createDiagramProject(blankDoc('折序工程',doc.paper.width,doc.paper.height)):
        prepareExistingCreases(normalizeDiagramProjectCP(importDiagramProject(exportDiagramProject(value))).project);
      if((documentIdRef.current||!libraryOpen||recovered.current)&&!await checkpointDraft())return false;
      await library.waitForPendingSaves();
      const leaving=projectRef.current,entry=value===null?null:await library.saveAsync(next,{kind:'draft'});
      if(projectRef.current!==leaving&&!await checkpointDraft())return false;
      const index=library.read();
      // All storage operations have completed. Activation cannot re-read a
      // failing store after partially replacing this workspace.
      activateLibraryProject(next,entry?.id??null,false);
      recovered.current=false;returnFromCPEditor.current=false;setPDFOpen(false);setStepAnimation(null);setFullAnimation(null);setRenameOpen(false);
      setLibraryIndex(index);setLibraryError('');setStorageMessage(entry?'完整作品中的绘图已另存为草稿':'尚未打开折序绘图');
      if(!entry)setLibraryOpen(true);
      return true;
    }catch(error){setLibraryError(errorText(error));message('完整作品的折序绘图未能打开，原绘图仍保留：'+errorText(error));return false;}
    finally{finishLibraryAction();}
  }
  function finishLibraryAction(){libraryAction.current=false;}
  async function runLibraryAction(action:()=>Promise<void>){
    if(libraryAction.current)return;libraryAction.current=true;
    try{await library.waitForPendingSaves();if(mounted.current)await action();}
    catch(error){setLibraryError(errorText(error));message(errorText(error));}
    finally{finishLibraryAction();}
  }
  async function showLibrary(){
    await runLibraryAction(async()=>{
      imageImportAbort.current?.abort();returnFromCPEditor.current=false;flushFields();cancelTask();
      if((documentIdRef.current||!libraryOpen)&&!await checkpointDraft())return;
      setLibraryOpen(true);setPDFOpen(false);clearDrawingSelection();refreshLibrary();
    });
  }
  function enterWorkspace(){if(returnFromCPEditor.current){returnFromCPEditor.current=false;setLibraryOpen(false);}else void showLibrary();}
  function revealCPInEditor(source:Doc){flushFields();if(onRevealCP?.(structuredClone(source)))returnFromCPEditor.current=true;}
  async function openLibraryDocument(id:string){
    await runLibraryAction(async()=>{
      recordActivity('diagram.open.start',{stage:'library'});flushFields();
      if(id===documentIdRef.current){setLibraryOpen(false);library.markOpen(id);refreshLibrary();recordActivity('diagram.open.success',{stage:'library',count:projectRef.current.steps.length});return;}
      if((documentIdRef.current||!libraryOpen)&&!await checkpointDraft()){recordActivity('diagram.open.error',{stage:'checkpoint',reason:'当前绘图暂存未完成，未打开其他绘图。'},'error');return;}
      const next=prepareExistingCreases(normalizeDiagramProjectCP(library.load(id)).project);library.markOpen(id);activateLibraryProject(next,id);refreshLibrary();setLibraryError('');recordActivity('diagram.open.success',{stage:'library',count:next.steps.length});message('绘图已打开。');
    });
  }
  async function newLibraryDocument(){
    await runLibraryAction(async()=>{
      recordActivity('diagram.new.start',{stage:'blank'});flushFields();
      if((documentIdRef.current||!libraryOpen)&&!await checkpointDraft()){recordActivity('diagram.new.error',{stage:'checkpoint',reason:'当前绘图暂存未完成，未新建绘图。'},'error');return;}
      const leaving=projectRef.current,next=createDiagramProject(blankDoc('折序工程',doc.paper.width,doc.paper.height)),entry=await library.saveAsync(next,{kind:'draft'});
      if(projectRef.current!==leaving&&!await checkpointDraft())return;
      activateLibraryProject(next,entry.id);refreshLibrary();setLibraryError('');recordActivity('diagram.new.success',{count:next.steps.length});message('已新建空白折序绘图。');
    });
  }
  async function newFromCurrentCP(){
    recordActivity('diagram.new.start',{stage:'current-cp'});
    try{const next=createDiagramProject(normalizeDiagramCP(doc).doc);replacementLog.current={action:'diagram.new'};await requestProjectReplacement(next);}
    catch(cause){recordActivity('diagram.new.error',{stage:'current-cp',reason:errorText(cause)},'error');message(errorText(cause));}
  }
  async function continueLibraryDocument(){
    await runLibraryAction(async()=>{
      recordActivity('diagram.open.start',{stage:'continue'});
      if(!documentIdRef.current&&!await checkpointDraft()){recordActivity('diagram.open.error',{stage:'checkpoint',reason:'当前绘图暂存未完成。'},'error');return;}
      setLibraryOpen(false);recordActivity('diagram.open.success',{stage:'continue',count:projectRef.current.steps.length});
    });
  }
  async function changeLibrary(action:()=>void){await runLibraryAction(async()=>{action();refreshLibrary();setLibraryError('');});}
  function requestLibraryDeletion(id:string){
    if(busy||deletingRef.current||deleteTargetRef.current)return;
    const entry=libraryIndex.documents.find(item=>item.id===id);
    if(!entry){setLibraryError('找不到这个折序绘图，请重新打开文档库。');return;}
    const target={id:entry.id,name:entry.name};deleteTargetRef.current=target;setDeleteTarget(target);setLibraryError('');
  }
  function cancelLibraryDeletion(){if(deletingRef.current)return;deleteTargetRef.current=null;setDeleteTarget(null);}
  async function deleteLibraryDocument(){
    const target=deleteTargetRef.current;if(!target||busy||deletingRef.current||libraryAction.current)return;
    libraryAction.current=true;deletingRef.current=true;setDeleting(true);recordActivity('diagram.delete.start',{stage:'library'});
    try{
      await library.waitForPendingSaves();
      const result=await library.deleteDocument(target.id);if(!mounted.current)return;
      if(documentIdRef.current===target.id){
        stopLayerAnalysis.current?.();stopLayerAnalysis.current=null;analysedLayers.current.clear();setLayerAnalysis(null);setLayerRetry(null);
        importTarget.current=null;returnFromCPEditor.current=false;
        const next=createDiagramProject(blankDoc('折序工程',doc.paper.width,doc.paper.height));
        activateLibraryProject(next,null);manuallySavedProject.current=next;rememberCheckpoint(next);
        setLibraryOpen(true);setPDFOpen(false);setRenameOpen(false);setFixedHighlightShown(false);setStorageMessage('当前绘图已删除');
      }
      setLibraryIndex(result.index);setLibraryError(result.warning??'');
      deleteTargetRef.current=null;setDeleteTarget(null);
      recordActivity('diagram.delete.success',{stage:'library'});
      message(`已删除绘图「${target.name}」。`+(result.warning??''));
    }catch(error){recordActivity('diagram.delete.error',{stage:'library',reason:errorText(error)},'error');setLibraryError(errorText(error));message('删除未完成，绘图仍保留：'+errorText(error));}
    finally{deletingRef.current=false;if(mounted.current)setDeleting(false);finishLibraryAction();}
  }
  function openPDFExport(){flushFields();setPDFOpen(true);}
  async function requestProjectReplacement(next:DiagramProject){
    flushFields();
    if(diagramProjectNeedsReplacementConfirmation(projectWithPendingCaptions(),manuallySavedProject.current,!libraryOpen))setConfirmReplace(next);
    else await completeProjectReplacement(next);
  }
  async function completeProjectReplacement(next:DiagramProject){
    const {action,...details}=replacementLog.current;
    await runLibraryAction(async()=>{
      flushFields();
      if((documentIdRef.current||!libraryOpen||recovered.current)&&!await checkpointDraft()){recordActivity(`${action}.error`,{...details,stage:'checkpoint',reason:'当前绘图暂存未完成，未替换绘图。'},'error');return;}
      const leaving=projectRef.current,entry=await library.saveAsync(next,{kind:'draft'});
      if(projectRef.current!==leaving&&!await checkpointDraft())return;
      activateLibraryProject(next,entry.id);refreshLibrary();setLibraryError('');recordActivity(`${action}.success`,{...details,stage:'replace',count:next.steps.length});message('折序工程已打开，已加入文档库。');
    });
  }
  function cancelFileImport(){
    const pending=fileImportTask.current;if(!pending)return;
    fileImportTask.current=null;pending.cancel();setFileOpening(null);
    recordActivity('diagram.open.cancel',{stage:'prepare'});message('已取消打开，当前工程仍保留。');
  }
  async function loadDiagramFile(file:File){
    if(fileImportTask.current||libraryAction.current)return;
    const generation=fileGeneration.current;
    setConfirmReplace(null);setFileOpening({name:file.name,stage:'正在读取工程…',cancellable:true});
    recordActivity('diagram.open.start',{stage:'read',fileName:file.name,bytes:file.size});
    let pending:ReturnType<typeof startDiagramProjectImport>|null=null;
    try{
      pending=startDiagramProjectImport(file,stage=>{if(mounted.current&&fileImportTask.current===pending)setFileOpening({name:file.name,stage,cancellable:true});});
      fileImportTask.current=pending;
      const next=await pending.promise;
      if(!mounted.current||generation!==fileGeneration.current||fileImportTask.current!==pending)return;
      setFileOpening({name:file.name,stage:'正在保存并打开工程…',cancellable:false});
      // Paint the final stage before handing the prepared graph to storage.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      if(!mounted.current||generation!==fileGeneration.current||fileImportTask.current!==pending)return;
      await completeProjectReplacement(next);
    }catch(cause){
      if(!mounted.current||generation!==fileGeneration.current||pending&&fileImportTask.current!==pending)return;
      recordActivity('diagram.open.error',{stage:'read',fileName:file.name,bytes:file.size,reason:errorText(cause)},'error');message('打开失败，当前工程仍保留：'+errorText(cause));
    }finally{if(!pending||fileImportTask.current===pending){fileImportTask.current=null;if(mounted.current)setFileOpening(null);}}
  }
  async function readDiagramFile(file:File){
    if(fileImportTask.current||libraryAction.current)return;
    flushFields();replacementLog.current={action:'diagram.open',fileName:file.name,bytes:file.size};
    // Keep only the File handle until the user decides; no JSON parse or
    // geometry normalization may delay this confirmation.
    if(diagramProjectNeedsReplacementConfirmation(projectWithPendingCaptions(),manuallySavedProject.current,!libraryOpen))setConfirmReplace(file);
    else await loadDiagramFile(file);
  }
  function open(){if(fileImportTask.current||libraryAction.current)return;flushFields();const generation=fileGeneration.current,nativePicker=!!window.desktop?.openProject;recordActivity('diagram.open.start',{stage:'choose-file'});void selectProjectFile(openInput.current,'diagram').then(file=>{if(!mounted.current||generation!==fileGeneration.current)return;if(file)void readDiagramFile(file);else if(nativePicker)recordActivity('diagram.open.cancel',{stage:'choose-file'});}).catch(cause=>{if(!mounted.current||generation!==fileGeneration.current)return;recordActivity('diagram.open.error',{stage:'choose-file',reason:errorText(cause)},'error');message(errorText(cause));});}
  async function exportDrawing(){
    if(svgPreparation.current||svgSaveController.current)return false;
    flushFields();const source=projectRef.current,current=source.steps.find(item=>item.id===source.activeStepId)!;
    if(!current.pose&&!current.annotations?.length&&!current.images?.length&&!current.callouts?.length){message('请先计算折图、插入图片或放置符号，再导出。');return false;}
    let preparation:ReturnType<typeof startDiagramLayerDisplayPreparation>|null=null;
    const controller=new AbortController();svgSaveController.current=controller;
    try{
      const generation=fileGeneration.current,signature=diagramLayerDisplaySignature(source);
      preparation=startDiagramLayerDisplayPreparation(source,{stepIds:[current.id]});
      svgPreparation.current=preparation;setSVGExporting(true);
      const prepared=await preparation.promise;
      if(prepared.cancelled||!mounted.current||!activeRef.current||generation!==fileGeneration.current||svgPreparation.current!==preparation)return false;
      if(diagramLayerDisplaySignature(projectRef.current)!==signature){message('绘图已变化，本次 SVG 未导出，请重试。');return false;}
      if(prepared.issues.length){message('SVG 导出未完成：'+prepared.issues.map(issue=>issue.message).join(' '));return false;}
      const p=prepared.project,s=p.steps.find(item=>item.id===current.id)!;
      const preview=s.paperVisible!==false&&s.foldLink?.enabled&&s.pose?projectDiagramFoldCP(s.pose,p.states.find(st=>st.id===s.beforeId)!.doc,p.states.find(st=>st.id===s.afterId)!.doc,p.states.find(st=>st.id===s.beforeId)!,s.foldLink.precreases).preview:undefined;
      const result=await download(drawingSVG(s.pose,s.annotations??[],diagramPDFStepLabel(s,p.steps.indexOf(s)),s.description,preview,s.images,s.paperVisible!==false,lineDefaults,s.callouts,(stateId,sourceUnits,hideExistingCreases)=>{const state=p.states.find(item=>item.id===stateId);return state?diagramCalloutCPMarkup(state.doc,defaultCreaseDisplay(),{enabled:adaptiveLines,units:sourceUnits,hideExistingCreases}):'';},{enabled:adaptiveLines},diagramStepZoom(p,s.id)?.region,s.canvas?.drawingRotation??0,s.simulationSurface),safeName(p.name)+'-步骤'+(p.steps.indexOf(s)+1)+'.svg','image/svg+xml',{signal:controller.signal});
      if(controller.signal.aborted||!mounted.current||!activeRef.current||generation!==fileGeneration.current||svgPreparation.current!==preparation)return false;
      if(result.status==='cancelled'){message('已取消保存当前步骤 SVG。');return false;}
      message(result.status==='saved'?'当前步骤 SVG 折图保存完成。':'已发起当前步骤 SVG 浏览器下载，请确认下载结果。');return true;
    }catch(cause){if(mounted.current&&(!preparation||svgPreparation.current===preparation))message('SVG 导出未完成：'+errorText(cause));return false;}
    finally{if(svgSaveController.current===controller)svgSaveController.current=null;if(preparation&&svgPreparation.current===preparation){svgPreparation.current=null;if(mounted.current)setSVGExporting(false);}}
  }
  function print(){openPDFExport();}
  useImperativeHandle(ref,()=>({save,open,export:openPDFExport,print,library:showLibrary,enter:enterWorkspace,storageChanged,capture:captureArtworkDiagram,restore:restoreArtworkDiagram,checkpoint:async()=>{while(libraryAction.current&&mounted.current)await new Promise(resolve=>setTimeout(resolve,50));if(!mounted.current)return false;flushFields();await library.waitForPendingSaves();return libraryOpen&&!documentIdRef.current?true:await checkpointDraft();}}));
  const artworkChangeRef=useRef(onArtworkChange);artworkChangeRef.current=onArtworkChange;

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;ticket.current++;task.current?.cancel();fileImportTask.current?.cancel();fileImportTask.current=null;};},[]);
  useEffect(()=>{const input=openInput.current;if(!input)return;const cancelled=()=>recordActivity('diagram.open.cancel',{stage:'choose-file'});input.addEventListener('cancel',cancelled);return()=>input.removeEventListener('cancel',cancelled);},[]);
  // Analyse the saved paper itself, independently of the CP-folding task. A
  // display-only result must never rebuild faces or reapply crease bindings.
  useEffect(()=>{
    if(!active||libraryOpen||pdfOpen||editCP||confirmReplace||fileOpening||animationOpen||busy||!layerAnalysisKey)return;
    const key=layerAnalysisKey,current=projectRef.current.steps.find(item=>item.id===step.id)?.pose;
    if(!current||current.spatial)return;
    const retry=layerRetry?.key===key&&layerRetry.revision!==consumedLayerRetry.current;
    if(!retry&&current.result.layers.status==='solved'&&(current.result.layers.solutionIndex??0)===requestedDiagramLayerSolutionIndex(current))return;
    const cached=analysedLayers.current.get(key);
    if(!retry&&cached){
      if(cached.layers){
        const latest=projectRef.current,next=applyDiagramLayerAnalysis(latest,step.id,key,{...current.result,layers:cached.layers});
        if(next!==latest){projectRef.current=next;setProject(next);}
      }
      setLayerAnalysis({key,running:false,...(cached.error?{error:cached.error}:{})});
      return;
    }
    if(retry)consumedLayerRetry.current=layerRetry!.revision;
    let live=true;
    const solutionIndex=requestedDiagramLayerSolutionIndex(current);
    const analysis=startFlatLayerReanalysis(current.result,{timeoutMs:retry?Infinity:15000,constraints:current.result.layers.constraints,solutionIndex});
    recordActivity('diagram.layers.start',{stage:'reanalysis',count:current.result.geometry.faces.length});
    const stop=()=>{live=false;analysis.cancel();};stopLayerAnalysis.current=stop;
    setLayerAnalysis({key,running:true});
    void analysis.promise.then(result=>{
      if(!live||!mounted.current)return;
      // Worker timeouts/errors retain the request's selected solution and
      // constraints, so they remain explicit failures for this exact request.
      const completed=result.layers.status==='solved'?result:{...result,layers:{...result.layers,constraints:current.result.layers.constraints,solutionIndex}};
      const latest=projectRef.current,next=applyDiagramLayerAnalysis(latest,step.id,key,completed);
      const accepted=next!==latest||diagramLayerAnalysisKey(latest,step.id)===key&&JSON.stringify(latest.steps.find(item=>item.id===step.id)?.pose?.result.layers)===JSON.stringify(completed.layers);
      const error=accepted?undefined:'纸面已变化，本次层序结果未应用。请重新分析。';
      const confirmed=accepted&&completed.layers.status==='solved';
      recordActivity(!accepted?'diagram.layers.error':confirmed?'diagram.layers.success':'diagram.layers.result',{stage:'reanalysis',status:completed.layers.status,result:accepted?(completed.layers.faceOrder?'global-order':confirmed?'local-order':'unconfirmed'):'stale-result',...(!confirmed?{reason:error??completed.layers.message}:{})},!accepted?'error':confirmed?'info':'warning');
      analysedLayers.current.set(key,accepted?{layers:structuredClone(completed.layers)}:{error});
      if(analysedLayers.current.size>64)analysedLayers.current.delete(analysedLayers.current.keys().next().value!);
      if(next!==latest){
        // Keep automatic certificates outside undo history and drawing
        // transactions; only the current layer cache has changed.
        projectRef.current=next;setProject(next);
      }
      setLayerAnalysis({key,running:false,...(error?{error}:{})});
    }).catch(error=>{
      if(!live||!mounted.current)return;
      const message='层序分析未完成：'+errorText(error);
      recordActivity('diagram.layers.error',{stage:'reanalysis',reason:errorText(error)},'error');
      analysedLayers.current.set(key,{error:message});
      if(analysedLayers.current.size>64)analysedLayers.current.delete(analysedLayers.current.keys().next().value!);
      setLayerAnalysis({key,running:false,error:message});
    });
    return()=>{stop();if(stopLayerAnalysis.current===stop)stopLayerAnalysis.current=null;if(mounted.current)setLayerAnalysis(previous=>previous?.key===key&&previous.running?{key,running:false}:previous);};
  },[active,libraryOpen,pdfOpen,editCP,confirmReplace,fileOpening,animationOpen,busy,step.id,layerAnalysisKey,pose?.result.layers.status,layerRetry]);
  // Restore inactive thumbnails without selecting or re-folding their paper.
  // The key excludes camera and caption changes so those do not restart work.
  useEffect(()=>{
    if(!active||libraryOpen||pdfOpen||editCP||confirmReplace||fileOpening||animationOpen||busy||layerAnalysing||!thumbnailLayerCandidateId||!thumbnailLayerCandidateKey)return;
    const id=thumbnailLayerCandidateId,key=thumbnailLayerCandidateKey,snapshot=projectRef.current,generation=fileGeneration.current;
    const preparation=startDiagramLayerDisplayPreparation(snapshot,{stepIds:[id]});let live=true;
    const fail=(text:string)=>{if(live&&mounted.current&&generation===fileGeneration.current)setThumbnailLayerErrors(previous=>new Map(previous).set(id,{key,message:text}));};
    void preparation.promise.then(prepared=>{
      if(!live||!mounted.current||generation!==fileGeneration.current||prepared.cancelled)return;
      const issue=prepared.issues.find(item=>item.stepId===id);
      if(issue){fail(issue.message);return;}
      const analysed=prepared.project.steps.find(item=>item.id===id)?.pose;
      if(!analysed){fail('未取得本步骤折图。');return;}
      const latest=projectRef.current,next=applyDiagramStepLayerAnalysis(latest,id,key,analysed.result);
      if(next!==latest){projectRef.current=next;setProject(next);}
      else if(diagramLayerDisplayState(latest,id).status!=='ready')fail('本步骤纸面已变化，请重新分析。');
    }).catch(cause=>fail('折图准备未完成：'+errorText(cause)));
    return()=>{live=false;preparation.cancel();};
  },[active,libraryOpen,pdfOpen,editCP,confirmReplace,fileOpening,animationOpen,busy,layerAnalysing,thumbnailLayerCandidateId,thumbnailLayerCandidateKey,projectGeneration]);
  useEffect(()=>{
    if(!active||libraryOpen||editCP||confirmReplace||fileOpening){svgPreparation.current?.cancel();svgPreparation.current=null;svgSaveController.current?.abort();setSVGExporting(false);}
  },[active,libraryOpen,editCP,confirmReplace,fileOpening]);
  useEffect(()=>()=>{svgPreparation.current?.cancel();svgSaveController.current?.abort();},[]);
  function retryLayerAnalysis(){if(pose?.spatial){void changeSpatialLayers({});return;}if(layerAnalysisKey)setLayerRetry(previous=>({key:layerAnalysisKey,revision:(previous?.revision??0)+1}));}
  async function changeSpatialLayers(options:SpatialLayerRequest){
    const p=projectRef.current,s=p.steps.find(item=>item.id===p.activeStepId),current=s?.pose;
    if(!s||!current?.spatial||busy||!activeRef.current||editCP||confirmReplace||fileOpening||layerAnalysing)return;
    const key=diagramLayerAnalysisKey(p,s.id);if(!key)return;
    stopLayerAnalysis.current?.();cancelTask();const request=++ticket.current,choice={key,face:options.layerAdjustment?.face??0,direction:options.layerAdjustment?.direction??'relative' as const};
    setLayerChoice(choice);setBusy({stepId:s.id,stateId:current.sourceStateId,kind:'layers'});setComputeMessage('正在求解共面纸层关系，保留当前立体姿态；可点击停止。');
    try{
      const history=p.steps.slice(0,p.steps.indexOf(s)).flatMap(item=>item.paperStates?.spatial?[item.paperStates.spatial]:item.paperStates?.flat?[item.paperStates.flat]:item.pose?[item.pose]:[]);
      const job=startDiagramSpatialLayerAdjustment(current,options,history);task.current=job;
      const answer=await job.promise;if(!mounted.current||ticket.current!==request)return;
      task.current=null;setBusy(null);setComputeMessage('');const latest=projectRef.current;
      if(diagramLayerAnalysisKey(latest,s.id)!==key){setLayerChoice(null);message('纸面已变化，本次层序结果未应用。');return;}
      commit(updateDiagramPoseResult(latest,s.id,answer.result,answer.spatial));setLayerChoice(null);message(answer.result.layers.message);
    }catch(error){if(mounted.current&&ticket.current===request){task.current=null;setBusy(null);setComputeMessage('');const text='层序未应用：'+errorText(error)+' 当前图示已保留。';setLayerChoice({...choice,error:text});message(text);}}
  }
  async function changeRelativeLayerConstraints(required:FlatLayerPreference[]){
    const p=projectRef.current,s=p.steps.find(item=>item.id===p.activeStepId),current=s?.pose;
    if(!s||!current||!activeRef.current||busy||editCP||confirmReplace||fileOpening||layerAnalysing)return;
    if(current.spatial){await changeSpatialLayers({relativeConstraints:required});return;}
    const key=diagramLayerAnalysisKey(p,s.id);
    if(!key||current.result.layers.status!=='solved')return;
    stopLayerAnalysis.current?.();cancelTask();
    const request=++ticket.current,choice={key,face:0,direction:'relative' as const};
    setLayerChoice(choice);setBusy({stepId:s.id,stateId:current.sourceStateId,kind:'layers'});
    setComputeMessage('正在求解指定纸面的上下关系；可点击停止，当前图示保留至求解通过。');
    try{
      const analysis=startFlatLayerReanalysis(current.result,{relativeConstraints:required,solutionIndex:0,timeoutMs:Infinity});
      task.current=analysis;const result=await analysis.promise;
      if(!mounted.current||ticket.current!==request)return;
      task.current=null;setBusy(null);setComputeMessage('');
      const latest=projectRef.current;
      if(diagramLayerAnalysisKey(latest,s.id)!==key){setLayerChoice(null);message('纸面或步骤已变化，本次上下关系未应用。');return;}
      const next=applyDiagramLayerSolution(latest,s.id,key,result,0,required);
      if(next===latest){
        if(result.layers.status==='solved'&&JSON.stringify(current.result.layers)===JSON.stringify(result.layers)){setLayerChoice({...choice,feedback:'当前层序已满足这些上下关系。'});return;}
        const error=`上下关系未应用：${result.layers.message} 当前图示与已保存关系已保留。`;
        setLayerChoice({...choice,error});message(error);return;
      }
      commit(next);setLayerChoice(null);message(required.length?'指定的上下关系已通过求解并保存。':'已移除上下关系，并重新求得有效层序。');
    }catch(error){
      if(mounted.current&&ticket.current===request){task.current=null;setBusy(null);setComputeMessage('');const text='上下关系未应用：'+errorText(error)+' 当前图示已保留。';setLayerChoice({...choice,error:text});message(text);}
    }
  }
  async function adjustLayerOrder(face:number,direction:'up'|'down'|'top'|'bottom'){
    const p=projectRef.current,s=p.steps.find(item=>item.id===p.activeStepId),current=s?.pose;
    if(!s||!current||!activeRef.current||busy||editCP||confirmReplace||fileOpening||layerAnalysing||!Number.isSafeInteger(face)||face<0||face>=current.result.geometry.faces.length)return;
    if(current.spatial){await changeSpatialLayers({layerAdjustment:{face,direction,side:poseView(current).side}});return;}
    const key=diagramLayerAnalysisKey(p,s.id);
    if(!key||current.result.layers.status!=='solved')return;
    stopLayerAnalysis.current?.();cancelTask();
    const request=++ticket.current;
    setLayerChoice({key,face,direction});setBusy({stepId:s.id,stateId:current.sourceStateId,kind:'layers'});
    const action={up:'上移',down:'下移',top:'置顶',bottom:'置底'}[direction];
    setComputeMessage(`正在查找纸面 F${face+1} 可${action}的有效层序，主图暂时保留当前解…`);
    try{
      const analysis=startFlatLayerReanalysis(current.result,{layerAdjustment:{face,direction,side:poseView(current).side},solutionIndex:requestedDiagramLayerSolutionIndex(current),constraints:current.result.layers.constraints,timeoutMs:Infinity});
      task.current=analysis;const result=await analysis.promise;
      if(!mounted.current||ticket.current!==request)return;
      task.current=null;setBusy(null);setComputeMessage('');
      const latest=projectRef.current;
      if(diagramLayerAnalysisKey(latest,s.id)!==key){setLayerChoice(null);message('纸面或步骤已变化，本次层序方案未应用。');return;}
      const index=result.layers.solutionIndex;
      if(result.layers.status==='solved'&&index===requestedDiagramLayerSolutionIndex(current)){
        setLayerChoice({key,face,direction,feedback:result.layers.message});message(result.layers.message);return;
      }
      const next=index===undefined?latest:applyDiagramLayerSolution(latest,s.id,key,result,index);
      if(next===latest){
        const error=result.layers.status==='solved'?'该方案与当前纸面不匹配，请重新分析层序。':`未能切换：${result.layers.message} 当前层序已保留。`;
        setLayerChoice({key,face,direction,error});message(error);return;
      }
      commit(next);setLayerChoice(null);
      message(`纸面 F${face+1} 已${action}，主图已更新为符合条件的层序。`);
    }catch(error){
      if(mounted.current&&ticket.current===request){
        task.current=null;setBusy(null);setComputeMessage('');
        const text='层序切换未完成：'+errorText(error)+' 当前层序已保留。';
        setLayerChoice({key,face,direction,error:text});message(text);
      }
    }
  }
  useEffect(()=>{
    const protect=(e:BeforeUnloadEvent)=>{if(library.hasPendingSave()||!manuallySavedProject.current||!sameDiagramProjectContent(projectWithPendingCaptions(),manuallySavedProject.current)){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);
  },[]);
  useEffect(()=>{if(!active){cancelTask();setEditCP(null);setConfirmReplace(null);setPDFOpen(false);cancelLibraryDeletion();}},[active]);
  useEffect(()=>{
    if(!active||!documentId)return;
    const id=documentId,check=()=>{
      if(documentIdRef.current!==id||saveConflictRef.current||library.hasPendingSave()||document.visibilityState==='hidden')return;
      try{if(library.hasExternalChanges(id))markSaveConflict();}catch{/* Existing storage-error flows preserve the local drawing. */}
    };
    const storage=(event:StorageEvent)=>{if(event.key===DIAGRAM_LIBRARY_KEY||event.key===null)check();};
    window.addEventListener('focus',check);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',check);
    const timer=setInterval(check,2000);check();
    return()=>{clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',check);};
  },[active,documentId,library]);
  useEffect(()=>{try{const index=library.migrateLegacy();setLibraryIndex(index);if(recovered.current&&!documentIdRef.current&&index.lastOpenId){documentIdRef.current=index.lastOpenId;setDocumentId(index.lastOpenId);}}catch(e){setLibraryError(errorText(e));}},[library]);
  useEffect(()=>{
    const pending=pendingNext.current;
    setLayerOrderEditing(false);setLayerOrderFace(undefined);
    setFixedHighlightShown(false);
    setSelection(emptySelection());setSelectedAnnotationIds([]);cancelTask();
    setFoldAction('fold');
    setFoldFaceCandidates([]);setFoldPickPoint(null);
    if(active&&pending?.stepId===step.id)void compute(pending.stateId,false,pending.history,false,pending);
  },[step.id]);
  // Browsing another step is a checkpoint. Ordinary edits stay in memory
  // until that explicit boundary; camera movement is excluded from content.
  const previousStepCheckpoint=useRef({id:step.id,generation:projectGeneration});
  useEffect(()=>{
    const previous=previousStepCheckpoint.current;
    previousStepCheckpoint.current={id:step.id,generation:projectGeneration};
    if(previous.generation!==projectGeneration||previous.id===step.id||libraryAction.current||deletingRef.current)return;
    void checkpointDraft(projectWithPendingCaptions());
  },[step.id,projectGeneration]);
  useEffect(()=>{
    if(saveConflictRef.current)return;
    const snapshot=projectWithPendingCaptions();
    if(!sameDiagramProjectContent(snapshot,checkpointProject.current))setStorageMessage('有未暂存修改 · 切换步骤或保存时写入');
    else setStorageMessage(!documentIdRef.current?'尚未保存到文档库':manuallySavedProject.current&&sameDiagramProjectContent(snapshot,manuallySavedProject.current)?'已保存到文档库':'草稿已暂存');
  },[project,draftTitle,draftDescription]);

  useEffect(()=>{
    if(!active)return;
    const key=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.isComposing||e.keyCode===229||document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]')||confirmReplace||fileOpening||pdfOpen||!(e.ctrlKey||e.metaKey))return;
      const name=e.key.toLowerCase();if(!['z','y','s','o'].includes(name))return;
      if(libraryOpen&&['z','y'].includes(name))return;
      if(['z','y'].includes(name)&&(e.target as Element)?.closest('input,textarea,select,[contenteditable="true"]'))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(name==='z')e.shiftKey?redo():undo();if(name==='y')redo();if(name==='s')save();if(name==='o')open();
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[active,libraryOpen,editCP,confirmReplace,fileOpening,pdfOpen,historyVersion]);

  function switchStep(id:string){flushFields();cancelTask();setEditCP(null);commit(selectDiagramStep(projectRef.current,id),false);setOverview(false);clearDrawingSelection();}
  function exchangeCP(stateId:string|null){
    if(busy||confirmReplace||fileOpening||animationOpen)return;
    flushFields();clearDrawingSelection();setOverview(false);setPropertiesOpen(false);setComparison(false);setEditCP(stateId);
  }
  function editSourceStep(stateId:string){
    const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!,access=getDiagramCPEditAccess(current,s.id,stateId);
    if(!access.ownerStepId)return;
    switchStep(access.ownerStepId);setEditCP(stateId);
    message('已切到来源步骤的操作后 CP；修改会同步到相邻步骤，原折图保留，来源变化后需重新计算。');
  }
  function unlockInitialCP(){
    const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!;
    if(current.steps[0].id!==s.id||busy)return;
    commit(updateDiagramFoldLink(current,s.id,{...(s.foldLink??defaultDiagramFoldLink()),enabled:false}));clearDrawingSelection();
    message('已停用本步 CP 联动，可编辑初始 CP；修改后请重新计算操作前 CP，再启用联动。原折图与操作后 CP 保留，可撤销。');
  }
  function deleteStep(){
    if(busy)return;
    flushFields();cancelTask();
    try{const current=projectRef.current,s=current.steps.find(s=>s.id===current.activeStepId)!,next=removeDiagramStep(current,s.id),cleared=next.steps.filter(st=>!st.pose&&current.steps.find(old=>old.id===st.id)?.pose).length;
      commit(next);setOverview(false);setTool('select');setSelection(emptySelection());setSelectedAnnotationIds([]);setCPHovered(null);setCPSelected(null);
      message('步骤已删除，CP 状态链已衔接，可撤销。'+(cleared?'来源 CP 已移除的折图需重新计算，原绘图标注已保留。':''));
    }catch(e){message(errorText(e));}
  }
  function hoverCP(stateId:string,hit:DiagramCPHit|null,point?:Point){queuePaperHover(hit?.kind==='face'?{kind:'cp',point}:null);setCPHovered(previous=>hit?(previous?.stateId===stateId&&previous.hit.kind===hit.kind&&previous.hit.index===hit.index?previous:{stateId,hit}):null);}
  function selectCP(stateId:string,hit:DiagramCPHit,point?:Point){
    setSelectedImageId(null);setFixedHighlightShown(false);setLayerScopeEditing(false);
    const state=projectRef.current.states.find(item=>item.id===stateId);
    let edge:DiagramCPEdgeGeometry|undefined;
    try{if(hit.kind==='edge'&&state){const segment=diagramCPEdgeSegment(state,hit.index);edge={a:segment.a,b:segment.b};}}catch{}
    setCPSelected({stateId,hit,point,...(edge?{edge}:{})});setSelectedAnnotationIds([]);setSelectedLineFaces({});setTab('drawing');setOverview(false);
    if(hit.kind==='edge')setTool('select');
  }
  function changeCPEdge(assignment:DiagramCPEdgeAssignment,action:'fold'|'precrease'='fold'){
    if(!cpSelected||cpSelected.hit.kind!=='edge'||busy)return;
    if(paperPulled){message('请切回平整状态或立体状态后再修改折痕。');return;}
    try{
      const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!;
      const source=current.states.find(item=>item.id===cpSelected.stateId)!,edge=diagramCPEdgeSegment(source,cpSelected.hit.index);
      const next=editDiagramCPEdge(current,s.id,source.id,cpSelected.hit.index,assignment,action);
      commit(next);
      const target=next.states.find(item=>item.id===s.afterId)!,index=findDiagramCPEdge(target,edge);
      if(index>=0)setCPSelected({stateId:target.id,hit:{kind:'edge',index},edge:{a:edge.a,b:edge.b},point:cpSelected.point});
      setSelectedAnnotationIds([]);
      message('操作后 CP 的此段已设为'+({V:'谷折',M:'峰折',F:'已有折痕'}[assignment])+(assignment!=='F'&&action==='precrease'?' · 预折后展开':'')+'，主图同步更新。');
    }catch(e){message(errorText(e));}
  }
  function resetDrawingSelection(){
    setSelectedCalloutId(null);
    setSelectedImageId(null);setSelection(emptySelection());setSelectedAnnotationIds([]);setSelectedLineFaces({});setCPSelected(null);setCPHovered(null);
    setFixedHighlightShown(false);setFoldFaceCandidates([]);setFoldPickPoint(null);setLayerScopeEditing(false);setLayerOrderFace(undefined);
  }
  function clearDrawingSelection(preserveLineTool=false){
    resetDrawingSelection();setCommandActivation(n=>n+1);
    if(!preserveLineTool||tool!=='line'&&tool!=='polyline')setTool('select');
    message('已取消选择和当前绘制操作。');
  }
  function fixCP(face:number,pick:typeof cpSelected=cpSelected){
    if(!pick||!pose||busy||paperPulled||stale)return;
    try{
      const current=projectRef.current,s=current.steps.find(s=>s.id===current.activeStepId)!,state=current.states.find(st=>st.id===pick.stateId)!;
      if(s.pose?.sourceStateId!==s.beforeId)throw new Error('请计算操作前 CP，再固定本步的纸面或顶点。');
      const beforeState=current.states.find(st=>st.id===s.beforeId)!;let next=current,config={...(s.foldLink??defaultDiagramFoldLink()),enabled:true};
      if(!s.foldLink?.enabled){next=updateDiagramFoldLink(next,s.id,config);const initialAfter=next.states.find(st=>st.id===s.afterId)!;next=diffDiagramFoldCP(beforeState.doc,initialAfter.doc).length?adoptDiagramFoldCP(next,s.id,initialAfter.doc):reconcileDiagramFoldAnnotations(next,s.id,s.annotations??[],config);config=next.steps.find(st=>st.id===s.id)!.foldLink!;}
      const afterState=next.states.find(st=>st.id===s.afterId)!,fixed=fixedDiagramCPSelection(s.pose,state,pick.hit,face,afterState.doc,pick.point,beforeState);
      const doc=setStartingFace(afterState.doc,diagramFoldStartingFace(afterState.doc,fixed));
      next=updateDiagramFoldLink(next,s.id,{...config,fixed});if(JSON.stringify(doc)!==JSON.stringify(afterState.doc))next=updateDiagramCP(next,afterState.id,doc);
      commit(next);setFixedHighlightShown(true);setTool('select');setFoldFaceCandidates([]);setFoldPickPoint(null);message(`${pick.hit.kind==='face'?'纸面 F':'顶点 V'}${pick.hit.index+1} 已固定，参考主图纸面 F${face+1}；下一步沿用其位置和朝向。`);
    }catch(e){message(errorText(e));}
  }
  function unfixCP(){
    if(busy)return;
    setFixedHighlightShown(false);
    try{const current=projectRef.current,s=current.steps.find(s=>s.id===current.activeStepId)!,{fixed:_fixed,...settings}=s.foldLink??defaultDiagramFoldLink();let next=updateDiagramFoldLink(current,s.id,settings);const state=next.states.find(st=>st.id===s.afterId)!,doc=clearStartingFace(state.doc);if(doc!==state.doc)next=updateDiagramCP(next,state.id,doc);commit(next);message('已取消固定，可重新选择纸面或顶点。');}catch(e){message(errorText(e));}
  }
  async function nextStep(){
    if(busy)return;
    flushFields();cancelTask();
    let stage='validate';const request=++ticket.current;
    recordActivity('diagram.next.start',{count:projectRef.current.steps.findIndex(s=>s.id===projectRef.current.activeStepId)+1,stage});
    try{
      const current=projectRef.current,currentStep=current.steps.find(s=>s.id===current.activeStepId)!,source=current.states.find(s=>s.id===currentStep.afterId)!;
      const basis=current.states.find(state=>state.id===currentStep.beforeId)!;
      const returnTarget=getDiagramReturnTarget(current,currentStep.id);
      if(!returnTarget&&hasCPSourceBindings(currentStep)&&currentStep.pose&&(currentStep.pose.sourceStateId!==basis.id||currentStep.pose.sourceRevision!==basis.revision))throw Error('操作前 CP 已变化，请重新计算操作前 CP 后再进入下一步。');
      // Next reads the existing CP; its permission is independent of the
      // editing lock on a pulled illustration. Source freshness is still checked.
      if(currentStep.foldLink?.enabled&&!currentStep.simulationSurface&&!returnTarget&&!isDiagramPaperPulled(currentStep)){const access=getDiagramCPEditAccess(current,currentStep.id,source.id);if(!access.editable)throw Error(access.reason);}
      if(returnTarget){
        stage='return-step';
        const next=advanceDiagramReturnStep(current),number=current.steps.findIndex(candidate=>candidate.id===returnTarget.id)+1;
        pendingNext.current=null;setEditCP(null);commit(next);setOverview(false);setTool('select');setSelection(emptySelection());
        recordActivity('diagram.next.success',{stage,count:next.steps.findIndex(candidate=>candidate.id===next.activeStepId)+1,target:number});
        message(`已进入下一步，恢复第 ${number} 步的聚合状态；期间产生的折痕已保留为已有折痕。`);
        return;
      }
      setEditCP(null);
      if(currentStep.foldLink?.enabled&&!currentStep.simulationSurface){
        stage='cp-source';
        const beforeState=current.states.find(s=>s.id===currentStep.beforeId)!;
        if(!currentStep.pose||currentStep.pose.sourceStateId!==beforeState.id)throw new Error('请先计算操作前 CP 再执行本步折叠。');
        // The after CP is authoritative for the next solve. Generating an
        // unused drawing overlay here made its preview budget block Next.
        // Source revisions are checked above; normalization and the full fold
        // calculation below retain their geometry/topology validation.
      }
      const beforeState=current.states.find(s=>s.id===currentStep.beforeId)!;
      setBusy({stepId:currentStep.id,stateId:source.id,kind:'fold'});
      const {cleaned,activeFold}=await geometry('prepare',[beforeState.doc,source.doc],request,'正在整理操作后 CP，准备进入下一步…');
      if(projectRef.current!==current)throw Error('工程在准备期间发生变化，请重试下一步。');
      if(currentStep.foldLink?.enabled&&!currentStep.simulationSurface&&activeFold&&!currentStep.foldLink.fixed){recordActivity('diagram.next.wait',{stage:'fixed-side',result:'requires-fixed-side'});setTab('drawing');setTool('fixed');message('请在主图点选本次保持不动的部分，再进入下一步。');return;}
      stage='step-chain';
      const base=cleaned.changed?updateDiagramCP(current,source.id,cleaned.doc):current;
      let next=advanceDiagramStep(base);
      const created=next.steps.length>current.steps.length;
      if(!next.steps.find(item=>item.id===next.activeStepId)?.pose&&currentStep.pose&&!currentStep.simulationSurface&&
          JSON.stringify(currentStep.pose.sourceDoc)===JSON.stringify(cleaned.doc))next=inheritDiagramCurrentPose(next,currentStep.id,next.activeStepId);
      const target=next.steps.find(s=>s.id===next.activeStepId)!,origin=next.states.find(s=>s.id===target.pose?.sourceStateId);
      const needsFold=!target.simulationSurface&&(!target.pose||target.pose.result.geometry.status!=='ready'||target.pose.sourceRevision!==origin?.revision||!!currentStep.foldLink?.enabled&&target.pose.sourceStateId!==target.beforeId);
      if(needsFold){
        let inheritedFixed=currentStep.foldLink?.enabled?currentStep.foldLink.fixed:undefined;
        if(!inheritedFixed&&!activeFold&&currentStep.pose&&!isDiagramPaperPulled(currentStep)&&!await geometry('activeFold',[currentStep.pose.sourceDoc,cleaned.doc],request,'正在核对预折材料…'))inheritedFixed=await geometry('anchor',[currentStep.pose,cleaned.doc],request,'正在定位预折后的固定纸面…');
        pendingNext.current={stepId:target.id,stateId:target.beforeId,history:!created,fixed:inheritedFixed,view:getDiagramStepInitialView(next,target.id),sourcePose:currentStep.pose??undefined,sourceFixed:currentStep.foldLink?.enabled?currentStep.foldLink.fixed:undefined};
      }
      commit(next,created||cleaned.changed);setOverview(false);setTool('select');setSelection(emptySelection());
      recordActivity('diagram.next.success',{stage:needsFold?'pending-fold':'existing-pose',count:next.steps.findIndex(s=>s.id===target.id)+1});
      message(needsFold?'已进入下一步，正在根据上一操作后 CP 生成平折图。':'已进入下一步，保留本步已有折图。');
    }catch(e){if(!mounted.current||ticket.current!==request)return;pendingNext.current=null;recordActivity('diagram.next.error',{stage,reason:errorText(e)},'error');message(errorText(e));}
    finally{if(mounted.current&&ticket.current===request){task.current=null;setBusy(null);setComputeMessage('');}}
  }
  function applyCP(stateId:string,next:Doc,warnings:string[]=[]):boolean{try{
    const current=projectRef.current,currentStep=current.steps.find(s=>s.id===current.activeStepId)!,access=getDiagramCPEditAccess(current,currentStep.id,stateId);
    if(!access.editable)throw Error(access.reason);
    const cleaned=normalizeDiagramCP(next),updated=applyDiagramCPEdit(current,currentStep.id,stateId,cleaned.doc);
    cancelTask();commit(updated);clearDrawingSelection();
    message('CP 已更新'+(stateId===currentStep.afterId&&currentStep.foldLink?.enabled?'，主图折痕已同步。':'，已有折图保留；来源变化的步骤请重新计算。')+[...cleaned.warnings,...warnings].join(''));return true;
  }catch(e){message(errorText(e));return false;}}
  function updateAfterCreases(){
    flushFields();cancelTask();
    try{
      const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!,source=current.states.find(state=>state.id===s.beforeId)!;
      if(isDiagramPaperPulled(s))throw Error('请切回平整状态或立体状态后更新主图折痕。');
      if(!s.pose||s.pose.sourceStateId!==source.id||s.pose.sourceRevision!==source.revision)throw Error('请先计算操作前 CP，再更新主图折痕。');
      commit(updateDiagramFoldDrawingFromCP(current,s.id));clearDrawingSelection();
      message('操作后 CP 的新增与修改折痕已更新到主图；纸张姿态保留，下一步再计算折后结果。');
    }catch(e){message(errorText(e));}
  }
  function adoptCurrent(stateId:string){
    if(paperPulled){message('请切回平整状态或立体状态后再采用新的 CP 模型。');return;}
    if(!model?.result.geometry.vertices.length||model.result.geometry.status!=='ready'){message('折痕编辑区还没有可采用的平折模型。');return;}
    cancelTask();try{
      const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!,access=getDiagramCPEditAccess(current,s.id,stateId);
      if(!access.editable)throw Error(access.reason);
      const cleaned=normalizeDiagramCP(model.doc);
      let next=applyDiagramCPEdit(current,s.id,stateId,cleaned.doc);
      // A linked step always keeps its before pose as the mapping basis.
      if(s.foldLink?.enabled&&stateId===s.afterId){commit(next);clearDrawingSelection();message('操作后 CP 已采用，主图折痕同步；操作前纸面姿态保留。');return;}
      if(cleaned.changed){commit(next);setSelection(emptySelection());message('来源 CP 已自动整理，正在重新计算本步折图。');void compute(stateId);return;}
      next=adoptDiagramPose(next,s.id,stateId,model.result);
      if(stateId===s.beforeId&&hasCPSourceBindings(s)&&s.pose&&(s.pose.sourceStateId!==stateId||s.pose.sourceRevision!==next.states.find(state=>state.id===stateId)!.revision))next=adoptDiagramFoldCP(next,s.id,next.states.find(state=>state.id===s.afterId)!.doc);
      commit(next);setSelection(emptySelection());message('已将当前平折模型及其来源 CP 复制到本步骤。');
    }catch(e){message(errorText(e));}
  }
  function regenerateCleanPose(){
    if(busy)return;
    if(paperPulled){message('请切回平整状态或立体状态后再整理来源 CP。');return;}
    flushFields();
    const current=projectRef.current.steps.find(item=>item.id===projectRef.current.activeStepId)?.pose;
    if(!current){message('请先为本步骤生成折图。');return;}
    if(!projectRef.current.states.some(state=>state.id===current.sourceStateId)){message('折图来源 CP 不存在，无法重新生成。');return;}
    void compute(current.sourceStateId,false,true,true);
  }
  async function changeSpatialCamera(camera:DiagramSpatialPose['camera']):Promise<boolean>{
    if(busy||paperPulled||stale)return false;
    flushFields();cancelTask();
    const original=projectRef.current,s=original.steps.find(item=>item.id===original.activeStepId)!,snapshot=s.pose;
    if(!snapshot?.spatial)return false;
    if(sameSpatialCamera(snapshot.spatial.camera,camera))return true;
    const request=++ticket.current,generation=fileGeneration.current;
    const history=original.steps.slice(0,original.steps.findIndex(item=>item.id===s.id)+1).flatMap(item=>item.paperStates?.spatial?[item.paperStates.spatial]:item.paperStates?.flat?[item.paperStates.flat]:item.pose?[item.pose]:[]);
    if(history.at(-1)!==snapshot)history.push(snapshot);
    let answer:Awaited<ReturnType<typeof startDiagramSpatialReprojection>['promise']>|undefined;
    try{
      const job=startDiagramSpatialReprojection(snapshot,camera,history);
      const pending:FlatFoldTask={promise:job.promise.then(value=>{answer=value;return value.result;}),cancel:job.cancel};
      task.current=pending;setBusy({stepId:s.id,stateId:snapshot.sourceStateId,kind:'camera'});setComputeMessage('正在确认新视角下的纸面遮挡，折角保持不变…');
      await pending.promise;
      if(!mounted.current||ticket.current!==request)return false;
      task.current=null;setBusy(null);setComputeMessage('');
      const latest=projectRef.current,current=latest.steps.find(item=>item.id===s.id);
      if(generation!==fileGeneration.current||latest.activeStepId!==s.id||current?.pose!==snapshot){message('工程或纸面已变化，未应用旧视角。');return false;}
      const next=applyDiagramSpatialCamera(latest,s.id,answer!);
      commit(next);resetDrawingSelection();
      message('视角已保存，折痕角度与固定纸面保持不变。');return true;
    }catch(error){
      if(mounted.current&&ticket.current===request){task.current=null;setBusy(null);setComputeMessage('');message('视角未更新，已保留原视角。'+errorText(error));}
      return false;
    }
  }
  async function compute(stateId:string,reanalyse=false,history=true,preserveView=false,inherit?:{fixed?:DiagramFoldLinkSettings['fixed'];view?:ModelViewState;sourcePose?:DiagramPose;sourceFixed?:DiagramFoldLinkSettings['fixed']},camera?:DiagramSpatialPose['camera'],mode?:'flat'|'spatial'){
    cancelTask();let p=projectRef.current,state=p.states.find(item=>item.id===stateId);
    if(!state){message('找不到本次计算的 CP 状态。');return;}
    const operation=reanalyse?'layers':'fold';
    recordActivity('diagram.compute.start',{stage:operation,count:p.steps.findIndex(s=>s.id===p.activeStepId)+1,segments:state.doc.segments.length});
    if(!reanalyse){const preparationRequest=++ticket.current;setBusy({stepId:p.activeStepId,stateId,kind:'fold'});try{
      const cleaned=await geometry('normalize',[state.doc],preparationRequest,'正在整理本步 CP…');
      if(projectRef.current!==p)throw Error('工程在准备期间发生变化，请重新计算。');
      if(cleaned.changed){p=updateDiagramCP(p,stateId,cleaned.doc);commit(p,history);state=p.states.find(item=>item.id===stateId)!;}
    }catch(e){if(mounted.current&&ticket.current===preparationRequest){task.current=null;setBusy(null);setComputeMessage('');recordActivity('diagram.compute.error',{stage:'normalize-cp',reason:errorText(e)},'error');message(errorText(e));}return;}}
    const s=p.steps.find(item=>item.id===p.activeStepId)!;
    if(mode==='spatial'&&!hasNonFlatFoldAngles(state.doc)){task.current=null;setBusy(null);setComputeMessage('');message('折痕角度均为 0° 或 180°，请使用平整状态。');return;}
    let fixed=!reanalyse?(inherit?.fixed??(stateId===s.afterId&&s.foldLink?.enabled?s.foldLink.fixed:undefined)):undefined;
    if(mode==='flat'&&fixed?.spatialTransform)fixed=undefined;
    const request=++ticket.current,revision=state.revision,snapshot=s.pose;
    try{
      // A view lock also preserves the material frame when the same folds are
      // solved again; a different default root must not turn the saved drawing.
      // Restoring a legacy pulled illustration deliberately replaces its shape.
      setBusy({stepId:s.id,stateId,kind:reanalyse?'layers':'fold'});
      if(!reanalyse&&!fixed&&s.orientationLocked&&snapshot&&!isDiagramPaperPulled(s)&&!await geometry('activeFold',[snapshot.sourceDoc,state.doc],request,'正在核对固定侧折痕…'))fixed=await geometry('anchor',[snapshot,state.doc],request,'正在定位保持不动的纸面…');
      const origin=reanalyse&&snapshot?null:fixed?{face:diagramFoldStartingFace(state.doc,fixed),stale:false}:resolveStartingFace(state.doc,buildDiagramFold(state.doc).graph),sourceWarning=origin?.stale?'原起始面设置已失效，本次采用默认起始面。':'';
      let spatial:DiagramSpatialPose|undefined;
      const spatialMode=mode?mode==='spatial':reanalyse&&snapshot?!!snapshot.spatial:hasSpatialFoldAngles(state.doc)||!!snapshot?.spatial||!!inherit?.sourcePose?.spatial;
      const nextTask:FlatFoldTask=spatialMode?(()=>{
        const root=origin?.face??snapshot?.result.geometry.startingFace??0;
        const stationary=fixed??(snapshot?.spatial?{point:[0,0] as Point,matrix:[1,0,0,1,0,0] as import('../app/diagramFoldLinkTypes').DiagramFoldMatrix,spatialTransform:snapshot.spatial.faceTransforms[root]}:undefined);
        const previous=inherit?.sourcePose??snapshot??undefined,history=p.steps.slice(0,p.steps.findIndex(step=>step.id===s.id)+1).flatMap(step=>step.paperStates?.spatial?[step.paperStates.spatial]:step.paperStates?.flat?[step.paperStates.flat]:step.pose?[step.pose]:[]);
        if(previous&&history.at(-1)!==previous)history.push(previous);
        const job=startDiagramSpatialPose([state!.doc,root,stationary,previous,hasNonFlatFoldAngles(state!.doc)?camera??previous?.spatial?.camera??spatialCamera:DEFAULT_DIAGRAM_SPATIAL_CAMERA],history);
        return {promise:job.promise.then(answer=>{spatial=hasNonFlatFoldAngles(state!.doc)?answer.spatial:undefined;return answer.result;}),cancel:job.cancel};
      })():reanalyse&&snapshot?startFlatLayerReanalysis(snapshot.result,{timeoutMs:Infinity,solutionIndex:requestedDiagramLayerSolutionIndex(snapshot),constraints:snapshot.result.layers.constraints}):startFlatFold(state.doc,{flatCreases:'marks',solutionIndex:0,startingFace:origin?.face??0,timeoutMs:Infinity,onProgress:r=>{if(mounted.current&&ticket.current===request)setComputeMessage(sourceWarning+r.geometry.message);}});
      task.current=nextTask;setBusy({stepId:s.id,stateId,kind:reanalyse?'layers':'fold'});setComputeMessage(spatialMode?'正在按设定折角构建空间纸面并确认遮挡…':reanalyse?'正在分析修改后模型的遮挡关系…':sourceWarning+'正在构建平折几何…');
      let result=await nextTask.promise;
      if(!spatialMode&&mounted.current&&ticket.current===request&&fixed&&result.geometry.status==='ready'){
        result=await geometry('align',[state.doc,result,fixed],request,'正在对齐固定侧纸面…');
        if(result.layers.status==='unknown'){
          const layerTask=startFlatLayerReanalysis(result,{timeoutMs:Infinity,solutionIndex:0});task.current=layerTask;setComputeMessage('已保持固定侧，正在确认折后纸层顺序…');result=await layerTask.promise;
        }
      }
      let layerInheritance='';
      if(!spatialMode&&mounted.current&&ticket.current===request&&inherit?.sourcePose&&result.geometry.status==='ready'){
        const initial=result;
        try{
          const preferences=await geometry('preferences',[inherit.sourcePose,state.doc,result],request,'正在匹配未改动纸面的层序…');
          if(preferences.length){
            const candidate=startFlatLayerReanalysis(result,{solutionIndex:0,layerPreferences:preferences,constraints:result.layers.constraints,timeoutMs:Infinity});
            task.current=candidate;setComputeMessage('正在沿用未改动纸面的上下关系，核对本步合法层序…');
            const answer=await candidate.promise;
            if(answer.layers.status==='solved'){
              result=answer;layerInheritance=answer.warnings.find(warning=>warning.startsWith('[纸层继承]'))?.replace(/^\[纸层继承\]\s*/,'')??'已沿用未改动纸面的纸层顺序。';
            }else layerInheritance='原纸层偏好未能确认，已保留本步计算结果。'+answer.layers.message;
          }
        }catch(cause){
          layerInheritance='纸层偏好未能继承，已保留本步计算结果。'+errorText(cause);
        }
        if(layerInheritance&&result===initial)result={...result,warnings:[...result.warnings,'[纸层继承] '+layerInheritance]};
      }
      if(!mounted.current||ticket.current!==request)return;
      task.current=null;setBusy(null);setComputeMessage('');
      const latest=projectRef.current,current=latest.steps.find(item=>item.id===s.id),cp=latest.states.find(item=>item.id===stateId);
      if(latest.activeStepId!==s.id||cp?.revision!==revision||!current||(reanalyse&&current.pose!==snapshot)){message('计算来源已变化，未覆盖当前折图。');return;}
      if(result.geometry.status!=='ready'||!result.geometry.vertices.length){recordActivity('diagram.compute.error',{stage:'fold-geometry',status:result.geometry.status,reason:result.geometry.message},'error');message(sourceWarning+result.geometry.message);return;}
      const completed=sourceWarning?{...result,warnings:[...result.warnings,sourceWarning]}:result;
      let next=reanalyse?updateDiagramPoseResult(latest,s.id,completed,spatial):adoptDiagramPose(latest,s.id,stateId,completed,inherit?.view??{...getDiagramStepInitialView(latest,s.id),cameras:{}},spatial);
      if(preserveView&&current.pose&&!reanalyse)next=updateDiagramPoseView(next,s.id,{...poseView(current.pose),cameras:{}});
      const linkedStep=next.steps.find(st=>st.id===s.id)!,sourceChanged=!!current.pose&&(current.pose.sourceStateId!==stateId||current.pose.sourceRevision!==revision);
      const hasLinkedDrawing=hasCPSourceBindings(linkedStep);
      if(stateId===s.beforeId&&hasLinkedDrawing){
        if(!reanalyse&&linkedStep.foldLink){const {fixed:_oldFixed,...settings}=linkedStep.foldLink;next=updateDiagramFoldLink(next,s.id,{...settings,selectedFaces:sourceChanged?[]:settings.selectedFaces});setFoldFaceCandidates([]);setFoldPickPoint(null);}
        try{
          if(sourceChanged||linkedStep.foldLink?.enabled){
            const selected=next.steps.find(st=>st.id===s.id)!,beforeCP=next.states.find(st=>st.id===s.beforeId)!,afterCP=next.states.find(st=>st.id===s.afterId)!;
            setBusy({stepId:s.id,stateId,kind:'fold'});
            if(sourceChanged){
              const answer=await geometry('adoptCP',[selected,beforeCP,afterCP],request,'正在同步当前步骤的折痕…');
              if(answer.changed)next=updateDiagramCP(next,afterCP.id,answer.doc);
              next=updateDiagramFoldLink(updateDiagramAnnotations(next,s.id,answer.annotations),s.id,answer.settings);
            }else{
              const annotations=await geometry('refresh',[selected,beforeCP,afterCP,reanalyse],request,'正在生成当前步骤的折痕显示…');
              next=updateDiagramAnnotations(next,s.id,annotations);
            }
          }
        }
        catch(cause){
          if(!mounted.current||ticket.current!==request)return;
          const settings=next.steps.find(st=>st.id===s.id)!.foldLink??defaultDiagramFoldLink();
          const {fixed:_fixed,generated:_generated,...rest}=settings;
          task.current=null;setBusy(null);setComputeMessage('');
          next=updateDiagramFoldLink(next,s.id,{...rest,enabled:false,selectedFaces:[]});commit(next,history);clearDrawingSelection();
          recordActivity('diagram.compute.error',{stage:'cp-sync',result:'link-disabled',reason:errorText(cause)},'error');
          message('折图已重新计算；CP 联动暂已停用，请检查操作后 CP 后再启用。'+errorText(cause));return;
        }
      }
      let fixedInheritance='';
      const completedStep=next.steps.find(st=>st.id===s.id)!;
      if(inherit?.sourcePose&&inherit.sourceFixed&&!completedStep.foldLink?.fixed&&completedStep.pose){
        setBusy({stepId:s.id,stateId,kind:'fold'});
        const inherited=await geometry('fixed',[inherit.sourcePose,completedStep.pose,inherit.sourceFixed,completedStep.afterId,next.states.find(st=>st.id===completedStep.afterId)!.doc],request,'正在核对固定纸面的继承…');
        if(inherited){next=updateDiagramFoldLink(next,s.id,{...(completedStep.foldLink??defaultDiagramFoldLink()),fixed:inherited});fixedInheritance='已沿用未改动的固定纸面。';}
        else fixedInheritance='原固定纸面已变化，请重新选择固定侧。';
      }
      // Layer analysis updates only the active snapshot; it never changes the paper state.
      if(!reanalyse)next=retainDiagramPaperStates(next,s.id,current);
      task.current=null;setBusy(null);setComputeMessage('');commit(next,history);
      recordActivity(result.layers.status==='solved'?'diagram.compute.success':'diagram.compute.result',{stage:operation,status:result.layers.status,count:result.geometry.faces.length,...(result.layers.status!=='solved'?{reason:result.layers.message}:{})},result.layers.status==='solved'?'info':'warning');
      setSelection(emptySelection());message(sourceWarning+(spatial?'本步空间姿态已生成，纸面实际停在设定折角。':result.layers.status==='solved'?(result.layers.faceOrder?.length===result.geometry.faces.length?'本步平折计算完成。':'本步平折几何已生成，层序按局部区域确定。'):result.layers.message||'已取得平折几何，层序尚未确认。')+layerInheritance+fixedInheritance);
    }catch(e){if(mounted.current&&ticket.current===request){setBusy(null);task.current=null;setComputeMessage('');recordActivity('diagram.compute.error',{stage:operation,reason:errorText(e)},'error');message(errorText(e));}}
  }
  function move(selection:FoldedVertexSelection,destination:Point,view?:ModelViewState,editPose?:DiagramPose){
    const p=projectRef.current,s=p.steps.find(item=>item.id===p.activeStepId)!;if(!s.pose)return;
    try{
      if(s.paperStates?.spatial&&s.paperStates.active==='flat')throw Error('已有立体状态，请先切换到立体状态再拖角。');
      const previous=editPose??s.pose;
      if(previous.result!==s.pose.result||previous.sourceStateId!==s.pose.sourceStateId||previous.sourceRevision!==s.pose.sourceRevision)throw Error('拖角期间纸面已变化，请重新选择这个点。');
      const moved=moveDiagramPaperVertices(previous,selection,destination);if(moved===previous)return;
      let next=updateDiagramPaperPose(p,s.id,moved);
      if(view)next=updateDiagramPoseView(next,s.id,view);
      const nextPose=next.steps.find(st=>st.id===s.id)!.pose!;
      next=updateDiagramAnnotations(next,s.id,followDiagramPaperAnnotations(previous,nextPose,s.annotations??[]));
      // A drawing-only pull does not move the operation's fixed material face.
      if(s.foldLink?.enabled)next=refreshDiagramFoldDrawing(next,s.id);
      next=recordDiagramPaperPull(next,s.id,previous,s.annotations??[]);
      commit(next);setSelectedAnnotationIds([]);
      const first=selection.selected[0];if(first!==undefined)setSelection({...selectFoldedVertex(diagramPaperVertices(moved),emptySelection(),first,'folded'),selected:[...selection.selected]});
      message('纸角与纸面折线已一起更新；模型层序需要重新分析。');
    }catch(e){message(errorText(e));}
  }
  async function restoreLegacyPaper(){
    const p=projectRef.current,s=p.steps.find(st=>st.id===p.activeStepId)!;if(!s.pose||busy)return;
    const pulled=structuredClone(s.pose),oldAnnotations=structuredClone(s.annotations??[]);
    await compute(s.pose.sourceStateId,false,true,true);
    const latest=projectRef.current,current=latest.steps.find(st=>st.id===s.id),flat=current?.pose;
    if(latest.activeStepId!==s.id||!flat||flat===s.pose||flat.sourceStateId!==pulled.sourceStateId||flat.sourceRevision!==pulled.sourceRevision||JSON.stringify(flat.sourceDoc)!==JSON.stringify(pulled.sourceDoc))return;
    try{const marks=followDiagramPaperAnnotations(pulled,flat,oldAnnotations);commit(initializeDiagramPaperStates(latest,s.id,flat,pulled,'flat',marks),false);setTool('select');setSelectedAnnotationIds([]);message('已恢复平整状态，可以编辑折痕；上次拖角造型已保留。');}catch(e){message(errorText(e));}
  }
  function switchPaperState(state:'flat'|'spatial'|'pulled'){
    if(busy)return;flushFields();
    if(state==='spatial'&&!hasNonFlatFoldAngles(pose?.sourceDoc??before.doc)){message('折痕角度均为 0° 或 180°，请使用平整状态。');return;}
    if(state==='pulled'&&!step.paperStates?.pulled){
      if(step.paperStates?.spatial&&step.paperStates.active==='flat'){commit(switchDiagramPaperState(projectRef.current,step.id,'spatial'));}
      chooseTool('vertex');message('拖动画布上的纸角，保存拖角状态。');return;
    }
    if(!step.paperStates?.[state]||state==='flat'&&!isDiagramPaperPoseIsometric(step.paperStates.flat!)){
      if(state==='flat'&&paperPulled&&!step.paperStates){void restoreLegacyPaper();return;}
      if(state!=='pulled')void compute(pose?.sourceStateId??before.id,false,true,true,undefined,undefined,state);return;
    }
    if(step.paperStates.active===state){if(state==='pulled')chooseTool('vertex');return;}
    try{commit(switchDiagramPaperState(projectRef.current,step.id,state));chooseTool(state==='pulled'?'vertex':'select');setSelection(emptySelection());setSelectedAnnotationIds([]);message(state==='pulled'?'已恢复拖角造型，可继续拖动画布上的纸角。':state==='spatial'?'已切换到立体状态，可在此状态上拖角。':'已切换到平整状态。');}catch(e){message(errorText(e));}
  }
  function updateView(view:ModelViewState){
    const current=projectRef.current,target=current.steps.find(item=>item.id===step.id);if(!target?.pose)return;
    try{
      const {cameras:previousCameras,...previousAppearance}=target.pose.view??defaultModelView(),{cameras,...appearance}=view;
      const viewportOnly=JSON.stringify(previousAppearance)===JSON.stringify(appearance);
      commit(viewportOnly?updateDiagramPoseViewport(current,step.id,cameras):updateDiagramPoseView(current,step.id,view),false);
    }catch(e){message(errorText(e));}
  }
  function updateLayerVisibility(hiddenFaces:number[]){
    if(!pose||busy)return;
    try{
      if(selectedTearWindow){
        const current=projectRef.current,currentStep=current.steps.find(item=>item.id===step.id)!;
        const hidden=[...new Set(hiddenFaces)].filter(face=>Number.isInteger(face)&&face>=0&&face<pose.result.geometry.faces.length).sort((a,b)=>a-b);
        // Local visibility is illustration data. Do not reapply any linked
        // crease or change the pose's whole-paper visibility preferences.
        commit(updateDiagramAnnotations(current,step.id,(currentStep.annotations??[]).map(annotation=>annotation.id===selectedTearWindow.id?{...annotation,cutawayFaces:hidden}:annotation)));
      }else commit(updateDiagramHiddenFaces(projectRef.current,step.id,hiddenFaces));
      setCPHovered(null);
    }
    catch(e){message(errorText(e));}
  }
  function toggleLayerVisibility(face:number){
    const current=projectRef.current.steps.find(item=>item.id===step.id)?.pose;
    if(!current)return;
    if(selectedTearWindow&&current.hiddenFaces?.includes(face))return;
    const hidden=new Set(selectedTearWindow?selectedTearWindow.cutawayFaces??[]:current.hiddenFaces??[]);if(hidden.has(face))hidden.delete(face);else hidden.add(face);
    updateLayerVisibility([...hidden]);
  }
  function applyAnnotations(next:DiagramAnnotation[],convertExisting=false,scopeAlreadyIsolated=false):boolean {
    const newZoom=next.find((annotation):annotation is DiagramSymbolAnnotation=>annotation.kind==='symbol'&&annotation.symbol==='zoom'&&!annotation.zoomArea&&!annotations.some(old=>old.id===annotation.id&&old.kind==='symbol'&&old.symbol==='zoom'));
    if(newZoom){
      const original=new Map(annotations.map(annotation=>[annotation.id,annotation]));
      const added=!original.has(newZoom.id),singleChange=next.length===annotations.length+(added?1:0)&&next.every(annotation=>annotation.id===newZoom.id||original.get(annotation.id)===annotation||JSON.stringify(original.get(annotation.id))===JSON.stringify(annotation));
      // Multi-object copies stay a complete transaction; an old unconfigured
      // glyph can be configured from its selection panel afterwards.
      if(singleChange){openZoomSelection(newZoom,added);return true;}
    }
    if(!paperVisible){
      // Artwork annotations never become physical folds or replace saved CP lines.
      const current=projectRef.current,s=current.steps.find(item=>item.id===step.id)!,old=s.annotations??[];
      const physical=old.filter(annotation=>!isDiagramImageAnnotationVisible(annotation));
      const oldIds=new Set(old.map(annotation=>annotation.id)),artworkIds=new Set(old.filter(isDiagramImageAnnotationVisible).map(annotation=>annotation.id));
      const drawing=next.map(annotation=>annotation.kind==='line'&&(!oldIds.has(annotation.id)||artworkIds.has(annotation.id))?{...annotation,foldFaces:[]}:annotation).filter(isDiagramImageAnnotationVisible);
      try{commit(updateDiagramAnnotations(current,step.id,[...physical,...drawing]));return true;}catch(error){message(errorText(error));return false;}
    }
    if(paperPulled&&JSON.stringify(next.filter(a=>a.kind==='line'))!==JSON.stringify(annotations.filter(a=>a.kind==='line'))){message('请切回平整状态或立体状态后再添加、修改或删除折痕。');return false;}
    if(!convertExisting&&annotations.filter(isExistingCrease).some(a=>{
      const changed=next.find(item=>item.id===a.id);
      return !changed||changed.kind!=='line'||JSON.stringify([a.a,a.b,a.style,a.foldFaces])!==JSON.stringify([changed.a,changed.b,changed.style,changed.foldFaces]);
    })){message('已有折痕来自操作前 CP；选中后可沿此痕谷折或峰折。修改原折痕请编辑 CP。');return false;}
    try{
      if(!scopeAlreadyIsolated)next=isolateDiagramLineEdits(annotations,next,selectedLineFaces);
      const current=projectRef.current,s=current.steps.find(item=>item.id===step.id)!,settings=s.foldLink??defaultDiagramFoldLink(),oldIds=new Set((s.annotations??[]).map(item=>item.id));
      const addedFold=next.some(a=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain')&&!oldIds.has(a.id));
      const config=addedFold&&settings.layers==='selected'&&!settings.selectedFaces.length?{...settings,layers:'top' as const}:undefined;
      const previousF=annotations.filter(isExistingCrease),nextF=next.filter(isExistingCrease);
      const linked=(values:DiagramAnnotation[])=>values.filter(a=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain'));
      const styleOnly=!convertExisting&&JSON.stringify(linked(annotations))===JSON.stringify(linked(next))&&JSON.stringify(previousF)!==JSON.stringify(nextF);
      const withoutWindows=(values:DiagramAnnotation[])=>values.filter(a=>a.kind!=='symbol'||a.symbol!=='tearWindow');
      const windowOnly=JSON.stringify(withoutWindows(annotations))===JSON.stringify(withoutWindows(next));
      commit(styleOnly||windowOnly?updateDiagramAnnotations(current,step.id,next):reconcileDiagramFoldAnnotations(current,step.id,next,config));return true;
    }catch(e){message(errorText(e));return false;}
  }
  function chooseFoldAction(action:NonNullable<DiagramLineAnnotation['foldAction']>){
    if(!paperVisible){setFoldAction(action);chooseTool('line');message('图片上的折线仅作标注，不修改 CP。');return;}
    if(busy||paperPulled)return;
    try{
      if(action==='precrease'){
        if(!pose||pose.sourceStateId!==before.id||stale)throw Error('请先计算操作前 CP，再绘制预折痕。');
        if(!foldLink.enabled){
          const config={...foldLink,enabled:true},current=projectRef.current;
          const enabled=updateDiagramFoldLink(current,step.id,config);
          commit(diffDiagramFoldCP(before.doc,after.doc).length?adoptDiagramFoldCP(enabled,step.id,after.doc):reconcileDiagramFoldAnnotations(enabled,step.id,annotations,config));
        }
      }
      setFoldAction(action);if(lineStyle!=='valley'&&lineStyle!=='mountain')chooseLine('valley');else chooseTool('line');
      message(action==='precrease'?'预折后展开：本步画山谷线示意；下一步保留已有折痕，纸面保持展开。':'本步折叠：山谷线参与下一步平折。');
    }catch(e){message(errorText(e));}
  }
  function changeSelectedFoldAction(action:NonNullable<DiagramLineAnnotation['foldAction']>){
    if(busy||paperPulled||!selectedFoldLines.length)return;
    if(!paperVisible){const ids=new Set(selectedFoldLines.map(line=>line.id));applyAnnotations(annotations.map(annotation=>annotation.kind==='line'&&ids.has(annotation.id)?{...annotation,foldAction:action,foldFaces:[]}:annotation));return;}
    const next=isolateDiagramLineEdits(annotations,annotations.map(a=>selectedFoldLines.some(line=>line.id===a.id)?{...a,foldAction:action}:a),selectedLineFaces);
    try{
      if(action==='precrease'&&!foldLink.enabled){
        if(!pose||pose.sourceStateId!==before.id||stale)throw Error('请先计算操作前 CP，再设置预折痕。');
        const config={...foldLink,enabled:true};commit(reconcileDiagramFoldAnnotations(projectRef.current,step.id,next,config));
      }else applyAnnotations(next,false,true);
    }catch(e){message(errorText(e));}
  }
  function changeSelectedAnimationTiming(timing:DiagramLineAnimationTiming|undefined){
    if(busy||paperPulled||!selectedSourceFoldLines.length)return;
    try{
      const current=projectRef.current,s=current.steps.find(item=>item.id===step.id)!;
      const next=setDiagramLineAnimationTiming(s.annotations??[],selectedSourceFoldLines.map(line=>line.id),timing);
      commit(updateDiagramAnnotations(current,step.id,next));
      message(timing?`已设置折叠时序：参考折痕完成 ${Math.round(timing.startAfter*100)}% 后开始。`:'已恢复同时开始。');
    }catch(e){message(errorText(e));}
  }
  function changeSelectedFoldAngle(magnitude:number|null){
    if(busy||paperPulled)return false;
    if(cpSelected?.hit.kind==='edge'&&selectedCPEdge){
      const assignment=selectedCPEdgeProperties?.assignment;
      if(assignment!=='M'&&assignment!=='V')throw Error('请先将所选折痕设为谷折或峰折。');
      try{
        const next=editDiagramCPEdge(projectRef.current,step.id,cpSelected.stateId,cpSelected.hit.index,assignment,selectedCPEdgeProperties?.foldAction??'fold',magnitude);commit(next);
        const target=next.states.find(item=>item.id===step.afterId)!,index=findDiagramCPEdge(target,selectedCPEdge);
        if(index>=0)setCPSelected({stateId:target.id,hit:{kind:'edge',index},edge:{a:selectedCPEdge.a,b:selectedCPEdge.b},point:cpSelected.point});
        message(magnitude===null?'已设为自适应，计算时根据其他已知折角推算。':`已设置折角 ${magnitude}°，下一步按实际角度生成纸面。`);return true;
      }catch(e){message(errorText(e));return false;}
    }
    const ids=new Set(selectedFoldLines.map(line=>line.id));
    if(!ids.size)return false;
    const next=isolateDiagramLineEdits(annotations,annotations.map(a=>a.kind==='line'&&ids.has(a.id)?{...a,foldAngle:magnitude}:a),selectedLineFaces);
    return applyAnnotations(next,false,true);
  }
  function selectDrawingAnnotations(ids:string[],faces:DiagramLineFaceSelection={}){
    setSelectedCalloutId(null);
    if(effectiveZoom&&ids.length){
      const bounds=diagramZoomRegionBounds(effectiveZoom.region),requested=new Set(ids);
      const visible=new Set(prepareDiagramZoomInteraction(effectiveZoom.region).boxIds(annotations.filter(annotation=>requested.has(annotation.id)),[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y+bounds.height]));
      // Symbols describe the next action and remain visible beside cropped
      // paper. Only hidden crease geometry is excluded from selection.
      for(const annotation of annotations)if(annotation.kind==='symbol'&&requested.has(annotation.id))visible.add(annotation.id);
      ids=ids.filter(id=>visible.has(id));faces=Object.fromEntries(Object.entries(faces).filter(([id])=>visible.has(id)));
    }
    if(!paperVisible){const visible=new Set(annotations.filter(isDiagramImageAnnotationVisible).map(annotation=>annotation.id));ids=ids.filter(id=>visible.has(id));faces=Object.fromEntries(Object.entries(faces).filter(([id])=>visible.has(id)));}
    setSelectedImageId(null);setFixedHighlightShown(false);setLayerScopeEditing(false);setSelectedAnnotationIds(ids);setSelectedLineFaces(faces);setCPSelected(null);setCPHovered(null);if(ids.length)setTab('drawing');
    else if(tool==='fixed'||tool==='layer')setTool('select');
  }
  function changeSelectedCreaseType(style:DiagramLineStyle){
    if(busy||paperPulled)return;
    if(cpSelected?.hit.kind==='edge'){
      if(style==='auxiliary'||style==='boundary')return;
      changeCPEdge(style==='valley'?'V':style==='mountain'?'M':'F',selectedCPEdgeProperties?.foldAction??'fold');return;
    }
    if(!selectedLines.length||style==='auxiliary'&&selectedExisting.length)return;
    // Linked F lines are physical marks in the after CP. Preserve that route
    // when an active fold is changed to an existing crease.
    if(paperVisible&&style==='crease'&&foldLink.enabled&&pose&&pose.sourceStateId===before.id&&!stale){
      try{
        const routes=selectedCreaseEdges.after.map(index=>diagramCPEdgeSegment(after,index)).filter(edge=>edge.assignment!=='B'&&edge.assignment!=='A');
        if(routes.length){
          const drawingOnly=selectedLines.filter(line=>!diagramCreaseCPEdges(pose,[line],foldLink,after,before).length);
          let next=projectRef.current;
          for(const route of routes){const target=next.states.find(state=>state.id===after.id)!,index=findDiagramCPEdge(target,route);if(index>=0)next=editDiagramCPEdge(next,step.id,target.id,index,'F');}
          if(next!==projectRef.current){
            if(drawingOnly.length){
              const drawings=next.steps.find(item=>item.id===step.id)!.annotations??[],ids=new Set(drawingOnly.map(line=>line.id));
              const converted=drawingOnly.map(line=>{const {foldAction:_action,foldAngle:_angle,...mark}=line;return {...mark,style:'crease' as const};});
              next=updateDiagramAnnotations(next,step.id,[...drawings.filter(a=>!ids.has(a.id)),...converted]);
            }
            commit(next);
            const changed=next.steps.find(item=>item.id===step.id)!,tolerance=Math.max(before.doc.paper.width,before.doc.paper.height)*1e-6;
            const overlaps=(a:DiagramLineAnnotation,b:DiagramLineAnnotation)=>{
              if(a.foldFaces?.length&&b.foldFaces?.length&&!a.foldFaces.some(face=>b.foldFaces!.includes(face)))return false;
              const dx=a.b[0]-a.a[0],dy=a.b[1]-a.a[1],length=Math.hypot(dx,dy);if(length<=tolerance)return false;
              const off=(p:Point)=>Math.abs(dx*(p[1]-a.a[1])-dy*(p[0]-a.a[0]))/length;
              if(off(b.a)>tolerance||off(b.b)>tolerance)return false;
              const along=(p:Point)=>((p[0]-a.a[0])*dx+(p[1]-a.a[1])*dy)/length;
              return Math.min(length,Math.max(along(b.a),along(b.b)))-Math.max(0,Math.min(along(b.a),along(b.b)))>tolerance;
            };
            const retained=(changed.annotations??[]).filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.style==='crease'&&selectedLines.some(line=>overlaps(line,a)));
            setSelectedAnnotationIds(retained.map(a=>a.id));
            setSelectedLineFaces(Object.fromEntries(retained.flatMap(a=>{
              const scope=selectedLines.filter(line=>Object.hasOwn(selectedLineFaces,line.id)&&overlaps(line,a)).flatMap(line=>line.foldFaces??[]);
              return scope.length?[[a.id,[...new Set(scope)].filter(face=>!a.foldFaces||a.foldFaces.includes(face))]]:[];
            })));
            message('已保留为已有折痕，本步不沿此痕折叠。');return;
          }
        }
      }catch(e){message(errorText(e));return;}
    }
    const drawingOnly=style==='auxiliary'||style==='boundary';
    const ids=new Map(selectedLines.map(line=>[line.id,isExistingCrease(line)&&style!=='crease'||isDiagramCPLine(line)&&drawingOnly?crypto.randomUUID():line.id]));
    const modified=annotations.map(a=>{
      if(a.kind!=='line'||!ids.has(a.id))return a;
      const line:DiagramLineAnnotation=changeDiagramLineCategory(a,style,lineDefaults);
      if(style==='valley'||style==='mountain')line.foldAction=a.style==='valley'||a.style==='mountain'?a.foldAction??'fold':'fold';
      else {delete line.foldAction;delete line.foldAngle;}
      return line;
    });
    const next=isolateDiagramLineEdits(annotations,modified,selectedLineFaces).map(a=>{
      if(!ids.has(a.id))return a;
      const next={...a,id:ids.get(a.id)!};if(next.kind==='line'&&drawingOnly)delete next.foldFaces;return next;
    });
    if(applyAnnotations(next,true,true)){setSelectedAnnotationIds([...ids.values()]);setSelectedLineFaces(Object.fromEntries([...ids].flatMap(([oldId,id])=>Object.hasOwn(selectedLineFaces,oldId)?[[id,selectedLineFaces[oldId]]]:[])));setTool('select');}
  }
  function changeSelectedCreaseAction(action:'fold'|'precrease'){
    if(cpSelected?.hit.kind==='edge'){
      const assignment=selectedCPEdgeProperties?.assignment;
      if(assignment==='V'||assignment==='M')changeCPEdge(assignment,action);
    }else changeSelectedFoldAction(action);
  }
  function changeFoldLink(patch:Partial<DiagramFoldLinkSettings>){
    if(busy)return;if(paperPulled){message('请切回平整状态或立体状态后再修改折痕的作用纸层。');return;}
    try{
      const current=projectRef.current,s=current.steps.find(s=>s.id===current.activeStepId)!,config={...(s.foldLink??defaultDiagramFoldLink()),...patch};
      if(config.enabled){
        const access=getDiagramCPEditAccess(updateDiagramFoldLink(current,s.id,config),s.id,s.afterId);
        if(!access.editable)throw Error(access.reason);
      }
      let next=updateDiagramFoldLink(current,s.id,config);
      if(config.enabled){
        const beforeState=current.states.find(st=>st.id===s.beforeId)!,afterState=current.states.find(st=>st.id===s.afterId)!;
        if(patch.layers!==undefined||patch.selectedFaces!==undefined){
          const targets=(s.annotations??[]).filter(a=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain')&&selectedAnnotationIds.includes(a.id)).map(a=>a.id);
          if((selectedAnnotationIds.length||cpSelected?.hit.kind==='edge')&&!targets.length){message('请先选中谷折或峰折，再设置作用纸层。');return;}
          next=changeDiagramFoldLayerScope(current,s.id,config,targets);
          setSelectedLineFaces(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>!targets.includes(id))));
        }
        else if(config.layers!=='selected'||config.selectedFaces.length)next=patch.enabled&&diffDiagramFoldCP(beforeState.doc,afterState.doc).length?adoptDiagramFoldCP(next,s.id,afterState.doc):reconcileDiagramFoldAnnotations(next,s.id,s.annotations??[],config);
      }
      commit(next);if(!config.enabled)setLayerScopeEditing(false);else if(patch.layers!==undefined||patch.selectedFaces!==undefined)setLayerScopeEditing(true);message(!config.enabled?'已关闭折线联动，保留当前 CP。':patch.layers!==undefined||patch.selectedFaces!==undefined?selectedSourceFoldLines.length?'已更新选中折痕的作用纸层；新画线的默认范围保持不变。':'已设置之后画线的作用纸层；已画折线保持不变。':'折线联动已更新；主图山谷线与操作后 CP 同步。');
    }catch(e){message(errorText(e));}
  }
  function toggleFoldFace(face:number){
    if(!pose||!foldLink.enabled||busy||paperPulled||stale||pose.sourceStateId!==before.id||(selectedAnnotationIds.length>0&&!selectedSourceFoldLines.length)||cpSelected?.hit.kind==='edge')return;
    // Reopening an inactive scope first reveals its existing range. It must
    // not silently remove a saved face that appeared unselected while idle.
    if(!layerScopeActive){setLayerScopeEditing(true);return;}
    const faces=selectedFoldLines.length?selectedFoldFaces:foldLink.layers==='selected'?foldLink.selectedFaces:[];
    const selected=selectedSourceFoldLines.length?commonFoldFaces.includes(face):faces.includes(face);
    changeFoldLink({layers:'selected',selectedFaces:selected?faces.filter(f=>f!==face):[...new Set([...faces,face])]});
  }
  function chooseLayerFace(face:number){
    if(!pose)return;
    if(layerOrderEditing){setLayerOrderFace(face);setLayerChoice(null);selectCP(pose.sourceStateId,{kind:'face',index:face});return;}
    if(selectedTearWindow){toggleLayerVisibility(face);return;}
    if(tool==='fixed'){fixCP(face,{stateId:pose.sourceStateId,hit:{kind:'face',index:face}});return;}
    if(selectedFoldLines.length||layerScopeEditing||tool==='layer'||foldLink.enabled&&foldLink.layers==='selected'){toggleFoldFace(face);return;}
    selectCP(pose.sourceStateId,{kind:'face',index:face});
  }
  function pickFixed(point:Point,face?:number){
    if(!pose||busy)return;
    try{
      if(pose.sourceStateId!==before.id)throw new Error('请先计算操作前 CP 再选择固定侧。');
      const faces=face===undefined?diagramFoldFacesAtPoint(pose,point,before):[];
      let fixed:NonNullable<DiagramFoldLinkSettings['fixed']>;
      try{fixed=pickDiagramFoldAnchor(pose,point,face,before);}catch(e){if(face===undefined&&faces.length>1){setFoldFaceCandidates(faces);setFoldPickPoint(point);setFoldPickKind('fixed');setTab('drawing');message('此处有重合纸层，请在右侧明确选择固定纸面。');return;}throw e;}
      const current=projectRef.current,s=current.steps.find(s=>s.id===current.activeStepId)!,target=current.states.find(st=>st.id===s.afterId)!;
      const config={...(s.foldLink??defaultDiagramFoldLink()),fixed};
      const doc=setStartingFace(target.doc,diagramFoldStartingFace(target.doc,fixed));
      let next=updateDiagramFoldLink(current,s.id,config);if(JSON.stringify(doc)!==JSON.stringify(target.doc))next=updateDiagramCP(next,target.id,doc);
      commit(next);setFixedHighlightShown(true);setTool('select');setFoldFaceCandidates([]);setFoldPickPoint(null);message('已固定这部分纸面，下一步沿用它的位置、正背和观察方向。');
    }catch(e){message(errorText(e));}
  }
  function pickFoldLayer(point:Point){
    if(!pose||busy)return;
    try{const faces=diagramFoldFacesAtPoint(pose,point,before);if(!faces.length)throw new Error('请点击纸面内部。');setLayerScopeEditing(true);setFoldFaceCandidates(faces);setFoldPickPoint(point);setFoldPickKind('layer');setTab('drawing');message('左侧已列出此处的纸面，请勾选参与折叠的层。');}catch(e){message(errorText(e));}
  }
  function editAnnotation(patch:Partial<DiagramAnnotation>){
    if(!selectedAnnotation)return;
    applyAnnotations(annotations.map(a=>{
      if(a.id!==selectedAnnotation.id)return a;
      const next={...a,...patch} as DiagramAnnotation;
      if(next.kind==='line'&&next.style!=='valley'&&next.style!=='mountain'){delete next.foldAction;delete next.foldAngle;}
      return next;
    }));
  }
  function deleteAnnotation(){if(!busy&&selectedAnnotations.length){if(selectedExisting.length){message('已有折痕保留在操作前 CP 中；选中后可沿此痕折叠。');return;}applyAnnotations(annotations.filter(a=>!selectedAnnotationIds.includes(a.id)));setSelectedAnnotationIds([]);}}
  function deleteInBox(ids:string[]){
    if(busy||!ids.length)return;
    try{
      const targets=new Set(ids),next=annotations.filter(a=>!targets.has(a.id)||isExistingCrease(a)||paperPulled&&a.kind==='line');
      if(next.length===annotations.length)return;
      const current=projectRef.current;
      if(!paperVisible){if(!applyAnnotations(next))return;}
      else commit(paperPulled?updateDiagramAnnotations(current,step.id,next):reconcileDiagramFoldAnnotations(current,step.id,next));
      clearDrawingSelection(true);message(`已删除框内 ${annotations.length-next.length} 个绘图对象，可撤销。`);
    }catch(e){message(errorText(e));}
  }
  function chooseTool(next:DiagramDrawingTool){setOrbitMode(false);const currentStep=projectRef.current.steps.find(item=>item.id===projectRef.current.activeStepId)!;if(next==='vertex'&&currentStep.paperStates?.spatial&&currentStep.paperStates.active==='flat'){try{commit(switchDiagramPaperState(projectRef.current,currentStep.id,'spatial'));}catch(error){message(errorText(error));return;}}setSelectedCalloutId(null);if(paperPulled&&['line','polyline','erase','perpendicular','parallel','bisector','trim','extend','fixed','ratio-point','special-point'].includes(next)){message('请切回平整状态或立体状态后再编辑折痕。');return;}if(['line','polyline','perpendicular','parallel','bisector','trim','extend'].includes(next)){const appearance=lineDefaults[lineStyle];setDrawingColor(appearance.color);setDrawingWidth(appearance.width);setDrawingPattern(appearance.strokePattern);}setLayerScopeEditing(next==='layer');setFixedHighlightShown(next==='fixed');setTool(next);setOverview(false);setSelection(emptySelection());if(!['select','pan','layer','mirror-copy'].includes(next))setSelectedAnnotationIds([]);setTab(next==='vertex'?'model':'drawing');if(next==='vertex')setPropertiesOpen(true);if(propertyScroll.current)propertyScroll.current.scrollTop=0;}
  function chooseLine(next:DiagramLineStyle){
    chooseTool('line');const appearance=lineDefaults[next];setLineStyle(next);setDrawingColor(appearance.color);setDrawingWidth(appearance.width);setDrawingPattern(appearance.strokePattern);
  }
  function changeLineDefault(style:DiagramLineStyle,patch:Partial<DiagramLineAppearance>){
    setLineDefaults(previous=>changeGlobalDiagramLineStyle(previous,style,patch));
    if(style===lineStyle){if(patch.color!==undefined)setDrawingColor(patch.color);if(patch.width!==undefined)setDrawingWidth(patch.width);if(patch.strokePattern!==undefined)setDrawingPattern(patch.strokePattern);}
  }
  function openZoomSelection(annotation:DiagramSymbolAnnotation,isNew=false){
    if(busy||!active)return;
    flushFields();
    const basis=diagramZoomPaperBounds(pose,images,paperVisible,before.doc.paper,step.simulationSurface);
    const bounds=basis;
    resetDrawingSelection();setOverview(false);setTool('select');
    setZoomDialog({stepId:step.id,generation:fileGeneration.current,annotation:structuredClone(annotation),isNew,basis,bounds,initial:annotation.zoomArea?tryMapDiagramZoomArea(annotation.zoomArea,basis)??undefined:undefined});
  }
  function confirmZoomRegion(region:DiagramZoomRegion){
    const target=zoomDialog;if(!target)return;
    try{
      if(!activeRef.current||target.generation!==fileGeneration.current||projectRef.current.activeStepId!==target.stepId)throw new Error('工程或步骤已切换，请在目标步骤重新选择放大区域。');
      const current=projectRef.current,s=current.steps.find(item=>item.id===target.stepId)!,old=s.annotations??[];
      if(!target.isNew&&!old.some(annotation=>annotation.id===target.annotation.id))throw new Error('放大符号已不存在，请重新放置。');
      const annotation={...target.annotation,zoomArea:{region,basis:target.basis}};
      const next=updateDiagramAnnotations(current,s.id,target.isNew?[...old,annotation]:old.map(item=>item.id===annotation.id?annotation:item));
      exportDiagramProject(next);commit(next);setZoomDialog(null);selectDrawingAnnotations([annotation.id]);
      message('放大区域已保存：从下一步开始放大，后续保持；放置缩小符号后于下一步恢复完整视图。');
    }catch(error){message(errorText(error));throw error;}
  }
  function chooseSymbol(next:DiagramSymbolKind){setSymbol(next);chooseTool('symbol');}
  function chooseCallout(type:'paper'|'cp',sourcePoint?:Point){
    if(busy)return;
    if(type==='paper'&&!pose&&!simulationSurface&&!annotations.length&&!images.length){message('请先添加纸面或绘图内容，再创建局部放大框。');return;}
    resetDrawingSelection();setOverview(false);setCalloutDialog({type,sourcePoint});
  }
  function changeCallouts(next:DiagramCallout[]){
    if(busy)return;
    try{commit(updateDiagramCallouts(projectRef.current,step.id,next));}catch(error){message(errorText(error));}
  }
  function createCallout(draft:Omit<DiagramCallout,'id'>){
    const current=projectRef.current,s=current.steps.find(item=>item.id===current.activeStepId)!;
    try{
      const id=calloutDialog?.editId??crypto.randomUUID(),callout={...draft,id};
      if(!calloutDialog?.editId){
        const occupied=(s.callouts??[]).flatMap(item=>diagramCalloutTargets(item)).map(item=>({...item.circle,radius:item.circle.radius*(item.label?1.4:1)}));
        for(const display of diagramCalloutTargets(callout)){
          let circle=display.circle;
          const radius=circle.radius*(display.label?1.4:1);
          for(let attempt=0;attempt<occupied.length;attempt++){
            const overlap=occupied.find(item=>Math.hypot(item.center[0]-circle.center[0],item.center[1]-circle.center[1])<item.radius+radius+Math.max(item.radius,radius)*.15);
            if(!overlap)break;
            const separation=(overlap.radius+radius+Math.max(overlap.radius,radius)*.15)*(1+1e-12);
            circle={...circle,center:[circle.center[0],overlap.center[1]+separation]};
          }
          if(display.part==='target')callout.target=circle;
          else callout.comparison={...callout.comparison!,target:circle};
          occupied.push({...circle,radius});
        }
      }
      const next=calloutDialog?.editId?(s.callouts??[]).map(item=>item.id===id?callout:item):[...(s.callouts??[]),callout];
      commit(updateDiagramCallouts(current,s.id,next));setCalloutDialog(null);resetDrawingSelection();setSelectedCalloutId(id);setTool('select');setImageFitToken(token=>token+1);
      message(draft.source.kind==='paper'?'已添加局部放大框；拖动圆框移动，蓝点调整大小。':'已添加 CP 前后对照放大框；小圆可独立定位，两个大圆分别显示操作前后结构。');
    }catch(error){message(errorText(error));}
  }
  function deleteCallout(){if(selectedCalloutId){changeCallouts((step.callouts??[]).filter(callout=>callout.id!==selectedCalloutId));setSelectedCalloutId(null);}}
  function updateCanvas(patch:Partial<DiagramCanvasSettings>,history=true){try{commit(updateDiagramCanvas(projectRef.current,step.id,{...canvasSettings,...patch}),history);}catch(e){message(errorText(e));}}
  function toggleOrientationLock(){try{commit(updateDiagramOrientationLock(projectRef.current,step.id,!step.orientationLocked),false);}catch(e){message(errorText(e));}}
  function updateGridDivisions(gridDivisions:number){
    updateCanvas({gridDivisions,gridSpacing:Math.max(.1,Math.min(10_000,canvasGrid.stepX*canvasGrid.divisions/gridDivisions)),gridSubdivisions:1});
  }
  function addPrecisionPoint(point:Point):boolean {
    if(paperPulled)return false;
    const current=projectRef.current,s=current.steps.find(st=>st.id===current.activeStepId)!,settings=s.canvas??defaultDiagramCanvas(current.states.find(state=>state.id===s.beforeId)!.doc.paper.width),points=settings.constructionPoints??[];
    if(points.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-8))return true;
    try{commit(updateDiagramCanvas(current,s.id,{...settings,constructionPoints:[...points,[...point]]}));return true;}catch(e){message(errorText(e));return false;}
  }
  function anchoredSymbol(next:DiagramSymbolAnnotation){
    if(selectedAnnotation?.kind!=='symbol')return;
    try{
      const previous=symbolBase(selectedAnnotation),base=symbolBase(next);
      next={...next,position:[next.position[0]+previous[0]-base[0],next.position[1]+previous[1]-base[1]]};
      applyAnnotations(annotations.map(a=>a.id===next.id?next:a));
    }catch(e){message(errorText(e));}
  }
  function editSymbolParameter(key:keyof DiagramSymbolParams,value:number){
    if(selectedAnnotation?.kind!=='symbol')return;
    const next={...selectedAnnotation,params:{...selectedAnnotation.params,[key]:key==='count'?Math.round(value):value}};
    if(key==='curve')delete next.curveControl;
    anchoredSymbol(next);
  }
  function setReturnStep(targetId:string){
    if(!selectedReturnSymbol||busy)return;
    const next={...selectedReturnSymbol};
    if(targetId)next.returnStepId=targetId;else delete next.returnStepId;
    if(applyAnnotations(annotations.map(annotation=>annotation.id===next.id?next:annotation)))
      message(targetId?'返回目标已设置：下一步恢复该步骤的聚合状态，并保留期间产生的折痕。':'已取消自动返回，符号仅作图示。');
  }
  function editCadProperty(key:string,value:number){
    if(selectedAnnotation?.kind==='symbol')anchoredSymbol({...selectedAnnotation,cadProperties:{...selectedAnnotation.cadProperties,[key]:value}});
  }
  function editCadAttribute(key:string,value:string){
    if(selectedAnnotation?.kind!=='symbol')return false;
    try{
      if(selectedAnnotation.symbol==='equalDivision'){
        const next=editDiagramEqualDivisionRatio(selectedAnnotation,key,value);
        applyAnnotations(annotations.map(annotation=>annotation.id===next.id?next:annotation));
      }else anchoredSymbol({...selectedAnnotation,cadAttributes:{...selectedAnnotation.cadAttributes,[key]:value}});
      return true;
    }catch(error){message(errorText(error));return false;}
  }
  function adoptCadSymbol(symbol:DiagramSymbolKind,keepBaseline:boolean){
    if(selectedAnnotation?.kind!=='symbol')return;
    try{
      const next:DiagramSymbolAnnotation={...selectedAnnotation,symbol,params:{},cadProperties:{},cadAttributes:{}};
      if(!canBindDiagramArrow(next))delete next.paperBinding;
      if(symbol==='tearWindow'){delete next.cadProperties;delete next.cadAttributes;next.cutawayFaces=selectedAnnotation.symbol==='tearWindow'?selectedAnnotation.cutawayFaces??[]:[];}
      else delete next.cutawayFaces;
      if(!isDiagramRotationSymbol(symbol))delete next.turnAngle;
      if(symbol!=='zoom')delete next.zoomArea;
      if(symbol!=='return')delete next.returnStepId;
      delete next.curveControl;
      if(keepBaseline&&selectedSymbolBaseline){
        const baseline=symbolNativeBaseline(next),start=baseline?.start,end=baseline?.end;
        if(start&&end){
          const length=Math.hypot(end[0]-start[0],end[1]-start[1]);
          if(length>1e-8){next.size*=selectedSymbolBaseline.length/length;next.rotation+=selectedSymbolBaseline.angle-Math.atan2(end[1]-start[1],end[0]-start[0])*180/Math.PI;}
        }
      }
      anchoredSymbol(next);
    }catch(error){message(errorText(error));}
  }
  function resizeSymbolBaseline(length:number){
    if(selectedAnnotation?.kind==='symbol'&&selectedSymbolBaseline)anchoredSymbol({...selectedAnnotation,size:selectedAnnotation.size*length/selectedSymbolBaseline.length});
  }
  function rotateSymbol(rotation:number){
    if(selectedAnnotation?.kind==='symbol')anchoredSymbol({...selectedAnnotation,rotation:selectedSymbolBaseline?selectedAnnotation.rotation+rotation-selectedSymbolBaseline.angle:rotation});
  }
  function resetSymbolComponents(symbol?:DiagramSymbolKind){
    if(selectedAnnotation?.kind!=='symbol')return;
    adoptCadSymbol(symbol??selectedAnnotation.symbol,!!symbol||!selectedIsCad);
  }
  function positionSymbolBase(point:Point){
    if(selectedAnnotation?.kind!=='symbol'||!selectedSymbolBase)return;
    editAnnotation({position:[selectedAnnotation.position[0]+point[0]-selectedSymbolBase[0],selectedAnnotation.position[1]+point[1]-selectedSymbolBase[1]]});
  }
  function drawingStyle(patch:Partial<DiagramLineAppearance>){
    if(selectedAnnotations.length)applyAnnotations(annotations.map(a=>!selectedAnnotationIds.includes(a.id)?a:a.kind==='line'?overrideDiagramLineAppearance(a,patch):{...a,...(patch.color!==undefined?{color:patch.color}:{}),...(patch.width!==undefined?{width:patch.width}:{})}));
    else {if(patch.color)setDrawingColor(patch.color);if(patch.width!==undefined)setDrawingWidth(patch.width);}
  }
  function useGlobalDrawingStyle(){
    applyAnnotations(annotations.map(a=>a.kind==='line'&&selectedAnnotationIds.includes(a.id)?resetDiagramLineAppearance(a,lineDefaults):a));
  }
  function copySelection(){
    if(!selectedAnnotations.length||busy)return;
    if(selectedExisting.length){message('已有折痕来自 CP，直接沿此痕折叠即可；复制请只选本步绘图对象。');return;}
    try{const next=copyDiagramAnnotations(selectedAnnotations,selectedAnnotationIds,[canvasGrid.stepX/2,canvasGrid.stepY/2]);applyAnnotations([...annotations,...next.annotations.filter(a=>next.ids.includes(a.id))]);setSelectedAnnotationIds(next.ids);setSelectedLineFaces({});setTool('select');}catch(e){message(errorText(e));}
  }
  function beginMirrorCopy(){
    if(busy)return;
    if(!selectedAnnotations.length){message('请先选择要镜像复制的折线或符号，可拖框多选。');return;}
    if(paperPulled&&selectedLines.length){message('请切回平整状态或立体状态后镜像复制折痕；拖角状态可复制符号。');return;}
    flushFields();chooseTool('mirror-copy');
  }
  function mirrorSelection(a:Point,b:Point):boolean {
    if(busy||!selectedAnnotations.length)return false;
    if(paperPulled&&selectedLines.length){message('请切回平整状态或立体状态后镜像复制折痕。');return false;}
    try{
      const source=annotations.map(annotation=>selectedAnnotations.find(item=>item.id===annotation.id)??annotation);
      const reflected=mirrorCopyDiagramAnnotations(source,selectedAnnotationIds,a,b),ids=new Set(reflected.ids);
      const copies=reflected.annotations.filter(annotation=>ids.has(annotation.id)).map(annotation=>{
        if(annotation.kind!=='line')return annotation;
        // A new drawing chooses the paper under its destination. Source face
        // identities belong to the original position, even on a shared handle.
        const {foldFaces:_sourceFaces,...copy}=annotation;return copy;
      });
      if(!applyAnnotations([...annotations,...copies]))return false;
      selectDrawingAnnotations(reflected.ids);setSelection(emptySelection());setTool('select');
      message(`已镜像复制 ${copies.length} 个对象，原对象保留；可独立编辑或一次撤销。`);return true;
    }catch(e){message(errorText(e));return false;}
  }
  function focusDrawingCanvas(){
    const focus=()=>workspaceElement.current?.querySelector<SVGSVGElement>('[data-diagram-model]')?.focus({preventScroll:true});
    if(workspaceElement.current?.querySelector('[data-diagram-model]'))focus();else requestAnimationFrame(focus);
  }
  function runDiagramCommand(command:DiagramCommand){
    if(!active||busy||libraryOpen||editCP||confirmReplace||fileOpening||pdfOpen||animationOpen)return;
    if(paperPulled&&(command.startsWith('line:')||command.startsWith('action:')||['line','polyline','erase','perpendicular','parallel','bisector','trim','extend','fixed','ratio-point','special-point'].includes(command))){message('请切回平整状态或立体状态后再编辑折痕。');return;}
    if(['vertex','fixed','layer'].includes(command)&&!paperVisible){message('请先恢复显示折图纸面，再操作纸角或纸层。');return;}
    if(['vertex','fixed','layer'].includes(command)&&!pose){message('请先计算操作前 CP，再操作纸角或纸层。');return;}
    if(command==='fixed'&&!foldLink.enabled){message('请先启用“折线与 CP 联动”，再选择固定侧。');return;}
    flushFields();setCommandActivation(value=>value+1);
    if(command==='mirror-copy'){beginMirrorCopy();return;}
    if(command==='copy-selection'){if(!selectedAnnotations.length)message('请先选择要复制的折线或符号。');else if(paperPulled&&selectedLines.length)message('请切回平整状态或立体状态后复制折痕。');else copySelection();return;}
    if(command==='clear-selection'){clearDrawingSelection();chooseTool('select');return;}
    if(command==='delete-selection'){if(selectedCalloutId){deleteCallout();return;}if(!selectedAnnotations.length)message('请先选择要删除的折线或符号。');else deleteAnnotation();return;}
    if(command.startsWith('line:')){chooseLine(command.slice(5) as DiagramLineStyle);return;}
    if(command.startsWith('symbol:')){chooseSymbol(command.slice(7) as DiagramSymbolKind);return;}
    if(command==='action:precrease'||command==='action:fold'){chooseFoldAction(command==='action:precrease'?'precrease':'fold');return;}
    if(isDiagramDrawingCommand(command))chooseTool(command);
  }
  function transformSelection(kind:'rotate'|'scale'|'mirror-x'|'mirror-y'){
    if(selectedExisting.length){message('已有折痕的位置跟随纸面；请只选择本步绘图对象进行变换。');return;}
    const bounds=annotationBounds(selectedAnnotations);if(!bounds)return;
    const center:Point=[bounds.x+bounds.width/2,bounds.y+bounds.height/2];
    try{applyAnnotations(transformDiagramAnnotations(annotations,selectedAnnotationIds,kind==='rotate'?{kind:'rotate',center,angle:transformAngle}:kind==='scale'?{kind:'scale',center,factor:transformScale}:{kind:'mirror',center,axis:kind==='mirror-x'?'x':'y'}));}catch(e){message(errorText(e));}
  }
  useEffect(()=>{
    if(!active||libraryOpen||editCP||confirmReplace||fileOpening||pdfOpen||busy)return;
    const key=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.isComposing||e.keyCode===229||document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]')||(e.target as Element)?.closest('input,textarea,select,[contenteditable]'))return;
      const character=directCommands?toolCommandCharacter(e):null;
      if(character){e.preventDefault();commandBar.current?.begin(character);return;}
      if((e.key==='Delete'||e.key==='Backspace')&&selectedCalloutId&&tool==='select'){e.preventDefault();deleteCallout();return;}
      if((e.key==='Delete'||e.key==='Backspace')&&selectedAnnotations.length&&tool==='select'){e.preventDefault();deleteAnnotation();}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();selectDrawingAnnotations(annotations.map(a=>a.id));setTool('select');setTab('drawing');}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();copySelection();}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[active,libraryOpen,editCP,confirmReplace,fileOpening,pdfOpen,busy,annotations,selectedAnnotationIds,selectedCalloutId,step.callouts,tool,directCommands]);
  const cpCard=(state:DiagramCPState,which:'before'|'after',expanded=false)=>{
    const index=project.states.indexOf(state),isBefore=which==='before',exchanged=centralCP?.id===state.id,access=getDiagramCPEditAccess(project,step.id,state.id);
    return <section className={'diagram-cp-card'+(exchanged?' is-exchanged':'')} aria-label={isBefore?'本步骤操作前 CP':'本步骤操作后 CP'} key={state.id}><header><div><span>{exchanged?'原主图':isBefore?'操作前':'操作后'}</span><strong>{exchanged?'步骤折图':`CP${index}`}</strong></div><small>{exchanged?`CP${index} 已在主画布`:index===0?'教程起始状态':index===project.steps.length?'教程最终状态':`步骤 ${index} → ${index+1} 共享`}</small></header>
      {exchanged?<div className="diagram-cp-workspace-placeholder"><DiagramThumbnail step={step} states={project.states} lineDefaults={lineDefaults} adaptiveLines={adaptiveLines} zoom={effectiveZoom?.region}/><small>点击“返回折图”交换回来</small></div>:<DiagramCPInteractive expanded={expanded} doc={state.doc} presentation={{before,pose:step.paperStates?.spatial??step.paperStates?.flat??pose,phase:isBefore?'before':'after',precreases:foldLink.precreases}} hovered={cpHovered?.stateId===state.id?cpHovered.hit:null} selected={cpSelected?.stateId===state.id?cpSelected.hit:null} highlightedEdges={isBefore?selectedCreaseEdges.before:selectedCreaseEdges.after} fixed={showFixedHighlight&&foldLink.enabled&&fixedTargetState?.id===state.id?fixedCPHit:null} disabled={!!busy||!active||!!centralCP||!!(confirmReplace||fileOpening)} onHover={(hit,point)=>hoverCP(state.id,hit,point)} onSelect={(hit,point)=>selectCP(state.id,hit,point)}/>}
      <div className="diagram-cp-meta"><span>{state.doc.segments.length} 条线段</span><span>版本 {state.revision+1}</span></div>
      {!access.editable&&<p className="diagram-cp-workspace-access">{access.reason}</p>}
      <div className="diagram-cp-actions"><button disabled={!!busy||!active||!!(confirmReplace||fileOpening)} aria-pressed={exchanged} onClick={()=>exchangeCP(exchanged?null:state.id)}>{exchanged?'返回折图':'切换到主画布'}</button><button disabled={!!busy||!access.editable} title={access.reason||'导入并替换此 CP'} onClick={()=>{importTarget.current={stateId:state.id,project:projectRef.current};cpInput.current?.click();}}>导入 CP</button><button disabled={!!busy||!access.editable} onClick={()=>applyCP(state.id,doc)} title={access.reason||'复制折痕编辑区当前 CP 到这个共享状态'}>采用编辑区 CP</button>{isBefore?<button className="diagram-primary" disabled={!!busy||paperPulled} onClick={()=>compute(state.id)}>计算折图</button>:<button className="diagram-primary" disabled={!!busy||paperPulled||!pose||stale||otherSource||pose.sourceStateId!==before.id} onClick={updateAfterCreases} title={paperPulled?'切回平整状态或立体状态后更新折痕':!pose||stale||otherSource||pose.sourceStateId!==before.id?'请先计算操作前 CP，再更新主图折痕':'将操作后 CP 的新增和修改折痕映射到主图，保留当前纸张姿态'}>更新主图折痕</button>}</div>
      <div className="diagram-cp-editor-action"><button disabled={!!busy||!active||!!editCP||!!(confirmReplace||fileOpening)||!onRevealCP} onClick={()=>revealCPInEditor(state.doc)} title="将此 CP 的独立副本放入折痕编辑工作区，可撤销；返回绘图时继续本步骤，修改后可用“采用编辑区 CP”更新本步">在折痕编辑中打开</button></div>
    </section>;
  };
  const cpEdgeChosen=cpSelected?.hit.kind==='edge'&&!!selectedCPEdge;
  const creaseType=cpEdgeChosen?({V:'valley',M:'mountain',F:'crease'} as const)[selectedCPEdgeProperties?.assignment as 'V'|'M'|'F']:
    selectedLines.length&&selectedLines.every(line=>line.style===selectedLines[0].style)?selectedLines[0].style:undefined;
  const creaseAction=cpEdgeChosen?selectedCPEdgeProperties?.foldAction:
    selectedFoldLines.length&&selectedFoldLines.every(line=>(line.foldAction??'fold')===(selectedFoldLines[0].foldAction??'fold'))?selectedFoldLines[0].foldAction??'fold':undefined;
  const creaseEditable=!busy&&!paperPulled&&(!foldLink.enabled||!stale)&&(!cpEdgeChosen||selectedCPEdge?.assignment!=='B'&&selectedCPEdge?.assignment!=='A');
  const creaseActionEditable=creaseEditable&&(cpEdgeChosen?selectedCPEdgeProperties?.assignment==='M'||selectedCPEdgeProperties?.assignment==='V':selectedFoldLines.length>0);
  const selectedFoldAngle=cpEdgeChosen?selectedCPEdgeAngle:
    selectedFoldLines.length&&selectedFoldLines.every(line=>(line.foldAngle===undefined?180:line.foldAngle)===(selectedFoldLines[0].foldAngle===undefined?180:selectedFoldLines[0].foldAngle))?(selectedFoldLines[0].foldAngle===undefined?180:selectedFoldLines[0].foldAngle):'mixed';
  const creaseActions=(selectedLines.length>0||cpEdgeChosen)?<>
    <div className="diagram-crease-action-row diagram-selected-type"><label><span>类型</span><select aria-label="选中折痕类型" value={creaseType??''} disabled={!creaseEditable} onChange={event=>changeSelectedCreaseType(event.target.value as DiagramLineStyle)}>
      <option value="" disabled>多种类型</option>{([['valley','谷折'],['mountain','峰折'],['crease','已有折痕'],['auxiliary','辅助线'],['boundary','边界线']] as const).filter(([style])=>!cpEdgeChosen||style!=='auxiliary'&&style!=='boundary').map(([style,label])=><option key={style} value={style} disabled={(style==='auxiliary'||style==='boundary')&&selectedExisting.length>0}>{label}</option>)}</select></label>
      <button type="button" aria-label="取消折痕选择" title="取消选择，也可右击画布" onClick={()=>clearDrawingSelection()}>×</button>
    </div>
    <div className="diagram-crease-action-row" role="group" aria-label="选中折痕作用"><span className="diagram-crease-action-label">作用</span>
      <button aria-label="选中折痕本步折叠" aria-pressed={creaseAction==='fold'} disabled={!creaseActionEditable} onClick={()=>changeSelectedCreaseAction('fold')}>本步折叠</button>
      <button aria-label="选中折痕预折后展开" aria-pressed={creaseAction==='precrease'} disabled={!creaseActionEditable} onClick={()=>changeSelectedCreaseAction('precrease')}>预折后展开</button>
    </div>

    {paperPulled?<p className="diagram-note">切回平整状态或立体状态后可修改折痕。</p>:creaseType==='crease'?<p className="diagram-note">沿此痕折叠时，先选择谷折或峰折。</p>:creaseAction==='precrease'?<p className="diagram-note">下一步保留为已有折痕，纸面保持展开。</p>:cpEdgeChosen&&selectedCPEdgeProperties===null?<p className="diagram-note">此段在操作后 CP 中有不同属性，选择类型可统一此段。</p>:null}
  </>:undefined;
  const objectPrecisionControls=(<>
          {selectedAnnotation?.kind==='symbol'&&<>
            <div className="diagram-coordinate-row"><NumberField label={selectedSymbolBaseline?.rooted?'根部 X':selectedSymbolBaseline?'中心 X':'基点 X'} value={selectedSymbolBase![0]} disabled={!!busy} onChange={x=>positionSymbolBase([x,selectedSymbolBase![1]])}/><NumberField label={selectedSymbolBaseline?.rooted?'根部 Y':selectedSymbolBaseline?'中心 Y':'基点 Y'} value={selectedSymbolBase![1]} disabled={!!busy} onChange={y=>positionSymbolBase([selectedSymbolBase![0],y])}/></div>
            <div className="diagram-coordinate-row"><NumberField label="符号大小" value={selectedAnnotation.size} min={.001} max={1e6} step={1} disabled={!!busy} onChange={size=>anchoredSymbol({...selectedAnnotation,size})}/><NumberField label={selectedSymbolBaseline?'基线角度':'符号旋转'} value={selectedSymbolBaseline?.angle??selectedAnnotation.rotation} min={-360000} max={360000} suffix="°" disabled={!!busy} onChange={rotateSymbol}/></div>
          </>}
          {selectedAnnotation?.kind==='line'&&<>
            <div className="diagram-coordinate-row"><NumberField label="起点 X" value={selectedAnnotation.a[0]} disabled={!!busy||paperPulled||isExistingCrease(selectedAnnotation)} onChange={x=>editAnnotation({a:[x,selectedAnnotation.a[1]]})}/><NumberField label="起点 Y" value={selectedAnnotation.a[1]} disabled={!!busy||paperPulled||isExistingCrease(selectedAnnotation)} onChange={y=>editAnnotation({a:[selectedAnnotation.a[0],y]})}/></div>
            <div className="diagram-coordinate-row"><NumberField label="终点 X" value={selectedAnnotation.b[0]} disabled={!!busy||paperPulled||isExistingCrease(selectedAnnotation)} onChange={x=>editAnnotation({b:[x,selectedAnnotation.b[1]]})}/><NumberField label="终点 Y" value={selectedAnnotation.b[1]} disabled={!!busy||paperPulled||isExistingCrease(selectedAnnotation)} onChange={y=>editAnnotation({b:[selectedAnnotation.b[0],y]})}/></div>
          </>}
          {!!selectedAnnotations.length&&<><div className="diagram-transform-fields"><NumberField label="选中旋转角" value={transformAngle} min={-360000} max={360000} suffix="°" onChange={setTransformAngle}/><button disabled={!!busy||selectedExisting.length>0} onClick={()=>transformSelection('rotate')}>旋转选中</button><NumberField label="选中缩放倍数" value={transformScale} min={.001} max={1000} step={.1} suffix="×" onChange={setTransformScale}/><button disabled={!!busy||selectedExisting.length>0} onClick={()=>transformSelection('scale')}>缩放选中</button></div><div className="diagram-button-row"><button disabled={!!busy||selectedExisting.length>0} onClick={()=>transformSelection('mirror-y')}>左右镜像</button><button disabled={!!busy||selectedExisting.length>0} onClick={()=>transformSelection('mirror-x')}>上下镜像</button></div></>}
  </>);
  const objectControls=(<section><header><h3>{selectedLines.length?'外观与位置':'选中对象'}</h3><small>{selectedAnnotations.length>1?`${selectedAnnotations.length} 个对象`:selectedAnnotation?(selectedAnnotation.kind==='line'?LINE_LABELS[selectedAnnotation.style]:SYMBOL_LABELS[selectedAnnotation.symbol]):'折线与符号'}</small></header>
          {selectedLines.length>0&&<><DiagramLineAppearanceControls value={resolveDiagramLineAppearance(selectedLines[0],lineDefaults)} onChange={drawingStyle} disabled={!!busy} ariaLabel="选中线段外观"/>{selectedLines.some(line=>line.appearanceOverrides?.length)&&<button type="button" onClick={useGlobalDrawingStyle} disabled={!!busy}>使用全局样式</button>}</>}
          {!selectedLines.length&&<><NumberField label="绘图线宽" value={selectedAnnotations[0]?.width??drawingWidth} min={.05} max={1000} step={.1} disabled={!!busy} onChange={width=>drawingStyle({width})}/>
          <label className="diagram-color-field"><span>绘图颜色</span><ColorPicker aria-label="绘图颜色" disabled={!!busy} value={(selectedAnnotations[0]?.color??drawingColor).replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i,'#$1$1$2$2$3$3')} onChange={color=>drawingStyle({color})}/><small>{(selectedAnnotations[0]?.color??drawingColor).toUpperCase()}</small></label></>}
          {selectedLines.length?objectPrecisionControls:<details className="diagram-precision-settings" key={selectedAnnotationIds.join(':')}><summary>精确位置与变换</summary>{objectPrecisionControls}</details>}
          {!!selectedAnnotations.length&&<div className="diagram-button-row diagram-selection-actions"><button disabled={!!busy||selectedExisting.length>0} onClick={copySelection}>复制选中 · Ctrl+D</button><button disabled={!!busy||selectedExisting.length>0} onClick={deleteAnnotation}>删除 · Delete</button></div>}
          <p className="diagram-note">空白处拖框选择；Shift 增减选择，Ctrl+A 全选。多个对象可一起移动和变换。</p>
        </section>);
  const layerScopeEditable=!!pose&&pose.sourceStateId===before.id&&foldLink.enabled&&!busy&&!paperPulled&&!stale&&!cpEdgeChosen&&(!selectedAnnotationIds.length||selectedSourceFoldLines.length>0);
  const foldControls=(<section className="diagram-fold-link-controls diagram-visual-layer-controls" aria-label="折线与 CP 联动"><header><h3>{selectedSourceFoldLines.length?'选中折线的作用纸层':'新画线的作用纸层'}</h3><label><input type="checkbox" aria-label="折线联动" checked={foldLink.enabled} disabled={!pose||!!busy||paperPulled||stale||pose.sourceStateId!==before.id} onChange={e=>changeFoldLink({enabled:e.target.checked})}/>CP 联动</label></header>
    <p className="diagram-note" role="status" aria-label="作用纸层设置状态">{selectedSourceFoldLines.length?`当前：修改选中的 ${selectedSourceFoldLines.length} 条折线；不改变后续画线的默认范围。`:'当前：设置后续画线；不改变已画折线。'}</p>
    <div className="diagram-layer-scope-actions" role="group" aria-label="作用纸层设置对象">
      <button disabled={!!busy} aria-pressed={!selectedSourceFoldLines.length} onClick={()=>{resetDrawingSelection();setLayerScopeEditing(true);}}>设置后续画线</button>
      <button disabled={!!busy} onClick={()=>{chooseTool('select');message('请在画布上选择已有折线，再修改它的作用纸层。');}}>选择已有折线</button>
    </div>
    <div className="diagram-layer-scope-actions" role="group" aria-label="作用纸层快捷设置">
      <button disabled={!layerScopeEditable} title={selectedSourceFoldLines.length?'将选中折痕应用到全部纸层':'之后画线应用到全部纸层，不改变已画折线'} onClick={()=>changeFoldLink({layers:'all'})}>全部纸层</button>
      <button disabled={!layerScopeEditable} title={selectedSourceFoldLines.length?'将选中折痕应用到当前可见的最上层，忽略隐藏纸层':'之后画线应用到当前可见的最上层，不改变已画折线'} onClick={()=>changeFoldLink({layers:'top'})}>最上层</button>
      <button disabled={!layerScopeEditable} aria-pressed={layerScopeActive} title="显示已保存的作用纸层，再点叠片或纸面列表修改" onClick={()=>setLayerScopeEditing(true)}>逐层选择</button>
    </div>
    <div className="diagram-layer-secondary-actions"><button disabled={!layerScopeEditable} aria-pressed={tool==='layer'&&layerScopeActive} onClick={()=>chooseTool('layer')}>画布点层</button>{foldLink.fixed&&<button disabled={!!busy||paperPulled||stale} onClick={unfixCP}>取消固定</button>}</div>
    {foldFaceCandidates.length>0&&foldPickPoint&&<p className="diagram-note">此处有 {foldFaceCandidates.length} 个重合纸面，请在叠片或列表中{foldPickKind==='fixed'?'点“固定”':'选择参与纸层'}。</p>}
    {foldPreview.error&&<p className="diagram-note" role="status">{foldPreview.error}{foldPreview.pending&&<button onClick={()=>{foldPreviewTask.current?.cancel();foldPreviewTask.current=null;setFoldPreview({preview:[],error:'已停止折痕显示计算。',valid:false});}}>停止</button>}</p>}
  </section>);
  const cpSelectionControls=(<>{cpSelected&&cpSelected.hit.kind!=='edge'&&<section className="diagram-cp-selection-controls" aria-label="CP 选择操作"><header><h3>CP{project.states.findIndex(s=>s.id===cpSelected.stateId)} · {{face:'纸面 F',vertex:'顶点 V',edge:'线段 E'}[cpSelected.hit.kind]}{cpSelected.hit.index+1}</h3><button onClick={()=>setCPSelected(null)} title="清除 CP 选择">×</button></header>
          <p className="diagram-note">{cpSelectedMap.highlight?.faces.length?`对应主图纸面 ${cpSelectedMap.highlight.faces.map(f=>'F'+(f+1)).join('、')}`:pose?cpSelectedMap.error:'先计算操作前 CP，查看主图对应位置。'}</p>
          {cpSelectedMap.highlight&&<div className="diagram-cp-pin-actions">{cpSelectedMap.highlight.faces.map(face=><button key={face} disabled={!!busy||paperPulled} onClick={()=>fixCP(face)}>{cpSelected.hit.kind==='vertex'?`固定顶点 · 参考 F${face+1}`:`固定纸面${cpSelectedMap.highlight!.faces.length>1?' · F'+(face+1):''}`}</button>)}</div>}
          {!!foldLink.fixed&&<button className="diagram-full-button" disabled={!!busy} onClick={unfixCP}>取消固定</button>}
          {cpSelected.hit.kind==='vertex'&&cpSelectedMap.highlight&&cpSelectedMap.highlight.faces.length>1&&<p className="diagram-note">顶点连接多个纸面，选择一个邻接纸面来确定固定朝向。</p>}
        </section>}</>);
  const tearWindowControls=selectedTearWindow?<section className="diagram-tear-window-controls" aria-label="撕纸透视设置">
    <NumberField label="透视半径" value={getSymbolParameters(selectedTearWindow).radius*selectedTearWindow.size/100} min={.1} max={10000} step={1} suffix="mm" disabled={!!busy} onChange={radius=>editAnnotation({size:radius*100/getSymbolParameters(selectedTearWindow).radius})}/>
    <p>眼睛按钮只控制圆内纸层。拖动红色定位点移动窗口，拖动蓝色夹点调整大小。</p>
  </section>:undefined;
  const layerContextControls=<div className="diagram-context-content" data-diagram-context="layers">
    {foldControls}
    {cpSelectionControls}
    {(selectedLines.length>0||cpEdgeChosen)&&<section className="diagram-line-selection" aria-label="选中线段设置"><header><h3>{cpEdgeChosen?'CP 折痕':`已选 ${selectedLines.length} 条线段`}</h3>{selectedLines.length>0&&<button className="diagram-selection-properties" onClick={()=>{setTab('drawing');setPropertiesOpen(true);}}>外观与坐标</button>}</header>{creaseActions}{!cpEdgeChosen&&selectedSourceFoldLines.length>0&&<DiagramCreaseTimingControls annotations={annotations} selectedIds={selectedSourceFoldLines.map(line=>line.id)} disabled={!!busy||paperPulled||stale} onChange={changeSelectedAnimationTiming} onSelect={id=>{selectDrawingAnnotations([id]);setTool('select');}}/>}</section>}
  </div>;
  const layerSelectionHint=selectedTearWindow?'选中撕纸透视：点眼睛或纸层行隐藏圆内纸层，圆外保持原样。右击退出设置。':!foldLink.enabled?'启用 CP 联动后，可在叠片或列表选作用纸层。':selectedSourceFoldLines.length?`当前修改已选的 ${selectedSourceFoldLines.length} 条折线；点纸层切换其范围。`:selectedLines.length||cpEdgeChosen?'选择谷折或峰折，设置参与纸层。':tool==='fixed'?'点叠片或列表固定纸面。':layerScopeActive?'点叠片或列表，选择之后画线的作用纸层；右击结束选择。':'未选择折痕。此处设置只影响之后画线；选中折线后可修改其作用纸层。';
  const layerFaceActions=(face:number)=>{
    const checked=selectedSourceFoldLines.length?commonFoldFaces.includes(face):layerScopeActive&&foldLink.layers==='selected'&&foldLink.selectedFaces.includes(face);
    const mixed=selectedSourceFoldLines.length>1&&selectedFoldFaces.includes(face)&&!checked;
    const fixed=fixedSourceFaces.includes(face);
    return <>{layerScopeActive&&<label className="diagram-layer-participation" title={mixed?'部分选中折痕作用于此纸面；点击让全部选中折痕参与':`切换纸面 F${face+1} 是否参与折叠`}><input type="checkbox" aria-label={`参与折叠纸面 F${face+1}`} aria-checked={mixed?'mixed':checked} ref={node=>{if(node)node.indeterminate=!!mixed;}} checked={checked} disabled={!layerScopeEditable} onChange={()=>toggleFoldFace(face)}/><span>参与</span></label>}<button type="button" className="diagram-layer-fix" aria-label={`${fixed?'取消固定':'固定'}纸面 F${face+1}`} aria-pressed={fixed} disabled={!pose||!!busy||paperPulled||stale||pose.sourceStateId!==before.id||!!selectedLines.length&&!foldLink.enabled} title={fixed?'取消此固定侧':'固定这张纸面，保留当前选中的折痕'} onClick={()=>fixed?unfixCP():pose&&fixCP(face,{stateId:pose.sourceStateId,hit:{kind:'face',index:face}})}>固定</button></>;
  };
  const precisionControls=<><DiagramPrecisionToolbar showLineStyles={false} tool={tool} lineStyle={lineStyle} foldAction={foldAction} onFoldAction={chooseFoldAction} disabled={!!busy||paperPulled||overview} angle={canvasSettings.anglePreset??0} pointCount={canvasSettings.constructionPoints?.length??0} precision={precision} onPrecision={setPrecision} onLine={chooseLine} onPointTool={chooseTool} onAngle={angle=>{updateCanvas({anglePreset:angle});chooseTool('line');}} onClearPoints={()=>updateCanvas({constructionPoints:[]})}/></>;
  const paperStateControls=paperVisible&&pose&&<div className="diagram-paper-state-controls">
    <div role="group" aria-label="纸面状态">{(['flat','spatial','pulled'] as const).map(state=><button key={state} disabled={!!busy||stale||state==='spatial'&&!hasNonFlatFoldAngles(pose.sourceDoc)} title={state==='spatial'&&!hasNonFlatFoldAngles(pose.sourceDoc)?'折痕角度均为 0° 或 180°，请使用平整状态':undefined} aria-pressed={(paperPulled?'pulled':step.paperStates?.active??(pose.spatial?'spatial':'flat'))===state} onClick={()=>switchPaperState(state)}>{{flat:'平整状态',spatial:'立体状态',pulled:'拖角状态'}[state]}</button>)}</div>
    <div className="diagram-spatial-view-controls">
      <span className={'diagram-pose-badge'+(stale||otherSource?' is-stale':'')}>{stale?'CP 已更新 · 折图保留':paperPulled?'拖角造型 · 折痕锁定':pose.spatial?((!pose.spatial.camera.rotation&&pose.spatial.camera.yaw===0&&pose.spatial.camera.elevation===0)?'固定面俯视':(!pose.spatial.camera.rotation&&pose.spatial.camera.yaw===OBLIQUE_DIAGRAM_CAMERA.yaw&&pose.spatial.camera.elevation===OBLIQUE_DIAGRAM_CAMERA.elevation)?'斜视 · 30°':'自定义视角'):otherSource?`CP${originIndex} 折图副本`:`来源 CP${originIndex}`}</span>
      {pose.spatial&&<div role="group" aria-label="立体视角快捷切换">
        <button disabled={!!busy||stale||paperPulled} aria-pressed={(!pose.spatial.camera.rotation&&pose.spatial.camera.yaw===0&&pose.spatial.camera.elevation===0)} title="垂直固定纸面观察，保持折痕角度" onClick={()=>{setOrbitMode(false);void changeSpatialCamera({...DEFAULT_DIAGRAM_SPATIAL_CAMERA});}}>俯视</button>
        <button disabled={!!busy||stale||paperPulled} aria-pressed={(!pose.spatial.camera.rotation&&pose.spatial.camera.yaw===OBLIQUE_DIAGRAM_CAMERA.yaw&&pose.spatial.camera.elevation===OBLIQUE_DIAGRAM_CAMERA.elevation)} title="倾斜视角 30° 查看纸面高度，保持折痕角度" onClick={()=>{setOrbitMode(false);void changeSpatialCamera({...OBLIQUE_DIAGRAM_CAMERA});}}>斜视</button>
        <button disabled={!!busy||stale||paperPulled} aria-pressed={orbitMode} title="按住左键自由转动纸面视角，松开应用；Esc 退出" onClick={()=>{resetDrawingSelection();setTool('select');setOrbitMode(value=>!value);}}>转动视角</button>
      </div>}
    </div>
  </div>;
  return <div ref={workspaceElement} className={'diagram-workspace diagram-compact-workspace'+(libraryOpen?' is-library':'')+(propertiesOpen?' has-properties':'')+(centralCP?' is-cp-workspace':'')+(comparison&&!overview?' is-comparison':'')+(comparisonLayers?' with-comparison-layers':'')+(comparisonSymbols?' with-comparison-symbols':'')} data-diagram-workspace="true" data-diagram-layout="compact" data-model-history="true" style={{'--diagram-cp-width':cpWidth+'px'} as CSSProperties} onContextMenu={e=>{if(centralCP||!(e.target as Element).closest('.diagram-model-surface,.diagram-cp-card,[data-diagram-layer-stack]'))return;e.preventDefault();e.stopPropagation();clearDrawingSelection(true);}}>
    {libraryOpen?<DiagramLibrary index={libraryIndex} currentId={documentId} currentProject={project} getThumbnail={getLibraryThumbnail} onOpen={openLibraryDocument} onNew={newLibraryDocument} onImport={open} onSaveCurrent={save} onContinueCurrent={documentId?continueLibraryDocument:undefined} onDelete={requestLibraryDeletion} busy={!!busy||deleting||!!deleteTarget} error={libraryError}
      onCreateFolder={(name,parentId)=>changeLibrary(()=>{library.createFolder(name,parentId);})}
      onMove={(id,folderId)=>changeLibrary(()=>library.moveDocument(id,folderId))}
      onRename={(id,name)=>changeLibrary(()=>{library.renameDocument(id,name);if(id===documentIdRef.current)commit({...projectRef.current,name:name.trim()},false);})}/>:<>
    <aside className="diagram-step-rail"><header><strong>折纸步骤</strong><small>{project.steps.length} 步</small></header><div className="diagram-step-actions"><button onClick={()=>{flushFields();cancelTask();setEditCP(null);commit(appendDiagramStep(projectRef.current));setOverview(false);}}><span>＋</span>新建</button><button onClick={()=>{flushFields();cancelTask();setEditCP(null);commit(duplicateDiagramStep(projectRef.current,step.id));setOverview(false);}}>复制</button><button className="diagram-delete-step" disabled={!!busy||project.steps.length<=1} onClick={deleteStep} title={project.steps.length<=1?'至少保留一个步骤':'删除当前步骤，可撤销'}>删除本步骤</button></div>
      <nav ref={stepRail} aria-label="折序步骤列表">{project.steps.map((item,index)=><button className={'diagram-step-card'+(item.id===step.id?' is-active':'')} key={item.id} aria-current={item.id===step.id?'step':undefined} onClick={()=>switchStep(item.id)}><span className="diagram-step-number">{String(index+1).padStart(2,'0')}</span><div className="diagram-step-thumb"><DiagramThumbnail deferred="rail" imageCache={thumbnailCache} imageSize={thumbnailImageSizes.get(item.id)} editingSession={item.id===thumbnailEditingId?thumbnailEditingSession:undefined} onVisibility={onThumbnailVisibility} preparation={thumbnailPreparation(item.id)} step={item} states={project.states} lineDefaults={lineDefaults} adaptiveLines={adaptiveLines} zoom={thumbnailZooms.get(item.id)?.region}/></div><strong>{item.title||"未命名步骤"}</strong><small>CP{stateIndices.get(item.beforeId)} → CP{stateIndices.get(item.afterId)}</small></button>)}</nav>
      <footer><span className="diagram-status-dot"/>CP 连续衔接 <strong>N＋1</strong></footer>
    </aside>
    <main className="diagram-main" data-drawing-tool={tool}>
      {saveConflict&&<section className="diagram-save-conflict" role="alert" aria-label="绘图保存冲突" data-diagram-save-conflict="true"><div><strong>其他窗口已有新版本</strong><p>当前内容仍保留在本窗口，自动暂存已暂停。另存后可继续编辑。</p></div><div><button type="button" onClick={saveAsNewDrawing}>另存当前绘图</button><button type="button" disabled={backupSaving} onClick={()=>void downloadProjectBackup()}>{backupSaving?'正在保存备份…':'保存工程备份'}</button></div></section>}
      <div className="diagram-document-heading" aria-label="当前绘图"><div className="diagram-document-name"><strong title={project.name}>{project.name}</strong><button disabled={!!busy} onClick={()=>{flushFields();setRenameOpen(true);}}>重命名</button><span className="diagram-step-readout">第 {stepIndex+1} / {project.steps.length} 步 · CP{stepIndex} → CP{stepIndex+1}</span></div><div className="diagram-toolbar-end"><button disabled={!!busy||imageBusy} onClick={()=>imageInput.current?.click()}>{imageBusy?'正在导入…':'插入图片'}</button><button disabled={!!busy||imageBusy} onClick={openSimulationCapture}>三维模拟</button><button disabled={!!busy} onClick={openStepAnimation} title="根据操作前后 CP 预览当前步骤的折叠动作">步骤动画</button><button disabled={!!busy} onClick={openFullAnimation} title="按步骤连续播放整个工程的折叠过程">全程演示</button><button onClick={showLibrary} title="返回折序绘图文档库"><Icon name="folder"/>文档库</button><button title="撤销 Ctrl+Z" disabled={!past.current.length} onClick={undo}><Icon name="undo"/></button><button title="重做 Ctrl+Y" disabled={!future.current.length} onClick={redo}><Icon name="redo"/></button><button aria-pressed={comparison&&!overview} onClick={()=>{setComparison(v=>!v);setEditCP(null);setOverview(false);setPropertiesOpen(false);queuePaperHover(null);}}>左右对照</button><button aria-pressed={overview} onClick={()=>{setEditCP(null);setOverview(v=>!v);}}>整页预览</button><button aria-label="更多属性" aria-expanded={propertiesOpen} aria-controls="diagram-advanced-properties" onClick={()=>setPropertiesOpen(open=>!open)}>更多属性</button></div></div>
      <div className="diagram-unified-tools" role="group" aria-label="绘图工具与精确设置"><div className="diagram-tool-group">
      <button aria-pressed={tool==='select'} onClick={()=>chooseTool('select')}>选择</button>
      <button aria-pressed={tool==='mirror-copy'} disabled={!!busy||!selectedAnnotations.length||(paperPulled&&selectedLines.length>0)} title={!selectedAnnotations.length?'先选择折线或符号，可拖框多选':paperPulled&&selectedLines.length?'切回平整状态或立体状态后镜像复制折痕':'选中对象后，用两点定义镜像轴并预览复制'} onClick={beginMirrorCopy}>镜像复制</button>
      <button disabled={paperPulled} title={paperPulled?'切回平整状态或立体状态后绘制折痕':undefined} aria-pressed={tool==='line'} onClick={()=>chooseTool('line')}>画折线</button>
      <button disabled={paperPulled} aria-pressed={tool==='polyline'} onClick={()=>chooseTool('polyline')}>连续折线</button>
      <button aria-pressed={tool==='pan'} onClick={()=>chooseTool('pan')}>平移</button>
      <button disabled={paperPulled} aria-pressed={tool==='erase'} onClick={()=>chooseTool('erase')}>擦除</button>
      <select disabled={paperPulled} aria-label="构造与修整工具" value={['perpendicular','parallel','bisector','trim','extend'].includes(tool)?tool:''} onChange={e=>{if(e.target.value)chooseTool(e.target.value as DiagramDrawingTool);}}><option value="">构造 / 修整</option><option value="perpendicular">垂线</option><option value="parallel">平行线</option><option value="bisector">角平分线</option><option value="trim">修剪</option><option value="extend">延长</option></select>
      <button aria-pressed={tool==='symbol'} onClick={()=>chooseTool('symbol')}>符号</button>
      {selectedCallout&&<>{selectedCallout.source.kind==='cp'&&<label className="checkbox"><input type="checkbox" disabled={!!busy} checked={selectedCallout.hideExistingCreases??false} onChange={e=>changeCallouts((step.callouts??[]).map(c=>c.id===selectedCallout.id?{...c,hideExistingCreases:e.target.checked}:c))}/>屏蔽已有折痕</label>}<button disabled={!!busy} onClick={()=>setCalloutDialog({type:selectedCallout.source.kind,editId:selectedCallout.id})}>重新选区</button><button disabled={!!busy} onClick={deleteCallout}>删除圆框</button></>}
      <button disabled={!pose||!paperVisible} aria-pressed={tool==='vertex'} onClick={()=>chooseTool('vertex')}>拖角</button>
      <button disabled={!pose||!paperVisible||!!busy||!foldLink.enabled||paperPulled} aria-pressed={tool==='fixed'} onClick={()=>chooseTool('fixed')}>固定侧</button>
    </div>{precisionControls}{paperStateControls}{paperVisible&&simulationSurface&&<div className="diagram-paper-state-controls"><span className="diagram-pose-badge">模拟曲面</span><button disabled={!!busy} aria-pressed={orbitMode} onClick={()=>{resetDrawingSelection();setTool('select');setOrbitMode(value=>!value);}}>转动视角</button></div>}</div>
    <div className="diagram-drafting-bar"><DiagramLineStyleControls lineStyle={lineStyle} defaults={lineDefaults} onLine={chooseLine} onChange={changeLineDefault} disabled={!!busy||paperPulled||overview}/><div className="diagram-grid-inline" role="group" aria-label="网格参数">
      <label><input type="checkbox" disabled={!!busy} checked={canvasSettings.grid} onChange={e=>updateCanvas({grid:e.target.checked})}/>网格</label><label title="端点、交点、垂直和角平分线吸附；Alt 临时关闭"><input type="checkbox" disabled={!!busy} checked={canvasSettings.snap} onChange={e=>updateCanvas({snap:e.target.checked})}/>吸附</label><label><input type="checkbox" disabled={!!busy} checked={canvasSettings.diagonalGrid} onChange={e=>updateCanvas({diagonalGrid:e.target.checked})}/>对角</label>
      <div className="diagram-grid-division-controls" role="group" aria-label="纸张网格等分" title="与折痕编辑一致：纸张横向、纵向分别按等分数划分。"><button type="button" aria-label="网格等分减半" title="等分数减半" disabled={!!busy||canvasGrid.divisions<=GRID_MIN} onClick={()=>updateGridDivisions(adjustGridDivisions(canvasGrid.divisions,-1))}>÷2</button><DiagramIntegerField label="网格等分" disabled={!!busy} value={canvasGrid.divisions} min={GRID_MIN} max={GRID_MAX} onChange={updateGridDivisions}/><button type="button" aria-label="网格等分加倍" title="等分数加倍" disabled={!!busy||canvasGrid.divisions>=GRID_MAX} onClick={()=>updateGridDivisions(adjustGridDivisions(canvasGrid.divisions,1))}>×2</button></div>
    </div>{tool==='symbol'&&<div className="diagram-new-symbol-style" role="group" aria-label="新符号样式"><NumberField label="新符号线宽" value={drawingWidth} min={.05} max={1000} step={.1} disabled={!!busy} onChange={setDrawingWidth}/><label><span>符号颜色</span><ColorPicker aria-label="新符号颜色" value={drawingColor.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i,'#$1$1$2$2$3$3')} disabled={!!busy} onChange={setDrawingColor}/></label></div>}{pose&&<div className="diagram-paper-parameters" role="group" aria-label="纸面参数">
      {(['front','back','line'] as const).map((key,i)=>{const color=key==='line'&&lineDefaults.boundary.globalFields?.includes('color')?lineDefaults.boundary.color:(currentView.colors??defaultModelColors())[key];return <label key={key} title={color.toUpperCase()}><span>{['正面','背面','轮廓'][i]}</span><ColorPicker aria-label={['纸张正面颜色','纸张背面颜色','轮廓线颜色'][i]} disabled={!!busy} value={color} onChange={color=>key==='line'?changeLineDefault('boundary',{color}):updateView({...currentView,colors:{...(currentView.colors??defaultModelColors()),[key]:color}})}/></label>;})}
      <NumberField label="观察旋转" value={currentView.rotation} min={0} max={359.999} suffix="°" disabled={!!busy||!!step.orientationLocked} onChange={rotation=>updateView({...currentView,rotation,cameras:{}})}/>
    </div>}<button type="button" aria-label="固定纸面朝向" aria-pressed={!!step.orientationLocked} className={step.orientationLocked?'active':''} disabled={!!busy} title={step.orientationLocked?'已固定当前朝向；翻面和旋转符号仍在下一步生效，点击解除':'固定当前整图朝向；翻面和旋转符号仍在下一步生效'} onClick={toggleOrientationLock}>{step.orientationLocked?'朝向已固定':'固定朝向'}</button><div><button disabled={!selectedAnnotations.length||!!busy} onClick={copySelection} title="复制选中绘图对象 Ctrl+D">复制选中</button><label title="仅控制已有折痕的显示，不删除 CP；本步折叠线仍显示"><input type="checkbox" checked={currentView.showExistingCreases!==false} disabled={!pose||!!busy} onChange={e=>{resetDrawingSelection();updateView({...currentView,showExistingCreases:e.target.checked});}}/>显示已有折痕</label><button disabled={!pose} aria-pressed={currentView.xray} onClick={()=>updateView({...currentView,xray:!currentView.xray})}>透视</button><button disabled={!pose||!!step.orientationLocked} title={step.orientationLocked?'请先解除固定朝向':undefined} onClick={()=>updateView({...currentView,side:currentView.side==='front'?'back':'front',cameras:{}})}>翻面</button></div></div>
      <div className="diagram-body"><section className="diagram-drawing">{comparison&&!overview&&<header className="diagram-comparison-heading"><strong>主图</strong><span>可直接绘图与选层</span><button aria-pressed={comparisonLayers} onClick={()=>setComparisonLayers(v=>!v)}>纸层面板</button><button aria-pressed={comparisonSymbols} onClick={()=>setComparisonSymbols(v=>!v)}>符号库</button></header>}{overview&&<header className="diagram-drawing-heading"><h2>{project.name}</h2><span>查看各步骤的折图与说明</span></header>}
        {overview?<div className="diagram-overview">{project.steps.map((item,index)=><button key={item.id} onClick={()=>switchStep(item.id)}><div><DiagramThumbnail deferred="overview" imageCache={thumbnailCache} imageSize={thumbnailImageSizes.get(item.id)} editingSession={item.id===thumbnailEditingId?thumbnailEditingSession:undefined} onVisibility={onThumbnailVisibility} preparation={thumbnailPreparation(item.id)} step={item} states={project.states} lineDefaults={lineDefaults} adaptiveLines={adaptiveLines} zoom={thumbnailZooms.get(item.id)?.region}/></div><strong>{diagramPDFStepLabel(item,index)}</strong><p>{item.description||'尚未填写说明'}</p></button>)}</div>:<div className="diagram-edit-layout"><div className="diagram-illustration">
          <div className="diagram-paper-work-area"><aside className="diagram-context-shelf" aria-label="纸层与选择设置">
            {(effectiveZoom||zoomIssue||selectedZoomSymbol||selectedAnnotation?.kind==='symbol'&&selectedAnnotation.symbol==='zoomOut')&&<section className="diagram-zoom-controls" aria-label="局部放大设置">
              <header><h3>{effectiveZoom?'局部放大视图':'下一步视图'}</h3></header>
              {zoomIssue&&<p role="alert">{zoomIssue}</p>}
              {selectedZoomSymbol?.zoomArea&&!selectedZoomRegion&&<p role="alert">当前纸幅无法使用此选区，请重新选择放大区域。</p>}
              {effectiveZoom&&<><p>由第 {project.steps.findIndex(item=>item.id===effectiveZoom.sourceStepId)+1} 步启用，后续步骤保持放大。</p><button type="button" disabled={!!busy} onClick={()=>chooseSymbol('zoomOut')}>放置缩小符号</button></>}
              {selectedZoomSymbol&&<><p>{selectedZoomSymbol.zoomArea?(selectedZoomSymbol.zoomArea.region.kind==='circle'?'圆形选区已设置。':'波浪线分区已设置。'):'请先选择需要放大的区域。'}下一步开始生效。</p><button type="button" disabled={!!busy} onClick={()=>openZoomSelection(selectedZoomSymbol)}>{selectedZoomSymbol.zoomArea?'重新选择放大区域':'选择放大区域'}</button></>}
              {selectedAnnotation?.kind==='symbol'&&selectedAnnotation.symbol==='zoomOut'&&<p>此步仍保持当前视图；下一步恢复完整纸面。</p>}
            </section>}
            {!!images.length&&<DiagramImageControls images={images} selectedId={selectedImageId} paperVisible={paperVisible} disabled={!!busy||imageBusy} onSelect={selectImage} onChange={changeImages} onPaperVisible={visible=>{resetDrawingSelection();changeImages(images,visible);setImageFitToken(value=>value+1);}}/>}
            {paperVisible&&pose?<DiagramLayerStack pose={pose} hoveredFaces={localPaperHighlight?.faces??cpHoverMap.highlight?.faces} selectedFaces={selectedTearWindow?.cutawayFaces??(selectedSourceFoldLines.length?selectedFoldFaces:cpSelectedMap.highlight?.faces??displayedFoldFaces)} fixedFaces={fixedSourceFaces} disabled={!!busy||!active||!!editCP||!!(confirmReplace||fileOpening)||stale} visibilityContext={selectedTearWindow?{label:'撕纸透视 · 圆内',hiddenFaces:selectedTearWindow.cutawayFaces??[]}:undefined} controls={selectedTearWindow?tearWindowControls:layerContextControls} faceActions={selectedTearWindow?undefined:layerFaceActions} selectionHint={layerSelectionHint} analysing={layerAnalysing} analysisError={layerAnalysisError??localSurfaceIssue} analysisUnavailableReason={layerAnalysisUnavailableReason} adjustmentMode={layerOrderEditing} adjustmentFace={layerOrderFace} onAdjustmentModeChange={enabled=>{resetDrawingSelection();setLayerChoice(null);setLayerOrderEditing(enabled);setTool('select');}} onAdjustLayer={adjustLayerOrder} onRelativeConstraints={changeRelativeLayerConstraints} adjustingLayer={!!busy&&layerChoice?.key===layerAnalysisKey&&!layerChoice.error} layerAdjustmentError={layerChoice?.key===layerAnalysisKey?layerChoice.error:undefined} layerAdjustmentFeedback={layerChoice?.key===layerAnalysisKey?layerChoice.feedback:undefined} onAnalyse={retryLayerAnalysis} onHoverFace={face=>{setCPHovered(null);queuePaperHover(face===null?null:{kind:'layer',face});}} onSelectFace={chooseLayerFace} onToggleVisible={toggleLayerVisibility} onShowAll={()=>updateLayerVisibility([])} onHideAll={()=>updateLayerVisibility(pose.result.geometry.faces.map((_,face)=>face))}/>:paperVisible&&simulationSurface?<p className="diagram-context-empty">当前显示保存的模拟曲面。可转动视角、添加符号和说明；重新计算 CP 会替换此姿态。</p>:paperVisible?<><p className="diagram-context-empty">先计算操作前 CP，显示纸层示意并选择作用纸层。</p>{layerContextControls}</>:<p className="diagram-context-empty">本步以图片展示，右侧 CP 保持原有折叠数据。需要继续折纸时，可恢复显示折图纸面。</p>}
          </aside>
          <div className="diagram-model-surface" hidden={!!centralCP}><DiagramDrawingCanvas key={`drawing:${step.id}`} showCursorHint={showCursorHint} onCursorHintChange={onCursorHintChange} zoomRegion={effectiveZoom?.region} zoomSelectionRegion={selectedZoomRegion} callouts={step.callouts} selectedCalloutId={selectedCalloutId??undefined} onSelectCallout={id=>{resetDrawingSelection();setSelectedCalloutId(id);}} onCalloutsChange={changeCallouts} onCreateCallout={chooseCallout} calloutCPMarkup={calloutCPMarkup} lineDefaults={lineDefaults} commandToken={commandActivation} pose={pose} simulationSurface={simulationSurface} annotations={annotations} images={images} paperVisible={paperVisible} onImagesChange={changeImages} selectedImageId={selectedImageId??undefined} onSelectImage={selectImage} fitToken={imageFitToken} tool={tool} lineStyle={lineStyle} foldAction={foldAction} foldAngle={foldAngle} symbol={symbol} color={drawingColor} width={drawingWidth} strokePattern={drawingPattern} selection={selection} onSelect={setSelection} onMove={move} onViewChange={updateView} onDrawingRotationChange={drawingRotation=>updateCanvas({drawingRotation},false)} orientationLocked={!!step.orientationLocked} onAnnotationsChange={applyAnnotations} canvas={canvasSettings} gridPaper={before.doc} paperLocked={paperPulled} precision={precision} onPrecisionPoint={addPrecisionPoint} selectedIds={selectedAnnotationIds} selectedLineFaces={selectedLineFaces} onSelectedIds={selectDrawingAnnotations} onClearSelection={resetDrawingSelection} onDeleteInBox={deleteInBox} mirrorSource={selectedAnnotations} onMirrorCopy={mirrorSelection} onCancelMirrorCopy={()=>setTool('select')} onSymbolPlaced={()=>{setTool('select');setTab('drawing');}} onCancelSymbolPlacement={()=>setTool('select')} disabled={!!busy} active={active&&!orbitMode&&!libraryOpen&&!pdfOpen&&!editCP&&!confirmReplace&&!animationOpen&&!captureTarget&&!calloutDialog&&!zoomDialog} showSymbolBaseline={showSymbolBaseline} foldLinkEnabled={foldLink.enabled&&foldPreview.valid} foldLinkPreview={foldCanvasPreview} foldLinkCP={foldLink.enabled?{before,after:after.doc,precreases:foldLink.precreases}:undefined} foldLinkFixed={showFixedHighlight?fixedCanvasPoint:undefined} selectedFoldFaces={displayedFoldFaces} onPickFixed={pickFixed} onPickLayerPoint={pickFoldLayer} onHoverPaper={point=>{if(point)setCPHovered(null);queuePaperHover(point?{kind:'drawing',point}:null);}} cpHighlight={localPaperHighlight??cpHoverMap.highlight} cpSelectedHighlight={cpSelectedMap.highlight} cpFixedHighlight={showFixedHighlight&&foldLink.enabled?cpFixedMap.highlight:undefined}/>
            {orbitMode&&simulationSurface&&<DiagramSimulationSurfaceOrbit key={`surface-orbit:${step.id}`} surface={simulationSurface} drawingRotation={canvasSettings.drawingRotation??0} onCommit={changeSimulationView} onExit={()=>setOrbitMode(false)}/>}
            <DiagramLocalLayers probe={localLayerProbe} hidden={pose?.hiddenFaces}/>{orbitMode&&pose?.spatial&&!paperPulled&&<DiagramSpatialOrbit key={`orbit:${step.id}`} pose={pose} history={orbitHistory} drawingRotation={canvasSettings.drawingRotation??0} disabled={!!busy} onCommit={changeSpatialCamera} onExit={()=>{if(busy?.kind==='camera')cancelTask();setOrbitMode(false);}}/>}
            <FoldAnglePanel value={selectedFoldAngle} selectionKey={cpSelected??selectedAnnotationIds} selectedCount={cpEdgeChosen?(selectedCPEdgeProperties?.assignment==='M'||selectedCPEdgeProperties?.assignment==='V'?1:0):selectedFoldLines.length} ignoredCount={cpEdgeChosen?0:selectedAnnotationIds.length-selectedFoldLines.length} disabled={!creaseActionEditable} disabledReason={busy?'正在计算，完成后可修改。':paperPulled?'切回平整状态或立体状态后可修改。':stale?'请先重新计算操作前 CP。':undefined} onApply={changeSelectedFoldAngle} allowUnknown unknownLabel="自适应"/>
            {!pose&&!simulationSurface&&!annotations.length&&!images.length&&!step.callouts?.length&&['select','pan','vertex'].includes(tool)&&<div className="diagram-empty diagram-empty-overlay"><div className="diagram-empty-paper"><Icon name="grid"/></div><p className="diagram-eyebrow">从真实 CP 开始绘制</p><h3>这一页还没有折图</h3><p>计算右侧 CP 或采用已有平折模型，<br/>也可以直接画折线、拖入折纸符号。</p><div><button className="diagram-primary" disabled={!!busy} onClick={()=>compute(before.id)}>计算操作前 CP</button></div></div>}
          </div>{centralCP&&centralCPAccess&&<DiagramCPWorkspace key={`${step.id}:${centralCP.id}`} showCursorHint={showCursorHint} onCursorHintChange={onCursorHintChange} doc={centralCP.doc} presentation={{before,pose:step.paperStates?.spatial??step.paperStates?.flat??pose,phase:centralCP.id===before.id?'before':'after',precreases:foldLink.precreases}} gridSettings={{grid:canvasSettings.grid,snap:canvasSettings.snap,diagonalGrid:canvasSettings.diagonalGrid,divisions:canvasGrid.divisions}} onGridSettings={updateCanvas} index={project.states.indexOf(centralCP)} editable={centralCPAccess.editable} reason={centralCPAccess.reason} disabled={!!busy||!active||!!(confirmReplace||fileOpening)||pdfOpen||animationOpen} onCommit={next=>applyCP(centralCP.id,next)} onReturn={()=>exchangeCP(null)} onMessage={message} recovery={centralCPAccess.ownerStepId?{label:'到上一步修改',onClick:()=>editSourceStep(centralCP.id)}:centralCP.id===before.id&&stepIndex===0&&foldLink.enabled&&!paperPulled?{label:'停用联动并编辑初始 CP',onClick:unlockInitialCP}:centralCP.id===after.id&&foldLink.enabled&&!paperPulled&&!centralCPAccess.editable?{label:'重新计算操作前 CP',onClick:()=>void compute(before.id)}:undefined}/>}</div>
          <div className={'diagram-layer-status'+(pose&&pose.result.layers.status!=='solved'?' is-unconfirmed':'')} role="status"><span className="diagram-tool-hint">{tool==='symbol'?`点击放置「${SYMBOL_LABELS[symbol]}」，或从符号库拖入`:TOOL_HINTS[tool]}{['line','polyline'].includes(tool)&&(lineStyle==='valley'||lineStyle==='mountain')?' · '+(foldAction==='precrease'?'预折后展开':'本步折叠'):''}{pose?' · '+paperDisplayStatus:''}</span><span>滚轮缩放 · 中键平移</span></div>
          <section className="diagram-step-caption" aria-label="本步骤内容">
            <label className="diagram-step-title-field" htmlFor="diagram-step-title"><span>标题</span><input id="diagram-step-title" aria-label="步骤标题" value={draftTitle} disabled={!!busy} maxLength={200} placeholder="首次放置符号后自动填写" onChange={e=>editCaption('title',e.target.value)} onBlur={e=>finishCaption('title',e.target.value)}/></label>
            <label className="diagram-step-description-field" htmlFor="diagram-step-description"><span>说明</span><textarea id="diagram-step-description" aria-label="本步说明" value={draftDescription} disabled={!!busy} maxLength={5000} rows={1} placeholder="描述本步骤的折叠动作…" onChange={e=>editCaption('description',e.target.value)} onBlur={e=>finishCaption('description',e.target.value)}/></label>
            <div className="diagram-step-navigation"><button disabled={stepIndex===0||!!busy} onClick={()=>{flushFields();switchStep(projectRef.current.steps[stepIndex-1].id);}}>← 上一步</button><button className="diagram-primary" disabled={!!busy} title={hasReturnInstruction?'恢复返回目标的聚合状态，并保留期间折痕':paperPulled?'进入下一步；CP 未变化时保留当前拖角造型':'操作后 CP → 下步折图'} onClick={nextStep}>下一步 →</button></div>
          </section>
        </div><DiagramSymbolDock selectedSymbol={symbol} placing={tool==='symbol'} disabled={!!busy||!active||!!editCP||!!(confirmReplace||fileOpening)} onChoose={chooseSymbol} onChooseCallout={chooseCallout} onGenerateArrow={generateMainArrow} autoArrowUnavailable={!pose||!paperVisible?'先计算并显示操作前折图':paperPulled?'先切回平整状态或立体状态':stale||otherSource||pose.sourceStateId!==before.id?'先计算最新的操作前折图':undefined}/></div>}
        {busy&&<div className="diagram-compute-status" role="status"><span className="diagram-spinner"/><div><strong>{busy.kind==='camera'?'更新观察视角':busy.kind==='layers'?(layerChoice?'切换纸层方案':'重分析模型层序'):'计算本步平折'}</strong><p>{computeMessage}</p></div><button onClick={()=>{cancelTask();message('已停止本次折序计算。');}}>停止</button></div>}
      </section><PanelDivider label="折图与 CP 区宽度" side="right" value={cpWidth} min={210} max={420} onChange={setCPWidth} onReset={()=>setCPWidth(280)}/>{comparison&&!overview?<aside className="diagram-comparison-cp" aria-label="放大 CP 对照"><nav aria-label="对照 CP 状态"><button aria-pressed={comparisonPhase==='before'} onClick={()=>{setComparisonPhase('before');setCPHovered(null);queuePaperHover(null);}}>操作前 CP{stepIndex}</button><button aria-pressed={comparisonPhase==='after'} onClick={()=>{setComparisonPhase('after');setCPHovered(null);queuePaperHover(null);}}>操作后 CP{stepIndex+1}</button><span>悬停对应高亮 · 点击选面</span></nav>{cpCard(comparisonPhase==='before'?before:after,comparisonPhase,true)}</aside>:<aside className="diagram-cp-shelf">{cpCard(before,'before')}{cpCard(after,'after')}</aside>}</div>
      <ToolCommandBar<DiagramCommand> ref={commandBar} tool={tool==='symbol'?`symbol:${symbol}`:tool} commands={commands} onTool={runDiagramCommand} onFocusCanvas={focusDrawingCanvas} ariaLabel="折序工具命令" placeholder="L 折线 · MI 镜像 · SFOLD 谷折箭头" disabled={!active||!!busy||!!editCP||!!(confirmReplace||fileOpening)||pdfOpen||animationOpen}/>
      <footer className="diagram-footer"><span>{localMessage||'当前步骤独立编辑；相邻步骤共享中间 CP。'}</span><small>{storageMessage}</small></footer>
    </main>
    <aside id="diagram-advanced-properties" className="diagram-properties" hidden={!propertiesOpen}><header className="diagram-inspector-heading"><strong>更多属性</strong><button type="button" aria-label="关闭更多属性" onClick={()=>setPropertiesOpen(false)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header><nav aria-label="折序属性"><button aria-pressed={tab==='drawing'} onClick={()=>{setTab('drawing');if(propertyScroll.current)propertyScroll.current.scrollTop=0;}}>绘图与符号</button><button aria-pressed={tab==='model'} onClick={()=>setTab('model')}>纸层与顶点</button><button aria-pressed={tab==='step'} onClick={()=>setTab('step')}>步骤</button><button aria-pressed={tab==='project'} onClick={()=>setTab('project')}>工程</button></nav><div ref={propertyScroll} className="diagram-property-scroll">
      {tab==='drawing'&&<>
        {legacyPaperFaces&&<section className="diagram-legacy-faces-notice" role="status"><h3>更新预折痕纸面划分</h3><p className="diagram-note">此折图采用旧纸面划分。重新计算操作前 CP 后，已有和预折痕只保留标记，不再增加纸面。</p><button className="diagram-full-button" disabled={!!busy||paperPulled} onClick={()=>compute(before.id)}>重新计算操作前 CP</button></section>}
        
        
        
        {selectedAnnotation?.kind==='symbol'&&selectedSymbolDefinition&&selectedSymbolParameters&&<section className="diagram-symbol-components"><header><h3>符号设置</h3><small>{selectedSymbolDefinition.label}</small></header>
          <label className="diagram-text-field"><span>符号类型</span><select aria-label="选中符号类型" disabled={!!busy} value={selectedAnnotation.symbol} onChange={e=>resetSymbolComponents(e.target.value as DiagramSymbolKind)}>{SYMBOL_CATALOG.map(item=><option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label>
          <DiagramArrowBindingControls pose={pose} annotation={selectedAnnotation} disabled={!!busy} onChange={next=>applyAnnotations(annotations.map(a=>a.id===next.id?next:a))} onMessage={message}/>
          {selectedReturnSymbol&&<div role="group" aria-label="返回步骤设置">
            <label className="diagram-text-field"><span>返回目标步骤</span><select aria-label="返回目标步骤" disabled={!!busy} value={selectedReturnSymbol.returnStepId??''} onChange={event=>setReturnStep(event.target.value)}>
              <option value="">仅图示，不自动返回</option>
              {project.steps.slice(0,stepIndex).map((candidate,index)=>{const ready=returnTargetReady(candidate);return <option key={candidate.id} value={candidate.id} disabled={!ready}>第 {index+1} 步{candidate.title?' · '+candidate.title:''}{ready?'':'（请先生成折图）'}</option>;})}
            </select></label>
            <p className="diagram-note">{stepIndex===0?'当前没有更早的步骤可返回。':selectedReturnSymbol.returnStepId?'点击“下一步”后恢复目标步骤的聚合状态；期间新增折痕保留为已有折痕。符号编号随步骤顺序更新。':'选择一个目标步骤，启用下一步自动返回。'}</p>
            {project.steps.find(candidate=>candidate.id===selectedReturnSymbol.returnStepId)?.paperStates?.active==='pulled'&&<p className="diagram-note">目标正在显示拖角图示，将采用它保存的平整或立体聚合状态。</p>}
          </div>}
          <p className="diagram-note">拖动画布上的控制点调整形状，拖动红点移动位置。Alt 临时暂停吸附。</p>
          {isDiagramRepeatSymbol(selectedAnnotation.symbol)&&<div className="diagram-coordinate-row"><NumberField label="重复符号画面角度" value={diagramRepeatVisualAngle(selectedAnnotation,canvasSettings.drawingRotation??0)} min={-360000} max={360000} suffix="°" disabled={!!busy} onChange={angle=>anchoredSymbol(setDiagramRepeatVisualAngle(selectedAnnotation,angle,canvasSettings.drawingRotation??0))}/><button type="button" disabled={!!busy} onClick={()=>anchoredSymbol(setDiagramRepeatVisualAngle(selectedAnnotation,0,canvasSettings.drawingRotation??0))}>摆正</button></div>}
          {isDiagramRotationSymbol(selectedAnnotation.symbol)&&<><NumberField label="旋转角度" value={diagramSymbolTurnAngle(selectedAnnotation)} min={0} max={360} step={1} suffix="°" disabled={!!busy} onChange={turnAngle=>editAnnotation({turnAngle})}/><p className="diagram-note">双击符号中央的角度可直接编辑；下一步自动按箭头方向旋转。</p></>}
          {!selectedReturnSymbol?.returnStepId&&(selectedCadDefinition?selectedCadDefinition.attributes.map((attribute,index)=><DiagramCadAttributeField key={selectedAnnotation.id+':'+attribute.key} label={attribute.label} value={selectedAnnotation.cadAttributes?.[attribute.key]??(index===0?selectedAnnotation.text:undefined)??attribute.defaultValue} disabled={!!busy||attribute.editable===false} onChange={value=>editCadAttribute(attribute.key,value)}/>):selectedSymbolDefinition.textLabel&&<label className="diagram-text-field"><span>{selectedSymbolDefinition.textLabel}</span><input aria-label="符号编号文字" value={draftSymbolText} maxLength={200} placeholder="留空使用默认编号" onChange={e=>setDraftSymbolText(e.target.value)} onBlur={e=>{if(e.target.value!==(selectedAnnotation.text??''))editAnnotation({text:e.target.value});}}/></label>)}
          <div className="diagram-button-row"><button disabled={!!busy} aria-pressed={!!selectedAnnotation.mirrored} onClick={()=>anchoredSymbol({...selectedAnnotation,mirrored:!selectedAnnotation.mirrored})}>反向符号</button><button disabled={!!busy} onClick={()=>resetSymbolComponents()}>恢复默认形状</button></div>
          <details className="diagram-precision-settings" key={selectedAnnotation.id+':'+selectedAnnotation.symbol}><summary>精确形状参数</summary>
          <div className="diagram-component-fields">
            {selectedSymbolBaseline&&<NumberField label="基线长度" value={selectedSymbolBaseline.length} min={.001} max={1e6} step={1} disabled={!!busy} onChange={resizeSymbolBaseline}/>}
            {selectedCadDefinition?selectedCadDefinition.parameters.map(parameter=>{
              const value=selectedAnnotation.cadProperties?.[parameter.key]??parameter.defaultValue,disabled=!!busy||!parameter.editable;
              return parameter.type==='boolean'?<label className="diagram-cad-flip-field" key={parameter.key} title={parameter.description}><span>{parameter.label}</span><input type="checkbox" aria-label={parameter.label} disabled={disabled} checked={value===1} onChange={e=>editCadProperty(parameter.key,e.target.checked?1:0)}/></label>:parameter.type==='choice'?<label className="diagram-text-field" key={parameter.key} title={parameter.description}><span>{parameter.label}</span><select aria-label={parameter.label} disabled={disabled} value={value} onChange={e=>editCadProperty(parameter.key,Number(e.target.value))}>{parameter.values!.map(option=><option key={option} value={option}>{option}</option>)}</select></label>:<NumberField key={parameter.key} label={parameter.label} value={value} min={parameter.min} max={parameter.max} step={parameter.step} suffix={parameter.unit} disabled={disabled} onChange={value=>editCadProperty(parameter.key,value)}/>;
            }):selectedSymbolDefinition.parameters.filter(parameter=>!selectedSymbolBaseline||parameter.key!=='length'&&parameter.key!=='height').map(parameter=>parameter.key==='count'?<DiagramIntegerField key={parameter.key} label={parameter.label} value={selectedSymbolParameters[parameter.key]} min={parameter.min} max={parameter.max} disabled={!!busy} onChange={value=>editSymbolParameter(parameter.key,value)}/>:<NumberField key={parameter.key} label={parameter.label} value={selectedSymbolParameters[parameter.key]} min={parameter.min} max={parameter.max} step={parameter.step} disabled={!!busy} onChange={value=>editSymbolParameter(parameter.key,value)}/>)}
          </div>
          {selectedSymbolBaseline&&<label className="diagram-guide-toggle"><input type="checkbox" checked={showSymbolBaseline} onChange={e=>setShowSymbolBaseline(e.target.checked)}/>显示符号基线</label>}
          {!selectedIsCad&&!selectedTearWindow&&<button className="diagram-full-button" disabled={!!busy} onClick={()=>adoptCadSymbol(selectedAnnotation.symbol,true)}>使用标准符号结构</button>}
          {!selectedIsCad&&selectedAnnotation.curveControl&&<p className="diagram-note">旧格式曲线已保留；输入弧度可恢复预设曲线。</p>}
          </details>
        </section>}
        {selectedAnnotations.length>0&&objectControls}
        {!!annotations.length&&<section><header><h3>本步绘图对象</h3><small>{annotations.length} 个</small></header><div className="diagram-object-list">{annotations.map((a,index)=><button key={a.id} aria-pressed={selectedAnnotationIds.includes(a.id)} onClick={e=>{setTool('select');selectDrawingAnnotations(e.shiftKey?(selectedAnnotationIds.includes(a.id)?selectedAnnotationIds.filter(id=>id!==a.id):[...selectedAnnotationIds,a.id]):[a.id]);setSelection(emptySelection());setOverview(false);}}><span>{String(index+1).padStart(2,'0')}</span>{a.kind==='line'?LINE_LABELS[a.style]+(a.foldAction==='precrease'?' · 预折后展开':''):SYMBOL_LABELS[a.symbol]}</button>)}</div></section>}
      </>}
      {tab==='model'&&<>{(pose?.spatial||hasNonFlatFoldAngles(before.doc)||hasNonFlatFoldAngles(after.doc))&&<section aria-label="空间视角"><header><h3>空间视角</h3></header><div className="diagram-coordinate-row"><NumberField label="空间旋转" value={spatialCamera.yaw} min={-360} max={360} suffix="°" disabled={!!busy||paperPulled||stale} onChange={yaw=>setSpatialCamera(camera=>({...camera,yaw}))}/><NumberField label="空间俯仰" value={spatialCamera.elevation} min={-360} max={360} suffix="°" disabled={!!busy||paperPulled||stale} onChange={elevation=>setSpatialCamera(camera=>({...camera,elevation}))}/></div><div className="diagram-button-row"><button disabled={!!busy||paperPulled||stale} onClick={()=>{setOrbitMode(false);void (pose?.spatial?changeSpatialCamera(spatialCamera):compute(pose?.sourceStateId??before.id,false,true,true,undefined,spatialCamera));}}>应用空间视角</button><button disabled={!!busy||paperPulled||stale} onClick={()=>{setOrbitMode(false);void (pose?.spatial?changeSpatialCamera({...DEFAULT_DIAGRAM_SPATIAL_CAMERA}):compute(pose?.sourceStateId??before.id,false,true,true,undefined,{...DEFAULT_DIAGRAM_SPATIAL_CAMERA}));}}>固定面俯视</button></div><p className="diagram-note">默认垂直固定纸面俯视。点画布上方“转动视角”后按住左键旋转，松开应用；也可在此输入角度。折角保持不变。</p></section>}<section><header><h3>模型来源</h3><small>{pose?.spatial?'空间折叠结果':'平折结果'}</small></header>{pose?<div className="diagram-source-box"><Icon name="grid"/><div><strong>CP{originIndex} · {paperPulled?'拖角状态':pose?.spatial?'空间模型':'平整模型'}</strong><small>{stale?'来源 CP 已变化，可重新计算更新。':otherSource?'复制自其他步骤的 CP；可计算本步前后 CP 更新。':'保留独立顶点与视图副本。'}</small></div></div>:<p className="diagram-note">先计算 CP 或采用已有平折模型。</p>}<p className="diagram-field-caption">采用折痕编辑区当前平折模型</p><div className="diagram-button-row"><button disabled={!model||!!busy||!getDiagramCPEditAccess(project,step.id,before.id).editable} title={getDiagramCPEditAccess(project,step.id,before.id).reason} onClick={()=>adoptCurrent(before.id)}>采用到操作前 CP</button><button disabled={!model||!!busy||!getDiagramCPEditAccess(project,step.id,after.id).editable} title={getDiagramCPEditAccess(project,step.id,after.id).reason} onClick={()=>adoptCurrent(after.id)}>采用到操作后 CP</button></div><p className="diagram-note">会将该模型的来源 CP 复制到选定状态；相邻步骤共享此 CP 的更新。</p>{pose&&<button className="diagram-full-button" disabled={!!busy} onClick={()=>compute(pose.sourceStateId,true)}>重分析修改后的层序</button>}</section>
      <section><header><h3>重合顶点</h3><small>{selection.group.length?`${selection.group.length} 个成员`:'尚未选择'}</small></header><p className="diagram-note">点击折图上的角，选择要移动的原始顶点成员。</p>{selection.group.length?<><div className="diagram-members">{selection.group.map(index=><label key={index} className={selection.selected.includes(index)?'is-selected':''}><input type="checkbox" checked={selection.selected.includes(index)} disabled={!!busy} onChange={()=>setSelection(previous=>({...previous,selected:previous.selected.includes(index)?previous.selected.filter(i=>i!==index):[...previous.selected,index]}))}/><span>顶点 V{index+1}</span><small>{graph?.vertices_coords[index]?.map(round).join(', ')}</small></label>)}</div><div className="diagram-button-row"><button onClick={()=>setSelection(previous=>({...previous,selected:[...previous.group]}))}>选择全部</button><button onClick={()=>setSelection(previous=>({...previous,selected:previous.group.slice(0,1)}))}>只选一个</button></div></>:<div className="diagram-property-empty">在主画面选中一个纸角</div>}{graph&&pose&&<details className="diagram-unfolded"><summary>在展开 CP 上选择顶点</summary><UnfoldedVertexMap source={graph} selection={selection} disabled={!!busy} onChoose={index=>{setTool('vertex');setSelection(previous=>selectFoldedVertex(diagramPaperVertices(pose),previous,index,'unfolded'));}}/><button className="diagram-full-button" disabled={!!busy||paperPulled} onClick={regenerateCleanPose}>合点并重新生成折图</button><p className="diagram-note">合并来源 CP 的多余共线点、删除重复线段，再更新此顶点图和折图。会替换本步二维修形，可撤销；独立材料切口保留。</p></details>}</section>
      {selectionPoint&&<section><header><h3>纸角位置</h3><small>二维模型坐标</small></header><div className="diagram-coordinate-row"><NumberField label="X 坐标" value={selectionPoint[0]} disabled={!!busy} onChange={x=>move(selection,[x,selectionPoint[1]])}/><NumberField label="Y 坐标" value={selectionPoint[1]} disabled={!!busy} onChange={y=>move(selection,[selectionPoint[0],y])}/></div><p className="diagram-note">修改选中成员，不改变 CP。修形会使原层序失效。</p></section>}
      <section><h3>立体姿态</h3><p className="diagram-note">为谷折或峰折设置 0～180°，下一步主图与步骤动画按目标角度折叠。空间视角可调整观察方向；拖角用于图示修形，可恢复到原折叠姿态。</p></section></>}
      {tab==='step'&&<section><h3>CP 连续关系</h3><div className="diagram-state-chain"><strong>CP{stepIndex}</strong><span>→ 第 {stepIndex+1} 步 →</span><strong>CP{stepIndex+1}</strong></div><p className="diagram-note">共 {project.steps.length} 个步骤、{project.states.length} 个 CP 状态。中间状态由相邻两步共享。</p></section>}
      {tab==='project'&&<><section><h3>折序工程</h3><label className="diagram-text-field"><span>工程名称</span><input aria-label="折序工程名称" value={draftName} onChange={e=>setDraftName(e.target.value)} maxLength={200} onBlur={e=>{const name=e.target.value.trim();if(name)commit({...projectRef.current,name});else setDraftName(project.name);}}/></label><div className="diagram-button-row"><button onClick={open}>打开工程</button><button className="diagram-primary" onClick={save}>保存工程</button></div><button className="diagram-full-button" onClick={openPDFExport}>导出图解 / 步骤图片</button><div className="diagram-button-row"><button disabled={backupSaving} onClick={()=>void downloadProjectBackup()}>{backupSaving?'正在保存备份…':'保存工程备份'}</button><button disabled={svgExporting||!pose&&!annotations.length&&!images.length&&!step.callouts?.length} onClick={()=>void exportDrawing()}>{svgExporting?"正在导出…":"当前步骤 SVG"}</button></div><p className="diagram-note">折序工程独立保存，包含 CP 状态链、步骤说明、模型修形、绘图折线、折纸符号与观察视图。</p></section><section><h3>本地草稿</h3><p className="diagram-note">{storageMessage}。切换工作区保留内容，重新打开应用时恢复本地暂存。</p><button className="diagram-full-button" onClick={newFromCurrentCP}>从当前 CP 新建折序工程</button></section></>}
    </div><footer>{project.steps.length} 个步骤 / {project.states.length} 个 CP 状态</footer></aside></>}
    <input ref={openInput} hidden type="file" accept=".json,.diagram.json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void readDiagramFile(file);}}/>
    <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importImage(file);}}/>
    <input ref={cpInput} hidden type="file" accept=".json,.fold,.cp,.opx,.ori,.orh" onChange={async e=>{const file=e.target.files?.[0],target=importTarget.current;importTarget.current=null;e.target.value='';if(!file||!target)return;try{const result=await readProjectFile(file);if(!mounted.current)return;if(!activeRef.current||projectRef.current!==target.project){message('读取期间工程或步骤已变化，未覆盖当前 CP；请重新导入。');return;}applyCP(target.stateId,result.doc,result.warnings);}catch(cause){message(errorText(cause));}}}/>
    {renameOpen&&active&&<RenameDiagramDialog name={project.name} onRename={renameCurrentProject} onClose={()=>setRenameOpen(false)}/>}
    {deleteTarget&&active&&<AppDialog title="删除绘图" aria-label="删除绘图确认" data-delete-document="diagram" data-delete-document-id={deleteTarget.id} size="small" className="diagram-library-window" onClose={cancelLibraryDeletion} initialFocusRef={deleteCancel} busy={deleting} closeDisabled={deleting} footer={<><button ref={deleteCancel} type="button" className="ui-button" onClick={cancelLibraryDeletion} disabled={deleting}>取消</button><button type="button" className="ui-button is-danger" onClick={()=>void deleteLibraryDocument()} disabled={deleting||!!busy}>删除绘图</button></>}><p>确定删除绘图「<strong className="document-delete-name">{deleteTarget.name}</strong>」？</p><p>此绘图的草稿和手动保存版本都会删除，且无法恢复。建议先下载工程备份。</p>{libraryError&&<p role="alert">删除未完成：{libraryError}</p>}</AppDialog>}
    {fileOpening&&active&&<DiagramFileOpeningDialog state={fileOpening} onCancel={cancelFileImport}/>}
    {confirmReplace&&active&&<ReplaceProjectDialog name={confirmReplace.name} onCancel={()=>{const {action,...details}=replacementLog.current;recordActivity(`${action}.cancel`,{...details,stage:'replace'});setConfirmReplace(null);}} onSave={save} onOpen={()=>void (confirmReplace instanceof File?loadDiagramFile(confirmReplace):completeProjectReplacement(confirmReplace))}/>}
    {zoomDialog&&active&&!libraryOpen&&zoomDialog.stepId===step.id&&<DiagramZoomRegionDialog svg={drawingSVG(pose,annotations.filter(annotation=>annotation.id!==zoomDialog.annotation.id),'','',foldPreview.valid?foldPreview.preview:undefined,images,paperVisible,lineDefaults,step.callouts,calloutCPMarkup,{enabled:adaptiveLines},undefined,0,simulationSurface)} bounds={zoomDialog.bounds} initial={zoomDialog.initial} onConfirm={confirmZoomRegion} onClose={()=>setZoomDialog(null)}/>}
    {calloutDialog&&active&&<DiagramCalloutDialog type={calloutDialog.type} initialSourcePoint={calloutDialog.sourcePoint} initialCallout={calloutDialog.editId?step.callouts?.find(item=>item.id===calloutDialog.editId):undefined} pose={pose} annotations={annotations} images={images} lineDefaults={lineDefaults} before={before} after={after} mainSVG={calloutMainSVG} onConfirm={createCallout} onClose={()=>setCalloutDialog(null)}/>}
    {pdfOpen&&active&&<DiagramPDFExport editorDoc={doc} project={project} lineDefaults={lineDefaults} options={pdfOptions} onOptionsChange={onPDFOptionsChange} onClose={()=>setPDFOpen(false)} onMessage={message}/>}
    {captureTarget&&active&&!libraryOpen&&captureTarget.stepId===step.id&&<DiagramSimulationCapture colors={currentView.colors??defaultModelColors()} onApplyAngles={applySimulationAngles} onApplySurface={applySimulationSurface} before={before.doc} after={after.doc} title={step.title||`第 ${stepIndex+1} 步`} onClose={()=>setCaptureTarget(null)} onCapture={(capture,name,signal)=>insertSimulationImage(capture,name,captureTarget.stepId,captureTarget.generation,signal)}/>}
    {fullAnimation&&active&&!libraryOpen&&fullAnimation===project&&<DiagramFullAnimation project={fullAnimation} initialIndex={stepIndex} onClose={closeFullAnimation}/>}
    {stepAnimation&&active&&!libraryOpen&&stepAnimation.source===project&&<DiagramStepAnimation clip={stepAnimation.clip} revision={stepAnimation.revision} title={stepAnimation.title} onClose={closeStepAnimation} onCapture={(capture,name,signal)=>insertSimulationImage(capture,name,step.id,fileGeneration.current,signal)}/>}
  </div>;
});
export default DiagramWorkspace;



