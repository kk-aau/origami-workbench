import {BoundsIndex,type Bounds2} from './boundsIndex';
import type {FoldGraph,Point} from './types';

/** Disconnected closed bounds are a sufficient separation certificate. Keep
 * every possible hinge, edge/edge and edge/face contact in one component,
 * including touching and ambiguous bounds. A hole is not a separation proof. */
export function contactIslands(group:number[],source:FoldGraph,project:(vertex:number)=>Point,padding:number):number[][]{
  if(group.length<2)return [group];
  const parents=group.map((_,i)=>i);
  const root=(i:number)=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  let components=group.length;
  // A connected sheet usually settles this without any bounding-box queries.
  const firstFace=new Map<number,number>();
  for(const [i,face] of group.entries()){
    for(const vertex of source.faces_vertices![face]){
      const other=firstFace.get(vertex);
      if(other===undefined){firstFace.set(vertex,i);continue;}
      const a=root(i),b=root(other);
      if(a!==b){parents[b]=a;components--;}
    }
    if(components===1)return [group];
  }
  const projected=new Map<number,Point>();
  const bounds:Bounds2[]=group.map(f=>{
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const visit=(v:number)=>{
      let p=projected.get(v);
      if(!p){p=project(v);projected.set(v,p);}
      minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);
    };
    for(const v of source.faces_vertices![f])visit(v);
    for(const ring of source.faces_holes?.[f]??[])for(const v of ring)visit(v);
    for(const edges of [source.faces_edges?.[f]??[],...(source.faces_holeEdges?.[f]??[])]){
      for(const e of edges){const [a,b]=source.edges_vertices[e];visit(a);visit(b);}
    }
    return [minX,minY,maxX,maxY];
  });
  const index=new BoundsIndex(bounds);
  for(let i=0;i<bounds.length&&components>1;i++){
    for(const j of index.query(bounds[i],padding,i)){
      const a=root(i),b=root(j);
      if(a!==b){parents[b]=a;components--;}
    }
  }
  if(components===1)return [group];
  const islands=new Map<number,number[]>();
  for(let i=0;i<group.length;i++){
    const id=root(i),island=islands.get(id);
    if(island)island.push(group[i]);else islands.set(id,[group[i]]);
  }
  return [...islands.values()];
}

export function contactGroupGraph(ids:number[],source:FoldGraph,project:(v:number)=>Point,angles?:readonly (number|null)[]){
    const faceIndex=new Map(ids.map((f,i)=>[f,i]));
    const edgeIds=[...new Set(ids.flatMap(f=>[...(source.faces_edges?.[f]??[]),...(source.faces_holeEdges?.[f]??[]).flat()]))];
    if(!edgeIds.length)throw Error('纸面缺少完整材料边界，无法调整层序。');
    const vertexIds=[...new Set(edgeIds.flatMap(e=>source.edges_vertices[e]))],vi=new Map(vertexIds.map((v,i)=>[v,i])),ei=new Map(edgeIds.map((e,i)=>[e,i]));
    const points=vertexIds.map(v=>project(v)),faces=ids.map(f=>source.faces_vertices![f].map(v=>vi.get(v)!));
    const banks=edgeIds.map(e=>(source.edges_faces?.[e]??[]).filter(f=>faceIndex.has(f)).map(f=>faceIndex.get(f)!));
    const graph:FoldGraph={vertices_coords:points,faces_vertices:faces,edges_vertices:edgeIds.map(e=>source.edges_vertices[e].map(v=>vi.get(v)!) as [number,number]),edges_faces:banks,
      edges_assignment:edgeIds.map((e,i)=>banks[i].length<2?'B':angles&&Math.abs(angles[e]??0)<1e-7?'F':source.edges_assignment[e]),
      edges_foldAngle:edgeIds.map((e,i)=>banks[i].length<2?0:angles?angles[e]:source.edges_foldAngle[e]),
      faces_edges:ids.map(f=>source.faces_edges![f].map(e=>ei.get(e)!)),
      faces_holes:ids.map(f=>(source.faces_holes?.[f]??[]).map(r=>r.map(v=>vi.get(v)!))),
      faces_holeEdges:ids.map(f=>(source.faces_holeEdges?.[f]??[]).map(r=>r.map(e=>ei.get(e)!))),
      ...(source.zhezhi_flatCreases?{zhezhi_flatCreases:source.zhezhi_flatCreases}:{})};
    return graph;
}
