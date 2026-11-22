import {useEffect,useMemo,useRef,useState} from 'react';
import type {JunctionWarning} from '../core/editedJunctions';
import {BoundsIndex,type Bounds2} from '../core/boundsIndex';
import {pointBounds} from '../core/pointBounds';
import {buildDiagramFold} from '../core/geometry';
import {materialFaceInside,materialFacePath} from '../core/materialRings';
import {distanceToSegment} from '../app/state';
import type {Assignment,Doc,Point} from '../core/types';
import type {DiagramCPHit} from './DiagramCPInteractive';
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

function CPLinkedHover({hit,doc,onHover}:{hit:DiagramCPHit|null;doc:Doc;onHover?:(hit:DiagramCPHit|null)=>void}){
  useEffect(()=>{onHover?.(hit);return()=>onHover?.(null);},[hit?.kind,hit?.index,doc,onHover]);
  return null;
}

interface Props {
  detached?:{assignment:Assignment; mode:'line'|'assign';layerSlot:HTMLElement|null;labels:{faces:boolean;edges:boolean};highlight:{edges:boolean;faces:boolean};onHover?:(hit:DiagramCPHit|null)=>void};
  junctions?:JunctionWarning[];
  adaptiveLineStyle?:boolean;
  doc:Doc;
  presentation?:DiagramCPPresentationContext;
  gridSettings:{grid:boolean;snap:boolean;diagonalGrid:boolean;divisions:number};
  onGridSettings:(patch:Partial<{grid:boolean;snap:boolean}>)=>void;
  cpLabel:string;
  editable:boolean;
  reason:string;
  disabled:boolean;
  onCommit:(doc:Doc)=>boolean;
  showCursorHint?:boolean;
  onCursorHintChange?:(enabled:boolean)=>void;
  showToolGuide?:boolean;
  onToolGuideChange?:(enabled:boolean)=>void;
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
export default function DiagramCPWorkspace({junctions,detached,adaptiveLineStyle,doc,presentation,gridSettings,onGridSettings,cpLabel,editable,reason,disabled,onCommit,onReturn,onMessage,recovery,showCursorHint=true,onCursorHintChange,showToolGuide=true,onToolGuideChange}:Props){
  const surface=useRef<HTMLElement>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set()),[tool,setTool]=useState<Tool>(detached?'line':'select'),[localPreset,setPreset]=useState<Assignment>('V');
  const preset=detached?.assignment??localPreset;
  const [drawingSwap,setDrawingSwap]=useState(false);
  const drawingAngle=180;
  const angleSelection=useMemo(()=>summarizeFoldAngles(doc.segments,selected),[doc.segments,selected]);
  const presented=useMemo(()=>createDiagramCPPresentation(doc,presentation),[doc,presentation?.before,presentation?.pose,presentation?.phase,presentation?.precreases]);
  const selectedDetails=selected.size===1?presented.segments.get([...selected][0])?.title:selected.size?`已选 ${selected.size} 条线段；${angleSelection.editableCount} 条山谷折痕。悬停单条查看当前角、目标角与来源。`:undefined;
  const [selectedCircles,setSelectedCircles]=useState<Set<string>>(new Set());
  const [fit,setFit]=useState(0),[displayLayers,setDisplayLayers]=useState(defaultDisplayLayers);
  const [measurements,setMeasurements]=useState(emptyMeasurements);
  const [gridAppearance]=useState(readGridAppearance);
  const [localNames,setShowNames]=useState({faces:false,edges:false});
  const showNames=detached?.labels??localNames;
  const namesEnabled=showNames.faces||showNames.edges;
  const names=useMemo(()=>{
    if(!namesEnabled)return {geometry:null,error:''};
    try{return {geometry:buildDiagramCPLabelGeometry(doc),error:''};}
    catch{return {geometry:null,error:'当前 CP 的纸面与线段编号暂不可用。'};}
  },[doc,namesEnabled]);
  const hoverEdges=useMemo(()=>detached?.highlight.edges?new BoundsIndex(doc.segments.map(s=>[
    Math.min(s.a[0],s.b[0]),Math.min(s.a[1],s.b[1]),Math.max(s.a[0],s.b[0]),Math.max(s.a[1],s.b[1])
  ])):null,[doc.segments,detached?.highlight.edges]);
  const hoverFaces=useMemo(()=>{
    if(!detached?.highlight.faces&&!detached?.highlight.edges)return null;
    try{
      const graph=names.geometry?.graph??buildDiagramFold(doc).graph;
      const bounds=(graph.faces_vertices??[]).map((ring):Bounds2=>{
        const {minX,minY,maxX,maxY}=pointBounds(ring.map(v=>graph.vertices_coords[v]));
        return [minX,minY,maxX,maxY];
      });
      const edges=graph.edges_vertices.map(([a,b]):Bounds2=>{
        const p=graph.vertices_coords[a],q=graph.vertices_coords[b];
        return [Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.max(p[0],q[0]),Math.max(p[1],q[1])];
      });
      return {graph,index:new BoundsIndex(bounds),edges:new BoundsIndex(edges)};
    }catch{return null;}
  },[doc,names.geometry,detached?.highlight.faces,detached?.highlight.edges]);
  const readOnly=!editable||disabled;
  const assignMode=detached?.mode==='assign';
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
  function renderNames(viewport:DiagramCPLabelViewport,pointer:Point|null){
    let ink=null,hit:DiagramCPHit|null=null;
    if(displayLayers.main&&pointer&&detached){
      const [x,y]=pointer,box:Bounds2=[x,y,x,y],radius=viewport.units*5;
      const edge=hoverEdges?.query(box,radius).map(i=>({s:doc.segments[i],d:distanceToSegment(pointer,doc.segments[i])}))
        .filter(item=>item.d<=radius).sort((a,b)=>a.d-b.d)[0]?.s;
      if(edge){
        ink=<line data-cp-edit-hover-edge={edge.id} x1={edge.a[0]} y1={edge.a[1]} x2={edge.b[0]} y2={edge.b[1]} stroke="#218bc1" strokeWidth={3*viewport.units}/>;
        if(hoverFaces){
          const {graph}=hoverFaces;
          const atomic=hoverFaces.edges.query(box,radius).map(index=>{
            const [a,b]=graph.edges_vertices[index];
            return {index,d:distanceToSegment(pointer,{...edge,a:graph.vertices_coords[a],b:graph.vertices_coords[b]})};
          }).filter(item=>item.d<=radius).sort((a,b)=>a.d-b.d)[0];
          if(atomic)hit={kind:'edge',index:atomic.index};
        }
      }else if(detached.highlight.faces&&hoverFaces){
        const {graph,index}=hoverFaces,face=index.query(box).find(f=>materialFaceInside(graph,f,pointer));
        if(face!==undefined){hit={kind:'face',index:face};ink=<path data-cp-edit-hover-face={face} d={materialFacePath(graph,face)} fill="#218bc1" fillOpacity=".16" fillRule="evenodd"/>;}
      }
    }
    return <>{detached&&<CPLinkedHover hit={hit} doc={doc} onHover={detached.onHover}/>} {ink} {displayLayers.main&&names.geometry&&<CPNames geometry={names.geometry} viewport={viewport} show={showNames} selected={selected}/>}</>;
  }
  return <section ref={surface} tabIndex={-1} className="diagram-cp-workspace" aria-label={`主画布 ${cpLabel}`} data-cp-editable={!readOnly} onKeyDown={event=>{
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
    {!detached&&<><header><div><strong>{cpLabel}</strong><span>{editable?'编辑工作区':'只读工作区'}</span></div><button type="button" onClick={onReturn}>返回折图</button></header>
    <div className="diagram-cp-workspace-notice" role="status"><p>{reason||'修改即时应用到共享 CP，可用顶部撤销、重做；原折图在右侧预览。'}</p>{recovery&&<button type="button" disabled={disabled} onClick={recovery.onClick}>{recovery.label}</button>}</div>
    <div className="diagram-cp-edit-toolbar" role="group" aria-label="CP 编辑工具">
      {([['select','选择'],['line','画折痕'],['erase','擦除'],['moveselection','移动'],['pan','平移']] as [Tool,string][]).map(([value,label])=><button type="button" key={value} disabled={disabled||!editable&&value!=='pan'} aria-pressed={tool===value} onClick={()=>setTool(value)}>{label}</button>)}
      <button type="button" disabled={readOnly} aria-pressed={tool==='regionalswap'||drawingSwap} onClick={convertFolds} title="绘线时切换生成结果的山谷类型；选择时互换所选山谷，无选区时点击或拖框转换">谷峰转换</button>
      <select aria-label="CP 新折痕类型" disabled={readOnly} value={preset} onChange={event=>setPreset(event.target.value as Assignment)}><option value="V">谷折</option><option value="M">峰折</option><option value="F">已有折痕</option><option value="B">边界线</option><option value="A">辅助线</option></select>
      <label><input type="checkbox" checked={gridSettings.grid} disabled={disabled} onChange={event=>onGridSettings({grid:event.target.checked})}/>网格</label><label><input type="checkbox" checked={gridSettings.snap} disabled={readOnly} onChange={event=>onGridSettings({snap:event.target.checked})}/>吸附</label><button type="button" onClick={()=>setFit(value=>value+1)}>适应</button>
      <span className="diagram-cp-name-options" role="group" aria-label="CP 编号显示"><label><input type="checkbox" checked={showNames.faces} onChange={event=>setShowNames(value=>({...value,faces:event.target.checked}))}/>纸面编号</label><label><input type="checkbox" checked={showNames.edges} onChange={event=>setShowNames(value=>({...value,edges:event.target.checked}))}/>线段编号</label><small title="编号与侧栏 CP 一致；密集位置放大后会显示更多编号。">F 纸面 · E 线段</small></span>
    </div>
    {names.error&&<p className="diagram-cp-name-warning" role="status">{names.error}</p>}
    <DiagramCPLegend detail={selectedDetails}/></>}
    <div className="diagram-cp-edit-canvas"><CreaseCanvas junctions={junctions} onQuickSelect={detached?onReturn:()=>setTool('select')} gridPattern={detached?'square':undefined} layerControlHost={detached?.layerSlot} adaptiveLineStyle={adaptiveLineStyle} display={{...defaultCreaseDisplay(),showCursorHint,showToolGuide}} onToolGuideChange={onToolGuideChange} onCursorHintChange={onCursorHintChange} solidCreases segmentPresentation={presented.segments} svgOverlay={renderNames} doc={doc} selected={selected} onSelect={setSelected} selectedCircles={selectedCircles} onSelectCircles={setSelectedCircles} onChange={change} tool={readOnly?'pan':detached&&assignMode?'makevalley':tool} directAssignmentOverride={detached&&assignMode?preset as 'M'|'V'|'B'|'F'|'A':undefined} preset={preset} drawingAngle={drawingAngle} drawingSwap={drawingSwap} onDrawingSwapChange={setDrawingSwap} grid={gridSettings.grid} diagonalGrid={gridSettings.diagonalGrid} divisions={gridSettings.divisions} gridAppearance={gridAppearance} snap={gridSettings.snap} lockBoundary={false} displayLayers={displayLayers} onDisplayLayersChange={setDisplayLayers} measurements={measurements} lengthDetails={{}} onMeasurement={(register,value)=>setMeasurements(old=>({...old,[register]:value}))} onPoint={()=>{}} onMessage={onMessage} fitToken={fit} readOnly={readOnly} workspaceLabel={detached?undefined:`折序 · ${cpLabel}${editable?'':' · 只读'}`}/>{!detached&&<FoldAnglePanel unknownLabel="自适应" value={angleSelection.value} selectionKey={selected} selectedCount={angleSelection.editableCount} ignoredCount={angleSelection.ignoredCount} disabled={readOnly} disabledReason={readOnly?'当前 CP 不可编辑。':undefined} onApply={applySelectedAngle}/>}</div>
  </section>;
}
