import test from 'node:test';
import assert from 'node:assert/strict';
import {displaySettings} from '../../src/engine/simDisplay';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';
import {diagramEdgeColor,diagramEdgeFolded,diagramPaperColor,meshTopologyFor,packCreaseDash,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import type {CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

const base:RenderSettings={frontColor:[.95,.9,.8],backColor:[.77,.85,.76],mountainColor:[1,0,0],valleyColor:[0,0,1],borderColor:[0,0,0],lightDir:[0,0,1],background:[1,1,1],showFaces:true,showEdges:true,lighting:true,faceAlpha:1,creaseWidthPx:1.6,creaseDash:{border:null,mountain:[8,4],valley:[5,3]}};
const camera:CameraUniforms={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:20,width:64,height:64,depthRange:2,camDist:3.2};
const model={indices:new Uint32Array([0,1,2,1,0,3]),edgesVertices:[[0,1]] as [number,number][],edgesAssignment:['V'] as const,triangleSourceFaces:[0,1]};
const pose=(degrees:number)=>new Float32Array([-.8,0,0,.8,0,0,0,.7,0,0,-.7*Math.cos(degrees*Math.PI/180),.7*Math.sin(degrees*Math.PI/180)]);
const rgb=(v:readonly number[])=>v.map(c=>Math.round(c*255));
const hex=(v:readonly number[])=>'#'+rgb(v).map(c=>c.toString(16).padStart(2,'0')).join('');

test('drawing style is reversible and leaves physical state and assignment diagnostics untouched',()=>{
  const copy=structuredClone(base),diagram=displaySettings(base,'paper','diagram');
  assert.equal(diagram.diagramStyle,true);
  assert.deepEqual(diagram.frontColor,base.frontColor);assert.deepEqual(diagram.backColor,base.backColor);
  assert.deepEqual(diagram.mountainColor,base.mountainColor);assert.deepEqual(diagram.valleyColor,base.valleyColor);
  assert.equal(diagram.creaseWidthPx,1);assert.equal(diagram.showFacets,true);
  assert.deepEqual(Array.from(packCreaseDash(diagram.creaseDash).counts),[0,0,0]);
  assert.equal(displaySettings(base,'paper','assignment').diagramStyle,false);
  assert.deepEqual(displaySettings(base,'paper','assignment').creaseDash,base.creaseDash);
  for(const mode of ['normals','strain'] as const){const diagnostic=displaySettings(base,mode,'diagram');assert.equal(diagnostic.colorMode,mode);assert.equal(diagnostic.lighting,false);}
  assert.deepEqual(base,copy);
});

test('actual 0/90/180-degree hinges select matching CPU and SVG drawing ink',()=>{
  const topology=meshTopologyFor(model),settings=displaySettings(base,'wireframe','diagram'),raster=new SimulationRasterizer();
  assert.deepEqual(Array.from(topology.edgeOpposites!),[2,3]);
  for(const angle of [0,90,180]){
    const positions=pose(angle),saved=positions.slice(),folded=angle!==0;
    assert.equal(diagramEdgeFolded(positions,0,1,2,3),folded);
    const expected=diagramEdgeColor(folded,settings),pixels=raster.render(positions,model,camera,settings);
    assert.deepEqual(Array.from(pixels.slice((32*64+32)*4,(32*64+32)*4+3)),rgb(expected));
    const svg=renderMeshToSvg(positions,topology,camera,settings)!.svg;
    assert.ok(svg.includes(`stroke="${hex(expected)}"`));assert.doesNotMatch(svg,/stroke-dasharray/);
    assert.deepEqual(positions,saved,'drawing appearance cannot modify solver coordinates');
  }
});

test('source F marks survive while bent numerical supports remain hidden in all drawing outputs',()=>{
  const source={...model,edgesAssignment:['F'] as const,triangleSourceFaces:[0,0]};
  const helperTopology=meshTopologyFor(source);
  assert.deepEqual(Array.from(helperTopology.edgeMaterial!),[0]);
  const ordinaryMark={...source,triangleSourceFaces:[0,1]};
  assert.deepEqual(Array.from(meshTopologyFor(ordinaryMark).edgeMaterial!),[1]);
  const finiteMark={...source,fold:{zhezhi_simulation_mesh:{sourceEdgeCount:1}}};
  assert.deepEqual(Array.from(meshTopologyFor(finiteMark).edgeMaterial!),[1],'finite F inside one source face is still a material mark');
  const refined={...finiteMark,fold:{zhezhi_simulation_mesh:{sourceEdgeCount:1,edgeSourceEdges:[null]}}};
  assert.deepEqual(Array.from(meshTopologyFor(refined).edgeMaterial!),[0],'explicit refined provenance wins over stale prefix counts');
  const settings=displaySettings(base,'wireframe','diagram'),positions=pose(90),raster=new SimulationRasterizer();
  assert.deepEqual(Array.from(raster.render(positions,source,camera,settings).slice((32*64+32)*4,(32*64+32)*4+3)),[255,255,255]);
  const svg=renderMeshToSvg(positions,helperTopology,camera,settings);
  assert.ok(!svg||!svg.svg.includes('<line '));
  const drawn=renderMeshToSvg(positions,meshTopologyFor(finiteMark),camera,settings)!.svg;
  assert.ok(drawn.includes(`stroke="${hex(diagramEdgeColor(true,settings))}"`));
});

test('drawing light is stable across coplanar triangles and retains mild shape shading',()=>{
  const paper=[.77,.85,.76];
  assert.deepEqual(diagramPaperColor(paper,[0,0,1]),paper);
  assert.deepEqual(diagramPaperColor(paper,[.3,-.2,.8]),diagramPaperColor(paper,[3,-2,8]));
  assert.deepEqual(diagramPaperColor(paper,[.3,-.2,.8]),diagramPaperColor(paper,[-.3,.2,-.8]));
  assert.ok(diagramPaperColor(paper,[1,0,.1])[0]<paper[0]);
  const settings={...displaySettings(base,'paper','diagram'),showEdges:false},positions=pose(0);
  const image=new SimulationRasterizer().render(positions,model,camera,settings);
  assert.deepEqual(Array.from(image.slice((27*64+32)*4,(27*64+32)*4+3)),rgb(base.frontColor));
  const svg=renderMeshToSvg(positions,meshTopologyFor(model),camera,settings)!.svg;
  assert.ok(svg.includes(`fill="${hex(base.frontColor)}"`));
});

test('a sloping sheet cannot clip its own solid stroke, while a nearer sheet still occludes it',()=>{
  const positions=new Float32Array([-.9,-.7,-.7,.9,.7,.7,.9,-.7,.7,-.7,-.7,1,.7,-.7,1,0,.8,1]);
  const sheet={indices:new Uint32Array([0,1,2]),edgesVertices:[[0,1]] as [number,number][],edgesAssignment:['B'] as const};
  const settings={...displaySettings(base,'paper','diagram'),creaseWidthPx:4,lighting:false};
  const wire=new SimulationRasterizer().render(positions,sheet,camera,{...settings,showFaces:false});
  const paper=new SimulationRasterizer().render(positions,sheet,camera,settings);
  const ink=rgb(diagramEdgeColor(true,settings));let strokePixels=0;
  for(let i=0;i<wire.length;i+=4)if(ink.every((c,k)=>wire[i+k]===c)){
    assert.deepEqual(Array.from(paper.slice(i,i+3)),ink,'the owning sloped face must not erase part of its line width');strokePixels++;
  }
  assert.ok(strokePixels>40);
  const overlap={...sheet,indices:new Uint32Array([0,1,2,3,4,5])},pixel=(32*64+32)*4;
  const hidden=new SimulationRasterizer().render(positions,overlap,camera,settings);
  const faces=new SimulationRasterizer().render(positions,overlap,camera,{...settings,showEdges:false});
  assert.notDeepEqual(Array.from(hidden.slice(pixel,pixel+3)),ink);
  assert.deepEqual(Array.from(hidden.slice(pixel,pixel+3)),Array.from(faces.slice(pixel,pixel+3)),'an unrelated front sheet must keep hiding the line');
});
