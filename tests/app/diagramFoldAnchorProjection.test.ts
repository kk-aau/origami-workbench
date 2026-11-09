import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {prepareDiagramPaperAnchors,moveDiagramPaperVertices} from '../../src/app/diagramPaperDeformation';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {applyDiagramFoldSegments,projectDiagramFoldCP,mapDiagramFoldLines,pickDiagramFoldAnchor,diagramFoldFacesAtPoint} from '../../src/app/diagramFoldLink';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {Point,Segment} from '../../src/core/types';

const segment=(a:Point,b:Point):Segment=>({id:'current-step-line',a,b,assignment:'V',angle:180});
function fixture(){
  const doc=blankDoc('图示锚点投影',100,100),result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready');
  const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()};
  return {doc,pose};
}
const close=(points:Point[],target:Point)=>assert.ok(points.some(p=>distance(p,target)<1e-6),`missing projected endpoint ${target}`);

test('an undeformed new drawing endpoint keeps the original CP identity and rigid mapping',()=>{
  const {doc,pose}=fixture(),anchored=prepareDiagramPaperAnchors(pose,[{point:[50,50],faces:[0]}]),after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]),saved=structuredClone(anchored);
  assert.equal(anchored.paperDeformation!.nodes.length,1);
  assert.deepEqual(projectDiagramFoldCP(anchored,doc,after).preview,projectDiagramFoldCP(pose,doc,after).preview);
  assert.doesNotThrow(()=>pickDiagramFoldAnchor(anchored,[20,20],0));
  assert.doesNotThrow(()=>mapDiagramFoldLines(anchored,[],{enabled:true,layers:'top',selectedFaces:[]}));
  assert.deepEqual(anchored,saved);
});

test('moving only an interior drawing anchor bends the projected crease without extending the solver snapshot or CP',()=>{
  const {doc,pose}=fixture(),flat=prepareDiagramPaperAnchors(pose,[{point:[50,50],faces:[0]}]),count=pose.result.geometry.vertices.length,moved=moveDiagramPaperVertices(flat,{group:[count],selected:[count]},[60,55]);
  const after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]),savedPose=structuredClone(moved),savedAfter=structuredClone(after),parts=projectDiagramFoldCP(moved,doc,after).preview,points=parts.flatMap(p=>[p.a,p.b]);
  for(const target of [[50,0],[60,55],[50,100]] as Point[])close(points,target);
  assert.ok(parts.every(p=>p.face===0&&p.visibility==='visible'));
  assert.deepEqual(moved.result.geometry.vertices,pose.result.geometry.vertices);assert.deepEqual(moved.result.geometry.faces,pose.result.geometry.faces);assert.deepEqual(moved.sourceDoc,pose.sourceDoc);
  assert.deepEqual(moved,savedPose);assert.deepEqual(after,savedAfter);
  assert.throws(()=>pickDiagramFoldAnchor(moved,[20,20],0),/非等距/);
  assert.throws(()=>mapDiagramFoldLines(moved,[],{enabled:true,layers:'all',selectedFaces:[]}),/非等距/);
});

test('a pulled boundary anchor refines the actual paper outline and carries its CP endpoint',()=>{
  const {doc,pose}=fixture(),flat=prepareDiagramPaperAnchors(pose,[{point:[50,0],faces:[0]}]),count=pose.result.geometry.vertices.length,moved=moveDiagramPaperVertices(flat,{group:[count],selected:[count]},[50,-20]);
  const mesh=diagramIllustrationMesh(moved),after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]),parts=projectDiagramFoldCP(moved,doc,after).preview;
  assert.ok(mesh.rings[0][0].includes(count));close(parts.flatMap(p=>[p.a,p.b]),[50,-20]);
  assert.deepEqual(diagramFoldFacesAtPoint(moved,[50,-10]),[0]);
  assert.deepEqual(moved.result.geometry.vertices,pose.result.geometry.vertices);assert.deepEqual(moved.sourceDoc,doc);
  assert.throws(()=>pickDiagramFoldAnchor(moved,[20,20],0),/非等距/);
});

test('anchor-only deformation uses the base model center on a rotated back-side projection',()=>{
  const {doc,pose}=fixture();pose.view={...defaultModelView(),side:'back',rotation:37};
  const camera=modelProjection(pose.result.geometry.vertices,true,37),flat=prepareDiagramPaperAnchors(pose,[{point:camera.project([50,0]),faces:[0]}]),count=pose.result.geometry.vertices.length;
  const moved=moveDiagramPaperVertices(flat,{group:[count],selected:[count]},[60,-20]),after=applyDiagramFoldSegments(doc,[segment([50,0],[50,100])]),parts=projectDiagramFoldCP(moved,doc,after).preview;
  const points=parts.flatMap(p=>[p.a,p.b]);close(points,camera.project([60,-20]));close(points,camera.project([50,100]));
  assert.ok(parts.every(p=>p.assignment==='M'));
});

test('one bank-specific boundary anchor cannot pull the coincident endpoint of another material face',()=>{
  const doc=blankDoc('分层锚点投影',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'}),pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:structuredClone(doc),result};
  assert.equal(result.geometry.status,'ready');
  const flat=prepareDiagramPaperAnchors(pose,[{point:[50,50],faces:[0,1]}]),count=result.geometry.vertices.length,moved=moveDiagramPaperVertices(flat,{group:[count],selected:[count]},[60,55]);
  const after=applyDiagramFoldSegments(doc,[segment([25,50],[50,50])]),parts=projectDiagramFoldCP(moved,doc,after).preview.filter(p=>p.face===0);
  close(parts.flatMap(p=>[p.a,p.b]),[60,55]);assert.deepEqual(moved.paperDeformation!.nodes[1].point,flat.paperDeformation!.nodes[1].point);assert.deepEqual(moved.result.geometry.vertices,pose.result.geometry.vertices);
});
