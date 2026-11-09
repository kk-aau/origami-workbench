import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayerSolutionSelector,selectLayerSolution,selectMatchingLayerSolution,type LayerNode} from '../../src/core/layerSolutions';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {blankDoc,exampleDoc} from '../../src/app/state';
import {compileAll} from '../../node_modules/rabbit-ear/module/layer/prototype.js';
import ear from 'rabbit-ear';

const leaf=(n:number):LayerNode=>({orders:[[n,n+1,1]]});
test('indexed traversal matches engine compileAll order for nested independent groups',()=>{
  const tree:LayerNode={orders:[[99,100,1]],branches:[[leaf(0),{orders:[[1,2,-1]],branches:[[leaf(3),leaf(4)]]}],[leaf(10),leaf(20)]]};
  const expected=compileAll(tree);assert.equal(expected.length,6);
  expected.forEach((orders:unknown,index:number)=>{const selected=selectLayerSolution(tree,index);assert.deepEqual(selected.orders,orders);assert.equal(selected.count,6n);});
  assert.equal(selectLayerSolution(tree,6).orders,null);
});
test('empty required choices mean no solutions, leaves and empty AND lists mean one',()=>{
  assert.deepEqual(selectLayerSolution({orders:[],branches:[[]]}),{orders:null,count:0n});
  assert.deepEqual(selectLayerSolution({orders:[],branches:[]}),{orders:[],count:1n});
  const tree:LayerNode={orders:[],branches:[[{orders:[],branches:[[]]},leaf(7)]]};
  assert.deepEqual(selectLayerSolution(tree),{orders:[[7,8,1]],count:1n});
});
test('large combination counts stay exact without allocating all combinations',()=>{
  const tree:LayerNode={orders:[],branches:Array.from({length:60},(_,i)=>[leaf(i*2),leaf(i*2+1)])};
  const result=selectLayerSolution(tree,Number.MAX_SAFE_INTEGER);
  assert.equal(result.count,2n**60n);assert.equal(result.orders!.length,60);
  assert.equal(result.orders![59][0],119);
});
test('invalid candidate indices are rejected and selected orders do not alias input',()=>{
  const tree=leaf(0);for(const index of [-1,0.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>selectLayerSolution(tree,index),/编号/);
  const selected=selectLayerSolution(tree);selected.orders![0][0]=10;assert.equal(tree.orders[0][0],0);
});

test('bounded filtering distinguishes exact zero/out-of-range results from an unfinished search',()=>{
  const tree:LayerNode={orders:[],branches:[[leaf(0),leaf(2),leaf(4),leaf(6)]]};
  const matches=(orders:[number,number,number][])=>orders[0][0]>=4;
  const complete=selectMatchingLayerSolution(tree,1,matches);
  assert.equal(complete.complete,true);assert.equal(complete.count,2n);assert.deepEqual(complete.orders,[[6,7,1]]);
  const missing=selectMatchingLayerSolution(tree,2,matches);assert.equal(missing.complete,true);assert.equal(missing.count,2n);assert.equal(missing.orders,null);
  const zero=selectMatchingLayerSolution(tree,0,()=>false);assert.equal(zero.complete,true);assert.equal(zero.count,0n);
  const unfinished=selectMatchingLayerSolution(tree,0,matches,{candidateLimit:2});
  assert.equal(unfinished.complete,false);assert.equal(unfinished.count,undefined);assert.equal(unfinished.orders,null);assert.equal(unfinished.checked,2);
  const found=selectMatchingLayerSolution(tree,0,matches,{candidateLimit:3});
  assert.equal(found.complete,false);assert.equal(found.count,undefined);assert.deepEqual(found.orders,[[4,5,1]]);assert.equal(found.matchingCount,1);
  const timedOut=selectMatchingLayerSolution(tree,0,matches,{maxTimeMs:0});assert.equal(timedOut.complete,false);assert.equal(timedOut.count,undefined);assert.equal(timedOut.checked,0);
});

test('default constraint filtering does not stop at the former time or candidate budget',context=>{
 let clock=0;context.mock.method(performance,'now',()=>clock+=6000);
 const empty:LayerNode={orders:[]},tree:LayerNode={orders:[],branches:Array.from({length:20},()=>[empty,empty])};
 const answer=selectMatchingLayerSolution(tree,0,()=>true);
 assert.equal(answer.complete,true);assert.equal(answer.checked,1_048_576);assert.equal(answer.count,1_048_576n);
});

test('internal exact ranks can traverse combinations beyond the safe numeric index range',()=>{
 const tree:LayerNode={orders:[],branches:Array.from({length:60},(_,i)=>[leaf(i*2),leaf(i*2+1)])};
 const selector=createLayerSolutionSelector(tree),last=selector.select((1n<<60n)-1n);
 assert.deepEqual(last,Array.from({length:60},(_,i)=>[i*2+1,i*2+2,1]));
 assert.throws(()=>selector.select(-1n),/编号/);assert.throws(()=>selector.select(Number.MAX_SAFE_INTEGER+1),/编号/);
});
test('real engine tree selection agrees with compileAll for accordion folding',()=>{
  const folded=computeFlatFold(exampleDoc()),tree=ear.layer(folded.geometry.graph!) as unknown as LayerNode;
  const all=compileAll(tree);assert.ok(all.length>0);
  all.forEach((orders:unknown,index:number)=>assert.deepEqual(selectLayerSolution(tree,index).orders,orders));
  assert.equal(folded.layers.solutionCountExact,String(all.length));assert.equal(folded.layers.solutionIndex,0);
});
test('out-of-range request preserves geometry and is not reported as no solution',()=>{
  const doc=blankDoc('一解'),base=computeFlatFold(doc),result=computeFlatFold(doc,undefined,{solutionIndex:1});
  assert.equal(result.layers.status,'error');assert.match(result.layers.message,/编号超出/);assert.equal(result.layers.solutionCount,1);
  assert.deepEqual(result.geometry.vertices,base.geometry.vertices);
  const reanalysed=recomputeFlatLayers(base,{solutionIndex:1});assert.equal(reanalysed.layers.status,'error');assert.equal(base.layers.status,'solved');
});

test('five-panel all-valley strip has four distinct real layer candidates at identical geometry',()=>{
  const doc=blankDoc('五联谷折',100,100);
  for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});
  const first=computeFlatFold(doc),tree=ear.layer(first.geometry.graph!) as unknown as LayerNode,all=compileAll(tree);
  assert.equal(all.length,4);
  const results=all.map((orders:unknown,index:number)=>{
    const result=computeFlatFold(doc,undefined,{solutionIndex:index});
    assert.equal(result.layers.status,'solved');assert.equal(result.layers.solutionIndex,index);
    assert.equal(result.layers.solutionCountExact,'4');assert.deepEqual(result.layers.faceOrders,orders);
    assert.deepEqual(result.geometry.vertices,first.geometry.vertices);
    const reanalysed=recomputeFlatLayers(first,{solutionIndex:index});
    assert.deepEqual(reanalysed.layers.faceOrders,orders);return JSON.stringify(result.layers.faceOrders);
  });
  assert.equal(new Set(results).size,4);assert.equal(first.layers.solutionIndex,0);
});
test('visible white/colour constraints filter layer candidates and survive reanalysis',()=>{
  const doc=blankDoc('正反色约束',100,100);
  for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});
  const base=computeFlatFold(doc);assert.equal(base.layers.status,'solved');
  const top=base.layers.faceOrder!.at(-1)!;
  const area=base.geometry.faces[top].reduce((sum,v,i)=>{const a=base.geometry.vertices[v],b=base.geometry.vertices[base.geometry.faces[top][(i+1)%base.geometry.faces[top].length]];return sum+a[0]*b[1]-a[1]*b[0]},0)/2;
  const side=area>=0?'white':'color' as const;
  const constrained=computeFlatFold(doc,undefined,{constraints:[{face:top,side}]});
  assert.equal(constrained.layers.status,'solved');assert.deepEqual(constrained.layers.constraints,[{face:top,side}]);
  assert.equal(recomputeFlatLayers(base,{constraints:[{face:top,side}]}).layers.status,'solved');
  assert.equal(computeFlatFold(doc,undefined,{constraints:[{face:999,side:'white'}]}).layers.status,'no-solution');
});
