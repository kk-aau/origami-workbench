import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelOverlapRegions,type ModelOverlapRegions} from '../../src/app/modelOverlapRegions';
import type {FlatFoldResult} from '../../src/core/types';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
function fixture():FlatFoldResult{return {geometry:{status:'ready',message:'',vertices:[[0,0],[10,0],[10,10],[0,10]],faces:[[0,1,2,3],[0,1,2,3],[0,1,2,3]]},layers:{status:'solved',message:'',faceOrders:[[0,1,-1],[1,2,-1]]},warnings:[]};}
const cells=(...sets:number[][]):ModelOverlapRegions=>({cells:sets.map(faces=>({faces,polygon:[[0,0],[1,0],[0,1]],area:.5})),maxDepth:3,omittedThinRegions:0,epsilon:1e-8});
test('local order follows transitive relationships and reverses for back without mutating inputs',()=>{
 const source=fixture(),regions=modelOverlapRegions(source),before=structuredClone({source,regions});
 for(const cell of modelRegionLayers(source,regions,'front'))assert.deepEqual(cell.layers,{status:'ordered',topToBottom:[2,1,0]});
 for(const cell of modelRegionLayers(source,regions,'back'))assert.deepEqual(cell.layers,{status:'ordered',topToBottom:[0,1,2]});assert.deepEqual({source,regions},before);
});
test('global cycle across different coverage sets need not make every local region cyclic',()=>{
 const source=fixture();source.layers.faceOrders!.push([2,0,-1]);
 const local=modelRegionLayers(source,cells([0,1],[1,2],[2,0],[0,1,2]),'front');
 assert.deepEqual(local.slice(0,3).map(c=>c.layers),[{status:'ordered',topToBottom:[1,0]},{status:'ordered',topToBottom:[2,1]},{status:'ordered',topToBottom:[0,2]}]);assert.equal(local[3].layers.status,'conflict');
});

test('repeated coverage reuses only its verified order, with duplicates and cycles handled',()=>{
 const source=fixture();source.layers.faceOrders!.push([0,1,-1]);
 const input=cells([2,0,1],[1,2,0],[0,1],[2,1]);
 const ordered=modelRegionLayers(source,input,'front');
 assert.deepEqual(ordered.slice(0,2).map(r=>r.layers),Array(2).fill({status:'ordered',topToBottom:[2,1,0]}));
 assert.deepEqual(ordered.slice(2).map(r=>r.layers),[{status:'ordered',topToBottom:[1,0]},{status:'ordered',topToBottom:[2,1]}]);
 source.geometry.faces.push([0,1,2,3]);source.layers.faceOrders!.push([2,0,-1]);
 for(const region of modelRegionLayers(source,cells([3,0,1,2],[2,1,3,0]),'front'))assert.equal(region.layers.status,'conflict');
});
test('dense paper uses only relationships among faces covering each region',()=>{
 const source=fixture();
 source.geometry.faces=Array.from({length:120},()=>[0,1,2,3]);
 source.layers.faceOrders=Array.from({length:119},(_,i)=>[i,i+1,-1] as [number,number,number]);
 const regions=cells(...Array.from({length:500},(_,i)=>i%2?[80,81,82]:[10,11,12]));
 const front=modelRegionLayers(source,regions,'front'),back=modelRegionLayers(source,regions,'back');
 for(let i=0;i<regions.cells.length;i++){
  const ids=i%2?[80,81,82]:[10,11,12];
  assert.deepEqual(front[i].layers,{status:'ordered',topToBottom:[...ids].reverse()});
  assert.deepEqual(back[i].layers,{status:'ordered',topToBottom:ids});
 }
});
test('unknown, partial and conflicting relationships never fall back to arbitrary global order',()=>{
 const source=fixture();source.layers.faceOrders=[[0,1,-1]];source.layers.faceOrder=[0,1,2];assert.equal(modelRegionLayers(source,cells([0,1,2]),'front')[0].layers.status,'unconfirmed');
 source.layers.status='timeout';assert.equal(modelRegionLayers(source,cells([0,1]),'front')[0].layers.status,'unconfirmed');assert.deepEqual(modelRegionLayers(source,cells([2]),'back')[0].layers,{status:'ordered',topToBottom:[2]});
 source.layers.status='solved';source.layers.faceOrders=[[0,1,-1],[0,1,1]];assert.equal(modelRegionLayers(source,cells([0,1]),'front')[0].layers.status,'conflict');
});
test('actual solved fold local ordering agrees with existing engine global presentation',()=>{
 const doc=blankDoc('三联',100,100);for(const x of [30,70])doc.segments.push({id:String(x),a:[x,0],b:[x,100],assignment:'V',angle:180});
 const source=computeFlatFold(doc);assert.equal(source.layers.status,'solved');assert.ok(source.layers.faceOrder);
 for(const side of ['front','back'] as const)for(const cell of modelRegionLayers(source,modelOverlapRegions(source),side)){
  const expected=source.layers.faceOrder!.filter(id=>cell.faces.includes(id));if(side==='front')expected.reverse();assert.deepEqual(cell.layers,{status:'ordered',topToBottom:expected});
 }
});
test('invalid indices, self relationships, malformed constraints and directions reject',()=>{
 const source=fixture();assert.throws(()=>modelRegionLayers(source,cells([99]),'front'),/编号/);assert.throws(()=>modelRegionLayers(source,cells([0,0]),'front'),/编号/);assert.throws(()=>modelRegionLayers(source,cells([0]),'bad' as any),/方向/);
 for(const bad of [[0,0,1],[0,5,1],[0,1,0],[0,1,Infinity]]){source.layers.faceOrders=[bad as [number,number,number]];assert.throws(()=>modelRegionLayers(source,cells([0,1]),'front'),/关系/);}
});

test('dense cyclic relation bitsets match independent local Kahn ordering',()=>{
 let state=8675309;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
 for(let trial=0;trial<30;trial++){
  const source=fixture(),count=24;source.geometry.faces=Array.from({length:count},()=>[0,1,2,3]);
  const relations:[number,number,number][]=[];
  for(let a=0;a<count;a++)for(let b=a+1;b<count;b++){if(random()<.2)continue;relations.push([a,b,random()<.5?-1:1]);if(trial%3===0&&random()<.06)relations.push([a,b,-relations[relations.length-1][2]]);}
  relations.push([0,1,-1],[1,2,-1],[2,0,-1]);source.layers.faceOrders=relations;
  assert.ok(relations.length>count*4);
  const covers=Array.from({length:25},()=>Array.from({length:count},(_,i)=>i).filter(()=>random()<.4));covers.push([0,1,2]);
  for(const ids of covers.filter(row=>row.length)){
   const outgoing=new Map(ids.map(id=>[id,new Set<number>()])),degree=new Map(ids.map(id=>[id,0]));
   for(const [a,b,sign]of relations){const low=sign<0?a:b,high=sign<0?b:a;if(outgoing.has(low)&&outgoing.has(high)&&!outgoing.get(low)!.has(high)){outgoing.get(low)!.add(high);degree.set(high,degree.get(high)!+1);}}
   const ready=ids.filter(id=>!degree.get(id)),order:number[]=[];let ambiguous=false;
   for(let i=0;i<ready.length;i++){if(ready.length-i>1)ambiguous=true;const id=ready[i];order.push(id);for(const high of outgoing.get(id)!){degree.set(high,degree.get(high)!-1);if(!degree.get(high))ready.push(high);}}
   const expected=order.length<ids.length?'conflict':ambiguous?'unconfirmed':'ordered';
   for(const side of ['front','back']as const){const actual=modelRegionLayers(source,cells(ids),side)[0].layers;assert.equal(actual.status,expected);if(actual.status==='ordered')assert.deepEqual(actual.topToBottom,side==='front'?[...order].reverse():order);}
  }
 }
});
