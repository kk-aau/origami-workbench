import {useEffect,useMemo,useRef,useState} from 'react';
import type {Assignment,Doc} from '../core/types';
import {prepareEditorCommit,type EditorMaterialIntent} from '../app/editorCommit';
import {selectionAfterCommit} from '../app/selectionPersistence';
import {defaultDisplayLayers} from '../app/displayLayers';
import {editableCanvasSelection,deleteCanvasSelection} from '../app/canvasSelection';
import {emptyMeasurements} from '../app/measurements';
import {readGridAppearance} from '../app/gridAppearance';
import {applySelectedFoldSwap} from '../app/regionalSwap';
import {setSelectedFoldAngle,summarizeFoldAngles} from '../app/foldAngles';
import {buildDiagramCPLabelGeometry,layoutDiagramCPLabels,type DiagramCPLabelGeometry,type DiagramCPLabelViewport} from './diagramCPLabels';
import CreaseCanvas,{type Tool} from './CreaseCanvas';
import FoldAnglePanel from './FoldAnglePanel';
import {defaultCreaseDisplay} from '../app/creaseDisplay';
import DiagramCPLegend from './DiagramCPLegend';
import {createDiagramCPPresentation,type DiagramCPPresentationContext} from '../app/diagramCPPresentation';
import './DiagramCPWorkspace.css';
import {canSwapGeneratedLines} from '../app/drawingSwap';

interface Props {
  doc:Doc;
  presentation?:DiagramCPPresentationContext;
  gridSettings:{grid:boolean;snap:boolean;diagonalGrid:boolean;divisions:number};
  onGridSettings:(patch:Partial<{grid:boolean;snap:boolean}>)=>void;
  index:number;
  editable:boolean;
  reason:string;
  disabled:boolean;
  onCommit:(doc:Doc)=>boolean;
  showCursorHint?:boolean;
  onCursorHintChange?:(enabled:boolean)=>void;
  onReturn:()=>void;
  onMessage:(message:string)=>void;
  recovery?:{label:string;onClick:()=>void};
}

function CPNames({geometry,viewport,show,selected}:{geometry:DiagramCPLabelGeometry;viewport:DiagramCPLabelViewport;show:{faces:boolean;edges:boolean};selected:ReadonlySet<string>}){
  const {view,units}=viewport;
  const labels=useMemo(()=>layoutDiagramCPLabels(geometry,{view,units},show,selected),[geometry,view.x,view.y,view.w,view.h,units,show,selected]);
  return <g className="diagram-cp-main-labels" data-cp-main-labels="true" pointerEvents="none" fontSize={12*units} strokeWidth={3*units} textAnchor="middle" dominantBaseline="central">
    {labels.map(label=><text key={`${label.kind}-${label.index}`} data-cp-face-label={label.kind==='face'?label.index:undefined} data-cp-edge-label={label.kind==='edge'?label.index:undefined} className={label.selected?'is-selected':undefined} x={label.point[0]} y={label.point[1]}>{label.text}</text>)}
  </g>;
}

/** The CP is edited in the project transaction history, so exchanging views
 * never leaves an unapplied draft behind. Read-only CPs retain pan and zoom. */
export default function DiagramCPWorkspace({doc,presentation,gridSettings,onGridSettings,index,editable,reason,disabled,onCommit,onReturn,onMessage,recovery,showCursorHint=true,onCursorHintChange}:Props){
  const surface=useRef<HTMLElement>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set()),[tool,setTool]=useState<Tool>('select'),[preset,setPreset]=useState<Assignment>('V');
  const [drawingSwap,setDrawingSwap]=useState(false);
  const drawingAngle=180;
  const angleSelection=useMemo(()=>summarizeFoldAngles(doc.segments,selected),[doc.segments,selected]);
  const presented=useMemo(()=>createDiagramCPPresentation(doc,presentation),[doc,presentation?.before,presentation?.pose,presentation?.phase,presentation?.precreases]);
  const selectedDetails=selected.size===1?presented.segments.get([...selected][0])?.title:selected.size?`已选 ${selected.size} 条线段；${angleSelection.editableCount} 条山谷折痕。悬停单条查看当前角、目标角与来源。`:undefined;
  const [selectedCircles,setSelectedCircles]=useState<Set<string>>(new Set());
  const [fit,setFit]=useState(0),[displayLayers,setDisplayLayers]=useState(defaultDisplayLayers);
  const [measurements,setMeasurements]=useState(emptyMeasurements);
  const [gridAppearance]=useState(readGridAppearance);
  const [showNames,setShowNames]=useState({faces:true,edges:true});
  const names=useMemo(()=>{
    try{return {geometry:buildDiagramCPLabelGeometry(doc),error:''};}
    catch{return {geometry:null,error:'当前 CP 的纸面与线段编号暂不可用。'};}
  },[doc]);
  const readOnly=!editable||disabled;
  useEffect(()=>{if(readOnly||!canSwapGeneratedLines(tool))setDrawingSwap(false);},[readOnly,tool]);
  useEffect(()=>{surface.current?.focus({preventScroll:true});},[]);
  useEffect(()=>{setSelected(previous=>new Set([...previous].filter(id=>doc.segments.some(segment=>segment.id===id))));},[doc.segments]);
  useEffect(()=>{setSelectedCircles(previous=>new Set([...previous].filter(id=>doc.objects?.some(object=>object.kind==='circle'&&object.id===id))));},[doc.objects]);
  useEffect(()=>{if(readOnly){setSelected(new Set());setSelectedCircles(new Set());}},[readOnly]);
  function change(next:Doc,completedSelection?:Set<string>,intent?:EditorMaterialIntent){
    if(readOnly)return false;
    try{
      const prepared=prepareEditorCommit(doc,next,intent);
      if(!onCommit(prepared.doc))return false;
      setSelected(selectionAfterCommit(selected,prepared.descendants,completedSelection,true));return true;
    }catch(error){onMessage(error instanceof Error?error.message:String(error));return false;}
  }
  function convertFolds(){
    if(readOnly)return;
    if(canSwapGeneratedLines(tool)){
      setDrawingSwap(!drawingSwap);
      onMessage(drawingSwap?'已关闭生成时山谷互换，继续使用当前工具。':'已开启生成时山谷互换，继续使用当前工具；再次点击可关闭。');
      return;
    }
    setTool('regionalswap');
    try{
      const result=applySelectedFoldSwap(doc,selected);
      if(!result.changed){onMessage('谷峰转换：点击折痕或拖框，只互换谷折与峰折；边界、辅助线和已有折痕保持原样。');return;}
      if(change(result.doc))onMessage(`已互换选中的 ${result.changed} 条谷折与峰折，可一次撤销；继续点击或拖框可转换其他折痕。`);
    }catch(error){onMessage(error instanceof Error?error.message:String(error));}
  }
  function applySelectedAngle(magnitude:number|null){
    if(readOnly)return false;
    const result=setSelectedFoldAngle(doc,selected,magnitude);
    if(!result.changed)return true;
    if(!change(result.doc))return false;
    onMessage(`已将选中的 ${result.changed} 条折痕设为${magnitude===null?'未知折角':`${magnitude}°`}，山谷方向保持不变，可一次撤销。`);
    return true;
  }
  function renderNames(viewport:DiagramCPLabelViewport){
    if(!names.geometry||!displayLayers.main)return null;
    return <CPNames geometry={names.geometry} viewport={viewport} show={showNames} selected={selected}/>;
  }
  return <section ref={surface} tabIndex={-1} className="diagram-cp-workspace" aria-label={`主画布 CP${index}`} data-cp-editable={!readOnly} onKeyDown={event=>{
    if(event.defaultPrevented||event.nativeEvent.isComposing||event.keyCode===229)return;
    if((event.target as Element).closest('input,textarea,select,[contenteditable]'))return;
    if(readOnly)return;
    if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='a'){
      event.preventDefault();event.stopPropagation();
      const next=event.shiftKey?{segments:new Set<string>(),circles:new Set<string>()}:editableCanvasSelection(doc,displayLayers,false);
      setSelected(next.segments);setSelectedCircles(next.circles);
    }else if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();setSelected(new Set());setSelectedCircles(new Set());
    }else if(event.key==='Delete'||event.key==='Backspace'){
      event.preventDefault();event.stopPropagation();
      const next=deleteCanvasSelection(doc,editableCanvasSelection(doc,displayLayers,false,{segments:selected,circles:selectedCircles}));
      if(next!==doc&&change(next,new Set()))setSelectedCircles(new Set());
    }
  }}>
    <header><div><strong>CP{index}</strong><span>{editable?'编辑工作区':'只读工作区'}</span></div><button type="button" onClick={onReturn}>返回折图</button></header>
    <div className="diagram-cp-workspace-notice" role="status"><p>{reason||'修改即时应用到共享 CP，可用顶部撤销、重做；原折图在右侧预览。'}</p>{recovery&&<button type="button" disabled={disabled} onClick={recovery.onClick}>{recovery.label}</button>}</div>
    <div className="diagram-cp-edit-toolbar" role="group" aria-label="CP 编辑工具">
      {([['select','选择'],['line','画折痕'],['erase','擦除'],['moveselection','移动'],['pan','平移']] as [Tool,string][]).map(([value,label])=><button type="button" key={value} disabled={disabled||!editable&&value!=='pan'} aria-pressed={tool===value} onClick={()=>setTool(value)}>{label}</button>)}
      <button type="button" disabled={readOnly} aria-pressed={tool==='regionalswap'||drawingSwap} onClick={convertFolds} title="绘线时切换生成结果的山谷类型；选择时互换所选山谷，无选区时点击或拖框转换">谷峰转换</button>
      <select aria-label="CP 新折痕类型" disabled={readOnly} value={preset} onChange={event=>setPreset(event.target.value as Assignment)}><option value="V">谷折</option><option value="M">峰折</option><option value="F">已有折痕</option><option value="B">边界线</option><option value="A">辅助线</option></select>
      <label><input type="checkbox" checked={gridSettings.grid} disabled={disabled} onChange={event=>onGridSettings({grid:event.target.checked})}/>网格</label><label><input type="checkbox" checked={gridSettings.snap} disabled={readOnly} onChange={event=>onGridSettings({snap:event.target.checked})}/>吸附</label><button type="button" onClick={()=>setFit(value=>value+1)}>适应</button>
      <span className="diagram-cp-name-options" role="group" aria-label="CP 编号显示"><label><input type="checkbox" checked={showNames.faces} onChange={event=>setShowNames(value=>({...value,faces:event.target.checked}))}/>纸面编号</label><label><input type="checkbox" checked={showNames.edges} onChange={event=>setShowNames(value=>({...value,edges:event.target.checked}))}/>线段编号</label><small title="编号与侧栏 CP 一致；密集位置放大后会显示更多编号。">F 纸面 · E 线段</small></span>
    </div>
    {names.error&&<p className="diagram-cp-name-warning" role="status">{names.error}</p>}
    <DiagramCPLegend detail={selectedDetails}/>
    <div className="diagram-cp-edit-canvas"><CreaseCanvas display={{...defaultCreaseDisplay(),showCursorHint}} onCursorHintChange={onCursorHintChange} solidCreases segmentPresentation={presented.segments} svgOverlay={renderNames} doc={doc} selected={selected} onSelect={setSelected} selectedCircles={selectedCircles} onSelectCircles={setSelectedCircles} onChange={change} tool={readOnly?'pan':tool} preset={preset} drawingAngle={drawingAngle} drawingSwap={drawingSwap} onDrawingSwapChange={setDrawingSwap} grid={gridSettings.grid} diagonalGrid={gridSettings.diagonalGrid} divisions={gridSettings.divisions} gridAppearance={gridAppearance} snap={gridSettings.snap} lockBoundary={false} displayLayers={displayLayers} onDisplayLayersChange={setDisplayLayers} measurements={measurements} lengthDetails={{}} onMeasurement={(register,value)=>setMeasurements(old=>({...old,[register]:value}))} onPoint={()=>{}} onMessage={onMessage} fitToken={fit} readOnly={readOnly} workspaceLabel={`折序 · CP${index}${editable?'':' · 只读'}`}/><FoldAnglePanel unknownLabel="自适应" value={angleSelection.value} selectionKey={selected} selectedCount={angleSelection.editableCount} ignoredCount={angleSelection.ignoredCount} disabled={readOnly} disabledReason={readOnly?'当前 CP 不可编辑。':undefined} onApply={applySelectedAngle}/></div>
  </section>;
}
