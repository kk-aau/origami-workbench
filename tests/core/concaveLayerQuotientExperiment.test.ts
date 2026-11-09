/** Compare the research proof and bounded production adapter to convex controls. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {blankDoc,exampleDoc} from '../../src/app/state';
import {buildFold,polygonArea} from '../../src/core/geometry';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {selectLayerSolution,type LayerNode} from '../../src/core/layerSolutions';
import type {Point,Doc} from '../../src/core/types';
import {makeQuotientExperiment,solveQuotientExperiment,verifyQuotientLift,orderSignature,quotientFaceOrders,type ExperimentGraph} from '../../scripts/experiments/concaveLayerQuotient';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {solveConcaveLayerOrders} from '../../src/core/concaveLayers';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import type {FlatFoldResult,FoldGraph} from '../../src/core/types';

function graph(vertices_coords:Point[],faces_vertices:number[][]):ExperimentGraph{
 const edges_vertices=faces_vertices.flatMap(f=>f.map((a,i)=>[a,f[(i+1)%f.length]] as [number,number]));
 return {vertices_coords,faces_vertices,edges_vertices,edges_assignment:edges_vertices.map(()=>'B'),edges_foldAngle:edges_vertices.map(()=>0)};
}
function source(doc:Doc){const r=computeFlatGeometry(buildFold(doc).graph,1e-7);assert.equal(r.geometry.status,'ready');return r.geometry.graph as ExperimentGraph;}
function native(graph:ExperimentGraph){
 let tree:LayerNode;
 try{tree=ear.layer(graph,1e-7) as unknown as LayerNode;}catch(e){if(String(e).includes('no solution possible'))return [];throw e;}
 const count=selectLayerSolution(tree,0).count;assert.ok(count<=100_000n,'comparison must enumerate ALL candidates');
 const normals=graph.faces_vertices.map(f=>Math.sign(polygonArea(f.map(v=>graph.vertices_coords[v]))));
 return Array.from({length:Number(count)},(_,i)=>Object.fromEntries(selectLayerSolution(tree,i).orders!.map(([a,b,s])=>[`${a} ${b}`,s*normals[b]>0?1:2])));
}
function compare(source:ExperimentGraph){
 const expected=native(source).map(orderSignature).sort();
 const first=solveConcaveLayerOrders(source as FoldGraph,1e-7);
 assert.equal(first.status,'complete');
 if(first.status==='complete')assert.equal(first.count,BigInt(expected.length));
 const normals=source.faces_vertices.map(f=>Math.sign(polygonArea(f.map(v=>source.vertices_coords[v]))));
 const production=expected.map((_,index)=>{
  const selected=solveConcaveLayerOrders(source as FoldGraph,1e-7,index);
  assert.equal(selected.status,'complete');
  assert.ok(selected.status==='complete'&&selected.orders);
  return orderSignature(Object.fromEntries(selected.orders.map(([a,b,s])=>[`${a} ${b}`,s*normals[b]>0?1:2])));
 });
 assert.deepEqual(production.sort(),expected);
 for(const rotate of [0,1,2]){
  const problem=makeQuotientExperiment(source,1e-7,rotate),actual=solveQuotientExperiment(problem);
  assert.deepEqual(actual.solutions.map(orderSignature).sort(),expected);
  for(const solution of actual.solutions)verifyQuotientLift(problem,solution);
 }
 return expected.length;
}
const uFace=()=>graph([[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[.5,2],[3.5,2],[3.5,2.5],[.5,2.5]],[[0,1,2,3,4,5,6,7],[8,9,10,11]]);

test('disconnected U-face overlaps have exactly two original pair orders, not four free child choices',()=>{
 for(const rotate of [0,1,2,3]){
  const problem=makeQuotientExperiment(uFace(),1e-7,rotate),result=solveQuotientExperiment(problem);
  assert.deepEqual(problem.variables,['0 1']);assert.equal(result.count,2n);
  assert.deepEqual(result.solutions.map(orderSignature).sort(),['0 1:1','0 1:2']);
  for(const solution of result.solutions){const lifted=verifyQuotientLift(problem,solution);assert.ok(Object.keys(lifted).length>1);}
 }
});
test('three sheets sharing the U lobes preserve all six original orders without cyclic local permutations',()=>{
 const g=uFace(),base=g.vertices_coords.length;g.vertices_coords.push([.5,1.9],[3.5,1.9],[3.5,2.6],[.5,2.6]);g.faces_vertices.push([base,base+1,base+2,base+3]);
 const input=graph(g.vertices_coords,g.faces_vertices);let expected:string[]|undefined;
 for(const rotate of [0,1,2]){
  const problem=makeQuotientExperiment(input,1e-7,rotate),result=solveQuotientExperiment(problem);
  assert.equal(result.count,6n);assert.equal(problem.variables.length,3);
  const signatures=result.solutions.map(orderSignature).sort();if(expected)assert.deepEqual(signatures,expected);else expected=signatures;
  result.solutions.forEach(s=>verifyQuotientLift(problem,s));
 }
});
test('convex accordion assignments retain exact native solution sets and counts for 62 CPs',()=>{
 let cases=0;
 for(let panels=2;panels<=6;panels++)for(let mask=0;mask<2**(panels-1);mask++){
  const doc=blankDoc(`accordion ${panels}/${mask}`,panels*10,30);
  for(let i=1;i<panels;i++)doc.segments.push({id:`line${i}`,a:[i*10,0],b:[i*10,30],assignment:(mask>>(i-1))&1?'M':'V',angle:null});
  compare(source(doc));cases++;
 }
 assert.equal(cases,62);
});
test('blank, sample, intersecting creases and reflected convex geometry match native solutions including no-solution',()=>{
 compare(source(blankDoc()));compare(source(exampleDoc()));let unsolved=0;
 for(let mask=0;mask<16;mask++){
  const doc=blankDoc('cross',20,20),ends:Point[]=[[10,0],[20,10],[10,20],[0,10]];
  ends.forEach((end,i)=>doc.segments.push({id:`cross${i}`,a:[10,10],b:end,assignment:(mask>>i)&1?'M':'V',angle:null}));
  const folded=source(doc);if(compare(folded)===0)unsolved++;
  compare({...folded,vertices_coords:folded.vertices_coords.map(([x,y])=>[-x,y])});
 }
 assert.ok(unsolved>0,'controls must include actual incompatible M/V constraints');
});
test('budgets never pretend to provide no-solution or an exact truncated candidate count',()=>{
 const problem=makeQuotientExperiment(uFace());
 assert.throws(()=>solveQuotientExperiment(problem,{maxNodes:1}),/budget exhausted; outcome unknown/);
 assert.throws(()=>solveQuotientExperiment(problem,{maxSolutions:1}),/count unknown/);
});
test('original FOLD signs use original face normals for mirrored geometry and both local viewing sides',()=>{
 for(const mirror of [false,true])for(const reverseSecond of [false,true]){
  const input=uFace();if(mirror)input.vertices_coords=input.vertices_coords.map(([x,y])=>[-x,y]);if(reverseSecond)input.faces_vertices[1].reverse();
  const problem=makeQuotientExperiment(input),solutions=solveQuotientExperiment(problem).solutions;
  for(const solution of solutions){
   const faceOrders=quotientFaceOrders(input,solution),normals=input.faces_vertices.map(f=>Math.sign(polygonArea(f.map(v=>input.vertices_coords[v]))));
   const above=solution['0 1']===1?0:1,below=1-above;
   assert.deepEqual(flatLayerEdges(faceOrders,normals),[[below,above]]);
   const result:FlatFoldResult={geometry:{status:'ready',message:'EXPERIMENT',vertices:input.vertices_coords,faces:input.faces_vertices},layers:{status:'solved',message:'EXPERIMENT',faceOrders},warnings:[]},analysis=modelOverlapRegions(result);
   for(const side of ['front','back'] as const)for(const region of modelRegionLayers(result,analysis,side)){
    assert.equal(region.layers.status,'ordered');if(region.layers.status==='ordered'&&region.faces.length===2)assert.deepEqual(region.layers.topToBottom,side==='front'?[above,below]:[below,above]);
   }
  }
 }
});
test('existing concave cut-piece placements keep original-face layers without using single-sheet CP reflection',()=>{
 const g=uFace();
 const result=recomputeFlatLayers({geometry:{status:'ready',message:'',vertices:g.vertices_coords,faces:g.faces_vertices,graph:g as any},layers:{status:'unknown',message:''},warnings:[]});
 assert.equal(result.layers.status,'solved');assert.equal(result.layers.solutionCountExact,'2');assert.equal(result.layers.faceOrders!.length,1);
 assert.equal(computeFlatGeometry(g as FoldGraph,1e-7).geometry.status,'unsupported','CP reflection still cannot invent relative placement of disconnected sheets');
 const invalid=structuredClone(g);invalid.faces_vertices.push([...invalid.faces_vertices[0]]);
 const rejected=recomputeFlatLayers({geometry:{status:'ready',message:'',vertices:invalid.vertices_coords,faces:invalid.faces_vertices,graph:invalid as any},layers:{status:'unknown',message:''},warnings:[]});
 assert.notEqual(rejected.layers.status,'solved','shared B edges are not a split cut topology');
});
