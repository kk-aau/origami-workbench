import type {XY} from './tessellation';
import {embedTilingSpecs,type TileSpec} from './tileSpecs';

/** Zero-based form of Origamica's {{h,i,j},{k,l}} patch-to-patch edge reference. */
export type PatchJoin={
  targetPatch:number;
  targetTile:number;
  targetVertex:number;
  sourceTile:number;
  sourceVertex:number;
};
export type PatchInfo={tiles:TileSpec[];join?:PatchJoin};

const finitePoint=(point:XY)=>point.every(value=>Number.isFinite(value)&&Math.abs(value)<=100);
const rotate=(point:XY,cos:number,sin:number):XY=>[
  cos*point[0]-sin*point[1],sin*point[0]+cos*point[1],
];
const normalizedDegrees=(degrees:number)=>{
  const wrapped=((degrees+180)%360+360)%360-180;
  return Math.abs(wrapped)<1e-12?0:wrapped;
};

/**
 * Numeric 2D JoinTilingPatches, notebook In[3320] (242444–242792).
 * Each patch may already contain ordered JoinTiling references. The returned
 * flat tilespecs have absolute transforms, as in the original function.
 */
export function joinTilingPatches(patches:PatchInfo[]):TileSpec[]{
  if(!Array.isArray(patches)||patches.length<1||patches.length>96||
    patches.some(patch=>!Array.isArray(patch.tiles)||patch.tiles.length<1)||
    patches.reduce((count,patch)=>count+patch.tiles.length,0)>96)
    throw Error('整组拼接需要 1–96 组非空拼块，合计不超过 96 块。');
  if(patches[0].join!==undefined)throw Error('首组拼块不能带整组对接引用。');
  const completed:TileSpec[][]=[];
  for(let patchIndex=0;patchIndex<patches.length;patchIndex++){
    const patch=patches[patchIndex];
    const placed=embedTilingSpecs(patch.tiles);
    let scale=1,angle=0,translation:XY=[0,0];
    if(patchIndex>0){
      const join=patch.join;
      if(!join||Object.values(join).some(value=>!Number.isInteger(value))||
        join.targetPatch<0||join.targetPatch>=patchIndex||
        join.targetTile<0||join.targetTile>=completed[join.targetPatch].length||
        join.sourceTile<0||join.sourceTile>=placed.length)
        throw Error(`第 ${patchIndex+1} 组的对接拼块引用无效。`);
      const target=embedTilingSpecs(completed[join.targetPatch])[join.targetTile].points;
      const source=placed[join.sourceTile].points;
      if(join.targetVertex<0||join.targetVertex>=target.length||
        join.sourceVertex<0||join.sourceVertex>=source.length)
        throw Error(`第 ${patchIndex+1} 组的对接顶点引用无效。`);
      // Original In[3320]: source l -> target j, source (l-1) -> target (j+1).
      const sourceFirst=source[join.sourceVertex];
      const sourceSecond=source[(join.sourceVertex-1+source.length)%source.length];
      const targetFirst=target[join.targetVertex];
      const targetSecond=target[(join.targetVertex+1)%target.length];
      const sx=sourceSecond[0]-sourceFirst[0],sy=sourceSecond[1]-sourceFirst[1];
      const tx=targetSecond[0]-targetFirst[0],ty=targetSecond[1]-targetFirst[1];
      const sourceLength=Math.hypot(sx,sy),targetLength=Math.hypot(tx,ty);
      if(sourceLength<1e-9||targetLength<1e-9)
        throw Error(`第 ${patchIndex+1} 组的对接边不能退化。`);
      scale=targetLength/sourceLength;
      angle=Math.atan2(ty,tx)-Math.atan2(sy,sx);
      const mapped=rotate(sourceFirst,Math.cos(angle),Math.sin(angle));
      translation=[targetFirst[0]-scale*mapped[0],targetFirst[1]-scale*mapped[1]];
    }
    const cos=Math.cos(angle),sin=Math.sin(angle);
    const joined=patch.tiles.map((spec,index)=>{
      const local=placed[index];
      const moved=rotate(local.offset,cos,sin);
      const offset:XY=[translation[0]+scale*moved[0],translation[1]+scale*moved[1]];
      const outputScale=scale*local.scale;
      if(!finitePoint(offset)||outputScale<.01||outputScale>10)
        throw Error(`第 ${patchIndex+1} 组超出当前工程可保存的数值范围。`);
      const {join:_join,...source}=spec;
      return {...source,vertices:local.vertices,offset,
        rotation:normalizedDegrees(local.rotation+angle*180/Math.PI),scale:outputScale};
    });
    completed.push(joined);
  }
  return completed.flat();
}
