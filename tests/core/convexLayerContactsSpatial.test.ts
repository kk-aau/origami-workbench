import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {BoundsIndex,type Bounds2} from '../../src/core/boundsIndex';
import {convexEdgesFacesOverlap,convexFacesOverlap} from '../../src/core/convexLayerContacts';
import type {FoldGraph,Point} from '../../src/core/types';

function polygonsGraph(polygons:Point[][]):FoldGraph{
 const vertices_coords:Point[]=[],edges_vertices:[number,number][]=[],faces_vertices:number[][]=[],faces_edges:number[][]=[],edges_faces:number[][]=[];
 polygons.forEach((points,f)=>{
  const first=vertices_coords.length,edge=edges_vertices.length;vertices_coords.push(...points);
  faces_vertices.push(points.map((_,k)=>first+k));faces_edges.push(points.map((_,k)=>edge+k));
  points.forEach((_,k)=>{edges_vertices.push([first+k,first+(k+1)%points.length]);edges_faces.push([f]);});
 });
 return {vertices_coords,edges_vertices,faces_vertices,faces_edges,edges_faces,edges_assignment:edges_vertices.map(()=>'B'),edges_foldAngle:edges_vertices.map(()=>0)};
}
function looseEdge(graph:FoldGraph,a:Point,b:Point){
 const v=graph.vertices_coords.length;graph.vertices_coords.push(a,b);graph.edges_vertices.push([v,v+1]);graph.edges_assignment.push('B');graph.edges_foldAngle.push(0);graph.edges_faces!.push([]);
}
const rectangle=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];

test('indexed face overlap preserves the original exhaustive predicate and row order',()=>{
 const polygons:Point[][]=[];
 for(let i=0;i<72;i++)polygons.push(rectangle((i*17)%31,(i*7)%19,i%5===0?1e-4:2.5,i%5===0?1e-4:3));
 polygons.push(rectangle(1+Number.EPSILON,0,1,1),rectangle(0,0,1,1),rectangle(0,0,1,1).reverse(),rectangle(100,100,2,2));
 const graph=polygonsGraph(polygons),before=structuredClone(graph),normalized=ear.graph.makeFacesPolygon(graph) as Point[][];
 const bounds=normalized.map(points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]);
 for(const epsilon of [0,Number.EPSILON,1e-8,1e-6,.1]){
  const expected=polygons.map(()=>[] as number[]);
  for(let a=0;a<polygons.length;a++)for(let b=a+1;b<polygons.length;b++){
   const x=bounds[a],y=bounds[b];if(x[0]>y[2]+epsilon||y[0]>x[2]+epsilon||x[1]>y[3]+epsilon||y[1]>x[3]+epsilon)continue;
   if(ear.math.overlapConvexPolygons(normalized[a],normalized[b],epsilon)){expected[a].push(b);expected[b].push(a);}
  }
  assert.deepEqual(convexFacesOverlap(graph,epsilon),expected);
 }
 assert.deepEqual(graph,before);
});

test('bounds queries preserve inclusive padding, one-ULP endpoints and stable source order',()=>{
 const boxes:Bounds2[]=[];
 for(let i=0;i<40;i++){const x=(i*17)%41;boxes.push([x,-i,x+2,2-i]);}
 boxes.push([0,0,1,1],[1+Number.EPSILON,0,2,1],[1-Number.EPSILON,0,1,1],[100,100,100,100]);
 const index=new BoundsIndex(boxes);
 for(const query of [...boxes,[1,0,1,1] as Bounds2])for(const padding of [0,Number.EPSILON,1e-6,3])for(const after of [-1,15,boxes.length-1]){
  const expected=boxes.flatMap((b,i)=>i>after&&query[0]<=b[2]+padding&&b[0]<=query[2]+padding&&query[1]<=b[3]+padding&&b[1]<=query[3]+padding?[i]:[]);
  assert.deepEqual(index.query(query,padding,after),expected);
 }
 const points:Point[]=[[1-Number.EPSILON,0],[1,0],[1+Number.EPSILON,0],[1+2*Number.EPSILON,0]],pointIndex=new BoundsIndex(points.map(([x,y]):Bounds2=>[x,y,x,y]));
 const edge:Bounds2=[1,0,2,0],epsilon=Number.EPSILON;
 assert.deepEqual(pointIndex.query([edge[0]-epsilon,edge[1]-epsilon,edge[2]+epsilon,edge[3]+epsilon]),points.flatMap(([x,y],v)=>x>=edge[0]-epsilon&&x<=edge[2]+epsilon&&y>=edge[1]-epsilon&&y<=edge[3]+epsilon?[v]:[]));
 assert.deepEqual(new BoundsIndex([]).query([0,0,1,1]),[]);
});

test('indexed contacts preserve tiny all-false distant endpoints and transitive clusters',()=>{
 const graph=polygonsGraph([rectangle(0,0,.0001,.0001),rectangle(1,0,1,1),rectangle(2+3e-6,0,.1,.1),rectangle(.2,.2,.3,.4).reverse()]);
 looseEdge(graph,[.005,0],[.006,0]);looseEdge(graph,[-1,.5],[4,.5]);
 // Isolated vertices still participate in upstream clustering and point tests.
 graph.vertices_coords.push([2+.75e-6,0],[2+1.5e-6,0],[2+2.25e-6,0],[30,30]);
 const before=structuredClone(graph);
 assert.deepEqual(convexEdgesFacesOverlap(graph,1e-6),ear.graph.getEdgesFacesOverlap(graph,1e-6));
 assert.ok(convexEdgesFacesOverlap(graph,1e-6)[16].includes(0),'distant edge remains incident to the tiny face');
 assert.deepEqual(graph,before);
});

test('indexed contact rows exactly match Rabbit Ear across mixed orientations and overlap densities',()=>{
 let seed=67213;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 for(let run=0;run<12;run++){
  const polygons=Array.from({length:9},(_,i)=>{
   const x=(random()-.5)*8,y=(random()-.5)*8,w=.1+random()*3,h=.1+random()*3;
   const polygon=i%3?rectangle(x,y,w,h):[[x,y],[x+w,y],[x+w/2,y+h]] as Point[];return i%2?polygon.reverse():polygon;
  });
  const graph=polygonsGraph(polygons);
  for(let i=0;i<5;i++)looseEdge(graph,[(random()-.5)*12,(random()-.5)*12],[(random()-.5)*12,(random()-.5)*12]);
  graph.vertices_coords.push([30,30],[-30,-30]);
  assert.deepEqual(convexEdgesFacesOverlap(graph,1e-6),ear.graph.getEdgesFacesOverlap(graph,1e-6),'run '+run);
 }
});

test('coincident and sparse geometry retains source face order after spatial queries',()=>{
 const graph=polygonsGraph([rectangle(20,20,1,1),rectangle(0,0,2,2),rectangle(0,0,2,2).reverse(),rectangle(40,40,1,1),rectangle(.5,.5,.4,.7)]);
 looseEdge(graph,[-1,1],[3,1]);looseEdge(graph,[0,0],[2,0]);looseEdge(graph,[1,0],[1,2]);
 assert.deepEqual(convexEdgesFacesOverlap(graph,1e-6),ear.graph.getEdgesFacesOverlap(graph,1e-6));
});

test('inverted face candidates retain every positive-area contact source and exclude zero contributions',()=>{
 const graph=polygonsGraph([rectangle(0,0,2,2)]);
 looseEdge(graph,[.5,.5],[1.5,.5]); // Two interior endpoints.
 looseEdge(graph,[-1,1],[3,1]); // Two proper edge crossings.
 looseEdge(graph,[-1,-1],[3,3]); // Two nonadjacent face vertices on the segment.
 looseEdge(graph,[0,1],[1,1]); // Endpoint on the interior of a face edge, plus interior endpoint.
 looseEdge(graph,[0,0],[1,1]); // Clustered face vertex, plus interior endpoint.
 looseEdge(graph,[-1,.1],[.1,-1]); // AABBs overlap; all three contact contributions are zero.
 looseEdge(graph,[-.1,0],[2.1,0]); // Adjacent vertex contacts cancel, retaining no contribution.
 const actual=convexEdgesFacesOverlap(graph,1e-6);
 assert.deepEqual(actual,ear.graph.getEdgesFacesOverlap(graph,1e-6));
 assert.deepEqual(actual.slice(4),[[0],[0],[0],[0],[0],[],[]]);
 const components=ear.graph.getOverlappingComponents(graph,1e-6);
 const [a,b]=graph.edges_vertices[9];
 assert.ok(graph.faces_vertices![0].every(v=>!components.verticesEdges[v][9]&&!components.verticesVertices[v][a]&&!components.verticesVertices[v][b]));
 assert.ok(graph.faces_edges![0].every(e=>!components.verticesEdges[a][e]&&!components.verticesEdges[b][e]&&!components.edgesEdges[9][e]));
 assert.ok(!components.facesVertices[0][a]&&!components.facesVertices[0][b]);
});
