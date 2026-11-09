import {distance,polygonArea} from './geometry';
import {materialLayerRegions} from './materialLayerRegions';
import type {FoldGraph,Point} from './types';

/** Ordinary FOLD graphs may omit adjacency. Reconstruct it from indexed face
 * corners only when each endpoint pair identifies one source edge. Parallel
 * slit banks and hole boundaries still require their explicit occurrence IDs;
 * coordinates never participate, and supplied incidence is never overwritten. */
function flatCreaseIncidence(graph:FoldGraph):FoldGraph {
  if(graph.faces_edges&&graph.edges_faces)return graph;
  const faces=graph.faces_vertices;
  if(!faces?.length)throw Error('有限展开折痕缺少有效的纸面边界关联。');
  if(graph.faces_holes?.some(rows=>rows.length)&&(!graph.faces_edges||!graph.faces_holeEdges))throw Error('材料孔洞需要完整的逐面边界关联，不能按端点重建。');
  const key=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;
  let faceEdges=graph.faces_edges,holeEdges=graph.faces_holeEdges;
  if(!faceEdges){
    const lookup=new Map<string,number[]>();
    graph.edges_vertices.forEach(([a,b],e)=>{const stamp=key(a,b);lookup.set(stamp,[...(lookup.get(stamp)??[]),e]);});
    const ringEdges=(ring:number[])=>ring.map((a,k)=>{
      const matches=lookup.get(key(a,ring[(k+1)%ring.length]));
      if(!matches?.length)throw Error('有限展开折痕的纸面引用不存在的原边。');
      if(matches.length!==1)throw Error('相同端点的切口两侧边必须提供逐面边关联，不能按端点猜测。');
      return matches[0];
    });
    faceEdges=faces.map(ringEdges);
    if(graph.faces_holes&&!holeEdges)holeEdges=graph.faces_holes.map(()=>[]);
  }
  if(faceEdges.length!==faces.length||graph.faces_holes&&(!holeEdges||holeEdges.length!==faces.length))throw Error('有限展开折痕缺少有效的纸面边界关联。');
  let edgeFaces=graph.edges_faces;
  if(!edgeFaces){
    edgeFaces=graph.edges_vertices.map(()=>[] as number[]);
    faceEdges.forEach((row,f)=>[row,...(holeEdges?.[f]??[])].forEach(ring=>ring.forEach(e=>{
      if(!Number.isInteger(e)||e<0||e>=edgeFaces!.length)throw Error('有限展开折痕的面边索引无效。');
      // A finite F walk can use an edge twice in the same face. Public
      // adjacency lists owners once; the area validator recounts occurrences.
      if(!edgeFaces![e].includes(f))edgeFaces![e].push(f);
    })));
  }
  return {...graph,faces_edges:faceEdges,edges_faces:edgeFaces,...(holeEdges?{faces_holeEdges:holeEdges}:{})};
}

/** A finite F branch has no hinge motion or paper area. The ordinary editor
 * retains closed/separating F boundaries; diagram mark-mode graphs already
 * omit all F from physical face boundaries. Public indexing stays intact. */
export function hasFiniteFlatCreases(graph:FoldGraph):boolean {
  if(!graph.edges_assignment.includes('F'))return false;
  const source=flatCreaseIncidence(graph);
  return source.edges_assignment.some((kind,e)=>kind==='F'&&new Set(source.edges_faces![e]??[]).size<2);
}

function onEdge(point:Point,a:Point,b:Point,eps:number){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0;
  return distance(point,[a[0]+t*dx,a[1]+t*dy])<=eps;
}
function contains(point:Point,polygon:Point[],eps:number,strict=false):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];if(onEdge(point,a,b,eps))return !strict;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

/** The graph here is an area-only graph. Strict interiors exclude boundaries
 * and holes; inclusive queries also support tips on a real paper boundary. */
export function flatCreaseFacesAtPoint(graph:FoldGraph,point:Point,eps:number,strict=false):number[] {
  return (graph.faces_vertices??[]).flatMap((face,f)=>contains(point,face.map(v=>graph.vertices_coords[v]),eps,strict)&&
    !(graph.faces_holes?.[f]??[]).some(ring=>contains(point,ring.map(v=>graph.vertices_coords[v]),eps,!strict))?[f]:[]);
}

/** A private, same-face-ID layer graph removes only zero-area F walks.
 * Ordinary Rabbit Ear owners deduplicate repeated darts, so recount them
 * before using the existing strict material-area validator. M/V/U branches,
 * broken boundaries, and F routes outside the actual sheet are refused. */
export function flatCreaseLayerRegions(graph:FoldGraph,eps:number):FoldGraph|null {
  if(!graph.edges_assignment.includes('F'))return null;
  graph=flatCreaseIncidence(graph);
  if(!hasFiniteFlatCreases(graph))return null;
  if(!Number.isFinite(eps)||eps<=0||graph.vertices_coords.length>8192||graph.edges_vertices.length>16384||
    !graph.faces_vertices?.length||!graph.faces_edges||graph.faces_edges.length!==graph.faces_vertices.length)throw Error('有限展开折痕缺少有效的纸面边界关联。');
  const owners=graph.edges_vertices.map(()=>[] as number[]);
  graph.faces_edges.forEach((row,f)=>[row,...(graph.faces_holeEdges?.[f]??[])].forEach(ring=>ring.forEach(e=>{
    if(!Number.isInteger(e)||e<0||e>=owners.length)throw Error('有限展开折痕的面边索引无效。');owners[e].push(f);
  })));
  for(let e=0;e<owners.length;e++){
    const kind=graph.edges_assignment[e],row=owners[e];
    if(kind==='B'&&row.length!==1||kind!=='B'&&kind!=='F'&&(row.length!==2||row[0]===row[1])||kind==='F'&&row.length!==0&&row.length!==2)throw Error('有限展开折痕不能隐藏悬空山谷线或无效纸边。');
  }
  const free=graph.edges_vertices.flatMap((_,e)=>graph.edges_assignment[e]==='F'&&!owners[e].length?[e]:[]),removed=new Set(free);
  const sourceEdges=graph.edges_vertices.flatMap((_,e)=>removed.has(e)?[]:[e]),edgeMap=new Map(sourceEdges.map((e,i)=>[e,i]));
  const used=new Set([...sourceEdges.flatMap(e=>graph.edges_vertices[e]),...graph.faces_vertices.flat(),...(graph.faces_holes??[]).flat(2)]);
  const sourceVertices=graph.vertices_coords.flatMap((_,v)=>used.has(v)?[v]:[]),vertexMap=new Map(sourceVertices.map((v,i)=>[v,i]));
  const remapRing=(ring:number[])=>ring.map(v=>vertexMap.get(v)!);
  const compact:FoldGraph={
    vertices_coords:sourceVertices.map(v=>[...graph.vertices_coords[v]]),
    edges_vertices:sourceEdges.map(e=>graph.edges_vertices[e].map(v=>vertexMap.get(v)!) as [number,number]),
    edges_assignment:sourceEdges.map(e=>graph.edges_assignment[e]),edges_foldAngle:sourceEdges.map(e=>graph.edges_foldAngle[e]),
    faces_vertices:graph.faces_vertices.map(remapRing),faces_edges:graph.faces_edges.map(row=>row.map(e=>edgeMap.get(e)!)),
    edges_faces:sourceEdges.map(e=>owners[e]),
    ...(graph.faces_holes?{faces_holes:graph.faces_holes.map(rows=>rows.map(remapRing)),faces_holeEdges:graph.faces_holeEdges?.map(rows=>rows.map(row=>row.map(e=>edgeMap.get(e)!)))}:{})
  };
  const regions=materialLayerRegions(compact,eps);
  if(regions.faces_vertices?.length!==graph.faces_vertices.length||regions.faces_vertices.some(face=>Math.abs(polygonArea(face.map(v=>regions.vertices_coords[v])))<=eps*eps))throw Error('有限展开折痕改变了真实纸面的身份。');
  let checks=0;
  for(const e of free){
    const [a,b]=graph.edges_vertices[e].map(v=>graph.vertices_coords[v]),mid:Point=[a[0]/2+b[0]/2,a[1]/2+b[1]/2];
    checks+=(regions.faces_vertices??[]).reduce((sum,face)=>sum+face.length,0)*3;
    if(checks>2_000_000)throw Error('有限展开折痕的纸内检查超过有界预算。');
    if(!flatCreaseFacesAtPoint(regions,mid,eps,true).length||!flatCreaseFacesAtPoint(regions,a,eps).length||!flatCreaseFacesAtPoint(regions,b,eps).length)throw Error('有限展开折痕必须位于真实纸面内部，不能位于纸外或孔洞内。');
  }
  return regions;
}
