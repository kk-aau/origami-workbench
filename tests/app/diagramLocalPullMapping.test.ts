import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import type {DiagramPose,DiagramCPState} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {defaultModelView} from '../../src/app/modelViewState';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {mapDiagramCPSelection} from '../../src/app/diagramCPSelection';
import {followDiagramPaperAnnotations} from '../../src/app/diagramPaperFollow';
import {applyDiagramFoldSegments,projectDiagramFoldCP,mapDiagramFoldLines,pickDiagramFoldAnchor,diagramFoldFacesAtPoint} from '../../src/app/diagramFoldLink';

const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-6,`${a} != ${b}`);
const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']='F'):Segment=>({id,a,b,assignment,angle:assignment==='V'?180:0});
const line=(id:string,a:Point,b:Point):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'valley',color:'#293d35',width:.7});
function poseOf(doc:Doc):DiagramPose {
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready',result.geometry.message);
  return {sourceStateId:'local',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()};
}
function pull(pose:DiagramPose,point:Point,destination:Point):DiagramPose {
  const {graph}=diagramIllustrationMesh(pose),index=graph.vertices_coords.findIndex(p=>distance(p,point)<1e-7);assert.ok(index>=0);
  return {...pose,result:moveFoldedVertices(pose.result,{group:[index],selected:[index]},destination)};
}
function triangle(){
  const points:Point[]=[[0,0],[100,0],[100,100]],doc:Doc={schemaVersion:2,name:'右侧局部小三角',paper:{width:100,height:100},segments:points.map((p,i)=>segment(`b${i}`,p,points[(i+1)%points.length],'B'))};
  doc.segments.push(segment('sloping-hinge',[50,50],[100,0]),segment('horizontal-hinge',[50,50],[100,50]));
  return poseOf(doc);
}
function state(pose:DiagramPose):DiagramCPState{return {id:pose.sourceStateId,revision:pose.sourceRevision,doc:pose.sourceDoc};}

test('a right-edge pull maps only its two small source cells while the large left triangle stays fixed',()=>{
  const pose=triangle(),next=pull(pose,[100,50],[95,45]),source=state(pose),old=structuredClone(pose.sourceDoc);
  assert.equal(pose.result.geometry.faces.length,1);assert.equal(next.result.geometry.faces.length,1);
  const stationary=line('left-large',[20,5],[40,5]),moving=line('right-small',[80,30],[90,30]);
  const followed=followDiagramPaperAnnotations(pose,next,[stationary,moving]);
  assert.deepEqual(followed[0],stationary);assert.notDeepEqual(followed[1],moving);
  const after=applyDiagramFoldSegments(pose.sourceDoc,[segment('left-new',stationary.a,stationary.b,'V')]);
  const preview=projectDiagramFoldCP(next,pose.sourceDoc,after,source).preview;
  const left=preview.find(p=>p.assignment==='V');assert.ok(left);close(left.a,stationary.a);close(left.b,stationary.b);
  const right=preview.filter(p=>p.assignment==='F').flatMap(p=>[p.a,p.b]);assert.ok(right.some(p=>distance(p,[95,45])<1e-6));
  const {graph}=diagramIllustrationMesh(pose),index=graph.vertices_coords.findIndex(p=>distance(p,[100,50])<1e-7);
  const selected=mapDiagramCPSelection(next,source,{kind:'vertex',index},source);assert.deepEqual(selected.faces,[0]);assert.equal(selected.points.length,1);close(selected.points[0],[95,45]);
  const edge=graph.edges_vertices.findIndex(pair=>pair.includes(index)&&pair.some(v=>distance(graph.vertices_coords[v],[50,50])<1e-7));assert.ok(edge>=0);
  const selectedEdge=mapDiagramCPSelection(next,source,{kind:'edge',index:edge},source);assert.equal(selectedEdge.segments.length,1);
  const edgePoints=[selectedEdge.segments[0].a,selectedEdge.segments[0].b];for(const point of [[50,50],[95,45]] as Point[])assert.ok(edgePoints.some(p=>distance(p,point)<1e-6));
  assert.deepEqual(pose.sourceDoc,old);assert.equal(after.segments.filter(s=>s.assignment==='F').length,2);
});

test('an interior F tip invalidates a rigid whole-face map and projects at its actual pulled position',()=>{
  const doc=blankDoc('内部预留折痕夹点',100,100);doc.segments.push(segment('finite-mark',[20,50],[80,50]));
  const pose=poseOf(doc),next=pull(pose,[80,50],[75,45]),source=state(pose),before=structuredClone(doc);
  const preview=projectDiagramFoldCP(next,doc,doc,source).preview;assert.ok(preview.length);assert.ok(preview.flatMap(p=>[p.a,p.b]).some(p=>distance(p,[75,45])<1e-6));
  const {graph}=diagramIllustrationMesh(pose),index=graph.vertices_coords.findIndex(p=>distance(p,[80,50])<1e-7);
  const mapped=mapDiagramCPSelection(next,source,{kind:'vertex',index},source);assert.equal(mapped.points.length,1);close(mapped.points[0],[75,45]);
  assert.throws(()=>mapDiagramFoldLines(next,[line('new',[10,10],[90,10])],{enabled:true,layers:'top',selectedFaces:[]},source),/非等距/);
  assert.throws(()=>pickDiagramFoldAnchor(next,[10,10],0,source),/非等距/);assert.deepEqual(doc,before);
});

test('local F cells may turn over and overlap without inventing physical faces, while collapsed cells fail',()=>{
  const pose=triangle(),next=pull(pose,[100,50],[60,30]),source=state(pose),before=structuredClone(pose.sourceDoc);
  const preview=projectDiagramFoldCP(next,pose.sourceDoc,pose.sourceDoc,source).preview;assert.ok(preview.length);assert.equal(next.result.geometry.faces.length,1);
  assert.ok(preview.flatMap(p=>[p.a,p.b]).some(p=>distance(p,[60,30])<1e-6));assert.deepEqual(diagramFoldFacesAtPoint(next,[70,10],source),[0]);
  assert.equal(next.result.layers.status,'unknown');assert.equal(next.result.layers.faceOrders,undefined);assert.deepEqual(pose.sourceDoc,before);
  const collapsed=pull(pose,[100,50],[50,50]);assert.throws(()=>projectDiagramFoldCP(collapsed,pose.sourceDoc,pose.sourceDoc,source),/退化/);
});

test('an F constraint on another physical face does not relax ordinary face self-intersection protection',()=>{
  const doc=blankDoc('分面约束许可',100,100);doc.segments.push(segment('fold',[50,0],[50,100],'V'),segment('left-mark',[20,50],[40,50]));
  const pose=poseOf(doc),next=pull(pose,[100,0],[40,80]);assert.equal(next.result.geometry.faces.length,2);
  assert.throws(()=>projectDiagramFoldCP(next,doc,doc,state(pose)),/翻折或重叠|自交/);
});
