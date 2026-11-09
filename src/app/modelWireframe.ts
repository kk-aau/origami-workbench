import type {Assignment,FlatFoldResult,Point} from '../core/types';
import {flatPresentation,type FlatSide} from './flatPresentation';

export interface ModelWireEdge {index:number;a:Point;b:Point;assignment:Assignment;color:string}
export interface ModelWireframe {edges:ModelWireEdge[];assignmentsKnown:boolean;message:string}
const colors:Record<Assignment,string>={B:'#202820',M:'#c9363c',V:'#3566c7',U:'#947329',A:'#8a8f97',F:'#7f8d73'};
/** Draw original folded graph edges, not filled face outlines or layer occlusion.
 * Mirror only the camera; mountain/valley retain their source assignments.
 */
export function modelWireframe(result:FlatFoldResult,side:FlatSide,rotation=0):ModelWireframe{
 const {vertices}=flatPresentation(result,side,rotation),graph=result.geometry.graph;
 if(result.geometry.status!=='ready')throw new Error('线框显示需要有效的折后几何。');
 if(graph){
  if(graph.vertices_coords.length!==vertices.length||!Array.isArray(graph.edges_vertices)||!Array.isArray(graph.edges_assignment)||graph.edges_vertices.length!==graph.edges_assignment.length)throw new Error('模型线网与折后顶点不一致。');
  const edges=graph.edges_vertices.map((edge,index):ModelWireEdge=>{
   if(!Array.isArray(edge)||edge.length!==2||edge.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length)||edge[0]===edge[1])throw new Error('模型线网含无效端点。');
   const assignment=graph.edges_assignment[index] as Assignment;
   if(!Object.hasOwn(colors,assignment))throw new Error('模型线网含未知线段类型。');
   return {index,a:[...vertices[edge[0]]],b:[...vertices[edge[1]]],assignment,color:colors[assignment]};
  });
  return {edges,assignmentsKnown:true,message:'折后原始线网 · 保留山谷类型，不按层序遮挡。'};
 }
 const seen=new Set<string>(),edges:ModelWireEdge[]=[];
 for(const face of result.geometry.faces)for(let i=0;i<face.length;i++){
  const a=face[i],b=face[(i+1)%face.length],key=a<b?`${a},${b}`:`${b},${a}`;
  if(a===b||seen.has(key))continue;seen.add(key);
  edges.push({index:edges.length,a:[...vertices[a]],b:[...vertices[b]],assignment:'U',color:colors.U});
 }
 return {edges,assignmentsKnown:false,message:'模型缺少原始线网类型，仅显示未知类型的面边线。'};
}
