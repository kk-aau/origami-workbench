import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {SimulationSurfaceLayers,simulationCreasePlaneNormal} from '../../src/engine/simSurfaceLayers';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

test('front and back raster occlusion follow the solved order rather than triangle IDs',()=>{
  const source={vertices_coords:[[-.6,-.6],[.6,-.6],[0,.6],[2.4,-.6],[3.6,-.6],[3,.6]],edges_vertices:[[0,1],[1,2],[2,0],[3,5],[5,4],[4,3]],edges_assignment:Array(6).fill('B'),edges_foldAngle:Array(6).fill(0),faces_vertices:[[0,1,2],[3,5,4]]};
  const {prepared}=prepareSimulationDocument(source),positions=new Float32Array([-.6,0,.6,.6,0,.6,0,0,-.6,-.6,0,.6,.6,0,.6,0,0,-.6]);
  const before=positions.slice(),layers=new SimulationSurfaceLayers(prepared,1),raster=new SimulationRasterizer();
  const settings={frontColor:[1,0,0],backColor:[0,0,1],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;
  const camera={center:[0,0,0] as [number,number,number],rotation:[1,0,0,0,0,1,0,1,0] as const,scale:40,width:96,height:96,depthRange:2,camDist:3.2};
  const pixel=(image:Uint8ClampedArray)=>Array.from(image.slice((48*96+48)*4,(48*96+48)*4+4));
  const frontColours:number[][]=[];
  for(const sign of [-1,1]){
    layers.setLayerOrder({sourceSignature:'fixture',sourceFaceCount:2,faceOrders:[[0,1,sign]]});
    const mesh=layers.build(positions)!;assert.ok(mesh);
    for(const back of [false,true]){
      const view={...camera,rotation:back?[1,0,0,0,0,-1,0,-1,0] as const:camera.rotation};
      const expectedFace=sign===-1?(back?1:0):(back?0:1),reference={...mesh,indices:mesh.indices.slice(expectedFace*3,expectedFace*3+3)};
      const actual=pixel(raster.render(mesh.positions,mesh,view,settings));
      assert.deepEqual(actual,pixel(raster.render(mesh.positions,reference,view,settings)),`relation ${sign}, ${back?'back':'front'} must show the certified face`);
      assert.notDeepEqual(actual,[255,255,255,255]);
      if(!back)frontColours.push(actual);
    }
  }
  assert.notDeepEqual(frontColours[0],frontColours[1],'changing the selected layer solution changes the visible paper side');
  assert.deepEqual(positions,before);
});

test('crease ribbon plane correction also checks untouched material triangles',()=>{
  const positions=new Float32Array([0,0,0,1,0,0,0,0,1,0,.1,0,1,.1,0,0,.1,1]),indices=new Uint32Array([0,1,2,3,4,5]);
  assert.deepEqual(simulationCreasePlaneNormal(positions,indices,[[0,1,0]]),[0,1,0]);
  assert.equal(simulationCreasePlaneNormal(positions,indices,[[0,1,0],[1,0,0]]),undefined);
  positions[5*3+1]+=.1;
  assert.equal(simulationCreasePlaneNormal(positions,indices,[[0,1,0]]),undefined,'a bent untouched panel cannot inherit a different panel\'s crease plane');
});
