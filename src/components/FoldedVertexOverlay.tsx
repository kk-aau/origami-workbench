import {Fragment,useEffect,useMemo,useRef,useState} from 'react';
import type {FlatFoldResult,Point} from '../core/types';
import {selectFoldedVertex,moveFoldedVertices,foldedVertexPositions,type FoldedVertexSelection} from '../app/foldedVertexEdit';
import {createModelOverlapPreview,type ModelOverlapReply} from '../app/modelOverlapTask';
import {modelProjection} from '../app/modelProjection';
import {straightStretch,stretchSelection,type StretchEdge} from '../app/diagramVertexStretch';
import './FoldedVertexOverlay.css';

export interface ModelVertexControls {
  selection:FoldedVertexSelection;
  onSelect:(selection:FoldedVertexSelection)=>void;
  onMove:(selection:FoldedVertexSelection,destination:Point,mode?:ModelVertexEditMode)=>void;
  mode?:ModelVertexEditMode;
  disabled:boolean;
  overlapPreview?:boolean;
  /** Hide ordinary markers while retaining transparent drag/selection targets. */
  showMarkers?:boolean;
  /** Illustration canvases can render the entire paper and its marks during a drag. */
  onPreviewChange?:(draft:{selection:FoldedVertexSelection;destination:Point}|null)=>void;
  /** Diagram layer visibility keeps original IDs, while hiding unused hit targets. */
  visibleVertices?:readonly number[];
  /** Keep illustration-only anchors in the original model projection. */
  projectionVertices?:Point[];
  projectionCenter?:Point;
  vertexOrder?:readonly number[];
  /** Defined only in diagram connected-segment stretch mode. */
  stretchEdges?:readonly StretchEdge[];
}
export type ModelVertexEditMode='wireframe'|'recompute';

/** Draft lives only in this overlay. No history or solver changes until pointer release. */
export default function FoldedVertexOverlay({result,back,rotation=0,radius,selection,onSelect,onMove,mode='recompute',disabled,onHint,overlapPreview=false,showMarkers=true,onPreviewChange,visibleVertices,projectionVertices,projectionCenter,vertexOrder,stretchEdges}:{result:FlatFoldResult;back:boolean;rotation?:number;radius:number;onHint:(point:Point|null,dragging:boolean)=>void}&ModelVertexControls){
  const vertices=result.geometry.vertices;
  const group=useRef<SVGGElement>(null);
  const {project,unprojectDelta}=modelProjection(projectionVertices??vertices,back,rotation,projectionCenter);
  const drag=useRef<{id:number;target:SVGCircleElement;x:number;y:number;inverse:DOMMatrix;anchor:Point;selection:FoldedVertexSelection;destination:Point;moved:boolean}|null>(null);
  const [dragging,setDragging]=useState(false);
  const [hovered,setHovered]=useState<number|null>(null),[focused,setFocused]=useState<number|null>(null);
  const [draft,setDraft]=useState<{selection:FoldedVertexSelection;destination:Point}|null>(null);
  const previewCallback=useRef(onPreviewChange);previewCallback.current=onPreviewChange;
  useEffect(()=>{previewCallback.current?.(draft);},[draft]);
  const [overlap,setOverlap]=useState<{draft:NonNullable<typeof draft>;reply:ModelOverlapReply}|null>(null);
  const overlapScheduler=useRef<ReturnType<typeof createModelOverlapPreview>|null>(null),submitted=useRef<{ticket:number;draft:NonNullable<typeof draft>}|null>(null);
  useEffect(()=>{
    if(!overlapPreview||disabled)return;
    let live=true;const scheduler=createModelOverlapPreview((reply,ticket)=>{if(live&&submitted.current?.ticket===ticket)setOverlap({draft:submitted.current.draft,reply});});
    overlapScheduler.current=scheduler;
    return()=>{live=false;scheduler.cancel();overlapScheduler.current=null;submitted.current=null;};
  },[result,overlapPreview,disabled]);
  useEffect(()=>{
    const scheduler=overlapScheduler.current;if(!scheduler)return;
    if(!draft){scheduler.cancel();submitted.current=null;return;}
    try{const ticket=scheduler.submit(moveFoldedVertices(result,draft.selection,draft.destination));submitted.current={ticket,draft};}
    catch(e){scheduler.cancel();setOverlap({draft,reply:{status:'error',message:e instanceof Error?e.message:String(e)}});}
  },[draft,result,overlapPreview,disabled]);
  function cancel(){const previous=drag.current;drag.current=null;setDragging(false);setDraft(null);setHovered(null);setFocused(null);onHint(null,false);if(previous?.target.hasPointerCapture(previous.id))previous.target.releasePointerCapture(previous.id);}
  useEffect(()=>{cancel();},[result,back,rotation,disabled,showMarkers,visibleVertices]);
  const [pickedEdges,setPickedEdges]=useState<StretchEdge[]>([]);
  useEffect(()=>{setPickedEdges([]);},[result,back,rotation,visibleVertices,stretchEdges===undefined]);
  const usableEdges=useMemo(()=>stretchEdges?.filter(([a,b])=>!visibleVertices||visibleVertices.includes(a)&&visibleVertices.includes(b))??[],[stretchEdges,visibleVertices]);
  const stretch=useMemo(()=>pickedEdges.length?straightStretch(vertices,usableEdges,pickedEdges[0],pickedEdges.slice(1)):null,[vertices,usableEdges,pickedEdges]);
  function pickEdge(edge:StretchEdge){
    cancel();
    const extended=pickedEdges.length?straightStretch(vertices,usableEdges,pickedEdges[0],[...pickedEdges.slice(1),edge]):null;
    setPickedEdges(extended?[...pickedEdges,edge]:[edge]);onSelect({group:[],selected:[]});
  }
  const allowed=visibleVertices?new Set(visibleVertices):null;
  const choose=(index:number)=>{
    const previous={group:selection.group.filter(v=>!allowed||allowed.has(v)),selected:selection.selected.filter(v=>!allowed||allowed.has(v))};
    const next=selectFoldedVertex(vertices,previous,index,'folded');
    return allowed?{group:next.group.filter(v=>allowed.has(v)),selected:next.selected.filter(v=>allowed.has(v))}:next;
  };
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{const history=(e.ctrlKey||e.metaKey)&&!e.altKey&&['z','y'].includes(e.key.toLowerCase());if((e.key==='Escape'||history)&&drag.current){e.preventDefault();e.stopPropagation();cancel();}else if(e.key==='Escape'){setHovered(null);setFocused(null);}};
    const context=(e:MouseEvent)=>{if(drag.current){e.preventDefault();cancel();}};
    window.addEventListener('keydown',key,true);window.addEventListener('contextmenu',context);window.addEventListener('blur',cancel);
    return()=>{const previous=drag.current;drag.current=null;if(previous?.target.hasPointerCapture(previous.id))previous.target.releasePointerCapture(previous.id);onHint(null,false);previewCallback.current?.(null);window.removeEventListener('keydown',key,true);window.removeEventListener('contextmenu',context);window.removeEventListener('blur',cancel);};
  },[]);
  function destination(d:NonNullable<typeof drag.current>,x:number,y:number):Point{
    const dx=x-d.x,dy=y-d.y;
    const delta=unprojectDelta([d.inverse.a*dx+d.inverse.c*dy,d.inverse.b*dx+d.inverse.d*dy]);
    return [d.anchor[0]+delta[0],d.anchor[1]+delta[1]];
  }
  const preview=(draft?foldedVertexPositions(vertices,draft.selection,draft.destination):vertices).map(project);
  const reply=overlap?.draft===draft?overlap.reply:null,anchor=draft?project(draft.destination):[0,0];
  const screenMatrix=group.current?.getScreenCTM(),labelSize=12/(screenMatrix?Math.hypot(screenMatrix.a,screenMatrix.b)||1:1);
  return <g ref={group} data-model-edit-overlay="true" data-model-dragging={dragging?true:undefined} data-model-hide-markers={!showMarkers?true:undefined} onDragStartCapture={e=>{e.preventDefault();e.stopPropagation();}}>
    {stretchEdges!==undefined&&!disabled&&<g data-diagram-stretch-lines="true">
      {usableEdges.map((edge,index)=>{const [a,b]=edge.map(id=>project(vertices[id]));return <line key={index} data-stretch-edge={edge.join(':')} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={radius*2.5} pointerEvents="stroke" role="button" tabIndex={0} aria-label={`选择拉伸线段 ${index+1}`} style={{cursor:'pointer'}}
        onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();pickEdge(edge);}} onClick={e=>e.stopPropagation()}
        onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();pickEdge(edge);}}}><title>选择此段；点选相连的共线线段可延长选择范围</title></line>;})}
      {stretch&&<g pointerEvents="none" data-stretch-selected="true">
        <line x1={preview[stretch.ends[0]][0]} y1={preview[stretch.ends[0]][1]} x2={preview[stretch.ends[1]][0]} y2={preview[stretch.ends[1]][1]} stroke="#8052ad" strokeWidth={radius*.5}/>
        {stretch.vertices.filter(id=>!stretch.ends.includes(id)).map(id=><circle key={id} cx={preview[id][0]} cy={preview[id][1]} r={radius*.45} fill="#8052ad"/>)}
      </g>}
    </g>}
    {draft&&!onPreviewChange&&<g data-model-draft="true" pointerEvents="none">{result.geometry.faces.map((face,i)=><polygon key={i} points={face.map(v=>preview[v].join(',')).join(' ')} fill="#8052ad" fillOpacity=".12" stroke="#8052ad" strokeWidth={radius/5} strokeDasharray={`${radius} ${radius/2}`}/>)}</g>}
    {draft&&overlapPreview&&<g data-model-overlap-preview="true" pointerEvents="none">
      {reply?.status==='complete'&&!reply.exact&&reply.analysis.cells.map((cell,i)=><polygon key={i} data-overlap-depth={cell.faces.length} points={cell.polygon.map(p=>project(p).join(',')).join(' ')} fill="#8052ad" fillOpacity={Math.min(.65,.08*cell.faces.length)} stroke="#8052ad" strokeWidth={radius/10}><title>{cell.faces.length} 个面重叠：{cell.faces.map(f=>'F'+(f+1)).join('、')}；不代表层序</title></polygon>)}
      <text data-overlap-status={reply?.status??'pending'} x={anchor[0]+labelSize} y={anchor[1]+labelSize*1.5} fontSize={labelSize} fill="#583278" stroke="#fffefb" strokeWidth={labelSize/8} paintOrder="stroke" role="status">{!reply?'正在计算重叠区域…':reply.status==='complete'&&reply.exact?`最多 ${reply.exactAnalysis.maxDepth} 面重叠 · 精确分区`:reply.status==='complete'?`最多 ${reply.analysis.maxDepth} 面重叠 · 非层序${reply.analysis.omittedThinRegions?' · 有过窄区域未绘制':''}`:reply.message}</text>
    </g>}
    {(vertexOrder??vertices.map((_,index)=>index)).map(i=>{const p=vertices[i];if(!p||allowed&&!allowed.has(i)||stretchEdges!==undefined&&!stretch?.ends.includes(i))return null;const [x,y]=project(p),selected=selection.selected.includes(i),marker=draft?.selection.selected.includes(i)?project(draft.destination):[x,y],highlighted=!showMarkers&&!disabled&&!dragging&&(hovered===i||focused===i);return <Fragment key={i}><circle data-folded-vertex={i} cx={x} cy={y} r={showMarkers||stretchEdges!==undefined?radius:radius*1.6} fill={showMarkers||stretchEdges!==undefined?(selected?'#8052ad':selection.group.includes(i)?'#d9c9e8':'#fffefb'):'transparent'} stroke={showMarkers||stretchEdges!==undefined?'#8052ad':'none'} strokeWidth={showMarkers||stretchEdges!==undefined?radius/4:0} pointerEvents={showMarkers?undefined:'all'} style={{cursor:disabled?'not-allowed':'move'}} role="button" tabIndex={disabled?-1:0} aria-label={`${stretch?'拉伸选段端点':'拖动模型顶点'} ${i+1}`} aria-pressed={selected}
      onClick={e=>e.stopPropagation()}
      onPointerEnter={()=>{if(!disabled&&!drag.current)setHovered(i);}}
      onFocus={()=>{if(!disabled&&!drag.current)setFocused(i);}}
      onBlur={()=>setFocused(current=>current===i?null:current)}
      onKeyDown={e=>{if(!disabled&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelect(choose(i));}}}
      onPointerDown={e=>{if(e.button!==0||disabled)return;e.stopPropagation();e.preventDefault();const svg=e.currentTarget.ownerSVGElement,m=group.current?.getScreenCTM();if(!m)return;svg?.focus({preventScroll:true});const chosen=stretch?stretchSelection(vertices,stretch,i):choose(i);onSelect(chosen);drag.current={id:e.pointerId,target:e.currentTarget,x:e.clientX,y:e.clientY,inverse:m.inverse(),anchor:[...p],selection:chosen,destination:[...p],moved:false};setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);onHint([e.clientX,e.clientY],true);}}
      onPointerMove={e=>{onHint([e.clientX,e.clientY],!!drag.current);const d=drag.current;if(!d||d.id!==e.pointerId)return;e.stopPropagation();if(!(e.buttons&1)||(e.buttons&2)){cancel();return;}d.destination=destination(d,e.clientX,e.clientY);d.moved=Math.hypot(e.clientX-d.x,e.clientY-d.y)>2;if(d.moved)setDraft({selection:d.selection,destination:d.destination});else setDraft(null);}}
      onPointerUp={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;e.stopPropagation();const target=destination(d,e.clientX,e.clientY);const moved=Math.hypot(e.clientX-d.x,e.clientY-d.y)>2;cancel();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(e.button===0&&moved&&!disabled)onMove(d.selection,target,mode);}}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerLeave={()=>{setHovered(current=>current===i?null:current);if(!drag.current)onHint(null,false);}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();cancel();}}
    />{highlighted&&<g pointerEvents="none" aria-hidden="true"><circle data-model-hover-halo={i} cx={x} cy={y} r={radius*1.25} fill="#2d84a9" fillOpacity=".18" stroke="none"/><circle data-model-hover-marker={i} cx={x} cy={y} r={radius*.65} fill="#2d84a9" stroke="#fffefb" strokeWidth={radius*.18}/></g>}{!showMarkers&&selected&&<circle data-model-selected-marker={i} cx={marker[0]} cy={marker[1]} r={radius*.55} fill="#8052ad" stroke="none" pointerEvents="none"/>}</Fragment>;})}
  </g>;
}
