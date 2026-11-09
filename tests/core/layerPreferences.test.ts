import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {selectPreferredLayerSolution,validateLayerPreferences} from '../../src/core/layerPreferences';
import {createLayerSolutionSelector,type LayerNode} from '../../src/core/layerSolutions';
import {countOriginalLayerAssignments,solveConcaveLayerOrders} from '../../src/core/concaveLayers';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {polygonArea} from '../../src/core/geometry';
import type {FlatFoldResult,FoldGraph,Point,FlatWorkerRequest} from '../../src/core/types';
import {startFlatLayerReanalysis,startFlatFold} from '../../src/core/workerClient';

const vertices:Point[]=[[0,0],[10,0],[10,10],[0,10]],face=[0,1,2,3];
function fixture(){const doc=blankDoc('五联多解',100,100);for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.layers.status,'solved');return {doc,result};}
function preferences(result:FlatFoldResult){const normals=result.geometry.faces.map(row=>Math.sign(polygonArea(row.map(v=>result.geometry.vertices[v]))));return flatLayerEdges(result.layers.faceOrders!,normals).map(([below,above])=>({below,above}));}

test('AND/OR pruning finds a canonical candidate beyond the first hundred thousand without enumerating combinations',()=>{
  const tree:LayerNode={orders:[],branches:Array.from({length:30},(_,i)=>[{orders:[[2*i,2*i+1,-1]]},{orders:[[2*i,2*i+1,1]]}])},faces=Array.from({length:60},()=>face);
  const answer=selectPreferredLayerSolution(tree,vertices,faces,[{below:1,above:0}],1000);
  assert.equal(answer.status,'matched',answer.message);assert.equal(answer.count,2n**30n);assert.equal(answer.solutionIndex,2**29);
  assert.deepEqual(answer.orders,createLayerSolutionSelector(tree).select(2**29));
});

test('all real strip candidates can be recovered from material relationships and remain canonical solver certificates',()=>{
  const {result}=fixture(),tree=ear.layer(result.geometry.graph!) as unknown as LayerNode;
  for(let solutionIndex=0;solutionIndex<4;solutionIndex++){
    const chosen=recomputeFlatLayers(result,{solutionIndex}),input=structuredClone(result),wanted=preferences(chosen),selected=recomputeFlatLayers(result,{layerPreferences:wanted});
    assert.equal(selected.layers.status,'solved',selected.layers.message);assert.equal(selected.layers.solutionIndex,solutionIndex);assert.deepEqual(selected.layers.faceOrders,chosen.layers.faceOrders);
    assert.deepEqual(selectPreferredLayerSolution(tree,result.geometry.vertices,result.geometry.faces,wanted).orders,chosen.layers.faceOrders);assert.deepEqual(result,input);
  }
});

test('conflicts, invalid input and bounded search preserve a fresh valid candidate and explicitly explain omitted inheritance',()=>{
  const {result}=fixture(),selected=recomputeFlatLayers(result,{layerPreferences:[{below:0,above:1},{below:1,above:0}]});
  assert.equal(selected.layers.status,'solved');assert.deepEqual(selected.layers.faceOrders,result.layers.faceOrders);assert.ok(selected.warnings.some(message=>message.includes('[纸层继承]')));
  const tree:LayerNode={orders:[],branches:[[{orders:[[0,1,-1]]},{orders:[[0,1,1]]}]]};
  assert.equal(selectPreferredLayerSolution(tree,vertices,[face,face],[{below:1,above:0}],1).status,'unsupported');
  assert.equal(selectPreferredLayerSolution(tree,vertices,[face,face],[{below:-1,above:0}]).status,'error');
  assert.equal(selectPreferredLayerSolution({orders:[]},vertices,[face,face],[{below:1,above:0}]).status,'unsupported','missing relationships are never invented');
});

test('default inheritance continues past 500000 node visits and retains exact canonical numbering',()=>{
  const opposite:LayerNode['orders']=[[0,1,-1]],choices:LayerNode[]=Array.from({length:250001},()=>({orders:opposite}));
  choices.push({orders:[[0,1,1]]});
  const tree:LayerNode={orders:[],branches:[choices]},answer=selectPreferredLayerSolution(tree,vertices,[face,face],[{below:1,above:0}]);
  assert.equal(answer.status,'matched',answer.message);assert.equal(answer.solutionIndex,250001);assert.equal(answer.count,250002n);assert.deepEqual(answer.orders,[[0,1,1]]);
  for(const budget of [0,-1,NaN,-Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(selectPreferredLayerSolution(tree,vertices,[face,face],[{below:1,above:0}],budget).status,'error');
});

test('large valid preference lists are accepted while malformed face relations still fail',()=>{
  const preferences=Array.from({length:100001},()=>({below:1,above:0}));
  assert.doesNotThrow(()=>validateLayerPreferences(preferences,2));
  for(const relation of [{below:-1,above:0},{below:0,above:2},{below:1,above:1},{below:.5,above:0}])assert.throws(()=>validateLayerPreferences([relation],2),/有效上下关系/);
});

test('concave CNF terminal free variables retain the unfiltered canonical rank when matching huge preference spaces',()=>{
  const answer=countOriginalLayerAssignments(40,[],0n,100,192,2048,new Map([[1,-1],[40,-1]]));
  assert.equal(answer.status,'complete');if(answer.status!=='complete')return;
  assert.equal(answer.count,2n**40n);assert.equal(answer.nodes,1);assert.equal(answer.selectedRank,2n**39n+1n);assert.equal(answer.selected![1],-1);assert.equal(answer.selected![40],-1);
  const canonical=countOriginalLayerAssignments(40,[],answer.selectedRank);assert.equal(canonical.status,'complete');if(canonical.status==='complete')assert.deepEqual(answer.selected,canonical.selected);
});

test('concave original-face preferences choose genuine revalidated CNF candidates',()=>{
  const points:Point[]=[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[.5,2],[3.5,2],[3.5,2.5],[.5,2.5]],faces=[[0,1,2,3,4,5,6,7],[8,9,10,11]],edges=faces.flatMap(row=>row.map((v,i)=>[v,row[(i+1)%row.length]] as [number,number]));
  const graph:FoldGraph={vertices_coords:points,faces_vertices:faces,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0)};
  for(const relation of [{below:0,above:1},{below:1,above:0}]){
    const selected=solveConcaveLayerOrders(graph,1e-6,0,[relation]);assert.equal(selected.status,'complete');if(selected.status!=='complete')continue;
    assert.ok(selected.orders);assert.notEqual(selected.solutionIndex,undefined);const canonical=solveConcaveLayerOrders(graph,1e-6,selected.solutionIndex);assert.equal(canonical.status,'complete');if(canonical.status==='complete')assert.deepEqual(selected.orders,canonical.orders);
    const base:FlatFoldResult={geometry:{status:'ready',message:'',vertices:points,faces,graph},layers:{status:'unknown',message:''},warnings:[]},result=recomputeFlatLayers(base,{layerPreferences:[relation]});
    assert.equal(result.layers.status,'solved',result.layers.message);assert.deepEqual(result.layers.faceOrders,selected.orders);assert.equal(result.layers.solutionIndex,selected.solutionIndex);
  }
});

test('workers carry inherited relationships on fresh geometry and reanalysis and remain cancellable',async()=>{
  class MockWorker {static latest:MockWorker;request?:FlatWorkerRequest;terminated=false;constructor(){MockWorker.latest=this;}postMessage(request:FlatWorkerRequest){this.request=request;}terminate(){this.terminated=true;}}
  const previous=globalThis.Worker;globalThis.Worker=MockWorker as unknown as typeof Worker;
  try{const {doc,result}=fixture(),layerPreferences=[{below:0,above:1}];for(const start of [()=>startFlatFold(doc,{layerPreferences}),()=>startFlatLayerReanalysis(result,{layerPreferences})]){const task=start(),worker=MockWorker.latest;assert.deepEqual(worker.request!.options!.layerPreferences,layerPreferences);task.cancel();assert.equal((await task.promise).layers.status,'cancelled');assert.equal(worker.terminated,true);}}
  finally{globalThis.Worker=previous;}
});
