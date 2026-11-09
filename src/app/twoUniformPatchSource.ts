import type {TessParams,TessPaperSpec,XY} from './tessellation';
import {assembleTiles} from './tileAssembly';
import {embedTilingSpecs,unitRegularPolygonTileVertices,type TileSpec} from './tileSpecs';
import {TWO_UNIFORM_PATCH_CATALOG,type TwoUniformPatchNumber} from './twoUniformPatchCatalog';
export type {TwoUniformPatchNumber} from './twoUniformPatchCatalog';

/** Origamica In[3197–3275], distinct from the compact third-party two-uniform cells. */
const sourceName=(number:TwoUniformPatchNumber)=>`Origamica.Section37.TwoUniformPatch[${number}]`;
export type TwoUniformPatchSpec={
  source:string;
  number:TwoUniformPatchNumber;
  range1:[number,number];
  range2:[number,number];
};
export type TwoUniformPatchParams=Extract<TessParams,{family:'custom'}>&{
  twoUniformPatch:TwoUniformPatchSpec;
};

export function twoUniformPatchPreset(number:TwoUniformPatchNumber=1):TwoUniformPatchSpec{
  return {source:sourceName(number),number,range1:[0,1],range2:[0,1]};
}

export function readTwoUniformPatchSpec(value:unknown):TwoUniformPatchSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(Object.keys(raw).sort().join(',')!=='number,range1,range2,source'||
    !Number.isInteger(raw.number)||typeof raw.number!=='number'||raw.number<1||raw.number>20||
    raw.source!==sourceName(raw.number as TwoUniformPatchNumber))return null;
  const number=raw.number as TwoUniformPatchNumber;
  const valid=(range:unknown):range is [number,number]=>Array.isArray(range)&&range.length===2&&
    range.every(value=>typeof value==='number'&&Number.isInteger(value)&&Math.abs(value)<=64)&&
    range[0]<=range[1];
  if(!valid(raw.range1)||!valid(raw.range2)||
    TWO_UNIFORM_PATCH_CATALOG[number].sides.length*(raw.range1[1]-raw.range1[0]+1)*
    (raw.range2[1]-raw.range2[0]+1)>192)return null;
  return {source:sourceName(number),number,
    range1:[...raw.range1],range2:[...raw.range2]};
}

export function twoUniformPatchTileSpecs(number:TwoUniformPatchNumber):TileSpec[]{
  const {sides,joins}=TWO_UNIFORM_PATCH_CATALOG[number];
  return sides.map((n,index)=>({
    tiletype:'UnitRegularPolygonTile' as const,sides:n,
    vertices:unitRegularPolygonTileVertices(n),
    offset:[0,0] as XY,rotation:0,scale:1,
    ...(index===0?{}:{join:{kind:'edge' as const,targetTile:joins[index-1][0]-1,
      targetVertex:joins[index-1][1]-1,sourceVertex:joins[index-1][2]-1,
      extraOffset:[0,0] as XY}}),
  }));
}

export function twoUniformPatchGeometry(number:TwoUniformPatchNumber):{
  vertices:XY[];faces:number[][];lattice:[XY,XY];sourceTiles:XY[][];tileSpecs:TileSpec[];
}{
  const tileSpecs=twoUniformPatchTileSpecs(number);
  const sourceTiles=embedTilingSpecs(tileSpecs).map(item=>item.points);
  const {vertices,faces}=assembleTiles(sourceTiles);
  // Notebook rows preserve 1-based PatchVector(s) references, including the
  // exceptional pair-of-PatchVector form in n=5.
  const lattice=TWO_UNIFORM_PATCH_CATALOG[number].vectors.map(([from,to])=>{
    const a=sourceTiles[from[0]-1][from[1]-1],b=sourceTiles[to[0]-1][to[1]-1];
    return [b[0]-a[0],b[1]-a[1]] as XY;
  }) as [XY,XY];
  const area=sourceTiles.reduce((sum,polygon)=>sum+Math.abs(polygon.reduce((value,a,i)=>{
    const b=polygon[(i+1)%polygon.length];return value+a[0]*b[1]-a[1]*b[0];
  },0))/2,0);
  const determinant=lattice[0][0]*lattice[1][1]-lattice[0][1]*lattice[1][0];
  if(determinant<=0||Math.abs(area-determinant)>1e-9)
    throw Error(`TwoUniformPatch[${number}] 来源格矢与拼块面积不一致。`);
  return {vertices,faces,lattice,sourceTiles,tileSpecs};
}

export function twoUniformPatchParams(spec:TwoUniformPatchSpec,paper?:TessPaperSpec):TwoUniformPatchParams{
  const source=readTwoUniformPatchSpec(spec);
  if(!source)throw Error('TwoUniformPatch 来源参数无效。');
  const mesh=twoUniformPatchGeometry(source.number);
  return {family:'custom',vertices:mesh.vertices,faces:mesh.faces,
    repeatX:1,repeatY:1,lattice:mesh.lattice,
    range1:[...source.range1],range2:[...source.range2],
    customOutput:'tiling',tileSpecs:mesh.tileSpecs,
    angle:36,scale:.3,twoUniformPatch:source,...(paper?{paper}:{})};
}

/** Only an exact saved source cell and lattice may retain the named source. */
export function twoUniformPatchSourceMatches(value:unknown,spec:TwoUniformPatchSpec):boolean{
  const source=readTwoUniformPatchSpec(spec);
  if(!source||!value||typeof value!=='object'||Array.isArray(value))return false;
  const actual=value as Record<string,unknown>,expected=twoUniformPatchParams(source);
  if(actual.family!=='custom'||actual.repeatX!==1||actual.repeatY!==1||
    actual.customOutput!=='tiling'||actual.tileTwists!==undefined||
    actual.monolithicOptions!==undefined||actual.pruneBoundary!==undefined||
    actual.stationaryFace!==undefined)return false;
  const ordered=(item:unknown):unknown=>Array.isArray(item)?item.map(ordered):
    item&&typeof item==='object'?Object.fromEntries(Object.entries(item)
      .sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,ordered(value)])):item;
  const same=(a:unknown,b:unknown)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
  const pointsEqual=(a:unknown,b:XY[]):boolean=>Array.isArray(a)&&a.length===b.length&&
    a.every((point,i)=>Array.isArray(point)&&point.length===2&&
      point.every((n,j)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n-b[i][j])<=1e-8));
  return same(actual.faces,expected.faces)&&same(actual.tileSpecs,expected.tileSpecs)&&
    same(actual.range1,expected.range1)&&same(actual.range2,expected.range2)&&
    pointsEqual(actual.vertices,expected.vertices)&&
    Array.isArray(actual.lattice)&&actual.lattice.length===2&&
    actual.lattice.every((vector,i)=>pointsEqual([vector],[expected.lattice![i]]));
}
