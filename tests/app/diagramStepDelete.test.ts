import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {defaultModelView} from '../../src/app/modelViewState';
import {
  createDiagramProject,appendDiagramStep,selectDiagramStep,removeDiagramStep,
  updateDiagramCP,adoptDiagramPose,updateDiagramPoseResult,updateDiagramFoldLink,
  exportDiagramProject,importDiagramProject,validateDiagramProject,validateDiagramFoldLink,
  type DiagramProject,
} from '../../src/app/diagramProject';
import type {DiagramFoldLinkSettings} from '../../src/app/diagramFoldLinkTypes';

function fixture(count=3) {
  let id=0;const factory=()=>`delete-${++id}`;
  const doc=blankDoc('原始纸面',100,100);
  doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let project=createDiagramProject(doc,factory);
  for(let i=1;i<count;i++)project=appendDiagramStep(project,factory);
  return {project,doc};
}
function valid(project:DiagramProject) {
  assert.equal(project.states.length,project.steps.length+1);
  project.steps.forEach((step,index)=>{
    assert.equal(step.beforeId,project.states[index].id);
    assert.equal(step.afterId,project.states[index+1].id);
  });
  assert.doesNotThrow(()=>validateDiagramProject(project));
  assert.doesNotThrow(()=>importDiagramProject(exportDiagramProject(project)));
}
function link(project:DiagramProject,stateId=project.states[1].id):DiagramFoldLinkSettings {
  return {enabled:true,layers:'selected',selectedFaces:[0],
    fixed:{point:[25,50],matrix:[1,0,0,1,0,0],target:{stateId,kind:'vertex',point:[0,0]}},
    generated:[{id:'owned-crease',a:[0,50],b:[100,50],assignment:'V',angle:180}]};
}

for(const index of [0,1,2])test(`deleting ${['first','middle','last'][index]} active step keeps its before boundary and N + 1 states`,()=>{
  let {project}=fixture();const removed=project.steps[index];
  project=selectDiagramStep(project,removed.id);const before=structuredClone(project);
  const next=removeDiagramStep(project,removed.id);valid(next);
  assert.equal(next.steps.length,2);
  assert.deepEqual(next.states,before.states.filter(state=>state.id!==removed.afterId));
  assert.equal(next.activeStepId,before.steps[index===2?1:index+1].id);
  assert.deepEqual(next.steps.map(step=>step.id),before.steps.filter(step=>step.id!==removed.id).map(step=>step.id));
  if(index<2)assert.equal(next.steps[index].beforeId,removed.beforeId);
  assert.deepEqual(project,before);
  assert.equal(next.states[0],project.states[0],'unchanged CP is shared by immutable history snapshots');
  const edited=updateDiagramCP(next,next.states[0].id,{...next.states[0].doc,name:'删除后的独立副本'});
  assert.equal(edited.states[0].doc.name,'删除后的独立副本');assert.deepEqual(project,before);
});

test('deleting another step keeps the active step, titles, captions, drawings and canvas preferences',()=>{
  let {project}=fixture();project=selectDiagramStep(project,project.steps[2].id);
  project.steps[2].title='保留标题';project.steps[2].description='保留说明';
  project.steps[2].annotations=[{id:'arrow',kind:'line',a:[1,2],b:[3,4],style:'valley',width:.7,color:'#112233'}];
  project.steps[2].canvas!.gridSpacing=7;
  const original=structuredClone(project.steps[2]),next=removeDiagramStep(project,project.steps[0].id);
  valid(next);assert.equal(next.activeStepId,original.id);assert.deepEqual(next.steps[1],original);
});

test('the final step and unknown step reject atomically with an explicit error',()=>{
  const {project}=fixture(1),before=structuredClone(project);
  assert.throws(()=>removeDiagramStep(project,project.steps[0].id),/至少需要保留一个步骤/);
  assert.throws(()=>removeDiagramStep(project,'unknown'),/不存在/);
  assert.deepEqual(project,before);
});

test('an exact equivalent retained CP preserves moved model geometry and view while truthfully rebinding source revision',()=>{
  let {project,doc}=fixture();const removed=project.steps[1],target=project.steps[2];
  project=updateDiagramCP(project,project.states[1].id,doc);
  project=updateDiagramCP(project,project.states[1].id,doc);
  const result=computeFlatFold(doc),view={...defaultModelView(),rotation:90,xray:true};
  project=adoptDiagramPose(project,target.id,removed.afterId,result,view);
  project=updateDiagramPoseResult(project,target.id,moveFoldedVertices(result,{group:[0],selected:[0]},[-7,9]));
  const oldPose=structuredClone(project.steps[2].pose!),next=removeDiagramStep(project,removed.id);
  valid(next);const pose=next.steps[1].pose!;
  assert.equal(pose.sourceStateId,removed.beforeId);assert.equal(pose.sourceRevision,2);
  assert.deepEqual(pose.sourceDoc,oldPose.sourceDoc);assert.deepEqual(pose.result,oldPose.result);
  assert.deepEqual(pose.view,view);assert.deepEqual(pose.displayOrder,oldPose.displayOrder);
  const reopened=importDiagramProject(exportDiagramProject(next));
  assert.equal(reopened.steps[1].pose!.sourceStateId,removed.beforeId);
  assert.deepEqual(reopened.steps[1].pose!.result.geometry.vertices[0],[-7,9]);
});

test('stale snapshot is rebound using its actual source Doc rather than the removed state current Doc',()=>{
  let {project,doc}=fixture();const removed=project.steps[1],target=project.steps[2];
  project=adoptDiagramPose(project,target.id,removed.afterId,computeFlatFold(doc));
  const changed=structuredClone(doc);changed.name='删除状态的新修订';
  project=updateDiagramCP(project,removed.afterId,changed);
  const next=removeDiagramStep(project,removed.id);valid(next);
  assert.equal(next.steps[1].pose!.sourceStateId,removed.beforeId);
  assert.equal(next.steps[1].pose!.sourceRevision,0);
  assert.deepEqual(next.steps[1].pose!.sourceDoc,doc);
});

test('all distant poses referencing a removed CP use any exact retained equivalent without touching unrelated poses',()=>{
  let {project,doc}=fixture(4);const removed=project.steps[1];
  const changed=structuredClone(doc);changed.name='不同的保留前界';
  project=updateDiagramCP(project,removed.beforeId,changed);
  for(const index of [0,2,3])project=adoptDiagramPose(project,project.steps[index].id,removed.afterId,computeFlatFold(doc));
  const snapshot=structuredClone(project),next=removeDiagramStep(project,removed.id);valid(next);
  for(const step of next.steps){
    assert.equal(step.pose!.sourceStateId,snapshot.states[0].id);
    assert.deepEqual(step.pose!.sourceDoc,doc);
  }
  assert.deepEqual(project,snapshot);
});

test('without an equivalent retained CP remove unavailable poses but preserve artwork, ownership ledger and unaffected snapshots',()=>{
  let {project,doc}=fixture();const removed=project.steps[1],target=project.steps[2];
  const unique=structuredClone(doc);unique.name='仅属于被删 CP 的来源';
  project=updateDiagramCP(project,removed.afterId,unique);
  project=adoptDiagramPose(project,target.id,removed.afterId,computeFlatFold(unique));
  project=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,computeFlatFold(doc));
  project=updateDiagramFoldLink(project,target.id,link(project,removed.afterId));
  project.steps[2].annotations=[{id:'line',kind:'line',a:[10,20],b:[30,40],style:'valley',width:.7,color:'#293d35',foldFaces:[1]}];
  const snapshot=structuredClone(project),next=removeDiagramStep(project,removed.id);valid(next);
  assert.equal(next.steps[1].pose,null);
  assert.deepEqual(next.steps[1].annotations,snapshot.steps[2].annotations);
  assert.deepEqual(next.steps[1].canvas,snapshot.steps[2].canvas);
  assert.deepEqual(next.steps[1].foldLink,{enabled:true,layers:'selected',selectedFaces:[],generated:snapshot.steps[2].foldLink!.generated});
  assert.deepEqual(next.steps[0].pose,snapshot.steps[0].pose);assert.deepEqual(project,snapshot);
  const reopened=importDiagramProject(exportDiagramProject(next));
  assert.equal(reopened.steps[1].pose,null);assert.deepEqual(reopened.steps[1].annotations,snapshot.steps[2].annotations);
});

test('CPs with identical segments but different metadata are not treated as equivalent snapshot sources',()=>{
  let {project,doc}=fixture();const removed=project.steps[0],target=project.steps[1];
  const unique=structuredClone(doc);unique.name='不同来源名';
  project=updateDiagramCP(project,removed.afterId,unique);
  project=adoptDiagramPose(project,target.id,removed.afterId,computeFlatFold(unique));
  const next=removeDiagramStep(project,removed.id);valid(next);assert.equal(next.steps[0].pose,null);
});

test('a removed UI fixed target is discarded without discarding a surviving pose or its valid anchor',()=>{
  let {project,doc}=fixture();const removed=project.steps[1],target=project.steps[0];
  project=adoptDiagramPose(project,target.id,target.beforeId,computeFlatFold(doc));
  project=updateDiagramFoldLink(project,target.id,link(project,removed.afterId));
  const next=removeDiagramStep(project,removed.id);valid(next);
  assert.deepEqual(next.steps[0].foldLink!.fixed,{point:[25,50],matrix:[1,0,0,1,0,0]});
  assert.deepEqual(next.steps[0].pose,project.steps[0].pose);
  assert.deepEqual(next.steps[0].foldLink!.selectedFaces,[0]);
  assert.equal(project.steps[0].foldLink!.fixed!.target!.stateId,removed.afterId);
});

test('deletion creates complete independent history frames that reopen for undo and redo',()=>{
  let {project,doc}=fixture();
  project=adoptDiagramPose(project,project.steps[2].id,project.states[2].id,computeFlatFold(doc));
  const before=exportDiagramProject(project),deleted=removeDiagramStep(project,project.steps[1].id),after=exportDiagramProject(deleted);
  const undo=importDiagramProject(before),redo=importDiagramProject(after);valid(undo);valid(redo);
  assert.deepEqual(undo.states,project.states);assert.equal(undo.steps.length,3);assert.equal(undo.activeStepId,project.activeStepId);
  assert.deepEqual(redo.states,deleted.states);assert.equal(redo.steps.length,2);assert.equal(redo.activeStepId,deleted.activeStepId);
  assert.equal(redo.steps[1].pose!.sourceStateId,deleted.states[1].id);
  redo.states[0].doc.name='重做副本';assert.notEqual(undo.states[0].doc.name,redo.states[0].doc.name);
});

test('face and vertex fixed selection targets save and reopen alongside the interior anchor seed',()=>{
  const {project}=fixture();
  for(const kind of ['face','vertex'] as const){
    const settings=link(project);settings.fixed!.target!.kind=kind;settings.fixed!.target!.point=[0,100];
    const updated=updateDiagramFoldLink(project,project.steps[0].id,settings),reopened=importDiagramProject(exportDiagramProject(updated));
    assert.deepEqual(reopened.steps[0].foldLink,settings);
    assert.deepEqual(reopened.steps[0].foldLink!.fixed!.point,[25,50]);
  }
  const legacy=link(project);delete legacy.fixed!.target;
  assert.doesNotThrow(()=>validateDiagramFoldLink(legacy));
});

test('fixed selection targets strictly reject incomplete, unknown, nonfinite and out of range fields',()=>{
  const {project}=fixture(),settings=link(project);
  const invalid:unknown[]=[undefined,null,{},
    {stateId:'',kind:'face',point:[0,0]},
    {stateId:' \t',kind:'face',point:[0,0]},
    {stateId:project.states[0].id,kind:'line',point:[0,0]},
    {stateId:project.states[0].id,kind:'face',point:[0]},
    {stateId:project.states[0].id,kind:'face',point:[Infinity,0]},
    {stateId:project.states[0].id,kind:'vertex',point:[0,NaN]},
    {stateId:project.states[0].id,kind:'vertex',point:[0,1_000_001]},
    {stateId:project.states[0].id,kind:'vertex',point:[0,0],face:0},
  ];
  for(const target of invalid){
    const candidate=structuredClone(settings);(candidate.fixed as any).target=target;
    assert.throws(()=>validateDiagramFoldLink(candidate));
  }
});
