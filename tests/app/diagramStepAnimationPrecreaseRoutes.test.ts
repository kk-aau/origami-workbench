import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance,pointOnSegment} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Point,Segment} from '../../src/core/types';
import {adoptDiagramPose,createDiagramProject,updateDiagramCP,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {validateSimulationStepAnimationStructure} from '../../src/engine/simStepAnimation';

const crease=(id:string,a:Point,b:Point,assignment:'F'|'M'|'V'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
function normalizedShortPrecrease(){
  const before=blankDoc('沿已有长痕重新压出短痕',100,100);
  before.segments.push(crease('old-mark',[50,0],[50,100],'F'));
  let nextId=0,project=createDiagramProject(before,()=>`precrease-route-${++nextId}`);
  const step=project.steps[0],result=computeFlatGeometry(buildDiagramFold(before).graph,1e-6);
  project=adoptDiagramPose(project,step.id,step.beforeId,result);
  project=reconcileDiagramFoldAnnotations(project,step.id,[{
    id:'short-precrease',kind:'line',a:[50,0],b:[50,40],style:'valley',foldAction:'precrease',color:'#000000',width:1,
  }],{enabled:true,layers:'all',selectedFaces:[]});
  return {project,stepId:step.id};
}

test('a normalized long F mark retains its shorter precrease endpoint and enters the flexible path',()=>{
  const {project,stepId}=normalizedShortPrecrease(),saved=structuredClone(project);
  const physical=project.states[1].doc.segments.filter(segment=>segment.assignment!=='B');
  assert.equal(physical.length,1);
  assert.ok([physical[0].a,physical[0].b].some(point=>distance(point,[50,100])<1e-6),'CP normalization merged the short tip into the longer F mark');
  const intent=project.steps[0].foldLink!.precreases![0];
  assert.deepEqual(intent.b,[50,40]);
  const clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  assert.ok(clip.animation.flexRequest,'finite precrease must reach the flexible fallback');
  assert.doesNotThrow(()=>validateSimulationStepAnimationStructure(clip.animation,prepared,simulationSourceSignature(clip.fold)));
  const moving=clip.animation.ranges.filter(range=>range.viaAngle!==undefined);
  assert.ok(moving.length);
  let covered=0;
  for(const range of moving){
    assert.equal(range.fromAngle,0);assert.equal(range.toAngle,0);assert.equal(range.viaAngle,180);
    const [a,b]=prepared.edgesVertices[range.edge].map(vertex=>{
      const point=prepared.fold.vertices_coords[vertex];return [point[0],-point[2]] as Point;
    });
    assert.ok(pointOnSegment(a,intent)&&pointOnSegment(b,intent),'the old mark past the finite tip must stay inactive');
    covered+=distance(a,b);
  }
  assert.ok(Math.abs(covered-40)<1e-6);
  assert.deepEqual(clip.finalGeometry!.geometry.vertices,clip.initialGeometry!.geometry.vertices);
  for(const [edge,assignment] of clip.fold.edges_assignment.entries())if(assignment==='B'){
    const points=clip.fold.edges_vertices[edge].map(vertex=>clip.fold.vertices_coords[vertex]);
    assert.ok([0,1].some(axis=>[0,100].some(value=>points.every(point=>Math.abs(point[axis]-value)<1e-6))),'boundary edges remain on the original paper outline');
  }
  assert.deepEqual(project,saved);
});

test('partially overlapping opposite precrease intents still report the assignment conflict',()=>{
  const {project,stepId}=normalizedShortPrecrease(),settings=project.steps[0].foldLink!;
  const conflicting=updateDiagramFoldLink(project,stepId,{...settings,precreases:[
    crease('valley',[50,0],[50,40],'V'),crease('mountain',[50,20],[50,60],'M'),
  ]});
  assert.throws(()=>buildDiagramStepAnimation(conflicting,stepId),/同一预折痕具有相反的折叠方向/);
});

test('precrease endpoint subdivision does not permit changing the material boundary',()=>{
  const {project,stepId}=normalizedShortPrecrease(),after=structuredClone(project.states[1].doc);
  after.segments[0].a=[5,0];
  const changed=updateDiagramCP(project,project.steps[0].afterId,after);
  assert.throws(()=>buildDiagramStepAnimation(changed,stepId),/更改纸张边界/);
});
