import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDiagramFold,epsilonFor} from '../../src/core/geometry';
import {solveRigidFoldGeometry} from '../../src/core/rigidFoldGeometry';
import {projectDiagramSpatialPoint} from '../../src/app/diagramSpatialPose';
import {coincidentFoldMotion} from '../../src/app/diagramCoincidentFoldMotion';
import {projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import {diagramFoldPreviewDrawingOrder,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramBoundaryFoldOffsets} from '../../src/app/diagramBoundaryOverlay';
import {blankDoc} from '../../src/app/state';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {Doc,Point} from '../../src/core/types';

const fixture=()=>JSON.parse(fs.readFileSync(new URL('../fixtures/coincidentCreaseMotion1122.json',import.meta.url),'utf8')) as {before:Doc;after:Doc};
function poseOf(doc:Doc):DiagramPose {
  const graph=buildDiagramFold(doc).graph,solved=solveRigidFoldGeometry(graph);assert.equal(solved.status,'ready',solved.message);
  if(solved.status!=='ready')throw Error(solved.message);
  const camera={yaw:-15,elevation:15},vertices=solved.vertices.map(p=>projectDiagramSpatialPoint(p,camera).slice(0,2) as Point);
  // Explicit illustration ordering exercises display behavior without claiming
  // that an isolated crop can inherit the complete work's contact certificates.
  return {sourceStateId:'before',sourceRevision:0,sourceDoc:doc,
    result:{geometry:{status:'ready',message:'fixture',vertices,faces:solved.faces,graph:{...graph,vertices_coords:vertices}},layers:{status:'unknown',message:'fixture illustration order'},warnings:[]},
    spatial:{version:1,vertices:solved.vertices,faceTransforms:solved.faceTransforms,measuredAngles:solved.measuredAngles,camera},displayOrder:[...solved.faces.keys()]};
}
const motion=(before:Doc,after:Doc)=>coincidentFoldMotion(buildDiagramFold(before).graph,buildDiagramFold(after).graph,epsilonFor(before));

test('57B crop keeps four surface spans, suppresses twelve repeated bank spans, and never edits material state',()=>{
  const {before,after}=fixture(),pose=poseOf(before),saved=structuredClone({before,after,pose});
  for(const side of ['front','back'] as const)for(const rotation of [0,37]){
    const viewed={...pose,view:{side,rotation}},preview=projectDiagramFoldCP(viewed,before,after).preview.filter(p=>!p.existing);
    assert.equal(preview.length,16);
    const drawn=diagramFoldPreviewDrawingOrder(preview);assert.equal(drawn.length,4);
    assert.equal(preview.filter(p=>p.redundantFold).length,12);
    assert.equal(diagramFoldPreviewDrawingOrder(preview,{xray:true}).length,16);
    assert.equal(diagramFoldPreviewDrawingOrder(preview,{cutaway:true}).length,16);
    const svg=drawingSVG(viewed,[],'','',preview);
    assert(!svg.includes('data-diagram-boundary-fold-hint="true"'));
  }
  assert.deepEqual({before,after,pose},saved);
});

test('0→90 surface and 90→180 inner hinges have equal continuous motion despite opposite visible M/V',()=>{
  const {before,after}=fixture(),model=motion(before,after);assert(model);
  assert(model.equivalent({a:[25,25],b:[12.5,25]},{a:[37.5,12.5],b:[37.5,0]}));
  assert(model.equivalent({a:[75,25],b:[87.5,25]},{a:[62.5,12.5],b:[62.5,0]}));
  assert(!model.equivalent({a:[25,25],b:[12.5,25]},{a:[62.5,12.5],b:[62.5,0]}));
  for(const doc of [before,after])doc.segments=doc.segments.map(s=>({...s,a:s.b,b:s.a}));
  assert(motion(before,after)?.equivalent({a:[12.5,25],b:[25,25]},{a:[37.5,0],b:[37.5,12.5]}));
});

function stacked(angle=90,opposite=false,depth=false){
  const before=blankDoc('two overlapping banks',100,100);
  before.segments.push({id:'old',a:[50,0],b:[50,100],assignment:'V',angle:depth?90:180});
  const after=structuredClone(before);
  after.segments.push({id:'left',a:[0,40],b:[50,40],assignment:'M',angle:-angle},
    {id:'right',a:[50,40],b:[100,40],assignment:opposite?'M':'V',angle:opposite?-angle:angle});
  return {before,after};
}
const left={a:[0,40] as Point,b:[50,40] as Point},right={a:[50,40] as Point,b:[100,40] as Point};

test('equal end positions at ±180 never hide opposite-direction paths; different world axes stay independent',()=>{
  const good=stacked();assert(motion(good.before,good.after)?.equivalent(left,right));
  const opposite=stacked(180,true),model=motion(opposite.before,opposite.after);
  assert(!model?.equivalent(left,right));
  assert(projectDiagramFoldCP(poseOf(opposite.before),opposite.before,opposite.after).preview.every(p=>!p.redundantFold));
  const depth=stacked(90,false,true);assert(!motion(depth.before,depth.after)?.equivalent(left,right));
});

test('unknown angles preserve internal instructions',()=>{
  const {before,after}=stacked();after.segments.at(-1)!.angle=null;
  assert.equal(motion(before,after),null);
  const preview=projectDiagramFoldCP(poseOf(before),before,after).preview;
  assert(preview.every(p=>!p.redundantFold));
});

test('an in-place target edit invalidates the cached motion proof',()=>{
  const {before,after}=stacked(),pose=poseOf(before);
  assert(projectDiagramFoldCP(pose,before,after).preview.some(p=>p.redundantFold));
  after.segments.at(-1)!.assignment='M';after.segments.at(-1)!.angle=-90;
  assert(projectDiagramFoldCP(pose,before,after).preview.every(p=>!p.redundantFold));
});

test('synchronous buried folds stay hidden while the complete visible surface crease receives its required inset',()=>{
  const {before,after}=fixture(),pose=poseOf(before);
  const active=projectDiagramFoldCP(pose,before,after).preview.filter(p=>!p.existing);
  const visible=diagramFoldPreviewDrawingOrder(active);assert.equal(visible.length,4);
  const part=visible[0],dx=part.b[0]-part.a[0],dy=part.b[1]-part.a[1],length=Math.hypot(dx,dy);
  const normal:Point=[-dy/length,dx/length];
  const boundary={markup:'',byFace:new Map([[part.face,[{a:part.a,b:part.b,inward:normal}]]]),visiblePaper:()=>'<rect x="-1000" y="-1000" width="2000" height="2000"/>'};
  const offsets=diagramBoundaryFoldOffsets(boundary,visible);
  assert.equal(active.filter(p=>p.redundantFold).length,12);
  assert.equal(offsets.size,2,'both halves move even though only one half touches the outline');
  assert.equal(new Set(offsets.values()).size,1,'both halves use exactly one offset plan');
});
