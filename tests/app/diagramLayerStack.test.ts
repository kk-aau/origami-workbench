import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import type {DiagramPose} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {diagramLayerStackOrder} from '../../src/components/diagramLayerStackOrder';

function realPose():DiagramPose {
  const sourceDoc=blankDoc('纸层卡片',100,100);sourceDoc.segments.push({id:'v',a:[50,0],b:[50,100],assignment:'V',angle:180});
  return {sourceDoc,sourceStateId:'cp0',sourceRevision:0,result:computeFlatFold(sourceDoc),view:defaultModelView()};
}
function localPose():DiagramPose {
  const pose=realPose();pose.result.geometry.vertices=[[0,0],[10,0],[0,10]];pose.result.geometry.faces=Array.from({length:4},()=>[0,1,2]);
  pose.result.layers={status:'solved',message:'局部关系',faceOrders:[[0,1,-1],[1,2,-1]]};return pose;
}

test('cards show solver-certified layers from current camera top to bottom and preserve source F identities',()=>{
  const pose=realPose(),before=structuredClone(pose),front=diagramLayerStackOrder(pose);
  assert.equal(front.scope,'global');assert.deepEqual(front.faces,[...pose.result.layers.faceOrder!].reverse());assert.deepEqual(pose,before);
  pose.view={...pose.view!,side:'back',rotation:90};assert.deepEqual(diagramLayerStackOrder(pose).faces,[...front.faces].reverse());
});
test('illustration draw order and unknown solver order never imply physical layer numbers',()=>{
  const pose=realPose();pose.displayOrder=[1,0];pose.result.layers={status:'unknown',message:'保存的示意层序',faceOrder:[1,0]};
  assert.deepEqual(diagramLayerStackOrder(pose,[0,1]),{faces:[0,1],scope:'unknown'});
});
test('selected local paper layers can be certified through an unselected intermediate face',()=>{
  const pose=localPose();assert.deepEqual(diagramLayerStackOrder(pose,[0,2,0]),{faces:[2,0],scope:'local'});
  pose.view={...pose.view!,side:'back'};assert.deepEqual(diagramLayerStackOrder(pose,[0,2]),{faces:[0,2],scope:'local'});
});
test('disconnected selected groups remain unknown instead of using source face number to break a tie',()=>{
  const pose=localPose();assert.equal(diagramLayerStackOrder(pose,[0,3]).scope,'unknown');assert.equal(diagramLayerStackOrder(pose).scope,'unknown');
});
test('invalid relation signs, face identity, and cyclic certificates cannot certify local cards',()=>{
  for(const relations of [[[0,1,0]],[[0,4,-1]],[[0,1,-1],[1,0,-1]]] as [number,number,number][][]){
    const pose=localPose();pose.result.layers.faceOrders=relations;assert.equal(diagramLayerStackOrder(pose,[0,1]).scope,'unknown');
  }
});
test('malformed global face order does not get accepted merely because solver status says solved',()=>{
  const pose=localPose();pose.result.layers.faceOrder=[0,1,1,3];assert.equal(diagramLayerStackOrder(pose).scope,'unknown');
});
test('local layer inference has a bounded relation budget without losing the paper identities',()=>{
  const pose=localPose();pose.result.layers.faceOrders=Array.from({length:20_001},()=>[0,1,-1]);
  assert.deepEqual(diagramLayerStackOrder(pose,[0,1]),{faces:[0,1,2,3],scope:'unknown'});
});
