import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,updateDiagramImages,adoptDiagramPose,updateDiagramPoseView,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {insertDiagramImage} from '../../src/app/diagramImageInsert';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {initializeDiagramPaperStates} from '../../src/app/diagramPaperState';

const input={name:'成品图',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',pixelWidth:1,pixelHeight:1,source:'file' as const};
test('image placement fits paper, becomes primary artwork, preserves CPs and source project',()=>{
  const project=createDiagramProject(blankDoc('图片',200,100)),snapshot=structuredClone(project);
  const result=insertDiagramImage(project,project.activeStepId,input,'photo');
  assert.deepEqual(project,snapshot);assert.deepEqual(result.project.states,project.states);
  assert.equal(result.image.width,100);assert.equal(result.image.height,100);
  assert.equal(result.project.steps[0].paperVisible,false);assert.equal(result.project.steps[0].images?.[0].id,'photo');
});
test('additional images retain explicit paper visibility and bounded counts reject atomically',()=>{
  const original=createDiagramProject(blankDoc('图片',200,100));
  let current=insertDiagramImage(original,original.activeStepId,input,'first').project;
  current=updateDiagramImages(current,current.activeStepId,current.steps[0].images!,true);
  const next=insertDiagramImage(current,current.activeStepId,input,'second');
  assert.equal(next.project.steps[0].paperVisible,true);assert.equal(next.project.steps[0].images?.length,2);
  assert.deepEqual(next.image.position,current.steps[0].images![0].position.map(value=>value+8));
  for(let i=2;i<16;i++)current=insertDiagramImage(current,current.activeStepId,input,`image-${i}`).project;
  // current holds the first image plus fourteen additions.
  current=insertDiagramImage(current,current.activeStepId,input,'sixteenth').project;
  const before=structuredClone(current);
  assert.throws(()=>insertDiagramImage(current,current.activeStepId,input,'overflow'),/16/);
  assert.deepEqual(current,before);
  assert.throws(()=>insertDiagramImage(current,'missing',input,'missing'),/目标步骤/);
});

test('inserting from an overview fits images while keeping active flat or pulled snapshots consistent',()=>{
  let base=createDiagramProject(blankDoc('造型步骤',200,100));
  base=adoptDiagramPose(base,base.activeStepId,base.steps[0].beforeId,computeFlatFold(base.states[0].doc));
  base=updateDiagramPoseView(base,base.activeStepId,{...defaultModelView(),cameras:{'front-solid':{x:500,y:700,width:5,height:8,rotation:0}}});
  for(const active of ['flat','pulled'] as const){
    const pose=base.steps[0].pose!,original=initializeDiagramPaperStates(base,base.activeStepId,pose,pose,active);
    const snapshot=structuredClone(original),result=insertDiagramImage(original,original.activeStepId,input,'art').project;
    const restored=importDiagramProject(exportDiagramProject(result)),step=restored.steps[0];
    assert.deepEqual(step.pose?.view?.cameras,{});assert.deepEqual(step.pose,step.paperStates?.[active]);
    assert.equal(step.paperStates?.active,active);assert.deepEqual(original,snapshot);
    assert.deepEqual(result.states,original.states);
  }
});
