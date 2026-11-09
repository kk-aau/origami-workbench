import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import type {Doc,Segment} from '../../src/core/types';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramCP,updateDiagramFoldLink,type DiagramProject} from '../../src/app/diagramProject';
import {createDiagramSpatialPose,spatialFaceMatrix} from '../../src/app/diagramSpatialPose';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {validateSimulationStepAnimationStructure} from '../../src/engine/simStepAnimation';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';

const hinge=(angle:number|null,assignment:Segment['assignment']=angle!==null&&angle<0?'M':'V'):Segment=>({id:'hinge',a:[50,0],b:[50,100],assignment,angle});
const docAt=(angle:number|null,assignment?:Segment['assignment']):Doc=>{const doc=blankDoc('真实折角动画',100,100);doc.segments.push(hinge(angle,assignment));return doc;};
function fixture(from:number,to:number,{camera={yaw:-25,elevation:40},withoutPose=false}={}){
  let id=0,project=createDiagramProject(docAt(from),()=>`spatial-animation-${++id}`),step=project.steps[0];
  if(!withoutPose){
    const value=createDiagramSpatialPose(project.states[0].doc,0,undefined,undefined,camera);
    project=adoptDiagramPose(project,step.id,step.beforeId,value.result,undefined,value.spatial);
  }
  project=updateDiagramCP(project,step.afterId,docAt(to));
  return {project,stepId:step.id};
}
function planned(project:DiagramProject,stepId:string){
  const clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const result=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'});
  assert.ok(result.animation.motion,'simple hinge has a real rigid path');
  const path=createSimulationStepPathEvaluator(prepared,result.animation,result.animation.motion!);
  return {clip,prepared,result,path};
}

test('spatial clip carries physical contacts into playback even when a different crease changes angle',()=>{
 const doc=blankDoc('立体叠纸续折',90,90);doc.segments.push({id:'a',a:[30,0],b:[30,90],assignment:'V',angle:180},{id:'b',a:[60,0],b:[60,90],assignment:'M',angle:-60});
 let p=createDiagramProject(doc),step=p.steps[0];const start=createDiagramSpatialPose(doc);
 p=adoptDiagramPose(p,step.id,step.beforeId,start.result,undefined,start.spatial);
 p=updateDiagramCP(p,step.afterId,{...doc,segments:doc.segments.map(s=>s.id==='b'?{...s,angle:-80}:s)});
 const clip=buildDiagramStepAnimation(p,step.id);assert(clip.initialContactOrder?.faceOrders.length,'certified old paper stack must reach the planning worker');
 const result=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'},undefined,{initialContactOrder:clip.initialContactOrder});
 assert.deepEqual(result.animation.layerTimeline?.[0].faceOrders,clip.initialContactOrder.faceOrders);
});
function validatesEndpoint(value:ReturnType<typeof planned>){
  const {clip,prepared,path}=value,end=Array.from(path.evaluate(1));
  assert.doesNotThrow(()=>validateSimulationStepAnimationStructure({...clip.animation,initialPositions:end,ranges:clip.animation.ranges.map(r=>({...r,fromAngle:r.toAngle}))},prepared,clip.animation.sourceSignature));
  // The existing path evaluator publishes Float32 positions.
  for(const v of clip.animation.fixedVertices)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(end[v*3+axis]-clip.animation.initialPositions[v*3+axis])<1e-7);
}

for(const target of [-135,-90,-45,45,90,135])test(`first fold really reaches ${target} degrees instead of a flat endpoint`,()=>{
  const {project,stepId}=fixture(0,target),saved=structuredClone(project),value=planned(project,stepId);
  assert.equal(value.clip.initialGeometry,undefined);assert.equal(value.clip.finalGeometry,undefined);
  const active=value.clip.animation.ranges.filter(r=>r.toAngle!==0);assert.ok(active.length);
  assert.ok(active.every(r=>r.fromAngle===0&&r.toAngle===target));
  validatesEndpoint(value);
  const heights=Array.from(value.path.evaluate(1)).filter((_,i)=>i%3===1);assert.ok(Math.max(...heights)-Math.min(...heights)>.1);
  assert.deepEqual(project,saved);
});

for(const [from,to] of [[90,135],[135,45],[-90,-45],[90,0]])test(`partial pose ${from} -> ${to} keeps actual 3D start and a fixed material region`,()=>{
  const {project,stepId}=fixture(from,to),value=planned(project,stepId);
  const active=value.clip.animation.ranges.filter(r=>Math.abs(r.fromAngle-r.toAngle)>1e-5);assert.ok(active.length);
  assert.ok(active.every(r=>Math.abs(r.fromAngle-from)<1e-5&&r.toAngle===to));
  const heights=value.clip.animation.initialPositions.filter((_,i)=>i%3===1);assert.ok(Math.max(...heights)-Math.min(...heights)>.1);
  validatesEndpoint(value);
  assert.equal(value.clip.initialGeometry,undefined,'no projected flat geometry is supplied for a spatial seed');
});

test('camera yaw and elevation only affect the drawing, never animation material coordinates',()=>{
  const a=fixture(90,135,{camera:{yaw:-25,elevation:40}}),b=fixture(90,135,{camera:{yaw:35,elevation:15}});
  const first=buildDiagramStepAnimation(a.project,a.stepId),second=buildDiagramStepAnimation(b.project,b.stepId);
  assert.deepEqual(first.animation.initialPositions,second.animation.initialPositions);
  assert.deepEqual(first.animation.ranges,second.animation.ranges);
  assert.deepEqual(first.animation.fixedVertices,second.animation.fixedVertices);
});

test('a finite 90-degree precrease presses and returns without changing either CP',()=>{
  const before=docAt(0,'F');let id=0,project=createDiagramProject(before,()=>`press-${++id}`),step=project.steps[0];
  const flat=computeFlatGeometry(buildDiagramFold(before).graph,1e-6);
  project=adoptDiagramPose(project,step.id,step.beforeId,flat);
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],precreases:[hinge(90)]});
  const saved=structuredClone(project),value=planned(project,step.id),active=value.clip.animation.ranges.filter(r=>r.viaAngle!==undefined);
  assert.ok(active.length);assert.ok(active.every(r=>r.fromAngle===0&&r.toAngle===0&&r.viaAngle===90));
  assert.doesNotThrow(()=>validateSimulationStepAnimationStructure({...value.clip.animation,retainedCreases:undefined,initialPositions:Array.from(value.path.evaluate(.5)),ranges:value.clip.animation.ranges.map(r=>({...r,fromAngle:r.viaAngle??r.fromAngle}))},value.prepared,value.clip.animation.sourceSignature));
  validatesEndpoint(value);assert.deepEqual(project,saved);
});

test('an explicit annotation angle never falls back to a legacy 180-degree precrease inference',()=>{
  const before=docAt(0,'F');let id=0,project=createDiagramProject(before,()=>`press-annotation-${++id}`),step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatGeometry(buildDiagramFold(before).graph,1e-6));
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[]});
  project.steps[0].annotations=[{id:'partial-press',kind:'line',a:[50,0],b:[50,100],style:'valley',color:'#315ebe',width:.7,foldAction:'precrease',foldAngle:60}];
  const clip=buildDiagramStepAnimation(project,step.id),active=clip.animation.ranges.filter(r=>r.viaAngle!==undefined);
  assert.ok(active.length);assert.ok(active.every(r=>r.viaAngle===60));
});

test('a partial before CP without a snapshot is solved in 3D, while a legacy false flat snapshot is rejected',()=>{
  const {project,stepId}=fixture(90,135,{withoutPose:true});
  validatesEndpoint(planned(project,stepId));
  const before=project.states[0],flat=computeFlatGeometry(buildDiagramFold(before.doc).graph,1e-6);
  const legacy=structuredClone(project);legacy.steps[0].pose={sourceStateId:before.id,sourceRevision:before.revision,sourceDoc:before.doc,result:flat};
  assert.throws(()=>buildDiagramStepAnimation(legacy,stepId),/重新计算真实空间姿态/);
});

test('unknown endpoints, stale spatial snapshots and a direct mountain/valley reversal reject explicitly',()=>{
  const {project,stepId}=fixture(90,135),unknown=updateDiagramCP(project,project.steps[0].afterId,docAt(null));
  assert.throws(()=>buildDiagramStepAnimation(unknown,stepId),/未知折角/);
  const stale=structuredClone(project);stale.steps[0].pose!.sourceRevision++;
  assert.throws(()=>buildDiagramStepAnimation(stale,stepId),/操作前 CP 已变化/);
  const reversed=updateDiagramCP(project,project.steps[0].afterId,docAt(-90));
  assert.throws(()=>buildDiagramStepAnimation(reversed,stepId),/反转/);
});

test('an explicitly fixed raised face stays fixed while the opposite paper changes angle',()=>{
  let {project,stepId}=fixture(90,135);
  const pose=project.steps[0].pose!,graph=buildDiagramFold(pose.sourceDoc).graph;
  const face=graph.faces_vertices!.findIndex(vertices=>vertices.every(v=>graph.vertices_coords[v][0]>=50));assert.ok(face>=0);
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],fixed:{point:[75,50],matrix:spatialFaceMatrix(pose.spatial!,face),spatialTransform:pose.spatial!.faceTransforms[face]}});
  validatesEndpoint(planned(project,stepId));
});

test('an old partial hinge keeps its angle when a new parallel material hinge is folded',()=>{
  const before=blankDoc('保留已完成折角',100,100);
  before.segments.push({id:'old',a:[30,0],b:[30,100],assignment:'V',angle:60});
  let id=0,project=createDiagramProject(before,()=>`old-partial-${++id}`);const step=project.steps[0],start=createDiagramSpatialPose(before);
  project=adoptDiagramPose(project,step.id,step.beforeId,start.result,undefined,start.spatial);
  project=updateDiagramCP(project,step.afterId,{...before,segments:[...before.segments,{id:'new',a:[70,0],b:[70,100],assignment:'M',angle:-90}]});
  const value=planned(project,step.id),old=value.clip.animation.ranges.filter(r=>Math.abs(r.fromAngle-60)<1e-5);
  assert.ok(old.length);assert.ok(old.every(r=>r.toAngle===60));
  assert.ok(value.clip.animation.ranges.some(r=>r.fromAngle===0&&r.toAngle===-90));
  validatesEndpoint(value);
});

test('a tilted initial sheet bypasses projected flat-layer inference and still receives real path verification',()=>{
  const before=docAt(0),c=Math.cos(Math.PI/6),s=Math.sin(Math.PI/6);
  const frame={rotation:[1,0,0,0,c,-s,0,s,c],translation:[10,-20,30] as [number,number,number]};
  const start=createDiagramSpatialPose(before,0,{point:[25,50],matrix:[1,0,0,c,10,-20],spatialTransform:frame});
  let id=0,project=createDiagramProject(before,()=>`tilted-${++id}`);const step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,start.result,undefined,start.spatial);
  project=updateDiagramCP(project,step.afterId,docAt(90));
  const clip=buildDiagramStepAnimation(project,step.id);
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{get initialGeometry(){throw Error('非水平起态不得读取平折几何');}});
  assert.ok(result.animation.motion);assert.ok(result.checkedIntervals>0,'strict path collision verification still runs');
  const {prepared}=prepareSimulationDocument(clip.fold),path=createSimulationStepPathEvaluator(prepared,result.animation,result.animation.motion!);
  validatesEndpoint({clip,prepared,result,path});
});
