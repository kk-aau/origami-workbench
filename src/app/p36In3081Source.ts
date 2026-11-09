/** Origamica Section 36 In[3081]: saved 13-tile {3.4.6.4} Alt assembly. */
import type {TessPaperSpec,TessParams,XY} from './tessellation';
import {assembleTiles} from './tileAssembly';
import {embedTilingSpecs,unitRegularPolygonTileVertices,type TileSpec} from './tileSpecs';

const SOURCE:[number,number,number,number][]=[
  [4,0,0,0], [6,1,2,1], [4,2,3,1], [3,1,1,1],
  [4,4,2,1], [3,5,2,1], [4,6,2,1], [3,7,2,1],
  [3,1,3,2], [4,9,2,1], [3,10,2,1], [4,11,1,1],
  [3,12,2,1],
];
const SOURCE_TYPES='VMVMVMVMMVMVM';

export function p36In3081TileSpecs():TileSpec[]{
  return SOURCE.map(([sides,oldTile,oldVertex,newVertex])=>({
    tiletype:'UnitRegularPolygonTile' as const,sides,
    vertices:unitRegularPolygonTileVertices(sides),offset:[0,0] as XY,
    rotation:0,scale:1,
    ...(oldTile?{join:{kind:'edge' as const,targetTile:oldTile-1,
      targetVertex:oldVertex-1,sourceVertex:newVertex-1,
      extraOffset:[0,0] as XY}}:{}),
  }));
}

/** A source-traceable editable custom request; changed w/α is a local variant. */
export function p36In3081Params(width=.18,twistAngle=30,
  paper?:TessPaperSpec):Extract<TessParams,{family:'custom'}>{
  if(!Number.isFinite(width)||width<.05||width>.8||
    !Number.isFinite(twistAngle)||twistAngle<1||twistAngle>=90)
    throw Error('In[3081] 褶宽或锐角扭角越界。');
  const tileSpecs=p36In3081TileSpecs();
  const polygons=embedTilingSpecs(tileSpecs).map(tile=>tile.points);
  const {vertices,faces}=assembleTiles(polygons);
  return {family:'custom',vertices,faces,repeatX:1,repeatY:1,angle:36,scale:.3,
    customOutput:'tile-twists',tileSpecs,
    tileTwists:SOURCE.map(([sides],index)=>({width,offset:0,
      angleMode:'twist' as const,twistAngle,
      centralTypes:Array.from({length:sides},()=>SOURCE_TYPES[index] as 'M'|'V')})),
    monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
      collinearCleanup:true,collinearTolerance:1e-8},
    ...(paper?{paper}:{}),
  };
}
