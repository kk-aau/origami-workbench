import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

type Point3=[number,number,number];
type Triangle={indices:[number,number,number];normal:Point3};

/** Match simulationFoldSnapshot's standard FOLD axes: simulator (x,y,z) → (x,-z,y). */
function exportMesh(prepared:PreparedOrigamiModel,positions:Float32Array){
  if(!Number.isInteger(prepared.vertexCount)||prepared.vertexCount<3||
     positions.length!==prepared.vertexCount*3)
    throw new Error('三维顶点数量与模拟网格不一致，无法导出。');
  if(!prepared.indices.length||prepared.indices.length%3!==0||
     prepared.indices.length/3!==prepared.faceCount)
    throw new Error('模拟网格不是有效三角网格，无法导出。');
  const vertices:Point3[]=Array.from({length:prepared.vertexCount},(_,index)=>{
    const x=positions[3*index],y=-positions[3*index+2],z=positions[3*index+1];
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))
      throw new Error(`第 ${index+1} 个三维顶点不是有限坐标，无法导出。`);
    return [x,y,z];
  });
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
  const lines=['# Folded paper from 折纸工坊三维模拟','o folded_paper'];
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
