import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterLayerComparison} from '../../src/engine/simRaster';
import {cameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {meshTopologyFor,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';
const positions=new Float32Array([-.6,0,.6,.6,0,.6,0,0,-.6,-.6,0,.6,.6,0,.6,0,0,-.6]);
const indices=new Uint32Array([0,1,2,3,5,4]);
const model={indices,edgesVertices:[],edgesAssignment:[]},topology=meshTopologyFor(model);
const settings={frontColor:[1,0,0],backColor:[0,0,1],borderColor:[0,0,0],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1,creaseWidthPx:1} as RenderSettings;
const faces=(svg:string)=>[...svg.matchAll(/<polygon[^>]*fill="(#[0-9a-f]+)"/g)].map(m=>m[1]);
test('vector process frames honor the same certified contact comparator as animation, from either camera side',()=>{
  for(const back of [false,true])for(const sign of [-1,1]){
    const camera=cameraUniforms({yaw:0,pitch:back?Math.PI:0,zoom:.8},[0,0,0],1,160,160);
    const compare=rasterLayerComparison(positions,indices,camera,{triangleSourceFaces:[0,1],faceOrders:[[0,1,sign]]})!;
    const top=compare(0,1,false)>0?0:1;
    const expected=renderMeshToSvg(positions,meshTopologyFor({...model,indices:indices.slice(top*3,top*3+3)}),camera,settings,{background:false})!;
    const actual=renderMeshToSvg(positions,topology,camera,settings,{background:false,compareContact:(a,b)=>compare(a,b,false)})!;
    assert.equal(faces(actual.svg).at(-1),faces(expected.svg).at(-1));
    assert.equal(new Set(faces(actual.svg)).size,1,'buried paper must not leak into the vector illustration');
  }
});
test('a real separated layer is not reordered using the contact certificate',()=>{
  const camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,160,160),moved=positions.slice();for(let v=3;v<6;v++)moved[v*3+1]+=.01;
  const compare=rasterLayerComparison(moved,indices,camera,{triangleSourceFaces:[0,1],faceOrders:[[0,1,-1]]})!;
  assert.equal(compare(0,1,false),0);
  const plain=renderMeshToSvg(moved,topology,camera,settings,{background:false})!;
  const contact=renderMeshToSvg(moved,topology,camera,settings,{background:false,compareContact:(a,b)=>compare(a,b,false)})!;
  const footprints=(svg:string)=>[...svg.matchAll(/<polygon points="([^"]+)"/g)].map(m=>m[1].split(/[ ,]+/).map(n=>Number(Number(n).toFixed(2))));
  assert.deepEqual(faces(contact.svg),faces(plain.svg));assert.deepEqual(footprints(contact.svg),footprints(plain.svg),'extra vector precision must preserve the same physical foreground footprint');
  assert.deepEqual(positions,new Float32Array([-.6,0,.6,.6,0,.6,0,0,-.6,-.6,0,.6,.6,0,.6,0,0,-.6]));
});
test('a buried crease stays behind its covering material when saving a vector frame',()=>{
  const positions=new Float32Array([-.6,0,.6,.6,0,.6,.6,0,-.6,-.6,0,-.6,-.6,0,.6,.6,0,.6,.6,0,-.6,-.6,0,-.6]);
  const indices=new Uint32Array([0,1,2,0,2,3,4,6,5,4,7,6]);
  const camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,160,160);
  const compare=rasterLayerComparison(positions,indices,camera,{triangleSourceFaces:[0,0,1,1],faceOrders:[[0,1,1]]})!;
  const top=compare(0,2,false)>0?0:1;
  const edge=top===0?[4,6]:[0,2];
  const topology=meshTopologyFor({indices,edgesVertices:[edge as [number,number]],edgesAssignment:['M']});
  const rendered=renderMeshToSvg(positions,topology,camera,{...settings,showEdges:true,mountainColor:[0,1,0],valleyColor:[0,1,0]},{background:false,compareContact:(a,b)=>compare(a,b,false)})!;
  const crease=rendered.svg.indexOf('stroke="#00ff00"');
  assert.ok(crease<0||crease<rendered.svg.indexOf('<polygon'),'any retained hidden crease is painted before the covering material, never over it');
});
