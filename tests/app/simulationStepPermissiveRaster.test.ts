import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramFourthCornerColorFixture,diagramOverlappingTriangleColorFixture} from '../fixtures/simulationStepColors';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {DEFAULT_SIMULATION_VIEW} from '../../src/engine/simViewCube';
import {simulationPaperColorSettings} from '../../src/engine/simColors';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {cameraUniforms,centroid,boundingRadius} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

const settings={...simulationPaperColorSettings('#FF0000','#0000FF','#222222')!,lightDir:[-.3,.5,1],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;

test('a spatially rotated saved stack keeps its already certified initial paper order',()=>{
 const fixture=diagramOverlappingTriangleColorFixture(),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId);
 const initialGeometry=recomputeFlatLayers(clip.initialGeometry);assert.equal(initialGeometry.layers.status,'solved');assert(initialGeometry.layers.faceOrders?.length);
 const original=clip.animation.initialPositions,rotated=original.map((_,i)=>{const v=i-i%3,x=original[v],y=original[v+1],c=Math.cos(.6),s=Math.sin(.6);return i%3===0?c*x-s*y:i%3===1?s*x+c*y:original[i];});
 const answer=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,initialPositions:rotated,collisionPolicy:'allow'},undefined,{initialContactOrder:{sourceFaceCount:initialGeometry.geometry.faces.length,faceOrders:initialGeometry.layers.faceOrders!}});
 assert.deepEqual(answer.animation.layerTimeline?.[0].faceOrders,initialGeometry.layers.faceOrders);
});

test('allowing intersections preserves the real exterior of an already folded stack without depending on seek or draw order',()=>{
  // This saved diagram has a geometrically valid two-layer triangle but no
  // cached layer solution, as happens when opening an ordinary user project.
  // The two red paper fronts were closed together by the previous valley;
  // only blue backs are exposed during this second, two-layer valley action.
  const fixture=diagramOverlappingTriangleColorFixture(),project=importDiagramProject(exportDiagramProject(fixture.project));
  const clip=buildDiagramStepAnimation(project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold);
  assert.notEqual(clip.initialGeometry.layers.status,'solved','the regression must exercise a saved pose with uncached layer order');
  const animation=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'},undefined,{initialGeometry:clip.initialGeometry}).animation;
  const path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),rest=new OrigamiModel(prepared).originalPositions,center=centroid(rest),radius=boundingRadius(rest,center),raster=new SimulationRasterizer();
  const order=Array.from({length:prepared.indices.length/3},(_,i)=>i).reverse();
  const reversed={...prepared,indices:Uint32Array.from(order.flatMap(t=>Array.from(prepared.indices.slice(t*3,t*3+3))))};
  const reversedSources=order.map(t=>prepared.triangleSourceFaces![t]);
  for(const view of [DEFAULT_SIMULATION_VIEW,{yaw:-.35,pitch:.55,zoom:.88},{yaw:0,pitch:0,zoom:.88},{yaw:0,pitch:Math.PI,zoom:.88}]){
    const camera=cameraUniforms(view,center,radius,480,320),previous=new Map<number,Uint8ClampedArray>();
    for(const progress of [1,.26,0,.99,.5,.01,1,0]){
      const positions=path.evaluate(progress),unchanged=positions.slice(),rows=simulationStepLayerOrderAt(prepared,animation,animation.layerTimeline!,progress);
      const pixels=raster.render(positions,prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:rows}).slice();
      let blue=0,red=0;
      for(let p=0;p<pixels.length;p+=4){if(pixels[p]===255&&pixels[p+1]===0&&pixels[p+2]===0)red++;if(pixels[p]===0&&pixels[p+1]===0&&pixels[p+2]===255)blue++;}
      assert.ok(blue>500,`a real exterior is visible at ${progress}, pitch ${view.pitch}`);
      assert.equal(red,0,`an inner red front must not cover the exposed blue back at ${progress}, pitch ${view.pitch}`);
      const reordered=raster.render(positions,reversed,camera,settings,undefined,{triangleSourceFaces:reversedSources,faceOrders:rows});
      assert.deepEqual(reordered,pixels,`material layer order must remain independent of triangle submission order at ${progress}, pitch ${view.pitch}`);
      if(previous.has(progress))assert.deepEqual(pixels,previous.get(progress),'seeking back to a prior progress must restore the same visible material');
      previous.set(progress,pixels);
      assert.deepEqual(positions,unchanged,'visible-layer correction must never move any solver vertex');
    }
  }
});

test('permissive CP3-to-CP4 folding keeps the newly folded corner above the retained old sheet',()=>{
  for(const side of ['front','back'] as const){
    const fixture=diagramFourthCornerColorFixture(side,37),clip=buildDiagramStepAnimation(importDiagramProject(exportDiagramProject(fixture.project)),fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold);
    const animation=planVerifiedSimulationStepAnimation(clip.fold,{...clip.animation,collisionPolicy:'allow'},undefined,{initialGeometry:clip.initialGeometry}).animation;
    const path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),initial=path.evaluate(0),middle=path.evaluate(.37);
    const moving=prepared.facesVertices.flatMap((face,t)=>face.some(v=>Math.hypot(...[0,1,2].map(k=>middle[v*3+k]-initial[v*3+k]))>1e-7)?[t]:[]);
    assert.equal(moving.length,1,'the known visible corner is one actual moving material triangle');
    const movingIndices=prepared.indices.slice(moving[0]*3,moving[0]*3+3),rest=new OrigamiModel(prepared).originalPositions,center=centroid(rest),radius=boundingRadius(rest,center),raster=new SimulationRasterizer();
    for(const view of [DEFAULT_SIMULATION_VIEW,{yaw:-.35,pitch:.55,zoom:.88},{yaw:0,pitch:0,zoom:.88}]){
      const camera=cameraUniforms(view,center,radius,480,320);
      for(const progress of [0,.99,1,.99,1]){
        const positions=path.evaluate(progress),rows=simulationStepLayerOrderAt(prepared,animation,animation.layerTimeline!,progress);
        const oracle=raster.render(positions,{...prepared,indices:movingIndices},camera,settings).slice();
        const actual=raster.render(positions,prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:rows});
        let checked=0,wrong=0,red=0,blue=0;
        for(let p=0;p<actual.length;p+=4){
          if(actual[p]===255&&actual[p+1]===0&&actual[p+2]===0)red++;
          if(actual[p]===0&&actual[p+1]===0&&actual[p+2]===255)blue++;
          if(oracle[p+1]!==0)continue;
          checked++;if(actual[p]!==oracle[p]||actual[p+1]!==oracle[p+1]||actual[p+2]!==oracle[p+2])wrong++;
        }
        assert.ok(checked>200,'the oracle covers a real moving-corner interior');
        assert.equal(wrong,0,`the top corner must stay visible at ${progress}, drawing side ${side}, pitch ${view.pitch}`);
        if(progress===1){assert.ok(red>200,'the contacted paper front remains visible');assert.ok(blue>1000,'the unchanged paper back remains exposed outside the small folded corner');}
      }
    }
  }
});
