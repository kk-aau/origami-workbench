import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyNestedMother,flagstoneParamsFromMother,initialNestedMother,nestedMotherFamilies,nestedMotherPreviewRequest,readNestedMother} from '../../src/app/nestedMotherParams';
import {defaultTileTwists,readTessParams,tessPreset} from '../../src/app/tessellation';
import {primalDualIn3354Params} from '../../src/app/primalDualIn3354';

test('a cancelled local draft cannot mutate the current parent or its source',()=>{
  const parent={...primalDualIn3354Params(),dualTargets:[[1,2],[3,4]] as [number,number][],dualEdgeFlips:[[1,4]] as [number,number][]};
  const before=JSON.stringify(parent),draft=initialNestedMother(parent);
  assert.equal(draft.family,'custom');
  if(draft.family==='custom'){draft.vertices[0][0]=.1;draft.faces[0].reverse();}
  assert.equal(JSON.stringify(parent),before);
});
test('unchanged mother preserves indexed targets and source metadata',()=>{
  const parent={...primalDualIn3354Params(),dualTargets:[[1,2],[3,4]] as [number,number][],dualEdgeFlips:[[1,4]] as [number,number][]};
  const next=applyNestedMother(parent,initialNestedMother(parent));
  assert.deepEqual(next,parent);assert.notEqual(next,parent);assert.notEqual(next.motherParams,parent.motherParams);
});
test('changing a primal-dual mother clears only stale outer constraints',()=>{
  const parent={...primalDualIn3354Params(),dualTargets:[[1,2]] as [number,number][],dualEdgeFlips:[[1,4]] as [number,number][],pruneBoundary:[[0,0],[1,0],[1,1]] as [number,number][],paper:{shape:'square' as const,margin:.1}};
  const mother={...tessPreset('periodic'),rows:4};
  const before=JSON.stringify(parent),next=applyNestedMother(parent,mother);
  assert.equal(JSON.stringify(parent),before);assert.equal(next.family,'primal-dual');
  for(const key of ['paper','pruneBoundary','dualTargets','dualEdgeFlips','visibleTopFace','faceupFace'])assert.equal((next as any)[key],undefined,key);
  assert.equal(next.motherParams?.paper,undefined);assert.equal(readTessParams(next)?.family,'primal-dual');
  for(const key of ['gamma','pleatAngle','twistDirection','reciprocalMethod','postRotation'])assert.deepEqual((next as any)[key],(parent as any)[key]);
});
test('flagstone editing preserves both paper policies and its processing parameters',()=>{
  const mother={...tessPreset('periodic'),pruneBoundary:[[0,0],[1,0],[1,1]] as [number,number][]};
  const parent={...tessPreset('flagstone'),motherParams:tessPreset('custom'),dualTargets:[[0,0]] as [number,number][]};
  const next=applyNestedMother(parent,mother);
  assert.deepEqual(next.paper,parent.paper);assert.deepEqual(next.motherParams,mother);
  for(const key of ['width','aspect','tiling','junctionAssignment'])assert.deepEqual((next as any)[key],(parent as any)[key]);
  assert.equal((next as any).dualTargets,undefined);assert.equal(readTessParams(next)?.family,'flagstone');
});
test('nested families and exceptional mothers retain the original reader restrictions',()=>{
  const dual=tessPreset('primal-dual'),flagstone=tessPreset('flagstone');
  assert(!nestedMotherFamilies(dual).includes('primal-dual'));assert(nestedMotherFamilies(flagstone).includes('primal-dual'));
  assert.throws(()=>readNestedMother(dual,tessPreset('primal-dual')));
  assert.throws(()=>readNestedMother(dual,{...tessPreset('ring'),ringMode:'origamica'}));
  for(const raw of [null,[],{...tessPreset('periodic'),rows:NaN},{...tessPreset('custom'),vertices:[[Infinity,0]]}])assert.throws(()=>readNestedMother(dual,raw));
  for(const family of ['periodic','archimedean','nonperiodic','custom','ring'] as const)assert.equal(readNestedMother(dual,tessPreset(family)).family,family);
});
test('mother-only custom preview retains indexed geometry, crop and lattice without source mutation',()=>{
  const base=tessPreset('custom'),parent=tessPreset('flagstone'),mother={...base,customOutput:'tile-twists' as const,tileTwists:defaultTileTwists(base.faces),lattice:[[1,0],[0,1]] as [[number,number],[number,number]],pruneBoundary:[[0,0],[1,0],[1,1]] as [number,number][]};
  const before=JSON.stringify(mother),query=nestedMotherPreviewRequest(parent,mother);
  assert.equal(JSON.stringify(mother),before);assert.equal(query.family,'custom');
  if(query.family==='custom'){assert.equal(query.customOutput,'tiling');assert.deepEqual(query.vertices,mother.vertices);assert.deepEqual(query.faces,mother.faces);assert.deepEqual(query.lattice,mother.lattice);assert.deepEqual(query.pruneBoundary,mother.pruneBoundary);assert.equal(query.tileTwists,undefined);}
});
test('using a boundary-only mother for flagstone does not reintroduce preset square paper',()=>{
  const {paper:_,...mother}=tessPreset('periodic'),before=JSON.stringify(mother);
  const next=flagstoneParamsFromMother(mother);
  assert.equal(JSON.stringify(mother),before);assert.equal(next.paper,undefined);
  assert.equal(next.motherParams?.paper,undefined);assert.deepEqual(readTessParams(next)?.motherParams,readTessParams(mother));
  assert.equal(readTessParams(next)?.family,'flagstone');
});
test('using a mother with explicit paper retains that policy in the outer flagstone layer',()=>{
  const mother={...tessPreset('periodic'),paper:{shape:'rectangle' as const,aspect:1.7,margin:.07,fit:'inscribed' as const}};
  const next=flagstoneParamsFromMother(mother);
  assert.deepEqual(next.paper,mother.paper);assert.notEqual(next.paper,mother.paper);
  assert.equal(next.motherParams?.paper,undefined);assert.equal(readTessParams(next)?.family,'flagstone');
});
