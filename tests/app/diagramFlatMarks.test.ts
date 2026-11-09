import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,buildDiagramFold,distance} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramPoseResult,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {buildDiagramPoseFold} from '../../src/app/diagramFoldGeometry';
import {setDiagramStartingFace} from '../../src/app/diagramFoldSettings';
import {resolveStartingFace} from '../../src/app/flatFoldSettings';
import {chooseDiagramPrecreaseAnchor,diagramPrecreaseLayerOrderMatches} from '../../src/app/diagramPrecreaseAdvance';
import {alignDiagramFoldResult,diagramFoldStartingFace} from '../../src/app/diagramFoldLink';
import {recordDiagramPaperPull,switchDiagramPaperState,isDiagramPaperPoseIsometric} from '../../src/app/diagramPaperState';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import type {Doc,Point} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';

function source(){const doc=blankDoc('折序展开折痕',100,100);doc.segments.push({id:'old-F',a:[0,40],b:[100,40],assignment:'F',angle:0});return doc;}
function poseOf(doc:Doc,marks:boolean):DiagramPose{return {sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result:computeFlatFold(doc,undefined,marks?{flatCreases:'marks'}:{})};}

test('new diagram project defaults to the visible layer and preserves explicit mark topology across save/load',()=>{
  const doc=source();let sequence=0,project=createDiagramProject(doc,()=>`mark-${++sequence}`);assert.equal(project.steps[0].foldLink!.layers,'top');
  const step=project.steps[0],result=computeFlatFold(doc,undefined,{flatCreases:'marks'});project=adoptDiagramPose(project,step.id,step.beforeId,result);
  const text=exportDiagramProject(project),loaded=importDiagramProject(text),pose=loaded.steps[0].pose!;
  assert.equal(pose.result.geometry.faces.length,1);assert.equal(pose.result.geometry.graph!.zhezhi_flatCreases,'marks');assert.equal(pose.result.layers.status,'unknown');
  assert.deepEqual(buildDiagramPoseFold(pose).graph.faces_vertices,pose.result.geometry.faces);assert.deepEqual(loaded.states,project.states);
});

test('old F-partitioned diagram poses and pulled-state archives still restore without topology conversion',()=>{
  const doc=source();let sequence=0,project=createDiagramProject(doc,()=>`legacy-${++sequence}`);const step=project.steps[0];project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatFold(doc));
  const previous=project.steps[0].pose!,graph=buildFold(doc).graph,index=graph.vertices_coords.findIndex(point=>distance(point,[100,0])<1e-8);
  project=updateDiagramPoseResult(project,step.id,moveFoldedVertices(previous.result,{group:[index],selected:[index]},[120,-20]));project=recordDiagramPaperPull(project,step.id,previous,[]);
  const loaded=importDiagramProject(exportDiagramProject(project)),pose=loaded.steps[0].pose!;
  assert.equal(pose.result.geometry.graph!.zhezhi_flatCreases,undefined);assert.equal(pose.result.geometry.faces.length,2);assert.deepEqual(buildDiagramPoseFold(pose).graph.faces_vertices,pose.result.geometry.faces);
  const flat=switchDiagramPaperState(loaded,step.id,'flat');assert.ok(isDiagramPaperPoseIsometric(flat.steps[0].pose!));assert.deepEqual(flat.steps[0].pose!.result.geometry.faces,previous.result.geometry.faces);
  const pulled=switchDiagramPaperState(flat,step.id,'pulled');assert.deepEqual(pulled.steps[0].pose!.result.geometry.vertices,pose.result.geometry.vertices);
});

test('new precrease advance preserves placement and physical layer count on both flat and already folded paper',()=>{
  for(const folded of [false,true]){
    const doc=source();if(folded)doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});const pose=poseOf(doc,true);
    pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[x+13,y-7]);pose.result.geometry.graph!.vertices_coords=structuredClone(pose.result.geometry.vertices);
    const after=structuredClone(doc);after.segments.push({id:'new-F',a:[0,70],b:[100,70],assignment:'F',angle:0});
    const anchor=chooseDiagramPrecreaseAnchor(pose,after),startingFace=diagramFoldStartingFace(after,anchor),result=computeFlatFold(after,undefined,{flatCreases:'marks',startingFace});
    const aligned=alignDiagramFoldResult(after,result,anchor),graph=buildDiagramFold(after).graph;
    assert.equal(aligned.geometry.faces.length,pose.result.geometry.faces.length);assert.equal(aligned.layers.faceOrder!.length,folded?2:1);assert.ok(diagramPrecreaseLayerOrderMatches(pose,after,aligned));
    graph.vertices_coords.forEach(([x,y],v)=>assert.ok(distance(aligned.geometry.vertices[v],[(folded&&x>50?100-x:x)+13,y-7])<1e-5));
  }
});

test('diagram starting-face preferences bind the physical panel through a full-sheet F mark',()=>{
  const doc=source();doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  assert.equal(buildFold(doc).graph.faces_vertices!.length,4);assert.equal(buildDiagramFold(doc).graph.faces_vertices!.length,2);
  const selected=setDiagramStartingFace(doc,1),resolved=resolveStartingFace(selected,buildDiagramFold(selected).graph);assert.deepEqual(resolved,{face:1,stale:false});
  const panel=buildDiagramFold(doc).graph.faces_vertices![1].map(index=>buildDiagramFold(doc).graph.vertices_coords[index]);assert.deepEqual(selected.flatFold!.startingFace,panel);
  assert.equal(doc.flatFold,undefined);
});
