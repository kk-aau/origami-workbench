import {reportDiagramWork} from './diagramWork';
import earcut from 'earcut';
import {epsilonFor} from '../core/geometry';
import {hasMaterialTopology} from '../core/materialTopology';
import type {FoldGraph,Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import {diagramDepthVertices} from './diagramDepth';
import {buildDiagramPoseFold} from './diagramFoldGeometry';

type Triangle=[number,number,number];
export interface DiagramIllustrationMesh {
  /** Original solver/source identity, including its indexed material incidence. */
  baseGraph:FoldGraph;
  /** Source coordinates with illustration anchors appended; physical topology is unchanged. */
  graph:FoldGraph;triangles:Triangle[][];
  /** Folded coordinates use exactly the same extended vertex indices. */
  vertices:Point[];
  /** Illustration outlines include anchors on the corresponding material bank. */
  rings:number[][][];
}
type MeshLayout=Pick<DiagramIllustrationMesh,'baseGraph'|'graph'|'triangles'|'rings'>;
const cache=new WeakMap<object,Map<boolean,MeshLayout>>();
const anchorCache=new WeakMap<object,{base:MeshLayout;layout:MeshLayout}>();
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const key=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;
function triangulate(graph:FoldGraph,face:number):Triangle[] {
  const rings=[graph.faces_vertices![face],...(graph.faces_holes?.[face]??[])],ids=rings.flat(),holes:number[]=[];let offset=rings[0].length;
  for(const ring of rings.slice(1)){holes.push(offset);offset+=ring.length;}
  const indices=earcut(ids.flatMap(v=>graph.vertices_coords[v]),holes,2);
  return Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).map(v=>ids[v]) as Triangle);
}
function insertVertex(row:Triangle[],vertex:number,vertices:Point[],eps:number,tick:()=>void):Triangle[] {
  const point=vertices[vertex],next:Triangle[]=[];
  for(const triangle of row){
    tick();if(triangle.includes(vertex)){next.push(triangle);continue;}
    const p=triangle.map(v=>vertices[v]),sign=Math.sign(cross(p[0],p[1],p[2]));
    const sides=p.map((a,i)=>sign*cross(a,p[(i+1)%3],point)),tolerances=p.map((a,i)=>eps*Math.max(eps,distance(a,p[(i+1)%3])));
    if(!sign||sides.some((s,i)=>s< -tolerances[i])){next.push(triangle);continue;}
    const edge=sides.findIndex((s,i)=>Math.abs(s)<=tolerances[i]);
    if(edge>=0){const a=triangle[edge],b=triangle[(edge+1)%3],c=triangle[(edge+2)%3];next.push([a,vertex,c],[vertex,b,c]);}
    else next.push([triangle[0],triangle[1],vertex],[triangle[1],triangle[2],vertex],[triangle[2],triangle[0],vertex]);
  }
  // Coordinate-height tolerance excludes remote insertions into numerical slivers.
  return next.filter(t=>{
    const [a,b,c]=t.map(v=>vertices[v]);
    return Math.abs(cross(a,b,c))>eps*Math.max(eps,distance(a,b),distance(b,c),distance(c,a));
  });
}

function extendedLayout(base:MeshLayout,pose:Pick<DiagramPose,'sourceDoc'|'paperDeformation'>):MeshLayout {
  const deformation=pose.paperDeformation;if(!deformation?.nodes.length)return base;
  const prior=anchorCache.get(deformation);if(prior?.base===base)return prior.layout;
  const graph={...base.graph,vertices_coords:[...base.graph.vertices_coords,...deformation.nodes.map(node=>node.cp)]},eps=epsilonFor(pose.sourceDoc);
  const triangles=base.triangles.map(row=>row.map(t=>[...t] as Triangle)),rings=base.rings.map(row=>row.map(ring=>[...ring]));
  const tick=reportDiagramWork;
  deformation.nodes.forEach((node,offset)=>{
    const vertex=base.graph.vertices_coords.length+offset,row=triangles[node.face];
    if(!row)throw Error('纸面锚点引用了不存在的材料面。');
    triangles[node.face]=insertVertex(row,vertex,graph.vertices_coords,eps,tick);
    if(!triangles[node.face].some(t=>t.includes(vertex)))throw Error('纸面锚点不在有效的原纸面分区中。');
    for(const ring of rings[node.face])for(let i=0;i<ring.length;i++){
      tick();const a=graph.vertices_coords[ring[i]],b=graph.vertices_coords[ring[(i+1)%ring.length]],length=distance(a,b);
      if(length<=eps||Math.abs(cross(a,b,node.cp))>eps*length)continue;
      const along=((node.cp[0]-a[0])*(b[0]-a[0])+(node.cp[1]-a[1])*(b[1]-a[1]))/length;
      if(along>eps&&along<length-eps){ring.splice(i+1,0,vertex);break;}
    }
  });
  const layout={baseGraph:base.baseGraph,graph,triangles,rings};anchorCache.set(deformation,{base,layout});return layout;
}

/** Illustration cells follow existing CP creases, including unfolded F marks.
 * They share the original indexed vertices and parent paper-face identity;
 * neither the solver topology nor saved CP/layer count is changed. */
export function diagramIllustrationMesh(pose:Pick<DiagramPose,'sourceDoc'|'result'|'paperDeformation'|'view'|'spatial'>):DiagramIllustrationMesh {
  const marks=pose.result.geometry.graph?.zhezhi_flatCreases==='marks',prior=cache.get(pose.sourceDoc)?.get(marks);
  if(prior){const layout=extendedLayout(prior,pose);return {...layout,vertices:diagramDepthVertices(pose,[...pose.result.geometry.vertices,...(pose.paperDeformation?.nodes.map(node=>node.point)??[])],layout.triangles).vertices};}
  const graph=buildDiagramPoseFold(pose).graph,vertices=graph.vertices_coords,eps=epsilonFor(pose.sourceDoc);
  const tick=reportDiagramWork;
  const insert=(row:Triangle[],vertex:number)=>insertVertex(row,vertex,vertices,eps,tick);
  const triangles:Triangle[][]=(graph.faces_vertices??[]).map(()=>[]);
  if(!marks||hasMaterialTopology(pose.sourceDoc)||!graph.edges_assignment.includes('F')){
    triangles.forEach((_,face)=>{triangles[face]=triangulate(graph,face);});
  }else{
    triangles.forEach((_,face)=>{triangles[face]=triangulate(graph,face);});
    // Earcut removes collinear boundary points and dangling crease tips. Keep
    // those actual CP vertices as independent, locally incident drag anchors.
    const markVertices=graph.edges_vertices.flatMap(([a,b],edge)=>graph.edges_assignment[edge]==='F'?[a,b]:[]);
    for(let face=0;face<triangles.length;face++)for(const vertex of new Set([graph.faces_vertices![face],...(graph.faces_holes?.[face]??[])].flat().concat(markVertices))){
      triangles[face]=insert(triangles[face],vertex);
    }
    // Recover finite crease constraints that do not enclose a planar cell.
    // Flipping a crossing diagonal keeps the same indexed vertices/coverage.
    const protectedEdges=new Set(graph.edges_vertices.map(([u,v])=>key(u,v)));
    for(const [edgeIndex,[a,b]] of graph.edges_vertices.entries()){
      if(graph.edges_assignment[edgeIndex]!=='F')continue;
      const start=vertices[a],end=vertices[b],length=distance(start,end);if(length<=eps)continue;
      for(const row of triangles){
        const ids=new Set(row.flat());if(!ids.has(a)||!ids.has(b))continue;
        const adjacencyOf=()=>{
          const adjacency=new Map<string,{edge:[number,number];owners:number[]}>();
          row.forEach((triangle,i)=>triangle.forEach((u,k)=>{tick();const v=triangle[(k+1)%3],id=key(u,v),entry=adjacency.get(id);if(entry)entry.owners.push(i);else adjacency.set(id,{edge:[u,v],owners:[i]});}));
          return adjacency;
        };
        const crosses=(u:number,v:number)=>{
          const p=vertices[u],q=vertices[v],r=cross(start,end,p),s=cross(start,end,q),t=cross(p,q,start),w=cross(p,q,end),diagonalLength=distance(p,q);
          return r*s<0&&t*w<0&&Math.min(Math.abs(r),Math.abs(s))>eps*length&&Math.min(Math.abs(t),Math.abs(w))>eps*diagonalLength;
        };
        const adjacency=adjacencyOf();if(adjacency.has(key(a,b)))continue;
        const queue=[...adjacency.values()].filter(({edge:[u,v]})=>crosses(u,v)).map(entry=>entry.edge);
        // Process the whole strip before reconsidering a new diagonal, so a
        // quadrilateral whose two diagonals cross the crease cannot flip back
        // and forth while the rest of the intersected strip is still unchanged.
        for(let attempt=0;queue.length&&attempt<Math.max(100,row.length*row.length*4);attempt++){
          const [u,v]=queue.shift()!,entry=adjacencyOf().get(key(u,v));tick();
          if(!entry||!crosses(u,v))continue;
          const {owners}=entry;if(owners.length!==2||protectedEdges.has(key(u,v)))throw Error('已有折痕与纸面边界冲突，无法构造局部分区。');
          const c=row[owners[0]].find(i=>i!==u&&i!==v)!,d=row[owners[1]].find(i=>i!==u&&i!==v)!;
          const first=cross(vertices[c],vertices[d],vertices[u]),second=cross(vertices[c],vertices[d],vertices[v]),tolerance=eps*distance(vertices[c],vertices[d]);
          if(first*second>=0||Math.min(Math.abs(first),Math.abs(second))<=tolerance){queue.push([u,v]);continue;}
          row[owners[0]]=[c,d,u];row[owners[1]]=[d,c,v];if(crosses(c,d))queue.push([c,d]);
        }
        if(!row.some(t=>t.includes(a)&&t.includes(b))){
          // A nonconvex strip may not settle through diagonal flips. Recover
          // its two boundary chains and triangulate each side of the crease.
          const strip=new Set<number>();
          row.forEach((triangle,index)=>{
            tick();let lo=0,hi=1;const p=triangle.map(v=>vertices[v]),sign=Math.sign(cross(p[0],p[1],p[2]));
            for(let i=0;i<3;i++){
              const u=p[i],v=p[(i+1)%3],tolerance=eps*distance(u,v),rawS=sign*cross(u,v,start),rawT=sign*cross(u,v,end),s=Math.abs(rawS)<=tolerance?0:rawS,t=Math.abs(rawT)<=tolerance?0:rawT;
              if(s<0&&t<0)return;if(s>=0&&t>=0)continue;
              const at=s/(s-t);if(s<0)lo=Math.max(lo,at);else hi=Math.min(hi,at);
            }
            if((hi-lo)*length<=eps)return;
            const at=(lo+hi)/2,mid:Point=[start[0]+(end[0]-start[0])*at,start[1]+(end[1]-start[1])*at];
            if(p.every((u,i)=>sign*cross(u,p[(i+1)%3],mid)>eps*distance(u,p[(i+1)%3])))strip.add(index);
          });
          const boundary=new Map<string,{edge:[number,number];count:number}>();
          for(const index of strip)row[index].forEach((u,i)=>{const v=row[index][(i+1)%3],id=key(u,v),old=boundary.get(id);if(old)old.count++;else boundary.set(id,{edge:[u,v],count:1});});
          const neighbors=new Map<number,number[]>();for(const {edge:[u,v],count} of boundary.values())if(count===1){neighbors.set(u,[...(neighbors.get(u)??[]),v]);neighbors.set(v,[...(neighbors.get(v)??[]),u]);}
          const branches=neighbors.get(a);if(branches?.length!==2||neighbors.get(b)?.length!==2)throw Error('已有折痕的局部分区无法可靠构造，请整理交点后重试。');
          const chains=branches.map(first=>{
            const chain=[a];let previous=a,current=first;
            while(current!==b&&chain.length<=neighbors.size){tick();chain.push(current);const options=neighbors.get(current);if(options?.length!==2)break;const next=options.find(v=>v!==previous)!;previous=current;current=next;}
            if(current!==b)throw Error('折痕局部分区的边界不连续。');return [...chain,b];
          });
          let replacement=chains.flatMap(chain=>triangulate({...graph,faces_vertices:[chain],faces_holes:undefined},0));
          for(const vertex of neighbors.keys())replacement=insert(replacement,vertex);
          const remaining=row.filter((_,index)=>!strip.has(index));row.splice(0,row.length,...remaining,...replacement);
          if(!row.some(t=>t.includes(a)&&t.includes(b)))throw Error('已有折痕的局部分区无法可靠构造，请整理交点后重试。');
        }
      }
    }
  }
  // Earcut and edge recovery can use different windings; material-side paint
  // compares the actual deformation against one consistent source winding.
  for(const row of triangles)for(const triangle of row)if(cross(...triangle.map(v=>vertices[v]) as [Point,Point,Point])<0)[triangle[1],triangle[2]]=[triangle[2],triangle[1]];
  const base={baseGraph:graph,graph,triangles,rings:(graph.faces_vertices??[]).map((ring,face)=>[ring,...(graph.faces_holes?.[face]??[])])};
  let entries=cache.get(pose.sourceDoc);if(!entries){entries=new Map();cache.set(pose.sourceDoc,entries);}entries.set(marks,base);
  const layout=extendedLayout(base,pose);return {...layout,vertices:diagramDepthVertices(pose,[...pose.result.geometry.vertices,...(pose.paperDeformation?.nodes.map(node=>node.point)??[])],layout.triangles).vertices};
}
