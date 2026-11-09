import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {diagramStretchEdges,straightStretch,stretchSelection,type StretchEdge} from '../../src/app/diagramVertexStretch';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,exportDiagramProject,importDiagramProject,updateDiagramPaperPose} from '../../src/app/diagramProject';
import {prepareDiagramPaperAnchors,diagramPaperEditResult,moveDiagramPaperVertices} from '../../src/app/diagramPaperDeformation';
import {modelProjection} from '../../src/app/modelProjection';

const points:Point[]=[[0,0],[10,0],[20,0],[30,0],[40,0],[20,10],[60,0],[70,0],[10,0],[20,0]];
const edges:StretchEdge[]=[[0,1],[1,2],[2,3],[3,4],[2,5],[6,7],[8,9]];
test('selection extends only as far as the chosen existing segment and includes intervening nodes',()=>{
  assert.deepEqual(straightStretch(points,edges,[0,1]),{vertices:[0,1],ends:[0,1]});
  assert.deepEqual(straightStretch(points,edges,[0,1],[[2,3]]),{vertices:[0,1,2,3],ends:[0,3]});
  assert.deepEqual(straightStretch(points,edges,[3,2],[[1,0]]),{vertices:[3,2,1,0],ends:[3,0]});
});
test('does not bridge gaps, turn corners or select a coincident separate bank',()=>{
  for(const other of [[2,5],[6,7],[8,9]] as StretchEdge[])assert.equal(straightStretch(points,edges,[0,1],[other]),null);
  assert.equal(straightStretch(points,edges,[0,7]),null);
});
test('whole selected run stretches with preserved ratios while its opposite end stays fixed',()=>{
  const doc=blankDoc('stretch',100,100),result=computeFlatFold(doc),line=straightStretch(points,edges,[0,1],[[2,3]])!;
  result.geometry.vertices=structuredClone(points);
  const next=moveFoldedVertices(result,stretchSelection(points,line,3),[60,30]);
  assert.deepEqual(next.geometry.vertices.slice(0,5),[[0,0],[20,10],[40,20],[60,30],[40,0]]);
  assert.deepEqual(next.geometry.vertices.slice(5),points.slice(5));assert.deepEqual(result.geometry.vertices,points);
  const other=moveFoldedVertices(result,stretchSelection(points,line,0),[-30,-30]);
  assert.deepEqual(other.geometry.vertices.slice(0,4),[[-30,-30],[-10,-20],[10,-10],[30,0]]);
});
test('invalid follower identities and weights reject atomically',()=>{
  const result=computeFlatFold(blankDoc('invalid',100,100)),before=structuredClone(result);
  for(const followers of [[{vertex:0,weight:.5}],[{vertex:999,weight:.5}],[{vertex:1,weight:NaN}],[{vertex:1,weight:.5},{vertex:1,weight:.2}]]){
    assert.throws(()=>moveFoldedVertices(result,{group:[0],selected:[0],followers},[5,8]));
  }
  assert.deepEqual(result,before);
});
function fixture(){
  const doc=blankDoc('material stretch',100,100),result=computeFlatFold(doc);let n=0;
  let project=createDiagramProject(doc,()=>`stretch-${++n}`),id=project.steps[0].id;
  project=adoptDiagramPose(project,id,project.steps[0].beforeId,result);
  const pose=prepareDiagramPaperAnchors(project.steps[0].pose!,[{point:[25,0],faces:[0]},{point:[50,0],faces:[0]},{point:[75,0],faces:[0]}]);
  return {project,id,pose};
}
test('material outline stretch updates drawing anchors, survives save/reopen and leaves CP untouched',()=>{
  const {project,id,pose}=fixture(),original=structuredClone(pose.sourceDoc),edit=diagramPaperEditResult(pose),vertices=edit.geometry.vertices;
  const ids=[0,25,50,75,100].map(x=>vertices.findIndex(p=>p[0]===x&&p[1]===0));assert.ok(ids.every(i=>i>=0));
  const edges=diagramStretchEdges(pose,[]),line=straightStretch(vertices,edges,[ids[0],ids[1]],[[ids[2],ids[3]]])!;
  const moved=moveDiagramPaperVertices(pose,stretchSelection(vertices,line,ids[3]),[150,-30]);
  const next=diagramPaperEditResult(moved).geometry.vertices;
  assert.deepEqual(ids.map(id=>next[id]),[[0,0],[50,-10],[100,-20],[150,-30],[100,0]]);
  assert.deepEqual(moved.sourceDoc,original);assert.equal(moved.result.geometry.vertices.length,pose.result.geometry.vertices.length);
  const saved=importDiagramProject(exportDiagramProject(updateDiagramPaperPose(project,id,moved)));
  assert.deepEqual(saved.steps[0].pose!.paperDeformation,moved.paperDeformation);
});
test('hidden material faces and triangulation diagonals are not stretch candidates',()=>{
  const {pose}=fixture();assert.deepEqual(diagramStretchEdges({...pose,hiddenFaces:[0]},[]),[]);
  const vertices=diagramPaperEditResult(pose).geometry.vertices;
  assert.ok(diagramStretchEdges(pose,[]).every(([a,b])=>vertices[a][0]===vertices[b][0]||vertices[a][1]===vertices[b][1]));
});
test('displayed internal crease anchors can be extended together in a rotated back view',()=>{
  let {pose}=fixture();pose={...pose,view:{...pose.view,side:'back',rotation:37,projectionCenter:[30,60]}};
  const projection=modelProjection(pose.result.geometry.vertices,true,37,[30,60]);
  const endpoints:Point[]=[[20,50],[40,50],[60,50]];
  pose=prepareDiagramPaperAnchors(pose,endpoints.map(p=>({point:projection.project(p),faces:[0]})));
  const vertices=diagramPaperEditResult(pose).geometry.vertices;
  const ids=endpoints.map(p=>vertices.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-6));
  const edges=diagramStretchEdges(pose,[{a:projection.project(endpoints[0]),b:projection.project(endpoints[1]),face:0},{a:projection.project(endpoints[1]),b:projection.project(endpoints[2]),face:0}]);
  assert.deepEqual(straightStretch(vertices,edges,[ids[0],ids[1]],[[ids[1],ids[2]]])?.ends,[ids[0],ids[2]]);
});
