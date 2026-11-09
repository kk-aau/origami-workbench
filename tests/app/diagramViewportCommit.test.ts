import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {
  createDiagramProject,appendDiagramStep,adoptDiagramPose,updateDiagramPoseViewport,
  validateDiagramProject,
} from '../../src/app/diagramProject';
import type {ModelViewState} from '../../src/app/modelViewState';

function fixture(){
  let id=0;const ids=()=>`viewport-${++id}`,doc=blankDoc('视口',100,100);
  doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let project=createDiagramProject(doc,ids);
  const stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.states[0].id,computeFlatFold(doc));
  project=appendDiagramStep(project,ids);
  const step=project.steps[0];
  step.viewMode='auto';step.orientationLocked=true;
  step.paperStates={active:'flat',flat:structuredClone(step.pose!)};
  return {project,stepId};
}

const camera=():ModelViewState['cameras']=>({'front-solid':{rotation:0,x:10,y:20,width:80,height:60}});

test('viewport edits preserve geometry, unrelated steps and orientation while synchronizing the active paper snapshot',()=>{
  const {project,stepId}=fixture(),old=structuredClone(project),pose=project.steps[0].pose!,cameras=camera();
  const next=updateDiagramPoseViewport(project,stepId,cameras),step=next.steps[0];
  assert.equal(next.states,project.states);
  assert.equal(next.steps[1],project.steps[1]);
  assert.equal(step.pose!.result,pose.result);assert.equal(step.pose!.sourceDoc,pose.sourceDoc);
  assert.equal(step.pose!.spatial,pose.spatial);assert.equal(step.pose!.paperDeformation,pose.paperDeformation);
  assert.equal(step.viewMode,'auto');assert.equal(step.orientationLocked,true);
  assert.equal(step.paperStates!.flat,step.pose);
  assert.deepEqual(step.pose!.view!.cameras,cameras);
  assert.deepEqual(project,old);
  cameras['front-solid']!.x=999;
  assert.equal(step.pose!.view!.cameras['front-solid']!.x,10);
  validateDiagramProject(next);
  assert.equal(updateDiagramPoseViewport(next,stepId,camera()),next);
});

test('viewport edits reject malformed cameras, absent targets and inconsistent paper states',()=>{
  const {project,stepId}=fixture(),before=structuredClone(project);
  assert.throws(()=>updateDiagramPoseViewport(project,'absent',camera()),/不存在/);
  for(const change of [{width:0},{height:-1},{x:Infinity},{y:NaN},{rotation:360}]){
    const invalid=camera();Object.assign(invalid['front-solid']!,change);
    assert.throws(()=>updateDiagramPoseViewport(project,stepId,invalid),/相机|视图/);
  }
  assert.throws(()=>updateDiagramPoseViewport(project,stepId,{intruder:camera()['front-solid']} as ModelViewState['cameras']),/相机/);
  assert.deepEqual(project,before);
  const damaged=structuredClone(project);damaged.steps[0].paperStates!.flat!.result.geometry.vertices[0][0]+=1;
  assert.throws(()=>updateDiagramPoseViewport(damaged,stepId,camera()),/纸面状态/);
  const missing=structuredClone(project);delete missing.steps[0].paperStates!.flat;
  assert.throws(()=>updateDiagramPoseViewport(missing,stepId,camera()),/纸面状态/);
  const blank=createDiagramProject(blankDoc('空白',100,100));
  assert.throws(()=>updateDiagramPoseViewport(blank,blank.activeStepId,camera()),/先/);
});
