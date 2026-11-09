import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {cameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import type {FoldAssignment} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

test('animation outlines retain boundary weight while the same interior fold uses the finer crease weight',()=>{
  const raster=new SimulationRasterizer(),camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,200,200);
  const positions=new Float32Array([-.7,0,0,.7,0,0]);
  const settings={frontColor:[1,1,1],backColor:[1,1,1],mountainColor:[0,0,0],valleyColor:[0,0,0],borderColor:[0,0,0],background:[1,1,1],showFaces:false,showEdges:true,lighting:false,faceAlpha:1,creaseWidthPx:1,creaseDash:{border:null,mountain:null,valley:null}} as RenderSettings;
  const count=(assignment:FoldAssignment,boundaryWidth?:number)=>{
    const pixels=raster.render(positions,{indices:new Uint32Array(),edgesVertices:[[0,1]],edgesAssignment:[assignment]},camera,settings,undefined,undefined,boundaryWidth);
    let ink=0;for(let p=0;p<pixels.length;p+=4)if(pixels[p]===0)ink++;return ink;
  };
  const fold=count('V');assert.ok(fold>0);
  assert.equal(count('V',3),fold,'changing boundary weight must not thicken a valley crease');
  assert.equal(count('M',3),fold,'mountain and valley have the same fine solid line');
  assert.ok(count('B',3)>fold*1.8,'the same edge becomes a visibly heavier boundary despite pixel-centre quantisation');
});
