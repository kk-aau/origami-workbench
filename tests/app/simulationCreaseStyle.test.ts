import test from 'node:test';
import assert from 'node:assert/strict';
import {displaySettings,type SimulationDisplayMode} from '../../src/engine/simDisplay';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';
import {packCreaseDash,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import type {CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

const base:RenderSettings={
  frontColor:[.98,.96,.88],backColor:[.41,.61,.52],
  mountainColor:[.76,.20,.23],valleyColor:[.18,.38,.72],borderColor:[.1,.12,.14],
  lightDir:[-.3,.5,1],background:[1,1,1],
  showFaces:true,showEdges:true,lighting:true,creaseWidthPx:1.6,faceAlpha:1,
  creaseDash:{border:null,mountain:null,valley:[5,3]},creaseDepthBias:.000002,creaseWritesDepth:false,
};

test('red-blue remains the default and is restored without losing its colours, width or valley dashes',()=>{
  const original=structuredClone(base);
  const initial=displaySettings(base,'paper');
  displaySettings(base,'paper','crease');
  const restored=displaySettings(base,'paper','assignment');
  assert.deepEqual(restored,initial);
  assert.deepEqual(initial.mountainColor,base.mountainColor);
  assert.deepEqual(initial.valleyColor,base.valleyColor);
  assert.equal(initial.creaseWidthPx,base.creaseWidthPx);
  assert.deepEqual(initial.creaseDash,base.creaseDash);
  assert.deepEqual(base,original,'changing visual style must leave the underlying settings intact');
});

test('neutral fine solid creases work with every display mode while keeping the paper and boundary settings',()=>{
  for(const mode of ['paper','wireframe','xray','strain'] as SimulationDisplayMode[]){
    const assigned=displaySettings(base,mode,'assignment'),creased=displaySettings(base,mode,'crease');
    assert.deepEqual(creased.mountainColor,creased.valleyColor);
    assert.notDeepEqual(creased.mountainColor,base.mountainColor);
    assert.notDeepEqual(creased.valleyColor,base.valleyColor);
    assert.ok(Math.max(...creased.mountainColor)-Math.min(...creased.mountainColor)<.05,'fold lines use a neutral dark ink');
    assert.ok(creased.creaseWidthPx>0&&creased.creaseWidthPx<assigned.creaseWidthPx);
    assert.deepEqual(creased.creaseDash,{border:null,mountain:null,valley:null});
    for(const key of ['borderColor','frontColor','backColor','faceAlpha','colorMode','lighting','showFaces','showEdges','creaseDepthBias','creaseWritesDepth'] as const){
      assert.deepEqual(creased[key],assigned[key],`${mode}: ${key} stays independent from crease style`);
    }
  }
});

test('GPU dash uniforms, CPU raster and SVG export all render neutral solid creases and a distinct boundary',()=>{
  const settings=displaySettings(base,'wireframe','crease');
  assert.deepEqual(Array.from(packCreaseDash(settings.creaseDash).counts),[0,0,0]);
  assert.deepEqual(Array.from(packCreaseDash(base.creaseDash).counts),[0,0,2]);
  const camera:CameraUniforms={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:20,width:64,height:64,depthRange:2,camDist:3.2};
  const positions=new Float32Array([-.6,-.5,0,.6,-.5,0,-.6,0,0,.6,0,0,-.6,.5,0,.6,.5,0]);
  const originalPositions=positions.slice();
  const edgesVertices:[number,number][]=[[0,1],[2,3],[4,5]],edgesAssignment=['M','V','B'] as const;
  const model={indices:new Uint32Array(),edgesVertices,edgesAssignment:[...edgesAssignment]};
  const originalModel=structuredClone(model);
  const pixels=new SimulationRasterizer().render(positions,model,camera,settings);
  const ink=settings.mountainColor.map(value=>Math.round(value*255));
  const border=base.borderColor.map(value=>Math.round(value*255));
  for(let x=22;x<42;x++){
    assert.deepEqual(Array.from(pixels.slice((32*64+x)*4,(32*64+x)*4+3)),ink,'valley strokes have no dash gaps');
    assert.deepEqual(Array.from(pixels.slice((42*64+x)*4,(42*64+x)*4+3)),ink,'mountain and valley use the same crease ink');
    assert.deepEqual(Array.from(pixels.slice((22*64+x)*4,(22*64+x)*4+3)),border,'the paper boundary keeps its own ink');
  }
  const svg=renderMeshToSvg(positions,{faceIndices:new Uint32Array(),edgeIndices:new Uint32Array(edgesVertices.flat()),edgeAssignments:new Uint8Array([1,2,0])},camera,settings)!.svg;
  const hex=(rgb:number[])=>`#${rgb.map(value=>value.toString(16).padStart(2,'0')).join('')}`;
  assert.equal(svg.match(new RegExp(`stroke="${hex(ink)}"`,'g'))?.length,2);
  assert.equal(svg.match(new RegExp(`stroke="${hex(border)}"`,'g'))?.length,1);
  assert.doesNotMatch(svg,/stroke-dasharray/);
  assert.deepEqual(Array.from(svg.matchAll(/stroke-width="([\d.]+)"/g),match=>Number(match[1])),[1,1,1]);
  assert.deepEqual(positions,originalPositions);
  assert.deepEqual(model,originalModel,'appearance and exports never alter fold assignments or topology');
});
