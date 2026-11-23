import {simulationNormalization} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

type Point3=[number,number,number];
type Triangle={indices:[number,number,number];normal:Point3};

/** Undo the solver's rest-space normalization before restoring FOLD axes.
 * Recognizing the exact Float32 rest pose also makes an unchanged
 * vertex round-trip exactly, even for translated source documents. */
export function simulationExportVertices(prepared:PreparedOrigamiModel,positions:Float32Array):Point3[] {
  if(!Number.isInteger(prepared.vertexCount)||prepared.vertexCount<3||positions.length!==prepared.vertexCount*3)
    throw Error('三维顶点数量与模拟网格不一致，无法导出。');
  const rest=prepared.originalPositions,{center,scale}=simulationNormalization(rest);
  const coordinate=(i:number)=>{
    if(!Number.isFinite(positions[i]))throw Error('三维顶点含有非有限坐标，无法导出。');
    const initial=Math.fround((rest[i]-center[i%3])/scale);
    return positions[i]===initial?rest[i]:center[i%3]+positions[i]*scale;
  };
  return Array.from({length:prepared.vertexCount},(_,v)=>[coordinate(3*v),0-coordinate(3*v+2),coordinate(3*v+1)]);
}

/** Match simulationFoldSnapshot's standard FOLD axes: simulator (x,y,z) → (x,-z,y). */
function exportMesh(prepared:PreparedOrigamiModel,positions:Float32Array){
  if(!prepared.indices.length||prepared.indices.length%3!==0||
     prepared.indices.length/3!==prepared.faceCount)
    throw new Error('模拟网格不是有效三角网格，无法导出。');
  const vertices=simulationExportVertices(prepared,positions);
  const triangles:Triangle[]=Array.from({length:prepared.faceCount},(_,index)=>{
    const indices=[prepared.indices[3*index],prepared.indices[3*index+1],prepared.indices[3*index+2]] as [number,number,number];
    if(indices.some(vertex=>vertex>=vertices.length)||new Set(indices).size!==3)
      throw new Error(`第 ${index+1} 个三角面的顶点索引无效，无法导出。`);
    const [a,b,c]=indices.map(vertex=>vertices[vertex]) as [Point3,Point3,Point3];
    const u:[number,number,number]=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
    const v:[number,number,number]=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const cross:[number,number,number]=[
      u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0],
    ];
    const length=Math.hypot(...cross),scale=Math.hypot(...u)*Math.hypot(...v);
    if(!Number.isFinite(length)||!Number.isFinite(scale)||scale===0||length/scale<1e-10)
      throw new Error(`第 ${index+1} 个三角面已退化，无法计算法向并导出。`);
    return {indices,normal:[cross[0]/length,cross[1]/length,cross[2]/length]};
  });
  return {vertices,triangles};
}

function number(value:number):string{
  return Object.is(value,-0)?'0':String(Number(value.toPrecision(9)));
}
const xyz=(point:Point3)=>point.map(number).join(' ');

/** Triangle-only Wavefront OBJ with one outward normal per face. */
export function simulationObjText(prepared:PreparedOrigamiModel,positions:Float32Array):string{
  const {vertices,triangles}=exportMesh(prepared,positions);
  const candidate=prepared.fold.frame_unit;
  const units=typeof candidate==='string'&&['mm','cm','m','in','inch','pt'].includes(candidate)?candidate:'unitless';
  const lines=['# Folded paper from 折纸工坊三维模拟','# zhezhi-coordinate-unit '+units,'o folded_paper'];
  for(const vertex of vertices)lines.push(`v ${xyz(vertex)}`);
  for(const triangle of triangles)lines.push(`vn ${xyz(triangle.normal)}`);
  triangles.forEach(({indices},face)=>{
    const normal=face+1;
    lines.push(`f ${indices.map(vertex=>`${vertex+1}//${normal}`).join(' ')}`);
  });
  return lines.join('\n')+'\n';
}

/** ASCII STL using the same current-state triangles and normals as OBJ. */
export function simulationStlText(prepared:PreparedOrigamiModel,positions:Float32Array):string{
  const {vertices,triangles}=exportMesh(prepared,positions);
  const lines=['solid zhezhi_simulation'];
  for(const {indices,normal} of triangles){
    lines.push(`  facet normal ${xyz(normal)}`,'    outer loop');
    for(const vertex of indices)lines.push(`      vertex ${xyz(vertices[vertex])}`);
    lines.push('    endloop','  endfacet');
  }
  lines.push('endsolid zhezhi_simulation');
  return lines.join('\n')+'\n';
}
