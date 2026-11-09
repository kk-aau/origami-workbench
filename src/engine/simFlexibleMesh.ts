import type {FoldGraph} from '../core/types';
import {prepareFoldModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/prepare';
import type {FoldAssignment,FoldDocument,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

export type SimulationMeshQuality='original'|'standard'|'fine';
export const SIMULATION_MESH_LEVELS:Readonly<Record<SimulationMeshQuality,number>>=Object.freeze({original:0,standard:2,fine:3});
export function isSimulationMeshQuality(value:unknown):value is SimulationMeshQuality{return value==='original'||value==='standard'||value==='fine';}
export interface SimulationMeshLimits {maxVertices?:number;maxTriangles?:number}
export interface SimulationMeshProvenance {
  baseVertexCount:number;
  /** Every added point is a convex combination of the unrefined mesh vertices. */
  vertexWeights:[number,number][][];
  /** Null means numerical support, never an actual paper crease. */
  edgeSourceEdges:(number|null)[];
}

function materialEdgeSources(prepared:PreparedOrigamiModel):(number|null)[]{
  const marker=prepared.fold.zhezhi_simulation_mesh as {edgeSourceEdges?:unknown;sourceEdgeCount?:number}|undefined;
  if(Array.isArray(marker?.edgeSourceEdges)&&marker.edgeSourceEdges.length===prepared.edgeCount&&marker.edgeSourceEdges.every(e=>e===null||Number.isSafeInteger(e)&&e>=0))return [...marker.edgeSourceEdges];
  return prepared.edgesAssignment.map((kind,e)=>{
    const faces=prepared.edgesFaces[e],parents=prepared.triangleSourceFaces;
    return kind!=='F'||e<(marker?.sourceEdgeCount??0)||faces.length===2&&parents&&parents[faces[0]]!==parents[faces[1]]?e:null;
  });
}

/** Refine an already validated material mesh, not the CP. Midpoints belong to
 * indexed edges, so opposing slit banks and coincident sheets stay distinct.
 * Every neighboring triangle uses the same midpoint of its actual shared edge.
 * The operation is all-or-nothing; requested resolution is never silently cut. */
export function refinePreparedSimulationMesh(base:PreparedOrigamiModel,levels:number,limits:SimulationMeshLimits={}):PreparedOrigamiModel{
  if(!Number.isInteger(levels)||levels<0||levels>3)throw Error('纸面网格细分级别无效。');
  if(levels===0)return base;
  const maxVertices=limits.maxVertices??5000,maxTriangles=limits.maxTriangles??15000;
  if(!Number.isSafeInteger(maxVertices)||maxVertices<3||!Number.isSafeInteger(maxTriangles)||maxTriangles<1)throw Error('纸面网格容量无效。');
  let vertexCount=base.vertexCount,edgeCount=base.edgeCount,faceCount=base.faceCount;
  for(let level=0;level<levels;level++){
    vertexCount+=edgeCount;edgeCount=edgeCount*2+faceCount*3;faceCount*=4;
    if(vertexCount>maxVertices||faceCount>maxTriangles)throw Error(`所选细分需要 ${vertexCount.toLocaleString('en-US')} 个顶点、${faceCount.toLocaleString('en-US')} 个三角片，超过当前模拟容量（${maxVertices.toLocaleString('en-US')} 顶点、${maxTriangles.toLocaleString('en-US')} 片）；请选择较低精细度。`);
  }
  let vertices=base.fold.vertices_coords.map(p=>[...p]),edges=base.edgesVertices.map(e=>[...e] as [number,number]),assignments=[...base.edgesAssignment],angles=[...base.edgesFoldAngle],faces=base.facesVertices.map(f=>[...f]),rows=base.facesEdges.map(r=>[...r]);
  let parents=[...(base.triangleSourceFaces??faces.map((_,i)=>i))],edgeSources=materialEdgeSources(base);
  const weights:[number,number][][]=vertices.map((_,v)=>[[v,1]]);
  for(let level=0;level<levels;level++){
    const mids=edges.map(([a,b])=>{
      const v=vertices.length;vertices.push(vertices[a].map((x,k)=>(x+vertices[b][k])/2));
      const values=new Map<number,number>();for(const [source,weight]of [...weights[a],...weights[b]])values.set(source,(values.get(source)??0)+weight/2);
      weights.push([...values].sort((a,b)=>a[0]-b[0]));return v;
    });
    const nextEdges:[number,number][]=[],nextAssignments:FoldAssignment[]=[],nextAngles:Array<number|null>=[],nextSources:(number|null)[]=[],nextFaces:number[][]=[],nextRows:number[][]=[],nextParents:number[]=[];
    const add=(a:number,b:number,kind:FoldAssignment='F',angle:number|null=0,source:number|null=null)=>{const e=nextEdges.length;nextEdges.push([a,b]);nextAssignments.push(kind);nextAngles.push(angle);nextSources.push(source);return e;};
    edges.forEach(([a,b],e)=>{add(a,mids[e],assignments[e],angles[e],edgeSources[e]);add(mids[e],b,assignments[e],angles[e],edgeSources[e]);});
    const half=(e:number,v:number)=>{const [a,b]=edges[e];if(v!==a&&v!==b)throw Error('纸面细分的实际边关联不符。');return e*2+(v===a?0:1);};
    faces.forEach(([a,b,c],f)=>{
      const [ab,bc,ca]=rows[f],u=mids[ab],v=mids[bc],w=mids[ca];
      const uv=add(u,v),vw=add(v,w),wu=add(w,u);
      nextFaces.push([a,u,w],[u,b,v],[w,v,c],[u,v,w]);
      nextRows.push([half(ab,a),wu,half(ca,a)],[half(ab,b),half(bc,b),uv],[vw,half(bc,c),half(ca,c)],[uv,vw,wu]);
      nextParents.push(parents[f],parents[f],parents[f],parents[f]);
    });
    edges=nextEdges;assignments=nextAssignments;angles=nextAngles;edgeSources=nextSources;faces=nextFaces;rows=nextRows;parents=nextParents;
  }
  const incidence=edges.map(()=>[] as number[]);rows.forEach((r,f)=>r.forEach(e=>incidence[e].push(f)));
  incidence.forEach((owners,e)=>{if(owners.length!==(assignments[e]==='B'?1:2))throw Error('细分网格改变了纸张边界或折痕的面关联。');});
  const marker=base.fold.zhezhi_simulation_mesh as {sourceEdgeCount?:number}|undefined;
  const provenance:SimulationMeshProvenance={baseVertexCount:base.vertexCount,vertexWeights:weights,edgeSourceEdges:edgeSources};
  const fold:FoldDocument={...structuredClone(base.fold),vertices_coords:vertices,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:angles,faces_vertices:faces,faces_edges:rows,edges_faces:incidence,
    zhezhi_simulation_mesh:{schema:'zhezhi-simulation-mesh-v2',sourceEdgeCount:marker?.sourceEdgeCount??base.edgeCount,sourceFaceCount:base.sourceFaceCount??base.faceCount,triangleSourceFaces:parents,edgeSourceEdges:edgeSources},zhezhi_flexible_mesh:provenance};
  // Stale polygon incidence must never be attached to the refined triangles.
  for(const key of ['faces_holes','faces_holeEdges','faces_holeFaces','faces_faces','vertices_edges','vertices_vertices','vertices_faces','edges_length','edges_vector'])delete fold[key];
  const refined=prepareFoldModel(fold,{triangulate:false,preserveTopology:true});
  if(refined.vertexCount!==vertices.length||refined.faceCount!==faces.length||refined.edgeCount!==edges.length||refined.facesVertices.some((t,f)=>t.some((v,k)=>v!==faces[f][k]))||refined.edgesVertices.some((r,e)=>r.some((v,k)=>v!==edges[e][k])))throw Error('细分网格低于可表示精度，未删除或合并纸面。请选择较低精细度。');
  refined.edgesVertices.forEach(([a,b])=>{if(Math.hypot(...[0,1,2].map(k=>refined.positions[a*3+k]-refined.positions[b*3+k]))===0)throw Error('细分网格边长低于浮点精度，请选择较低精细度。');});
  refined.facesVertices.forEach(([a,b,c])=>{const p=refined.positions,u=[0,1,2].map(k=>p[b*3+k]-p[a*3+k]),v=[0,1,2].map(k=>p[c*3+k]-p[a*3+k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])===0)throw Error('细分网格纸面低于浮点精度，请选择较低精细度。');});
  refined.diagnostics.warnings.unshift(...base.diagnostics.warnings);
  return refined;
}

/** Re-playable rest material in the application's FOLD coordinate convention.
 * No posed vertex, temporary fold target or current solver state is baked in. */
export function simulationInputMeshFold(prepared:PreparedOrigamiModel):FoldGraph{
  const fold=structuredClone(prepared.fold);fold.vertices_coords=fold.vertices_coords.map(([x,y,z])=>[x,-z,y]);
  return fold as unknown as FoldGraph;
}
