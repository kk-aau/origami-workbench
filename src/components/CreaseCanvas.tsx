import CanvasGuidanceOverlay from './CanvasGuidanceOverlay';
import {creasePaintOrder} from '../app/creasePaintOrder';
import { useEffect, useId, useMemo, useRef, useState,type ReactNode } from 'react';
import {defaultCanvasPicking,pickingWorldRadius,type CanvasPicking} from '../app/canvasPicking';
import {defaultCanvasZoom,wheelZoomFactor,type CanvasZoomSettings} from '../app/canvasZoom';
import type { Doc, Point, Assignment, Segment } from '../core/types';
import ColorPicker from '../ui/ColorPicker';
import { validateDoc } from '../core/types';
import {paperGridGeometry,diagonalGridPaths,triangularGridTile,type GridPattern} from '../app/gridGeometry';
import {DEFAULT_GRID_DIVISIONS} from '../app/gridControls';
import {DIAGNOSTIC_HIGHLIGHT_COLOR,type DiagnosticHighlights} from '../app/diagnosticHighlights';
import {pointBounds} from '../core/pointBounds';
import { COLORS, NAMES, distance, distanceToSegment, line } from '../app/state';
import {applyDrawingFoldAngle} from '../app/foldAngles';
import type {CreaseSegmentPresentation} from '../app/diagramCPPresentation';
import { getDrawingBounds, getPaperBounds, getGridReferenceBounds, paperPath, paperFillRule } from '../app/paper';
import { constructionEnd, directionCandidates, perpendicularFoot, referenceDirection } from '../app/construction';
import { editorJunctionPoints, nearestSnapPoint, type SnapPoint } from '../app/snapPoints';
import {useCreaseTopology} from '../app/useCreaseTopology';
import {creaseJunctionPresentation,creaseJunctionPage} from '../app/creaseJunctionPresentation';
import {creaseGridRayIntersections,creaseRayHasPhysicalPoint,snapCreaseDrawingPoint,visibleCreaseSnapPoints,type CreaseDrawingSnapGrid,type CreaseDrawingSnapResult} from '../app/creaseDrawingSnap';
import DiagramLineSnapOverlay from './DiagramLineSnapOverlay';
import CanvasCursorHintToggle from './CanvasCursorHintToggle';
import type {DiagramLineAnnotation} from '../app/diagramAnnotations';
import { getAngleBisector, intersectBisectorTarget } from '../app/bisector';
import { eraseBoxMode, pickEraseSegment, segmentsInEraseBox, segmentsInBox } from '../app/erase';
import ToolGuide, { getToolStep } from './ToolGuide';
import DrawingObjects from './DrawingObjects';
import {appendMark,deleteMarks,markHits} from '../app/markTools';
import {MARK_COLORS,readMarkColor,saveMarkColor,type MarkColor} from '../app/markSettings';
import { checkRegionFold, type RegionFoldCheck } from '../app/regionFoldCheck';
import { applyCustomColor } from '../app/customColor';
import {creaseLineStroke,creaseShortLineTitle} from '../app/creaseLineStyle';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
import {creaseVertexShape} from '../app/creaseVertices';
import {DISPLAY_PIXEL_MM,defaultCreaseDisplay,type CreaseDisplay} from '../app/creaseDisplay';
import {defaultGridAppearance,type GridAppearance} from '../app/gridAppearance';
import type {DisplayLayers} from '../app/displayLayers';
import {editableCanvasSelection} from '../app/canvasSelection';
import {canvasInteractionDocument,canvasSelectableIncidentIds} from '../app/canvasInteraction';
import { customColorTargets } from '../app/customColorTargets';
import { toggleVoronoiSite } from '../app/voronoi';
import { useVoronoi } from '../app/useVoronoi';
import TextParameters, { type TextDraft } from './TextParameters';
import { appendText, updateText, deleteTexts, pickText, textIdsInBox, TEXT_DEFAULTS } from '../app/textTools';
import type { TextObject } from '../app/textLayout';
import {backgroundMatrix,backgroundCorners,registerBackground} from '../app/backgroundPlacement';
import {backgroundInView,backgroundViewTransform,registeredScreenBackground,type BackgroundView} from '../app/backgroundAnchor';
import {beginFrameDrag,updateFrameDrag,finishFrameDrag,frameCorners,type OperationFrame,type FrameDrag} from '../app/operationFrame';
import { NumberField } from './Fields';
import { divideSegment, divisionParameters, extendSegment, lengthenSegment, perpendicularBisector, ratioParameter, trimSegment } from '../app/segmentTools';
import { insertVertex, mergeVertex, mergeCrossTypeVertex, regularPolygon } from '../app/vertexPolygon';
import { epsilonFor } from '../core/geometry';
import { appendCircle, circleGeometry, circleThroughThree, circleSnapPoints, pickCircle, circleIdsInBox, updateCircle, type CircleGeometry, type CircleObject } from '../app/circleTools';
import {pickCanvasObject} from '../app/canvasObjectPicking';
import CircleParameters from './CircleParameters';
import {separateCircle,concentricCircle,externallyTangentPair,pointTangents,commonTangents,circleIntersectionPoints,type Tangent} from '../app/circleConstructions';
import {invertCircle,invertSupportingLine,radiusDifferenceCircle,sameCircle,type InversionResult} from '../app/inversion';
import {lineTarget} from '../app/segmentTools';
import {mirrorCopies,reflectPoint,toggleMirrorSelection,mirrorEnvelope,inMirrorRegion} from '../app/mirror';
import { reflectionRay, reflectionEnd, lineReflectionPoints } from '../app/reflection';
import { transverseReflection } from '../app/transverseReflection';
import { continuousReflection } from '../app/continuousReflection';
import { rabbitEar } from '../app/rabbitEar';
import { fishbone } from '../app/fishbone';
import { cycleCrease } from '../app/cycleCrease';
import {advanceCrease} from '../app/advanceCrease';
import { axiom5, axiom7, axiomCutoff, axiomFullSegment, type AxiomFold } from '../app/axioms';
import { uncoveredCopies } from '../app/mirror';
import { lineBisector, lineBisectorCutoff, parallelMidlineCutoffs, parallelMidlineFull, type LineBisector } from '../app/lineBisector';
import { parallelOffsets } from '../app/parallelOffset';
import {angleOffsets,angleFan,angleRayCutoff,snapAnglePoint,snapAnglePointOnDirection} from '../app/angleSystem';
import {constructionFan,convergenceFans,angleConvergence,angleProjection,type AngleCandidate} from '../app/angleConstructions';
import {localFlatCandidates,localFlatCutoff,type LocalFlatCandidate} from '../app/localFlatFold';
import {beginFoldableInput,chooseFoldableDirection,pickFoldableDirection,setFoldableEndpoint,finishFoldableInput,type FoldableInput} from '../app/foldableInput';
import {foldableDrawMode,foldableDrawAssignment,finishFoldableDraw,type FoldableDrawMode} from '../app/foldableDraw';
import MeasurementField from './MeasurementField';
import TileDecorationLayer from './TileDecorationLayer';
import type {DecoratedTile,TileDecorations} from '../app/tileDecorations';
import AngleParameters from './AngleParameters';
import {activeAngleSystem,readAngleSettings,saveAngleSettings,validateAngleSettings} from '../app/angleSettings';
import {applyDrawingSelectionTransform,previewCircleTransform,drawingRotationReference,previewSelectionTransform,rotationCopyOrbit,type SelectionTransform} from '../app/selectionTransform';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {constructMaterialCopy,previewMaterialConstructionCopy} from '../app/materialConstructionCopy';
import {constructMaterialMove} from '../app/materialConstructionMove';
import type {EditorMaterialIntent} from '../app/editorCommit';
import {reflectMaterialEdge,type MaterialEdgeReflectIntent} from '../core/materialReflect';
import {segmentsInSelectionRegion,segmentsCrossingSelectionLine,updateRegionSelection} from '../app/selectionRegions';
import {LINE_TYPE_FILTERS,typeFilterHits,applyTypeFilter,type LineTypeFilter,type TypeFilterArea} from '../app/typeFilter';
import {regionalSwapHits,applyRegionalSwap} from '../app/regionalSwap';
import {restrictedDrawingPoint,appendRestrictedDrawing,type RestrictedAnchors} from '../app/restrictedDrawing';
import {rayConstructionGeometry,appendRayConstruction} from '../app/rayConstruction';
import {lineEraseHits} from '../app/lineErase';
import {directAssignmentHits,applyDirectAssignment,type DirectAssignment} from '../app/directAssignment';
import {appendDividedLine,dividedLineSegments,defaultDrawRatio,radicalValue,type DrawDivision} from '../app/dividedLine';
import {overlayDrawnSegments} from '../app/drawOverlay';
import {canSwapGeneratedLines,generatedAssignment,swapGeneratedLines} from '../app/drawingSwap';
import {applyMaterialGeneratedSwap,type MaterialGeneratedConstruction} from '../app/materialGeneratedSwap';
import {alternateAssignmentHits,applyAlternateAssignment} from '../app/alternateAssignment';
import {measureLength,measureAngle,type Measurements,type MeasurementRegister,type LengthRegister} from '../app/measurements';
import CreaseGpuLayer from './CreaseGpuLayer';
import CanvasTargetMarker from './CanvasTargetMarker';
import {CREASE_GPU_THRESHOLD,creaseGpuHoverTitle,type CreaseGpuScene} from './creaseGpuRenderer';
import {recordActivity} from '../app/activityLog';
const REFERENCE_COLOR = '#8052ad';
import { TOOL_NAMES, type Tool } from '../app/tools';
export { TOOL_NAMES, type Tool } from '../app/tools';
interface Props {
  /** SVG remains available for deterministic export/compatibility comparisons. */
  renderBackend?:'auto'|'svg';
  commandToken?:number;
  diagnosticHighlights?:DiagnosticHighlights;
  overlay?:ReactNode;
  targetPoint?:Point;
  navigationTargetLabel?:string;
  overlayNavigation?:{onZoom:(factor:number)=>void;onFit:()=>void};
  svgOverlay?:(viewport:{view:{x:number;y:number;w:number;h:number};units:number})=>ReactNode;
  /** A new request focuses source CP coordinates without changing the document. */
  focusRegion?:{points:Point[]};
  tileDecoration?:{tiles:DecoratedTile[];options:TileDecorations;mode?:'mother'|'cp'};
  workspaceLabel?:string;
  pickingSettings?:CanvasPicking;
  zoomSettings?:CanvasZoomSettings;
  display?:CreaseDisplay;
  onCursorHintChange?:(enabled:boolean)=>void;
  onToolGuideChange?:(enabled:boolean)=>void;
  cropBusy?:boolean;onBackgroundCrop?:()=>void;onCancelBackgroundCrop?:()=>void;
  operationFrame?:OperationFrame|null;onOperationFrameChange?:(frame:OperationFrame|null)=>void;onFrameExport?:()=>void;
  onBackgroundViewChange?:(view:BackgroundView)=>void;
  measurements:Measurements; lengthDetails:Partial<Record<LengthRegister,ReturnType<typeof measureLength>>>;
  onMeasurement:(register:MeasurementRegister,value:number,detail?:ReturnType<typeof measureLength>)=>void;
  doc:Doc; selected:Set<string>; onSelect:(ids:Set<string>)=>void; onChange:(doc:Doc,completedSelection?:Set<string>,intent?:EditorMaterialIntent)=>boolean|void;
  selectedCircles?:ReadonlySet<string>;onSelectCircles?:(ids:Set<string>)=>void;
  /** Magnitude for newly drawn mountain/valley creases, not copies or old fragments. */
  drawingAngle?:number|null;
  /** Only newly generated creases exchange mountain/valley, without changing the active tool. */
  drawingSwap?:boolean;
  onDrawingSwapChange?:(enabled:boolean)=>void;
  /** Per-view display only, used by the diagram CP workspace. */
  solidCreases?:boolean;
  adaptiveLineStyle?:boolean;
  segmentPresentation?:ReadonlyMap<string,CreaseSegmentPresentation>;
  tool:Tool; preset:Assignment; grid:boolean; gridScope?:'paper'|'canvas'|'off'; diagonalGrid?:boolean; diagonalAngle?:number; gridPattern?:GridPattern; gridRotation?:number; divisions:number; snap:boolean; lockBoundary:boolean; gridAppearance?:GridAppearance;
  displayLayers:DisplayLayers; onDisplayLayersChange:(layers:DisplayLayers)=>void;
  onPoint:(p:Point)=>void; onMessage:(s:string)=>void; fitToken:number; readOnly?:boolean;
}
export default function CreaseCanvas(input:Props) {
  const display=input.display??defaultCreaseDisplay();
  const topology=useCreaseTopology(input.doc,!!input.readOnly,display.pointSize>0);
  const topologyBlocked=!input.readOnly&&!topology.ready;
  // A temporary edit lock must never become the worker's readOnly input.
  // Navigation remains live, while no tool can commit against partial points.
  const p:Props=topologyBlocked?{...input,readOnly:true,onChange:()=>{input.onMessage('交点尚未准备完成，请等待或重试后再编辑。');return false;}}:input;
  const drawingSwap=!!p.drawingSwap&&canSwapGeneratedLines(p.tool);
  const drawingAssignment=generatedAssignment(p.preset,drawingSwap);
  const drawingLine=(a:Point,b:Point,assignment:Assignment,angle?:number|null)=>swapGeneratedLines(applyDrawingFoldAngle([line(a,b,assignment,angle)],p.drawingAngle),drawingSwap)[0];
  const material=useMemo(()=>hasMaterialTopology(p.doc)?inspectMaterialTopology(p.doc):null,[p.doc]);
  const materialSelected=(ids:readonly string[])=>material?.ok&&ids.some(id=>material.edgeSegmentIds.includes(id));
  const materialPreview=(request:Parameters<typeof previewMaterialConstructionCopy>[1])=>{
    if(material?.ok){const chosen=new Set(request.segmentIds);for(const c of material.components){const count=c.edges.filter(e=>chosen.has(material.edgeSegmentIds[e])).length;if(count&&count!==c.edges.length)throw new Error('材料构造变换需要完整部件及其边界，请使用材料部件选择器。');}}
    return swapGeneratedLines(previewMaterialConstructionCopy(p.doc,request),drawingSwap);
  };
  function commitSwappedMaterial(construction:MaterialGeneratedConstruction):boolean {
    const result=applyMaterialGeneratedSwap(p.doc,construction);
    return p.onChange(result.doc,new Set(result.generatedIds),{kind:'material-generated-swap',construction})!==false;
  }
  const [globalAdaptiveLineStyle]=useAdaptiveLineStyle(),adaptiveLineStyle=p.adaptiveLineStyle??globalAdaptiveLineStyle;
  const [gpuFailed,setGpuFailed]=useState<string|null>(null);
  const gpuEnabled=typeof window!=='undefined'&&p.renderBackend!=='svg'&&!gpuFailed&&!p.tileDecoration&&p.doc.segments.length>=CREASE_GPU_THRESHOLD;
  const gridAppearance=p.gridAppearance??defaultGridAppearance();
  const layerState=p.displayLayers;
  function setLayer(layer:keyof DisplayLayers,value:boolean){p.onDisplayLayersChange({...layerState,[layer]:value});}
  const displayVertices=topology.value.vertices;
  // Display filtering must not rebuild or mutate the document's snap topology.
  const interactionDoc=useMemo(()=>canvasInteractionDocument(p.doc,layerState),[p.doc,layerState.main,layerState.auxiliary]);
  const visibleSegmentIds=useMemo(()=>new Set(interactionDoc.segments.map(s=>s.id)),[interactionDoc.segments]);
  const svg=useRef<SVGSVGElement>(null);
  const [view,commitView]=useState({x:-30,y:-30,w:260,h:260});
  const currentView=useRef(view),queuedView=useRef<typeof view|null>(null),viewFrame=useRef<number|null>(null);
  // Coalesce high-rate wheel/pointer input without dropping intermediate zooms.
  function setView(next:typeof view|((previous:typeof view)=>typeof view)){
    queuedView.current=typeof next==='function'?next(currentView.current):next;currentView.current=queuedView.current;
    if(viewFrame.current===null)viewFrame.current=requestAnimationFrame(()=>{
      viewFrame.current=null;const next=queuedView.current;queuedView.current=null;if(next)commitView(next);
    });
  }
  useEffect(()=>()=>{if(viewFrame.current!==null)cancelAnimationFrame(viewFrame.current);},[]);
  const [size,setSize]=useState({w:800,h:600});
  const measuredSize=useRef<{w:number;h:number}|null>(null);
  const fitPending=useRef(true),fitDoc=useRef(p.doc);
  fitDoc.current=p.doc;
  const [pending,setPending]=useState<Point[]>([]),[hover,setHover]=useState<Point|null>(null);
  const [regionCheck,setRegionCheck]=useState<RegionFoldCheck|null>(null);
  function finishRegionCheck(points:Point[]=pending){try{setRegionCheck(checkRegionFold(p.doc,points));setToolError('');}catch(error){constructionError((error as Error).message);}}
  const voronoi=useVoronoi(p.tool==='voronoi'&&!p.readOnly,pending);
  const measurementSlot=({measurel1:'L1',measurel2:'L2',measurea1:'A1',measurea2:'A2',measurea3:'A3'} as Partial<Record<Tool,MeasurementRegister>>)[p.tool];
  const {measurements,lengthDetails}=p;
  const measurementCount=measurementSlot?.startsWith('L')?2:3;
  const dividedDrawTool=p.tool==='drawdivide'||p.tool==='drawratio';
  const finiteRayTool=p.tool==='restrictedline';
  const restrictedDrawTool=p.tool==='restrictedcircle';
  const backgroundTool=p.tool==='backgroundposition';
  const [hiddenTraceId,setHiddenTraceId]=useState<string|null>(null);
  const [framePreview,setFramePreview]=useState<OperationFrame|null>(null);
  const shownFrame=p.tool==='operationframe'?(framePreview??p.operationFrame):null;
  useEffect(()=>{if(p.tool==='operationframe')p.onSelect(new Set());},[p.tool]);
  const crossMergeTool=p.tool==='mergecrossvertex';
  const [crossMergeAngle,setCrossMergeAngle]=useState('');
  const [drawCount,setDrawCount]=useState(2),[drawRatio,setDrawRatio]=useState(defaultDrawRatio);
  const drawDivision:DrawDivision=p.tool==='drawdivide'?{kind:'equal',count:drawCount}:drawRatio;
  const alternateTool=p.tool==='alternatecollinear'||p.tool==='alternatecross';
  const alternateMode=p.tool==='alternatecollinear'?'collinear':'crossing';
  const restrictedReference=p.tool==='eraseoverlap'||p.tool==='alternatecollinear';
  const lineEraseTool=p.tool==='eraseoverlap'||p.tool==='erasecross';
  const lineEraseMode=p.tool==='eraseoverlap'?'overlap':'crossing';
  const directTarget=({makemountain:'M',makevalley:'V',makeedge:'B',makeaux:'A'} as Partial<Record<Tool,DirectAssignment>>)[p.tool];
  const regionalSwapTool=p.tool==='regionalswap';
  const typeFilterTool=regionalSwapTool||!!directTarget||p.tool==='replacetype'||p.tool==='deletetype'||p.tool==='eraseedge'||p.tool==='eraseaux';
  const typeFilterDelete=p.tool==='deletetype'||p.tool==='eraseedge'||p.tool==='eraseaux';
  const fixedTypeSource:LineTypeFilter|undefined=p.tool==='eraseedge'?'B':p.tool==='eraseaux'?'A':undefined;
  const [typeSource,setTypeSource]=useState<LineTypeFilter>('any'),[typeTarget,setTypeTarget]=useState<Assignment>('V');
  const regionPolygon=p.tool==='selectpolygon'||p.tool==='unselectpolygon';
  const regionLasso=p.tool==='selectlasso'||p.tool==='unselectlasso';
  const regionCross=p.tool==='selectcross'||p.tool==='unselectcross';
  const regionTool=regionPolygon||regionLasso||regionCross;
  const regionRemove=p.tool.startsWith('unselect');
  const rotationTool=p.tool==='rotatecopyselection';
  const rotationReference=useMemo(()=>{if(!rotationTool||!pending.length)return null;try{return drawingRotationReference(p.doc,p.selected,p.selectedCircles??new Set(),pending[0]);}catch{return null;}},[rotationTool,pending,p.doc,p.selected,p.selectedCircles]);

  const transformTool=['rotatecopyselection','moveselection','copyselection','movefour','copyfour'].includes(p.tool);
  const fourPointTool=p.tool==='movefour'||p.tool==='copyfour';
  const transformCopy=rotationTool||p.tool==='copyselection'||p.tool==='copyfour';
  function selectedTransform(points:Point[]):SelectionTransform{
    if(rotationTool){if(!rotationReference)throw new Error('请先选择旋转中心。');return rotationCopyOrbit(points[0],rotationReference,points[1],epsilonFor(p.doc)).transform;}
    return fourPointTool?{kind:'similarity',a:points[0],b:points[1],c:points[2],d:points[3]}:{kind:'translate',from:points[0],to:points[1]};
  }
  const foldableTool=p.tool==='foldableinput';
  const foldableDrawTool=p.tool==='foldabledraw';
  const [foldableDrawModeState,setFoldableDrawMode]=useState<FoldableDrawMode|null>(null);
  const foldableActive=foldableTool||(foldableDrawTool&&foldableDrawModeState==='foldable');
  const [foldableState,setFoldableState]=useState<FoldableInput|null>(null);
  const localFlatTool=p.tool==='localflat';
  const [localFlatChoice,setLocalFlatChoice]=useState<number|null>(null);
  const localFlatResult=useMemo(()=>{
    if(!localFlatTool||!pending.length)return{degree:0,candidates:[] as LocalFlatCandidate[],sourceIds:[] as string[],error:''};
    try{return{...localFlatCandidates(p.doc,pending[0],p.preset),error:''};}
    catch(error){return{degree:0,candidates:[] as LocalFlatCandidate[],sourceIds:[] as string[],error:(error as Error).message};}
  },[localFlatTool,p.doc,pending,p.preset]);
  const specialAngleTool=p.tool==='angleconverge'||p.tool==='angleproject';
  const angleTool=p.tool==='angledrag'||p.tool==='angledirection'||specialAngleTool;
  const [angleSettings,setAngleSettings]=useState(readAngleSettings);
  const angleSystem=useMemo(()=>activeAngleSystem(angleSettings),[angleSettings]);
  const [angleChoice,setAngleChoice]=useState<number|null>(null);
  const angleResult=useMemo(()=>{
    if(!angleTool)return{fan:[] as ReturnType<typeof angleFan>,error:''};
    try{angleOffsets(angleSystem);return{fan:p.tool==='angledirection'&&pending.length===2?angleFan(pending[0],pending[1],angleSystem,epsilonFor(p.doc)):[],error:''};}
    catch(error){return{fan:[] as ReturnType<typeof angleFan>,error:(error as Error).message};}
  },[angleTool,p.tool,pending,angleSystem,p.doc.paper]);
  const specialAngleResult=useMemo(()=>{
    if(!specialAngleTool||pending.length!==2)return{fans:[] as AngleCandidate[][],error:''};
    try{return{fans:p.tool==='angleconverge'?convergenceFans(pending[0],pending[1],angleSystem,epsilonFor(p.doc)):[constructionFan(pending[1],pending[0],angleSystem,100,epsilonFor(p.doc))],error:''};}
    catch(error){return{fans:[] as AngleCandidate[][],error:(error as Error).message};}
  },[specialAngleTool,p.tool,pending,angleSystem,p.doc.paper]);
  const offsetTool=p.tool==='offsetparallel';
  const [offsetSourceId,setOffsetSourceId]=useState<string|null>(null),[offsetWidth,setOffsetWidth]=useState(25),[offsetReady,setOffsetReady]=useState(false);
  const offsetSource=offsetSourceId?p.doc.segments.find(s=>s.id===offsetSourceId):undefined;
  const offsetResult=useMemo(()=>{
    if(!offsetTool||!offsetSource||(!offsetReady&&(!pending.length||!hover)))return{copies:[] as Segment[],error:''};
    try{return{copies:swapGeneratedLines(parallelOffsets(offsetSource,offsetReady?offsetWidth:distance(pending[0],hover!),p.preset,epsilonFor(p.doc)),drawingSwap),error:''};}
    catch(error){return{copies:[] as Segment[],error:offsetReady?(error as Error).message:''};}
  },[offsetTool,offsetSource,pending,hover,offsetReady,offsetWidth,p.preset,p.doc.paper,drawingSwap]);
  const lineBisectorTool=p.tool==='bisectlines';
  const [bisectorIds,setBisectorIds]=useState<string[]>([]),[bisectorCutId,setBisectorCutId]=useState<string|null>(null);
  const bisectorRefs=bisectorIds.map(id=>p.doc.segments.find(s=>s.id===id)).filter((s):s is Segment=>!!s);
  const bisectorCut=bisectorCutId?p.doc.segments.find(s=>s.id===bisectorCutId):undefined;
  const lineBisectorResult=useMemo(()=>{
    if(!lineBisectorTool||bisectorRefs.length!==2)return{value:null as LineBisector|null,error:''};
    try{return{value:lineBisector(bisectorRefs[0],bisectorRefs[1],epsilonFor(p.doc)),error:''};}
    catch(error){return{value:null as LineBisector|null,error:(error as Error).message};}
  },[lineBisectorTool,p.doc,bisectorIds]);
  const axiomTool=p.tool==='axiom5'||p.tool==='axiom7';
  const [axiomIds,setAxiomIds]=useState<string[]>([]),[axiomChoice,setAxiomChoice]=useState<number|null>(null);
  const axiomRefs=axiomIds.map(id=>p.doc.segments.find(s=>s.id===id)).filter((s):s is Segment=>!!s);
  const axiomReady=axiomTool&&(p.tool==='axiom5'?pending.length===2&&axiomRefs.length===1:pending.length===1&&axiomRefs.length===2);
  const axiomResult=useMemo(()=>{
    if(!axiomReady)return{folds:[] as AxiomFold[],error:''};
    try{return{folds:p.tool==='axiom5'?axiom5(pending[0],axiomRefs[0],pending[1],epsilonFor(p.doc)):[axiom7(pending[0],axiomRefs[0],axiomRefs[1],epsilonFor(p.doc))],error:''};}
    catch(error){return{folds:[] as AxiomFold[],error:(error as Error).message};}
  },[axiomReady,p.doc,pending,axiomIds,p.tool]);
  const rabbitTool=p.tool==='rabbitear';
  const rabbitReady=rabbitTool&&pending.length===3;
  const rabbitResult=useMemo(()=>{
    if(!rabbitReady)return{copies:[] as Segment[],error:''};
    try{return{...rabbitEar(p.doc,pending,p.preset,p.drawingAngle,drawingSwap),error:''};}
    catch(error){return{copies:[] as Segment[],error:(error as Error).message};}
  },[rabbitReady,p.doc,pending,p.preset,p.drawingAngle,drawingSwap]);
  const fishboneTool=p.tool==='fishbone';
  const continuousTool=p.tool==='continuous';
  const [continuousAlternate,setContinuousAlternate]=useState(true);
  const [continuousEndpoint,setContinuousEndpoint]=useState<{point:Point;segmentIndex:number}|undefined>();
  const [continuousPickingEnd,setContinuousPickingEnd]=useState(false);
  const [continuousChoices,setContinuousChoices]=useState<{segmentIndex:number;point:Point;direction:Point}[]>([]);
  const batchReflectionTool=p.tool==='transverse'||continuousTool||fishboneTool;
  const batchReflectionName=fishboneTool?'鱼骨构造':continuousTool?'连续折射':'横截反射';
  function buildBatchReflection(a:Point,b:Point){
    if(fishboneTool)return fishbone(p.doc,a,b,getPaperBounds(p.doc).width/(Number.isFinite(p.divisions)&&p.divisions>0?Math.min(1000,p.divisions):DEFAULT_GRID_DIVISIONS),p.preset,p.drawingAngle,drawingSwap);
    return continuousTool?continuousReflection(p.doc,a,b,p.preset,p.drawingAngle,{alternateAssignments:continuousAlternate,endpoint:continuousEndpoint,junctionChoices:continuousChoices,swapGenerated:drawingSwap}):{...transverseReflection(p.doc,a,b,p.lockBoundary,drawingSwap),stopMessage:''};
  }
  const batchReflectionReady=batchReflectionTool&&pending.length===2;
  const continuousFullPath=useMemo(()=>{
    if(!continuousTool||pending.length!==2)return {path:[] as Segment[],error:''};
    try{return {...continuousReflection(p.doc,pending[0],pending[1],p.preset,p.drawingAngle,{alternateAssignments:continuousAlternate,junctionChoices:continuousChoices,swapGenerated:drawingSwap}),error:''};}
    catch(error){return {path:[] as Segment[],error:(error as Error).message};}
  },[continuousTool,p.doc,pending,p.preset,p.drawingAngle,continuousAlternate,continuousChoices,drawingSwap]);
  const batchReflectionResult=useMemo(()=>{
    if(!batchReflectionReady)return{sources:[] as Segment[],copies:[] as Segment[],stopMessage:'',error:''};
    if(continuousTool&&!continuousEndpoint){
      if('copies' in continuousFullPath)return continuousFullPath;
      return {sources:[] as Segment[],copies:[] as Segment[],stopMessage:'',error:continuousFullPath.error};
    }
    try{return {...buildBatchReflection(pending[0],pending[1]),error:''};}
    catch(error){return{sources:[] as Segment[],copies:[] as Segment[],stopMessage:'',error:(error as Error).message};}
  },[batchReflectionReady,p.doc,pending,p.lockBoundary,p.preset,p.drawingAngle,continuousTool,fishboneTool,p.divisions,continuousAlternate,continuousEndpoint,continuousFullPath,continuousChoices,drawingSwap]);
  const continuousJunction=continuousTool&&!continuousEndpoint&&'pendingJunction' in continuousFullPath?continuousFullPath.pendingJunction:undefined;
  const twoLineReflection=p.tool==='reflectionlines';
  const [reflectionIds,setReflectionIds]=useState<string[]>([]);
  const reflectionRefs=reflectionIds.map(id=>p.doc.segments.find(s=>s.id===id)).filter((s):s is Segment=>!!s);
  const rayTool=p.tool==='bisect'||p.tool==='reflection'||twoLineReflection;
  const rayName=(p.tool==='reflection'||twoLineReflection)?'反射线':'角平分线';
  const makeRay=(points:Point[])=>(p.tool==='reflection'||twoLineReflection)?reflectionRay(points[0],points[1],points[2],epsilonFor(p.doc)):getAngleBisector(points[0],points[1],points[2]);
  const rayEnd=(ray:ReturnType<typeof makeRay>,target:Segment)=>(p.tool==='reflection'||twoLineReflection)?reflectionEnd(ray,target,epsilonFor(p.doc)):intersectBisectorTarget(ray,target);
  const mirrorTool=p.tool==='mirrorline'||p.tool==='mirrorselection';
  const interactionRef=useRef({tool:p.tool,onSelect:p.onSelect,cropBusy:p.cropBusy,onCancelBackgroundCrop:p.onCancelBackgroundCrop});interactionRef.current={tool:p.tool,onSelect:p.onSelect,cropBusy:p.cropBusy,onCancelBackgroundCrop:p.onCancelBackgroundCrop};
  const [mirrorSourceIds,setMirrorSourceIds]=useState<string[]>([]);
  const [mirrorAxisId,setMirrorAxisId]=useState<string|null>(null),[mirrorMaterialScope,setMirrorMaterialScope]=useState<'source'|'all'>('source'),[mirrorFixedSide,setMirrorFixedSide]=useState<'left'|'right'>('left'),[mirrorCpOnly,setMirrorCpOnly]=useState(false);
  const materialMirrorIntent=():MaterialEdgeReflectIntent=>({kind:'material-edge-reflect',sourceId:mirrorSourceIds[0],axisId:mirrorAxisId??'',component:mirrorMaterialScope,fixedSide:mirrorFixedSide,cpOnly:mirrorCpOnly});
  const mirrorSources=useMemo(()=>{const ids=new Set(mirrorSourceIds);return ids.size?p.doc.segments.filter(s=>ids.has(s.id)):[];},[p.doc.segments,mirrorSourceIds]);
  const mirrorReady=mirrorTool&&pending.length===2;
  const mirrorJoinTolerance=Math.min(1,Math.max(.1,2*view.w/size.w),Math.max(p.doc.paper.width,p.doc.paper.height)*.005);
  const mirrorCandidates=(a:Point,b:Point)=>{
    if(p.tool==='mirrorline'&&materialSelected(mirrorSourceIds)){
      const intent=materialMirrorIntent();
      const r=reflectMaterialEdge(p.doc,intent),ids=new Set(r.insertedIds);return swapGeneratedLines(r.doc.segments.filter(s=>ids.has(s.id)),drawingSwap);
    }
    return materialSelected(mirrorSourceIds)?materialPreview({kind:'material-construction-copy',segmentIds:mirrorSourceIds,transform:{kind:'reflect',a,b}}):mirrorCopies(p.doc,mirrorSourceIds,a,b,p.lockBoundary,mirrorJoinTolerance,drawingSwap);
  };
  const mirrorResult=useMemo(()=>{
    if(!mirrorReady)return{copies:[] as Segment[],error:''};
    try{return{copies:mirrorCandidates(pending[0],pending[1]),error:''};}
    catch(error){return{copies:[] as Segment[],error:(error as Error).message};}
  },[mirrorReady,p.doc,mirrorSourceIds,pending,p.lockBoundary,mirrorJoinTolerance,p.tool,mirrorAxisId,mirrorMaterialScope,mirrorFixedSide,mirrorCpOnly,drawingSwap]);
  const [sourceChoice,setSourceChoice]=useState<{id:string;end:'a'|'b'}|null>(null);
  const [divisionCount,setDivisionCount]=useState(2),[ratioA,setRatioA]=useState(1),[ratioB,setRatioB]=useState(1);
  const [polygonCount,setPolygonCount]=useState(6),[polygonClockwise,setPolygonClockwise]=useState(true);
  const [circleRadius,setCircleRadius]=useState(25),[selectedCircleId,setSelectedCircleId]=useState<string|null>(null);
  const circleTool=['circle','circleradius','circle3'].includes(p.tool);
  const advancedCircleTool=['circleseparate','circleconcentric','circleequal','circlepair','tangentpoint','tangentcircles'].includes(p.tool);
  const inversionTool=p.tool==='circleinvert'||p.tool==='lineinvert';
  const extraCircleTool=inversionTool||p.tool==='circledifference';
  const [inverseSourceId,setInverseSourceId]=useState<string|null>(null);
  const inverseSource=inverseSourceId?p.doc.segments.find(s=>s.id===inverseSourceId):undefined;
  const [circleReferenceIds,setCircleReferenceIds]=useState<string[]>([]);
  const circles=useMemo(()=>p.doc.objects?.filter((o):o is CircleObject=>o.kind==='circle')??[],[p.doc.objects]);
  const selectedCircles=p.selectedCircles??new Set<string>();
  const circleReferences=circleReferenceIds.map(id=>circles.find(c=>c.id===id)).filter((c):c is CircleObject=>!!c);
  const selectedCircle=p.tool==='circleedit'?circles.find(c=>c.id===selectedCircleId):undefined;
  const [referenceId,setReferenceId]=useState<string|null>(null);
  const directionalTool=p.tool==='parallel'||p.tool==='perpendicular';
  const reference=referenceId?p.doc.segments.find(s=>s.id===referenceId):undefined;
  const direction=reference?referenceDirection(reference,p.tool==='perpendicular'):undefined;
  const candidates=direction&&pending.length?directionCandidates(p.doc,pending[0],direction):[];
  const stepCount=regionPolygon?(pending.length<1?0:pending.length<3?1:2):regionLasso?(pending.length?1:0):foldableActive?(foldableState?(foldableState.end?2:1):0):localFlatTool?(pending.length?(localFlatChoice===null?1:2):0):p.tool==='angledirection'?pending.length+(angleChoice===null?0:1):offsetTool?(offsetReady?3:offsetSource?1+pending.length:0):lineBisectorTool?bisectorRefs.length+(bisectorCut?1:0):axiomTool?(axiomReady?(axiomChoice===null?3:4):pending.length+axiomRefs.length):twoLineReflection?reflectionIds.length:mirrorTool?(p.tool==='mirrorline'?(mirrorReady?2:mirrorSourceIds.length?1:0):pending.length):extraCircleTool?pending.length+circleReferences.length+(inverseSource?1:0):advancedCircleTool?pending.length+circleReferences.length:directionalTool&&reference?2:pending.length;
  const segmentTool=['extend','lengthen','trim','divide','ratio','addvertex'].includes(p.tool);
  const source=sourceChoice?p.doc.segments.find(s=>s.id===sourceChoice.id):undefined;
  const [hoverPosition,setHoverPosition]=useState<Point|null>(null),[toolError,setToolError]=useState('');
  const [cursor,setCursor]=useState<Point|null>(null);
  const [box,setBox]=useState<{a:Point,b:Point}|null>(null);
  const [dragOffset,setDragOffset]=useState<Point>([0,0]);
  const [panning,setPanning]=useState(false),[selectedVertex,setSelectedVertex]=useState<string|null>(null);
  const [junctionPageIndex,setJunctionPage]=useState(0),[junctionFocus,setJunctionFocus]=useState<string|null>(null);
  const [wheelNavigating,setWheelNavigating]=useState(false),wheelNavigationTimer=useRef<number|null>(null);
  const navigating=p.doc.segments.length>=2000&&(panning||wheelNavigating);
  function restoreNavigationMarkers(){if(wheelNavigationTimer.current!==null)window.clearTimeout(wheelNavigationTimer.current);wheelNavigationTimer.current=null;setWheelNavigating(false);}
  function markWheelNavigation(){if(p.doc.segments.length<2000)return;setWheelNavigating(true);if(wheelNavigationTimer.current!==null)window.clearTimeout(wheelNavigationTimer.current);wheelNavigationTimer.current=window.setTimeout(restoreNavigationMarkers,120);}
  useEffect(()=>()=>{if(wheelNavigationTimer.current!==null)window.clearTimeout(wheelNavigationTimer.current);},[]);
  const [hoverTarget,setHoverTarget]=useState<SnapPoint|null>(null);
  const drawingSnap=useRef<{result:CreaseDrawingSnapResult;anchor?:Point}|null>(null);
  const [drawingSnapFeedback,setDrawingSnapFeedback]=useState<typeof drawingSnap.current>(null);
  const gesture=useRef<null|{kind:'regioncheck'|'customcolor'|'voronoipoint'|'text'|'pan'|'box'|'move'|'line'|'construction'|'cycletype'|'erase'|'mirrorselect'|'regionpolygon'|'regionlasso'|'unselect'|'typefilter'|'lineerase'|'alternate'|'measurement'|'mergeclick'|'restricteddraw'|'backgroundpoint'|'advance'|'operationframe';frameDrag?:FrameDrag;cancelled?:boolean;panMoved?:boolean;path?:Point[];pointerId:number;button:number;start:Point;press:Point;client:Point;view:typeof view;ids:Set<string>;circleIds?:Set<string>;hadStart?:boolean}>(null);
  const [textDraft,setTextDraft]=useState<TextDraft|null>(null);
  function measuredTextBounds(){
    const result=new Map<string,{x:number;y:number;width:number;height:number}>();
    svg.current?.querySelectorAll<SVGGElement>('[data-object-kind="text"]').forEach(el=>{
      const id=el.getAttribute('data-drawing-object');if(!id)return;
      const b=el.getBBox();result.set(id,{x:b.x,y:b.y,width:b.width,height:b.height});
    });return result;
  }
  function applyText(){
    if(!textDraft)return;
    try{const {id,...properties}=textDraft;const next=id?updateText(p.doc,id,properties):appendText(p.doc,properties);
      if(p.onChange(next)!==false){cancelGesture();p.onMessage('文字已应用，可撤销。');}
    }catch(error){constructionError((error as Error).message);}
  }
  const space=useRef(false);
  // Editing vertices are derived independently of the folding engine: open
  // drawings, auxiliary lines and conflicting M/V lines still have snap points.
  const snapPoints=topology.value.points;
  const visibleSnapPoints=useMemo(()=>visibleCreaseSnapPoints(snapPoints,visibleSegmentIds),[snapPoints,visibleSegmentIds]);
  const circleIntersections=useMemo(()=>p.readOnly||!layerState.auxiliary?[]:circleIntersectionPoints(interactionDoc),[p.readOnly,layerState.auxiliary,interactionDoc.segments,interactionDoc.objects]);
  const allSnapPoints=useMemo(()=>[...visibleSnapPoints,...circleSnapPoints(layerState.auxiliary?p.doc.objects??[]:[]),...circleIntersections],[visibleSnapPoints,layerState.auxiliary,p.doc.objects,circleIntersections]);
  const drawingRelationLines=useMemo<DiagramLineAnnotation[]>(()=>p.readOnly||p.tool!=='line'?[]:interactionDoc.segments.map(s=>({id:s.id,kind:'line',a:s.a,b:s.b,style:'crease',color:'#426f59',width:1})),[p.readOnly,p.tool,interactionDoc.segments]);
  const intersections=useMemo(()=>editorJunctionPoints(snapPoints),[snapPoints]);
  // Shared junctions remain visible while any incident segment is displayed.
  const visibleIntersections=useMemo(()=>intersections.filter(v=>v.segmentIds.some(id=>visibleSegmentIds.has(id))),[intersections,visibleSegmentIds]);
  const selectableIntersections=useMemo(()=>{const editable=new Set(interactionDoc.segments.filter(s=>!p.lockBoundary||s.assignment!=='B').map(s=>s.id));return intersections.filter(v=>v.segmentIds.some(id=>editable.has(id)));},[intersections,interactionDoc.segments,p.lockBoundary]);
  const selectableVertices=useMemo(()=>new Set(selectableIntersections.map(v=>v.id)),[selectableIntersections]);
  const junctionPage=useMemo(()=>creaseJunctionPage(selectableIntersections,junctionPageIndex),[selectableIntersections,junctionPageIndex]);
  useEffect(()=>{setJunctionPage(0);setJunctionFocus(null);},[snapPoints]);
  const activeVertex=selectedVertex?snapPoints.find(v=>v.id===selectedVertex&&v.segmentIds.some(id=>p.selected.has(id)&&visibleSegmentIds.has(id))):undefined;
  useEffect(()=>{setHoverTarget(current=>current?allSnapPoints.find(v=>v.id===current.id)??null:null);},[allSnapPoints]);
  const paper=useMemo(()=>getPaperBounds(p.doc),[p.doc]);
  const helpBounds=useMemo(()=>getDrawingBounds(p.doc),[p.doc]);
  const outline=useMemo(()=>paperPath(p.doc),[p.doc]);
  const gridReference=p.gridPattern?getGridReferenceBounds(p.doc):paper;
  const gridOutline=outline||(p.gridPattern?`M${gridReference.x} ${gridReference.y}h${gridReference.width}v${gridReference.height}h${-gridReference.width}Z`:'');
  const gridId='paper-grid-'+useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const gridScope=p.gridScope??'paper';
  const divisions=Number.isFinite(p.divisions)&&p.divisions>0?Math.min(1000,p.divisions):DEFAULT_GRID_DIVISIONS;
  const gridGeometry=paperGridGeometry(gridReference,divisions,{pattern:p.gridPattern,rotation:p.gridRotation,diagonal:p.diagonalGrid,diagonalAngle:p.diagonalAngle});
  const triangularTile=p.gridPattern==='triangular'?triangularGridTile(gridGeometry):undefined;
  const step=gridGeometry.stepX,stepY=gridGeometry.stepY,visibleGridStep=Math.min(step,stepY);
  function fitToSize(next:{w:number;h:number}){
    const bounds=getDrawingBounds(fitDoc.current),scale=Math.max(bounds.width/(next.w*.76),bounds.height/(next.h*.78),.01);
    setView({x:bounds.x+bounds.width/2-next.w*scale/2,y:bounds.y+bounds.height/2-next.h*scale/2,w:next.w*scale,h:next.h*scale});
    fitPending.current=false;
  }
  function fit(){
    restoreNavigationMarkers();
    fitPending.current=true;
    const rect=svg.current?.getBoundingClientRect();
    if(!rect||rect.width<=0||rect.height<=0)return;
    const next={w:rect.width,h:rect.height};
    measuredSize.current=next;setSize(next);fitToSize(next);
  }
  useEffect(()=>{
    const el=svg.current;if(!el)return;
    const ob=new ResizeObserver(([entry])=>{
      const next={w:entry.contentRect.width,h:entry.contentRect.height};
      // A library or another workspace can hide this mounted canvas. Keep the
      // last visible size so revealing it cannot turn a zero-size fit into a huge viewBox.
      if(next.w<=0||next.h<=0)return;
      const previous=measuredSize.current;measuredSize.current=next;setSize(next);
      if(fitPending.current||!previous)fitToSize(next);
      else if(next.w!==previous.w||next.h!==previous.h)setView(v=>{
        const scale=v.w/previous.w,w=next.w*scale,h=next.h*scale;
        return{x:v.x+(v.w-w)/2,y:v.y+(v.h-h)/2,w,h};
      });
    });
    ob.observe(el);return()=>ob.disconnect();
  },[]);
  useEffect(fit,[p.fitToken]);
  useEffect(()=>{
    const points=p.focusRegion?.points.filter(point=>point.every(Number.isFinite)),rect=svg.current?.getBoundingClientRect();
    if(!points?.length||!rect||rect.width<=0||rect.height<=0)return;
    const bounds=pointBounds(points),minimum=Math.max(.001,Math.max(paper.width,paper.height)/30);
    const scale=Math.max(Math.max(bounds.maxX-bounds.minX,minimum)/(rect.width*.7),Math.max(bounds.maxY-bounds.minY,minimum)/(rect.height*.7));
    cancelGesture();fitPending.current=false;
    setView({x:(bounds.minX+bounds.maxX-rect.width*scale)/2,y:(bounds.minY+bounds.maxY-rect.height*scale)/2,w:rect.width*scale,h:rect.height*scale});
  },[p.focusRegion]);
  const keyboardState=useRef({active:false,readOnly:false,topologyBlocked:false});
  keyboardState.current={active:!!(textDraft||p.cropBusy||foldableState||foldableDrawModeState||pending.length||offsetSourceId||bisectorIds.length||reflectionIds.length||mirrorSourceIds.length||circleReferenceIds.length||inverseSourceId||axiomIds.length||referenceId||sourceChoice),readOnly:!!p.readOnly,topologyBlocked};
  function hasActiveOperation(){return keyboardState.current.active||!!gesture.current;}
  function cancelGesture(){restoreNavigationMarkers();drawingSnap.current=null;setDrawingSnapFeedback(null);setRegionCheck(null);setTextDraft(null);if(interactionRef.current.cropBusy)interactionRef.current.onCancelBackgroundCrop?.();setFramePreview(null);setHiddenTraceId(null);setCrossMergeAngle('');keyboardState.current.active=false;const active=gesture.current;gesture.current=null;if(active&&svg.current?.hasPointerCapture(active.pointerId))svg.current.releasePointerCapture(active.pointerId);setPending([]);setContinuousEndpoint(undefined);setContinuousPickingEnd(false);setContinuousChoices([]);setFoldableState(null);setFoldableDrawMode(null);setLocalFlatChoice(null);setAngleChoice(null);setOffsetSourceId(null);setOffsetReady(false);setBisectorIds([]);setBisectorCutId(null);setAxiomIds([]);setAxiomChoice(null);setReflectionIds([]);setMirrorSourceIds([]);setMirrorAxisId(null);setInverseSourceId(null);setCircleReferenceIds([]);setSourceChoice(null);setReferenceId(null);setBox(null);setDragOffset([0,0]);setPanning(false);setHoverTarget(null);setHoverPosition(null);setToolError('');}
  function cancelOperation(){cancelGesture();if(interactionRef.current.tool==='mirrorselection')interactionRef.current.onSelect(new Set());}
  useEffect(()=>{cancelGesture();setSelectedVertex(null);setSelectedCircleId(p.tool==='circleedit'?[...selectedCircles][0]??null:null);},[p.tool,p.doc.name,p.fitToken,p.commandToken]);
  useEffect(()=>{if(p.tool==='circleedit'||p.tool==='voronoi')p.onSelect(new Set());},[p.tool]);
  useEffect(()=>{setSelectedCircleId(id=>circles.some(c=>c.id===id)?id:null);},[circles]);
  // Undo, document replacement or geometry edits invalidate construction inputs.
  // View changes and mountain/valley presets do not discard the selected points.
  useEffect(()=>{cancelGesture();},[p.readOnly,p.doc.segments,p.doc.objects]);
  useEffect(()=>{if(backgroundTool)cancelGesture();},[p.doc.background]);
  useEffect(()=>{setToolError('');},[divisionCount,ratioA,ratioB,polygonCount,polygonClockwise]);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      // Workspaces stay mounted while hidden. Their unfinished constructions
      // must not consume Escape or Space meant for the visible workspace.
      if(!svg.current?.getClientRects().length)return;
      if(e.defaultPrevented||document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'))return;
      const target=e.target instanceof Element?e.target:null;
      if(target?.closest('input,select,textarea,[contenteditable],[data-fold-result]'))return;
      if(e.code==='Space'&&!target?.closest('button,summary')){space.current=true;e.preventDefault();}
      if(keyboardState.current.topologyBlocked&&(e.key==='Delete'||e.key==='Backspace'||(e.ctrlKey||e.metaKey)&&['x','v','z','y','a'].includes(e.key.toLowerCase()))){e.preventDefault();return;}
      if(keyboardState.current.readOnly)return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){cancelGesture();setSelectedVertex(null);setSelectedCircleId(null);return;}
      if(e.key==='Escape'){
        // Capture phase runs before App's idle-selection shortcut, independent
        // of effect registration order. An unfinished operation owns this key.
        if(hasActiveOperation()){e.preventDefault();cancelGesture();}
        else cancelGesture();
        setSelectedVertex(null);setSelectedCircleId(null);
      }
    };
    const up=(e:KeyboardEvent)=>{if(e.code==='Space')space.current=false;};
    const blur=()=>{space.current=false;cancelGesture();};
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[]);

  const units=view.w/size.w;
  const angleGridPath=useMemo(()=>p.grid&&gridScope!=='off'&&p.gridPattern!=='triangular'&&p.diagonalGrid&&p.diagonalAngle!==undefined&&visibleGridStep/units>=gridAppearance.minGridPixelSize
    ?diagonalGridPaths({x:view.x,y:view.y,width:view.w,height:view.h},gridGeometry):'',
    [p.grid,gridScope,p.gridPattern,p.gridRotation,p.diagonalGrid,p.diagonalAngle,visibleGridStep,units,gridAppearance.minGridPixelSize,view.x,view.y,view.w,view.h,gridReference.x,gridReference.y,gridReference.width,gridReference.height,step,stepY]);
  // Shrink passive markers with the paper, but cap their radius and outline at
  // the configured CSS-pixel size when zooming in. Picking stays independent.
  const markerUnits=Math.min(DISPLAY_PIXEL_MM,units);
  const picking=p.pickingSettings??defaultCanvasPicking();
  const pickRadius=pickingWorldRadius(picking,units);
  const backgroundView={x:view.x,y:view.y,units};
  const previousBackgroundView=useRef<BackgroundView|null>(null);
  useEffect(()=>{
    const previous=previousBackgroundView.current;previousBackgroundView.current={x:view.x,y:view.y,units};
    if(backgroundTool&&p.doc.background?.viewport&&previous){
      // Image features A/B stay attached to the screen-fixed image, whereas
      // drawing targets C/D stay attached to the world while the camera moves.
      setPending(points=>points.map((q,i)=>i<2?[view.x+(q[0]-previous.x)*units/previous.units,view.y+(q[1]-previous.y)*units/previous.units]:q));
    }
  },[view.x,view.y,units]);
  useEffect(()=>{p.onBackgroundViewChange?.({x:view.x,y:view.y,units});},[view.x,view.y,units,p.onBackgroundViewChange]);
  const backgroundOuter=p.doc.background?.viewport?backgroundViewTransform(p.doc.background.viewport,backgroundView):null;
  const [customColor,setCustomColor]=useState('#d28b26');
  const [markColor,setMarkColor]=useState<MarkColor>(readMarkColor);
  function chooseMarkColor(color:MarkColor){
    if(color===markColor)return;
    try{saveMarkColor(color);cancelGesture();setMarkColor(color);p.onMessage('后续标记使用'+MARK_COLORS[color].name+'；已有标记与山谷线型不变。');}
    catch(error){constructionError('无法保存标记颜色：'+(error as Error).message);}
  }
  const colorPreview=useMemo(()=>{
    if(p.tool!=='customcolor'||!hoverPosition)return {segmentIds:new Set<string>(),circleIds:new Set<string>()};
    return customColorTargets(p.doc,gesture.current?.kind==='customcolor'&&box?{kind:'box',a:box.a,b:box.b}:{kind:'point',point:hoverPosition,tolerance:pickRadius});
  },[p.tool,p.doc,box,hoverPosition,pickRadius]);
  const typePreview=useMemo(()=>{
    if(!typeFilterTool||!hoverPosition)return new Set<string>();
    const area:TypeFilterArea=gesture.current?.kind==='typefilter'&&box?{kind:'box',a:box.a,b:box.b}:{kind:'point',point:hoverPosition,radius:pickRadius};
    try{return regionalSwapTool?regionalSwapHits(interactionDoc,area,p.lockBoundary):directTarget?directAssignmentHits(interactionDoc,area,directTarget,p.lockBoundary):typeFilterHits(interactionDoc,area,fixedTypeSource??typeSource,p.lockBoundary);}catch{return new Set<string>();}
  },[typeFilterTool,typeFilterDelete,regionalSwapTool,directTarget,p.doc,interactionDoc,box,hoverPosition,fixedTypeSource,typeSource,p.lockBoundary,pickRadius]);
  function finishTypeFilter(area:TypeFilterArea){
    try{
      const removed=typeFilterDelete?typeFilterHits(interactionDoc,area,fixedTypeSource??typeSource,p.lockBoundary):null;
      const result=removed?{doc:{...p.doc,segments:p.doc.segments.filter(s=>!removed.has(s.id))},matched:removed.size,changed:removed.size}:regionalSwapTool?applyRegionalSwap(interactionDoc,area,p.lockBoundary):directTarget?applyDirectAssignment(interactionDoc,area,directTarget,p.lockBoundary):applyTypeFilter(interactionDoc,area,fixedTypeSource??typeSource,{kind:'replace',to:typeTarget},p.lockBoundary);
      if(!result.changed){cancelGesture();p.onMessage(result.matched?'命中线段已是目标类型，无需修改。':'没有命中符合来源类型的可编辑线段。');return;}
      if(p.tool==='replacetype'||regionalSwapTool||directTarget){
        const visibleResult=new Map(result.doc.segments.map(segment=>[segment.id,segment]));
        result.doc={...p.doc,segments:p.doc.segments.map(segment=>visibleResult.get(segment.id)??segment)};
      }
      if(p.onChange(result.doc)===false)return;
      cancelGesture();p.onMessage(regionalSwapTool?`已互换 ${result.changed} 条山谷线，可一次撤销。`:directTarget?`已将 ${result.changed} 条线段改为${NAMES[directTarget]}，可一次撤销。`:`已${p.tool==='replacetype'?'替换':'删除'} ${result.changed} 条线段，可一次撤销。`);
    }catch(error){constructionError((error as Error).message);}
  }
  const rotationOrbit=useMemo(()=>{if(!rotationReference||!pending.length||!hoverPosition)return null;try{return rotationCopyOrbit(pending[0],rotationReference,hoverPosition,epsilonFor(p.doc));}catch{return null;}},[rotationReference,pending,hoverPosition,p.doc]);
  const transformPreview=useMemo(()=>{
    if(!transformTool||(!rotationTool&&!hover)||pending.length!==(fourPointTool?3:1))return [] as Segment[];
    const end=rotationTool?hoverPosition:fourPointTool&&hoverPosition?nearestSnapPoint(snapPoints,hoverPosition,pickRadius)?.point:hover;
    if(!end)return [] as Segment[];
    try{const ids=[...p.selected],transform=selectedTransform([...pending,end]);if(materialSelected(ids)){if(!transformCopy&&p.lockBoundary&&p.doc.segments.some(s=>ids.includes(s.id)&&s.assignment==='B'))return [] as Segment[];return materialPreview({kind:'material-construction-copy',segmentIds:ids,transform});}return swapGeneratedLines(previewSelectionTransform(p.doc,ids,transform,p.lockBoundary),drawingSwap&&transformCopy);}catch{return [] as Segment[];}
  },[rotationTool,rotationReference,transformTool,fourPointTool,transformCopy,p.doc,p.selected,pending,hover,hoverPosition,snapPoints,pickRadius,p.lockBoundary,drawingSwap]);
  const transformedCircles=useMemo(()=>{
    if(!transformTool||pending.length!==(fourPointTool?3:1))return [];
    const end=rotationTool?hoverPosition:fourPointTool&&hoverPosition?nearestSnapPoint(snapPoints,hoverPosition,pickRadius)?.point:hover;
    if(!end)return [];try{return previewCircleTransform(p.doc,[...selectedCircles],selectedTransform([...pending,end]));}catch{return [];}
  },[transformTool,fourPointTool,rotationTool,rotationReference,pending,hoverPosition,hover,p.doc,p.selectedCircles,snapPoints,pickRadius]);
  function finishRotationCopy(cursor:Point){
    try{
      if(selectedCircles.size&&materialSelected([...p.selected]))throw new Error('材料部件与辅助圆请分别进行定位变换。');
      if(!pending.length)throw new Error('请先在画布点击旋转中心。');
      const transform=selectedTransform([pending[0],cursor]),ids=[...p.selected];
      if(materialSelected(ids)){
        const intent={kind:'material-construction-copy' as const,segmentIds:ids,transform};
        if(drawingSwap){if(!commitSwappedMaterial(intent))return;}
        else {const result=constructMaterialCopy(p.doc,intent);if(p.onChange(result.doc,new Set(result.copiedIds),intent)===false)return;}
      }else {const result=applyDrawingSelectionTransform(p.doc,ids,[...selectedCircles],transform,true,p.lockBoundary,drawingSwap);if(p.onChange(result.doc,p.selected)===false)return;}
      cancelGesture();p.onMessage('已绕指定中心旋转复制选区，保留原线，可一次撤销。');
    }catch(error){constructionError((error as Error).message);}
  }
  function raw(e:{clientX:number;clientY:number}):Point {const m=svg.current!.getScreenCTM()!;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return [point.x,point.y];}
  function trackCursor(e:{clientX:number;clientY:number}){const bounds=svg.current!.getBoundingClientRect();setCursor([e.clientX-bounds.left,e.clientY-bounds.top]);}
  function drawingSnapGrid():CreaseDrawingSnapGrid {
    const shape=svg.current?.querySelector<SVGGeometryElement>('[data-paper-outline], [data-grid-reference-outline]');
    return {visible:p.grid&&visibleGridStep/units>=gridAppearance.minGridPixelSize,scope:gridScope,snap:gridGeometry.snap,
      lattice:gridGeometry,
      contains:shape?(point:Point)=>shape.isPointInFill(new DOMPoint(...point)):undefined};
  }
  function constructionSnap(point:Point,anchor?:Point,shift=false):CreaseDrawingSnapResult {
    return snapCreaseDrawingPoint(point,{enabled:p.snap,radius:pickRadius,points:allSnapPoints,grid:drawingSnapGrid(),
      segments:interactionDoc.segments,projectToSegments:false,anchor,shift});
  }
  function snapped(point:Point):Point {
    return constructionSnap(point).point;
  }
  function constructionPoint(point:Point,anchor?:Point,shift=false):Point {
    const result=constructionSnap(point,anchor,shift);
    drawingSnap.current={result,anchor};return result.point;
  }
  function angleEndpoint(point:Point):Point{
    if(!pending.length)return snapped(point);
    if(p.snap&&distance(pending[0],point)<=pickRadius)return [...pending[0]];
    const projected=snapAnglePoint(pending[0],point,angleSystem);
    if(!p.snap)return projected;
    const resolved=snapAnglePoint(pending[0],point,angleSystem,{radius:pickRadius,segments:interactionDoc.segments,vertices:allSnapPoints.map(v=>v.point)});
    if(distance(resolved,projected)>1e-8||creaseRayHasPhysicalPoint(pending[0],resolved,allSnapPoints,interactionDoc.segments))return resolved;
    return creaseGridRayIntersections(projected,pending[0],drawingSnapGrid(),pickRadius)[0]??resolved;
  }
  function projectedAngle(point:Point){
    const result=angleProjection(pending[0],pending[1],angleSystem,point,pickRadius,p.snap?interactionDoc.segments:[],epsilonFor(p.doc));
    if(!p.snap||result.snappedTo)return result;
    // Keep the chosen candidate direction, but test every nearby finite target.
    // A closer collinear baseline must not mask a transverse physical crossing.
    const angle=Math.atan2(result.point[1]-pending[1][1],result.point[0]-pending[1][0])*180/Math.PI;
    const resolved=snapAnglePointOnDirection(pending[1],point,angle,{radius:pickRadius,segments:interactionDoc.segments,vertices:allSnapPoints.map(v=>v.point)});
    if(distance(resolved,result.point)>1e-8||creaseRayHasPhysicalPoint(pending[1],resolved,allSnapPoints,interactionDoc.segments))return {...result,point:resolved};
    return {...result,point:creaseGridRayIntersections(result.point,pending[1],drawingSnapGrid(),pickRadius)[0]??result.point};
  }
  function drawingAnchors(paperOnly=false):RestrictedAnchors{
    const shape=svg.current?.querySelector<SVGGeometryElement>('[data-paper-outline], [data-grid-reference-outline]');
    const visible=p.grid&&gridScope!=='off'&&visibleGridStep/units>=gridAppearance.minGridPixelSize;
    const fullCanvas=!paperOnly&&gridScope==='canvas';
    return {vertices:visibleSnapPoints.map(v=>v.point),centers:layerState.auxiliary?circles.map(c=>c.center):[],segments:interactionDoc.segments,
      grid:visible&&(fullCanvas||gridOutline&&shape)?{origin:gridGeometry.origin,step,stepY,pattern:p.gridPattern,rotation:gridGeometry.rotation,diagonal:p.diagonalGrid,diagonalAngle:p.diagonalAngle,
        ...(fullCanvas?{}:{bounds:outline?paper:gridReference,contains:(point:Point)=>shape!.isPointInFill(new DOMPoint(...point))})}:undefined};
  }
  function restrictedDrawPoint(q:Point){return restrictedDrawingPoint(q,pickRadius,drawingAnchors(true));}
  function restrictedReferencePoint(q:Point):Point|null{
    return restrictedDrawingPoint(q,pickRadius,drawingAnchors());
  }
  function cursorPoint(q:Point,e:{shiftKey:boolean;ctrlKey?:boolean},anchor?:Point):Point{
    const previousDrawingSnap=drawingSnap.current;
    drawingSnap.current=null;
    if(p.tool==='regioncheck')return pending.length>=3&&distance(pending[0],q)<=pickRadius?pending[0]:q;
    if(p.tool==='voronoi'){const near=[...pending].reverse().find(s=>distance(s,q)<=pickRadius);return near??snapped(q);}
    if(p.tool==='operationframe')return nearestSnapPoint(snapPoints,q,pickRadius)?.point??q;
    if(backgroundTool)return pending.length<2?q:nearestSnapPoint(snapPoints,q,pickRadius)?.point??q;
    if(finiteRayTool)return pending.length<2?constructionPoint(q):q;
    if(restrictedDrawTool)return restrictedDrawPoint(q)??q;
    if(measurementSlot)return restrictedReferencePoint(q)??q;
    if(lineEraseTool||alternateTool){
      if(restrictedReference)return restrictedReferencePoint(q)??q;
      if(p.tool==='erasecross'&&e.ctrlKey&&pending.length){try{return angleEndpoint(q);}catch{return q;}}
      return snapped(q);
    }
    if(p.tool==='line'||p.tool==='mark'||dividedDrawTool){
      const start=anchor??(pending.length===1?pending[0]:undefined);
      const result=snapCreaseDrawingPoint(q,{enabled:p.snap,radius:pickRadius,points:allSnapPoints,grid:drawingSnapGrid(),anchor:start,shift:e.shiftKey,
        previous:previousDrawingSnap&&(!start&&!previousDrawingSnap.anchor||start&&previousDrawingSnap.anchor&&distance(start,previousDrawingSnap.anchor)<=1e-8)?previousDrawingSnap.result:undefined,
        segments:interactionDoc.segments,projectToSegments:p.tool==='line',
        ...(p.tool==='line'?{relationLines:drawingRelationLines}:{})});
      drawingSnap.current={result,anchor:start};return result.point;
    }
    if(p.tool==='angleproject'&&pending.length===2){try{return projectedAngle(q).point;}catch{return q;}}
    if(p.tool!=='angledrag'||!pending.length)return constructionPoint(q,anchor??(pending.length===1?pending[0]:undefined),e.shiftKey);
    try{return angleEndpoint(q);}catch{return q;}
  }
  function finishAngle(a:Point,b:Point){
    const copies=uncoveredCopies(p.doc,[drawingLine(a,b,p.preset)],p.tool,TOOL_NAMES[p.tool]);
    if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
    cancelGesture();p.onMessage(TOOL_NAMES[p.tool]+'已生成，可一次撤销。');
  }
  function zoom(factor:number,anchorRatio:Point=[.5,.5],continuous=false){if(!continuous)restoreNavigationMarkers();setView(v=>{const w=Math.max(.1,Math.min(1e6,v.w*factor)),h=w*size.h/size.w;return{x:v.x+(v.w-w)*anchorRatio[0],y:v.y+(v.h-h)*anchorRatio[1],w,h};});}
  useEffect(()=>{const el=svg.current;if(!el)return;const handler=(e:WheelEvent)=>{e.preventDefault();const factor=wheelZoomFactor(e.deltaY,e.deltaMode,p.zoomSettings??defaultCanvasZoom());if(factor!==1){markWheelNavigation();const rect=el.getBoundingClientRect();zoom(factor,[(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height],true);}};el.addEventListener('wheel',handler,{passive:false});return()=>el.removeEventListener('wheel',handler);},[view,size,p.zoomSettings,p.doc.segments.length]);
  function constrained(q:Point,e:{shiftKey:boolean},anchor:Point|undefined=pending.length===1?pending[0]:undefined):Point{if(!e.shiftKey||!anchor)return q;const a=anchor,r=distance(a,q),t=Math.round(Math.atan2(q[1]-a[1],q[0]-a[0])/(Math.PI/4))*Math.PI/4;return[a[0]+r*Math.cos(t),a[1]+r*Math.sin(t)];}
  function updateHover(point:Point,hitPosition:Point=point){setHover(point);setHoverPosition(hitPosition);p.onPoint(point);setDrawingSnapFeedback(drawingSnap.current&&distance(drawingSnap.current.result.point,point)<=1e-8?drawingSnap.current:null);setHoverTarget(p.tool==='regioncheck'?null:rayTool&&pending.length===3?null:p.tool==='select'?nearestSnapPoint(selectableIntersections,hitPosition,pickRadius):p.snap?nearestSnapPoint(allSnapPoints,point,1e-6):null);}
  function pickVertex(vertex:SnapPoint,extend=false){if(p.readOnly)return;const ids=new Set(extend?p.selected:[]);for(const id of canvasSelectableIncidentIds(interactionDoc,vertex.segmentIds,p.lockBoundary))ids.add(id);p.onSelect(ids);if(!extend)p.onSelectCircles?.(new Set());setSelectedVertex(vertex.id);p.onPoint(vertex.point);}
  function commitConstruction(a:Point,b:Point){
    try{
      const copies=uncoveredCopies(p.doc,[drawingLine(a,b,p.preset)],p.tool,TOOL_NAMES[p.tool]);
      if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return false;
      cancelGesture();p.onMessage(`${TOOL_NAMES[p.tool]}已生成，可一次撤销。`);return true;
    }catch(error){constructionError((error as Error).message);return false;}
  }
  function directionalEnd(hitPosition:Point):Point {
    const target=referenceSegmentAt(hitPosition);
    if(target)return constructionEnd(pending[0],direction!,target,epsilonFor(p.doc));
    const candidate=candidates.find(s=>distanceToSegment(hitPosition,s)<=pickRadius);
    if(candidate&&distance(hitPosition,pending[0])>pickRadius)return candidate.b;
    throw new Error('请点击紫色候选线或实际的截止线段／纸边。');
  }
  function referenceSegmentAt(q:Point):Segment|undefined {
    // Boundary protection only prevents editing, not referencing a paper edge.
    return p.doc.segments.map(s=>({s,d:distanceToSegment(q,s)}))
      .filter(hit=>hit.d<=pickRadius).sort((a,b)=>a.d-b.d||a.s.id.localeCompare(b.s.id))[0]?.s;
  }
  function constructionError(message:string){setToolError(message);p.onMessage(message);}
  function finishCircles(geometries:CircleGeometry[]){
    try{const next=geometries.reduce((doc,c)=>appendCircle(doc,c),p.doc);if(p.onChange(next)===false)return;cancelGesture();p.onMessage(`已生成 ${geometries.length} 个辅助圆，原圆保留，可一次撤销。`);}
    catch(error){constructionError((error as Error).message);}
  }
  function finiteTangents(raw:Tangent[]):Tangent[]{
    const result=raw.flatMap(t=>distance(t.a,t.b)>1e-6?[t]:directionCandidates(p.doc,t.a,t.direction).map(s=>({...s,direction:t.direction,label:t.label+' · 到截止线'})));
    if(!result.length)throw new Error('切点重合，当前切线方向没有可用的截止线；请先绘制截止线段或闭合纸边。');
    return result;
  }
  let tangentChoices:Tangent[]=[];
  try{
    if(p.tool==='tangentpoint'&&pending.length&&circleReferences.length)tangentChoices=finiteTangents(pointTangents(pending[0],circleReferences[0]));
    if(p.tool==='tangentcircles'&&circleReferences.length===2)tangentChoices=finiteTangents(commonTangents(circleReferences[0],circleReferences[1]));
  }catch{/* References are invalidated when document geometry changes. */}
  function segmentCandidate(q:Point,hitPosition:Point):Segment[] {
    if(!source||!sourceChoice)throw new Error('请重新选择参考线段。');
    const eps=epsilonFor(p.doc);
    if(p.lockBoundary&&source.assignment==='B')throw new Error('边界保护已开启，请先取消保护再编辑纸边。');
    if(p.tool==='extend'||p.tool==='lengthen'){
      const target=referenceSegmentAt(hitPosition);if(!target)throw new Error('请点击实际的目标线段或纸边。');
      return [p.tool==='lengthen'?lengthenSegment(source,sourceChoice.end,target,p.preset,eps):extendSegment(source,sourceChoice.end,target,eps)];
    }
    if(p.tool==='addvertex')return insertVertex(p.doc,source,q,pickRadius);
    if(p.tool==='trim')return [trimSegment(source,sourceChoice.end,q,pickRadius,eps)];
    return divideSegment(p.doc,source,p.tool==='divide'?divisionParameters(divisionCount):[ratioParameter(ratioA,ratioB)],sourceChoice.end);
  }
  function chooseContinuousDirection(index:number){
    const candidate=continuousJunction?.candidates[index];if(!candidate||!continuousJunction)return;
    setContinuousChoices(previous=>[...previous.filter(choice=>choice.segmentIndex<continuousJunction.segmentIndex),{segmentIndex:continuousJunction.segmentIndex,point:[...continuousJunction.point],direction:[...candidate.direction]}]);
    setContinuousEndpoint(undefined);setContinuousPickingEnd(false);setToolError('');
  }
  function pickContinuousEndpoint(point:Point):{point:Point;segmentIndex:number}|undefined {
    const eps=epsilonFor(p.doc),snappedPoint=p.snap?nearestSnapPoint(visibleSnapPoints,point,pickRadius)?.point:undefined;
    let best:{point:Point;segmentIndex:number}|undefined,bestDistance=Infinity;
    continuousFullPath.path.forEach((segment,segmentIndex)=>{
      const d=distanceToSegment(point,segment);if(d>pickRadius||d>=bestDistance)return;
      const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],length2=dx*dx+dy*dy;
      if(length2<=eps*eps)return;
      const t=Math.max(0,Math.min(1,((point[0]-segment.a[0])*dx+(point[1]-segment.a[1])*dy)/length2));
      let end:Point=[segment.a[0]+t*dx,segment.a[1]+t*dy];
      if(snappedPoint&&distanceToSegment(snappedPoint,segment)<=eps)end=[...snappedPoint];
      else if(distance(point,segment.b)<=pickRadius)end=[...segment.b];
      if(distance(segment.a,end)<=eps)return;
      best={point:end,segmentIndex};bestDistance=d;
    });
    return best;
  }
  function finishBatchReflection(){
    if(!batchReflectionReady||continuousTool&&(continuousPickingEnd||continuousJunction))return;
    try{
      const {copies,stopMessage}=buildBatchReflection(pending[0],pending[1]);
      if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
      cancelGesture();p.onMessage(`已生成 ${copies.length} 段${batchReflectionName}线，${fishboneTool?stopMessage:continuousTool?stopMessage+(continuousAlternate?'；山谷逐段交替':'；全部使用'+NAMES[drawingAssignment]):drawingSwap?'副本山谷互换，保留折角幅值':'保留原山谷与折角'}${drawingSwap&&fishboneTool?'；生成线已山谷互换':''}，可整组撤销。`);
    }catch(error){constructionError((error as Error).message);}
  }
  function finishRabbitEar(){
    if(!rabbitReady)return;
    try{
      const {copies}=rabbitEar(p.doc,pending,p.preset,p.drawingAngle,drawingSwap);
      if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
      cancelGesture();p.onMessage(`已生成 ${copies.length} 段兔耳构造线；连接顶点与内心，可整组撤销。`);
    }catch(error){constructionError((error as Error).message);}
  }
  function finishAxiom(target?:Segment){
    if(axiomChoice===null)return;
    try{
      const fold=axiomResult.folds[axiomChoice];if(!fold)throw new Error('候选已变化，请重新选择。');
      const result=target?axiomCutoff(fold,target,epsilonFor(p.doc)):axiomFullSegment(p.doc,fold,epsilonFor(p.doc));
      const copies=uncoveredCopies(p.doc,[drawingLine(result.a,result.b,p.preset)],p.tool,TOOL_NAMES[p.tool]);
      if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
      cancelGesture();p.onMessage('已生成所选公理折线，可一次撤销；参考点和参考线未修改。');
    }catch(error){constructionError((error as Error).message);}
  }
  function finishLineBisector(result:{a:Point;b:Point}){
    const copies=uncoveredCopies(p.doc,[drawingLine(result.a,result.b,p.preset)],'bisectlines','两线角平分');
    if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
    cancelGesture();p.onMessage('已生成两线角平分／平行中线，参考线保留，可一次撤销。');
  }
  function finishFullMidline(){
    if(!lineBisectorResult.value)return;
    try{finishLineBisector(parallelMidlineFull(p.doc,lineBisectorResult.value,epsilonFor(p.doc)));}
    catch(error){constructionError((error as Error).message);}
  }
  function finishOffset(index:number){
    if(!offsetSource||!offsetReady)return;
    try{
      const candidate=parallelOffsets(offsetSource,offsetWidth,p.preset,epsilonFor(p.doc))[index];
      const copies=uncoveredCopies(p.doc,swapGeneratedLines(applyDrawingFoldAngle([candidate],p.drawingAngle),drawingSwap),'offsetparallel','定距平行线');
      if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
      cancelGesture();p.onMessage('定距平行线已生成，长度与原线相同，原线保留，可撤销。');
    }catch(error){constructionError((error as Error).message);}
  }
  function foldablePointAt(q:Point):Point|null{
    const vertex=nearestSnapPoint(snapPoints,q,pickRadius);
    if(vertex)return [...vertex.point];
    return restrictedDrawingPoint(q,pickRadius,{vertices:[],centers:[],segments:interactionDoc.segments,grid:drawingAnchors().grid});
  }
  function commitFoldable(target?:Segment){
    if(!foldableState)return;
    try{
      const result=foldableDrawTool?finishFoldableDraw(p.doc,foldableState,target):finishFoldableInput(foldableState,p.preset,target,epsilonFor(p.doc));
      const copies=uncoveredCopies(p.doc,[drawingLine(result.a,result.b,result.assignment,result.angle)],p.tool==='foldabledraw'?'foldabledraw':'foldableinput',TOOL_NAMES[p.tool]);
      if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
      cancelGesture();p.onMessage(`${TOOL_NAMES[p.tool]}已生成，可一次撤销；终点可自由重选，因此不保证局部或全局可折。`);
    }catch(error){constructionError((error as Error).message);}
  }
  function finishRegion(points:Point[]){
    try{
      const hits=regionCross?segmentsCrossingSelectionLine(interactionDoc,points[0],points[1],p.lockBoundary):segmentsInSelectionRegion(interactionDoc,points,regionLasso?'lasso':'polygon',p.lockBoundary);
      p.onSelect(updateRegionSelection(p.selected,hits,regionRemove));cancelGesture();
      p.onMessage(`${regionRemove?'撤选':'选择'}完成，命中 ${hits.size} 条线段；只改变选区，不修改作品。`);return true;
    }catch(error){constructionError((error as Error).message);return false;}
  }
  function draw(q:Point,hitPosition:Point=q){
    if(finiteRayTool){
      try{
        if(pending.length<2){
          if(pending.length&&distance(pending[0],q)<=epsilonFor(p.doc))throw new Error('射线起点与经过点不能重合或过近，请重新选择经过点。');
          setPending([...pending,q]);setToolError('');return;
        }
        const targetId=pickEraseSegment(interactionDoc,hitPosition,pickRadius,false);
        if(!targetId)throw new Error('请点击射线前方路径上的已有线段或纸边，不能在空白处结束。');
        const next=appendRayConstruction(p.doc,pending[0],pending[1],targetId,drawingAssignment,p.lockBoundary,p.drawingAngle);
        if(p.onChange(next)!==false){cancelGesture();p.onMessage('射线已延伸到所选线段的交点，可一次撤销。');}
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(dividedDrawTool){
      if(!pending.length){setPending([q]);return;}
      try{
        const next=appendDividedLine(p.doc,pending[0],q,drawingAssignment,drawDivision,p.lockBoundary,p.drawingAngle);
        if(next===p.doc){cancelGesture();p.onMessage('比例为零或结果已存在，作品未改变。');}
        else if(p.onChange(next)!==false){cancelGesture();p.onMessage('分段线已生成，分点可独立选择；可一次撤销。');}
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(regionPolygon){
      if(pending.length>=3&&distance(hitPosition,pending[0])<=pickRadius){finishRegion(pending);return;}
      if(pending.length&&distance(q,pending.at(-1)!)<=epsilonFor(p.doc)){constructionError('请点击不同的顶点；至少三点后回到起点闭合。');return;}
      setPending([...pending,q]);setToolError('');return;
    }
    if(regionCross){if(!pending.length){setPending([q]);setToolError('');}else finishRegion([pending[0],q]);return;}
    if(transformTool){
      try{
        if(selectedCircles.size&&materialSelected([...p.selected]))throw new Error('材料部件与辅助圆请分别进行定位变换。');
        if(!p.selected.size&&!selectedCircles.size)throw new Error('请先切换到选择工具，选中需要变换的线段或辅助圆。');
        if(rotationTool){if(!pending.length){drawingRotationReference(p.doc,p.selected,selectedCircles,q);setPending([q]);setToolError('');}else finishRotationCopy(hitPosition);return;}
        const point=fourPointTool?nearestSnapPoint(snapPoints,hitPosition,pickRadius)?.point:q;
        if(!point)throw new Error('四点定位请选择已有端点或交点，不使用空白网格点。');
        const next=[...pending,point],eps=epsilonFor(p.doc);
        if(next.length===2&&distance(next[0],next[1])<=eps&&!(transformCopy&&!fourPointTool&&materialSelected([...p.selected])))throw new Error('两个基准点不能重合，请另选一点。');
        if(next.length<(fourPointTool?4:2)){setPending(next);setToolError('');return;}
        const transform=selectedTransform(next),ids=[...p.selected];
        if(transformCopy&&materialSelected(ids)){
          const intent={kind:'material-construction-copy' as const,segmentIds:ids,transform};
          if(drawingSwap){if(!commitSwappedMaterial(intent))return;cancelGesture();p.onMessage('已复制完整材料部件，副本山谷互换并保留折角幅值，CP/FF同步，可一次撤销。');return;}
          const result=constructMaterialCopy(p.doc,intent);
          if(p.onChange(result.doc,new Set(result.copiedIds),intent)===false)return;
          cancelGesture();p.onMessage('已复制完整材料部件，CP/FF使用同一参考点变换，可一次撤销。');return;
        }
        if(!transformCopy&&materialSelected(ids)){
          const intent={kind:'material-construction-move' as const,segmentIds:ids,transform,lockBoundary:p.lockBoundary},result=constructMaterialMove(p.doc,intent);
          if(p.onChange(result.doc,new Set(result.movedIds),intent)===false)return;
          cancelGesture();p.onMessage('已移动完整材料部件，保留全部边身份，CP/FF使用同一参考点变换，可一次撤销。');return;
        }
        const result=applyDrawingSelectionTransform(p.doc,ids,[...selectedCircles],transform,transformCopy,p.lockBoundary,drawingSwap);
        const retained=transformCopy?p.selected:new Set(result.drawnIds);
        if(p.onChange(result.doc,retained)===false)return;
        cancelGesture();p.onMessage(`${transformCopy?'复制':'移动'}已完成，${drawingSwap?'副本山谷互换并保留折角幅值':'保留原线型和折角'}，可一次撤销。`);
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(foldableActive){
      try{
        const point=foldablePointAt(hitPosition);
        if(!foldableState){
          if(!point)throw new Error('请点击已有顶点或显示的网格点，不能在任意空白处起笔。');
          setFoldableState(beginFoldableInput(p.doc,point,step));setToolError('');return;
        }
        if(distance(hitPosition,foldableState.origin)<=pickRadius){cancelGesture();p.onMessage('已取消组合输入。');return;}
        if(!foldableState.end){
          const candidate=pickFoldableDirection(foldableState,hitPosition,pickRadius,Math.max(epsilonFor(p.doc),units/2));
          if(candidate!==null){setFoldableState(chooseFoldableDirection(foldableState,candidate));setToolError('');return;}
          if(!point)throw new Error('请选择紫色候选，或点击已有点／网格点暂定终点。');
          setFoldableState(setFoldableEndpoint(foldableState,point,epsilonFor(p.doc)));setToolError('');return;
        }
        const endDistance=distance(hitPosition,foldableState.end);
        if(endDistance<=pickRadius&&(!point||endDistance<=distance(hitPosition,point)+epsilonFor(p.doc))){commitFoldable();return;}
        if(point){setFoldableState(setFoldableEndpoint(foldableState,point,epsilonFor(p.doc)));setToolError('');return;}
        const target=referenceSegmentAt(hitPosition);
        if(target){commitFoldable(target);return;}
        throw new Error('请再次点击暂定终点确认，或点已有／网格点重选终点、点实际线截止。');
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(localFlatTool){
      try{
        if(!pending.length){
          const vertex=nearestSnapPoint(snapPoints,hitPosition,pickRadius);
          if(!vertex)throw new Error('请点击已有折线顶点；空白网格点不能用于局部补线。');
          const result=localFlatCandidates(p.doc,vertex.point,p.preset);
          setPending([[...vertex.point]]);setLocalFlatChoice(result.candidates.length===1?0:null);setToolError('');return;
        }
        if(localFlatChoice===null){
          const suggestions:Point[]=localFlatResult.candidates.map(c=>[c.origin[0]+step*c.direction[0],c.origin[1]+step*c.direction[1]]);
          const candidate=pickFoldableDirection({origin:pending[0],suggestions},hitPosition,pickRadius,Math.max(epsilonFor(p.doc),units/2));
          if(candidate===null||distance(hitPosition,pending[0])<=pickRadius)throw new Error('请选择明确的紫色方向，或使用候选编号。');
          setLocalFlatChoice(candidate);setToolError('');return;
        }
        const candidate=localFlatResult.candidates[localFlatChoice],target=referenceSegmentAt(hitPosition);
        if(!candidate||!target)throw new Error('请选择补线前方的实际截止线。');
        const result=localFlatCutoff(candidate,target,epsilonFor(p.doc));
        const copies=uncoveredCopies(p.doc,[drawingLine(result.a,result.b,result.assignment,result.angle)],'localflat','局部补线');
        if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
        cancelGesture();p.onMessage('局部补线已生成，可一次撤销；仅满足局部角度条件，不代表全模型可折。');
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(angleTool){
      try{
        angleOffsets(angleSystem);
        if(specialAngleTool){
          if(pending.length===0&&p.tool==='angleconverge'){
            const vertex=nearestSnapPoint(allSnapPoints,hitPosition,pickRadius);
            const source=vertex?undefined:referenceSegmentAt(hitPosition);
            if(source){convergenceFans(source.a,source.b,angleSystem,epsilonFor(p.doc));setPending([[...source.a],[...source.b]]);setToolError('');return;}
            setPending([vertex?[...vertex.point]:q]);setToolError('');return;
          }
          if(pending.length<2){
            if(pending.length)constructionFan(q,pending[0],angleSystem,100,epsilonFor(p.doc));
            setPending([...pending,q]);setToolError('');return;
          }
          if(p.tool==='angleproject'){
            const result=projectedAngle(hitPosition);
            finishAngle(pending[1],result.point);
          }else{
            const result=angleConvergence(pending[0],pending[1],angleSystem,hitPosition,pickRadius,epsilonFor(p.doc));
            const copies=uncoveredCopies(p.doc,result.legs.map(s=>drawingLine(s.a,s.b,p.preset)),'angleconverge','角度会聚');
            if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary))===false)return;
            cancelGesture();p.onMessage('角度会聚已生成，两条线可一次撤销；基线保留。');
          }
          return;
        }
        if(p.tool==='angledrag'){
          if(!pending.length){setPending([q]);return;}
          const end=angleEndpoint(hitPosition);
          if(distance(pending[0],end)<=epsilonFor(p.doc))throw new Error('终点投影与起点重合，请重新选择。');
          finishAngle(pending[0],end);return;
        }
        if(pending.length<2){
          if(pending.length)angleFan(pending[0],q,angleSystem,epsilonFor(p.doc));
          setPending([...pending,q]);setToolError('');return;
        }
        if(angleChoice===null){
          const hits=angleResult.fan.map((f,i)=>({i,d:distanceToSegment(hitPosition,{a:f.origin,b:f.end} as Segment)})).filter(v=>v.d<=pickRadius).sort((a,b)=>a.d-b.d);
          if(!hits.length||distance(hitPosition,pending[1])<=pickRadius||hits.length>1&&Math.abs(hits[0].d-hits[1].d)<1e-6)throw new Error('请点击明确的紫色方向，或从方向候选列表选择。');
          setAngleChoice(hits[0].i);setToolError('');return;
        }
        const ray=angleResult.fan[angleChoice],target=referenceSegmentAt(hitPosition);
        if(!ray||!target)throw new Error('请选择所选方向前方的实际截止线。');
        finishAngle(ray.origin,angleRayCutoff(ray.origin,ray.direction,target,epsilonFor(p.doc)));
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(offsetTool){
      try{
        if(!offsetSource){const source=referenceSegmentAt(hitPosition);if(!source)throw new Error('请点击实际原线段。');if(distance(source.a,source.b)<=epsilonFor(p.doc))throw new Error('原线段过短。');setOffsetSourceId(source.id);setToolError('');return;}
        if(!offsetReady){
          if(!pending.length){setPending([q]);setToolError('');return;}
          const width=distance(pending[0],q);parallelOffsets(offsetSource,width,p.preset,epsilonFor(p.doc));
          setOffsetWidth(width);setPending([pending[0],q]);setOffsetReady(true);setToolError('');return;
        }
        const hits=offsetResult.copies.map((s,i)=>({i,d:distanceToSegment(hitPosition,s)})).filter(x=>x.d<=pickRadius);
        if(hits.length!==1)throw new Error('请点击一个紫色候选，接近重合时使用编号按钮。');
        finishOffset(hits[0].i);
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(lineBisectorTool){
      try{
        const target=referenceSegmentAt(hitPosition),value=lineBisectorResult.value;
        if(!target){
          if(value?.kind==='parallel'&&!bisectorCut){const full=parallelMidlineFull(p.doc,value,epsilonFor(p.doc));if(distanceToSegment(hitPosition,full)<=pickRadius){finishLineBisector(full);return;}}
          throw new Error('请点击实际参考线或截止线段；平行中线也可用“生成完整中线”。');
        }
        if(bisectorRefs.length<2){
          if(bisectorRefs.length)lineBisector(bisectorRefs[0],target,epsilonFor(p.doc));
          setBisectorIds([...bisectorIds,target.id]);setToolError('');return;
        }
        if(!value)throw new Error(lineBisectorResult.error);
        if(value.kind==='intersecting'){finishLineBisector(lineBisectorCutoff(value,target,epsilonFor(p.doc)));return;}
        if(!bisectorCut){lineTarget(value.origin,value.direction,target,epsilonFor(p.doc));setBisectorCutId(target.id);setToolError('');return;}
        finishLineBisector(parallelMidlineCutoffs(value,bisectorCut,target,epsilonFor(p.doc)));
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(axiomTool){
      try{
        if(!pending.length){setPending([q]);setToolError('');return;}
        if(!axiomRefs.length){const target=referenceSegmentAt(hitPosition);if(!target)throw new Error('请点击实际目标线段或纸边。');setAxiomIds([target.id]);setToolError('');return;}
        if(!axiomReady){
          if(p.tool==='axiom5'){axiom5(pending[0],axiomRefs[0],q,epsilonFor(p.doc));setPending([pending[0],q]);}
          else{const ref=referenceSegmentAt(hitPosition);if(!ref)throw new Error('请点击实际垂直参考线。');axiom7(pending[0],axiomRefs[0],ref,epsilonFor(p.doc));setAxiomIds([...axiomIds,ref.id]);}
          setToolError('');return;
        }
        if(axiomChoice===null){
          const hits=axiomResult.folds.map((f,i)=>({i,d:Math.abs((hitPosition[0]-f.origin[0])*f.direction[1]-(hitPosition[1]-f.origin[1])*f.direction[0])})).filter(x=>x.d<=pickRadius);
          if(hits.length!==1)throw new Error(hits.length?'候选在此处重合，请用编号按钮明确选解。':'请点击紫色候选或编号按钮选解。');
          setAxiomChoice(hits[0].i);setToolError('');return;
        }
        const target=referenceSegmentAt(hitPosition);if(!target)throw new Error('请点击实际截止线，或点击“生成所选整段”。');
        finishAxiom(target);
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(p.tool==='cycletype'){
      const target=referenceSegmentAt(hitPosition);
      if(!target){constructionError('请点击需要循环线型的实际小段。');return;}
      try{
        const next=cycleCrease(p.doc,target.id,p.lockBoundary);
        if(p.onChange(next)===false)return;
        setToolError('');p.onMessage(`已将该小段从${NAMES[target.assignment]}改为${NAMES[next.segments.find(s=>s.id===target.id)!.assignment]}，可撤销。`);
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(rabbitTool){
      if(rabbitReady){
        if(rabbitResult.copies.some(s=>distanceToSegment(hitPosition,s)<=pickRadius))finishRabbitEar();
        else constructionError(rabbitResult.error||'请点击紫色结果线或“确认兔耳构造”。');
        return;
      }
      if(pending.some(a=>distance(a,q)<=epsilonFor(p.doc))){constructionError('三个顶点不能重合或过近，请重新选择。');return;}
      if(pending.length===2){try{rabbitEar(p.doc,[...pending,q],p.preset,p.drawingAngle,drawingSwap);}catch(error){constructionError((error as Error).message);return;}}
      setToolError('');setPending([...pending,q]);return;
    }
    if(batchReflectionTool){
      setToolError('');
      if(batchReflectionReady){
        if(continuousTool&&continuousPickingEnd){
          const endpoint=pickContinuousEndpoint(hitPosition);
          if(!endpoint){constructionError('请点击紫色路径上的终点；起点不能作为终点。');return;}
          setContinuousEndpoint(endpoint);setContinuousPickingEnd(false);
          p.onMessage('已选择折射终点，请核对紫色路径后确认。');return;
        }
        if(continuousTool&&continuousJunction){
          try{
            const index=pickFoldableDirection({origin:continuousJunction.point,suggestions:continuousJunction.candidates.map(candidate=>candidate.end)},hitPosition,pickRadius);
            if(index===null)throw new Error('请点击一条紫色续接方向，或使用上方的方向按钮。');
            chooseContinuousDirection(index);
          }catch(error){constructionError((error as Error).message);}
          return;
        }
        if(batchReflectionResult.copies.some(s=>distanceToSegment(hitPosition,s)<=pickRadius))finishBatchReflection();
        else constructionError(batchReflectionResult.error||`请点击紫色结果线或“确认${batchReflectionName}”，不要点击空白处。`);
        return;
      }
      if(!pending.length){setPending([q]);return;}
      try{buildBatchReflection(pending[0],q);setPending([pending[0],q]);}
      catch(error){constructionError((error as Error).message);}
      return;
    }
    if(mirrorTool){
      setToolError('');
      try{
        if(mirrorReady){if(!(p.tool==='mirrorselection'?inMirrorRegion(hitPosition,mirrorResult.copies,pickRadius):mirrorResult.copies.some(s=>distanceToSegment(hitPosition,s)<=pickRadius)))throw new Error(mirrorResult.error||'请点击紫色镜像区域，或点击“确认镜像”。');finishMirror();return;}
        if(p.tool==='mirrorline'){
          const hit=referenceSegmentAt(hitPosition);if(!hit)throw new Error(mirrorSourceIds.length?'请点击作为对称轴的已有线段或纸边。':'请点击需要镜像的原线段。');
          if(!mirrorSourceIds.length){if(p.lockBoundary&&hit.assignment==='B')throw new Error('边界保护已开启，不能选择纸边作为原线。');setMirrorSourceIds([hit.id]);return;}
          if(!materialSelected(mirrorSourceIds))mirrorCopies(p.doc,mirrorSourceIds,hit.a,hit.b,p.lockBoundary);setMirrorAxisId(hit.id);setPending([hit.a,hit.b]);return;
        }
        const vertex=nearestSnapPoint(allSnapPoints,hitPosition,pickRadius);
        const hit=pickEraseSegment(interactionDoc,hitPosition,pickRadius,p.lockBoundary);
        const gridPoint=p.snap&&(!hit||pending.length>0)
          ?restrictedDrawingPoint(hitPosition,pickRadius,{vertices:[],centers:[],segments:interactionDoc.segments,grid:drawingAnchors().grid})
          :null;
        const axisPoint=vertex?.point??gridPoint;
        if(!pending.length&&!axisPoint){if(hit){p.onSelect(toggleMirrorSelection(p.selected,[hit]));return;}throw new Error('点击线身或拖框接触线段来切换选择；点击端点、交点或空白网格点开始定轴。');}
        if(!axisPoint)throw new Error('请点击端点、交点或网格点作为镜面第二点。');
        if(!pending.length){
          const selected=p.doc.segments.filter(s=>p.selected.has(s.id));
          if(!selected.length)throw new Error('请先点击线身或拖框选择线段，再点击镜面第一点。');
          if(p.lockBoundary&&selected.some(s=>s.assignment==='B')&&!materialSelected(selected.map(s=>s.id)))throw new Error('选区包含受保护纸边，请先取消边界保护或调整选区。');
          setMirrorSourceIds(selected.map(s=>s.id));setPending([[...axisPoint]]);return;
        }
        mirrorCandidates(pending[0],axisPoint);setPending([pending[0],[...axisPoint]]);
      }catch(error){constructionError((error as Error).message);}return;
    }
    if(extraCircleTool){
      setToolError('');
      try{
        if(extraCircleResult?.kind==='circle'){
          if(Math.abs(distance(hitPosition,extraCircleResult.circle.center)-extraCircleResult.circle.radius)>pickRadius)throw new Error('请点击紫色结果圆，或点击上方确认按钮。');
          finishCircles([extraCircleResult.circle]);return;
        }
        if(extraCircleResult?.kind==='line'){
          const target=referenceSegmentAt(hitPosition);if(!target)throw new Error('请选择实际截止线段或纸边，不能直接点击空白位置。');
          const point=lineTarget(extraCircleResult.origin,extraCircleResult.direction,target,epsilonFor(p.doc));
          if(!pending.length){setPending([point]);return;}
          if(distance(point,pending[0])<=epsilonFor(p.doc))throw new Error('两个截止点重合，请选择另一条截止线。');
          if(p.onChange(overlayDrawnSegments(p.doc,[line(pending[0],point,'A')],p.lockBoundary))===false)return;
          cancelGesture();p.onMessage('反演结果已生成有限辅助线，原对象保留，可一次撤销。');return;
        }
        if(p.tool==='lineinvert'&&!inverseSource){
          const source=referenceSegmentAt(hitPosition);if(!source)throw new Error('请点击确定支撑直线的已有线段。');
          setInverseSourceId(source.id);return;
        }
        const circle=pickCircle(p.doc.objects??[],hitPosition,pickRadius);
        if(!circle)throw new Error('请点击已有辅助圆的圆周或圆心。');
        if(p.tool==='circledifference'&&circleReferences.length===2)radiusDifferenceCircle(circleReferences[0],circleReferences[1],circle);
        if(p.tool==='circleinvert'&&circleReferences.length===1){
          const result=invertCircle(circleReferences[0],circle);
          if(result.kind==='circle'&&sameCircle(result.circle,circleReferences[0]))throw new Error('反演结果与原圆重合，无需重复生成；请更换基准圆。');
        }
        if(p.tool==='lineinvert'&&inverseSource){
          const result=invertSupportingLine(inverseSource,circle);
          if(result.kind==='unchanged')throw new Error('支撑直线经过反演中心，反演后仍是原直线，不重复生成。请更换基准圆或取消。');
        }
        setCircleReferenceIds([...circleReferenceIds,circle.id]);
      }catch(error){constructionError((error as Error).message);}return;
    }
    if(advancedCircleTool){
      setToolError('');
      try{
        if(tangentChoices.length){
          const candidate=tangentChoices.map(t=>({t,d:distanceToSegment(hitPosition,t)})).filter(h=>h.d<=pickRadius).sort((a,b)=>a.d-b.d)[0]?.t;
          if(!candidate)throw new Error('请点击紫色候选线，或使用上方编号按钮。');
          commitConstruction(candidate.a,candidate.b);return;
        }
        if(p.tool==='circleseparate'){
          if(pending.length<2){setPending([...pending,q]);return;}
          finishCircles([separateCircle(pending[0],pending[1],q)]);return;
        }
        if(p.tool==='tangentpoint'&&!pending.length){setPending([q]);return;}
        if(p.tool==='circleequal'&&circleReferences.length){finishCircles([circleGeometry(q,circleReferences[0].radius)]);return;}
        if(p.tool==='circleconcentric'&&circleReferences.length){
          if(!pending.length){setPending([q]);return;}
          finishCircles([concentricCircle(circleReferences[0],pending[0],q)]);return;
        }
        if(p.tool==='circlepair'&&circleReferences.length===2){
          const pair=externallyTangentPair(circleReferences[0],circleReferences[1]);
          if(!pair.some(c=>Math.abs(distance(hitPosition,c.center)-c.radius)<=pickRadius))throw new Error('请点击紫色新圆，或点击“确认双圆”。');
          finishCircles(pair);return;
        }
        const circle=pickCircle(p.doc.objects??[],hitPosition,pickRadius);
        if(!circle)throw new Error('请点击已有辅助圆的圆周或圆心。');
        if(circleReferenceIds.includes(circle.id))throw new Error('请另选一个不同的参考圆。');
        if(p.tool==='tangentpoint')finiteTangents(pointTangents(pending[0],circle));
        if(p.tool==='tangentcircles'&&circleReferences.length)finiteTangents(commonTangents(circleReferences[0],circle));
        if(p.tool==='circlepair'&&circleReferences.length)externallyTangentPair(circleReferences[0],circle);
        setCircleReferenceIds([...circleReferenceIds,circle.id]);
      }catch(error){constructionError((error as Error).message);}return;
    }
    if(p.tool==='circleedit'){
      const circle=layerState.auxiliary?pickCircle(p.doc.objects??[],hitPosition,pickRadius):undefined;
      setSelectedCircleId(circle?.id??null);p.onSelectCircles?.(new Set(circle?[circle.id]:[]));
      p.onSelect(new Set());setToolError('');return;
    }
    if(circleTool){
      setToolError('');
      try{
        const points=[...pending,q];
        if(points.slice(0,-1).some(v=>distance(v,q)<1e-6))throw new Error('两点不能重合，请另选一个点。');
        if(p.tool==='circle'&&points.length<2||p.tool==='circle3'&&points.length<3){setPending(points);return;}
        const geometry=p.tool==='circleradius'?circleGeometry(q,circleRadius):p.tool==='circle3'?circleThroughThree(points[0],points[1],q):circleGeometry(points[0],distance(points[0],q));
        if(p.onChange(appendCircle(p.doc,geometry))===false)return;
        cancelGesture();p.onMessage('辅助圆已生成，不参与折叠计算，可一次撤销。');
      }catch(error){constructionError((error as Error).message);}return;
    }
    if(p.tool==='polygon'){
      setToolError('');
      if(!pending.length){setPending([q]);return;}
      try{
        const vertices=regularPolygon(pending[0],q,polygonCount,polygonClockwise,epsilonFor(p.doc));
        const edges=vertices.map((a,i)=>drawingLine(a,vertices[(i+1)%vertices.length],p.preset));
        if(p.onChange(overlayDrawnSegments(p.doc,edges,p.lockBoundary))===false)return;
        cancelGesture();p.onMessage(`已生成正 ${polygonCount} 边形，可一次撤销。`);
      }catch(error){constructionError((error as Error).message);}return;
    }
    if((p.tool==='mergevertex'||crossMergeTool)){
      setToolError('');
      try{
        if(!pending.length){
          const vertex=nearestSnapPoint(snapPoints,hitPosition,pickRadius);
          if(!vertex)throw new Error('请点击已有共线顶点。');
          if(crossMergeTool)mergeCrossTypeVertex(p.doc,vertex.point,p.lockBoundary,null);else mergeVertex(p.doc,vertex.point,p.lockBoundary);
          setCrossMergeAngle('');setPending([[...vertex.point]]);return;
        }
        if(distance(hitPosition,pending[0])>pickRadius)throw new Error('请再次点击紫色顶点确认，或右击取消。');
        const merge=crossMergeTool?mergeCrossTypeVertex(p.doc,pending[0],p.lockBoundary,crossMergeAngle===''?undefined:crossMergeAngle==='null'?null:Number(crossMergeAngle)):mergeVertex(p.doc,pending[0],p.lockBoundary);
        if(p.onChange({...p.doc,segments:p.doc.segments.flatMap(s=>s.id===merge.ids[0]?[merge.segment]:merge.ids.includes(s.id)?[]:[s])})===false)return;
        cancelGesture();p.onMessage(crossMergeTool?`共线顶点已合并为${NAMES[merge.segment.assignment]}，可一次撤销。`:'共线顶点已合并，原线型与折角保持不变。');
      }catch(error){constructionError((error as Error).message);}return;
    }
    if(segmentTool){
      setToolError('');
      if(!source){
        const hit=referenceSegmentAt(hitPosition);
        if(!hit){constructionError('请点击已有线段。');return;}
        if(p.lockBoundary&&hit.assignment==='B'){constructionError('边界保护已开启，请先取消保护再编辑纸边。');return;}
        const end=distance(hitPosition,hit.a)<=distance(hitPosition,hit.b)?'a':'b';
        setSourceChoice({id:hit.id,end});setPending([[...hit[end]]]);return;
      }
      try{
        if((p.tool==='divide'||p.tool==='ratio')&&distanceToSegment(hitPosition,source)>pickRadius)throw new Error('请再次点击紫色参考线段以确认分割，或右击取消。');
        const pieces=segmentCandidate(q,hitPosition);
        const next={...p.doc,segments:p.doc.segments.flatMap(s=>s.id===source.id?pieces:[s])};
        if(p.onChange(next)===false)return;
        setPending([]);setSourceChoice(null);p.onSelect(new Set(pieces.map(s=>s.id)));
        p.onMessage(`${TOOL_NAMES[p.tool]}完成；保留原线型与折角，可一次撤销。`);
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(p.tool==='midperp'){
      setToolError('');
      if(pending.length<2){if(pending.length&&distance(pending[0],q)<=epsilonFor(p.doc)){constructionError('两个基准点不能重合。');return;}setPending([...pending,q]);return;}
      const target=referenceSegmentAt(hitPosition);if(!target){constructionError('请点击截止线段或纸边。');return;}
      try{const result=perpendicularBisector(pending[0],pending[1],target,epsilonFor(p.doc));if(!commitConstruction(result.a,result.b))return;p.onMessage('中垂线已从中点生成到目标线，可一次撤销。');}
      catch(error){constructionError((error as Error).message);}return;
    }
    if(directionalTool){
      setToolError('');
      if(!pending.length){setPending([q]);return;}
      try{
        if(!reference){
          const base=referenceSegmentAt(hitPosition);
          if(!base)throw new Error('请点击已有参考线段或纸边。');
          const foot=perpendicularFoot(pending[0],base);
          if(p.tool==='perpendicular'&&distance(pending[0],foot)>epsilonFor(p.doc)){commitConstruction(pending[0],foot);return;}
          if(p.tool==='parallel'&&distance(pending[0],foot)<=epsilonFor(p.doc))throw new Error('起点在参考直线上，会生成重合线，请换参考线或右击重选起点。');
          setReferenceId(base.id);return;
        }
        commitConstruction(pending[0],directionalEnd(hitPosition));
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(twoLineReflection&&reflectionIds.length<2){
      setToolError('');
      const hit=referenceSegmentAt(hitPosition);
      if(!hit){constructionError('请点击实际参考线段或纸边。');return;}
      if(!reflectionIds.length){setReflectionIds([hit.id]);return;}
      try{
        if(!reflectionRefs[0])throw new Error('原线已变化，请右击重新选择。');
        const points=lineReflectionPoints(reflectionRefs[0],hit,epsilonFor(p.doc));
        setReflectionIds([reflectionIds[0],hit.id]);setPending(points);
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(rayTool){
      setToolError('');
      if(pending.length<3){
        const points=[...pending,q];
        if(points.length===2&&distance(points[0],points[1])<1e-8){constructionError('顶点不能与第一点重合，请重新选择第二点。');return;}
        if(points.length===3){try{makeRay(points);}catch(error){constructionError((error as Error).message);return;}}
        setPending(points);return;
      }
      const target=referenceSegmentAt(hitPosition);
      if(!target){constructionError('请点击已有线段或纸张边界作为截止线；空白处不能确定终点。');return;}
      try{
        const bisector=makeRay(pending);
        const end=rayEnd(bisector,target);
        if(!commitConstruction(bisector.origin,end))return;
        p.onMessage(`已生成${NAMES[drawingAssignment]}${rayName}：从${twoLineReflection?'两线交点':'第二点'}出发，截止到所选${target.assignment==='B'?'纸边':'线段'}。`);
      }catch(error){constructionError((error as Error).message);}
      return;
    }
    if(!pending.length){setPending([q]);return;}const a=pending[0];if(distance(a,q)<1e-6){p.onMessage('起点和终点不能重合。');return;}
    if(p.tool==='measure'){const angle=Math.atan2(q[1]-a[1],q[0]-a[0])*180/Math.PI;p.onMessage(`长度 ${distance(a,q).toFixed(3)} mm · 方向角 ${angle.toFixed(2)}°`);}
    else {try{if(p.onChange(overlayDrawnSegments(p.doc,[drawingLine(a,q,p.preset)],p.lockBoundary))===false)return;}catch(error){constructionError((error as Error).message);return;}}setPending([]);
  }
  function down(e:React.PointerEvent<SVGSVGElement>){
    if(e.button===2){
      e.preventDefault();
      drawingSnap.current=null;setDrawingSnapFeedback(null);
      if(p.readOnly)return;
      svg.current!.focus({preventScroll:true});trackCursor(e);
      // Cancellation takes priority so abandoning a construction never silently
      // deletes the reference line under the pointer. Idle right-click erases.
      if(hasActiveOperation()||(p.tool==='mirrorselection'&&p.selected.size)){cancelOperation();p.onMessage('已取消当前操作。再次右击可删线，右键拖动可框删。');return;}
      const q=raw(e);updateHover(q,q);setHoverTarget(null);setSelectedVertex(null);setToolError('');
      gesture.current={kind:'erase',pointerId:e.pointerId,button:e.button,start:q,press:q,client:[e.clientX,e.clientY],view,ids:new Set()};
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(e.button!==0&&e.button!==1||gesture.current)return;
    // Suppress native middle-button autoscroll and keep receiving the release
    // even when a drag leaves the canvas. Middle drag works in every tool.
    e.preventDefault();svg.current!.focus({preventScroll:true});trackCursor(e);const q=raw(e),navigation=e.button===1||space.current||p.tool==='pan';
    if(!navigation&&topologyBlocked){input.onMessage('交点尚未准备完成；可以继续缩放和平移。');return;}
    const point=navigation?q:cursorPoint(q,e);if(!navigation)updateHover(point,q);
    const common={pointerId:e.pointerId,button:e.button,start:q,press:point,client:[e.clientX,e.clientY] as Point,view,ids:new Set<string>()};
    if(navigation){gesture.current={...common,kind:'pan'};setPanning(true);e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(p.readOnly)return;
    setSelectedVertex(null);
    if(p.tool==='erase'||p.tool==='erasemark'||p.tool==='eraseaux'){
      gesture.current={...common,kind:'erase'};setToolError('');
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(p.tool==='regioncheck'){
      if(regionCheck){p.onMessage('当前结果仅检查闭环几何；请点“重新绘制”或右击清空后重画。');return;}
      const hadStart=pending.length>0;
      if(!hadStart)setPending([q]);
      gesture.current={...common,kind:'regioncheck',hadStart,press:q};setToolError('');
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(p.tool==='voronoi'){
      try{setPending(toggleVoronoiSite(pending,point,pickRadius));setToolError('');
        gesture.current={...common,kind:'voronoipoint'};e.currentTarget.setPointerCapture(e.pointerId);
      }catch(error){constructionError((error as Error).message);}return;
    }
    if(p.tool==='text'){
      if(textDraft){p.onMessage('请先应用或取消当前文字编辑。');return;}
      const hit=pickText(p.doc.objects??[],q,measuredTextBounds(),2*units);
      p.onSelect(new Set());setToolError('');
      gesture.current={...common,kind:'text',ids:new Set(hit?[hit.id]:[]),start:q};
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(p.tool==='operationframe'){
      try{const local=(r:Point):Point=>[(r[0]-view.x)/units,(r[1]-view.y)/units];
        const frameDrag=beginFrameDrag(p.operationFrame??null,local(q),8,local(point));
        gesture.current={...common,kind:'operationframe',frameDrag};setFramePreview(updateFrameDrag(frameDrag,local(point)));setToolError('');
        e.currentTarget.setPointerCapture(e.pointerId);
      }catch(error){constructionError((error as Error).message);}return;
    }
    if(p.tool==='advancetype'){
      const hit=referenceSegmentAt(q);
      if(!hit){constructionError('请按住已有边界、山折或谷折线段进行对照。');return;}
      try{advanceCrease(p.doc,hit.id,p.selected,p.lockBoundary);}catch(error){constructionError((error as Error).message);return;}
      gesture.current={...common,kind:'advance',ids:new Set([hit.id])};setHiddenTraceId(hit.id);setToolError('');
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(backgroundTool){
      const bg=p.doc.background;
      if(!bg||!bg.visible||bg.opacity<=0){constructionError('请先在右侧加载并显示底图，不透明度需大于零。');return;}
      if(pending.length===1&&distance(pending[0],point)<=1e-6){constructionError('图片特征点 A、B 不能重合，请重新选择 B。');return;}
      if(pending.length===3){try{registerBackground(backgroundInView(bg,backgroundView),bg,pending[0],pending[1],pending[2],point);}catch(error){constructionError((error as Error).message);return;}}
      setPending([...pending,point]);setToolError('');gesture.current={...common,kind:'backgroundpoint'};
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(measurementSlot){
      const picked=restrictedReferencePoint(q);
      if(!picked){constructionError('请点击已有端点／交点、圆心或显示的网格点。');return;}
      const points=[...pending,picked];
      if(measurementCount===3&&points.length>1&&distance(points[points.length===2?0:1],picked)<=1e-6){constructionError('顶点不能与角边点重合，请重新选点。');return;}
      setPending(points);setToolError('');gesture.current={...common,kind:'measurement',press:picked};
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(lineEraseTool||alternateTool){
      const hadStart=pending.length>0,start=hadStart?pending[0]:restrictedReference?restrictedReferencePoint(q):point;
      if(!start){constructionError('请从已有端点／交点、圆心或显示的网格点起笔。');return;}
      gesture.current={...common,kind:alternateTool?'alternate':'lineerase',start,hadStart};setToolError('');if(!hadStart)setPending([start]);
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(restrictedDrawTool){
      const hadStart=pending.length>0,start=hadStart?pending[0]:restrictedDrawPoint(q);
      if(!start){constructionError('请从已有顶点、圆心或可见纸内网格点起笔。');return;}
      gesture.current={...common,kind:'restricteddraw',start,hadStart};setToolError('');
      if(!hadStart)setPending([start]);e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(crossMergeTool){gesture.current={...common,kind:'mergeclick'};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(p.tool==='customcolor'){gesture.current={...common,kind:'customcolor'};setToolError('');e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(typeFilterTool){gesture.current={...common,kind:'typefilter'};setToolError('');e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(p.tool==='unselect'){gesture.current={...common,kind:'unselect',ids:new Set(p.selected),circleIds:new Set(selectedCircles)};setToolError('');e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(regionLasso){gesture.current={...common,kind:'regionlasso',path:[q]};setPending([q]);setToolError('');e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(regionPolygon){const hadStart=pending.length>0;gesture.current={...common,kind:'regionpolygon',hadStart};if(!hadStart){setPending([point]);setToolError('');}e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(p.tool==='cycletype'){gesture.current={...common,kind:'cycletype'};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(p.tool==='mirrorselection'){gesture.current={...common,kind:'mirrorselect',ids:new Set(p.selected)};e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(foldableActive){draw(point,q);return;}
    if(foldableDrawTool&&foldableDrawModeState==='free'){
      const hadStart=pending.length>0,start=hadStart?pending[0]:point;
      gesture.current={...common,kind:'line',start,hadStart};
      if(!hadStart)setPending([start]);setToolError('');
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(foldableDrawTool){
      const vertex=nearestSnapPoint(snapPoints,q,pickRadius);
      if(vertex&&foldableDrawMode(p.doc,vertex.point,p.preset)==='foldable'){
        try{
          setFoldableDrawMode('foldable');
          setFoldableState(beginFoldableInput(p.doc,vertex.point,step));
          setToolError('');
        }catch(error){constructionError((error as Error).message);}
        return;
      }
      const start=point;
      setFoldableDrawMode('free');
      gesture.current={...common,kind:'line',start,hadStart:false};
      setPending([start]);setToolError('');
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if(p.tool==='line'||p.tool==='mark'){const hadStart=pending.length>0,start=hadStart?pending[0]:point;gesture.current={...common,kind:'line',start,hadStart};if(!hadStart)setPending([start]);e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(transformTool&&!fourPointTool&&!p.selected.size&&!selectedCircles.size){constructionError('请先切换到选择工具，选中需要变换的线段或辅助圆。');return;}
    if((dividedDrawTool||regionCross||transformTool&&!fourPointTool&&!rotationTool||p.tool==='angledrag'||batchReflectionTool||offsetTool&&offsetSource&&!offsetReady)&&pending.length<2){const hadStart=pending.length>0,start=hadStart?pending[0]:point;gesture.current={...common,kind:'construction',start,hadStart};if(!hadStart){setToolError('');setPending([start]);}e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(p.tool!=='select'){draw(point,q);return;}
    const hit=pickCanvasObject(p.doc,q,pickRadius,p.lockBoundary,layerState);
    const vertex=nearestSnapPoint(selectableIntersections,q,pickRadius);if(vertex&&hit?.kind!=='circle'){pickVertex(vertex,e.shiftKey);return;}
    if(hit){
      let ids=new Set(p.selected),circleIds=new Set(selectedCircles);
      const target=hit.kind==='circle'?circleIds:ids;
      if(e.shiftKey){target.has(hit.id)?target.delete(hit.id):target.add(hit.id);}
      else if(!target.has(hit.id)){ids=new Set(hit.kind==='segment'?[hit.id]:[]);circleIds=new Set(hit.kind==='circle'?[hit.id]:[]);}
      p.onSelect(ids);p.onSelectCircles?.(circleIds);
      if((hit.kind==='circle'?circleIds:ids).has(hit.id))gesture.current={...common,kind:'move',start:snapped(q),ids,circleIds:new Set(layerState.auxiliary?circleIds:[])};
    }
    else {const ids=e.shiftKey?new Set(p.selected):new Set<string>(),circleIds=e.shiftKey?new Set(selectedCircles):new Set<string>();p.onSelect(ids);p.onSelectCircles?.(circleIds);gesture.current={...common,kind:'box',ids,circleIds};setBox({a:q,b:q});}
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function mouseDown(e:React.MouseEvent<SVGSVGElement>){
    if(e.button===1)e.preventDefault();
    // Pointer Events emit pointerdown only for the first pressed mouse button.
    // A right button pressed during a left drag still needs to cancel it.
    if(e.button===2){e.preventDefault();if(gesture.current&&gesture.current.button!==2){cancelOperation();p.onMessage('已取消当前操作。');}}
  }
  function move(e:React.PointerEvent<SVGSVGElement>){const g=gesture.current;if(g&&g.pointerId!==e.pointerId)return;
    // With a captured/prevented pointer, adding the right button is reported as
    // pointermove (buttons bitmask), and compatibility mousedown may be absent.
    if(g&&g.button!==2&&(e.buttons&2)){cancelOperation();p.onMessage('已取消当前操作。');return;}
    // Camera navigation does not edit or snap geometry. Avoid the full point,
    // segment and grid-intersection searches (and parent cursor updates).
    if(g?.kind==='pan'){const dx=e.clientX-g.client[0],dy=e.clientY-g.client[1];if(g.button===1&&!g.panMoved&&Math.hypot(dx,dy)<=4)return;g.panMoved=true;setView({...g.view,x:g.view.x-dx*g.view.w/size.w,y:g.view.y-dy*g.view.h/size.h});return;}
    if(topologyBlocked)return;
    const q=raw(e);trackCursor(e);
    const point=cursorPoint(q,e,g?.kind==='line'?g.start:undefined);updateHover(point,q);if(!g)return;
    if(g.kind==='operationframe'&&g.frameDrag){
      const end=p.snap?point:q;
      try{setFramePreview(updateFrameDrag(g.frameDrag,[(end[0]-view.x)/units,(end[1]-view.y)/units]));}catch(error){constructionError((error as Error).message);}return;
    }
    if(g.kind==='text'&&g.ids.size&&Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1])>=4){setDragOffset([q[0]-g.start[0],q[1]-g.start[1]]);return;}
    if(g.kind==='advance'&&(e.clientX!==g.client[0]||e.clientY!==g.client[1])){g.cancelled=true;setHiddenTraceId(null);}
    if(g.kind==='regionlasso'&&g.path&&distance(q,g.path.at(-1)!)>=units){g.path.push(q);setPending([...g.path]);setHoverTarget(null);}
    if(g.kind==='customcolor')setBox(Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1])>=4?{a:g.start,b:q}:null);
    if((g.kind==='unselect'||g.kind==='typefilter')&&Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1])>=4)setBox({a:g.start,b:q});
    if(g.kind==='box')setBox({a:g.start,b:q});
    if(g.kind==='mirrorselect'&&!pending.length&&Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1])>=4){setBox({a:g.start,b:q});setHoverTarget(null);}
    if(g.kind==='erase'){setHoverTarget(null);if(Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1])>=4)setBox({a:g.start,b:q});}
    if(g.kind==='move'&&Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1])>3)setDragOffset([point[0]-g.start[0],point[1]-g.start[1]]);
  }
  function up(e:React.PointerEvent<SVGSVGElement>){const g=gesture.current;if(!g||g.pointerId!==e.pointerId||g.button!==e.button)return;
    if(g.kind==='pan'){gesture.current=null;setDragOffset([0,0]);setBox(null);setPanning(false);restoreNavigationMarkers();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);return;}
    const q=raw(e),point=cursorPoint(q,e,g.kind==='line'?g.start:undefined),dragged=Math.hypot(e.clientX-g.client[0],e.clientY-g.client[1])>=4;
    if(g.kind==='regioncheck'){
      if(!g.hadStart){if(dragged&&distance(g.press,q)>1e-4)setPending([g.press,q]);}
      else if(pending.length>=3&&distance(pending[0],q)<=pickRadius)finishRegionCheck();
      else if(distance(pending.at(-1)!,q)>1e-4)setPending([...pending,q]);
      else constructionError('该点与上一点过近，请另选一点；至少三个点才可闭合。');
    }
    if(g.kind==='text'){
      const object=p.doc.objects?.find((o):o is TextObject=>o.kind==='text'&&g.ids.has(o.id));
      if(object&&dragged){
        try{const position:Point=[object.position[0]+q[0]-g.start[0],object.position[1]+q[1]-g.start[1]];
          if(p.onChange(updateText(p.doc,object.id,{position}))!==false)p.onMessage('文字已移动，可撤销。');
        }catch(error){constructionError((error as Error).message);}
      }else if(!dragged){
        setTextDraft(object?{id:object.id,text:object.text,fontSize:object.fontSize,color:object.color,position:[...object.position]}:{...TEXT_DEFAULTS,text:'',position:[...g.press]});
      }
    }
    if(g.kind==='restricteddraw'&&(g.hadStart||dragged)){
      try{
        const next=appendRestrictedDrawing(p.doc,p.tool==='restrictedcircle'?'circle':'line',g.start,q,pickRadius,drawingAnchors(true),p.preset,p.lockBoundary,p.drawingAngle);
        if(p.onChange(next)!==false){cancelGesture();p.onMessage('受限'+(p.tool==='restrictedcircle'?'圆':'线段')+'已生成，可一次撤销。');}
      }catch(error){constructionError((error as Error).message);}
    }
    if(g.kind==='mergeclick')draw(point,q);
    if(g.kind==='operationframe'&&g.frameDrag){
      try{p.onOperationFrameChange?.(finishFrameDrag(g.frameDrag,[(point[0]-view.x)/units,(point[1]-view.y)/units]));setFramePreview(null);setToolError('');p.onMessage('操作框已更新；可拖动调整或导出框内图，不修改折线。');}
      catch(error){setFramePreview(null);constructionError((error as Error).message);}
    }
    if(g.kind==='advance'){
      setHiddenTraceId(null);
      if(!g.cancelled&&e.clientX===g.client[0]&&e.clientY===g.client[1])try{
        const result=advanceCrease(p.doc,[...g.ids][0],p.selected,p.lockBoundary);
        if(result.doc===p.doc||p.onChange(result.doc)!==false){p.onSelect(result.selected);p.onMessage(result.doc===p.doc?'已恢复显示；边界进入选中阶段，已选山谷线保持不变。':'已完成底图对照赋型，可撤销。');}
      }catch(error){constructionError((error as Error).message);}
      else p.onMessage('拖动已恢复原线段，未修改线型。');
    }
    if(g.kind==='backgroundpoint'&&pending.length===4&&p.doc.background){
      try{
        const bg=p.doc.background,placement=registerBackground(backgroundInView(bg,backgroundView),bg,pending[0],pending[1],pending[2],pending[3]);
        if(p.onChange({...p.doc,background:registeredScreenBackground(bg,placement,backgroundView)})!==false){cancelGesture();p.onMessage('底图已配准并固定在屏幕上；可勾选“底图随画布移动与缩放”继续跟随，可撤销。');}
      }catch(error){setPending(pending.slice(0,3));constructionError((error as Error).message);}
    }
    if(g.kind==='measurement'&&measurementSlot&&pending.length===measurementCount){
      try{
        let value:number,detail:ReturnType<typeof measureLength>|undefined;
        if(measurementSlot==='L1'||measurementSlot==='L2'){
          const result=measureLength(pending[0],pending[1],step);value=result.grid;
          detail=result;
        }else value=measureAngle(pending[0],pending[1],pending[2],measurementSlot);
        p.onMeasurement(measurementSlot,value,detail);cancelGesture();
        p.onMessage(measurementSlot+' = '+Number(value.toPrecision(10))+(measurementSlot.startsWith('L')?' 格':'°')+'；测量未修改作品。');
      }catch(error){setPending(pending.slice(0,-1));constructionError((error as Error).message);}
    }
    if(g.kind==='alternate'&&(g.hadStart||dragged)){
      const end=restrictedReference?restrictedReferencePoint(q):point;
      if(!end)constructionError('终点必须是已有端点／交点、圆心或显示的网格点，请重新选择。');
      else try{
        const result=applyAlternateAssignment(p.doc,g.start,end,alternateMode,p.preset,p.lockBoundary);
        if(!result.changed){cancelGesture();p.onMessage(result.hits.length?'命中线型已符合顺序，作品未改变。':'参考线未命中可改型的小段。');}
        else if(p.onChange(result.doc)!==false){cancelGesture();p.onMessage('已按顺序修改 '+result.changed+' 段线型，可一次撤销。');}
      }catch(error){constructionError((error as Error).message);}
    }
    if(g.kind==='lineerase'&&(g.hadStart||dragged)){
      const end=p.tool==='eraseoverlap'?restrictedReferencePoint(q):point;
      if(!end)constructionError('终点必须是已有端点／交点、圆心或显示的网格点，请重新选择。');
      else try{
        const removedIds=lineEraseHits(interactionDoc,g.start,end,lineEraseMode,p.lockBoundary);
        const result={removedIds,doc:{...p.doc,segments:p.doc.segments.filter(s=>!removedIds.has(s.id))}};
        if(!result.removedIds.size){cancelGesture();p.onMessage('参考线没有命中可删除的小段，作品未改变。');}
        else if(p.onChange(result.doc)!==false){p.onSelect(new Set([...p.selected].filter(id=>!result.removedIds.has(id))));cancelGesture();p.onMessage('已删除 '+result.removedIds.size+' 个小段，可一次撤销。');}
      }catch(error){constructionError((error as Error).message);}
    }
    if(g.kind==='customcolor'){
      try{
        const hits=customColorTargets(p.doc,dragged?{kind:'box',a:g.start,b:q}:{kind:'point',point:q,tolerance:pickRadius});
        const next=applyCustomColor(p.doc,hits,customColor);
        if(next===p.doc)p.onMessage(hits.segmentIds.size+hits.circleIds.size?'命中对象已是该颜色，无需修改。':'未命中可着色的辅助线或圆；单击不会穿透最近的非辅助线。');
        else if(p.onChange(next)!==false)p.onMessage('辅助线与圆颜色已更新，可一次撤销；山谷和折角未改变。');
      }catch(error){constructionError((error as Error).message);}
    }
    if(g.kind==='typefilter')finishTypeFilter(dragged?{kind:'box',a:g.start,b:q}:{kind:'point',point:q,radius:pickRadius});
    if(g.kind==='unselect'){
      const hit=dragged?undefined:pickCanvasObject(p.doc,q,pickRadius,p.lockBoundary,layerState);
      const hits=dragged?segmentsInBox(interactionDoc,g.start,q,p.lockBoundary,'touching'):new Set(hit?.kind==='segment'?[hit.id]:[]);
      const circleHits=dragged?circleIdsInBox(p.doc.objects??[],g.start,q,'touching',layerState.auxiliary):new Set(hit?.kind==='circle'?[hit.id]:[]);
      p.onSelect(updateRegionSelection(g.ids,hits,true));p.onSelectCircles?.(new Set([...(g.circleIds??[])].filter(id=>!circleHits.has(id))));p.onMessage('已撤选命中的线段与辅助圆，未删除或修改作品。');
    }
    if(g.kind==='regionlasso'){if(!finishRegion([...(g.path??[]),q]))setPending([]);}
    if(g.kind==='regionpolygon'&&(g.hadStart||dragged))draw(dragged?point:g.press,dragged?q:g.start);
    if(g.kind==='cycletype')draw(point,q);
    if(g.kind==='mirrorselect'){
      if(dragged){if(!pending.length){const hits=segmentsInBox(interactionDoc,g.start,q,p.lockBoundary,'touching');p.onSelect(toggleMirrorSelection(g.ids,hits));setToolError('');}else p.onMessage('镜面定点和提交使用单击；右击可重新选择。');}
      else draw(g.press,g.start);
    }
    if(g.kind==='line'){
      // A first click arms the starting point; a drag or subsequent click
      // commits exactly once, using the final release position (not last move).
      const end=g.hadStart||dragged?point:g.press;
      if(g.hadStart||dragged){if(distance(g.start,end)>1e-6){try{const next=p.tool==='mark'?appendMark(p.doc,g.start,end,MARK_COLORS[markColor].value):overlayDrawnSegments(p.doc,[drawingLine(g.start,end,p.preset)],p.lockBoundary);if(p.onChange(next)!==false){setPending([]);if(p.tool==='mark')p.onMessage('已创建独立标记线，不参与折叠；可撤销。');}}catch(error){constructionError((error as Error).message);}}else{setPending([g.start]);p.onMessage('起点和终点重合，请另选终点，或按 Esc 取消。');}}
      updateHover(end);
    }
    if(g.kind==='construction'){
      // A click only arms the first point. Release after a drag supplies the
      // second snapped point, but never bypasses the result-confirmation step.
      const end=dragged?point:g.press;
      if(g.hadStart||dragged)draw(end,p.tool==='angledrag'||dragged?q:g.start);
      updateHover(end);
    }
    if(g.kind==='move'&&dragged){const offset:Point=[point[0]-g.start[0],point[1]-g.start[1]];if(distance(offset,[0,0])>1e-7)p.onChange({...p.doc,segments:p.doc.segments.map(s=>g.ids.has(s.id)?{...s,a:[s.a[0]+offset[0],s.a[1]+offset[1]],b:[s.b[0]+offset[0],s.b[1]+offset[1]]}:s),...(g.circleIds?.size?{objects:p.doc.objects?.map(o=>o.kind==='circle'&&g.circleIds!.has(o.id)?{...o,center:[o.center[0]+offset[0],o.center[1]+offset[1]] as Point}:o)}:{})},g.ids);}
    if(g.kind==='box'){const mode=eraseBoxMode(g.start,q),ids=new Set(g.ids),circleIds=new Set(g.circleIds);for(const id of segmentsInBox(interactionDoc,g.start,q,p.lockBoundary,mode))ids.add(id);for(const id of circleIdsInBox(p.doc.objects??[],g.start,q,mode,layerState.auxiliary))circleIds.add(id);p.onSelect(ids);p.onSelectCircles?.(circleIds);}
    if(g.kind==='erase'&&p.tool==='text'){
      const bounds=measuredTextBounds(),hit=dragged?undefined:pickText(p.doc.objects??[],g.press,bounds,2*units);
      const textIds=dragged?textIdsInBox(p.doc.objects??[],bounds,g.start,q,eraseBoxMode(g.start,q)):new Set(hit?[hit.id]:[]);
      const strokeHit=dragged||hit?undefined:pickCanvasObject(p.doc,g.press,pickRadius,p.lockBoundary,layerState);
      const lineIds=dragged?segmentsInEraseBox(interactionDoc,g.start,q,p.lockBoundary):new Set(strokeHit?.kind==='segment'?[strokeHit.id]:[]);
      const circleIds=dragged?circleIdsInBox(p.doc.objects??[],g.start,q,eraseBoxMode(g.start,q),layerState.auxiliary):new Set(strokeHit?.kind==='circle'?[strokeHit.id]:[]);
      if(textIds.size||lineIds.size||circleIds.size){
        const next=deleteTexts(p.doc,textIds);
        if(p.onChange({...next,segments:next.segments.filter(s=>!lineIds.has(s.id)),...(circleIds.size?{objects:next.objects?.filter(o=>o.kind!=='circle'||!circleIds.has(o.id))}:{})})!==false){
          p.onSelect(new Set([...p.selected].filter(id=>!lineIds.has(id))));p.onSelectCircles?.(new Set([...selectedCircles].filter(id=>!circleIds.has(id))));p.onMessage('已删除 '+textIds.size+' 个文字、'+lineIds.size+' 条线段、'+circleIds.size+' 个辅助圆，可撤销。');
        }
      }else p.onMessage('没有命中可删除的文字、线段或辅助圆。');
    }
    if(g.kind==='erase'&&p.tool==='erasemark'&&g.button===0){
      const ids=markHits(p.doc,dragged?{kind:'box',a:g.start,b:q}:{kind:'point',point:g.press,radius:pickRadius});
      if(ids.size){if(p.onChange(deleteMarks(p.doc,ids))!==false)p.onMessage(`已删除 ${ids.size} 条独立标记，可撤销；折痕未改变。`);}
      else p.onMessage('未命中独立标记线；折痕、圆和文字不受此工具影响。');
    }
    if(g.kind==='erase'&&p.tool!=='text'&&!(p.tool==='erasemark'&&g.button===0)){
      const hit=dragged?undefined:pickCanvasObject(p.doc,g.press,pickRadius,p.lockBoundary,layerState);
      const ids=dragged?segmentsInEraseBox(interactionDoc,g.start,q,p.lockBoundary):new Set(hit?.kind==='segment'?[hit.id]:[]);
      if(p.tool==='eraseaux'&&g.button===0)for(const id of ids)if(p.doc.segments.find(s=>s.id===id)?.assignment!=='A')ids.delete(id);
      const circleIds=dragged?circleIdsInBox(p.doc.objects??[],g.start,q,eraseBoxMode(g.start,q),layerState.auxiliary):new Set(hit?.kind==='circle'?[hit.id]:[]);
      if(ids.size||circleIds.size){if(p.onChange({...p.doc,segments:p.doc.segments.filter(s=>!ids.has(s.id)),...(circleIds.size?{objects:p.doc.objects?.filter(o=>o.kind!=='circle'||!circleIds.has(o.id))}:{})})!==false){p.onSelect(new Set([...p.selected].filter(id=>!ids.has(id))));p.onSelectCircles?.(new Set([...selectedCircles].filter(id=>!circleIds.has(id))));const summary=[ids.size?`${ids.size} 条线段`:'',circleIds.size?`${circleIds.size} 个辅助圆`:''].filter(Boolean).join('、');p.onMessage(`已删除 ${summary}，可按 Ctrl+Z 撤销。`);}}
      else p.onMessage(`没有可删除的线段或辅助圆；${p.lockBoundary?'边界保护开启。':''}向右框删完整包含，向左框删圆周或线段相交、接触。`);
    }
    gesture.current=null;setDragOffset([0,0]);setBox(null);setPanning(false);restoreNavigationMarkers();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const finiteRayPreview=(()=>{
    if(!finiteRayTool||pending.length!==2||!hoverPosition)return {geometry:null,error:''};
    const targetId=pickEraseSegment(interactionDoc,hoverPosition,pickRadius,false),target=interactionDoc.segments.find(segment=>segment.id===targetId);
    if(!target)return {geometry:null,error:'请点击前方路径上的已有线段或纸边'};
    try{return {geometry:rayConstructionGeometry(pending[0],pending[1],target,epsilonFor(p.doc)),error:''};}
    catch(error){return {geometry:null,error:(error as Error).message};}
  })();
  const restrictedEnd=restrictedDrawTool&&pending.length&&hoverPosition?restrictedDrawPoint(hoverPosition):null;
  const backgroundPreview=(()=>{
    if(!backgroundTool||!p.doc.background||pending.length<3)return null;
    const bg=p.doc.background,end=pending[3]??(hoverPosition?nearestSnapPoint(snapPoints,hoverPosition,pickRadius)?.point??hoverPosition:null);
    if(!backgroundTool||!bg||pending.length<3||!end)return null;
    try{return registerBackground(backgroundInView(bg,backgroundView),bg,pending[0],pending[1],pending[2],end);}catch{return null;}
  })();
  const restrictedLength=restrictedEnd&&pending.length?distance(pending[0],restrictedEnd):0;
  const dividedPreview=(()=>{if(!dividedDrawTool||!pending.length||!hover)return [] as Segment[];try{return dividedLineSegments(p.doc,pending[0],hover,drawingAssignment,drawDivision,p.drawingAngle);}catch{return [] as Segment[];}})();
  const ratioValues=(()=>{try{return [radicalValue(drawRatio.s),radicalValue(drawRatio.t)].map(n=>Number(n.toPrecision(8))).join(' : ');}catch{return '比例无效';}})();
  // A candidate crease uses exactly the committed stroke, including adaptive
  // dash phase. Reference axes and construction guides keep their own styling.
  function previewStroke(segment:Pick<Segment,'a'|'b'>&Partial<Segment>){
    const candidate:Segment={id:'drawing-preview',assignment:drawingAssignment,angle:0,...segment};
    const stroke=creaseLineStroke(candidate,display.lineStyle,candidate.assignment==='A'?display.auxLineWidth:display.lineWidth,units,adaptiveLineStyle,display.roundedEnds,display.auxLineStyle,p.solidCreases);
    return {stroke:stroke.color,strokeWidth:stroke.width,strokeDasharray:stroke.dash,strokeDashoffset:stroke.dashOffset,strokeLinecap:display.roundedEnds?'round' as const:'butt' as const};
  }
  const preview=p.tool==='regioncheck'||p.tool==='voronoi'||p.tool==='operationframe'||backgroundTool||restrictedDrawTool||finiteRayTool||alternateTool||dividedDrawTool||lineEraseTool||regionTool||transformTool||foldableActive||localFlatTool||angleTool||offsetTool||lineBisectorTool||axiomTool||rabbitReady||batchReflectionTool||mirrorTool||segmentTool||directionalTool||circleTool||advancedCircleTool||extraCircleTool||p.tool==='polygon'||(p.tool==='mergevertex'||crossMergeTool)?[]:((rayTool&&pending.length===3)||(p.tool==='midperp'&&pending.length===2))?pending:pending.length&&hover?[...pending,hover]:[];
  const alternateEnd=alternateTool&&pending.length&&hover?(restrictedReference?restrictedReferencePoint(hover):hover):null;
  const alternatePreview=(()=>{if(!alternateEnd||!pending.length)return [];try{return alternateAssignmentHits(p.doc,pending[0],alternateEnd,alternateMode,p.preset,p.lockBoundary);}catch{return [];}})();
  const eraseEnd=lineEraseTool&&pending.length&&hover?(p.tool==='eraseoverlap'?restrictedReferencePoint(hover):hover):null;
  const lineErasePreview=(()=>{if(!eraseEnd||!pending.length)return new Set<string>();try{return lineEraseHits(interactionDoc,pending[0],eraseEnd,lineEraseMode,p.lockBoundary);}catch{return new Set<string>();}})();
  const referencePreview=p.tool==='mark'||p.tool==='regioncheck'||p.tool==='voronoi'||backgroundTool||restrictedDrawTool||finiteRayTool||!!measurementSlot||alternateTool||dividedDrawTool||lineEraseTool||regionTool||transformTool||foldableActive||localFlatTool||angleTool||offsetTool||lineBisectorTool||axiomTool||rabbitTool||batchReflectionTool||mirrorTool||circleTool||advancedCircleTool||extraCircleTool||p.tool==='polygon'||(p.tool==='mergevertex'||crossMergeTool)||directionalTool||rayTool||p.tool==='measure'||p.tool==='midperp';
  let mirrorAxis:Point[]=[];
  if(mirrorTool){if(mirrorReady)mirrorAxis=pending;else if(p.tool==='mirrorselection'&&pending.length&&hover)mirrorAxis=[pending[0],hover];else if(p.tool==='mirrorline'&&mirrorSources.length&&hoverPosition){const axis=referenceSegmentAt(hoverPosition);if(axis)mirrorAxis=[axis.a,axis.b];}}
  let mirrorPreview=mirrorResult.copies;
  if(!mirrorReady&&mirrorAxis.length===2){try{mirrorPreview=swapGeneratedLines(mirrorSources.map(s=>({...s,a:reflectPoint(s.a,mirrorAxis[0],mirrorAxis[1],epsilonFor(p.doc)),b:reflectPoint(s.b,mirrorAxis[0],mirrorAxis[1],epsilonFor(p.doc))})),drawingSwap);}catch{mirrorPreview=[];}}
  function finishMirror(){
    if(p.tool==='mirrorline'&&materialSelected(mirrorSourceIds)){
      try{
        const intent=materialMirrorIntent();
        if(drawingSwap){if(!commitSwappedMaterial(intent))return;cancelGesture();p.onMessage(`已镜像材料折痕，生成线山谷互换并保留折角幅值，可一次撤销；${intent.cpOnly?'已按选择清除FF':'平折层序需要重新计算'}。`);return;}
        const result=reflectMaterialEdge(p.doc,intent);
        if(p.onChange(result.doc,new Set(result.insertedIds),intent)===false)return;
        cancelGesture();p.onMessage(`已镜像材料折痕并构造 ${result.insertedIds?.length??0} 段，原图与折角保留，可一次撤销；${intent.cpOnly?'已按选择清除FF':'平折层序需要重新计算'}。`);
      }catch(error){constructionError((error as Error).message);}return;
    }
    try{
      if(materialSelected(mirrorSourceIds)){
        const intent={kind:'material-construction-copy' as const,segmentIds:mirrorSourceIds,transform:{kind:'reflect' as const,a:pending[0],b:pending[1]}};
        if(drawingSwap){if(!commitSwappedMaterial(intent))return;cancelGesture();p.onMessage('已镜像完整材料部件，副本山谷互换并保留折角幅值，CP/FF同步，可一次撤销。');return;}
        const result=constructMaterialCopy(p.doc,intent);
        if(p.onChange(result.doc,new Set(result.copiedIds),intent)===false)return;
        cancelGesture();p.onMessage('已镜像完整材料部件，保独立身份、原山谷与折角，CP/FF不补接或吸附，可一次撤销。');return;
      }
      const copies=mirrorCandidates(pending[0],pending[1]);
      if(p.onChange(overlayDrawnSegments(p.doc,copies,p.lockBoundary),p.selected)===false)return;
      cancelGesture();p.onMessage(`已添加 ${copies.length} 段镜像副本，${drawingSwap?'副本山谷互换，保留折角幅值':'重合处采用副本线型与折角'}，可一次撤销。`);
    }
    catch(error){constructionError((error as Error).message);}
  }
  let advancedCirclePreview:CircleGeometry[]=[];
  try{
    if(p.tool==='circleseparate'&&pending.length===2&&hover)advancedCirclePreview=[separateCircle(pending[0],pending[1],hover)];
    if(p.tool==='circleconcentric'&&circleReferences.length&&pending.length&&hover)advancedCirclePreview=[concentricCircle(circleReferences[0],pending[0],hover)];
    if(p.tool==='circleequal'&&circleReferences.length&&hover)advancedCirclePreview=[circleGeometry(hover,circleReferences[0].radius)];
    if(p.tool==='circlepair'&&circleReferences.length===2)advancedCirclePreview=externallyTangentPair(circleReferences[0],circleReferences[1]);
  }catch{/* Invalid previews stay uncommitted. */}
  let extraCircleResult:InversionResult|undefined;
  try{
    if(p.tool==='circledifference'&&circleReferences.length===3)extraCircleResult={kind:'circle',circle:radiusDifferenceCircle(circleReferences[0],circleReferences[1],circleReferences[2])};
    if(p.tool==='circleinvert'&&circleReferences.length===2)extraCircleResult=invertCircle(circleReferences[0],circleReferences[1]);
    if(p.tool==='lineinvert'&&inverseSource&&circleReferences.length===1)extraCircleResult=invertSupportingLine(inverseSource,circleReferences[0]);
  }catch{/* Geometry changes cancel stale references before the next action. */}
  const inverseStep=inversionTool?extraCircleResult?.kind==='circle'?{label:'确认结果',instruction:'点击“确认反演圆”或紫色结果圆'}:extraCircleResult?.kind==='line'?{label:`截止点 ${pending.length+1} / 2`,instruction:pending.length?'点击第二个截止线段或纸边，生成有限辅助线':'结果为直线：点击第一个截止线段或纸边'}:undefined:undefined;
  let inverseLinePreview:{a:Point;b:Point;bounded:boolean}|undefined;
  if(extraCircleResult?.kind==='line'){
    const {origin,direction}=extraCircleResult,center:Point=[view.x+view.w/2,view.y+view.h/2],t=(center[0]-origin[0])*direction[0]+(center[1]-origin[1])*direction[1],length=Math.hypot(view.w,view.h);
    inverseLinePreview={a:[origin[0]+(t-length)*direction[0],origin[1]+(t-length)*direction[1]],b:[origin[0]+(t+length)*direction[0],origin[1]+(t+length)*direction[1]],bounded:false};
    if(pending.length&&hoverPosition){const target=referenceSegmentAt(hoverPosition);if(target){try{const end=lineTarget(origin,direction,target,epsilonFor(p.doc));if(distance(end,pending[0])>epsilonFor(p.doc))inverseLinePreview={a:pending[0],b:end,bounded:true};}catch{/* Show the guide, never a false finite result. */}}}
  }
  let circlePreview:CircleGeometry|undefined;
  if(circleTool&&hover){try{
    if(p.tool==='circleradius')circlePreview=circleGeometry(hover,circleRadius);
    else if(p.tool==='circle'&&pending.length===1)circlePreview=circleGeometry(pending[0],distance(pending[0],hover));
    else if(p.tool==='circle3'&&pending.length===2)circlePreview=circleThroughThree(pending[0],pending[1],hover);
  }catch{/* Degenerate previews never commit. */}}
  function editCircle(patch:Partial<Pick<CircleObject,'center'|'radius'|'color'>>){
    if(!selectedCircle)return;
    try{if(p.onChange(updateCircle(p.doc,selectedCircle.id,patch))!==false){setToolError('');p.onMessage('圆属性已更新，可撤销。');}}
    catch(error){constructionError((error as Error).message);}
  }
  let editPreview:Segment[]=[];
  if(source&&hover&&hoverPosition){try{editPreview=segmentCandidate(hover,hoverPosition);}catch{/* Invalid candidates never commit. */}}
  let midPreview:{a:Point;b:Point}|undefined;
  if(p.tool==='midperp'&&pending.length===2&&hoverPosition){const target=referenceSegmentAt(hoverPosition);if(target){try{midPreview=perpendicularBisector(pending[0],pending[1],target,epsilonFor(p.doc));}catch{/* Keep references until a valid target is chosen. */}}}
  const directionReference=directionalTool&&pending.length?(reference??(hoverPosition?referenceSegmentAt(hoverPosition):undefined)):undefined;
  let directionPreview:{a:Point;b:Point}|undefined;
  if(directionalTool&&pending.length&&hoverPosition){
    try{
      const end=reference?directionalEnd(hoverPosition):p.tool==='perpendicular'&&directionReference?perpendicularFoot(pending[0],directionReference):undefined;
      if(end&&distance(pending[0],end)>epsilonFor(p.doc))directionPreview={a:pending[0],b:end};
    }catch{/* Invalid targets remain uncommitted. */}
  }
  let polygonPreview:Point[]=[];
  if(p.tool==='polygon'&&pending.length&&hover){try{polygonPreview=regularPolygon(pending[0],hover,polygonCount,polygonClockwise,epsilonFor(p.doc));}catch{/* Degenerate previews do not commit. */}}
  let mergePreview:ReturnType<typeof mergeVertex>|undefined;
  if((p.tool==='mergevertex'||crossMergeTool)&&pending.length){try{mergePreview=crossMergeTool?mergeCrossTypeVertex(p.doc,pending[0],p.lockBoundary,crossMergeAngle===''||crossMergeAngle==='null'?null:Number(crossMergeAngle)):mergeVertex(p.doc,pending[0],p.lockBoundary);}catch{/* Invalidated reference remains uncommitted. */}}
  const axiomPreviews=axiomResult.folds.map(f=>{
    try{return{...axiomFullSegment(p.doc,f,epsilonFor(p.doc)),bounded:true};}
    catch{const length=Math.hypot(view.w,view.h)*2;return{a:[f.origin[0]-f.direction[0]*length,f.origin[1]-f.direction[1]*length] as Point,b:[f.origin[0]+f.direction[0]*length,f.origin[1]+f.direction[1]*length] as Point,bounded:false};}
  });
  let axiomCutPreview:{a:Point;b:Point}|undefined;
  if(axiomChoice!==null&&axiomResult.folds[axiomChoice]&&hoverPosition){const target=referenceSegmentAt(hoverPosition);if(target){try{axiomCutPreview=axiomCutoff(axiomResult.folds[axiomChoice],target,epsilonFor(p.doc));}catch{/* Invalid cutoff remains only a guide. */}}}
  let twoLinePreview:{a:Point;b:Point;bounded:boolean}|undefined,firstMidlinePoint:Point|undefined;
  if(lineBisectorResult.value){
    const value=lineBisectorResult.value,length=2*Math.hypot(view.w,view.h);
    twoLinePreview={a:[value.origin[0]-value.direction[0]*length,value.origin[1]-value.direction[1]*length],b:[value.origin[0]+value.direction[0]*length,value.origin[1]+value.direction[1]*length],bounded:false};
    if(value.kind==='parallel'){try{twoLinePreview={...parallelMidlineFull(p.doc,value,epsilonFor(p.doc)),bounded:true};}catch{/* Reference guide only. */}}
    if(bisectorCut){try{firstMidlinePoint=lineTarget(value.origin,value.direction,bisectorCut,epsilonFor(p.doc));}catch{/* Invalidated references are reset on edits. */}}
    if(hoverPosition){const target=referenceSegmentAt(hoverPosition);if(target){try{
      if(value.kind==='intersecting')twoLinePreview={...lineBisectorCutoff(value,target,epsilonFor(p.doc)),bounded:true};
      else if(bisectorCut)twoLinePreview={...parallelMidlineCutoffs(value,bisectorCut,target,epsilonFor(p.doc)),bounded:true};
    }catch{/* Keep guide instead of fabricating cutoff. */}}}
  }
  const cycleTarget=(p.tool==='cycletype'||p.tool==='advancetype'&&!hiddenTraceId)&&hoverPosition?referenceSegmentAt(hoverPosition):undefined;
  let anglePreview:{a:Point;b:Point}|null=null;
  if(angleTool&&pending.length&&hoverPosition){
    try{
      if(p.tool==='angledrag')anglePreview={a:pending[0],b:angleEndpoint(hoverPosition)};
      else if(pending.length===1)anglePreview={a:pending[0],b:snapped(hoverPosition)};
      else if(angleChoice!==null){
        const ray=angleResult.fan[angleChoice],target=referenceSegmentAt(hoverPosition);
        if(ray)anglePreview={a:ray.origin,b:target?angleRayCutoff(ray.origin,ray.direction,target,epsilonFor(p.doc)):ray.end};
      }
    }catch{/* An invalid target never changes construction inputs. */}
  }
  let specialAnglePreview:{a:Point;b:Point}[]=[];
  if(specialAngleTool&&pending.length===2&&hoverPosition){
    try{
      specialAnglePreview=p.tool==='angleconverge'?angleConvergence(pending[0],pending[1],angleSystem,hoverPosition,pickRadius,epsilonFor(p.doc)).legs:[{a:pending[1],b:projectedAngle(hoverPosition).point}];
    }catch{/* No result outside candidate directions; baseline remains available. */}
  }
  let localFlatPreview:Omit<Segment,'id'>|null=null;
  if(localFlatTool&&localFlatChoice!==null&&hoverPosition){
    const candidate=localFlatResult.candidates[localFlatChoice],target=referenceSegmentAt(hoverPosition);
    if(candidate&&target)try{const crease=localFlatCutoff(candidate,target,epsilonFor(p.doc));localFlatPreview={...crease,assignment:generatedAssignment(crease.assignment,drawingSwap)};}catch{/* Invalid cutoffs retain direction. */}
  }
  const foldableAutomatic=useMemo(()=>{if(!foldableDrawTool||!foldableState)return null;try{return foldableDrawAssignment(p.doc,foldableState.origin);}catch{return null;}},[foldableDrawTool,p.doc,foldableState?.origin]);
  let foldableCutPreview:Omit<Segment,'id'>|null=null;
  if(foldableActive&&foldableState?.end&&hoverPosition&&!foldablePointAt(hoverPosition)){
    const target=referenceSegmentAt(hoverPosition);
    if(target&&(!foldableDrawTool||foldableAutomatic))try{
      foldableCutPreview=finishFoldableInput(foldableState,foldableDrawTool?foldableAutomatic!.assignment:p.preset,target,epsilonFor(p.doc));
      if(foldableDrawTool)foldableCutPreview={...foldableCutPreview,...foldableAutomatic!};
    }catch{/* No invalid cutoff preview. */}
  }
  const eraseMode=box&&gesture.current?.kind==='erase'?eraseBoxMode(box.a,box.b):null;
  const selectMode=box&&gesture.current?.kind==='box'?eraseBoxMode(box.a,box.b):null;
  const markErasePreview=(()=>{
    const g=gesture.current;
    if(p.readOnly||p.tool!=='erasemark'||(g&&(g.kind!=='erase'||g.button!==0)))return new Set<string>();
    if(g&&box)return markHits(p.doc,{kind:'box',a:box.a,b:box.b});
    const point=g?.press??hoverPosition;
    return point?markHits(p.doc,{kind:'point',point,radius:pickRadius}):new Set<string>();
  })();
  const crossSources=crossMergeTool&&mergePreview?p.doc.segments.filter(s=>mergePreview!.ids.includes(s.id)):[];
  const crossAngleConflict=crossSources.length===2&&crossSources[0].assignment===crossSources[1].assignment&&(crossSources[0].assignment==='M'||crossSources[0].assignment==='V')&&crossSources[0].angle!==crossSources[1].angle;
  const toolStep=continuousTool&&batchReflectionReady?{label:continuousPickingEnd?'选择折射终点':continuousJunction?'选择续接方向':continuousEndpoint?'终点已选':'确认折射路径',instruction:continuousPickingEnd?'点击紫色路径上的交点或位置设为终点；选定后再确认':continuousJunction?'交点有多个局部角度候选，点击紫色方向或上方编号继续；也可选终点在此停止':continuousEndpoint?'确认截断后的紫色路径，或重新选择终点／恢复自动截止':'可先点“选择终点”缩短路径，设置山谷交替后确认'}:selectMode?{label:selectMode==='contained'?'完整包含框选':'接触框选',instruction:selectMode==='contained'?'松开左键，只选完整在框内的线段或圆；Shift追加选择':'松开左键，选择框内及与框相交或接触的线段、圆周；Shift追加选择'}:p.tool==='erasemark'&&gesture.current?.kind==='erase'&&gesture.current.button===0?{label:box?(eraseMode==='touching'?'接触删除标记':'完整包含标记'):'删除标记线',instruction:'松开左键仅删除独立标记；右击／Esc取消本次删除'}:p.tool==='regioncheck'?{label:regionCheck?(regionCheck.status==='consistent'?'闭环几何一致':regionCheck.status==='inconsistent'?'闭环几何不一致':'无法判断'):'轮廓 '+pending.length+' 点',instruction:regionCheck?regionCheck.message:pending.length>=3?'继续加点，或点击首点／闭合按钮检查；右击／Esc取消':'自由添加轮廓点，不吸附折线；应横穿折线内部'}:p.tool==='customcolor'&&gesture.current?.kind==='customcolor'?{label:box?'接触框着色':'单击着色',instruction:'松开为紫色命中辅助线／圆着色；右击／Esc取消，不改变山谷'}:p.tool==='voronoi'?{label:voronoi.busy?'正在计算':pending.length?'已有 '+pending.length+' 个种子':'添加种子',instruction:voronoi.error||(pending.length?'点击加入／再次点种子移除；右击或Esc清空，临时图不保存':'点击添加种子点，至少两个点显示分区')}:p.tool==='text'?(textDraft?{label:'编辑文字草稿',instruction:'在上方输入文字后应用；Enter换行，右击／Esc取消'}:gesture.current?.kind==='text'?{label:'移动／选择文字',instruction:'拖动后松开移动；单击进入编辑；右击／Esc取消'}:gesture.current?.kind==='erase'?{label:'删除文字或线段',instruction:'右击优先删文字；向右框选完整包含，向左框选接触，松开删除'}:getToolStep('text',0)):p.tool==='erase'&&gesture.current?.kind==='erase'?{label:box?(eraseMode==='touching'?'接触删除':'完整包含'):'擦除线段',instruction:box?(eraseMode==='touching'?'松开左键，删除与框相交或接触的线段':'松开左键，仅删除完整包含在框内的线段'):'点击删除小段；拖框后松开删除，右击／Esc取消'}:gesture.current?.kind==='operationframe'?{label:'调整操作框',instruction:'松开完成；右击／Esc取消本次拖动，保留原框'}:hiddenTraceId?{label:'暂时隐藏线段',instruction:'查看下方底图；原位松开循环赋型，拖动恢复，右击／Esc取消'}:gesture.current?.kind==='typefilter'?{label:box?'接触框筛选':'类型筛选',instruction:`松开左键，${regionalSwapTool?'互换':directTarget?'将':p.tool==='replacetype'?'替换':'删除'}紫色命中线${regionalSwapTool?'的山谷':directTarget?'改为'+NAMES[directTarget]:''}；右击或 Esc 取消`}:gesture.current?.kind==='unselect'&&box?{label:'接触框撤选',instruction:'松开左键，撤选与矩形接触的线段，不删除线段'}:gesture.current?.kind==='mirrorselect'&&box?{label:'切换框选',instruction:'松开左键，切换与矩形接触的线段；已选取消，未选选中'}:gesture.current?.kind==='erase'?{label:box?(eraseMode==='touching'?'接触删除':'完整包含'):'删除线段',instruction:box?(eraseMode==='touching'?'松开右键，删除与框相交或接触的线段':'松开右键，仅删除完整包含在框内的线段'):'松开右键删线；向右拖框完整包含，向左拖框接触删除'}:inverseStep??getToolStep(p.tool,stepCount);
  const circleEraseStep=gesture.current?.kind==='erase'&&p.tool!=='text'&&!(p.tool==='erasemark'&&gesture.current.button===0)?{
    label:box?(eraseMode==='touching'?'接触删除':'完整包含'):'删除线段或辅助圆',
    instruction:box?(eraseMode==='touching'?'松开删除与框接触的线段或圆周':'松开删除完整框住的线段或圆'):'松开删除命中的线段或圆；向右框住完整对象，向左接触圆周或线段',
  }:undefined;
  const target=rayTool&&pending.length===3&&hoverPosition?referenceSegmentAt(hoverPosition):undefined;
  let bisectorPreview:{origin:Point;end:Point;bounded:boolean}|undefined;
  if(rayTool&&pending.length===3){
    const bisector=makeRay(pending);
    let end:Point=[bisector.origin[0]+bisector.direction[0]*Math.hypot(view.w,view.h),bisector.origin[1]+bisector.direction[1]*Math.hypot(view.w,view.h)];
    let bounded=false;
    if(target){try{end=rayEnd(bisector,target);bounded=true;}catch{/* Keep a preview ray; invalid targets never commit. */}}
    bisectorPreview={origin:bisector.origin,end,bounded};
  }
  const continuousEndMarker=continuousPickingEnd&&hoverPosition?pickContinuousEndpoint(hoverPosition):continuousEndpoint;
  const guideError=toolError||voronoi.error||localFlatResult.error||specialAngleResult.error||angleResult.error||offsetResult.error||lineBisectorResult.error||axiomResult.error||rabbitResult.error||batchReflectionResult.error||mirrorResult.error;
  // Camera movement is deliberately excluded from the GPU scene identity.
  const paintedSegments=useMemo(()=>creasePaintOrder(p.doc.segments),[p.doc.segments]);
  const gpuScene=useMemo<CreaseGpuScene>(()=>({segments:paintedSegments,selected:p.selected,diagnostic:p.diagnosticHighlights?.segmentIds,hiddenId:hiddenTraceId,main:layerState.main,auxiliary:layerState.auxiliary,display,vertices:displayVertices,solidCreases:p.solidCreases,segmentPresentation:p.segmentPresentation}),[p.doc.segments,p.selected,p.diagnosticHighlights?.segmentIds,hiddenTraceId,layerState.main,layerState.auxiliary,displayVertices,display.lineStyle,display.auxLineStyle,display.lineWidth,display.auxLineWidth,display.roundedEnds,display.pointSize,display.pointStyle,display.antiAlias,p.solidCreases,p.segmentPresentation]);
  const [gpuHoverTitle,setGpuHoverTitle]=useState<string|undefined>();
  useEffect(()=>{
    setGpuHoverTitle(undefined);
    if(!gpuEnabled||navigating||!cursor||display.showCursorHint===false)return;
    const timer=window.setTimeout(()=>setGpuHoverTitle(creaseGpuHoverTitle(gpuScene,[view.x+cursor[0]*view.w/size.w,view.y+cursor[1]*view.h/size.h],units,dragOffset,adaptiveLineStyle)),160);
    return()=>window.clearTimeout(timer);
  },[gpuEnabled,navigating,gpuScene,cursor,view.x,view.y,view.w,view.h,size.w,size.h,units,dragOffset[0],dragOffset[1],adaptiveLineStyle,display.showCursorHint]);
  // Small drawings, unavailable/lost graphics contexts and export comparisons
  // retain the SVG path. Do not construct hidden copies of large SVG trees.
  const segmentLayer=useMemo(()=>{if(gpuEnabled)return null;const nodes=(p.tileDecoration&&p.tileDecoration.mode!=='cp'&&!p.tileDecoration.options.showEdges?[]:paintedSegments).map(s=>{const info=p.segmentPresentation?.get(s.id),stroke=creaseLineStroke(s,display.lineStyle,(s.assignment==='A'?display.auxLineWidth:display.lineWidth)*(info?.emphasis?1.3:1),units,adaptiveLineStyle,display.roundedEnds,display.auxLineStyle,p.solidCreases);const title=info?.title??creaseShortLineTitle(s,stroke.limited);const active=p.selected.has(s.id);const dx=active?dragOffset[0]:0,dy=active?dragOffset[1]:0;const coords={x1:s.a[0]+dx,y1:s.a[1]+dy,x2:s.b[0]+dx,y2:s.b[1]+dy};const layerVisible=s.assignment==='A'?layerState.auxiliary:layerState.main;return <g key={s.id} data-segment={s.id} data-assignment={s.assignment} data-cp-step-emphasis={info?.emphasis||undefined} visibility={hiddenTraceId===s.id||!layerVisible?'hidden':undefined}>
    {display.showCursorHint!==false&&title&&<title>{title}</title>}
    {active&&<line {...coords} stroke={p.diagnosticHighlights?.segmentIds.has(s.id)?DIAGNOSTIC_HIGHLIGHT_COLOR:'#238567'} strokeOpacity=".2" strokeWidth={10*units} />}
    <line {...coords} data-crease-stroke="true" data-adaptive-line-limited={stroke.limited||undefined} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap={display.roundedEnds?'round':'butt'} strokeDasharray={stroke.dash} strokeDashoffset={stroke.dashOffset}/>
    {active&&[s.a,s.b].map((q,i)=><circle key={i} cx={q[0]+dx} cy={q[1]+dy} r={3.5*units} fill="white" stroke={p.diagnosticHighlights?.segmentIds.has(s.id)?DIAGNOSTIC_HIGHLIGHT_COLOR:'#1f6551'} strokeWidth={1.5*units}/>)}</g>;
  });
    // Keep every segment and its paint order, but bound sibling scans during
    // React placement when importing a large document with entirely new IDs.
    // An ungrouped 148k-line CP spent most of its commit in getHostSibling.
    return Array.from({length:Math.ceil(nodes.length/512)},(_,batch)=><g key={batch} data-crease-batch={batch}>{nodes.slice(batch*512,(batch+1)*512)}</g>);
  },[gpuEnabled,p.doc.segments,p.selected,p.diagnosticHighlights?.segmentIds,!!p.tileDecoration,p.tileDecoration?.mode,p.tileDecoration?.options.showEdges,hiddenTraceId,layerState.main,layerState.auxiliary,dragOffset[0],dragOffset[1],units,adaptiveLineStyle,display.lineStyle,display.auxLineStyle,display.lineWidth,display.auxLineWidth,display.roundedEnds,display.showCursorHint,p.solidCreases,p.segmentPresentation]);
  const vertexLayer=useMemo(()=>{
    if(gpuEnabled||!layerState.main||display.pointSize<=0||distance(dragOffset,[0,0])>=1e-7)return null;
    const shape=creaseVertexShape(display,markerUnits)!;
    return <g pointerEvents="none" fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth||undefined}>{displayVertices.map(([x,y])=>shape.round?<circle key={`${x},${y}`} data-crease-vertex="true" cx={x} cy={y} r={shape.pathRadius}/>:<rect key={`${x},${y}`} data-crease-vertex="true" x={x-shape.pathRadius} y={y-shape.pathRadius} width={shape.pathRadius*2} height={shape.pathRadius*2}/>)}</g>;
  },[gpuEnabled,displayVertices,layerState.main,display.pointSize,display.pointStyle,display.lineWidth,markerUnits,dragOffset[0],dragOffset[1]]);
  // Junctions retain their SVG keyboard controls, but navigation must not
  // rebuild their hidden nodes. Cull only presentation, never snap topology.
  const shownIntersections=useMemo(()=>{
    if(topology.asynchronous)return navigating?[]:creaseJunctionPresentation(visibleIntersections,view,size,new Set([activeVertex?.id,junctionFocus].filter((id):id is string=>!!id)));
    if(!gpuEnabled)return visibleIntersections;
    if(navigating)return [];
    const margin=8*units;return visibleIntersections.filter(v=>v.point[0]>=view.x-margin&&v.point[0]<=view.x+view.w+margin&&v.point[1]>=view.y-margin&&v.point[1]<=view.y+view.h+margin);
  },[topology.asynchronous,gpuEnabled,navigating,visibleIntersections,view.x,view.y,view.w,view.h,size.w,size.h,units,activeVertex?.id,junctionFocus]);
  const pickVertexRef=useRef(pickVertex);pickVertexRef.current=pickVertex;
  // Transparent targets retain picking and keyboard access without painting a
  // second shell over the display marker. Focus is a transient interaction cue.
  const junctionLayer=useMemo(()=>!p.readOnly&&distance(dragOffset,[0,0])<1e-7&&shownIntersections.map(v=><circle key={v.id} data-intersection="true" data-junction-kind={v.kind==='intersection'?'intersection':'split'} data-vertex={v.id} data-x={v.point[0]} data-y={v.point[1]} data-selected={activeVertex?.id===v.id?'true':'false'} cx={v.point[0]} cy={v.point[1]} r={2.4*markerUnits} fill="transparent" stroke={junctionFocus===v.id?'#5a7365':'none'} strokeWidth={1.15*markerUnits} role={p.tool==='select'&&selectableVertices.has(v.id)?'button':undefined} tabIndex={p.tool==='select'&&selectableVertices.has(v.id)?0:undefined} aria-label={`选择${v.kind==='intersection'?'交点':'分段点'} ${Number(v.point[0].toFixed(3))}, ${Number(v.point[1].toFixed(3))}`} onFocus={()=>setJunctionFocus(v.id)} onBlur={()=>setJunctionFocus(null)} onKeyDown={e=>{if(p.tool==='select'&&selectableVertices.has(v.id)&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();pickVertexRef.current(v,e.shiftKey);}}}>{display.showCursorHint!==false&&<title>{`${v.kind==='intersection'?'交点':'分段点'} · ${v.point.map(n=>Number(n.toFixed(3))).join(', ')} mm`}</title>}</circle>),[p.readOnly,shownIntersections,markerUnits,dragOffset[0],dragOffset[1],activeVertex?.id,p.tool,selectableVertices,junctionFocus,display.showCursorHint]);
  return <div className="canvas-pane" data-crease-topology={topology.ready?'ready':topology.busy?'preparing':'unavailable'}>
  <div className="canvas-wrap">
  {(p.workspaceLabel||!p.readOnly&&(display.showToolGuide!==false||guideError))&&<CanvasGuidanceOverlay size={size} paper={{x:(helpBounds.x-view.x)*size.w/view.w,y:(helpBounds.y-view.y)*size.h/view.h,width:helpBounds.width*size.w/view.w,height:helpBounds.height*size.h/view.h}} label={p.workspaceLabel} tool={TOOL_NAMES[p.tool]} instruction={guideError||(circleEraseStep??toolStep).instruction} enabled={!p.readOnly&&display.showToolGuide!==false} error={!p.readOnly?guideError:undefined}><ToolGuide tool={p.tool} pendingCount={stepCount} error={guideError} stepOverride={circleEraseStep??(p.tool==='regioncheck'||p.tool==='customcolor'||p.tool==='text'||p.tool==='voronoi'||continuousTool?toolStep:inverseStep)}/></CanvasGuidanceOverlay>}
  <div className="canvas-controls-overlay"><div className="canvas-parameter-panel">
  {!p.readOnly&&drawingSwap&&<div className="construction-parameters" aria-label="生成线型"><strong>生成时山谷互换</strong><small>新线山 ⇄ 谷，保留折角幅值</small><button onClick={()=>p.onDrawingSwapChange?.(false)}>关闭互换</button></div>}
  {!topology.ready&&<div className="construction-parameters" data-crease-topology-status="true"><span role="status">{topology.message} · 可缩放和平移</span>{topology.busy?<button onClick={topology.cancel}>取消交点准备</button>:<button onClick={topology.retry}>重试交点准备</button>}</div>}
  {!p.readOnly&&topology.asynchronous&&p.tool==='select'&&selectableIntersections.length>0&&<details className="construction-parameters" aria-label="全部交点键盘选择"><summary>全部交点 · {selectableIntersections.length} 个</summary><div><button disabled={junctionPage.page===0} onClick={()=>setJunctionPage(junctionPage.page-1)}>上一页交点</button><span>第 {junctionPage.page+1} / {junctionPage.pages} 页</span><button disabled={junctionPage.page+1===junctionPage.pages} onClick={()=>setJunctionPage(junctionPage.page+1)}>下一页交点</button></div><div style={{maxHeight:160,overflowY:'auto'}}>{junctionPage.points.map(vertex=><button key={vertex.id} data-junction-list-id={vertex.id} aria-pressed={activeVertex?.id===vertex.id} onFocus={()=>{setJunctionFocus(vertex.id);const [x,y]=vertex.point;if(x<view.x||x>view.x+view.w||y<view.y||y>view.y+view.h)setView({...view,x:x-view.w/2,y:y-view.h/2});}} onBlur={()=>setJunctionFocus(null)} onClick={event=>pickVertex(vertex,event.shiftKey)}>{vertex.kind==='intersection'?'交点':'分段点'} {vertex.point.map(n=>Number(n.toFixed(3))).join(', ')}</button>)}</div><small>密集标记按屏幕空间显示；全部交点仍可吸附、点击或在此逐页选择。</small></details>}
  {!p.readOnly&&p.tool==='mark'&&<div className="construction-parameters" aria-label="独立标记参数"><span>新标记颜色</span>{(Object.keys(MARK_COLORS) as MarkColor[]).map(color=><button key={color} aria-pressed={markColor===color} onClick={()=>chooseMarkColor(color)}><span aria-hidden="true" style={{color:MARK_COLORS[color].value}}>━ </span>{MARK_COLORS[color].name}标记</button>)}<small>只影响新标记；改色取消草稿，已有标记不变。</small>{!layerState.marks&&<strong>标记图层已隐藏，请开启“独立标记”查看结果。</strong>}</div>}
  {!p.readOnly&&p.tool==='regioncheck'&&<div className="construction-parameters" aria-label="区域闭环检查参数">
    <button className="outline" disabled={pending.length<3||!!regionCheck||!!gesture.current} onClick={()=>finishRegionCheck()}>闭合并检查</button>
    <button disabled={!pending.length||!!gesture.current} onClick={()=>{setRegionCheck(null);setPending(points=>points.slice(0,-1));setToolError('');}}>撤回末点</button>
    <button disabled={!pending.length} onClick={cancelGesture}>重新绘制</button>
    {regionCheck&&<span role="status" data-region-check-result={regionCheck.status}>{regionCheck.status==='consistent'?'几何一致':regionCheck.status==='inconsistent'?'几何不一致':'无法判断'} · {regionCheck.crossings.length} 次横穿{regionCheck.residual!==null?' · 回位误差 '+Number(regionCheck.residual.toPrecision(4))+' mm':''}</span>}
    <small>仅闭环几何必要条件 · 不检查山谷、层序及全局可折 · 临时检查不保存</small>
  </div>}

  {!p.readOnly&&p.tool==='customcolor'&&<div className="construction-parameters" aria-label="自定义颜色参数"><label>显示颜色 <ColorPicker aria-label="辅助线与圆颜色" value={customColor} onChange={color=>{cancelGesture();setCustomColor(color);}}/></label><code>{customColor}</code><span>命中 {colorPreview.segmentIds.size} 条辅助线 / {colorPreview.circleIds.size} 个圆</span><small>只改显示 · 松开应用 · 接触框不限方向</small></div>}

  {!p.readOnly&&p.tool==='voronoi'&&<div className="construction-parameters" aria-label="Voronoi 参数"><strong>{pending.length} 个种子</strong><span role="status" data-voronoi-status={voronoi.busy?'busy':voronoi.status}>{voronoi.busy?'正在计算…':voronoi.error?'计算失败':voronoi.edges.length+' 条参考边'}</span><button className="outline" disabled={!pending.length} onClick={cancelGesture}>清空 Voronoi</button><small>临时参考 · 不改作品、不保存 · 初始跨度 1000 mm</small></div>}

  {!p.readOnly&&p.tool==='text'&&textDraft&&<TextParameters draft={textDraft} onChange={setTextDraft} onSave={applyText} onCancel={cancelGesture} onDelete={()=>{if(textDraft.id&&p.onChange(deleteTexts(p.doc,new Set([textDraft.id])))!==false){cancelGesture();p.onMessage('文字已删除，可撤销。');}}}/>}

  {!p.readOnly&&foldableActive&&<div className="construction-parameters" aria-label="补线网格参数"><span>{foldableState?`相邻 ${foldableState.degree} 条折线 · ${foldableState.end?'终点待确认':'待选终点'}`:'已有点／网格点起笔'}</span>{foldableState?.suggestions.map((end,i)=><button className="outline" key={i} aria-pressed={!!foldableState.end&&distance(foldableState.end,end)<=epsilonFor(p.doc)} onClick={()=>{setFoldableState(chooseFoldableDirection(foldableState,i));setToolError('');}}>方向建议 {i+1}</button>)}{foldableState?.end&&<button className="outline" onClick={()=>commitFoldable()}>确认暂定线段</button>}<small>{foldableDrawTool?(foldableAutomatic?`自动：${NAMES[generatedAssignment(foldableAutomatic.assignment,drawingSwap)]}`:'按已有山谷自动判断'):'使用当前线型'} · 重选终点不保证角度条件</small></div>}
  {!p.readOnly&&localFlatTool&&<div className="construction-parameters" aria-label="局部补线参数"><span>{localFlatResult.degree===1?(drawingSwap?'单邻线：山谷互换，保留折角幅值':'单邻线：沿用原线型与折角'):localFlatResult.degree?`相邻 ${localFlatResult.degree} 条折线`:'请选择已有奇数度顶点'}</span>{localFlatResult.candidates.map((c,i)=><button key={i} className="outline" aria-pressed={localFlatChoice===i} onClick={()=>{setLocalFlatChoice(i);setToolError('');}}>补线候选 {i+1} · {Number(c.degrees.toFixed(2))}°</button>)}<small>仅局部角度条件 · 不验证山谷分配或全局可折</small></div>}
  {!p.readOnly&&(angleTool||p.tool==='erasecross')&&<><AngleParameters measurements={measurements} value={angleSettings} onChange={value=>{try{validateAngleSettings(value);}catch(error){constructionError((error as Error).message);return;}cancelGesture();setAngleSettings(value);try{saveAngleSettings(value);p.onMessage('角度设置已保存，刷新后保留；请重新开始构造。');}catch{p.onMessage('角度设置仅本次生效：本地保存不可用，刷新后可能丢失。');}}}/>{p.tool==='angledirection'&&angleResult.fan.length>0&&<div className="construction-parameters"><label>方向候选 <select aria-label="方向候选" value={angleChoice??''} onChange={e=>{setAngleChoice(e.target.value===''?null:Number(e.target.value));setToolError('');}}><option value="">请选择方向</option>{angleResult.fan.map((f,i)=><option key={i} value={i}>{i+1} · 相对 {Number(f.angle.toFixed(3))}°</option>)}</select></label><small>第二点为起点 · 下一步点击实际截止线</small></div>}</>}
  {!p.readOnly&&offsetTool&&<div className="construction-parameters" aria-label="定距平行参数"><NumberField label="平行距离" value={offsetWidth} min={.00001} max={1e6} step={1} suffix="mm" onChange={setOffsetWidth}/><button className="outline" disabled={!offsetSource} onClick={()=>{if(!offsetSource)return;try{parallelOffsets(offsetSource,offsetWidth,p.preset,epsilonFor(p.doc));setPending([]);setOffsetReady(true);setToolError('');}catch(error){constructionError((error as Error).message);}}}>使用数值距离</button>{offsetReady&&offsetResult.copies.map((_,i)=><button key={i} className="outline" onClick={()=>finishOffset(i)}>生成候选 {i+1}</button>)}{offsetReady&&<button className="text-button" onClick={()=>{setOffsetReady(false);setPending([]);setToolError('');}}>重新量距</button>}</div>}
  {!p.readOnly&&lineBisectorTool&&<div className="construction-parameters" aria-label="两线角平分参数"><span>{lineBisectorResult.value?.kind==='parallel'?(bisectorCut?'平行中线 · 已选第一截止':'平行中线 · 请选择两端截止'):lineBisectorResult.value?'相交线 · 从交点到实际截止':'选择两条参考线'}</span>{lineBisectorResult.value?.kind==='parallel'&&!bisectorCut&&<button className="outline" onClick={finishFullMidline}>生成完整中线</button>}<small>参考线不改型 · 紫色仅为预览</small></div>}
  {!p.readOnly&&axiomTool&&<div className="construction-parameters" aria-label="公理候选">{axiomPreviews.some(s=>!s.bounded)&&<small>部分候选仅为方向预览：缺少双侧截止，请指定实际截止线。</small>}<span>{axiomReady?`${axiomResult.folds.length} 个候选 · ${axiomChoice===null?'尚未选择':'已选 '+(axiomChoice+1)}`:'目标按支撑直线 · 截止按实际线段'}</span>{axiomResult.folds.map((_,i)=><button key={i} className="outline" aria-pressed={axiomChoice===i} onClick={()=>{setAxiomChoice(i);setToolError('');}}>候选 {i+1}</button>)}{axiomChoice!==null&&<button className="outline" onClick={()=>finishAxiom()}>生成所选整段</button>}{axiomIds.length>0&&<button className="text-button" onClick={()=>{setPending(pending.slice(0,1));setAxiomIds([]);setAxiomChoice(null);setToolError('');}}>重选目标线</button>}</div>}
  {!p.readOnly&&rabbitTool&&<div className="construction-parameters" aria-label="兔耳构造参数"><span>{rabbitReady?`顶点 → 内心 · 新增 ${rabbitResult.copies.length} 段`:'三点确定三角形内心 · 外框仅作参考'}</span>{rabbitReady&&<button className="outline" disabled={!!rabbitResult.error} onClick={finishRabbitEar}>确认兔耳构造</button>}<small>三条构造线均采用{NAMES[drawingAssignment]} · 不自动分配不同山谷</small></div>}
  {!p.readOnly&&batchReflectionTool&&<div className="construction-parameters" aria-label={batchReflectionName+'参数'}>
    <span>{batchReflectionReady?`${fishboneTool?'鱼骨':continuousTool?'路径':'T 形原线'} ${continuousTool||fishboneTool?batchReflectionResult.copies.length:batchReflectionResult.sources.length} 段 · 新增 ${batchReflectionResult.copies.length} 段`:fishboneTool?'网格等分数控制间距 · 基线仅作参考':continuousTool?'先选起点和方向点，再指定终点':'只处理端点位于横截轴内部的原线'}</span>
    {continuousTool&&<>
      <label className="check"><input type="checkbox" checked={continuousAlternate} onChange={event=>{setContinuousAlternate(event.target.checked);setToolError('');}}/>山谷交替</label>
      <button className="outline" disabled={!batchReflectionReady||!continuousFullPath.path.length} aria-pressed={continuousPickingEnd} onClick={()=>{setContinuousPickingEnd(true);setToolError('');}}>{continuousEndpoint?'重新选择终点':'选择终点'}</button>
      <button className="outline" disabled={!continuousEndpoint&&!continuousPickingEnd} onClick={()=>{setContinuousEndpoint(undefined);setContinuousPickingEnd(false);setToolError('');}}>自动截止</button>
      {!!continuousChoices.length&&<button className="outline" onClick={()=>{setContinuousChoices([]);setContinuousEndpoint(undefined);setContinuousPickingEnd(false);setToolError('');}}>重选续接方向</button>}
      {continuousJunction&&!continuousPickingEnd&&<><span>交点续接：</span>{continuousJunction.candidates.map((candidate,index)=><button key={index} className="outline" aria-label={'折射续接方向 '+(index+1)} onClick={()=>chooseContinuousDirection(index)}>{index+1} · {Number(candidate.degrees.toFixed(1))}°</button>)}</>}
    </>}
    {batchReflectionReady&&<button className="outline" disabled={!!batchReflectionResult.error||continuousTool&&(continuousPickingEnd||!!continuousJunction)} onClick={finishBatchReflection}>确认{batchReflectionName}</button>}
    <small>{fishboneTool?(batchReflectionResult.stopMessage||'山谷按取点交替 · 跳过横向原线上的点 · 无截止方向不绘制'):continuousTool?(continuousPickingEnd?'点击紫色路径上的交点或任意位置作为终点':(batchReflectionResult.stopMessage||'辅助线与平面线不参与路径转向')+(continuousAlternate?' · 山谷逐段交替':' · 全部使用'+NAMES[drawingAssignment])):(drawingSwap?'副本山谷互换，保留折角幅值':'保留原线型／折角')+' · 遇首条非辅助线截止 · 缺少截止则整组不生成'}</small>
  </div>}
  {!p.readOnly&&(p.tool==='select'||p.tool==='unselect'||regionTool||transformTool||p.tool==='mirrorselection')&&<div className="construction-parameters" aria-label="选择命令"><button className="outline" title="Ctrl+A · 选择可见线段与辅助圆，遵守边界保护" onClick={()=>{cancelGesture();const next=editableCanvasSelection(p.doc,layerState,p.lockBoundary);p.onSelect(next.segments);p.onSelectCircles?.(next.circles);}}>全选</button><button className="outline" title="Ctrl+Shift+A" disabled={!p.selected.size&&!selectedCircles.size} onClick={()=>{cancelGesture();p.onSelect(new Set());p.onSelectCircles?.(new Set());}}>全部撤选</button><small>全选可见线段与圆 · 遵守边界保护</small></div>}
  {!p.readOnly&&dividedDrawTool&&<div className="construction-parameters" aria-label="分段绘制参数">{p.tool==='drawdivide'?<NumberField label="绘制等分数" value={drawCount} min={1} max={null} onChange={v=>{cancelGesture();setDrawCount(v);}}/>:<>{(['s','t'] as const).map((side,i)=><span className="ratio-draw-term" key={side}><span>{side.toUpperCase()} = </span>{(['a','b','c'] as const).map((key,j)=><span key={key}>{j===1?' + ':j===2?' √ ':''}<MeasurementField measurements={measurements} label={['a','b','c','d','e','f'][i*3+j]} value={drawRatio[side][key]} min={key==='c'?0:-1e6} max={1e6} step={.1} onChange={v=>{cancelGesture();setDrawRatio(r=>({...r,[side]:{...r[side],[key]:v}}));}}/></span>)}</span>)}<span>S:T = {ratioValues}</span></>}<small>{p.tool==='drawdivide'?'绘制新线并生成真实分点':'S 对应第一点到分点，T 对应分点到第二点；支持测量槽引用（L 为格），提交时取值'} · 紫色预览 · 松开提交</small></div>}
  {!p.readOnly&&finiteRayTool&&<div className="construction-parameters" aria-label="射线绘制说明"><strong>起点 → 经过点 → 截止线段</strong><small>三次点击 · 不回退 · 只取有限目标上的真实交点</small>{pending.length===2&&<span>{finiteRayPreview.geometry?'已命中有效目标，点击完成':finiteRayPreview.error||'请选择前方已有线段'}</span>}</div>}
  {!p.readOnly&&restrictedDrawTool&&<div className="construction-parameters" aria-label="受限绘制说明"><strong>{p.tool==='restrictedcircle'?'圆心与半径点受限':'起点与终点受限'}</strong><small>已有顶点／交点 · 圆心 · 可见纸内网格 · 两击或拖放 · 无效终点可重试</small>{pending.length>0&&<span>{restrictedEnd?'有效候选 · '+Number(restrictedLength.toPrecision(6))+' mm':'请移至有效受限点'}</span>}</div>}
  {!p.readOnly&&measurementSlot&&<div className="construction-parameters" aria-label="测量寄存器">{(['L1','L2','A1','A2','A3'] as const).map(slot=><span key={slot}><output aria-label={slot+' 测量值'}>{slot} = {Number(measurements[slot].toPrecision(10))} {slot.startsWith('L')?'格':'°'}</output>{(slot==='L1'||slot==='L2')&&lengthDetails[slot]&&<small>（{Number(lengthDetails[slot]!.mm.toPrecision(8))} mm；测时格距 {Number(lengthDetails[slot]!.gridStepMm.toPrecision(8))} mm）</small>}</span>)}<small>本次工作台会话保留，切换工作区不丢失 · L 为格单位 · 改网格不重算旧值 · A1/A2/A3 分别以180°/280°/380°为转负阈值</small></div>}
  {!p.readOnly&&alternateTool&&<div className="construction-parameters" aria-label="交替赋型参数"><span>起始：{alternateMode==='collinear'?(alternatePreview.length?NAMES[alternatePreview[0].assignment]:'沿用首段山谷'):NAMES[drawingAssignment]} · 命中 {alternatePreview.length} 段</span><small>{alternateMode==='collinear'?'保留起点朝终点方向的首段山谷，依次交替':p.preset==='M'||p.preset==='V'?'从起笔端依次交替山谷':'当前不是山谷类型：全部命中线统一改为'+NAMES[drawingAssignment]} · 紫色编号为赋型顺序 · 松开提交</small></div>}
  {!p.readOnly&&lineEraseTool&&<div className="construction-parameters" aria-label="划线删除参数"><span>预览命中 {lineErasePreview.size} 段</span><small>{p.tool==='eraseoverlap'?'起点终点均须已有点／圆心／显示网格点':'只删 X 相交或正长度重叠 · Ctrl 约束角度'} · 删除整个小段 · 遵守边界保护</small></div>}
  {!p.readOnly&&crossMergeTool&&<div className="construction-parameters" aria-label="跨线型合点参数"><small>边＋山→山 · 边＋谷→谷 · 山＋谷→边界 · 辅助不可混合</small>{mergePreview&&<><strong>结果：{NAMES[mergePreview.segment.assignment]} · {crossAngleConflict&&crossMergeAngle===''?'待选择折角':mergePreview.segment.angle===null?'未指定折角':mergePreview.segment.angle+'°'}</strong>{crossAngleConflict&&<label>折角冲突 <select aria-label="合并折角" value={crossMergeAngle} onChange={e=>{setCrossMergeAngle(e.target.value);setToolError('');}}><option value="">请选择结果折角</option>{[...new Set(crossSources.map(s=>s.angle))].map(angle=><option key={String(angle)} value={String(angle)}>{angle===null?'来源：未指定':'来源：'+angle+'°'}</option>)}{!crossSources.some(s=>s.angle===null)&&<option value="null">设为未指定</option>}</select></label>}<button className="outline" disabled={crossAngleConflict&&crossMergeAngle===''} onClick={()=>draw(pending[0],pending[0])}>确认合点</button></>}</div>}
  {!p.readOnly&&typeFilterTool&&!directTarget&&!regionalSwapTool&&<div className="construction-parameters" aria-label="类型筛选参数">{fixedTypeSource?<strong>{fixedTypeSource==='B'?'仅边界线':'仅辅助线'}</strong>:<label>来源 <select aria-label="筛选来源类型" value={typeSource} onChange={e=>{cancelGesture();setTypeSource(e.target.value as LineTypeFilter);}}>{LINE_TYPE_FILTERS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>}{p.tool==='replacetype'&&<label>目标 <select aria-label="替换目标类型" value={typeTarget} onChange={e=>{cancelGesture();setTypeTarget(e.target.value as Assignment);}}>{(['M','V','B','A','F'] as Assignment[]).map(t=><option key={t} value={t}>{NAMES[t]}</option>)}</select></label>}{p.tool==='replacetype'&&<><button disabled={typeSource==='any'||typeSource==='folds'||typeSource==='U'} title={typeSource==='any'||typeSource==='folds'||typeSource==='U'?'请选择一种具体来源线型后对调':'只对调参数，下一次点击或框选才修改折痕'} onClick={()=>{if(typeSource==='any'||typeSource==='folds'||typeSource==='U')return;cancelGesture();setTypeSource(typeTarget);setTypeTarget(typeSource);}}>对调来源与目标</button>{(typeSource==='any'||typeSource==='folds'||typeSource==='U')&&<small>对调需选择具体来源线型</small>}</>}<span>预览命中 {typePreview.size} 段</span><small>接触框选 · 松开提交 · 遵守边界保护</small></div>}
  {!p.readOnly&&regionalSwapTool&&<div className="construction-parameters" aria-label="区域山谷互换参数"><strong>山 ⇄ 谷</strong><span>预览命中 {typePreview.size} 段</span><small>接触框选 · 松开提交 · 仅山谷线 · 保留折角幅值</small></div>}
  {!p.readOnly&&directTarget&&<div className="construction-parameters" aria-label="直接赋型参数"><strong>目标：{NAMES[directTarget]}</strong><span>预览命中 {typePreview.size} 段</span><small>接触框选 · 松开提交 · 不改变绘制预设 · 遵守边界保护{directTarget==='A'?' · 仅转换山／谷／边界':''}</small></div>}
  {!p.readOnly&&regionTool&&<div className="construction-parameters" aria-label="区域选择参数"><span>{regionRemove?'从选区移除':'追加到选区'} · 已选 {p.selected.size} 段</span>{regionPolygon&&<button className="outline" disabled={pending.length<3} onClick={()=>finishRegion(pending)}>完成轮廓</button>}<small>{regionCross?'只选 X 相交或共线重叠':regionLasso?'完整包含，不接触轮廓；松开自动闭合':'完整包含（含边界）；点回起点闭合'} · 不修改线段</small></div>}
  {!p.readOnly&&transformTool&&<div className="construction-parameters" aria-label="选区变换参数"><span>选区 {p.selected.size} 段 / {selectedCircles.size} 个圆</span><small>{rotationTool?'点击旋转中心 → 移动鼠标沿圆预览 → 点击落位（Esc 取消）':fourPointTool?'已有点 A → B → C → D · A 对应 C，B 对应 D':'基准点 → 目标点 · 支持两次点击或拖放'} · {transformCopy?'保留原图':'移动原线'} · {drawingSwap?'副本山谷互换，保留折角幅值':'保留线型和折角'}</small></div>}
  {!p.readOnly&&mirrorTool&&<div className="construction-parameters" aria-label="镜像参数"><span>{mirrorSourceIds.length?`原线 ${mirrorSourceIds.length} 段`:p.tool==='mirrorselection'?`选区 ${p.selected.size} 段`:'选择原线与对称轴'}</span>{p.tool==='mirrorline'&&materialSelected(mirrorSourceIds)&&<><label>材料范围<select aria-label="镜像材料范围" value={mirrorMaterialScope} onChange={e=>setMirrorMaterialScope(e.target.value as 'source'|'all')}><option value="source">原部件</option><option value="all">全部材料</option></select></label><label>固定侧<select aria-label="镜像材料固定侧" value={mirrorFixedSide} onChange={e=>setMirrorFixedSide(e.target.value as 'left'|'right')}><option value="left">左侧</option><option value="right">右侧</option></select></label><label><input aria-label="镜像仅CP清除FF" type="checkbox" checked={mirrorCpOnly} onChange={e=>setMirrorCpOnly(e.target.checked)}/>仅CP，清除FF</label></>}{mirrorReady&&<button className="outline" disabled={!!mirrorResult.error} onClick={finishMirror}>确认镜像</button>}<small>{mirrorReady?`新增 ${mirrorResult.copies.length} 段 · ${materialSelected(mirrorSourceIds)?(p.tool==='mirrorline'?'有限材料线，纸外/孔洞不补线':'完整材料，不补接或去重'):'已去除同型同折角重合部分'}`:'紫色虚线仅为预览，最后确认才写入'} · {drawingSwap?'保留原图，副本山谷互换':'保留原图与山谷'}</small></div>}
  {!p.readOnly&&extraCircleResult?.kind==='circle'&&<div className="construction-parameters"><button className="outline" onClick={()=>{if(extraCircleResult?.kind==='circle')finishCircles([extraCircleResult.circle]);}}>{inversionTool?'确认反演圆':'确认半径差圆'}</button><small>圆心 {extraCircleResult.circle.center.map(n=>Number(n.toFixed(3))).join(', ')} · 半径 {Number(extraCircleResult.circle.radius.toFixed(3))} mm · 原对象保留</small></div>}
  {!p.readOnly&&tangentChoices.length>0&&<div className="construction-parameters" aria-label="切线候选"><span>选择一条切线</span>{tangentChoices.map((t,i)=><button className="outline" key={i} onClick={()=>commitConstruction(t.a,t.b)}>{i+1} · {t.label}</button>)}<small>只提交所选有限线段 · 可一次撤销</small></div>}
  {!p.readOnly&&p.tool==='circlepair'&&advancedCirclePreview.length===2&&<div className="construction-parameters"><button onClick={()=>finishCircles(advancedCirclePreview)}>确认双圆</button><small>新半径：{advancedCirclePreview.map(c=>Number(c.radius.toFixed(3))).join(' / ')} mm · 原圆保留</small></div>}
  {!p.readOnly&&circleIntersections.length>2000&&<div className="inline-warning">圆交点仅绘制前 2000 个标记；{circleIntersections.length>=20000?'吸附已达到 20000 点上限，请简化辅助圆。':'其余已计算交点仍可吸附。'}</div>}
  {!p.readOnly&&p.tool==='circleradius'&&<div className="construction-parameters" aria-label="定半径圆参数"><NumberField label="新圆半径" value={circleRadius} min={.000001} step={.1} suffix="mm" onChange={setCircleRadius}/><small>点击圆心放置 · 独立辅助圆</small></div>}
  {!p.readOnly&&p.tool==='circleedit'&&<CircleParameters circles={circles} selectedId={selectedCircleId} onSelect={id=>{setSelectedCircleId(id);p.onSelect(new Set());p.onSelectCircles?.(new Set(id?[id]:[]));}} onEdit={editCircle} onDelete={()=>{if(selectedCircle&&p.onChange({...p.doc,objects:p.doc.objects?.filter(o=>o.id!==selectedCircle.id)})!==false){setSelectedCircleId(null);p.onSelectCircles?.(new Set([...selectedCircles].filter(id=>id!==selectedCircle.id)));p.onMessage('已删除辅助圆，可按 Ctrl+Z 撤销。');}}}/>}
  {!p.readOnly&&p.tool==='polygon'&&<div className="construction-parameters" aria-label="多边形参数"><NumberField label="边数" value={polygonCount} min={3} max={64} onChange={setPolygonCount}/><button aria-pressed={polygonClockwise} onClick={()=>setPolygonClockwise(true)}>顺时针</button><button aria-pressed={!polygonClockwise} onClick={()=>setPolygonClockwise(false)}>逆时针</button><small>两点定义首边 · 3–64 边</small></div>}
  {!p.readOnly&&(p.tool==='divide'||p.tool==='ratio')&&<div className="construction-parameters" aria-label="分割参数">{p.tool==='divide'?<NumberField label="等分数" value={divisionCount} min={2} max={100} onChange={setDivisionCount}/>:<><NumberField label="比例 m" value={ratioA} min={.000001} max={1e6} step={.1} onChange={setRatioA}/><span>:</span><NumberField label="比例 n" value={ratioB} min={.000001} max={1e6} step={.1} onChange={setRatioB}/></>}<small>紫色实心点是起算端；分割保留原线型</small></div>}
  {!p.readOnly&&p.tool==='operationframe'&&<div className="construction-parameters" aria-label="操作框参数"><strong>{p.operationFrame?Math.round(p.operationFrame.width)+' × '+Math.round(p.operationFrame.height)+' px':'拖动创建屏幕操作框'}</strong><button className="outline" disabled={!p.operationFrame||!!framePreview} onClick={p.onFrameExport}>导出框内图</button><button className="outline" disabled={!p.operationFrame&&!framePreview} onClick={()=>{cancelGesture();p.onOperationFrameChange?.(null);}}>清除操作框</button><button className="outline" disabled={!p.operationFrame||!!framePreview||!p.doc.background?.visible||p.doc.background.opacity<=0||p.cropBusy} onClick={p.onBackgroundCrop}>{p.cropBusy?'正在裁剪…':'裁剪框内底图'}</button>{p.cropBusy&&<button onClick={p.onCancelBackgroundCrop}>取消裁剪</button>}<small>不改折线 · 裁剪按屏幕像素生成PNG，可撤销</small></div>}

  </div></div>
  {!p.readOnly&&<details className="canvas-layers" aria-label="对象显示"><summary>图层</summary><div className="canvas-layer-options"><label><input type="checkbox" checked={layerState.main} onChange={e=>setLayer('main',e.target.checked)}/>主折痕</label><label><input type="checkbox" checked={layerState.auxiliary} onChange={e=>setLayer('auxiliary',e.target.checked)}/>辅助线</label><label><input type="checkbox" checked={layerState.marks} onChange={e=>setLayer('marks',e.target.checked)}/>独立标记</label><label><input type="checkbox" checked={layerState.comments} onChange={e=>setLayer('comments',e.target.checked)}/>文字注释</label><small>隐藏对象不参与画布选择和删除；显示后可继续编辑。</small></div></details>}
  <svg ref={svg} data-drawing-swap={drawingSwap||undefined} data-crease-renderer={gpuEnabled?'webgl':'svg'} data-crease-renderer-fallback={gpuFailed??undefined} className={'crease-canvas tool-'+p.tool} shapeRendering={display.antiAlias?'geometricPrecision':'crispEdges'} style={{cursor:panning?'grabbing':undefined,touchAction:'none'}} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="none" tabIndex={0} role="application" aria-label="折痕画布，点击两点或拖放画线，按住滚轮拖动画布，滚动滚轮缩放" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={()=>{setCursor(null);setHoverPosition(null);setDrawingSnapFeedback(null);}} onPointerCancel={cancelGesture} onLostPointerCapture={()=>{if(gesture.current)cancelGesture();}} onMouseDown={mouseDown} onAuxClick={e=>{if(e.button===1)e.preventDefault();}} onContextMenu={e=>e.preventDefault()}>
    {display.showCursorHint!==false&&gpuEnabled&&gpuHoverTitle&&<title data-crease-gpu-tooltip="true">{gpuHoverTitle}</title>}
    <defs><pattern id={gridId} data-grid-pattern={p.gridPattern??'square'} data-grid-rotation={gridGeometry.rotation??0} width={triangularTile?.width??step} height={triangularTile?.height??stepY} patternUnits="userSpaceOnUse" patternTransform={`translate(${gridGeometry.origin[0]} ${gridGeometry.origin[1]}) rotate(${gridGeometry.rotation??0})`}><path d={triangularTile?.path??`M 0 0 H ${step} V ${stepY} H 0 Z`} fill="none" stroke={gridAppearance.gridColor} strokeWidth={gridAppearance.lineWidth*units}/>{!triangularTile&&p.diagonalGrid&&p.diagonalAngle===undefined&&<path d={`M 0 0 L ${step} ${stepY} M ${step} 0 L 0 ${stepY}`} fill="none" stroke={gridAppearance.diagonalColor} strokeWidth={Math.max(.1,gridAppearance.lineWidth*.64)*units}/>}</pattern>{gridOutline&&<clipPath id={`${gridId}-angle-clip`}><path d={gridOutline} clipRule={paperFillRule(p.doc)}/></clipPath>}</defs>
    {outline&&<path d={outline} fill="#fffefb" fillRule={paperFillRule(p.doc)} data-paper-outline="true"/>}
    {!outline&&p.gridPattern&&<rect data-grid-reference-outline="true" x={gridReference.x} y={gridReference.y} width={gridReference.width} height={gridReference.height} fill="#fffefb" fillOpacity={0} pointerEvents="none"/>}
    {p.doc.background?.visible&&<g transform={backgroundOuter?`translate(${backgroundOuter.x} ${backgroundOuter.y}) scale(${backgroundOuter.scale})`:undefined}><image data-background-image="true" href={p.doc.background.dataUrl} width={p.doc.background.width} height={p.doc.background.height} transform={`matrix(${backgroundMatrix(p.doc.background.placement).join(' ')})`} opacity={p.doc.background.opacity} preserveAspectRatio="xMidYMid meet" pointerEvents="none" onError={()=>p.onMessage('底图无法显示，图片可能已损坏；原始数据仍保留，请替换底图。')}/></g>}
    {backgroundPreview&&p.doc.background&&<g pointerEvents="none"><image data-background-preview="true" href={p.doc.background.dataUrl} width={p.doc.background.width} height={p.doc.background.height} transform={`matrix(${backgroundMatrix(backgroundPreview).join(' ')})`} opacity=".35" preserveAspectRatio="xMidYMid meet"/><polygon data-background-outline="true" points={backgroundCorners(backgroundPreview,p.doc.background).map(q=>q.join(',')).join(' ')} fill="none" stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${6*units} ${4*units}`}/></g>}
    {backgroundTool&&<g pointerEvents="none">{[0,2].map(i=>{const a=pending[i],b=pending[i+1]??(pending.length===i+1?hover:null);return a&&b?<line key={i} data-background-reference={i===0?'source':'target'} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${4*units} ${3*units}`}/>:null;})}{pending.map((q,i)=><text key={i} x={q[0]+8*units} y={q[1]-8*units} fill={REFERENCE_COLOR} stroke="white" strokeWidth={3*units} paintOrder="stroke" fontSize={12*units}>{['A 图片','B 图片','C 目标','D 目标'][i]}</text>)}</g>}
    {p.grid&&gridScope==='canvas'&&visibleGridStep/units>=gridAppearance.minGridPixelSize&&<rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${gridId})`} pointerEvents="none"/>}
    {gridOutline&&p.grid&&gridScope==='paper'&&visibleGridStep/units>=gridAppearance.minGridPixelSize&&<path data-grid-paper-fill={outline?'boundary':'reference'} d={gridOutline} fill={`url(#${gridId})`} fillRule={paperFillRule(p.doc)} pointerEvents="none"/>}
    {angleGridPath&&(gridScope==='canvas'||gridOutline)&&<path data-grid-angle={p.diagonalAngle} d={angleGridPath} clipPath={gridScope==='paper'?`url(#${gridId}-angle-clip)`:undefined} fill="none" stroke={gridAppearance.diagonalColor} strokeWidth={Math.max(.1,gridAppearance.lineWidth*.64)*units} pointerEvents="none"/>}
    {finiteRayTool&&pending.length>0&&<g pointerEvents="none">
      {(pending[1]||hover)&&<line data-ray-reference="true" x1={pending[0][0]} y1={pending[0][1]} x2={(pending[1]??hover!)[0]} y2={(pending[1]??hover!)[1]} stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${5*units} ${3*units}`}/>}
      {finiteRayPreview.geometry&&<line data-ray-preview="true" x1={finiteRayPreview.geometry.a[0]} y1={finiteRayPreview.geometry.a[1]} x2={finiteRayPreview.geometry.b[0]} y2={finiteRayPreview.geometry.b[1]} {...previewStroke(finiteRayPreview.geometry)}/>}
    </g>}
    {restrictedDrawTool&&pending.length>0&&restrictedEnd&&restrictedLength>1e-6&&<g pointerEvents="none"><line data-restricted-preview="line" x1={pending[0][0]} y1={pending[0][1]} x2={restrictedEnd[0]} y2={restrictedEnd[1]} {...(p.tool==='restrictedcircle'?{stroke:REFERENCE_COLOR,strokeWidth:2*units,strokeDasharray:`${5*units} ${3*units}`} : previewStroke({a:pending[0],b:restrictedEnd}))}/>{p.tool==='restrictedcircle'&&<circle data-restricted-preview="circle" cx={pending[0][0]} cy={pending[0][1]} r={restrictedLength} stroke={REFERENCE_COLOR} strokeWidth={2*units} fill="none"/>}</g>}
    {!p.readOnly&&axiomTool&&<g pointerEvents="none">{axiomRefs.map((s,i)=><g key={i}><line data-axiom-reference={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={5*units} strokeOpacity=".35"/><text x={(s.a[0]+s.b[0])/2} y={(s.a[1]+s.b[1])/2-7*units} fontSize={11*units} fill={REFERENCE_COLOR}>{i===0?'目标线':'垂直参考'}</text></g>)}{axiomPreviews.map((s,i)=><g key={i}><line data-axiom-candidate={i+1} data-bounded={s.bounded} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeOpacity={axiomChoice===null||axiomChoice===i?1:.25} strokeWidth={(axiomChoice===i?3:1.6)*units} strokeDasharray={`${6*units} ${3*units}`}/><circle data-axiom-mapped={i+1} cx={axiomResult.folds[i].mapped[0]} cy={axiomResult.folds[i].mapped[1]} r={4*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={units}/><text x={(s.a[0]+s.b[0])/2+7*units} y={(s.a[1]+s.b[1])/2-7*units} fill={REFERENCE_COLOR} fontSize={12*units}>{i+1}</text></g>)}{axiomCutPreview&&<line data-axiom-cutoff="true" x1={axiomCutPreview.a[0]} y1={axiomCutPreview.a[1]} x2={axiomCutPreview.b[0]} y2={axiomCutPreview.b[1]} stroke={REFERENCE_COLOR} strokeWidth={3*units}/>}</g>}
    {!p.readOnly&&lineBisectorTool&&<g pointerEvents="none">{[...bisectorRefs,...(bisectorCut?[bisectorCut]:[])].map((s,i)=><line key={i} data-two-line-reference={i+1} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={5*units} strokeOpacity=".35"/>)}{twoLinePreview&&<line data-two-line-bisector={twoLinePreview.bounded?'bounded':'guide'} x1={twoLinePreview.a[0]} y1={twoLinePreview.a[1]} x2={twoLinePreview.b[0]} y2={twoLinePreview.b[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${6*units} ${3*units}`}/>} {firstMidlinePoint&&<circle data-midline-first-cut="true" cx={firstMidlinePoint[0]} cy={firstMidlinePoint[1]} r={5*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={2*units}/>}</g>}
    {!p.readOnly&&foldableActive&&foldableState&&<g pointerEvents="none"><circle data-foldable-origin="true" cx={foldableState.origin[0]} cy={foldableState.origin[1]} r={4*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={2*units}/>{!foldableState.end&&foldableState.suggestions.map((end,i)=><line key={i} data-foldable-suggestion={i+1} x1={foldableState.origin[0]} y1={foldableState.origin[1]} x2={end[0]} y2={end[1]} stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${5*units} ${3*units}`}/>)}{foldableState.end&&<><line data-foldable-pending="true" data-foldable-type={foldableDrawTool?(foldableAutomatic?generatedAssignment(foldableAutomatic.assignment,drawingSwap):undefined):drawingAssignment} x1={foldableState.origin[0]} y1={foldableState.origin[1]} x2={foldableState.end[0]} y2={foldableState.end[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units}/><circle data-foldable-end="true" cx={foldableState.end[0]} cy={foldableState.end[1]} r={5*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={2*units}/></>}{foldableCutPreview&&<line data-foldable-cut="true" x1={foldableCutPreview.a[0]} y1={foldableCutPreview.a[1]} x2={foldableCutPreview.b[0]} y2={foldableCutPreview.b[1]} stroke={REFERENCE_COLOR} strokeWidth={2.5*units}/>}</g>}
    {!p.readOnly&&localFlatTool&&<g pointerEvents="none">{p.doc.segments.filter(s=>localFlatResult.sourceIds.includes(s.id)).map(s=><line key={s.id} data-local-flat-source={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={5*units} strokeOpacity=".3"/>)}{localFlatResult.candidates.map((c,i)=><g key={i}><line data-local-flat-candidate={i+1} data-chosen={localFlatChoice===i} x1={c.origin[0]} y1={c.origin[1]} x2={c.origin[0]+step*c.direction[0]} y2={c.origin[1]+step*c.direction[1]} stroke={REFERENCE_COLOR} strokeWidth={(localFlatChoice===i?3:1.5)*units} strokeOpacity={localFlatChoice===null||localFlatChoice===i?1:.3} strokeDasharray={`${5*units} ${3*units}`}/><text x={c.origin[0]+step*c.direction[0]} y={c.origin[1]+step*c.direction[1]-5*units} fontSize={11*units} fill={REFERENCE_COLOR}>{i+1}</text></g>)}{localFlatPreview&&<line data-local-flat-preview="true" x1={localFlatPreview.a[0]} y1={localFlatPreview.a[1]} x2={localFlatPreview.b[0]} y2={localFlatPreview.b[1]} {...previewStroke(localFlatPreview)}/>}</g>}
    {!p.readOnly&&specialAngleTool&&<g pointerEvents="none">{pending.length===2&&<line data-angle-baseline="true" x1={pending[0][0]} y1={pending[0][1]} x2={pending[1][0]} y2={pending[1][1]} stroke={REFERENCE_COLOR} strokeOpacity=".5" strokeWidth={2*units} strokeDasharray={`${5*units} ${3*units}`}/>} {specialAngleResult.fans.map((fan,group)=>fan.map((f,i)=><line key={group+':'+i} data-angle-fan={group+1} data-fan-candidate={i+1} x1={f.origin[0]} y1={f.origin[1]} x2={f.end[0]} y2={f.end[1]} stroke={REFERENCE_COLOR} strokeOpacity=".3" strokeWidth={units} strokeDasharray={`${5*units} ${4*units}`}/>))}{specialAnglePreview.map((s,i)=><g key={i}><line data-angle-result={i+1} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={2.5*units}/><circle cx={s.b[0]} cy={s.b[1]} r={4*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={units}/></g>)}</g>}
    {!p.readOnly&&angleTool&&<g pointerEvents="none">{angleResult.fan.map((f,i)=><line key={i} data-angle-candidate={i+1} data-chosen={angleChoice===i} x1={f.origin[0]} y1={f.origin[1]} x2={f.end[0]} y2={f.end[1]} stroke={REFERENCE_COLOR} strokeOpacity={angleChoice===null||angleChoice===i?1:.2} strokeWidth={(angleChoice===i?3:1.4)*units} strokeDasharray={`${5*units} ${3*units}`}/>)}{anglePreview&&<line data-angle-preview="true" x1={anglePreview.a[0]} y1={anglePreview.a[1]} x2={anglePreview.b[0]} y2={anglePreview.b[1]} {...previewStroke(anglePreview)}/>}</g>}
    {!p.readOnly&&offsetTool&&<g pointerEvents="none">{offsetSource&&<line data-offset-source={offsetSource.id} x1={offsetSource.a[0]} y1={offsetSource.a[1]} x2={offsetSource.b[0]} y2={offsetSource.b[1]} stroke={REFERENCE_COLOR} strokeWidth={5*units} strokeOpacity=".35"/>}{pending.length>0&&(pending[1]||hover)&&<line data-offset-measure="true" x1={pending[0][0]} y1={pending[0][1]} x2={(pending[1]||hover!)[0]} y2={(pending[1]||hover!)[1]} stroke={REFERENCE_COLOR} strokeWidth={units} strokeDasharray={`${4*units} ${3*units}`}/>} {offsetResult.copies.map((s,i)=><g key={i}><line data-offset-candidate={i+1} data-ready={offsetReady} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${5*units} ${3*units}`}/><text x={(s.a[0]+s.b[0])/2} y={(s.a[1]+s.b[1])/2-6*units} fill={REFERENCE_COLOR} fontSize={12*units}>{i+1}</text></g>)}</g>}
    <DrawingObjects markLineWidth={display.markLineWidth} objects={p.doc.objects?.filter(o=>(o.kind!=='circle'||layerState.auxiliary)&&(o.kind!=='mark'||layerState.marks)&&(o.kind!=='text'||layerState.comments)&&o.id!==textDraft?.id).map(o=>o.kind==='text'&&gesture.current?.kind==='text'&&gesture.current.ids.has(o.id)?{...o,position:[o.position[0]+dragOffset[0],o.position[1]+dragOffset[1]],color:REFERENCE_COLOR}:o.kind==='circle'&&gesture.current?.kind==='move'&&gesture.current.circleIds?.has(o.id)?{...o,center:[o.center[0]+dragOffset[0],o.center[1]+dragOffset[1]]}:o)} units={units}/>
    {textDraft&&<g data-text-draft="true"><DrawingObjects objects={[{...textDraft,id:'text-draft-preview',kind:'text',fontSize:Math.max(.1,Math.min(1e6,textDraft.fontSize)),color:REFERENCE_COLOR,text:textDraft.text||'输入文字…'}]} units={units}/></g>}
    {!!markErasePreview.size&&<g pointerEvents="none" data-mark-erase-preview="true">{p.doc.objects?.map(o=>o.kind==='mark'&&markErasePreview.has(o.id)?<line key={o.id} data-mark-erase-hit={o.id} x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".45" strokeWidth={Math.max(6,(display.markLineWidth??1.3)+4)*units}/>:null)}</g>}
    {!p.readOnly&&cycleTarget&&<line data-cycle-target={cycleTarget.id} x1={cycleTarget.a[0]} y1={cycleTarget.a[1]} x2={cycleTarget.b[0]} y2={cycleTarget.b[1]} stroke={REFERENCE_COLOR} strokeWidth={7*units} strokeOpacity=".35" pointerEvents="none"/>}
    {!p.readOnly&&dividedDrawTool&&<g pointerEvents="none">{dividedPreview.map((s,i)=><g key={s.id}><line data-divided-preview={i+1} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} {...previewStroke(s)}/><circle data-divided-point={i+1} cx={s.b[0]} cy={s.b[1]} r={4*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={1.5*units}/></g>)}</g>}
    {!p.readOnly&&alternateTool&&<g pointerEvents="none">{alternatePreview.map(h=>{const s=p.doc.segments.find(s=>s.id===h.id)!;return <g key={s.id}><line data-alternate-hit={s.id} data-alternate-order={h.order} data-alternate-type={h.assignment} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".55" strokeWidth={5*units}/><text x={(s.a[0]+s.b[0])/2+6*units} y={(s.a[1]+s.b[1])/2-6*units} fill={REFERENCE_COLOR} stroke="white" strokeWidth={3*units} paintOrder="stroke" fontSize={12*units}>{h.order} · {NAMES[h.assignment]}</text></g>;})}{pending.length>0&&hover&&<line data-alternate-reference={alternateEnd?'valid':'invalid'} x1={pending[0][0]} y1={pending[0][1]} x2={(alternateEnd??hover)[0]} y2={(alternateEnd??hover)[1]} stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${5*units} ${3*units}`}/>}</g>}
    {!p.readOnly&&lineEraseTool&&<g pointerEvents="none">{p.doc.segments.filter(s=>lineErasePreview.has(s.id)).map(s=><line key={s.id} data-line-erase-hit={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".55" strokeWidth={5*units}/>)}{pending.length>0&&hover&&<line data-line-erase-reference={eraseEnd?'valid':'invalid'} x1={pending[0][0]} y1={pending[0][1]} x2={(eraseEnd??hover)[0]} y2={(eraseEnd??hover)[1]} stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${5*units} ${3*units}`}/>}</g>}
    {!p.readOnly&&p.tool==='customcolor'&&<g pointerEvents="none">{p.doc.segments.filter(s=>colorPreview.segmentIds.has(s.id)).map(s=><line key={s.id} data-color-hit={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".55" strokeWidth={5*units}/>)}{circles.filter(c=>colorPreview.circleIds.has(c.id)).map(c=><circle key={c.id} data-color-hit={c.id} cx={c.center[0]} cy={c.center[1]} r={c.radius} fill="none" stroke={REFERENCE_COLOR} strokeOpacity=".55" strokeWidth={5*units}/>)}</g>}
    {!p.readOnly&&typeFilterTool&&<g pointerEvents="none">{p.doc.segments.filter(s=>typePreview.has(s.id)).map(s=><line key={s.id} data-type-hit={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".55" strokeWidth={5*units}/>)}</g>}
    {!p.readOnly&&regionTool&&pending.length>0&&<g pointerEvents="none"><polyline data-region-outline="true" points={[...pending,...(!regionLasso&&hover?[hover]:[])].map(q=>q.join(',')).join(' ')} fill={regionCross?'none':REFERENCE_COLOR} fillOpacity=".06" fillRule={regionLasso?'nonzero':'evenodd'} stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${5*units} ${3*units}`}/>{!regionCross&&pending.length>1&&<line data-region-close="true" x1={pending[0][0]} y1={pending[0][1]} x2={(regionLasso?pending.at(-1)!:hover??pending.at(-1)!)[0]} y2={(regionLasso?pending.at(-1)!:hover??pending.at(-1)!)[1]} stroke={REFERENCE_COLOR} strokeOpacity=".4" strokeWidth={units} strokeDasharray={`${2*units} ${4*units}`}/>}</g>}
    {!p.readOnly&&transformTool&&<g pointerEvents="none">{rotationTool&&pending.length>0&&rotationReference&&<g data-rotation-copy-orbit="true"><circle cx={pending[0][0]} cy={pending[0][1]} r={distance(pending[0],rotationReference)} fill="none" stroke={REFERENCE_COLOR} strokeWidth={units} strokeDasharray={`${4*units} ${4*units}`}/><line x1={pending[0][0]} y1={pending[0][1]} x2={rotationReference[0]} y2={rotationReference[1]} stroke={REFERENCE_COLOR} strokeWidth={units}/><circle cx={rotationReference[0]} cy={rotationReference[1]} r={3*units} fill={REFERENCE_COLOR}/>{rotationOrbit&&<><line x1={pending[0][0]} y1={pending[0][1]} x2={rotationOrbit.target[0]} y2={rotationOrbit.target[1]} stroke={REFERENCE_COLOR} strokeWidth={units}/><circle data-rotation-copy-target cx={rotationOrbit.target[0]} cy={rotationOrbit.target[1]} r={4*units} fill={REFERENCE_COLOR}/></>}</g>}{transformedCircles.map(c=><circle key={c.id} data-transform-circle-preview cx={c.center[0]} cy={c.center[1]} r={c.radius} fill="none" stroke={REFERENCE_COLOR} strokeWidth={units*2}/>)}{transformPreview.map(s=><line key={s.id} data-transform-preview="true" x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} {...previewStroke(s)}/>)}{!rotationTool&&pending.length>0&&<polyline data-transform-reference="true" points={[...pending,...(hover?[hover]:[])].map(p=>p.join(',')).join(' ')} fill="none" stroke={REFERENCE_COLOR} strokeWidth={units} strokeDasharray={`${3*units} ${4*units}`}/>} {pending.map((q,i)=><text key={i} x={q[0]+8*units} y={q[1]-8*units} fill={REFERENCE_COLOR} fontSize={12*units}>{rotationTool?'旋转中心':fourPointTool?['A','B','C'][i]:'基准点'}</text>)}</g>}
    {!p.readOnly&&mirrorTool&&<g pointerEvents="none">{mirrorSources.map(s=><line key={s.id} data-mirror-source={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={6*units} strokeOpacity=".35"/>)}{mirrorAxis.length===2&&<line data-mirror-axis="true" x1={mirrorAxis[0][0]} y1={mirrorAxis[0][1]} x2={mirrorAxis[1][0]} y2={mirrorAxis[1][1]} stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${9*units} ${3*units} ${2*units} ${3*units}`}/>}</g>}
    {!p.readOnly&&extraCircleResult?.kind==='circle'&&<circle data-inversion-circle-preview="true" cx={extraCircleResult.circle.center[0]} cy={extraCircleResult.circle.center[1]} r={extraCircleResult.circle.radius} fill="none" stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${5*units} ${3*units}`} pointerEvents="none"/>}
    {!p.readOnly&&inverseLinePreview&&<line data-inversion-line-preview={inverseLinePreview.bounded?'bounded':'guide'} x1={inverseLinePreview.a[0]} y1={inverseLinePreview.a[1]} x2={inverseLinePreview.b[0]} y2={inverseLinePreview.b[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${5*units} ${3*units}`} pointerEvents="none"/>}
    {!p.readOnly&&inverseSource&&<line data-inversion-source={inverseSource.id} x1={inverseSource.a[0]} y1={inverseSource.a[1]} x2={inverseSource.b[0]} y2={inverseSource.b[1]} stroke={REFERENCE_COLOR} strokeWidth={5*units} strokeOpacity=".4" pointerEvents="none"/>}
    {!p.readOnly&&<g pointerEvents="none">{(layerState.auxiliary?circleIntersections:[]).slice(0,2000).map(v=><circle key={v.id} data-circle-intersection="true" cx={v.point[0]} cy={v.point[1]} r={2.5*markerUnits} fill="white" stroke="#367d86" strokeWidth={markerUnits}/>)}{circleReferences.map((c,i)=><g key={c.id+':'+i} data-circle-reference={c.id}><circle cx={c.center[0]} cy={c.center[1]} r={c.radius} fill="none" stroke={REFERENCE_COLOR} strokeWidth={3*units} strokeOpacity=".45"/><text x={c.center[0]+5*units} y={c.center[1]-5*units} fill={REFERENCE_COLOR} fontSize={12*units}>参考 {i+1}</text></g>)}{advancedCirclePreview.map((c,i)=><circle key={i} data-advanced-circle-preview="true" cx={c.center[0]} cy={c.center[1]} r={c.radius} fill="none" stroke={REFERENCE_COLOR} strokeWidth={1.8*units} strokeDasharray={`${5*units} ${3*units}`}/>)}{((p.tool==='circleseparate'&&pending.length===2)||(p.tool==='circleconcentric'&&pending.length===1))&&hover&&<line data-radius-reference="true" x1={pending[pending.length-1][0]} y1={pending[pending.length-1][1]} x2={hover[0]} y2={hover[1]} stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${5*units} ${3*units}`}/>}</g>}
    {!p.readOnly&&tangentChoices.map((t,i)=><g key={i} pointerEvents="none"><line data-tangent-candidate={i+1} x1={t.a[0]} y1={t.a[1]} x2={t.b[0]} y2={t.b[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units}/><text x={t.a[0]*.65+t.b[0]*.35+5*units} y={t.a[1]*.65+t.b[1]*.35-5*units} fontSize={12*units} fill={REFERENCE_COLOR} stroke="white" strokeWidth={3*units} paintOrder="stroke">{i+1}</text></g>)}
    {(layerState.auxiliary?circles.filter(c=>selectedCircles.has(c.id)||c.id===selectedCircle?.id):[]).map(c=>{const moving=gesture.current?.kind==='move'&&gesture.current.circleIds?.has(c.id),center:Point=moving?[c.center[0]+dragOffset[0],c.center[1]+dragOffset[1]]:c.center,color=p.tool==='circleedit'?REFERENCE_COLOR:'#238567';return <g key={c.id} data-selected-circle={c.id} pointerEvents="none"><circle cx={center[0]} cy={center[1]} r={c.radius} fill="none" stroke={color} strokeWidth={5*units} strokeOpacity=".35"/>{circleSnapPoints([{...c,center}]).map(v=><circle key={v.id} cx={v.point[0]} cy={v.point[1]} r={4*units} fill="white" stroke={color} strokeWidth={1.5*units}/>)}</g>;})}
    {!p.readOnly&&circlePreview&&<g data-circle-preview="true" pointerEvents="none"><circle cx={circlePreview.center[0]} cy={circlePreview.center[1]} r={circlePreview.radius} fill="none" stroke={REFERENCE_COLOR} strokeWidth={1.8*units} strokeDasharray={`${5*units} ${3*units}`}/><circle cx={circlePreview.center[0]} cy={circlePreview.center[1]} r={3*units} fill={REFERENCE_COLOR}/></g>}
    {p.tileDecoration&&<TileDecorationLayer tiles={p.tileDecoration.tiles} options={p.tileDecoration.options} units={units} part="fill"/>}
    {p.tileDecoration?.mode==='cp'&&<TileDecorationLayer tiles={p.tileDecoration.tiles} options={p.tileDecoration.options} units={units} part="edges"/>}
    {gpuEnabled?<CreaseGpuLayer scene={gpuScene} view={view} size={size} drag={dragOffset} adaptive={adaptiveLineStyle} showMarkers={!navigating} onFailure={reason=>{recordActivity('canvas.gpu.fallback',{workspace:'crease',segments:p.doc.segments.length,reason,result:'svg'},'warning');setGpuFailed(reason);}}/>:segmentLayer}
    <g data-navigation-markers="vertices" visibility={navigating?'hidden':undefined}>{vertexLayer}</g>
    {p.tileDecoration&&<TileDecorationLayer tiles={p.tileDecoration.tiles} options={p.tileDecoration.options} units={units} part="marks"/>}
    <g data-navigation-markers="junctions" visibility={navigating?'hidden':undefined}>{junctionLayer}</g>
    {!p.readOnly&&mirrorTool&&<g pointerEvents="none">{p.tool==='mirrorselection'&&mirrorReady&&mirrorEnvelope(mirrorResult.copies).length>=3&&<polygon data-mirror-region="true" points={mirrorEnvelope(mirrorResult.copies).map(p=>p.join(',')).join(' ')} fill={REFERENCE_COLOR} fillOpacity=".1" stroke={REFERENCE_COLOR} strokeOpacity=".35" strokeWidth={units}/>} {mirrorPreview.map(s=><line key={s.id} data-mirror-preview={mirrorReady?'ready':'hover'} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} {...previewStroke(s)}/>)}</g>}
    {activeVertex&&activeVertex.segmentIds.some(id=>visibleSegmentIds.has(id))&&distance(dragOffset,[0,0])<1e-7&&<circle data-active-vertex="true" cx={activeVertex.point[0]} cy={activeVertex.point[1]} r={7*units} fill="#1f655115" stroke="#1f6551" strokeWidth={1.6*units} pointerEvents="none"/>}
    {target&&<line data-construction-target={target.id} x1={target.a[0]} y1={target.a[1]} x2={target.b[0]} y2={target.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".35" strokeWidth={7*units} pointerEvents="none"/>}
    {source&&<g pointerEvents="none"><line data-edit-source={source.id} x1={source.a[0]} y1={source.a[1]} x2={source.b[0]} y2={source.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".3" strokeWidth={7*units}/>{sourceChoice&&<circle data-edit-start="true" cx={source[sourceChoice.end][0]} cy={source[sourceChoice.end][1]} r={5*units} fill={REFERENCE_COLOR}/>}</g>}
    {!!editPreview.length&&<g pointerEvents="none" data-edit-preview={p.tool}>{editPreview.map((s,i)=><g key={s.id}><line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} {...previewStroke(s)}/>{i>0&&<circle data-division-point="true" cx={s.a[0]} cy={s.a[1]} r={4*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={1.5*units}/>}</g>)}</g>}
    {twoLineReflection&&reflectionRefs.map((s,i)=><line key={s.id} data-reflection-reference={i+1} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={5*units} strokeOpacity=".5" pointerEvents="none"/>)}
    {!p.readOnly&&rabbitReady&&<g pointerEvents="none"><polygon data-rabbit-reference="true" points={pending.map(q=>q.join(',')).join(' ')} fill="none" stroke={REFERENCE_COLOR} strokeOpacity=".45" strokeWidth={units} strokeDasharray={`${4*units} ${4*units}`}/>{rabbitResult.copies.map(s=><line key={s.id} data-rabbit-preview={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} {...previewStroke(s)}/>)}</g>}
    {batchReflectionTool&&<g pointerEvents="none">{pending.length>0&&(pending[1]||hover)&&<line data-fishbone-axis={fishboneTool?true:undefined} data-transverse-axis={!continuousTool&&!fishboneTool?true:undefined} data-continuous-direction={continuousTool?true:undefined} x1={pending[0][0]} y1={pending[0][1]} x2={(pending[1]||hover!)[0]} y2={(pending[1]||hover!)[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${7*units} ${4*units}`}/>} {batchReflectionResult.sources.map(s=><line key={s.id} data-transverse-source={!continuousTool?s.id:undefined} data-continuous-reference={continuousTool?s.id:undefined} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeWidth={5*units} strokeOpacity=".45"/>)}{batchReflectionResult.copies.map(s=><line key={s.id} data-fishbone-preview={fishboneTool?s.id:undefined} data-transverse-preview={!continuousTool&&!fishboneTool?s.id:undefined} data-continuous-preview={continuousTool?s.id:undefined} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} {...previewStroke(s)}/>)}</g>}
    {continuousJunction&&!continuousPickingEnd&&<g pointerEvents="none">{continuousJunction.candidates.map((candidate,index)=><g key={index}><line data-continuous-junction-direction={index+1} x1={continuousJunction.point[0]} y1={continuousJunction.point[1]} x2={candidate.end[0]} y2={candidate.end[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${7*units} ${4*units}`}/><text x={continuousJunction.point[0]+(candidate.end[0]-continuousJunction.point[0])*.45+5*units} y={continuousJunction.point[1]+(candidate.end[1]-continuousJunction.point[1])*.45-5*units} fontSize={12*units} fill={REFERENCE_COLOR} stroke="#fffefb" strokeWidth={3*units} paintOrder="stroke">方向 {index+1}</text></g>)}</g>}
    {continuousTool&&continuousPickingEnd&&<g pointerEvents="none">{continuousFullPath.path.map((segment,index)=><line key={index} data-continuous-end-path={index} x1={segment.a[0]} y1={segment.a[1]} x2={segment.b[0]} y2={segment.b[1]} stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${4*units} ${4*units}`} strokeOpacity=".6"/>)}</g>}
    {continuousTool&&continuousEndMarker&&<g pointerEvents="none"><circle data-continuous-end={continuousPickingEnd?'candidate':'selected'} cx={continuousEndMarker.point[0]} cy={continuousEndMarker.point[1]} r={5*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={2*units}/><text x={continuousEndMarker.point[0]+8*units} y={continuousEndMarker.point[1]-8*units} fontSize={12*units} fill={REFERENCE_COLOR} stroke="#fffefb" strokeWidth={3*units} paintOrder="stroke">终点</text></g>}
    {directionReference&&<line data-direction-reference={directionReference.id} x1={directionReference.a[0]} y1={directionReference.a[1]} x2={directionReference.b[0]} y2={directionReference.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".35" strokeWidth={7*units} pointerEvents="none"/>}
    {candidates.map((s,i)=><line key={i} data-direction-candidate={i} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".55" strokeWidth={1.5*units} strokeDasharray={`${5*units} ${3*units}`} pointerEvents="none"/>)}
    {directionPreview&&<line data-direction-preview="true" x1={directionPreview.a[0]} y1={directionPreview.a[1]} x2={directionPreview.b[0]} y2={directionPreview.b[1]} {...previewStroke(directionPreview)} pointerEvents="none"/>}
    {!!polygonPreview.length&&<polygon data-polygon-preview="true" points={polygonPreview.map(q=>q.join(',')).join(' ')} fill="none" stroke={REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={`${5*units} ${3*units}`} pointerEvents="none"/>}
    {crossMergeTool&&mergePreview&&<g pointerEvents="none">{crossSources.map(s=><line key={s.id} data-merge-source={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={REFERENCE_COLOR} strokeOpacity=".25" strokeWidth={8*units}/>)}</g>}
    {mergePreview&&<line data-merge-preview="true" x1={mergePreview.segment.a[0]} y1={mergePreview.segment.a[1]} x2={mergePreview.segment.b[0]} y2={mergePreview.segment.b[1]} {...previewStroke(mergePreview.segment)} pointerEvents="none"/>}
    {midPreview&&<line data-midperp-preview="true" x1={midPreview.a[0]} y1={midPreview.a[1]} x2={midPreview.b[0]} y2={midPreview.b[1]} {...previewStroke(midPreview)} pointerEvents="none"/>}
    {!p.readOnly&&p.tool==='voronoi'&&<g data-voronoi-preview="true" pointerEvents="none">{voronoi.edges.map(edge=><line key={edge.sites.join(':')} data-voronoi-edge={edge.sites.join(':')} x1={edge.a[0]} y1={edge.a[1]} x2={edge.b[0]} y2={edge.b[1]} stroke={REFERENCE_COLOR} strokeWidth={1.5*units}/>)}{pending.map((q,i)=><text key={i} data-voronoi-seed={i+1} x={q[0]+8*units} y={q[1]-8*units} fill={REFERENCE_COLOR} stroke="white" paintOrder="stroke" strokeWidth={3*units} fontSize={12*units}>{i+1}</text>)}</g>}
    {!p.readOnly&&p.tool==='regioncheck'&&pending.length>0&&<g pointerEvents="none"><polyline data-region-check-outline={regionCheck?'closed':'draft'} points={(regionCheck?[...pending,pending[0]]:hover?[...pending,hover]:pending).map(p=>p.join(',')).join(' ')} fill="none" stroke={regionCheck?(regionCheck.status==='consistent'?'#367d86':regionCheck.status==='inconsistent'?'#b23d42':'#997327'):REFERENCE_COLOR} strokeWidth={2*units} strokeDasharray={regionCheck?undefined:`${4*units} ${3*units}`}/>{regionCheck?.crossings.map((c,i)=><g key={i}><circle data-loop-crossing={i+1} cx={c.point[0]} cy={c.point[1]} r={3*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={units}/><text x={c.point[0]+5*units} y={c.point[1]-5*units} fill={REFERENCE_COLOR} stroke="white" strokeWidth={3*units} paintOrder="stroke" fontSize={11*units}>{i+1}</text></g>)}</g>}
    {preview.length>1&&<polyline data-drawing-preview={referencePreview?'reference':'crease'} points={preview.map(q=>q.join(',')).join(' ')} {...(referencePreview?{stroke:REFERENCE_COLOR,strokeWidth:1.5*units,strokeDasharray:`${4*units} ${4*units}`} : previewStroke({a:preview[0],b:preview[preview.length-1]}))} fill="none" pointerEvents="none"/>}
    {bisectorPreview&&<g pointerEvents="none"><line data-bisector-preview={p.tool==='bisect'?(bisectorPreview.bounded?'bounded':'ray'):undefined} data-reflection-preview={(p.tool==='reflection'||twoLineReflection)?(bisectorPreview.bounded?'bounded':'ray'):undefined} x1={bisectorPreview.origin[0]} y1={bisectorPreview.origin[1]} x2={bisectorPreview.end[0]} y2={bisectorPreview.end[1]} stroke={REFERENCE_COLOR} strokeWidth={1.8*units} strokeDasharray={`${7*units} ${4*units}`}/>{bisectorPreview.bounded&&<circle data-construction-end="true" cx={bisectorPreview.end[0]} cy={bisectorPreview.end[1]} r={5*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={1.6*units}/>}</g>}
    {!segmentTool&&!regionLasso&&pending.map((q,i)=><g key={i} pointerEvents="none"><circle data-construction-point={i+1} cx={q[0]} cy={q[1]} r={4*units} fill={rayTool&&i===1?REFERENCE_COLOR:'white'} stroke={referencePreview?REFERENCE_COLOR:'#1f6551'} strokeWidth={1.8*units}/>{rayTool&&<text x={q[0]+8*units} y={q[1]-8*units} fontSize={12*units} fill={REFERENCE_COLOR} stroke="#fffefb" strokeWidth={3*units} paintOrder="stroke">{twoLineReflection?['原方向端','交点 · 起点','轴上点'][i]:i===1?(p.tool==='reflection'?'2 · 起点':'2 · 顶点'):p.tool==='reflection'&&i===2?'3 · 轴点':i+1}</text>}</g>)}
    {hover&&p.tool!=='select'&&p.tool!=='pan'&&<g stroke="#1f6551" strokeWidth={units}><path d={`M${hover[0]-6*units} ${hover[1]}h${12*units}M${hover[0]} ${hover[1]-6*units}v${12*units}`}/><circle cx={hover[0]} cy={hover[1]} r={3*units} fill="#fffefb"/></g>}
    {drawingSnapFeedback?.result.relation&&drawingSnapFeedback.anchor&&!p.readOnly&&!panning&&<DiagramLineSnapOverlay snap={drawingSnapFeedback.result.relation} anchor={drawingSnapFeedback.anchor} units={units} showLabel={display.showCursorHint!==false}/>}
    {drawingSnapFeedback&&!hoverTarget&&!p.readOnly&&!panning&&['grid','grid-intersection','segment'].includes(drawingSnapFeedback.result.kind)&&<rect data-crease-snap-target={drawingSnapFeedback.result.kind} x={drawingSnapFeedback.result.point[0]-4*units} y={drawingSnapFeedback.result.point[1]-4*units} width={8*units} height={8*units} fill="none" stroke="#1f6551" strokeWidth={1.3*units} pointerEvents="none">{display.showCursorHint!==false&&<title>{drawingSnapFeedback.result.kind==='grid-intersection'?'纸边 / 折痕与网格交点':drawingSnapFeedback.result.kind==='grid'?'网格点':'在线段上'}</title>}</rect>}
    {hoverTarget&&!p.readOnly&&!panning&&<circle data-snap-target={hoverTarget.kind} cx={hoverTarget.point[0]} cy={hoverTarget.point[1]} r={6*units} fill="none" stroke="#1f6551" strokeWidth={1.3*units} pointerEvents="none"/>}
    {shownFrame&&<g data-operation-frame="true" data-preview={!!framePreview} pointerEvents="none"><rect x={view.x+shownFrame.x*units} y={view.y+shownFrame.y*units} width={shownFrame.width*units} height={shownFrame.height*units} fill={REFERENCE_COLOR} fillOpacity=".04" stroke={REFERENCE_COLOR} strokeWidth={1.5*units} strokeDasharray={`${6*units} ${4*units}`}/>{frameCorners(shownFrame).map((q,i)=><rect key={i} x={view.x+(q[0]-3)*units} y={view.y+(q[1]-3)*units} width={6*units} height={6*units} fill="white" stroke={REFERENCE_COLOR} strokeWidth={units}/>)}</g>}
    {box&&<rect data-gesture-box={gesture.current?.kind==='customcolor'?'customcolor':gesture.current?.kind==='typefilter'?'typefilter':gesture.current?.kind==='unselect'?'unselect':gesture.current?.kind==='erase'?'erase':'select'} data-erase-mode={eraseMode??undefined} data-selection-mode={selectMode??undefined} x={Math.min(box.a[0],box.b[0])} y={Math.min(box.a[1],box.b[1])} width={Math.abs(box.a[0]-box.b[0])} height={Math.abs(box.a[1]-box.b[1])} fill={(gesture.current?.kind==='customcolor'||gesture.current?.kind==='unselect'||gesture.current?.kind==='typefilter')?'#8052ad15':eraseMode?(eraseMode==='touching'?'#a53e3930':'#a53e3920'):'#1f655120'} stroke={(gesture.current?.kind==='customcolor'||gesture.current?.kind==='unselect'||gesture.current?.kind==='typefilter')?REFERENCE_COLOR:eraseMode?'#a53e39':'#1f6551'} strokeWidth={units} strokeDasharray={(eraseMode??selectMode)==='contained'?undefined:`${4*units} ${3*units}`}/>}
    {!p.readOnly&&cursor&&!panning&&(picking.displayPointSpotlight||picking.displayPointOffset)&&<g data-picking-indicator="true" pointerEvents="none" aria-hidden="true" transform={`translate(${view.x+cursor[0]*units} ${view.y+cursor[1]*units})`}>{picking.displayPointSpotlight&&<circle data-picking-radius="true" r={pickRadius} fill="none" stroke="#a17d00" strokeWidth={1.5*units}/>} {picking.displayPointOffset&&<line data-picking-offset="true" x1={0} y1={0} x2={pickRadius} y2={pickRadius} stroke="#424740" strokeWidth={units}/>}</g>}
    {p.diagnosticHighlights&&<g data-diagnostic-highlights="true" pointerEvents="none" stroke={DIAGNOSTIC_HIGHLIGHT_COLOR}>
      {p.doc.segments.filter(s=>p.diagnosticHighlights!.segmentIds.has(s.id)).map(s=><g key={s.id} data-diagnostic-highlight={s.id}>
        <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} strokeWidth={9*units} strokeOpacity=".2"/>
        <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} strokeWidth={3*units} strokeLinecap="round"/>
      </g>)}
      {p.diagnosticHighlights.points.map(([x,y],i)=><circle key={i} data-diagnostic-point="true" cx={x} cy={y} r={7*units} strokeWidth={2*units} fill={DIAGNOSTIC_HIGHLIGHT_COLOR} fillOpacity=".12"/>)}
    </g>}
    {p.svgOverlay&&<g pointerEvents="none">{p.svgOverlay({view,units})}</g>}
    {p.targetPoint&&<CanvasTargetMarker point={p.targetPoint} kind="crease" units={units}/>}
  </svg>{p.overlay}{cursor&&!p.readOnly&&!panning&&display.showCursorHint!==false&&<div className="cursor-tool-hint" data-cursor-tool-hint="true" aria-hidden="true" style={{left:Math.max(8,Math.min(cursor[0]+16,size.w-248)),top:Math.max(82,cursor[1]-14)}}><small>{TOOL_NAMES[p.tool]} · {(circleEraseStep??toolStep).label}</small><span>{(circleEraseStep??toolStep).instruction}</span></div>}<div className="canvas-tag">{panning?'按住滚轮 / 平移画布':p.readOnly?'实时预览':TOOL_NAMES[p.tool]}{!p.readOnly&&p.tool==='line'?' · '+NAMES[drawingAssignment]:''}{twoLineReflection&&reflectionIds.length?` · 已选 ${reflectionIds.length} 条参考线`:pending.length?` · 已选 ${pending.length} 点`:''}{activeVertex?` · 已选交点 (${activeVertex.point.map(n=>Number(n.toFixed(3))).join(', ')})`:''}{hoverTarget&&!panning?` · ${p.tool==='select'?'可选':'吸附'}${hoverTarget.kind==='intersection'?'交点':hoverTarget.kind==='circle'?'圆参考点':hoverTarget.kind==='circle-intersection'?'圆交点':'端点'}`:''}{!outline?' · 边界未闭合或无效，未填充纸面':''}</div><div className="zoom-controls canvas-view-controls">{!input.readOnly&&p.onToolGuideChange&&<label className="canvas-cursor-hint-toggle"><input type="checkbox" checked={display.showToolGuide!==false} onChange={event=>p.onToolGuideChange?.(event.currentTarget.checked)}/><span>帮助提示</span></label>}{!input.readOnly&&p.onCursorHintChange&&<CanvasCursorHintToggle checked={display.showCursorHint!==false} onChange={p.onCursorHintChange}/>}{p.navigationTargetLabel&&<span className="canvas-navigation-target" role="status" title="中键点击折痕图或平折结果，标记后滚轮和缩放按钮作用于该对象；按住中键拖动可平移。">缩放目标：{p.navigationTargetLabel} · 中键标记</span>}<button onClick={()=>p.overlayNavigation?p.overlayNavigation.onZoom(1.25):zoom(1.25)} aria-label={p.overlayNavigation?"缩小平折结果":"缩小画布"}>−</button><button onClick={()=>p.overlayNavigation?p.overlayNavigation.onFit():fit()}>{p.overlayNavigation?"复位平折视图":"适合画布"}</button><button onClick={()=>p.overlayNavigation?p.overlayNavigation.onZoom(.8):zoom(.8)} aria-label={p.overlayNavigation?"放大平折结果":"放大画布"}>＋</button></div></div></div>;
}

