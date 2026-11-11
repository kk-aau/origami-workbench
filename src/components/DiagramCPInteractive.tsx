import {useEffect,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent,type MouseEvent} from 'react';
import {buildDiagramFold} from '../core/geometry';
import {materialFacePath,materialFaceRings} from '../core/materialRings';
import {diagramCPFaceLabelPoint as faceLabelPoint} from './diagramCPLabels';
import type {Assignment,Doc,FoldGraph,Point} from '../core/types';
import {diagramCPHitAreas} from './diagramCPHitAreas';
import {adaptiveLineStroke} from '../app/adaptiveLineStyle';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
import {creaseLineSourceSpan} from '../app/creaseLineStyle';
import {COLORS} from '../app/state';
import {createDiagramCPPresentation,type DiagramCPPresentationContext} from '../app/diagramCPPresentation';
import {defaultModelView} from '../app/modelViewState';
import DiagramCPLegend from './DiagramCPLegend';
import './DiagramCPInteractive.css';

export type DiagramCPHit={kind:'face'|'vertex'|'edge';index:number};
export interface DiagramCPInteractiveProps {
  adaptiveLineStyle?:boolean;
  doc:Doc;
  presentation?:DiagramCPPresentationContext;
  graph?:FoldGraph;
  hovered?:DiagramCPHit|null;
  selected?:DiagramCPHit|null;
  fixed?:DiagramCPHit|null;
  /** Original atomic CP edge indices linked to the selected main drawing. */
  highlightedEdges?:readonly number[];
  disabled?:boolean;
  expanded?:boolean;
  onHover:(hit:DiagramCPHit|null,point?:Point)=>void;
  onSelect:(hit:DiagramCPHit,point?:Point)=>void;
}

const equal=(a:DiagramCPHit|null|undefined,b:DiagramCPHit)=>a?.kind===b.kind&&a.index===b.index;
const color=(assignment:string)=>COLORS[assignment as keyof typeof COLORS]??COLORS.U;
const assignmentLabel=(assignment:string)=>assignment==='M'?'峰折（山折）':assignment==='V'?'谷折':assignment==='F'?'已有折痕':assignment==='B'?'纸边':'未定折痕';

export default function DiagramCPInteractive({adaptiveLineStyle,doc,presentation,graph:supplied,hovered,selected,fixed,highlightedEdges,disabled=false,expanded=false,onHover,onSelect}:DiagramCPInteractiveProps){
  const svg=useRef<SVGSVGElement>(null);
  const [camera,setCamera]=useState({x:0,y:0,size:256});
  const pan=useRef<{id:number;x:number;y:number;camera:typeof camera;inverse:DOMMatrix}|null>(null);
  const zoom=(factor:number,anchor?:Point)=>setCamera(old=>{const size=Math.max(8,Math.min(2048,old.size*factor)),p=anchor??[old.x+old.size/2,old.y+old.size/2];return {x:p[0]-(p[0]-old.x)*size/old.size,y:p[1]-(p[1]-old.y)*size/old.size,size};});
  useEffect(()=>{setCamera({x:0,y:0,size:256});pan.current=null;},[doc,expanded]);
  const [globalAdaptive]=useAdaptiveLineStyle(),adaptive=adaptiveLineStyle??globalAdaptive,[units,setUnits]=useState(1);
  const pose=presentation?.pose,appearanceKey=JSON.stringify({...pose?.view??defaultModelView(),cameras:undefined});
  // The main drawing's pan/zoom cannot change these CP cards. Retain the
  // presentation (and its graph/label/hit-area cache) across camera-only shells.
  const presented=useMemo(()=>createDiagramCPPresentation(doc,presentation),[doc,presentation?.before,presentation?.phase,presentation?.precreases,!!pose,pose?.sourceStateId,pose?.sourceRevision,pose?.sourceDoc,pose?.result,pose?.spatial,pose?.displayOrder,pose?.layerSolutionIndex,pose?.hiddenFaces,pose?.paperDeformation,appearanceKey]);
  const preview=useMemo(()=>{
    try {
      const built=supplied?null:buildDiagramFold(doc),graph=supplied??built!.graph,vertices=graph.vertices_coords;
      if(!vertices.length)throw Error('没有可显示的纸面与顶点。');
      let x=Infinity,y=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const p of vertices){x=Math.min(x,p[0]);y=Math.min(y,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
      const width=maxX-x,height=maxY-y,scale=216/Math.max(width,height,1e-6);
      const left=(256-width*scale)/2,top=(256-height*scale)/2;
      const project=(p:Point):Point=>[left+(p[0]-x)*scale,top+(p[1]-y)*scale];
      const unproject=(p:Point):Point=>[(p[0]-left)/scale+x,(p[1]-top)/scale+y];
      const projected=vertices.map(project),faces=(graph.faces_vertices??[]).map((_,f)=>{
        const label=faceLabelPoint(graph,f);
        return {path:materialFacePath(graph,f,project),rings:materialFaceRings(graph,f),label:label?.point??null,clearance:(label?.clearance??0)*scale};
      });
      const sources=new Map(doc.segments.map(segment=>[segment.id,segment]));
      const sourceSpans=graph.edges_vertices.map(([a,b],edge)=>{
        const ids=built?.edgeSourceIds[edge],source=ids?.length===1?sources.get(ids[0]):undefined;
        return source&&source.assignment===graph.edges_assignment[edge]?creaseLineSourceSpan(source,vertices[a],vertices[b],scale):undefined;
      });
      const edgeInfo=graph.edges_vertices.map(([a,b],e)=>presented.describe({id:`edge:${e}`,a:vertices[a],b:vertices[b],assignment:graph.edges_assignment[e] as Assignment,angle:graph.edges_foldAngle[e]}));
      return {graph,vertices:projected,faces,sourceSpans,edgeInfo,...diagramCPHitAreas(projected,graph.edges_vertices,faces),project,unproject,error:null};
    }catch(error){return {error:error instanceof Error?error.message:'CP 预览暂不可用。'};}
  },[doc,supplied,presented]);
  useEffect(()=>{
    const node=svg.current;if(!node)return;
    const update=()=>{const matrix=node.getScreenCTM();if(matrix)setUnits(1/Math.hypot(matrix.a,matrix.b));};
    update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();
  },[preview,camera]);
  useEffect(()=>{
    const node=svg.current;if(!node||!expanded)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const matrix=node.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());zoom(Math.exp(Math.max(-1,Math.min(1,e.deltaY*.002))),[p.x,p.y]);onHover(null);};
    node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);
  },[expanded,preview]);
  useEffect(()=>{if(disabled)onHover(null);},[disabled,onHover]);
  if(preview.error!==null||!('graph' in preview))return <div className="diagram-cp-image diagram-cp-interactive-error"><span>{preview.error}</span></div>;
  const {graph,vertices,faces,sourceSpans,edgeInfo,vertexRadii,edgeWidths,project,unproject}=preview,fontSize=expanded?11*units:8.5;
  const linkedEdges=new Set(highlightedEdges??[]);
  const state=(hit:DiagramCPHit)=>[equal(fixed,hit)?'is-fixed':'',equal(selected,hit)?'is-selected':'',equal(hovered,hit)?'is-hovered':''].filter(Boolean).join(' ');
  const edgeMidpoint=(index:number):Point|undefined=>{const edge=graph.edges_vertices[index];if(!edge)return;const a=graph.vertices_coords[edge[0]],b=graph.vertices_coords[edge[1]];return [(a[0]+b[0])/2,(a[1]+b[1])/2];};
  const hitLabel=(hit:DiagramCPHit)=>hit.kind==='face'?`纸面 F${hit.index+1}`:hit.kind==='vertex'?`顶点 V${hit.index+1}`:`线段 E${hit.index+1} · ${edgeInfo[hit.index]?.title??assignmentLabel(graph.edges_assignment[hit.index])}`;
  const hitPoint=(hit:DiagramCPHit)=>hit.kind==='vertex'?graph.vertices_coords[hit.index]:hit.kind==='edge'?edgeMidpoint(hit.index):faces[hit.index]?.label??undefined;
  const pointerPoint=(e:{clientX:number;clientY:number})=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return unproject([p.x,p.y]);};
  const active=(hit:DiagramCPHit)=>equal(hovered,hit)||equal(selected,hit)||equal(fixed,hit);
  type Label={hit:DiagramCPHit;text:string;x:number;y:number;anchor:'middle'|'start'|'end'};
  type Bounds={left:number;right:number;top:number;bottom:number};
  const labels:Label[]=[],occupied:Bounds[]=[];
  const addLabel=(label:Label,required=false)=>{
    const width=label.text.length*fontSize*.6+2,left=label.x-(label.anchor==='middle'?width/2:label.anchor==='end'?width:0);
    const bounds={left,right:left+width,top:label.y-fontSize*.55-1,bottom:label.y+fontSize*.55+1};
    if(!required&&(bounds.left<2||bounds.right>254||bounds.top<2||bounds.bottom>254||occupied.some(b=>bounds.left<b.right+2&&bounds.right>b.left-2&&bounds.top<b.bottom+2&&bounds.bottom>b.top-2)))return false;
    occupied.push(bounds);labels.push(label);return true;
  };
  // Active labels remain discoverable. Ordinary labels yield when the CP is dense.
  const addFaceLabel=(index:number,required:boolean)=>{
    const face=faces[index];if(!face.label)return;
    const hit:DiagramCPHit={kind:'face',index},p=project(face.label),text=`F${index+1}${equal(fixed,hit)?' · 固定':''}`;
    if(required||face.clearance>=Math.hypot(text.length*fontSize*.3,fontSize*.55)+1)addLabel({hit,text,x:p[0],y:p[1],anchor:'middle'},required);
  };
  const addVertexLabel=(index:number,required:boolean)=>{
    const hit:DiagramCPHit={kind:'vertex',index},p=vertices[index],text=`V${index+1}`,offset=Math.max(3,vertexRadii[index]+1.5);
    const candidates=([['start',offset,7],['end',-offset,7],['start',offset,-7],['end',-offset,-7]] as const).map(([anchor,dx,dy])=>({hit,text,x:p[0]+dx,y:p[1]+dy,anchor}));
    for(const candidate of candidates)if(addLabel(candidate))return;
    if(required)addLabel(candidates[p[0]>128?1:0],true);
  };
  faces.forEach((_,index)=>{if(active({kind:'face',index}))addFaceLabel(index,true);});
  vertices.forEach((_,index)=>{if(active({kind:'vertex',index}))addVertexLabel(index,true);});
  faces.forEach((_,index)=>{if(!active({kind:'face',index}))addFaceLabel(index,false);});
  vertices.forEach((_,index)=>{if(!active({kind:'vertex',index}))addVertexLabel(index,false);});
  const interaction=(hit:DiagramCPHit)=>({
    role:'button',tabIndex:disabled?-1:0,'aria-label':`${hitLabel(hit)}${equal(fixed,hit)?'，已固定':''}`,'aria-pressed':equal(selected,hit),'aria-disabled':disabled,
    onPointerMove:(e:{clientX:number;clientY:number})=>{if(!disabled&&!pan.current)onHover(hit,hit.kind==='face'?pointerPoint(e):hitPoint(hit));},
    onPointerEnter:(e:{clientX:number;clientY:number})=>{if(!disabled&&!pan.current)onHover(hit,hit.kind==='face'?pointerPoint(e):hitPoint(hit));},onPointerLeave:()=>onHover(null),onFocus:()=>{if(!disabled)onHover(hit);},onBlur:()=>onHover(null),
    onClick:(e:MouseEvent<SVGGElement>)=>{
      if(disabled)return;
      if(hit.kind!=='face'){onSelect(hit,hitPoint(hit));return;}
      const matrix=svg.current?.getScreenCTM(),p=matrix?new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()):null;
      onSelect(hit,p?unproject([p.x,p.y]):faces[hit.index]?.label??undefined);
    },onKeyDown:(e:KeyboardEvent<SVGGElement>)=>{if(!disabled&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelect(hit,hitPoint(hit));}},
  });
  return <><svg ref={svg} className="diagram-cp-image diagram-cp-interactive" aria-label="CP 纸面、线段与顶点选择" role="group" tabIndex={expanded?0:undefined} data-cp-disabled={disabled||undefined} data-cp-expanded={expanded||undefined} viewBox={expanded?`${camera.x} ${camera.y} ${camera.size} ${camera.size}`:'0 0 256 256'} preserveAspectRatio="xMidYMid meet" onPointerLeave={()=>onHover(null)}
    onPointerDownCapture={e=>{if(!expanded||e.button!==1)return;e.preventDefault();e.stopPropagation();const inverse=svg.current?.getScreenCTM()?.inverse();if(!inverse)return;pan.current={id:e.pointerId,x:e.clientX,y:e.clientY,camera,inverse};e.currentTarget.setPointerCapture(e.pointerId);onHover(null);}}
    onPointerMoveCapture={e=>{const p=pan.current;if(!p||p.id!==e.pointerId)return;e.stopPropagation();const dx=e.clientX-p.x,dy=e.clientY-p.y;setCamera({...p.camera,x:p.camera.x-p.inverse.a*dx-p.inverse.c*dy,y:p.camera.y-p.inverse.b*dx-p.inverse.d*dy});}}
    onPointerUp={e=>{if(pan.current?.id===e.pointerId){pan.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}}
    onPointerCancel={()=>{pan.current=null;}} onLostPointerCapture={()=>{pan.current=null;}} onAuxClick={e=>{if(expanded)e.preventDefault();}}
    onKeyDown={e=>{if(!expanded||e.target!==e.currentTarget)return;if(e.key==='Home'){e.preventDefault();setCamera({x:0,y:0,size:256});}else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();zoom(e.key==='-'?1.25:.8);}}}>
    {faces.map((face,index)=>{const hit:DiagramCPHit={kind:'face',index};return <g key={index} className={`diagram-cp-face ${state(hit)}`} style={{'--cp-face-stroke':Math.min(1.5,face.clearance*.4)} as CSSProperties} data-cp-face={index} data-teach-cp-x={face.label?project(face.label)[0]:undefined} data-teach-cp-y={face.label?project(face.label)[1]:undefined} {...interaction(hit)}>
      <title>{`纸面 F${index+1}${equal(fixed,hit)?' · 固定纸面':''}`}</title>
      <path d={face.path} fillRule="evenodd" className="diagram-cp-face-region"/>
    </g>;})}
    <g className="diagram-cp-edges">{graph.edges_vertices.map(([a,b],index)=>{
      if(!vertices[a]||!vertices[b])return null;
      const hit:DiagramCPHit={kind:'edge',index},points={x1:vertices[a][0],y1:vertices[a][1],x2:vertices[b][0],y2:vertices[b][1]};
      const source=sourceSpans[index],stroke=adaptiveLineStroke(Math.hypot(vertices[b][0]-vertices[a][0],vertices[b][1]-vertices[a][1]),Math.min(1,edgeWidths[index]/3)*(edgeInfo[index]?.emphasis?1.3:1),undefined,{enabled:adaptive,units,span:source?.span,linecap:'butt'});
      const markPoints=adaptive&&source?.reverse?{x1:points.x2,y1:points.y2,x2:points.x1,y2:points.y1}:points;
      return <g key={index} className={`diagram-cp-edge ${state(hit)}${linkedEdges.has(index)?' is-linked-selected':''}`} style={{'--cp-edge-hit-width':edgeWidths[index],'--cp-edge-width':stroke.width} as CSSProperties} data-cp-edge={index} data-cp-step-emphasis={edgeInfo[index]?.emphasis||undefined} data-cp-linked-selected={linkedEdges.has(index)||undefined} {...interaction(hit)}>
        <title>{`${hitLabel(hit)}${stroke.limited?' · 线段过短，请放大查看完整线型。':''}`}</title>
        <line {...points} className="diagram-cp-edge-hit"/>
        {linkedEdges.has(index)&&<line {...points} className="diagram-cp-edge-linked-halo" pointerEvents="none"/>}
        <line {...markPoints} className="diagram-cp-edge-mark" data-adaptive-line-limited={stroke.limited||undefined} stroke={color(graph.edges_assignment[index])} strokeDasharray={stroke.dash} strokeDashoffset={stroke.dashOffset} pointerEvents="none"/>
      </g>;
    })}{doc.segments.filter(s=>s.assignment==='A').map(s=>{const a=project(s.a),b=project(s.b),stroke=adaptiveLineStroke(Math.hypot(b[0]-a[0],b[1]-a[1]),1,undefined,{enabled:adaptive,units,linecap:'butt'});return <line key={s.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={s.displayColor??COLORS.A} style={{strokeWidth:stroke.width}} pointerEvents="none"/>;})}</g>
    {vertices.map((p,index)=>{const hit:DiagramCPHit={kind:'vertex',index};return <g key={index} className={`diagram-cp-vertex ${state(hit)}`} style={{'--cp-vertex-stroke':Math.min(1,vertexRadii[index]*.24)} as CSSProperties} data-cp-vertex={index} {...interaction(hit)}>
      <title>{`顶点 V${index+1}${equal(fixed,hit)?' · 固定顶点':''}`}</title>
      <circle className="diagram-cp-vertex-hit" cx={p[0]} cy={p[1]} r={vertexRadii[index]}/>
      <circle className="diagram-cp-vertex-mark" cx={p[0]} cy={p[1]} r={Math.min(equal(fixed,hit)?2.6:2.15,vertexRadii[index]*.55)} pointerEvents="none"/>
    </g>;})}
    <g className="diagram-cp-labels" pointerEvents="none">{labels.map(({hit,text,x,y,anchor})=><text key={`${hit.kind}-${hit.index}`} data-cp-face-label={hit.kind==='face'?hit.index:undefined} data-cp-vertex-label={hit.kind==='vertex'?hit.index:undefined} x={x} y={y} fontSize={fontSize} dominantBaseline="central" textAnchor={anchor} className={state(hit)}>{text}</text>)}</g>
  </svg>{expanded&&<div className="diagram-cp-zoom" role="group" aria-label="对照 CP 缩放"><span>滚轮缩放 · 中键平移</span><button type="button" aria-label="缩小对照 CP" onClick={()=>zoom(1.25)}>−</button><button type="button" onClick={()=>setCamera({x:0,y:0,size:256})}>适配 CP</button><button type="button" aria-label="放大对照 CP" onClick={()=>zoom(.8)}>＋</button><output>{Math.round(256/camera.size*100)}%</output></div>}<DiagramCPLegend compact detail={hovered?.kind==='edge'?hitLabel(hovered):selected?.kind==='edge'?hitLabel(selected):undefined}/></>;
}
