import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {blankDoc,exampleDoc} from '../../src/app/state';
import {buildFold,epsilonFor} from '../../src/core/geometry';
import {computeFlatGeometry,computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {convexLayerGeometry} from '../../src/core/convexLayerGeometry';
import {convexEdgesFacesOverlap,convexFacesOverlap,convexLayerContacts} from '../../src/core/convexLayerContacts';
import {solveConvexLayerCandidate} from '../../src/core/convexLayerCandidate';
import {createLayerSolutionSelector,type FaceOrder,type LayerNode} from '../../src/core/layerSolutions';
import type {FoldGraph,Point} from '../../src/core/types';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';

const canonical=(rows:FaceOrder[])=>rows.map(r=>r.join(',')).sort().join(';');
const sorted=(rows:number[][])=>rows.map(row=>[...row].sort((a,b)=>a-b));
function isolatedRectangles(rectangles:[number,number,number,number][]):FoldGraph{
  const vertices_coords:Point[]=[],edges_vertices:[number,number][]=[],faces_vertices:number[][]=[],faces_edges:number[][]=[],edges_faces:number[][]=[];
  for(const [x,y,w,h]of rectangles){const start=vertices_coords.length,edge=edges_vertices.length,f=faces_vertices.length;vertices_coords.push([x,y],[x+w,y],[x+w,y+h],[x,y+h]);faces_vertices.push([0,1,2,3].map(k=>start+k));faces_edges.push([0,1,2,3].map(k=>edge+k));for(let k=0;k<4;k++){edges_vertices.push([start+k,start+(k+1)%4]);edges_faces.push([f]);}}
  return {vertices_coords,edges_vertices,faces_vertices,faces_edges,edges_faces,edges_assignment:edges_vertices.map(()=>'B'),edges_foldAngle:edges_vertices.map(()=>0)};
}

test('contact acceleration retains tiny-face all-false half-plane semantics, including distant endpoints',()=>{
  const graph=isolatedRectangles([[0,0,.0001,.0001]]);
  graph.vertices_coords.push([.005,0],[.006,0]);graph.edges_vertices.push([4,5]);graph.edges_assignment.push('B');graph.edges_foldAngle.push(0);graph.edges_faces!.push([]);
  assert.deepEqual(ear.graph.getEdgesFacesOverlap(graph,1e-6),[[0],[0],[0],[0],[0]]);
  assert.deepEqual(convexEdgesFacesOverlap(graph,1e-6),ear.graph.getEdgesFacesOverlap(graph,1e-6));
  // A large surrounding coordinate span prevents private normalization from
  // erasing the relative scale difference between tiny and ordinary faces.
  const mixed=isolatedRectangles([[0,0,.0001,.0001],[10,10,2,2],[.005,0,.001,.001]]),privateGeometry=convexLayerGeometry(mixed,1e-6);
  assert.deepEqual(convexEdgesFacesOverlap(privateGeometry.graph,privateGeometry.epsilon),ear.graph.getEdgesFacesOverlap(privateGeometry.graph,privateGeometry.epsilon));
});

test('contact acceleration retains transitive coordinate clusters and mixed-scale overlap predicates',()=>{
  const graph=isolatedRectangles([[0,0,1,1],[1+3e-6,0,.1,.1],[.2,.2,.3,.4],[.25,.25,.00001,.00001]]);
  graph.vertices_coords.push([1+.75e-6,0],[1+1.5e-6,0],[1+2.25e-6,0]);
  assert.deepEqual(convexEdgesFacesOverlap(graph,1e-6),ear.graph.getEdgesFacesOverlap(graph,1e-6));
  assert.deepEqual(sorted(convexFacesOverlap(graph,1e-6)),sorted(ear.graph.getFacesFacesOverlap(graph,1e-6)));
});

test('accelerated contacts and a certified candidate agree with exact full enumeration on real folded patterns',()=>{
  const docs=[exampleDoc(),exampleDoc('waterbomb')];
  for(let n=2;n<=8;n++){
    const doc=blankDoc('平行褶',100,100);for(let i=1;i<n;i++)doc.segments.push({id:String(i),a:[i*100/n,0],b:[i*100/n,100],assignment:i%3===0?'M':'V',angle:i%3===0?-180:180});docs.push(doc);
  }
  for(const doc of docs){
    const {graph}=buildFold(doc),eps=epsilonFor(doc),geometry=computeFlatGeometry(graph,eps);assert.equal(geometry.geometry.status,'ready');
    const privateGeometry=convexLayerGeometry(geometry.geometry.graph!,eps),before=structuredClone(privateGeometry.graph),contacts=convexLayerContacts(privateGeometry.graph,privateGeometry.epsilon),upstream=ear.layer.makeTacosAndTortillas(privateGeometry.graph,privateGeometry.epsilon);
    assert.deepEqual({...contacts,transitivity:undefined},{...upstream,transitivity:undefined});
    const answer=solveConvexLayerCandidate(privateGeometry.graph,privateGeometry.epsilon);assert.ok(answer);
    const selector=createLayerSolutionSelector(ear.layer(privateGeometry.graph,privateGeometry.epsilon) as unknown as LayerNode);
    assert.ok(Array.from({length:Number(selector.count)},(_,i)=>canonical(selector.select(i)!)).includes(canonical(answer.orders)));
    assert.deepEqual(privateGeometry.graph,before,'the certificate must not modify the input graph');
  }
});

test('contact contradictions return no candidate and never certify an arbitrary face order',()=>{
  const doc=exampleDoc('waterbomb');doc.segments.forEach(s=>{if(s.assignment!=='B'){s.assignment='M';s.angle=-180;}});
  const graph=buildFold(doc).graph,geometry=computeFlatGeometry(graph,epsilonFor(doc));assert.equal(geometry.geometry.status,'ready');
  const privateGeometry=convexLayerGeometry(geometry.geometry.graph!,epsilonFor(doc));
  assert.throws(()=>ear.layer(privateGeometry.graph,privateGeometry.epsilon),/no solution possible/);
  assert.equal(solveConvexLayerCandidate(privateGeometry.graph,privateGeometry.epsilon),null);
});

test('a candidate privately rebuilds omitted adjacency while retaining the supplied faces',()=>{
  const doc=exampleDoc(),eps=epsilonFor(doc),geometry=computeFlatGeometry(buildFold(doc).graph,eps);
  const complete=convexLayerGeometry(geometry.geometry.graph!,eps),expected=solveConvexLayerCandidate(complete.graph,complete.epsilon);
  assert.ok(expected);
  const fields=['faces_edges','edges_faces','faces_faces'] as const;
  for(let omitted=1;omitted<8;omitted++){
    const graph=structuredClone(complete.graph);
    fields.forEach((field,i)=>{if(omitted&(1<<i))delete graph[field];});
    const before=structuredClone(graph),candidate=solveConvexLayerCandidate(graph,complete.epsilon);
    assert.ok(candidate);assert.equal(canonical(candidate.orders),canonical(expected.orders));
    assert.deepEqual(graph,before,'optional adjacency is rebuilt only on the private solver copy');
  }
});

test('an unnumbered certified candidate adjusts from its actual paper order and exports as confirmed',()=>{
  const doc=blankDoc('未编号候选',100,100);for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});
  const source=computeFlatFold(doc,undefined,{solutionIndex:3}),unnumbered=structuredClone(source);delete unnumbered.layers.solutionIndex;delete unnumbered.layers.solutionCount;delete unnumbered.layers.solutionCountExact;
  for(let face=0;face<5;face++)for(const direction of ['up','down','top','bottom'] as const){
    const request={face,direction,side:'front' as const},expected=recomputeFlatLayers(source,{solutionIndex:3,layerAdjustment:request}),answer=recomputeFlatLayers(unnumbered,{layerAdjustment:request});
    assert.equal(answer.layers.status,'solved');assert.deepEqual(answer.layers.faceOrders,expected.layers.faceOrders);
  }
  const text=foldedModelSVG(unnumbered,{name:'已确认',side:'front'});assert.match(text,/已确认候选 · 尚未编号/);assert.ok(!text.includes('未确认候选'));
});

test('large default analysis leaves a verified candidate unnumbered while an explicit zero keeps exact numbering',()=>{
  const doc=blankDoc('256个平面小格',16,16);
  for(let i=1;i<16;i++)doc.segments.push({id:`x${i}`,a:[i,0],b:[i,16],assignment:'F',angle:0},{id:`y${i}`,a:[0,i],b:[16,i],assignment:'F',angle:0});
  const candidate=computeFlatFold(doc),exact=computeFlatFold(doc,undefined,{solutionIndex:0});
  assert.equal(candidate.geometry.faces.length,256);assert.equal(candidate.layers.status,'solved');assert.equal(candidate.layers.solutionIndex,undefined);assert.equal(candidate.layers.solutionCountExact,undefined);
  assert.equal(exact.layers.status,'solved');assert.equal(exact.layers.solutionIndex,0);assert.equal(exact.layers.solutionCountExact,'1');
  assert.deepEqual(candidate.geometry.vertices,exact.geometry.vertices);assert.equal(candidate.layers.faceOrder?.length,256);
  const raw=buildFold(doc).graph;delete raw.faces_edges;delete raw.edges_faces;delete raw.faces_faces;
  const geometry=computeFlatGeometry(raw,epsilonFor(doc)),reanalyzed=recomputeFlatLayers(geometry);
  assert.equal(reanalyzed.layers.status,'solved',reanalyzed.layers.message);
  assert.equal(reanalyzed.layers.solutionIndex,undefined);assert.equal(reanalyzed.layers.faceOrder?.length,256);
  assert.deepEqual(reanalyzed.geometry.faces,geometry.geometry.faces);
});
