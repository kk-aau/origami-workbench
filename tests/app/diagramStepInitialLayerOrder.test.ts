import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {polygonArea} from '../../src/core/geometry';
import {buildDiagramPoseFold} from '../../src/app/diagramFoldGeometry';
import {buildDiagramSpatialStepAnimation} from '../../src/app/diagramSpatialStepAnimation';
import {planDiagramStepPlayback} from '../../src/engine/simStepPlanning';
import {DEFAULT_SIMULATION_VIEW} from '../../src/engine/simViewCube';
import {viewRotationFor} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

test('new material subfaces inherit the main drawing selected initial paper-side order',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture(),pose=project.steps[0].pose!;
  pose.result=recomputeFlatLayers(pose.result);assert.equal(pose.result.layers.status,'solved');
  const saved=structuredClone(project),clip=buildDiagramStepAnimation(project,stepId),initial=clip.initialGeometry!;
  assert.equal(initial.layers.status,'solved');assert.ok(initial.layers.faceOrders!.length>=2,'the new corner divides one parent into multiple material subfaces');
  const source=buildDiagramPoseFold(pose).graph,parents=clip.fold.faces_vertices!.map(face=>{
    const x=face.reduce((sum,v)=>sum+clip.fold.vertices_coords[v][0],0)/face.length;
    return source.faces_vertices!.findIndex(f=>(f.reduce((sum,v)=>sum+source.vertices_coords[v][0],0)/f.length>50)===(x>50));
  });
  for(const [a,b,sign] of initial.layers.faceOrders!){
    const row=pose.result.layers.faceOrders!.find(([first,second])=>first===parents[a]&&second===parents[b]);assert.ok(row);
    const p=Math.sign(polygonArea(pose.result.geometry.faces[row[1]].map(v=>pose.result.geometry.vertices[v]))),c=Math.sign(polygonArea(initial.geometry.faces[b].map(v=>initial.geometry.vertices[v])));
    assert.equal(sign,row[2]*p*c,'daughter order keeps the selected material normal, including reflected parents');
  }
  assert.deepEqual(project,saved,'mapping selected layer orders never writes into the drawing');
});

test('the spatial and bendable planners inherit the same selected stack when a step starts flat',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture(),pose=project.steps[0].pose!;
  pose.result=recomputeFlatLayers(pose.result);
  const flat=buildDiagramStepAnimation(project,stepId);
  assert.ok(flat.initialGeometry!.layers.faceOrders!.length>=2);
  for(const bendable of [false,true]){
    const spatial=buildDiagramSpatialStepAnimation(project,stepId,{bendable});
    assert.deepEqual(spatial.initialContactOrder?.faceOrders,flat.initialGeometry!.layers.faceOrders);
  }
});

test('a manually ordered drawing seeds only its visible overlaps even when the solver certificate is absent',()=>{
  const {project,stepId,topFace,lowerFace}=diagramSingleLayerCornerFixture(),pose=project.steps[0].pose!;
  pose.result.layers={status:'unknown',message:''};
  const build=(order:number[])=>{
    pose.displayOrder=order;
    const flat=buildDiagramStepAnimation(project,stepId),spatial=buildDiagramSpatialStepAnimation(project,stepId,{bendable:true});
    assert.deepEqual(flat.initialDisplayOrder,spatial.initialDisplayOrder);
    assert.equal(flat.initialGeometry!.layers.status,'unknown');
    const planned=planDiagramStepPlayback(flat.fold,flat.animation,undefined,flat);
    return planned.animation.layerTimeline![0].faceOrders;
  };
  const first=build([lowerFace,topFace]),second=build([topFace,lowerFace]);
  assert.ok(first.length>=2);
  assert.deepEqual(first.map(([a,b,sign])=>[a,b,-sign]),second);
  assert.equal(pose.result.layers.status,'unknown');
});

test('flat and bendable previews start on the drawing side and carry its screen rotation',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture(),step=project.steps[0];
  step.pose!.view!.side='back';step.pose!.view!.rotation=90;
  const front=viewRotationFor(DEFAULT_SIMULATION_VIEW);
  for(const clip of [buildDiagramStepAnimation(project,stepId),buildDiagramSpatialStepAnimation(project,stepId,{bendable:true})]){
    assert.ok(clip.camera);
    const r=viewRotationFor(clip.camera);
    assert.ok(r[7]<0,'camera looks at the other side of the folded paper');
    const mirroredAxes=[-1,-1,1];
    for(let k=0;k<3;k++){
      assert.ok(Math.abs(r[k]-front[k+3]*mirroredAxes[k])<1e-10);
      assert.ok(Math.abs(r[k+3]+front[k]*mirroredAxes[k])<1e-10);
    }
  }
});
