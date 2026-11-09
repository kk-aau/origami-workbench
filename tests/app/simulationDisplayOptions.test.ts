import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SIMULATION_DISPLAY_OPTIONS,displaySettings,mergeSimulationDisplayOptions,normalizeSimulationDisplayOptions,strainInk} from '../../src/engine/simDisplay';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {meshTopologyFor,normalDirectionColor,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';
import type {CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {FoldAssignment} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

const base:RenderSettings={
  frontColor:[1,0,0],backColor:[0,1,0],mountainColor:[1,0,0],valleyColor:[0,0,1],borderColor:[.1,.1,.1],
  lightDir:[0,0,1],background:[1,1,1],showFaces:true,showEdges:true,lighting:true,creaseWidthPx:2,faceAlpha:1,
  creaseDepthBias:.000002,creaseWritesDepth:false,
};
const camera:CameraUniforms={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:20,width:64,height:64,depthRange:2,camDist:3.2};
const pixel=(pixels:Uint8ClampedArray,x:number,y:number)=>Array.from(pixels.slice((y*64+x)*4,(y*64+x)*4+3));
const svgHex=(rgb:readonly number[])=>'#'+rgb.map(value=>Math.round(value*255).toString(16).padStart(2,'0')).join('');

test('display settings restore partial preferences and reject an entire malformed patch',()=>{
  assert.deepEqual(normalizeSimulationDisplayOptions({}),DEFAULT_SIMULATION_DISPLAY_OPTIONS);
  assert.equal(normalizeSimulationDisplayOptions({background:'#ABCDEF'})?.background,'#abcdef');
  const current={...DEFAULT_SIMULATION_DISPLAY_OPTIONS},original=structuredClone(current);
  for(const patch of [null,[],new Date(),false,{facets:1},{strainClip:NaN},{strainClip:.09},{strainClip:31},{background:'#fff'},{background:'rgb(0,0,0)'},{unknown:true},{mountains:false,strainClip:0}]){
    assert.equal(mergeSimulationDisplayOptions(current,patch),null);
    assert.deepEqual(current,original,'a rejected patch must not mutate the current display');
  }
  assert.equal(mergeSimulationDisplayOptions(current,{strainClip:.1})?.strainClip,.1);
  assert.equal(mergeSimulationDisplayOptions(current,{strainClip:30})?.strainClip,30);
});

test('options independently control faces, edges, background and diagnostic modes',()=>{
  const options={...DEFAULT_SIMULATION_DISPLAY_OPTIONS,showFaces:false,showEdges:false,mountains:false,facets:true,strainClip:2,background:'#123456'};
  const settings=displaySettings(base,'normals','assignment',options);
  assert.equal(settings.showFaces,false);assert.equal(settings.showEdges,false);
  assert.equal(settings.showMountains,false);assert.equal(settings.showFacets,true);
  assert.equal(settings.colorMode,'normals');assert.equal(settings.lighting,false);
  assert.equal(settings.strainClip,2);
  assert.deepEqual(settings.background,[0x12/255,0x34/255,0x56/255]);
  assert.equal(displaySettings(base,'wireframe','assignment',{...options,showFaces:true}).showFaces,false);
  assert.deepEqual(base.background,[1,1,1],'render options must not modify the base palette');
});

test('CPU and SVG separately toggle B/M/V/F/U while preserving F/U ink in neutral crease style',()=>{
  const assignments:FoldAssignment[]=['B','M','V','F','U'];
  const positions=new Float32Array(assignments.flatMap((_,index)=>[-.7,(index-2)*.35,0,.7,(index-2)*.35,0]));
  const model={indices:new Uint32Array(),edgesVertices:assignments.map((_,index)=>[index*2,index*2+1] as [number,number]),edgesAssignment:assignments};
  const topology=meshTopologyFor(model),before=structuredClone(topology);
  assert.deepEqual(Array.from(topology.edgeAssignments),[0,1,2,3,4]);
  const flags=['boundaries','mountains','valleys','facets','unassigned'] as const;
  const raster=new SimulationRasterizer();
  for(const style of ['assignment','crease'] as const){
    for(let selected=0;selected<assignments.length;selected++){
      const options={...DEFAULT_SIMULATION_DISPLAY_OPTIONS,boundaries:false,mountains:false,valleys:false,facets:false,unassigned:false,[flags[selected]]:true};
      const settings=displaySettings(base,'wireframe',style,options);
      const pixels=raster.render(positions,model,camera,settings);
      const svg=renderMeshToSvg(positions,topology,camera,settings)!.svg;
      assert.equal((svg.match(/<line /g)??[]).length,1,'SVG exports only the selected line kind');
      for(let index=0;index<assignments.length;index++){
        const ink=pixel(pixels,32,Math.round(32-(index-2)*7));
        if(index===selected)assert.notDeepEqual(ink,[240,243,239],`${style}: selected ${assignments[index]} is visible`);
        else assert.deepEqual(ink,[240,243,239],`${style}: hidden ${assignments[index]} leaves no ink`);
      }
      if(selected>=3){
        assert.ok(svg.includes(selected===3?'#b8801f':'#8252ad'),'F/U retain a distinct role colour');
        assert.ok(!svg.includes('stroke-dasharray'),'diagnostic F/U edges remain solid');
      }
    }
  }
  const legacy=displaySettings(base,'wireframe');
  const svg=renderMeshToSvg(positions,topology,camera,legacy)!.svg;
  assert.equal((svg.match(/<line /g)??[]).length,4,'facet edges remain opt-in');
  assert.deepEqual(topology,before,'changing visibility must preserve solver/render topology');
});

test('CPU and SVG strain use the chosen percentage clip instead of a fixed five percent',()=>{
  const positions=new Float32Array([-.8,-.8,0,.8,-.8,0,0,.8,0]);
  const model={indices:new Uint32Array([0,1,2]),edgesVertices:[],edgesAssignment:[]};
  const strain=new Float32Array([.02,.02,.02]),raster=new SimulationRasterizer();
  const colors:number[][]=[];
  for(const strainClip of [1,5]){
    const settings=displaySettings(base,'strain','assignment',{...DEFAULT_SIMULATION_DISPLAY_OPTIONS,showEdges:false,strainClip});
    const color=strainInk(strain[0],strainClip).match(/\d+/g)!.map(Number);
    colors.push(pixel(raster.render(positions,model,camera,settings,strain),32,32));
    assert.deepEqual(colors.at(-1),color);
    const svg=renderMeshToSvg(positions,meshTopologyFor(model),camera,settings,{strain})!.svg;
    assert.ok(svg.includes(`fill="${svgHex(color.map(channel=>channel/255))}"`));
  }
  assert.notDeepEqual(colors[0],colors[1],'the same strain changes colour when its clip changes');
});

test('normal mode uses the oriented triangle normal in CPU and SVG, independent of paper colours and lighting',()=>{
  const positions=new Float32Array([-.8,-.8,0,.8,-.8,0,0,.8,0]);
  const raster=new SimulationRasterizer();
  for(const reverse of [false,true]){
    const model={indices:new Uint32Array(reverse?[2,1,0]:[0,1,2]),edgesVertices:[],edgesAssignment:[]};
    const settings={...displaySettings(base,'normals'),showEdges:false,lighting:true};
    const expected=normalDirectionColor([0,0,reverse?-1:1]);
    assert.deepEqual(pixel(raster.render(positions,model,camera,settings),32,32),expected.map(value=>Math.round(value*255)));
    const svg=renderMeshToSvg(positions,meshTopologyFor(model),camera,settings)!.svg;
    assert.ok(svg.includes(`fill="${svgHex(expected)}"`));
  }
});
