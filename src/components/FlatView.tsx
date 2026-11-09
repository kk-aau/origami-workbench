import IndexedFaceShape from './IndexedFaceShape';
import {Fragment,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import ModelShadows from './ModelShadows';
import ModelRegionSurface from './ModelRegionSurface';
import ModelExactSurface from './ModelExactSurface';
import {useModelRegionTask,modelRegionStatus} from './useModelRegions';
import FlatComputationStatus,{formatFlatComputationTime} from './FlatComputationStatus';
import FlatConflictDetails,{FlatConflictOverlay,conflictFaces,conflictPoints,conflictView,sourceConflictResult,visibleFlatConflicts} from './FlatConflictDetails';
import type {FlatComputationProgress} from '../core/flatComputationProgress';
import {flatComputationStatus,type FlatProgressStage} from '../app/flatComputationStatus';
import {modelWireframe} from '../app/modelWireframe';
import {modelRenderMode,hasCompleteModelSurface} from '../app/modelRenderMode';
import ModelWireLines from './ModelWireLines';
import ModelComparisonPane from './ModelComparisonPane';
import {modelViewPanes} from '../app/modelViewPanes';
import {useModelShadows} from './useModelShadows';
import type {Doc,FoldGraph,FlatFoldResult,Point,FoldingConstraint,FoldingConstraintSide} from '../core/types';
import {pointBounds} from '../core/pointBounds';
import {getPaperBounds,paperPath,paperFillRule} from '../app/paper';
import {segmentDisplayColor} from '../app/customColor';
import {flatPresentation,type FlatSide} from '../app/flatPresentation';
import FoldedVertexOverlay,{type ModelVertexControls,type ModelVertexEditMode} from './FoldedVertexOverlay';
import ModelImageExport from './ModelImageExport';
import ModelRotationControl from './ModelRotationControl';
import ModelColorControls from './ModelColorControls';
import {defaultModelColors} from '../app/modelColors';
import {copyModelView,type ModelViewState,type ModelCameraKey} from '../app/modelViewState';
import CanvasTargetMarker from './CanvasTargetMarker';
import {modelProjection} from '../app/modelProjection';
interface ViewPersistence {controlledView?:ModelViewState;fitToken?:number;optionsOpen?:boolean;overlay?:boolean;embedded?:boolean;initialView?:ModelViewState;onViewChange?:(view:ModelViewState)=>void;canvasModelId?:string;targeted?:boolean;sceneIndex?:number;sceneCount?:number;
  conflictControl?:{index:number;onSelect:(index:number)=>void;onLocate?:()=>void};
  /** Marker in unmirrored, unrotated result.geometry.vertices coordinates. */
  targetPoint?:Point;
}
interface ComputationProps {onCancel?:()=>void;progressStage?:FlatProgressStage;startedAt?:number;computationProgress?:FlatComputationProgress|null}

export default function FlatView({result,busy,stale,face,setFace,xray,onRun,onCancel,progressStage,startedAt:externalStartedAt,computationProgress,source,onConstraintsChange,vertexControls,initialView,onViewChange,embedded,overlay,controlledView,fitToken=0,optionsOpen=false,canvasModelId,targeted=false,sceneIndex=0,sceneCount=1,targetPoint,conflictControl}:{result:FlatFoldResult|null;busy:boolean;stale:boolean;face:number|null;setFace:(n:number|null)=>void;xray:boolean;onRun:()=>void;source:{doc:Doc;graph:FoldGraph}|null;onConstraintsChange?:(constraints:FoldingConstraint[])=>void;vertexControls:ModelVertexControls}&ViewPersistence&ComputationProps){
  const computation=useRef({busy:false,startedAt:undefined as number|undefined});
  if(busy&&!computation.current.busy)computation.current.startedAt=Date.now();
  computation.current.busy=busy;
  const startedAt=externalStartedAt??(busy?computation.current.startedAt:undefined);
  if(!result?.geometry.vertices.length)return <div className="empty-workspace"><div className="flat-emblem"/><p className="eyebrow">FLAT FOLD ANALYSIS</p>{(busy||result)&&<FlatComputationStatus status={flatComputationStatus({result,busy,stale,stage:progressStage})} progress={computationProgress} startedAt={startedAt} elapsedMs={result?.computationTimeMs} onCancel={busy?onCancel:undefined}/>}<h2>{busy?'正在分析折痕…':'看见折后的层叠关系。'}</h2><p>{result?.geometry.message||'先构建纸面，再求完全折叠的平面几何与层序。'}<br/>复杂模型可以停止，不会修改原始折痕。</p><button disabled={busy} className="primary" onClick={onRun}>{busy?'计算中…':'开始平折分析'}</button></div>;
  return <FoldedGeometryView busy={busy} onCancel={onCancel} progressStage={progressStage} computationProgress={computationProgress} startedAt={startedAt} controlledView={controlledView} fitToken={fitToken} optionsOpen={optionsOpen} overlay={overlay} embedded={embedded} result={result} stale={stale} face={face} setFace={setFace} xray={xray} source={source} onConstraintsChange={onConstraintsChange} vertexControls={vertexControls} initialView={initialView} onViewChange={onViewChange} canvasModelId={canvasModelId} targeted={targeted} sceneIndex={sceneIndex} sceneCount={sceneCount} targetPoint={targetPoint} conflictControl={conflictControl}/>;
}
function FoldedGeometryView({result,busy,stale,face:requestedFace,setFace,xray:requestedXray,onCancel,progressStage,startedAt,computationProgress,source,onConstraintsChange,vertexControls,initialView,onViewChange,embedded,overlay,controlledView,fitToken=0,optionsOpen=false,canvasModelId,targeted=false,sceneIndex=0,sceneCount=1,targetPoint,conflictControl}:{result:FlatFoldResult;busy:boolean;stale:boolean;face:number|null;setFace:(n:number|null)=>void;xray:boolean;source:{doc:Doc;graph:FoldGraph}|null;onConstraintsChange?:(constraints:FoldingConstraint[])=>void;vertexControls:ModelVertexControls}&ViewPersistence&ComputationProps){
  const scene=canvasModelId!==undefined,active=!scene||targeted,face=active?requestedFace:null,xray=controlledView?.xray??requestedXray;
  const [conflictSelection,setConflictSelection]=useState({result,index:0});
  const conflicts=visibleFlatConflicts(result,busy,stale);
  const requestedConflict=conflictControl?.index??(conflictSelection.result===result?conflictSelection.index:0);
  const conflictIndex=Number.isInteger(requestedConflict)&&requestedConflict>=0&&requestedConflict<conflicts.length?requestedConflict:0;
  const selectedConflict=active?conflicts[conflictIndex]:undefined;
  function chooseConflict(index:number){setConflictSelection({result,index});conflictControl?.onSelect(index);const selected=conflicts[index];if(selected)setFace(conflictFaces(selected,result)[0]??null);}
  const savedView=useRef(copyModelView(controlledView??initialView)),publishRef=useRef(onViewChange);publishRef.current=onViewChange;
  const [localColors,setColors]=useState(()=>savedView.current.colors??defaultModelColors());
  const [localLayout,setLayout]=useState(savedView.current.layout??'single');
  const layout=scene?'single':controlledView?(controlledView.layout??'single'):localLayout;
  const [localDisplayStyle,setDisplayStyle]=useState(savedView.current.displayStyle??'paper');
  const displayStyle=controlledView?(controlledView.displayStyle??'paper'):localDisplayStyle;
  const wireMode=displayStyle==='wire'||result.layers.status==='no-solution',cameraXray=!wireMode&&xray;
  const [paneCameras,setPaneCameras]=useState(savedView.current.cameras);
  const [localSide,setSide]=useState<FlatSide>(savedView.current.side),[localRotation,setRotation]=useState(savedView.current.rotation);
  const side=controlledView?.side??localSide,rotation=controlledView?.rotation??localRotation,colors=controlledView?(controlledView.colors??defaultModelColors()):localColors;
  if(controlledView)savedView.current=controlledView;
  const [localAntiAlias,setAntiAlias]=useState(savedView.current.antiAlias??true);
  const [localDisplayNumbers,setDisplayNumbers]=useState(savedView.current.displayNumbers??false);
  const antiAlias=controlledView?(controlledView.antiAlias??true):localAntiAlias,displayNumbers=controlledView?(controlledView.displayNumbers??false):localDisplayNumbers;
  function persist(patch:Partial<ModelViewState>){savedView.current={...savedView.current,...patch,xray};publishRef.current?.(savedView.current);}
  const [editing,setEditing]=useState(false),[hint,setHint]=useState<{point:Point;dragging:boolean}|null>(null),[vertexMode,setVertexMode]=useState<ModelVertexEditMode>('recompute');
  // The overlay is shared by the single and comparison views; expose the
  // current mode through the existing controls object without duplicating JSX.
  vertexControls.mode=vertexMode;
  const [overlapPreview,setOverlapPreview]=useState(false);
  const [constraintMode,setConstraintMode]=useState<FoldingConstraintSide|null>(null);
  const constraints=result.layers.constraints??[];
  function updateConstraint(faceId:number,side:FoldingConstraintSide,append:boolean){
    const existing=constraints.filter(c=>c.face!==faceId);
    const next=append?[...existing,{face:faceId,side}]:[...constraints.filter(c=>c.side!==side),{face:faceId,side}];
    onConstraintsChange?.(next);
  }
  function removeConstraint(faceId:number){onConstraintsChange?.(constraints.filter(c=>c.face!==faceId));}
  const vertexDragging=useRef(false);
  function vertexHint(point:Point|null,dragging:boolean){vertexDragging.current=dragging;setHint(point?{point,dragging}:null);}
  const {vertices,order,hasOrder,frontMaterial}=useMemo(()=>flatPresentation(result,side,rotation),[result,side,rotation]);
  const markerPoint=useMemo(()=>targetPoint?modelProjection(result.geometry.vertices,side==='back',rotation).project(targetPoint):undefined,[result.geometry.vertices,side,rotation,targetPoint]);
  const [localShadows,setShadows]=useState(()=>savedView.current.shadows??false);
  const shadows=controlledView?(controlledView.shadows??false):localShadows;
  const localRegions=!busy&&!wireMode&&!xray&&!editing&&!stale&&!hasOrder&&result.layers.status==='solved';
  const regionTask=useModelRegionTask(result,side,localRegions&&layout==='single',shadows),regionReply=regionTask.reply;
  const regionSurface=useMemo(()=>localRegions&&regionReply?.status==='complete'&&hasCompleteModelSurface(regionReply)?regionReply:null,[localRegions,regionReply]);
  const renderMode=modelRenderMode(result,hasOrder,{wire:wireMode,xray,regionsReady:!!regionSurface});
  const paperReady=renderMode==='ordered'||renderMode==='regions';
  const computationStatus=useMemo(()=>flatComputationStatus({result,busy,stale,stage:progressStage,localRegions,regionReply,wire:displayStyle==='wire',xray,paperReady}),[result,busy,stale,progressStage,localRegions,regionReply,displayStyle,xray,paperReady]);
  const regionStatus=useMemo(()=>modelRegionStatus(regionReply,shadows),[regionReply,shadows]);
  const wire=useMemo(()=>renderMode==='wire'?modelWireframe(result,side,rotation):null,[result,side,rotation,renderMode]);
  const shadowReply=useModelShadows(result,side,rotation,!wireMode&&shadows&&hasOrder&&!xray&&!stale&&!editing);
  const shadowMap=useMemo(()=>{
    const groups=new Map<number,import('../app/modelShadowBoundaries').ModelShadowBoundary[]>();
    if(shadowReply?.status==='complete')for(const boundary of shadowReply.analysis.boundaries){
      const group=groups.get(boundary.lowerFace)??[];group.push(boundary);groups.set(boundary.lowerFace,group);
    }
    return groups;
  },[shadowReply]);
  const {faces}=result.geometry;const {minX,minY,maxX,maxY}=useMemo(()=>pointBounds(vertices),[vertices]);const w=Math.max(1,maxX-minX),h=Math.max(1,maxY-minY),pad=Math.max(w,h)*.16;

  const unit=Math.max(w,h);
  const slot=Math.max(0,Math.floor(sceneIndex));
  const count=Math.max(slot+1,Number.isFinite(sceneCount)?Math.ceil(sceneCount):1),columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns),span=unit*Math.max(columns,rows)*1.45;
  const fitted=scene&&count>1?{x:minX+w/2-span*((slot%columns)+.5)/columns,y:minY+h/2-span*(Math.floor(slot/columns)+.5)/rows,width:span,height:span}:overlay||scene?{x:minX+w/2-unit*2.25,y:minY+h/2-unit*1.5,width:unit*3,height:unit*3}:{x:minX-pad,y:minY-pad,width:w+pad*2,height:h+pad*2};
  const cameraKey=`${side}-${cameraXray?'transparent':'solid'}-${rotation}`;
  const [views,setViews]=useState<Record<string,typeof fitted>>(()=>Object.fromEntries(Object.entries(savedView.current.cameras).map(([key,{rotation,...view}])=>[key+'-'+rotation,view]))),[moving,setMoving]=useState(false);
  const [sharedCamera,setSharedCamera]=useState<typeof fitted|null>(()=>{
    const cameras=savedView.current.cameras,camera=cameras[`${savedView.current.side}-${savedView.current.xray?'transparent':'solid'}`]??Object.values(cameras)[0];
    return camera?{x:camera.x,y:camera.y,width:camera.width,height:camera.height}:null;
  });
  const view=overlay?(sharedCamera??fitted):views[cameraKey]??fitted;
  const faceCenter=(index:number):Point=>{const points=faces[index].map(v=>vertices[v]);return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];};
  function setView(next:typeof fitted,commit=false){
    if(overlay)setSharedCamera(next);
    setViews(previous=>({...Object.fromEntries(Object.entries(previous).filter(([key])=>!key.startsWith(side+'-'+(cameraXray?'transparent':'solid')+'-'))),[cameraKey]:next}));
    if(commit){const key=(side+'-'+(cameraXray?'transparent':'solid')) as ModelCameraKey;persist({cameras:overlay?Object.fromEntries(['front-solid','front-transparent','back-solid','back-transparent'].map(key=>[key,{...next,rotation}])):{...savedView.current.cameras,[key]:{...next,rotation}}});}
  }
  const viewRef=useRef(view);viewRef.current=view;
  const svg=useRef<SVGSVGElement>(null),suppressClick=useRef(false);
  const previousFit=useRef(fitToken);
  useEffect(()=>{if(previousFit.current===fitToken)return;previousFit.current=fitToken;cancel();if(layout==='single')setView(fitted,true);},[fitToken]);
  const drag=useRef<{key:string;id:number;button:number;moved:boolean;x:number;y:number;matrix:DOMMatrix;view:typeof view;face?:number}|null>(null);
  function cancel(){if(drag.current){const d=drag.current;if(overlay)setSharedCamera(d.view);setViews(previous=>({...previous,[d.key]:d.view}));viewRef.current=drag.current.view;drag.current=null;suppressClick.current=true;}}
  const cameraState=JSON.stringify(controlledView?.cameras);
  useLayoutEffect(()=>{
    if(!controlledView)return;
    const cameras=controlledView.cameras;
    setPaneCameras({...cameras});
    setViews(Object.fromEntries(Object.entries(cameras).map(([key,{rotation,...camera}])=>[key+'-'+rotation,camera])));
    const camera=cameras[`${controlledView.side}-${controlledView.xray?'transparent':'solid'}`]??Object.values(cameras)[0];
    setSharedCamera(camera?{x:camera.x,y:camera.y,width:camera.width,height:camera.height}:null);
  },[cameraState]);
  useEffect(()=>{cancel();setEditing(false);vertexHint(null,false);setPaneCameras({...savedView.current.cameras});},[layout]);
  useEffect(()=>{if(active)return;setEditing(false);setMoving(false);setConstraintMode(null);vertexHint(null,false);},[active]);
  useLayoutEffect(()=>{if(drag.current){const d=drag.current;if(overlay)setSharedCamera(d.view);setViews(previous=>({...previous,[d.key]:d.view}));drag.current=null;suppressClick.current=true;}viewRef.current=view;},[cameraKey]);
  useEffect(()=>{
    const el=svg.current;if(!el)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();if(drag.current||vertexDragging.current)return;const m=el.getScreenCTM();if(!m)return;const a=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),v=viewRef.current;
      const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?240:1),width=Math.max(fitted.width/256,Math.min(fitted.width*4,v.width*Math.exp(Math.max(-2,Math.min(2,dy*.002)))));
      const f=width/v.width,next={x:a.x+(v.x-a.x)*f,y:a.y+(v.y-a.y)*f,width,height:v.height*f};viewRef.current=next;setView(next,true);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();cancel();}};
    el.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',key);window.addEventListener('blur',cancel);
    return()=>{el.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);};
  },[source,cameraKey,layout]);
  useEffect(()=>{
    const el=svg.current;if(!el||!constraintMode)return;
    const click=(event:Event)=>{const target=(event.target as Element).closest<SVGElement>('[data-face-id]');if(!target)return;const id=Number(target.dataset.faceId);if(!Number.isInteger(id))return;event.preventDefault();event.stopPropagation();updateConstraint(id,constraintMode,(event as MouseEvent).ctrlKey||(event as MouseEvent).metaKey);};
    const context=(event:MouseEvent)=>{const target=(event.target as Element).closest<SVGElement>('[data-face-id]');if(!target)return;const id=Number(target.dataset.faceId);if(!Number.isInteger(id))return;event.preventDefault();event.stopPropagation();removeConstraint(id);};
    el.addEventListener('click',click,true);el.addEventListener('contextmenu',context,true);
    return()=>{el.removeEventListener('click',click,true);el.removeEventListener('contextmenu',context,true);};
  },[constraintMode,constraints]);

  const input=source?.graph;const doc=source?.doc;const paper=doc?getPaperBounds(doc):{x:0,y:0,width:200,height:200};
  const sourceConflict=input?sourceConflictResult(result,input):undefined;
  function locateConflict(){
    if(!selectedConflict)return;
    const focused=conflictView(conflictPoints(selectedConflict,result,vertices),view,unit);if(!focused)return;
    cancel();setView(focused,true);viewRef.current=focused;setFace(conflictFaces(selectedConflict,result)[0]??null);conflictControl?.onLocate?.();
  }
  return <div className="flat-view flat-workspace" data-model-id={canvasModelId} data-model-targeted={scene?targeted:undefined} data-model-history={editing?'true':undefined} data-model-camera={cameraKey}>{active&&layout==='single'&&(scene&&!computationStatus.active&&computationStatus.tone==='ready'?<details className="canvas-model-ready-status" data-flat-computation="finished"><summary><span role="status" aria-live="polite">{computationStatus.title}</span>{Number.isFinite(result.computationTimeMs)&&result.computationTimeMs!>=0&&<span className="flat-computation-elapsed">本次用时 {formatFlatComputationTime(result.computationTimeMs!)}</span>}<span>详情</span></summary><p>{computationStatus.detail}</p></details>:<FlatComputationStatus status={computationStatus} progress={computationProgress} startedAt={startedAt} elapsedMs={result.computationTimeMs} onCancel={busy?onCancel:localRegions?regionTask.cancel:undefined}>{selectedConflict&&<FlatConflictDetails conflicts={conflicts} index={conflictIndex} result={result} onSelect={chooseConflict} onLocate={locateConflict}/>}</FlatComputationStatus>)}{active&&<details className={embedded?'embedded-model-controls':'standalone-model-controls'} open={overlay?optionsOpen:embedded?undefined:true}><summary hidden={overlay}>模型显示与操作</summary><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'0 22px',flexShrink:0,fontSize:11}}>
    <button aria-pressed={side==='front'} onClick={()=>{cancel();persist({side:'front'});setSide('front');}}>模型正面</button>
    <button aria-pressed={side==='back'} onClick={()=>{cancel();persist({side:'back'});setSide('back');}}>模型背面</button>
    {!scene&&<select aria-label="模型组合显示" value={layout} onChange={e=>{cancel();setEditing(false);vertexHint(null,false);const next=e.target.value as typeof layout;setLayout(next);setPaneCameras({...savedView.current.cameras});persist({layout:next});}}><option value="single">单视图</option><option value="both">正背双视图</option><option value="four">实体＋X 光四视图</option></select>}
    <select aria-label="模型显示样式" value={displayStyle} onChange={e=>{cancel();setEditing(false);vertexHint(null,false);const next=e.target.value as typeof displayStyle;setDisplayStyle(next);setPaneCameras({...savedView.current.cameras});persist({displayStyle:next});}}><option value="paper">纸面</option><option value="wire">线框</option></select>
    <ModelRotationControl rotation={rotation} onChange={angle=>{cancel();persist({rotation:angle});setRotation(angle);}}/>
    {!overlay&&<ModelColorControls colors={colors} onChange={next=>{setColors(next);persist({colors:next});}}/>}
    <button disabled={layout!=='single'} aria-pressed={constraintMode==='white'} onClick={()=>setConstraintMode(constraintMode==='white'?null:'white')} title="点击面设为白面候选；Ctrl+点击追加">白面约束</button>
    <button disabled={layout!=='single'} aria-pressed={constraintMode==='color'} onClick={()=>setConstraintMode(constraintMode==='color'?null:'color')} title="点击面设为色面候选；Ctrl+点击追加">色面约束</button>
    {constraints.length>0&&<span role="status">已设 {constraints.length} 个可见面候选：{constraints.map(c=>`F${c.face+1}${c.side==='white'?'白':'色'}`).join('、')}</span>}
    <label title="随模型集合保存；仅在层序确认的实体模型上显示内部纸层阴影；单张模型图像导出包含已计算阴影。"><input type="checkbox" checked={shadows} onChange={e=>{setShadows(e.target.checked);persist({shadows:e.target.checked});}}/>纸层阴影</label>
    <label title="只改变折叠模型画布和模型导出的 SVG 边缘渲染，不改变几何。"><input type="checkbox" checked={antiAlias} onChange={e=>{setAntiAlias(e.target.checked);persist({antiAlias:e.target.checked});}}/>模型抗锯齿</label>
    <label title="在折叠模型面中心显示 F1、F2 等面编号；只改变显示。"><input type="checkbox" checked={displayNumbers} onChange={e=>{setDisplayNumbers(e.target.checked);persist({displayNumbers:e.target.checked});}}/>显示面编号</label>
    {shadows&&<span role="status">{wireMode?'线框模式不绘制阴影':stale?'阴影暂停：模型已过期':editing?'编辑时暂停阴影':xray?'X 光模式不显示阴影':!hasOrder?'局部阴影见区域状态':!shadowReply?'正在计算阴影…':shadowReply.status!=='complete'?shadowReply.message:shadowReply.analysis.status==='unconfirmed'?'层序未确认，不显示阴影':`阴影 ${shadowReply.analysis.boundaries.length} 处${shadowReply.analysis.ambiguousEdges?' · '+shadowReply.analysis.ambiguousEdges+' 处过窄边界未绘制':''}`}</span>}
    <button aria-pressed={moving} onClick={()=>{cancel();setEditing(false);vertexHint(null,false);setMoving(!moving);}}>移动视图</button>
    <button aria-pressed={editing} disabled={vertexControls.disabled} onClick={()=>{cancel();setMoving(false);vertexHint(null,false);setEditing(!editing);}}>编辑模型顶点</button>
    {editing&&<select aria-label="顶点编辑模式" value={vertexMode} onChange={e=>setVertexMode(e.target.value as ModelVertexEditMode)}><option value="recompute">编辑后重算透视/层序</option><option value="wireframe">直接编辑线框（暂不重算）</option></select>}
    {localRegions&&layout==='single'&&<span role="status">{regionStatus}</span>}
    {editing&&<label><input type="checkbox" checked={overlapPreview} onChange={e=>setOverlapPreview(e.target.checked)}/>拖动时显示重叠区域</label>}
    {layout==='single'&&<button onClick={()=>{drag.current=null;setView(fitted,true);viewRef.current=fitted;}}>复位模型视图</button>}
    <ModelImageExport result={result} name={source?.doc.name??'折叠模型'} side={side} antiAlias={antiAlias} displayNumbers={displayNumbers} displayStyle={displayStyle} rotation={rotation} colors={colors} shadows={shadowReply?.status==='complete'?shadowReply.analysis:undefined} xray={xray} comparisonView={{...savedView.current,layout,side,rotation,colors,shadows,xray,displayStyle,antiAlias,displayNumbers}} disabled={vertexControls.disabled||editing} singleDisabled={!wireMode&&shadows&&hasOrder&&!xray&&shadowReply?.status!=='complete'}/>
    {layout!=='single'&&<span>各窗格独立平移缩放；选择“当前组合”可导出双／四视图，输出完整模型而非相机裁切。</span>}
    <span>{editing?'在展开图选择重合点成员，再拖动紫色顶点；松开应用，右击或 Esc 取消。':moving?'按住左键拖动；右击或 Esc 取消本次拖动。':constraintMode?'点击面设置候选；Ctrl+点击追加同色候选；右击删除候选。':'点击面查看原位；按住滚轮平移，滚轮缩放。'}{editing?'Ctrl+Z / Ctrl+Y 操作模型历史，不修改原始折痕。':constraintMode?'重新分析时只保留候选面位于最上层且材质匹配的层序。':'仅改变显示；纸张正背面与边线可在模型配色中调整。'}</span></div></details>}
    {layout!=='single'?<div aria-label="模型组合工作区" style={{flex:1,minHeight:240,padding:'0 16px',display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gridTemplateRows:layout==='four'&&!wireMode?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)',gap:8}}>{modelViewPanes({...savedView.current,layout,side,xray,displayStyle,antiAlias,displayNumbers}).map(pane=><ModelComparisonPane key={pane.key+'-'+rotation+'-'+displayStyle} pane={pane} conflicts={conflicts} conflictIndex={conflictIndex} onConflictSelect={chooseConflict} antiAlias={antiAlias} displayNumbers={displayNumbers} wireMode={wireMode} busy={busy} progressStage={progressStage} computationProgress={computationProgress} startedAt={startedAt} onCancel={onCancel} fitToken={fitToken} result={result} rotation={rotation} colors={colors} shadows={shadows} stale={stale} camera={paneCameras[pane.key]} onCamera={camera=>{const cameras={...savedView.current.cameras,[pane.key]:camera};setPaneCameras(cameras);setViews(previous=>({...previous,[pane.key+'-'+rotation]:camera}));persist({cameras});}} face={face} setFace={setFace} moving={moving} editing={editing} vertexControls={{...vertexControls,overlapPreview}} onHint={vertexHint}/>)}</div>:<svg ref={svg} data-model-id={canvasModelId} data-model-render-mode={renderMode} shapeRendering={antiAlias?'geometricPrecision':'crispEdges'} tabIndex={0} style={{margin:'0 auto',flex:1,minHeight:160,height:0,touchAction:'none',userSelect:'none',cursor:moving||overlay?'grab':undefined}}
      onPointerDown={e=>{suppressClick.current=false;if(editing)e.currentTarget.focus({preventScroll:true});if(e.button!==1&&!(e.button===0&&active&&(moving||(overlay&&!editing&&!constraintMode))))return;e.preventDefault();e.currentTarget.focus({preventScroll:true});const m=e.currentTarget.getScreenCTM();if(!m)return;const hit=(e.target as Element).closest('[data-region-top],[data-face-id]'),hitId=hit?.getAttribute('data-region-top')??hit?.getAttribute('data-face-id');drag.current={key:cameraKey,id:e.pointerId,button:e.button,moved:false,x:e.clientX,y:e.clientY,matrix:m.inverse(),view:viewRef.current,face:e.button===0&&overlay&&!moving&&!editing&&!constraintMode&&hitId!=null?Number(hitId):undefined};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;if(e.buttons&2){cancel();return;}if(!(e.buttons&5)){cancel();return;}const dx=e.clientX-d.x,dy=e.clientY-d.y;if(d.button===1&&!d.moved&&Math.hypot(dx,dy)<=4)return;d.moved=true;if(Math.hypot(dx,dy)>2)suppressClick.current=true;const next={...d.view,x:d.view.x-d.matrix.a*dx-d.matrix.c*dy,y:d.view.y-d.matrix.b*dx-d.matrix.d*dy};viewRef.current=next;setView(next);}}
      onPointerUp={e=>{if(drag.current?.id===e.pointerId){const d=drag.current;drag.current=null;if(d.button!==1||d.moved)setView(viewRef.current,true);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(!suppressClick.current&&d.face!==undefined)setFace(d.face);}}}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onContextMenu={e=>{e.preventDefault();cancel();}} onAuxClick={e=>e.preventDefault()}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="实际平折面几何，点击面查看原始位置">{!regionSurface?.exact&&order.map(i=><Fragment key={i}><IndexedFaceShape outer={faces[i]} holes={result.geometry.graph?.faces_holes?.[i]} coords={vertices} data-face-id={i} data-material={frontMaterial[i]?'front':'back'} fill={renderMode==='wire'||renderMode==='regions'?'transparent':face===i?'#d2b57b':frontMaterial[i]?colors.front:colors.back} fillOpacity={renderMode==='xray'?.25:1} stroke={renderMode==='wire'?(face===i?'#986621':'none'):renderMode==='regions'?'none':face===i?'#986621':colors.line} strokeWidth={face===i?1.2:.35} onClick={()=>{if(active&&!editing&&!moving&&!suppressClick.current)setFace(i);}} role={active?"button":"img"} tabIndex={active?0:-1} aria-label={`选择折叠面 F${i+1}`} onKeyDown={e=>{if(active&&!editing&&e.key==='Enter')setFace(i);}}/>{displayNumbers&&!wireMode&&<text x={faceCenter(i)[0]} y={faceCenter(i)[1]} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(view.width/80,1.5)} fill="#294536" stroke="#fffefb" strokeWidth={Math.max(view.width/360,.25)} paintOrder="stroke" pointerEvents="none">F{i+1}</text>}{shadowMap.has(i)&&<ModelShadows boundaries={shadowMap.get(i)!} holes={(result.geometry.graph?.faces_holes?.[i]??[]).map(r=>r.map(v=>vertices[v]))} polygon={faces[i].map(v=>vertices[v])}/>}</Fragment>)}{layout==='single'&&regionSurface?.exact&&<ModelExactSurface displayNumbers={displayNumbers} labelFontSize={Math.max(view.width/80,1.5)} result={result} surface={regionSurface.exact} side={side} rotation={rotation} colors={colors} face={face} interactive={active&&!moving} shadows={shadows} onSelect={id=>{if(!suppressClick.current)setFace(id);}}/>}{layout==='single'&&regionSurface&&!regionSurface.exact&&<ModelRegionSurface result={result} regions={regionSurface.regions} boundaries={regionSurface.boundaries} shadows={shadows?regionSurface.shadows:undefined} side={side} rotation={rotation} colors={colors} face={face} interactive={active&&!moving} onSelect={id=>{if(!suppressClick.current)setFace(id);}}/>}{wire&&<ModelWireLines wire={wire}/>}<FlatConflictOverlay conflict={selectedConflict} result={result} coords={vertices} viewWidth={view.width}/>{active&&editing&&<FoldedVertexOverlay key={cameraKey} result={result} back={side==='back'} rotation={rotation} radius={view.width/160} {...vertexControls} overlapPreview={overlapPreview} onHint={vertexHint}/>}{scene&&targeted&&<CanvasTargetMarker point={markerPoint??[(minX+maxX)/2,(minY+maxY)/2]} kind="fold"/>}</svg>}{active&&editing&&hint&&<div role="status" style={{position:'fixed',left:Math.min(hint.point[0]+16,window.innerWidth-290),top:Math.max(8,hint.point[1]-48),maxWidth:270,pointerEvents:'none',zIndex:30,background:'#fffefb',border:'1px solid #8052ad',borderRadius:4,padding:'6px 9px',fontSize:12,color:'#583278'}}>{hint.dragging?'拖动到目标位置后松开；右击 / Esc 取消。':'按住顶点拖动；可先在展开图选定重合成员。'}</div>}{active&&face!==null&&input&&doc&&<div className="face-map"><strong>F{face+1} · 计算时原始位置</strong><svg viewBox={`${paper.x-10} ${paper.y-10} ${paper.width+20} ${paper.height+20}`}><path d={paperPath(doc)} fill="#fffefb" fillRule={paperFillRule(doc)} stroke="#bac8b8"/>{input.faces_vertices?.[face]&&<IndexedFaceShape outer={input.faces_vertices[face]} holes={input.faces_holes?.[face]} coords={input.vertices_coords} fill="#c7dec6" stroke="#32634c"/>}{doc.segments.map(s=><line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={segmentDisplayColor(s)} strokeWidth=".8"/>)}{sourceConflict&&<FlatConflictOverlay conflict={selectedConflict} result={sourceConflict} coords={input.vertices_coords} foldedResult={result} viewWidth={paper.width+20}/>}</svg><button onClick={()=>setFace(null)}>取消面选择</button></div>}<div className="flat-footer">{faces.length} 个面 · {layout==='single'&&wire?wire.message:result.layers.message}</div></div>;
}
