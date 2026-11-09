import type {FoldGraph,Point} from './types';
import {polygonArea} from './geometry';
import {materialPointInside,materialOrientation} from './materialTraceGeometry';
import {walkMaterialFaceDarts} from './materialHoleSplit';

/** Ordinary CP boundaries describe material by even/odd nesting. Only use
 * this route for multiple closed loops; keep original edge and vertex IDs. */
export function buildBoundaryRegions(graph:FoldGraph,marks:boolean):boolean {
 const coords=graph.vertices_coords,edges=graph.edges_vertices;
 const incident=coords.map(()=>[] as number[]);
 edges.forEach(([a,b],e)=>{if(graph.edges_assignment[e]==='B'){incident[a].push(e);incident[b].push(e);}});
 if(incident.some(row=>row.length%2!==0))return false;
 const touching=incident.some(row=>row.length>2);
 const used=new Set<number>(),loops:{vertices:number[];edges:number[]}[]=[];
 edges.forEach(([start],seed)=>{
  if(touching||graph.edges_assignment[seed]!=='B'||used.has(seed))return;
  const vertices:number[]=[],ringEdges:number[]=[];let v=start,e=seed;
  do{if(used.has(e))throw Error('纸张边界绕行不闭合。');used.add(e);vertices.push(v);ringEdges.push(e);v=edges[e][0]===v?edges[e][1]:edges[e][0];e=incident[v].find(i=>i!==e)!;}while(v!==start);
  if(vertices.length<3||polygonArea(vertices.map(v=>coords[v]))===0)throw Error('纸张边界退化，无法确定材料区域。');
  loops.push({vertices,edges:ringEdges});
 });
 if(!touching&&loops.length<2)return false;
 const polygons=loops.map(r=>r.vertices.map(v=>coords[v]));
 const boundary=edges.flatMap((_,e)=>graph.edges_assignment[e]==='B'?[e]:[]);
 const inside=(p:Point)=>{
  let parity=false;
  for(const e of boundary){const [a,b]=edges[e].map(v=>coords[v]);if((a[1]>p[1])===(b[1]>p[1]))continue;const sign=materialOrientation(a,b,p);if(b[1]>a[1]?sign>0:sign<0)parity=!parity;}
  return parity;
 };
 const half:{a:number;b:number;e:number}[]=[];
 loops.forEach((r,i)=>{
  const depth=polygons.reduce((n,p,j)=>n+Number(i!==j&&materialPointInside(polygons[i][0],p)),0);
  const forward=(polygonArea(polygons[i])>0)===(depth%2===0);
  r.vertices.forEach((a,k)=>{const b=r.vertices[(k+1)%r.vertices.length],e=r.edges[k];half.push(forward?{a,b,e}:{a:b,b:a,e});});
 });
 if(touching)for(const e of boundary){
  const [a,b]=edges[e],p=coords[a],q=coords[b],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy),mid:Point=[p[0]/2+q[0]/2,p[1]/2+q[1]/2];
  // Choose a sample disk proven clear of every other boundary. Its radius
  // follows local geometry, not the drawing's scale or an arbitrary epsilon.
  let clearance=length/2;
  for(const other of boundary){if(other===e)continue;const [x,y]=edges[other].map(v=>coords[v]),vx=y[0]-x[0],vy=y[1]-x[1],t=Math.max(0,Math.min(1,((mid[0]-x[0])*vx+(mid[1]-x[1])*vy)/(vx*vx+vy*vy)));clearance=Math.min(clearance,Math.hypot(mid[0]-x[0]-t*vx,mid[1]-x[1]-t*vy));}
  const offset=clearance/4,left:Point=[mid[0]-dy/length*offset,mid[1]+dx/length*offset],right:Point=[mid[0]+dy/length*offset,mid[1]-dx/length*offset];
  if(!(offset>0)||inside(left)===inside(right))throw Error('接触边界的材料侧无法可靠区分，请检查重叠或退化边界。');
  half.push(inside(left)?{a,b,e}:{a:b,b:a,e});
 }
 edges.forEach(([a,b],e)=>{
  if(graph.edges_assignment[e]==='B')return;
  const p:Point=[coords[a][0]/2+coords[b][0]/2,coords[a][1]/2+coords[b][1]/2];
  if(!inside(p))throw Error(`线段 ${e+1} 位于纸张外部或孔洞内部，请修剪到实际纸面范围。`);
  if(marks&&graph.edges_assignment[e]==='F')return;
  half.push({a,b,e},{a:b,b:a,e});
 });
 const parts=walkMaterialFaceDarts(coords,half,true);
 graph.faces_vertices=parts.map(p=>p.vertices);graph.faces_edges=parts.map(p=>p.edges);
 graph.faces_holes=parts.map(p=>(p.holes??[]).map(h=>h.vertices));
 graph.faces_holeEdges=parts.map(p=>(p.holes??[]).map(h=>h.edges));
 const owners=edges.map(()=>[] as number[]);
 parts.forEach((p,f)=>[p,...(p.holes??[])].forEach(r=>r.edges.forEach(e=>{if(!owners[e].includes(f))owners[e].push(f);})));graph.edges_faces=owners;
 const neighbor=(e:number,f:number)=>owners[e].find(other=>other!==f)??null;
 graph.faces_faces=parts.map((p,f)=>p.edges.map(e=>neighbor(e,f))) as number[][];
 graph.faces_holeFaces=parts.map((p,f)=>(p.holes??[]).map(r=>r.edges.map(e=>neighbor(e,f))));
 graph.vertices_faces=coords.map((_,v)=>parts.flatMap((p,f)=>[p,...(p.holes??[])].some(r=>r.vertices.includes(v))?[f]:[]));
 const vertexEdges=incident.map(()=>[] as number[]),vertexVertices=incident.map(()=>[] as number[]);
 edges.forEach(([a,b],e)=>{vertexEdges[a].push(e);vertexEdges[b].push(e);vertexVertices[a].push(b);vertexVertices[b].push(a);});
 graph.vertices_edges=vertexEdges;graph.vertices_vertices=vertexVertices;
 return true;
}
