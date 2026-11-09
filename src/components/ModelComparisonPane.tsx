import IndexedFaceShape from './IndexedFaceShape';
import {Fragment,useEffect,useMemo,useRef,useState} from 'react';
import type {FlatFoldConflict,FlatFoldResult,Point} from '../core/types';
import type {ModelViewPane} from '../app/modelViewPanes';
import type {ModelCamera} from '../app/modelViewState';
import type {ModelColors} from '../app/modelColors';
import {flatPresentation} from '../app/flatPresentation';
import {fittedModelCamera} from '../app/modelCamera';
import {useModelShadows} from './useModelShadows';
import ModelShadows from './ModelShadows';
import ModelRegionSurface from './ModelRegionSurface';
import ModelExactSurface from './ModelExactSurface';
import {useModelRegionTask} from './useModelRegions';
import FlatComputationStatus from './FlatComputationStatus';
import FlatConflictDetails,{FlatConflictOverlay,conflictFaces,conflictPoints,conflictView} from './FlatConflictDetails';
import type {FlatComputationProgress} from '../core/flatComputationProgress';
import {flatComputationStatus,type FlatProgressStage} from '../app/flatComputationStatus';
import {modelWireframe} from '../app/modelWireframe';
import {modelRenderMode,hasCompleteModelSurface} from '../app/modelRenderMode';
import ModelWireLines from './ModelWireLines';
import FoldedVertexOverlay,{type ModelVertexControls} from './FoldedVertexOverlay';

interface Props {
 result:FlatFoldResult;pane:ModelViewPane;rotation:number;colors:ModelColors;shadows:boolean;stale:boolean;antiAlias?:boolean;displayNumbers?:boolean;wireMode?:boolean;
 camera?:ModelCamera;onCamera:(camera:ModelCamera)=>void;face:number|null;setFace:(face:number)=>void;
 moving:boolean;editing:boolean;vertexControls:ModelVertexControls;onHint:(p:Point|null,dragging:boolean)=>void;
 busy?:boolean;progressStage?:FlatProgressStage;computationProgress?:FlatComputationProgress|null;startedAt?:number;onCancel?:()=>void;fitToken?:number;
 conflicts?:FlatFoldConflict[];conflictIndex?:number;onConflictSelect?:(index:number)=>void;
}
export default function ModelComparisonPane({result,pane,rotation,colors,shadows,stale,antiAlias=true,displayNumbers=false,camera,onCamera,face,setFace,moving,editing,vertexControls,onHint,wireMode=false,busy=false,progressStage,computationProgress,startedAt,onCancel,fitToken=0,conflicts=[],conflictIndex=0,onConflictSelect}:Props){
 const display=useMemo(()=>flatPresentation(result,pane.side,rotation),[result,pane.side,rotation]);
 const localRegions=!busy&&!wireMode&&!pane.xray&&!editing&&!stale&&!display.hasOrder&&result.layers.status==='solved';
 const regionTask=useModelRegionTask(result,pane.side,localRegions,shadows),regionReply=regionTask.reply;
 const regionSurface=useMemo(()=>localRegions&&regionReply?.status==='complete'&&hasCompleteModelSurface(regionReply)?regionReply:null,[localRegions,regionReply]);
 const renderMode=modelRenderMode(result,display.hasOrder,{wire:wireMode,xray:pane.xray,regionsReady:!!regionSurface});
 const paperReady=renderMode==='ordered'||renderMode==='regions';
 const computationStatus=useMemo(()=>flatComputationStatus({result,busy,stale,stage:progressStage,localRegions,regionReply,wire:wireMode,xray:pane.xray,paperReady}),[result,busy,stale,progressStage,localRegions,regionReply,wireMode,pane.xray,paperReady]);
 const wire=useMemo(()=>renderMode==='wire'?modelWireframe(result,pane.side,rotation):null,[result,pane.side,rotation,renderMode]);
 const fitted=useMemo(()=>fittedModelCamera(display.vertices,rotation),[display,rotation]);
 const committed=camera?.rotation===rotation?camera:fitted;
 const [draft,setDraft]=useState<ModelCamera|null>(null),svg=useRef<SVGSVGElement>(null);
 const view=draft??committed,viewRef=useRef(view);viewRef.current=view;
 const selectedConflict=!busy&&!stale&&result.layers.status==='no-solution'?conflicts[conflictIndex]:undefined;
 const faceCenter=(index:number):Point=>{const face=result.geometry.faces[index];const points=face.map(v=>display.vertices[v]);return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];};
 const publish=useRef(onCamera);publish.current=onCamera;
 const suppress=useRef(false),vertexDragging=useRef(false);
 const drag=useRef<{id:number;x:number;y:number;matrix:DOMMatrix;view:ModelCamera}|null>(null);
 const cancel=()=>{drag.current=null;setDraft(null);suppress.current=true;};
 function locateConflict(){
  if(!selectedConflict)return;
  const focused=conflictView(conflictPoints(selectedConflict,result,display.vertices),view,Math.max(fitted.width,fitted.height));if(!focused)return;
  cancel();publish.current({...view,...focused});const first=conflictFaces(selectedConflict,result)[0];if(first!==undefined)setFace(first);
 }
 useEffect(()=>{cancel();},[result,rotation,moving,editing]);
 const previousFit=useRef(fitToken);
 useEffect(()=>{if(previousFit.current===fitToken)return;previousFit.current=fitToken;cancel();publish.current(fitted);},[fitToken,fitted]);
 useEffect(()=>{
  const el=svg.current;if(!el)return;
  const wheel=(e:WheelEvent)=>{
   e.preventDefault();if(drag.current||vertexDragging.current)return;
   const matrix=el.getScreenCTM();if(!matrix)return;
   const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),v=viewRef.current;
   const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?240:1),width=Math.max(fitted.width/256,Math.min(fitted.width*4,v.width*Math.exp(Math.max(-2,Math.min(2,dy*.002))))),factor=width/v.width;
   const next={...v,x:point.x+(v.x-point.x)*factor,y:point.y+(v.y-point.y)*factor,width,height:v.height*factor};viewRef.current=next;publish.current(next);
  };
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();cancel();}};
  el.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',key);window.addEventListener('blur',cancel);
  return()=>{el.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);};
 },[fitted.width]);
 const enabled=!wireMode&&shadows&&!pane.xray&&display.hasOrder&&!stale&&!editing;
 const reply=useModelShadows(result,pane.side,rotation,enabled);
 const groups=useMemo(()=>{
  const map=new Map<number,import('../app/modelShadowBoundaries').ModelShadowBoundary[]>();
  if(reply?.status==='complete')for(const edge of reply.analysis.boundaries){const list=map.get(edge.lowerFace)??[];list.push(edge);map.set(edge.lowerFace,list);}
  return map;
 },[reply]);
 return <section data-model-pane={pane.key} style={{minWidth:0,minHeight:0,display:'flex',flexDirection:'column',border:'1px solid #b9c8b8',background:'#fffefb'}}>
  <header style={{display:'flex',flexWrap:'wrap',flexShrink:0,alignItems:'center',gap:8,padding:'4px 8px',fontSize:11,borderBottom:'1px solid #dce3d8'}}><strong style={{whiteSpace:'nowrap'}}>{pane.label}</strong><span style={{flex:1}}/>{enabled&&<span role="status">{!reply?'阴影计算中…':reply.status==='complete'?`阴影 ${reply.analysis.boundaries.length} 处`:reply.message}</span>}<button onClick={()=>{cancel();publish.current(fitted);}}>复位此视图</button></header>
  <div className="model-comparison-status"><FlatComputationStatus status={computationStatus} progress={computationProgress} startedAt={startedAt} elapsedMs={result.computationTimeMs} onCancel={busy?onCancel:localRegions?regionTask.cancel:undefined}>{selectedConflict&&<FlatConflictDetails conflicts={conflicts} index={conflictIndex} result={result} onSelect={index=>onConflictSelect?.(index)} onLocate={locateConflict}/>}</FlatComputationStatus></div>
  <svg ref={svg} data-model-render-mode={renderMode} shapeRendering={antiAlias?'geometricPrecision':'crispEdges'} tabIndex={0} aria-label={`组合视图 ${pane.label}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} style={{width:'100%',height:'100%',flex:1,minHeight:0,touchAction:'none',userSelect:'none',cursor:moving?'grab':undefined}}
   onPointerDown={e=>{suppress.current=false;e.currentTarget.focus({preventScroll:true});if(e.button!==1&&!(e.button===0&&moving))return;e.preventDefault();const matrix=e.currentTarget.getScreenCTM();if(!matrix)return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,matrix:matrix.inverse(),view:viewRef.current};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;if((e.buttons&2)||!(e.buttons&5)){cancel();return;}const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>2)suppress.current=true;const next={...d.view,x:d.view.x-d.matrix.a*dx-d.matrix.c*dy,y:d.view.y-d.matrix.b*dx-d.matrix.d*dy};viewRef.current=next;setDraft(next);}}
   onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;const next=viewRef.current;drag.current=null;setDraft(null);publish.current(next);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={cancel} onLostPointerCapture={cancel} onContextMenu={e=>{e.preventDefault();cancel();}} onAuxClick={e=>e.preventDefault()}>
   {!regionSurface?.exact&&display.order.map(i=><Fragment key={i}><IndexedFaceShape data-face-id={i} outer={result.geometry.faces[i]} holes={result.geometry.graph?.faces_holes?.[i]} coords={display.vertices} fill={renderMode==='wire'||renderMode==='regions'?'transparent':face===i?'#d2b57b':display.frontMaterial[i]?colors.front:colors.back} fillOpacity={renderMode==='xray'?.25:1} stroke={renderMode==='wire'?(face===i?'#986621':'none'):renderMode==='regions'?'none':colors.line} strokeWidth={.35} role="button" tabIndex={0} aria-label={`选择折叠面 F${i+1}`} onClick={()=>{if(!editing&&!moving&&!suppress.current)setFace(i);}} onKeyDown={e=>{if(!editing&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setFace(i);}}}/>{displayNumbers&&!wireMode&&<text x={faceCenter(i)[0]} y={faceCenter(i)[1]} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(view.width/80,1.5)} fill="#294536" stroke="#fffefb" strokeWidth={Math.max(view.width/360,.25)} paintOrder="stroke" pointerEvents="none">F{i+1}</text>}{groups.has(i)&&<ModelShadows boundaries={groups.get(i)!} holes={(result.geometry.graph?.faces_holes?.[i]??[]).map(r=>r.map(v=>display.vertices[v]))} polygon={result.geometry.faces[i].map(v=>display.vertices[v])}/>}</Fragment>)}
   {regionSurface?.exact&&<ModelExactSurface displayNumbers={displayNumbers} labelFontSize={Math.max(view.width/80,1.5)} result={result} surface={regionSurface.exact} side={pane.side} rotation={rotation} colors={colors} shadows={shadows} face={face} interactive={!moving} onSelect={id=>{if(!suppress.current)setFace(id);}}/>}
   {regionSurface&&!regionSurface.exact&&<ModelRegionSurface result={result} regions={regionSurface.regions} boundaries={regionSurface.boundaries} shadows={shadows?regionSurface.shadows:undefined} side={pane.side} rotation={rotation} colors={colors} face={face} interactive={!moving} onSelect={id=>{if(!suppress.current)setFace(id);}}/>}
   {wire&&<ModelWireLines wire={wire}/>}
   <FlatConflictOverlay conflict={selectedConflict} result={result} coords={display.vertices} viewWidth={view.width}/>
   {editing&&<FoldedVertexOverlay result={result} back={pane.side==='back'} rotation={rotation} radius={view.width/160} {...vertexControls} onHint={(p,dragging)=>{vertexDragging.current=dragging;onHint(p,dragging);}}/>}
  </svg>
 </section>;
}
