import {useEffect,useMemo,useRef,useState} from 'react';
import type {FlatFoldResult,FoldGraph,Point} from '../core/types';
import {pointBounds} from '../core/pointBounds';
import {createTessFlatClient} from '../app/tessellationFlatClient';
import type {TessFlatFrame,TessFlatInput} from '../app/tessellationFlat';
import {startFlatLayerReanalysis,type FlatFoldTask} from '../core/workerClient';
import {flatPresentation} from '../app/flatPresentation';
import {hasCompleteModelSurface,modelRenderMode} from '../app/modelRenderMode';
import type {ModelColors} from '../app/modelColors';
import type {ModelViewState} from '../app/modelViewState';
import ModelRegionSurface from './ModelRegionSurface';
import ModelExactSurface from './ModelExactSurface';
import {useModelRegionTask} from './useModelRegions';
import {flatComputationStatus} from '../app/flatComputationStatus';
import FlatComputationStatus from './FlatComputationStatus';
import FlagstoneFaceGroupsPanel from './FlagstoneFaceGroupsPanel';
import {mapVisibleFlatTileDecorations,type FlatTileDecorationSource} from '../app/flatTileDecorations';
import {exactVisibleTileRegions} from '../app/exactVisibleTileRegions';
import {modelProjection} from '../app/modelProjection';
import FlatTileDecorationLayer from './FlatTileDecorationLayer';
import {primalDualTopFaceConstraints} from '../app/primalDualVisibleFace';
import {primalDualFaceupSatisfied} from '../app/primalDualFaceup';

export default function TessFlatPane({input,parameterKey,message,view,paused,retry,fitToken,flagstone=false,visibleTopFace,faceupFace,tileDecoration}:{view:ModelViewState;paused:boolean;retry:number;fitToken:number;input:TessFlatInput|null;parameterKey:string;message:string;flagstone?:boolean;visibleTopFace?:number;faceupFace?:number;tileDecoration?:FlatTileDecorationSource}){
  const [frame,setFrame]=useState<TessFlatFrame|null>(null),[layers,setLayers]=useState<{frame:TessFlatFrame;face:number|undefined;seed:number|undefined;result:FlatFoldResult}|null>(null),[layerBusy,setLayerBusy]=useState(false);
  const [showGroups,setShowGroups]=useState(false);
  const back=view.side==='back',xray=view.xray,rotation=view.rotation;
  const client=useRef<ReturnType<typeof createTessFlatClient>|null>(null);
  const sideRef=useRef(view.side);sideRef.current=view.side;
  const confirmed=useRef<{topology:string;result:FlatFoldResult}|null>(null);
  const topology=useMemo(()=>input?JSON.stringify([input.graph.faces_vertices,input.graph.edges_vertices,input.graph.edges_assignment,input.startingFace,visibleTopFace,faceupFace]):'',[input,visibleTopFace,faceupFace]);
  useEffect(()=>{
    if(paused)return;
    const task=createTessFlatClient(setFrame,()=>sideRef.current);client.current=task;
    return()=>{task.dispose();client.current=null;};
  },[paused]);
  useEffect(()=>{if(input&&!paused)client.current?.update(input);},[input,paused,retry,back]);
  useEffect(()=>{
    setLayerBusy(false);
    if(paused||!frame||frame.input!==input||frame.input.key!==parameterKey||!input.checked||frame.result.geometry.status!=='ready'||visibleTopFace===undefined&&faceupFace===undefined&&frame.result.layers.status==='solved')return;
    const constraints=primalDualTopFaceConstraints(visibleTopFace,input.graph.faces_vertices?.length??0);
    if(constraints===null)return;
    let active=true,job:FlatFoldTask|undefined;
    // Only layer search waits for a settled input. Geometry continues in its warm worker.
    const timer=setTimeout(()=>{
      setLayerBusy(true);job=startFlatLayerReanalysis(frame.result,{timeoutMs:Infinity,constraints});
      job.promise.then(solved=>{if(active){
        const valid=faceupFace===undefined||solved.layers.status!=='solved'||primalDualFaceupSatisfied(solved,input.graph,faceupFace);
        const result=valid?solved:{...solved,layers:{status:'no-solution' as const,message:'当前层序与 FaceupFace 的局部上下传播不一致。'}};
        if(visibleTopFace===undefined&&result.layers.status==='solved')client.current?.rememberLayers(result);
        setLayers({frame,face:visibleTopFace,seed:faceupFace,result});setLayerBusy(false);
      }});
    },160);
    return()=>{active=false;clearTimeout(timer);job?.cancel();};
  },[frame,input,parameterKey,paused,visibleTopFace,faceupFace]);
  const current=!!input&&frame?.input===input&&input.key===parameterKey;
  const solved=current&&layers?.frame===frame&&layers.face===visibleTopFace&&layers.seed===faceupFace?layers.result:null;
  const result=(visibleTopFace!==undefined||faceupFace!==undefined)&&frame&&!solved?{...frame.result,layers:{status:'unknown' as const,message:'正在验证所选局部面向与可见面。'}}:frame?.result.layers.status==='solved'&&visibleTopFace===undefined&&faceupFace===undefined?frame.result:solved??frame?.result??null;
  if(confirmed.current?.topology!==topology)confirmed.current=null;
  if(result?.layers.status==='solved'&&result.geometry.graph&&JSON.stringify([result.geometry.graph.faces_vertices,result.geometry.graph.edges_vertices,result.geometry.graph.edges_assignment,input?.startingFace,visibleTopFace,faceupFace])===topology)confirmed.current={topology,result};
  const displayResult=result?.layers.status==='solved'||result?.layers.status==='no-solution'?result:confirmed.current?.result??result;
  const holding=displayResult!==result;
  const status=paused?'已暂停':message?'参数需调整':!input?'等待有效构造':!current?'正在更新几何':result?.geometry.status!=='ready'?'当前参数无法平折':layerBusy?'几何已更新 · 求解层序':result?.layers.status==='solved'?'层序已解':result?.layers.status==='no-solution'?'当前山谷无层序解':result?.layers.status==='timeout'?'几何已更新 · 层序超时':result?.layers.status==='unsupported'?'层序计算受限':result?.layers.status==='error'?'层序计算失败':'实时几何 · 层序待确认';
  const detail=message||(!current?'显示上一帧，正在计算当前参数。':result?.geometry.status!=='ready'?result?.geometry.message:result?.layers.message)||'调整镶嵌参数，平折画面自动更新。';
  return <section className="tess-flat-pane canvas-fold-overlay" aria-label="镶嵌平折预览" data-tess-flat-key={frame?.input.key??''} data-current={current&&!paused}>
    <header><strong>平折</strong><span title={detail}>{!paused&&current&&result?.layers.status==='solved'?(layerBusy?'实时更新 · 层序已验证':'层序已解'):status}{holding?' · 保留上次已验证图像':result?.layers.status!=='solved'?' · 仅显示几何线框':''}</span>{flagstone&&<button aria-label="铺石层序面组" aria-pressed={showGroups} onClick={()=>setShowGroups(value=>!value)}>面组</button>}</header>
    <TessFlatDrawing result={displayResult} surface={displayResult===frame?.result?frame?.surface:undefined} paused={paused} back={back} xray={xray} fit={fitToken} rotation={rotation} colors={view.colors!} cpGraph={input?.graph} tileDecoration={current&&!paused&&!holding&&frame?.input===input&&input?.checked?tileDecoration:undefined}/>
    {flagstone&&showGroups&&<aside className="tess-flat-face-groups"><FlagstoneFaceGroupsPanel result={current&&!paused&&result?.layers.status==='solved'?result:null}/></aside>}
  </section>;
}

type Camera={x:number;y:number;width:number;height:number};
export function TessFlatDrawing({result:incoming,surface,paused=false,back,xray,fit,rotation,colors,cpGraph,tileDecoration}:{result:FlatFoldResult|null;surface?:TessFlatFrame['surface'];paused?:boolean;back:boolean;xray:boolean;fit:number;rotation:number;colors:ModelColors;cpGraph?:FoldGraph;tileDecoration?:FlatTileDecorationSource}){
  const candidate=useMemo(()=>incoming?.geometry.status==='ready'?flatPresentation(incoming,back?'back':'front',rotation):null,[incoming,back,rotation]);
  const side=back?'back':'front',needsRegions=!!candidate&&!xray&&!candidate.hasOrder&&incoming?.layers.status==='solved';
  const supplied=surface?.side===side?surface.reply:null;
  // The warm parameter-preview worker may supply a coarse surface. Let the
  // shared worker finish its coverage instead of publishing that coarse image.
  const accepted=useMemo(()=>supplied?.status==='complete'&&!hasCompleteModelSurface(supplied)?null:supplied,[supplied]);
  const needsDecorationRegions=!!tileDecoration?.options.overlayFoldedForm&&!xray&&incoming?.layers.status==='solved';
  const fallback=useModelRegionTask(incoming,side,!paused&&(needsRegions||needsDecorationRegions)&&!accepted),nextReply=accepted??fallback.reply;
  const nextSurface=useMemo(()=>nextReply?.status==='complete'&&hasCompleteModelSurface(nextReply)?nextReply:null,[nextReply]);
  // A terminal failure must show its reason, not keep waiting for a reply that
  // has already arrived or retain an older paper image as the current result.
  const pending=!paused&&needsRegions&&!nextReply;
  const topology=useMemo(()=>{const graph=incoming?.geometry.graph;return JSON.stringify([incoming?.geometry.faces,graph?.edges_vertices,graph?.edges_assignment,incoming?.geometry.startingFace]);},[incoming]);
  const nextScene={result:incoming,drawing:candidate,reply:nextReply,back,xray,rotation,topology};
  const complete=useRef<typeof nextScene|null>(null);
  if(candidate&&incoming?.layers.status==='solved'&&(candidate.hasOrder||nextSurface)&&!xray)complete.current=nextScene;
  const cached=complete.current;
  const scene=(pending||paused)&&cached&&cached.back===back&&cached.xray===xray&&cached.rotation===rotation&&cached.topology===topology?cached:nextScene;
  const {result,drawing,reply}=scene;
  const regionSurface=useMemo(()=>reply?.status==='complete'&&hasCompleteModelSurface(reply)?reply:null,[reply]);
  const mode=result&&drawing?modelRenderMode(result,drawing.hasOrder,{xray,regionsReady:!!regionSurface}):'wire';
  const opaque=mode==='ordered'||mode==='regions';
  const status=paused?{active:false,title:'计算已暂停',detail:'已停止纸面验证；点击“继续”可重新计算。',tone:'warning' as const}:flatComputationStatus({result:incoming,busy:false,localRegions:needsRegions,regionReply:nextReply,xray,paperReady:opaque});
  if(pending&&scene!==nextScene)status.detail='正在验证当前纸面；暂时保留上次已确认图像，可以随时停止。';
  const mapping=useMemo(()=>tileDecoration?.options.overlayFoldedForm&&cpGraph&&result&&result===incoming&&opaque&&regionSurface?
    mapVisibleFlatTileDecorations(tileDecoration,cpGraph,result,regionSurface.exact?exactVisibleTileRegions(regionSurface.exact):regionSurface.regions):null,[tileDecoration,cpGraph,result,incoming,opaque,regionSurface]);
  const projection=useMemo(()=>result?modelProjection(result.geometry.vertices,back,rotation):null,[result,back,rotation]);
  const decorationState=!tileDecoration?.options.overlayFoldedForm?'off':mapping?'verified':nextReply?'unavailable':'checking';
  const fitted=useMemo<Camera>(()=>{
    if(!drawing?.vertices.length)return {x:-10,y:-10,width:220,height:220};
    const {minX:x,minY:y,maxX,maxY}=pointBounds(drawing.vertices);
    const width=Math.max(1,maxX-x),height=Math.max(1,maxY-y),unit=Math.max(width,height);
    return {x:x+width/2-unit*2.25,y:y+height/2-unit*1.5,width:unit*3,height:unit*3};
  },[drawing]);
  const [camera,setCamera]=useState<Camera|null>(null);
  const view=camera??fitted,viewRef=useRef(view),svg=useRef<SVGSVGElement>(null);
  viewRef.current=view;
  // Fit once, then retain the user's camera while parameters and statuses change.
  useEffect(()=>{if(drawing)setCamera(old=>old??fitted);},[drawing,fitted]);
  useEffect(()=>{if(drawing)setCamera(fitted);},[fit]);
  const drag=useRef<{id:number;point:Point;camera:Camera;matrix:DOMMatrix}|null>(null);
  useEffect(()=>{
    const el=svg.current;if(!el)return;
    const wheel=(e:WheelEvent)=>{
      e.preventDefault();if(drag.current)return;const m=el.getScreenCTM();if(!m)return;
      const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),old=viewRef.current;
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?240:1),factor=Math.exp(Math.max(-1,Math.min(1,delta*.002)));
      const width=Math.max(.1,Math.min(100000,old.width*factor)),ratio=width/old.width;
      const next={x:p.x+(old.x-p.x)*ratio,y:p.y+(old.y-p.y)*ratio,width,height:old.height*ratio};viewRef.current=next;setCamera(next);
    };
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[]);
  return <div className="tess-flat-drawing" data-model-render-mode={mode} data-surface-status={paused?'paused':pending?'pending':needsRegions&&!nextSurface?'unconfirmed':opaque?'verified':'geometry'} data-flat-decoration-state={decorationState}>{needsRegions&&<FlatComputationStatus status={status} onCancel={pending?fallback.cancel:undefined}/>}<svg ref={svg} aria-label="镶嵌实时平折画面" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
    onPointerDown={e=>{if(e.button!==0&&e.button!==1)return;const matrix=e.currentTarget.getScreenCTM()?.inverse();if(!matrix)return;e.preventDefault();drag.current={id:e.pointerId,point:[e.clientX,e.clientY],camera:viewRef.current,matrix};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.point[0],dy=e.clientY-d.point[1];const next={...d.camera,x:d.camera.x-d.matrix.a*dx-d.matrix.c*dy,y:d.camera.y-d.matrix.b*dx-d.matrix.d*dy};viewRef.current=next;setCamera(next);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onContextMenu={e=>e.preventDefault()}>
    <title>{needsRegions?`${status.title}。${status.detail}`:opaque?'当前几何与遮挡均已验证。':'几何线框；层序尚未验证。'}</title>
    {drawing&&result&&drawing.order.map(i=><polygon key={i} data-tess-flat-face={i} points={result.geometry.faces[i].map(v=>drawing.vertices[v].join(',')).join(' ')} data-material={drawing.frontMaterial[i]?'front':'back'} fill={mode==='wire'||mode==='regions'?'none':drawing.frontMaterial[i]?colors.front:colors.back} fillOpacity={mode==='xray'?.25:1} stroke={mode==='regions'?'none':colors.line} strokeWidth=".7" vectorEffect="non-scaling-stroke"/>)}
    {drawing&&result&&mode==='regions'&&regionSurface?.exact&&<ModelExactSurface result={result} surface={regionSurface.exact} side={side} rotation={rotation} colors={colors} face={null} onSelect={()=>{}} interactive={false}/>}{drawing&&result&&mode==='regions'&&regionSurface&&!regionSurface.exact&&<ModelRegionSurface result={result} regions={regionSurface.regions} boundaries={regionSurface.boundaries} side={side} rotation={rotation} colors={colors} face={null} onSelect={()=>{}} interactive={false}/>}
    {drawing&&result&&mapping&&projection&&tileDecoration&&<FlatTileDecorationLayer source={tileDecoration} mapping={mapping} foldedVertices={result.geometry.vertices} project={projection.project}/>}
  </svg>{!drawing&&<div className="tess-flat-empty">{result?.geometry.message??'正在计算平折几何…'}</div>}</div>;
}

