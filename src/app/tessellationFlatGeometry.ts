import {computeFlatGeometry,emptyFoldResult} from '../core/flatFold';
import {distance,polygonArea} from '../core/geometry';
import type {FlatFoldResult} from '../core/types';
import {materialFaceRings} from '../core/materialRings';
import {tessFlatStartingFace,type TessFlatInput} from './tessellationFlat';
import {orientPrimalDualFaceupGeometry} from './primalDualFaceup';

/** Original cut pieces retain the generator's placement. Reflecting each
 * disconnected component from a new root would lose that original placement. */
export function computeTessFlatGeometry(input:TessFlatInput,previous:FlatFoldResult|null=null):FlatFoldResult{
 const points=input.graph.vertices_coords;
 if(!points.length||points.some(p=>p.length!==2||!p.every(Number.isFinite)))return emptyFoldResult('invalid','折痕顶点坐标无效。');
 const size=Math.max(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])));
 const epsilon=Math.max(1e-6,size*1e-8);
 if(input.wovenCutFoldedVertices){
  const vertices=input.wovenCutFoldedVertices,faces=input.graph.faces_vertices??[];
  if(vertices.length!==points.length||!faces.length||vertices.some(p=>p.length!==2||!p.every(Number.isFinite)))return emptyFoldResult('invalid','切口原折后坐标不完整。');
  for(const [f,face] of faces.entries()){
   if(face.length<3||new Set(face).size!==face.length||face.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length)||Math.abs(polygonArea(face.map(v=>vertices[v])))<=epsilon*epsilon)return emptyFoldResult('invalid','切口折后面退化或编号无效。');
   const corners=materialFaceRings(input.graph,f).flat();
   if(new Set(corners).size!==corners.length||corners.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length))return emptyFoldResult('invalid','切口内外环角点编号无效或重复。');
   for(let i=0;i<corners.length;i++)for(let j=i+1;j<corners.length;j++){
    const a=corners[i],b=corners[j];
    if(Math.abs(distance(points[a],points[b])-distance(vertices[a],vertices[b]))>epsilon*20)return emptyFoldResult('invalid','切口原折后形与当前折痕面不等距。');
   }
  }
  return {geometry:{status:'ready',message:'编织材料折后形已按独立边界还原，正在检查层序。',vertices:structuredClone(vertices),faces:structuredClone(faces),graph:{...structuredClone(input.graph),vertices_coords:structuredClone(vertices),frame_classes:['foldedForm'],frame_attributes:['2D']},startingFace:input.startingFace},layers:{status:'unknown',message:'材料各部分的相对位置取自原构造，尚未验证层序。'},warnings:[]};
 }
 return orientPrimalDualFaceupGeometry(computeFlatGeometry(input.graph,epsilon,{startingFace:tessFlatStartingFace(input,previous)}),input.faceupFace);
}
