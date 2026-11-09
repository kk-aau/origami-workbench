import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationLayerEndpoint} from '../../src/engine/simLayerEndpoint';

test('layer display waits for a stable endpoint and blends without restarting on camera redraws',()=>{
  const endpoint=new SimulationLayerEndpoint();
  assert.equal(endpoint.update(0,false),0);assert.equal(endpoint.needsFrame,false);
  assert.equal(endpoint.update(100,true),0);assert.equal(endpoint.needsFrame,true);
  assert.equal(endpoint.update(219,true),0);
  assert.equal(endpoint.update(370,true),.5);
  assert.equal(endpoint.update(520,true),1);assert.equal(endpoint.needsFrame,false);
  assert.equal(endpoint.update(900,true),1);
});

test('leaving full-fold, resuming solver motion, or grabbing removes the endpoint immediately',()=>{
  const endpoint=new SimulationLayerEndpoint();endpoint.update(0,true);assert.equal(endpoint.update(500,true),1);
  assert.equal(endpoint.update(501,false),0);assert.equal(endpoint.needsFrame,false);
  assert.equal(endpoint.update(502,true),0,'a newly stable pose gets a fresh hold and fade');
  endpoint.reset();assert.equal(endpoint.needsFrame,false);assert.equal(endpoint.update(900,true),0);
  assert.equal(endpoint.update(NaN,true),0);assert.equal(endpoint.needsFrame,false);
});
