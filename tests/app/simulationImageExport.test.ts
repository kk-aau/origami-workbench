import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationImageDimensions,scaleSimulationImageSettings,simulationImageFromBackgrounds,flipSimulationImageRows} from '../../src/engine/simImageExport';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

test('high-resolution screenshots keep the same apparent stroke and dash spacing without changing screen settings',()=>{
  const screen={creaseWidthPx:1.6,creaseDash:{border:null,mountain:[5,3],valley:[2,3,1,3]}} as RenderSettings,saved=structuredClone(screen);
  const image=scaleSimulationImageSettings(scaleSimulationImageSettings(screen,2),4);
  assert.equal(image.creaseWidthPx/8,screen.creaseWidthPx);
  for(const key of ['mountain','valley'] as const)assert.deepEqual(image.creaseDash![key]!.map(run=>run/8),screen.creaseDash![key]);
  assert.equal(image.creaseDash!.border,null);assert.deepEqual(screen,saved);
});

test('PNG allocation validates viewport dimensions and rejects huge requests before allocating buffers',()=>{
  assert.deepEqual(simulationImageDimensions(800,600,4),{width:3200,height:2400});
  for(const input of [[0,600,1],[NaN,600,1],[800,.1,1],[800,600,NaN],[800,600,3],[3000,3000,2],[9000,1,1]])assert.throws(()=>simulationImageDimensions(...input as [number,number,number]));
  for(const scale of [NaN,Infinity,0,-1,9])assert.throws(()=>scaleSimulationImageSettings({} as RenderSettings,scale));
});

test('transparent capture keeps white paper and its ink while removing only uncovered pixels',()=>{
  const black=new Uint8ClampedArray([0,0,0,255,255,255,255,255,30,70,45,255]);
  const white=new Uint8ClampedArray([255,255,255,255,255,255,255,255,30,70,45,255]);
  assert.deepEqual(Array.from(simulationImageFromBackgrounds(black,white)),[0,0,0,0,255,255,255,255,30,70,45,255]);
  assert.deepEqual(Array.from(simulationImageFromBackgrounds(black,white,[1,.8,.6]).slice(0,4)),[255,204,153,255]);
  assert.deepEqual(Array.from(black),[0,0,0,255,255,255,255,255,30,70,45,255],'capture leaves source render buffers intact');
});

test('dual-background capture recovers translucency and rejects empty or malformed frames',()=>{
  const black=new Uint8ClampedArray([20,40,60,255]),white=new Uint8ClampedArray([147,167,187,255]);
  const image=simulationImageFromBackgrounds(black,white);
  assert.deepEqual(Array.from(image),[40,80,120,128]);
  const emptyBlack=new Uint8ClampedArray([0,0,0,255]),emptyWhite=new Uint8ClampedArray([255,255,255,255]);
  assert.throws(()=>simulationImageFromBackgrounds(emptyBlack,emptyWhite),/没有可截取/);
  assert.throws(()=>simulationImageFromBackgrounds(emptyBlack,emptyWhite,[1,1,1]),/没有可截取/);
  assert.throws(()=>simulationImageFromBackgrounds(emptyBlack,new Uint8ClampedArray(8)),/像素无效/);
});

test('WebGL capture flips rows exactly once and rejects invalid readback sizes',()=>{
  const pixels=new Uint8Array([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
  assert.deepEqual(Array.from(flipSimulationImageRows(pixels,2,2)),[7,8,9,255,10,11,12,255,1,2,3,255,4,5,6,255]);
  assert.throws(()=>flipSimulationImageRows(pixels,3,2),/图像尺寸无效/);
  assert.throws(()=>flipSimulationImageRows(pixels,NaN,2),/图像尺寸无效/);
});
