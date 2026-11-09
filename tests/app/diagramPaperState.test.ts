import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,distance} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {defaultModelView} from '../../src/app/modelViewState';
import {followDiagramPaperAnnotations} from '../../src/app/diagramPaperFollow';
import {retainDiagramPaperStates,recordDiagramPaperPull,switchDiagramPaperState,initializeDiagramPaperStates,isDiagramPaperPulled,isDiagramPaperPoseIsometric} from '../../src/app/diagramPaperState';
import {reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing,isLinkedFoldLine} from '../../src/app/diagramFoldTransactions';
import {
  createDiagramProject,adoptDiagramPose,updateDiagramPoseResult,updateDiagramPoseView,updateDiagramPoseDisplayOrder,updateDiagramAnnotations,updateDiagramFoldLink,
  updateDiagramCP,appendDiagramStep,duplicateDiagramStep,removeDiagramStep,exportDiagramProject,importDiagramProject,validateDiagramProject,
  type DiagramProject,type DiagramPose,
} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {isDiagramCPExistingLine} from '../../src/app/diagramAnnotations';
import {materialSlitFixture} from '../fixtures/materialModel';
const line=(id='mark',a:[number,number]=[5,50],b:[number,number]=[95,50]):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'crease',color:'#123456',width:1.25});
const symbol:DiagramSymbolAnnotation={id:'symbol',kind:'symbol',symbol:'fold',position:[80,10],size:35,rotation:15,color:'#123456',width:.7};
function fixture(){
  const doc=blankDoc('平整与扯角',100,100);let id=0;const factory=()=>`paper-${++id}`;
  let project=createDiagramProject(doc,factory),step=project.steps[0];project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc),defaultModelView());
  project=updateDiagramAnnotations(project,step.id,[line(),symbol]);return {project,id:step.id,factory};
}
function pull(project:DiagramProject,stepId:string,destination:[number,number]=[120,-20]):DiagramProject {
  const step=project.steps.find(s=>s.id===stepId)!,previous=step.pose!,oldAnnotations=step.annotations!,graph=buildFold(previous.sourceDoc).graph,index=graph.vertices_coords.findIndex(p=>distance(p,[100,0])<1e-7);
  const result=moveFoldedVertices(previous.result,{group:[index],selected:[index]},destination);
  let next=updateDiagramPoseResult(project,stepId,result),pose=next.steps.find(s=>s.id===stepId)!.pose!;
  const ordinary=oldAnnotations.filter(a=>!step.foldLink?.enabled||!isLinkedFoldLine(a)||a.foldFaces?.length===0);next=updateDiagramAnnotations(next,stepId,followDiagramPaperAnnotations(previous,pose,ordinary));
  if(step.foldLink?.enabled)next=refreshDiagramFoldDrawing(next,stepId);
  return recordDiagramPaperPull(next,stepId,previous,oldAnnotations);
}

test('first pull archives the exact pre-drag flat pose and annotations in one immutable transaction',()=>{
  const {project,id}=fixture(),before=structuredClone(project),pulled=pull(project,id),step=pulled.steps[0];
  assert.equal(step.paperStates?.active,'pulled');assert.ok(isDiagramPaperPulled(step));assert.deepEqual(step.pose,step.paperStates!.pulled);
  assert.deepEqual(step.paperStates!.flat,project.steps[0].pose);assert.deepEqual(step.paperStates!.flatAnnotations,project.steps[0].annotations);
  assert.deepEqual(pulled.states,project.states);assert.deepEqual(project,before);assert.doesNotThrow(()=>validateDiagramProject(pulled));
});

test('repeated switches preserve the flat IDs and coordinates without accumulating split or overlapping lines',()=>{
  const {project,id}=fixture();let current=pull(project,id),pulledVertices=structuredClone(current.steps[0].pose!.result.geometry.vertices);
  for(let i=0;i<10;i++){
    current=switchDiagramPaperState(current,id,'flat');assert.equal(isDiagramPaperPulled(current.steps[0]),false);assert.deepEqual(current.steps[0].annotations,project.steps[0].annotations);
    current=switchDiagramPaperState(current,id,'pulled');assert.deepEqual(current.steps[0].pose!.result.geometry.vertices,pulledVertices);assert.equal(current.steps[0].annotations!.filter(a=>a.kind==='line').length,2);
  }
  assert.deepEqual(current.states,project.states);
});

test('new flat construction lines follow the saved pulled pose and return to their exact flat coordinates',()=>{
  const {project,id}=fixture();let current=switchDiagramPaperState(pull(project,id),id,'flat');const added=line('new-flat',[70,10],[90,10]);
  current=updateDiagramAnnotations(current,id,[...current.steps[0].annotations!,added]);const flat=structuredClone(current.steps[0].annotations);
  current=switchDiagramPaperState(current,id,'pulled');const moved=current.steps[0].annotations!.find(a=>a.id===added.id) as DiagramLineAnnotation;
  assert.ok(moved.a[0]>added.a[0]);assert.deepEqual(moved.foldFaces,[0]);current=switchDiagramPaperState(current,id,'flat');assert.deepEqual(current.steps[0].annotations,flat);
});

test('independent symbol edits survive returning to the flat drawing',()=>{
  const {project,id}=fixture();let current=pull(project,id);current=updateDiagramAnnotations(current,id,current.steps[0].annotations!.map(a=>a.id===symbol.id?{...symbol,position:[130,30],rotation:65}:a));
  current=switchDiagramPaperState(current,id,'flat');assert.deepEqual(current.steps[0].annotations!.find(a=>a.id===symbol.id),{...symbol,position:[130,30],rotation:65});
});

test('subsequent pulls update only the saved pulled geometry and keep the original flat frame',()=>{
  const {project,id}=fixture(),first=pull(project,id),second=pull(first,id,[130,-30]);
  assert.deepEqual(second.steps[0].paperStates!.flat,first.steps[0].paperStates!.flat);assert.deepEqual(second.steps[0].paperStates!.flatAnnotations,first.steps[0].paperStates!.flatAnnotations);
  const flat=switchDiagramPaperState(second,id,'flat'),again=switchDiagramPaperState(flat,id,'pulled');assert.deepEqual(again.steps[0].pose,second.steps[0].pose);
});

test('linked CP creases reproject in both modes without changing CP content or revisions',()=>{
  let {project,id}=fixture();project=updateDiagramFoldLink(project,id,{enabled:true,layers:'all',selectedFaces:[],fixed:{point:[20,20],matrix:[1,0,0,1,0,0]}});
  const fold:DiagramLineAnnotation={...line('fold',[0,40],[100,40]),style:'valley'};project=reconcileDiagramFoldAnnotations(project,id,[...project.steps[0].annotations!,fold]);
  const states=structuredClone(project.states),pulled=pull(project,id),flat=switchDiagramPaperState(pulled,id,'flat'),again=switchDiagramPaperState(flat,id,'pulled');
  for(const current of [pulled,flat,again]){assert.deepEqual(current.states,states);assert.ok(current.steps[0].annotations!.some(isLinkedFoldLine));}
  assert.deepEqual(flat.steps[0].foldLink!.fixed,project.steps[0].foldLink!.fixed);assert.deepEqual(flat.steps[0].annotations!.filter(a=>a.kind==='line'&&!isLinkedFoldLine(a)),project.steps[0].annotations!.filter(a=>a.kind==='line'&&!isLinkedFoldLine(a)));
  assert.ok(again.steps[0].annotations!.filter(isLinkedFoldLine).some(a=>a.a[1]!==40||a.b[1]!==40));
});

test('linked crease paint and timing survive a pull and repeated state switches without restoring stale geometry',()=>{
  let {project,id}=fixture();project=updateDiagramFoldLink(project,id,{enabled:true,layers:'all',selectedFaces:[]});
  const custom:DiagramLineAnnotation={...line('custom',[0,40],[100,40]),style:'valley',color:'#bb2266',width:2,strokePattern:'dotted',appearanceOverrides:['color','width','strokePattern']};
  const follower:DiagramLineAnnotation={...custom,id:'follower',a:[0,65],b:[100,65],animationTiming:{afterLineId:'custom',startAfter:.5}};
  project=reconcileDiagramFoldAnnotations(project,id,[...project.steps[0].annotations!,custom,follower]);
  const states=structuredClone(project.states),previous=project.steps[0].pose!,vertex=buildFold(previous.sourceDoc).graph.vertices_coords.findIndex(p=>distance(p,[100,0])<1e-7);
  let current=updateDiagramPoseResult(project,id,moveFoldedVertices(previous.result,{group:[vertex],selected:[vertex]},[120,-20]));
  current=updateDiagramAnnotations(current,id,followDiagramPaperAnnotations(previous,current.steps[0].pose!,project.steps[0].annotations!));
  current=recordDiagramPaperPull(refreshDiagramFoldDrawing(current,id),id,previous,project.steps[0].annotations!);
  for(const active of ['flat','pulled','flat'] as const){
    current=switchDiagramPaperState(current,id,active);const folds=current.steps[0].annotations!.filter(isLinkedFoldLine);
    assert.ok(folds.length>=2);assert.ok(folds.every(a=>a.color===custom.color&&a.width===custom.width&&a.strokePattern===custom.strokePattern));
    assert.ok(folds.every(a=>JSON.stringify(a.appearanceOverrides)===JSON.stringify(custom.appearanceOverrides)));
    const timed=folds.filter(a=>a.animationTiming);assert.ok(timed.length);assert.ok(timed.every(a=>a.animationTiming!.startAfter===.5&&folds.some(other=>other.id===a.animationTiming!.afterLineId)));
    if(active==='flat')assert.ok(folds.every(a=>[40,65].includes(a.a[1])&&a.a[1]===a.b[1]));
    else assert.ok(folds.some(a=>a.a[1]!==a.b[1]));
    assert.deepEqual(current.states,states);
  }
});

test('inherited F creases reproject once per paper state and are never restored from ordinary flat artwork',()=>{
  const doc=blankDoc('继承预折痕',100,100);doc.segments.push({id:'existing-F',a:[0,40],b:[100,40],assignment:'F',angle:0});
  let sequence=0,project=createDiagramProject(doc,()=>`existing-${++sequence}`);const id=project.steps[0].id;
  project=adoptDiagramPose(project,id,project.steps[0].beforeId,computeFlatFold(doc),defaultModelView());
  project=updateDiagramFoldLink(project,id,{enabled:true,layers:'all',selectedFaces:[]});project=updateDiagramAnnotations(project,id,[line('illustration'),symbol]);project=refreshDiagramFoldDrawing(project,id);
  const flatCreases=project.steps[0].annotations!.filter(isDiagramCPExistingLine);assert.ok(flatCreases.length>0);
  const states=structuredClone(project.states);let current=pull(project,id),pulledCreases=structuredClone(current.steps[0].annotations!.filter(isDiagramCPExistingLine));
  for(let i=0;i<4;i++){
    assert.equal(current.steps[0].paperStates!.flatAnnotations!.filter(isDiagramCPExistingLine).length,0);
    current=switchDiagramPaperState(current,id,'flat');assert.deepEqual(current.steps[0].annotations!.filter(isDiagramCPExistingLine),flatCreases);
    current=switchDiagramPaperState(current,id,'pulled');assert.deepEqual(current.steps[0].annotations!.filter(isDiagramCPExistingLine),pulledCreases);
    assert.deepEqual(current.states,states);assert.ok(current.steps[0].annotations!.some(a=>a.id===symbol.id));
  }
});

test('explicitly dormant mountain and valley drawing handles survive both paper modes',()=>{
  let {project,id}=fixture();project=updateDiagramFoldLink(project,id,{enabled:true,layers:'selected',selectedFaces:[]});
  const dormant:DiagramLineAnnotation={...line('no-material',[10,20],[30,20]),style:'valley',foldFaces:[]};
  project=updateDiagramAnnotations(project,id,[...project.steps[0].annotations!,dormant]);const states=structuredClone(project.states),pulled=pull(project,id),flat=switchDiagramPaperState(pulled,id,'flat'),again=switchDiagramPaperState(flat,id,'pulled');
  for(const current of [pulled,flat,again]){assert.deepEqual(current.steps[0].annotations!.find(a=>a.id===dormant.id),dormant);assert.deepEqual(current.states,states);}
});

test('save and import preserve explicit modes even though both restored geometries have modified flags',()=>{
  const {project,id}=fixture(),pulled=importDiagramProject(exportDiagramProject(pull(project,id))),states=pulled.steps[0].paperStates!;
  assert.equal(states.flat.result.geometry.modified,true);assert.equal(states.pulled.result.geometry.modified,true);assert.ok(isDiagramPaperPulled(pulled.steps[0]));
  const flat=switchDiagramPaperState(pulled,id,'flat'),restored=importDiagramProject(exportDiagramProject(flat));assert.equal(restored.steps[0].paperStates!.active,'flat');assert.equal(isDiagramPaperPulled(restored.steps[0]),false);
  assert.deepEqual(restored.steps[0].annotations,project.steps[0].annotations);assert.deepEqual(restored.steps[0].pose,restored.steps[0].paperStates!.flat);
  const again=switchDiagramPaperState(restored,id,'pulled');assert.deepEqual(again.steps[0].pose!.result.geometry.vertices,states.pulled.result.geometry.vertices);
});

test('legacy restored isometric models stay flat while actual deformation is detected without relying on modified',()=>{
  const {project,id}=fixture(),restored=importDiagramProject(exportDiagramProject(project));assert.equal(restored.steps[0].pose!.result.geometry.modified,true);assert.equal(isDiagramPaperPulled(restored.steps[0]),false);
  const actual=pull(project,id),legacy=structuredClone(actual);delete legacy.steps[0].paperStates;delete legacy.steps[0].pose!.result.geometry.modified;
  assert.ok(isDiagramPaperPulled(legacy.steps[0]));assert.equal(isDiagramPaperPoseIsometric(legacy.steps[0].pose!),false);
  const archived=initializeDiagramPaperStates(legacy,id,project.steps[0].pose!,legacy.steps[0].pose!,'pulled',project.steps[0].annotations);
  assert.deepEqual(switchDiagramPaperState(archived,id,'flat').steps[0].pose,project.steps[0].pose);
});

test('legacy flat initialization replaces the displayed pulled marks with supplied flat marks',()=>{
  const {project,id}=fixture(),pulled=pull(project,id),legacy=structuredClone(pulled),flatPose=project.steps[0].pose!,flatMarks=project.steps[0].annotations!;delete legacy.steps[0].paperStates;
  const prepared=updateDiagramPoseResult(legacy,id,flatPose.result),archived=initializeDiagramPaperStates(prepared,id,flatPose,legacy.steps[0].pose!,'flat',flatMarks);
  assert.deepEqual(archived.steps[0].annotations,flatMarks);assert.deepEqual(archived.steps[0].pose,flatPose);assert.deepEqual(archived.steps[0].paperStates!.flatAnnotations,flatMarks);
  assert.deepEqual(switchDiagramPaperState(archived,id,'pulled').steps[0].pose!.result.geometry.vertices,legacy.steps[0].pose!.result.geometry.vertices);
});

test('independent cut-material faces are checked by identity rather than rejected as pulled',()=>{
  const {source,result}=materialSlitFixture(),pose:DiagramPose={sourceStateId:'cut',sourceRevision:0,sourceDoc:source,result};assert.ok(isDiagramPaperPoseIsometric(pose));
  const moved=structuredClone(pose);moved.result.geometry.vertices[0][0]+=25;assert.equal(isDiagramPaperPoseIsometric(moved),false);
});

test('view, result and display-order updates synchronize the active snapshot without overwriting the inactive one',()=>{
  const {project,id}=fixture();let current=pull(project,id),inactive=structuredClone(current.steps[0].paperStates!.flat);
  current=updateDiagramPoseView(current,id,{...defaultModelView(),side:'back',rotation:27});assert.deepEqual(current.steps[0].paperStates!.pulled,current.steps[0].pose);assert.deepEqual(current.steps[0].paperStates!.flat,inactive);
  current=updateDiagramPoseDisplayOrder(current,id,[0]);assert.deepEqual(current.steps[0].paperStates!.pulled,current.steps[0].pose);
  const changed=structuredClone(current.steps[0].pose!.result);changed.layers.message='reanalysed';current=updateDiagramPoseResult(current,id,changed);assert.deepEqual(current.steps[0].paperStates!.pulled,current.steps[0].pose);assert.deepEqual(current.steps[0].paperStates!.flat,inactive);
});

test('duplicating keeps both independent snapshots with their actual calculation source',()=>{
  const {project,id,factory}=fixture(),pulled=pull(project,id),copy=duplicateDiagramStep(pulled,id,factory),step=copy.steps[1];
  assert.deepEqual(step.paperStates,pulled.steps[0].paperStates);assert.equal(step.paperStates!.flat.sourceStateId,project.steps[0].beforeId);
  step.paperStates!.flat.result.geometry.vertices[0][0]-=30;assert.notDeepEqual(step.paperStates,copy.steps[0].paperStates);assert.deepEqual(pulled.steps[0].paperStates,copy.steps[0].paperStates);
});

test('deleting a source boundary rebinds both snapshots only when a matching real CP remains',()=>{
  const {project,factory}=fixture();let two=appendDiagramStep(project,factory),second=two.steps[1];two=adoptDiagramPose(two,second.id,second.beforeId,computeFlatFold(two.states[1].doc));
  two=updateDiagramAnnotations(two,second.id,[line()]);two=pull(two,second.id);const removed=removeDiagramStep(two,two.steps[0].id),step=removed.steps[0];
  assert.equal(step.pose!.sourceStateId,removed.states[0].id);assert.equal(step.paperStates!.flat.sourceStateId,removed.states[0].id);assert.equal(step.paperStates!.pulled.sourceStateId,removed.states[0].id);assert.doesNotThrow(()=>validateDiagramProject(removed));
});

test('a removed unique source clears both snapshots while leaving the drawing intact',()=>{
  const {project,factory}=fixture();let two=appendDiagramStep(project,factory),second=two.steps[1],doc=structuredClone(two.states[1].doc);doc.segments.push({id:'unique-fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  two=updateDiagramCP(two,second.beforeId,doc);two=adoptDiagramPose(two,second.id,second.beforeId,computeFlatFold(doc));
  const previous=two.steps[1].pose!,next=structuredClone(previous);next.result.geometry.vertices[0][0]-=10;
  two=updateDiagramPoseResult(two,second.id,next.result);two=recordDiagramPaperPull(two,second.id,previous,[]);const removed=removeDiagramStep(two,two.steps[0].id);
  assert.equal(removed.steps[0].pose,null);assert.equal(removed.steps[0].paperStates,undefined);assert.deepEqual(removed.steps[0].annotations,two.steps[1].annotations);
});

test('adopting a fresh result discards old alternate geometry and stale sources refuse mode switches',()=>{
  const {project,id}=fixture(),pulled=pull(project,id),fresh=adoptDiagramPose(pulled,id,pulled.steps[0].beforeId,computeFlatFold(pulled.states[0].doc));assert.equal(fresh.steps[0].paperStates,undefined);
  const changed=structuredClone(pulled.states[0].doc);changed.name='new revision';const stale=updateDiagramCP(pulled,pulled.states[0].id,changed);
  assert.throws(()=>switchDiagramPaperState(stale,id,'flat'),/来源 CP 已更新/);assert.throws(()=>initializeDiagramPaperStates(stale,id,project.steps[0].pose!,pulled.steps[0].pose!,'flat'),/来源 CP 已更新/);
});

test('state schema rejects unknown fields, inconsistent active snapshots and different source identities',()=>{
  const {project,id}=fixture(),pulled=pull(project,id);
  const invalid=structuredClone(pulled);invalid.steps[0].paperStates!.active='flat';assert.throws(()=>validateDiagramProject(invalid),/当前纸面状态/);
  const extra=JSON.parse(exportDiagramProject(pulled));extra.steps[0].paperStates.guess=true;assert.throws(()=>importDiagramProject(JSON.stringify(extra)),/纸面状态字段/);
  const missing=structuredClone(pulled);missing.steps[0].pose=null;assert.throws(()=>validateDiagramProject(missing),/缺少当前/);
  const different=structuredClone(pulled);different.steps[0].paperStates!.flat.sourceStateId=different.states[1].id;assert.throws(()=>validateDiagramProject(different),/同一 CP/);
});


test('reanalysing pulled geometry cannot relabel it flat or overwrite the original paper',()=>{
  const {project,id}=fixture(),pulled=pull(project,id),before=structuredClone(pulled.steps[0]);
  const result=structuredClone(before.pose!.result);result.layers.message='重新分析拖角层序';
  const analysed=retainDiagramPaperStates(updateDiagramPoseResult(pulled,id,result),id,before);
  assert.equal(analysed.steps[0].paperStates!.active,'pulled');
  assert.deepEqual(analysed.steps[0].paperStates!.flat,before.paperStates!.flat);
  const restored=switchDiagramPaperState(analysed,id,'flat');
  assert.ok(isDiagramPaperPoseIsometric(restored.steps[0].pose!));
  assert.deepEqual(restored.steps[0].pose!.result.geometry.vertices,project.steps[0].pose!.result.geometry.vertices);
});

test('old files with a pulled pose labelled flat preserve the drawing and invalidate the bad flat cache',()=>{
  const {project,id}=fixture(),corrupt=pull(project,id),drawn=structuredClone(corrupt.steps[0].pose!);
  corrupt.steps[0].paperStates!.flat=structuredClone(drawn);corrupt.steps[0].paperStates!.active='flat';
  assert.ok(isDiagramPaperPulled(corrupt.steps[0]));
  const restored=importDiagramProject(JSON.stringify(corrupt)),step=restored.steps[0];
  assert.equal(step.paperStates!.active,'pulled');assert.equal(step.paperStates!.flat,undefined);
  assert.deepEqual(step.pose!.result.geometry.vertices,drawn.result.geometry.vertices);
  assert.deepEqual(step.annotations,corrupt.steps[0].annotations);
  const rebuilt=retainDiagramPaperStates(adoptDiagramPose(restored,id,step.beforeId,computeFlatFold(restored.states[0].doc)),id,step);
  assert.equal(rebuilt.steps[0].paperStates!.active,'flat');assert.ok(isDiagramPaperPoseIsometric(rebuilt.steps[0].pose!));
  assert.deepEqual(switchDiagramPaperState(rebuilt,id,'pulled').steps[0].pose!.result.geometry.vertices,drawn.result.geometry.vertices);
  assert.equal(importDiagramProject(exportDiagramProject(rebuilt)).steps[0].paperStates!.active,'flat');
});
