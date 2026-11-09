import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,adoptDiagramPose,type DiagramProject} from '../../src/app/diagramProject';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {diagramLayerAnalysisKey,applyDiagramLayerAnalysis,applyDiagramLayerSolution,diagramPaperLayerAnalysisReason} from '../../src/app/diagramLayerAnalysis';
import {prepareDiagramPaperAnchors,moveDiagramPaperVertices,alignDiagramPaperAnchors} from '../../src/app/diagramPaperDeformation';
import {buildFold,buildDiagramFold} from '../../src/core/geometry';
import type {FlatFoldResult} from '../../src/core/types';

function fixture(){
  const doc=blankDoc('后台纸层分析',100,100);
  doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180},{id:'mark',a:[0,50],b:[100,50],assignment:'F',angle:0});
  const folded=computeFlatFold(doc,undefined,{flatCreases:'marks'}),pending=structuredClone(folded);
  assert.equal(folded.layers.status,'solved',folded.layers.message);
  pending.layers={status:'unknown',message:'载入的快照未保留旧层序。'};
  let project=createDiagramProject(doc),stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,pending);
  const step=project.steps[0];step.pose!.hiddenFaces=[1];step.pose!.displayOrder=[1,0];
  step.foldLink={enabled:true,layers:'selected',selectedFaces:[1],fixed:{point:[25,25],matrix:[1,0,0,1,0,0]}};
  step.annotations=[{id:'line',kind:'line',a:[0,0],b:[25,25],style:'valley',foldAction:'precrease',foldFaces:[1],color:'#293d35',width:.7}];
  const result=recomputeFlatLayers(step.pose!.result),key=diagramLayerAnalysisKey(project,stepId)!;
  assert.ok(key);assert.equal(result.layers.status,'solved',result.layers.message);
  return {project,stepId,result,key};
}

test('background analysis merges only layers on the original marks faces and keeps all user data',()=>{
  const {project,stepId,result,key}=fixture(),saved=structuredClone(project),pose=project.steps[0].pose!,next=applyDiagramLayerAnalysis(project,stepId,key,result),analysed=next.steps[0].pose!;
  assert.notEqual(next,project);assert.equal(next.states,project.states);
  assert.equal(analysed.result.geometry,pose.result.geometry);assert.equal(analysed.sourceDoc,pose.sourceDoc);
  assert.equal(analysed.view,pose.view);assert.equal(analysed.hiddenFaces,pose.hiddenFaces);assert.equal(analysed.displayOrder,pose.displayOrder);
  assert.equal(next.steps[0].annotations,project.steps[0].annotations);assert.equal(next.steps[0].foldLink,project.steps[0].foldLink);
  assert.deepEqual(analysed.result.layers,result.layers);assert.deepEqual(project,saved);
  assert.equal(analysed.result.geometry.faces.length,buildDiagramFold(pose.sourceDoc).graph.faces_vertices!.length);
  assert.notEqual(analysed.result.geometry.faces.length,buildFold(pose.sourceDoc).graph.faces_vertices!.length,'F marks must not be rebuilt into extra paper faces');
  result.layers.faceOrders![0][2]*=-1;assert.notDeepEqual(analysed.result.layers,result.layers,'worker arrays never alias saved layer caches');
});

test('analysis identity ignores view, visibility and derived graph caches while preserving the original geometry object',()=>{
  const {project,stepId,result,key}=fixture(),changed=structuredClone(project),pose=changed.steps[0].pose!;
  pose.view={...pose.view!,side:'back',rotation:45};pose.hiddenFaces=[];pose.displayOrder=[0,1];
  pose.result.geometry.graph!.faces_matrix=[[1,0,0,1,0,0]];pose.result.geometry.graph!.faces_normal=[[0,0,1]];
  assert.equal(diagramLayerAnalysisKey(changed,stepId),key);
  result.geometry.message='仅用于说明的消息变化';result.geometry.graph!.faceOrders=[[0,1,1]];
  const next=applyDiagramLayerAnalysis(changed,stepId,key,result);
  assert.equal(next.steps[0].pose!.result.layers.status,'solved');
  assert.equal(next.steps[0].pose!.result.geometry,pose.result.geometry);assert.deepEqual(next.steps[0].pose!.view,pose.view);
});

test('late results cannot overwrite a changed source, active step or material pose',()=>{
  const {project,stepId,result,key}=fixture();
  const changes:Array<(next:DiagramProject)=>void>=[
    next=>{next.activeStepId='other-step';},
    next=>{next.states[0].revision++;},
    next=>{next.states[0].doc.name='来源已改';},
    next=>{next.steps[0].pose!.sourceStateId='missing';},
    next=>{next.steps[0].pose!.result.geometry.vertices[0][0]+=.1;},
    next=>{next.steps[0].pose!.result.layers.constraints=[{face:1,side:'white'}];},
    next=>{next.steps[0].pose!.result.layers.solutionIndex=1;},
  ];
  for(const change of changes){const next=structuredClone(project);change(next);assert.notEqual(diagramLayerAnalysisKey(next,stepId),key);assert.equal(applyDiagramLayerAnalysis(next,stepId,key,result),next);}
});

test('different result geometry or malformed certificates never enter the project',()=>{
  const {project,stepId,result,key}=fixture();
  const changes:Array<(result:FlatFoldResult)=>void>=[
    result=>{result.geometry.vertices[0][0]+=.1;result.geometry.graph!.vertices_coords[0][0]+=.1;},
    result=>{result.geometry.faces=result.geometry.faces.map((face,i)=>i===0?[...face].reverse():face);result.geometry.graph!.faces_vertices=result.geometry.faces.map(face=>[...face]);},
    result=>{result.geometry.graph!.edges_assignment[0]='M';},
    result=>{delete result.geometry.graph!.zhezhi_flatCreases;},
    result=>{result.geometry.modified=!result.geometry.modified;},
    result=>{result.geometry.startingFace=1;},
    result=>{result.layers.faceOrders=[[0,20,1]];},
    result=>{result.layers.faceOrders=[[0,1,0]];},
    result=>{result.layers.faceOrders=[[0,1,1],[1,0,-1]];},
    result=>{result.layers.faceOrder=[0,0];},
    result=>{result.layers.faceOrder=result.layers.faceOrder!.slice().reverse();},
    result=>{result.layers.constraints=[{face:1,side:'white'}];},
  ];
  for(const [index,change] of changes.entries()){const answer=structuredClone(result);change(answer);assert.equal(applyDiagramLayerAnalysis(project,stepId,key,answer),project,`rejected mutation ${index}`);}
});

test('active paper-state cache receives the same certificate without touching its inactive geometry',()=>{
  const {project,stepId,result}=fixture(),step=project.steps[0],flat=structuredClone(step.pose!),pulled=structuredClone(flat);
  pulled.result.geometry.vertices[0][0]+=.25;pulled.result.geometry.graph!.vertices_coords[0][0]+=.25;
  step.paperStates={active:'flat',flat,pulled};
  const key=diagramLayerAnalysisKey(project,stepId)!,next=applyDiagramLayerAnalysis(project,stepId,key,result),updated=next.steps[0];
  assert.notEqual(next,project);assert.equal(updated.paperStates!.pulled,pulled);assert.equal(updated.paperStates!.flat.result.geometry,flat.result.geometry);
  assert.deepEqual(updated.paperStates!.flat.result.layers,updated.pose!.result.layers);
  const switched=structuredClone(project);switched.steps[0].paperStates!.active='pulled';assert.equal(applyDiagramLayerAnalysis(switched,stepId,key,result),switched);
  const mismatched=structuredClone(project);mismatched.steps[0].paperStates!.flat.result.geometry.modified=true;
  assert.equal(applyDiagramLayerAnalysis(mismatched,stepId,key,result),mismatched);
});

test('terminal unsolved analyses remain explicit and repeated identical merges are no-ops',()=>{
  const {project,stepId,result,key}=fixture(),timeout={...result,layers:{status:'timeout' as const,message:'层序分析超时，仍未确认。'}};
  const next=applyDiagramLayerAnalysis(project,stepId,key,timeout);assert.equal(next.steps[0].pose!.result.layers.status,'timeout');
  assert.equal(applyDiagramLayerAnalysis(next,stepId,diagramLayerAnalysisKey(next,stepId)!,timeout),next);
  assert.equal(diagramLayerAnalysisKey(project,'missing'),null);
});

test('flat illustration anchors remain analysable and their material identity invalidates an older base-only request',()=>{
  const {project,stepId,result,key}=fixture(),changed=structuredClone(project),before=structuredClone(project.states);
  const pose=changed.steps[0].pose!,prepared=prepareDiagramPaperAnchors(pose,[{point:[25,25],faces:[0]}]);
  assert.equal(prepared.paperDeformation!.nodes.length,1);changed.steps[0].pose=prepared;
  assert.equal(diagramPaperLayerAnalysisReason(prepared),undefined);
  const current=diagramLayerAnalysisKey(changed,stepId)!;assert.ok(current);assert.notEqual(current,key);
  assert.equal(applyDiagramLayerAnalysis(changed,stepId,key,result),changed);
  const next=applyDiagramLayerAnalysis(changed,stepId,current,result);assert.notEqual(next,changed);
  assert.equal(next.steps[0].pose!.result.layers.status,'solved');assert.deepEqual(next.steps[0].pose!.paperDeformation,prepared.paperDeformation);
  assert.deepEqual(next.states,before);assert.deepEqual(project.states,before);
});

test('a node-only deformation rejects stale and fresh base certificates without changing CP or the base geometry',()=>{
  const {project,stepId,result}=fixture(),changed=structuredClone(project),step=changed.steps[0],base=step.pose!,states=structuredClone(changed.states);
  step.pose=prepareDiagramPaperAnchors(base,[{point:[25,25],faces:[0]}]);
  const key=diagramLayerAnalysisKey(changed,stepId)!,index=base.result.geometry.vertices.length;
  assert.ok(key);
  const deformed=moveDiagramPaperVertices(step.pose,{group:[index],selected:[index]},[30,35]);step.pose=deformed;
  assert.deepEqual(deformed.result.geometry.vertices,base.result.geometry.vertices);
  assert.deepEqual(deformed.result.geometry.faces,base.result.geometry.faces);
  assert.match(diagramPaperLayerAnalysisReason(deformed)!,/图示层序.*恢复平整/);
  assert.equal(diagramLayerAnalysisKey(changed,stepId),null);
  const answer={...deformed.result,layers:result.layers};
  assert.equal(applyDiagramLayerAnalysis(changed,stepId,key,answer),changed);
  assert.equal(applyDiagramLayerAnalysis(changed,stepId,'new-base-request',answer),changed);
  const candidate={...answer,layers:{...answer.layers,solutionIndex:0}};
  assert.equal(applyDiagramLayerSolution(changed,stepId,key,candidate,0),changed);
  step.pose=moveDiagramPaperVertices(deformed,{group:[index],selected:[index]},[35,40]);
  assert.equal(diagramLayerAnalysisKey(changed,stepId),null);assert.equal(applyDiagramLayerAnalysis(changed,stepId,key,answer),changed);
  assert.deepEqual(changed.states,states);assert.deepEqual(deformed.sourceDoc,base.sourceDoc);
});

test('ordinary base-vertex analysis remains available, including anchors that follow its unchanged interpolated surface',()=>{
  const {project,stepId}=fixture(),step=project.steps[0],pose=step.pose!;
  const edited=moveDiagramPaperVertices(pose,{group:[0],selected:[0]},[-5,-5]);step.pose=edited;
  assert.equal(diagramPaperLayerAnalysisReason(edited),undefined);assert.ok(diagramLayerAnalysisKey(project,stepId));
  const flat=prepareDiagramPaperAnchors(pose,[{point:[25,25],faces:[0]}]),[withFollowingNode]=alignDiagramPaperAnchors(edited,flat);step.pose=withFollowingNode;
  assert.equal(withFollowingNode.paperDeformation!.nodes.length,1);
  assert.equal(diagramPaperLayerAnalysisReason(withFollowingNode),undefined);assert.ok(diagramLayerAnalysisKey(project,stepId));
});

test('invalid anchor metadata and active-cache node mismatches reject base-layer certification atomically',()=>{
  const {project,stepId,result}=fixture(),changed=structuredClone(project),pose=prepareDiagramPaperAnchors(changed.steps[0].pose!,[{point:[25,25],faces:[0]}]),step=changed.steps[0];
  step.pose=pose;step.paperStates={active:'flat',flat:structuredClone(pose),pulled:structuredClone(pose)};
  const key=diagramLayerAnalysisKey(changed,stepId)!,states=structuredClone(changed.states);assert.ok(key);
  delete step.paperStates.flat.paperDeformation;
  assert.equal(applyDiagramLayerAnalysis(changed,stepId,key,result),changed);
  assert.equal(applyDiagramLayerSolution(changed,stepId,key,{...result,layers:{...result.layers,solutionIndex:0}},0),changed);
  pose.paperDeformation!.nodes[0].face=999;
  assert.match(diagramPaperLayerAnalysisReason(pose)!,/图示层序/);assert.equal(diagramLayerAnalysisKey(changed,stepId),null);
  assert.deepEqual(changed.states,states);
});
