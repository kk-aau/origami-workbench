import type {XY} from './tessellation';
import {assembleTiles,unitStarTile,type Tile} from './tileAssembly';
import {unitTriangleMesh} from './unitTriangleSource';
import {unitCyclicPolygonVertices} from './unitCyclicPolygon';

/** Numeric and formula-derived 2D subset of Origamica's tilespec. */
export type TileSpec={
  tiletype:'PolygonTile'|'UnitTriangleTile'|'UnitRegularPolygonTile'|'UnitRegularStarPolygonTile'|'UnitCairoPentagonTile'|'UnitCyclicPolygonTile';
  vertices:Tile;
  /** Original corner-angle source, in degrees, for UnitTriangleTile only. */
  angles?:[number,number,number];
  /** Original side-count source for UnitRegularPolygonTile only. */
  sides?:number;
  /** Original {n, α} source for UnitRegularStarPolygonTile only. */
  starPoints?:number;
  tipDegrees?:number;
  /** Original Cairo base angle δ, in degrees, for UnitCairoPentagonTile only. */
  cairoAngle?:number;
  /** Numeric UnitCyclicPolygonVertices source; last 1/2 corner values are placeholders. */
  cyclicAngles?:number[];
  cyclicSide?:number;
  cyclicSideIndex?:number;
  offset:XY;
  rotation:number;
  scale:number;
  join?:{
    kind:'vertex'|'edge';
    targetTile:number;
    targetVertex:number;
    sourceVertex:number;
    extraOffset:XY;
  };
};
export type EmbeddedTileSpec={vertices:Tile;offset:XY;rotation:number;scale:number;points:Tile};

/** Canonicalize a placed polygon without changing its vertex numbers or location. */
export function tileToSpec(points:Tile):TileSpec{
  const origin=points[0];
  if(!origin)throw Error('拼块至少需要一个顶点。');
  return {tiletype:'PolygonTile',vertices:points.map(p=>[p[0]-origin[0],p[1]-origin[1]]),offset:[...origin],rotation:0,scale:1};
}

/** In[366], used by the stable UnitTriangleTile RenderTile rule in In[3021]. */
export function unitTriangleTileVertices(angles:readonly number[]):Tile{
  if(angles.length!==3||angles.some(angle=>!Number.isFinite(angle)||angle<=1||angle>=178)||
    Math.abs(angles[0]+angles[1]+angles[2]-180)>1e-8)
    throw Error('UnitTriangleTile 的三个内角须大于 1°、小于 178°，且总和为 180°。');
  return unitTriangleMesh([angles[0],angles[1],angles[2]],'single').vertices;
}

/** Origamica In[431–434]: vertex j is center - RotationMatrix[2π(j-1)/n].center. */
export function unitRegularPolygonTileVertices(sides:number):Tile{
  if(!Number.isInteger(sides)||sides<3||sides>24)
    throw Error('UnitRegularPolygonTile 的边数须为 3–24 的整数。');
  const centerX=.5,centerY=.5/Math.tan(Math.PI/sides);
  const vertices:Tile=Array.from({length:sides},(_,index)=>{
    const theta=2*Math.PI*index/sides,c=Math.cos(theta),s=Math.sin(theta);
    return [centerX-centerX*c+centerY*s,centerY-centerX*s-centerY*c];
  });
  vertices[0]=[0,0];vertices[1]=[1,0];
  return vertices;
}

/** In[3124–3126]/In[3182]: the 3.3.3.4.4 patch's two unit triangles and square. */
export function archimedeanPatch6TileSpecs(tiles:Tile[]):TileSpec[]|null{
  const unitTriangle=unitRegularPolygonTileVertices(3),unitSquare=unitRegularPolygonTileVertices(4);
  const specs:TileSpec[]=[
    {tiletype:'UnitRegularPolygonTile',sides:3,vertices:unitTriangle,offset:[0,0],rotation:0,scale:1},
    {tiletype:'UnitRegularPolygonTile',sides:3,vertices:unitTriangle,offset:[0,0],rotation:0,scale:1,
      join:{kind:'edge',targetTile:0,targetVertex:1,sourceVertex:0,extraOffset:[0,0]}},
    {tiletype:'UnitRegularPolygonTile',sides:4,vertices:unitSquare,offset:[0,0],rotation:0,scale:1,
      join:{kind:'edge',targetTile:1,targetVertex:1,sourceVertex:1,extraOffset:[0,0]}},
  ];
  if(tiles.length!==specs.length)return null;
  const placed=embedTilingSpecs(specs).map(item=>item.points);
  return placed.every((tile,i)=>tile.length===tiles[i]?.length&&tile.every((point,j)=>
    point.every((value,k)=>Number.isFinite(tiles[i][j]?.[k])&&Math.abs(value-tiles[i][j][k])<=1e-8)))?specs:null;
}

/** In[3283]: CairoPentagonAngles[δ] -> UnitEquilateralPolygonVertices[angles]. */
export function unitCairoPentagonTileVertices(cairoAngle:number):Tile{
  if(!Number.isFinite(cairoAngle)||cairoAngle<=60||cairoAngle>=120)
    throw Error('UnitCairoPentagonTile 底角 δ 须严格介于 60° 和 120°。');
  const d=cairoAngle*Math.PI/180;
  const cosine=(4*Math.cos(d)-1)/(4*Math.sin(d/2));
  const b=3*Math.PI/2-d/2-Math.acos(Math.max(-1,Math.min(1,cosine)));
  const cr=Math.cos(d)-1,ci=Math.sin(d),br=Math.cos(b),bi=Math.sin(b);
  const nr=cr*br-ci*bi+1,ni=cr*bi+ci*br;
  const dr=1+Math.cos(d),di=Math.sin(d),denominator=dr*dr+di*di;
  const ur=(nr*dr+ni*di)/denominator,ui=(ni*dr-nr*di)/denominator;
  const c=-Math.atan2(ui,ur);
  const vertices:Tile=[[0,0],[1,0]];
  for(const direction of [Math.PI-b,2*Math.PI-b-c,2*Math.PI+d-b-c]){
    const previous=vertices[vertices.length-1];
    vertices.push([previous[0]+Math.cos(direction),previous[1]+Math.sin(direction)]);
  }
  if(Math.hypot(vertices[4][0]-Math.cos(d),vertices[4][1]-Math.sin(d))>1e-8)
    throw Error('Cairo 单位五边形在此底角下未闭合。');
  return vertices;
}

function sourceVertices(spec:TileSpec):Tile{
  const cyclicFields=spec.cyclicAngles!==undefined||spec.cyclicSide!==undefined||spec.cyclicSideIndex!==undefined;
  if(spec.tiletype==='PolygonTile'){
    if(spec.angles!==undefined||spec.sides!==undefined||spec.starPoints!==undefined||spec.tipDegrees!==undefined||spec.cairoAngle!==undefined||cyclicFields)
      throw Error('PolygonTile 不能携带具名拼块参数。');
    return spec.vertices;
  }
  if(spec.tiletype==='UnitTriangleTile'){
    if(spec.angles===undefined||spec.sides!==undefined||spec.starPoints!==undefined||spec.tipDegrees!==undefined||spec.cairoAngle!==undefined||cyclicFields)
      throw Error('UnitTriangleTile 来源参数无效。');
    const derived=unitTriangleTileVertices(spec.angles);
    if(spec.vertices.length!==3||derived.some((point,i)=>point.some((value,j)=>
    !Number.isFinite(spec.vertices[i]?.[j])||Math.abs(value-spec.vertices[i][j])>1e-9)))
      throw Error('UnitTriangleTile 来源内角与单位三角形顶点不一致。');
    return derived;
  }
  if(spec.tiletype==='UnitRegularPolygonTile'){
    if(spec.sides===undefined||spec.angles!==undefined||spec.starPoints!==undefined||spec.tipDegrees!==undefined||spec.cairoAngle!==undefined||cyclicFields)
      throw Error('UnitRegularPolygonTile 来源参数无效。');
    const derived=unitRegularPolygonTileVertices(spec.sides);
    if(spec.vertices.length!==spec.sides||derived.some((point,i)=>point.some((value,j)=>
      !Number.isFinite(spec.vertices[i]?.[j])||Math.abs(value-spec.vertices[i][j])>1e-9)))
      throw Error('UnitRegularPolygonTile 来源边数与单位正多边形顶点不一致。');
    return derived;
  }
  if(spec.tiletype==='UnitRegularStarPolygonTile'){
    if(spec.starPoints===undefined||spec.tipDegrees===undefined||spec.angles!==undefined||spec.sides!==undefined||spec.cairoAngle!==undefined||cyclicFields)
      throw Error('UnitRegularStarPolygonTile 来源参数无效。');
    const derived=unitStarTile(spec.starPoints,spec.tipDegrees);
    if(spec.vertices.length!==2*spec.starPoints||derived.some((point,i)=>point.some((value,j)=>
      !Number.isFinite(spec.vertices[i]?.[j])||Math.abs(value-spec.vertices[i][j])>1e-9)))
      throw Error('UnitRegularStarPolygonTile 来源参数与星形顶点不一致。');
    return derived;
  }
  if(spec.tiletype==='UnitCairoPentagonTile'){
    if(spec.cairoAngle===undefined||spec.angles!==undefined||spec.sides!==undefined||spec.starPoints!==undefined||spec.tipDegrees!==undefined||cyclicFields)
      throw Error('UnitCairoPentagonTile 来源参数无效。');
    const derived=unitCairoPentagonTileVertices(spec.cairoAngle);
    if(spec.vertices.length!==5||derived.some((point,i)=>point.some((value,j)=>
      !Number.isFinite(spec.vertices[i]?.[j])||Math.abs(value-spec.vertices[i][j])>1e-9)))
      throw Error('UnitCairoPentagonTile 来源底角与单位五边形顶点不一致。');
    return derived;
  }
  if(spec.tiletype==='UnitCyclicPolygonTile'){
    if(spec.cyclicAngles===undefined||spec.cyclicSide===undefined||spec.cyclicSideIndex===undefined||
      spec.angles!==undefined||spec.sides!==undefined||spec.starPoints!==undefined||
      spec.tipDegrees!==undefined||spec.cairoAngle!==undefined)
      throw Error('UnitCyclicPolygonVertices 来源参数无效。');
    const derived=unitCyclicPolygonVertices(spec.cyclicAngles,spec.cyclicSide,spec.cyclicSideIndex);
    if(spec.vertices.length!==derived.length||derived.some((point,i)=>point.some((value,j)=>
      !Number.isFinite(spec.vertices[i]?.[j])||Math.abs(value-spec.vertices[i][j])>1e-9)))
      throw Error('圆内接母多边形来源内角与顶点不一致。');
    return derived;
  }
  throw Error('当前仅支持数值 PolygonTile 及已验证的三角形、正多边形、正星形、Cairo 五边形和圆内接母图来源。');
}

/** EmbedTile: offset + RotationMatrix2D(rotation) . (scale * point). Degrees are the UI unit. */
export function embedTileSpec(spec:Pick<TileSpec,'vertices'|'offset'|'rotation'|'scale'>):Tile{
  if(spec.vertices.length<3||spec.vertices.length>24||spec.vertices.some(p=>p.length!==2||p.some(x=>!Number.isFinite(x)))||
    !Array.isArray(spec.offset)||spec.offset.length!==2||spec.offset.some(x=>!Number.isFinite(x))||!Number.isFinite(spec.rotation)||!Number.isFinite(spec.scale)||spec.scale<=0)
    throw Error('tilespec 需要 3–24 个有限顶点、有限位移和角度、正缩放倍率。');
  const angle=spec.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return spec.vertices.map(([x,y])=>[spec.offset[0]+spec.scale*(c*x-s*y),spec.offset[1]+spec.scale*(s*x+c*y)]);
}

/** Ordered JoinTiling. Its 1-based {i,j,±k} references are stored 0-based in the editor. */
export function embedTilingSpecs(specs:TileSpec[]):EmbeddedTileSpec[]{
  if(specs.length>96)throw Error('最多允许 96 块拼块。');
  const result:EmbeddedTileSpec[]=[];
  specs.forEach((spec,index)=>{
    const vertices=sourceVertices(spec);
    let {offset,rotation,scale}=spec;
    if(spec.join){
      const {kind,targetTile,targetVertex,sourceVertex,extraOffset}=spec.join;
      if(index===0||!['vertex','edge'].includes(kind)||!Number.isInteger(targetTile)||targetTile<0||targetTile>=index||
        !Number.isInteger(targetVertex)||targetVertex<0||targetVertex>=result[targetTile]?.points.length||
        !Number.isInteger(sourceVertex)||sourceVertex<0||sourceVertex>=vertices.length||
        !Array.isArray(extraOffset)||extraOffset.length!==2||extraOffset.some(value=>!Number.isFinite(value)))throw Error(`拼块 ${index+1} 的对接顶点引用无效。`);
      const target=result[targetTile].points,targetPoint=target[targetVertex],sourcePoint=vertices[sourceVertex];
      if(kind==='edge'){
        // JoinTiling[{i,j,k}]: source k -> target j, source (k-1) -> target (j+1).
        const sourcePrevious=vertices[(sourceVertex-1+vertices.length)%vertices.length];
        const targetNext=target[(targetVertex+1)%target.length];
        const sx=sourcePrevious[0]-sourcePoint[0],sy=sourcePrevious[1]-sourcePoint[1];
        const tx=targetNext[0]-targetPoint[0],ty=targetNext[1]-targetPoint[1];
        const sourceLength=Math.hypot(sx,sy),targetLength=Math.hypot(tx,ty);
        if(sourceLength<1e-9||targetLength<1e-9)throw Error(`拼块 ${index+1} 的对接边长度不能为零。`);
        scale=targetLength/sourceLength;
        rotation=(Math.atan2(ty,tx)-Math.atan2(sy,sx))*180/Math.PI;
      }
      // For {i,j,-k}, retain the supplied rotation and scale.
      const transformed=embedTileSpec({vertices,offset:[0,0],rotation,scale});
      offset=[targetPoint[0]-transformed[sourceVertex][0]+extraOffset[0],targetPoint[1]-transformed[sourceVertex][1]+extraOffset[1]];
    }
    const placed={vertices,offset,rotation,scale};
    result.push({...placed,points:embedTileSpec(placed)});
  });
  return result;
}

const numericPoint=(value:unknown):value is XY=>Array.isArray(value)&&value.length===2&&value.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=100);
const keysAre=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join(',')===keys.sort().join(',');

/** Read only the supported numeric tiletype; a stale source must never describe another mesh. */
export function readTileSpecs(value:unknown,mesh:{vertices:XY[];faces:number[][]}):TileSpec[]|null{
  if(!Array.isArray(value)||value.length<1||value.length>96||value.length!==mesh.faces.length)return null;
  const specs:TileSpec[]=[];
  for(const entry of value){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
    const raw=entry as Record<string,unknown>;
    const triangle=raw.tiletype==='UnitTriangleTile',regular=raw.tiletype==='UnitRegularPolygonTile',star=raw.tiletype==='UnitRegularStarPolygonTile',cairo=raw.tiletype==='UnitCairoPentagonTile',cyclic=raw.tiletype==='UnitCyclicPolygonTile';
    const keys=['tiletype','vertices','offset','rotation','scale',...(triangle?['angles']:[]),...(regular?['sides']:[]),...(star?['starPoints','tipDegrees']:[]),...(cairo?['cairoAngle']:[]),...(cyclic?['cyclicAngles','cyclicSide','cyclicSideIndex']:[]),...(raw.join===undefined?[]:['join'])];
    if(!keysAre(raw,keys)||
      raw.tiletype!=='PolygonTile'&&!triangle&&!regular&&!star&&!cairo&&!cyclic||!Array.isArray(raw.vertices)||raw.vertices.length<3||raw.vertices.length>24||
      !raw.vertices.every(numericPoint)||!numericPoint(raw.offset)||
      typeof raw.rotation!=='number'||!Number.isFinite(raw.rotation)||Math.abs(raw.rotation)>360||
      typeof raw.scale!=='number'||!Number.isFinite(raw.scale)||raw.scale<.01||raw.scale>10)return null;
    let join:TileSpec['join'];
    if(raw.join!==undefined){
      if(!raw.join||typeof raw.join!=='object'||Array.isArray(raw.join))return null;
      const source=raw.join as Record<string,unknown>;
      if(!keysAre(source,['kind','targetTile','targetVertex','sourceVertex','extraOffset'])||
        source.kind!=='vertex'&&source.kind!=='edge'||!Number.isInteger(source.targetTile)||
        !Number.isInteger(source.targetVertex)||!Number.isInteger(source.sourceVertex)||!numericPoint(source.extraOffset))return null;
      join={kind:source.kind as 'vertex'|'edge',targetTile:source.targetTile as number,targetVertex:source.targetVertex as number,
        sourceVertex:source.sourceVertex as number,extraOffset:[...source.extraOffset]};
    }
    let angles:[number,number,number]|undefined;
    if(triangle){
      if(!Array.isArray(raw.angles))return null;
      try{unitTriangleTileVertices(raw.angles);}catch{return null;}
      angles=[raw.angles[0],raw.angles[1],raw.angles[2]];
    }
    let sides:number|undefined;
    if(regular){
      if(typeof raw.sides!=='number')return null;
      try{unitRegularPolygonTileVertices(raw.sides);}catch{return null;}
      sides=raw.sides;
    }
    let starPoints:number|undefined,tipDegrees:number|undefined;
    if(star){
      if(typeof raw.starPoints!=='number'||typeof raw.tipDegrees!=='number')return null;
      try{unitStarTile(raw.starPoints,raw.tipDegrees);}catch{return null;}
      starPoints=raw.starPoints;tipDegrees=raw.tipDegrees;
    }
    let cairoAngle:number|undefined;
    if(cairo){
      if(typeof raw.cairoAngle!=='number')return null;
      try{unitCairoPentagonTileVertices(raw.cairoAngle);}catch{return null;}
      cairoAngle=raw.cairoAngle;
    }
    let cyclicAngles:number[]|undefined,cyclicSide:number|undefined,cyclicSideIndex:number|undefined;
    if(cyclic){
      if(!Array.isArray(raw.cyclicAngles)||typeof raw.cyclicSide!=='number'||
        typeof raw.cyclicSideIndex!=='number')return null;
      try{unitCyclicPolygonVertices(raw.cyclicAngles,raw.cyclicSide,raw.cyclicSideIndex);}catch{return null;}
      cyclicAngles=[...raw.cyclicAngles];cyclicSide=raw.cyclicSide;cyclicSideIndex=raw.cyclicSideIndex;
    }
    specs.push({tiletype:triangle?'UnitTriangleTile':regular?'UnitRegularPolygonTile':star?'UnitRegularStarPolygonTile':cairo?'UnitCairoPentagonTile':cyclic?'UnitCyclicPolygonTile':'PolygonTile',
      vertices:raw.vertices.map(point=>[...point] as XY),offset:[...raw.offset],
      rotation:raw.rotation,scale:raw.scale,...(angles?{angles}:{}),...(sides?{sides}:{}),
      ...(starPoints?{starPoints,tipDegrees}:{}),...(cairoAngle?{cairoAngle}:{}),
      ...(cyclicAngles?{cyclicAngles,cyclicSide,cyclicSideIndex}:{}),...(join?{join}:{})});
  }
  try{
    const placed=embedTilingSpecs(specs);
    const rebuilt=assembleTiles(placed.map(item=>item.points),true);
    if(rebuilt.vertices.length!==mesh.vertices.length||rebuilt.faces.length!==mesh.faces.length||
      rebuilt.faces.some((face,i)=>face.length!==mesh.faces[i].length||face.some((index,j)=>index!==mesh.faces[i][j]))||
      rebuilt.vertices.some((point,i)=>point.some((coordinate,j)=>Math.abs(coordinate-mesh.vertices[i][j])>1e-8)))return null;
    return specs;
  }catch{return null;}
}
