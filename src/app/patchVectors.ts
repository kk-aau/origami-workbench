import type {Tile} from './tileAssembly';
import type {XY} from './tessellation';

/** Origamica PatchVector[patch,{tile,vertex},{tile,vertex}] uses 1-based refs. */
export function patchVector(tiles:Tile[],from:[number,number],to:[number,number]):XY{
  const vertex=(ref:[number,number]):XY=>{
    const [tile,index]=ref;
    if(!Number.isInteger(tile)||!Number.isInteger(index)||tile<1||tile>tiles.length||index<1||index>tiles[tile-1].length)
      throw Error('周期顶点引用须选现有拼块和顶点。');
    const value=tiles[tile-1][index-1];
    if(value.some(n=>!Number.isFinite(n)))throw Error('周期顶点坐标无效。');
    return value;
  };
  const a=vertex(from),b=vertex(to);
  return [b[0]-a[0],b[1]-a[1]];
}

/** The notebook's PatchVectors[patch,a,b,c] shares the same anchor a. */
export function patchVectors(tiles:Tile[],anchor:[number,number],uTarget:[number,number],vTarget:[number,number]):[XY,XY]{
  const u=patchVector(tiles,anchor,uTarget),v=patchVector(tiles,anchor,vTarget);
  if([...u,...v].some(value=>Math.abs(value)>20)||Math.abs(u[0]*v[1]-u[1]*v[0])<1e-8)
    throw Error('从顶点得到的两个周期向量不能为零、共线或超出 ±20。');
  return [u,v];
}
