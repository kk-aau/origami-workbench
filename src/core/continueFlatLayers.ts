import ear from 'rabbit-ear';
import {polygonArea,cross,sub,distance} from './geometry';
import type {FlatFoldResult} from './types';
import {flatLayerOrder} from './flatLayerOrder';

/** Validate a previous stacking against all constraints of the new geometry.
 * This never branches/searches. A changed topology, new unknown overlap or
 * failed constraint returns null, so the caller can retain the last valid image.
 */
export function continueFlatLayers(current:FlatFoldResult,previous:FlatFoldResult|null):FlatFoldResult|null{
 if(current.geometry.status!=='ready'||previous?.geometry.status!=='ready'||previous.layers.status!=='solved'||!previous.layers.faceOrders)return null;
 const graph=current.geometry.graph,old=previous.geometry.graph;
 if(!graph||!old||current.geometry.startingFace!==previous.geometry.startingFace||['faces_vertices','edges_vertices','edges_assignment'].some(key=>JSON.stringify(graph[key])!==JSON.stringify(old[key])))return null;
 const normals=current.geometry.faces.map(f=>Math.sign(polygonArea(f.map(v=>current.geometry.vertices[v]))));
 if(normals.some((n,i)=>!n||n!==Math.sign(polygonArea(previous.geometry.faces[i].map(v=>previous.geometry.vertices[v])))))return null;
 try{
  const xs=current.geometry.vertices.map(p=>p[0]),ys=current.geometry.vertices.map(p=>p[1]);
  const eps=Math.max(1e-6,Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1e-8);
  if(current.geometry.faces.some((face,index)=>{const ps=face.map(v=>current.geometry.vertices[v]);return Math.abs(polygonArea(ps))<=eps*eps||ps.some((a,i)=>{const b=ps[(i+1)%ps.length],length=distance(a,b);return length<=eps||ps.some(p=>normals[index]*cross(sub(b,a),sub(p,a)) < -eps*length);});}))return null;
  // Slit sides can have equal endpoint IDs but remain distinct edges. Their
  // verified corner-to-edge incidences cannot be recovered from endpoint keys.
  const faces_edges=graph.faces_edges??ear.graph.makeFacesEdgesFromVertices(graph),edges_faces=ear.graph.makeEdgesFacesUnsorted({...graph,faces_edges});
  const data=ear.layer.makeSolverConstraintsFlat({...graph,faces_edges,edges_faces},eps);
  const saved:Record<string,number>={};
  for(const [a,b,sign] of previous.layers.faceOrders){const value=sign*normals[b]*(a<b?1:-1);saved[a<b?`${a} ${b}`:`${b} ${a}`]=value>0?1:2;}
  const keys=new Set<string>([...data.facePairs,...Object.keys(data.orders)]),orders:Record<string,number>={};
  for(const key of keys){if(!saved[key])return null;orders[key]=saved[key];}
  if(Object.entries(data.orders).some(([key,value])=>orders[key]!==value))return null;
  // Every current overlap is already assigned, so solver only propagates and
  // checks taco/tortilla/transitivity rules; it cannot enter its branch search.
  const checked=ear.layer.solver({...data,orders});
  if(checked.branches)return null;
  const faceOrders=ear.layer.solverSolutionToFaceOrders(checked.orders,data.faces_winding);
  const faceOrder=flatLayerOrder(current.geometry.vertices,current.geometry.faces,faceOrders);
  return {...current,layers:{status:'solved',message:'当前几何已验证沿用的层序；完整候选搜索在后台更新。',faceOrders,...(faceOrder.length===current.geometry.faces.length?{faceOrder}:{})}};
 }catch{return null;}
}
