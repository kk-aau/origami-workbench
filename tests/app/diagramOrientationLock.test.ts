import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildDiagramFold,distance} from '../../src/core/geometry';
import type {Point} from '../../src/core/types';
import {defaultModelView} from '../../src/app/modelViewState';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {chooseDiagramPrecreaseAnchor,hasDiagramActiveFoldChanges} from '../../src/app/diagramPrecreaseAdvance';
import {alignDiagramFoldResult,diagramFoldStartingFace} from '../../src/app/diagramFoldLink';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {
  createDiagramProject,appendDiagramStep,advanceDiagramStep,duplicateDiagramStep,adoptDiagramPose,
  updateDiagramAnnotations,updateDiagramCanvas,updateDiagramPoseView,updateDiagramOrientationLock,
  getDiagramStepInitialView,resyncDiagramStepViews,exportDiagramProject,importDiagramProject,validateDiagramProject,
  type DiagramProject,
} from '../../src/app/diagramProject';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';

const symbol=(symbol:DiagramSymbolAnnotation['symbol']):DiagramSymbolAnnotation=>({id:symbol,kind:'symbol',symbol,position:[10,10],size:20,rotation:0,color:'#123456',width:.7,...(['rotate','rotateCCW'].includes(symbol)?{turnAngle:90}:{})});
function fixture(){
  let n=0;const ids=()=>`orientation-lock-${++n}`,doc=blankDoc('固定整图朝向',100,100),result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  let project=createDiagramProject(doc,ids);project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,result);
  return {project,result,ids};
}
const orientation=(p:DiagramProject,i:number)=>{const v=getDiagramStepInitialView(p,p.steps[i].id);return {side:v.side,rotation:v.rotation};};

test('new steps keep the visible paper angle without rotating new symbols or grid',()=>{
  const f=fixture(),id=f.project.activeStepId;
  let p=updateDiagramCanvas(f.project,id,{...f.project.steps[0].canvas!,drawingRotation:-90,grid:false,gridDivisions:17,constructionPoints:[[7,13]],anglePreset:33});
  p=appendDiagramStep(p,f.ids);
  assert.equal(p.steps[1].canvas!.drawingRotation,undefined);assert.equal(orientation(p,1).rotation,270);assert.equal(p.steps[1].canvas!.grid,true);assert.equal(p.steps[1].canvas!.gridDivisions,4);
  assert.equal(p.steps[1].canvas!.constructionPoints,undefined);assert.equal(p.steps[1].canvas!.anglePreset,undefined);
  assert.equal(f.project.steps[0].canvas!.drawingRotation,undefined);
});

test('locking keeps the current view, camera and artwork without changing physical fixed faces',()=>{
  const f=fixture(),id=f.project.activeStepId;
  let p=updateDiagramAnnotations(f.project,id,[symbol('rotate'),symbol('flip')]);
  p=updateDiagramPoseView(p,id,{...defaultModelView(),side:'back',rotation:37,cameras:{'back-solid':{rotation:37,x:12,y:34,width:150,height:125}}});
  const before=structuredClone(p),locked=updateDiagramOrientationLock(p,id,true);
  assert.equal(locked.steps[0].orientationLocked,true);assert.equal(locked.steps[0].viewMode,'manual');
  assert.deepEqual(locked.steps[0].pose,before.steps[0].pose);assert.deepEqual(locked.steps[0].annotations,before.steps[0].annotations);
  assert.deepEqual(locked.steps[0].foldLink,before.steps[0].foldLink);assert.deepEqual(locked.states,before.states);assert.deepEqual(p,before);
});

test('a locked source applies explicit turn and flip instructions while preserving its own direction',()=>{
  const f=fixture(),id=f.project.activeStepId;
  let p=updateDiagramPoseView(f.project,id,{...defaultModelView(),rotation:23});
  p=updateDiagramAnnotations(p,id,[symbol('rotate'),symbol('flip')]);p=updateDiagramOrientationLock(p,id,true);p=appendDiagramStep(p,f.ids);
  assert.equal(p.steps[1].orientationLocked,true);assert.equal(p.steps[1].viewMode,'auto');
  assert.deepEqual(p.steps[1].pendingView,{side:'back',rotation:247});assert.deepEqual(orientation(p,1),{side:'back',rotation:247});
  p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);
  assert.equal(p.steps[1].viewMode,'auto');assert.equal(p.steps[1].pendingView,undefined);assert.deepEqual(orientation(p,1),{side:'back',rotation:247});
  p=updateDiagramAnnotations(p,id,[symbol('rotateCCW')]);assert.deepEqual(orientation(p,1),{side:'front',rotation:293});
  const after=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);assert.deepEqual(orientation(after,1),{side:'front',rotation:293},'recomputing does not replay the same instruction');
  assert.deepEqual(orientation(after,0),{side:'front',rotation:23});
});

test('locking an uncalculated target retains its explicit inherited instructions',()=>{
  const f=fixture(),id=f.project.activeStepId;
  let p=updateDiagramAnnotations(f.project,id,[symbol('rotate'),symbol('flip')]);p=appendDiagramStep(p,f.ids);
  assert.deepEqual(orientation(p,1),{side:'back',rotation:270});
  p=updateDiagramOrientationLock(p,p.steps[1].id,true);assert.deepEqual(p.steps[1].pendingView,{side:'back',rotation:270});
  p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);assert.deepEqual(orientation(p,1),{side:'back',rotation:270});
  assert.equal(p.steps[1].viewMode,'auto');validateDiagramProject(p);
});

test('an explicitly unlocked new target still honors a locked preceding source',()=>{
  const f=fixture(),id=f.project.activeStepId;
  let p=updateDiagramAnnotations(f.project,id,[symbol('rotate'),symbol('flip')]);p=updateDiagramOrientationLock(p,id,true);p=appendDiagramStep(p,f.ids);
  p=updateDiagramOrientationLock(p,p.steps[1].id,false);p=resyncDiagramStepViews(p);
  assert.deepEqual(orientation(p,1),{side:'back',rotation:270});assert.deepEqual(p.steps[1].pendingView,{side:'back',rotation:270});
});

test('unlocking preserves the current authored direction and does not immediately move later steps',()=>{
  const f=fixture(),id=f.project.activeStepId;
  let p=updateDiagramAnnotations(f.project,id,[symbol('rotate')]);p=updateDiagramOrientationLock(p,id,true);p=appendDiagramStep(p,f.ids);
  p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);const before=structuredClone(p);
  p=updateDiagramOrientationLock(p,id,false);assert.equal(p.steps[0].orientationLocked,false);assert.equal(p.steps[0].viewMode,'manual');
  assert.deepEqual(p.steps[0].pose,before.steps[0].pose);assert.deepEqual(p.steps[1],before.steps[1]);
  p=updateDiagramOrientationLock(p,p.steps[1].id,false);p=resyncDiagramStepViews(p);assert.deepEqual(orientation(p,1),{side:'front',rotation:90});
});

test('existing manually authored successor direction and drawing rotation survive navigation from a locked source',()=>{
  const f=fixture();let p=appendDiagramStep(f.project,f.ids);p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);
  p=updateDiagramPoseView(p,p.steps[1].id,{...defaultModelView(),rotation:47,side:'back'});
  p=updateDiagramCanvas(p,p.steps[1].id,{...p.steps[1].canvas!,drawingRotation:15});
  p=updateDiagramOrientationLock(p,p.steps[0].id,true);p.activeStepId=p.steps[0].id;const target=structuredClone(p.steps[1]);
  p=advanceDiagramStep(p,f.ids);assert.deepEqual(p.steps[1],target);
});

test('Next repairs a legacy inherited locked view once without replacing the existing model',()=>{
  const f=fixture(),first=f.project.activeStepId;
  let p=updateDiagramOrientationLock(f.project,first,true);p=appendDiagramStep(p,f.ids);
  p=adoptDiagramPose(p,p.activeStepId,p.steps[1].beforeId,f.result);
  // Saved by the old lock implementation: an inherited view was marked manual.
  p.steps[1].viewMode='manual';p.steps[0].annotations=[symbol('flip')];p.activeStepId=first;
  const original=structuredClone(p),result=structuredClone(p.steps[1].pose!.result);
  p=advanceDiagramStep(p,f.ids);
  assert.equal(p.steps[1].viewMode,'auto');assert.deepEqual(orientation(p,1),{side:'back',rotation:0});
  assert.deepEqual(p.steps[1].pose!.result,result);assert.deepEqual(p.states,original.states);assert.deepEqual(original.steps[0],p.steps[0]);
  for(let i=0;i<3;i++){p.activeStepId=first;p=advanceDiagramStep(p,f.ids);assert.deepEqual(orientation(p,1),{side:'back',rotation:0});}
  p=updateDiagramAnnotations(p,first,[]);assert.deepEqual(orientation(p,1),{side:'front',rotation:0});
});

test('a locked oblique spatial view flips in the next step without changing physical geometry or its camera',()=>{
  const doc=blankDoc('立体翻面',100,100);doc.segments.push({id:'fold',a:[40,0],b:[40,100],assignment:'V',angle:90});
  const answer=createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:-25,elevation:35});let n=0;const ids=()=>`spatial-flip-${++n}`;
  let p=createDiagramProject(doc,ids);p=adoptDiagramPose(p,p.activeStepId,p.steps[0].beforeId,answer.result,undefined,answer.spatial);
  p=updateDiagramOrientationLock(p,p.activeStepId,true);p=updateDiagramAnnotations(p,p.activeStepId,[symbol('flip')]);
  const first=p.activeStepId,source=structuredClone(p.steps[0].pose!);p=appendDiagramStep(p,ids);
  const target=p.activeStepId;p=adoptDiagramPose(p,target,p.steps[1].beforeId,answer.result,getDiagramStepInitialView(p,target),answer.spatial);
  assert.deepEqual(orientation(p,1),{side:'back',rotation:0});assert.equal(p.steps[1].viewMode,'auto');
  assert.deepEqual(p.steps[1].pose!.spatial,source.spatial);assert.deepEqual(p.steps[1].pose!.result,source.result);
  p.steps[1].paperStates={active:'spatial',flat:structuredClone(p.steps[1].pose!),spatial:structuredClone(p.steps[1].pose!)};
  p=updateDiagramAnnotations(p,first,[]);
  for(const pose of [p.steps[1].pose!,p.steps[1].paperStates!.flat,p.steps[1].paperStates!.spatial!]){assert.equal(pose.view!.side,'front');assert.deepEqual(pose.spatial,source.spatial);}
  validateDiagramProject(p);
});

test('Next applies the pending flip while preserving an independently chosen spatial camera',()=>{
  const doc=blankDoc('手选立体视角',100,100);doc.segments.push({id:'fold',a:[40,0],b:[40,100],assignment:'V',angle:90});
  const initial=createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:-25,elevation:35}),manual=createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:40,elevation:20});let n=0;const ids=()=>`manual-spatial-flip-${++n}`;
  let p=createDiagramProject(doc,ids);p=adoptDiagramPose(p,p.activeStepId,p.steps[0].beforeId,initial.result,undefined,initial.spatial);
  p=updateDiagramOrientationLock(p,p.activeStepId,true);p=appendDiagramStep(p,ids);
  p=adoptDiagramPose(p,p.activeStepId,p.steps[1].beforeId,manual.result,undefined,manual.spatial);
  p.steps[1].viewMode='manual';p.steps[0].annotations=[symbol('flip')];p.activeStepId=p.steps[0].id;
  const target=structuredClone(p.steps[1]);p=advanceDiagramStep(p,ids);
  assert.equal(p.steps[1].pose!.view!.side,'back');assert.equal(p.steps[1].viewMode,'auto');
  assert.deepEqual(p.steps[1].pose!.spatial,target.pose!.spatial);assert.deepEqual(p.steps[1].pose!.result,target.pose!.result);
  assert.equal(p.steps[1].pose!.spatial!.camera.yaw,40);assert.equal(p.steps[1].pose!.spatial!.camera.elevation,20);
  p.activeStepId=p.steps[0].id;p=advanceDiagramStep(p,ids);assert.equal(p.steps[1].pose!.view!.side,'back');
});

test('drawing rotation and orientation locks survive duplicate, export and import while absent legacy fields remain valid',()=>{
  const f=fixture(),id=f.project.activeStepId;
  let p=updateDiagramCanvas(f.project,id,{...f.project.steps[0].canvas!,drawingRotation:-180});p=updateDiagramOrientationLock(p,id,true);
  p=duplicateDiagramStep(p,id,f.ids);assert.equal(p.steps[1].orientationLocked,true);assert.equal(p.steps[1].canvas!.drawingRotation,-180);
  const loaded=importDiagramProject(exportDiagramProject(p));assert.deepEqual(loaded.steps.map(s=>[s.canvas!.drawingRotation,s.orientationLocked]),[[-180,true],[-180,true]]);
  assert.deepEqual(resyncDiagramStepViews(loaded).steps.map(s=>s.pose!.view),loaded.steps.map(s=>s.pose!.view));
  const legacy=importDiagramProject(exportDiagramProject(f.project));assert.equal(legacy.steps[0].canvas!.drawingRotation,undefined);assert.equal(legacy.steps[0].orientationLocked,undefined);
});

test('persisted rotation and lock validators reject invalid values without changing the project',()=>{
  const f=fixture(),before=structuredClone(f.project);
  for(const value of [180,-180.01,NaN,Infinity,'90',null])assert.throws(()=>updateDiagramCanvas(f.project,f.project.activeStepId,{...f.project.steps[0].canvas!,drawingRotation:value as number}),/整图旋转/);
  for(const value of ['true',1,null]){
    const invalid=structuredClone(f.project);invalid.steps[0].orientationLocked=value as boolean;
    assert.throws(()=>validateDiagramProject(invalid),/锁定/);assert.throws(()=>updateDiagramOrientationLock(f.project,f.project.activeStepId,value as boolean),/锁定/);
  }
  assert.deepEqual(f.project,before);
});

test('recomputing the same locked CP retains its genuine material placement through a temporary alignment anchor',()=>{
  const original=blankDoc('固定朝向后重新计算',100,100),ends:Point[]=[[100,50],[100,100],[50,100],[0,0]];
  ends.forEach((b,i)=>original.segments.push({id:`hinge-${i}`,a:[50,50],b,assignment:i?'V':'M',angle:i?180:-180}));
  const source=computeFlatFold(original,undefined,{flatCreases:'marks'}),oldPose={sourceStateId:'old',sourceRevision:0,sourceDoc:original,result:source};
  const after=structuredClone(original),boundaries=after.segments.slice(0,4);after.segments=[...boundaries.slice(2),...boundaries.slice(0,2),...after.segments.slice(4)];
  const doc=normalizeDiagramCP(after).doc,initialAnchor=chooseDiagramPrecreaseAnchor(oldPose,doc);
  const aligned=alignDiagramFoldResult(doc,computeFlatFold(doc,undefined,{flatCreases:'marks',startingFace:diagramFoldStartingFace(doc,initialAnchor)}),initialAnchor);
  let n=0,p=createDiagramProject(doc,()=>`locked-root-${++n}`);p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,aligned);
  p=updateDiagramCanvas(p,p.activeStepId,{...p.steps[0].canvas!,drawingRotation:30});p=updateDiagramOrientationLock(p,p.activeStepId,true);
  const before=structuredClone(p),pose=p.steps[0].pose!,raw=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(hasDiagramActiveFoldChanges(pose.sourceDoc,doc),false);assert.equal(raw.layers.status,'solved');
  pose.result.geometry.vertices.forEach(([x,y],v)=>assert.ok(distance(raw.geometry.vertices[v],[100-y,x])<1e-6,'an unaligned default root would rotate the material by 90 degrees'));
  const temporary=chooseDiagramPrecreaseAnchor(pose,doc),result=alignDiagramFoldResult(doc,computeFlatFold(doc,undefined,{flatCreases:'marks',startingFace:diagramFoldStartingFace(doc,temporary)}),temporary);
  const adopted=adoptDiagramPose(p,p.activeStepId,p.states[0].id,result);
  const material=buildDiagramFold(doc).graph;assert.equal(material.vertices_coords.length,result.geometry.vertices.length);
  pose.result.geometry.vertices.forEach((point,v)=>assert.ok(distance(adopted.steps[0].pose!.result.geometry.vertices[v],point)<1e-6));
  assert.deepEqual(adopted.steps[0].pose!.view,pose.view);assert.equal(adopted.steps[0].canvas!.drawingRotation,30);assert.equal(adopted.steps[0].orientationLocked,true);
  assert.equal(adopted.steps[0].foldLink!.fixed,undefined,'an illustration direction lock never becomes a persistent physical fixed face');
  assert.deepEqual(p,before);assert.deepEqual(adopted.states,before.states);
});
