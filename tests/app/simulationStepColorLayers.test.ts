import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramOverlappingTriangleColorFixture} from '../fixtures/simulationStepColors';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {DEFAULT_SIMULATION_VIEW} from '../../src/engine/simViewCube';
import {simulationPaperColorSettings} from '../../src/engine/simColors';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {cameraUniforms,centroid,boundingRadius} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

const settings={...simulationPaperColorSettings('#FF0000','#0000FF','#222222')!,lightDir:[-.3,.5,1],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;
const countColors=(image:Uint8ClampedArray)=>{
  let red=0,blue=0;
  for(let p=0;p<image.length;p+=4){if(image[p]===255&&image[p+1]===0&&image[p+2]===0)red++;if(image[p]===0&&image[p+1]===0&&image[p+2]===255)blue++;}
  return {red,blue};
};
function plannedFixture(fixture:ReturnType<typeof diagramOverlappingTriangleColorFixture>){
  const project=importDiagramProject(exportDiagramProject(fixture.project)),clip=buildDiagramStepAnimation(project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const result=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry});
  const animation=result.animation,path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),rest=new OrigamiModel(prepared).originalPositions,center=centroid(rest),radius=boundingRadius(rest,center);
  assert.ok(animation.layerTimeline?.length,'production planning must supply a verified material contact timeline');
  return {clip,prepared,animation,path,center,radius};
}

test('retained folded triangle shows its paper back throughout the second valley fold, from either side',()=>{
  const {prepared,animation,path,center,radius}=plannedFixture(diagramOverlappingTriangleColorFixture()),renderer=new SimulationRasterizer();
  // The first valley fold closes the two red fronts against one another.
  // Both exposed outer sides are blue backs throughout this second action.
  // Thus this oracle does not infer the expected colour from triangle IDs or
  // from the renderer under test: seeing any sizeable red patch is wrong.
  for(const view of [DEFAULT_SIMULATION_VIEW,{yaw:-.35,pitch:.55,zoom:.88},{yaw:0,pitch:0,zoom:.88},{yaw:0,pitch:Math.PI,zoom:.88}]){
    const camera=cameraUniforms(view,center,radius,640,400);
    for(const progress of [0,.01,.26,.5,.99,1]){
      const rows=simulationStepLayerOrderAt(prepared,animation,animation.layerTimeline!,progress);
      assert.ok(rows.length>0,`retained stack order is available at ${progress}`);
      const colors=countColors(renderer.render(path.evaluate(progress),prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:rows}));
      assert.ok(colors.blue>1000,`visible paper exists at ${progress}`);
      assert.equal(colors.red,0,`both exposed paper sides are backs at ${progress}, view ${view.pitch}`);
    }
  }
});

test('verified animation paper colour is independent of prepared triangle draw order',()=>{
  const {prepared,animation,path,center,radius}=plannedFixture(diagramOverlappingTriangleColorFixture()),renderer=new SimulationRasterizer(),camera=cameraUniforms(DEFAULT_SIMULATION_VIEW,center,radius,640,400);
  const triangles=Array.from({length:prepared.indices.length/3},(_,i)=>i).reverse();
  const reversed={...prepared,indices:Uint32Array.from(triangles.flatMap(t=>Array.from(prepared.indices.slice(t*3,t*3+3))))};
  const triangleSourceFaces=triangles.map(t=>prepared.triangleSourceFaces![t]);
  for(const progress of [1,.26,0,.99,.5,.01,1]){
    const rows=simulationStepLayerOrderAt(prepared,animation,animation.layerTimeline!,progress),positions=path.evaluate(progress);
    const original=renderer.render(positions,prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:rows}).slice();
    const changed=renderer.render(positions,reversed,camera,settings,undefined,{triangleSourceFaces,faceOrders:rows});
    assert.deepEqual(changed,original,`material layer order wins over draw order at ${progress}`);
  }
});

test('single-layer corner animation keeps the unaffected exposed top sheet in its back colour',()=>{
  const {prepared,animation,path,center,radius}=plannedFixture(diagramSingleLayerCornerFixture()),renderer=new SimulationRasterizer(),camera=cameraUniforms(DEFAULT_SIMULATION_VIEW,center,radius,640,400);
  // Unpinned neighbours may remain stationary on the verified path. Determine
  // actual motion from interior poses rather than treating every free face as
  // moving and masking away the exposed stationary paper being checked.
  const initial=path.evaluate(0),samples=[path.evaluate(.37),path.evaluate(.61)];
  const moves=(face:readonly number[])=>samples.some(positions=>face.some(v=>Math.hypot(...[0,1,2].map(k=>positions[v*3+k]-initial[v*3+k]))>1e-7));
  const stationaryTop=Uint32Array.from(prepared.facesVertices.flatMap((face,t)=>prepared.triangleSourceFaces![t]===1?Array.from(prepared.indices.slice(t*3,t*3+3)):[]));
  const moving=Uint32Array.from(prepared.facesVertices.flatMap((face,t)=>moves(face)?Array.from(prepared.indices.slice(t*3,t*3+3)):[]));
  assert.ok(prepared.facesVertices.every((face,t)=>prepared.triangleSourceFaces![t]!==1||!moves(face)),'the independent top-sheet oracle is stationary on the actual verified path');
  assert.ok(stationaryTop.length>0&&moving.length>0);
  for(const progress of [1,.26,0,.99,.5,1]){
    const positions=path.evaluate(progress),rows=simulationStepLayerOrderAt(prepared,animation,animation.layerTimeline!,progress);
    const full=renderer.render(positions,prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:rows}).slice();
    const top=renderer.render(positions,{...prepared,indices:stationaryTop},camera,settings).slice();
    const activity=renderer.render(positions,{...prepared,indices:moving},camera,{...settings,frontColor:[0,0,0],backColor:[0,0,0]});
    let checked=0,wrong=0;
    for(let p=0;p<full.length;p+=4)if(top[p+2]===255&&top[p]===0&&activity[p]===255){checked++;if(full[p]!==0||full[p+1]!==0||full[p+2]!==255)wrong++;}
    assert.ok(checked>1000,`enough unaffected top paper sampled at ${progress}`);
    assert.equal(wrong,0,`unmoved exposed top sheet must be blue at ${progress}`);
  }
});
