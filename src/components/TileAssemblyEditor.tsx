import {useEffect,useRef,useState} from 'react';
import {assembleTiles,ccwTile,isConvexTile,joinTileGroup,reflectedTile,regularTileAtEdge,reshapeStarTile,starTileAtEdge,starTileParameters,tileCenter,transformTile,unitStarTile,type Tile} from '../app/tileAssembly';
import {patchVectors} from '../app/patchVectors';
import {geometryNumber,geometryTicks,geometryTickStep,zoomGeometryView} from '../app/geometryEditor';
import type {TessParams,XY} from '../app/tessellation';
import TessellationEditor,{TessDialog} from './TessellationEditor';
import {NumberField} from './Fields';
import TileSpecEditor from './TileSpecEditor';
import {embedTilingSpecs,type TileSpec} from '../app/tileSpecs';

type Params=Extract<TessParams,{family:'custom'}>;
function bounds(tiles:Tile[]){
  const ps=tiles.flat(),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,pad=Math.max(w,h,.1)*.3;
  return {x:x-pad,y:y-pad,w:w+pad*2,h:h+pad*2};
}
export default function TileAssemblyEditor({params,onApply,onClose}:{params:Params;onApply:(mesh:Partial<Pick<Params,'vertices'|'faces'|'lattice'|'range1'|'range2'|'repeatX'|'repeatY'|'customOutput'|'tileSpecs'>>)=>void;onClose:()=>void}){
  const initial=useRef(params.faces.map(f=>ccwTile(f.map(i=>params.vertices[i]))));
  const [tiles,setTiles]=useState(initial.current),[selected,setSelected]=useState(0),[selection,setSelection]=useState<number[]>([0]),[edge,setEdge]=useState(0),[error,setError]=useState('');
  const [tileSpecs,setTileSpecs]=useState<TileSpec[]|undefined>(()=>params.tileSpecs?structuredClone(params.tileSpecs):undefined);
  const [view,setView]=useState(()=>bounds(initial.current)),[angle,setAngle]=useState(90),[sides,setSides]=useState(4),[starPoints,setStarPoints]=useState(5),[starTip,setStarTip]=useState(36),[joining,setJoining]=useState(false),[scaleToFit,setScaleToFit]=useState(false),[scale,setScale]=useState(1),[edit,setEdit]=useState(false),[specEdit,setSpecEdit]=useState(false);
  const [grid,setGrid]=useState(true),[panMode,setPanMode]=useState(false),[plotSize,setPlotSize]=useState<[number,number]>([760,350]);
  const all=initial.current.flat(),width=Math.max(...all.map(p=>p[0]))-Math.min(...all.map(p=>p[0])),height=Math.max(...all.map(p=>p[1]))-Math.min(...all.map(p=>p[1]));
  const [customLattice,setCustomLattice]=useState(!!params.lattice),[lattice,setLattice]=useState<[XY,XY]>(()=>structuredClone(params.lattice??[[width,0],[0,height]]));
  const [signedRanges,setSignedRanges]=useState(!!params.range1&&!!params.range2),[range1,setRange1]=useState<[number,number]>(()=>structuredClone(params.range1??[-1,1])),[range2,setRange2]=useState<[number,number]>(()=>structuredClone(params.range2??[-1,1]));
  const [vectorRefs,setVectorRefs]=useState<[string,string,string]>(['1:1','1:2','1:3']);
  const [vectorPickerOpen,setVectorPickerOpen]=useState(false);
  const history=useRef<{tiles:Tile[];tileSpecs?:TileSpec[]}[]>([]),[undoCount,setUndoCount]=useState(0),svg=useRef<SVGSVGElement>(null),fields=useRef<HTMLDivElement>(null);
  const drag=useRef<{indices:number[];point:XY;snapshot:Tile[]}|null>(null);
  const pan=useRef<{pointer:number;start:XY;view:typeof view;inverse:DOMMatrix}|null>(null);
  const chosen=tiles[selected],center=tileCenter(selection.flatMap(i=>tiles[i])),selectedStar=starTileParameters(chosen);
  // Selecting a different tile loads its shape parameters; dragging or replacing
  // that tile must not erase edits still pending in the controls.
  useEffect(()=>{
    if(!selectedStar)return;
    setStarPoints(selectedStar.points);
    const tip=Number(selectedStar.tipDegrees.toFixed(6));
    setStarTip(current=>Math.abs(current-tip)<1e-6?current:tip);
  },[selected]);
  const checkpoint=(snapshot=tiles)=>{history.current.push({tiles:structuredClone(snapshot),tileSpecs:tileSpecs?structuredClone(tileSpecs):undefined});if(history.current.length>50)history.current.shift();setUndoCount(history.current.length);};
  const update=(next:Tile[],fit=false,specs?:TileSpec[])=>{checkpoint();setTiles(next);setTileSpecs(specs?structuredClone(specs):undefined);setJoining(false);setError('');if(fit)setView(bounds(next));};
  const replace=(tile:Tile)=>{update(tiles.map((p,i)=>i===selected?tile:p));setEdge(0);};
  const transform=(offset:XY=[0,0],degrees=0,reflect=false,factor=1)=>{update(tiles.map((tile,i)=>selection.includes(i)?transformTile(tile,offset,degrees,reflect,center,factor):tile));setEdge(0);};
  const copyGroup=()=>{if(tiles.length+selection.length>96){setError('最多允许 96 块。');return;}const added=selection.map(i=>transformTile(tiles[i],[.2,.2]));update([...tiles,...added],true);setSelection(added.map((_,i)=>tiles.length+i));setSelected(tiles.length);setEdge(0);};
  const reflectGroup=()=>{if(tiles.length+selection.length>96){setError('最多允许 96 块。');return;}const added=selection.map(i=>reflectedTile(tiles[i],edge,chosen));update([...tiles,...added],true);setSelection(added.map((_,i)=>tiles.length+i));setSelected(tiles.length);setEdge(0);};
  const attempt=(fn:()=>void)=>{try{fn();}catch(e){setError((e as Error).message);}};
  const vertexRefs=vectorPickerOpen?tiles.flatMap((tile,tileIndex)=>tile.map((_,vertexIndex)=>({id:`${tileIndex+1}:${vertexIndex+1}`,label:`拼块 ${tileIndex+1} · 点 ${vertexIndex+1}`}))):[];
  const applyPatchVectors=()=>attempt(()=>{
    const [anchor,uTarget,vTarget]=vectorRefs.map(value=>value.split(':').map(Number) as [number,number]);
    setLattice(patchVectors(tiles,anchor,uTarget,vTarget));setError('');
  });
  const undo=()=>{const previous=history.current.pop();if(previous){setTiles(previous.tiles);setTileSpecs(previous.tileSpecs);setSelected(Math.min(selected,previous.tiles.length-1));setSelection([Math.min(selected,previous.tiles.length-1)]);setEdge(0);setJoining(false);setError('');setUndoCount(history.current.length);}};
  const add=(tile:Tile)=>{if(tiles.length>=96){setError('最多允许 96 块。');return;}update([...tiles,tile],true);setSelected(tiles.length);setSelection([tiles.length]);setEdge(0);};
  const locate=(x:number,y:number):XY=>{const point=new DOMPoint(x,y).matrixTransform(svg.current!.getScreenCTM()!.inverse());return [point.x,point.y];};
  const zoom=(factor:number,at?:XY)=>setView(old=>{
    const current={center:[old.x+old.w/2,old.y+old.h/2] as XY,span:old.h},next=zoomGeometryView(current,factor,at),ratio=next.span/old.h;
    return {x:next.center[0]-old.w*ratio/2,y:next.center[1]-next.span/2,w:old.w*ratio,h:next.span};
  });
  const wheelRequest=useRef<(event:WheelEvent)=>void>(()=>{});
  wheelRequest.current=event=>{event.preventDefault();if(drag.current||pan.current)return;zoom(Math.exp(Math.max(-.5,Math.min(.5,event.deltaY*.001))),locate(event.clientX,event.clientY));};
  useEffect(()=>{
    const element=svg.current;if(!element)return;
    const listener=(event:WheelEvent)=>wheelRequest.current(event),observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setPlotSize([r.width,r.height]);});
    element.addEventListener('wheel',listener,{passive:false});observer.observe(element);
    return()=>{element.removeEventListener('wheel',listener);observer.disconnect();};
  },[]);
  const tickStep=geometryTickStep(Math.max(view.w,view.h)),xTicks=geometryTicks(view.x,view.x+view.w,tickStep),yTicks=geometryTicks(view.y,view.y+view.h,tickStep);
  const font=12/Math.max(1e-12,Math.min(plotSize[0]/view.w,plotSize[1]/view.h));
  const finish=()=>{if(drag.current){checkpoint(drag.current.snapshot);setTileSpecs(undefined);drag.current=null;}};
  const save=()=>attempt(()=>{
    if(fields.current?.querySelector('[aria-invalid="true"]'))throw Error('请先修正输入值。');
    const concave=tiles.some(tile=>!isConvexTile(tile));
    const mesh=assembleTiles(tileSpecs?embedTilingSpecs(tileSpecs).map(item=>item.points):tiles,concave||params.customOutput==='tiling');
    if(customLattice){const [u,v]=lattice;if(lattice.some(p=>p.some(x=>!Number.isFinite(x)||Math.abs(x)>20))||Math.abs(u[0]*v[1]-u[1]*v[0])<1e-8)throw Error('周期向量须在 −20 至 20 之间，且不能共线。');}
    const output=concave?'tiling':params.customOutput;
    if(signedRanges){
      if(!customLattice||[...range1,...range2].some(value=>!Number.isInteger(value)||Math.abs(value)>64)||range1[0]>range1[1]||range2[0]>range2[1])throw Error('正负格点范围须有自定义双格矢，且起点不大于终点。');
      const count=mesh.faces.length*(range1[1]-range1[0]+1)*(range2[1]-range2[0]+1);
      if(count>(output==='tile-twists'?36:192))throw Error(`当前输出最多支持 ${output==='tile-twists'?36:192} 个格点拼块；本设置将生成 ${count} 个。`);
    }
    const nextLattice=customLattice?structuredClone(lattice):undefined;
    const nextRange1=signedRanges?structuredClone(range1):undefined,nextRange2=signedRanges?structuredClone(range2):undefined;
    const nextRepeatX=signedRanges?1:params.repeatX,nextRepeatY=signedRanges?1:params.repeatY;
    const sameMesh=mesh.vertices.length===params.vertices.length&&mesh.faces.length===params.faces.length&&
      mesh.vertices.every((point,i)=>point.every((value,j)=>Math.abs(value-params.vertices[i][j])<=1e-8))&&
      mesh.faces.every((face,i)=>face.length===params.faces[i].length&&face.every((vertex,j)=>vertex===params.faces[i][j]));
    const sourceOnly=sameMesh&&output===params.customOutput&&nextRepeatX===params.repeatX&&nextRepeatY===params.repeatY&&
      JSON.stringify(nextLattice)===JSON.stringify(params.lattice)&&JSON.stringify(nextRange1)===JSON.stringify(params.range1)&&
      JSON.stringify(nextRange2)===JSON.stringify(params.range2);
    onApply(sourceOnly?{tileSpecs:tileSpecs?structuredClone(tileSpecs):undefined}:
      {...mesh,tileSpecs:tileSpecs?structuredClone(tileSpecs):undefined,lattice:nextLattice,
        range1:nextRange1,range2:nextRange2,repeatX:nextRepeatX,repeatY:nextRepeatY,customOutput:output});onClose();
  });
  return <TessDialog title="拼块组合" onClose={onClose}>
    <div className="tile-assembly-tools">
      <label>拼块 <select aria-label="选中拼块" value={selected} onChange={e=>{setSelected(Number(e.target.value));setSelection([Number(e.target.value)]);setEdge(0);setJoining(false);}}>{tiles.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
      <label>边 <select aria-label="选中拼块边" value={edge} onChange={e=>{setEdge(Number(e.target.value));setJoining(false);}}>{chosen.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
      <button onClick={copyGroup}>复制拼块</button><button onClick={()=>{setSelection(tiles.map((_,i)=>i));setJoining(false);}}>全选拼块</button>
      <button onClick={()=>attempt(reflectGroup)}>沿边镜像复制</button>
      <button aria-pressed={joining} onClick={()=>setJoining(!joining)}>{joining?'取消对接':'对接到边'}</button>
      <button disabled={selection.length===tiles.length} onClick={()=>{update(tiles.filter((_,i)=>!selection.includes(i)));setSelected(0);setSelection([0]);setEdge(0);}}>删除拼块</button>
      <button disabled={!undoCount} onClick={undo}>撤销拼块修改</button>
      <button title="含 JoinTiling 与 JoinTilingPatches 整组对接" onClick={()=>setSpecEdit(true)}>原版 tilespec／整组对接</button>
      <button onClick={()=>setView(bounds(tiles))}>适合组合</button>
      <button aria-label="组合视图缩小" onClick={()=>zoom(1.25)}>−</button><button aria-label="组合视图放大" onClick={()=>zoom(.8)}>＋</button>
      <button aria-pressed={panMode} onClick={()=>setPanMode(!panMode)}>平移组合视图</button>
      <label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/>组合网格</label>
    </div>
    <svg ref={svg} className="tile-assembly-canvas" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-label="拼块组合画布" onPointerDown={e=>{
      if((e.button!==0&&e.button!==1)||drag.current||pan.current)return;const data=(e.target as SVGElement).dataset;
      if(e.button===1||e.altKey||panMode||data.tile===undefined){const inverse=e.currentTarget.getScreenCTM()?.inverse();if(!inverse)return;pan.current={pointer:e.pointerId,start:locate(e.clientX,e.clientY),view:{...view},inverse};e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);return;}
      const index=Number(data.tile),nextEdge=data.edge===undefined?0:Number(data.edge);
      if(joining){if(selection.includes(index)){setError('请选择选区外拼块的目标边。');return;}attempt(()=>{const joined=joinTileGroup(selection.map(i=>tiles[i]),selection.indexOf(selected),edge,tiles[index],nextEdge,scaleToFit);update(tiles.map((tile,i)=>selection.includes(i)?joined[selection.indexOf(i)]:tile));setEdge(0);});return;}
      if(e.shiftKey){const next=selection.includes(index)?selection.filter(i=>i!==index):[...selection,index];if(next.length){setSelection(next);setSelected(next.includes(index)?index:next[0]);setEdge(nextEdge);}return;}
      const active=selection.includes(index)?selection:[index];setSelection(active);setSelected(index);setEdge(nextEdge);setError('');
      if(data.edge===undefined){drag.current={indices:active,point:locate(e.clientX,e.clientY),snapshot:tiles};e.currentTarget.setPointerCapture(e.pointerId);}
    }} onPointerMove={e=>{
      const movingView=pan.current;if(movingView){if(movingView.pointer!==e.pointerId)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(movingView.inverse);setView({...movingView.view,x:movingView.view.x+movingView.start[0]-p.x,y:movingView.view.y+movingView.start[1]-p.y});return;}
      const state=drag.current;if(!state)return;const p=locate(e.clientX,e.clientY),offset:XY=[p[0]-state.point[0],p[1]-state.point[1]];
      const moving=state.indices.flatMap(i=>transformTile(state.snapshot[i],offset));let best=view.w/Math.max(svg.current!.clientWidth,1)*8,snap:XY=[0,0];
      for(const q of moving)for(const [i,tile] of state.snapshot.entries())if(!state.indices.includes(i))for(const v of tile){const d=Math.hypot(q[0]-v[0],q[1]-v[1]);if(d<best){best=d;snap=[v[0]-q[0],v[1]-q[1]];}}
      setTiles(state.snapshot.map((t,i)=>state.indices.includes(i)?transformTile(t,[offset[0]+snap[0],offset[1]+snap[1]]):t));
    }} onPointerUp={e=>{if(pan.current?.pointer===e.pointerId)pan.current=null;finish();}} onPointerCancel={()=>{if(pan.current){setView(pan.current.view);pan.current=null;}if(drag.current){setTiles(drag.current.snapshot);drag.current=null;}}} onLostPointerCapture={()=>{pan.current=null;finish();}}>
      {grid&&<g pointerEvents="none" stroke="var(--line,#d9e1db)" strokeWidth={.6}>{xTicks.map(x=><line key={'grid-x'+x} x1={x} y1={view.y} x2={x} y2={view.y+view.h} vectorEffect="non-scaling-stroke"/>)}{yTicks.map(y=><line key={'grid-y'+y} x1={view.x} y1={y} x2={view.x+view.w} y2={y} vectorEffect="non-scaling-stroke"/>)}</g>}
      <g pointerEvents="none" fill="none" stroke="#202124" strokeWidth={1} opacity={.65}>{initial.current.map((tile,i)=><polygon key={'original'+i} points={tile.map(p=>p.join(',')).join(' ')} vectorEffect="non-scaling-stroke"/>)}</g>
      {tiles.map((tile,i)=><g key={i}><polygon data-tile={i} points={tile.map(p=>p.join(',')).join(' ')} fill={selection.includes(i)?'#cff0f1':'#eee7f5'} stroke={selection.includes(i)?'#009eae':'#8b4bc0'} strokeWidth={1.5} vectorEffect="non-scaling-stroke"/>{tile.map((a,j)=>{const b=tile[(j+1)%tile.length];return <line key={j} data-tile={i} data-edge={j} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={i===selected&&j===edge?'#009eae':'transparent'} strokeWidth={i===selected&&j===edge?4:9} vectorEffect="non-scaling-stroke"><title>拼块 {i+1} · 边 {j+1}</title></line>;})}<text x={tileCenter(tile)[0]} y={tileCenter(tile)[1]} textAnchor="middle" dominantBaseline="middle" fontSize={font} pointerEvents="none">{i+1}</text></g>)}
      <g pointerEvents="none" fill="var(--muted,#536b5d)" fontSize={font} aria-label="组合原坐标刻度"><line x1={view.x} y1={view.y+view.h-font*1.7} x2={view.x+view.w} y2={view.y+view.h-font*1.7} stroke="currentColor" vectorEffect="non-scaling-stroke"/><line x1={view.x+font*2.8} y1={view.y} x2={view.x+font*2.8} y2={view.y+view.h} stroke="currentColor" vectorEffect="non-scaling-stroke"/>{xTicks.filter(x=>x>view.x+font*3.5&&x<view.x+view.w-font).map(x=><text key={'tick-x'+x} x={x} y={view.y+view.h-font*.5} textAnchor="middle">{geometryNumber(x,tickStep)}</text>)}{yTicks.filter(y=>y>view.y+font&&y<view.y+view.h-font*2).map(y=><text key={'tick-y'+y} x={view.x+font*.3} y={y}>{geometryNumber(y,tickStep)}</text>)}<text x={view.x+view.w-font*.5} y={view.y+font*1.2} textAnchor="end">原坐标 X / Y</text></g>
    </svg>
    <div ref={fields}>
      <div className="tile-assembly-tools">
        <NumberField label="中心 X" value={center[0]} min={-10} max={10} step={.01} onChange={x=>transform([x-center[0],0])}/>
        <NumberField label="中心 Y" value={center[1]} min={-10} max={10} step={.01} onChange={y=>transform([0,y-center[1]])}/>
        <NumberField label="转角" value={angle} min={-360} max={360} step={.1} onChange={setAngle}/>
        <button onClick={()=>transform([0,0],angle)}>旋转拼块</button>
        <button onClick={()=>transform([0,0],0,true)}>镜像拼块</button>
        <NumberField label="缩放倍率" value={scale} min={.01} max={10} step={.01} onChange={setScale}/>
        <button onClick={()=>transform([0,0],0,false,scale)}>缩放选中组</button>
        <label><input type="checkbox" checked={scaleToFit} onChange={e=>setScaleToFit(e.target.checked)}/>按边长缩放</label>
        <button disabled={selection.length!==1} onClick={()=>setEdit(true)}>编辑拼块形状</button>
      </div>
      <div className="tile-assembly-tools">
        <label>新增边数 <select aria-label="新增拼块边数" value={sides} onChange={e=>setSides(Number(e.target.value))}>{Array.from({length:22},(_,i)=>i+3).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <button onClick={()=>attempt(()=>add(regularTileAtEdge(sides,chosen,edge)))}>沿选边添加</button>
        <label>星尖数 <select aria-label="星尖数" value={starPoints} onChange={e=>{const n=Number(e.target.value);setStarPoints(n);setStarTip(old=>Math.min(old,360-360/n-.1));}}>{Array.from({length:10},(_,i)=>i+3).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <NumberField label="星尖角" value={starTip} min={1} max={360-360/starPoints-.1} step={.1} onChange={setStarTip}/>
        <button onClick={()=>attempt(()=>{update([unitStarTile(starPoints,starTip)],true);setSelected(0);setSelection([0]);setEdge(0);})}>新建单位星形</button>
        <button onClick={()=>attempt(()=>add(starTileAtEdge(starPoints,starTip,chosen,edge)))}>沿选边添加星形</button>
        <button disabled={!selectedStar||selection.length!==1} title={selectedStar?`按轮廓匹配为 ${selectedStar.points} 尖、${Number(selectedStar.tipDegrees.toFixed(4))}°；不能判断原创建方式。修改星尖参数后点击，首边和接缝保持不动。`:'仅可重设匹配正星形轮廓的拼块'} onClick={()=>attempt(()=>replace(reshapeStarTile(chosen,starPoints,starTip)))}>按星尖参数重设</button>
        {selectedStar&&<small aria-label="几何匹配星形参数">匹配 {selectedStar.points} 尖 · {Number(selectedStar.tipDegrees.toFixed(3))}°</small>}
        <label><input type="checkbox" checked={customLattice} onChange={e=>{setCustomLattice(e.target.checked);if(!e.target.checked)setSignedRanges(false);}}/>自定义周期向量</label>
        {customLattice&&<div className="tile-lattice">{lattice.flatMap((p,i)=>p.map((value,j)=><NumberField key={`${i}-${j}`} label={`${i===0?'U':'V'} ${j===0?'X':'Y'}`} value={value} min={-20} max={20} step={.01} onChange={n=>setLattice(old=>old.map((v,k)=>v.map((x,m)=>k===i&&m===j?n:x)) as [XY,XY])}/>))}</div>}
        {customLattice&&<details className="tile-patch-vectors" onToggle={event=>setVectorPickerOpen(event.currentTarget.open)}><summary>按原版顶点引用求 U/V</summary>{vectorPickerOpen&&<div className="tile-assembly-tools">{(['共同起点','U 终点','V 终点'] as const).map((label,i)=><label key={label}>{label}<select aria-label={`周期向量${label}`} value={vectorRefs[i]} onChange={e=>setVectorRefs(old=>old.map((value,k)=>k===i?e.target.value:value) as [string,string,string])}>{vertexRefs.map(ref=><option key={ref.id} value={ref.id}>{ref.label}</option>)}</select></label>)}<button onClick={applyPatchVectors}>使用顶点差</button></div>}</details>}
        {customLattice&&<label><input type="checkbox" checked={signedRanges} onChange={e=>setSignedRanges(e.target.checked)}/>正负格点范围</label>}
        {customLattice&&signedRanges&&<div className="tile-lattice" aria-label="原版格点指数范围">{[range1,range2].flatMap((range,i)=>range.map((value,j)=><NumberField key={`${i}-${j}`} label={`${i===0?'U':'V'} ${j===0?'起':'终'}`} value={value} min={-64} max={64} step={1} onChange={n=>(i===0?setRange1:setRange2)(old=>old.map((v,k)=>k===j?n:v) as [number,number])}/>))}</div>}
      </div>
    </div>
    <p className="tile-assembly-status" role="status">{error||(tiles.some(tile=>!isConvexTile(tile))?'凹轮廓保存为母结构排布；尚未构造其扭转折痕。':joining?`点击选区外的目标边，${scaleToFit?'等比缩放':'刚性移动'}选中组对接。`:'Shift 增减选区；拖拼块移动整组，拖空白平移视图，滚轮围绕鼠标缩放；单击边指定对接位置。')}</p>
    <footer><span>{tiles.length} 块 · 选中 {selection.length} 块</span><button className="primary" onClick={save}>采用拼块组合</button></footer>
    {edit&&<TessellationEditor title="编辑拼块形状" min={-10} max={10} initial={chosen} minPoints={3} maxPoints={24} editablePoints orderedPath="closed" allowConcave mother={{vertices_coords:chosen,edges_vertices:chosen.map((_,i)=>[i,(i+1)%chosen.length]),faces_vertices:[],edges_assignment:chosen.map(()=> 'B')}} onApply={points=>replace(ccwTile(points))} onClose={()=>setEdit(false)}/>}
    {specEdit&&<TileSpecEditor tiles={tiles} initialSpecs={tileSpecs} onApply={(next,specs)=>{update(next,true,specs);setEdge(0);}} onClose={()=>setSpecEdit(false)}/>}
  </TessDialog>;
}
