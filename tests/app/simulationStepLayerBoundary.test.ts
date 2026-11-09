import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {validateSimulationStepAnimation} from '../../src/engine/simStepAnimation';

test('animation boundary copies contact orders and rejects stale, malformed or incomplete layer timelines',()=>{
  const fixture=diagramSingleLayerCornerFixture(),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const plan=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),source=plan.animation;
  assert.ok(source.layerTimeline?.[0].faceOrders.length);
  const validated=validateSimulationStepAnimation(source,prepared,source.sourceSignature);
  validated.layerTimeline![0].faceOrders[0][2]*=-1;assert.notDeepEqual(validated.layerTimeline,source.layerTimeline,'iframe validation never aliases the worker result');
  for(const timeline of [[],[{progress:.1,faceOrders:[]}],[{progress:0,faceOrders:[]},{progress:0,faceOrders:[]},{progress:1,faceOrders:[]}],[{progress:0,faceOrders:[[0,prepared.sourceFaceCount!,1]]},{progress:1,faceOrders:[]}],[{progress:0,faceOrders:[[0,1,1],[1,0,-1]]},{progress:1,faceOrders:[]}],[{progress:0,faceOrders:[[0,1,0]]},{progress:1,faceOrders:[]}]]){
    assert.throws(()=>validateSimulationStepAnimation({...source,layerTimeline:timeline},prepared,source.sourceSignature),/纸层/);
  }
  const external={...clip.animation,layerTimeline:[{progress:0,faceOrders:[[0,1,123] as [number,number,number]]}]};
  assert.doesNotThrow(()=>planVerifiedSimulationStepAnimation(clip.fold,external,undefined,{initialGeometry:clip.initialGeometry}),'planning discards supplied display orders and derives its own timeline');
});
