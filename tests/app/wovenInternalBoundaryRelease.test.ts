import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareTessResult,canAdoptTessWithTileLayers,tessConstructionKey,hasWovenInternalBoundary} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {flatPresentation} from '../../src/app/flatPresentation';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {distance,polygonArea} from '../../src/core/geometry';
const cases=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases;
test('literal internal B cuts use source placement and split boundaries, with adoption gated by source and layers',()=>{
  for(const f of cases){const r=prepareTessResult(f.response,f.params),key=tessConstructionKey(f.params),cut=f.name.startsWith('internal-diagonal');
    assert.equal(hasWovenInternalBoundary(r),cut,f.name);assert.equal(r.doc.segments.length,f.response.fold.edges_vertices.length);
    if(cut){
      const input=tessFlatInput(r,r.doc,key,false),geometry=computeTessFlatGeometry(input),solved=recomputeFlatLayers(geometry);
      assert.equal(input.checked,true);assert.ok(input.wovenCutFoldedVertices);assert.equal(input.graph.vertices_coords.length,14);assert.equal(input.graph.edges_vertices.length,16);
      assert.equal(input.graph.edges_assignment.filter(x=>x==='B').length,14);assert.equal(input.graph.edges_assignment.filter(x=>x==='V').length,2);
      assert.equal(computeFlatGeometry(input.graph,2e-6).geometry.status,'unsupported','ordinary single-sheet engine must not place cut pieces independently');
      assert.equal(geometry.geometry.status,'ready');assert.deepEqual(geometry.geometry.vertices,input.wovenCutFoldedVertices);assert.equal(solved.layers.status,'solved',solved.layers.message);
      for(const face of geometry.geometry.faces){assert.ok(polygonArea(face.map(v=>input.graph.vertices_coords[v]))>0);for(const a of face)for(const b of face)assert.ok(Math.abs(distance(input.graph.vertices_coords[a],input.graph.vertices_coords[b])-distance(geometry.geometry.vertices[a],geometry.geometry.vertices[b]))<1e-6);}
      const analysis=modelOverlapRegions(solved);
      for(const side of ['front','back'] as const){const regions=modelRegionLayers(solved,analysis,side);assert.ok(regions.length);assert.ok(regions.every(region=>region.layers.status==='ordered'));const boundaries=modelRegionBoundaries(solved,regions);assert.equal(boundaries.ambiguousEdges,0);}
      const front=flatPresentation(solved,'front'),back=flatPresentation(solved,'back');assert.deepEqual(front.frontMaterial.map(x=>!x),back.frontMaterial);
      assert.equal(canAdoptTessWithTileLayers(r,false,key,f.params,'solved'),true,'verified cut uses the material document adoption path');assert.equal(canAdoptTessWithTileLayers(r,false,key,f.params,'unconfirmed'),false);}
    else assert.doesNotThrow(()=>tessFlatInput(r,r.doc,key,true),f.name);
  }
});

test('cut placement is rejected after source topology or current CP changes, including a deleted cut flag',()=>{
 const f=cases.find((c:any)=>c.name==='internal-diagonal'),key=tessConstructionKey(f.params);
 for(const mutate of [
  (r:any)=>{delete r.source.wovenCutTopology;},
  (r:any)=>{r.source.foldedForm[0][0]+=.1;},
  (r:any)=>{r.source.wovenCutTopology.internalBoundaryEdges=[];},
  (r:any)=>{r.doc.segments[0].a[0]+=.1;},
  (r:any)=>{r.doc.segments[0].assignment='V';},
  (r:any)=>{r.doc.segments[0].angle=180;},
 ]){const r=prepareTessResult(structuredClone(f.response),f.params);mutate(r);assert.equal(hasWovenInternalBoundary(r),true);assert.throws(()=>tessFlatInput(r,r.doc,key,true));}
 const r=prepareTessResult(f.response,f.params),input=tessFlatInput(r,r.doc,key,true),changed=structuredClone(input);changed.wovenCutFoldedVertices![0][0]+=.1;
 assert.equal(computeTessFlatGeometry(changed).geometry.status,'invalid');
});

test('warm tessellation worker publishes each cut source placement and rechecks remembered layers',async()=>{
 const scope=globalThis as any,savedHandler=scope.onmessage,savedPost=scope.postMessage,replies:any[]=[];
 try{
  scope.postMessage=(message:any)=>replies.push(message);
  await import('../../src/workers/tessellationFlat.worker');
  let id=0;
  for(const f of cases.filter((c:any)=>c.name.startsWith('internal-diagonal'))){
   const result=prepareTessResult(f.response,f.params),input=tessFlatInput(result,result.doc,tessConstructionKey(f.params),false);
   scope.onmessage({data:{id:++id,input,side:'front'}});
   const frame=replies.at(-1);assert.equal(frame.id,id);assert.equal(frame.result.geometry.status,'ready');assert.deepEqual(frame.result.geometry.vertices,input.wovenCutFoldedVertices);
   const solved=recomputeFlatLayers(frame.result);assert.equal(solved.layers.status,'solved');scope.onmessage({data:{type:'layers',result:solved}});
   scope.onmessage({data:{id:++id,input,side:'back'}});const back=replies.at(-1);assert.equal(back.id,id);assert.deepEqual(back.result.geometry.vertices,input.wovenCutFoldedVertices);assert.equal(back.result.layers.status,'solved');
  }
 }finally{scope.onmessage=savedHandler;scope.postMessage=savedPost;}
});
