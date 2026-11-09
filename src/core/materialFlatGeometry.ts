import type {Doc,FlatFoldResult,Point} from './types';
import {inspectMaterialTopology,type MaterialTopologyInspection} from './materialTopology';
import {foldMaterialFromCP} from './materialRefold';

/** A reference change is a rigid view basis, not a new FF certificate. */
export function materialFrameMap(material:Extract<MaterialTopologyInspection,{ok:true}>,root:number){
 const graph=material.graph,face=graph.faces_vertices?.[root],identity=(p:Point):Point=>[...p];
 if(!Number.isInteger(root)||!face)throw new Error('材料起始面不存在。');
 if(!material.foldedVertices||root===(material.startingFace??0)||face.every(v=>material.foldedVertices![v][0]===graph.vertices_coords[v][0]&&material.foldedVertices![v][1]===graph.vertices_coords[v][1]))return {toView:identity,toStored:identity};
 const ff=material.foldedVertices,a=face[0],b=face[1],p=ff[a],q=ff[b],x=graph.vertices_coords[a],y=graph.vertices_coords[b],length=Math.hypot(q[0]-p[0],q[1]-p[1]),cpLength=Math.hypot(y[0]-x[0],y[1]-x[1]),u:Point=[(q[0]-p[0])/length,(q[1]-p[1])/length],v:Point=[(y[0]-x[0])/cpLength,(y[1]-x[1])/cpLength],w=Math.sign(face.reduce((sum,c,i)=>{const d=face[(i+1)%face.length];return sum+(ff[c][0]-p[0])*(ff[d][1]-p[1])-(ff[c][1]-p[1])*(ff[d][0]-p[0]);},0));
 return {toView:(z:Point):Point=>{const dx=z[0]-p[0],dy=z[1]-p[1],along=dx*u[0]+dy*u[1],normal=(-dx*u[1]+dy*u[0])*w;return [x[0]+along*v[0]-normal*v[1],x[1]+along*v[1]+normal*v[0]];},toStored:(z:Point):Point=>{const dx=z[0]-x[0],dy=z[1]-x[1],along=dx*v[0]+dy*v[1],normal=(-dx*v[1]+dy*v[0])*w;return [p[0]+along*u[0]-normal*u[1],p[1]+along*u[1]+normal*u[0]];}};
}

/** Reorient all material components together. A new root must never move each
 * disconnected piece to an independently chosen origin. */
export function computeMaterialFlatGeometry(doc:Doc,startingFace?:number):FlatFoldResult{
  const material=inspectMaterialTopology(doc);
  if(!material.ok)throw new Error(material.reason);
  const graph=material.graph,faces=graph.faces_vertices!,root=startingFace??material.startingFace??0;
  if(!Number.isInteger(root)||root<0||root>=faces.length)throw new Error('材料起始面不存在。');
  const fresh=!material.foldedVertices,stored=material.foldedVertices??foldMaterialFromCP(doc,root),frame=fresh?{toView:(p:Point):Point=>[...p]}:materialFrameMap(material,root),vertices=stored.map(frame.toView);
  return {geometry:{status:'ready',message:fresh?'已从当前材料CP求得平折几何，各部件根面保展开位置；正在独立计算层序。':'已恢复经过验证的材料折后位置，正在独立计算层序。',vertices,faces:structuredClone(faces),graph:{...structuredClone(graph),vertices_coords:structuredClone(vertices),frame_classes:['foldedForm'],frame_attributes:['2D']},startingFace:root},layers:{status:'unknown',message:'材料折后几何不代替层序验证。'},warnings:fresh&&material.components.length>1?['独立材料未保存折后相对姿态，本次各自固定在其CP根面位置。']:[]};
}
