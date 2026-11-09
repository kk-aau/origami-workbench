import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
const cases=JSON.parse(readFileSync('tests/fixtures/woven-concave-cells-20261001.json','utf8')).cases;

test('true reflex mother cells retain their original affine FF and independently bind every source parameter',()=>{
 for(const c of cases){
  const response=c.response,points=c.params.graph.vertices,face=response.source.sourceFaceCycles[0];
  const turns=face.map((v:number,i:number)=>{const a=points[v],b=points[face[(i+1)%face.length]],d=points[face[(i+2)%face.length]];return (b[0]-a[0])*(d[1]-b[1])-(b[1]-a[1])*(d[0]-b[0]);});
  assert.ok(Math.min(...turns)<0&&Math.max(...turns)>0,'this is a concave mother face, not just a concave outer polygon');
  const inspected=inspectWovenCutTopology(response,c.params);assert.equal(inspected.ok,true,inspected.ok?'':inspected.reason);
  assert.equal(inspectWovenCutTopology(response,{...c.params,width:c.params.width+.01}).ok,false);
 }
});

test('both phases, fixed face and no-border inset have two whole-face layer solutions with complete front and back coverage',()=>{
 for(const c of cases.slice(0,4)){
  const result=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),input=tessFlatInput(result,result.doc,key,true),geometry=computeTessFlatGeometry(input),solved=recomputeFlatLayers(geometry);
  assert.equal(geometry.geometry.status,'ready');assert.equal(solved.layers.status,'solved',c.name+': '+solved.layers.message);assert.equal(solved.layers.solutionCountExact,'2');
  assert.equal(canAdoptTessWithTileLayers(result,false,key,c.params,solved.layers.status),true);
  const analysis=modelOverlapRegions(solved);
  for(const side of ['front','back'] as const){const regions=modelRegionLayers(solved,analysis,side);assert.ok(regions.every(r=>r.layers.status==='ordered'));assert.equal(modelRegionBoundaries(solved,regions).ambiguousEdges,0);}
 }
});

test('a full-edge inset candidate cannot be adopted before its whole-face layer check succeeds',()=>{
 const c=cases.find((x:any)=>x.name==='reflex-cell-full-insets'),result=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),input=tessFlatInput(result,result.doc,key,true),geometry=computeTessFlatGeometry(input);
 assert.equal(geometry.geometry.status,'ready');assert.equal(canAdoptTessWithTileLayers(result,false,key,c.params),false);
 const solved=recomputeFlatLayers(geometry);assert.ok(['solved','unsupported'].includes(solved.layers.status));
 assert.equal(canAdoptTessWithTileLayers(result,false,key,c.params,solved.layers.status),solved.layers.status==='solved');
});
