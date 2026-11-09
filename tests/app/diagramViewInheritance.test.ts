import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {createDiagramProject,appendDiagramStep,advanceDiagramStep,inheritDiagramCurrentPose,duplicateDiagramStep,removeDiagramStep,adoptDiagramPose,selectDiagramStep,updateDiagramAnnotations,updateDiagramCanvas,updateDiagramPoseResult,updateDiagramPoseView,getDiagramStepInitialView,resyncDiagramStepViews,exportDiagramProject,importDiagramProject,validateDiagramProject,type DiagramProject} from '../../src/app/diagramProject';

const symbol=(id:string,symbol:DiagramSymbolAnnotation['symbol'],turnAngle?:number):DiagramSymbolAnnotation=>({id,kind:'symbol',symbol,position:[10,10],size:20,rotation:123,color:'#123456',width:.7,...turnAngle!==undefined?{turnAngle}:{}});
function fixture(){
  let n=0;const ids=()=>`view-inheritance-${++n}`,doc=blankDoc('视角继承',100,100),result=computeFlatFold(doc);
  let project=createDiagramProject(doc,ids);project=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,result);
  return {project,result,ids};
}
const orientation=(project:DiagramProject,index:number)=>{const view=getDiagramStepInitialView(project,project.steps[index].id);return {side:view.side,rotation:view.rotation};};

test('next-step orientation follows view instructions once, including an uncalculated step',()=>{
  const f=fixture(),first=f.project.steps[0].id;
  let p=updateDiagramAnnotations(f.project,first,[symbol('flip','flip'),symbol('turn','rotate',90)]);
  const before=structuredClone(p);p=appendDiagramStep(p,f.ids);
  assert.deepEqual(orientation(p,1),{side:'back',rotation:90});assert.deepEqual(p.steps[1].pendingView,{side:'back',rotation:90});
  assert.equal(p.steps[1].pose,null);assert.deepEqual(f.project.steps[0].pose!.view!.rotation,0);assert.deepEqual(before.steps[0],p.steps[0]);
  const nextId=p.steps[1].id;p=adoptDiagramPose(p,nextId,p.steps[1].beforeId,f.result,getDiagramStepInitialView(p,nextId));
  assert.equal(p.steps[1].viewMode,'auto');assert.equal(p.steps[1].pendingView,undefined);assert.deepEqual(orientation(p,1),{side:'back',rotation:90});
  for(let i=0;i<3;i++){p=selectDiagramStep(p,first);p=advanceDiagramStep(p,f.ids);assert.deepEqual(orientation(p,1),{side:'back',rotation:90});}
  p=updateDiagramAnnotations(p,first,[symbol('turn','rotate',30)]);assert.deepEqual(orientation(p,1),{side:'front',rotation:30});
  p=updateDiagramAnnotations(p,first,[]);assert.deepEqual(orientation(p,1),{side:'front',rotation:0},'removing all instructions removes their derived effect');
  validateDiagramProject(p);
});

test('direction edits change the immediate next canvas without rotating later saved pages',()=>{
  const f=fixture();let p=appendDiagramStep(f.project,f.ids);p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);
  p=appendDiagramStep(p,f.ids);p=adoptDiagramPose(p,p.steps[2].id,p.steps[2].beforeId,f.result);
  const first=p.steps[0].id,second=p.steps[1].id;
  p=updateDiagramAnnotations(p,first,[symbol('cw','rotate',80)]);
  p=updateDiagramAnnotations(p,second,[symbol('ccw','rotateCCW',30)]);
  assert.deepEqual(orientation(p,1),{side:'front',rotation:80});
  assert.deepEqual(orientation(p,2),{side:'front',rotation:0});assert.equal(p.steps[2].viewMode,'manual');
  const camera={rotation:80,x:3,y:4,width:300,height:200};
  p=updateDiagramPoseView(p,second,{...p.steps[1].pose!.view!,xray:true,cameras:{'front-solid':camera}});
  assert.equal(p.steps[1].viewMode,'auto','pan, zoom and style changes do not disable instruction inheritance');
  p=updateDiagramAnnotations(p,first,[symbol('cw','rotate',100)]);
  assert.deepEqual(orientation(p,1),{side:'front',rotation:100});assert.equal(p.steps[1].pose!.view!.xray,true);assert.deepEqual(p.steps[1].pose!.view!.cameras,{},'a changed orientation does not retain a stale canvas camera');
  p=updateDiagramPoseView(p,second,{...p.steps[1].pose!.view!,rotation:37});assert.equal(p.steps[1].viewMode,'manual');
  p=updateDiagramAnnotations(p,first,[symbol('flip','flip'),symbol('cw','rotate',180)]);
  assert.deepEqual(orientation(p,1),{side:'front',rotation:37});assert.deepEqual(orientation(p,2),{side:'front',rotation:0},'later saved artwork is not rotated by an earlier symbol edit');
});

test('changing an earlier direction leaves later uncalculated pages at their saved orientations',()=>{
  const f=fixture();let p=appendDiagramStep(f.project,f.ids);
  p=appendDiagramStep(p,f.ids);p=appendDiagramStep(p,f.ids);
  const first=p.steps[0].id,later=p.steps[2].id,last=p.steps[3].id;
  p=updateDiagramAnnotations(p,first,[symbol('turn','rotate',70)]);
  assert.deepEqual(orientation(p,1),{side:'front',rotation:70});
  assert.deepEqual(orientation(p,2),{side:'front',rotation:0});
  assert.deepEqual(orientation(p,3),{side:'front',rotation:0});
  assert.equal(p.steps[2].viewMode,'manual');assert.deepEqual(p.steps[2].pendingView,{side:'front',rotation:0});
  p=updateDiagramAnnotations(p,first,[symbol('turn','rotate',110)]);
  assert.deepEqual(orientation(p,1),{side:'front',rotation:110});
  assert.deepEqual(getDiagramStepInitialView(p,later).rotation,0);
  assert.deepEqual(getDiagramStepInitialView(p,last).rotation,0);
  validateDiagramProject(importDiagramProject(exportDiagramProject(p)));
});

test('flip, rotate, flip acts on the current edited canvas instead of restoring the first pose',()=>{
  const f=fixture(),first=f.project.activeStepId;
  const edited=moveFoldedVertices(f.project.steps[0].pose!.result,{group:[0],selected:[0]},[-10,-15]);
  let p=updateDiagramPoseResult(f.project,first,edited);
  for(const [kind,angle] of [['flip',undefined],['rotate',90],['flip',undefined]] as const){
    const current=p.activeStepId;
    p=updateDiagramAnnotations(p,current,[symbol(`action-${p.steps.length}`,kind,angle)]);
    p=appendDiagramStep(p,f.ids);
    p=inheritDiagramCurrentPose(p,current,p.activeStepId);
    assert.deepEqual(p.steps.at(-1)!.pose!.result.geometry.vertices,edited.geometry.vertices);
    assert.equal(p.steps.at(-1)!.viewMode,'manual');
  }
  assert.deepEqual(p.steps.map((_,i)=>orientation(p,i)),[
    {side:'front',rotation:0},{side:'back',rotation:0},{side:'back',rotation:90},{side:'front',rotation:270}
  ]);
  validateDiagramProject(p);
});

test('flip uses the current whole-canvas rotation when the drawing was turned separately',()=>{
  const f=fixture(),first=f.project.activeStepId;
  let p=updateDiagramCanvas(f.project,first,{...f.project.steps[0].canvas!,drawingRotation:30});
  p=updateDiagramAnnotations(p,first,[symbol('flip','flip')]);
  p=appendDiagramStep(p,f.ids);
  assert.deepEqual(orientation(p,1),{side:'back',rotation:330});
  p=inheritDiagramCurrentPose(p,first,p.activeStepId);
  assert.deepEqual(orientation(p,1),{side:'back',rotation:330});
});

test('legacy matching orientations migrate automatically and an obvious authored view stays manual',()=>{
  const f=fixture();let p=appendDiagramStep(f.project,f.ids);p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);
  delete p.steps[1].viewMode;
  const source=structuredClone(p),changed=updateDiagramAnnotations(p,p.steps[0].id,[symbol('rotate','rotate',45)]);
  assert.equal(changed.steps[1].viewMode,'auto');assert.deepEqual(orientation(changed,1),{side:'front',rotation:45});assert.deepEqual(p,source);
  const manual=structuredClone(p);manual.steps[1].pose!.view={...defaultModelView(),rotation:17};
  const protectedView=updateDiagramAnnotations(manual,manual.steps[0].id,[symbol('flip','flip')]);
  assert.equal(protectedView.steps[1].viewMode,'manual');assert.deepEqual(orientation(protectedView,1),{side:'front',rotation:17});
  const explicit=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result,{...defaultModelView(),rotation:23});
  assert.deepEqual(orientation(explicit,1),{side:'front',rotation:23});assert.equal(explicit.steps[1].viewMode,'manual');
});

/** Mirror the history boundary: cameras are UI state, but automatic orientation
 * is recomputed from the historical symbols instead of retained as UI state. */
function restoredView(history:DiagramProject,current:DiagramProject){
  const restored=structuredClone(history);
  for(const step of restored.steps){
    const visible=current.steps.find(s=>s.id===step.id);if(!step.pose||!visible?.pose)continue;
    step.pose.view=structuredClone(visible.pose.view);
    if(visible.viewMode==='manual'){step.viewMode='manual';delete step.pendingView;}
    if(step.paperStates)step.paperStates[step.paperStates.active]=structuredClone(step.pose);
  }
  return resyncDiagramStepViews(restored,current);
}

test('undo and redo restore the historical symbol effect without accumulating or losing manual views',()=>{
  const f=fixture();let before=appendDiagramStep(f.project,f.ids);before=adoptDiagramPose(before,before.steps[1].id,before.steps[1].beforeId,f.result);
  const after=updateDiagramAnnotations(before,before.steps[0].id,[symbol('flip','flip'),symbol('rotate','rotate',90)]),snapshot=structuredClone(after);
  const undone=restoredView(before,after);assert.deepEqual(orientation(undone,1),{side:'front',rotation:0});
  const redone=restoredView(after,undone);assert.deepEqual(orientation(redone,1),{side:'back',rotation:90});assert.deepEqual(after,snapshot);
  const manual=updateDiagramPoseView(after,after.steps[1].id,{...defaultModelView(),rotation:33});
  const protectedUndo=restoredView(before,manual);assert.deepEqual(orientation(protectedUndo,1),{side:'front',rotation:33});assert.equal(protectedUndo.steps[1].viewMode,'manual');
  assert.deepEqual(resyncDiagramStepViews(redone),redone,'resynchronization is idempotent');
});

test('flat and pulled snapshots share inherited orientation without changing either material shape',()=>{
  const f=fixture();let p=appendDiagramStep(f.project,f.ids);p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);
  const target=p.steps[1].id,flat=structuredClone(p.steps[1].pose!),moved=moveFoldedVertices(flat.result,{group:[0],selected:[0]},[-10,-15]);
  p=updateDiagramPoseResult(p,target,moved);p=recordDiagramPaperPull(p,target,flat);
  const shapes=[structuredClone(p.steps[1].paperStates!.flat.result),structuredClone(p.steps[1].paperStates!.pulled.result)];
  p=updateDiagramAnnotations(p,p.steps[0].id,[symbol('flip','flip'),symbol('turn','rotateCCW',30)]);
  for(const pose of [p.steps[1].pose!,p.steps[1].paperStates!.flat,p.steps[1].paperStates!.pulled])assert.deepEqual({side:pose.view!.side,rotation:pose.view!.rotation},{side:'back',rotation:330});
  assert.deepEqual(p.steps[1].paperStates!.flat.result,shapes[0]);assert.deepEqual(p.steps[1].paperStates!.pulled.result,shapes[1]);
  for(const active of ['flat','pulled','flat'] as const){p=switchDiagramPaperState(p,target,active);assert.deepEqual(orientation(p,1),{side:'back',rotation:330});}
  p=updateDiagramAnnotations(p,p.steps[0].id,[]);
  for(const pose of [p.steps[1].paperStates!.flat,p.steps[1].paperStates!.pulled])assert.deepEqual({side:pose.view!.side,rotation:pose.view!.rotation},{side:'front',rotation:0});
});

test('copy, deletion and project round trips preserve derived views without replaying instructions',()=>{
  const f=fixture();let p=updateDiagramAnnotations(f.project,f.project.steps[0].id,[symbol('flip','flip'),symbol('turn','rotate',90)]);
  p=appendDiagramStep(p,f.ids);p=adoptDiagramPose(p,p.steps[1].id,p.steps[1].beforeId,f.result);
  p=updateDiagramAnnotations(p,p.steps[1].id,[symbol('reverse','rotateCCW',30)]);
  p=appendDiagramStep(p,f.ids);p=adoptDiagramPose(p,p.steps[2].id,p.steps[2].beforeId,f.result);
  const original=structuredClone(p),copied=duplicateDiagramStep(p,p.steps[1].id,f.ids);
  assert.deepEqual(orientation(copied,2),{side:'back',rotation:90},'a copy keeps the illustrated input view instead of executing its own symbols');
  assert.equal(copied.steps[2].viewMode,'manual');assert.deepEqual(orientation(copied,3),{side:'back',rotation:60});assert.deepEqual(p,original);
  const removed=removeDiagramStep(p,p.steps[1].id);assert.deepEqual(orientation(removed,1),{side:'back',rotation:90},'the removed intermediate rotation is no longer inherited');
  const loaded=importDiagramProject(exportDiagramProject(p));
  assert.deepEqual(loaded.steps.map((_,i)=>orientation(loaded,i)),p.steps.map((_,i)=>orientation(p,i)));
  assert.deepEqual(loaded.steps.map(s=>s.annotations),p.steps.map(s=>s.annotations));
  const synced=resyncDiagramStepViews(loaded);assert.deepEqual(synced.steps.map((_,i)=>orientation(synced,i)),p.steps.map((_,i)=>orientation(p,i)));
  const pending=appendDiagramStep(p,f.ids),roundTrip=importDiagramProject(exportDiagramProject(pending));
  assert.equal(roundTrip.steps[3].pose,null);assert.deepEqual(roundTrip.steps[3].pendingView,pending.steps[3].pendingView);
  for(const change of [
    (q:DiagramProject)=>{q.steps[3].viewMode='manual';q.steps[3].pose=q.steps[2].pose;},
    (q:DiagramProject)=>{q.steps[3].pendingView!.rotation=360;},
    (q:DiagramProject)=>{q.steps[3].pendingView!.rotation=NaN;},
  ]){const invalid=structuredClone(pending);change(invalid);assert.throws(()=>validateDiagramProject(invalid),/视角/);}
});
