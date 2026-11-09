import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {copyDiagramAnnotations,transformDiagramAnnotations} from '../../src/app/diagramDrawingTools';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {
  createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,updateDiagramCP,updateDiagramPoseResult,
  duplicateDiagramStep,appendDiagramStep,removeDiagramStep,exportDiagramProject,importDiagramProject,validateDiagramProject,
  type DiagramProject,
} from '../../src/app/diagramProject';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';

function fixture(assignment:'M'|'F'='M'){
  const doc=blankDoc('局部撕纸透视',100,100);
  doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment,angle:assignment==='M'?-180:0});
  let sequence=0;const factory=()=>`window-${++sequence}`,empty=createDiagramProject(doc,factory),id=empty.activeStepId,stateId=empty.steps[0].beforeId;
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,2);
  const project=adoptDiagramPose(empty,id,stateId,result);
  return {doc,empty,project,id,stateId,result,factory};
}
const windowSymbol=(faces:number[]=[1],id='tear-window'):DiagramSymbolAnnotation=>({
  id,kind:'symbol',symbol:'tearWindow',position:[25,45],size:32,rotation:17,color:'#293d35',width:.7,cutawayFaces:faces,
});
const targets=(project:DiagramProject,index=0)=>(project.steps[index].annotations!.find(a=>a.kind==='symbol'&&a.symbol==='tearWindow') as DiagramSymbolAnnotation).cutawayFaces;
function withWindow(project:DiagramProject,faces:number[]=[1]):DiagramProject {
  return updateDiagramAnnotations(project,project.activeStepId,[windowSymbol(faces)]);
}

test('cutaway original face IDs survive save and reopen with independent arrays',()=>{
  const {project}=fixture(),drawn=withWindow(project,[1,0]),before=structuredClone(drawn);
  const loaded=importDiagramProject(exportDiagramProject(drawn));
  assert.deepEqual(targets(loaded),[1,0]);assert.deepEqual(drawn,before);
  targets(loaded)!.pop();assert.deepEqual(targets(drawn),[1,0]);
});

test('project validation and annotation commits reject targets outside their actual pose',()=>{
  const {project,empty,id}=fixture(),before=structuredClone(project),invalid=withWindow(project);
  (invalid.steps[0].annotations![0] as DiagramSymbolAnnotation).cutawayFaces=[2];
  assert.throws(()=>validateDiagramProject(invalid),/原纸面范围/);
  assert.throws(()=>importDiagramProject(JSON.stringify(invalid)),/原纸面范围/);
  assert.throws(()=>updateDiagramAnnotations(project,id,[windowSymbol([2])]),/原纸面范围/);
  assert.throws(()=>updateDiagramAnnotations(empty,id,[windowSymbol([0])]),/原纸面范围/);
  assert.doesNotThrow(()=>updateDiagramAnnotations(empty,id,[windowSymbol([])]));
  assert.deepEqual(project,before);
});

test('same-source recalculation and layer reanalysis preserve targets despite paint order changes',()=>{
  const {project,id,stateId,doc,result}=fixture(),drawn=withWindow(project),fresh=computeFlatFold(doc);
  const adopted=adoptDiagramPose(drawn,id,stateId,fresh);
  assert.deepEqual(targets(adopted),[1]);
  const layers=recomputeFlatLayers(result);assert.equal(layers.layers.status,'solved');
  layers.layers.faceOrder=[...layers.layers.faceOrder!].reverse();
  const analysed=updateDiagramPoseResult(adopted,id,layers);
  assert.deepEqual(targets(analysed),[1]);assert.deepEqual(targets(drawn),[1]);
});

test('moved folded coordinates keep original face targets through adopt and result updates',()=>{
  const {project,id,stateId,result}=fixture(),drawn=withWindow(project);
  const moved=moveFoldedVertices(result,{group:[0],selected:[0]},[-15,20]);
  assert.notDeepEqual(moved.geometry.graph!.vertices_coords,result.geometry.graph!.vertices_coords);
  const edited=updateDiagramPoseResult(drawn,id,moved),readopted=adoptDiagramPose(drawn,id,stateId,moved);
  assert.deepEqual(targets(edited),[1]);assert.deepEqual(targets(readopted),[1]);
  assert.doesNotThrow(()=>validateDiagramProject(edited));
});

test('switching to another source state clears the range even with identical CP and face count',()=>{
  const {project,id,result}=fixture(),drawn=withWindow(project),next=adoptDiagramPose(drawn,id,drawn.steps[0].afterId,result);
  assert.deepEqual(targets(next),[]);assert.deepEqual(targets(drawn),[1]);
  assert.deepEqual(next.steps[0].annotations![0],{...drawn.steps[0].annotations![0],cutawayFaces:[]});
});

test('a new source revision requires selecting the range again even when the Doc is identical',()=>{
  const {project,id,stateId,doc,result}=fixture(),drawn=withWindow(project),revised=updateDiagramCP(drawn,stateId,doc);
  assert.deepEqual(targets(revised),[1]);
  assert.deepEqual(targets(adoptDiagramPose(revised,id,stateId,result)),[]);
});

test('a different CP with the same number of paper faces cannot inherit stale face IDs',()=>{
  const {project,id,stateId,doc}=fixture(),drawn=withWindow(project,[0]),changed=structuredClone(doc);
  const crease=changed.segments.find(s=>s.id==='crease')!;crease.a=[0,50];crease.b=[100,50];
  const result=computeFlatFold(changed);assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,2);
  assert.notDeepEqual(result.geometry.faces,project.steps[0].pose!.result.geometry.faces);
  const revised=updateDiagramCP(drawn,stateId,changed),next=adoptDiagramPose(revised,id,stateId,result);
  assert.deepEqual(targets(next),[]);
});

test('changed original face topology clears in-range targets instead of truncating by face count',()=>{
  const {project,id,stateId,doc}=fixture('F'),drawn=withWindow(project,[0]);
  const marks=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(marks.geometry.status,'ready');assert.equal(marks.geometry.faces.length,1);
  const adopted=adoptDiagramPose(drawn,id,stateId,marks),updated=updateDiagramPoseResult(drawn,id,marks);
  assert.deepEqual(targets(adopted),[]);assert.deepEqual(targets(updated),[]);
  assert.doesNotThrow(()=>validateDiagramProject(adopted));assert.doesNotThrow(()=>validateDiagramProject(updated));
});

test('equivalent original topology preserves the range across ordinary and F-mark analysis modes',()=>{
  const {project,id,stateId,doc}=fixture(),drawn=withWindow(project),marks=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(marks.geometry.faces.length,2);
  assert.deepEqual(targets(adoptDiagramPose(drawn,id,stateId,marks)),[1]);
});

test('inactive flat annotation ranges are checked against the flat pose while ordinary styles remain valid',()=>{
  const {project,id,stateId,doc}=fixture('F'),drawn=withWindow(project,[1]),flat=structuredClone(drawn.steps[0].pose!);
  flat.result=computeFlatFold(doc,undefined,{flatCreases:'marks'});flat.displayOrder=flat.result.layers.faceOrder;
  // Legacy caches may use a different F presentation. Each stored range is
  // bound to its own pose, not to whichever cache happens to be active.
  drawn.steps[0].paperStates={active:'pulled',flat,pulled:structuredClone(drawn.steps[0].pose!),flatAnnotations:[windowSymbol([0])]};
  drawn.steps[0].annotations!.push({id:'legacy-styled',kind:'line',a:[0,5],b:[100,5],style:'crease',color:'#123456',width:.7,strokePattern:'dash-dot',foldFaces:[8191]});
  assert.equal(drawn.steps[0].pose!.sourceStateId,stateId);assert.doesNotThrow(()=>validateDiagramProject(drawn));
  const invalid=structuredClone(drawn);(invalid.steps[0].paperStates!.flatAnnotations![0] as DiagramSymbolAnnotation).cutawayFaces=[1];
  assert.throws(()=>validateDiagramProject(invalid),/原纸面范围/);
});

test('paper pulling, switching, duplicate steps and reversible snapshots retain the range',()=>{
  const {project,id,result,factory}=fixture(),drawn=withWindow(project),snapshot=structuredClone(drawn),previous=drawn.steps[0].pose!;
  const moved=moveFoldedVertices(result,{group:[0],selected:[0]},[-15,20]);
  const pulled=recordDiagramPaperPull(updateDiagramPoseResult(drawn,id,moved),id,previous,drawn.steps[0].annotations);
  const flat=switchDiagramPaperState(pulled,id,'flat'),again=switchDiagramPaperState(flat,id,'pulled');
  for(const item of [pulled,flat,again])assert.deepEqual(targets(item),[1]);
  const copied=duplicateDiagramStep(again,id,factory);assert.deepEqual(targets(copied,1),[1]);
  assert.notEqual(targets(copied,0),targets(copied,1));
  const deleted=updateDiagramAnnotations(again,id,[]);assert.equal(deleted.steps[0].annotations!.length,0);
  assert.deepEqual(targets(snapshot),[1]);assert.deepEqual(drawn,snapshot);
  const next=appendDiagramStep(drawn,factory);assert.deepEqual(next.steps[1].annotations,[]);
});

test('copy, mirror and rotate preserve independent target arrays with their symbol artwork',()=>{
  const annotations=[windowSymbol([0,1])],copied=copyDiagramAnnotations(annotations,['tear-window'],[10,5]);
  assert.equal(copied.annotations.length,2);
  const copy=copied.annotations[1] as DiagramSymbolAnnotation;assert.deepEqual(copy.cutawayFaces,[0,1]);assert.notEqual(copy.cutawayFaces,annotations[0].cutawayFaces);
  for(const transform of [{kind:'rotate',center:[0,0],angle:90},{kind:'mirror',axis:'x',center:[0,0]}] as const){
    const transformed=transformDiagramAnnotations(annotations,['tear-window'],transform);
    assert.deepEqual((transformed[0] as DiagramSymbolAnnotation).cutawayFaces,[0,1]);
    assert.notEqual((transformed[0] as DiagramSymbolAnnotation).cutawayFaces,annotations[0].cutawayFaces);
  }
});

test('removing a source without an exact replacement keeps window artwork but clears its obsolete range',()=>{
  const {project,factory,doc,result}=fixture();let next=appendDiagramStep(project,factory);
  const sourceId=next.steps[0].afterId,changed=structuredClone(doc);changed.name='独有来源';next=updateDiagramCP(next,sourceId,changed);
  next=adoptDiagramPose(next,next.steps[1].id,sourceId,result);next=withWindow(next);
  const removed=removeDiagramStep(next,next.steps[0].id);
  assert.equal(removed.steps[0].pose,null);assert.deepEqual(targets(removed),[]);assert.doesNotThrow(()=>validateDiagramProject(removed));
});
