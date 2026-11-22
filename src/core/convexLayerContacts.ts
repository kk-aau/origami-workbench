import ear from 'rabbit-ear';
import type {FoldGraph,Point} from './types';
import {BoundsIndex} from './boundsIndex';
import {reportFlatComputationProgress} from './flatComputationProgress';
import {screenLayerPairs} from './layerPairScreening';
import {gpuFaceVertices} from './gpuFaceVertices';
import {faceVertexPredicate} from './faceVertexFilter';

export type LayerCategory='taco_taco'|'taco_tortilla'|'tortilla_tortilla'|'transitivity';
export type ConvexLayerConstraints=Record<LayerCategory,number[][]>;
type Bounds=[number,number,number,number];
const bounds=(points:Point[]):Bounds=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];

/** Same polygon normalization and SAT as Rabbit Ear's overlap sweep, without
 * allocating a string history entry for every rejected face pair. */
export function convexFacesOverlap(graph:FoldGraph,epsilon:number):number[][]{
  const polygons=ear.graph.makeFacesPolygon(graph) as Point[][],boxes=polygons.map(bounds),overlap=polygons.map(()=>[] as number[]);
  // The same inclusive broad phase and source order as the all-pairs scan.
  // Spatial rejection only: the original polygon predicate still certifies
  // every surviving pair, including mixed-scale/near-contact geometry.
  screenLayerPairs(boxes,(a,b)=>{
    if(ear.math.overlapConvexPolygons(polygons[a],polygons[b],epsilon)){overlap[a].push(b);overlap[b].push(a);}
  },()=>overlap.forEach(row=>{row.length=0;}),{padding:epsilon});
  return overlap;
}

/** Rabbit Ear's component/contact predicates, with conservative spatial rejection.
 * Keep its clustered vertices and exact endpoint/edge counting: clipping a segment
 * against a polygon would change how near vertices and coincident edges count. */
export function convexEdgesFacesOverlap(graph:FoldGraph,epsilon:number):number[][]{
  const points=graph.vertices_coords,edges=graph.edges_vertices,faces=graph.faces_vertices!,faceEdges=graph.faces_edges!;
  const lines=edges.map(([a,b])=>({origin:points[a],vector:ear.math.subtract2(points[b],points[a])}));
  const edgeBounds=edges.map(([a,b])=>bounds([points[a],points[b]])),faceBounds=faces.map(r=>bounds(r.map(v=>points[v])));
  const overlap=(a:Bounds,b:Bounds,padding=epsilon)=>a[0]<=b[2]+padding&&b[0]<=a[2]+padding&&a[1]<=b[3]+padding&&b[1]<=a[3]+padding;
  const edgeIndex=new BoundsIndex(edgeBounds),pointIndex=new BoundsIndex(points.map(([x,y])=>[x,y,x,y]));
  const incidentEdges=points.map(()=>[] as number[]);
  edges.forEach(([a,b],e)=>{incidentEdges[a].push(e);if(a!==b)incidentEdges[b].push(e);});
  const cluster=new Int32Array(points.length),clusterEdges:number[][]=[];
  let contactPadding=epsilon;
  ear.graph.getVerticesClusters(graph,epsilon).forEach((row,i)=>{
    clusterEdges.push([]);
    row.forEach(v=>{cluster[v]=i;});const box=bounds(row.map(v=>points[v]));contactPadding=Math.max(contactPadding,box[2]-box[0],box[3]-box[1]);
  });
  edges.forEach(([a,b],e)=>{clusterEdges[cluster[a]].push(e);if(cluster[a]!==cluster[b])clusterEdges[cluster[b]].push(e);});
  const verticesEdges=points.map(()=>new Set<number>()),edgeVertices=edges.map(()=>[] as number[]),edgesEdges=edges.map(()=>new Set<number>());
  reportFlatComputationProgress({stage:'contacts-vertices',label:'复核顶点与纸边接触',completed:0,total:edges.length});
  for(let e=0;e<edges.length;e++){
    if((e&1023)===0)reportFlatComputationProgress({stage:'contacts-vertices',label:'复核顶点与纸边接触',completed:e,total:edges.length});
    const b=edgeBounds[e];
    // Expand before querying, retaining min-epsilon/max+epsilon exactly. Moving
    // epsilon to the point side of a comparison can change an ULP boundary.
    for(const v of pointIndex.query([b[0]-epsilon,b[1]-epsilon,b[2]+epsilon,b[3]+epsilon]))if(ear.math.overlapLinePoint(lines[e],points[v],ear.math.excludeS,epsilon)){verticesEdges[v].add(e);edgeVertices[e].push(v);}
  }
  for(let a=0;a<edges.length;a++)for(const b of edgeIndex.query(edgeBounds[a],epsilon,a))if(ear.math.intersectLineLine(lines[a],lines[b],ear.math.excludeS,ear.math.excludeS,epsilon).point!==undefined){edgesEdges[a].add(b);edgesEdges[b].add(a);}
  reportFlatComputationProgress({stage:'contacts-faces',label:'复核纸面覆盖',completed:0,total:faces.length});
  const gpuVertices=gpuFaceVertices(points,faces,epsilon);
  const facesVertices=gpuVertices??faces.map(()=>new Set<number>());
  if(!gpuVertices)for(let f=0;f<faces.length;f++){
    if((f&511)===0)reportFlatComputationProgress({stage:'contacts-faces',label:'复核纸面覆盖',completed:f,total:faces.length});
    const accept=faceVertexPredicate(points,faces[f],epsilon);
    for(let v=0;v<points.length;v++)if(accept(v))facesVertices[f].add(v);
  }
  const result=edges.map(()=>[] as number[]),seen=new Uint32Array(edges.length);
  // Two sets reused per edge. Face walks can repeat a vertex, so counting
  // matching positions in a ring would change the upstream incidence rule.
  const included=new Set<number>(),remaining=new Set<number>();
  for(let f=0;f<faces.length;f++){
   if((f&511)===0)reportFlatComputationProgress({stage:'contacts-rules',label:'建立纸层接触约束',completed:f,total:faces.length});
   // A successful count is exactly two, so at least one of its three terms
   // must be nonzero. Invert those unchanged relations to enumerate a superset:
   // face-vertex contacts (before neighbor removal), face-edge contacts, then
   // accepted endpoints. The endpoint union includes tiny-face all-false cases.
   const candidates:number[]=[],stamp=f+1;
   const add=(e:number)=>{if(seen[e]!==stamp){seen[e]=stamp;candidates.push(e);}};
   for(const v of faces[f]){for(const e of verticesEdges[v])add(e);for(const e of clusterEdges[cluster[v]])add(e);}
   for(const other of faceEdges[f]){for(const e of edgesEdges[other])add(e);for(const v of edgeVertices[other])for(const e of incidentEdges[v])add(e);}
   for(const v of facesVertices[f])for(const e of incidentEdges[v])add(e);
   // Each output row is appended in ascending face order, independently of
   // the order in which this one face visits its candidate edges.
   for(const e of candidates){
    const [a,b]=edges[e];
    if(!overlap(faceBounds[f],edgeBounds[e],contactPadding)&&!facesVertices[f].has(a)&&!facesVertices[f].has(b))continue;
    let count=Number(facesVertices[f].has(a))+Number(facesVertices[f].has(b)),crossings=0,lastCrossing=-1;
    for(const other of faceEdges[f])if(verticesEdges[a].has(other)||verticesEdges[b].has(other)||edgesEdges[e].has(other)){
     count++;crossings++;lastCrossing=other;if(count>2)break;
    }
    if(count>2)continue;
    included.clear();remaining.clear();
    const ring=faces[f];
    for(const v of ring)if(verticesEdges[v].has(e)||cluster[v]===cluster[a]||cluster[v]===cluster[b]){included.add(v);remaining.add(v);}
    if(included.size)for(let k=0;k<ring.length;k++){
     const v=ring[k],w=ring[(k+1)%ring.length];if(included.has(v)&&included.has(w)){remaining.delete(v);remaining.delete(w);}
    }
    if(count+remaining.size!==2)continue;
    if(remaining.size===1&&crossings===1&&edges[lastCrossing].includes(remaining.values().next().value!))continue;
    result[e].push(f);
   }
  }
  reportFlatComputationProgress({stage:'contacts-rules',label:'纸层接触约束已建立',completed:faces.length,total:faces.length});
  return result;
}

/** Same taco/tortilla construction as Rabbit Ear 0.9.4 (GPLv3), using the
 * accelerated, predicate-identical edge/face incidence above. */
export function convexLayerContacts(graph:FoldGraph,epsilon:number):ConvexLayerConstraints{
  const centers=ear.graph.makeFacesCenterQuick(graph),contacts={...graph,faces_center:centers};
  const crossing=convexEdgesFacesOverlap(graph,epsilon),sides=ear.layer.makeEdgesFacesSide(contacts),owners=graph.edges_faces!;
  const pairs=ear.graph.connectedComponentsPairs(ear.graph.getEdgesEdgesCollinearOverlap(graph,epsilon)).filter(pair=>pair.every(e=>owners[e].length>1));
  const pairSides=ear.layer.makeEdgePairsFacesSide(contacts,pairs);
  const result:ConvexLayerConstraints={taco_taco:[],taco_tortilla:[],tortilla_tortilla:[],transitivity:[]};
  pairs.forEach(([a,b],i)=>{
    const [left,right]=pairSides[i],first=left[0]===left[1],second=right[0]===right[1],x=owners[a],y=owners[b];
    if(first&&second){if(left[0]===right[0])result.taco_taco.push([x[0],y[0],x[1],y[1]]);}
    else if(!first&&!second)result.tortilla_tortilla.push(left[0]===right[0]?[...x,...y]:[...x,y[1],y[0]]);
    else if(first)result.taco_tortilla.push([x[0],y[left[0]===right[0]?0:1],x[1]]);
    else result.taco_tortilla.push([y[0],x[right[0]===left[0]?0:1],y[1]]);
  });
  // Preserve the upstream construction order for deterministic comparisons.
  const tortillaCrossing=ear.layer.makeTortillaTortillaFacesCrossing(owners,sides,crossing);
  for(const crossing of tortillaCrossing)result.tortilla_tortilla.push(crossing);
  crossing.forEach((faces,e)=>{if(sides[e].length>1&&sides[e][0]===sides[e][1])for(const f of faces)result.taco_tortilla.push([owners[e][0],f,owners[e][1]]);});
  return result;
}
