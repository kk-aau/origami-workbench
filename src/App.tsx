import {useWebTablet} from './app/useWebTablet';
import TabletPanelBar,{TabletPanelHeading} from './components/TabletPanelBar';
import {WEB_APP,appAsset} from './app/webRuntime';
import WebEditionNotice from './components/WebEditionNotice';
import {copyMaterialComponents} from './core/materialCopy';
import {preferenceStorage} from './app/preferenceStorage';
import StorageSettings from './components/StorageSettings';
import HeaderMenu,{ChromeIcon} from './components/HeaderMenu';
import WindowControls,{handleDesktopTitlebarMouseDown} from './components/WindowControls';
import {storageBootstrapStatus,storageBootstrapError,readStorageStatus,pickStorageDirectory,applyStorageDirectories,type StorageStatus,type StorageDirectoryKind} from './app/storageSettings';
import {confirmAction} from './app/confirmAction';
import AppDialog from './components/AppDialog';
import { useEffect, useMemo, useReducer, useRef, useState, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import type { Assignment, DiagnosticResult, Doc, DocumentFormat, FlatFoldResult, FoldGraph, Point, FoldingConstraint } from './core/types';
import { validateDoc } from './core/types';
import { upgradeProject } from './core/project';
import { resizeDocument } from './app/drawingObjects';
import {emptyMeasurements,setMeasurement,type MeasurementRegister,type LengthRegister,type measureLength} from './app/measurements';
import { TOOL_GUIDES } from './app/tools';
import { buildFold, splitIntersections } from './core/geometry';
import { diagnose } from './core/diagnostics';
import {diagnosticHighlights} from './app/diagnosticHighlights';
import { exportDocument, importDocument } from './core/formats';
import UsageTutorial from './components/UsageTutorial';
import {startProjectImport,startSavedProjectImport,type ProjectImportTask,type SavedProjectImportInfo} from './app/projectImportTask';
import {installRuntimeActivityLogging,recordActivity} from './app/activityLog';
import ActivityLogPanel from './components/ActivityLogPanel';
import {selectProjectFile} from './app/selectProjectFile';
import CreaseLibrary from './components/CreaseLibrary';
import {CREASE_LIBRARY_KEY,emptyCreaseLibraryPreferences,readCreaseLibraryPreferences,saveCreaseLibraryPreferences,createCreaseLibraryFolder,moveCreaseLibraryDocument,markCreaseLibraryDocumentOpen,removeCreaseLibraryDocument,type CreaseLibraryPreferences} from './app/creaseLibraryPreferences';
import {exportDXF} from './core/dxf';
import CPProcessingExportDialog from './components/CPProcessingExportDialog';
import {exportModelSnapshot} from './core/modelSnapshot';
import {prepareModelSnapshot} from './app/modelSnapshot';
import {exportModelCollection,prepareModelCollection} from './app/modelCollectionFile';
import {exportArtworkProject,prepareArtworkProject,type ArtworkProject} from './app/artworkProject';
import {useArtworkRecovery} from './app/useArtworkRecovery';
import {createArtworkSerializationClient} from './app/artworkSerializationTask';
import {artworkSerializationInput} from './app/artworkSerialization';
import type {ArtworkRecoverySummary} from './app/artworkRecovery';
import ArtworkOverview,{type ArtworkOverviewRow} from './components/ArtworkOverview';
import {editableCanvasSelection,deleteCanvasSelection} from './app/canvasSelection';
import type {SimulationPose} from './engine/simPose';
import {simulationSourceSignature} from './engine/simLayerOrder';
import TessFlatPane from './components/TessFlatPane';
import TessRigidPane from './components/TessRigidPane';
import './components/tessRigidPane.css';
import {spatialMeshScene} from './app/spatialMeshView';
import {tessFlatInput,tessFlatRoot} from './app/tessellationFlat';
import {wovenMaterialDocument} from './app/wovenMaterialDocument';
import {canAdoptWovenCP,wovenCPDocument} from './app/wovenCPDocument';
import {canAdoptDiscreteCurveCP,discreteCurveCPDocument} from './app/discreteCurveCP';
import {hasMaterialTopology,inspectMaterialTopology} from './core/materialTopology';
import {hasWovenInternalBoundary} from './app/tessellation';
import {primalDualFaceupRoot} from './app/primalDualFaceup';
import {useTilePatchLayerCheck} from './app/useTilePatchLayerCheck';
import { startFlatFold, startFlatLayerReanalysis } from './core/workerClient';
import type {FlatComputationProgress} from './core/flatComputationProgress';
import { api, apiText, apiSerialized, connect, deleteProject, download, saveDownload, safeName } from './app/api';
import {documentRequestJson} from './app/documentRequest';
import { getDrawingBounds, getPaperBounds, paperPath } from './app/paper';
import {rasterizeSVG,downloadRaster} from './app/rasterExport';
import {completeCreasePatternSVG,cpPrintHTML} from './app/creasePatternExport';
import { chooseRecovery, saveRecoveryCopies, type RecoverySnapshot } from './app/recovery';
import { splitEditableSegments } from './app/planarize';
import {prepareEditorCommit,type EditorMaterialIntent} from './app/editorCommit';
import MaterialPieceSelector from './components/MaterialPieceSelector';
import { trimBranches } from './app/branchTrim';
import {pasteDrawingObjects,cutDrawingSelection} from './app/selectionClipboard';
import {copyWorkbenchSelection,isMaterialClipboard,clipboardDescription,cutMaterialSelection,type WorkbenchClipboard,type MaterialClipboard} from './app/materialClipboard';
import SelectionClipboardPanel from './components/SelectionClipboardPanel';
import MaterialPasteDialog from './components/MaterialPasteDialog';
import MaterialClipboardCutDialog from './components/MaterialClipboardCutDialog';
import {editMaterialFaces,type MaterialFaceEditIntent} from './core/materialFaceEdit';
import {buildMaterialLineProperties,type MaterialPropertyOperation} from './core/materialLineProperties';
import FoldAnglePanel from './components/FoldAnglePanel';
import {setSelectedFoldAngle,summarizeFoldAngles} from './app/foldAngles';
import {inspectMaterialCurveModel} from './core/materialCurveModel';
import { repairOverlappingSegments, repairTJunctions } from './app/diagnosticRepairs';
import { checkCamv } from './app/camv';
import { clampGridDivisions, DEFAULT_GRID_DIVISIONS } from './app/gridControls';
import { readDisplayLayers, saveDisplayLayers, type DisplayLayers } from './app/displayLayers';
import { readTheme, saveTheme, type Theme } from './app/theme';
import { readGridAppearance, saveGridAppearance, type GridAppearance } from './app/gridAppearance';
import { assign, blankDoc, COLORS, exampleDoc, line, NAMES, transformSelection, VERSION } from './app/state';
import {applySelectedFoldSwap} from './app/regionalSwap';
import {emptyEditorHistory,editorHistoryReducer} from './app/editorHistory';
import {readSelectionPersistence,saveSelectionPersistence,selectionAfterOperation,selectionAfterCommit} from './app/selectionPersistence';
import ToolShortcutSettings from './components/ToolShortcutSettings';
import CreaseDisplaySettings from './components/CreaseDisplaySettings';
import CanvasZoomSettings from './components/CanvasZoomSettings';
import CanvasPickingSettings from './components/CanvasPickingSettings';
import ThemeSettings from './components/ThemeSettings';
import GridAppearanceSettings from './components/GridAppearanceSettings';
import {readCanvasPicking,saveCanvasPicking} from './app/canvasPicking';
import {readCanvasZoom,saveCanvasZoom} from './app/canvasZoom';
import {readCreaseDisplay,saveCreaseDisplay,type CreaseDisplay} from './app/creaseDisplay';
import CanvasSettingsPanel from './components/CanvasSettingsPanel';
import './components/canvasSidebar.css';
import {readToolShortcuts,saveToolShortcuts,matchToolShortcut} from './app/toolShortcuts';
import {readToolCommandInput,saveToolCommandInput,toolCommandCharacter,TOOL_COMMAND_INPUT_CHANGED} from './app/toolCommandInput';
import ToolCommandBar,{type ToolCommandBarHandle} from './components/ToolCommandBar';
import {TOOL_COMMANDS} from './app/toolCommands';
import {useToolCommands} from './app/toolCommandPreferences';
import ToolCommandSettings from './components/ToolCommandSettings';
import CreaseCanvas, { TOOL_NAMES, type Tool } from './components/CreaseCanvas';
import {canSwapGeneratedLines} from './app/drawingSwap';
import { Icon, NumberField } from './components/Fields';
import { SimulatorBridge, type SimulatorStatus } from './engine/simulator';
import {simulationLayerOrder,simulationLayerOrderSupported,type SimulationLayerOrder} from './engine/simLayerOrder';
import SimulationControls,{type SimulationControlsHandle} from './components/SimulationControls';
import ToolRail from './components/ToolRail';
import {useToolLayout} from './components/useToolLayout';
import ToolLayoutEditor from './components/ToolLayoutEditor';
import type {ToolLayoutActions} from './components/CustomToolGroups';
import ToolSettingsDialog from './components/ToolSettingsDialog';
import './components/compactToolbars.css';
import ConstructionRail from './components/ConstructionRail';
import './components/softWorkbench.css';
import ToolLibrary from './components/ToolLibrary';
import {mergeAllVertices,mergeAllCrossTypeVertices} from './app/mergeAllVertices';
import MergeCrossVertices from './components/MergeCrossVertices';
import PanelDivider from './components/PanelDivider';
import BackgroundPanel from './components/BackgroundPanel';
import FlatView from './components/FlatView';
import {FlatConflictOverlay,conflictPoints,sourceConflictResult,visibleFlatConflicts} from './components/FlatConflictDetails';
import {useFlatNavigation,type FlatNavigationTarget} from './components/useFlatNavigation';
import FlatComputationStatus from './components/FlatComputationStatus';
import {flatComputationStatus} from './app/flatComputationStatus';
import {copyModelView,defaultModelView,type ModelViewState} from './app/modelViewState';
import FoldDisplayBar from './components/FoldDisplayBar';
import {extractFoldSelection,isFoldSourceCurrent,independentFoldBoundaryCount,pickFoldTarget,foldSourceCpKey} from './app/foldSelection';
import {modelProjection} from './app/modelProjection';
import {emptyFoldResult} from './core/flatFold';
import {defaultModelColors} from './app/modelColors';
import LayerSolutionsPanel from './components/LayerSolutionsPanel';
import LayerBatchPanel from './components/LayerBatchPanel';
import {activeFoldedModel,collectionHasUnsavedEdits,emptyFoldedModelCollection,foldedModelCollectionReducer,modelAnalysisTicket,countFoldedModelsForCp,MAX_FOLDED_MODELS_PER_CP,type ModelCollectionAction,type FoldedModelEntry} from './app/foldedModelCollection';
import FoldedVertexPanel from './components/FoldedVertexPanel';
import type {ModelVertexEditMode} from './components/FoldedVertexOverlay';
import {hasUnsavedModelEdits,emptyFoldedModelHistory,foldedModelHistoryReducer,type FoldedModelAction} from './app/foldedModelHistory';
import {selectFoldedVertex,moveFoldedVertices,type FoldedVertexSelection} from './app/foldedVertexEdit';
import {resolveStartingFace} from './app/flatFoldSettings';
import type {BackgroundView} from './app/backgroundAnchor';
import {frameWorldBounds,type OperationFrame} from './app/operationFrame';
import {cropBackground} from './app/backgroundCrop';
import { DEFAULT_PANELS, PANEL_KEY, TOOL_PANEL_MAX, panelWidths, readPanels } from './app/panelLayout';
import './components/workbenchLayout.css';
import TessellationPanel from './components/TessellationPanel';
import CurvedAcrossRightLinearAngleDialog from './components/CurvedAcrossRightLinearAngleDialog';
import ConicCircleCPDialog from './components/ConicCircleCPDialog';
import {conicCircleCPSourceMatches,readConicCircleCPRecipe} from './app/conicCircleCP';
import ConicNoncircleCPDialog from './components/ConicNoncircleCPDialog';
import PlanarRuledCP4040Dialog from './components/PlanarRuledCP4040Dialog';
import ConeFourPlaneCP4039Dialog from './components/ConeFourPlaneCP4039Dialog';
import NonuniformSpiralCP3968Dialog from './components/NonuniformSpiralCP3968Dialog';
import {nonuniformSpiralCP3968SourceMatches,readNonuniformSpiralCP3968Recipe} from './app/nonuniformSpiralCP3968';
import UniformHelixCP3951Dialog from './components/UniformHelixCP3951Dialog';
import {uniformHelixCP3951SourceMatches,readUniformHelixCP3951Recipe} from './app/uniformHelixCP3951';
import SpiralRefoldCP3980Dialog from './components/SpiralRefoldCP3980Dialog';
import {spiralRefoldCP3980SourceMatches,readSpiralRefoldCP3980Recipe} from './app/spiralRefoldCP3980';
import UniformHelixGeneralCP3951Dialog from './components/UniformHelixGeneralCP3951Dialog';
import {uniformHelixModeSourceMatches,readUniformHelixModeRecipe} from './app/uniformHelixGeneralCP3951Mode';
import NonuniformHelixGeneralCP3966Dialog from './components/NonuniformHelixGeneralCP3966Dialog';
import LinkedBandsPlanarCP4086Dialog from './components/LinkedBandsPlanarCP4086Dialog';
import HuffmanFiniteCPDialog from './components/HuffmanFiniteCPDialog';
import {huffmanFiniteCPSourceMatches,readHuffmanFiniteCPRecipe} from './app/huffmanFiniteCP';
import AltMoselyFiniteCP3556Dialog from './components/AltMoselyFiniteCP3556Dialog';
import {altMoselyFiniteCPSourceMatches,readAltMoselyFiniteRecipe} from './app/altMoselyFiniteCP3556';
import EllipseAcrossFiniteCPDialog from './components/EllipseAcrossFiniteCPDialog';
import {ellipseOpticalCP4034SourceMatches,readEllipseOpticalCP4034Recipe,acrossDescendingCP3988SourceMatches,readAcrossDescendingCP3988Recipe} from './app/ellipseAcrossFiniteCP';
import {readLinkedBandsPlanarCP4086Recipe,linkedBandsPlanarCP4086SourceMatches} from './app/linkedBandsPlanarCP4086';
import MiuraHuffmanCPDialog from './components/MiuraHuffmanCPDialog';
import YoshimuraMiuraCP2534Dialog from './components/YoshimuraMiuraCP2534Dialog';
import YoshimuraSixCP2507Dialog from './components/YoshimuraSixCP2507Dialog';
import WaterbombTessellation2604Dialog from './components/WaterbombTessellation2604Dialog';
import {readOriginalArraySource,originalArraySourceMatches,sameOriginalArrayFamily,type OriginalArrayKind} from './app/originalArraySource';
import LinearSpacePolyhedralCPDialog from './components/LinearSpacePolyhedralCPDialog';
import {readLinearSpacePolyhedralCPRecipe,linearSpacePolyhedralCPSourceMatches} from './app/linearSpacePolyhedralCP';
import GeneralSpacerMiuraCPDialog from './components/GeneralSpacerMiuraCPDialog';
import {readGeneralSpacerMiuraRecipe,generalSpacerMiuraSourceMatches} from './app/generalSpacerMiuraCP';
import FlutedMultiSliceConeCPDialog from './components/FlutedMultiSliceConeCPDialog';
import {readFlutedMultiSliceConeRecipe,flutedMultiSliceConeSourceMatches} from './app/flutedMultiSliceConeCP';
import GenericSpacePaperBridgeDialog from './components/GenericSpacePaperBridgeDialog';
import {readGenericSpacePaperRecipe,genericSpacePaperSourceMatches} from './app/genericSpacePaperBridge';
import BistableTwistTubeCPDialog from './components/BistableTwistTubeCPDialog';
import {readBistableTwistTubeRecipe,bistableTwistTubeSourceMatches} from './app/bistableTwistTubeCP';
import FlatTroublewitStripCPDialog from './components/FlatTroublewitStripCPDialog';
import {readFlatTroublewitStripRecipe,flatTroublewitStripSourceMatches} from './app/flatTroublewitStripCP';
import StrainTQDesignCPDialog from './components/StrainTQDesignCPDialog';
import {readStrainTQRecipe,strainTQSourceMatches} from './app/strainTQDesignCP';
import RotationalPleatsCPDialog from './components/RotationalPleatsCPDialog';
import {readRotationalPleatsCPRecipe,rotationalPleatsCPSourceMatches} from './app/rotationalPleatsCP';
import BasicPaperModelsCPDialog from './components/BasicPaperModelsCPDialog';
import {readBasicPaperModelRecipe,basicPaperModelSourceMatches} from './app/basicPaperModelsCP';
import SavedDevelopablePaperDialog from './components/SavedDevelopablePaperDialog';
import {readSavedDevelopablePaperRecipe,savedDevelopablePaperSourceMatches} from './app/savedDevelopablePaper';
import SemiGeneralMiuraCPDialog from './components/SemiGeneralMiuraCPDialog';
import {readSemiGeneralMiuraRecipe,semiGeneralMiuraSourceMatches} from './app/semigeneralMiuraCP';
import {nonuniformHelixGeneralCP3966SourceMatches,readNonuniformHelixGeneralCP3966Recipe} from './app/nonuniformHelixGeneralCP3966';
import {coneFourPlaneCP4039SourceMatches,readConeFourPlaneCP4039Recipe} from './app/coneFourPlaneCP4039';
import {planarRuledCP4040SourceMatches,readPlanarRuledCP4040Recipe} from './app/planarRuledCP4040';
import {conicNoncircleCPSourceMatches,readConicNoncircleRecipe} from './app/conicNoncircleCP';
import {boundedAcrossSourceMatches,readBoundedAcrossRecipe} from './app/boundedAcross2DCP';
import CurveDesignPane from './components/CurveDesignPane';
import {exportCurveDesignSVG,exportCurveDesignOBJ,type CurveDesign} from './app/curveDesign';
import {curveDesignDocument,curveDesignFromDocument} from './app/curveDesignProject';
import {tessPreset,prepareTessResult,canAdoptTess,canAdoptTessWithTileLayers,needsTessellationLayerCheck,previewTessDocument,tessConstructionKey,TESS_NAMES,type TessGraph,type TessParams,type TessResponse,type TessResult,type XY} from './app/tessellation';
import {unitQuadrilateralVertices} from './app/splitParams';
import {decoratedMotherTiles,reframeTileDecorations,specializedTwistTileDecorations,twistDecoratedMotherTiles,twistTileDecorations,type TileDecorations} from './app/tileDecorations';
import type {DiagramWorkspaceHandle} from './components/DiagramWorkspace';
import type {DesignWorkspaceHandle} from './components/DesignWorkspace';
const DesignWorkspace=lazy(()=>import('./components/DesignWorkspace'));
import {prepareDiagramEditorCP} from './app/diagramEditorCP';
import {prepareDiagramImage,type PreparedDiagramImage} from './app/diagramImageImport';

const DiagramWorkspace=lazy(()=>import('./components/DiagramWorkspace'));
type Mode='edit'|'tess'|'sim'|'diagram'|'design';
const MODE_NAMES:Record<Mode,string>={edit:'折痕编辑',tess:'镶嵌设计',sim:'三维模拟',diagram:'折序绘图',design:'基础形设计'};
type Project={id:string;name:string;updated:string;segments:number;kind?:'curve-design';samples?:number;draft?:boolean;thumbnail?:string};

const TYPES:Assignment[]=['M','V','B','A','F'];
const fmt=(n:number)=>Number(n.toFixed(3)).toString();
function errorText(e:unknown){return e instanceof Error?e.message:String(e);}

function TypeButtons({value,onChange,disabled=false,compact=false}:{value:Assignment|undefined;onChange:(t:Assignment)=>void;disabled?:boolean;compact?:boolean}) {return <div className={'type-buttons '+(compact?'compact':'')}>{(compact?TYPES.filter(t=>t!=='F'):TYPES).map(t=><button key={t} disabled={disabled} aria-pressed={value===t} onClick={()=>onChange(t)} title={NAMES[t]+' '+t}><i style={{background:COLORS[t]}}/>{NAMES[t]}{!compact&&<small>{t}</small>}</button>)}</div>;}

export default function App(){
  const tablet=useWebTablet();
  const [tabletPanel,setTabletPanel]=useState('');
  const toolLayout=useToolLayout();
  const [backgroundView,setBackgroundView]=useState<BackgroundView|null>(null);
  const [operationFrame,setOperationFrame]=useState<OperationFrame|null>(null),[exportFrame,setExportFrame]=useState(false);
  const [cropBusy,setCropBusy]=useState(false),cropRequest=useRef(0);
  const cropAbort=useRef<AbortController|null>(null);
  useEffect(()=>{if(!operationFrame)setExportFrame(false);},[operationFrame]);
  const [measurements,setMeasurements]=useState(emptyMeasurements);
  const [lengthDetails,setLengthDetails]=useState<Partial<Record<LengthRegister,ReturnType<typeof measureLength>>>>({});
  function storeMeasurement(register:MeasurementRegister,value:number,detail?:ReturnType<typeof measureLength>){
    setMeasurements(previous=>setMeasurement(previous,register,value));
    if(detail&&(register==='L1'||register==='L2'))setLengthDetails(previous=>({...previous,[register]:detail}));
  }
  const [panels,setPanels]=useState(readPanels),[viewport,setViewport]=useState(window.innerWidth),[libraryOpen,setLibraryOpen]=useState(false);
  const [libraryId,setLibraryId]=useState<string>();
  function openLibrary(id?:string){setLibraryId(id);setLibraryOpen(true);}
  useEffect(()=>{const resize=()=>setViewport(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  useEffect(()=>{try{preferenceStorage.setItem(PANEL_KEY,JSON.stringify(panels));}catch{}},[panels]);
  const [history,dispatchHistory]=useReducer(editorHistoryReducer,null,()=>emptyEditorHistory(splitEditableSegments(exampleDoc())));
  const dispatch:typeof dispatchHistory=action=>{
    if(action.type==='undo'&&history.past.length)recordActivity('edit.undo');
    if(action.type==='redo'&&history.future.length)recordActivity('edit.redo');
    dispatchHistory(action);
  };
  const doc=history.present,docRef=useRef(doc);docRef.current=doc;
  const storedCurveDesign=useMemo(()=>curveDesignFromDocument(doc),[doc]);
  const acrossCPRecipe=useMemo(()=>readBoundedAcrossRecipe(doc),[doc]),[acrossCPEdit,setAcrossCPEdit]=useState(false);
  const conicCircleCPRecipe=useMemo(()=>readConicCircleCPRecipe(doc),[doc]),[conicCircleCPEdit,setConicCircleCPEdit]=useState(false);
  const conicNoncircleRecipe=useMemo(()=>readConicNoncircleRecipe(doc),[doc]),[conicNoncircleEdit,setConicNoncircleEdit]=useState(false);
  const planarRuled4040Recipe=useMemo(()=>readPlanarRuledCP4040Recipe(doc),[doc]),[planarRuled4040Edit,setPlanarRuled4040Edit]=useState(false);
  const coneFourPlane4039Recipe=useMemo(()=>readConeFourPlaneCP4039Recipe(doc),[doc]),[coneFourPlane4039Edit,setConeFourPlane4039Edit]=useState(false);
  const nonuniformSpiral3968Recipe=useMemo(()=>readNonuniformSpiralCP3968Recipe(doc),[doc]),[nonuniformSpiral3968Edit,setNonuniformSpiral3968Edit]=useState(false);
  const uniformHelix3951Recipe=useMemo(()=>readUniformHelixCP3951Recipe(doc),[doc]),[uniformHelix3951Edit,setUniformHelix3951Edit]=useState(false);
  const spiralRefold3980Recipe=useMemo(()=>readSpiralRefoldCP3980Recipe(doc),[doc]),[spiralRefold3980Edit,setSpiralRefold3980Edit]=useState(false);
  const uniformHelixGeneral3951Recipe=useMemo(()=>readUniformHelixModeRecipe(doc),[doc]),[uniformHelixGeneral3951Edit,setUniformHelixGeneral3951Edit]=useState(false);
  const nonuniformHelixGeneral3966Recipe=useMemo(()=>readNonuniformHelixGeneralCP3966Recipe(doc),[doc]),[nonuniformHelixGeneral3966Edit,setNonuniformHelixGeneral3966Edit]=useState(false);
  const linkedBands4086Recipe=useMemo(()=>readLinkedBandsPlanarCP4086Recipe(doc),[doc]);
  const huffmanFiniteRecipe=useMemo(()=>readHuffmanFiniteCPRecipe(doc),[doc]),[huffmanFiniteEdit,setHuffmanFiniteEdit]=useState(false);
  const altMoselyFiniteRecipe=useMemo(()=>readAltMoselyFiniteRecipe(doc),[doc]),[altMoselyFiniteEdit,setAltMoselyFiniteEdit]=useState(false);
  const ellipseOpticalRecipe=useMemo(()=>readEllipseOpticalCP4034Recipe(doc),[doc]),acrossDescendingRecipe=useMemo(()=>readAcrossDescendingCP3988Recipe(doc),[doc]),[ellipseAcrossFiniteEdit,setEllipseAcrossFiniteEdit]=useState<'ellipse'|'across'|null>(null);
  const [linkedBands4086Dialog,setLinkedBands4086Dialog]=useState<{edit:boolean}|null>(null);
  const originalArraySource=useMemo(()=>readOriginalArraySource(doc),[doc]);
  const [originalArrayDialog,setOriginalArrayDialog]=useState<{kind:OriginalArrayKind;edit:boolean}|null>(null);
  const semiGeneralMiuraRecipe=useMemo(()=>readSemiGeneralMiuraRecipe(doc),[doc]);
  const [semiGeneralMiuraDialog,setSemiGeneralMiuraDialog]=useState<{edit:boolean}|null>(null);
  const bistableTwistTubeRecipe=useMemo(()=>readBistableTwistTubeRecipe(doc),[doc]);
  const [bistableTwistTubeDialog,setBistableTwistTubeDialog]=useState<{edit:boolean}|null>(null);
  const flutedMultiSliceConeRecipe=useMemo(()=>readFlutedMultiSliceConeRecipe(doc),[doc]);
  const [flutedMultiSliceConeDialog,setFlutedMultiSliceConeDialog]=useState<{edit:boolean}|null>(null);
  const genericSpacePaperRecipe=useMemo(()=>readGenericSpacePaperRecipe(doc),[doc]);
  const [genericSpacePaperDialog,setGenericSpacePaperDialog]=useState<{edit:boolean}|null>(null);
  const flatTroublewitStripRecipe=useMemo(()=>readFlatTroublewitStripRecipe(doc),[doc]);
  const [flatTroublewitStripDialog,setFlatTroublewitStripDialog]=useState<{edit:boolean}|null>(null);
  const basicPaperModelRecipe=useMemo(()=>readBasicPaperModelRecipe(doc),[doc]);
  const [basicPaperModelDialog,setBasicPaperModelDialog]=useState<{edit:boolean}|null>(null);
  const rotationalPleatsRecipe=useMemo(()=>readRotationalPleatsCPRecipe(doc),[doc]);
  const [rotationalPleatsDialog,setRotationalPleatsDialog]=useState<{edit:boolean}|null>(null);
  const strainTQRecipe=useMemo(()=>readStrainTQRecipe(doc),[doc]);
  const [strainTQDialog,setStrainTQDialog]=useState<{edit:boolean}|null>(null);
  const savedDevelopablePaperRecipe=useMemo(()=>readSavedDevelopablePaperRecipe(doc),[doc]);
  const [savedDevelopablePaperDialog,setSavedDevelopablePaperDialog]=useState<{edit:boolean}|null>(null);
  const linearSpaceRecipe=useMemo(()=>readLinearSpacePolyhedralCPRecipe(doc),[doc]);
  const [linearSpaceDialog,setLinearSpaceDialog]=useState<{edit:boolean}|null>(null);
  const generalSpacerRecipe=useMemo(()=>readGeneralSpacerMiuraRecipe(doc),[doc]);
  const [generalSpacerDialog,setGeneralSpacerDialog]=useState<{edit:boolean}|null>(null);
  const [dockSettings,setDockSettings]=useState<'properties'|'clipboard'|'background'|'canvashelp'|null>(null);
  const [showFlat,setShowFlat]=useState(false),[modelToolsOpen,setModelToolsOpen]=useState(false);
  useEffect(()=>{if(toolLayout.editing)setModelToolsOpen(false);},[toolLayout.editing]);
  const [flatNavigation,setFlatNavigation]=useState<FlatNavigationTarget>('crease');
  const flatNavigationPane=useRef<HTMLDivElement>(null);
  function selectFlatNavigation(target:FlatNavigationTarget){setFlatNavigation(target);}
  function zoomFlatNavigation(factor:number){
    const svg=Array.from(flatNavigationPane.current?.querySelectorAll<SVGSVGElement>('.flat-workspace > svg')??[]).find(svg=>svg.parentElement?.dataset.modelId===modelsRef.current.activeId);if(!svg)return;
    const bounds=svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:bounds.x+bounds.width/2,clientY:bounds.y+bounds.height/2,deltaY:Math.log(factor)/.002}));
  }
  function openFlat(){setMode('edit');setShowFlat(true);selectFlatNavigation('fold');}
  useEffect(()=>setTabletPanel(''),[tablet]);
  const [mode,setMode]=useState<Mode>('edit'),[tool,setTool]=useState<Tool>('select'),[preset,setPreset]=useState<Assignment>('M');
  const workspaceNavigation=useRef(0),workspaceMode=useRef(mode);workspaceMode.current=mode;
  const [drawingSwap,setDrawingSwap]=useState(false);
  useEffect(()=>{if(mode!=='edit'||!canSwapGeneratedLines(tool))setDrawingSwap(false);},[mode,tool]);
  const drawingFoldAngle=180;
  const loggedWorkspace=useRef(mode);
  useEffect(()=>{if(loggedWorkspace.current!==mode){recordActivity('workspace.switch',{previous:loggedWorkspace.current,target:mode,workspace:MODE_NAMES[mode]});loggedWorkspace.current=mode;}},[mode]);
  const [commandActivation,setCommandActivation]=useState(0);
  const [canvasFocused,setCanvasFocused]=useState(false);
  function activateDrawingTool(next:Tool){
    selectFlatNavigation('crease');
    if(next==='regionalswap'&&canSwapGeneratedLines(tool)){
      setDrawingSwap(!drawingSwap);
      recordActivity('tool.output-swap',{tool,enabled:!drawingSwap});
      inform(drawingSwap?'已关闭生成时山谷互换，继续使用当前工具。':'已开启生成时山谷互换，继续使用当前工具；再次点击可关闭。');
      return;
    }
    if(next==='regionalswap'&&chosen.length){
      const count=chosen.filter(segment=>segment.assignment==='M'||segment.assignment==='V').length;
      if(!count){inform('选中的线段没有山折或谷折，未修改。');return;}
      if(modifySwap(selected,true)){
        setTool('select');recordActivity('tool.apply',{tool:next,count});
        inform(`已互换选中的 ${count} 条山谷线，选区保留，可一次撤销。`);
      }
      return;
    }
    if(next!==tool)recordActivity('tool.select',{previous:tool,tool:next});setTool(next);
  }
  function runToolCommand(next:Tool){activateDrawingTool(next);if(next!=='regionalswap'||!canSwapGeneratedLines(tool))setCommandActivation(value=>value+1);}
  const [diagramVisited,setDiagramVisited]=useState(false),diagramRef=useRef<DiagramWorkspaceHandle>(null);
  const [designVisited,setDesignVisited]=useState(false),designRef=useRef<DesignWorkspaceHandle>(null);
  const [designArtworkRevision,setDesignArtworkRevision]=useState(0);
  const [incomingDiagramImage,setIncomingDiagramImage]=useState<{id:string;image:PreparedDiagramImage}|null>(null);
  useEffect(()=>{if(mode!=='diagram')setIncomingDiagramImage(null);},[mode]);
  const [storageStatus,setStorageStatus]=useState<StorageStatus|null>(storageBootstrapStatus);
  const [storageImportWarning,setStorageImportWarning]=useState(storageBootstrapError);
  const [storageSettingsOpen,setStorageSettingsOpen]=useState(()=>storageBootstrapStatus()?.configured===false||!!storageBootstrapStatus()?.unavailable?.length);
  const [storageInitial,setStorageInitial]=useState(()=>storageBootstrapStatus()?.configured===false);
  const [storageUnavailable,setStorageUnavailable]=useState(false),[storageBusy,setStorageBusy]=useState(false),[storageError,setStorageError]=useState('');
  async function openStorageSettings(){
    if(document.activeElement instanceof HTMLElement)flushSync(()=>document.activeElement instanceof HTMLElement&&document.activeElement.blur());
    setStorageSettingsOpen(true);setStorageBusy(true);setStorageError('');
    try{const status=await readStorageStatus();setStorageStatus(status);setStorageInitial(!status.configured&&!storageBootstrapError());setStorageUnavailable(false);}
    catch(cause){setStorageUnavailable(true);setStorageInitial(false);setStorageError((cause as Error&{status?:number}).status===404?'当前本机服务尚不支持保存目录设置，请在完成当前工作后正常启动新版服务。当前工作可以继续。':'读取保存目录未完成：'+errorText(cause));}
    finally{setStorageBusy(false);}
  }
  async function applyStorageSettings(selections:Partial<Record<StorageDirectoryKind,string>>){
    setStorageBusy(true);setStorageError('');
    try{
      const recovering=!!storageStatus?.unavailable?.length;
      if(!recovering){
      if(designRef.current&&!designRef.current.checkpoint())throw Error('设计草稿暂存未完成，请先保存或导出后再迁移。');
      if(diagramRef.current&&!await diagramRef.current.checkpoint())throw Error('绘图草稿暂存未完成，请先保存或导出后再迁移。');
      if(!await checkpointCreaseDraft())throw Error('折痕草稿暂存未完成，请先保存或导出后再迁移。');
      if(recoveryChecked&&hasCreaseDocumentRef.current)await api('recovery',{doc:docRef.current,projectId,baseRevision:projectRevisionRef.current});
      }
      const result=await applyStorageDirectories(selections,recovering);diagramRef.current?.storageChanged();designRef.current?.storageChanged();setStorageStatus(result);setStorageImportWarning('');setStorageInitial(false);setStorageSettingsOpen(!!result.unavailable?.length);await refreshCreaseLibrary();
      if(recovering&&!result.unavailable?.length)setError(previous=>previous.includes('原保存目录不可访问')?'':previous);
      inform(recovering?'保存位置已恢复；无法访问的原目录及其中的内容均未修改。':`保存目录已更新，迁移 ${result.copiedFiles} 个文件；原目录副本已保留。`);
    }catch(e){setStorageError(errorText(e));throw e;}finally{setStorageBusy(false);}
  }
  useEffect(()=>{if(mode!=='edit'||tool!=='operationframe'){setOperationFrame(null);setExportFrame(false);}},[mode,tool]);
  const workspaceRailWidth=viewport<=1250?66:70;
  const widths=panelWidths(panels.left,panels.right,viewport-workspaceRailWidth,mode==='edit');
  const [selected,setSelected]=useState<Set<string>>(new Set()),[grid,setGrid]=useState(true),[gridScope,setGridScope]=useState<'paper'|'canvas'|'off'>('paper'),[diagonalGrid,setDiagonalGrid]=useState(false),[snap,setSnap]=useState(true),[lockBoundary,setLockBoundary]=useState(false),[divisions,setDivisions]=useState(()=>readGridAppearance().defaultDivisions||DEFAULT_GRID_DIVISIONS),[fitToken,setFitToken]=useState(0),[coords,setCoords]=useState<Point>([0,0]);
  const [selectedCircles,setSelectedCircles]=useState<Set<string>>(new Set());
  function clearDrawingSelection(){setSelected(new Set());setSelectedCircles(new Set());}
  function openCircleProperties(){setDockSettings(null);activateDrawingTool('circleedit');}
  useEffect(()=>{if(!['select','unselect','circleedit','moveselection','copyselection','rotatecopyselection','movefour','copyfour'].includes(tool))setSelectedCircles(ids=>ids.size?new Set():ids);},[tool]);
  const [displayLayers,setDisplayLayers]=useState<DisplayLayers>(readDisplayLayers);
  const [keepSelection,setKeepSelection]=useState(readSelectionPersistence);
  useEffect(()=>{try{saveDisplayLayers(displayLayers);}catch{}},[displayLayers]);
  const [theme,setTheme]=useState<Theme>(readTheme);
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{saveTheme(theme);}catch{}},[theme]);
  const [gridAppearance,setGridAppearance]=useState<GridAppearance>(readGridAppearance);
  useEffect(()=>{try{saveGridAppearance(gridAppearance);}catch{}},[gridAppearance]);
  const [clipboard,setClipboard]=useState<WorkbenchClipboard|null>(null),[pasteOffsetX,setPasteOffsetX]=useState(10),[pasteOffsetY,setPasteOffsetY]=useState(10);
  const [materialClipboardCut,setMaterialClipboardCut]=useState<Set<string>|null>(null);
  const [materialPaste,setMaterialPaste]=useState<{clipboard:MaterialClipboard;offset:Point}|null>(null);
  useEffect(()=>{if(!grid&&gridScope!=='off')setGridScope('off');else if(grid&&gridScope==='off')setGridScope('paper');},[grid,gridScope]);
  const [notice,setNotice]=useState(''),[error,setError]=useState(''),[online,setOnline]=useState(false),[saving,setSaving]=useState(false),[projectId,setProjectId]=useState<string|null>(null),[savedSignature,setSavedSignature]=useState(''),[autosaved,setAutosaved]=useState('');
  const [fileImport,setFileImport]=useState<{request:number;name:string;stage:string}|null>(null);
  const [importFailure,setImportFailure]=useState<{name:string;message:string}|null>(null);
  const [activityLogOpen,setActivityLogOpen]=useState(false),loggedStart=useRef(false);
  useEffect(()=>installRuntimeActivityLogging(),[]);
  useEffect(()=>{if(online&&!loggedStart.current){loggedStart.current=true;recordActivity('app.start',{version:VERSION});}},[online]);
  const [initialCreaseLibrary]=useState(()=>{try{return {value:readCreaseLibraryPreferences(),error:''};}catch(cause){return {value:emptyCreaseLibraryPreferences(),error:errorText(cause)};}});
  const [creaseLibraryOpen,setCreaseLibraryOpen]=useState(true),[hasCreaseDocument,setHasCreaseDocument]=useState(false);
  const [creaseLibraryMeta,setCreaseLibraryMeta]=useState(initialCreaseLibrary.value),[creaseLibraryError,setCreaseLibraryError]=useState(initialCreaseLibrary.error);
  const [creaseLibraryLoading,setCreaseLibraryLoading]=useState(false),[creaseLibraryBusy,setCreaseLibraryBusy]=useState(false);
  const creaseIdRef=useRef<string|null>(null),hasCreaseDocumentRef=useRef(false),creaseLibraryTicket=useRef(0),creaseLibraryBusyRef=useRef(false);
  const projectRevisionRef=useRef<string|null>(null),creaseConflictRef=useRef(false),projectChannel=useRef<BroadcastChannel|null>(null);
  const [creaseConflict,setCreaseConflict]=useState(false);
  const creaseDraftTask=useRef<Promise<void>|null>(null),lastCreaseDraft=useRef<{id:string;signature:string}|null>(null);
  const creaseOpenTask=useRef<Promise<void>>(Promise.resolve());
  const creaseDeletePending=useRef(false),deletedCreaseIds=useRef(new Set<string>()),recoveryWriteTask=useRef<Promise<void>|null>(null);
  useEffect(()=>{if(history.error)setError(history.error);},[history.error]);
  const serializedDocument=useRef<{doc:Doc;text:string}|null>(null);
  const signature=useMemo(()=>documentText(doc),[doc]),dirty=signature!==savedSignature;
  serializedDocument.current={doc,text:signature};
  function documentText(value:Doc):string{const cached=serializedDocument.current;return cached?.doc===value?cached.text:JSON.stringify(value);}
  const savedSignatureRef=useRef(savedSignature);savedSignatureRef.current=savedSignature;
  const [recovery,setRecovery]=useState<RecoverySnapshot|null>(null),[recoveryChecked,setRecoveryChecked]=useState(false);
  const [recoveryAlternatives,setRecoveryAlternatives]=useState<RecoverySnapshot[]>([]);const startupSignature=useRef(signature);
  const [toolShortcuts,setToolShortcuts]=useState(readToolShortcuts);
  const [directCommands,setDirectCommands]=useState(readToolCommandInput);
  const commands=useToolCommands('crease',TOOL_COMMANDS);
  const commandBar=useRef<ToolCommandBarHandle>(null);
  useEffect(()=>{try{saveToolCommandInput(directCommands);}catch{}},[directCommands]);
  useEffect(()=>{const refresh=()=>setDirectCommands(readToolCommandInput());window.addEventListener(TOOL_COMMAND_INPUT_CHANGED,refresh);return()=>window.removeEventListener(TOOL_COMMAND_INPUT_CHANGED,refresh);},[]);
  const [shortcutTarget,setShortcutTarget]=useState<Tool>('line');
  const [creaseDisplay,setCreaseDisplay]=useState(readCreaseDisplay);
  function changeCanvasDisplay(next:CreaseDisplay){saveCreaseDisplay(next);setCreaseDisplay(next);}
  function changeToolGuide(showToolGuide:boolean){try{changeCanvasDisplay({...creaseDisplay,showToolGuide});}catch(error){inform(errorText(error));}}
  function changeCursorHint(showCursorHint:boolean){const next={...creaseDisplay,showCursorHint};try{saveCreaseDisplay(next);setCreaseDisplay(next);}catch(error){inform(errorText(error));}}
  const [canvasZoom,setCanvasZoom]=useState(readCanvasZoom);
  const [canvasPicking,setCanvasPicking]=useState(readCanvasPicking);
  const [dialog,setDialog]=useState<'files'|'export'|'help'|'shortcuts'|'display'|'mergecrossall'|null>(null),[projects,setProjects]=useState<Project[]>([]);
  const [cpCoordinates,setCpCoordinates]=useState<'paper'|'original'>('paper');
  const [issues,setIssues]=useState<DiagnosticResult|null>(null),[issuesOpen,setIssuesOpen]=useState(false),[issuesSignature,setIssuesSignature]=useState('');
  const [focusedIssueId,setFocusedIssueId]=useState<string|null>(null);
  const issueHighlights=useMemo(()=>diagnosticHighlights(issuesOpen&&issuesSignature===signature?issues:null,focusedIssueId),[issues,issuesOpen,issuesSignature,signature,focusedIssueId]);
  const [modelHistory,setModelHistory]=useState(emptyFoldedModelHistory),modelRef=useRef(modelHistory);
  const [models,setModels]=useState(emptyFoldedModelCollection),modelsRef=useRef(models);
  const [cpTarget,setCpTarget]=useState<{key:string;point:Point}|null>(null);
  const [modelTargetPoints,setModelTargetPoints]=useState<Record<string,Point>>({});
  const modelMarkEpoch=useRef(0);
  const [pendingFold,setPendingFoldState]=useState<{result:FlatFoldResult|null;source:FoldedModelEntry['source']|null;key:string}|null>(null);
  const pendingFoldRef=useRef(pendingFold);
  function setPendingFold(next:typeof pendingFold){pendingFoldRef.current=next;setPendingFoldState(next);}
  const [busyModelId,setBusyModelId]=useState<string|null>(null);
  useFlatNavigation(flatNavigationPane,flatNavigation,selectFlatNavigation,{activeModelId:models.activeId,onMark:markCanvasTarget});
  function markCanvasTarget(target:{kind:'crease';point:Point}|{kind:'fold';id:string;point:Point}){
    if(target.kind==='fold'){
      const entry=modelsRef.current.entries.find(entry=>entry.id===target.id),vertices=entry?.history.present?.geometry.vertices;
      if(!entry||!vertices)return;
      const view=entry.view??defaultModelView(),projection=modelProjection(vertices,view.side==='back',view.rotation),origin=projection.project([0,0]);
      const point=projection.unprojectDelta([target.point[0]-origin[0],target.point[1]-origin[1]]);
      setModelTargetPoints(previous=>({...previous,[target.id]:point}));selectModel(target.id);setFlatOptionsOpen(false);return;
    }
    try{const chosen=pickFoldTarget(docRef.current,target.point);setCpTarget({key:chosen.key,point:target.point});setError('');inform(`已标记计算 CP · 当前 ${countFoldedModelsForCp(modelsRef.current,chosen.key)}/${MAX_FOLDED_MODELS_PER_CP} 个平折结果`);}
    catch(error){setError(errorText(error));}
  }
  function updateModels(action:ModelCollectionAction|{type:'detach'}){const next=foldedModelCollectionReducer(modelsRef.current,action);modelsRef.current=next;setModels(next);return next;}
  function updateModel(action:FoldedModelAction){
    const active=activeFoldedModel(modelsRef.current);
    const next=active?(activeFoldedModel(updateModels(action.type==='analysis'?{type:'analysis',ticket:{id:active.id,generation:modelsRef.current.generation,revision:action.revision},result:action.result}:{type:'edit',action}))!.history):foldedModelHistoryReducer(modelRef.current,action);
    modelRef.current=next;setModelHistory(next);return next;
  }
  const flat=modelHistory.present;
  const unsavedModel=hasUnsavedModelEdits(modelHistory)||collectionHasUnsavedEdits(models);
  function approveModelDiscard(){return !(modelsRef.current.entries.length||hasUnsavedModelEdits(modelRef.current)||simulationWorkRef.current)||confirmAction('切换工程将清空当前折叠模型、三维姿态及其撤销/重做历史。需要保留时请先保存完整作品。是否继续？');}
  const [modelSelection,setModelSelection]=useState<FoldedVertexSelection>({group:[],selected:[]});
  function setFlat(result:FlatFoldResult|null){setModelSelection({group:[],selected:[]});updateModel({type:'replace',result});}
  const [flatSignature,setFlatSignature]=useState(''),[flatBusy,setFlatBusy]=useState(false),[flatBudget,setFlatBudget]=useState(Infinity),[flatFace,setFlatFace]=useState<number|null>(null);
  const [flatComputationProgress,setFlatComputationProgress]=useState<FlatComputationProgress|null>(null);
  const [flatStartedAt,setFlatStartedAt]=useState<number|undefined>(undefined);
  const [flatConflictChoice,setFlatConflictChoice]=useState<{id:string;result:FlatFoldResult;index:number}|null>(null);
  const [cpConflictFocus,setCpConflictFocus]=useState<{id:string;result:FlatFoldResult;index:number;points:Point[]}|null>(null);
  const [recognition,setRecognition]=useState<{graph:FoldGraph;warnings:string[]}|null>(null);
  const rootResolution=useMemo(()=>{if(!doc.flatFold&&!hasMaterialTopology(doc))return {face:0,stale:false};try{return resolveStartingFace(doc,buildFold(doc).graph);}catch{return {face:0,stale:true};}},[doc]);
  const startingFace=rootResolution.face;
  const flatInputDoc=useRef<Doc|null>(null);
  useEffect(()=>{
    setRecognition(null);
    if(flatBusy&&flatInputDoc.current&&isFoldSourceCurrent(flatInputDoc.current,doc))return;
    flatRequest.current++;flatJob.current?.cancel();flatJob.current=null;
    if(flatBusy){setPendingFold(null);setError('源折痕已改变，本次计算已停止，请重新计算。');}
    setFlatBusy(false);setBusyModelId(null);
  },[signature]);
  const flatJob=useRef<{cancel:()=>void}|null>(null);
  const [flatSource,setFlatSource]=useState<{doc:Doc;graph:FoldGraph}|null>(null);const flatRequest=useRef(0);
  const [tessCommittedParams,setTessCommittedParams]=useState<TessParams>(()=>tessPreset('twist')),[tessResult,setTessResult]=useState<TessResult|null>(null),[tessBusy,setTessBusy]=useState(false),[tessSignature,setTessSignature]=useState(''),[tessView,setTessView]=useState<'fold'|'mother'|'dual'>('fold');
  const [tessRetryToken,setTessRetryToken]=useState(0);
  const [tessDraft,setTessDraft]=useState<TessParams|null>(null),[curveDesign,setCurveDesign]=useState<CurveDesign|null>(null),[curveEditRequest,setCurveEditRequest]=useState(0);
  const tessParams=tessDraft??tessCommittedParams;
  const artworkConstruction=useRef({tessellation:tessParams,curve:curveDesign});artworkConstruction.current={tessellation:tessParams,curve:curveDesign};
  const constructionStateKey=useMemo(()=>JSON.stringify({tessellation:tessParams,curve:curveDesign}),[tessParams,curveDesign]),initialConstructionState=useRef(constructionStateKey);
  const hasConstructionChanges=constructionStateKey!==initialConstructionState.current;
  const [savingArtwork,setSavingArtwork]=useState(false),artworkSaveLock=useRef(false);
  const [artworkOverviewOpen,setArtworkOverviewOpen]=useState(false),[diagramArtworkRevision,setDiagramArtworkRevision]=useState(0);
  const [constructionVisited,setConstructionVisited]=useState(false);
  useEffect(()=>{if(mode==='tess')setConstructionVisited(true);},[mode]);
  const curvePreviewSession=useRef<{design:CurveDesign|null}|null>(null);
  function previewCurveDesign(design:CurveDesign){if(!curvePreviewSession.current)curvePreviewSession.current={design:curveDesign};setCurveDesign(design);}
  function cancelCurvePreview(){const session=curvePreviewSession.current;if(!session)return;curvePreviewSession.current=null;setCurveDesign(session.design);}
  const tessPreviewSession=useRef<{result:TessResult|null;signature:string;error:string}|null>(null);
  function setTessParams(next:TessParams){tessPreviewSession.current=null;setTessDraft(null);setTessCommittedParams(next);setCurveEditRequest(0);curvePreviewSession.current=null;setCurveDesign(null);}
  function previewTessParams(next:TessParams){if(!tessPreviewSession.current)tessPreviewSession.current={result:tessResult,signature:tessSignature,error:tessError};setTessDraft(next);}
  function cancelTessPreview(){const session=tessPreviewSession.current;if(!session)return;tessPreviewSession.current=null;tessAbort.current?.abort();setTessDraft(null);const key=tessConstructionKey(tessCommittedParams);setTessError(tessSignature===key&&tessSignature!==session.signature?'':session.error);if(tessSignature===key&&tessResult){tessAttempt.current=key;}else{setTessResult(session.result);setTessSignature(session.signature);setTessError(session.error);tessAttempt.current=session.signature;if(session.signature!==key)setTessRetryToken(n=>n+1);}}
  const tessParamKey=tessConstructionKey(tessParams);const tessAbort=useRef<AbortController|null>(null);
  const tessTilingOnly=(tessParams.family==='archimedean'&&['cairo','double-cairo'].includes(tessParams.tiling)&&tessParams.cairoOutput!=='twist')||(tessParams.family==='custom'&&tessParams.customOutput==='tiling')||(tessParams.family==='nonperiodic'&&tessParams.kind==='goldberg'&&tessParams.goldbergOutput==='tiling');
  const tessTileDecoration=useMemo(()=>{
    if(!tessResult?.mother||!tessResult.motherDoc||tessSignature!==tessParamKey)return null;
    let options:TileDecorations|null=null,sourceVertices:XY[]|null=null,sourceFaces:number[][]=[],mapArrows=false;
    if(tessParams.family==='custom'){
      const automatic=tessParams.customOutput==='tile-twists'&&!tessParams.tileDecorations;
      options=tessParams.tileDecorations??(automatic&&tessParams.tileTwists?twistTileDecorations(tessParams.faces,tessParams.tileTwists):null);
      sourceVertices=tessParams.vertices;
      sourceFaces=tessParams.faces;
      mapArrows=!!options;
    }else if(tessParams.family==='split'||tessParams.family==='polygon-tile'||(tessParams.family==='brocard'&&tessParams.kind==='cyclic-offset')){
      options=specializedTwistTileDecorations(tessParams);
      if(options){
        if(tessParams.family==='brocard'){
          const info=tessResult.source.brocard;
          const vertices=info&&typeof info==='object'?(info as Record<string,unknown>).vertices:null;
          if(!Array.isArray(vertices)||vertices.length!==tessParams.centralTypes.length||vertices.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))))return null;
          sourceVertices=vertices as XY[];
        }else sourceVertices=tessParams.family==='split'&&tessParams.variant==='unit-offset'
          ?unitQuadrilateralVertices(tessParams.angles,tessParams.side,tessParams.sideIndex):tessParams.polygon;
        if(!sourceVertices)return null;
        sourceFaces=[sourceVertices.map((_,i)=>i)];mapArrows=true;
      }
    }
    if(!options)return null;
    const mother=tessResult.mother,coords=mother.vertices_coords,minX=Math.min(...coords.map(p=>p[0])),minY=Math.min(...coords.map(p=>p[1]));
    const span=Math.max(Math.max(...coords.map(p=>p[0]))-minX,Math.max(...coords.map(p=>p[1]))-minY),scale=200/span;
    if(!Number.isFinite(scale))return null;
    const tiles=mapArrows&&sourceVertices?twistDecoratedMotherTiles(mother,options,sourceVertices,sourceFaces):decoratedMotherTiles(mother,options,sourceFaces.length);
    return {options,tiles:tiles.map(tile=>({...tile,points:tile.points.map(p=>[(p[0]-minX)*scale,(p[1]-minY)*scale] as [number,number])}))};
  },[tessParams,tessResult,tessSignature,tessParamKey]);
  const tessPreview=useMemo(()=>previewTessDocument(tessResult,tessSignature,tessParams),[tessResult,tessSignature,tessParams]);
  const tessCpDecoration=useMemo(()=>{
    if(tessParams.family!=='custom'||tessParams.customOutput!=='tile-twists'||
      !tessTileDecoration?.options.overlayCreasePattern||!tessResult?.mother||
      tessSignature!==tessParamKey||tessPreview)return null;
    const tiles=reframeTileDecorations(tessTileDecoration.tiles,tessResult.mother,tessResult.fold as TessGraph);
    return tiles?{...tessTileDecoration,tiles,mode:'cp' as const}:null;
  },[tessParams,tessResult,tessTileDecoration,tessSignature,tessParamKey,tessPreview]);
  const tessFfDecoration=useMemo(()=>{
    if(tessParams.family!=='custom'||tessParams.customOutput!=='tile-twists'||
      !tessTileDecoration?.options.overlayFoldedForm||!tessResult?.mother||
      tessSignature!==tessParamKey||tessPreview)return null;
    const fold=tessResult.fold as TessGraph & {zhezhi_face_tile_instance?:number[]};
    const tiles=reframeTileDecorations(tessTileDecoration.tiles,tessResult.mother,fold);
    return tiles&&Array.isArray(fold.zhezhi_face_tile_instance)
      ?{tiles,options:tessTileDecoration.options,faceTileInstance:fold.zhezhi_face_tile_instance}:null;
  },[tessParams,tessResult,tessTileDecoration,tessSignature,tessParamKey,tessPreview]);
  const [flatDefaults]=useState<ModelViewState>(()=>({...defaultModelView(),colors:defaultModelColors()}));
  const flatDefaultsRef=useRef(flatDefaults);flatDefaultsRef.current=flatDefaults;
  const flatDisplayView=activeFoldedModel(models)?.view??flatDefaults;
  const modelSourceCurrent=useMemo(()=>new Map(models.entries.map(entry=>[entry.id,isFoldSourceCurrent(entry.source.doc,doc)])),[doc,models.generation]);
  const cpConflictModel=activeFoldedModel(models),cpConflictResult=cpConflictModel?.history.present;
  const cpConflicts=showFlat?visibleFlatConflicts(cpConflictResult,flatBusy&&busyModelId===cpConflictModel?.id,!cpConflictModel||modelSourceCurrent.get(cpConflictModel.id)!==true):[];
  const requestedCpConflict=flatConflictChoice?.id===cpConflictModel?.id&&flatConflictChoice?.result===cpConflictResult?flatConflictChoice?.index??0:0;
  const cpConflictIndex=Number.isInteger(requestedCpConflict)&&requestedCpConflict>=0&&requestedCpConflict<cpConflicts.length?requestedCpConflict:0;
  const cpConflict=cpConflicts[cpConflictIndex];
  const cpConflictSource=useMemo(()=>cpConflictResult&&cpConflictModel?sourceConflictResult(cpConflictResult,cpConflictModel.source.graph):null,[cpConflictResult,cpConflictModel?.source.graph]);
  const currentCpConflictFocus=cpConflict&&cpConflictFocus?.id===cpConflictModel?.id&&cpConflictFocus?.result===cpConflictResult&&cpConflictFocus?.index===cpConflictIndex?cpConflictFocus:undefined;
  function locateCpConflict(){
    if(!cpConflict||!cpConflictSource||!cpConflictResult||!cpConflictModel)return;
    const points=conflictPoints(cpConflict,cpConflictSource,cpConflictSource.geometry.vertices);if(!points.length)return;
    setCpConflictFocus({id:cpConflictModel.id,result:cpConflictResult,index:cpConflictIndex,points});selectFlatNavigation('crease');
  }
  const flatNavigationAvailable=showFlat&&models.entries.some(entry=>!!entry.history.present?.geometry.vertices.length);
  const flatXray=flatDisplayView.xray;
  const [flatFitTokens,setFlatFitTokens]=useState<Record<string,number>>({}),[flatOptionsOpen,setFlatOptionsOpen]=useState(false);
  function fitMarkedModel(){const id=modelsRef.current.activeId;if(id)setFlatFitTokens(previous=>({...previous,[id]:(previous[id]??0)+1}));}
  function changeFlatDisplay(patch:Partial<ModelViewState>){
    const entry=activeFoldedModel(modelsRef.current);if(!entry){inform('请先用中键标记一个平折结果。');return;}
    updateModels({type:'view',id:entry.id,view:{...copyModelView(entry.view),...patch}});
  }
  const [tessFlatView,setTessFlatView]=useState<ModelViewState>(()=>({...defaultModelView(),colors:defaultModelColors()}));
  const [tessFlatFit,setTessFlatFit]=useState(0),[tessFlatPaused,setTessFlatPaused]=useState(false),[tessFlatBudget,setTessFlatBudget]=useState(10),[tessFlatRetry,setTessFlatRetry]=useState(0);
  const [tessFlatOpen,setTessFlatOpen]=useState(false),[tessRigidOpen,setTessRigidOpen]=useState(false),[tessError,setTessError]=useState('');
  const tessSpatialFamily=['radial-pot','gore-paper','rectangular-pot','twisted-pot','flasher','paraboloidal-flasher','curved-circle-polyhedral','linked-first-band-polyhedral','twist-joined-tube','double-joined-tube','closed-twist-topped-tube'].includes(tessParams.family);
  const tessHasSpatialView=tessParams.family==='rigid-quad'||tessSpatialFamily;
  const tessSpatialScene=useMemo(()=>tessSpatialFamily?spatialMeshScene(tessResult):null,[tessSpatialFamily,tessResult]);
  useEffect(()=>{setTessRigidOpen(tessHasSpatialView);},[tessHasSpatialView]);
  const tileLayerMode=mode==='tess'&&needsTessellationLayerCheck(tessParams,tessTilingOnly);
  const tileLayerCheck=useTilePatchLayerCheck(tessResult,tessSignature,tessParamKey,tileLayerMode,tessFlatBudget,tessFlatRetry,tessParams.family==='primal-dual'?tessParams.visibleTopFace:undefined,tessParams.family==='primal-dual'?tessParams.faceupFace:undefined);
  const tileLayerActive=tileLayerMode&&tessSignature===tessParamKey;
  const tessCPAdoptable=useMemo(()=>!tessDraft&&!curveDesign&&(canAdoptWovenCP(tessResult,tessBusy,tessSignature,tessParams)||canAdoptDiscreteCurveCP(tessResult,tessBusy,tessSignature,tessParams)),[tessDraft,curveDesign,tessResult,tessBusy,tessSignature,tessParams]);
  const tessAdoptable=!tessDraft&&!curveDesign&&canAdoptTessWithTileLayers(tessResult,tessBusy,tessSignature,tessParams,tileLayerCheck?.status);
  const tileLayerLabel=tileLayerCheck?.status==='solved'?(tileLayerCheck.solutionCountExact==='1'?'层序已解 · 唯一':'层序已解'):tileLayerCheck?.status==='no-solution'?'山谷无解':tileLayerCheck?.status==='invalid'?'平折几何失败':tileLayerCheck?.status==='unconfirmed'?'层序未确认':'层序检查中';
  const tessFlat=useMemo(()=>{
    if(tessHasSpatialView||tessTilingOnly||tessResult?.source.output==='tiling'||!tessFlatOpen||!tessResult||!tessSignature||JSON.parse(tessSignature).family!==tessParams.family)return {input:null,message:''};
    try{const input=tessFlatInput(tessResult,tessPreview??tessResult.doc,tessPreview?tessParamKey:tessSignature,canAdoptTess(tessResult,false,tessSignature,tessParams));
      if(tessParams.family==='primal-dual'&&tessParams.faceupFace!==undefined){input.startingFace=primalDualFaceupRoot(input.graph,tessParams.faceupFace);input.faceupFace=tessParams.faceupFace;}
      else if(tessParams.family==='primal-dual'&&tessParams.visibleTopFace!==undefined)input.startingFace=tessFlatRoot(input.graph);
      return {input,message:''};}
    catch(e){return {input:null,message:errorText(e)};}
  },[tessFlatOpen,tessResult,tessPreview,tessParamKey,tessSignature]);
  const tessLatest=useRef({key:tessParamKey,mode}),tessAttempt=useRef('');
  tessLatest.current={key:tessParamKey,mode};
  const [simStatus,setSimStatus]=useState<SimulatorStatus|null>(null),[simProgress,setSimProgress]=useState(0),[simSignature,setSimSignature]=useState('');
  const [simVisited,setSimVisited]=useState(false),pendingSimulationPose=useRef<SimulationPose|null>(null);
  const simMounted=simVisited||mode==='sim';
  const hasSimulationWork=simMounted&&!!simStatus&&(!!simStatus.poseRestored||!!simStatus.poseEditRevision||!!simStatus.progress);
  const simulationWorkRef=useRef(hasSimulationWork);simulationWorkRef.current=hasSimulationWork;
  const simReady=!!simStatus&&['loaded','running','paused'].includes(simStatus.status);
  const iframe=useRef<HTMLIFrameElement>(null),simBridge=useRef<SimulatorBridge|null>(null),simControls=useRef<SimulationControlsHandle>(null);
  const [capturingSimulationImage,setCapturingSimulationImage]=useState(false),simulationImageAbort=useRef<AbortController|null>(null);
  const simLayerJob=useRef<{cancel:()=>void}|null>(null);
  const simLayerSource=useRef<{graph:FoldGraph;revision:number;signature:string;order:SimulationLayerOrder|null;message:string}|null>(null);
  const [exportFormat,setExportFormat]=useState<DocumentFormat|'svg'|'png'|'jpg'|'dxf'|'obj'>('fold');
  const [exportGrid,setExportGrid]=useState(false);
  const [exportBusy,setExportBusy]=useState(false),exportLock=useRef(false);
  useEffect(()=>{const failed=(event:Event)=>setError((event as CustomEvent<string>).detail);window.addEventListener('zhezhi-export-error',failed);return()=>window.removeEventListener('zhezhi-export-error',failed);},[]);
  const [processingExportOpen,setProcessingExportOpen]=useState(false);
  const [dx,setDx]=useState(10),[dy,setDy]=useState(0),[rotation,setRotation]=useState(90),[factor,setFactor]=useState(1.25);
  const inputModelFile=useRef<HTMLInputElement>(null);
  const inputCollectionFile=useRef<HTMLInputElement>(null);
  const inputAppendFile=useRef<HTMLInputElement>(null);
  const importTask=useRef<ProjectImportTask|null>(null);
  const savedProjectRead=useRef<AbortController|null>(null);
  useEffect(()=>()=>{savedProjectRead.current?.abort();importTask.current?.cancel();},[]);
  const inputFile=useRef<HTMLInputElement>(null),scope=useRef(0),saveLock=useRef(false),openRequest=useRef(0),simRevision=useRef(0);
  const [artworkSerializer]=useState(createArtworkSerializationClient);
  useEffect(()=>()=>artworkSerializer.cancel(),[artworkSerializer,scope.current]);
  const chosen=useMemo(()=>selected.size?doc.segments.filter(s=>selected.has(s.id)):[],[doc.segments,selected]),one=chosen.length===1?chosen[0]:null;
  const selectedFoldAngles=useMemo(()=>summarizeFoldAngles(chosen),[chosen]);
  const chosenCircles=(doc.objects??[]).filter(object=>object.kind==='circle'&&selectedCircles.has(object.id));
  const selectedType=chosen.length&&chosen.every(s=>s.assignment===chosen[0].assignment)?chosen[0].assignment:undefined;
  const flatCheckSource=flatSource?.doc??flatInputDoc.current;
  const flatSourceCurrent=useMemo(()=>!!flatCheckSource&&isFoldSourceCurrent(flatCheckSource,doc),[flatCheckSource,doc]);
  const flatStale=!!flat&&(flatCheckSource?!flatSourceCurrent:flatSignature!==signature),simStale=!!simSignature&&simSignature!==signature;
  const simulationCaptureContext=useRef({mode,signature});simulationCaptureContext.current={mode,signature};
  const artworkChangeKey=useMemo(()=>({doc,models,tessParams,curveDesign,designArtworkRevision,diagramArtworkRevision,progress:simProgress,pose:simStatus?.poseEditRevision,view:simStatus?.view,settings:simStatus?.solverSettings}),[doc,models,tessParams,curveDesign,designArtworkRevision,diagramArtworkRevision,simProgress,simStatus?.poseEditRevision,simStatus?.view,JSON.stringify(simStatus?.solverSettings)]);
  const artworkRecovery=useArtworkRecovery({scope:scope.current,enabled:online&&!storageBusy&&!fileImport&&(hasCreaseDocument||constructionVisited||!!curveDesign||diagramArtworkRevision>0||designArtworkRevision>0||hasSimulationWork),changeKey:artworkChangeKey,periodic:simMounted&&simStatus?.status==='running',capture:async()=>{
    if(flatBusy||savingArtwork||simStatus?.interactionActive||document.documentElement.hasAttribute('data-diagram-pointer-gesture')||simMounted&&simSignature&&!simReady)return null;
    try{return await captureArtwork(false,true);}catch(error){if(errorText(error)==='三维交互进行中，稍后暂存')return null;throw error;}
  }});
  const artworkRows=useMemo<ArtworkOverviewRow[]>(()=>{
    if(!artworkOverviewOpen)return [];
    let diagram;try{diagram=diagramRef.current?.capture({flush:false});}catch{return [{name:'折序',content:'暂不能读取',source:'请先保存折序并检查提示'}];}
    const design=designRef.current?.capture();
    const changedModels=models.entries.filter(entry=>!isFoldSourceCurrent(entry.source.doc,doc)).length;
    return [
      {name:'折痕',content:doc.name,source:dirty?'尚未独立保存':'已保存到折痕文档库'},
      {name:'基础形设计',content:design?design.name:'未打开',source:design?'可编辑骨架、分支长度与布局，随完整作品保存':'完整作品中为空'},
      {name:'构造',content:curveDesign?'曲面参数':`${TESS_NAMES[tessParams.family]} · 参数`,source:'随完整作品保存；需采用后才更新编辑区 CP'},
      {name:'平折模型',content:`${models.entries.length} 个模型`,source:changedModels?`${changedModels} 个保留旧版或其他 CP，需重算才能更新`:'保留各自来源 CP 与视图'},
      {name:'折序',content:diagram?`${diagram.name} · ${diagram.steps.length} 步`:'未打开',source:diagram?'含各步骤的独立 CP；编辑区修改不自动覆盖':'完整作品中为空'},
      {name:'三维',content:simMounted&&simSignature?'当前姿态、固定点与视角':'尚未载入',source:simStale?'来源 CP 已变化；载入当前折痕才会更新':simMounted&&simSignature?'与当前 CP 对应；恢复后暂停':'完整作品中为空'},
    ];
  },[artworkOverviewOpen,doc,signature,dirty,models,curveDesign,tessParams.family,diagramArtworkRevision,designArtworkRevision,simMounted,simSignature,simStale]);

  function inform(s:string){setNotice(s);}
  function markCreaseConflict(message='工程已在其他窗口修改，当前内容仍保留。请另存当前副本，或重新打开最新版本。'){
    creaseConflictRef.current=true;setCreaseConflict(true);setSavedSignature('');setAutosaved('');setError(message);
  }
  function notifyProjectChange(id:string,revision:string|null){projectChannel.current?.postMessage({id,revision});}
  useEffect(()=>{
    // Notifications can arrive after our own newer save. Recheck the current
    // server revision instead of treating a delayed message as a new conflict.
    const receive=(event:MessageEvent)=>{const value=event.data;if(value?.id===creaseIdRef.current&&hasCreaseDocumentRef.current&&value.revision!==projectRevisionRef.current)void check();};
    if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('zhezhi-project-revisions-v1');projectChannel.current=channel;channel.addEventListener('message',receive);}
    const check=async()=>{const id=creaseIdRef.current,revision=projectRevisionRef.current;if(!id||!revision||!hasCreaseDocumentRef.current||saveLock.current||creaseDraftTask.current||creaseConflictRef.current||document.hidden)return;try{const current=await api<{revision:string}>('projects/'+id+'/revision');if(creaseIdRef.current===id&&projectRevisionRef.current===revision&&!saveLock.current&&!creaseDraftTask.current&&current.revision!==revision)markCreaseConflict();}catch(cause){if((cause as {status?:number}).status===404&&creaseIdRef.current===id)markCreaseConflict('工程已在其他窗口删除，当前内容仍保留，请另存当前副本。');}};
    window.addEventListener('focus',check);const timer=setInterval(check,5000);
    return()=>{clearInterval(timer);window.removeEventListener('focus',check);projectChannel.current?.close();projectChannel.current=null;};
  },[]);
  async function reloadConflictedCrease(){
    const id=creaseIdRef.current;if(!id||creaseLibraryBusyRef.current||saveLock.current||!confirmAction('重新打开将替换当前窗口的内容。尚需保留的修改请先“另存当前副本”。是否继续？'))return;
    setCreaseBusy(true);
    try{const result=await openSavedCrease(id);if(result)inform('已重新打开最新版本。'+(result.upgraded?'已兼容升级，请保存更新后的工程。':''));}catch(cause){setError(errorText(cause));}
    finally{setCreaseBusy(false);}
  }
  function setCreaseBusy(busy:boolean){creaseLibraryBusyRef.current=busy;setCreaseLibraryBusy(busy);}
  function changeCreaseLibraryMeta(change:(value:CreaseLibraryPreferences)=>CreaseLibraryPreferences){
    const next=change(readCreaseLibraryPreferences());saveCreaseLibraryPreferences(next);setCreaseLibraryMeta(next);return next;
  }
  function markCreaseOpen(id:string){
    creaseOpenTask.current=creaseOpenTask.current.then(async()=>{
      if(deletedCreaseIds.current.has(id))return;
      for(let attempt=0;attempt<3;attempt++){
        const {value}=await api<{value:string|null}>('storage/preferences?key='+encodeURIComponent(CREASE_LIBRARY_KEY));
        const current=readCreaseLibraryPreferences({getItem:()=>value,setItem(){}});
        const next=markCreaseLibraryDocumentOpen(current,id);
        if(deletedCreaseIds.current.has(id))return;
        try{
          await api('storage/preferences',{key:CREASE_LIBRARY_KEY,value:JSON.stringify(next),expectedValue:value});
          setCreaseLibraryMeta(next);return;
        }catch(cause){if((cause as {status?:number}).status!==409||attempt===2)throw cause;}
      }
    }).catch(cause=>{setCreaseLibraryError(errorText(cause));inform('工程内容仍保留，最近打开记录暂未更新：'+errorText(cause));});
  }
  async function refreshCreaseLibrary(){
    const ticket=++creaseLibraryTicket.current;setCreaseLibraryLoading(true);
    try{
      if(!online){await connect();setOnline(true);}
      const result=await api<{projects:Project[]}>('projects?library=1');
      if(ticket!==creaseLibraryTicket.current)return;
      setProjects(result.projects);setCreaseLibraryMeta(readCreaseLibraryPreferences());setCreaseLibraryError('');
    }catch(cause){if(ticket===creaseLibraryTicket.current)setCreaseLibraryError(errorText(cause));}
    finally{if(ticket===creaseLibraryTicket.current)setCreaseLibraryLoading(false);}
  }
  async function checkpointCreaseDraft():Promise<boolean>{
    if(creaseDeletePending.current)return false;
    if(!hasCreaseDocumentRef.current)return true;
    if(creaseConflictRef.current)return false;
    if(saveLock.current){inform('正在保存当前工程，请保存完成后再切换文档。');return false;}
    const identity=scope.current;
    try{
      if(creaseDraftTask.current)await creaseDraftTask.current;
      if(creaseDeletePending.current)return false;
      if(identity!==scope.current)return false;
      if(saveLock.current)return false;
      const current=docRef.current,text=documentText(current);
      if(text===savedSignatureRef.current||lastCreaseDraft.current?.id===creaseIdRef.current&&lastCreaseDraft.current.signature===text)return true;
      if(!online)throw Error('本地服务未连接，当前工程仍保留；请重新连接后再切换文档，或先导出备份。');
      const id=creaseIdRef.current??crypto.randomUUID();creaseIdRef.current=id;setProjectId(id);
      const writing=apiSerialized<{revision:string}>('projects/draft',documentRequestJson(text,{id,baseRevision:projectRevisionRef.current})).then(result=>{
        if(identity===scope.current){projectRevisionRef.current=result.revision;lastCreaseDraft.current={id,signature:text};markCreaseOpen(id);notifyProjectChange(id,result.revision);}
      });
      creaseDraftTask.current=writing;
      try{await writing;}finally{if(creaseDraftTask.current===writing)creaseDraftTask.current=null;}
      return identity===scope.current;
    }catch(cause){if(['project_conflict','project_deleted'].includes((cause as {code?:string}).code??''))markCreaseConflict(errorText(cause));setCreaseLibraryError(errorText(cause));inform('折痕草稿暂存未完成：'+errorText(cause));return false;}
  }
  async function showCreaseLibrary(navigation?:number){
    if(saveLock.current||creaseLibraryBusyRef.current)return;
    if(toolLayout.editing){inform('请先保存或取消工具排版，再返回折痕文档。');return;}
    flushSync(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});setCreaseBusy(true);
    try{if(!await checkpointCreaseDraft()||navigation!==undefined&&navigation!==workspaceNavigation.current)return;setDialog(null);setCreaseLibraryOpen(true);setMode('edit');await refreshCreaseLibrary();}
    finally{setCreaseBusy(false);}
  }
  async function newCreaseDocument(kind='blank'){
    if(creaseLibraryBusyRef.current)return;setCreaseBusy(true);
    try{if(!await checkpointCreaseDraft())return;if(replace(kind==='blank'?blankDoc():exampleDoc(kind))){recordActivity('document.new',{target:kind});inform(kind==='blank'?'已新建空白折痕工程。':'已新建折痕示例，可独立编辑和保存。');}}
    finally{setCreaseBusy(false);}
  }
  function continueCreaseDocument(){if(!hasCreaseDocumentRef.current)return;setCreaseLibraryOpen(false);setMode(docRef.current.metadata?.curveDesign?'tess':'edit');}
  async function openSavedCrease(id:string):Promise<{draft:boolean;segments:number;upgraded:boolean}|null>{
    savedProjectRead.current?.abort();importTask.current?.cancel();
    const request=++openRequest.current,identity=scope.current,base=docRef.current,controller=new AbortController();
    const name=projects.find(project=>project.id===id)?.name??'折痕工程';
    let task:ProjectImportTask|undefined;savedProjectRead.current=controller;
    setError('');setFileImport({request,name,stage:'正在读取本地工程'});
    try{
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      if(request!==openRequest.current||identity!==scope.current)return null;
      let text=await apiText('projects/'+encodeURIComponent(id)+'?draft=1',controller.signal);
      if(request!==openRequest.current||identity!==scope.current)return null;
      task=startSavedProjectImport(text,stage=>{if(request===openRequest.current&&identity===scope.current)setFileImport({request,name,stage});});
      text='';importTask.current=task;
      const result=await task.promise;
      if(importTask.current===task)importTask.current=null;
      if(request!==openRequest.current||identity!==scope.current)return null;
      if(docRef.current!==base){inform('打开期间当前折痕已修改，本次未替换。请重新打开工程。');return null;}
      if(result.kind!=='crease'||!result.savedProject)throw new Error('本地工程准备信息不完整，当前工程未替换。');
      const saved=result.savedProject;
      if(!replace(result.doc,id,!saved.draft,false,true,false,saved))return null;
      projectRevisionRef.current=saved.revision;
      return {draft:saved.draft,segments:result.doc.segments.length,upgraded:saved.upgraded};
    }catch(cause){
      if(request!==openRequest.current||identity!==scope.current||(cause as Error).name==='AbortError')return null;
      throw cause;
    }finally{
      if(importTask.current===task)importTask.current=null;
      if(savedProjectRead.current===controller)savedProjectRead.current=null;
      setFileImport(current=>current?.request===request?null:current);
    }
  }
  async function openCreaseDocument(id:string){
    if(creaseLibraryBusyRef.current)return;
    if(id===creaseIdRef.current&&hasCreaseDocumentRef.current){markCreaseOpen(id);continueCreaseDocument();return;}
    setCreaseBusy(true);
    try{
      if(!await checkpointCreaseDraft())return;
      const result=await openSavedCrease(id);
      if(result){recordActivity('document.open',{source:'library',result:result.draft?'draft':'saved',segments:result.segments});markCreaseOpen(id);inform((result.draft?'已打开折痕草稿，手动保存版本仍保留。':'折痕工程已打开。')+(result.upgraded?'已兼容升级，请保存更新后的工程。':''));}
    }catch(cause){setCreaseLibraryError(errorText(cause));}
    finally{setCreaseBusy(false);}
  }
  async function renameCreaseDocument(id:string,name:string){
    if(creaseLibraryBusyRef.current)return;setCreaseBusy(true);
    try{
      const baseRevision=id===creaseIdRef.current?projectRevisionRef.current:(await api<{revision:string}>('projects/'+id+'?draft=1')).revision;
      const renamed=await api<{revision:string}>('projects/'+id+'/rename',{name,baseRevision});
      if(id===creaseIdRef.current)projectRevisionRef.current=renamed.revision;
      notifyProjectChange(id,renamed.revision);
      if(id===creaseIdRef.current&&hasCreaseDocumentRef.current){
        const current=docRef.current,next={...current,name};
        if(JSON.stringify(current)===savedSignatureRef.current)setSavedSignature(JSON.stringify(next));
        if(lastCreaseDraft.current?.id===id)lastCreaseDraft.current={id,signature:JSON.stringify(next)};
        dispatch({type:'commit',doc:next});
      }
      await refreshCreaseLibrary();
    }catch(cause){setCreaseLibraryError(errorText(cause));}
    finally{setCreaseBusy(false);}
  }
  function organizeCreaseDocuments(change:(value:CreaseLibraryPreferences)=>CreaseLibraryPreferences){try{changeCreaseLibraryMeta(change);setCreaseLibraryError('');}catch(cause){setCreaseLibraryError(errorText(cause));}}
  function discardDeletedCreaseDocument(){
    const empty=blankDoc();scope.current++;openRequest.current++;flatJob.current?.cancel();tessAbort.current?.abort();cancelBackgroundCrop();
    hasCreaseDocumentRef.current=false;creaseIdRef.current=null;projectRevisionRef.current=null;creaseConflictRef.current=false;setCreaseConflict(false);lastCreaseDraft.current=null;docRef.current=empty;
    dispatch({type:'replace',doc:empty});setProjectId(null);setHasCreaseDocument(false);setCreaseLibraryOpen(true);setMode('edit');
    setSavedSignature(JSON.stringify(empty));setAutosaved('');clearDrawingSelection();setTool('select');setFitToken(value=>value+1);
    updateModels({type:'clear'});setCpTarget(null);setModelTargetPoints({});setPendingFold(null);setBusyModelId(null);setFlatFitTokens({});flatInputDoc.current=null;setFlatBusy(false);setFlat(null);setFlatSource(null);setIssues(null);setSimSignature('');
    setOperationFrame(null);setExportFrame(false);setShowFlat(false);setModelToolsOpen(false);
    curvePreviewSession.current=null;setCurveDesign(null);setCurveEditRequest(0);tessPreviewSession.current=null;setTessDraft(null);setError('');
  }
  async function deleteCreaseDocument(id:string):Promise<boolean>{
    if(creaseLibraryBusyRef.current||saveLock.current||storageBusy||fileImport||creaseDeletePending.current)return false;
    creaseDeletePending.current=true;setCreaseBusy(true);setCreaseLibraryError('');recordActivity('document.delete.start',{stage:'library'});
    try{
      await Promise.allSettled([creaseDraftTask.current,recoveryWriteTask.current].filter((task):task is Promise<void>=>task!==null));
      await creaseOpenTask.current;
      const result=await deleteProject(id),warnings:string[]=[];
      notifyProjectChange(id,null);
      deletedCreaseIds.current.add(id);
      if(creaseIdRef.current===id)discardDeletedCreaseDocument();
      setProjects(value=>value.filter(project=>project.id!==id));
      try{changeCreaseLibraryMeta(value=>removeCreaseLibraryDocument(value,id));}catch{warnings.push('文档已删除，分类与最近打开记录暂未清理。');}
      try{const raw=localStorage.getItem('zhezhi-recovery');if(raw&&JSON.parse(raw)?.projectId===id)localStorage.removeItem('zhezhi-recovery');}catch{warnings.push('文档已删除，浏览器恢复记录暂未清理。');}
      setRecoveryAlternatives(value=>value.filter(item=>item.projectId!==id));
      if(result.warning)warnings.push(result.warning);
      await refreshCreaseLibrary();
      if(warnings.length)setCreaseLibraryError(warnings.join(' '));
      recordActivity('document.delete.success',{stage:'library',count:result.deleted?1:0});
      inform(warnings.length?warnings.join(' '):result.deleted?'折痕工程已删除。':'文档已不存在，列表已更新。');return true;
    }catch(cause){recordActivity('document.delete.error',{stage:'library',reason:errorText(cause)},'error');setCreaseLibraryError(errorText(cause));inform('删除未完成，当前工程内容仍保留。');return false;}
    finally{creaseDeletePending.current=false;setCreaseBusy(false);}
  }
  useEffect(()=>{if(online&&creaseLibraryOpen)void refreshCreaseLibrary();},[online,creaseLibraryOpen]);
  useEffect(()=>{if(!hasCreaseDocument||creaseLibraryOpen||!online||!dirty||saving||creaseLibraryBusy)return;const timer=setTimeout(()=>{if(!creaseLibraryBusyRef.current)void checkpointCreaseDraft();},700);return()=>clearTimeout(timer);},[doc,hasCreaseDocument,creaseLibraryOpen,online,dirty,saving,creaseLibraryBusy]);
  const cropContext=useRef({doc,operationFrame,backgroundView,mode,tool});cropContext.current={doc,operationFrame,backgroundView,mode,tool};
  function cancelBackgroundCrop(){cropRequest.current++;cropAbort.current?.abort();cropAbort.current=null;setCropBusy(false);}
  async function trimBackground(){
    const start=cropContext.current;if(cropBusy||!start.doc.background||!start.operationFrame||!start.backgroundView||start.mode!=='edit'||start.tool!=='operationframe')return;
    const request=++cropRequest.current,controller=new AbortController();cropAbort.current=controller;setCropBusy(true);setError('');
    try{
      const background=await cropBackground(start.doc.background,start.operationFrame,start.backgroundView,controller.signal),now=cropContext.current;
      if(request!==cropRequest.current)return;
      if(now.doc!==start.doc||now.operationFrame!==start.operationFrame||now.backgroundView!==start.backgroundView||now.mode!==start.mode||now.tool!==start.tool){inform('裁剪期间工程、操作框或视图已变化，本次结果未应用。');return;}
      if(commit({...start.doc,background}))inform('已按操作框裁剪底图，位置、透明度和跟随状态保留，可一次撤销。');
    }catch(e){if(request===cropRequest.current)setError(errorText(e));}
    finally{if(request===cropRequest.current){cropAbort.current=null;setCropBusy(false);}}
  }
  function publishEditorCommit(result:{doc:Doc;descendants:Map<string,string[]>},completedSelection?:Set<string>){dispatch({type:'commit',doc:result.doc});setSelected(ids=>selectionAfterCommit(ids,result.descendants,completedSelection,keepSelection));recordActivity('edit.commit',{tool,segments:result.doc.segments.length,objects:result.doc.objects?.length??0});setError('');return true;}
  function commit(next:Doc,completedSelection?:Set<string>,transform?:EditorMaterialIntent){try{if(doc.metadata?.curveDesign){if(next.segments.length)throw new Error('当前为曲面设计，请先新建或打开折痕工程，再绘制直线折痕。');curveDesignFromDocument(next);}const result=prepareEditorCommit(doc,next,transform);return publishEditorCommit(result,completedSelection);}catch(e){setError(errorText(e));return false;}}
  function transformChosen(kind:Parameters<typeof transformSelection>[2],a:number,b=0){if(kind==='copy'&&hasMaterialTopology(doc)){const material=inspectMaterialTopology(doc);if(material.ok&&material.edgeSegmentIds.some(id=>selected.has(id))){try{const intent={kind:'material-copy' as const,segmentIds:[...selected],placements:[{dx:a,dy:b,rotation:0,scale:1,mirror:'none' as const}]},result=copyMaterialComponents(doc,intent);return commit(result.doc,new Set(result.copiedIds),intent);}catch(e){setError(errorText(e));return false;}}}return commit(transformSelection(doc,selected,kind,a,b),selected,kind==='copy'?undefined:{kind,segmentIds:[...selected],a,b});}
  function replace(next:Doc,id:string|null=null,saved=false,preserveCurveView=false,preparedImport=false,modelsApproved=false,preparedSaved?:SavedProjectImportInfo):boolean {
    let prepared:Doc,native:CurveDesign|null;
    try {
      if(preparedSaved&&!preparedImport)throw new Error('本地工程准备状态无效。');
      prepared=preparedImport?next:splitEditableSegments(upgradeProject(next));
      // Saved records were fully validated by the same preparation operator in
      // our Worker, then received through the acknowledged complete protocol.
      if(!preparedSaved)validateDoc(prepared);
      native=curveDesignFromDocument(prepared);
    }
    catch(e) {setError(errorText(e));return false;}
    // Preparation is atomic: failed migrations must not replace the document,
    // dismiss recovery, or enable autosave over an unread recovery snapshot.
    if(!modelsApproved&&!approveModelDiscard())return false;
    savedProjectRead.current?.abort();savedProjectRead.current=null;importTask.current?.cancel();importTask.current=null;
    scope.current++;flatJob.current?.cancel();setFlatBusy(false);setOperationFrame(null);setExportFrame(false);
    if(id!==creaseIdRef.current)projectRevisionRef.current=null;
    creaseConflictRef.current=false;setCreaseConflict(false);
    if(preparedSaved)serializedDocument.current={doc:prepared,text:preparedSaved.preparedSignature};
    dispatch({type:'replace',doc:prepared});setProjectId(id);creaseIdRef.current=id;lastCreaseDraft.current=null;
    setCreaseLibraryOpen(false);setHasCreaseDocument(true);hasCreaseDocumentRef.current=true;
    // Compare with the saved, pre-migration document so split upgrades stay dirty.
    setSavedSignature(preserveCurveView?savedSignatureRef.current:saved?(preparedSaved?.sourceSignature??documentText(next)):'');
    clearDrawingSelection();setFitToken(n=>n+1);setMode(native?'tess':'edit');curvePreviewSession.current=null;setCurveDesign(native);setCurveEditRequest(0);if(native&&!preserveCurveView)setTessFlatFit(n=>n+1);tessPreviewSession.current=null;setTessDraft(null);if(native)setExportFormat('json');setTool('select');
    updateModels({type:'clear'});setCpTarget(null);setModelTargetPoints({});setPendingFold(null);setBusyModelId(null);setFlatFitTokens({});flatInputDoc.current=null;setIssues(null);setFlat(null);setFlatSource(null);setSimSignature('');setSimVisited(false);pendingSimulationPose.current=null;setError('');
    if(preparedSaved?.upgraded||prepared!==next&&documentText(prepared)!==documentText(next))inform('已兼容升级工程并在交点处真实分段；请保存更新后的工程。');
    return true;
  }
  function approveReplace(){return JSON.stringify(docRef.current)===savedSignatureRef.current||confirmAction('当前工程尚未手动保存。是否继续切换？建议先点“取消”并保存；自动恢复只保留最近工作。');}
  function revealDiagramCP(source:Doc):boolean {
    if(saveLock.current){setError('当前工程正在保存，请保存完成后再打开 CP。');return false;}
    try{
      const prepared=prepareDiagramEditorCP(source);
      dispatch({type:'commit',doc:prepared});setProjectId(null);creaseIdRef.current=null;projectRevisionRef.current=null;creaseConflictRef.current=false;setCreaseConflict(false);lastCreaseDraft.current=null;setSavedSignature('');
      setCreaseLibraryOpen(false);setHasCreaseDocument(true);hasCreaseDocumentRef.current=true;
      clearDrawingSelection();setTool('select');setMode('edit');setFitToken(n=>n+1);
      setOperationFrame(null);setExportFrame(false);setShowFlat(false);setModelToolsOpen(false);setIssues(null);setError('');
      inform('已在折痕编辑中打开独立 CP 副本，可撤销恢复之前的折痕；修改后回折序点击“采用编辑区 CP”。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  useEffect(()=>{let alive=true;async function init(){let serverValue:unknown=null,browserValue:unknown=null;try{browserValue=localStorage.getItem('zhezhi-recovery');}catch{}try{await connect();if(!alive)return;setOnline(true);serverValue=await api('recovery');}catch(e){if(alive)setError(errorText(e));}if(!alive)return;const choice=chooseRecovery(serverValue,browserValue),remaining=[choice.recovery,...choice.alternatives].filter((item):item is RecoverySnapshot=>!!item&&(!item.projectId||!deletedCreaseIds.current.has(item.projectId)));setRecovery(remaining[0]??null);setRecoveryAlternatives(remaining.slice(1));setRecoveryChecked(!remaining.length);if(choice.warnings.length)inform(choice.warnings.join('；'));}void init();return()=>{alive=false;};},[]);
  useEffect(()=>{
    if(!recovery?.projectId||!deletedCreaseIds.current.has(recovery.projectId))return;
    // Keep an unhandled recovery from another document visible. Dismissed
    // recovery bars stay dismissed because this only replaces a visible item.
    const remaining=recoveryAlternatives.filter(item=>!item.projectId||!deletedCreaseIds.current.has(item.projectId));
    setRecovery(remaining[0]??null);setRecoveryAlternatives(remaining.slice(1));setRecoveryChecked(!remaining.length);
  },[recovery,recoveryAlternatives,creaseLibraryBusy]);
  useEffect(()=>{if(!dialog)return;const previous=document.activeElement as HTMLElement|null;const modal=document.querySelector<HTMLElement>('.modal');if(!modal)return;const onKey=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const items=[...modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=items[0],last=items[items.length-1];if(!first)return;if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus();}};modal.addEventListener('keydown',onKey);return()=>{modal.removeEventListener('keydown',onKey);previous?.focus();};},[dialog]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{
    if(!recoveryChecked||!hasCreaseDocument||creaseLibraryBusy||creaseConflict)return;
    const snapshot={doc,projectId},identity=scope.current;
    const timer=setTimeout(()=>{
      const writing=(recoveryWriteTask.current??Promise.resolve()).catch(()=>{}).then(async()=>{
        if(creaseDraftTask.current)await creaseDraftTask.current.catch(()=>{});
        if(identity!==scope.current||creaseDeletePending.current||creaseConflictRef.current||!hasCreaseDocumentRef.current)return;
        const versioned={projectId:snapshot.projectId,baseRevision:projectRevisionRef.current},text=documentText(snapshot.doc);
        const result=await saveRecoveryCopies({
          browser:()=>localStorage.setItem('zhezhi-recovery',documentRequestJson(text,{...versioned,updated:new Date().toISOString()})),
          disk:online?()=>apiSerialized('recovery',documentRequestJson(text,versioned)):undefined,
        });
        if(identity!==scope.current||creaseDeletePending.current||creaseConflictRef.current||!hasCreaseDocumentRef.current)return;
        setAutosaved(result.diskSaved?new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'');
        if(result.warning){inform(result.warning);recordActivity('recovery.write.error',{result:result.browserSaved?'temporary-cache':'not-saved',reason:result.warning},result.browserSaved?'warning':'error');}
      });
      recoveryWriteTask.current=writing;
      void writing.catch(()=>{if(identity===scope.current)inform('自动恢复副本暂未写入磁盘，请手动保存或导出工程。');}).finally(()=>{if(recoveryWriteTask.current===writing)recoveryWriteTask.current=null;});
    },700);
    return()=>clearTimeout(timer);
  },[doc,projectId,online,recoveryChecked,hasCreaseDocument,creaseLibraryBusy,creaseConflict]);
  useEffect(()=>{const f=(e:BeforeUnloadEvent)=>{if(hasCreaseDocument&&dirty||unsavedModel||models.entries.length||hasSimulationWork||hasConstructionChanges){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',f);return()=>window.removeEventListener('beforeunload',f);},[dirty,hasCreaseDocument,unsavedModel,models.entries.length,hasSimulationWork,hasConstructionChanges]);
  useEffect(()=>{setSelected(ids=>new Set([...ids].filter(id=>doc.segments.some(s=>s.id===id&&(!lockBoundary||s.assignment!=='B')))));},[doc,lockBoundary]);
  useEffect(()=>{setSelectedCircles(ids=>{const remaining=new Set([...ids].filter(id=>doc.objects?.some(object=>object.kind==='circle'&&object.id===id)));return remaining.size===ids.size?ids:remaining;});},[doc]);
  useEffect(()=>{if(!simMounted||!iframe.current)return;const bridge=new SimulatorBridge(iframe.current,status=>{setSimStatus(status);if(status.progress!==undefined)setSimProgress(status.progress*100);});simBridge.current=bridge;return()=>{simulationImageAbort.current?.abort();simulationImageAbort.current=null;setCapturingSimulationImage(false);bridge.dispose();simBridge.current=null;};},[simMounted]);
  useEffect(()=>{if(simMounted&&simBridge.current){const pose=pendingSimulationPose.current;pendingSimulationPose.current=null;loadSimulation(pose??undefined);}return()=>{simLayerSource.current=null;simLayerJob.current?.cancel();simLayerJob.current=null;};},[simMounted]);
  useEffect(()=>{if(mode==='sim')setSimVisited(true);else{simBridge.current?.send({type:'zhezhi-sim-pause'});simControls.current?.stop();}},[mode]);
  useEffect(()=>{if(mode==='sim'&&simStale){simLayerJob.current?.cancel();simLayerJob.current=null;const source=simLayerSource.current;if(source)simBridge.current?.send({type:'zhezhi-sim-layer-order',revision:source.revision,order:null,state:'unavailable',message:'折痕已修改，重新载入后再确认层序。'});simBridge.current?.send({type:'zhezhi-sim-pause'});}},[mode,simStale]);
  useEffect(()=>{
    const source=simLayerSource.current;
    if(mode!=='sim'||simStale||!source||JSON.stringify(docRef.current)!==source.signature)return;
    if(!flatBusy&&!flatStale&&flat&&flatSource&&JSON.stringify(flatSource.doc)===source.signature){
      const order=simulationLayerOrder(source.graph,flat);
      source.order=order;source.message=order?'采用当前所选平折结果的层序。':'当前所选平折结果没有可用层序，保持三维深度显示。';
      simLayerJob.current?.cancel();simLayerJob.current=null;
      simBridge.current?.send({type:'zhezhi-sim-layer-order',revision:source.revision,order,state:order?'ready':'unavailable',message:source.message});
    }else if(source.order)simBridge.current?.send({type:'zhezhi-sim-layer-order',revision:source.revision,order:source.order,state:'ready',message:source.message});
  },[mode,simStale,flatBusy,flatStale,flat,flatSource]);
  useEffect(()=>{return()=>{flatJob.current?.cancel();tessAbort.current?.abort();};},[]);
  async function save(asCopy=false){
    if(saveLock.current||creaseLibraryBusyRef.current||storageBusy)return;const current=docRef.current,identity=scope.current;saveLock.current=true;setSaving(true);
    recordActivity('document.save.start',{format:'json',segments:current.segments.length,result:asCopy?'copy':'save'});
    try{
      if(creaseConflictRef.current&&!asCopy)throw Object.assign(new Error('工程已在其他窗口修改或删除，请另存当前副本。'),{status:409,code:'project_conflict'});
      if(creaseDraftTask.current)await creaseDraftTask.current;
      if(identity!==scope.current)return;
      const id=asCopy?crypto.randomUUID():creaseIdRef.current??projectId??crypto.randomUUID();
      if(!asCopy){creaseIdRef.current=id;setProjectId(id);}
      const text=documentText(current);
      const r=await apiSerialized<{id:string;revision:string}>('projects',documentRequestJson(text,{id,baseRevision:asCopy?null:projectRevisionRef.current}));
      if(identity===scope.current){
        projectRevisionRef.current=r.revision;creaseConflictRef.current=false;setCreaseConflict(false);notifyProjectChange(r.id,r.revision);
        creaseIdRef.current=r.id;setProjectId(r.id);setSavedSignature(text);setHasCreaseDocument(true);hasCreaseDocumentRef.current=true;markCreaseOpen(r.id);
        if(recoveryChecked&&documentText(docRef.current)===text){const snapshot=documentRequestJson(text,{projectId:r.id,baseRevision:r.revision,updated:new Date().toISOString()});try{localStorage.setItem('zhezhi-recovery',snapshot);}catch{}await apiSerialized('recovery',snapshot).catch(()=>inform('工程已保存，但恢复副本暂未更新。'));}
        if(creaseLibraryOpen)await refreshCreaseLibrary();recordActivity('document.save.success',{format:'json',segments:current.segments.length});inform('工程已保存到折痕文档，可随时重新打开。');
      }
    }catch(e){if(['project_conflict','project_deleted'].includes((e as {code?:string}).code??''))markCreaseConflict(errorText(e));recordActivity('document.save.error',{reason:errorText(e)},'error');setError(errorText(e));setCreaseLibraryError(errorText(e));}finally{saveLock.current=false;setSaving(false);}
  }
  async function captureArtwork(flush=true,checkpointDiagram=false):Promise<string>{
    if(flush)flushSync(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
    if(flush&&designRef.current&&!await designRef.current.settle())throw new Error('基础形设计参数尚未提交，请处理设计区提示后再保存完整作品。');
    const identity=scope.current,editor=docRef.current,encoded=editor.segments.length>=20000?documentText(editor):undefined;
    const projected=artworkSerializationInput({editor,models:modelsRef.current,construction:artworkConstruction.current,diagram:null,simulation:null});
    // The immutable editor JSON freezes this large bank before any await. The
    // worker reconstructs and validates it without a second UI object tree.
    const {editor:_,...parts}=projected;
    const snapshot=encoded===undefined?structuredClone(projected):{...structuredClone(parts),editor};
    const diagram=diagramRef.current?.capture({flush,deferValidation:true,checkpointOnly:checkpointDiagram})??null;
    const design=designRef.current?.capture()??null;
    const simulation=simBridge.current&&simSignature?await simBridge.current.capturePose({finishGesture:flush}):pendingSimulationPose.current;
    if(identity!==scope.current)throw new Error('保存期间工程已切换，请重新保存当前完整作品。');
    const text=await artworkSerializer.serialize({...snapshot,diagram,simulation,design:design?structuredClone(design):null},encoded);
    if(identity!==scope.current)throw new Error('保存期间工程已切换，请重新保存当前完整作品。');
    return text;
  }
  async function saveArtwork(){
    if(artworkSaveLock.current||flatBusy)return;
    artworkSaveLock.current=true;setSavingArtwork(true);
    try{
      const name=docRef.current.name,text=await captureArtwork();
      const result=await download(text,safeName(name)+'.zhezhi-artwork.json','application/json');
      if(result.status==='cancelled'){inform('已取消保存完整作品。');return;}
      setError('');inform((result.status==='saved'?'完整作品文件保存完成。':'已发起完整作品浏览器下载，请确认下载结果。')+'包含折痕、基础形设计、构造参数、模型、当前折序及三维姿态；各文档的独立保存状态保持原样。');
    }catch(error){setError('完整作品未保存：'+errorText(error));}
    finally{artworkSaveLock.current=false;setSavingArtwork(false);}
  }
  async function ensureDesignWorkspace(){
    setDesignVisited(true);
    const deadline=Date.now()+15000;
    while(!designRef.current){if(Date.now()>deadline)throw new Error('设计工作区尚未就绪，请重试。');await new Promise(resolve=>setTimeout(resolve,40));}
    return designRef.current;
  }
  async function adoptBaseDesign(source:Doc):Promise<boolean>{
    if(!await checkpointCreaseDraft())return false;
    if(hasCreaseDocumentRef.current&&!approveReplace()||!approveModelDiscard())return false;
    if(!replace(source,null,false,false,true))return false;
    inform('已在折痕编辑中打开基础形 CP 副本。原设计保留，可返回继续调整。');return true;
  }
  async function ensureDiagramWorkspace(){
    setDiagramVisited(true);
    const deadline=Date.now()+15000;
    while(!diagramRef.current){if(Date.now()>deadline)throw new Error('折序工作区尚未就绪，请重试打开完整作品。');await new Promise(resolve=>setTimeout(resolve,40));}
    return diagramRef.current;
  }
  async function restoreArtworkRecovery(entry:ArtworkRecoverySummary){
    const request=++openRequest.current,identity=scope.current;
    const value=await artworkRecovery.load(entry.id);
    if(request!==openRequest.current||identity!==scope.current)return;
    await openArtwork(exportArtworkProject(value.project),request,identity);
    if(identity!==scope.current){setArtworkOverviewOpen(false);setRecovery(null);setRecoveryChecked(true);}
  }
  async function removeArtworkRecovery(entry:ArtworkRecoverySummary){
    if(!confirmAction(`删除「${entry.name}」的这份完整作品恢复副本？独立保存的工程和其他副本不受影响。`))return;
    await artworkRecovery.remove(entry);
  }
  async function openArtwork(text:string,request:number,identity:number,ready?:ArtworkProject){
    const prepared=ready??prepareArtworkProject(text);curveDesignFromDocument(prepared.editor);
    if(request!==openRequest.current||identity!==scope.current)return;
    const diagram=await ensureDiagramWorkspace();
    const design=await ensureDesignWorkspace();
    if(request!==openRequest.current||identity!==scope.current)return;
    if(!await checkpointCreaseDraft())throw new Error('当前折痕草稿暂存未完成，完整作品未打开。');
    if(request!==openRequest.current||identity!==scope.current)return;
    if(hasCreaseDocumentRef.current&&!approveReplace()||!approveModelDiscard()){inform('已取消打开完整作品。');return;}
    const restoreDesign=design.prepareRestore(prepared.design??null);
    if(!restoreDesign)throw new Error('当前设计暂存未完成，或计算尚未停止，完整作品未打开。');
    if(!await diagram.restore(prepared.diagram))throw new Error('当前折序暂存或新折序写入未完成，完整作品未打开。');
    if(!replace(prepared.editor,null,false,false,true,true))return;
    restoreDesign();
    const restored={...prepared.models,generation:modelsRef.current.generation+1};modelsRef.current=restored;setModels(restored);showActiveModel();
    setTessParams(prepared.construction.tessellation);setCurveDesign(prepared.construction.curve);
    // Force a fresh frame when importing over an already mounted simulation.
    flushSync(()=>{setSimVisited(false);setMode('edit');});
    pendingSimulationPose.current=prepared.simulation;
    if(prepared.simulation)setMode('sim');
    setDialog(null);inform('已恢复完整作品。三维姿态保持暂停；模型层序需重新分析，各工作区撤销历史从此处开始。');
  }
  function remove(){
    const selection=editableCanvasSelection(doc,displayLayers,lockBoundary,{segments:selected,circles:selectedCircles});
    if(!selection.segments.size&&!selection.circles.size)return;
    if(doc.segments.some(s=>selection.segments.has(s.id)&&s.assignment==='B')&&!confirmAction('所选包含纸张边界。删除后可能无法计算，确定删除吗？'))return;
    const next=deleteCanvasSelection(doc,selection);
    if(commit(next))clearDrawingSelection();
  }
  function copyClipboardSelection(){try{
    const visible=editableCanvasSelection(doc,displayLayers,false,{segments:selected,circles:selectedCircles});
    const next=copyWorkbenchSelection(doc,visible.segments,visible.circles);setClipboard(next);inform(`已复制 ${clipboardDescription(next)}到工作台剪贴板。`);
  }catch(error){inform(errorText(error));}}
  function cutClipboardSelection(){try{
    const visible=editableCanvasSelection(doc,displayLayers,false,{segments:selected,circles:selectedCircles});
    const snapshot=copyWorkbenchSelection(doc,visible.segments,visible.circles);
    if(isMaterialClipboard(snapshot)){setDockSettings(null);setMaterialClipboardCut(visible.segments);return;}
    const next=cutDrawingSelection(doc,visible,displayLayers,lockBoundary);
    if(commit(next.doc)){setClipboard(next.clipboard);clearDrawingSelection();inform(`已剪切 ${clipboardDescription(next.clipboard)}，可粘贴或一次撤销。`);}
  }catch(error){inform(errorText(error));}}
  function applyMaterialClipboardCut(next:Doc,intent:MaterialFaceEditIntent,ids:Set<string>){try{if(intent.kind!=='material-clipboard-cut')return commit(next,ids,intent);const snapshot=copyWorkbenchSelection(doc,new Set(intent.segmentIds));if(!commit(next,ids,intent))return false;setClipboard(snapshot);inform('已剪切完整材料，可跨工程粘贴或撤销。');return true;}catch(error){inform(errorText(error));return false;}}
  function pasteClipboardSelection(offset:Point=[0,0]){try{if(isMaterialClipboard(clipboard)){setDockSettings(null);setMaterialPaste({clipboard:structuredClone(clipboard),offset:[...offset]});return;}if(commit(pasteDrawingObjects(doc,clipboard??[],offset))){clearDrawingSelection();inform(offset[0]||offset[1]?`已偏移粘贴 ${clipboardDescription(clipboard)}（${offset[0]}, ${offset[1]} mm）。`:`已原位粘贴 ${clipboardDescription(clipboard)}，可继续移动或选择。`);}}catch(error){inform(errorText(error));}}
  function applyMaterialLineOperation(operation:MaterialPropertyOperation,ids:string[],preserveSelection=false):boolean|null{
    if(!hasMaterialTopology(doc)||!ids.length)return null;try{const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);if(ids.some(id=>!m.edgeSegmentIds.includes(id)||doc.segments.find(s=>s.id===id)?.assignment==='B'))return null;
      const recipe={kind:'material-line-properties' as const,segmentIds:ids,operation,cpOnly:false},initial=buildMaterialLineProperties(doc,recipe);if(!initial.properties!.changedIds.length)return true;
      const checked=inspectMaterialCurveModel(doc),last=checked.ok?checked.model.groups.at(-1):null,intent:MaterialFaceEditIntent=operation.kind==='angle'&&last?.recipe.kind==='material-line-properties'&&last.recipe.operation.kind==='angle'&&!last.recipe.cpOnly&&last.recipe.segmentIds.length===ids.length&&last.recipe.segmentIds.every(id=>ids.includes(id))?{kind:'material-curve-group-edit',group:last.id,recipe}:{...recipe,parametric:true},result=editMaterialFaces(doc,intent);
      if(!commit(result.doc,operation.kind==='angle'||preserveSelection?undefined:selected,intent))return false;inform('已更新材料折痕属性并保存参数，可撤销；平折层序需要重新计算。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function modifyType(t:Assignment){if(!chosen.length)return;if(['M','V','F','U'].includes(t)){const applied=applyMaterialLineOperation({kind:'assignment',assignment:t as import('./core/materialLineProperties').MaterialPropertyAssignment},[...selected]);if(applied!==null)return applied;}commit({...doc,segments:assign(doc.segments,selected,t)});}
  function modifyTargetAngle(magnitude:number|null){
    const result=setSelectedFoldAngle(doc,selected,magnitude);
    if(!result.changed)return true;
    const m=inspectMaterialTopology(doc),ids=m.ok?chosen.filter(s=>m.edgeSegmentIds.includes(s.id)&&(s.assignment==='M'||s.assignment==='V')).map(s=>s.id):[];
    const applied=applyMaterialLineOperation({kind:'angle',magnitude},ids);
    if(applied!==null)return applied;
    if(!commit(result.doc))return false;
    inform(`已将选中的 ${result.changed} 条折痕设为${magnitude===null?'未知折角':`${magnitude}°`}，可撤销。`);return true;
  }
  function modifySwap(ids:Set<string>=selected,preserveSelection=false){try{
    const result=applySelectedFoldSwap(doc,ids);if(!result.changed)return true;
    const m=inspectMaterialTopology(doc),eligible=m.ok?doc.segments.filter(s=>ids.has(s.id)&&m.edgeSegmentIds.includes(s.id)&&(s.assignment==='M'||s.assignment==='V')).map(s=>s.id):[];
    const applied=applyMaterialLineOperation({kind:'swap'},eligible,preserveSelection);if(applied!==null)return applied;
    return commit(result.doc);
  }catch(error){setError(errorText(error));return false;}}

  useEffect(()=>{const key=(e:KeyboardEvent)=>{
    if(toolLayout.editing)return;
    if(e.defaultPrevented||e.isComposing||e.keyCode===229)return;
    if(mode==='diagram'||mode==='design')return;
    if(dialog==='shortcuts')return;
    if(document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'))return;
    if(mode==='edit'&&creaseLibraryOpen){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();void chooseProjectFile();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(hasCreaseDocumentRef.current)void save();}return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openLibrary();return;}
    if(dialog&&e.key==='Escape'){setDialog(null);return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();flushSync(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});void save();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();void chooseProjectFile();return;}
    if(dialog||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return;
    if(mode==='sim'&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){
      e.preventDefault();simControls.current?.stop();simBridge.current?.send({type:e.key.toLowerCase()==='y'||e.shiftKey?'zhezhi-sim-redo-pose':'zhezhi-sim-undo-pose'});return;
    }
    if(mode==='edit'&&!e.altKey&&(e.ctrlKey||e.metaKey)&&(e.target as Element).closest('[data-model-history]')){if(e.key.toLowerCase()==='z'){e.preventDefault();modelHistoryStep(e.shiftKey?'redo':'undo');}else if(e.key.toLowerCase()==='y'){e.preventDefault();modelHistoryStep('redo');}return;}
    // Model keyboard gestures must not delete or recolor the editable CP beside it.
    if((e.target as Element).closest('[data-fold-result]'))return;
    if(mode!=='edit')return;
    const commandCharacter=directCommands&&!libraryOpen?toolCommandCharacter(e):null;
    // Configured modifier shortcuts keep their action; plain letters become
    // CAD commands only while direct typing is enabled.
    if(commandCharacter&&(!e.shiftKey||!matchToolShortcut(e,toolShortcuts))){
      e.preventDefault();commandBar.current?.begin(commandCharacter);return;
    }
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copyClipboardSelection();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='x'){e.preventDefault();cutClipboardSelection();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){e.preventDefault();pasteClipboardSelection();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();dispatch({type:e.shiftKey?'redo':'undo'});}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();dispatch({type:'redo'});}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();if(e.shiftKey)clearDrawingSelection();else{const selection=editableCanvasSelection(doc,displayLayers,lockBoundary);setSelected(selection.segments);setSelectedCircles(selection.circles);}}
    else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
    else if(e.key==='Escape'){clearDrawingSelection();}
    else {const action=matchToolShortcut(e,toolShortcuts);if(action){e.preventDefault();if(action.startsWith('tool:'))activateDrawingTool(action.slice(5) as Tool);else setPreset(action.slice(7) as Assignment);}}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[doc,mode,tool,drawingSwap,dialog,selected,selectedCircles,displayLayers,projectId,lockBoundary,flatStale,toolShortcuts,directCommands,toolLayout.editing,libraryOpen,creaseLibraryOpen,storageBusy,clipboard,pasteOffsetX,pasteOffsetY]);
  async function chooseProjectFile(){
    try{const file=await selectProjectFile(inputFile.current);if(file)await openFile(file);}catch(cause){reportImportFailure('所选文件',errorText(cause));}
  }
  function reportImportFailure(name:string,message:string){
    recordActivity('document.import.error',{fileName:name,reason:message},'error');
    setError(message);setImportFailure({name,message});
  }
  function cancelFileImport(){
    recordActivity('document.import.cancel',{fileName:fileImport?.name??'',reason:'用户取消'});
    openRequest.current++;savedProjectRead.current?.abort();savedProjectRead.current=null;importTask.current?.cancel();importTask.current=null;setFileImport(null);inform('已取消导入，当前工程保持不变。');
  }
  async function openFile(file:File){
    savedProjectRead.current?.abort();savedProjectRead.current=null;importTask.current?.cancel();
    let task:ProjectImportTask|undefined;
    const request=++openRequest.current,identity=scope.current;
    const started=performance.now();recordActivity('document.import.start',{fileName:file.name,format:file.name.split('.').pop()?.toLowerCase()??'',bytes:file.size});
    setImportFailure(null);setError('');setNotice('');setFileImport({request,name:file.name,stage:'正在读取并检查文件'});
    try{
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      if(request!==openRequest.current)return;
      task=startProjectImport(file,true,stage=>{if(request===openRequest.current)setFileImport({request,name:file.name,stage});});
      importTask.current=task;
      const result=await task.promise;
      if(importTask.current===task)importTask.current=null;
      if(request!==openRequest.current)return;
      if(identity!==scope.current){inform('导入期间当前工程已切换，本次文件未打开。请重新选择文件。');return;}
      if(result.kind==='artwork'){await openArtwork('',request,identity,result.project);return;}
      const prepared=result.doc;
      setFileImport({request,name:file.name,stage:'正在暂存当前工作'});
      if(!await checkpointCreaseDraft()){
        if(request===openRequest.current)reportImportFailure(file.name,'当前工程仍在保存，或草稿暂存未完成。为保留当前工作，本次未打开新文件；请先保存或导出当前工程后重试。');
        return;
      }
      if(request!==openRequest.current)return;
      if(identity!==scope.current){inform('导入期间当前工程已切换，本次文件未打开。请重新选择文件。');return;}
      if(hasCreaseDocumentRef.current&&!approveReplace()||!replace(prepared,null,false,false,true)){
        recordActivity('document.import.cancel',{fileName:file.name,reason:'未确认替换当前工程'});
        inform('已取消打开“'+file.name+'”，当前工程保持不变。');return;
      }
      recordActivity('document.import.success',{fileName:file.name,segments:prepared.segments.length,durationMs:Math.round(performance.now()-started)});
      setDialog(null);inform('已打开“'+file.name+'”。'+(result.warnings.length?result.warnings.join('；'):''));
    }catch(e){if(request===openRequest.current&&identity===scope.current)reportImportFailure(file.name,errorText(e));}
    finally{if(importTask.current===task)importTask.current=null;setFileImport(current=>current?.request===request?null:current);}
  }
  async function appendFile(file:File){
    savedProjectRead.current?.abort();savedProjectRead.current=null;importTask.current?.cancel();
    let task:ProjectImportTask|undefined;
    const request=++openRequest.current,identity=scope.current;
    recordActivity('document.import.start',{fileName:file.name,bytes:file.size,stage:'append'});
    setImportFailure(null);setError('');setNotice('');setFileImport({request,name:file.name,stage:'正在读取并检查追加文件'});
    try{
      await new Promise<void>(resolve=>setTimeout(resolve,0));if(request!==openRequest.current)return;
      const base=docRef.current;
      task=startProjectImport(file,base,stage=>{if(request===openRequest.current)setFileImport({request,name:file.name,stage});},undefined,'beside');importTask.current=task;
      const result=await task.promise;if(importTask.current===task)importTask.current=null;
      if(request!==openRequest.current||identity!==scope.current)return;
      if(result.kind!=='append')throw new Error('追加导入需要折痕文件。');
      if(docRef.current!==base){inform('导入期间折痕已修改，本次未追加。请重新选择文件。');return;}
      const appended=result;
      if(!appended.appended){inform('导入文件没有可追加的折痕，当前工程未修改。');return;}
      publishEditorCommit(appended);
      setFitToken(n=>n+1);
      recordActivity('document.import.success',{fileName:file.name,segments:appended.doc.segments.length,count:appended.appended,stage:'append'});
      const notes=appended.warnings;inform(`已追加 ${appended.appended} 条折痕。${notes.length?' '+notes.join('；'):''}`);
    }catch(e){if(request===openRequest.current&&identity===scope.current)reportImportFailure(file.name,errorText(e));}
    finally{if(importTask.current===task)importTask.current=null;setFileImport(current=>current?.request===request?null:current);}
  }
  async function files(){await showCreaseLibrary();}
  function check(){try{setIssues(diagnose(doc));setFocusedIssueId(null);setSelected(new Set());setIssuesSignature(signature);setIssuesOpen(true);setError('');}catch(e){setError(errorText(e));}}
  function checkLocalFlat(){try{setIssues(checkCamv(doc));setFocusedIssueId(null);setSelected(new Set());setIssuesSignature(signature);setIssuesOpen(true);setError('');inform('已完成局部 cAMV 检查；结果只包含顶点局部平折条件。');}catch(e){setError(errorText(e));}}
  function mergeVertices(crossType=false){
    try{
      const result=crossType?mergeAllCrossTypeVertices(doc,lockBoundary):mergeAllVertices(doc,lockBoundary);
      if(!result.merged){inform('没有可合并的冗余顶点，工程未修改；交叉点、受保护边界和折角冲突点保留。');return;}
      if(!commit(result.doc))return;
      setSelected(new Set());
      inform(`已${crossType?'跨类型':''}合并 ${result.merged} 个冗余顶点，可一次撤销；折角冲突点保留。`);
    }catch(e){setError(errorText(e));}
  }
  function repair(){try{const result=repairOverlappingSegments(doc,lockBoundary);if(!result.changed){inform('没有发现可整理的交点或重复线，当前工程未修改。');return;}if(!commit(result.doc))return;setSelected(new Set());inform(`已整理交点；删除 ${result.removed} 条重复小段。重叠处保留后绘制线${lockBoundary?'，受保护纸边优先':''}，可使用撤销恢复。`);}catch(e){setError(errorText(e));}}
  function repairT(){try{if(!confirmAction('将 T 接点和交叉点切分为可独立选择、删除的真实小段；不改变线型和角度。此操作可撤销。是否继续？'))return;const result=repairTJunctions(doc);if(!result.changed){inform('没有发现需要切分的 T 接点或交叉点，当前工程未修改。');return;}if(!commit(result.doc))return;setSelected(new Set());inform(`已修复 T 接点，新增 ${result.split} 条独立小段。可使用撤销恢复。`);}catch(e){setError(errorText(e));}}
  async function exportCurrentModel(){
    if(exportLock.current||flatBusy||!flatSource||!modelRef.current.present)return;
    exportLock.current=true;setExportBusy(true);setError('');
    try{
      const text=exportModelSnapshot(flatSource.doc,modelRef.current.present),result=await download(text,safeName(flatSource.doc.name)+'.zhezhi-model.json','application/json');
      if(result.status==='cancelled'){inform('已取消保存模型快照。');return;}
      inform((result.status==='saved'?'模型快照文件保存完成。':'已发起模型快照浏览器下载，请确认下载结果。')+'快照包含当前模型与正反色约束，不含撤销历史；离开提醒仍保留。');
    }catch(e){setError('模型快照导出失败：'+errorText(e));}finally{exportLock.current=false;setExportBusy(false);}
  }
  async function openModelFile(file:File){
    const request=++openRequest.current,identity=scope.current;
    try{
      const text=await file.text();if(request!==openRequest.current||identity!==scope.current)return;
      const prepared=prepareModelSnapshot(text);
      if(!approveReplace()||!replace(prepared.doc))return;
      retainModel(prepared.result,{doc:prepared.doc,graph:prepared.graph});openFlat();setDialog(null);
      inform('模型快照已载入，原始折痕与结果几何已恢复。层序尚未验证，可重新分析当前模型；撤销历史从此处开始。');
    }catch(e){setError(errorText(e));}
  }
  async function exportCollection(){
    if(exportLock.current||flatBusy)return;
    exportLock.current=true;setExportBusy(true);setError('');
    try{
      const result=await download(exportModelCollection(docRef.current,modelsRef.current),safeName(docRef.current.name)+'.zhezhi-models.json');
      if(result.status==='cancelled'){inform('已取消保存模型集合。');return;}
      inform((result.status==='saved'?'模型集合文件保存完成。':'已发起模型集合浏览器下载，请确认下载结果。')+'包含当前工程和各模型结果，包含各模型视图，不含撤销历史或已验证层序；离开提醒仍保留。');
    }catch(e){setError('模型集合导出失败：'+errorText(e));}finally{exportLock.current=false;setExportBusy(false);}
  }
  async function openCollectionFile(file:File){
    const request=++openRequest.current,identity=scope.current;
    try{
      const text=await file.text();if(request!==openRequest.current||identity!==scope.current)return;
      const prepared=prepareModelCollection(text);
      if(!approveReplace()||!replace(prepared.doc))return;
      // Keep generation local and monotonic; never install file-side asynchronous tickets.
      const restored={...prepared.collection,generation:modelsRef.current.generation+1};modelsRef.current=restored;setModels(restored);showActiveModel();openFlat();setDialog(null);
      inform('模型集合已载入；当前工程、各模型形状与活动项已恢复。层序需重新分析，撤销历史从此处开始。');
    }catch(e){setError(errorText(e));}
  }
  function modelHistoryStep(type:'undo'|'redo'){
    if(flatStale||!(type==='undo'?modelRef.current.past.length:modelRef.current.future.length))return;
    flatRequest.current++;flatJob.current?.cancel();setFlatBusy(false);setFlatFace(null);setModelSelection({group:[],selected:[]});updateModel({type});
  }
  function reanalyzeModel(solutionIndex?:number,constraints=modelRef.current.present?.layers.constraints){
    const current=modelRef.current;if(flatBusy||!current.present||current.present.geometry.status!=='ready'||flatStale)return;
    if(solutionIndex!==undefined&&(!Number.isSafeInteger(solutionIndex)||solutionIndex<0)){setError('层序解编号无效。');return;}
    const request=++flatRequest.current,identity=scope.current,ticket=modelAnalysisTicket(modelsRef.current);flatJob.current?.cancel();flatInputDoc.current=flatSource?.doc??null;setBusyModelId(ticket?.id??null);setFlatBusy(true);setError('');
    setFlatStartedAt(Date.now());setFlatComputationProgress({stage:'preparing',label:'准备层序计算'});
    let acceptingProgress=true;
    const job=startFlatLayerReanalysis(current.present,{timeoutMs:Infinity,solutionIndex,constraints,onComputationProgress:progress=>{if(acceptingProgress&&identity===scope.current&&request===flatRequest.current)setFlatComputationProgress(progress);}});flatJob.current=job;
    job.promise.then(result=>{acceptingProgress=false;if(identity!==scope.current||request!==flatRequest.current)return;if(ticket){const next=activeFoldedModel(updateModels({type:'analysis',ticket,result}));if(next){modelRef.current=next.history;setModelHistory(next.history);}}else updateModel({type:'analysis',revision:current.revision,result});setFlatBusy(false);setBusyModelId(null);}).catch(error=>{acceptingProgress=false;if(identity===scope.current&&request===flatRequest.current){setError(errorText(error));setFlatBusy(false);setBusyModelId(null);}});
  }
  function setFoldingConstraints(constraints:FoldingConstraint[]){
    const current=modelRef.current.present;if(flatBusy||flatStale||!current||current.geometry.status!=='ready')return;
    const next={...current,layers:{...current.layers,constraints:structuredClone(constraints)}};
    updateModel({type:'commit',result:next});
    reanalyzeModel(0,constraints);
  }
  function editModelVertices(selection:FoldedVertexSelection,destination:Point,mode:ModelVertexEditMode='recompute'){
    if(flatBusy||flatStale||!modelRef.current.present)return;
    try{const result=moveFoldedVertices(modelRef.current.present,selection,destination);if(result===modelRef.current.present)return;updateModel({type:'commit',result});setModelSelection({...selectFoldedVertex(result.geometry.vertices,{group:[],selected:[]},selection.selected[0],'folded'),selected:[...selection.selected]});setFlatFace(null);if(mode==='recompute')reanalyzeModel();else inform('已应用直接线框编辑；层序未重算。确认形状后可点击“重新分析当前模型”。');}catch(e){setError(errorText(e));}
  }
  function showActiveModel(preserveJob=false){
    if(!preserveJob){flatRequest.current++;flatJob.current?.cancel();setFlatBusy(false);setBusyModelId(null);setPendingFold(null);}
    setFlatFace(null);setModelSelection({group:[],selected:[]});
    const entry=activeFoldedModel(modelsRef.current),history=entry?.history??emptyFoldedModelHistory();
    if(!preserveJob)flatInputDoc.current=entry?.source.doc??null;
    modelRef.current=history;setModelHistory(history);setFlatSource(entry?.source??null);setFlatSignature(entry?JSON.stringify(entry.source.doc):'');
  }
  function retainModel(result:FlatFoldResult,source:FoldedModelEntry['source']){
    const id=crypto.randomUUID();updateModels({type:'add',id,name:`模型 ${modelsRef.current.entries.length+1}`,source,result});
    updateModels({type:'view',id,view:copyModelView(flatDefaultsRef.current)});showActiveModel();
  }
  function selectModel(id:string){modelMarkEpoch.current++;if(id===modelsRef.current.activeId)return;updateModels({type:'select',id});showActiveModel(true);}
  function copyModel(){if(flatBusy||!activeFoldedModel(modelsRef.current))return;try{const id=crypto.randomUUID();updateModels({type:'snapshot-copy',id,name:activeFoldedModel(modelsRef.current)!.name+' 副本'});const entry=activeFoldedModel(modelsRef.current)!;updateModels({type:'view',id,view:{...copyModelView(entry.view),cameras:{},layout:'single'}});showActiveModel();}catch(error){setError(errorText(error));}}
  function deleteModel(){const entry=activeFoldedModel(modelsRef.current);if(!entry||!confirmAction(`删除“${entry.name}”及其独立撤销历史？此操作不可撤销，请先导出需保留的模型快照。`))return;updateModels({type:'remove',id:entry.id});showActiveModel();setFlatOptionsOpen(false);if(!modelsRef.current.entries.length){setShowFlat(false);setModelToolsOpen(false);}}
  function rebuildModelSource(){
    const entry=activeFoldedModel(modelsRef.current);if(flatBusy||!entry?.history.present)return;
    try{const source=prepareModelSnapshot(exportModelSnapshot(entry.source.doc,entry.history.present));calculateModel(source.doc,source.result.geometry.startingFace??0,entry.source.cpKey??foldSourceCpKey(entry.source.doc));}catch(e){setError(errorText(e));}
  }
  function restoreModelSource(){
    const entry=activeFoldedModel(modelsRef.current);if(flatBusy||!entry?.history.present)return;
    try{
      const source=prepareModelSnapshot(exportModelSnapshot(entry.source.doc,entry.history.present));
      if(JSON.stringify(source.doc)===JSON.stringify(docRef.current)){inform('当前工程已经是所选模型的源折痕。');return;}
      if(!confirmAction(`将“${entry.name}”计算时的源折痕恢复到编辑器？当前折痕会被替换，可用工程撤销恢复；模型列表和模型历史保持不变。`))return;
      if(commit(source.doc)){setSelected(new Set());setOperationFrame(null);setExportFrame(false);setFitToken(n=>n+1);setIssues(null);inform('已恢复模型源折痕；模型列表保持不变，可用工程撤销返回。');}
    }catch(e){setError(errorText(e));}
  }
  function runFlat(){
    try{
      if(cpTarget){
        const chosen=pickFoldTarget(doc,cpTarget.point);
        if(chosen.key!==cpTarget.key)throw new Error('标记的 CP 位置已改变，请用中键重新标记要计算的 CP。');
        calculateModel(chosen.doc,undefined,chosen.key);return;
      }
      const material=hasMaterialTopology(doc)?inspectMaterialTopology(doc):null;
      const count=material?.ok?material.components.length:independentFoldBoundaryCount(doc);
      if(count>1){setError(`当前画布有 ${count} 张 CP，请先在要计算的 CP 上短按鼠标中键，出现绿色十字后再计算。`);return;}
      const bounds=getPaperBounds(doc),edge=doc.segments.find(segment=>segment.assignment==='B');
      const point:Point=edge?[(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2]:[bounds.x+bounds.width/2,bounds.y+bounds.height/2];
      const key=foldSourceCpKey(doc);setCpTarget({key,point});calculateModel(doc,undefined,key);
    }catch(error){setError(errorText(error));}
  }
  function runSelectedFlat(){
    try{const selection=extractFoldSelection(doc,selected),key=foldSourceCpKey(selection.doc),edge=selection.doc.segments.find(segment=>segment.assignment==='B');if(edge)setCpTarget({key,point:[(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2]});calculateModel(selection.doc,undefined,key);setSelected(current=>selectionAfterOperation(current,keepSelection,doc.segments.map(s=>s.id)));}
    catch(error){setError(errorText(error));}
  }
  function recognizeCurrent(){
    setModelToolsOpen(true);
    try{
      const result=buildFold(doc);setRecognition({graph:result.graph,warnings:result.warnings});
      inform(`已识别当前折痕：${result.graph.vertices_coords.length} 个顶点、${result.graph.edges_vertices.length} 条边、${result.graph.faces_vertices?.length??0} 个纸面。`);
    }catch(e){setRecognition(null);setError(errorText(e));}
  }
  function calculateModel(sourceDoc:Doc,root?:number,cpKey=foldSourceCpKey(sourceDoc)){
    if(countFoldedModelsForCp(modelsRef.current,cpKey)>=MAX_FOLDED_MODELS_PER_CP){setError(`此 CP 已有 ${MAX_FOLDED_MODELS_PER_CP} 个平折结果，请先删除不需要的结果后再生成。`);return;}
    const snapshot=structuredClone(sourceDoc);let source:FoldedModelEntry['source']|null=null;
    setFlatStartedAt(Date.now());setFlatComputationProgress({stage:'preparing',label:'准备折痕'});
    flatInputDoc.current=snapshot;setMode('edit');setShowFlat(true);setError('');
    const request=++flatRequest.current,identity=scope.current,markEpoch=modelMarkEpoch.current;flatJob.current?.cancel();setBusyModelId(null);setFlatBusy(true);setPendingFold({result:null,source:null,key:cpKey});
    let acceptingProgress=true;
    try{
      const job=startFlatFold(snapshot,{startingFace:root,timeoutMs:Infinity,
        onComputationProgress:progress=>{if(acceptingProgress&&identity===scope.current&&request===flatRequest.current)setFlatComputationProgress(progress);},
        onSource:graph=>{if(identity===scope.current&&request===flatRequest.current){source={doc:snapshot,graph,cpKey};setPendingFold({result:pendingFoldRef.current?.result??null,source,key:cpKey});}},
        onProgress:result=>{if(identity===scope.current&&request===flatRequest.current)setPendingFold({result,source,key:cpKey});}});flatJob.current=job;
      if(sourceDoc===doc)setSelected(current=>selectionAfterOperation(current,keepSelection,doc.segments.map(s=>s.id)));
      job.promise.then(result=>{
        acceptingProgress=false;
        if(identity!==scope.current||request!==flatRequest.current)return;
        if(result.geometry.status==='ready'&&source){const markedId=modelsRef.current.activeId,keepMarked=modelMarkEpoch.current!==markEpoch;retainModel(result,source);if(keepMarked&&markedId&&modelsRef.current.entries.some(entry=>entry.id===markedId))selectModel(markedId);setPendingFold(null);if(!keepMarked)selectFlatNavigation('fold');}
        else setPendingFold({result,source,key:cpKey});
        setFlatBusy(false);setBusyModelId(null);
      }).catch(error=>{acceptingProgress=false;if(identity===scope.current&&request===flatRequest.current){setError(errorText(error));setFlatBusy(false);setBusyModelId(null);setPendingFold(null);}});
    }catch(error){acceptingProgress=false;setError(errorText(error));setFlatBusy(false);setPendingFold(null);}
  }
  async function generateTess(){
    // Serialize backend jobs; a newer parameter snapshot wins when this one ends.
    if(tessAbort.current)return;
    const ctrl=new AbortController(),params=structuredClone(tessParams),key=tessConstructionKey(params),request=structuredClone(params);
    if(request.family==='custom'){
      delete request.tileDecorations;
      delete request.tileSpecs;
      delete request.unitRegularCentered;
      delete request.unitTriangle;
      delete request.unitCyclic;
      delete request.unitQuadrilateralSplit;
      delete request.archimedeanPatch;
      delete request.twoColorableArchimedeanPatch;
      delete request.twoUniformPatch;
    }
    tessAttempt.current=key;tessAbort.current=ctrl;setTessBusy(true);setTessError('');
    const current=()=>tessAbort.current===ctrl&&!ctrl.signal.aborted&&tessLatest.current.mode==='tess'&&tessLatest.current.key===key;
    try{
      const r=await api<TessResponse>('tessellate',request,ctrl.signal);
      // Only the latest parameter snapshot may replace the preview.
      if(!current())return;
      setTessResult(prepareTessResult(r,params));setTessSignature(key);
      if(!tessSignature||JSON.parse(tessSignature).family!==params.family){setTessView('fold');setFitToken(n=>n+1);}
    }catch(e){if(current()){if((e as {status?:number}).status===429){tessAttempt.current='';await new Promise(resolve=>setTimeout(resolve,300));}else setTessError(errorText(e));}}
    finally{if(tessAbort.current===ctrl){setTessBusy(false);tessAbort.current=null;}}
  }
  useEffect(()=>{
    if(mode!=='tess'||curveDesign){tessAttempt.current='';tessAbort.current?.abort();return;}
    if(!online||tessBusy||tessAttempt.current===tessParamKey)return;
    const frame=window.requestAnimationFrame(()=>void generateTess());
    return()=>window.cancelAnimationFrame(frame);
  },[mode,online,tessParamKey,tessBusy,curveDesign,tessRetryToken]);
  function applyCurveDesign(design:CurveDesign):boolean{
    try{const next=curveDesignDocument(design);if(!curveDesignFromDocument(docRef.current)&&!approveReplace())return false;if(!replace(next,storedCurveDesign?projectId:null,false,!!storedCurveDesign))return false;setCurveDesign(design);setMode('tess');setTessRigidOpen(false);setExportFormat('json');inform('曲面设计已进入主画布，可修改参数、保存工程或导出尺寸图与采样网格。');return true;}catch(e){setError(errorText(e));return false;}
  }
  function adoptAcrossCP(next:Doc){try{if(!boundedAcrossSourceMatches(next))throw Error('二维纸带源参数与实际 CP 不一致，未采用。');
    if(!approveReplace())return false;const regenerating=acrossCPEdit&&!!readBoundedAcrossRecipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setAcrossCPEdit(false);inform('已仅采用原二维纸带 CP：曲折线 U、纸边 B、母线 A；未载入 FF 或层序。可编辑、保存与普通导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptConicCircleCP(next:Doc){try{if(!conicCircleCPSourceMatches(next))throw Error('原圆例当前源与二维材料不一致，未采用。');
    if(!approveReplace())return false;const regenerating=conicCircleCPEdit&&!!readConicCircleCPRecipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setConicCircleCPEdit(false);inform('已仅采用原圆例二维 CP：曲折 U、真实纸边 B；原方向及毫米坐标保持，没有 FF 或层序。可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptConicNoncircleCP(next:Doc){try{if(!conicNoncircleCPSourceMatches(next))throw Error('原非圆当前参数、驻定九规则与真实二维材料不一致，未采用。');
    if(!approveReplace())return false;const regenerating=conicNoncircleEdit&&!!readConicNoncircleRecipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setConicNoncircleEdit(false);inform('已仅采用原非圆有限二维 CP：原坐标和未归一母线保持，内部 U、真实纸边 B。可编辑、保存和导出；平折、层序与三维尚未认证。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptPlanarRuled4040CP(next:Doc){try{if(!planarRuledCP4040SourceMatches(next))throw Error('原直纹输入、二维材料或来源身份不一致，未采用。');
    if(!approveReplace())return false;const regenerating=planarRuled4040Edit&&!!readPlanarRuledCP4040Recipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setPlanarRuled4040Edit(false);inform('已仅采用原直纹二维三面 CP：未知折痕 U、真实纸边 B。可以编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptConeFourPlane4039CP(next:Doc){try{if(!coneFourPlaneCP4039SourceMatches(next))throw Error('原圆锥输入、四阶段来源或二维材料身份不一致，未采用。');
    if(!approveReplace())return false;const regenerating=coneFourPlane4039Edit&&!!readConeFourPlaneCP4039Recipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setConeFourPlane4039Edit(false);inform('已仅采用原圆锥四带 CP：保留所选折痕标记与真实纸边，可以编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptNonuniformSpiral3968CP(next:Doc){try{if(!nonuniformSpiralCP3968SourceMatches(next))throw Error('原非均匀螺旋输入、二维纸域或材料身份不一致，未采用。');
    if(!approveReplace())return false;const regenerating=nonuniformSpiral3968Edit&&!!readNonuniformSpiralCP3968Recipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setNonuniformSpiral3968Edit(false);inform('已采用原非均匀螺旋内切 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptUniformHelix3951CP(next:Doc){try{if(!uniformHelixCP3951SourceMatches(next))throw Error('原均匀螺旋输入、解析源、二维纸域或材料身份不一致，未采用。');
    if(!approveReplace())return false;const regenerating=uniformHelix3951Edit&&!!readUniformHelixCP3951Recipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setUniformHelix3951Edit(false);inform('已采用原均匀螺旋 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptSpiralRefold3980CP(next:Doc){try{if(!spiralRefoldCP3980SourceMatches(next))throw Error('原展开再折回输入、递减折角源、二维纸域或材料身份不一致，未采用。');
    if(!approveReplace())return false;const regenerating=spiralRefold3980Edit&&!!readSpiralRefoldCP3980Recipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setSpiralRefold3980Edit(false);inform('已采用原展开再折回 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptUniformHelixGeneral3951CP(next:Doc){try{const nextSource=readUniformHelixModeRecipe(next);if(!nextSource||!uniformHelixModeSourceMatches(nextSource.mode,next))throw Error('原通用均匀螺旋参数、解析源、纸域或材料身份不一致，未采用。');
    if(!approveReplace())return false;const currentSource=readUniformHelixModeRecipe(docRef.current),regenerating=uniformHelixGeneral3951Edit&&currentSource?.mode===nextSource.mode;
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setUniformHelixGeneral3951Edit(false);inform('已采用原通用均匀螺旋 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptNonuniformHelixGeneral3966CP(next:Doc){try{if(!nonuniformHelixGeneralCP3966SourceMatches(next))throw Error('原任意折角螺旋参数、解析源、纸域或材料身份不一致，未采用。');
    if(!approveReplace())return false;const regenerating=nonuniformHelixGeneral3966Edit&&!!readNonuniformHelixGeneralCP3966Recipe(docRef.current);
    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
    setNonuniformHelixGeneral3966Edit(false);inform('已采用原任意折角螺旋 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}
  function adoptAltMoselyFiniteCP(next:Doc):boolean{
    try{if(!altMoselyFiniteCPSourceMatches(next))throw Error('交替 Mosely 原剖面、赋型与实际纸面不一致，未采用。');
      if(!approveReplace())return false;const regenerating=altMoselyFiniteEdit&&!!readAltMoselyFiniteRecipe(docRef.current);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setAltMoselyFiniteEdit(false);inform('已采用原交替 Mosely 有限 CP，保留源剖面、峰谷及毫米坐标，可继续编辑、保存和导出。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptEllipseAcrossFiniteCP(next:Doc,kind:'ellipse'|'across'):boolean{
    try{const read=kind==='ellipse'?readEllipseOpticalCP4034Recipe:readAcrossDescendingCP3988Recipe,match=kind==='ellipse'?ellipseOpticalCP4034SourceMatches:acrossDescendingCP3988SourceMatches;
      if(!read(next)||!match(next))throw Error('当前原曲折参数、峰谷、纸边与有限材料不一致，未采用。');
      if(!approveReplace())return false;const regenerating=ellipseAcrossFiniteEdit===kind&&!!read(docRef.current);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setEllipseAcrossFiniteEdit(null);inform('已采用原曲折有限 CP，保留原坐标和纸边。可编辑、保存及明确恢复来源；没有三维或平折层序证书。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptHuffmanFiniteCP(next:Doc):boolean{
    try{const incoming=readHuffmanFiniteCPRecipe(next);if(!incoming||!huffmanFiniteCPSourceMatches(next))throw Error('Huffman 原二维源、峰谷折痕和实际纸面不一致，未采用。');
      if(!approveReplace())return false;const previous=readHuffmanFiniteCPRecipe(docRef.current),regenerating=huffmanFiniteEdit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setHuffmanFiniteEdit(false);inform('已采用 Huffman 有限二维 CP，保留原峰谷、纸边和毫米坐标。可编辑、保存及普通导出；三维与平折层序未认证。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptLinkedBands4086CP(next:Doc):boolean{
    try{if(!linkedBands4086Dialog||!linkedBandsPlanarCP4086SourceMatches(next))throw Error('关联多带参数、有限纸域或材料来源不一致，未采用。');
      if(!approveReplace())return false;const regenerating=linkedBands4086Dialog.edit&&!!readLinkedBandsPlanarCP4086Recipe(docRef.current);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setLinkedBands4086Dialog(null);inform('已采用关联多带二维 CP，保留原毫米位置、纸边及未知折痕。可编辑、保存和明确重建参数。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptLinearSpaceCP(next:Doc):boolean{
    try{const incoming=readLinearSpacePolyhedralCPRecipe(next);if(!linearSpaceDialog||!incoming||!linearSpacePolyhedralCPSourceMatches(next))throw Error('折链与空间折线纸带的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous=readLinearSpacePolyhedralCPRecipe(docRef.current),regenerating=linearSpaceDialog.edit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setLinearSpaceDialog(null);inform('已采用折链与空间折线纸带 CP。可保存、重开与修改来源参数。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptGeneralSpacerCP(next:Doc):boolean{
    try{const incoming=readGeneralSpacerMiuraRecipe(next);if(!generalSpacerDialog||!incoming||!generalSpacerMiuraSourceMatches(next))throw Error('一般与嫁接 Miura的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous=readGeneralSpacerMiuraRecipe(docRef.current),regenerating=generalSpacerDialog.edit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setGeneralSpacerDialog(null);inform('已采用一般与嫁接 Miura CP。可保存、重开与修改来源参数。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptFlutedMultiSliceConeCP(next:Doc):boolean{
    try{const incoming=readFlutedMultiSliceConeRecipe(next);if(!flutedMultiSliceConeDialog||!incoming||!flutedMultiSliceConeSourceMatches(next))throw Error('褶锥与多次切片的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous=readFlutedMultiSliceConeRecipe(docRef.current),regenerating=flutedMultiSliceConeDialog.edit&&(previous?.model===incoming.model);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setFlutedMultiSliceConeDialog(null);inform('已采用褶锥与多次切片 CP。可保存、重开与修改来源参数。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptGenericSpacePaperCP(next:Doc):boolean{
    try{const incoming=readGenericSpacePaperRecipe(next);if(!genericSpacePaperDialog||!incoming||!genericSpacePaperSourceMatches(next))throw Error('空间曲折有限纸面的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous=readGenericSpacePaperRecipe(docRef.current),regenerating=genericSpacePaperDialog.edit&&(previous!==null);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setGenericSpacePaperDialog(null);inform('已采用空间曲折有限纸面 CP。可保存、重开与修改来源参数。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptStrainTQCP(next:Doc):boolean{
    try{const incoming=readStrainTQRecipe(next);if(!strainTQDialog||!incoming||!strainTQSourceMatches(next))throw Error('TQ 约束设计的原参数、工程极小值、材料与赋型不一致，未采用。');
      if(!approveReplace())return false;const previous=readStrainTQRecipe(docRef.current),regenerating=strainTQDialog.edit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setStrainTQDialog(null);inform('已采用原 TQ 约束设计 CP。可保存、重开与修改完整来源参数；工程求解与三维认证范围在构造窗口显示。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptRotationalPleatsCP(next:Doc):boolean{
    try{const incoming=readRotationalPleatsCPRecipe(next);if(!rotationalPleatsDialog||!incoming||!rotationalPleatsCPSourceMatches(next))throw Error('旋转褶构造的原参数、工程根、材料与赋型不一致，未采用。');
      if(!approveReplace())return false;const previous=readRotationalPleatsCPRecipe(docRef.current),regenerating=rotationalPleatsDialog.edit&&previous!==null;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setRotationalPleatsDialog(null);inform('已采用原旋转褶纸带 CP。可保存、重开和修改来源参数；三维认证范围在构造窗口显示。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptBasicPaperModelCP(next:Doc):boolean{
    try{const incoming=readBasicPaperModelRecipe(next);if(!basicPaperModelDialog||!incoming||!basicPaperModelSourceMatches(next))throw Error('单纸基础模型的当前原参数、材料、峰谷和来源不一致，未采用。');
      if(!approveReplace())return false;const previous=readBasicPaperModelRecipe(docRef.current),regenerating=basicPaperModelDialog.edit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setBasicPaperModelDialog(null);inform('已采用原单纸基础模型 CP。可保存、重开与修改完整来源参数；三维认证范围在构造窗口中显示。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptSavedDevelopablePaper(next:Doc):boolean{
    try{const incoming=readSavedDevelopablePaperRecipe(next);if(!savedDevelopablePaperDialog||!incoming||!savedDevelopablePaperSourceMatches(next))throw Error('原展开纸形的当前原参数、B/0 纸边和来源不一致，未采用。');
      if(!approveReplace())return false;const previous=readSavedDevelopablePaperRecipe(docRef.current),regenerating=savedDevelopablePaperDialog.edit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setSavedDevelopablePaperDialog(null);inform('已采用一张原展开纸形，只有 B/0 纸边，没有新压痕或参考母线。可保存、重开与按源参数重建。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptBistableTwistTubeCP(next:Doc):boolean{
    try{const incoming=readBistableTwistTubeRecipe(next);if(!bistableTwistTubeDialog||!incoming||!bistableTwistTubeSourceMatches(next))throw Error('双稳态折管的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous=readBistableTwistTubeRecipe(docRef.current),regenerating=bistableTwistTubeDialog.edit&&(previous!==null);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setBistableTwistTubeDialog(null);inform('已采用双稳态折管 CP。可保存、重开与修改来源参数。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptFlatTroublewitStripCP(next:Doc):boolean{
    try{const incoming=readFlatTroublewitStripRecipe(next);if(!flatTroublewitStripDialog||!incoming||!flatTroublewitStripSourceMatches(next))throw Error('平折路径纸带与 Troublewit的原参数、材料和折痕不一致，未采用。');
      if(!approveReplace())return false;const previous=readFlatTroublewitStripRecipe(docRef.current),regenerating=flatTroublewitStripDialog.edit&&(previous?.model===incoming.model);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setFlatTroublewitStripDialog(null);inform('已采用平折路径纸带与 Troublewit CP。可保存、重开与修改来源参数。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptSemiGeneralMiuraCP(next:Doc):boolean{
    try{const incoming=readSemiGeneralMiuraRecipe(next);if(!semiGeneralMiuraDialog||!incoming||!semiGeneralMiuraSourceMatches(next))throw Error('原路径波纹参数、峰谷、折角和材料不一致，未采用。');
      if(!approveReplace())return false;const previous=readSemiGeneralMiuraRecipe(docRef.current),regenerating=semiGeneralMiuraDialog.edit&&previous?.mode===incoming.mode;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setSemiGeneralMiuraDialog(null);inform('已采用原路径波纹 CP，保留原毫米位置、峰谷与目标角。可保存、重开和明确重建来源。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptOriginalArrayCP(next:Doc):boolean{
    try{
      const source=readOriginalArraySource(next);
      if(!source||source.kind!==originalArrayDialog?.kind||!originalArraySourceMatches(next))throw Error('原阵列参数、折痕或材料来源不一致，未采用。');
      if(!approveReplace())return false;
      const regenerating=originalArrayDialog.edit&&sameOriginalArrayFamily(readOriginalArraySource(docRef.current),source);
      if(regenerating)next={...next,name:docRef.current.name};
      if(!replace(next,regenerating?projectId:null))return false;
      setOriginalArrayDialog(null);
      inform('已仅采用原阵列 CP，保留原折角和毫米坐标；可以编辑、保存、导出及明确重建来源。未载入平折或层序证书。');
      return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptWovenCP(){if(!tessCPAdoptable||!tessResult||!approveReplace())return;try{const adopted=tessParams.family==='discrete-curve-cp'?discreteCurveCPDocument(tessResult,tessParams):wovenCPDocument(tessResult,tessParams);if(!replace(adopted))return;inform('已仅采用经过几何验证的 CP，未载入折后位置或层序证书。可修改折痕后重新计算平折；镶嵌参数不会覆盖此副本。');}catch(e){setError(errorText(e));}}
  function adoptTess(){if(!tessAdoptable||!tessResult||!approveReplace())return;try{const cut=hasWovenInternalBoundary(tessResult),adopted=cut?wovenMaterialDocument(tessResult,tessParams):structuredClone(tessResult.doc);adopted.metadata={...adopted.metadata,tessellation:{...(adopted.metadata?.tessellation as Record<string,unknown>),parameters:structuredClone(tessParams)}};if(!replace(adopted))return;inform(cut?'已建立切口材料工程。可修改折痕属性，按完整部件变换并重新平折；新增或删除材料折痕仍需专门的拓扑操作。':tessTilingOnly?'已建立母结构工程，内部边为辅助线。':'已建立独立折痕工程。此后修改参数不会覆盖这里的手工修订。');}catch(e){setError(errorText(e));}}
  async function captureSimulationImage(){
    if(simulationImageAbort.current)return;
    const bridge=simBridge.current,source=simLayerSource.current;
    if(mode!=='sim'||!simReady||simStale||!bridge||!source){inform('请等待当前三维模型载入完成后再截取。');return;}
    const controller=new AbortController();simulationImageAbort.current=controller;setCapturingSimulationImage(true);
    const current=()=>simulationImageAbort.current===controller&&!controller.signal.aborted&&simulationCaptureContext.current.mode==='sim'&&simulationCaptureContext.current.signature===source.signature&&simBridge.current===bridge&&simLayerSource.current===source;
    try{
      const capture=await bridge.captureImage({signal:controller.signal});
      if(!current())return;
      const image=await prepareDiagramImage({dataUrl:capture.dataUrl,name:'三维模拟截图',source:'simulation'},controller.signal);
      if(!current())return;
      setIncomingDiagramImage({id:crypto.randomUUID(),image});setDiagramVisited(true);setMode('diagram');
    }catch(error){
      if(current())inform(`截取模拟图片失败：${errorText(error)}`);
    }finally{
      if(simulationImageAbort.current===controller){simulationImageAbort.current=null;setCapturingSimulationImage(false);}
    }
  }
  function loadSimulation(pose?:SimulationPose){
    simLayerSource.current=null;simLayerJob.current?.cancel();simLayerJob.current=null;setSimStatus(null);
    try{
      if(pose){
        let matches=false;try{matches=simulationSourceSignature(buildFold(docRef.current).graph)===simulationSourceSignature(pose.source);}catch{/* An older pose keeps its own valid source CP. */}
        const next=++simRevision.current;simBridge.current?.send({type:'zhezhi-sim-load',fold:pose.source,pose,revision:next});
        setSimSignature(matches?JSON.stringify(docRef.current):'restored-independent-pose');setSimProgress(pose.progress*100);return;
      }
      const {graph,warnings}=buildFold(doc),source:{graph:FoldGraph;revision:number;signature:string;order:SimulationLayerOrder|null;message:string}={graph,revision:++simRevision.current,signature,order:null,message:''};simLayerSource.current=source;
      simBridge.current?.send({type:'zhezhi-sim-load',fold:graph,revision:source.revision});setSimSignature(signature);setSimProgress(0);simBridge.current?.send({type:'zhezhi-sim-progress',value:0});
      const sendLayers=(result:FlatFoldResult|null,message?:string)=>{
        if(simLayerSource.current!==source||JSON.stringify(docRef.current)!==source.signature)return;
        const order=result?simulationLayerOrder(graph,result):null;
        source.order=order;source.message=message??(order?'已确认当前折痕的平折层序。':result?.layers.status==='solved'?'当前结果没有可应用的重叠层序。':result?.layers.message||'当前折痕尚无可用平折层序。');
        simBridge.current?.send({type:'zhezhi-sim-layer-order',revision:source.revision,order,state:order?'ready':'unavailable',message:source.message});
      };
      const current=!flatBusy&&!flatStale&&flat&&flatSource&&JSON.stringify(flatSource.doc)===signature?flat:null;
      if(current)sendLayers(current,simulationLayerOrder(graph,current)?'采用当前所选平折结果的层序。':'当前所选平折结果没有可用层序，保持三维深度显示。');
      else if(rootResolution.stale||!simulationLayerOrderSupported(graph))sendLayers(null,'当前折痕目标不适用完全平折层序，保持三维深度显示。');
      else{
        simBridge.current?.send({type:'zhezhi-sim-layer-order',revision:source.revision,order:null,state:'pending',message:'正在后台确认平折层序…'});
        const job=startFlatFold(structuredClone(doc),{startingFace,timeoutMs:Infinity});simLayerJob.current=job;
        job.promise.then(result=>{if(simLayerJob.current!==job)return;simLayerJob.current=null;sendLayers(result);}).catch(()=>{if(simLayerJob.current!==job)return;simLayerJob.current=null;sendLayers(null,'平折层序确认失败，保持三维深度显示。');});
      }
      if(warnings.length)inform(warnings.join('；'));setError('');
    }catch(e){simLayerSource.current=null;simLayerJob.current?.cancel();simLayerJob.current=null;simBridge.current?.send({type:'zhezhi-sim-clear',revision:++simRevision.current});setSimSignature('');setSimProgress(0);setSimStatus({type:'zhezhi-sim-status',status:'error',message:errorText(e)});setError(errorText(e));}
  }
  function progress(value:number){if(!simReady||simStale)return;setSimProgress(value);simBridge.current?.send({type:'zhezhi-sim-progress',value:value/100});}
  function resizePaper(width:number,height:number){try{if(commit(resizeDocument(doc,width,height)))setFitToken(n=>n+1);}catch(e){setError(errorText(e));}}
  function svgText(crop=false,includeGrid=false){const native=storedCurveDesign;if(native)return exportCurveDesignSVG(native);if(crop&&(!operationFrame||!backgroundView||tool!=='operationframe'||mode!=='edit'))throw new Error('操作框已失效，请重新绘制。');return completeCreasePatternSVG(doc,creaseDisplay,crop?frameWorldBounds(operationFrame!,backgroundView!):undefined,displayLayers,undefined,includeGrid?{divisions,diagonal:diagonalGrid,pattern:gridAppearance.pattern??'square',rotation:gridAppearance.squareRotation??0,scope:gridScope==='canvas'?'canvas':'paper',appearance:gridAppearance}:undefined);}
  async function doExport(){
    if(exportLock.current)return;exportLock.current=true;setExportBusy(true);setError('');
    try{
      // Let the busy control repaint before serializing a large CP/DXF.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      const name=safeName(doc.name),native=storedCurveDesign;let blob:Blob,filename:string;
      if(native&&!['json','svg','obj','png','jpg'].includes(exportFormat))throw new Error('曲面设计请导出完整工程、尺寸 SVG 或采样 OBJ。');
      if(exportFormat==='obj'){if(!native)throw new Error('采样 OBJ 用于曲面设计。');blob=new Blob([exportCurveDesignOBJ(native)],{type:'text/plain'});filename=name+'.obj';}
      else if(exportFormat==='dxf'){const result=exportDXF(doc);if(!confirmAction('DXF 导出注意事项：\n'+result.warnings.join('\n')+'\n\n继续导出？'))return;blob=new Blob([result.text],{type:'application/dxf'});filename=name+'.dxf';}
      else if(exportFormat==='svg'){blob=new Blob([svgText(exportFrame,exportGrid)],{type:'image/svg+xml'});filename=name+'.svg';}
      else if(exportFormat==='png'||exportFormat==='jpg'){blob=await rasterizeSVG(svgText(exportFrame,exportGrid),exportFormat);filename=name+'.'+exportFormat;}
      else{const result=exportDocument(doc,exportFormat,{cpCoordinates});if(result.warnings.length&&!confirmAction('导出注意事项：\n'+result.warnings.join('\n')+'\n\n继续导出？'))return;blob=new Blob([result.text],{type:exportFormat==='opx'?'application/xml':(exportFormat==='cp'||exportFormat==='orh')?'text/plain':'application/json'});filename=name+(exportFormat==='json'?'.zhezhi.json':'.'+exportFormat);}
      const result=await saveDownload(blob,filename);
      if(result.status==='cancelled'){inform('已取消导出，未保存文件。');return;}
      inform((result.status==='saved'?'文件已保存到你选择的位置。':'已发起浏览器下载，请确认下载结果。')+'导出副本不会替代本机工程库的保存。');
    }catch(e){setError('导出失败：'+errorText(e));}finally{exportLock.current=false;setExportBusy(false);}
  }
  async function exportRecoveryBackup(){
    if(exportLock.current||!recoveryAlternatives.length)return;
    exportLock.current=true;setExportBusy(true);setError('');
    try{
      const other=recoveryAlternatives[0],file=exportDocument(other.doc,'json');
      const result=await download(file.text,safeName(other.doc.name)+'-另一恢复副本.zhezhi.json');
      if(result.status==='cancelled'){inform('已取消保存恢复副本。');return;}
      inform(result.status==='saved'?'恢复副本文件保存完成。':'已发起恢复副本浏览器下载，请确认下载结果。');
    }catch(e){setError('恢复副本导出失败：'+errorText(e));}finally{exportLock.current=false;setExportBusy(false);}
  }
  function printDoc(){
    const markup=cpPrintHTML(svgText());
    if(window.desktop){const container=document.createElement('div');container.className='desktop-print-page';container.innerHTML=markup;document.body.appendChild(container);void window.desktop.print().then(r=>{if(!r.success&&r.failureReason&&!/cancel/i.test(r.failureReason))setError('打印未完成：'+r.failureReason);}).catch(e=>setError(errorText(e))).finally(()=>container.remove());return;}
    const win=window.open('','_blank');if(!win){setError('打印窗口被浏览器拦截，请允许此本地工作台弹出打印窗口。');return;}
    win.document.write('<!doctype html><html lang="zh-CN"><head><title>折痕图 · 完整适配纸张</title></head><body><div class="desktop-print-page">'+markup+'</div></body></html>');win.document.close();win.focus();win.print();
  }
  useEffect(()=>window.desktop?.onCommand(command=>{if(command==='settings'){void openStorageSettings();return;}if(mode==='design'){if(command==='open')designRef.current?.open();if(command==='save')designRef.current?.save();if(command==='export')designRef.current?.export();return;}if(mode==='diagram'){if(command==='open')diagramRef.current?.open();if(command==='save')diagramRef.current?.save();if(command==='export')diagramRef.current?.export();if(command==='print')diagramRef.current?.print();return;}if(mode==='edit'&&creaseLibraryOpen&&!hasCreaseDocumentRef.current&&command!=='open')return;if(command==='open')void chooseProjectFile();if(command==='save'){flushSync(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});void save();}if(command==='export')setDialog('export');if(command==='print')printDoc();}),[doc,projectId,creaseDisplay,displayLayers,mode,creaseLibraryOpen,storageBusy]);
  async function toggleFullscreen(){try{if(window.desktop?.window){await window.desktop.window.toggleFullscreen();return;}if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(error){setError(errorText(error));}}
  const statusCounts=useMemo(()=>({M:doc.segments.filter(s=>s.assignment==='M').length,V:doc.segments.filter(s=>s.assignment==='V').length,U:doc.segments.filter(s=>s.assignment==='U').length}),[doc]);
  const instructions=TOOL_GUIDES[tool].usage;

  const toolLayoutActions:ToolLayoutActions={
    'action:check':check,
    'action:duplicates':repair,
    'action:merge':()=>mergeVertices(),
    'action:cross-merge':()=>mergeVertices(true),
    'action:fold-conflicts':()=>setDialog('mergecrossall'),
    'action:empty-branches':()=>{try{const result=trimBranches(doc);if(!result.removed){inform('未发现悬空分枝，工程未修改。');return;}if(commit(result.doc)){setSelected(new Set());inform(`已清除 ${result.removed} 条悬空分枝，可按 Ctrl+Z 撤销。`);}}catch(error){inform(`悬空分枝整理失败：${errorText(error)}`);}},
  };
  const dockSettingsContent={properties:<><MaterialPieceSelector doc={doc} selected={selected} lockBoundary={lockBoundary} onClipboardCut={applyMaterialClipboardCut} onSelect={ids=>{setSelected(ids);setTool('select');}} onCut={(next,intent,ids)=>{if(!commit(next,ids,intent))return false;inform(`已切开 ${intent.segmentIds.length} 条材料内边，可撤销；平折层序需要重新计算。`);return true;}} onJoin={(next,intent,ids)=>{if(!commit(next,ids,intent))return false;inform(`已粘合 ${intent.pairs.length} 对材料边界，可撤销；平折层序需要重新计算。`);return true;}} onCopy={(next,intent,ids)=>{if(!commit(next,ids,intent))return false;inform('已复制完整材料部件，可撤销；平折层序需要重新计算。');return true;}} onFaceEdit={(next,intent,ids)=>{if(!commit(next,ids,intent))return false;if(intent.kind==='material-auxiliary'){inform('已更新材料辅助线，可撤销。');return true;}if(intent.kind==='material-reference-face'){inform('已更新材料参考面，可撤销；平折层序需要重新计算。');return true;}if(intent.kind==='material-line-properties'){inform('已更新材料折痕属性，可撤销；平折层序需要重新计算。');return true;}if(intent.kind==='material-construction-move'){inform('已定位移动材料，可撤销；平折层序需要重新计算。');return true;}if(intent.kind==='material-curve-group-edit'||intent.kind==='material-curve-group-remove'){inform('已更新参数构造，可撤销；平折层序需要重新计算。');return true;}inform(`已${intent.kind==='material-face-remove'?'删除材料折痕并合并面':intent.kind==='material-face-trace'?'跨面构造材料折痕':intent.kind==='material-face-traces'?'批量构造材料折痕':'添加材料折痕'}，可撤销；平折层序需要重新计算。`);return true;}}/>{chosen.length?<><section><h2>修改选中线型</h2>{!selectedType&&<p className="muted small">所选包含多种类型</p>}<TypeButtons value={selectedType} onChange={modifyType}/><button className="text-button" onClick={()=>modifySwap()}>仅互换所选山谷</button><p className="note">点击立即应用，可撤销。不会改变上方新绘制线型。</p></section><section><h2>几何与折叠属性</h2>{one&&<><div className="readout"><span>长度</span><strong className="mono">{fmt(Math.hypot(one.b[0]-one.a[0],one.b[1]-one.a[1]))} mm</strong></div>{(['a','b'] as const).flatMap((end,i)=>([0,1] as const).map(axis=><NumberField key={one.id+end+axis} label={`${i?'终点':'起点'} ${axis?'Y':'X'}`} value={one[end][axis]} step={.1} onChange={n=>commit({...doc,segments:doc.segments.map(s=>s.id===one.id?{...s,[end]:s[end].map((v,j)=>j===axis?n:v) as Point}:s)})} suffix="mm"/>))}</>}</section><section><h2>线段移动与变换</h2><p className="note">本区仅处理所选 {chosen.length} 条线段。{chosenCircles.length>0?'另选的 '+chosenCircles.length+' 个圆保持不变；需要一起移动时，请在画布中拖动。':''}</p><div className="two-fields"><NumberField label="ΔX" value={dx} onChange={setDx}/><NumberField label="ΔY" value={dy} onChange={setDy}/></div><div className="button-pair"><button className="outline" onClick={()=>transformChosen('move',dx,dy)}>移动所选线段</button><button className="outline" onClick={()=>transformChosen('copy',dx,dy)}>复制所选线段</button></div><NumberField label="旋转角度" value={rotation} min={-360} max={360} suffix="°" onChange={setRotation}/><button className="outline full" onClick={()=>transformChosen('rotate',rotation)}>绕所选线段中心旋转</button><button className="outline full" onClick={()=>{setTool('rotatecopyselection');inform('请在画布点击旋转中心，移动鼠标预览旋转副本，再点击落位。');}}>旋转复制选区 · 指定中心</button><NumberField label="缩放比例" value={factor} min={.01} max={100} step={.1} onChange={setFactor}/><button className="outline full" onClick={()=>transformChosen('scale',factor)}>缩放所选线段</button><div className="button-pair"><button onClick={()=>transformChosen('mirrorX',0)}>左右镜像</button><button onClick={()=>transformChosen('mirrorY',0)}>上下镜像</button></div><p className="note">几何镜像保持原山谷赋型；如需反转折向，请单独互换山谷。</p></section></>:chosenCircles.length?<section><h2>圆属性</h2><p className="note">已选 {chosenCircles.length} 个辅助圆。定位构造适用于各入口生成的辅助圆。</p><div className="button-pair"><button onClick={()=>{setDockSettings(null);setTool("moveselection");}}>定位移动</button><button onClick={()=>{setDockSettings(null);setTool("copyselection");}}>定位复制</button></div><button className="outline full" onClick={()=>{setDockSettings(null);setTool("rotatecopyselection");}}>旋转复制 · 指定中心</button><button className="outline full" onClick={openCircleProperties}>编辑圆属性</button></section>:<section><h2>纸张与单位</h2><NumberField label="宽度" value={doc.paper.width} min={1} max={10000} suffix="mm" onChange={w=>resizePaper(w,doc.paper.height)}/><NumberField label="高度" value={doc.paper.height} min={1} max={10000} suffix="mm" onChange={h=>resizePaper(doc.paper.width,h)}/><p className="note">修改尺寸会同比例缩放该方向的全部几何，可撤销。边界以实际黑色边界线为准。</p><div className="readout"><span>山折 / 谷折</span><span className="mono">{statusCounts.M} / {statusCounts.V}</span></div>{statusCounts.U>0&&<div className="readout"><span>旧文件未指派</span><span className="mono">{statusCounts.U}</span></div>}<button className="outline full" onClick={()=>{setSelected(new Set(doc.segments.filter(s=>s.assignment!=='B').map(s=>s.id)));setTool('select');}}>选择全部非边界线</button><button className="text-button" onClick={()=>{if(confirmAction('互换全图山谷？边界、辅助和未指派线保持不变，此操作可撤销。'))modifySwap(new Set(doc.segments.map(s=>s.id)));}}>互换全图山谷</button></section>}</>,clipboard:<SelectionClipboardPanel clipboard={clipboard} selected={!!(selected.size||selectedCircles.size)} offset={[pasteOffsetX,pasteOffsetY]} onOffset={p=>{setPasteOffsetX(p[0]);setPasteOffsetY(p[1]);}} onCopy={copyClipboardSelection} onCut={cutClipboardSelection} onPaste={pasteClipboardSelection}/>,background:<BackgroundPanel doc={doc} view={backgroundView} onChange={commit} onPosition={()=>{setDockSettings(null);setTool('backgroundposition');}}/>,canvashelp:<>
    <section><h2>网格与吸附</h2><p>可选择方格、方格＋对角或正三角网格。新建纸张默认 300 × 300 mm。网格按工程固定的纸张基准等分，删除或重画边界不改变网格间距、原点和旋转中心。方格使用横纵相同的格距，可通过“网格旋转”绕基准中心旋转；对角参考线随方格一起转动。正三角网格由等边三角形密铺，六个三角形围成一个正六边形；等分控制网格边长。纸内网格跟随纸面，全画布网格延伸到视口，开启吸附后可选网格节点及线与网格的交点。</p></section>
    <section><h2>选择与边界</h2><p>交点会自动分割成独立小段，选择和删除仅作用于所选小段。纸边默认可选、可改型、可删除；开启保护后禁止选择和删除，仍可作为构造参考。边界需要闭合才能计算纸面。</p></section>
    <section><h2>保持选区</h2><p>用于平折启动、移动、复制与镜像。移动保留结果选区，复制与镜像保留原选区；关闭则完成后清空。交点分割后保留对应小段。切换工作区不清空，Esc 和主动取消仍有效。</p></section>
    <section><h2>辅助对象</h2><p>圆、文字与独立标记随工程保存，不参与折叠计算。可用右侧的圆编辑、文字注释和标记工具修改；撤标记／重标记仅影响独立标记。</p></section>
  </>};
  return <div className={"app soft-workbench chrome-workbench"+(tablet?" web-tablet":"")} data-tablet-panel={tabletPanel} data-workspace={mode}>
    <a className="skip-link" href={mode==='design'?'#design-workspace':mode==='diagram'?'#diagram-workspace':mode==='edit'&&creaseLibraryOpen?'#crease-library':'#workspace'}>{mode==='edit'&&creaseLibraryOpen?'跳到折痕文档':'跳到作品画布'}</a>
    <header className="app-header" onMouseDown={handleDesktopTitlebarMouseDown}>
      <div className="brand"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M3 3h22v22H3ZM3 3l22 22M25 3 3 25M14 3v22"/></svg><span>折纸工坊</span></div>
      <HeaderMenu label="文件" align="left">
        {mode!=='diagram'&&mode!=='design'&&<button onClick={()=>void files()}><Icon name="folder"/>{mode==='edit'?'折痕文档':'工程库'}</button>}
        <button onClick={()=>mode==='design'?designRef.current?.open():mode==='diagram'?diagramRef.current?.open():void chooseProjectFile()}>{mode==='design'?'打开设计工程':mode==='diagram'?'打开折序工程':'打开文件'}<kbd>Ctrl+O</kbd></button>
        {mode==='edit'&&!creaseLibraryOpen&&<button disabled={!!fileImport||flatBusy||!!doc.metadata?.curveDesign} onClick={()=>inputAppendFile.current?.click()} title="将另一张 CP 放到当前图案右侧，保持原尺寸">追加 CP</button>}
        {(mode==='diagram'||mode==='design')&&<button onClick={()=>void chooseProjectFile()}>打开完整作品</button>}
        <hr/>{tablet&&<button disabled={savingArtwork||flatBusy||!!fileImport} onClick={()=>void saveArtwork()}>保存完整作品</button>}<button onClick={()=>{setArtworkOverviewOpen(true);void artworkRecovery.refresh();}}>作品总览与恢复副本</button>
      </HeaderMenu>
    {recovery&&<div className="header-recovery"><HeaderMenu label="恢复副本" align="left"><div className="header-recovery-info">最近恢复副本（{recovery.source==='browser'?'浏览器':'本机磁盘'}）：<strong>{recovery.doc.name}</strong>{recovery.updated?' · '+new Date(recovery.updated).toLocaleString('zh-CN'):''}{hasCreaseDocument&&<small> · 旧副本保留，当前文档草稿仍会自动暂存</small>}</div><button onClick={()=>{if(signature!==startupSignature.current&&!approveReplace())return;if(!replace(recovery.doc,recovery.projectId||null))return;projectRevisionRef.current=recovery.baseRevision??null;setRecovery(null);setRecoveryChecked(true);inform('已恢复最近工作。请检查后手动保存。');}}>恢复工作</button>{recoveryAlternatives.length>0&&<button disabled={exportBusy} onClick={()=>void exportRecoveryBackup()}>导出另一副本</button>}<button onClick={()=>{setRecovery(null);setRecoveryChecked(true);}}>保留当前工程</button></HeaderMenu></div>}
      <div className="document-name"><input aria-label={mode==='design'?'当前工作区':mode==='diagram'?'来源折痕工程名称':'工程名称'} readOnly={mode==='design'||mode==='diagram'||mode==='edit'&&creaseLibraryOpen} value={mode==='design'?'基础形设计':mode==='edit'&&creaseLibraryOpen&&!hasCreaseDocument?'我的折痕':doc.name} maxLength={80} onChange={e=>{if(commit({...doc,name:e.target.value})&&curveDesign&&!curvePreviewSession.current)setCurveDesign({...curveDesign,name:e.target.value});}}/><span hidden={mode==='design'||mode==='edit'&&creaseLibraryOpen&&!hasCreaseDocument} className={'save-dot '+(!dirty?'saved':'')} title={mode==='diagram'?(dirty?'来源折痕工程尚未手动保存':'来源折痕工程已保存'):(dirty?'尚未手动保存':'已保存')}/><small>{mode==='design'?'独立设计工程':mode==='edit'&&creaseLibraryOpen&&!hasCreaseDocument?'选择或新建工程':mode==='diagram'?'来源折痕工程':dirty?'折痕未保存':'折痕已保存'}{autosaved?' · 恢复副本 '+autosaved:''}{unsavedModel&&<span className="warning" data-unsaved-model="true"> · 模型修改未保存</span>}</small></div>
      <div className="header-drag-space" aria-hidden="true"/>
      <div className="header-actions">
        <button className="header-open" onClick={()=>mode==='design'?designRef.current?.open():mode==='diagram'?diagramRef.current?.open():void chooseProjectFile()}><Icon name="folder"/>{mode==='design'?'打开设计工程':mode==='diagram'?'打开折序工程':'打开文件'}</button>
        <button className="primary" onClick={()=>{if(mode==='design'){designRef.current?.save();return;}if(mode==='diagram'){diagramRef.current?.save();return;}void save();}} disabled={mode==='design'?!designRef.current?.capture():mode!=='diagram'&&(saving||!online||creaseLibraryBusy||storageBusy||mode==='edit'&&creaseLibraryOpen&&!hasCreaseDocument)}><Icon name="save"/>{mode==='design'?'保存设计工程':mode==='diagram'?'保存折序工程':saving?'保存中…':'保存折痕'}</button>
        <button className="header-save-artwork" onClick={()=>void saveArtwork()} disabled={savingArtwork||flatBusy||!!fileImport} title="下载折痕、基础形设计、构造参数、模型、当前折序和三维姿态">{savingArtwork?'保存作品中…':'保存完整作品'}</button>
        <button className={'header-overview'+(artworkRecovery.error?' warning':'')} onClick={()=>{setArtworkOverviewOpen(true);void artworkRecovery.refresh();}} title={artworkRecovery.error?'完整作品暂存失败，请查看详情':'查看各工作区内容、保存范围与恢复副本'}>作品总览{artworkRecovery.entries.some(entry=>entry.id!==artworkRecovery.currentId)?' · 可恢复':''}</button>
        <HeaderMenu label="导出">
          <button disabled={mode==='edit'&&creaseLibraryOpen} onClick={()=>mode==='design'?designRef.current?.export():mode==='diagram'?diagramRef.current?.export():setDialog('export')}><Icon name="export"/>导出作品</button>
          {mode!=='diagram'&&mode!=='design'&&<button disabled={mode==='edit'&&creaseLibraryOpen||!!storedCurveDesign} onClick={()=>setProcessingExportOpen(true)}>优化加工导出</button>}
          <hr/><button disabled={mode==='design'||mode==='edit'&&creaseLibraryOpen} onClick={()=>mode==='diagram'?diagramRef.current?.print():printDoc()}>{mode==='diagram'?'打印折序':'打印折痕图'}<kbd>Ctrl+P</kbd></button>
        </HeaderMenu>
        <HeaderMenu label="设置" icon={<ChromeIcon name="settings"/>}>
          {mode!=='diagram'&&mode!=='design'&&<><button onClick={()=>setDialog('display')}>显示设置</button><button onClick={()=>{setShortcutTarget('line');setDialog('shortcuts');}}>快捷键设置</button></>}
          <button onClick={()=>void openStorageSettings()}>保存目录设置</button>
          {window.desktop?.openDataDirectory&&<button onClick={()=>void window.desktop!.openDataDirectory!().catch(error=>setError(errorText(error)))}>打开工程数据目录</button>}
          <hr/>{mode==='edit'&&!creaseLibraryOpen&&<button disabled={toolLayout.editing} onClick={()=>setCanvasFocused(value=>!value)}>{canvasFocused?'显示侧栏':'聚焦画布'}</button>}
          <button onClick={()=>void toggleFullscreen()}>切换全屏<kbd>F11</kbd></button>
        </HeaderMenu>
        <HeaderMenu label="帮助" icon={<ChromeIcon name="help"/>}>
          <button onClick={()=>setDialog('help')}>使用帮助与版本</button>
          {mode!=='diagram'&&!(mode==='edit'&&creaseLibraryOpen)&&<button onClick={()=>openLibrary()}>工具目录<kbd>Ctrl+K</kbd></button>}
          <button onClick={()=>setActivityLogOpen(true)}>查看与导出工作日志</button>
        </HeaderMenu>
      </div><WindowControls onError={inform}/>
    </header>
    <div className="app-shell">
    <nav className="workspaces" aria-label="工作区">
      {(['edit','design','tess','sim','diagram'] as Mode[]).map(m=><button className="workspace-tab" key={m} aria-pressed={mode===m} title={WEB_APP&&(m==='design'||m==='tess')?'此工作区需要桌面版':undefined} disabled={WEB_APP&&(m==='design'||m==='tess')||toolLayout.editing||!!doc.metadata?.curveDesign&&m!=='tess'} onClick={async()=>{setTabletPanel('');const request=++workspaceNavigation.current;if(workspaceMode.current==='design'&&m!=='design'&&designRef.current&&!designRef.current.checkpoint())return;if(workspaceMode.current==='diagram'&&m!=='diagram'&&diagramRef.current&&!await diagramRef.current.checkpoint())return;if(request!==workspaceNavigation.current)return;if(m==='edit'){void showCreaseLibrary(request);return;}if(m==='design')setDesignVisited(true);if(m==='diagram'){setDiagramVisited(true);diagramRef.current?.enter();}setMode(m);}}><ChromeIcon name={m}/><span>{MODE_NAMES[m]}</span></button>)}
      <span className="nav-spacer"/>
      {mode==='edit'&&!creaseLibraryOpen&&<button className="workspace-tab workspace-view-control" aria-pressed={canvasFocused} aria-controls="workspace" disabled={toolLayout.editing} onClick={()=>setCanvasFocused(value=>!value)}><ChromeIcon name="focus"/><span>{canvasFocused?'显示侧栏':'聚焦画布'}</span></button>}
      <span className="local-badge" data-online={online} title={WEB_APP?'计算与保存均在当前浏览器':online?'本机运行 · 离线优先':'本地服务未连接'} role="status"><i/>{WEB_APP?'浏览器运行':online?'本机运行':'服务未连接'}</span>
    </nav>
    <div className="app-content">
    {WEB_APP&&<WebEditionNotice/>}
    {creaseConflict&&<div className="recovery-bar" role="alert"><span>此工程已在其他窗口修改或删除。当前窗口的内容仍保留，请选择保存方式。</span><button disabled={saving} onClick={()=>void save(true)}>另存当前副本</button><button disabled={saving} onClick={()=>void reloadConflictedCrease()}>重新打开最新版本</button></div>}

    {storageImportWarning&&<div className="recovery-bar" role="status"><span>{storageImportWarning}</span><button onClick={()=>void openStorageSettings()}>查看保存目录</button><button onClick={()=>setStorageImportWarning('')} aria-label="关闭迁移提示">×</button></div>}
    {error&&<div className="error-bar" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="关闭错误提示">×</button></div>}
    {fileImport&&<div className="recovery-bar import-status" role="status"><span>正在导入 <strong>{fileImport.name}</strong> · {fileImport.stage}</span><button onClick={cancelFileImport}>取消导入</button></div>}
    {importFailure&&<AppDialog title="未能导入文件" size="small" closeLabel="关闭导入提示" onClose={()=>setImportFailure(null)} footer={<button className="primary" onClick={()=>setImportFailure(null)}>知道了</button>}><p className="import-failure-filename">文件：<strong>{importFailure.name}</strong></p><p role="alert">{importFailure.message}</p><p className="note">当前工程没有被此文件替换。可关闭提示后继续编辑，或检查文件后重新导入。</p></AppDialog>}
    {(mode==='tess'||mode==='sim')&&<div className="context-toolbar">{mode==='tess'?<><span className="muted">构造模板</span><strong>{curveDesign?curveDesign.name:TESS_NAMES[tessParams.family]}</strong><span className="toolbar-note">{curveDesign?'实际尺寸 · 可保存曲面设计':'参数变化自动预览'}</span><span className="spacer"/><button className="outline" disabled={!curveDesign&&(tessBusy||!online)} onClick={()=>curveDesign?setCurveEditRequest(n=>n+1):void generateTess()}>{curveDesign?'修改构造':tessBusy?'更新中…':'重新计算'}</button>{!curveDesign&&(tessParams.family==='discrete-curve-cp'||tessParams.family==='woven-lines'&&tessParams.mode==='graph')&&<button className="outline" disabled={!tessCPAdoptable} title="仅采用经过验证的 CP，不带折后位置或层序证书，可继续编辑" onClick={adoptWovenCP}>仅采用 CP →</button>}{!curveDesign&&<button className="primary" disabled={!tessAdoptable} onClick={adoptTess}>{tessTilingOnly?'采用母结构副本 →':tessSpatialFamily?'采用展开图副本 →':'采用折痕副本 →'}</button>}</>:<><span className="muted">独立模拟视图 · 目标角驱动</span><span className="spacer"/><button className="outline" disabled={!simReady||simStale} onClick={()=>simControls.current?.reset()}>复位展开</button><button className="primary" onClick={()=>loadSimulation()}>载入当前折痕</button></>}</div>}
    {tablet&&(mode==='sim'||mode==='edit'&&!creaseLibraryOpen)&&<TabletPanelBar label="工作面板" items={mode==='edit'?[['tools','绘图工具'],['inspector','画布与属性']]:[['inspector','模拟设置']]} value={tabletPanel} onChange={value=>{setTabletPanel(value);if(value)setCanvasFocused(false);}}/>}
    {mode==='edit'&&creaseLibraryOpen&&<div id="crease-library" style={{display:'flex',flex:1,minHeight:0,minWidth:0}}><CreaseLibrary documents={projects.map(project=>({...project,draft:project.draft??false,thumbnail:project.thumbnail??'',folderId:creaseLibraryMeta.documents[project.id]?.folderId??null,openedAt:creaseLibraryMeta.documents[project.id]?.openedAt??0}))} folders={creaseLibraryMeta.folders} lastOpenId={creaseLibraryMeta.lastOpenId} currentId={hasCreaseDocument?projectId:null} currentName={doc.name} canSaveCurrent={hasCreaseDocument} onOpen={id=>void openCreaseDocument(id)} onNew={()=>void newCreaseDocument()} onNewExample={kind=>void newCreaseDocument(kind)} onImport={()=>void chooseProjectFile()} onSaveCurrent={()=>void save()} onContinueCurrent={hasCreaseDocument?continueCreaseDocument:undefined} onCreateFolder={(name,parentId)=>organizeCreaseDocuments(value=>createCreaseLibraryFolder(value,name,parentId))} onRename={(id,name)=>void renameCreaseDocument(id,name)} onMove={(id,folderId)=>organizeCreaseDocuments(value=>moveCreaseLibraryDocument(value,id,folderId))} onDelete={deleteCreaseDocument} busy={creaseLibraryBusy||saving||storageBusy||!!fileImport} loading={creaseLibraryLoading} error={creaseLibraryError} onRefresh={()=>void refreshCreaseLibrary()}/></div>}
    <div className="workbench-main" inert={creaseLibraryBusy} style={mode==='design'||mode==='diagram'||mode==='edit'&&creaseLibraryOpen?{display:'none'}:undefined}>
      {mode==='edit'&&!canvasFocused&&<><div className="tablet-tool-sheet">{tablet&&<TabletPanelHeading title="绘图工具" onClose={()=>setTabletPanel('')}/>}<ToolRail layout={toolLayout} actions={toolLayoutActions} leading={<div className="dock-line-presets" title="新绘制线型，不改变已选线段"><div className="button-pair"><button disabled={!history.past.length} onClick={()=>dispatch({type:'undo'})}><Icon name="undo"/>撤销</button><button disabled={!history.future.length} onClick={()=>dispatch({type:'redo'})}><Icon name="redo"/>重做</button></div></div>} typeControls={<><TypeButtons compact value={preset} onChange={assignment=>{setPreset(assignment);selectFlatNavigation('crease');}}/></>} onShortcut={target=>{setShortcutTarget(target);setDialog('shortcuts');}} bindings={toolShortcuts} tool={tool} drawingSwap={drawingSwap} onTool={value=>{activateDrawingTool(value);if(tablet)setTabletPanel('');}} width={widths.left} onRemove={remove} canRemove={!!chosen.length||!!chosenCircles.length} onLibrary={openLibrary}/></div>
        <PanelDivider side="left" value={widths.left} min={192} max={Math.min(TOOL_PANEL_MAX,Math.max(800,viewport-workspaceRailWidth)-widths.right-368)} onChange={left=>setPanels(p=>({...p,left}))} onReset={()=>setPanels(p=>({...p,left:DEFAULT_PANELS.left}))}/></>}
      <main className="workspace" id="workspace">
        {mode==='edit'&&toolLayout.editing&&<ToolLayoutEditor layout={toolLayout} actions={toolLayoutActions} tool={tool} drawingSwap={drawingSwap} onTool={activateDrawingTool} bindings={toolShortcuts} onShortcut={target=>{setShortcutTarget(target);setDialog('shortcuts');}}/>}
        <div className="workspace-document" hidden={mode==='edit'&&toolLayout.editing} inert={mode==='edit'&&toolLayout.editing}>{mode!=='edit'&&<div className="canvas-heading"><h1>{MODE_NAMES[mode]}</h1>{mode==='tess'&&!curveDesign&&tessResult?.motherDoc&&<div className="tess-view-switch"><button aria-pressed={tessView==='fold'} onClick={()=>{setTessView('fold');setFitToken(n=>n+1);}}>{tessTilingOnly?'拼块图':'折痕图'}</button><button aria-pressed={tessView==='mother'} onClick={()=>{setTessView('mother');setFitToken(n=>n+1);}}>母结构</button>{tessResult.dualDoc&&<button aria-pressed={tessView==='dual'} onClick={()=>{setTessView('dual');setFitToken(n=>n+1);}}>原始与对偶</button>}</div>}<span className="chip">{mode==='tess'?(curveDesign?'曲面设计 · 实际尺寸 mm':tessHasSpatialView?(tessRigidOpen?tessSpatialFamily?'静态三维构形':'静态刚性三维':`${TESS_NAMES[tessParams.family]} · 展开折痕图`):tessTilingOnly?'母结构 · 辅助线':'真实构造 · 候选 CP'):'数值模拟'}</span>{mode==='tess'&&!curveDesign&&(tessHasSpatialView?<button className="tess-flat-toggle" aria-pressed={tessRigidOpen} onClick={()=>setTessRigidOpen(value=>!value)}>{tessRigidOpen?'显示折痕图':'显示三维构形'}</button>:<button className="tess-flat-toggle" disabled={tessTilingOnly} aria-pressed={!tessTilingOnly&&tessFlatOpen} onClick={()=>setTessFlatOpen(v=>!v)}>{!tessTilingOnly&&tessFlatOpen?'收起平折':'计算平折'}</button>)}<span className="spacer"/><span className="muted small">{mode==='tess'?curveDesign?'二维展开 / 三维曲面':tessResult?`${tessResult.stats.vertices} 顶点 · ${tessResult.stats.edges} 条边`:'选择参数，生成第一个单元排布':`${fmt(doc.paper.width)} × ${fmt(doc.paper.height)} mm · ${doc.segments.length} 条线`}</span></div>}
        {mode==='edit'&&<div className="shared-fold-workspace">
          <div className="editable-cp-pane" ref={flatNavigationPane} data-navigation-target={flatNavigation}><CreaseCanvas focusRegion={currentCpConflictFocus} svgOverlay={({view})=>cpConflict&&cpConflictSource?<g data-cp-flat-conflict="true" data-conflict-model-id={cpConflictModel?.id} pointerEvents="none"><FlatConflictOverlay conflict={cpConflict} result={cpConflictSource} coords={cpConflictSource.geometry.vertices} foldedResult={cpConflictResult??undefined} viewWidth={view.w}/></g>:null} targetPoint={cpTarget?.point} navigationTargetLabel={flatNavigationAvailable?(flatNavigation==='fold'?'平折结果':'折痕图'):undefined} overlayNavigation={flatNavigationAvailable&&flatNavigation==='fold'?{onZoom:zoomFlatNavigation,onFit:fitMarkedModel}:undefined} commandToken={commandActivation} diagnosticHighlights={issueHighlights} overlay={showFlat&&(<section className="canvas-fold-overlay" data-navigation-active={flatNavigation==='fold'} data-fold-result="true" aria-label="同画布平折模型">

            {models.entries.map((entry,index)=>entry.history.present&&<FlatView embedded overlay canvasModelId={entry.id} targetPoint={modelTargetPoints[entry.id]} targeted={entry.id===models.activeId} sceneIndex={index} sceneCount={models.entries.length}
              controlledView={entry.view??defaultModelView()} fitToken={flatFitTokens[entry.id]??0} optionsOpen={entry.id===models.activeId&&flatOptionsOpen}
              key={scope.current+':'+entry.id} initialView={entry.view}
              onViewChange={view=>updateModels({type:'canvas-view',id:entry.id,source:entry.source,view})}
              result={entry.history.present} busy={flatBusy&&busyModelId===entry.id} startedAt={flatBusy&&busyModelId===entry.id?flatStartedAt:undefined} onCancel={()=>flatJob.current?.cancel()} progressStage="layers" computationProgress={flatBusy&&busyModelId===entry.id?flatComputationProgress:undefined}
              stale={modelSourceCurrent.get(entry.id)===false} face={entry.id===models.activeId?flatFace:null} setFace={face=>{if(entry.id===modelsRef.current.activeId)setFlatFace(face);}}
              xray={entry.view?.xray??false} onRun={runFlat} source={entry.source}
              onConstraintsChange={entry.id===models.activeId?setFoldingConstraints:undefined}
              conflictControl={entry.id===models.activeId?{index:cpConflictIndex,onSelect:index=>setFlatConflictChoice({id:entry.id,result:entry.history.present!,index}),onLocate:locateCpConflict}:undefined}
              vertexControls={{selection:entry.id===models.activeId?modelSelection:{group:[],selected:[]},onSelect:setModelSelection,onMove:editModelVertices,disabled:flatBusy||modelSourceCurrent.get(entry.id)===false||entry.id!==models.activeId}}/>)}
            {pendingFold&&<div className="canvas-fold-job-status"><FlatComputationStatus status={flatComputationStatus({result:pendingFold.result,busy:flatBusy,stale:false,stage:pendingFold.result?.geometry.status==='ready'?'layers':pendingFold.source?'geometry':'preparing'})} progress={flatComputationProgress} startedAt={flatStartedAt} elapsedMs={pendingFold.result?.computationTimeMs} onCancel={flatBusy?()=>flatJob.current?.cancel():undefined}/>{!flatBusy&&<button onClick={()=>setPendingFold(null)}>关闭计算提示</button>}</div>}

          </section>)} workspaceLabel={`折痕编辑 · 正面基准 · ${fmt(doc.paper.width)} × ${fmt(doc.paper.height)} mm · ${doc.segments.length} 条线`} pickingSettings={canvasPicking} zoomSettings={canvasZoom} display={creaseDisplay} onToolGuideChange={changeToolGuide} onCursorHintChange={changeCursorHint} gridAppearance={gridAppearance} displayLayers={displayLayers} onDisplayLayersChange={setDisplayLayers} cropBusy={cropBusy} onBackgroundCrop={()=>void trimBackground()} onCancelBackgroundCrop={cancelBackgroundCrop} operationFrame={operationFrame} onOperationFrameChange={setOperationFrame} onFrameExport={()=>{setExportFrame(true);setExportFormat('svg');setDialog('export');}} onBackgroundViewChange={setBackgroundView} measurements={measurements} lengthDetails={lengthDetails} onMeasurement={storeMeasurement} doc={doc} selected={selected} onSelect={setSelected} selectedCircles={selectedCircles} onSelectCircles={setSelectedCircles} onChange={commit} tool={tool} preset={preset} drawingAngle={drawingFoldAngle} drawingSwap={drawingSwap} onDrawingSwapChange={setDrawingSwap} grid={grid} gridScope={gridScope} diagonalGrid={diagonalGrid} gridPattern={gridAppearance.pattern??'square'} gridRotation={gridAppearance.squareRotation??0} divisions={divisions} snap={snap} lockBoundary={lockBoundary} onPoint={setCoords} onMessage={inform} fitToken={fitToken}/><FoldAnglePanel value={selectedFoldAngles.value} selectionKey={selected} selectedCount={selectedFoldAngles.editableCount} ignoredCount={selectedFoldAngles.ignoredCount} onApply={modifyTargetAngle}/><ToolCommandBar floating help={instructions} ref={commandBar} commands={commands} tool={tool} onTool={runToolCommand} disabled={!!dialog||libraryOpen||!!dockSettings||storageSettingsOpen}/></div>

        </div>}
        {mode==='tess'&&(curveDesign?<CurveDesignPane design={curveDesign} view={tessFlatView} fitToken={tessFlatFit} onEdit={()=>setCurveEditRequest(n=>n+1)}/>:tessResult?<div className="tess-preview-workspace"><div className="tess-cp-pane"><CreaseCanvas overlay={tessHasSpatialView?<TessRigidPane result={tessResult} current={tessSignature===tessParamKey} view={tessFlatView} fitToken={tessFlatFit} open={tessRigidOpen} sceneOverride={tessSpatialFamily?tessSpatialScene:undefined} spatialLabel={tessSpatialFamily?'三维 · 静态等距':undefined}/>:(!tessTilingOnly&&tessFlatOpen&&<TessFlatPane view={tessFlatView} fitToken={tessFlatFit} paused={tessFlatPaused} retry={tessFlatRetry} flagstone={tessParams.family==='flagstone'} visibleTopFace={tessParams.family==='primal-dual'?tessParams.visibleTopFace:undefined} faceupFace={tessParams.family==='primal-dual'?tessParams.faceupFace:undefined} tileDecoration={tessFfDecoration??undefined} key={tessParams.family} input={tessFlat.input} parameterKey={tessParamKey} message={tessError||tessFlat.message}/>)} tileDecoration={(tessView==='mother'||tessTilingOnly)?tessTileDecoration??undefined:tessView==='fold'?tessCpDecoration??undefined:undefined} pickingSettings={canvasPicking} zoomSettings={canvasZoom} display={creaseDisplay} displayLayers={displayLayers} onDisplayLayersChange={setDisplayLayers} measurements={measurements} lengthDetails={lengthDetails} onMeasurement={storeMeasurement} key="tess" doc={tessView==='dual'&&tessResult.dualDoc?tessResult.dualDoc:tessView==='mother'&&tessResult.motherDoc?tessResult.motherDoc:tessPreview??tessResult.doc} selected={new Set()} onSelect={()=>{}} onChange={()=>{}} tool="pan" preset="M" grid={false} divisions={8} snap={false} lockBoundary readOnly onPoint={setCoords} onMessage={inform} fitToken={fitToken}/><div className="tess-preview-status" data-pending={tessSignature!==tessParamKey||tileLayerActive&&tileLayerCheck?.status==='checking'} data-layer-state={tileLayerActive?tileLayerCheck?.status??'checking':undefined} title={tessError||(tessSignature!==tessParamKey?'参数已变化，完整检查完成前不可采用。':tileLayerActive?tileLayerCheck?.message??'正在检查整片层序，完成前不可采用。':'调整参数，画面实时更新。')}>{tessError?'参数需调整':tessSignature!==tessParamKey?'预览更新中':tileLayerActive?tileLayerLabel:'实时预览'}</div></div></div>:<div className="empty-workspace"><div className="origami-emblem"><svg viewBox="0 0 180 180" aria-hidden="true"><path d="M90 10 159 50v80l-69 40-69-40V50Z"/><path d="m100 45 42 43-17 53-58 10-35-51 22-48ZM90 10l10 35m59 5-17 38m17 42-34 11m-46-21 11-30M21 50l33 2"/></svg></div><p className="eyebrow">TESSELLATION STUDIO</p><h2>从一个单元，展开一张纸。</h2><p>选择扭转、平铺、非周期、铺石或编织等构造。<br/>本地计算会生成真实山谷折痕，并报告局部约束。</p><button className="primary" disabled={tessBusy||!online} onClick={()=>void generateTess()}>{tessBusy?'正在构造…':'生成第一个镶嵌'}</button><small>独立几何构造 + MIT Pleat · 无需 Mathematica</small></div>)}
        {simMounted&&<div className="simulation-view" style={{display:mode==='sim'?undefined:'none'}}><iframe ref={iframe} src={appAsset('simulator/index.html')} title="三维折叠模拟画布"/><div className="sim-badge">{simStatus?.status==='error'?'模拟不可用':simStatus?.backend==='cpu'?'CPU 数值求解':simStatus?.backend==='webgl2'?'WebGL2 数值求解':'正在连接模拟核心…'}</div>{simStale&&<div className="sim-stale">折痕已修改。请点击“载入当前折痕”，旧模拟不会自动覆盖新工程。</div>}<SimulationControls ref={simControls} status={simStatus} progress={simProgress} stale={simStale} onProgress={progress} onReset={()=>{simBridge.current?.send({type:"zhezhi-sim-reset"});setSimProgress(0);}} send={command=>simBridge.current?.send(command)} onCaptureImage={()=>void captureSimulationImage()} capturingImage={capturingSimulationImage}/></div>}

        {mode==='edit'&&issuesOpen&&<section className="diagnostics"><div className="diagnostic-head"><strong>检查结果</strong><span className="muted small">{issuesSignature!==signature?'结果已过期，请重新检查':`${issues?.summary.errors||0} 个错误 · ${issues?.summary.warnings||0} 个警告`}</span><span className="spacer"/><button onClick={()=>{setFocusedIssueId(null);setSelected(new Set());}} disabled={issuesSignature!==signature} aria-pressed={focusedIssueId===null}>全部错误</button><button onClick={check}>完整检查</button><button onClick={checkLocalFlat}>局部 cAMV</button><button onClick={repair}>修复重复重叠线</button><button onClick={repairT}>修复 T 接点</button><button onClick={()=>setIssuesOpen(false)} aria-label="收起检查结果">×</button></div>{issues?.issues.length?issues.issues.map(i=><button className={'issue '+i.severity} key={i.id} aria-pressed={focusedIssueId===i.id} disabled={issuesSignature!==signature} onClick={()=>{setFocusedIssueId(i.id);setSelected(new Set(i.segmentIds));if(i.segmentIds.length)setTool('select');}}><span>{i.severity==='error'?'错误':i.severity==='warning'?'警告':'提示'}</span>{i.message}</button>):<p className="check-pass">未发现当前检查范围内的错误。局部条件通过不保证整体可折。</p>}</section>}

        {mode!=='edit'&&<details className="workspace-context-help"><summary><ChromeIcon name="help"/>操作说明</summary><p>{mode==='tess'?(tessTilingOnly?'母结构的内部边为辅助线；采用副本后可继续编辑。':tessParams.family==='rigid-quad'?'三维构形已验证当前状态的面等距与共享边；未验证连续折叠路径和自碰撞，也不是平折层序。':curveDesign?'曲面参数随完整工程保存。图中显示二维展开与三维采样曲面。':'生成结果建立独立副本，不覆盖手工编辑。局部必要条件通过，不代表整体平折或连续路径成立。'):'数值模型可出现应变、自穿透或失稳；不作为无碰撞与实际可制造性的证明。'}</p></details>}
        </div>
      </main>
      {!(mode==='edit'&&canvasFocused)&&<PanelDivider side="right" value={widths.right} min={236} max={Math.min(440,Math.max(800,viewport-workspaceRailWidth)-(mode==='edit'?widths.left:0)-368)} onChange={right=>setPanels(p=>({...p,right}))} onReset={()=>setPanels(p=>({...p,right:DEFAULT_PANELS.right}))}/>}
      <aside style={{width:widths.right,display:mode==='edit'&&canvasFocused?'none':undefined}} className={"inspector"+(mode==='edit'?' canvas-inspector':'')} aria-label={mode==='edit'?'画布设置':'属性与设置'}>{tablet&&<TabletPanelHeading title={mode==='sim'?'模拟设置':'画布与属性'} onClose={()=>setTabletPanel('')}/>}<div className="inspector-heading"><strong>{mode==='edit'?'画布':mode==='tess'?'构造参数':'模拟状态'}</strong>{mode!=='edit'&&<span className="chip">{mode==='tess'?'实时预览':'独立计算'}</span>}</div>
        {mode==='edit'&&<div inert={toolLayout.editing}><CanvasSettingsPanel grid={grid} onGridChange={setGrid} gridScope={gridScope} onGridScopeChange={setGridScope} divisions={divisions} onDivisionsChange={value=>setDivisions(clampGridDivisions(value))} diagonalGrid={diagonalGrid} onDiagonalGridChange={setDiagonalGrid} gridPattern={gridAppearance.pattern??'square'} onGridPatternChange={pattern=>setGridAppearance(value=>({...value,pattern}))} gridRotation={gridAppearance.squareRotation??0} onGridRotationChange={squareRotation=>setGridAppearance(value=>({...value,squareRotation}))} snap={snap} onSnapChange={setSnap} defaultDivisions={gridAppearance.defaultDivisions} display={creaseDisplay} onDisplayChange={changeCanvasDisplay}/><details className="tool-options" open><summary>工具选项</summary>
          <div className="tool-selection-options" inert={toolLayout.editing}>
  <label className="checkbox"><input type="checkbox" checked={lockBoundary} onChange={e=>setLockBoundary(e.target.checked)}/>保护边界</label>
  <label className="checkbox"><input type="checkbox" checked={keepSelection} onChange={e=>{try{saveSelectionPersistence(e.target.checked);setKeepSelection(e.target.checked);}catch(error){setError(errorText(error));}}}/>操作后保持选择</label>
</div>
          <ConstructionRail layout={toolLayout} actions={toolLayoutActions} tool={tool} drawingSwap={drawingSwap} onTool={activateDrawingTool} bindings={toolShortcuts} onShortcut={target=>{setShortcutTarget(target);setDialog('shortcuts');}}/>
          <div className="dock-nonlayout-controls" inert={toolLayout.editing}>
          <div className="dock-settings-actions"><button onClick={()=>chosen.length||!chosenCircles.length?setDockSettings('properties'):openCircleProperties()}>{chosen.length?`选区 (${chosen.length})`:chosenCircles.length?`圆属性 (${chosenCircles.length})`:'纸张属性'}</button>{chosen.length>0&&chosenCircles.length>0&&<button onClick={openCircleProperties}>圆属性 ({chosenCircles.length})</button>}<button onClick={()=>setDockSettings('clipboard')}>剪贴板</button><button onClick={()=>setDockSettings('background')}>底图</button></div>
          {acrossCPRecipe&&<button onClick={()=>setAcrossCPEdit(true)}>修改二维纸带源参数</button>}
          {conicCircleCPRecipe&&<button onClick={()=>setConicCircleCPEdit(true)}>修改原圆例纸面参数</button>}
          {conicNoncircleRecipe&&<button onClick={()=>setConicNoncircleEdit(true)}>修改原非圆纸面参数</button>}
          {planarRuled4040Recipe&&<button onClick={()=>setPlanarRuled4040Edit(true)}>修改原直纹纸面参数</button>}
          {coneFourPlane4039Recipe&&<button onClick={()=>setConeFourPlane4039Edit(true)}>修改原圆锥四带参数</button>}
          {nonuniformSpiral3968Recipe&&<button onClick={()=>setNonuniformSpiral3968Edit(true)}>修改原非均匀螺旋纸面参数</button>}
          {uniformHelix3951Recipe&&<button onClick={()=>setUniformHelix3951Edit(true)}>修改原均匀螺旋纸面参数</button>}
          {spiralRefold3980Recipe&&<button onClick={()=>setSpiralRefold3980Edit(true)}>修改原展开再折回纸面参数</button>}
          {uniformHelixGeneral3951Recipe&&<button onClick={()=>setUniformHelixGeneral3951Edit(true)}>修改原通用均匀螺旋纸面参数</button>}
          {nonuniformHelixGeneral3966Recipe&&<button onClick={()=>setNonuniformHelixGeneral3966Edit(true)}>修改原任意折角函数纸面参数</button>}
          {linkedBands4086Recipe&&<button onClick={()=>setLinkedBands4086Dialog({edit:true})}>修改关联多带纸面参数</button>}
          {huffmanFiniteRecipe&&<button onClick={()=>setHuffmanFiniteEdit(true)}>修改 Huffman 曲折纸面参数</button>}
          {altMoselyFiniteRecipe&&<button onClick={()=>setAltMoselyFiniteEdit(true)}>修改交替 Mosely 纸面参数</button>}
          {ellipseOpticalRecipe&&<button onClick={()=>setEllipseAcrossFiniteEdit('ellipse')}>修改原光学椭圆纸面参数</button>}
          {acrossDescendingRecipe&&<button onClick={()=>setEllipseAcrossFiniteEdit('across')}>修改原下降折角纸面参数</button>}
          {originalArraySource&&<button onClick={()=>setOriginalArrayDialog({kind:originalArraySource.kind,edit:true})}>修改原阵列构造参数</button>}
          {linearSpaceRecipe&&<button onClick={()=>setLinearSpaceDialog({edit:true})}>修改折链纸带构造参数</button>}
          {generalSpacerRecipe&&<button onClick={()=>setGeneralSpacerDialog({edit:true})}>修改一般／嫁接 Miura 参数</button>}
          {flutedMultiSliceConeRecipe&&<button onClick={()=>setFlutedMultiSliceConeDialog({edit:true})}>修改褶锥与切片参数</button>}
          {genericSpacePaperRecipe&&<button onClick={()=>setGenericSpacePaperDialog({edit:true})}>修改空间曲折纸面参数</button>}
          {strainTQRecipe&&<button onClick={()=>setStrainTQDialog({edit:true})}>修改 TQ 约束设计参数</button>}
          {rotationalPleatsRecipe&&<button onClick={()=>setRotationalPleatsDialog({edit:true})}>修改旋转褶构造参数</button>}
          {basicPaperModelRecipe&&<button onClick={()=>setBasicPaperModelDialog({edit:true})}>修改单纸基础模型参数</button>}
          {savedDevelopablePaperRecipe&&<button onClick={()=>setSavedDevelopablePaperDialog({edit:true})}>修改原展开纸形参数</button>}
          {bistableTwistTubeRecipe&&<button onClick={()=>setBistableTwistTubeDialog({edit:true})}>修改双稳态折管参数</button>}
          {flatTroublewitStripRecipe&&<button onClick={()=>setFlatTroublewitStripDialog({edit:true})}>修改平折纸带参数</button>}
          {semiGeneralMiuraRecipe&&<button onClick={()=>setSemiGeneralMiuraDialog({edit:true})}>修改路径波纹构造参数</button>}
          <div className="dock-mark-history"><button disabled={!history.marks.past.length} onClick={()=>dispatch({type:'markundo'})} title="撤销独立标记；折痕、圆与文字不变" aria-label="标记撤销">撤标记</button><button disabled={!history.marks.future.length} onClick={()=>dispatch({type:'markredo'})} title="重做独立标记" aria-label="标记重做">重标记</button></div>
          </div>
        </details></div>}

        {mode==='tess'&&<TessellationPanel onOpenStrainTQDesign={()=>setStrainTQDialog({edit:false})} onOpenRotationalPleats={()=>setRotationalPleatsDialog({edit:false})} onOpenBasicPaperModels={()=>setBasicPaperModelDialog({edit:false})} onOpenSavedDevelopablePaper={()=>setSavedDevelopablePaperDialog({edit:false})} onOpenFlutedMultiSliceCone={()=>setFlutedMultiSliceConeDialog({edit:false})} onOpenGenericSpacePaper={()=>setGenericSpacePaperDialog({edit:false})} onOpenBistableTwistTube={()=>setBistableTwistTubeDialog({edit:false})} onOpenFlatTroublewitStrip={()=>setFlatTroublewitStripDialog({edit:false})} onOpenLinearSpace={()=>setLinearSpaceDialog({edit:false})} onOpenGeneralSpacer={()=>setGeneralSpacerDialog({edit:false})} onOpenSemiGeneralMiura={()=>setSemiGeneralMiuraDialog({edit:false})} onOpenLinkedBands={()=>setLinkedBands4086Dialog({edit:false})} onOpenArray={kind=>setOriginalArrayDialog({kind,edit:false})} params={tessCommittedParams} onChange={setTessParams} onPreview={previewTessParams} onCancelPreview={cancelTessPreview} curveDesign={curveDesign} onPreviewCurveDesign={previewCurveDesign} onCancelCurvePreview={cancelCurvePreview} onApplyCurveDesign={applyCurveDesign} onAdoptAltMoselyFiniteCP={adoptAltMoselyFiniteCP} onAdoptEllipseOpticalCP={next=>adoptEllipseAcrossFiniteCP(next,'ellipse')} onAdoptAcrossDescendingCP={next=>adoptEllipseAcrossFiniteCP(next,'across')} onAdoptHuffmanFiniteCP={adoptHuffmanFiniteCP} onAdoptAcrossCP={adoptAcrossCP} onAdoptConicCircleCP={adoptConicCircleCP} onAdoptConicNoncircleCP={adoptConicNoncircleCP} onAdoptPlanarRuled4040CP={adoptPlanarRuled4040CP} onAdoptConeFourPlane4039CP={adoptConeFourPlane4039CP} onAdoptNonuniformSpiral3968CP={adoptNonuniformSpiral3968CP} onAdoptUniformHelix3951CP={adoptUniformHelix3951CP} onAdoptSpiralRefold3980CP={adoptSpiralRefold3980CP} onAdoptUniformHelixGeneral3951CP={adoptUniformHelixGeneral3951CP} onAdoptNonuniformHelixGeneral3966CP={adoptNonuniformHelixGeneral3966CP} curveEditRequest={curveEditRequest} result={tessResult} busy={tessBusy} stale={!!tessResult&&tessSignature!==tessParamKey} generationError={tessError} tileLayerCheck={tileLayerActive?tileLayerCheck:null} onCancel={()=>{tessAttempt.current=tessParamKey;tessAbort.current?.abort();}} savedParameters={(doc.metadata?.tessellation as {parameters?:unknown}|undefined)?.parameters} onUseDrawing={()=>{try{const g=buildFold(doc).graph;if(!g.faces_vertices||g.faces_vertices.length<2||g.faces_vertices.length>96||g.vertices_coords.length>96)throw new Error('请先绘制包含 2–96 个凸多边形面的母结构。');const minX=Math.min(...g.vertices_coords.map(p=>p[0])),minY=Math.min(...g.vertices_coords.map(p=>p[1]));const span=Math.max(Math.max(...g.vertices_coords.map(p=>p[0]))-minX,Math.max(...g.vertices_coords.map(p=>p[1]))-minY);setTessParams({...tessPreset('custom'),paper:tessParams.paper,family:'custom',vertices:g.vertices_coords.map(p=>[(p[0]-minX)/span,(p[1]-minY)/span]),faces:g.faces_vertices,repeatX:1,repeatY:1,angle:36,scale:.3});inform('已提取母结构，原工程保持不变。将自动检查凸性与邻接。');}catch(e){setError(errorText(e));}}}/>}
        {mode==='sim'&&<><section>
          <h2>数值状态</h2>
          <StatusRow name="计算后端" value={simStatus?.backend==='cpu'?'CPU 回退':simStatus?.backend==='webgl2'?'WebGL2':'连接中'}/>
          <StatusRow name="输入版本" value={simStatus?.status==='error'?'不可用':simStale?'已过期':simSignature?(simReady?'已载入':'正在载入'):'尚未载入'} good={!!simSignature&&simReady&&!simStale}/>
          <StatusRow name="求解状态" value={simStale?'来源 CP 已变化':simStatus?.solveState==='low-velocity'?'速度暂稳':simStatus?.solveState==='solving'?'正在求解':simStatus?.solveState==='paused'?'已暂停':'尚不可用'}/>
          {simStatus?.angleDiagnostics?.status==='available'?<>
            <div className="readout"><span>平均折角偏差</span><strong>{simStatus.angleDiagnostics.meanAbsoluteErrorDegrees.toFixed(2)}°</strong></div>
            <div className="readout" title={`最差有向偏差（实际角 − 目标角）：${simStatus.angleDiagnostics.worstSignedErrorDegrees>=0?'+':''}${simStatus.angleDiagnostics.worstSignedErrorDegrees.toFixed(2)}°`}><span>最大折角偏差</span><strong>{simStatus.angleDiagnostics.maxAbsoluteErrorDegrees.toFixed(2)}°</strong></div>
            <p className="note">对比 {simStatus.angleDiagnostics.creaseCount} 条驱动折痕。{simStatus.angleDiagnostics.unassignedCreaseCount>0&&`另有 ${simStatus.angleDiagnostics.unassignedCreaseCount} 条未赋型折痕无目标，不计入偏差。`}速度暂稳不等于目标已达到；角度符合也不代表无穿透。</p>
          </>:simStatus?.angleDiagnostics&&<p className="note">{simStatus.angleDiagnostics.reason}</p>}
          <p className={'note '+(simStatus?.status==='error'?'warning':'')}>{simStatus?.message||'正在初始化本地模拟器。'}</p>
          {simStatus?.strain!==undefined&&<div className="readout"><span>最大节点平均轴向应变</span><strong className="mono">{Number.isFinite(simStatus.strain)?`${(simStatus.strain*100).toFixed(2)}%`:'不可用'}</strong></div>}
          {simStatus?.meanNodalStrain!==undefined&&<div className="readout"><span>全体节点平均轴向应变</span><span className="mono">{Number.isFinite(simStatus.meanNodalStrain)?`${(simStatus.meanNodalStrain*100).toFixed(2)}%`:'不可用'}</span></div>}
          {simStatus?.solverSettings&&<StatusRow name="积分方法" value={simStatus.solverSettings.integrationType==='verlet'?'Verlet（二阶）':'Euler（一阶）'}/>}
          {simStatus?.frameSteps!==undefined&&<div className="readout"><span>最近一帧数值步</span><span className="mono">{simStatus.frameSteps}</span></div>}
          {simStatus?.maxVelocity!==undefined&&<div className="readout"><span>最大速度分量</span><span className="mono">{Number.isFinite(simStatus.maxVelocity)?simStatus.maxVelocity.toExponential(2):'不可用'}</span></div>}
          {simStatus?.steps!==undefined&&<div className="readout"><span>求解步数</span><span className="mono">{simStatus.steps}</span></div>}
          {simStatus?.warnings?.map((w,i)=><p className="note warning" key={i}>{w}</p>)}
        </section><section><details className="sim-help"><summary>操作与求解边界</summary>
          <p className="note">正比例按原山谷方向折叠，负比例反转方向。缓慢调节比例；失稳时复位。未知目标角请先回编辑页设置。</p>
          <p className="note">“模拟设置”可分别调整折痕刚度和面片抗弯。Verlet 模式暂不支持顶点塑形。目标播放同时驱动全部折痕，折序绘图中的步骤动画按动作规划路径。</p>
          <p className="note">数值稳定不代表实际可折；未模拟可靠碰撞、纸厚或摩擦。计算只在本机进行。</p>
        </details></section></>}
      </aside>
    </div>
    <aside id="fold-model-tools" className="fold-model-tools" aria-label="模型操作" data-fold-result="true" hidden={mode!=='edit'||creaseLibraryOpen||!modelToolsOpen} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setModelToolsOpen(false);}}}>
      <header><strong>模型操作</strong><button aria-label="关闭模型操作" onClick={()=>setModelToolsOpen(false)}>×</button></header>
<section aria-label="识别 CP 结构与纸面" hidden={!recognition}><h2>识别 CP 结构与纸面</h2><button className="outline full" disabled={flatBusy} onClick={recognizeCurrent}>识别当前折痕</button>{recognition&&<><div className="readout"><span>顶点 / 边 / 面</span><strong className="mono">{recognition.graph.vertices_coords.length} / {recognition.graph.edges_vertices.length} / {recognition.graph.faces_vertices?.length??0}</strong></div>{recognition.warnings.map((warning,i)=><p className="note warning" key={i}>{warning}</p>)}</>}</section>
<section aria-label="模型列表"><h2>模型列表 · {models.entries.length}</h2><p className="note">所有结果直接显示在画布；中键短按标记操作目标。每张 CP 最多保留 4 个结果。</p><div className="button-pair"><button disabled={flatBusy||!models.activeId} onClick={copyModel}>复制结果副本</button><button disabled={!models.activeId} onClick={deleteModel}>删除当前模型</button></div><div className="button-pair"><button disabled={exportBusy||flatBusy||!models.activeId} onClick={()=>void exportCollection()}>导出模型集合</button><button onClick={()=>inputCollectionFile.current?.click()}>打开模型集合</button></div></section>
<section aria-label="模型源折痕"><h2>源折痕</h2><div className="button-pair"><button disabled={flatBusy||!models.activeId} onClick={rebuildModelSource}>从源折痕重建</button><button disabled={flatBusy||!models.activeId} onClick={restoreModelSource}>恢复源折痕</button></div></section>
        <LayerBatchPanel view={activeFoldedModel(models)?.view} result={flat} name={flatSource?.doc.name||doc.name} disabled={flatBusy||flatStale} visible={mode==='edit'&&!creaseLibraryOpen&&modelToolsOpen} timeoutMs={flatBudget*1000} xray={flatXray}/>
<><LayerSolutionsPanel result={flat} busy={flatBusy} stale={flatStale} onChoose={reanalyzeModel}/><section><h2>模型文件</h2><div className="button-pair"><button disabled={exportBusy||flatBusy||flat?.geometry.status!=='ready'||!flatSource} onClick={()=>void exportCurrentModel()}>导出模型快照</button><button onClick={()=>inputModelFile.current?.click()}>打开模型快照</button></div></section><section data-model-history="true"><h2>模型历史</h2><div className="button-pair"><button disabled={flatStale||!modelHistory.past.length} onClick={()=>modelHistoryStep('undo')}>撤销模型</button><button disabled={flatStale||!modelHistory.future.length} onClick={()=>modelHistoryStep('redo')}>重做模型</button></div><button className="outline full" disabled={flatBusy||flatStale||flat?.geometry.status!=='ready'} onClick={()=>reanalyzeModel()}>重新分析当前模型</button></section>{flat?.geometry.status==='ready'&&flatSource&&<FoldedVertexPanel result={flat} source={flatSource.graph} disabled={flatBusy||flatStale} onMove={editModelVertices} selection={modelSelection} onSelect={setModelSelection}/ >}<section><h2>计算设置</h2><label className="checkbox"><input type="checkbox" checked={!Number.isFinite(flatBudget)} onChange={e=>setFlatBudget(e.target.checked?Infinity:60)}/>批量导出不限时</label>{Number.isFinite(flatBudget)&&<NumberField label="批量导出单解时限" value={flatBudget} min={1} max={600} suffix="秒" onChange={setFlatBudget}/>}<label className="checkbox"><input type="checkbox" checked={flatXray} onChange={e=>changeFlatDisplay({xray:e.target.checked})}/>X 光：显示面边界</label></section><section><h2>结果可信度</h2><StatusRow name="输入版本" value={flatStale?'已过期':flat?'与当前一致':'尚未运行'} good={!!flat&&!flatStale}/><StatusRow name="平面几何" value={flat?.geometry.status==='ready'?'已计算':flat?.geometry.message||'尚未运行'}/><StatusRow name="层叠关系" value={flat?.layers.message||'尚未运行'} good={flat?.layers.status==='solved'&&!flatStale}/>{flat?.warnings.map((w,i)=><p key={i} className="note warning">{w}</p>)}</section>{flatFace!==null&&<section><h2>已选折叠面 F{flatFace+1}</h2></section>}</>
    </aside>
    {mode==='edit'&&!creaseLibraryOpen&&<nav className="fold-dock" aria-label="底部折叠控制"><button onClick={()=>{openFlat();runFlat();}} disabled={flatBusy}>计算平折</button><button disabled={flatBusy||!selected.size} onClick={runSelectedFlat} title="框选一张完整 CP 后计算；保护边界时自动补原有纸边">折叠选区</button><button disabled={!flatBusy} onClick={()=>flatJob.current?.cancel()}>停止</button><label>标记结果<select aria-label="活动折叠模型" value={models.activeId??''} disabled={!models.entries.length} onChange={e=>{selectModel(e.target.value);openFlat();}}>{!models.activeId&&<option value="">尚无模型</option>}{models.entries.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><button onClick={()=>{openFlat();recognizeCurrent();}}>识图</button><button onClick={()=>{setShowFlat(v=>!v);selectFlatNavigation(showFlat?'crease':'fold');}}>{showFlat?'收起平折':'显示平折'}</button><FoldDisplayBar layout="single" xray={flatDisplayView.xray} onXray={xray=>changeFlatDisplay({xray})} back={flatDisplayView.side==='back'} onBack={back=>changeFlatDisplay({side:back?'back':'front'})} colors={flatDisplayView.colors??defaultModelColors()} onColors={colors=>changeFlatDisplay({colors})} onRotate={delta=>changeFlatDisplay({rotation:(flatDisplayView.rotation+delta+360)%360})} onFit={fitMarkedModel}><button disabled={!flat||!showFlat} aria-expanded={flatOptionsOpen} onClick={()=>setFlatOptionsOpen(v=>!v)}>更多</button></FoldDisplayBar><button aria-expanded={modelToolsOpen} aria-controls="fold-model-tools" onClick={()=>setModelToolsOpen(value=>!value)}>模型操作</button><button disabled={flatBusy||!models.activeId} onClick={deleteModel}>删除平折结果</button><span className="spacer"/><small>{flatBusy?'正在完整计算，可随时停止':cpTarget?`标记 CP · ${countFoldedModelsForCp(models,cpTarget.key)}/${MAX_FOLDED_MODELS_PER_CP} 个结果`:'中键短按标记 CP / 结果 · 按住拖动平移'}</small></nav>}
    {mode==='tess'&&<nav className="fold-dock" aria-label={tessHasSpatialView?'底部静态三维显示控制':'底部镶嵌折叠控制'}><FoldDisplayBar kind={curveDesign?'curve':tessParams.family==='rigid-quad'?'rigid':tessSpatialFamily?'spatial':'flat'} xray={tessFlatView.xray} onXray={xray=>setTessFlatView(v=>({...v,xray}))} back={tessFlatView.side==='back'} onBack={back=>setTessFlatView(v=>({...v,side:back?'back':'front'}))} colors={tessFlatView.colors??defaultModelColors()} onColors={colors=>setTessFlatView(v=>({...v,colors}))} onRotate={delta=>setTessFlatView(v=>({...v,rotation:(v.rotation+delta+360)%360}))} onFit={()=>setTessFlatFit(n=>n+1)}>{!curveDesign&&!tessHasSpatialView&&<details><summary>更多</summary><div className="fold-extra-controls"><button disabled={!tessFlatOpen} onClick={()=>setTessFlatPaused(v=>!v)}>{tessFlatPaused?'继续':'暂停'}</button><label>自动整片检查<select aria-label="镶嵌自动整片检查时限" value={tessFlatBudget} onChange={e=>setTessFlatBudget(Number(e.target.value))}>{[5,10,30].map(n=><option key={n} value={n}>{n}s</option>)}</select></label><button aria-label="重新计算镶嵌平折" disabled={!tessFlatOpen} onClick={()=>{setTessFlatPaused(false);setTessFlatRetry(n=>n+1);}}>重算</button></div></details>}</FoldDisplayBar>{curveDesign?<button onClick={()=>setCurveEditRequest(n=>n+1)}>修改曲面参数</button>:tessHasSpatialView?<button disabled={!tessRigidOpen} onClick={()=>setTessRigidOpen(false)}>收起三维构形</button>:<button disabled={!tessFlatOpen} onClick={()=>{setTessFlatOpen(false);setTessFlatPaused(false);}}>删除平折结果</button>}<span className="spacer"/><small>{curveDesign?'曲面数值展开 · 采样网格':tessHasSpatialView?'当前静态等距 · 非平折层序':'基本显示参数 · 调参后自动更新'}</small></nav>}

    {artworkOverviewOpen&&<ArtworkOverview rows={artworkRows} recovery={artworkRecovery} onClose={()=>setArtworkOverviewOpen(false)} onSave={()=>void saveArtwork()} onRestore={restoreArtworkRecovery} onRemove={removeArtworkRecovery}/>}
    {designVisited&&<div id="design-workspace" style={{display:mode==='design'?'flex':'none',flex:1,minHeight:0,minWidth:0}}><Suspense fallback={<div role="status" style={{padding:24}}>正在打开基础形设计…</div>}><DesignWorkspace ref={designRef} active={mode==='design'} onMessage={inform} onArtworkChange={()=>setDesignArtworkRevision(value=>value+1)} onAdopt={adoptBaseDesign}/></Suspense></div>}
    {diagramVisited&&<div id="diagram-workspace" style={{display:mode==='diagram'?'flex':'none',flex:1,minHeight:0,minWidth:0}}><Suspense fallback={<div role="status" style={{padding:24}}>正在打开折序绘图…</div>}><DiagramWorkspace ref={diagramRef} showToolGuide={creaseDisplay.showToolGuide!==false} onToolGuideChange={changeToolGuide} showCursorHint={creaseDisplay.showCursorHint!==false} onCursorHintChange={changeCursorHint} onArtworkChange={()=>setDiagramArtworkRevision(value=>value+1)} active={mode==='diagram'} doc={doc} model={!flatBusy&&flat?.geometry.status==='ready'&&flatSource?{doc:flatSource.doc,result:flat}:null} onMessage={inform} onRevealCP={revealDiagramCP} incomingImage={incomingDiagramImage??undefined} onImageReceived={id=>setIncomingDiagramImage(pending=>pending?.id===id?null:pending)}/></Suspense></div>}
    <footer className="statusbar"><span>{mode==='edit'?(creaseLibraryOpen?'折痕文档':TOOL_NAMES[tool]):MODE_NAMES[mode]}</span>{mode==='edit'&&!creaseLibraryOpen&&<><span>新线：{NAMES[preset]} {preset}</span><span className="mono">X {fmt(coords[0])} · Y {fmt(coords[1])} mm</span><span>{snap?'吸附开启':'吸附关闭'}</span></>}<span className="spacer"/><span>{flatBusy?'平折计算中':tessBusy?'镶嵌生成中':'本机工作台'}</span><span>v{VERSION}</span></footer>
    </div></div>
    {notice&&<div className="toast" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="关闭操作提示">×</button></div>}
    {dockSettings&&<ToolSettingsDialog title={{properties:chosen.length?'选区属性':chosenCircles.length?'圆属性':'纸张属性',clipboard:'选区剪贴板',background:'参考底图',canvashelp:'画布辅助说明'}[dockSettings]} onClose={()=>setDockSettings(null)}>{dockSettingsContent[dockSettings]}</ToolSettingsDialog>}
    {materialClipboardCut&&<MaterialClipboardCutDialog doc={doc} selected={materialClipboardCut} lockBoundary={lockBoundary} onClose={()=>setMaterialClipboardCut(null)} onApply={applyMaterialClipboardCut}/>}
    {linkedBands4086Dialog&&<LinkedBandsPlanarCP4086Dialog initial={linkedBands4086Dialog.edit?linkedBands4086Recipe??undefined:undefined} onAdoptCP={adoptLinkedBands4086CP} onClose={()=>setLinkedBands4086Dialog(null)}/>}
    {linearSpaceDialog&&<LinearSpacePolyhedralCPDialog initial={linearSpaceDialog.edit?linearSpaceRecipe??undefined:undefined} onAdoptCP={adoptLinearSpaceCP} onClose={()=>setLinearSpaceDialog(null)}/>}
    {generalSpacerDialog&&<GeneralSpacerMiuraCPDialog initial={generalSpacerDialog.edit?generalSpacerRecipe??undefined:undefined} onAdoptCP={adoptGeneralSpacerCP} onClose={()=>setGeneralSpacerDialog(null)}/>}
    {flutedMultiSliceConeDialog&&<FlutedMultiSliceConeCPDialog initial={flutedMultiSliceConeDialog.edit?flutedMultiSliceConeRecipe??undefined:undefined} onAdoptCP={adoptFlutedMultiSliceConeCP} onClose={()=>setFlutedMultiSliceConeDialog(null)}/>}
    {genericSpacePaperDialog&&<GenericSpacePaperBridgeDialog initial={genericSpacePaperDialog.edit?genericSpacePaperRecipe??undefined:undefined} onAdoptCP={adoptGenericSpacePaperCP} onClose={()=>setGenericSpacePaperDialog(null)}/>}
    {bistableTwistTubeDialog&&<BistableTwistTubeCPDialog initial={bistableTwistTubeDialog.edit?bistableTwistTubeRecipe??undefined:undefined} onAdoptCP={adoptBistableTwistTubeCP} onClose={()=>setBistableTwistTubeDialog(null)}/>}
    {flatTroublewitStripDialog&&<FlatTroublewitStripCPDialog initial={flatTroublewitStripDialog.edit?flatTroublewitStripRecipe??undefined:undefined} onAdoptCP={adoptFlatTroublewitStripCP} onClose={()=>setFlatTroublewitStripDialog(null)}/>}
    {strainTQDialog&&<StrainTQDesignCPDialog initial={strainTQDialog.edit?strainTQRecipe??undefined:undefined} onAdoptCP={adoptStrainTQCP} onClose={()=>setStrainTQDialog(null)}/>}
    {rotationalPleatsDialog&&<RotationalPleatsCPDialog initial={rotationalPleatsDialog.edit?rotationalPleatsRecipe??undefined:undefined} onAdoptCP={adoptRotationalPleatsCP} onClose={()=>setRotationalPleatsDialog(null)}/>}
    {basicPaperModelDialog&&<BasicPaperModelsCPDialog initialRecipe={basicPaperModelDialog.edit?basicPaperModelRecipe??undefined:undefined} onAdoptCP={adoptBasicPaperModelCP} onClose={()=>setBasicPaperModelDialog(null)}/>}
    {savedDevelopablePaperDialog&&<SavedDevelopablePaperDialog initial={savedDevelopablePaperDialog.edit?savedDevelopablePaperRecipe??undefined:undefined} onAdoptCP={adoptSavedDevelopablePaper} onClose={()=>setSavedDevelopablePaperDialog(null)}/>}
    {semiGeneralMiuraDialog&&<SemiGeneralMiuraCPDialog initial={semiGeneralMiuraDialog.edit?semiGeneralMiuraRecipe??undefined:undefined} onAdoptCP={adoptSemiGeneralMiuraCP} onClose={()=>setSemiGeneralMiuraDialog(null)}/>}
    {originalArrayDialog?.kind==='wave-grid'&&<MiuraHuffmanCPDialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='wave-grid'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}
    {originalArrayDialog?.kind==='yoshimura-miura'&&<YoshimuraMiuraCP2534Dialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='yoshimura-miura'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}
    {originalArrayDialog?.kind==='yoshimura-six'&&<YoshimuraSixCP2507Dialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='yoshimura-six'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}
    {originalArrayDialog?.kind==='waterbomb'&&<WaterbombTessellation2604Dialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='waterbomb'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}
    {altMoselyFiniteEdit&&altMoselyFiniteRecipe&&<AltMoselyFiniteCP3556Dialog initial={altMoselyFiniteRecipe} onAdoptCP={adoptAltMoselyFiniteCP} onClose={()=>setAltMoselyFiniteEdit(false)}/>}
    {ellipseAcrossFiniteEdit==='ellipse'&&ellipseOpticalRecipe&&<EllipseAcrossFiniteCPDialog kind="ellipse" initial={ellipseOpticalRecipe} onAdoptCP={next=>adoptEllipseAcrossFiniteCP(next,'ellipse')} onClose={()=>setEllipseAcrossFiniteEdit(null)}/>}
    {ellipseAcrossFiniteEdit==='across'&&acrossDescendingRecipe&&<EllipseAcrossFiniteCPDialog kind="across" initial={acrossDescendingRecipe} onAdoptCP={next=>adoptEllipseAcrossFiniteCP(next,'across')} onClose={()=>setEllipseAcrossFiniteEdit(null)}/>}
    {huffmanFiniteEdit&&huffmanFiniteRecipe&&<HuffmanFiniteCPDialog initial={huffmanFiniteRecipe} onAdoptCP={adoptHuffmanFiniteCP} onClose={()=>setHuffmanFiniteEdit(false)}/>}
    {acrossCPEdit&&acrossCPRecipe&&<CurvedAcrossRightLinearAngleDialog initial={acrossCPRecipe} onAdoptCP={adoptAcrossCP} onClose={()=>setAcrossCPEdit(false)}/>}
    {conicCircleCPEdit&&conicCircleCPRecipe&&<ConicCircleCPDialog initial={conicCircleCPRecipe} onAdoptCP={adoptConicCircleCP} onClose={()=>setConicCircleCPEdit(false)}/>}
    {conicNoncircleEdit&&conicNoncircleRecipe&&<ConicNoncircleCPDialog initialRecipe={conicNoncircleRecipe} projectName={doc.name} onAdopt={adoptConicNoncircleCP} onClose={()=>setConicNoncircleEdit(false)}/>}
    {planarRuled4040Edit&&planarRuled4040Recipe&&<PlanarRuledCP4040Dialog initial={planarRuled4040Recipe} onAdoptCP={adoptPlanarRuled4040CP} onClose={()=>setPlanarRuled4040Edit(false)}/>}
    {coneFourPlane4039Edit&&coneFourPlane4039Recipe&&<ConeFourPlaneCP4039Dialog initial={coneFourPlane4039Recipe} onAdoptCP={adoptConeFourPlane4039CP} onClose={()=>setConeFourPlane4039Edit(false)}/>}
    {nonuniformSpiral3968Edit&&nonuniformSpiral3968Recipe&&<NonuniformSpiralCP3968Dialog initial={nonuniformSpiral3968Recipe} onAdoptCP={adoptNonuniformSpiral3968CP} onClose={()=>setNonuniformSpiral3968Edit(false)}/>}
    {uniformHelix3951Edit&&uniformHelix3951Recipe&&<UniformHelixCP3951Dialog initial={uniformHelix3951Recipe} onAdoptCP={adoptUniformHelix3951CP} onClose={()=>setUniformHelix3951Edit(false)}/>}
    {spiralRefold3980Edit&&spiralRefold3980Recipe&&<SpiralRefoldCP3980Dialog initial={spiralRefold3980Recipe} onAdoptCP={adoptSpiralRefold3980CP} onClose={()=>setSpiralRefold3980Edit(false)}/>}
    {uniformHelixGeneral3951Edit&&uniformHelixGeneral3951Recipe&&<UniformHelixGeneralCP3951Dialog initial={uniformHelixGeneral3951Recipe.recipe} initialMode={uniformHelixGeneral3951Recipe.mode} onAdoptCP={adoptUniformHelixGeneral3951CP} onClose={()=>setUniformHelixGeneral3951Edit(false)}/>}
    {nonuniformHelixGeneral3966Edit&&nonuniformHelixGeneral3966Recipe&&<NonuniformHelixGeneralCP3966Dialog initial={nonuniformHelixGeneral3966Recipe} onAdoptCP={adoptNonuniformHelixGeneral3966CP} onClose={()=>setNonuniformHelixGeneral3966Edit(false)}/>}
    {materialPaste&&<MaterialPasteDialog doc={doc} clipboard={materialPaste.clipboard} offset={materialPaste.offset} onClose={()=>setMaterialPaste(null)} onApply={(next,intent,ids)=>{if(!commit(next,ids,intent))return false;inform(intent.kind==='material-clipboard-paste'&&intent.cpOnly?'已粘贴材料CP，合并工程未保留FF；可编辑、导出或撤销。':'已粘贴完整材料，可撤销；层序需要重新计算。');return true;}}/>}
    {processingExportOpen&&<CPProcessingExportDialog doc={doc} onClose={()=>setProcessingExportOpen(false)} onExported={inform}/>}
    {libraryOpen&&<ToolLibrary onMergeAll={()=>{setMode('edit');mergeVertices();}} initialId={libraryId} onSettings={setDialog} onClose={()=>setLibraryOpen(false)} onTool={t=>{setMode('edit');activateDrawingTool(t);}}/>}
    <input ref={inputModelFile} type="file" className="hidden" aria-label="模型快照文件" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void openModelFile(file);e.target.value='';}}/>
    <input ref={inputCollectionFile} type="file" className="hidden" aria-label="模型集合文件" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void openCollectionFile(file);e.target.value='';}}/>
    <input ref={inputFile} type="file" className="hidden" aria-label="折痕工程文件" accept=".json,.fold,.cp,.opx,.ori,.orh" onChange={e=>{const file=e.target.files?.[0];if(file)void openFile(file);e.target.value='';}}/>
    <input ref={inputAppendFile} type="file" className="hidden" aria-label="追加导入折痕文件" accept=".json,.fold,.cp,.opx,.ori,.orh" onChange={e=>{const file=e.target.files?.[0];if(file)void appendFile(file);e.target.value='';}}/>
    {activityLogOpen&&<ActivityLogPanel onClose={()=>setActivityLogOpen(false)} onMessage={inform}/>}
    {storageSettingsOpen&&<StorageSettings onOpenActivityLog={()=>setActivityLogOpen(true)} commandSettings={<ToolCommandSettings initialScope={mode==='diagram'?'diagram':'crease'} onClose={()=>setStorageSettingsOpen(false)}/>} status={storageStatus} initial={storageInitial} unavailable={storageUnavailable} error={storageError} busy={storageBusy} onPick={pickStorageDirectory} onApply={applyStorageSettings} onClose={()=>{if(!storageStatus?.unavailable?.length&&(!storageInitial||storageUnavailable))setStorageSettingsOpen(false);}}/>}
    {dialog&&<AppDialog title={dialog==='files'?'本机工程库':dialog==='export'?'导出作品':dialog==='shortcuts'?'工具快捷键设置':dialog==='mergecrossall'?'全图跨线型合点':dialog==='display'?'折痕显示设置':'折纸工坊 · 使用指南'} onClose={()=>setDialog(null)} className="modal" size={dialog==='shortcuts'?'large':'medium'}>
      {error&&<div className="callout warning" role="alert">{error}</div>}
      {dialog==='display'&&<><CreaseDisplaySettings value={creaseDisplay} onSave={value=>{saveCreaseDisplay(value);setCreaseDisplay(value);}}/><GridAppearanceSettings value={gridAppearance} onSave={value=>{saveGridAppearance(value);setGridAppearance(value);}}/><CanvasZoomSettings value={canvasZoom} onSave={value=>{saveCanvasZoom(value);setCanvasZoom(value);}}/><CanvasPickingSettings value={canvasPicking} onSave={value=>{saveCanvasPicking(value);setCanvasPicking(value);}}/><ThemeSettings value={theme} onChange={setTheme}/></>}
      {dialog==='mergecrossall'&&<MergeCrossVertices doc={doc} lockBoundary={lockBoundary} onClose={()=>setDialog(null)} onApply={next=>{if(!commit(next))return false;setSelected(new Set());inform('已批量完成跨线型合点，可一次撤销；冲突点已按预览保留。');return true;}}/>}
      {dialog==='shortcuts'&&<ToolShortcutSettings mouse={{zoom:canvasZoom,picking:canvasPicking,onApplyZoom:value=>{saveCanvasZoom(value);setCanvasZoom(value);},onApplyPicking:value=>{saveCanvasPicking(value);setCanvasPicking(value);}}} initialAction={`tool:${shortcutTarget}`} display={creaseDisplay} onSaveDisplay={value=>{saveCreaseDisplay(value);setCreaseDisplay(value);}} gridAppearance={gridAppearance} onSaveGridAppearance={value=>{saveGridAppearance(value);setGridAppearance(value);}} theme={theme} onSaveTheme={setTheme} bindings={toolShortcuts} onSave={value=>{saveToolShortcuts(value);setToolShortcuts(value);}}/>}
      {dialog==='export'&&<><p className="note">完整工程保留参数来源与手工编辑。交换文件只保留该格式支持的信息，导出前会提示损失。SVG／PNG／JPG 和打印跟随当前图层显隐；隐藏图层仍保留在完整工程及几何交换文件中。</p><label className="select-field">输出格式<select disabled={exportBusy} value={exportFormat} onChange={e=>setExportFormat(e.target.value as typeof exportFormat)}><option value="json">完整工程 · .zhezhi.json</option><option value="obj" disabled={!storedCurveDesign}>OBJ · 曲面采样网格 / 毫米</option><option value="fold" disabled={!!storedCurveDesign}>FOLD · 二维折痕交换</option><option value="cp" disabled={!!storedCurveDesign}>CP · 经典山谷折痕</option><option value="opx" disabled={!!storedCurveDesign}>OPX · ORIPA 折痕</option><option value="ori" disabled={!!storedCurveDesign}>ORI · Oriedita 几何与文字</option><option value="orh" disabled={!!storedCurveDesign}>ORH · Orihime 几何交换 / UTF-8</option><option value="dxf" disabled={!!storedCurveDesign}>DXF · CAD 分层线段 / 毫米</option><option value="svg">SVG · 矢量图 / 实际尺寸</option><option value="png">PNG · 高清图像 / 保留透明</option><option value="jpg">JPG · 白底图像 / 92% 质量</option></select></label>{exportFormat==='cp'&&<><label className="select-field">CP 坐标<select aria-label="CP 坐标" value={cpCoordinates} onChange={e=>setCpCoordinates(e.target.value as 'paper'|'original')}><option value="paper">对齐原工具网格 · 居中 / 最长边400</option><option value="original">保留原始坐标 · 接收工具需调整网格</option></select></label><p className="note">默认按实际纸边居中并等比缩放，正方形对齐 −200 到 200。非正方形保留比例；CP 不保存网格设置或物理尺寸，导出副本不改原工程。</p></>}{!storedCurveDesign&&(exportFormat==='svg'||exportFormat==='png'||exportFormat==='jpg')&&<><label className="checkbox"><input type="checkbox" aria-label="添加背景网格" checked={exportGrid} onChange={e=>setExportGrid(e.target.checked)}/>添加背景网格</label><p className="note">沿用当前网格等分、颜色和自定义角度设置；可独立于画布网格开关导出。</p></>}{(exportFormat==='svg'||exportFormat==='png'||exportFormat==='jpg')&&<label className="checkbox"><input type="checkbox" checked={exportFrame} disabled={!operationFrame||tool!=='operationframe'||mode!=='edit'} onChange={e=>setExportFrame(e.target.checked)}/>只导出操作框范围（不含底图；其他格式与打印仍为全图）</label>}{(exportFormat==='png'||exportFormat==='jpg')&&<p className="note">最长边 2000 像素，不含参考底图；保持宽高比例。JPG 是有损白底图像，精细折痕建议使用 PNG 或 SVG。</p>}{exportFormat==='orh'&&<p className="callout warning">ORH 不保留文字或设置。旧 Oriedita 读取器可能产生空对象、漏读标记；与 Oriedita 交换建议选 ORI。</p>}<div className="callout">{storedCurveDesign?'曲面设计保存原生参数与数值结果；SVG 保留实际尺寸，OBJ 是采样可视网格。':hasMaterialTopology(doc)?'材料 FOLD 保留独立切口拓扑；已有折后位置时附 FF 帧，载入后重新计算层序。':'普通 FOLD 导出二维折痕，不包含三维状态或多帧。'}SVG 是出版用线型图，不是 Origami Simulator 的颜色编码输入，请使用 FOLD 互通。</div><div className="modal-actions"><button className="outline" onClick={printDoc}>打印折痕图 · 适配纸张</button><button className="primary" disabled={exportBusy} aria-busy={exportBusy} onClick={()=>void doExport()}>{exportBusy?'正在导出…':'导出文件'}</button></div><button className="text-button" disabled={saving||!online} onClick={()=>void save(true)}>另存一份到本机工程库</button></>}
      {dialog==='help'&&<><p>这是一套真实可操作的本地折纸工作台，包含折痕编辑、基础形设计、参数化镶嵌、折序绘图、平折分析与三维数值预览。</p><UsageTutorial/><h3>默认快捷键</h3><p className="note">绘图工具与新线类型可在顶部“快捷键设置”修改；以下为默认值。</p><p className="note">V 选择 · L 画线 · H 平移 · 1 山折 · 2 谷折<br/>Ctrl+S 保存 · Ctrl+O 打开 · Ctrl+Z 撤销 · Ctrl+Y 重做<br/>Ctrl+A 选择非边界线 · Delete 删除 · Esc 取消<br/>按住滚轮拖动画布 · 滚动滚轮缩放 · 空格拖动也可平移 · Shift 多选 / 画线锁方向</p><h3>工作日志</h3><p className="note">遇到导入、保存或关闭问题时，可导出本机操作日志协助排查。</p><button className="outline" onClick={()=>setActivityLogOpen(true)}>查看与导出工作日志</button><h3>版本与边界</h3><p className="note">v{VERSION}。ORI v1/v1.1 可导入几何与文字，并导出 v1.1（非完整设置恢复；不支持 U/F 线型）。ORH 可导入/导出折痕、圆和独立标记，导入可识别旧编码（不恢复设置；旧 Oriedita 读取器存在缺陷，优先使用 ORI）。树形与方格基础形设计已提供独立工作区：编辑骨架与分支长度、优化布局、生成 CP 后送到折痕编辑。设计工程可独立保存，也随完整作品保存。构造结果不代表连续折叠路径已验证。图片自动识别、定位教程和可靠的碰撞／纸厚模拟尚未提供。旧版 Orihime/ORIPA 可通过 CP、OPX 或二维 FOLD 交换。</p><p className="note">本项目以 GPL-3.0-only 提供；Rabbit Ear、Ori Studio 设计引擎与模拟包、Pleat 等按各自许可证保留声明。详见工作台目录 THIRD_PARTY_NOTICES.md、LICENSE。没有复制书中受限图版或照片。</p></>}
    </AppDialog>}
  </div>;
}
function StatusRow({name,value,good=false}:{name:string;value:string;good?:boolean}){return <div className="status-row"><span>{name}</span><span className={'status-value '+(good?'good':'')}>{value}</span></div>;}
