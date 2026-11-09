import {useState} from 'react';
import {assembleTiles,starTileParameters,tileCenter,unitStarTile,type Tile} from '../app/tileAssembly';
import {joinTilingPatches,type PatchInfo,type PatchJoin} from '../app/joinTilingPatches';
import {archimedeanPatch6TileSpecs,embedTilingSpecs,tileToSpec,unitCairoPentagonTileVertices,unitRegularPolygonTileVertices,unitTriangleTileVertices,type TileSpec} from '../app/tileSpecs';
import {unitCyclicPolygonVertices} from '../app/unitCyclicPolygon';
import type {XY} from '../app/tessellation';
import {NumberField} from './Fields';
import {TessDialog} from './TessellationEditor';

type Join=NonNullable<TileSpec['join']>;
const fresh=(tiles:Tile[])=>tiles.map(tileToSpec);
const numeric=(value:number)=>Number(value.toFixed(6));
const cornerAngle=(tile:Tile,index:number)=>{
  const point=tile[index],before=tile[(index+tile.length-1)%tile.length],after=tile[(index+1)%tile.length];
  const ax=before[0]-point[0],ay=before[1]-point[1],bx=after[0]-point[0],by=after[1]-point[1];
  return Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)))))*180/Math.PI;
};

export default function TileSpecEditor({tiles,initialSpecs,onApply,onClose}:{tiles:Tile[];initialSpecs?:TileSpec[];onApply:(tiles:Tile[],specs:TileSpec[])=>void;onClose:()=>void}){
  const [specs,setSpecs]=useState<TileSpec[]>(()=>structuredClone(initialSpecs??fresh(tiles)));
  const [selected,setSelected]=useState(0),[showVertices,setShowVertices]=useState(false),[showTiles,setShowTiles]=useState(true),[error,setError]=useState('');
  const [patchMode,setPatchMode]=useState(false),[patchSizesText,setPatchSizesText]=useState(tiles.length>1?`1,${tiles.length-1}`:'1');
  const [patchSelection,setPatchSelection]=useState(1),[patchJoins,setPatchJoins]=useState<PatchJoin[]>([]);
  const patch6Source=archimedeanPatch6TileSpecs(tiles);
  const spec=specs[selected],join=spec.join;
  const change=(patch:Partial<TileSpec>)=>{setSpecs(old=>old.map((item,i)=>{if(i!==selected)return item;const next={...item,...patch};if('join' in patch&&!patch.join)delete next.join;return next;}));setError('');};
  const changeJoin=(patch:Partial<Join>)=>{if(join)change({join:{...join,...patch}});};
  const mode=(kind:'absolute'|'vertex'|'edge')=>change({
    join:kind==='absolute'?undefined:{kind,targetTile:Math.max(0,selected-1),targetVertex:1,sourceVertex:0,extraOffset:[0,0]},
    ...(kind==='edge'?{rotation:0,scale:1}:{}),
  });
  const validSizes=/^\s*[1-9]\d*(?:\s*,\s*[1-9]\d*)*\s*$/.test(patchSizesText);
  const patchSizes=validSizes?patchSizesText.split(',').map(Number):[];
  const patchSizesValid=patchSizes.length>=2&&patchSizes.reduce((sum,size)=>sum+size,0)===specs.length;
  const groups:TileSpec[][]=[];
  if(patchSizesValid){let start=0;for(const size of patchSizes){groups.push(specs.slice(start,start+size));start+=size;}}
  const chosenPatch=Math.min(patchSelection,groups.length-1);
  const currentPatchJoin=patchJoins[chosenPatch-1]??{targetPatch:0,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0};
  const changePatchJoin=(patch:Partial<PatchJoin>)=>setPatchJoins(old=>{
    const next=[...old];next[chosenPatch-1]={...currentPatchJoin,...patch};return next;
  });
  let patchSpecs:TileSpec[]|null=null,patchError='';
  if(patchMode){
    if(!patchSizesValid)patchError=`分组块数须为至少两组正整数，合计 ${specs.length} 块。`;
    else try{patchSpecs=joinTilingPatches(groups.map((tiles,index):PatchInfo=>({
      tiles,...(index>0?{join:patchJoins[index-1]??{targetPatch:0,targetTile:0,targetVertex:1,sourceTile:0,sourceVertex:0}}:{}),
    })));}catch(cause){patchError=(cause as Error).message;}
  }
  const activeSpecs=patchSpecs??specs;
  let placed:ReturnType<typeof embedTilingSpecs>=[],previewError='';
  try{placed=embedTilingSpecs(activeSpecs);}catch(cause){previewError=(cause as Error).message;}
  const polygons=placed.length===specs.length?placed.map(item=>item.points):tiles;
  const setTiletype=(tiletype:TileSpec['tiletype'])=>{
    if(tiletype==='PolygonTile'){
      setSpecs(old=>old.map((item,i)=>{
        if(i!==selected)return item;
        const {angles:_angles,sides:_sides,starPoints:_starPoints,tipDegrees:_tipDegrees,cairoAngle:_cairoAngle,cyclicAngles:_cyclicAngles,cyclicSide:_cyclicSide,cyclicSideIndex:_cyclicSideIndex,...polygon}=item;
        return {...polygon,tiletype:'PolygonTile'};
      }));setError('');return;
    }
    const polygon=polygons[selected];
    if(tiletype==='UnitRegularStarPolygonTile'){
      const source=starTileParameters(polygon);
      if(!source){setError('仅非自交、符合原版单位正星形轮廓的拼块可转换为 UnitRegularStarPolygonTile。');return;}
      const origin=polygon[0],end=polygon[1],dx=end[0]-origin[0],dy=end[1]-origin[1];
      setSpecs(old=>old.map((item,i)=>{
        if(i!==selected)return item;
        const {angles:_angles,sides:_sides,cairoAngle:_cairoAngle,cyclicAngles:_cyclicAngles,cyclicSide:_cyclicSide,cyclicSideIndex:_cyclicSideIndex,...rest}=item;
        return {...rest,tiletype:'UnitRegularStarPolygonTile',starPoints:source.points,tipDegrees:source.tipDegrees,
          vertices:unitStarTile(source.points,source.tipDegrees),offset:[...origin] as XY,
          rotation:Math.atan2(dy,dx)*180/Math.PI,scale:Math.hypot(dx,dy)};
      }));setError('');return;
    }
    if(tiletype==='UnitRegularPolygonTile'){
      try{
        const sides=polygon.length,vertices=unitRegularPolygonTileVertices(sides);
        const [origin,end]=polygon,dx=end[0]-origin[0],dy=end[1]-origin[1],scale=Math.hypot(dx,dy);
        if(scale<1e-9)throw Error('单位正多边形的首边不能为零。');
        const c=dx/scale,s=dy/scale;
        if(vertices.some(([x,y],i)=>Math.hypot(origin[0]+scale*(c*x-s*y)-polygon[i][0],origin[1]+scale*(s*x+c*y)-polygon[i][1])>Math.max(1e-8,scale*1e-7)))
          throw Error('仅规则正多边形可转换为原版 UnitRegularPolygonTile；可先调整拼块顶点。');
        setSpecs(old=>old.map((item,i)=>{
          if(i!==selected)return item;
          const {angles:_angles,starPoints:_starPoints,tipDegrees:_tipDegrees,cairoAngle:_cairoAngle,cyclicAngles:_cyclicAngles,cyclicSide:_cyclicSide,cyclicSideIndex:_cyclicSideIndex,...rest}=item;
          return {...rest,tiletype:'UnitRegularPolygonTile',sides,vertices,offset:[...origin] as XY,
            rotation:Math.atan2(dy,dx)*180/Math.PI,scale};
        }));setError('');
      }catch(cause){setError((cause as Error).message);}
      return;
    }
    if(tiletype==='UnitCairoPentagonTile'){
      try{
        const origin=polygon[0],end=polygon[1];
        const dx=end[0]-origin[0],dy=end[1]-origin[1],scale=Math.hypot(dx,dy);
        if(scale<1e-9)throw Error('Cairo 单位五边形的首边不能为零。');
        const cairoAngle=polygon.length===5&&cornerAngle(polygon,0)>60&&cornerAngle(polygon,0)<120?
          numeric(cornerAngle(polygon,0)):90;
        const vertices=unitCairoPentagonTileVertices(cairoAngle);
        setSpecs(old=>old.map((item,i)=>{
          if(i!==selected)return item;
          const {angles:_angles,sides:_sides,starPoints:_starPoints,tipDegrees:_tipDegrees,cyclicAngles:_cyclicAngles,cyclicSide:_cyclicSide,cyclicSideIndex:_cyclicSideIndex,...rest}=item;
          return {...rest,tiletype:'UnitCairoPentagonTile',cairoAngle,vertices,offset:[...origin] as XY,
            rotation:Math.atan2(dy,dx)*180/Math.PI,scale};
        }));setError('');
      }catch(cause){setError((cause as Error).message);}
      return;
    }
    if(tiletype==='UnitCyclicPolygonTile'){
      try{
        const n=polygon.length;
        if(n<3||n>24)throw Error('圆内接母多边形须为 3–24 边。');
        const edge=Math.hypot(polygon[1][0]-polygon[0][0],polygon[1][1]-polygon[0][1]);
        if(edge<1e-9)throw Error('圆内接母多边形首边不能为零。');
        const cyclicAngles=polygon.map((_,i)=>cornerAngle(polygon,i));
        const cyclicSide=n%2?1:Math.hypot(polygon[2][0]-polygon[1][0],polygon[2][1]-polygon[1][1])/edge;
        const cyclicSideIndex=2,vertices=unitCyclicPolygonVertices(cyclicAngles,cyclicSide,cyclicSideIndex);
        const rotation=Math.atan2(polygon[1][1]-polygon[0][1],polygon[1][0]-polygon[0][0])*180/Math.PI;
        const c=Math.cos(rotation*Math.PI/180),s=Math.sin(rotation*Math.PI/180);
        if(vertices.some(([x,y],i)=>Math.hypot(polygon[0][0]+edge*(c*x-s*y)-polygon[i][0],
          polygon[0][1]+edge*(s*x+c*y)-polygon[i][1])>Math.max(1e-8,edge*1e-7)))
          throw Error('当前拼块不是严格凸的圆内接多边形；请先选择规则多边形或修改顶点。');
        setSpecs(old=>old.map((item,i)=>{
          if(i!==selected)return item;
          const {angles:_angles,sides:_sides,starPoints:_starPoints,tipDegrees:_tipDegrees,cairoAngle:_cairoAngle,...rest}=item;
          return {...rest,tiletype:'UnitCyclicPolygonTile',cyclicAngles,cyclicSide,cyclicSideIndex,
            vertices,offset:[...polygon[0]] as XY,rotation,scale:edge};
        }));setError('');
      }catch(cause){setError((cause as Error).message);}
      return;
    }
    if(polygon.length!==3){setError('仅三角形拼块能转为原版 UnitTriangleTile。');return;}
    const signedArea=(polygon[1][0]-polygon[0][0])*(polygon[2][1]-polygon[0][1])-
      (polygon[1][1]-polygon[0][1])*(polygon[2][0]-polygon[0][0]);
    if(signedArea<=1e-10){setError('UnitTriangleTile 需要逆时针的非退化三角形。');return;}
    const angles:[number,number,number]=[cornerAngle(polygon,0),cornerAngle(polygon,1),cornerAngle(polygon,2)];
    try{
      const vertices=unitTriangleTileVertices(angles);
      const dx=polygon[1][0]-polygon[0][0],dy=polygon[1][1]-polygon[0][1];
      setSpecs(old=>old.map((item,i)=>{
        if(i!==selected)return item;
        const {sides:_sides,starPoints:_starPoints,tipDegrees:_tipDegrees,cairoAngle:_cairoAngle,cyclicAngles:_cyclicAngles,cyclicSide:_cyclicSide,cyclicSideIndex:_cyclicSideIndex,...rest}=item;
        return {...rest,tiletype:'UnitTriangleTile',angles,vertices,offset:[...polygon[0]] as XY,
          rotation:Math.atan2(dy,dx)*180/Math.PI,scale:Math.hypot(dx,dy)};
      }));setError('');
    }catch(cause){setError((cause as Error).message);}
  };
  const setTriangleAngle=(index:0|1,value:number)=>{
    if(!spec.angles)return;
    const angles:[number,number,number]=[...spec.angles];
    angles[index]=value;angles[2]=180-angles[0]-angles[1];
    try{change({angles,vertices:unitTriangleTileVertices(angles)});}
    catch(cause){setError((cause as Error).message);}
  };
  const setRegularSides=(sides:number)=>{
    try{change({sides,vertices:unitRegularPolygonTileVertices(sides)});}
    catch(cause){setError((cause as Error).message);}
  };
  const setStarPoints=(starPoints:number)=>{
    const tipDegrees=Math.min(spec.tipDegrees??36,360-360/starPoints-.1);
    try{change({starPoints,tipDegrees,vertices:unitStarTile(starPoints,tipDegrees)});}
    catch(cause){setError((cause as Error).message);}
  };
  const setStarTip=(tipDegrees:number)=>{
    try{change({tipDegrees,vertices:unitStarTile(spec.starPoints!,tipDegrees)});}
    catch(cause){setError((cause as Error).message);}
  };
  const setCairoAngle=(cairoAngle:number)=>{
    try{change({cairoAngle,vertices:unitCairoPentagonTileVertices(cairoAngle)});}
    catch(cause){setError((cause as Error).message);}
  };
  const setCyclic=(cyclicAngles:number[],cyclicSide=spec.cyclicSide??1,
    cyclicSideIndex=spec.cyclicSideIndex??2)=>{
    try{change({cyclicAngles,cyclicSide,cyclicSideIndex,
      vertices:unitCyclicPolygonVertices(cyclicAngles,cyclicSide,cyclicSideIndex)});}
    catch(cause){setError((cause as Error).message);}
  };
  const setCyclicSides=(sides:number)=>{
    if(!Number.isInteger(sides)||sides<3||sides>24)return;
    setCyclic(Array(sides).fill((sides-2)*180/sides),1,2);
  };
  const points=polygons.flat(),minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
  const width=Math.max(...points.map(p=>p[0]))-minX,height=Math.max(...points.map(p=>p[1]))-minY;
  const span=Math.max(width,height,.1),pad=span*.16;
  const adopt=()=>{
    try{
      if(patchError||previewError)throw Error(patchError||previewError);
      assembleTiles(polygons,true);
      onApply(polygons,structuredClone(activeSpecs));onClose();
    }catch(cause){setError((cause as Error).message);}
  };
  const offsetField=(axis:0|1,label:string,value:XY,changeValue:(next:XY)=>void)=><NumberField label={label} value={value[axis]} min={-20} max={20} step={.01} onChange={next=>changeValue(axis===0?[next,value[1]]:[value[0],next])}/>;
  return <TessDialog title="原版 2D tilespec 拼块变换" onClose={onClose}>
    <p className="note">数值二维拼块来源、单块与整组对接即时预览；Cairo 与圆内接来源按原版公式重建单位首边。采用后保存为可严格回读的 tilespec。</p>
    <div className="tile-spec-controls"><label><input type="checkbox" aria-label="整组拼块对接" checked={patchMode} disabled={specs.length<2} onChange={event=>{setPatchMode(event.target.checked);setError('');}}/>整组拼块对接</label>
      {patch6Source&&<button title="In[3124–3126]/In[3182]：两正三角形与一正方形，保留原版两次 JoinTiling 引用" onClick={()=>{setSpecs(structuredClone(patch6Source));setPatchMode(false);setSelected(0);setError('');}}>套用 3.3.3.4.4 来源</button>}
      {patchMode&&<><label>分组块数 <input aria-label="整组拼接分组" type="text" value={patchSizesText} onChange={event=>{setPatchSizesText(event.target.value);setError('');}} style={{width:110}} placeholder="1,3,3"/></label>
        <span className="note">按拼块顺序分组；组内原有对接仍有效</span></>}
    </div>
    {patchMode&&groups.length>1&&<div className="tile-spec-controls" aria-label="整组拼接控制">
      <label>待接组 <select aria-label="整组待接组" value={chosenPatch} onChange={event=>{setPatchSelection(Number(event.target.value));setError('');}}>{groups.slice(1).map((_,index)=><option key={index} value={index+1}>第 {index+2} 组 · {groups[index+1].length} 块</option>)}</select></label>
      <label>目标组 h <select aria-label="整组目标组" value={currentPatchJoin.targetPatch} onChange={event=>changePatchJoin({targetPatch:Number(event.target.value),targetTile:0,targetVertex:1})}>{groups.slice(0,chosenPatch).map((_,index)=><option key={index} value={index}>{index+1}</option>)}</select></label>
      <label>目标块 i <select aria-label="整组目标块" value={currentPatchJoin.targetTile} onChange={event=>changePatchJoin({targetTile:Number(event.target.value),targetVertex:1})}>{groups[currentPatchJoin.targetPatch]?.map((_,index)=><option key={index} value={index}>{index+1}</option>)}</select></label>
      <label>目标点 j <select aria-label="整组目标点" value={currentPatchJoin.targetVertex} onChange={event=>changePatchJoin({targetVertex:Number(event.target.value)})}>{groups[currentPatchJoin.targetPatch]?.[currentPatchJoin.targetTile]?.vertices.map((_,index)=><option key={index} value={index}>{index+1}</option>)}</select></label>
      <label>本组块 k <select aria-label="整组本组块" value={currentPatchJoin.sourceTile} onChange={event=>changePatchJoin({sourceTile:Number(event.target.value),sourceVertex:0})}>{groups[chosenPatch].map((_,index)=><option key={index} value={index}>{index+1}</option>)}</select></label>
      <label>本组点 l <select aria-label="整组本组点" value={currentPatchJoin.sourceVertex} onChange={event=>changePatchJoin({sourceVertex:Number(event.target.value)})}>{groups[chosenPatch][currentPatchJoin.sourceTile]?.vertices.map((_,index)=><option key={index} value={index}>{index+1}</option>)}</select></label>
    </div>}
    {!patchMode&&<div className="tile-spec-controls">
      <label>拼块 <select aria-label="tilespec 拼块" value={selected} onChange={event=>{setSelected(Number(event.target.value));setError('');}}>{specs.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
      <label>原版类型 <select aria-label="tilespec 原版类型" value={spec.tiletype} onChange={event=>setTiletype(event.target.value as TileSpec['tiletype'])}><option value="PolygonTile">PolygonTile 顶点</option><option value="UnitTriangleTile">UnitTriangleTile 内角</option><option value="UnitRegularPolygonTile">UnitRegularPolygonTile 边数</option><option value="UnitRegularStarPolygonTile">UnitRegularStarPolygonTile 尖角</option><option value="UnitCairoPentagonTile">UnitCairoPentagonTile 底角</option><option value="UnitCyclicPolygonTile">圆内接母多边形 · In[378]</option></select></label>
      {spec.tiletype==='UnitTriangleTile'&&spec.angles&&<><NumberField label="内角 A°" value={numeric(spec.angles[0])} min={1.001} max={177.999} step={.1} onChange={value=>setTriangleAngle(0,value)}/><NumberField label="内角 B°" value={numeric(spec.angles[1])} min={1.001} max={177.999} step={.1} onChange={value=>setTriangleAngle(1,value)}/><span className="note">内角 C {numeric(spec.angles[2])}°</span></>}
      {spec.tiletype==='UnitRegularPolygonTile'&&spec.sides&&<NumberField label="边数 n" value={spec.sides} min={3} max={24} step={1} onChange={setRegularSides}/>}
      {spec.tiletype==='UnitRegularStarPolygonTile'&&spec.starPoints&&spec.tipDegrees!==undefined&&<><NumberField label="星尖数 n" value={spec.starPoints} min={3} max={12} step={1} onChange={setStarPoints}/><NumberField label="星尖角 α°" value={numeric(spec.tipDegrees)} min={1} max={360-360/spec.starPoints-.1} step={.1} onChange={setStarTip}/></>}
      {spec.tiletype==='UnitCairoPentagonTile'&&spec.cairoAngle!==undefined&&<NumberField label="底角 δ°" value={numeric(spec.cairoAngle)} min={60.1} max={119.9} step={.1} onChange={setCairoAngle}/>}
      {spec.tiletype==='UnitCyclicPolygonTile'&&spec.cyclicAngles&&<>
        <NumberField label="圆内接边数 n" value={spec.cyclicAngles.length} min={3} max={24} step={1} onChange={setCyclicSides}/>
        {spec.cyclicAngles.slice(0,spec.cyclicAngles.length%2?spec.cyclicAngles.length-1:spec.cyclicAngles.length-2).map((angle,index)=><NumberField key={index} label={`内角 ${index+1}°`} value={numeric(angle)} min={1} max={179} step={.1} onChange={value=>{const next=[...spec.cyclicAngles!];next[index]=value;setCyclic(next);}}/>)}
        {spec.cyclicAngles.length%2===0&&<><NumberField label="定长边" value={spec.cyclicSide??1} min={.05} max={5} step={.01} onChange={value=>setCyclic(spec.cyclicAngles!,value)}/>
          <label>定长边号<select aria-label="圆内接定长边号" value={spec.cyclicSideIndex??2} onChange={event=>setCyclic(spec.cyclicAngles!,spec.cyclicSide,Number(event.target.value))}>{Array.from({length:spec.cyclicAngles.length-1},(_,i)=><option key={i} value={i+2}>{i+2}</option>)}</select></label></>}
        <span className="note">末{spec.cyclicAngles.length%2?'一':'两'}角按原版闭合公式重算；仅母多边形来源。</span>
      </>}
      <label>定位 <select aria-label="tilespec 定位方式" value={join?.kind??'absolute'} onChange={event=>mode(event.target.value as 'absolute'|'vertex'|'edge')}><option value="absolute">绝对位移</option><option value="vertex" disabled={selected===0}>顶点对接 −k</option><option value="edge" disabled={selected===0}>共边对接 +k</option></select></label>
      {!join&&<>{offsetField(0,'位移 X',spec.offset,value=>change({offset:value}))}{offsetField(1,'位移 Y',spec.offset,value=>change({offset:value}))}</>}
      {join&&<>
        <label>目标拼块 <select aria-label="tilespec 目标拼块" value={join.targetTile} onChange={event=>changeJoin({targetTile:Number(event.target.value),targetVertex:0})}>{specs.slice(0,selected).map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        <label>目标点 j <select aria-label="tilespec 目标点" value={join.targetVertex} onChange={event=>changeJoin({targetVertex:Number(event.target.value)})}>{specs[join.targetTile].vertices.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        <label>本块点 k <select aria-label="tilespec 本块点" value={join.sourceVertex} onChange={event=>changeJoin({sourceVertex:Number(event.target.value)})}>{spec.vertices.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        {offsetField(0,'附加 X',join.extraOffset,value=>changeJoin({extraOffset:value}))}{offsetField(1,'附加 Y',join.extraOffset,value=>changeJoin({extraOffset:value}))}
      </>}
      <NumberField label="旋转 °" value={spec.rotation} min={-360} max={360} step={.1} disabled={join?.kind==='edge'} onChange={rotation=>change({rotation})}/>
      <NumberField label="缩放" value={spec.scale} min={.01} max={10} step={.01} disabled={join?.kind==='edge'} onChange={scale=>change({scale})}/>
      <button onClick={()=>{setSpecs(old=>old.map((item,i)=>i===selected?tileToSpec(tiles[i]):item));setError('');}}>还原此块</button>
      <button onClick={()=>{setSpecs(fresh(tiles));setError('');}}>还原全部</button>
    </div>}
    <div className="tile-spec-controls"><label><input type="checkbox" checked={showTiles} onChange={event=>setShowTiles(event.target.checked)}/>拼块编号</label><label><input type="checkbox" checked={showVertices} onChange={event=>setShowVertices(event.target.checked)}/>顶点编号</label><span className="note">Tiling 装饰预览；填充、箭头和折痕叠加可在“拼块装饰与编号”保存。</span></div>
    <svg className="tile-spec-preview" style={patchMode?{height:'min(230px,27vh)'}:undefined} viewBox={`${minX-pad} ${minY-pad} ${width+2*pad} ${height+2*pad}`} aria-label="tilespec 实时预览">
      {polygons.map((polygon,i)=>{const center=tileCenter(polygon);return <g key={i}>
        <polygon points={polygon.map(p=>p.join(',')).join(' ')} fill={i===selected?'#ddf4f3':'#f3ecdb'} stroke={i===selected?'#008f9c':'#9b6c31'} strokeWidth={span*.005}/>
        {showTiles&&<text x={center[0]} y={center[1]} textAnchor="middle" dominantBaseline="middle" fontSize={span*.042} fill="#1d322e">{i+1}</text>}
        {showVertices&&polygon.map((p,j)=><text key={j} x={p[0]*.8+center[0]*.2} y={p[1]*.8+center[1]*.2} textAnchor="middle" dominantBaseline="middle" fontSize={span*.027} fill="#593929">{j+1}</text>)}
      </g>;})}
    </svg>
    {!patchMode&&placed.length===specs.length&&<p className="note">第 {selected+1} 块：实际位移 ({numeric(placed[selected].offset[0])}, {numeric(placed[selected].offset[1])}) · 旋转 {numeric(placed[selected].rotation)}° · 倍率 {numeric(placed[selected].scale)}</p>}
    {patchMode&&<p className="note">第 {chosenPatch+1} 组按本组第 l 点与前一点，反向对齐目标第 j 点与后一点；整组统一等比缩放和旋转。</p>}
    <p className="tess-editor-error" role="alert">{error||patchError||previewError}</p>
    <footer><span>{specs.length} 块 · 只有共边连通且无重叠的组合可采用</span><button className="primary" disabled={!!(patchError||previewError)} onClick={adopt}>采用 tilespec 变换</button></footer>
  </TessDialog>;
}
