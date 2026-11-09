import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ear from 'rabbit-ear';
import {buildConcaveLayerPartition,solveConcaveLayerOrders} from '../../src/core/concaveLayers';
import {convexLayerContacts} from '../../src/core/convexLayerContacts';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {polygonArea} from '../../src/core/geometry';
import {prepareTessResult,tessConstructionKey} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {splitWovenCutGraph} from '../../src/app/wovenCutTopology';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import type {FoldGraph,Point} from '../../src/core/types';

const cases=JSON.parse(readFileSync('tests/fixtures/woven-concave-cells-20261001.json','utf8')).cases;
const full=cases.find((c:any)=>c.name==='reflex-cell-full-insets');
function actual(c=full){const result=prepareTessResult(c.response,c.params??c.query);return computeTessFlatGeometry(tessFlatInput(result,result.doc,tessConstructionKey(c.params??c.query),true));}
function epsilon(graph:FoldGraph){const ps=graph.vertices_coords;return Math.max(1e-6,Math.max(Math.max(...ps.map(p=>p[0]))-Math.min(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))-Math.min(...ps.map(p=>p[1])))*1e-8);}
const abs=(a:bigint)=>a<0n?-a:a;
/** Independent exact dyadic arithmetic on the actual IEEE coordinates. */
function exact(n:number):bigint {const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,n);const bits=b.getBigUint64(0),exp=Number((bits>>52n)&2047n),frac=bits&((1n<<52n)-1n);const m=exp===0?frac:((1n<<52n)|frac)<<BigInt(exp-1);return bits>>63n?-m:m;}
function exactArea(coords:Point[],face:number[]):bigint {return face.reduce((sum,a,k)=>{const b=face[(k+1)%face.length];return sum+exact(coords[a][0])*exact(coords[b][1])-exact(coords[a][1])*exact(coords[b][0]);},0n);}
function sheet(points:Point[],copies=1):FoldGraph {const g:FoldGraph={vertices_coords:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[]};for(let f=0;f<copies;f++){const start=g.vertices_coords.length,n=points.length;g.vertices_coords.push(...points.map(([x,y])=>[x+f*300,y] as Point));g.faces_vertices!.push(Array.from({length:n},(_,i)=>start+i));for(let k=0;k<n;k++){g.edges_vertices.push([start+k,start+(k+1)%n]);g.edges_assignment.push('B');g.edges_foldAngle.push(0);}}return g;}

test('indexed contacts match Rabbit Ear on private concave partitions with J seams excluded',()=>{
 for(const c of cases){
  const source=actual(c).geometry.graph!,eps=epsilon(source),g=buildConcaveLayerPartition(source,eps).graph;
  const contacts={...g,edges_faces:g.edges_faces.map((owners,e)=>g.edges_assignment[e]==='J'?[]:owners)};
  const expected=ear.layer.makeTacosAndTortillas(contacts,eps),indexed=convexLayerContacts(contacts,eps);
  for(const kind of ['taco_taco','taco_tortilla','tortilla_tortilla'] as const)assert.deepEqual(indexed[kind],expected[kind],c.name+': '+kind);
 }
});

test('all five actual concave woven placements solve exactly twice without exposing private points or changing original geometry',()=>{
 for(const c of cases){const input=actual(c),before=structuredClone(input),graph=input.geometry.graph!,eps=epsilon(graph),partition=buildConcaveLayerPartition(graph,eps);
  assert.equal(input.geometry.status,'ready');assert.deepEqual(input,before);
  assert.equal(partition.graph.faces_vertices.length,graph.faces_vertices!.reduce((sum,f)=>sum+f.length-2,0)+2*partition.privateVertices.length);
  if(c===full){assert.equal(partition.privateVertices.length,2);assert.equal(partition.graph.faces_vertices.length,30);assert.equal(graph.vertices_coords.length,24);assert.equal(graph.faces_vertices!.length,13);}
  for(const index of [0,1]){const solved=recomputeFlatLayers(input,{solutionIndex:index});assert.equal(solved.layers.status,'solved',c.name+': '+solved.layers.message);assert.equal(solved.layers.solutionCountExact,'2');assert.deepEqual(solved.geometry,input.geometry);assert.ok(solved.layers.faceOrders!.every(([a,b])=>a<graph.faces_vertices!.length&&b<graph.faces_vertices!.length));
   const regions=modelOverlapRegions(solved);for(const side of ['front','back'] as const){const ordered=modelRegionLayers(solved,regions,side);assert.ok(ordered.length);assert.ok(ordered.every(r=>r.layers.status==='ordered'));assert.equal(modelRegionBoundaries(solved,ordered).ambiguousEdges,0);}}
  const beyond=recomputeFlatLayers(input,{solutionIndex:2});assert.equal(beyond.layers.status,'error');assert.equal(beyond.layers.solutionCountExact,'2');assert.equal(beyond.layers.faceOrders,undefined);assert.deepEqual(input,before);
 }
});

test('actual full insets preserve exact original-face area, normals, every boundary occurrence and same-face zero-angle J ownership',()=>{
 const original=actual().geometry.graph!,before=structuredClone(original),p=buildConcaveLayerPartition(original,epsilon(original)),g=p.graph;
 assert.deepEqual(original,before);assert.deepEqual(g.vertices_coords.slice(0,original.vertices_coords.length),original.vertices_coords);assert.deepEqual(g.edges_vertices.slice(0,original.edges_vertices.length),original.edges_vertices);assert.deepEqual(g.edges_assignment.slice(0,original.edges_assignment.length),original.edges_assignment);assert.deepEqual(g.edges_foldAngle.slice(0,original.edges_foldAngle.length),original.edges_foldAngle);
 for(const [f,face]of original.faces_vertices!.entries()){const area=exactArea(original.vertices_coords,face),children=g.faces_vertices.filter((_,t)=>p.parent[t]===f);assert.equal(children.reduce((sum,t)=>sum+abs(exactArea(g.vertices_coords,t)),0n),abs(area));assert.ok(children.every(t=>exactArea(g.vertices_coords,t)*area>0n));}
 for(const [e,owners]of g.edges_faces.entries()){if(e<original.edges_vertices.length){assert.deepEqual(owners.map(t=>p.parent[t]).sort((a,b)=>a-b),p.sourceEdgeFaces[e].slice().sort((a,b)=>a-b));assert.equal(owners.length,original.edges_assignment[e]==='B'?1:2);}else{assert.equal(g.edges_assignment[e],'J');assert.equal(g.edges_foldAngle[e],0);assert.equal(owners.length,2);assert.equal(p.parent[owners[0]],p.parent[owners[1]]);}}
 for(const [t,list]of g.faces_edges.entries())list.forEach((e,k)=>assert.equal(g.faces_faces![t][k],g.edges_faces[e].find(other=>other!==t)));
 for(const tolerance of [undefined,epsilon(original)])assert.ok(ear.graph.makeFacesPolygon(g,tolerance).every(face=>face.length===3));
 const overlaps=ear.graph.getFacesFacesOverlap(g,epsilon(original));assert.ok(overlaps.every((list,t)=>list.every(other=>p.parent[t]!==p.parent[other])));
});

test('general affine copies, source edge reversal and negative face winding retain private partitions and original-face solutions',()=>{
 const source=actual().geometry.graph!;
 for(const mirror of [false,true])for(const shift of [0,2]){const graph=structuredClone(source);graph.vertices_coords=graph.vertices_coords.map(([x,y])=>[(mirror?-1:1)*(1.13*x+.03*y)+17,.02*x+1.07*y-23]);graph.edges_vertices=graph.edges_vertices.map(([a,b])=>[b,a]);
  graph.faces_vertices=graph.faces_vertices!.map(face=>{const n=shift%face.length;return [...face.slice(n),...face.slice(0,n)];});
  // Rebuild source occurrence slots from the unchanged explicit edge owners.
  graph.faces_edges=graph.faces_vertices.map(face=>face.map((a,k)=>{const b=face[(k+1)%face.length];return graph.edges_vertices.findIndex(([v,w])=>a===v&&b===w||a===w&&b===v);}));graph.edges_faces=graph.edges_vertices.map(()=>[]);graph.faces_edges.forEach((list,f)=>list.forEach(e=>graph.edges_faces![e].push(f)));graph.faces_faces=graph.faces_edges.map((list,f)=>list.map(e=>graph.edges_faces![e].find(other=>other!==f) as number));
  const before=structuredClone(graph),p=buildConcaveLayerPartition(graph,epsilon(graph));assert.ok(p.privateVertices.length>0);assert.deepEqual(graph,before);
  const answer=solveConcaveLayerOrders(graph,epsilon(graph));assert.equal(answer.status,'complete','message'in answer?answer.message:'');if(answer.status==='complete'){assert.equal(answer.count,2n);assert.ok(answer.orders!.every(([a,b])=>a<13&&b<13));}
  p.graph.faces_vertices.forEach((child,t)=>assert.ok(polygonArea(child.map(v=>p.graph.vertices_coords[v]))*polygonArea(graph.faces_vertices![p.parent[t]].map(v=>graph.vertices_coords[v]))>0));
 }
});

function grid():FoldGraph {const vertices_coords:Point[]=Array.from({length:16},(_,i)=>[i%4,Math.floor(i/4)]),faces_vertices:number[][]=[],edges_vertices:[number,number][]=[],counts:number[]=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++){const a=4*y+x,face=[a,a+1,a+5,a+4];faces_vertices.push(face);face.forEach((v,k)=>{const w=face[(k+1)%4];let e=edges_vertices.findIndex(([a,b])=>a===v&&b===w||a===w&&b===v);if(e<0){e=edges_vertices.length;edges_vertices.push([v,w]);counts.push(0);}counts[e]++;});}return {vertices_coords,faces_vertices,edges_vertices,edges_assignment:counts.map(n=>n===1?'B':'F'),edges_foldAngle:counts.map(()=>0)};}
function slit(){const g=grid(),e=g.edges_vertices.findIndex(([a,b])=>a===5&&b===6||a===6&&b===5);g.edges_assignment[e]='B';return {source:e,...splitWovenCutGraph(g,g.vertices_coords)};}

test('interior parallel slit banks preserve independent one-owner edges and exact neighbor slots in private triangulation',()=>{
 const s=slit(),g=s.splitGraph,banks=s.edgeSource.flatMap((original,e)=>original===s.source?[e]:[]),p=buildConcaveLayerPartition(g,1e-6);
 assert.equal(banks.length,2);assert.deepEqual(g.edges_vertices[banks[0]],g.edges_vertices[banks[1]]);
 for(const e of banks){assert.equal(p.graph.edges_assignment[e],'B');assert.equal(p.graph.edges_faces[e].length,1);const t=p.graph.edges_faces[e][0];assert.equal(p.parent[t],g.edges_faces![e][0]);assert.equal(p.graph.faces_faces![t][p.graph.faces_edges[t].indexOf(e)],undefined);}
 assert.notEqual(p.parent[p.graph.edges_faces[banks[0]][0]],p.parent[p.graph.edges_faces[banks[1]][0]]);
 const result=solveConcaveLayerOrders(g,1e-6);assert.equal(result.status,'complete');if(result.status==='complete')assert.equal(result.count,1n);
});

test('coincident source faces with parallel boundaries never merge their independent internal J diagonals',()=>{
 const g:FoldGraph={vertices_coords:[[0,0],[4,0],[4,4],[0,4]],faces_vertices:[[0,1,2,3],[0,1,2,3]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[1,0],[2,1],[3,2],[0,3]],edges_assignment:Array(8).fill('B'),edges_foldAngle:Array(8).fill(0),faces_edges:[[0,1,2,3],[4,5,6,7]],edges_faces:[[0],[0],[0],[0],[1],[1],[1],[1]],faces_faces:[Array(4).fill(undefined),Array(4).fill(undefined)]};
 const p=buildConcaveLayerPartition(g,1e-6),helpers=p.graph.edges_vertices.slice(8);assert.equal(helpers.length,2);assert.deepEqual(helpers[0],helpers[1]);assert.notDeepEqual(p.graph.edges_faces[8].map(t=>p.parent[t]),p.graph.edges_faces[9].map(t=>p.parent[t]));
 const answer=solveConcaveLayerOrders(g,1e-6);assert.equal(answer.status,'complete');if(answer.status==='complete')assert.equal(answer.count,2n);
});

test('forged source incidence, stale neighbors, unseparated cuts and nonzero F angles stay unsupported',()=>{
 const base=slit(),banks=base.edgeSource.flatMap((source,e)=>source===base.source?[e]:[]);
 for(const mutate of [(g:FoldGraph)=>{delete g.faces_edges;},(g:FoldGraph)=>{const f=g.edges_faces![banks[0]][0],slot=g.faces_edges![f].indexOf(banks[0]);g.faces_edges![f][slot]=banks[1];},(g:FoldGraph)=>{g.edges_faces![banks[0]].push(g.edges_faces![banks[1]][0]);},(g:FoldGraph)=>{const f=g.edges_faces![banks[0]][0];g.faces_faces![f][g.faces_edges![f].indexOf(banks[0])]=g.edges_faces![banks[1]][0];},(g:FoldGraph)=>{g.edges_foldAngle[g.edges_assignment.indexOf('F')]=45;}]){const g=structuredClone(base.splitGraph);mutate(g);assert.throws(()=>buildConcaveLayerPartition(g,1e-6));assert.equal(solveConcaveLayerOrders(g,1e-6).status,'unsupported');}
 const raw=grid();raw.edges_assignment[raw.edges_assignment.indexOf('F')]='B';assert.equal(solveConcaveLayerOrders(raw,1e-6).status,'unsupported');
});

test('private partitions retain all triangles above former capacity limits; truly thin source triangles remain unsupported',()=>{
 const g=actual().geometry.graph!,p=buildConcaveLayerPartition(g,epsilon(g)),f=p.privateVertices[0].parent,points=g.faces_vertices![f].map(v=>g.vertices_coords[v]);
 const crowded=sheet(points,20),before=structuredClone(crowded);assert.equal(crowded.faces_vertices!.reduce((n,f)=>n+f.length-2,0),80);const partition=buildConcaveLayerPartition(crowded,epsilon(g));assert.equal(partition.privateVertices.length,20);assert.equal(partition.graph.faces_vertices.length,120);assert.deepEqual(crowded,before);
 const thin=sheet([[0,0],[100,0],[100,1e-9]]),rejected=solveConcaveLayerOrders(thin,1e-6);assert.equal(rejected.status,'unsupported');if(rejected.status!=='complete')assert.match(rejected.message,/过薄|退化|坐标容差/);
});
