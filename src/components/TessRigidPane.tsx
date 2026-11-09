import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import type {TessResult} from '../app/tessellation';
import {projectRigidQuad,rigidQuadScene,type RigidQuadScene} from '../app/rigidQuadView';
import {potFlangeDisplayScene,spatialMeshScene} from '../app/spatialMeshView';
import {embedVerifiedSpatialTile,projectEmbeddedSpatialTile,type SpatialTilePlacement} from '../app/spatialTileEmbedding';
import type {ModelViewState} from '../app/modelViewState';
import {defaultModelColors} from '../app/modelColors';

type Drag={id:number;mode:'orbit'|'pan';x:number;y:number;azimuth:number;elevation:number;pan:[number,number];matrix:DOMMatrix};

export default function TessRigidPane({result,current,view,fitToken,open,sceneOverride,spatialLabel}:{result:TessResult|null;current:boolean;view:ModelViewState;fitToken:number;open:boolean;sceneOverride?:RigidQuadScene|null;spatialLabel?:string}){
  const dualForm=result?.source.spatialKind==='origamica-paraboloidal-flasher-cut'&&result.source.deployedPatternChecked===true;
  const [spatialForm,setSpatialForm]=useState<'folded'|'deployed'>('folded');
  const [placementEnabled,setPlacementEnabled]=useState(false);
  const [placement,setPlacement]=useState<SpatialTilePlacement>({offset:[0,0],rotationRad:0,scale:1});
  const [sampleVertex,setSampleVertex]=useState(0);
  const baseScene=useMemo(()=>current?(dualForm?spatialMeshScene(result,spatialForm):sceneOverride===undefined?rigidQuadScene(result):sceneOverride):null,[result,current,sceneOverride,dualForm,spatialForm]);
  const placementAvailable=!!baseScene&&spatialForm==='folded'&&!result?.source.flatFlangeDisplay;
  const embedded=useMemo(()=>placementEnabled&&placementAvailable?embedVerifiedSpatialTile(result,placement):null,
    [placementEnabled,placementAvailable,result,placement]);
  const placedScene=placementEnabled&&placementAvailable?embedded?.scene??null:baseScene;
  const flangeScene=useMemo(()=>result&&placedScene?potFlangeDisplayScene(placedScene,result.source):null,[result,placedScene]);
  const scene=flangeScene??placedScene;
  const flangeFraction=flangeScene&&typeof result?.source.flatFlangeDisplay==='object'&&result.source.flatFlangeDisplay!==null
    ?(result.source.flatFlangeDisplay as {fraction:number}).fraction:0;
  useEffect(()=>{if(!dualForm)setSpatialForm('folded');},[dualForm]);
  useEffect(()=>{setPlacementEnabled(false);setPlacement({offset:[0,0],rotationRad:0,scale:1});setSampleVertex(0);},
    [result?.source.spatialKind,result?.source.output]);
  const [azimuth,setAzimuth]=useState(-25),[elevation,setElevation]=useState(48);
  const [pan,setPan]=useState<[number,number]>([0,0]),[zoom,setZoom]=useState(1);
  const svg=useRef<SVGSVGElement|null>(null),drag=useRef<Drag|null>(null);
  const colors=view.colors??defaultModelColors();
  const comparison=useMemo(()=>embedded&&scene===embedded.scene
    ?projectEmbeddedSpatialTile(embedded,azimuth,elevation,view.side==='back',view.rotation):null,
    [embedded,scene,azimuth,elevation,view.side,view.rotation]);
  const drawing=useMemo(()=>comparison?.projection??(scene?projectRigidQuad(scene,azimuth,elevation,view.side==='back',view.rotation):null),
    [comparison,scene,azimuth,elevation,view.side,view.rotation]);
  const placedVertexOffset=comparison?.placedVertexOffset??0;
  const sampleIndex=Math.min(sampleVertex,Math.max(0,(embedded?.scene.vertices.length??1)-1));
  const formatPoint=(point:readonly number[])=>point.map(value=>Number(value.toPrecision(6))).join(', ');
  const edgeTypes=useMemo(()=>{
    const types=new Map<string,string>();
    scene?.edges.forEach(([a,b],index)=>types.set(`${Math.min(a,b)}:${Math.max(a,b)}`,scene.assignments[index]));
    return types;
  },[scene]);
  const solid=!!drawing&&!view.xray&&drawing.surfaceOrderReliable;
  const color=(assignment:string)=>assignment==='M'?'#bf4350':assignment==='V'?'#3764c0':colors.line;
  useEffect(()=>{setAzimuth(-25);setElevation(48);setPan([0,0]);setZoom(1);},[fitToken]);
  useEffect(()=>{
    const element=svg.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();
      setZoom(previous=>Math.max(.3,Math.min(8,previous*Math.exp(-event.deltaY*.001))));
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[scene]);
  const start=(event:PointerEvent<SVGSVGElement>)=>{
    if(!scene||(event.button!==0&&event.button!==1))return;
    const matrix=event.currentTarget.getScreenCTM()?.inverse();if(!matrix)return;
    event.preventDefault();
    drag.current={id:event.pointerId,mode:event.button===1||event.shiftKey?'pan':'orbit',
      x:event.clientX,y:event.clientY,azimuth,elevation,pan,matrix};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=(event:PointerEvent<SVGSVGElement>)=>{
    const active=drag.current;if(!active||active.id!==event.pointerId)return;
    const dx=event.clientX-active.x,dy=event.clientY-active.y;
    if(active.mode==='orbit'){
      setAzimuth(active.azimuth+dx*.45);
      setElevation(Math.max(5,Math.min(85,active.elevation+dy*.35)));
    }else setPan([active.pan[0]+active.matrix.a*dx+active.matrix.c*dy,
      active.pan[1]+active.matrix.b*dx+active.matrix.d*dy]);
  };
  const transform=`translate(${pan[0]} ${pan[1]}) translate(500 350) scale(${zoom}) translate(-500 -350)`;
  return <section className="tess-rigid-pane canvas-fold-overlay" aria-label={dualForm?spatialForm==='deployed'?'抛物面 Flasher 三维部署形 DP':'抛物面 Flasher 三维折后形 FF':flangeScene?'壶体法兰显示分层预览':spatialLabel??'镶嵌静态刚性三维构形'} data-rigid-current={current&&!!scene} data-rigid-surface={drawing?(drawing.surfaceOrderReliable?'ordered':'ambiguous'):'pending'} data-rigid-form={dualForm?spatialForm:undefined} data-rigid-display-inset={flangeScene?flangeFraction:undefined} data-rigid-placement={placementEnabled&&placementAvailable?embedded?'verified':'invalid':undefined} hidden={!open}>
    <div className="tess-rigid-caption"><strong>{dualForm?spatialForm==='deployed'?'三维 · 部署形 DP':'三维 · 折后形 FF':flangeScene?'三维 · 法兰显示分层':spatialLabel??'三维 · 静态等距'}</strong><span>{current&&scene?drawing&&!drawing.surfaceOrderReliable?'当前视角遮挡次序不确定，改用线框':flangeScene?`${scene.faces.length} 面 · 仅显示内缩 ${flangeFraction} · 原始等距误差 ${baseScene!.maximumFaceDistanceError.toExponential(1)}`:`${scene.faces.length} 面 · 最短边 ${Number(scene.minimumSpatialEdgeLength.toPrecision(4))} · 等距误差 ${scene.maximumFaceDistanceError.toExponential(1)}`:current?'缺少已验证的三维坐标':'参数更新中，等待当前三维结果'}</span>{dualForm&&<div className="tess-rigid-form-switch" aria-label="抛物面 Flasher 三维状态"><button type="button" aria-pressed={spatialForm==='deployed'} disabled={!current} onClick={()=>setSpatialForm('deployed')}>部署 DP</button><button type="button" aria-pressed={spatialForm==='folded'} disabled={!current} onClick={()=>setSpatialForm('folded')}>折后 FF</button></div>}{placementAvailable&&<button className="tess-rigid-placement-toggle" type="button" aria-pressed={placementEnabled} onClick={()=>setPlacementEnabled(value=>!value)}>空间图放置</button>}</div>
    {placementEnabled&&placementAvailable&&<div className="tess-rigid-placement-panel" aria-label="第 33 节空间图数值放置">
      <strong>空间图放置 · 原位对照</strong>
      <div className="tess-rigid-placement-fields">
        <label>平移 X<input aria-label="空间图平移 X" type="number" step="any" value={placement.offset[0]} onChange={event=>{const value=Number(event.currentTarget.value);if(Number.isFinite(value))setPlacement(previous=>({...previous,offset:[value,previous.offset[1]]}));}}/></label>
        <label>平移 Y<input aria-label="空间图平移 Y" type="number" step="any" value={placement.offset[1]} onChange={event=>{const value=Number(event.currentTarget.value);if(Number.isFinite(value))setPlacement(previous=>({...previous,offset:[previous.offset[0],value]}));}}/></label>
        <label>绕 Z 旋转 °<input aria-label="空间图绕 Z 旋转角度" type="number" step="any" value={Number((placement.rotationRad*180/Math.PI).toFixed(6))} onChange={event=>{const value=Number(event.currentTarget.value);if(Number.isFinite(value))setPlacement(previous=>({...previous,rotationRad:value*Math.PI/180}));}}/></label>
        <label>缩放<input aria-label="空间图缩放" type="number" step="any" value={placement.scale} onChange={event=>{const value=Number(event.currentTarget.value);if(Number.isFinite(value))setPlacement(previous=>({...previous,scale:value}));}}/></label>
      </div>
      {embedded?<><label className="tess-rigid-vertex-query">顶点索引<input aria-label="空间图顶点索引" type="number" min="0" max={embedded.scene.vertices.length-1} step="1" value={sampleIndex} onChange={event=>{const value=Number(event.currentTarget.value);if(Number.isInteger(value)&&value>=0&&value<embedded.scene.vertices.length)setSampleVertex(value);}}/></label>
        <output className="tess-rigid-vertex-output" data-spatial-vertex={sampleIndex}>CP [{formatPoint(embedded.developedVertices[sampleIndex])}] · FF [{formatPoint(embedded.scene.vertices[sampleIndex])}]</output>
        <small>灰色虚线为原三维位置；面与折后坐标使用同一顶点索引。</small></>:<span role="status">放置后几何退化或数值无效，请调整参数。</span>}
    </div>}
    {drawing&&scene?<svg ref={svg} className="tess-rigid-svg" aria-label={spatialLabel?'由真实三维顶点投影的镶嵌静态构形':'由真实三维顶点投影的镶嵌刚性构形'} viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"
      onPointerDown={start} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onContextMenu={event=>event.preventDefault()}>
      <title>{flangeScene?'法兰顶点仅在显示时内缩；真实折后坐标已独立验证等距。':comparison?'灰色虚线是原三维位置，彩色面是按第 33 节数值规则放置的真实三维顶点。':'已验证当前静态面等距；未验证连续折叠路径与自碰撞。'}</title>
      <g transform={transform}>
        {comparison&&embedded?.referenceScene.edges.map(([a,b],index)=><line key={'reference-'+index} data-rigid-reference-edge={index} x1={drawing.points[a][0]} y1={drawing.points[a][1]} x2={drawing.points[b][0]} y2={drawing.points[b][1]} stroke="#8d9c95" strokeWidth="1.1" strokeDasharray="4 3" opacity=".58" vectorEffect="non-scaling-stroke"/>)}
        {solid&&drawing.faceOrder.map(index=>{
          const face=scene.faces[index];
          return <g key={index} data-rigid-face={index}>
            <polygon points={face.map(vertex=>drawing.points[vertex+placedVertexOffset].join(',')).join(' ')}
              fill={drawing.frontFacing[index]?colors.front:colors.back} stroke="none"/>
            {face.map((a,edgeIndex)=>{
              const b=face[(edgeIndex+1)%face.length],assignment=edgeTypes.get(`${Math.min(a,b)}:${Math.max(a,b)}`)??'U';
              return <line key={edgeIndex} x1={drawing.points[a+placedVertexOffset][0]} y1={drawing.points[a+placedVertexOffset][1]} x2={drawing.points[b+placedVertexOffset][0]} y2={drawing.points[b+placedVertexOffset][1]}
                stroke={color(assignment)} strokeWidth={assignment==='B'?2.1:1.45} vectorEffect="non-scaling-stroke"/>;
            })}
          </g>;
        })}
        {!solid&&scene.edges.map(([a,b],index)=><line key={index} x1={drawing.points[a+placedVertexOffset][0]} y1={drawing.points[a+placedVertexOffset][1]} x2={drawing.points[b+placedVertexOffset][0]} y2={drawing.points[b+placedVertexOffset][1]}
          stroke={color(scene.assignments[index])} strokeWidth={scene.assignments[index]==='B'?2.2:1.6} vectorEffect="non-scaling-stroke"/>)}
      </g>
    </svg>:<div className="tess-rigid-empty" role="status">{current?'当前候选没有可用的静态等距三维构形。':'正在重新计算当前网格的三维构形…'}</div>}
    <div className="tess-rigid-hint">拖动旋转 · Shift／中键平移 · 滚轮缩放 · 仅静态构形</div>
  </section>;
}
