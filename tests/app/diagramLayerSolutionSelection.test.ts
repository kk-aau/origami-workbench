import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramPoseResult,updateDiagramCP,exportDiagramProject,importDiagramProject,validateDiagramProject} from '../../src/app/diagramProject';
import {diagramLayerAnalysisKey,applyDiagramLayerAnalysis,applyDiagramLayerSolution,requestedDiagramLayerSolutionIndex} from '../../src/app/diagramLayerAnalysis';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import type {FlatFoldResult} from '../../src/core/types';
import {polygonArea} from '../../src/core/geometry';
import {buildDiagramPoseFold} from '../../src/app/diagramFoldGeometry';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';

function fixture(){
  const doc=blankDoc('四种合法层序',100,100);
  for(let x=20;x<100;x+=20)doc.segments.push({id:`fold-${x}`,a:[x,0],b:[x,100],assignment:'V',angle:180});
  const first=computeFlatFold(doc),other=recomputeFlatLayers(first,{solutionIndex:1});
  assert.equal(first.layers.status,'solved');assert.equal(first.layers.solutionCountExact,'4');
  assert.equal(other.layers.status,'solved');assert.notDeepEqual(other.layers.faceOrders,first.layers.faceOrders);
  let project=createDiagramProject(doc);const stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,first);
  const step=project.steps[0];step.pose!.hiddenFaces=[1];
  step.foldLink={enabled:true,layers:'selected',selectedFaces:[1],fixed:{point:[10,10],matrix:[1,0,0,1,0,0]}};
  step.annotations=[{id:'line',kind:'line',a:[5,5],b:[15,15],style:'valley',width:.7,color:'#293d35',foldFaces:[1]}];
  return {project,stepId,first,other,key:diagramLayerAnalysisKey(project,stepId)!};
}

test('selecting a real alternative changes only the current layer solution and its saved drawing order',()=>{
  const {project,stepId,other,key}=fixture(),saved=structuredClone(project),pose=project.steps[0].pose!;
  const next=applyDiagramLayerSolution(project,stepId,key,other,1),selected=next.steps[0].pose!;
  assert.notEqual(next,project);assert.equal(next.states,project.states);
  assert.equal(selected.result.geometry,pose.result.geometry);assert.equal(selected.sourceDoc,pose.sourceDoc);
  assert.equal(selected.view,pose.view);assert.equal(selected.hiddenFaces,pose.hiddenFaces);
  assert.equal(next.steps[0].annotations,project.steps[0].annotations);assert.equal(next.steps[0].foldLink,project.steps[0].foldLink);
  assert.deepEqual(selected.result.layers,other.layers);assert.deepEqual(selected.displayOrder,other.layers.faceOrder);
  assert.equal(selected.layerSolutionIndex,1);assert.equal(requestedDiagramLayerSolutionIndex(selected),1);
  assert.deepEqual(project,saved);assert.notEqual(diagramLayerAnalysisKey(next,stepId),key);
  other.layers.faceOrders![0][2]*=-1;assert.notDeepEqual(selected.result.layers,other.layers,'worker-owned arrays never alias the saved pose');
});

test('failed, malformed, wrong-number and stale candidate responses retain the old visible solution',()=>{
  const {project,stepId,other,key}=fixture();
  const mutations:Array<(result:FlatFoldResult)=>void>=[
    result=>{result.layers={status:'timeout',message:'超时'};},
    result=>{result.layers.solutionIndex=0;},
    result=>{result.layers.solutionCount=1;},
    result=>{result.layers.solutionCountExact='1';},
    result=>{result.layers.constraints=[{face:0,side:'white'}];},
    result=>{result.layers.faceOrders=[[0,99,1]];},
    result=>{result.layers.faceOrder=result.layers.faceOrder!.slice().reverse();},
    result=>{result.geometry.vertices[0][0]+=.5;result.geometry.graph!.vertices_coords[0][0]+=.5;},
  ];
  for(const mutation of mutations){const result=structuredClone(other);mutation(result);assert.equal(applyDiagramLayerSolution(project,stepId,key,result,1),project);}
  for(const index of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(applyDiagramLayerSolution(project,stepId,key,other,index),project);
  const changed=structuredClone(project);changed.states[0].revision++;
  assert.equal(applyDiagramLayerSolution(changed,stepId,key,other,1),changed);
  const alreadySelected=applyDiagramLayerSolution(project,stepId,key,other,1);
  assert.equal(applyDiagramLayerSolution(alreadySelected,stepId,key,other,1),alreadySelected,'late results cannot overwrite a newer choice');
});

test('reopening saves the requested candidate but recomputes its certificate on the stored geometry',()=>{
  const {project,stepId,other,key}=fixture(),chosen=applyDiagramLayerSolution(project,stepId,key,other,1);
  const reopened=importDiagramProject(exportDiagramProject(chosen)),pose=reopened.steps[0].pose!;
  assert.equal(pose.layerSolutionIndex,1);assert.equal(pose.result.layers.status,'unknown');assert.equal(pose.result.layers.faceOrders,undefined);
  assert.deepEqual(pose.displayOrder,other.layers.faceOrder);
  const restored=recomputeFlatLayers(pose.result,{solutionIndex:requestedDiagramLayerSolutionIndex(pose),constraints:pose.result.layers.constraints});
  assert.equal(restored.layers.status,'solved');assert.deepEqual(restored.layers.faceOrders,other.layers.faceOrders);
  const next=applyDiagramLayerAnalysis(reopened,stepId,diagramLayerAnalysisKey(reopened,stepId)!,restored);
  assert.equal(next.steps[0].pose!.result.layers.solutionIndex,1);assert.equal(next.steps[0].pose!.layerSolutionIndex,1);
  const wrongDefault=recomputeFlatLayers(pose.result);
  assert.equal(applyDiagramLayerAnalysis(reopened,stepId,diagramLayerAnalysisKey(reopened,stepId)!,wrongDefault),reopened);
});

test('candidate numbering keeps the same colour constraints after export and import',()=>{
  const {project,stepId,first}=fixture(),top=first.layers.faceOrder!.at(-1)!;
  const side=polygonArea(first.geometry.faces[top].map(v=>first.geometry.vertices[v]))>0?'white':'color';
  const constrained=recomputeFlatLayers(first,{constraints:[{face:top,side}]});
  assert.equal(constrained.layers.status,'solved');
  const withConstraints=updateDiagramPoseResult(project,stepId,constrained),reopened=importDiagramProject(exportDiagramProject(withConstraints));
  const pose=reopened.steps[0].pose!;
  assert.deepEqual(pose.result.layers.constraints,constrained.layers.constraints);
  const result=recomputeFlatLayers(pose.result,{solutionIndex:requestedDiagramLayerSolutionIndex(pose),constraints:pose.result.layers.constraints});
  assert.deepEqual(result.layers.faceOrders,constrained.layers.faceOrders);
});

test('selection updates only the active paper-state cache and both snapshots retain independent preferences on save',()=>{
  const {project,stepId,other}=fixture(),step=project.steps[0];
  step.paperStates={active:'flat',flat:structuredClone(step.pose!),pulled:structuredClone(step.pose!)};
  const inactive=step.paperStates.pulled,key=diagramLayerAnalysisKey(project,stepId)!;
  const next=applyDiagramLayerSolution(project,stepId,key,other,1),selected=next.steps[0];
  assert.equal(selected.paperStates!.pulled,inactive);assert.equal(selected.paperStates!.pulled.layerSolutionIndex,0);
  assert.equal(selected.paperStates!.flat.layerSolutionIndex,1);assert.deepEqual(selected.paperStates!.flat.result.layers,selected.pose!.result.layers);
  const reopened=importDiagramProject(exportDiagramProject(next));
  assert.equal(reopened.steps[0].pose!.layerSolutionIndex,1);
  assert.equal(reopened.steps[0].paperStates!.flat.layerSolutionIndex,1);assert.equal(reopened.steps[0].paperStates!.pulled.layerSolutionIndex,0);
});

test('adoption and solved updates record the candidate; geometry edits clear that geometry-specific preference',()=>{
  const {project,stepId,other}=fixture(),updated=updateDiagramPoseResult(project,stepId,other);
  assert.equal(updated.steps[0].pose!.layerSolutionIndex,1);
  const adopted=adoptDiagramPose(project,stepId,project.steps[0].beforeId,other);
  assert.equal(adopted.steps[0].pose!.layerSolutionIndex,1);
  const moved=moveFoldedVertices(other,{group:[0],selected:[0]},[-1,-1]);
  assert.equal(updateDiagramPoseResult(updated,stepId,moved).steps[0].pose!.layerSolutionIndex,undefined);
  assert.equal(project.steps[0].pose!.layerSolutionIndex,0);
});

test('legacy solved projects capture their candidate before snapshot serialization drops solver caches',()=>{
  const {project,stepId,other}=fixture(),legacy=adoptDiagramPose(project,stepId,project.steps[0].beforeId,other);
  delete legacy.steps[0].pose!.layerSolutionIndex;
  assert.equal(requestedDiagramLayerSolutionIndex(legacy.steps[0].pose!),1);
  assert.equal(importDiagramProject(exportDiagramProject(legacy)).steps[0].pose!.layerSolutionIndex,1);
  assert.equal(importDiagramProject(JSON.stringify(legacy)).steps[0].pose!.layerSolutionIndex,1);
});

test('persisted candidate preferences use strictly validated safe nonnegative integers',()=>{
  const {project}=fixture();
  for(const value of [-1,.5,Infinity,Number.MAX_SAFE_INTEGER+1,'1',null]){
    const changed=structuredClone(project);(changed.steps[0].pose as unknown as Record<string,unknown>).layerSolutionIndex=value;
    assert.throws(()=>validateDiagramProject(changed),/纸层方案编号/);
  }
  const legacy=structuredClone(project);delete legacy.steps[0].pose!.layerSolutionIndex;
  assert.doesNotThrow(()=>validateDiagramProject(legacy));
});

test('new animation material subfaces inherit the explicitly selected alternative, rather than the default candidate',()=>{
  const {project,stepId,other,key}=fixture(),selected=applyDiagramLayerSolution(project,stepId,key,other,1);
  const step=selected.steps[0],after=structuredClone(selected.states.find(state=>state.id===step.afterId)!.doc);
  for(let panel=0;panel<5;panel++)after.segments.push({id:`cross-fold-${panel}`,a:[panel*20,50],b:[(panel+1)*20,50],assignment:panel%2?'M':'V',angle:panel%2?-180:180});
  const authored=updateDiagramCP(selected,step.afterId,after),saved=structuredClone(authored),pose=authored.steps[0].pose!;
  const clip=buildDiagramStepAnimation(authored,stepId),initial=clip.initialGeometry!;
  assert.equal(initial.layers.status,'solved');assert.ok(initial.layers.faceOrders!.length>other.layers.faceOrders!.length);
  const source=buildDiagramPoseFold(pose).graph;
  const parents=clip.fold.faces_vertices!.map(face=>{
    const centerX=face.reduce((sum,v)=>sum+clip.fold.vertices_coords[v][0],0)/face.length;
    return source.faces_vertices!.findIndex(parent=>{
      const xs=parent.map(v=>source.vertices_coords[v][0]);return centerX>Math.min(...xs)&&centerX<Math.max(...xs);
    });
  });
  assert.ok(parents.every(parent=>parent>=0));
  for(const [a,b,sign] of initial.layers.faceOrders!){
    const row=other.layers.faceOrders!.find(([first,second])=>first===parents[a]&&second===parents[b]);assert.ok(row);
    const parentNormal=Math.sign(polygonArea(pose.result.geometry.faces[row[1]].map(v=>pose.result.geometry.vertices[v])));
    const childNormal=Math.sign(polygonArea(initial.geometry.faces[b].map(v=>initial.geometry.vertices[v])));
    assert.equal(sign,row[2]*parentNormal*childNormal);
  }
  assert.deepEqual(authored,saved);
});
