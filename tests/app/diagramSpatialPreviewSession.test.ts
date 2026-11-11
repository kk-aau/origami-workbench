import test from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Doc} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';
import {createDiagramSpatialPose,validateDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {createDiagramSpatialPreviewModel} from '../../src/app/diagramSpatialPreviewSession';
import {defaultModelView} from '../../src/app/modelViewState';

function document(angle=-45):Doc{
 return {schemaVersion:2,name:'转动会话复用',paper:{width:90,height:90},segments:[
  {id:'b0',a:[0,0],b:[90,0],assignment:'B',angle:0},{id:'b1',a:[90,0],b:[90,90],assignment:'B',angle:0},
  {id:'b2',a:[90,90],b:[0,90],assignment:'B',angle:0},{id:'b3',a:[0,90],b:[0,0],assignment:'B',angle:0},
  {id:'c0',a:[30,0],b:[30,90],assignment:'V',angle:180},{id:'c1',a:[60,0],b:[60,90],assignment:'M',angle}
 ]};
}
function fixture(){
 const first=document(-180),flat=computeFlatFold(first,undefined,{flatCreases:'marks'});assert.equal(flat.layers.status,'solved');
 const previous:DiagramPose={sourceStateId:'cp0',sourceRevision:0,sourceDoc:first,result:flat};
 const doc=document(),pose:DiagramPose={sourceStateId:'cp1',sourceRevision:0,sourceDoc:doc,...createDiagramSpatialPose(doc,0,undefined,previous,{yaw:23,elevation:35}),view:defaultModelView()};
 return {previous,pose,history:[previous,pose]};
}

test('repeated gestures reuse the verified material and an exact frame is reused for its final commit',()=>{
 const {pose,history}=fixture(),before=structuredClone({pose,history}),model=createDiagramSpatialPreviewModel(pose,history),camera={yaw:30,elevation:40};
 const svg=model.frame(camera),answer=model.project(camera);assert.match(svg,/<svg/);assert.equal(model.project({...camera}),answer,'final commit must use the exact frame result without reprojecting');
 const moved={...structuredClone(pose),...structuredClone(answer)},nextHistory=[history[0],structuredClone(moved),moved];
 model.sync(moved,nextHistory);const again=model.project({yaw:45,elevation:30});
 assert.equal(again.spatial.vertices,answer.spatial.vertices,'a camera-only committed snapshot must retain the same private verified projector');
 assert.equal(again.spatial.faceTransforms,answer.spatial.faceTransforms);validateDiagramSpatialPose({...moved,...again},true);
 assert.deepEqual({pose,history},before);
});

test('display-only changes update rendering without revalidating material history',()=>{
 const {pose,history}=fixture(),model=createDiagramSpatialPreviewModel(pose,history),camera={yaw:30,elevation:40},answer=model.project(camera),before=model.frame(camera);
 const shown={...structuredClone(pose),...structuredClone(answer),view:{...defaultModelView(),colors:{front:'#336699',back:'#aabbcc',line:'#111111'}},hiddenFaces:[0]};
 model.sync(shown,[history[0],shown],15);assert.notEqual(model.frame(camera),before);
 assert.equal(model.project({yaw:32,elevation:40}).spatial.vertices,answer.spatial.vertices);assert.deepEqual(shown.sourceDoc,pose.sourceDoc);
});

test('changed preceding proof or forged current layer order cannot borrow a camera-only session binding',()=>{
 for(const target of ['previous','current'] as const){
  const {pose,history}=fixture(),model=createDiagramSpatialPreviewModel(pose,history),camera={yaw:30,elevation:40},answer=model.project(camera),moved={...structuredClone(pose),...structuredClone(answer)},prior=structuredClone(history[0]);
  const changed=target==='previous'?prior:moved;changed.result.layers.faceOrder=[...changed.result.layers.faceOrder!].reverse();changed.result.layers.faceOrders=changed.result.layers.faceOrders!.map(([a,b,s])=>[a,b,-s]);
  model.sync(moved,[prior,moved]);const next=model.project(camera);
  assert.notEqual(next.spatial.vertices,answer.spatial.vertices,'changed proof must prepare a fresh verified projector');
  assert.deepEqual(next.result.layers.faceOrders,answer.result.layers.faceOrders,'saved forged layer rows must not become authority');
 }
});

test('source revisions and material-side contact settings invalidate the session even with equal physical vertices',()=>{
 for(const target of ['revision','contacts'] as const){
  const {pose,history}=fixture(),model=createDiagramSpatialPreviewModel(pose,history),camera={yaw:30,elevation:40},answer=model.project(camera),moved={...structuredClone(pose),...structuredClone(answer)};
  if(target==='revision')moved.sourceRevision++;
  else moved.spatial!.layerConstraints=[];
  model.sync(moved,[history[0],moved]);const next=model.project(camera);assert.notEqual(next.spatial.vertices,answer.spatial.vertices);
  assert.deepEqual(next.spatial.vertices,answer.spatial.vertices);validateDiagramSpatialPose({...moved,...next},true);
 }
});

test('invalid changed physical paper rejects sync and blocks stale frames until a valid source is synchronized',()=>{
 const {pose,history}=fixture(),model=createDiagramSpatialPreviewModel(pose,history),camera={yaw:30,elevation:40},bad=structuredClone(pose);bad.spatial!.vertices[0][0]+=.5;
 assert.throws(()=>model.sync(bad,[history[0],bad]),/空间姿态|CP 折角/);
 assert.throws(()=>model.frame(camera),/未通过确认/);assert.throws(()=>model.project(camera),/未通过确认/);
 model.sync(pose,history);validateDiagramSpatialPose({...pose,...model.project(camera)},true);
});
