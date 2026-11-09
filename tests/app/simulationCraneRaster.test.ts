import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {DiagramStepAnimationClip} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planDiagramStepPlayback} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import {simulationStepCameraBounds} from '../../src/engine/simStepCamera';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {DEFAULT_SIMULATION_VIEW} from '../../src/engine/simViewCube';
import {cameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

const settings={frontColor:[1,0,0],backColor:[0,0,1],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;

test('saved crane CP3 → CP4 has stable visible layers during playback, pause and reverse seeking',()=>{
  // Minimal animation input extracted from the reported four-step crane.
  // Its saved full-fold angles include -179.9999999999363 degrees. They must
  // remain unchanged: rendering is not permission to snap the user's geometry.
  const clip=JSON.parse(readFileSync(new URL('../fixtures/craneFourthStepAnimation.json',import.meta.url),'utf8')) as DiagramStepAnimationClip;
  const input=JSON.stringify(clip);
  const plan=planDiagramStepPlayback(clip.fold,{...clip.animation,collisionPolicy:'allow',motionPolicy:'allow-dynamic'},undefined,{initialGeometry:clip.initialGeometry,initialContactOrder:clip.initialContactOrder});
  const animation=plan.animation,{prepared}=prepareSimulationDocument(plan.fold??clip.fold);
  assert.equal(plan.method,'sequential');
  assert.equal(prepared.vertexCount,33,'keep the original material grid');
  assert.deepEqual(animation.ranges,clip.animation.ranges,'keep the saved folding angles');
  const path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!);
  // An independent contact-limit oracle: these saved angles approach the
  // same exact half-turn pose. Compare panel interiors, not raster boundaries.
  const halfTurn=(a:number)=>Math.abs(Math.abs(a)-180)<1e-8?Math.sign(a)*180:a;
  const ideal={...animation,ranges:animation.ranges.map(r=>({...r,fromAngle:halfTurn(r.fromAngle),toAngle:halfTurn(r.toAngle)})),motion:{...animation.motion!,phases:animation.motion!.phases.map(p=>({...p,fromAngles:p.fromAngles.map(halfTurn),toAngles:p.toAngles.map(halfTurn)})),knots:animation.motion!.knots.map(k=>({...k,angles:k.angles.map(halfTurn)}))}};
  const referencePath=createSimulationStepPathEvaluator(prepared,ideal,ideal.motion);
  const frame=simulationStepCameraBounds(prepared,animation),raster=new SimulationRasterizer();
  const reverse=Array.from({length:prepared.indices.length/3},(_,i)=>i).reverse();
  const reversed={...prepared,indices:Uint32Array.from(reverse.flatMap(t=>Array.from(prepared.indices.slice(t*3,t*3+3))))};
  for(const view of [DEFAULT_SIMULATION_VIEW,{yaw:0,pitch:0,zoom:.88},{yaw:0,pitch:Math.PI,zoom:.88}]){
    const camera=cameraUniforms(view,frame.center,frame.radius,480,320),seen=new Map<number,Uint8ClampedArray>();
    for(const progress of [0,.25,.5,.74,.9,.99,1,.74,1]){
      const positions=path.evaluate(progress),saved=positions.slice();
      const rows=simulationStepLayerOrderAt(prepared,animation,animation.layerTimeline!,progress,positions);
      const pixels=raster.render(positions,prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:rows}).slice();
      assert.deepEqual(raster.render(positions,reversed,camera,settings,undefined,{triangleSourceFaces:reverse.map(t=>prepared.triangleSourceFaces![t]),faceOrders:rows}),pixels,`draw order at ${progress}, pitch ${view.pitch}`);
      const expected=raster.render(referencePath.evaluate(progress),prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:rows});
      let interior=0;
      for(let y=1;y<camera.height-1;y++)for(let x=1;x<camera.width-1;x++){
        const p=(y*camera.width+x)*4;
        if(expected[p+1]!==0||[p-4,p+4,p-camera.width*4,p+camera.width*4].some(q=>expected[q+1]!==0||expected[q]!==expected[p]))continue;
        assert.equal(pixels[p],expected[p],`visible paper interior at ${progress}, pixel ${p/4}, pitch ${view.pitch}`);interior++;
      }
      assert.ok(interior>500);
      if(seen.has(progress))assert.deepEqual(pixels,seen.get(progress),'pause and seek must display the same frame');
      seen.set(progress,pixels);
      assert.deepEqual(positions,saved);
    }
  }
  assert.equal(JSON.stringify(clip),input,'the imported engineering data is untouched');
});
