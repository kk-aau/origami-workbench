import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayerRegionPruning} from '../../src/core/layerRegionPruning';
import {checkCoverageTournaments,registerCoveragePairs,type RegionCoverage,type RegionPair} from '../../src/core/regionTournament';

function coverage(faceCount:number,groups:readonly (readonly number[])[]):RegionCoverage{return {faceCount,cellCount:groups.length,walk(visitor){
  const active=new Set<number>();
  groups.forEach((ids,cell)=>{const wanted=new Set(ids),removed=[...active].filter(f=>!wanted.has(f)),added=ids.filter(f=>!active.has(f));for(const f of removed)active.delete(f);for(const f of added)active.add(f);visitor.onTransition?.({removed,added});visitor.onCell?.(cell,active);});
  const removed=[...active];active.clear();visitor.onTransition?.({removed,added:[]});
}};}

test('only actual common cells supply triangles; separate pair overlaps allow a global cycle',()=>{
  const separate=coverage(3,[[0,1],[1,2],[0,2]]),collector=createLayerRegionPruning(3);
  separate.walk({onCell:collector.observe});assert.deepEqual(collector.triangles,[]);
  const pairs:RegionPair[]=[[0,1],[0,2],[1,2]],cycle=new Uint8Array([2,1,2]);
  const accepted=checkCoverageTournaments(separate,pairs,cycle);assert.ok(accepted.complete&&accepted.certificate);
  const common=coverage(3,[[0,1,2]]);common.walk({onCell:collector.observe});assert.deepEqual(collector.triangles,[[0,1,2]]);
  const rejected=checkCoverageTournaments(common,pairs,cycle);assert.ok(rejected.triangles.length);
});

test('all emitted clauses preserve every local total order and expose its two cyclic orientations',()=>{
  const collector=createLayerRegionPruning(8),cells=[[7,1,5,2],[3,6,0],[2,7,4,1]];
  cells.forEach((faces,cell)=>collector.observe(cell,new Set(faces)));
  assert.ok(collector.triangles.length>0);
  for(const [a,b,c] of collector.triangles){
    assert.ok(cells.some(faces=>[a,b,c].every(f=>faces.includes(f))));
    assert.ok(a<b&&b<c);
    let valid=0,rejected=0;
    for(let assignment=0;assignment<8;assignment++){
      const values=Uint8Array.from([0,1,2],bit=>(assignment>>>bit&1)+1);
      const result=checkCoverageTournaments(coverage(8,[[a,b,c]]),[[a,b],[a,c],[b,c]],values);
      if(result.triangles.length)rejected++;else valid++;
    }
    assert.equal(valid,6);assert.equal(rejected,2);
  }
});

test('observation snapshots are independent of subsequent mutation and repeated geometry is deduplicated',()=>{
  const collector=createLayerRegionPruning(5),active=new Set([3,1,4]);
  collector.observe(0,active);active.clear();active.add(2);collector.observe(1,active);
  collector.observe(2,new Set([4,3,1]));assert.deepEqual(collector.triangles,[[1,3,4]]);
  assert.deepEqual(collector.stats,{observedCells:3,sampledCells:2,attemptedTriangles:2,retainedTriangles:1,budgetExhausted:false});
});

test('large stacks consume bounded observations and never enumerate all triples or allocate per-cell matrices',()=>{
  const collector=createLayerRegionPruning(34_420,{maxTriangles:8,maxCells:3,maxTrianglesPerCell:4});
  let reads=0;
  const huge={size:34_420,*[Symbol.iterator](){for(let i=0;i<34_420;i++){reads++;if(reads>12)throw Error('scanned a full large cell');yield i;}}} as ReadonlySet<number>;
  collector.observe(0,huge);collector.observe(1,huge);assert.equal(reads,12);
  collector.observe(2,new Set([7,8,9]));
  collector.observe(3,{size:34_420,*[Symbol.iterator](){throw Error('observation budget ignored');}} as unknown as ReadonlySet<number>);
  assert.equal(collector.stats.sampledCells,3);assert.equal(collector.stats.budgetExhausted,true);assert.equal(collector.triangles.length,5);
});

test('full coverage checking still discovers cycles omitted by a saturated acceleration cache',()=>{
  const collector=createLayerRegionPruning(6,{maxTriangles:1}),source=coverage(6,[[0,1,2],[3,4,5]]);
  let visited=0;source.walk({onCell:(cell,faces)=>{visited++;collector.observe(cell,faces);}});
  assert.equal(visited,2);assert.deepEqual(collector.triangles,[[0,1,2]]);assert.equal(collector.stats.budgetExhausted,true);
  const pairs:RegionPair[]=[];registerCoveragePairs(source,[],(a,b)=>pairs.push([a,b]));
  const candidate=Uint8Array.from(pairs,([a,b])=>a===3&&b===5?1:2);
  const checked=checkCoverageTournaments(source,pairs,candidate);assert.ok(checked.complete);assert.deepEqual(checked.triangles,[[3,4,5]]);
});

test('invalid counts, budgets and selected memberships are explicit errors; zero budget does not inspect cells',()=>{
  for(const count of [-1,NaN,Infinity,1.5,0x80000000])assert.throws(()=>createLayerRegionPruning(count),/数量/);
  for(const value of [-1,NaN,Infinity,.5])assert.throws(()=>createLayerRegionPruning(3,{maxTriangles:value}),/预算/);
  for(const faces of [[0,1,3],[0,1,-1],[0,1,NaN]])assert.throws(()=>createLayerRegionPruning(3).observe(0,new Set(faces)),/编号/);
  const duplicates={size:3,*[Symbol.iterator](){yield 0;yield 1;yield 1;}} as ReadonlySet<number>;
  assert.throws(()=>createLayerRegionPruning(3).observe(0,duplicates),/重复/);
  assert.throws(()=>createLayerRegionPruning(3).observe(-1,new Set([0,1,2])),/区域编号/);
  const disabled=createLayerRegionPruning(3,{maxTriangles:0});disabled.observe(0,{size:3,*[Symbol.iterator](){throw Error('disabled');}} as unknown as ReadonlySet<number>);
  assert.deepEqual(disabled.triangles,[]);assert.equal(disabled.stats.observedCells,1);
});
