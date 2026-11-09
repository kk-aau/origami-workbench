import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {constrainLayerSolutionTree,relativeLayerConstraintsMatch} from '../../src/core/relativeLayerConstraints';
import {createLayerSolutionSelector,type LayerNode} from '../../src/core/layerSolutions';
import {polygonArea} from '../../src/core/geometry';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {exportModelSnapshot,importModelSnapshot} from '../../src/core/modelSnapshot';
import {startFlatFold,startFlatLayerReanalysis} from '../../src/core/workerClient';
import type {FlatFoldResult,FlatLayerPreference,FlatWorkerRequest,FoldGraph,Point} from '../../src/core/types';

const square:Point[]=[[0,0],[10,0],[10,10],[0,10]],face=[0,1,2,3];
function fixture(marks=false){const doc=blankDoc('相对层序',100,100);for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});if(marks)doc.segments.push({id:'mark',a:[5,25],b:[15,25],assignment:'F',angle:0});const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.layers.status,'solved',result.layers.message);return {doc,result};}
function relations(result:FlatFoldResult):FlatLayerPreference[]{return flatLayerEdges(result.layers.faceOrders!,result.geometry.faces.map(f=>Math.sign(polygonArea(f.map(v=>result.geometry.vertices[v]))))).map(([below,above])=>({below,above}));}
function matches(result:FlatFoldResult,wanted:FlatLayerPreference[]){return relativeLayerConstraintsMatch(result.geometry.vertices,result.geometry.faces,result.layers.faceOrders??[],wanted);}

test('hard pruning counts huge independent spaces exactly without Cartesian enumeration',()=>{
  const tree:LayerNode={orders:[],branches:Array.from({length:60},(_,i)=>[{orders:[[2*i,2*i+1,-1]]},{orders:[[2*i,2*i+1,1]]}])};
  const before=structuredClone(tree),restricted=constrainLayerSolutionTree(tree,square,Array.from({length:120},()=>face),[{below:1,above:0},{below:118,above:119}]);
  const selector=createLayerSolutionSelector(restricted);assert.equal(selector.count,2n**58n);assert.deepEqual(tree,before);assert.equal(selector.select(0)![0][2],1);assert.equal(selector.select(selector.count-1n)!.at(-1)![2],-1);
});
test('missing and contradictory relations cannot be inferred from arbitrary order or local cycles',()=>{
  const faces=[face,face,face],tree:LayerNode={orders:[],branches:[[{orders:[[0,1,-1]]},{orders:[]}]]};
  assert.equal(createLayerSolutionSelector(constrainLayerSolutionTree(tree,square,faces,[{below:0,above:1}])).count,1n);
  assert.throws(()=>constrainLayerSolutionTree(tree,square,faces,[{below:0,above:2}]),/没有可认证/);
  assert.equal(createLayerSolutionSelector(constrainLayerSolutionTree(tree,square,faces,[{below:0,above:1},{below:1,above:0}])).count,0n);
  assert.equal(relativeLayerConstraintsMatch(square,faces,[[0,1,-1],[1,2,-1]],[{below:0,above:2}]),false);
});
test('every real convex candidate filters to the same exact orders and counts as exhaustive comparison',()=>{
  for(const marks of [false,true]){
    const {doc,result}=fixture(marks),before=structuredClone(result),all=Array.from({length:result.layers.solutionCount!},(_,solutionIndex)=>recomputeFlatLayers(result,{solutionIndex}));
    assert.ok(all.length>1);
    for(const candidate of all)for(const wanted of relations(candidate).map(row=>[row])){
      const expected=all.filter(r=>matches(r,wanted));
      for(let solutionIndex=0;solutionIndex<expected.length;solutionIndex++){
        const actual=recomputeFlatLayers(result,{relativeConstraints:wanted,solutionIndex});assert.equal(actual.layers.status,'solved',actual.layers.message);assert.equal(actual.layers.solutionCount,expected.length);assert.deepEqual(actual.layers.faceOrders,expected[solutionIndex].layers.faceOrders);assert.deepEqual(actual.layers.relativeConstraints,wanted);
      }
      assert.equal(computeFlatFold(doc,undefined,{flatCreases:'marks',relativeConstraints:wanted}).layers.status,'solved');
    }
    assert.deepEqual(result,before);
  }
});
test('hard relations survive soft preference fallback, candidate movement, and default reanalysis; clearing is explicit',()=>{
  const {result}=fixture(),wanted=[relations(result)[0]],opposite=wanted.map(({below,above})=>({below:above,above:below}));
  const chosen=recomputeFlatLayers(result,{relativeConstraints:wanted,layerPreferences:opposite});assert.equal(chosen.layers.status,'solved');assert.ok(matches(chosen,wanted));
  for(const direction of ['up','down','top','bottom'] as const){const next=recomputeFlatLayers(chosen,{layerAdjustment:{face:0,direction,side:'back'},solutionIndex:0});if(next.layers.status==='solved')assert.ok(matches(next,wanted));assert.deepEqual(next.layers.relativeConstraints,wanted);}
  assert.deepEqual(recomputeFlatLayers(chosen).layers.relativeConstraints,wanted);
  const clear=recomputeFlatLayers(chosen,{relativeConstraints:[]});assert.equal(clear.layers.relativeConstraints,undefined);assert.equal(clear.layers.solutionCount,result.layers.solutionCount);
  const conflict=recomputeFlatLayers(result,{relativeConstraints:[...wanted,...opposite]});assert.equal(conflict.layers.status,'no-solution');assert.equal(conflict.layers.faceOrders,undefined);
});
test('visible-color filters and relative constraints both hold and count only their intersection',()=>{
  const {result}=fixture(),all=Array.from({length:result.layers.solutionCount!},(_,solutionIndex)=>recomputeFlatLayers(result,{solutionIndex})),wanted=[relations(result)[0]];
  for(const candidate of all){const top=candidate.layers.faceOrder!.at(-1)!,side=polygonArea(candidate.geometry.faces[top].map(v=>candidate.geometry.vertices[v]))>0?'white':'color';
    const filtered=recomputeFlatLayers(result,{constraints:[{face:top,side}],relativeConstraints:wanted});
    const expected=all.filter(r=>r.layers.faceOrder!.at(-1)===top&&matches(r,wanted));assert.equal(filtered.layers.solutionCount,expected.length);assert.equal(filtered.layers.status,expected.length?'solved':'no-solution');
  }
});
test('concave and hole faces enforce original-face unit clauses with filtered counts, including unsatisfiable requests',()=>{
  for(const hole of [false,true]){
    const vertices:Point[]=hole?[[0,0],[4,0],[4,4],[0,4],[1,1],[1,3],[3,3],[3,1],[.5,2],[3.5,2],[3.5,2.5],[.5,2.5]]:[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[.5,2],[3.5,2],[3.5,2.5],[.5,2.5]];
    const faces=hole?[[0,1,2,3],[8,9,10,11]]:[[0,1,2,3,4,5,6,7],[8,9,10,11]],rings=hole?[...faces,[4,5,6,7]]:faces;
    const edges=rings.flatMap(row=>row.map((v,i)=>[v,row[(i+1)%row.length]] as [number,number]));
    const graph:FoldGraph={vertices_coords:vertices,faces_vertices:faces,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0),...(hole?{faces_holes:[[[4,5,6,7]],[]],faces_holeEdges:[[[8,9,10,11]],[]]}:{})};
    const base:FlatFoldResult={geometry:{status:'ready',message:'',vertices,faces,graph},layers:{status:'unknown',message:''},warnings:[]};
    for(const wanted of [[{below:0,above:1}],[{below:1,above:0}]]){const actual=recomputeFlatLayers(base,{relativeConstraints:wanted});assert.equal(actual.layers.status,'solved',actual.layers.message);assert.equal(actual.layers.solutionCount,1);assert.ok(matches(actual,wanted));assert.equal(actual.layers.solutionIndex,0);}
    assert.equal(recomputeFlatLayers(base,{relativeConstraints:[{below:0,above:1},{below:1,above:0}]}).layers.status,'no-solution');
  }
});
test('model snapshots retain required pairs while discarding untrusted certificates and reject malformed pairs',()=>{
  const {doc,result}=fixture(true),wanted=[relations(result)[0]],chosen=recomputeFlatLayers(result,{relativeConstraints:wanted}),saved=exportModelSnapshot(doc,chosen),loaded=importModelSnapshot(saved);
  assert.deepEqual(loaded.result.layers.relativeConstraints,wanted);assert.equal(loaded.result.layers.status,'unknown');assert.ok(matches(recomputeFlatLayers(loaded.result),wanted));
  for(const pair of [{below:1,above:1},{below:-1,above:2},{below:0,above:999},{below:0,above:1,extra:true}]){const data=JSON.parse(saved);data.model.relativeConstraints=[pair];assert.throws(()=>importModelSnapshot(JSON.stringify(data)),/相对层序/);assert.equal(recomputeFlatLayers(result,{relativeConstraints:[pair]}).layers.status,'error');}
  for(const value of [null,'',{},42]){const data=JSON.parse(saved);data.model.relativeConstraints=value;assert.throws(()=>importModelSnapshot(JSON.stringify(data)),/相对层序/);}
});
test('worker defaults retain saved required relations and manual cancellation terminates computation',async()=>{
  class MockWorker {static latest:MockWorker;request?:FlatWorkerRequest;terminated=false;constructor(){MockWorker.latest=this;}postMessage(request:FlatWorkerRequest){this.request=request;}terminate(){this.terminated=true;}}
  const previous=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{const {doc,result}=fixture(),relativeConstraints=[relations(result)[0]],saved=recomputeFlatLayers(result,{relativeConstraints});
    for(const start of [()=>startFlatFold(doc,{relativeConstraints}),()=>startFlatLayerReanalysis(saved)]){const task=start(),worker=MockWorker.latest;assert.deepEqual(worker.request!.options!.relativeConstraints,relativeConstraints);task.cancel();assert.equal((await task.promise).layers.status,'cancelled');assert.equal(worker.terminated,true);}
    const task=startFlatLayerReanalysis(saved,{relativeConstraints:[]});assert.deepEqual(MockWorker.latest.request!.options!.relativeConstraints,[]);task.cancel();await task.promise;
  }finally{globalThis.Worker=previous;}
});
