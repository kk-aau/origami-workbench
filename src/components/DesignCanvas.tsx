import {useEffect,useId,useMemo,useRef,useState,type PointerEvent as Pointer,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import type {BaseDesignProject,DesignResult,XY} from '../app/baseDesign';
import {constrainDesignDelta,designEdges,designNodes,designSubtree,type DesignCamera,type DesignEditCommand,type DesignSelection,type DesignView} from '../app/baseDesignInteraction';
import type {Doc} from '../core/types';
import {chunkDesignEdges,chunkDesignMarkers,designCirclePath,indexDesignGraph,pickDesignGraph,readableDesignLabels} from '../app/designCanvasRendering';

export interface DesignLayers {labels:boolean;lengths:boolean;grid:boolean;regions:boolean;rivers:boolean}
export const defaultDesignLayers=():DesignLayers=>({labels:true,lengths:true,grid:true,regions:true,rivers:true});
type Drag={type:'move';id:number;ids:number[];start:XY;origin:XY;delta:XY;positions:{id:number;x:number;y:number;width?:number;height?:number}[]}
 |{type:'resize';id:number;start:XY;point:XY;corner:string;flap:{x:number;y:number;width:number;height:number}}
 |{type:'marquee';start:XY;point:XY;extend:boolean}
 |{type:'pan';start:{x:number;y:number};camera:DesignCamera};
interface Props {
 project:BaseDesignProject;result:DesignResult|null;cp:Doc|null;view:DesignView;selection:DesignSelection;
 camera:DesignCamera;onCamera:(camera:DesignCamera)=>void;layers:DesignLayers;tool:'select'|'branch';branchLength:number;
 active:boolean;disabled:boolean;gesturing:boolean;onSelect:(id:number,type:'node'|'edge',extend:boolean)=>void;onSelection:(selection:DesignSelection)=>void;
 onBegin:()=>boolean;onPreview:(command:DesignEditCommand)=>void;onCommit:(command:DesignEditCommand)=>void;onCancel:()=>void;
 onAdd:(point:XY)=>void;onSplit:(edge:number)=>void;onDelete:()=>void;onRename:(type:'node'|'edge')=>void;
}
const color:Record<string,string>={B:'var(--ink)',M:'#c64242',V:'#366fc4',A:'var(--muted)',F:'var(--muted)',U:'var(--warn)'};
export default function DesignCanvas(props:Props){
 const {project,result,cp,view,selection,camera,onCamera,layers,tool,active,disabled}=props;
 const nodes=useMemo(()=>designNodes(project),[project]),edges=useMemo(()=>designEdges(project),[project]),tree=project.kind==='tree'?project.model:null,box=project.kind==='box'?project.model:null;
 const graphIndex=useMemo(()=>indexDesignGraph(nodes,edges),[nodes,edges]),flapIndex=useMemo(()=>new Map(box?.design.layout.flaps.map(f=>[f.id,f])??[]),[box]);
 const selectedNodes=useMemo(()=>new Set(selection.nodes),[selection.nodes]),selectedEdges=useMemo(()=>new Set(selection.edges),[selection.edges]);
 const batched=view!=='cp'&&nodes.length+edges.length>600&&(!!tree||view==='tree');
 const sheet=tree?tree.paper:box!.design[view==='tree'?'tree':'layout'].sheet;
 const width=view==='cp'&&cp?cp.paper.width:sheet.width,height=view==='cp'&&cp?cp.paper.height:sheet.height,unit=Math.max(width,height),pad=unit*.075;
 const id=useId().replaceAll(':',''),svg=useRef<SVGSVGElement>(null),root=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null);
 const latest=useRef(props);latest.current=props;
 const [gesture,setGesture]=useState<Drag|null>(null),[ghost,setGhost]=useState<XY|null>(null),[space,setSpace]=useState(false);
 const [viewport,setViewport]=useState({width:600,height:600});
 const [menu,setMenu]=useState<{x:number;y:number;node?:number;edge?:number}|null>(null),menuRef=useRef<HTMLDivElement>(null);
 const cameraWidth=(width+pad*2)/camera.zoom,cameraHeight=(height+pad*2)/camera.zoom;
 const left=width/2+camera.x-cameraWidth/2,top=height/2-camera.y-cameraHeight/2;
 const screenUnit=Math.max(cameraWidth/viewport.width,cameraHeight/viewport.height),radius=5*screenUnit,fontSize=12*screenUnit;
 useEffect(()=>{const el=svg.current;if(!el)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.width&&r.height)setViewport({width:r.width,height:r.height});});observer.observe(el);return()=>observer.disconnect();},[]);
 const point=(event:{clientX:number;clientY:number}):XY=>{const matrix=svg.current!.getScreenCTM()!.inverse(),p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix);return{x:p.x,y:height-p.y};};
 const clamp=(p:XY):XY=>({x:Math.max(0,Math.min(width,p.x)),y:Math.max(0,Math.min(height,p.y))});
 const setDrag=(d:Drag|null)=>{drag.current=d;setGesture(d);};
 const selectNode=(n:number,extend=false)=>props.onSelect(n,'node',extend);
 const moving=useMemo(()=>new Set(gesture?.type==='move'?gesture.ids:[]),[gesture]);
 const moved=(n:number,p:XY):XY=>gesture?.type==='move'&&moving.has(n)?{x:p.x+gesture.delta.x,y:p.y+gesture.delta.y}:p;
 const drawnNodes=useMemo(()=>nodes.map(n=>({...n,...moved(n.id,n)})),[nodes,gesture]),drawnIndex=useMemo(()=>new Map(drawnNodes.map(n=>[n.id,n])),[drawnNodes]);
 const pick=(p:XY)=>pickDesignGraph(drawnNodes,edges,drawnIndex,p,radius*2.2,screenUnit*6);
 function cancel(){const d=drag.current;setDrag(null);setGhost(null);if(d?.type==='move'||d?.type==='resize')latest.current.onCancel();}
 useEffect(()=>{if(!active){cancel();setSpace(false);setMenu(null);}},[active]);
 useEffect(()=>{const blur=()=>{cancel();setSpace(false);};window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[]);
 useEffect(()=>{if(!menu)return;menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const outside=(e:Event)=>{if(e.target instanceof Node&&!menuRef.current?.contains(e.target))setMenu(null);};window.addEventListener('pointerdown',outside);window.addEventListener('resize',outside);return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('resize',outside);};},[menu]);
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{
  e.preventDefault();if(drag.current)return;const before=point(e),zoom=Math.max(.02,Math.min(200,camera.zoom*Math.exp(-e.deltaY*.0015))),ratio=camera.zoom/zoom;
  onCamera({zoom,x:before.x-width/2-(before.x-width/2-camera.x)*ratio,y:before.y-height/2-(before.y-height/2-camera.y)*ratio});
 };el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[camera,width,height,onCamera]);
 function startMove(e:Pointer,id:number){
  if(e.button!==0||space||disabled||props.gesturing)return;
  e.stopPropagation();e.preventDefault();svg.current?.focus();
  if(e.shiftKey||e.ctrlKey||e.metaKey){selectNode(id,true);return;}
  let ids=selection.nodes.includes(id)?selection.nodes:[id];
  if(e.altKey&&view==='tree')ids=designSubtree(project,id);
  if(!selection.nodes.includes(id)||e.altKey)props.onSelection({nodes:ids,edges:[]});
  const item=view==='packing'&&box?flapIndex.get(id):graphIndex.byId.get(id);if(!item||!props.onBegin())return;
  if(view==='packing'&&box)ids=ids.filter(n=>box.design.layout.flaps.some(f=>f.id===n));
  const positions=ids.map(n=>{const p=view==='packing'&&box?flapIndex.get(n)!:graphIndex.byId.get(n)!;return{id:n,x:p.x,y:p.y,width:'width'in p?p.width:0,height:'height'in p?p.height:0};});
  setDrag({type:'move',id,ids:[id,...ids.filter(n=>n!==id)],start:point(e),origin:{x:item.x,y:item.y},delta:{x:0,y:0},positions});
  setGhost(null);svg.current?.setPointerCapture(e.pointerId);
 }
 function reshape(d:Extract<Drag,{type:'resize'}>,p:XY){
  const r=d.flap,x0=d.corner.includes('w')?Math.min(p.x,r.x+r.width):r.x,x1=d.corner.includes('e')?Math.max(p.x,r.x):r.x+r.width;
  const y0=d.corner.includes('s')?Math.min(p.y,r.y+r.height):r.y,y1=d.corner.includes('n')?Math.max(p.y,r.y):r.y+r.height;
  const anchor=clamp({x:x0,y:y0}),end=clamp({x:x1,y:y1});return {type:'reshapeFlap',id:d.id,x:anchor.x,y:anchor.y,width:Math.max(0,end.x-anchor.x),height:Math.max(0,end.y-anchor.y)};
 }
 const command=(d:Extract<Drag,{type:'move'}>):DesignEditCommand=>view==='packing'&&box?{type:'moveFlaps',ids:d.ids,x:d.origin.x+d.delta.x,y:d.origin.y+d.delta.y}:{type:'moveNodes',positions:d.positions.map(p=>({id:p.id,x:p.x+d.delta.x,y:p.y+d.delta.y}))};
 function down(e:Pointer){
  if(menu){setMenu(null);return;}
  if(e.button===1||e.button===0&&space){e.preventDefault();svg.current?.focus();setDrag({type:'pan',start:{x:e.clientX,y:e.clientY},camera});svg.current?.setPointerCapture(e.pointerId);return;}
  if(e.button!==0||disabled||props.gesturing||view==='cp')return;
  if(batched){const hit=pick(point(e));if(hit.node!==undefined){startMove(e,hit.node);return;}if(hit.edge!==undefined){e.preventDefault();svg.current?.focus();props.onSelect(hit.edge,'edge',e.shiftKey||e.ctrlKey||e.metaKey);return;}}
  svg.current?.focus();const start=point(e);setDrag({type:'marquee',start,point:start,extend:e.shiftKey||e.ctrlKey||e.metaKey});svg.current?.setPointerCapture(e.pointerId);
 }
 function move(e:Pointer){
  const d=drag.current,p=point(e);
  if(!d){if(tool==='branch'&&view==='tree'&&!disabled)setGhost(clamp(p));return;}
  if(d.type==='pan'){const rect=svg.current!.getBoundingClientRect(),scale=Math.min(rect.width/cameraWidth,rect.height/cameraHeight);onCamera({...d.camera,x:d.camera.x-(e.clientX-d.start.x)/scale,y:d.camera.y+(e.clientY-d.start.y)/scale});return;}
  if(d.type==='move'){
   const delta={x:p.x-d.start.x,y:p.y-d.start.y};if(box){delta.x=Math.round(delta.x);delta.y=Math.round(delta.y);}
   const next={...d,delta:constrainDesignDelta(d.positions.flatMap(p=>[p,{x:p.x+(p.width??0),y:p.y+(p.height??0)}]),delta,width,height)};setDrag(next);props.onPreview(command(next));
  }else if(d.type==='resize'){
   const q={x:Math.round((d.corner.includes('e')?d.flap.x+d.flap.width:d.flap.x)+p.x-d.start.x),y:Math.round((d.corner.includes('n')?d.flap.y+d.flap.height:d.flap.y)+p.y-d.start.y)},next={...d,point:q};setDrag(next);props.onPreview(reshape(next,q));
  }else setDrag({...d,point:p});
 }
 function up(e:Pointer){
  const d=drag.current;if(!d)return;setDrag(null);if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId);
  if(d.type==='move'){
   if(d.delta.x===0&&d.delta.y===0)props.onCancel();else props.onCommit(command(d));
  }else if(d.type==='resize')props.onCommit(reshape(d,d.point));
  else if(d.type==='marquee'){
   const movedPx=Math.hypot(d.point.x-d.start.x,d.point.y-d.start.y)*camera.zoom/unit;
   if(movedPx<.007){if(tool==='branch'&&view==='tree')props.onAdd(clamp(point(e)));else if(!d.extend)props.onSelection({nodes:[],edges:[]});}
   else{
    const minX=Math.min(d.start.x,d.point.x),maxX=Math.max(d.start.x,d.point.x),minY=Math.min(d.start.y,d.point.y),maxY=Math.max(d.start.y,d.point.y);
    const items=view==='packing'&&box?box.design.layout.flaps:nodes;
    const ids=items.filter(n=>{const w='width'in n?n.width:0,h='height'in n?n.height:0;return n.x+w>=minX&&n.x<=maxX&&n.y+h>=minY&&n.y<=maxY;}).map(n=>n.id);
    props.onSelection({nodes:[...new Set([...(d.extend?selection.nodes:[]),...ids])],edges:[]});
   }
  }
 }
 function key(e:KeyboardEvent){
  if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select'))return;
  if(e.key==='Escape'){e.preventDefault();if(menu){setMenu(null);svg.current?.focus();}else if(drag.current)cancel();else props.onSelection({nodes:[],edges:[]});return;}
  if(e.key===' '){e.preventDefault();setSpace(true);return;}
  if(e.key==='Home'){e.preventDefault();onCamera({x:0,y:0,zoom:1});return;}
  if(['+','=','-'].includes(e.key)){e.preventDefault();onCamera({...camera,zoom:Math.max(.02,Math.min(200,camera.zoom*(e.key==='-'?1/1.25:1.25)))});return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();props.onSelection({nodes:(view==='packing'&&box?box.design.layout.flaps:nodes).map(n=>n.id),edges:[]});return;}
  if(disabled||props.gesturing)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();props.onDelete();return;}
  if(e.key==='F2'){e.preventDefault();props.onRename('node');return;}
  if(e.shiftKey&&e.key==='F10'){e.preventDefault();const r=root.current!.getBoundingClientRect();setMenu({x:r.x+40,y:r.y+55,node:selection.nodes[0],edge:selection.edges[0]});return;}
  const direction=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]} as Record<string,number[]>)[e.key];
  if(direction&&view!=='cp'&&selection.nodes.length){e.preventDefault();const amount=(box?1:unit*.01)*(e.shiftKey?10:1),items=selection.nodes.map(id=>view==='packing'&&box?flapIndex.get(id):graphIndex.byId.get(id)).filter((p):p is typeof nodes[number]=>!!p);
   const first=items[0];if(!first)return;const delta=constrainDesignDelta(items,{x:direction[0]*amount,y:direction[1]*amount},width,height);
   if(props.onBegin())props.onCommit(view==='packing'&&box?{type:'moveFlaps',ids:items.map(p=>p.id),x:first.x+delta.x,y:first.y+delta.y}:{type:'moveNodes',positions:items.map(p=>({id:p.id,x:p.x+delta.x,y:p.y+delta.y}))});
  }
 }
 function context(e:React.MouseEvent,node?:number,edge?:number){e.preventDefault();e.stopPropagation();if(disabled||props.gesturing)return;if(node!==undefined&&!selection.nodes.includes(node))selectNode(node);if(edge!==undefined&&!selection.edges.includes(edge))props.onSelect(edge,'edge',false);setMenu({x:Math.min(e.clientX,window.innerWidth-208),y:Math.min(e.clientY,window.innerHeight-240),node,edge});}
 const allFlaps=box?.design.layout.flaps.map(f=>{const p=moved(f.id,f);if(gesture?.type==='resize'&&gesture.id===f.id)return {...f,...reshape(gesture,gesture.point)} as typeof f;return {...f,x:p.x,y:p.y};})??[];
 const ghostParent=selection.nodes.length===1?nodes.find(n=>n.id===selection.nodes[0]):null;
 const leafEdges=useMemo(()=>{if(!tree)return [];const incident=new Map<number,typeof tree.edges[number]>();for(const edge of tree.edges){incident.set(edge.nodes[0],edge);incident.set(edge.nodes[1],edge);}return tree.nodes.filter(node=>graphIndex.degree.get(node.id)===1).map(node=>({node,edge:incident.get(node.id)!}));},[tree,graphIndex]);
 const packingCircles=useMemo(()=>tree&&view==='packing'&&layers.regions?<g clipPath={`url(#${id}-paper)`}>{leafEdges.map(({node,edge})=>{const p=moved(node.id,node.loc);return <circle key={node.id} cx={p.x} cy={height-p.y} r={edge.length*(1+edge.strain)*tree.paper.scale} className="design-packing-circle"/>;})}</g>:null,[tree,view,layers.regions,leafEdges,id,height,gesture]);
 const batch=useMemo(()=>{
  if(!batched)return null;const normalEdges:string[]=[],chosenEdges:string[]=[],normalNodes:string[]=[],chosenNodes:string[]=[],midpoints:{id:number;x:number;y:number;length:number}[]=[];
  for(const edge of edges){const a=drawnIndex.get(edge.n1),b=drawnIndex.get(edge.n2);if(!a||!b)continue;(selectedEdges.has(edge.id)?chosenEdges:normalEdges).push(`M${a.x} ${height-a.y}L${b.x} ${height-b.y}`);if(layers.lengths)midpoints.push({id:edge.id,x:(a.x+b.x)/2,y:(a.y+b.y)/2,length:edge.length});}
  for(const node of drawnNodes)(selectedNodes.has(node.id)?chosenNodes:normalNodes).push(designCirclePath(node.x,height-node.y,radius));
  const bounds={minX:left,maxX:left+cameraWidth,minY:height-top-cameraHeight,maxY:height-top};
  return {normalEdges:chunkDesignEdges(normalEdges),chosenEdges:chunkDesignEdges(chosenEdges),normalNodes:chunkDesignMarkers(normalNodes),chosenNodes:chunkDesignMarkers(chosenNodes),nodeLabels:layers.labels?readableDesignLabels(drawnNodes,bounds,90*screenUnit,24*screenUnit,selection.nodes.length===1?selection.nodes[0]:undefined):[],edgeLabels:layers.lengths?readableDesignLabels(midpoints,bounds,70*screenUnit,24*screenUnit,selection.edges.length===1?selection.edges[0]:undefined):[]};
 },[batched,edges,drawnIndex,drawnNodes,selectedEdges,selectedNodes,height,radius,left,top,cameraWidth,cameraHeight,screenUnit,layers.labels,layers.lengths]);
 return <div className={'design-canvas-pane'+(space?' is-panning':'')+(tool==='branch'&&view==='tree'?' is-drawing':'')} ref={root} onKeyDown={key} onKeyUp={e=>{if(e.key===' ')setSpace(false);}}>
  <div className="design-pane-title"><strong>{view==='tree'?'树形骨架':view==='packing'?'纸张布局':'折痕图'}</strong><span>{view==='cp'&&cp?`${cp.segments.length} 条线`:view==='tree'?`${nodes.length} 节点 · ${edges.length} 分支`:box?`${box.design.layout.flaps.length} 个纸瓣`:'圆打包'}</span></div>
  <div className="design-canvas"><svg ref={svg} tabIndex={0} role={view==='cp'?'img':'group'} aria-label={view==='tree'?'基础形树形骨架':view==='packing'?'基础形纸张布局':'生成的折痕图'} viewBox={`${left} ${top} ${cameraWidth} ${cameraHeight}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}} onContextMenu={e=>{const hit=batched?pick(point(e)):{node:undefined,edge:undefined};context(e,hit.node,hit.edge);}} onDoubleClick={e=>{if(!batched||disabled||props.gesturing)return;const hit=pick(point(e));if(hit.node!==undefined)props.onRename('node');else if(hit.edge!==undefined)props.onRename('edge');}} onPointerLeave={()=>{if(!drag.current)setGhost(null);}}>
   <defs><pattern id={`${id}-grid`} width={box?1:width/10} height={box?1:height/10} patternUnits="userSpaceOnUse"><path d={`M ${box?1:width/10} 0 H0 V${box?1:height/10}`} fill="none" className="design-grid-line" vectorEffect="non-scaling-stroke"/></pattern><clipPath id={`${id}-paper`}><rect width={width} height={height}/></clipPath></defs>
   <rect width={width} height={height} className="design-paper"/>{layers.grid&&view!=='cp'&&<rect width={width} height={height} fill={`url(#${id}-grid)`} pointerEvents="none"/>}
   {box&&view==='packing'&&box.design.layout.sheet.type==='diag'&&<path d={`M${width/2} 0 ${width} ${height/2} ${width/2} ${height} 0 ${height/2}Z`} className="design-diagonal-border"/>}
   {view==='cp'&&cp&&cp.segments.map(s=><line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={color[s.assignment]} strokeWidth={s.assignment==='B'?1.8:1} strokeDasharray={s.assignment==='A'?'4 4':undefined} vectorEffect="non-scaling-stroke"/>)}
   {packingCircles}
   {batch&&view!=='cp'&&<g pointerEvents="none" className="design-batch">{batch.normalEdges.map((d,index)=><path key={`edge-${index}`} d={d} className="design-batch-edge"/>)}{batch.chosenEdges.map((d,index)=><path key={`selected-edge-${index}`} d={d} className="design-batch-edge selected"/>)}{batch.normalNodes.map((d,index)=><path key={`normal-${index}`} d={d} className="design-batch-node"/>)}{batch.chosenNodes.map((d,index)=><path key={`selected-${index}`} d={d} className="design-batch-node selected"/>)}{batch.edgeLabels.map(edge=><text key={edge.id} x={edge.x} y={height-edge.y-unit*.012/camera.zoom} fontSize={fontSize} className="design-batch-label">{Number(edge.length.toFixed(3))}</text>)}{batch.nodeLabels.map(node=><text key={node.id} x={node.x+radius*1.7} y={height-node.y-radius*1.7} fontSize={fontSize} className="design-batch-label">{node.name||`N${node.id}`}</text>)}</g>}
   {view!=='cp'&&(tree||view==='tree')&&!batched&&<>
    {edges.map(e=>{const a=nodes.find(n=>n.id===e.n1)!,b=nodes.find(n=>n.id===e.n2)!,p=moved(a.id,a),q=moved(b.id,b);return <g key={e.id} className={'design-edge'+(selection.edges.includes(e.id)?' selected':'')} role="button" aria-label={`选择分支 N${e.n1} 到 N${e.n2}`} tabIndex={0} onPointerDown={event=>{if(event.button!==0||space)return;event.stopPropagation();if(!disabled)props.onSelect(e.id,'edge',event.shiftKey||event.ctrlKey||event.metaKey);}} onDoubleClick={()=>props.onRename('edge')} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();props.onSelect(e.id,'edge',false);}}} onContextMenu={event=>context(event,undefined,e.id)}><line x1={p.x} y1={height-p.y} x2={q.x} y2={height-q.y} className="design-edge-hit"/><line x1={p.x} y1={height-p.y} x2={q.x} y2={height-q.y}/>{layers.lengths&&<text x={(p.x+q.x)/2} y={height-(p.y+q.y)/2-unit*.012/camera.zoom} fontSize={fontSize}>{Number(e.length.toFixed(3))}</text>}</g>;})}
    {nodes.map(n=>{const p=moved(n.id,n);return <g key={n.id} className={'design-node'+(selection.nodes.includes(n.id)?' selected':'')} role="button" aria-label={`选择节点 N${n.id}`} tabIndex={0} onPointerDown={e=>startMove(e,n.id)} onDoubleClick={()=>props.onRename('node')} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();selectNode(n.id,e.shiftKey);}}} onContextMenu={e=>context(e,n.id)}><circle cx={p.x} cy={height-p.y} r={radius*2.2} className="design-node-hit"/><circle cx={p.x} cy={height-p.y} r={radius}/>{layers.labels&&<text x={p.x+radius*1.7} y={height-p.y-radius*1.7} fontSize={fontSize}>{n.name||`N${n.id}`}</text>}</g>;})}
   </>}
   {view==='packing'&&box&&<>
    {layers.rivers&&result?.kind==='box'&&[...result.graphics.nodeGraphics,...result.graphics.deviceGraphics].map(g=><g key={g.id}>{g.data.contours.map((c,i)=><path key={i} d={[c.outer,...c.inner??[]].map(points=>points.length?'M'+points.map(p=>`${p.x} ${height-p.y}`).join('L')+'Z':'').join('')} className="design-river" fillRule="evenodd"/>)}{g.data.ridges.map(([a,b],i)=><line key={i} x1={a.x} y1={height-a.y} x2={b.x} y2={height-b.y} className="design-ridge"/>)}</g>)}
    {allFlaps.map(f=>{const r=edges.find(e=>e.n1===f.id||e.n2===f.id)?.length??0;return <g key={f.id} className={'design-flap'+(selection.nodes.includes(f.id)?' selected':'')} role="button" aria-label={`选择纸瓣 N${f.id}`} tabIndex={0} onPointerDown={e=>startMove(e,f.id)} onContextMenu={e=>context(e,f.id)} onDoubleClick={()=>props.onRename('node')} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();selectNode(f.id,e.shiftKey);}}}>{layers.regions&&<rect x={f.x-r} y={height-f.y-f.height-r} width={f.width+2*r} height={f.height+2*r} className="design-flap-radius"/>}<rect x={f.x} y={height-f.y-f.height} width={Math.max(f.width,radius*.25)} height={Math.max(f.height,radius*.25)} className="design-flap-body"/><circle cx={f.x} cy={height-f.y} r={radius}/>{layers.labels&&<text x={f.x+radius*1.7} y={height-f.y-radius*1.7} fontSize={fontSize}>N{f.id}</text>}{selection.nodes.length===1&&selection.nodes[0]===f.id&&['ne','nw','se','sw'].map(c=>{const x=c.includes('e')?f.x+f.width:f.x,y=c.includes('n')?f.y+f.height:f.y,hx=x+(f.width===0?(c.includes('e')?5:-5)*radius:0),hy=y+(f.height===0?(c.includes('n')?5:-5)*radius:0);return <g key={c}>{(x!==hx||y!==hy)&&<line x1={x} y1={height-y} x2={hx} y2={height-hy} className="design-resize-link"/>}<rect aria-label={`调整纸瓣 N${f.id} ${{ne:'东北角',nw:'西北角',se:'东南角',sw:'西南角'}[c]}`} role="button" tabIndex={0} x={hx-radius*.65} y={height-hy-radius*.65} width={radius*1.3} height={radius*1.3} className={`design-resize-handle corner-${c}`} onPointerDown={e=>{if(disabled||props.gesturing||e.button!==0)return;e.preventDefault();e.stopPropagation();if(!props.onBegin())return;setDrag({type:'resize',id:f.id,start:point(e),point:{x,y},corner:c,flap:f});svg.current?.setPointerCapture(e.pointerId);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();document.querySelector<HTMLInputElement>('input[aria-label="纸瓣宽"]')?.focus();}}}/></g>;})}</g>;})}
   </>}
   {ghost&&tool==='branch'&&view==='tree'&&<g className="design-branch-ghost">{ghostParent&&<line x1={ghostParent.x} y1={height-ghostParent.y} x2={ghost.x} y2={height-ghost.y}/>}<circle cx={ghost.x} cy={height-ghost.y} r={radius}/></g>}
   {gesture?.type==='marquee'&&<rect x={Math.min(gesture.start.x,gesture.point.x)} y={height-Math.max(gesture.start.y,gesture.point.y)} width={Math.abs(gesture.start.x-gesture.point.x)} height={Math.abs(gesture.start.y-gesture.point.y)} className="design-marquee"/>}
  </svg>{view==='cp'&&!cp&&<div className="design-canvas-empty"><strong>还没有完整折痕图</strong><p>调整布局后，点击“生成折痕图”。</p></div>}{!nodes.length&&view==='tree'&&<div className="design-canvas-empty"><strong>在画布上勾画骨架</strong><p>选择“画分支”，点击建立第一个节点，再点击空白处延伸。</p></div>}</div>
  <div className="design-canvas-footer"><span>{gesture?.type==='move'||gesture?.type==='resize'?'拖动预览 · 松开提交，Esc 取消':view==='tree'&&tool==='branch'?'点击空白处延伸分支':view==='cp'?'山折 / 谷折 / 辅助线':'Shift 多选 · 拖框选择'}</span><span className="spacer"/><button aria-label={`缩小${view==='tree'?'树形':view==='packing'?'布局':'折痕'}画布`} onClick={()=>onCamera({...camera,zoom:Math.max(.02,camera.zoom/1.25)})}>−</button><button title="滚轮围绕鼠标缩放；空格或中键拖动平移；Home 适合纸张" onClick={()=>onCamera({x:0,y:0,zoom:1})}>{Math.round(camera.zoom*100)}%</button><button aria-label={`放大${view==='tree'?'树形':view==='packing'?'布局':'折痕'}画布`} onClick={()=>onCamera({...camera,zoom:Math.min(200,camera.zoom*1.25)})}>+</button></div>
  {menu&&createPortal(<div ref={menuRef} role="menu" className="design-context-menu" style={{left:menu.x,top:menu.y}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setMenu(null);svg.current?.focus();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement);items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}}}>
   {menu.node!==undefined&&<button role="menuitem" onClick={()=>{props.onRename('node');setMenu(null);}}>重命名节点 <kbd>F2</kbd></button>}
   {menu.edge!==undefined&&<><button role="menuitem" onClick={()=>{props.onRename('edge');setMenu(null);}}>编辑分支长度</button><button role="menuitem" onClick={()=>{props.onSplit(menu.edge!);setMenu(null);}}>插入中间节点</button></>}
   {selection.nodes.length>0&&<button role="menuitem" onClick={()=>{props.onDelete();setMenu(null);}}>删除所选叶节点 <kbd>Delete</kbd></button>}
   <button role="menuitem" onClick={()=>{onCamera({x:0,y:0,zoom:1});setMenu(null);}}>适合纸张 <kbd>Home</kbd></button><button role="menuitem" onClick={()=>{props.onSelection({nodes:[],edges:[]});setMenu(null);}}>取消选择 <kbd>Esc</kbd></button>
  </div>,document.body)}
 </div>;
}
