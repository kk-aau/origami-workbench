import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dualTargetsParams} from '../../src/app/geometryDraftParams';
import {tessPreset,readTessParams,prepareTessResult,canAdoptTessWithTileLayers,tessConstructionKey,type XY} from '../../src/app/tessellation';
import {minTotalPleatPreset,minTotalPleatResultMatches} from '../../src/app/reciprocalMinTotalPleat';
test('manual dual preserves the chosen paper shape through explicit inscribed adaptation',()=>{
 const params=tessPreset('periodic'),targets:XY[]=[[.5,.5],[1.5,.5],[.5,1.5]],before=structuredClone(params);
 assert.ok(params.paper);
 const draft=dualTargetsParams(params,targets);
 assert.deepEqual(draft.paper,{...params.paper,fit:'inscribed',margin:Math.min(.45,params.paper.margin)});
 assert.deepEqual(params,before);assert.deepEqual('dualTargets' in draft&&draft.dualTargets,targets);
 targets[0][0]=99;assert.equal('dualTargets' in draft&&draft.dualTargets?.[0][0],.5);
});
test('choosing mother boundary removes paper adaptation without losing target correspondence',()=>{
 const draft=dualTargetsParams(tessPreset('periodic'),[[.5,.5],[1.5,.5],[.5,1.5]],'boundary');
 assert.equal(draft.paper,undefined);assert.equal('dualTargets' in draft&&draft.dualTargets?.length,3);
 assert.equal(Object.hasOwn(draft,'paper'),false);
});

test('real MinTotal point-editor draft and commit preserve absent paper and adopt the current source',()=>{
 const response=JSON.parse(readFileSync(new URL('../fixtures/min-total-edited-main-20261011.json',import.meta.url),'utf8'));
 const original=minTotalPleatPreset(),before=structuredClone(original),targets=response.stats.parameters.dualTargets as XY[];
 for(const mode of ['inscribed','boundary'] as const){
  const draft=dualTargetsParams(original,targets,mode),committed=dualTargetsParams(original,structuredClone(targets),mode);
  assert.equal(Object.hasOwn(draft,'paper'),false);
  assert.deepEqual(readTessParams(draft),draft);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(draft))),draft);
  assert.equal(tessConstructionKey(draft),tessConstructionKey(committed));
  const prepared=prepareTessResult(response,committed);
  assert.equal(minTotalPleatResultMatches(prepared,committed),true);
  assert.equal(canAdoptTessWithTileLayers(prepared,false,tessConstructionKey(committed),committed,'solved'),true);
  assert.equal(canAdoptTessWithTileLayers(prepared,false,tessConstructionKey(committed),committed,'no-solution'),false);
  const other=structuredClone(committed);if('dualTargets' in other)other.dualTargets![0][0]+=.01;
  assert.equal(minTotalPleatResultMatches(prepared,other),false);
  const moved=structuredClone(prepared);moved.doc.segments[0].a[0]+=.01;
  assert.equal(minTotalPleatResultMatches(moved,committed),false);
 }
 assert.deepEqual(original,before);
 for(const paper of [null,{shape:'square',margin:.1}])assert.equal(readTessParams({...original,paper}),null);
});
