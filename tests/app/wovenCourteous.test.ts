import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {courteousPythonRandom} from '../../src/app/courteousRandomStream';
import {readWovenCourteousSource,replayCourteousDraws,wovenCourteousPreset} from '../../src/app/wovenCourteous';
import {readTessParams,canAdoptTess,canAdoptTessWithTileLayers,tessConstructionKey} from '../../src/app/tessellation';
import {readWovenParams,wovenPreset,type WovenParams} from '../../src/app/wovenParams';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/courteous-lines-20261010.json',import.meta.url),'utf8'));

test('integer-seed local stream independently reproduces 4000 Python 53bit draws, never Wolfram',()=>{
 for(const row of fixture.randomStreamReferences){const next=courteousPythonRandom(row.seed);assert.deepEqual(Array.from({length:row.draws.length},()=>next()),row.draws);}
 for(const seed of [-1,.5,1000000,NaN])assert.throws(()=>courteousPythonRandom(seed));
});
test('original new mode defaults preserve seed0 and distance-fails20000; every legacy default remains exact',()=>{
 const original=readWovenParams({family:'woven-lines',mode:'random',randomVersion:'original-courteous'})!;
 assert.equal(original.mode,'random');if(original.mode==='random'){assert.equal(original.seed,0);assert.equal(original.maxTries,20000);}
 assert.deepEqual(readWovenParams({family:'woven-lines',mode:'random'}),wovenPreset('random'));
 assert.equal(readTessParams({...wovenPreset('lines'),randomVersion:'original-courteous'}),null);
 assert.equal(readTessParams({family:'twist',randomVersion:'original-courteous'}),null);
 assert.equal(readTessParams({...wovenCourteousPreset(),randomVersion:'unsafe'}),null);
 assert.equal(readTessParams({...wovenCourteousPreset(),maxTries:20001}),null);
 assert.equal(readTessParams({...wovenPreset('random'),maxTries:5001}),null);
});
test('all real accepted random Lines replay provider retries, source order and complete mother edges',()=>{
 for(const row of fixture.cases){
  const p=readTessParams(row.params);assert.ok(p&&p.family==='woven-lines');
  assert.ok(readWovenCourteousSource(row.response.source,p,row.response.mother),row.name);
  const proof=row.response.source.courteousAnarchy;
  assert.equal(proof.resourceAttempts,proof.providerAttempts+proof.attempts);
  assert.equal(proof.randomDraws.length,2*proof.providerAttempts+proof.attempts);
  assert.ok(proof.resourceAttempts<=5000);
  assert.equal(proof.completeLines.length,p.mode==='random'?p.boundary.length+row.response.source.generated:0);
  assert.equal(proof.wolframSeedSequenceReproduced,false);assert.equal(proof.originalGraphOptionsReproduced,false);
 }
 const first=fixture.cases[0].response.source.courteousAnarchy;
 assert.deepEqual([first.attempts,first.providerAttempts,first.outsideCenterRejections,first.resourceAttempts,first.randomDraws.length],[2,8,6,10,18]);
});
test('actual CP adoption requires original source, current parameters and independently solved layers',()=>{
 const row=fixture.cases[0],p=readTessParams(row.params)! as WovenParams,result={...row.response,doc:{metadata:{tessellation:{parameters:p}}}} as any;
 assert.equal(canAdoptTess(result,false,tessConstructionKey(p),p),true);
 assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,'not_checked'),false);
 assert.equal(canAdoptTessWithTileLayers(result,false,tessConstructionKey(p),p,'solved'),true);
 for(const edit of [{seed:1},{count:3},{minDistance:.06},{maxTries:3},{width:.025}]){
  const changed={...p,...edit} as WovenParams;assert.equal(canAdoptTess(result,false,tessConstructionKey(changed),changed),false);
 }
});
test('stale/tampered native draws, fails, primitive order, mother topology and runtime claims are refused',()=>{
 const row=fixture.cases[0],p=readTessParams(row.params)! as WovenParams;
 const edits=[(r:any)=>delete r.source.courteousAnarchy,(r:any)=>r.source.courteousAnarchy.wolframExecuted=true,
  (r:any)=>r.source.courteousAnarchy.originalGraphOptionsReproduced=true,
  (r:any)=>r.source.courteousAnarchy.randomDraws[0]+=.001,(r:any)=>r.source.courteousAnarchy.randomDraws.push(.5),
  (r:any)=>r.source.courteousAnarchy.randSeed=1,(r:any)=>r.source.courteousAnarchy.distanceFailures++,
  (r:any)=>r.source.courteousAnarchy.outsideCenterRejections++,
  (r:any)=>r.source.courteousAnarchy.completeLines.reverse(),(r:any)=>r.source.courteousAnarchy.completeLines.pop(),
  (r:any)=>r.source.lines[0][1]+=.001,(r:any)=>r.source.generated++,
  (r:any)=>r.mother.edges_vertices.pop(),(r:any)=>r.mother.vertices_coords[0][0]+=.01,
  (r:any)=>r.source.courteousAnarchy.hidden='Run[]'];
 for(const edit of edits){const r=structuredClone(row.response);edit(r);assert.equal(readWovenCourteousSource(r.source,p,r.mother),null);}
 // Changing both the seed tag and query cannot make the old RNG stream valid.
 const r=structuredClone(row.response);r.source.courteousAnarchy.randSeed=1;r.source.seed=1;
 assert.equal(readWovenCourteousSource(r.source,{...p,seed:1} as WovenParams,r.mother),null);
});
test('independent recorded streams preserve the nonintersection fails quirk and total provider budget',()=>{
 const p=wovenCourteousPreset(),radius=Math.sqrt(8);
 // Each candidate receives r/theta for center, then theta for direction.
 const horizontal=(y:number)=>[Math.abs(y)/radius,y<0?.75:.25,0];
 const vertical=(x:number)=>[Math.abs(x)/radius,x<0?.5:0,.25];
 const budget={...p,count:24,minDistance:.02,maxTries:1};
 const replay=replayCourteousDraws(budget,[...horizontal(-.5),...horizontal(.5),...vertical(-.99)]);
 assert.equal(replay.lines.length,1);assert.equal(replay.noInteriorIntersectionRejections,1);assert.equal(replay.distanceFailures,1);
 assert.equal(replay.resourceAttempts,6);assert.equal(replay.stopReason,'distance-failures');
 const successes=replayCourteousDraws({...p,count:2,minDistance:.02,maxTries:2},[...horizontal(-.5),...vertical(-.99),...vertical(0)]);
 assert.equal(successes.lines.length,2);assert.equal(successes.distanceFailures,1);
 const providerOnly=replayCourteousDraws(p,Array.from({length:5000},()=>[.99,0]).flat());
 assert.equal(providerOnly.providerAttempts,5000);assert.equal(providerOnly.resourceAttempts,5000);
 assert.equal(providerOnly.attempts,0);assert.equal(providerOnly.outsideCenterRejections,5000);assert.equal(providerOnly.stopReason,'resource-attempts');
});
