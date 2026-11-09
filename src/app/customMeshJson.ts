import {isConvexTile} from './tileAssembly';
import {defaultTileTwists,readTessParams,type TessParams} from './tessellation';

type CustomParams=Extract<TessParams,{family:'custom'}>;

/** JSON mesh edits retain tile provenance only while the indexed geometry is unchanged. */
export function readCustomMeshJson(params:CustomParams,json:string):CustomParams{
  const data=JSON.parse(json);
  if(!Array.isArray(data.vertices)||!Array.isArray(data.faces))throw Error('需要 vertices 点坐标和 faces 顶点编号数组。');
  const {tileDecorations:_display,tileSpecs:_source,tileTwists:_twists,stationaryFace:_anchor,monolithicOptions:_merge,unitRegularCentered:_regular,unitTriangle:_triangle,unitCyclic:_cyclic,unitQuadrilateralSplit:_quadrilateralSplit,archimedeanPatch:_archimedeanPatch,twoColorableArchimedeanPatch:_twoColorableArchimedeanPatch,twoUniformPatch:_twoUniformPatch,...geometryParams}=params;
  const validated=readTessParams({...geometryParams,vertices:data.vertices,faces:data.faces,customOutput:'tiling'});
  if(!validated||validated.family!=='custom')throw Error('拼块数据包含无效顶点或面。');
  const concave=validated.faces.some(face=>!isConvexTile(face.map(i=>validated.vertices[i])));
  const output=concave?'tiling':params.customOutput;
  const sameGeometry=JSON.stringify(validated.vertices)===JSON.stringify(params.vertices)&&JSON.stringify(validated.faces)===JSON.stringify(params.faces);
  const next=readTessParams({...validated,customOutput:output,
    ...(sameGeometry&&params.tileSpecs?{tileSpecs:params.tileSpecs}:{}),
    ...(sameGeometry&&params.unitRegularCentered?{unitRegularCentered:params.unitRegularCentered}:{}),
    ...(sameGeometry&&params.unitTriangle?{unitTriangle:params.unitTriangle}:{}),
    ...(sameGeometry&&params.unitCyclic?{unitCyclic:params.unitCyclic}:{}),
    ...(sameGeometry&&params.unitQuadrilateralSplit?{unitQuadrilateralSplit:params.unitQuadrilateralSplit}:{}),
    ...(sameGeometry&&params.archimedeanPatch?{archimedeanPatch:params.archimedeanPatch}:{}),
    ...(sameGeometry&&params.twoColorableArchimedeanPatch?{twoColorableArchimedeanPatch:params.twoColorableArchimedeanPatch}:{}),
    ...(sameGeometry&&params.twoUniformPatch?{twoUniformPatch:params.twoUniformPatch}:{}),
    ...(output==='tile-twists'?{tileTwists:sameGeometry?params.tileTwists??defaultTileTwists(validated.faces):defaultTileTwists(validated.faces),
      ...(params.monolithicOptions?{monolithicOptions:params.monolithicOptions}:{}),
      ...(sameGeometry?{stationaryFace:params.stationaryFace}:{})}:{}),
  });
  if(!next||next.family!=='custom'||next.vertices.length<3||next.faces.length<1)throw Error('至少需要 3 点和 1 个面；每个点为两个有限坐标。');
  if(sameGeometry)next.tileDecorations=params.tileDecorations;
  delete next.dualTargets;
  return next;
}
