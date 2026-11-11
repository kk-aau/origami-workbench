import DiagramDepthCamera from './DiagramDepthCamera';
import {memo,useEffect,useId,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import type {DiagramSimulationSurface} from '../app/diagramSimulationSurface';
import {renderDiagramSimulationSurface} from '../app/diagramSimulationSurfaceRender';
import type {Point,Doc,Segment} from '../core/types';
import type {DiagramPose,DiagramCanvasSettings,DiagramCPState} from '../app/diagramProject';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramSymbolAnnotation} from '../app/diagramAnnotations';
import {isDiagramSymbolKind,isDiagramCPExistingLine,isDiagramCPLine} from '../app/diagramAnnotations';
import {cadPropertyDefinitions} from '../app/diagramCadSymbols';
import {diagramSymbolInitialSize} from '../app/diagramSymbolCatalog';
import {diagramEqualDivisionLabels,editDiagramEqualDivisionRatio} from '../app/diagramEqualDivision';
import {diagramSymbolTurnAngle,isDiagramRotationSymbol} from '../app/diagramSymbolRotation';
import {diagramAnnotationMarkup,diagramSymbolPreview,LINE_LABELS,symbolNativeGrips,symbolNativeBaseline,moveSymbolNativeGrip,toggleSymbolNativeMirror,orientDiagramRepeatSymbol} from '../app/diagramAnnotationSVG';
import {DIAGRAM_GRIP_STYLES,diagramGripFunction,layoutDiagramSymbolGrips,diagramGripDragPoint} from '../app/diagramSymbolGrips';
import {diagramDrawingFrame,diagramModelMarkup,diagramPoseView,diagramPresentation,diagramFoldPreviewAttributes,diagramFoldPreviewAppearanceSegments,diagramFoldPreviewDrawingOrder,diagramBackgroundLinesForDrawing,diagramAnnotationCreaseVisible,isDiagramBackgroundLine,diagramFaceVisible,drawingSVG,diagramZoomInstructionMarkup} from '../app/diagramDrawing';
import {diagramBoundaryOverlay} from '../app/diagramBoundaryOverlay';
import {diagramLocalSurfaceClips} from '../app/diagramLocalSurface';
import {diagramIllustrationMesh} from '../app/diagramIllustrationMesh';
import {applyDiagramLineAppearance,readDiagramLineDefaults,type DiagramLineDefaults} from '../app/diagramLineStyles';
import {defaultModelView,type ModelViewState,type ModelCameraKey} from '../app/modelViewState';
import {diagramViewportAnnotations,diagramViewportRotatedBounds,normalizeDiagramViewportAngle,rotateDiagramViewportPoint,zoomDiagramViewport} from '../app/diagramViewport';
import {type FoldedVertexSelection} from '../app/foldedVertexEdit';
import {diagramStretchEdges} from '../app/diagramVertexStretch';
import {prepareDiagramPaperAnchors,diagramPaperEditResult,moveDiagramPaperVertices} from '../app/diagramPaperDeformation';
import {followDiagramPaperAnnotations} from '../app/diagramPaperFollow';
import {projectDiagramFoldCP} from '../app/diagramFoldLink';
import {pickTopDiagramAnnotation,diagramPickedSelection,diagramDeleteBoxIds,type DiagramLineFaceSelection,type DiagramAnnotationPick} from '../app/diagramLinePick';
import {diagramTearWindowRender} from '../app/diagramTearWindowRender';
import {diagramRatioPoint,diagramSpecialPoint,diagramAnglePoint} from '../app/diagramPrecisionTools';
import type {DiagramPrecisionSettings} from './DiagramPrecisionToolbar';
import {snapDiagramDrawingLine} from '../app/diagramDrawingSnap';
import {diagramPaperGrid,diagramGridVisible,diagramGridPaths} from '../app/diagramGrid';
import {readGridAppearance} from '../app/gridAppearance';
import {buildDiagramSnapReferences} from '../app/diagramSnapReferences';
import {stationaryDiagramSnapReferences,diagramPreviewSourceIds,diagramSourcesOnlyMoving} from '../app/diagramStationarySnapReferences';
import type {DiagramLineSnapResult} from '../app/diagramLineSnap';
import DiagramLineSnapOverlay from './DiagramLineSnapOverlay';
import CanvasCursorHintToggle from './CanvasCursorHintToggle';
import {isDiagramImageAnnotationVisible,type DiagramImage} from '../app/diagramImages';
import DiagramImageLayer from './DiagramImageLayer';
import {diagramNearbyLineIntersections,pickDiagramAnnotation,diagramAnnotationsInBox,diagramEraseHits,
  constructDiagramLine,bisectDiagramLines,trimDiagramLine,extendDiagramLine,intersectDiagramLines,
  transformDiagramAnnotations,diagramVisibleRect,snapDiagramTranslation,diagramMoveSnapTargets,snapDiagramSymbolPoint,pointHitsDiagramAnnotation} from '../app/diagramDrawingTools';
import FoldedVertexOverlay from './FoldedVertexOverlay';
import DiagramCreaseToolbar from './DiagramCreaseToolbar';
import DiagramCalloutLayer from './DiagramCalloutLayer';
import {diagramCalloutSourceMarkup} from '../app/diagramCalloutSVG';
import type {DiagramCallout} from '../app/diagramCallouts';
import {diagramZoomRegionBounds,diagramZoomRegionPath,prepareDiagramZoomRegionContains,type DiagramZoomRegion} from '../app/diagramZoomGeometry';
import {diagramZoomPaperBounds} from '../app/diagramStepZoom';
import {prepareDiagramZoomInteraction} from '../app/diagramZoomInteraction';
import {CALLOUT_MIME,isDiagramCalloutSymbolType} from '../app/diagramCalloutSymbols';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
import type {AdaptiveLineSpan} from '../app/adaptiveLineStyle';
import './DiagramDrawingGesture.css';
import './DiagramCPHighlight.css';

export type DiagramDrawingTool='select'|'vertex'|'line'|'symbol'|'pan'|'erase'|'polyline'|'perpendicular'|'parallel'|'bisector'|'trim'|'extend'|'fixed'|'layer'|'ratio-point'|'special-point'|'mirror-copy';
export interface DiagramFoldLinkPreviewSegment {
  id:string;a:Point;b:Point;style:DiagramLineAnnotation['style'];face:number;
  visibility:'visible'|'hidden'|'unknown';
  existing?:boolean;
  unfolding?:boolean;
  strokeSpan?:AdaptiveLineSpan;
}
const EMPTY_FOLD_PREVIEW:DiagramFoldLinkPreviewSegment[]=[];
const EMPTY_IMAGES:DiagramImage[]=[];
const EMPTY_CALLOUTS:DiagramCallout[]=[];
const emptyCPMarkup=()=>'';
export interface DiagramCPHighlight {
  /** Coordinates already use this pose's presented paper/view coordinates. */
  polygons:Point[][];polygonFaces?:number[];points:Point[];faces:number[];label?:string;
  segments?:{a:Point;b:Point;face:number}[];
}
export const SYMBOL_MIME='application/x-zhezhi-diagram-symbol';
const cameraKey=(view:ModelViewState):ModelCameraKey=>`${view.side}-${view.xray?'transparent':'solid'}`;
type Frame=ReturnType<typeof diagramDrawingFrame>;
type Handle='move'|'a'|'b'|'native';
type Drag=
  |{kind:'pan';id:number;start:Point;inverse:DOMMatrix;view:ModelViewState;rect:Frame;button:number}
  |{kind:'object';id:number;start:Point;client:Point;annotation:DiagramAnnotation;handle:Handle;gripId?:string;gripAnchor?:Point;moveGrip?:boolean;clickOnly?:boolean;moved?:boolean;ids:string[];source:DiagramAnnotation[];snapTargets:Point[];snapLines:DiagramLineAnnotation[];moveAnchor:Point}
  |{kind:'box';id:number;start:Point;end:Point;client:Point;ids:string[];shift:boolean}
  |{kind:'delete-box';id:number;start:Point;end:Point;client:Point;source:DiagramAnnotation[]}
  |{kind:'erase';id:number;previous:Point;ids:Set<string>;source:DiagramAnnotation[]};
const dist=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

/** Like the crease editor's retained scene, panning does not rebuild ink.
 * Zoom still updates screen-dependent dash spacing and hit widths exactly. */
const DiagramFoldPreviewLayer=memo(function DiagramFoldPreviewLayer({segments,units,adaptiveLines,clips,tearWindows,showCursorHint}:{
  segments:readonly {segment:DiagramFoldLinkPreviewSegment;paint:ReturnType<typeof diagramFoldPreviewAttributes>}[];
  units:number;adaptiveLines:boolean;clips:ReturnType<typeof diagramLocalSurfaceClips>;
  tearWindows:ReturnType<typeof diagramTearWindowRender>;showCursorHint:boolean;
}){
  return <g data-diagram-fold-link-preview="true" pointerEvents="none">{segments.map(({segment,paint})=>{
    const quiet=segment.existing&&!segment.unfolding;
    const markup=diagramAnnotationMarkup({id:segment.id,kind:'line',a:segment.a,b:segment.b,style:segment.style,color:paint.color,strokePattern:paint.strokePattern,width:adaptiveLines?paint.width:Math.max(paint.width,units*(quiet?.8:1.25))},{enabled:adaptiveLines,units,minimumWidth:units*(quiet?.8:1.25),span:segment.strokeSpan});
    return <g key={segment.id} clipPath={clips?.clipForFace(segment.face)} mask={tearWindows.maskForFaces([segment.face])} data-diagram-fold-link-segment={segment.id} data-fold-link-face={segment.face} data-fold-link-visibility={segment.visibility} data-fold-link-style={segment.style} data-fold-link-existing={segment.existing?true:undefined} data-fold-link-unfolding={segment.unfolding?true:undefined} opacity={paint.opacity}>
      <g dangerouslySetInnerHTML={{__html:markup}}/>
      <line data-diagram-linked-line-hit x1={segment.a[0]} y1={segment.a[1]} x2={segment.b[0]} y2={segment.b[1]} stroke="transparent" strokeWidth={Math.max(units*7,paint.width)} pointerEvents="stroke">{showCursorHint&&<title>{`${segment.unfolding?'展开 · ':''}${LINE_LABELS[segment.style]} · 放大可查看线型细节`}</title>}</line>
    </g>;
  })}</g>;
});

export default function DiagramDrawingCanvas({depthPreview,depthCameraVisible=false,onDepthPreview,onDepthCommit,onDepthViewport,adaptiveLineStyle,showCursorHint=true,onCursorHintChange,pose,simulationSurface,zoomRegion,zoomSelectionRegion,lineDefaults=readDiagramLineDefaults(),callouts=EMPTY_CALLOUTS,selectedCalloutId,onSelectCallout,onCalloutsChange,onCreateCallout,calloutCPMarkup=emptyCPMarkup,gridPaper,annotations,images=EMPTY_IMAGES,paperVisible=true,onImagesChange,selectedImageId,onSelectImage,fitToken=0,canvas,tool,lineStyle,foldAction='fold',foldAngle=180,symbol,color,width,strokePattern,selection,onSelect,onMove,onViewChange,onDrawingRotationChange,orientationLocked=false,onAnnotationsChange,selectedIds,selectedLineFaces={},onSelectedIds,onClearSelection,onDeleteInBox,commandToken=0,mirrorSource=[],onMirrorCopy,onCancelMirrorCopy,onSymbolPlaced,onCancelSymbolPlacement,disabled,active,paperLocked=false,precision={ratioA:1,ratioB:1,expression:'√2-1'},onPrecisionPoint,showSymbolBaseline=false,foldLinkEnabled=false,foldLinkPreview=EMPTY_FOLD_PREVIEW,foldLinkCP,foldLinkFixed,selectedFoldFaces=[],onPickFixed,onPickLayerPoint,cpHighlight,cpSelectedHighlight,cpFixedHighlight,onHoverPaper,creaseActions,creaseActionPoints}:{
  pose:DiagramPose|null;simulationSurface?:DiagramSimulationSurface;zoomRegion?:DiagramZoomRegion|null;zoomSelectionRegion?:DiagramZoomRegion|null;callouts?:DiagramCallout[];selectedCalloutId?:string;onSelectCallout?:(id:string|null)=>void;onCalloutsChange?:(callouts:DiagramCallout[])=>void;onCreateCallout?:(type:'paper'|'cp',point:Point)=>void;calloutCPMarkup?:(stateId:string,sourceUnits?:number,hideExistingCreases?:boolean)=>string;annotations:DiagramAnnotation[];canvas:DiagramCanvasSettings;tool:DiagramDrawingTool;
  depthPreview?:import('../app/diagramDepth').DiagramDepth;depthCameraVisible?:boolean;onDepthPreview?:(depth:import('../app/diagramDepth').DiagramDepth|null)=>void;onDepthCommit?:(depth:import('../app/diagramDepth').DiagramDepth)=>void;onDepthViewport?:(cameras:ModelViewState['cameras'])=>void;
  gridPaper?:Doc;
  images?:DiagramImage[];paperVisible?:boolean;onImagesChange?:(images:DiagramImage[])=>void;selectedImageId?:string;onSelectImage?:(id:string|null)=>void;
  fitToken?:number;
  adaptiveLineStyle?:boolean;showCursorHint?:boolean;onCursorHintChange?:(enabled:boolean)=>void;
  paperLocked?:boolean;
  commandToken?:number;
  precision?:DiagramPrecisionSettings;onPrecisionPoint?:(point:Point)=>boolean;
  strokePattern?:DiagramLineAnnotation['strokePattern'];lineStyle:DiagramLineAnnotation['style'];symbol:DiagramSymbolAnnotation['symbol'];color:string;width:number;lineDefaults?:DiagramLineDefaults;
  foldAction?:DiagramLineAnnotation['foldAction'];
  foldAngle?:number;
  selection:FoldedVertexSelection;onSelect:(selection:FoldedVertexSelection)=>void;onMove:(selection:FoldedVertexSelection,destination:Point,view?:ModelViewState,editPose?:DiagramPose)=>void;
  onViewChange:(view:ModelViewState)=>void;onAnnotationsChange:(annotations:DiagramAnnotation[])=>void;
  onDrawingRotationChange:(angle:number)=>void;orientationLocked?:boolean;
  onDeleteInBox?:(ids:string[])=>void;
  mirrorSource?:DiagramAnnotation[];onMirrorCopy?:(axisStart:Point,axisEnd:Point)=>boolean;onCancelMirrorCopy?:()=>void;
  selectedIds:string[];selectedLineFaces?:DiagramLineFaceSelection;onSelectedIds:(ids:string[],lineFaces?:DiagramLineFaceSelection)=>void;onClearSelection:()=>void;onSymbolPlaced:()=>void;onCancelSymbolPlacement:()=>void;disabled:boolean;active:boolean;showSymbolBaseline?:boolean;
  foldLinkEnabled?:boolean;foldLinkPreview?:DiagramFoldLinkPreviewSegment[];foldLinkFixed?:Point;selectedFoldFaces?:number[];
  foldLinkCP?:{before:DiagramCPState;after:Doc;precreases?:Segment[]};
  onPickFixed?:(point:Point)=>void;onPickLayerPoint?:(point:Point)=>void;
  cpHighlight?:DiagramCPHighlight;cpSelectedHighlight?:DiagramCPHighlight;cpFixedHighlight?:DiagramCPHighlight;
  onHoverPaper?:(point:Point|null)=>void;
  creaseActions?:ReactNode;creaseActionPoints?:Point[];
}) {
  const editLocked=paperVisible&&paperLocked;
  const surfaceMarkup=useMemo(()=>simulationSurface&&paperVisible?renderDiagramSimulationSurface(simulationSurface).markup:'',[simulationSurface,paperVisible]);
  const [globalAdaptiveLines]=useAdaptiveLineStyle(),adaptiveLines=adaptiveLineStyle??globalAdaptiveLines;
  const [blankView,setBlankView]=useState(defaultModelView),[draftView,setDraftView]=useState<ModelViewState|null>(null);
  const queuedView=useRef<ModelViewState|null>(null),viewFrame=useRef(0);
  const wheelView=useRef<ModelViewState|null>(null),wheelTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [gridAppearance]=useState(readGridAppearance);
  const viewportAngle=normalizeDiagramViewportAngle(canvas.drawingRotation??0);
  const zoomStateKey=JSON.stringify(zoomRegion??null),zoomClipId='diagram-focus-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),paperClip=zoomRegion?`url(#${zoomClipId})`:undefined;
  const [focusCamera,setFocusCamera]=useState<{key:string;cameras:ModelViewState['cameras']}|null>(null);
  const normalView=useMemo(()=>pose?diagramPoseView(pose):blankView,[pose,blankView]);
  const saved=zoomRegion?{...normalView,cameras:focusCamera?.key===zoomStateKey?focusCamera.cameras:{}}:normalView,view=queuedView.current??draftView??saved;
  // Panning and zooming only change the SVG viewport. Keep geometry and paper
  // artwork stable until an actual presentation setting or drawing changes.
  const baseDrawingView=useMemo(()=>({...view,cameras:{}}),[view.depth,view.side,view.rotation,view.projectionCenter,view.showExistingCreases,view.xray,view.colors,view.shadows,view.antiAlias,view.displayNumbers,view.layout,view.displayStyle,view.board]);
  const drawingView=useMemo(()=>depthPreview?{...baseDrawingView,depth:depthPreview}:baseDrawingView,[baseDrawingView,depthPreview]);
  const inZoom=useMemo(()=>zoomRegion?prepareDiagramZoomRegionContains(zoomRegion):(_point:Point)=>true,[zoomStateKey]);
  const paintAnnotation=(a:DiagramAnnotation)=>a.kind==='line'?applyDiagramLineAppearance(a,lineDefaults):a;
  const frame=useMemo(()=>diagramDrawingFrame(pose,annotations.map(a=>a.kind==='line'?applyDiagramLineAppearance(a,lineDefaults):a),baseDrawingView,images,paperVisible,callouts,zoomRegion,simulationSurface),[pose,annotations,lineDefaults,baseDrawingView,images,paperVisible,callouts,zoomStateKey,simulationSurface]);
  const fitFrame=useMemo(()=>diagramViewportRotatedBounds(frame,viewportAngle),[frame,viewportAngle]),rect=view.cameras[cameraKey(view)]??fitFrame;
  const svg=useRef<SVGSVGElement>(null),scene=useRef<SVGGElement>(null),drag=useRef<Drag|null>(null),line=useRef<{a:Point;pointer:number|null;client:Point}|null>(null);
  const [size,setSize]=useState({width:600,height:500}),visible=diagramVisibleRect(rect,size),units=visible.width/Math.max(1,size.width),radius=units*4.4;
  useEffect(()=>{if(depthPreview&&onDepthViewport)onDepthViewport({...view.cameras,[cameraKey(view)]:{...rect,rotation:view.rotation}});},[depthPreview,onDepthViewport,rect,view.side,view.rotation]);
  const zoomInteraction=useMemo(()=>zoomRegion?prepareDiagramZoomInteraction(zoomRegion,units*.25):null,[zoomStateKey,units]);
  const lineDisplay={enabled:adaptiveLines,units};
  const paperGrid=useMemo(()=>diagramPaperGrid(canvas,pose?.sourceDoc??gridPaper),[canvas,pose?.sourceDoc,gridPaper]);
  const snapGrid=canvas.grid&&diagramGridVisible(paperGrid,units,gridAppearance.minGridPixelSize)?paperGrid:undefined;
  const viewportCenter:Point=[visible.x+visible.width/2,visible.y+visible.height/2],gridRect=diagramViewportRotatedBounds(visible,-viewportAngle);
  const rectRef=useRef(rect);rectRef.current=rect;const viewRef=useRef(view);viewRef.current=view;
  const annotationsRef=useRef(annotations);annotationsRef.current=annotations;
  const imageCallbacks=useRef({images,selectedImageId,onImagesChange,onSelectImage});imageCallbacks.current={images,selectedImageId,onImagesChange,onSelectImage};
  const callbacks=useRef({onSelectedIds,onClearSelection,onSelect,onAnnotationsChange,onViewChange,onDeleteInBox,onMirrorCopy,onCancelMirrorCopy,onSymbolPlaced,onCancelSymbolPlacement,onPickFixed,onPickLayerPoint});callbacks.current={onSelectedIds,onClearSelection,onSelect,onAnnotationsChange,onViewChange,onDeleteInBox,onMirrorCopy,onCancelMirrorCopy,onSymbolPlaced,onCancelSymbolPlacement,onPickFixed,onPickLayerPoint};
  const [lineDraft,setLineDraft]=useState<DiagramLineAnnotation|null>(null),[objectDraft,setObjectDraft]=useState<DiagramAnnotation[]|null>(null),[box,setBox]=useState<{a:Point;b:Point;deleting?:boolean}|null>(null);
  const [lineSnap,setLineSnap]=useState<DiagramLineSnapResult|null>(null);
  const drawingPointer=useRef<{point:Point;shiftKey:boolean;altKey:boolean}|null>(null);
  const [hint,setHint]=useState<{point:Point;dragging:boolean}|null>(null),[dropOver,setDropOver]=useState(false),[constructionIds,setConstructionIds]=useState<string[]>([]),[notice,setNotice]=useState(''),[hover,setHover]=useState<Point|null>(null);
  const [gestureCursor,setGestureCursor]=useState<'grabbing'|null>(null),[imageGestureMoving,setImageGestureMoving]=useState(false);
  const [turnEditor,setTurnEditor]=useState<{id:string;value:string}|null>(null),turnEditorRef=useRef<typeof turnEditor>(null);
  const [divisionEditor,setDivisionEditor]=useState<{id:string;key:string;label:string;value:string;point:Point}|null>(null),divisionEditorRef=useRef<typeof divisionEditor>(null);
  function editDivisionNumber(annotation:DiagramAnnotation,key?:string,pointer?:Point):boolean{
    if(disabled||!active||tool!=='select'||annotation.kind!=='symbol'||annotation.symbol!=='equalDivision')return false;
    const labels=diagramEqualDivisionLabels(annotation),label=key?labels.find(label=>label.key===key):pointer?labels.filter(label=>dist(label.point,pointer)<=units*22).sort((a,b)=>dist(a.point,pointer)-dist(b.point,pointer))[0]:undefined;
    if(!label)return false;
    clearGesture();const editor={id:annotation.id,key:label.key,label:label.label,value:label.text,point:label.point};divisionEditorRef.current=editor;setDivisionEditor(editor);callbacks.current.onSelectedIds([annotation.id]);return true;
  }
  function finishDivisionNumber(commit:boolean){
    const editor=divisionEditorRef.current;if(!editor)return;
    divisionEditorRef.current=null;setDivisionEditor(null);
    if(!commit)return;
    const annotation=annotationsRef.current.find(annotation=>annotation.id===editor.id);
    if(annotation?.kind!=='symbol')return;
    try{const next=editDiagramEqualDivisionRatio(annotation,editor.key,editor.value);callbacks.current.onAnnotationsChange(annotationsRef.current.map(annotation=>annotation.id===next.id?next:annotation));}
    catch(error){setNotice(error instanceof Error?error.message:String(error));}
  }
  function editTurnAngle(annotation:DiagramAnnotation){
    if(disabled||!active||tool!=='select'||annotation.kind!=='symbol'||!isDiagramRotationSymbol(annotation.symbol))return;
    clearGesture();const next={id:annotation.id,value:String(diagramSymbolTurnAngle(annotation))};turnEditorRef.current=next;setTurnEditor(next);callbacks.current.onSelectedIds([annotation.id]);
  }
  function finishTurnAngle(commit:boolean){
    const editor=turnEditorRef.current;if(!editor)return;
    turnEditorRef.current=null;setTurnEditor(null);
    if(!commit)return;
    const angle=Number(editor.value);
    if(!editor.value.trim()||!Number.isFinite(angle)||angle<0||angle>360){setNotice('旋转角度须为 0～360°，原角度未修改。');return;}
    callbacks.current.onAnnotationsChange(annotationsRef.current.map(a=>a.id===editor.id&&a.kind==='symbol'&&isDiagramRotationSymbol(a.symbol)?{...a,turnAngle:angle}:a));
  }
  const gestureMoving=imageGestureMoving||gestureCursor==='grabbing'||hint?.dragging===true||!!draftView;
  useEffect(()=>{
    if(!active||disabled||!gestureMoving)return;
    const documentRoot=document.documentElement;
    documentRoot.setAttribute('data-diagram-pointer-gesture','move');
    return()=>{documentRoot.removeAttribute('data-diagram-pointer-gesture');};
  },[active,disabled,gestureMoving]);
  const [precisionAnchor,setPrecisionAnchor]=useState<Point|null>(null);
  const [mirrorAxis,setMirrorAxis]=useState<{a:Point;b:Point|null}|null>(null),[mirrorPointer,setMirrorPointer]=useState<Point|null>(null);
  const [stretchSegments,setStretchSegments]=useState(false);
  const [stretchReset,setStretchReset]=useState(0);
  const [vertexDraft,setVertexDraft]=useState<{selection:FoldedVertexSelection;destination:Point}|null>(null);
  const vertexPreparation=useMemo(()=>{
    if(!pose||tool!=='vertex')return {pose,error:''};
    try{
      const endpoints=foldLinkEnabled?foldLinkPreview.flatMap(part=>[part.a,part.b].map(point=>({point,faces:[part.face]}))):annotations.flatMap(annotation=>annotation.kind==='line'&&annotation.foldFaces?.length?[{point:annotation.a,faces:annotation.foldFaces},{point:annotation.b,faces:annotation.foldFaces}]:[]);
      return {pose:prepareDiagramPaperAnchors(pose,endpoints),error:''};
    }catch(error){return {pose,error:error instanceof Error?error.message:String(error)};}
  },[pose,tool,foldLinkEnabled,foldLinkPreview,annotations]);
  const vertexPose=vertexPreparation.pose,vertexResult=useMemo(()=>vertexPose?diagramPaperEditResult(vertexPose):null,[vertexPose]);
  useEffect(()=>{if(vertexPreparation.error)setNotice(vertexPreparation.error);},[vertexPreparation.error]);
  const stretchEdges=useMemo(()=>{
    if(tool!=='vertex'||!stretchSegments||!vertexPose)return undefined;
    const creases=foldLinkEnabled?foldLinkPreview:annotations.flatMap(a=>a.kind==='line'&&a.foldFaces?.length?a.foldFaces.map(face=>({a:a.a,b:a.b,face})):[]);
    return diagramStretchEdges(vertexPose,creases);
  },[tool,stretchSegments,vertexPose,foldLinkEnabled,foldLinkPreview,annotations]);
  const livePose=useMemo(()=>depthPreview&&pose?{...pose,view:drawingView}:vertexPose&&vertexDraft?moveDiagramPaperVertices(vertexPose,vertexDraft.selection,vertexDraft.destination):pose,[pose,vertexPose,vertexDraft,depthPreview,drawingView]);
  const liveAnnotations=useMemo(()=>{if(depthPreview&&pose&&livePose){try{return followDiagramPaperAnnotations(pose,livePose,annotations,true);}catch{return annotations;}}if(!vertexPose||!livePose||!vertexDraft)return annotations;try{return followDiagramPaperAnnotations(vertexPose,livePose,annotations.filter(a=>!foldLinkEnabled||!isDiagramCPLine(a)&&(a.kind!=='line'||!['valley','mountain'].includes(a.style)||a.foldFaces?.length===0)));}catch{return annotations;}},[vertexPose,livePose,vertexDraft,annotations,foldLinkEnabled,depthPreview,pose]);
  const liveFoldPreview=useMemo(()=>{
    if((!vertexDraft&&!depthPreview)||!livePose||!foldLinkEnabled||!foldLinkCP)return foldLinkPreview;
    try{return projectDiagramFoldCP(livePose,foldLinkCP.before.doc,foldLinkCP.after,foldLinkCP.before,foldLinkCP.precreases).preview.map((part,index)=>({id:'fold-preview-'+index,a:part.a,b:part.b,face:part.face,visibility:part.visibility,existing:part.existing,unfolding:part.unfolding,strokeSpan:part.strokeSpan,style:part.style??(part.assignment==='V'?'valley':part.assignment==='M'?'mountain':part.assignment==='F'?'crease':'auxiliary')}));}
    catch{return [];}
  },[vertexDraft,livePose,foldLinkEnabled,foldLinkCP,foldLinkPreview,depthPreview]);
  const calloutPaperMarkup=useMemo(()=>{
    if(!callouts.some(callout=>callout.source.kind==='paper'))return '';
    const preview=foldLinkEnabled?liveFoldPreview.map(part=>({...part,assignment:part.style==='valley'?'V' as const:part.style==='mountain'?'M' as const:part.style==='crease'?'F' as const:'U' as const})):undefined;
    return (_callout:DiagramCallout,sourceUnits:number)=>diagramCalloutSourceMarkup(drawingSVG(livePose,liveAnnotations,'','',preview,images,paperVisible,lineDefaults,[],undefined,{enabled:adaptiveLines,units:sourceUnits},undefined,0,simulationSurface));
  },[callouts,livePose,liveAnnotations,foldLinkEnabled,liveFoldPreview,images,paperVisible,lineDefaults,adaptiveLines,simulationSurface]);
  const lastPointer=useRef<{client:Point;shiftKey:boolean;altKey:boolean}|null>(null),nativePaletteDrag=useRef(false);
  const [symbolPointer,setSymbolPointer]=useState<{client:Point;point:Point|null}|null>(null);
  const symbolThumbnail=useMemo(()=>diagramSymbolPreview(symbol),[symbol]);
  const constructionRef=useRef<string[]>([]);constructionRef.current=constructionIds;
  const items=objectDraft??liveAnnotations,chosen=items.filter(a=>selectedIds.includes(a.id)&&(!editLocked||a.kind==='symbol'));
  const paperMarkup=useMemo(()=>paperVisible&&livePose?diagramModelMarkup(livePose,drawingView,foldLinkEnabled,items,lineDefaults):'',[livePose,drawingView,foldLinkEnabled,items,lineDefaults,paperVisible]);
  const tearWindows=useMemo(()=>diagramTearWindowRender(paperVisible?livePose:null,items,drawingView),[livePose,items,drawingView,paperVisible]);
  const localFoldClips=useMemo(()=>paperVisible&&livePose&&!tearWindows.definitions?diagramLocalSurfaceClips(livePose,drawingView):null,[livePose,drawingView,paperVisible,tearWindows]);
  const zoomInstructions=useMemo(()=>diagramZoomInstructionMarkup(items,diagramZoomPaperBounds(livePose,images,paperVisible,gridPaper?.paper,simulationSurface)),[items,livePose,images,paperVisible,gridPaper?.paper,simulationSurface]);
  const paperAnnotationVisible=(a:DiagramAnnotation)=>{
    if(!diagramAnnotationCreaseVisible(a,drawingView))return false;
    if(!paperVisible)return isDiagramImageAnnotationVisible(a);
    return !pose||a.kind==='symbol'||!a.foldFaces?.length||a.foldFaces.some(face=>diagramFaceVisible(pose,face));
  };
  const selectedFaceLabel=(id:string)=>Object.hasOwn(selectedLineFaces,id)?selectedLineFaces[id].join(','):undefined;
  const creaseToolbarPoints=useMemo(()=>{
    const selected=items.filter((item):item is DiagramLineAnnotation=>item.kind==='line'&&selectedIds.includes(item.id)&&paperAnnotationVisible(item));
    return selected.length?selected.flatMap(item=>[item.a,item.b]):creaseActionPoints??[];
  },[items,selectedIds,creaseActionPoints,pose?.hiddenFaces,paperVisible]);
  const visibleVertices=useMemo(()=>{const shown=vertexPose?diagramPresentation(vertexPose,view).vertices:[],allowed=vertexPose?.hiddenFaces?.length?[...new Set(diagramIllustrationMesh(vertexPose).triangles.flatMap((row,face)=>diagramFaceVisible(vertexPose,face)?row.flat():[]))]:undefined;return zoomRegion?(allowed??shown.map((_,index)=>index)).filter(index=>shown[index]&&inZoom(shown[index])):allowed;},[vertexPose,view.side,view.rotation,view.projectionCenter,zoomStateKey]);
  const vertexOrder=useMemo(()=>{
    if(!vertexPose||!vertexResult)return undefined;
    const mesh=diagramIllustrationMesh(vertexPose),ranks=new Map<number,number>();
    diagramPresentation(vertexPose,view).visibleOrder.forEach((face,rank)=>mesh.triangles[face].flat().forEach(vertex=>ranks.set(vertex,rank)));
    return vertexResult.geometry.vertices.map((_,index)=>index).sort((a,b)=>(ranks.get(a)??-1)-(ranks.get(b)??-1)||a-b);
  },[vertexPose,vertexResult,view.side,view.rotation,view.projectionCenter]);
  const visibleVertexSet=useMemo(()=>visibleVertices?new Set(visibleVertices):null,[visibleVertices]);
  const backgroundLines=useMemo(()=>paperVisible?diagramBackgroundLinesForDrawing(livePose,items,foldLinkEnabled,drawingView):[],[foldLinkEnabled,livePose,items,drawingView,paperVisible]);
  const movingLine=objectDraft&&drag.current?.kind==='object'&&drag.current.annotation.kind==='line'?drag.current:null;
  const paintedFoldPreview=useMemo(()=>movingLine?liveFoldPreview.filter(segment=>!diagramSourcesOnlyMoving(diagramPreviewSourceIds(segment,movingLine.source),movingLine.ids)):liveFoldPreview,[liveFoldPreview,movingLine]);
  const boundaryOverlay=useMemo(()=>paperVisible&&livePose&&!tearWindows.definitions&&(items.some(a=>a.kind==='line')||paintedFoldPreview.length)?diagramBoundaryOverlay(livePose,drawingView,lineDefaults,foldLinkEnabled):'',[paperVisible,livePose,tearWindows.definitions,items,paintedFoldPreview,drawingView,lineDefaults,foldLinkEnabled]);
  const styledFoldPreview=useMemo(()=>diagramFoldPreviewDrawingOrder(diagramFoldPreviewAppearanceSegments(paintedFoldPreview,items),{showExistingCreases:drawingView.showExistingCreases,xray:drawingView.xray,cutaway:!!tearWindows.definitions,clipped:!!localFoldClips}).filter(segment=>!livePose||diagramFaceVisible(livePose,segment.face)).map(segment=>{
    const assignment=segment.style==='valley'?'V':segment.style==='mountain'?'M':segment.style==='crease'?'F':'U';
    return {segment,paint:diagramFoldPreviewAttributes({...segment,assignment},items,drawingView.colors?.line??color,lineDefaults)};
  }),[paintedFoldPreview,items,livePose,drawingView.colors?.line,drawingView.showExistingCreases,drawingView.xray,tearWindows.definitions,localFoldClips,color,lineDefaults]);
  const lines=useMemo(()=>annotations.filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&paperAnnotationVisible(a)),[annotations,pose?.hiddenFaces,paperVisible,drawingView.showExistingCreases]);
  const presentation=useMemo(()=>livePose?diagramPresentation(livePose,drawingView):null,[livePose,drawingView]);
  const references=useMemo(()=>{const source=buildDiagramSnapReferences({pose:paperVisible?livePose:null,view:drawingView,annotations:liveAnnotations.filter(paperAnnotationVisible),foldLinkEnabled:paperVisible&&foldLinkEnabled,foldLinkPreview:paperVisible?liveFoldPreview:[]});return zoomInteraction?zoomInteraction.clipped(source) as DiagramLineAnnotation[]:source;},[livePose,drawingView,liveAnnotations,foldLinkEnabled,liveFoldPreview,paperVisible,zoomInteraction]);
  const intersections=useMemo(()=>hover?diagramNearbyLineIntersections(hover,references,radius*2.3).filter(inZoom):[],[hover,references,radius,zoomStateKey]);
  const snapTargets=useMemo(()=>[...references.flatMap(reference=>[reference.a,reference.b]),...(!editLocked?canvas.constructionPoints??[]:[])].filter(inZoom),[references,canvas.constructionPoints,editLocked,zoomStateKey]);
  const drawingReferences=references,drawingTargets=snapTargets;
  const hoveredPoint=useMemo(()=>{
    if(!hover||!active||disabled||vertexDraft||drag.current||!canvas.snap||lastPointer.current?.altKey)return null;
    if(tool==='line'||tool==='polyline')return resolveDrawingLine(hover,drawingPointer.current??lastPointer.current??{shiftKey:false,altKey:false},line.current?.a).target??null;
    const candidates=[...references.flatMap(reference=>[reference.a,reference.b].map(point=>({point,kind:'point',label:'端点 / 纸角'}))),...intersections.map(point=>({point,kind:'intersection',label:'交点'})),...(!editLocked?canvas.constructionPoints??[]:[]).map(point=>({point,kind:'construction',label:'定位点'}))];
    const closest=candidates.filter(candidate=>inZoom(candidate.point)).map(candidate=>({...candidate,distance:dist(candidate.point,hover)})).filter(candidate=>candidate.distance<=radius*2.3).sort((a,b)=>a.distance-b.distance)[0];
    if(tool==='vertex'&&closest&&(presentation?.vertices??[]).some(p=>dist(p,closest.point)<1e-8))return null;
    return closest??null;
  },[hover,active,disabled,vertexDraft,presentation,references,intersections,editLocked,canvas,snapGrid,units,tool,gestureCursor,lineDraft]);
  const precisionPreview=useMemo(()=>{
    if(!precisionAnchor||!hover)return null;
    try{const endpoint=snap(hover,lastPointer.current??{shiftKey:false,altKey:false});return {endpoint,point:tool==='ratio-point'?diagramRatioPoint(precisionAnchor,endpoint,precision.ratioA,precision.ratioB):diagramSpecialPoint(precisionAnchor,endpoint,precision.expression)};}catch{return null;}
  },[precisionAnchor,hover,tool,precision,canvas,snapTargets,snapGrid,radius]);
  const mirrorPreview=useMemo(()=>{
    const endpoint=mirrorAxis?.b??mirrorPointer;
    if(tool!=='mirror-copy'||!mirrorAxis||!endpoint||dist(mirrorAxis.a,endpoint)<1e-8)return {annotations:[] as DiagramAnnotation[],error:''};
    try{return {annotations:transformDiagramAnnotations(mirrorSource,mirrorSource.map(annotation=>annotation.id),{kind:'mirrorLine',a:mirrorAxis.a,b:endpoint}),error:''};}
    catch(error){return {annotations:[] as DiagramAnnotation[],error:error instanceof Error?error.message:'无法预览镜像复制'};}
  },[tool,mirrorAxis,mirrorPointer,mirrorSource]);
  const grid=useMemo(()=>snapGrid?diagramGridPaths(gridRect,snapGrid):null,[gridRect.x,gridRect.y,gridRect.width,gridRect.height,snapGrid]);
  function cpHighlightMarkup(value:DiagramCPHighlight|undefined,state:'hovered'|'selected'|'fixed'){
    if(value&&pose){
      const faces=value.faces.filter(face=>diagramFaceVisible(pose,face));if(!faces.length)return null;
      const original=value,indices=original.polygons.flatMap((_,i)=>diagramFaceVisible(pose,original.polygonFaces?.[i]??original.faces[i]??original.faces[0])?[i]:[]);
      value={...original,faces,polygons:indices.map(i=>original.polygons[i]),polygonFaces:indices.map(i=>original.polygonFaces?.[i]??original.faces[i]??original.faces[0]),segments:original.segments?.filter(s=>diagramFaceVisible(pose,s.face))};
    }
    if(!value||(!value.polygons.length&&!value.points.length&&!value.segments?.length))return null;
    const anchor=value.points[0]??value.segments?.[0]?.a??value.polygons[0]?.[0];
    const polygons=value.segments?.length?[]:value.polygons;
    const boundaries=new Map<string,{a:Point;b:Point;face:number}>();
    polygons.forEach((polygon,index)=>{const face=value.polygonFaces?.[index]??value.faces[index]??value.faces[0];polygon.forEach((a,k)=>{const b=polygon[(k+1)%polygon.length],keys=[a,b].map(p=>p.map(n=>Math.round(n*1e7)/1e7).join(',')).sort(),key=face+'|'+keys.join('|');if(boundaries.has(key))boundaries.delete(key);else boundaries.set(key,{a,b,face});});});
    return <g className="diagram-cp-highlight" data-diagram-cp-highlight={state} data-cp-highlight-faces={value.faces.join(',')} pointerEvents="none" aria-hidden="true">
      {polygons.map((polygon,index)=><path key={'face-'+index} mask={tearWindows.maskForFaces([value.polygonFaces?.[index]??value.faces[index]??value.faces[0]])} data-cp-highlight-face={value.polygonFaces?.[index]??value.faces[index]} d={polygon.map((p,i)=>`${i?'L':'M'}${p.join(' ')}`).join(' ')+'Z'} className="diagram-cp-highlight-face" style={{stroke:'none'}} fillRule="evenodd" vectorEffect="non-scaling-stroke"/>)}
      {[...boundaries.values()].map(({a,b,face},index)=><path key={'boundary-'+index} mask={tearWindows.maskForFaces([face])} data-cp-highlight-boundary={face} d={`M${a.join(' ')}L${b.join(' ')}`} className="diagram-cp-highlight-face" style={{fill:'none'}} vectorEffect="non-scaling-stroke"/>)}
      {value.segments?.map(({a,b,face},index)=><path key={'edge-'+index} mask={tearWindows.maskForFaces([face])} data-cp-highlight-edge={face} d={`M${a.join(' ')}L${b.join(' ')}`} className="diagram-cp-highlight-segment" vectorEffect="non-scaling-stroke"/>)}
      {value.points.map((p,index)=><g key={'point-'+index} className="diagram-cp-highlight-point" transform={`translate(${p[0]} ${p[1]})`}>
        <circle r={radius*2.3} className="diagram-cp-highlight-halo"/>
        <circle r={radius*1.1} className="diagram-cp-highlight-dot" vectorEffect="non-scaling-stroke"/>
        {state==='fixed'&&<path d={`M${-radius*3} 0H${radius*3}M0 ${-radius*3}V${radius*3}`} className="diagram-cp-highlight-pin" vectorEffect="non-scaling-stroke"/>}
      </g>)}
      {value.label&&anchor&&<text x={anchor[0]+radius*2.5} y={anchor[1]-radius*2.8} fontSize={units*11} fontWeight="600" className="diagram-cp-highlight-label" paintOrder="stroke" strokeWidth={units*3}>{value.label}</text>}
    </g>;
  }
  function displayedSymbolGrips(annotation:DiagramSymbolAnnotation){
    return layoutDiagramSymbolGrips(symbolNativeGrips(annotation),units);
  }
  function foldSourceOpacity(annotation:DiagramAnnotation){
    if(isDiagramBackgroundLine(annotation))return 0;
    if(foldLinkEnabled&&isDiagramCPLine(annotation))return 0;
    if(!foldLinkEnabled||annotation.kind!=='line'||(annotation.style!=='valley'&&annotation.style!=='mountain')||annotation.foldFaces?.length===0)return undefined;
    // A transient drag remains visible before the parent commits and remaps
    // its geometry; the stored line stays paint-free under the layer preview.
    return objectDraft&&drag.current?.kind==='object'&&drag.current.ids.includes(annotation.id)?.6:0;
  }
  function updateView(next:ModelViewState){if(zoomRegion){setFocusCamera({key:zoomStateKey,cameras:next.cameras});return;}if(pose)callbacks.current.onViewChange(next);else setBlankView(next);}
  function previewViewport(next:ModelViewState){
    // Consume every input delta, but paint at most once per animation frame.
    queuedView.current=next;viewRef.current=next;rectRef.current=next.cameras[cameraKey(next)]??fitFrame;
    if(!viewFrame.current)viewFrame.current=requestAnimationFrame(()=>{viewFrame.current=0;setDraftView(queuedView.current);});
  }
  function clearViewportPreview(){
    cancelAnimationFrame(viewFrame.current);viewFrame.current=0;queuedView.current=null;setDraftView(null);
  }
  function flushWheelPreview(){
    clearTimeout(wheelTimer.current);wheelTimer.current=undefined;
    const next=wheelView.current;wheelView.current=null;
    if(next){clearViewportPreview();updateView(next);}
  }
  const viewportActions=useRef(flushWheelPreview);viewportActions.current=flushWheelPreview;
  useEffect(()=>{
    // Commit before navigation, saving or another edit can consume the project.
    const finish=()=>viewportActions.current();
    window.addEventListener('pointerdown',finish,true);window.addEventListener('keydown',finish,true);window.addEventListener('blur',finish);
    return()=>{
      window.removeEventListener('pointerdown',finish,true);window.removeEventListener('keydown',finish,true);window.removeEventListener('blur',finish);
      clearTimeout(wheelTimer.current);cancelAnimationFrame(viewFrame.current);
    };
  },[]);
  function withCamera(next:Frame):ModelViewState {const previous=viewRef.current;return {...previous,cameras:{...previous.cameras,[cameraKey(previous)]:{...next,rotation:previous.rotation}}};}
  function point(x:number,y:number):Point|null {const matrix=scene.current?.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());return [p.x,p.y];}
  function zoom(factor:number,anchor:Point=viewportCenter,preview=false){
    const r=rectRef.current,w=Math.max(fitFrame.width/128,Math.min(fitFrame.width*12,r.width*factor));
    const next=withCamera(zoomDiagramViewport(r,anchor,w/r.width));
    if(preview){
      wheelView.current=next;previewViewport(next);clearTimeout(wheelTimer.current);
      wheelTimer.current=setTimeout(()=>viewportActions.current(),160);
    }else updateView(next);
  }
  function prepareViewport(){clearGesture(tool==='mirror-copy');setConstructionIds([]);setNotice('');}
  function zoomBy(factor:number){prepareViewport();zoom(factor);}
  function rotateViewport(delta:number){if(orientationLocked)return;prepareViewport();onDrawingRotationChange(normalizeDiagramViewportAngle(viewportAngle+delta));setHover(null);}
  function resetViewportRotation(){if(orientationLocked)return;prepareViewport();onDrawingRotationChange(0);setHover(null);}
  function fitViewport(){prepareViewport();updateView({...saved,cameras:{}});setHover(null);}
  const previousZoomKey=useRef(zoomStateKey);
  useEffect(()=>{if(previousZoomKey.current!==zoomStateKey){previousZoomKey.current=zoomStateKey;clearGesture();setHover(null);callbacks.current.onClearSelection();}},[zoomStateKey]);
  const previousFitToken=useRef(fitToken);
  useEffect(()=>{if(previousFitToken.current===fitToken)return;previousFitToken.current=fitToken;fitViewport();},[fitToken]);
  function screenAlignedBoxIds(a:Point,b:Point,source=annotations,deleting=false){
    if(zoomInteraction)return zoomInteraction.boxIds(source.filter(item=>paperAnnotationVisible(item)&&(!deleting||!isDiagramCPExistingLine(item)&&(!editLocked||item.kind==='symbol'))),a,b,viewportAngle,viewportCenter);
    if(deleting)return diagramDeleteBoxIds(source.filter(paperAnnotationVisible),a,b,paperVisible?pose:null,editLocked,viewportAngle,viewportCenter);
    const visible=source.filter(paperAnnotationVisible),projected=viewportAngle?diagramViewportAnnotations(visible,viewportCenter,viewportAngle):visible;
    return diagramAnnotationsInBox(projected,rotateDiagramViewportPoint(a,viewportCenter,viewportAngle),rotateDiagramViewportPoint(b,viewportCenter,viewportAngle));
  }
  function snap(p:Point,e:{shiftKey:boolean;altKey:boolean},anchor?:Point):Point {
    const targets=canvas.snap&&!e.altKey?[...snapTargets,...diagramNearbyLineIntersections(p,references,radius*2.3).filter(inZoom)]:[];
    const result=anchor&&!e.shiftKey&&!e.altKey&&(canvas.anglePreset??0)>0?diagramAnglePoint(anchor,p,canvas.anglePreset!,{radius:canvas.snap?radius*2.3:0,vertices:targets,segments:canvas.snap?references.map(line=>({id:line.id,a:line.a,b:line.b,assignment:'F' as const,angle:0})):[]}):snapDiagramSymbolPoint(p,{enabled:canvas.snap&&!e.altKey,radius:radius*2.3,targets,lines:references,grid:snapGrid,anchor,constrain:e.shiftKey});
    return inZoom(result)?result:p;
  }
  function snapMirrorPoint(p:Point,e:{shiftKey:boolean;altKey:boolean},anchor?:Point):Point {
    const anchors=annotationsRef.current.filter((item):item is DiagramSymbolAnnotation=>item.kind==='symbol').flatMap(item=>symbolNativeGrips(item).filter(grip=>grip.kind==='anchor'||grip.kind==='endpoint').map(grip=>grip.point)).filter(inZoom);
    const result=snapDiagramSymbolPoint(p,{enabled:canvas.snap&&!e.altKey,radius:radius*2.3,targets:[...snapTargets,...anchors,...diagramNearbyLineIntersections(p,references,radius*2.3).filter(inZoom)],lines:references,grid:snapGrid,anchor,constrain:e.shiftKey});
    return inZoom(result)?result:p;
  }
  function resolveDrawingLine(p:Point,e:{shiftKey:boolean;altKey:boolean},anchor?:Point){
    const result=snapDiagramDrawingLine(p,{anchor,enabled:canvas.snap,radius:radius*2.3,targets:drawingTargets,lines:drawingReferences,grid:snapGrid,anglePreset:canvas.anglePreset,shiftKey:e.shiftKey,altKey:e.altKey});
    return inZoom(result.point)?result:{...result,point:p,relation:undefined,target:undefined};
  }
  function previewDrawingLine(p:Point,e:{shiftKey:boolean;altKey:boolean}){
    if(!line.current)return;
    drawingPointer.current={point:p,shiftKey:e.shiftKey,altKey:e.altKey};
    const result=resolveDrawingLine(p,e,line.current.a);
    setLineSnap(result.relation??null);setLineDraft({id:'draft',kind:'line',a:line.current.a,b:result.point,style:lineStyle,color,width,strokePattern});
  }
  useEffect(()=>{
    const pointer=drawingPointer.current;
    if(active&&!disabled&&line.current&&pointer)previewDrawingLine(pointer.point,pointer);
    else setLineSnap(null);
  },[canvas.snap,canvas.anglePreset,snapGrid,drawingReferences,units,active,disabled]);
  function finishMirrorCopy(){
    if(!mirrorAxis?.b||!mirrorPreview.annotations.length||mirrorPreview.error)return;
    if(callbacks.current.onMirrorCopy?.(mirrorAxis.a,mirrorAxis.b)!==false)cancel();
  }
  function cancelMirrorCopy(){cancel();callbacks.current.onCancelMirrorCopy?.();}
  function release(id:number){if(svg.current?.hasPointerCapture(id))svg.current.releasePointerCapture(id);}
  function clearGesture(keepMirror=false){
    const ids=[drag.current?.id,line.current?.pointer].filter((id):id is number=>id!==undefined&&id!==null);
    drag.current=null;line.current=null;drawingPointer.current=null;setLineSnap(null);setGestureCursor(null);setSymbolPointer(null);clearViewportPreview();setObjectDraft(null);setLineDraft(null);setBox(null);setHint(null);setDropOver(false);setPrecisionAnchor(null);
    turnEditorRef.current=null;setTurnEditor(null);divisionEditorRef.current=null;setDivisionEditor(null);
    if(!keepMirror){setMirrorAxis(null);setMirrorPointer(null);}
    ids.forEach(release);
  }
  function cancel(){clearGesture();setConstructionIds([]);setNotice('');}
  function eraseHits(source:DiagramAnnotation[],a:Point,b:Point){const candidates=source.filter(item=>paperAnnotationVisible(item)&&!isDiagramCPExistingLine(item)).map(paintAnnotation);return zoomInteraction?zoomInteraction.eraseIds(candidates,a,b,radius*2):diagramEraseHits(candidates,a,b,radius*2);}
  function pickVisibleAnnotation(source:readonly DiagramAnnotation[],p:Point):DiagramAnnotationPick|null {
    const shown=source.filter(paperAnnotationVisible),ids=zoomInteraction?new Set(zoomInteraction.eraseIds(shown,p,p,radius*2)):null,candidates=ids?zoomInteraction!.clipped(shown.filter(a=>ids.has(a.id)||a.kind==='symbol'&&a.symbol==='tearWindow')):shown;
    const paintOrder=[...candidates.filter(a=>a.kind==='line'),...candidates.filter(a=>a.kind==='symbol')];
    const hit=pickTopDiagramAnnotation(paintOrder,p,radius*2,paperVisible?pose:null,viewRef.current,paperVisible&&foldLinkEnabled,lineDefaults);
    return hit?{...hit,annotation:source.find(a=>a.id===hit.annotation.id)??hit.annotation}:null;
  }
  function pinView(){if(!viewRef.current.cameras[cameraKey(viewRef.current)])updateView(withCamera(rectRef.current));}
  function addLine(geometry:{a:Point;b:Point}|null):DiagramLineAnnotation|null {
    if(!geometry||dist(geometry.a,geometry.b)<=Math.max(1e-8,radius*.2))return null;
    const next:DiagramLineAnnotation={id:crypto.randomUUID(),kind:'line',...geometry,style:lineStyle,color,width,strokePattern,...(lineStyle==='valley'||lineStyle==='mountain'?{foldAction,foldAngle}: {}),...(!paperVisible?{foldFaces:[]}: {})};
    callbacks.current.onAnnotationsChange([...annotationsRef.current,next]);
    // Finishing a drawing gesture is not an explicit selection for editing.
    // Keep the layer picker on future strokes until the user picks a line.
    callbacks.current.onSelectedIds([]);return next;
  }
  function completeLine(b:Point,continuous:boolean){
    const a=line.current?.a;if(a)addLine({a,b});
    drawingPointer.current=null;setLineSnap(null);
    line.current=continuous?{a:[...b],pointer:null,client:[0,0]}:null;
    setLineDraft(continuous?{id:'draft',kind:'line',a:b,b,style:lineStyle,color,width,strokePattern}:null);
  }
  function symbolAt(value:DiagramSymbolAnnotation['symbol'],p:Point,id:string):DiagramSymbolAnnotation{
    const next:DiagramSymbolAnnotation=orientDiagramRepeatSymbol({id,kind:'symbol',symbol:value,position:p,size:diagramSymbolInitialSize(value,rect,zoomRegion?diagramZoomRegionBounds(zoomRegion):{width:paperGrid.stepX*paperGrid.divisions,height:paperGrid.stepY*paperGrid.divisions}),rotation:0,color,width,...(value==='tearWindow'?{cutawayFaces:[]}:{cadProperties:{}})},viewportAngle);
    const center=symbolNativeGrips(next).find(g=>g.id==='center')?.point;
    if(center)next.position=[next.position[0]+p[0]-center[0],next.position[1]+p[1]-center[1]];
    return next;
  }
  function placeSymbol(value:DiagramSymbolAnnotation['symbol'],p:Point){
    pinView();const next=symbolAt(value,p,crypto.randomUUID());
    callbacks.current.onAnnotationsChange([...annotationsRef.current,next]);callbacks.current.onSelectedIds([next.id]);callbacks.current.onSymbolPlaced();
  }
  function updateSymbolPointer(pointer:NonNullable<typeof lastPointer.current>){
    if(tool!=='symbol'||!active||disabled||nativePaletteDrag.current){setSymbolPointer(null);return;}
    const target=document.elementFromPoint(pointer.client[0],pointer.client[1]);
    const world=target&&svg.current?.contains(target)?point(pointer.client[0],pointer.client[1]):null;
    setSymbolPointer({client:pointer.client,point:world?snap(world,pointer):null});
  }
  const placementTracking=useRef({enabled:false,update:updateSymbolPointer});placementTracking.current={enabled:tool==='symbol'&&active&&!disabled,update:updateSymbolPointer};
  function updateObject(d:Extract<Drag,{kind:'object'}>,p:Point,e:{shiftKey:boolean;altKey:boolean}):DiagramAnnotation[] {
    const annotation=d.annotation,delta:Point=[p[0]-d.start[0],p[1]-d.start[1]];
    const query:Point=d.handle==='move'||d.handle==='native'&&d.moveGrip?[d.moveAnchor[0]+delta[0],d.moveAnchor[1]+delta[1]]:p;
    const options={enabled:canvas.snap&&!e.altKey,radius:radius*2.3,targets:[...d.snapTargets,...(canvas.snap&&!e.altKey?diagramNearbyLineIntersections(query,d.snapLines,radius*2.3):[])].filter(point=>annotation.kind==='symbol'||inZoom(point)),grid:snapGrid};
    if(d.handle==='move'||d.handle==='native'&&d.moveGrip){
      const target=annotation.kind==='symbol'?snapDiagramSymbolPoint(query,{...options,lines:d.snapLines}):null;
      const candidate:Point=target?[target[0]-d.moveAnchor[0],target[1]-d.moveAnchor[1]]:snapDiagramTranslation(d.moveAnchor,delta,options);
      const snapped:Point=annotation.kind==='symbol'||inZoom([d.moveAnchor[0]+candidate[0],d.moveAnchor[1]+candidate[1]])?candidate:delta;
      return transformDiagramAnnotations(d.source,d.ids,{kind:'translate',delta:snapped});
    }
    let next:DiagramAnnotation=annotation;
    if(annotation.kind==='line'){
      const candidate=snapDiagramDrawingLine(p,{...options,lines:d.snapLines,anchor:d.handle==='a'?annotation.b:annotation.a,anglePreset:canvas.anglePreset,shiftKey:e.shiftKey,altKey:e.altKey}).point,target=inZoom(candidate)?candidate:p;
      next=d.handle==='a'?{...annotation,a:target}:{...annotation,b:target};
    }
    else if(d.handle==='native'&&d.gripId){
      const grip=symbolNativeGrips(annotation).find(g=>g.id===d.gripId);
      const actual=grip?diagramGripDragPoint(d.gripAnchor??grip.point,d.start,p):p;
      const target=snapDiagramSymbolPoint(actual,{...options,lines:d.snapLines});
      next=moveSymbolNativeGrip(annotation,d.gripId,target);
    }
    return d.source.map(item=>item.id===annotation.id?next:item);
  }
  function startObject(e:ReactPointerEvent<SVGElement>,annotation:DiagramAnnotation,handle:Handle='move',gripId?:string){
    if(e.button!==0||disabled||!active||tool!=='select')return;
    imageCallbacks.current.onSelectImage?.(null);
    const p=point(e.clientX,e.clientY);if(!p||annotation.kind==='line'&&!inZoom(p))return;
    let picked:DiagramAnnotationPick={annotation};
    if(handle==='move'){
      const hit=pickVisibleAnnotation(annotationsRef.current,p);
      if(!hit)return;picked=hit;annotation=hit.annotation;
    }else if(annotation.kind==='line'&&Object.hasOwn(selectedLineFaces,annotation.id))picked={annotation,face:selectedLineFaces[annotation.id][0]??null};
    const pickedSelection=handle==='move'?diagramPickedSelection(selectedIds,selectedLineFaces,picked,e.shiftKey):{ids:[annotation.id],lineFaces:annotation.kind==='line'&&Object.hasOwn(selectedLineFaces,annotation.id)?{[annotation.id]:[...selectedLineFaces[annotation.id]]}:{}};
    if(isDiagramCPExistingLine(annotation)){
      e.preventDefault();e.stopPropagation();svg.current?.focus({preventScroll:true});
      callbacks.current.onSelectedIds(pickedSelection.ids,pickedSelection.lineFaces);
      callbacks.current.onSelect({group:[],selected:[]});setNotice('已有折痕随 CP 保留；可选择“沿此痕折叠”，修改路线请编辑 CP');return;
    }
    if(editLocked&&annotation.kind==='line'){e.preventDefault();e.stopPropagation();callbacks.current.onSelectedIds(pickedSelection.ids,pickedSelection.lineFaces);setNotice('折痕已锁定，切回平整状态后可编辑');return;}
    if(handle==='move'&&!pointHitsDiagramAnnotation(p,paintAnnotation(annotation),radius*2))return;
    e.preventDefault();e.stopPropagation();svg.current?.focus({preventScroll:true});setNotice('');
    if(handle==='move'&&e.shiftKey){callbacks.current.onSelectedIds(pickedSelection.ids,pickedSelection.lineFaces);callbacks.current.onSelect({group:[],selected:[]});return;}
    const selectedGrip=annotation.kind==='symbol'&&gripId?symbolNativeGrips(annotation).find(grip=>grip.id===gripId):undefined;
    const moveGrip=selectedGrip?.semantic==='move'||selectedGrip?.kind==='anchor';
    const preserveGroup=annotation.kind==='symbol'&&(handle==='move'||moveGrip)&&selectedIds.includes(annotation.id);
    const candidates=preserveGroup?[...selectedIds]:pickedSelection.ids;
    const ids=candidates.filter(id=>{const item=annotationsRef.current.find(a=>a.id===id);return item&&!isDiagramCPExistingLine(item)&&(!editLocked||item.kind==='symbol');});
    callbacks.current.onSelectedIds(ids,preserveGroup?selectedLineFaces:pickedSelection.lineFaces);callbacks.current.onSelect({group:[],selected:[]});pinView();
    const stationary=stationaryDiagramSnapReferences(references,ids);
    const stationarySymbols=annotationsRef.current.filter(item=>item.kind==='symbol'&&!ids.includes(item.id));
    const anchors=annotation.kind==='symbol'?symbolNativeGrips(annotation).filter(g=>g.kind==='anchor'||g.kind==='endpoint'):[];
    const moveAnchor=annotation.kind==='line'?(dist(p,annotation.a)<=dist(p,annotation.b)?annotation.a:annotation.b):moveGrip?selectedGrip!.point:anchors.find(g=>g.id==='center')?.point??anchors.sort((a,b)=>dist(p,a.point)-dist(p,b.point))[0]?.point??annotation.position;
    const displayedGrip=annotation.kind==='symbol'?displayedSymbolGrips(annotation).find(g=>g.id===gripId):undefined;
    drag.current={kind:'object',id:e.pointerId,start:p,client:[e.clientX,e.clientY],annotation:structuredClone(annotation),handle,gripId,gripAnchor:displayedGrip?.anchorPoint,moveGrip,clickOnly:displayedGrip?.semantic==='mirror',ids,source:structuredClone(annotationsRef.current),snapTargets:[...diagramMoveSnapTargets(stationarySymbols,ids),...stationary.flatMap(line=>[line.a,line.b]),...(!editLocked?canvas.constructionPoints??[]:[])],snapLines:stationary,moveAnchor};
    setGestureCursor('grabbing');
    svg.current?.setPointerCapture(e.pointerId);
  }
  function construct(p:Point,e:{shiftKey:boolean;altKey:boolean}){
    const hit=pickDiagramAnnotation(tool==='trim'||tool==='extend'?lines:references,p,radius*2),ids=constructionRef.current;
    if(tool==='trim'||tool==='extend'){
      if(!hit||hit.kind!=='line')return;
      if(isDiagramCPExistingLine(hit)){setNotice('已有折痕随 CP 保留；修改路线请编辑 CP');return;}
      if(tool==='trim'){
        const pieces=trimDiagramLine(hit,lines,p);if(!pieces){setNotice('这条线没有可截断的绘图线交点');return;}
        callbacks.current.onAnnotationsChange(annotationsRef.current.flatMap(a=>a.id===hit.id?pieces:[a]));callbacks.current.onSelectedIds(pieces.map(a=>a.id));
      }else {
        const result=extendDiagramLine(hit,lines,p);if(!result){setNotice('该端点方向没有其他绘图线的交点');return;}
        callbacks.current.onAnnotationsChange(annotationsRef.current.map(a=>a.id===hit.id?result:a));callbacks.current.onSelectedIds([hit.id]);
      }return;
    }
    if(!ids.length){if(hit){setConstructionIds([hit.id]);setNotice(tool==='bisector'?'选择第二条绘图折线或纸边':'点击要通过的位置');}else setNotice('请先选择一条绘图折线或纸边');return;}
    const first=references.find(a=>a.id===ids[0]);if(!first){setConstructionIds([]);return;}
    if(tool==='bisector'&&ids.length===1){
      if(hit&&hit.id!==first.id){if(!intersectDiagramLines(first,hit as DiagramLineAnnotation)){setNotice('两条参考线平行，无法确定角顶点');return;}setConstructionIds([first.id,hit.id]);setNotice('点击角平分线终点');}return;
    }
    const second=ids.length>1?references.find(a=>a.id===ids[1]):null,target=snap(p,e);
    const geometry=tool==='bisector'&&second?bisectDiagramLines(first,second,target):constructDiagramLine(first,target,tool==='perpendicular'?'perpendicular':'parallel',Math.min(Math.max(dist(first.a,first.b),Math.max(paperGrid.stepX,paperGrid.stepY)*3),Math.max(visible.width,visible.height)*1.4));
    pinView();addLine(geometry);setConstructionIds([]);setLineDraft(null);setNotice('');
  }
  useEffect(()=>{cancel();finishTurnAngle(false);},[tool,active,disabled,pose?.sourceStateId,pose?.sourceRevision,commandToken,paperVisible]);
  useEffect(()=>{
    if(lastPointer.current)updateSymbolPointer(lastPointer.current);else setSymbolPointer(null);
  },[tool,symbol,active,disabled,viewportAngle,rect.x,rect.y,rect.width,rect.height,commandToken,snapGrid,canvas.snap]);
  useEffect(()=>{
    const track=(event:PointerEvent)=>{
      const pointer={client:[event.clientX,event.clientY] as Point,shiftKey:event.shiftKey,altKey:event.altKey};lastPointer.current=pointer;
      if(placementTracking.current.enabled)placementTracking.current.update(pointer);
    };
    const blur=()=>{lastPointer.current=null;nativePaletteDrag.current=false;setSymbolPointer(null);if(placementTracking.current.enabled)callbacks.current.onCancelSymbolPlacement();};
    const leaveWindow=(event:PointerEvent)=>{if(event.relatedTarget===null)setSymbolPointer(null);};
    const nativeStart=(event:DragEvent)=>{if(event.defaultPrevented)return;nativePaletteDrag.current=true;setSymbolPointer(null);};
    const nativeEnd=()=>{nativePaletteDrag.current=false;if(lastPointer.current&&placementTracking.current.enabled)placementTracking.current.update(lastPointer.current);};
    window.addEventListener('pointermove',track,true);window.addEventListener('pointerdown',track,true);window.addEventListener('pointerout',leaveWindow,true);window.addEventListener('blur',blur);window.addEventListener('dragstart',nativeStart);window.addEventListener('dragend',nativeEnd);
    return()=>{window.removeEventListener('pointermove',track,true);window.removeEventListener('pointerdown',track,true);window.removeEventListener('pointerout',leaveWindow,true);window.removeEventListener('blur',blur);window.removeEventListener('dragstart',nativeStart);window.removeEventListener('dragend',nativeEnd);};
  },[]);
  useEffect(()=>{
    const el=svg.current;if(!el)return;
    const observer=new ResizeObserver(()=>setSize(previous=>{
      const width=Math.max(1,el.clientWidth),height=Math.max(1,el.clientHeight);
      return previous.width===width&&previous.height===height?previous:{width,height};
    }));observer.observe(el);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const el=svg.current;if(!el||!active)return;
    const wheel=(e:WheelEvent)=>{
      if((e.target as Element)?.closest('[data-diagram-turn-editor]'))return;
      e.preventDefault();if(drag.current||line.current||imageGestureMoving||disabled)return;
      // Use the latest queued camera even when several wheel events arrive
      // before React paints it. Their anchor must not use the old SVG matrix.
      const bounds=el.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
      const shown=diagramVisibleRect(rectRef.current,size),center:Point=[shown.x+shown.width/2,shown.y+shown.height/2];
      const anchor=rotateDiagramViewportPoint([shown.x+(e.clientX-bounds.left)*shown.width/bounds.width,shown.y+(e.clientY-bounds.top)*shown.height/bounds.height],center,-viewportAngle);
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?size.height:1);
      zoom(Math.exp(Math.max(-2,Math.min(2,delta*.002))),anchor,true);
    };
    const key=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.isComposing||e.keyCode===229||(e.target as Element)?.closest('input,textarea,select,[contenteditable],[role="dialog"],dialog[open]'))return;
      if(e.key==='Alt'||e.key==='Shift'){
        if(lastPointer.current)lastPointer.current={...lastPointer.current,shiftKey:e.shiftKey,altKey:e.altKey};
        if(line.current&&drawingPointer.current)previewDrawingLine(drawingPointer.current.point,e);
        if(lastPointer.current&&tool==='symbol')updateSymbolPointer(lastPointer.current);
        if(lastPointer.current&&tool==='mirror-copy'&&mirrorAxis&&!mirrorAxis.b){const p=point(...lastPointer.current.client);if(p)setMirrorPointer(snapMirrorPoint(p,e,mirrorAxis.a));}
        setHover(current=>current?[...current]:null);
        if(e.key==='Alt'&&(tool==='line'||tool==='polyline'))e.preventDefault();
      }
      if((e.key==='Delete'||e.key==='Backspace')&&imageCallbacks.current.selectedImageId&&tool==='select'&&!disabled){
        e.preventDefault();e.stopImmediatePropagation();const {images,selectedImageId,onImagesChange,onSelectImage}=imageCallbacks.current;onImagesChange?.(images.filter(image=>image.id!==selectedImageId));onSelectImage?.(null);cancel();return;
      }
      if(e.key==='Escape'&&imageCallbacks.current.selectedImageId){e.preventDefault();imageCallbacks.current.onSelectImage?.(null);cancel();}
      if(e.key==='Escape'&&tool==='symbol'){e.preventDefault();cancel();callbacks.current.onCancelSymbolPlacement();return;}
      if(tool==='mirror-copy'&&e.key==='Enter'){if((e.target as Element)?.closest('button'))return;e.preventDefault();finishMirrorCopy();return;}
      if(tool==='mirror-copy'&&e.key==='Escape'){e.preventDefault();cancelMirrorCopy();callbacks.current.onSelectedIds([],{});callbacks.current.onSelect({group:[],selected:[]});return;}
      if(e.key==='Escape'){e.preventDefault();cancel();callbacks.current.onSelectedIds([]);callbacks.current.onSelect({group:[],selected:[]});}
      else if(e.key==='Enter'&&tool==='polyline'){if((e.target as Element)?.closest('button'))return;e.preventDefault();cancel();}
      else if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase()))cancel();
    };
    const keyUp=(e:KeyboardEvent)=>{
      if(e.key!=='Alt'&&e.key!=='Shift')return;
      if(lastPointer.current)lastPointer.current={...lastPointer.current,shiftKey:e.shiftKey,altKey:e.altKey};
      if(line.current&&drawingPointer.current)previewDrawingLine(drawingPointer.current.point,e);
      if(lastPointer.current&&tool==='symbol')updateSymbolPointer(lastPointer.current);
      if(lastPointer.current&&tool==='mirror-copy'&&mirrorAxis&&!mirrorAxis.b){const p=point(...lastPointer.current.client);if(p)setMirrorPointer(snapMirrorPoint(p,e,mirrorAxis.a));}
      setHover(current=>current?[...current]:null);
    };
    el.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',key,true);window.addEventListener('keyup',keyUp,true);window.addEventListener('blur',cancel);
    return()=>{el.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',keyUp,true);window.removeEventListener('blur',cancel);};
  },[active,disabled,pose,annotations,canvas,size.height,size.width,onViewChange,tool,viewportAngle,mirrorAxis,mirrorPreview,drawingReferences,drawingTargets,units,imageGestureMoving,paperVisible,lineDefaults]);
  useEffect(()=>()=>{drag.current=null;line.current=null;},[]);
  const visibleItems=items.filter(paperAnnotationVisible);
  const renderedItems=visibleItems.map(a=><g key={a.id} clipPath={a.kind==='line'?paperClip:undefined} mask={paperVisible&&a.kind==='line'?tearWindows.maskForFaces(a.foldFaces):undefined} data-diagram-annotation={a.id} data-annotation-kind={a.kind} data-diagram-existing-crease={isDiagramCPExistingLine(a)?true:undefined} data-diagram-movable={!isDiagramCPExistingLine(a)&&(!editLocked||a.kind==='symbol')?true:undefined} pointerEvents={tool==='select'?'visiblePainted':'none'} style={{cursor:tool==='select'?(isDiagramCPExistingLine(a)?'pointer':editLocked&&a.kind==='line'?'default':'move'):undefined}} onPointerDown={e=>startObject(e,a)} onDoubleClick={e=>{const key=(e.target as Element).closest('[data-cad-attribute]')?.getAttribute('data-cad-attribute')??undefined;const p=point(e.clientX,e.clientY);if(editDivisionNumber(a,key,p??undefined)){e.preventDefault();e.stopPropagation();}else if(a.kind==='symbol'&&isDiagramRotationSymbol(a.symbol)){e.preventDefault();e.stopPropagation();editTurnAngle(a);}}}>
    {showCursorHint&&a.kind==='symbol'&&isDiagramRotationSymbol(a.symbol)&&<title>双击中央数字或旋转符号修改旋转角度（0～360°）</title>}
    <g data-fold-link-source-hidden={foldSourceOpacity(a)===0?true:undefined} opacity={foldSourceOpacity(a)} pointerEvents={tool==='select'?'visiblePainted':'none'} dangerouslySetInnerHTML={{__html:diagramAnnotationMarkup(paintAnnotation(a),lineDisplay)}}/>
    {a.kind==='line'&&<line x1={a.a[0]} y1={a.a[1]} x2={a.b[0]} y2={a.b[1]} stroke="transparent" strokeWidth={Math.max(radius*3,a.width)} fill="none">{showCursorHint&&<title>{`${LINE_LABELS[a.style]} · 放大可查看线型细节`}</title>}</line>}
  </g>);
  return <>
    <svg ref={svg} className={'diagram-model-svg diagram-tool-'+tool+(dropOver?' is-drop-over':'')} data-diagram-model="true" data-diagram-depth={JSON.stringify(pose?.view?.depth)} data-depth-preview={depthPreview?JSON.stringify(depthPreview):undefined} data-teach-line-start={lineDraft?lineDraft.a.join(','):undefined} data-diagram-dragging={imageGestureMoving?'grabbing':gestureCursor??(hint?.dragging?'grabbing':undefined)} data-diagram-disabled={disabled||!active?true:undefined} data-diagram-viewport-angle={viewportAngle} data-diagram-paper-visible={paperVisible} data-model-history="true" tabIndex={0} aria-label="折序绘图画布；绘图、框选、右拖删除、拖角；滚轮缩放，中键平移，可旋转整个画布" viewBox={`${visible.x} ${visible.y} ${visible.width} ${visible.height}`} style={{cursor:box?.deleting?'crosshair':tool==='pan'?'grab':['erase','fixed','layer','ratio-point','special-point','line','polyline','mirror-copy'].includes(tool)?'crosshair':undefined}}
      onDoubleClick={e=>{
        if(disabled||!active||tool!=='select'||turnEditorRef.current||divisionEditorRef.current)return;
        const p=point(e.clientX,e.clientY);if(!p)return;
        // Object dragging captures pointers on this root SVG. Browsers may
        // consequently retarget click/dblclick here after capture is released,
        // even when the pointer is directly over a symbol's central number.
        const hit=pickVisibleAnnotation(annotationsRef.current,p);
        if(hit?.annotation.kind==='symbol'&&editDivisionNumber(hit.annotation,undefined,p)){e.preventDefault();e.stopPropagation();return;}
        if(hit?.annotation.kind==='symbol'&&isDiagramRotationSymbol(hit.annotation.symbol)){
          e.preventDefault();e.stopPropagation();editTurnAngle(hit.annotation);
        }
      }}
      onPointerDownCapture={()=>onHoverPaper?.(null)} onPointerDown={e=>{
        if(disabled||!active)return;const p=point(e.clientX,e.clientY);if(!p)return;e.currentTarget.focus({preventScroll:true});setNotice('');
        if(e.button===1||(e.button===0&&tool==='pan')){
          e.preventDefault();clearGesture(tool==='mirror-copy');const matrix=scene.current?.getScreenCTM();if(!matrix)return;
          drag.current={kind:'pan',id:e.pointerId,start:[e.clientX,e.clientY],inverse:matrix.inverse(),view:viewRef.current,rect:rectRef.current,button:e.button===1?4:1};setGestureCursor('grabbing');e.currentTarget.setPointerCapture(e.pointerId);return;
        }
        if(e.button===2){
          // Windows may dispatch contextmenu before pointerup. Clear the full
          // workspace selection now, independently of a later delete gesture;
          // changing the command token here would cancel right-drag deletion.
          imageCallbacks.current.onSelectImage?.(null);callbacks.current.onClearSelection();
          if(tool==='mirror-copy'){e.preventDefault();cancelMirrorCopy();return;}
          e.preventDefault();clearGesture();drag.current={kind:'delete-box',id:e.pointerId,start:p,end:p,client:[e.clientX,e.clientY],source:structuredClone(annotationsRef.current)};
          e.currentTarget.setPointerCapture(e.pointerId);return;
        }
        if(e.button!==0)return;
        if(!inZoom(p)&&tool!=='symbol'&&tool!=='select'&&tool!=='erase'){callbacks.current.onClearSelection();return;}
        imageCallbacks.current.onSelectImage?.(null);
        if(tool==='mirror-copy'){
          e.preventDefault();
          if(!mirrorSource.length){setNotice('请先选择要镜像复制的折线或符号。');return;}
          if(editLocked&&mirrorSource.some(item=>item.kind==='line')){setNotice('请切回平整状态后镜像复制折痕。');return;}
          if(!mirrorAxis){pinView();setMirrorAxis({a:snapMirrorPoint(p,e),b:null});setMirrorPointer(null);}
          else if(!mirrorAxis.b){const b=snapMirrorPoint(p,e,mirrorAxis.a);if(dist(mirrorAxis.a,b)<1e-8){setNotice('镜像轴的两点不能重合，请选择另一点。');return;}setMirrorAxis({a:mirrorAxis.a,b});setMirrorPointer(b);}
          else setNotice('镜像预览已就绪，点击“确认镜像”或按 Enter 复制；也可重选镜像轴。');
        }else if(tool==='ratio-point'||tool==='special-point'){
          e.preventDefault();if(editLocked)return;const target=snap(p,e);
          if(!precisionAnchor){setPrecisionAnchor(target);setNotice('第一端 A 已选，点击第二端 B 取点');}
          else try{const picked=tool==='ratio-point'?diagramRatioPoint(precisionAnchor,target,precision.ratioA,precision.ratioB):diagramSpecialPoint(precisionAnchor,target,precision.expression);if(onPrecisionPoint?.(picked)!==false){setPrecisionAnchor(null);setNotice(`定位点已添加 · X ${picked[0].toFixed(4)} · Y ${picked[1].toFixed(4)}`);}}catch(error){setNotice(error instanceof Error?error.message:'无法计算取点位置');}
        }else if(tool==='fixed'||tool==='layer'){
          e.preventDefault();if(!paperVisible)return;
          // Use the paper position itself: snapping can move a pick across a
          // face boundary and change which fixed piece or layer was intended.
          if(tool==='fixed')callbacks.current.onPickFixed?.(p);else callbacks.current.onPickLayerPoint?.(p);
        }else if(tool==='line'||tool==='polyline'){
          e.preventDefault();pinView();if(line.current){const b=resolveDrawingLine(p,e,line.current.a).point;completeLine(b,tool==='polyline');if(tool==='polyline'){line.current={a:b,pointer:e.pointerId,client:[e.clientX,e.clientY]};e.currentTarget.setPointerCapture(e.pointerId);}return;}
          const a=resolveDrawingLine(p,e).point;drawingPointer.current=null;setLineSnap(null);line.current={a,pointer:e.pointerId,client:[e.clientX,e.clientY]};setLineDraft({id:'draft',kind:'line',a,b:a,style:lineStyle,color,width,strokePattern});e.currentTarget.setPointerCapture(e.pointerId);
        }else if(tool==='symbol'){e.preventDefault();placeSymbol(symbol,snap(p,e));}
        else if(tool==='erase'){
          e.preventDefault();const ids=new Set(eraseHits(annotations,p,p));drag.current={kind:'erase',id:e.pointerId,previous:p,ids,source:annotations};setObjectDraft(annotations.filter(a=>!ids.has(a.id)));e.currentTarget.setPointerCapture(e.pointerId);
        }else if(tool==='select'){
          const hit=pickVisibleAnnotation(annotations,p);if(hit){startObject(e,hit.annotation);return;}
          e.preventDefault();callbacks.current.onSelect({group:[],selected:[]});drag.current={kind:'box',id:e.pointerId,start:p,end:p,client:[e.clientX,e.clientY],ids:[...selectedIds],shift:e.shiftKey};setBox({a:p,b:p});e.currentTarget.setPointerCapture(e.pointerId);
        }else if(tool!=='vertex'){e.preventDefault();construct(p,e);}
      }}
      onPointerMove={e=>{
        const d=drag.current;
        // Panning already owns the screen transform captured on pointerdown.
        // Reading getScreenCTM here forces SVG layout on every mouse event.
        if(d?.id===e.pointerId&&d.kind==='pan'){
          if((e.buttons&2)||!(e.buttons&d.button)){cancel();return;}
          const dx=e.clientX-d.start[0],dy=e.clientY-d.start[1];
          previewViewport({...d.view,cameras:{...d.view.cameras,[cameraKey(d.view)]:{...d.rect,rotation:d.view.rotation,x:d.rect.x-d.inverse.a*dx-d.inverse.c*dy,y:d.rect.y-d.inverse.b*dx-d.inverse.d*dy}}});
          return;
        }
        const p=point(e.clientX,e.clientY);if(!p)return;setHover(inZoom(p)?p:null);
        onHoverPaper?.(!d&&!e.buttons&&active&&!disabled&&paperVisible&&inZoom(p)?p:null);
        if(d?.id===e.pointerId){
          if(d.kind==='pan')return;
          if(d.kind==='delete-box'?!(e.buttons&2):(e.buttons&2)||!(e.buttons&1)){cancel();return;}
          if(d.kind==='box'){d.end=p;setBox({a:d.start,b:p});}
          else if(d.kind==='delete-box'){d.end=p;if(dist([e.clientX,e.clientY],d.client)>3)setBox({a:d.start,b:p,deleting:true});}
          else if(d.kind==='erase'){for(const id of eraseHits(d.source,d.previous,p))d.ids.add(id);d.previous=p;setObjectDraft(d.source.filter(a=>!d.ids.has(a.id)));}
          else if(d.clickOnly){if(dist([e.clientX,e.clientY],d.client)>3)d.moved=true;setObjectDraft(null);}
          else if((d.annotation.kind==='symbol'||inZoom(p))&&dist([e.clientX,e.clientY],d.client)>2){try{setObjectDraft(updateObject(d,p,e));setNotice('');}catch(error){setObjectDraft(null);setNotice(error instanceof Error?error.message:'无法调整这个夹点');}}
          else setObjectDraft(null);
          return;
        }
        if(tool==='mirror-copy'&&mirrorAxis&&!mirrorAxis.b){setMirrorPointer(snapMirrorPoint(p,e,mirrorAxis.a));return;}
        if(line.current){if(line.current.pointer===e.pointerId&&(e.buttons&2)){cancel();return;}if(inZoom(p))previewDrawingLine(p,e);}
        else if(constructionIds.length&&(tool==='parallel'||tool==='perpendicular'||tool==='bisector')){
          const first=references.find(a=>a.id===constructionIds[0]),second=references.find(a=>a.id===constructionIds[1]);if(!first)return;
          const target=snap(p,e),geometry=tool==='bisector'?(second?bisectDiagramLines(first,second,target):null):constructDiagramLine(first,target,tool,Math.min(Math.max(dist(first.a,first.b),Math.max(paperGrid.stepX,paperGrid.stepY)*3),Math.max(visible.width,visible.height)*1.4));
          if(geometry)setLineDraft({id:'draft',kind:'line',...geometry,style:lineStyle,color,width,strokePattern});
        }
      }}
      onPointerUp={e=>{
        // Panning already has its final camera; reading the scene matrix here
        // would force layout of the large SVG just before committing it.
        const d=drag.current,p=d?.kind==='pan'&&d.id===e.pointerId?null:point(e.clientX,e.clientY);
        if(d?.id===e.pointerId){
          drag.current=null;setGestureCursor(null);
          if(e.button!==0&&d.kind!=='pan'&&d.kind!=='delete-box'){cancel();return;}
          if(d.kind==='pan'){const next=viewRef.current;clearViewportPreview();updateView(next);}
          else if(d.kind==='delete-box'){
            const ids=p&&dist([e.clientX,e.clientY],d.client)>3?screenAlignedBoxIds(d.start,p,d.source,true):[];
            if(ids.length&&callbacks.current.onDeleteInBox)callbacks.current.onDeleteInBox(ids);
            else {callbacks.current.onSelectedIds([],{});if(ids.length)callbacks.current.onAnnotationsChange(d.source.filter(a=>!ids.includes(a.id)));}
            callbacks.current.onSelect({group:[],selected:[]});setBox(null);setNotice(ids.length?`已删除框内 ${ids.length} 个绘图对象，可撤销恢复`:'');
          }
          else if(d.kind==='box'){
            const ids=p&&dist([e.clientX,e.clientY],d.client)>3?screenAlignedBoxIds(d.start,p):[];
            const combined=d.shift?[...d.ids.filter(id=>!ids.includes(id)),...ids.filter(id=>!d.ids.includes(id))]:ids;
            callbacks.current.onSelectedIds(combined,d.shift?Object.fromEntries(Object.entries(selectedLineFaces).filter(([id])=>combined.includes(id)&&!ids.includes(id))):{});setBox(null);
          }else if(d.kind==='erase'){
            if(p)for(const id of eraseHits(d.source,d.previous,p))d.ids.add(id);
            if(d.ids.size){callbacks.current.onAnnotationsChange(d.source.filter(a=>!d.ids.has(a.id)));callbacks.current.onSelectedIds(selectedIds.filter(id=>!d.ids.has(id)));}setObjectDraft(null);
          }else {
            const flip=d.annotation.kind==='symbol'&&d.gripId?.startsWith('cad:')?cadPropertyDefinitions(d.annotation.symbol).find(def=>def.key===d.gripId!.slice(4)&&def.type==='flip'&&def.editable):undefined;
            if(flip&&d.annotation.kind==='symbol'){
              if(p&&!d.moved&&dist([e.clientX,e.clientY],d.client)<=3){const next=toggleSymbolNativeMirror(d.annotation,d.gripId!);callbacks.current.onAnnotationsChange(d.source.map(a=>a.id===next.id?next:a));}
              setObjectDraft(null);release(e.pointerId);return;
            }
            if(p&&(d.annotation.kind==='symbol'||inZoom(p))&&dist([e.clientX,e.clientY],d.client)>2){try{
              const next=updateObject(d,p,e),valid=next.every(a=>a.kind!=='line'||dist(a.a,a.b)>1e-8);
              if(valid){
                if(JSON.stringify(next)!==JSON.stringify(d.source))callbacks.current.onAnnotationsChange(next);
                
              }
            }catch(error){setNotice(error instanceof Error?error.message:'无法调整这个夹点');}}setObjectDraft(null);
          }
        }else if(line.current?.pointer===e.pointerId){
          const moved=dist([e.clientX,e.clientY],line.current.client)>3;
          if(e.button!==0||p&&!inZoom(p)){cancel();return;}if(moved&&p)completeLine(resolveDrawingLine(p,e,line.current.a).point,tool==='polyline');else line.current.pointer=null;
        }
        release(e.pointerId);
      }}
      onPointerLeave={()=>{onHoverPaper?.(null);setHover(null);setLineSnap(null);drawingPointer.current=null;}} onPointerCancel={cancel} onLostPointerCapture={e=>{if(drag.current?.id===e.pointerId||line.current?.pointer===e.pointerId)cancel();}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();imageCallbacks.current.onSelectImage?.(null);callbacks.current.onClearSelection();if(drag.current?.kind==='delete-box')return;if(tool==='mirror-copy')cancelMirrorCopy();else cancel();}} onAuxClick={e=>e.preventDefault()}
      onDragStartCapture={e=>{e.preventDefault();e.stopPropagation();setDropOver(false);}}
      onDragOver={e=>{if(disabled||!active||!(e.dataTransfer.types.includes(SYMBOL_MIME)||onCreateCallout&&e.dataTransfer.types.includes(CALLOUT_MIME)))return;e.preventDefault();e.dataTransfer.dropEffect='copy';setDropOver(true);}}
      onDragLeave={()=>setDropOver(false)} onDrop={e=>{setDropOver(false);if(disabled||!active)return;const value=e.dataTransfer.getData(SYMBOL_MIME),calloutType=e.dataTransfer.getData(CALLOUT_MIME),p=point(e.clientX,e.clientY);if(p&&inZoom(p)&&onCreateCallout&&isDiagramCalloutSymbolType(calloutType)){e.preventDefault();onCreateCallout(calloutType,p);}else if(p&&isDiagramSymbolKind(value)){e.preventDefault();placeSymbol(value,snap(p,e));}}}>
      <defs>{zoomRegion&&<clipPath id={zoomClipId} clipPathUnits="userSpaceOnUse"><path d={diagramZoomRegionPath(zoomRegion)}/></clipPath>}</defs>
      <g ref={scene} data-diagram-viewport-scene="true" data-diagram-zoom-kind={zoomRegion?.kind} transform={`rotate(${viewportAngle} ${viewportCenter[0]} ${viewportCenter[1]})`}>
      <g data-diagram-cropped-paper="true" clipPath={paperClip}>
      {tearWindows.definitions&&<defs data-diagram-tear-window-masks="true" dangerouslySetInnerHTML={{__html:tearWindows.definitions}}/>}
      {localFoldClips&&<defs data-diagram-local-ink-clips="true" dangerouslySetInnerHTML={{__html:localFoldClips.definitions}}/>}
      {backgroundLines.length>0&&<g data-diagram-background-folds="true" pointerEvents="none">{backgroundLines.map(a=><g key={a.id} data-diagram-background-fold={a.id} dangerouslySetInnerHTML={{__html:diagramAnnotationMarkup(paintAnnotation(a),lineDisplay)}}/>)}</g>}
      {surfaceMarkup&&<g data-diagram-simulation-surface="true" pointerEvents="none" dangerouslySetInnerHTML={{__html:surfaceMarkup}}/>}
      {paperVisible&&livePose&&<g data-diagram-paper-preview={vertexDraft?true:undefined} pointerEvents="none" dangerouslySetInnerHTML={{__html:paperMarkup}}/>}
      {grid&&<g data-diagram-grid="true" data-grid-origin-x={paperGrid.origin[0]} data-grid-origin-y={paperGrid.origin[1]} data-grid-step-x={paperGrid.stepX} data-grid-step-y={paperGrid.stepY} data-grid-divisions={paperGrid.divisions} pointerEvents="none" fill="none"><path d={grid.minor} stroke={gridAppearance.gridColor} strokeOpacity=".22" strokeWidth=".45" vectorEffect="non-scaling-stroke"/><path d={grid.major} stroke={gridAppearance.gridColor} strokeOpacity=".65" strokeWidth={gridAppearance.lineWidth} vectorEffect="non-scaling-stroke"/><path d={grid.diagonal} stroke={gridAppearance.diagonalColor} strokeOpacity=".55" strokeWidth={Math.max(.1,gridAppearance.lineWidth*.64)} vectorEffect="non-scaling-stroke"/><path d={`M${paperGrid.origin[0]} ${gridRect.y}V${gridRect.y+gridRect.height}M${gridRect.x} ${paperGrid.origin[1]}H${gridRect.x+gridRect.width}`} stroke={gridAppearance.gridColor} strokeOpacity=".8" strokeWidth={gridAppearance.lineWidth} vectorEffect="non-scaling-stroke"/></g>}
      {paperVisible&&pose&&presentation&&selectedFoldFaces.length>0&&<g data-diagram-fold-selected-faces="true" pointerEvents="none">
        {presentation.visibleOrder.filter(face=>selectedFoldFaces.includes(face)).map(face=>{
          const rings=[pose.result.geometry.faces[face],...(pose.result.geometry.graph?.faces_holes?.[face]??[])];
          if(!rings[0])return null;
          const d=rings.map(ring=>ring.map((vertex,index)=>`${index?'L':'M'} ${presentation.vertices[vertex].join(' ')}`).join(' ')+' Z').join(' ');
          return <path key={face} mask={tearWindows.maskForFaces([face])} data-diagram-fold-selected-face={face} d={d} fill="#569b79" fillOpacity=".16" fillRule="evenodd" stroke="#438162" strokeOpacity=".7" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>;
        })}
      </g>}
      {paperVisible&&!vertexDraft&&cpHighlightMarkup(cpFixedHighlight,'fixed')}
      {paperVisible&&!vertexDraft&&cpHighlightMarkup(cpSelectedHighlight,'selected')}
      {paperVisible&&!vertexDraft&&cpHighlightMarkup(cpHighlight,'hovered')}
      {paperVisible&&paintedFoldPreview.length>0&&<DiagramFoldPreviewLayer segments={styledFoldPreview} units={units} adaptiveLines={adaptiveLines} clips={localFoldClips} tearWindows={tearWindows} showCursorHint={showCursorHint}/>}
      <DiagramImageLayer images={images} selectedId={selectedImageId} interactive={active&&!disabled&&tool==='select'} units={units} commandToken={commandToken} point={(x,y)=>{const p=point(x,y);return p&&inZoom(p)?p:null;}} onSelect={id=>imageCallbacks.current.onSelectImage?.(id)} onStart={()=>{clearGesture();pinView();callbacks.current.onSelectedIds([],{});callbacks.current.onSelect({group:[],selected:[]});}} onChange={onImagesChange} onGestureChange={setImageGestureMoving}/>
      </g>
      {renderedItems.filter((_,index)=>visibleItems[index].kind==='line')}
      {boundaryOverlay&&<g data-diagram-visible-boundaries="true" clipPath={paperClip} pointerEvents="none" dangerouslySetInnerHTML={{__html:boundaryOverlay}}/>}
      {renderedItems.filter((_,index)=>visibleItems[index].kind==='symbol')}
      {constructionIds.length>0&&<g clipPath={paperClip} pointerEvents="none">{references.filter(a=>constructionIds.includes(a.id)).map(a=><line key={a.id} x1={a.a[0]} y1={a.a[1]} x2={a.b[0]} y2={a.b[1]} stroke="#658d77" strokeWidth={radius} strokeOpacity=".35"/>)}</g>}
      {hoveredPoint&&!lineSnap&&<g clipPath={paperClip}><g data-diagram-point-hover={hoveredPoint.kind} data-snap-point-x={hoveredPoint.point[0]} data-snap-point-y={hoveredPoint.point[1]} pointerEvents="none" transform={`translate(${hoveredPoint.point.join(' ')})`}>
        <circle r={units*8} fill="#218bc1" fillOpacity=".12"/>
        <circle r={units*3.2} fill="#218bc1" stroke="#fffefa" strokeWidth={units*1.3}/>
        {showCursorHint&&<g data-diagram-hover-label="true" transform={`rotate(${-viewportAngle})`}><text x={units*9} y={-units*8} fontSize={units*10} fill="#2e718b" stroke="#fffefa" strokeWidth={units*3} paintOrder="stroke">{hoveredPoint.label}</text></g>}
      </g></g>}
      {precisionAnchor&&<g clipPath={paperClip} data-diagram-precision-preview="true" pointerEvents="none">
        {precisionPreview&&<line x1={precisionAnchor[0]} y1={precisionAnchor[1]} x2={precisionPreview.endpoint[0]} y2={precisionPreview.endpoint[1]} stroke="#527d89" strokeWidth={units} strokeDasharray={`${units*5} ${units*4}`}/>}
        <circle cx={precisionAnchor[0]} cy={precisionAnchor[1]} r={units*3.5} fill="#527d89"/>
        {precisionPreview&&<circle data-diagram-precision-point-preview="true" cx={precisionPreview.point[0]} cy={precisionPreview.point[1]} r={units*4} fill="#218bc1" stroke="#fffefa" strokeWidth={units*1.5}/>}
      </g>}
      {tool==='mirror-copy'&&mirrorAxis&&<g clipPath={paperClip} data-diagram-mirror-axis="true" data-axis-a-x={mirrorAxis.a[0]} data-axis-a-y={mirrorAxis.a[1]} data-axis-b-x={mirrorAxis.b?.[0]} data-axis-b-y={mirrorAxis.b?.[1]} data-axis-ready={!!mirrorAxis.b} pointerEvents="none" aria-hidden="true">
        {(()=>{const b=mirrorAxis.b??mirrorPointer;if(!b||dist(mirrorAxis.a,b)<1e-8)return null;const a=mirrorAxis.a,length=dist(a,b),extent=Math.hypot(gridRect.width,gridRect.height)*2,dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length;return <>
          <line x1={a[0]-dx*extent} y1={a[1]-dy*extent} x2={a[0]+dx*extent} y2={a[1]+dy*extent} stroke="#7663a2" strokeOpacity=".65" strokeWidth={units} strokeDasharray={`${units*6} ${units*4}`}/>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#7663a2" strokeWidth={units*1.5}/>
          <circle cx={b[0]} cy={b[1]} r={units*4} fill="#7663a2" stroke="#fffefa" strokeWidth={units*1.5}/>
          <text x={b[0]+units*7} y={b[1]-units*7} fontSize={units*11} fill="#64518e" stroke="#fffefa" strokeWidth={units*3} paintOrder="stroke">B</text>
        </>;})()}
        <circle cx={mirrorAxis.a[0]} cy={mirrorAxis.a[1]} r={units*4} fill="#7663a2" stroke="#fffefa" strokeWidth={units*1.5}/>
        <text x={mirrorAxis.a[0]+units*7} y={mirrorAxis.a[1]-units*7} fontSize={units*11} fill="#64518e" stroke="#fffefa" strokeWidth={units*3} paintOrder="stroke">A</text>
      </g>}
      {tool==='mirror-copy'&&mirrorPreview.annotations.length>0&&<g data-diagram-mirror-preview="true" opacity=".55" pointerEvents="none" aria-hidden="true">{mirrorPreview.annotations.map(annotation=><g key={annotation.id} clipPath={annotation.kind==='line'?paperClip:undefined} data-diagram-mirror-source={annotation.id} dangerouslySetInnerHTML={{__html:diagramAnnotationMarkup(paintAnnotation(annotation),lineDisplay)}}/>)}</g>}
      {lineDraft&&dist(lineDraft.a,lineDraft.b)>1e-8&&<g clipPath={paperClip} pointerEvents="none" data-diagram-line-draft="true" dangerouslySetInnerHTML={{__html:diagramAnnotationMarkup(paintAnnotation(lineDraft),lineDisplay)}}/>}
      {lineSnap&&lineDraft&&active&&!disabled&&(tool==='line'||tool==='polyline')&&<g clipPath={paperClip}><DiagramLineSnapOverlay snap={lineSnap} anchor={lineDraft.a} units={units} viewportAngle={viewportAngle} showLabel={showCursorHint}/></g>}
      {tool==='symbol'&&active&&!disabled&&symbolPointer?.point&&<g data-diagram-symbol-placement-preview="true" data-preview-symbol={symbol} opacity=".6" pointerEvents="none" aria-hidden="true" dangerouslySetInnerHTML={{__html:diagramAnnotationMarkup(symbolAt(symbol,symbolPointer.point,'symbol-placement-preview'))}}/>}
      {tool==='select'&&chosen.length>0&&<g data-diagram-selection="true">
        {chosen.filter(paperAnnotationVisible).map(annotation=>{
          if(isDiagramCPExistingLine(annotation))return <line key={annotation.id} clipPath={paperClip} data-diagram-existing-crease-selected={annotation.id} data-diagram-line-selected-faces={selectedFaceLabel(annotation.id)} x1={annotation.a[0]} y1={annotation.a[1]} x2={annotation.b[0]} y2={annotation.b[1]} stroke="#218bc1" strokeOpacity=".65" strokeWidth={units*2} pointerEvents="none"/>;
          if(annotation.kind==='line')return [annotation.a,annotation.b].map((p,i)=><rect key={annotation.id+'-'+i} clipPath={paperClip} data-diagram-line-handle={i?'b':'a'} data-diagram-line-selected-faces={selectedFaceLabel(annotation.id)} x={p[0]-radius} y={p[1]-radius} width={radius*2} height={radius*2} fill="#fffefa" stroke="#426f59" strokeWidth={radius/3} style={{cursor:'crosshair'}} aria-label={i?'折线终点':'折线起点'} onPointerDown={e=>startObject(e,annotation,i?'b':'a')}/>);
          const grips=displayedSymbolGrips(annotation);
          const baseline=symbolNativeBaseline(annotation);
          // Keep the positioning grip accessible when a straight curve passes through its center.
          const ordered=[...grips.filter(g=>g.kind==='component'),...grips.filter(g=>g.kind!=='component'&&g.id!=='center'),...grips.filter(g=>g.id==='center')];
          return <g key={annotation.id} onDoubleClick={e=>{if(isDiagramRotationSymbol(annotation.symbol)){e.preventDefault();e.stopPropagation();editTurnAngle(annotation);}}}>
            {showSymbolBaseline&&baseline&&<line data-symbol-baseline={annotation.id} x1={baseline.start[0]} y1={baseline.start[1]} x2={baseline.end[0]} y2={baseline.end[1]} stroke="#e5534f" strokeWidth={units*1.2} pointerEvents="none"/>}
            {ordered.map(grip=>{const semantic=diagramGripFunction(grip),style=DIAGRAM_GRIP_STYLES[semantic],r=radius*(semantic==='move'||semantic==='rotate'?1.25:.9);return <g key={grip.id} data-symbol-native-grip={grip.id} data-symbol-id={annotation.id} data-native-grip-kind={grip.kind} data-grip-function={semantic} data-grip-anchor-x={grip.anchorPoint[0]} data-grip-anchor-y={grip.anchorPoint[1]} data-grip-displaced={grip.displaced||undefined} data-symbol-component={grip.component} aria-label={`${style.label}：${grip.label}`} style={{cursor:'move'}} onPointerDown={e=>startObject(e,annotation,'native',grip.id)}>
          <circle cx={grip.point[0]} cy={grip.point[1]} r={radius*2} fill="transparent" stroke="none" pointerEvents="all"/>
          {style.shape==='circle'?<circle cx={grip.point[0]} cy={grip.point[1]} r={r} fill={style.color} stroke="#fffefa" strokeWidth={radius*.25} pointerEvents="none"/>:<rect x={grip.point[0]-r} y={grip.point[1]-r} width={r*2} height={r*2} transform={style.shape==='diamond'?`rotate(45 ${grip.point.join(' ')})`:undefined} fill={style.color} stroke="#fffefa" strokeWidth={radius*.25} pointerEvents="none"/>}
          {showCursorHint&&<title>{`${style.label} · ${grip.label}${semantic==='mirror'?' · 点击切换方向':semantic==='rotate'?' · 原插件旋转参数 · Alt 暂停吸附':semantic==='scale'?' · 沿基线或组件方向调整':' · Alt 暂停吸附'}`}</title>}
        </g>;})}
          </g>;
        })}
      </g>}
      {callouts.length>0&&<g clipPath={paperClip}><DiagramCalloutLayer callouts={callouts} selectedId={selectedCalloutId} editable={active&&!disabled&&tool==='select'} onSelect={id=>onSelectCallout?.(id)} onChange={next=>onCalloutsChange?.(next)} paperMarkup={calloutPaperMarkup} cpMarkup={calloutCPMarkup} units={units} stroke={view.colors?.line}/></g>}
      {paperVisible&&tool==='vertex'&&vertexPose&&vertexResult&&active&&<g clipPath={paperClip}><FoldedVertexOverlay key={stretchReset} stretchEdges={stretchEdges} result={vertexResult} projectionVertices={vertexPose.result.geometry.vertices} projectionCenter={view.projectionCenter} vertexOrder={vertexOrder} back={view.side==='back'} rotation={view.rotation} radius={radius} selection={selection} onSelect={onSelect} onMove={(chosen,destination)=>onMove(chosen,destination,zoomRegion?normalView:withCamera(rectRef.current),vertexPose)} onPreviewChange={setVertexDraft} disabled={disabled} showMarkers={false} visibleVertices={visibleVertices} mode="wireframe" onHint={(point,dragging)=>setHint(point?{point,dragging}:null)}/></g>}
      {paperVisible&&foldLinkFixed&&<g clipPath={paperClip}><g data-diagram-fold-fixed="true" pointerEvents="none" transform={`translate(${foldLinkFixed[0]} ${foldLinkFixed[1]})`}>
        <path d={`M${-units*8} 0H${units*8}M0 ${-units*8}V${units*8}`} stroke="#b36b32" strokeWidth="1.25" vectorEffect="non-scaling-stroke"/>
        <circle r={units*4} fill="#b36b32" stroke="#fffefa" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>
        {showCursorHint&&<title>本步固定位置</title>}
      </g></g>}
      <g data-diagram-zoom-instructions="true" pointerEvents="none" dangerouslySetInnerHTML={{__html:zoomInstructions}}/>
      {zoomSelectionRegion&&<path data-diagram-zoom-selection={zoomSelectionRegion.kind} d={diagramZoomRegionPath(zoomSelectionRegion)} fill="#426f59" fillOpacity=".08" stroke="#426f59" strokeWidth="1.25" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
      {divisionEditor&&<foreignObject data-diagram-division-editor={divisionEditor.id} x={divisionEditor.point[0]-units*43} y={divisionEditor.point[1]-units*31} width={units*86} height={units*34} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onContextMenu={e=>e.stopPropagation()}>
        <input autoFocus type="number" step="any" aria-label={`等分标记${divisionEditor.label}`} title="输入正数比例；Enter 保存，Esc 取消" value={divisionEditor.value} onFocus={e=>e.currentTarget.select()} onChange={e=>{const editor={...divisionEditor,value:e.currentTarget.value};divisionEditorRef.current=editor;setDivisionEditor(editor);}} onBlur={()=>finishDivisionNumber(true)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finishDivisionNumber(false);}else if(e.key==='Enter'){e.preventDefault();finishDivisionNumber(true);}}} style={{width:'100%',height:'100%',boxSizing:'border-box',fontSize:units*14,textAlign:'center',padding:`0 ${units*5}px`,border:`${units}px solid #426f59`,borderRadius:units*4,color:'#293d35',background:'#fffefa'}}/>
      </foreignObject>}
      {turnEditor&&(()=>{const a=items.find(a=>a.id===turnEditor.id);if(!a||a.kind!=='symbol')return null;return <foreignObject data-diagram-turn-editor={a.id} x={a.position[0]-units*43} y={a.position[1]-units*17} width={units*86} height={units*34} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onContextMenu={e=>e.stopPropagation()}>
        <input autoFocus type="number" min="0" max="360" step="any" aria-label="符号旋转角度（度）" title="0～360°；Enter 保存，Esc 取消" value={turnEditor.value} onFocus={e=>e.currentTarget.select()} onChange={e=>{const next={id:a.id,value:e.currentTarget.value};turnEditorRef.current=next;setTurnEditor(next);}} onBlur={()=>finishTurnAngle(true)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finishTurnAngle(false);}else if(e.key==='Enter'){e.preventDefault();if(e.currentTarget.checkValidity()&&e.currentTarget.value.trim())finishTurnAngle(true);else e.currentTarget.reportValidity();}}} style={{width:'100%',height:'100%',boxSizing:'border-box',fontSize:units*14,textAlign:'center',padding:`0 ${units*5}px`,border:`${units}px solid #426f59`,borderRadius:units*4,color:'#293d35',background:'#fffefa'}}/>
      </foreignObject>;})()}
      </g>
      {box&&(()=>{const a=rotateDiagramViewportPoint(box.a,viewportCenter,viewportAngle),b=rotateDiagramViewportPoint(box.b,viewportCenter,viewportAngle);return <rect data-diagram-box-selection={box.deleting?undefined:true} data-diagram-box-delete={box.deleting?true:undefined} x={Math.min(a[0],b[0])} y={Math.min(a[1],b[1])} width={Math.abs(b[0]-a[0])} height={Math.abs(b[1]-a[1])} fill={box.deleting?'#d45149':'#426f59'} fillOpacity={box.deleting?'.13':'.08'} stroke={box.deleting?'#c3433c':'#426f59'} strokeWidth={radius/4} strokeDasharray={`${radius} ${radius}`} pointerEvents="none"/>;})()}
    </svg>
    {tool==='mirror-copy'&&active&&!disabled&&<div className="diagram-mirror-actions" data-diagram-mirror-controls="true" role="group" aria-label="镜像复制操作">
      <span role="status">{mirrorPreview.error||(!mirrorAxis?'点击镜像轴第一点 A':!mirrorAxis.b?'点击第二点 B，预览镜像副本':`将复制 ${mirrorSource.length} 个对象 · Enter 确认`)}<small>Shift 45° · Alt 暂停吸附 · 右键 / Esc 取消</small></span>
      <button type="button" className="diagram-mirror-confirm" disabled={!mirrorAxis?.b||!mirrorPreview.annotations.length||!!mirrorPreview.error} onClick={finishMirrorCopy}>确认镜像</button>
      <button type="button" disabled={!mirrorAxis} onClick={()=>{setMirrorAxis(null);setMirrorPointer(null);setNotice('');}}>重选镜像轴</button>
      <button type="button" onClick={cancelMirrorCopy}>取消镜像</button>
    </div>}
    {active&&!disabled&&tool==='select'&&creaseActions&&!gestureMoving&&!drag.current&&!objectDraft&&!box&&!vertexDraft&&<DiagramCreaseToolbar svg={svg} scene={scene} points={creaseToolbarPoints} viewKey={`${visible.x},${visible.y},${visible.width},${visible.height},${viewportAngle},${viewportCenter.join(',')}`}>
      {creaseActions}
    </DiagramCreaseToolbar>}
    {tool==='symbol'&&active&&!disabled&&symbolPointer&&!symbolPointer.point&&<div className="diagram-symbol-placement-thumbnail" data-diagram-symbol-cursor-preview="true" data-preview-symbol={symbol} aria-hidden="true" style={{left:Math.max(4,Math.min(symbolPointer.client[0]+14,window.innerWidth-64)),top:Math.max(4,Math.min(symbolPointer.client[1]+14,window.innerHeight-64)),color}}><svg viewBox="-50 -50 100 100" dangerouslySetInnerHTML={{__html:symbolThumbnail}}/></div>}
    {tool==='vertex'&&active&&paperVisible&&<div className="diagram-stretch-controls" role="group" aria-label="拖角方式">
      <button type="button" disabled={disabled} aria-pressed={!stretchSegments} onClick={()=>{setVertexDraft(null);setStretchSegments(false);}}>自由拖角</button>
      <button type="button" disabled={disabled} aria-pressed={stretchSegments} onClick={()=>{setVertexDraft(null);setStretchSegments(true);}}>连段拉伸</button>
      {stretchSegments&&<button type="button" disabled={disabled} onClick={()=>{setVertexDraft(null);setStretchReset(n=>n+1);}}>重选线段</button>}
      <span role="status">{stretchSegments?'点选已有线段，再点共线的相连段延长选择；拖动两端圆点，中间节点跟随。':'拖动单个纸角。'}</span>
    </div>}
    {depthPreview&&<><div style={{position:'absolute',inset:0,zIndex:4}} onPointerDown={e=>{e.preventDefault();e.stopPropagation();}}/><span className="diagram-depth-preview-status" role="status">预览中 · 松开应用</span></>}
    {depthCameraVisible&&paperVisible&&pose&&drawingView.depth&&onDepthPreview&&onDepthCommit&&<DiagramDepthCamera value={drawingView.depth} width={size.width} height={size.height} side={drawingView.side} viewRotation={drawingView.rotation} drawingRotation={viewportAngle} onPreview={onDepthPreview} onCommit={onDepthCommit}/>}
    <div className="diagram-canvas-controls" role="group" aria-label="主图视图控制">
      {hover&&<span className="diagram-canvas-position">X {hover[0].toFixed(1)} · Y {hover[1].toFixed(1)}</span>}
      <div className="diagram-canvas-actions">
        {onCursorHintChange&&<CanvasCursorHintToggle checked={showCursorHint} onChange={onCursorHintChange} disabled={disabled||!active}/>}
        <button type="button" disabled={disabled||!active} aria-label="主图缩小" title="缩小主图" onClick={()=>zoomBy(1.25)}>−</button>
        <output className="diagram-canvas-zoom" aria-label="主图缩放比例">{Math.round(fitFrame.width/rect.width*100)}%</output>
        <button type="button" disabled={disabled||!active} aria-label="主图放大" title="放大主图" onClick={()=>zoomBy(.8)}>+</button>
        <button type="button" disabled={disabled||!active||orientationLocked} aria-label="主图向左旋转 15 度" title={orientationLocked?'请先解除固定朝向':'整个主图向左旋转 15°，保存并用于导出'} onClick={()=>rotateViewport(-15)}>↶</button>
        <button type="button" disabled={disabled||!active||orientationLocked} className="diagram-canvas-angle" aria-label="复位主图旋转" title={orientationLocked?'请先解除固定朝向':'将整个主图旋转复位到 0°，保存并用于导出'} onClick={resetViewportRotation}>{viewportAngle}°</button>
        <button type="button" disabled={disabled||!active||orientationLocked} aria-label="主图向右旋转 15 度" title={orientationLocked?'请先解除固定朝向':'整个主图向右旋转 15°，保存并用于导出'} onClick={()=>rotateViewport(15)}>↷</button>
        <button type="button" disabled={disabled||!active} aria-label="适应主图" title="适应折图及全部绘图对象" onClick={fitViewport}>适应</button>
      </div>
    </div>
    {notice&&<div role="status" style={{position:'absolute',left:14,bottom:16,fontSize:10,color:'#537761',pointerEvents:'none'}}>{notice}</div>}
    {showCursorHint&&hint&&tool==='vertex'&&<div className="diagram-vertex-tooltip" style={{left:Math.min(hint.point[0]+14,window.innerWidth-235),top:Math.max(8,hint.point[1]-42)}}>{hint.dragging?(stretchSegments?'松开应用整段拉伸':'松开应用二维修形'):(stretchSegments?'拖动端点，中间节点跟随':'拖动选中的重合顶点成员')}</div>}
  </>;
}
