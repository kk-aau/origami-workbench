import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {tessGeometryError,type TessGraph,type XY} from '../app/tessellation';
import {simpleTile} from '../app/tileAssembly';
import {fitGeometryView,geometryDisplay,geometryFrame,geometryInsertIndex,geometryNumber,geometrySource,geometryTicks,geometryTickStep,snapGeometryPoint,zoomGeometryView,type GeometryView} from '../app/geometryEditor';
import {NumberField} from './Fields';
import AppDialog from './AppDialog';
import './geometryEditor.css';

export function TessDialog({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}){
 return <AppDialog title={title} onClose={onClose} size="workspace" className={`tess-dialog${className?' '+className:''}`} closeLabel="关闭镶嵌窗口" unwrapped>{children}</AppDialog>;
}
type Props={title:string;initial:XY[];edges?:[number,number][];mother?:TessGraph|null;seed?:boolean;min?:number;max?:number;faces?:number[][];strictConvex?:boolean;allowConcave?:boolean;pointDomain?:XY[];seedBoundary?:XY[];minPoints?:number;maxPoints?:number;validateGeometry?:(points:XY[])=>string;onApply:(points:XY[])=>void;onClose:()=>void;
 xLabel?:string;yLabel?:string;invertY?:boolean;editablePoints?:boolean;orderedPath?:'open'|'closed';onPreview?:(points:XY[])=>void;extraControls?:ReactNode;onReset?:()=>void;applyLabel?:string;pointsCommand?:{id:number;points:XY[]};
 previewGraph?:TessGraph|null;solvedPoints?:XY[];backgroundFaces?:{points:XY[];fill:string;status?:'keep'|'remove'}[];previewSummary?:ReactNode;className?:string;minimumLabelPixels?:number};
type Snapshot={points:XY[];selected:number};
type Drag={pointer:number;kind:'point'|'pan';index:number;start:XY;original:XY;view:GeometryView;inverse:DOMMatrix;snapshot:Snapshot;changed:boolean};

export default function TessellationEditor({title,initial,edges=[],mother,seed=false,min=seed?0:-100,max=seed?1:100,faces=[],strictConvex=false,allowConcave=false,pointDomain,seedBoundary,minPoints=4,maxPoints=36,validateGeometry,onApply,onClose,xLabel='点 X',yLabel='点 Y',invertY=false,editablePoints=false,orderedPath,onPreview,extraControls,onReset,applyLabel='保存几何修改',pointsCommand,previewGraph,solvedPoints,backgroundFaces=[],previewSummary,className,minimumLabelPixels}:Props){
 const [points,setPoints]=useState<XY[]>(()=>structuredClone(initial)),[selected,setSelected]=useState(0),[error,setError]=useState('');
 const [grid,setGrid]=useState(true),[snap,setSnap]=useState(false),[panMode,setPanMode]=useState(false),[aspect,setAspect]=useState(1.5),[gridStep,setGridStep]=useState<number|null>(null),[plotHeight,setPlotHeight]=useState(400);
 const [past,setPast]=useState<Snapshot[]>([]),[future,setFuture]=useState<Snapshot[]>([]);
 const coordinates=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),container=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null);
 const square=seed&&!pointDomain;
 const all=useMemo(()=>[...initial,...(mother?.vertices_coords??[]),...(pointDomain??[]),...(previewGraph?.vertices_coords??[]),...backgroundFaces.flatMap(face=>face.points),...(square?[[0,0],[1,1]] as XY[]:[])],[initial,mother,pointDomain,previewGraph,backgroundFaces,square]);
 const frame=useRef(geometryFrame(all)).current;
 const [view,setView]=useState<GeometryView>(()=>fitGeometryView(all,frame,1.5,invertY));
 const step=gridStep??geometryTickStep(view.span*frame.unit);
 const display=(p:XY)=>geometryDisplay(p,frame,invertY),source=(p:XY)=>geometrySource(p,frame,invertY);
 const width=view.span*aspect,left=view.center[0]-width/2,top=view.center[1]-view.span/2,bottom=top+view.span,right=left+width;
 const corners=[source([left,top]),source([right,bottom])];
 const xTicks=geometryTicks(Math.min(corners[0][0],corners[1][0]),Math.max(corners[0][0],corners[1][0]),step);
 const yTicks=geometryTicks(Math.min(corners[0][1],corners[1][1]),Math.max(corners[0][1],corners[1][1]),step);
 const labelPixels=typeof minimumLabelPixels==='number'&&Number.isFinite(minimumLabelPixels)&&minimumLabelPixels>0?minimumLabelPixels:0;
 const font=view.span*Math.max(11,labelPixels)/Math.max(120,plotHeight),radius=view.span*5/Math.max(120,plotHeight);
 const activeEdges:[number,number][]=orderedPath?points.flatMap((_,i)=>i<points.length-1?[[i,i+1] as [number,number]]:orderedPath==='closed'?[[i,0] as [number,number]]:[]):edges;
 const activeFaces=orderedPath==='closed'?[points.map((_,i)=>i)]:faces;
 const current=useRef<Snapshot>({points,selected});current.current={points,selected};
 const preview=useRef(onPreview);preview.current=onPreview;
 const initialAspectFit=useRef(false),viewAspect=useRef(1.5),commandId=useRef<number|undefined>(undefined);
 useEffect(()=>{const el=container.current;if(!el)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect,ratio=r.width/Math.max(1,r.height);if(ratio>0){setPlotHeight(r.height);setAspect(ratio);if(!initialAspectFit.current){initialAspectFit.current=true;setView(fitGeometryView(all,frame,ratio,invertY));}else if(ratio<viewAspect.current){const factor=viewAspect.current/ratio;setView(old=>({...old,span:old.span*factor}));}viewAspect.current=ratio;}});observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{preview.current?.(structuredClone(points));},[points]);
 const checkpoint=(before=current.current)=>{const snapshot=structuredClone(before);setPast(p=>[...p.slice(-99),snapshot]);setFuture([]);};
 const update=(next:XY[],index=selected,record=true)=>{if(record)checkpoint();const nextSelected=Math.max(0,Math.min(next.length-1,index));current.current={points:next,selected:nextSelected};setPoints(next);setSelected(nextSelected);setError('');};
 useEffect(()=>{if(pointsCommand&&pointsCommand.id!==commandId.current){commandId.current=pointsCommand.id;update(structuredClone(pointsCommand.points),0);}},[pointsCommand?.id]);
 const problem=validateGeometry?validateGeometry(points):allowConcave?(tessGeometryError(points,min,max,[])||(!activeFaces.every(face=>simpleTile(face.map(i=>points[i])))?'拼块轮廓须为无自交的简单多边形。':'')):tessGeometryError(points,min,max,activeFaces,strictConvex);
 const move=(index:number,value:XY,record=true)=>update(current.current.points.map((p,i)=>i===index?value:p),index,record);
 const history=(redo=false)=>{const from=redo?future:past;if(!from.length)return;drag.current=null;const next=from[from.length-1],now=structuredClone(current.current);if(redo){setFuture(from.slice(0,-1));setPast(p=>[...p,now]);}else{setPast(from.slice(0,-1));setFuture(p=>[...p,now]);}current.current=structuredClone(next);setPoints(current.current.points);setSelected(next.selected);setError('');};
 const pointer=(x:number,y:number):XY=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return [0,0];const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());return [p.x,p.y];};
 const pickPoint=(x:number,y:number,index=-1):XY=>snapGeometryPoint(source(pointer(x,y)),{min,max,step,grid:snap,vertices:snap?[...current.current.points.filter((_,i)=>i!==index),...(mother?.vertices_coords??[])]:[],radius:frame.unit*view.span*.015});
 const removePoint=(index=selected)=>{if(!(seed||editablePoints)||points.length<=minPoints)return;update(points.filter((_,i)=>i!==index),Math.min(index,points.length-2));};
 const zoom=(factor:number,at:XY=view.center)=>setView(old=>zoomGeometryView(old,factor,at));
 const wheelRequest=useRef<(event:WheelEvent)=>void>(()=>{});
 wheelRequest.current=event=>{event.preventDefault();zoom(Math.exp(Math.max(-.5,Math.min(.5,event.deltaY*.001))),pointer(event.clientX,event.clientY));};
 useEffect(()=>{const element=svg.current;if(!element)return;const listener=(event:WheelEvent)=>wheelRequest.current(event);element.addEventListener('wheel',listener,{passive:false});return()=>element.removeEventListener('wheel',listener);},[]);
 const fit=()=>setView(fitGeometryView([...points,...(mother?.vertices_coords??[]),...(solvedPoints??[]),...(pointDomain??[]),...(previewGraph?.vertices_coords??[]),...backgroundFaces.flatMap(face=>face.points),...(square?[[0,0],[1,1]] as XY[]:[])],frame,aspect,invertY));
 const save=()=>{
  const invalid=coordinates.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]');
  if(invalid){invalid.focus();setError('请先修正坐标输入，再保存形状。');return;}
  if(problem){setError(problem);return;}
  if(seedBoundary){const area=seedBoundary.reduce((sum,a,i)=>{const b=seedBoundary[(i+1)%seedBoundary.length];return sum+a[0]*b[1]-a[1]*b[0];},0);if(seedBoundary.some((a,i)=>{const b=seedBoundary[(i+1)%seedBoundary.length];return points.some(p=>Math.sign(area)*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))< -1e-8);})){setError('种子必须在黑色边界内。');return;}}
  onApply(structuredClone(points));onClose();
 };
 const line=(a:XY,b:XY,key:string,color:string,dash?:string)=><line key={key} x1={display(a)[0]} y1={display(a)[1]} x2={display(b)[0]} y2={display(b)[1]} stroke={color} strokeWidth={1.3} strokeDasharray={dash} vectorEffect="non-scaling-stroke"/>;
 return <TessDialog title={title} onClose={onClose} className={className}><div className="geometry-editor" onKeyDown={e=>{if((e.target as HTMLElement).closest('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();history(e.key.toLowerCase()==='y'||e.shiftKey);}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removePoint();}}}>
  <div className="geometry-editor-toolbar"><button type="button" aria-pressed={!panMode} onClick={()=>setPanMode(false)}>移点</button><button type="button" aria-pressed={panMode} onClick={()=>setPanMode(true)}>平移视图</button><button type="button" aria-label="编辑器缩小" onClick={()=>zoom(1.25)}>−</button><button type="button" aria-label="编辑器放大" onClick={()=>zoom(.8)}>＋</button><button type="button" onClick={fit}>适合全部</button><button type="button" disabled={!past.length} onClick={()=>history()}>撤销</button><button type="button" disabled={!future.length} onClick={()=>history(true)}>重做</button><label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/>网格</label><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>吸附</label><label className="geometry-grid-step">间距<input aria-label="编辑网格间距" type="number" step="any" min="0" value={step} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0)setGridStep(n);}}/></label><button type="button" title="恢复随缩放变化的刻度" onClick={()=>setGridStep(null)}>自动刻度</button></div>
  <div className="geometry-editor-extra">{extraControls}</div>
  <div ref={container} className="geometry-editor-viewport"><svg ref={svg} tabIndex={0} className="tess-mesh-editor" data-editor-grid-step={step} data-editor-span={view.span} viewBox={[left,top,width,view.span].join(' ')} aria-label={title+'画布'} onPointerDown={e=>{
   if((e.button!==0&&e.button!==1)||drag.current)return;
   const inverse=svg.current?.getScreenCTM()?.inverse();if(!inverse)return;
   const start=pointer(e.clientX,e.clientY),snapshot=structuredClone(current.current),dragView=structuredClone(view);
   if(e.button===1||panMode||e.altKey){drag.current={pointer:e.pointerId,kind:'pan',index:-1,start,original:[0,0],view:dragView,inverse,snapshot,changed:false};}
   else{const value=(e.target as SVGElement).dataset.point;let index=value===undefined?null:Number(value);
    let inserted=false;
    if(index===null&&(seed||editablePoints)&&points.length<maxPoints){const value=pickPoint(e.clientX,e.clientY);index=seed?points.length:geometryInsertIndex(points,value,orderedPath==='closed');const next=[...points];next.splice(index,0,value);update(next,index);inserted=true;}
    else if(index!==null){current.current={...current.current,selected:index};setSelected(index);}
    if(index===null)return;
    drag.current={pointer:e.pointerId,kind:'point',index,start,original:[...current.current.points[index]],view:dragView,inverse,snapshot,changed:inserted};
   }
   e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;if(d.kind==='pan'){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.inverse);setView({...d.view,center:[d.view.center[0]+d.start[0]-p.x,d.view.center[1]+d.start[1]-p.y]});return;}let next=pickPoint(e.clientX,e.clientY,d.index);if(e.shiftKey){const delta=[next[0]-d.original[0],next[1]-d.original[1]];next=Math.abs(delta[0])>Math.abs(delta[1])?[next[0],d.original[1]]:[d.original[0],next[1]];}const previous=current.current.points[d.index];if(previous[0]===next[0]&&previous[1]===next[1])return;if(!d.changed){checkpoint(d.snapshot);d.changed=true;}move(d.index,next,false);}} onPointerUp={e=>{if(drag.current?.pointer===e.pointerId)drag.current=null;}} onPointerCancel={e=>{if(drag.current?.pointer===e.pointerId)drag.current=null;}} onLostPointerCapture={e=>{if(drag.current?.pointer===e.pointerId)drag.current=null;}} onContextMenu={e=>{e.preventDefault();const v=(e.target as SVGElement).dataset.point;if(v!==undefined)removePoint(Number(v));}}>
   <rect x={left} y={top} width={width} height={view.span} fill="var(--paper,#fff)"/>
   {grid&&<g className="geometry-grid" stroke="var(--line,#d9e1db)">{xTicks.map(x=>{const p=display([x,0]);return <line key={'x'+x} x1={p[0]} y1={top} x2={p[0]} y2={bottom} vectorEffect="non-scaling-stroke" strokeWidth={.6}/>;})}{yTicks.map(y=>{const p=display([0,y]);return <line key={'y'+y} x1={left} y1={p[1]} x2={right} y2={p[1]} vectorEffect="non-scaling-stroke" strokeWidth={.6}/>;})}</g>}
   {backgroundFaces.map((face,i)=><polygon key={'bg'+i} data-face-state={face.status} points={face.points.map(p=>display(p).join(',')).join(' ')} fill={face.fill} stroke="none"/>)}
   {square&&<polygon points={([[0,0],[1,0],[1,1],[0,1]] as XY[]).map(p=>display(p).join(',')).join(' ')} fill="none" stroke="#202124" strokeWidth={1.4} vectorEffect="non-scaling-stroke"/>}
   {seedBoundary&&<polygon points={seedBoundary.map(p=>display(p).join(',')).join(' ')} fill="none" stroke="#202124" strokeWidth={1.4} vectorEffect="non-scaling-stroke"/>}
   {mother?.edges_vertices.map(([a,b],i)=>line(mother.vertices_coords[a],mother.vertices_coords[b],'m'+i,'#38483f'))}
   {previewGraph?.edges_vertices.map(([a,b],i)=>line(previewGraph.vertices_coords[a],previewGraph.vertices_coords[b],'preview'+i,'#009eae'))}
   {activeEdges.filter(([a,b])=>points[a]&&points[b]).map(([a,b],i)=>line(points[a],points[b],'edge'+i,'#8b4bc0'))}
   {solvedPoints?.map((p,i)=>points[i]&&Math.hypot(points[i][0]-p[0],points[i][1]-p[1])>frame.unit*1e-8?<g key={'solve'+i}>{line(points[i],p,'delta'+i,'#009eae','3 3')}<circle data-solved-point={i} cx={display(p)[0]} cy={display(p)[1]} r={radius*.75} fill="#009eae"><title>{'实际解 '+(i+1)+'，偏移 '+Math.hypot(points[i][0]-p[0],points[i][1]-p[1]).toPrecision(4)}</title></circle></g>:null)}
   {points.map((p,i)=><g key={i}><circle data-point={i} cx={display(p)[0]} cy={display(p)[1]} r={selected===i?radius*1.25:radius} fill={problem?'#b3513c':selected===i?'#77419c':'#8b4bc0'} stroke="white" strokeWidth={1.2} vectorEffect="non-scaling-stroke"><title>{'点 '+(i+1)+' ('+p.join(', ')+')'}</title></circle><text x={display(p)[0]+radius*1.4} y={display(p)[1]-radius*.9} fontSize={font*(labelPixels?Math.max(.8,labelPixels/Math.max(11,labelPixels)):.8)} fill="#674181" pointerEvents="none">{i+1}</text></g>)}
   <g pointerEvents="none"><line x1={left} y1={bottom-font*1.65} x2={right} y2={bottom-font*1.65} stroke="#668476" vectorEffect="non-scaling-stroke"/><line x1={left+font*2.7} y1={top} x2={left+font*2.7} y2={bottom} stroke="#668476" vectorEffect="non-scaling-stroke"/>{xTicks.filter(x=>display([x,0])[0]>=left+font*3.1&&display([x,0])[0]<=right-font).map(x=><text key={'labelX'+x} x={display([x,0])[0]} y={bottom-font*.5} fontSize={font} textAnchor="middle" fill="#536b5d">{geometryNumber(x,step)}</text>)}{yTicks.filter(y=>display([0,y])[1]-font*.2>=top+font&&display([0,y])[1]-font*.2<=bottom-font*1.8).map(y=><text key={'labelY'+y} x={left+font*.3} y={display([0,y])[1]-font*.2} fontSize={font} fill="#536b5d">{geometryNumber(y,step)}</text>)}<text x={right-font*.7} y={top+font*1.3} fontSize={font} textAnchor="end" fill="#536b5d">{xLabel+' / '+yLabel}</text></g>
  </svg></div>
  <div className="geometry-editor-readout">{previewSummary??<span>{seed||editablePoints?'空白加点 · 右击删点 · ':''}拖动移点 · Shift 锁定水平／垂直 · 滚轮缩放 · Alt／中键平移</span>}<span>{'坐标单位 · 格距 '+geometryNumber(step,step)}</span></div>
  <div className="tess-editor-coordinates" ref={coordinates}><label>选中点 <select aria-label="选中点" disabled={!points.length} value={selected} onChange={e=>setSelected(Number(e.target.value))}>{points.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label><NumberField key={'x-'+selected} label={xLabel} value={points[selected]?.[0]??0} min={min} max={max} step={step/10} preservePrecision disabled={!points[selected]} onChange={x=>move(selected,[x,points[selected][1]])}/><NumberField key={'y-'+selected} label={yLabel} value={points[selected]?.[1]??0} min={min} max={max} step={step/10} preservePrecision disabled={!points[selected]} onChange={y=>move(selected,[points[selected][0],y])}/>{(seed||editablePoints)&&<button type="button" disabled={points.length<=minPoints} onClick={()=>removePoint()}>删除选中点</button>}{solvedPoints?.[selected]&&<output className="geometry-target-distance">{'目标到实际解：'+Math.hypot(points[selected][0]-solvedPoints[selected][0],points[selected][1]-solvedPoints[selected][1]).toPrecision(4)}</output>}</div>
  <p className="tess-editor-error" role="alert">{error||problem}</p>
  <footer><span>{points.length+' 点'+(seed||editablePoints?' / '+minPoints+'–'+maxPoints:'')}</span><button type="button" className="outline" onClick={()=>{if(onReset)onReset();else update(structuredClone(initial),0);setError('');}}>还原本次修改</button><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={!!problem} onClick={save}>{applyLabel}</button></footer>
 </div></TessDialog>;
}
