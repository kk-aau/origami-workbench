import type {Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import type {FoldedVertexSelection} from './foldedVertexEdit';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {modelProjection} from './modelProjection';
import {epsilonFor} from '../core/geometry';

export type StretchEdge=readonly [number,number];
export interface StraightStretch {vertices:number[];ends:[number,number]}
type Crease={a:Point;b:Point;face:number};

/** Only material outlines and displayed creases are selectable, never mesh diagonals. */
export function diagramStretchEdges(pose:DiagramPose,creases:readonly Crease[]):StretchEdge[]{
  const mesh=diagramIllustrationMesh(pose),edges=new Map<string,StretchEdge>(),eps=epsilonFor(pose.sourceDoc);
  const shown=mesh.vertices.map(modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter).project);
  const visible=(face:number)=>!pose.hiddenFaces?.includes(face);
  const add=(a:number,b:number)=>{if(a!==b&&Math.hypot(shown[a][0]-shown[b][0],shown[a][1]-shown[b][1])>eps)edges.set([Math.min(a,b),Math.max(a,b)].join(':'),[a,b]);};
  // Faces are already in material space; coincident banks do not acquire shared IDs.
  mesh.rings.forEach((rings,face)=>{if(visible(face))for(const ring of rings)ring.forEach((a,i)=>add(a,ring[(i+1)%ring.length]));});
  const members=mesh.triangles.map(row=>[...new Set(row.flat())]);
  for(const {a,b,face} of creases){
    if(!visible(face)||!members[face])continue;
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<=eps)continue;
    const ids=members[face].map(id=>{const p=shown[id];return {id,t:((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length),distance:Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length};})
      .filter(p=>p.distance<=eps&&p.t>=-eps/length&&p.t<=1+eps/length).sort((p,q)=>p.t-q.t);
    // An unbound or clipped end must not join unrelated vertices across missing material.
    if(!ids.length||Math.abs(ids[0].t)*length>eps||Math.abs(ids.at(-1)!.t-1)*length>eps)continue;
    for(let i=1;i<ids.length;i++)add(ids[i-1].id,ids[i].id);
  }
  return [...edges.values()];
}

/** Extend only through connected collinear edges; crossings and separate banks stay separate. */
export function straightStretch(vertices:Point[],edges:readonly StretchEdge[],edge:StretchEdge,extensions:readonly StretchEdge[]=[]):StraightStretch|null{
  const a=vertices[edge[0]],b=vertices[edge[1]];if(!a||!b)return null;
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),eps=Math.max(1,length)*1e-7;if(length<=eps)return null;
  const onLine=(id:number)=>{const p=vertices[id];return p&&Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)<=eps*length;};
  const neighbors=new Map<number,number[]>();
  for(const [u,v] of edges)if(onLine(u)&&onLine(v)){
    neighbors.set(u,[...(neighbors.get(u)??[]),v]);neighbors.set(v,[...(neighbors.get(v)??[]),u]);
  }
  if(!neighbors.get(edge[0])?.includes(edge[1]))return null;
  const found=new Set<number>([edge[0]]),queue=[edge[0]];
  for(let i=0;i<queue.length;i++)for(const id of neighbors.get(queue[i])??[])if(!found.has(id)){found.add(id);queue.push(id);}
  const t=(id:number)=>(vertices[id][0]-a[0])*dx+(vertices[id][1]-a[1])*dy;
  if(extensions.some(([u,v])=>!found.has(u)||!found.has(v)||!neighbors.get(u)?.includes(v)))return null;
  const selected=[...edge,...extensions.flat()],positions=selected.map(t),lo=Math.min(...positions),hi=Math.max(...positions);
  const sorted=[...found].filter(id=>t(id)>=lo-eps*length&&t(id)<=hi+eps*length).sort((u,v)=>t(u)-t(v));
  return {vertices:sorted,ends:[sorted[0],sorted.at(-1)!]};
}

export function stretchSelection(vertices:Point[],line:StraightStretch,moving:number):FoldedVertexSelection{
  if(!line.ends.includes(moving))throw Error('请选择直线两端的圆点进行拉伸。');
  const fixed=line.ends.find(id=>id!==moving)!,a=vertices[fixed],b=vertices[moving],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  const followers=line.vertices.filter(id=>id!==fixed&&id!==moving).map(vertex=>({vertex,weight:((vertices[vertex][0]-a[0])*dx+(vertices[vertex][1]-a[1])*dy)/length2})).filter(p=>p.weight>1e-9&&p.weight<1-1e-9);
  return {group:[moving],selected:[moving],followers};
}

