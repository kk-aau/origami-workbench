import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance,polygonArea} from '../../src/core/geometry';
import type {Point} from '../../src/core/types';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {materialDoc} from '../fixtures/materialModel';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {prepareDiagramPaperAnchors,diagramPaperEditResult,diagramPaperVertices,moveDiagramPaperVertices,validateDiagramPaperDeformation,alignDiagramPaperAnchors} from '../../src/app/diagramPaperDeformation';
import {createDiagramProject,adoptDiagramPose,updateDiagramPaperPose,updateDiagramPoseResult,updateDiagramFoldLink,exportDiagramProject,importDiagramProject,validateDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {recordDiagramPaperPull,switchDiagramPaperState,isDiagramPaperPoseIsometric,initializeDiagramPaperStates} from '../../src/app/diagramPaperState';
import {modelProjection} from '../../src/app/modelProjection';
import {defaultModelView} from '../../src/app/modelViewState';
import {projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import {reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';

const close=(actual:Point,expected:Point)=>assert.ok(distance(actual,expected)<1e-6,`${actual} != ${expected}`);
function fixture(folded=true){
  const doc=blankDoc('本步折线节点扯角',100,100);
  if(folded)doc.segments.push({id:'half-fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready');
  let n=0,project=createDiagramProject(doc,()=>`deformation-${++n}`);const id=project.steps[0].id;
  project=adoptDiagramPose(project,id,project.steps[0].beforeId,result);
  return {project,id,pose:project.steps[0].pose!};
}
function anchored(pose:DiagramPose,point:Point=[50,50],faces=[0]){return prepareDiagramPaperAnchors(pose,[{point,faces}]);}
function moveNode(pose:DiagramPose,point:Point,offset=0){const index=pose.result.geometry.vertices.length+offset;return moveDiagramPaperVertices(pose,{group:[index],selected:[index]},point);}

test('a new crease endpoint on the folded hinge becomes a per-material drag node without changing CP or solver topology',()=>{
  const {pose}=fixture(),before=structuredClone(pose),next=anchored(pose,[50,50],[0,1]),mesh=diagramIllustrationMesh(next),count=pose.result.geometry.vertices.length;
  assert.equal(next.paperDeformation!.nodes.length,2);
  for(let face=0;face<2;face++){
    const index=count+face;close(next.paperDeformation!.nodes[face].cp,[50,50]);close(mesh.vertices[index],[50,50]);
    assert.ok(mesh.triangles[face].some(t=>t.includes(index)));
    assert.ok(mesh.rings[face][0].includes(index));
    assert.ok(mesh.triangles[1-face].every(t=>!t.includes(index)));
  }
  assert.deepEqual(mesh.graph.faces_vertices,mesh.baseGraph.faces_vertices);
  assert.deepEqual(mesh.graph.edges_vertices,mesh.baseGraph.edges_vertices);
  assert.deepEqual(next.result,pose.result);assert.deepEqual(next.sourceDoc,pose.sourceDoc);assert.deepEqual(pose,before);
  assert.ok(isDiagramPaperPoseIsometric(next));
});

test('an operation crease endpoint can be pulled immediately on the before pose while its after CP remains unchanged',()=>{
  let {project,id}=fixture();project=updateDiagramFoldLink(project,id,{enabled:true,layers:'selected',selectedFaces:[0]});
  project=reconcileDiagramFoldAnnotations(project,id,[{id:'this-step-fold',kind:'line',a:[0,50],b:[50,50],style:'valley',color:'#293d35',width:.7,foldFaces:[0]}]);
  const step=project.steps[0],source=project.states.find(s=>s.id===step.beforeId)!,after=project.states.find(s=>s.id===step.afterId)!,states=structuredClone(project.states);
  const preview=projectDiagramFoldCP(step.pose!,source.doc,after.doc,source).preview,prepared=prepareDiagramPaperAnchors(step.pose!,preview.flatMap(line=>[line.a,line.b].map(point=>({point,faces:[line.face]}))));
  const offset=prepared.paperDeformation!.nodes.findIndex(n=>distance(n.cp,[50,50])<1e-6);assert.ok(offset>=0);
  const moved=moveNode(prepared,[55,55],offset),next=recordDiagramPaperPull(refreshDiagramFoldDrawing(updateDiagramPaperPose(project,id,moved),id),id,prepared,[]);
  assert.deepEqual(next.states,states);assert.deepEqual(next.steps[0].pose!.sourceDoc,source.doc);
  assert.ok(next.steps[0].annotations!.some(a=>a.kind==='line'&&(distance(a.a,[55,55])<1e-6||distance(a.b,[55,55])<1e-6)));
  assert.equal(next.steps[0].pose!.result.geometry.vertices.length,step.pose!.result.geometry.vertices.length);
});

test('moving one coincident material node changes its outline and local cells while the other bank and base vertices stay fixed',()=>{
  const {pose}=fixture(),flat=anchored(pose,[50,50],[0,1]),count=pose.result.geometry.vertices.length,moved=moveNode(flat,[60,55]),mesh=diagramIllustrationMesh(moved);
  close(mesh.vertices[count],[60,55]);close(mesh.vertices[count+1],[50,50]);
  assert.deepEqual(moved.result.geometry.vertices,pose.result.geometry.vertices);
  assert.deepEqual(moved.result.geometry.faces,pose.result.geometry.faces);
  assert.deepEqual(moved.sourceDoc,pose.sourceDoc);assert.equal(isDiagramPaperPoseIsometric(moved),false);
  const edit=diagramPaperEditResult(moved);assert.equal(edit.geometry.vertices.length,count+2);assert.ok(edit.geometry.faces[0].includes(count));
  assert.ok(!edit.geometry.faces[1].includes(count));
  assert.equal(moved.result.layers.status,'unknown');
});

test('endpoint binding on a rotated back view retains source identity and the base-model projection center',()=>{
  const {pose}=fixture();pose.view={...defaultModelView(),side:'back',rotation:37};
  const projection=modelProjection(pose.result.geometry.vertices,true,37),next=anchored(pose,projection.project([50,50]),[0]);
  assert.equal(next.paperDeformation!.nodes.length,1);close(next.paperDeformation!.nodes[0].cp,[50,50]);close(next.paperDeformation!.nodes[0].point,[50,50]);
  assert.equal(prepareDiagramPaperAnchors(next,[{point:projection.project([50,50]),faces:[0]}]),next,'same material endpoint reuses the stored anchor');
  assert.equal(prepareDiagramPaperAnchors(pose,[{point:projection.project(pose.result.geometry.vertices[0]),faces:[0]}]),pose,'existing CP vertices keep their original IDs');
});

test('a mixed original-vertex and illustration-node selection preserves the base snapshot contract',()=>{
  const {pose}=fixture(false),flat=anchored(pose),index=pose.result.geometry.vertices.length;
  const next=moveDiagramPaperVertices(flat,{group:[0,index],selected:[0,index]},[-5,-10]);
  close(next.result.geometry.vertices[0],[-5,-10]);close(diagramPaperVertices(next)[index],[-5,-10]);
  assert.equal(next.result.geometry.vertices.length,pose.result.geometry.vertices.length);assert.deepEqual(next.result.geometry.graph!.edges_vertices,pose.result.geometry.graph!.edges_vertices);
});

test('saving and reopening keeps material anchor IDs and positions without extending any CP state or model snapshot',()=>{
  const {project,id,pose}=fixture(),flat=anchored(pose,[50,50],[0,1]),moved=moveNode(flat,[60,55]),states=structuredClone(project.states);
  const next=updateDiagramPaperPose(project,id,moved),loaded=importDiagramProject(exportDiagramProject(next));
  assert.deepEqual(loaded.states,states);assert.deepEqual(loaded.steps[0].pose!.paperDeformation,moved.paperDeformation);
  assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,pose.result.geometry.vertices);
  assert.equal(diagramPaperEditResult(loaded.steps[0].pose!).geometry.vertices.length,pose.result.geometry.vertices.length+2);
  assert.throws(()=>updateDiagramPoseResult(project,id,diagramPaperEditResult(moved)),/拓扑/);
  assert.deepEqual(project.states,states);assert.equal(project.steps[0].pose!.paperDeformation,undefined);
});

test('flat and pulled switches retain the node layout and exact original flat locations after save and reopen',()=>{
  const {project,id,pose}=fixture(),flat=anchored(pose,[50,50],[0,1]),moved=moveNode(flat,[60,55]),next=recordDiagramPaperPull(updateDiagramPaperPose(project,id,moved),id,flat,[]);
  let current=importDiagramProject(exportDiagramProject(next));
  for(let i=0;i<3;i++){
    current=switchDiagramPaperState(current,id,'flat');assert.ok(isDiagramPaperPoseIsometric(current.steps[0].pose!));close(current.steps[0].pose!.paperDeformation!.nodes[0].point,[50,50]);
    current=switchDiagramPaperState(current,id,'pulled');close(current.steps[0].pose!.paperDeformation!.nodes[0].point,[60,55]);
  }
  assert.deepEqual(current.states,project.states);assert.equal(current.steps[0].pose!.result.geometry.vertices.length,pose.result.geometry.vertices.length);
});

test('adding a crease endpoint after a legacy pull backfills the flat archive from its own original material map',()=>{
  const {project,id,pose}=fixture(false),first=moveDiagramPaperVertices(pose,{group:[1],selected:[1]},[110,-10]);
  let next=recordDiagramPaperPull(updateDiagramPaperPose(project,id,first),id,pose,[]),current=next.steps[0].pose!,mesh=diagramIllustrationMesh(current);
  // Source [50,50] lies on the unchanged diagonal in this ordinary rectangle.
  const flatWithNode=anchored(pose),[oldWithNode]=alignDiagramPaperAnchors(current,flatWithNode);
  const prepared=anchored(current,oldWithNode.paperDeformation!.nodes[0].point),pulled=moveNode(prepared,[55,60]);
  next=recordDiagramPaperPull(updateDiagramPaperPose(next,id,pulled),id,prepared,[]);
  assert.equal(mesh.baseGraph.vertices_coords.length,pose.result.geometry.vertices.length);
  const paper=next.steps[0].paperStates!;close(paper.flat.paperDeformation!.nodes[0].point,[50,50]);close(paper.pulled.paperDeformation!.nodes[0].point,[55,60]);
  assert.ok(isDiagramPaperPoseIsometric(paper.flat));assert.doesNotThrow(()=>validateDiagramProject(next));
  const initialized=initializeDiagramPaperStates(project,id,pose,pulled,'pulled',[]);assert.equal(initialized.steps[0].paperStates!.flat.paperDeformation!.nodes.length,1);
});

test('strict anchor metadata rejects invalid face identity, duplicate nodes, source vertices, nonfinite coordinates and extra fields',()=>{
  const {pose}=fixture(false),next=anchored(pose),node=next.paperDeformation!.nodes[0];
  for(const nodes of [[{...node,face:2}],[node,{...node}],[{...node,cp:[0,0]}],[{...node,point:[Infinity,50]}],[{...node,cp:[110,50]}],[{...node,unexpected:true}]]){
    const invalid={...pose,paperDeformation:{nodes}} as DiagramPose;assert.throws(()=>validateDiagramPaperDeformation(invalid));
  }
  assert.throws(()=>validateDiagramPaperDeformation({...pose,paperDeformation:{nodes:[],unexpected:true}} as DiagramPose));
});

test('new material nodes retain the ordinary rejection of degenerate and self-intersecting paper maps',()=>{
  const {pose}=fixture(),flat=anchored(pose),source={id:pose.sourceStateId,revision:pose.sourceRevision,doc:pose.sourceDoc};
  for(const point of [[0,0],[-10,50]] as Point[]){
    const moved=moveNode(flat,point);
    assert.throws(()=>projectDiagramFoldCP(moved,pose.sourceDoc,pose.sourceDoc,source),/退化|自交|翻折|重叠/);
  }
});

test('nearly equal material anchors align to exactly the same source layout before following artwork',()=>{
  const {pose}=fixture(false),previous=anchored(pose),next={...pose,paperDeformation:{nodes:[{...previous.paperDeformation!.nodes[0],cp:[50+1e-8,50] as Point,point:[55,60] as Point}]}};
  const [a,b]=alignDiagramPaperAnchors(previous,next),old=diagramIllustrationMesh(a),current=diagramIllustrationMesh(b);
  assert.deepEqual(old.graph.vertices_coords,current.graph.vertices_coords);assert.deepEqual(old.triangles,current.triangles);
  close(b.paperDeformation!.nodes[0].point,[55,60]);
});

test('a hole-boundary anchor refines only its own outline while the original hole and material incidence remain intact',()=>{
  const points:Point[]=[[0,0],[100,0],[100,100],[0,100],[40,40],[60,40],[60,60],[40,60]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const graph=materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],[[[4,7,6,5]]],[[[7,6,5,4]]]),doc=materialDoc(graph,points),result=computeFlatFold(doc),pose:DiagramPose={sourceStateId:'hole',sourceRevision:0,sourceDoc:doc,result};
  assert.equal(result.geometry.status,'ready');
  const next=anchored(pose,[50,40]),mesh=diagramIllustrationMesh(next),index=result.geometry.vertices.length;
  assert.ok(mesh.rings[0][1].includes(index));assert.deepEqual(mesh.graph.faces_holes,graph.faces_holes);
  const area=mesh.triangles[0].reduce((sum,t)=>sum+Math.abs(polygonArea(t.map(v=>mesh.graph.vertices_coords[v]))),0);assert.ok(Math.abs(area-9600)<1e-6);
  const invalid={...pose,paperDeformation:{nodes:[{face:0,cp:[50,50] as Point,point:[50,50] as Point}]}};assert.throws(()=>validateDiagramPaperDeformation(invalid),/孔洞/);
  assert.deepEqual(next.result.geometry.graph!.faces_edges,result.geometry.graph!.faces_edges);
});
