import type {XY} from './tessellation';
import {unitRegularPolygonTileVertices} from './tileSpecs';
import {ORIGAMICA_TILE_TILING_STYLE,type TileTilingStyle} from './tileDecorations';

/** Only the saved TestTile -> TileVertices/Tiling rules of In[2794–2795]. */
export type TestTileSpec2D={sides:number;offset:XY;rotation:number;scale:number};
export type TestTileGraphic2D=
  | {kind:'text';role:'tile-index'|'vertex-index';value:string;at:XY;color:string}
  | {kind:'line';role:'outline';points:XY[];color:string;absoluteWidth:1};
export type EmbeddedTestTile2D={vertices:XY[];graphics:TestTileGraphic2D[]};

export function embedTestTile2D(spec:TestTileSpec2D,tileIndex?:number,
  style:Pick<TileTilingStyle,'textColor'|'lineColor'>=ORIGAMICA_TILE_TILING_STYLE):EmbeddedTestTile2D{
  if(tileIndex!==undefined&&(!Number.isSafeInteger(tileIndex)||tileIndex<1||tileIndex>9999))
    throw Error('TestTile 的 TileIndex 须为 1–9999 的整数。');
  const localVertices=unitRegularPolygonTileVertices(spec.sides);
  if(!Array.isArray(spec.offset)||spec.offset.length!==2||spec.offset.some(value=>!Number.isFinite(value))||
    !Number.isFinite(spec.rotation)||!Number.isFinite(spec.scale))
    throw Error('TestTile 的位移、旋转和倍率须为有限数值。');
  // FunctionTransform in In[2802] transforms coordinates, including Text positions.
  // Graphics also permits zero/negative scale; this read-only path does not adopt a paper mesh.
  const radians=(spec.rotation%360)*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const transform=([x,y]:XY):XY=>{
    const point:XY=[spec.offset[0]+spec.scale*(c*x-s*y),spec.offset[1]+spec.scale*(s*x+c*y)];
    if(point.some(value=>!Number.isFinite(value)))throw Error('TestTile 变换超出有限数值范围。');
    return point;
  };
  const vertices=localVertices.map(transform),localCenter:XY=[.5,spec.sides===4?.5:.5/Math.tan(Math.PI/spec.sides)];
  const center=transform(localCenter);
  const graphics:TestTileGraphic2D[]=[];
  if(tileIndex!==undefined)graphics.push({kind:'text',role:'tile-index',value:String(tileIndex),at:center,color:'#000000'});
  localVertices.forEach((point,index)=>graphics.push({kind:'text',role:'vertex-index',value:String(index+1),
    at:transform([.8*point[0]+.2*localCenter[0],.8*point[1]+.2*localCenter[1]]),color:style.textColor}));
  graphics.push({kind:'line',role:'outline',points:[...vertices,vertices[0]],color:style.lineColor,absoluteWidth:1});
  return {vertices,graphics};
}

/** In[2809–2810]: default False; True forwards the 1-based list position. */
export function embedTestTiling2D(specs:TestTileSpec2D[],tileIndices=false,
  style:Pick<TileTilingStyle,'textColor'|'lineColor'>=ORIGAMICA_TILE_TILING_STYLE):EmbeddedTestTile2D[]{
  if(specs.length>96)throw Error('TestTile 的数值排布最多允许 96 块。');
  return specs.map((spec,index)=>embedTestTile2D(spec,tileIndices?index+1:undefined,style));
}

/** Exact numeric arguments of saved In[2811], not an inferred 3D dispatch. */
export const TEST_TILE_IN2811_SPECS:TestTileSpec2D[]=[
  {sides:4,offset:[0,0],rotation:0,scale:1},
  {sides:4,offset:[1,0],rotation:0,scale:1},
];
