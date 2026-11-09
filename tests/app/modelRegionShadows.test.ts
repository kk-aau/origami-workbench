import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {modelRegionShadows} from '../../src/app/modelRegionShadows';
import {modelRegionShadowSVG} from '../../src/app/modelRegionShadowSVG';
import {modelRegionSVG} from '../../src/app/modelRegionSVG';
import {modelProjection} from '../../src/app/modelProjection';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import ModelRegionSurface from '../../src/components/ModelRegionSurface';
function model():FlatFoldResult{return {geometry:{status:'ready',message:'',vertices:[[0,0],[100,0],[100,100],[0,100],[25,25],[75,25],[75,75],[25,75]],faces:[[0,1,2,3],[4,5,6,7]]},layers:{status:'solved',message:'',faceOrders:[[0,1,1]]},warnings:[]};}
test('nested local shadows occur only on exposed lower cells, with normals away from upper face',()=>{
 const input=model(),before=structuredClone(input),counts:number[]=[];
 for(const side of ['front','back'] as const){
  const regions=modelRegionLayers(input,modelOverlapRegions(input),side),boundaries=modelRegionBoundaries(input,regions),snapshot=structuredClone({regions,boundaries}),shadows=modelRegionShadows(regions,boundaries);counts.push(shadows.strips.length);
  assert.equal(shadows.ambiguousEdges,0);
  for(const strip of shadows.strips){assert.equal(strip.upperFace,1);assert.equal(strip.lowerFace,0);assert.ok(strip.clipRegions.length>1);assert.ok(Math.abs(Math.hypot(...strip.inward)-1)<1e-9);
   const middle:Point=[(strip.a[0]+strip.b[0])/2,(strip.a[1]+strip.b[1])/2];assert.ok((middle[0]-50)*strip.inward[0]+(middle[1]-50)*strip.inward[1]>0);
   for(const index of strip.clipRegions){const order=regions[index].layers;assert.equal(order.status,'ordered');if(order.status==='ordered')assert.equal(order.topToBottom[0],0);assert.ok(!regions[index].faces.includes(1));}
  }
  assert.deepEqual({regions,boundaries},snapshot);
 }
 assert.deepEqual(counts.sort(),[0,4]);assert.deepEqual(input,before);
});
test('unknown order and non-overlapping neighbors receive no decorative shadows',()=>{
 const r=model();r.layers.faceOrders=[];const regions=modelRegionLayers(r,modelOverlapRegions(r),'front'),boundaries=modelRegionBoundaries(r,regions),reply=modelRegionShadows(regions,boundaries);assert.equal(reply.strips.length,0);assert.equal(reply.ambiguousEdges,boundaries.ambiguousEdges);
 const cells=[{polygon:[[0,0],[1,0],[1,1]] as Point[],faces:[0],area:.5,layers:{status:'ordered' as const,topToBottom:[0]}},{polygon:[[1,0],[2,0],[1,1]] as Point[],faces:[1],area:.5,layers:{status:'ordered' as const,topToBottom:[1]}}];
 assert.deepEqual(modelRegionShadows(cells,{edges:[{a:[1,0],b:[1,1],leftRegion:0,rightRegion:1}],ambiguousEdges:0}),{strips:[],ambiguousEdges:0});
 cells[0].faces=[0,1];cells[0].layers.topToBottom=[0,1];cells[1].faces=[0,1];cells[1].layers.topToBottom=[1,0];assert.equal(modelRegionShadows(cells,{edges:[{a:[1,0],b:[1,1],leftRegion:0,rightRegion:1}],ambiguousEdges:0}).ambiguousEdges,1);
 assert.throws(()=>modelRegionShadows(cells,{edges:[{a:[0,0],b:[1,1],leftRegion:10,rightRegion:1}],ambiguousEdges:0}),/边界/);
});

test('local shadow renderer projects gradients and visible clips identically for UI and exports',()=>{
 const r=model();
 for(const side of ['front','back'] as const){
  const regions=modelRegionLayers(r,modelOverlapRegions(r),side),boundaries=modelRegionBoundaries(r,regions),shadows=modelRegionShadows(regions,boundaries),colors={front:'#112233',back:'#445566',line:'#778899'};
  const markup=modelRegionShadowSVG(r,regions,shadows,side,22.5),exported=modelRegionSVG(r,{regions,boundaries,shadows,omittedThinRegions:0},side,22.5,colors);
  assert.equal(XMLValidator.validate('<svg>'+markup+'</svg>'),true);assert.ok(exported.includes(markup));
  const ui=renderToStaticMarkup(createElement(ModelRegionSurface,{result:r,regions,boundaries,shadows,side,rotation:22.5,colors,face:null,onSelect(){},interactive:true}));
  assert.equal((ui.match(/data-region-shadow="true"/g)??[]).length,shadows.strips.length);
  const off=renderToStaticMarkup(createElement(ModelRegionSurface,{result:r,regions,boundaries,side,rotation:22.5,colors,face:null,onSelect(){},interactive:true}));assert.doesNotMatch(off,/data-region-shadow/);
  if(!shadows.strips.length)continue;
  const parsed=new XMLParser({ignoreAttributes:false}).parse('<svg>'+markup+'</svg>').svg.g[0],strip=shadows.strips[0],project=modelProjection(r.geometry.vertices,side==='back',22.5).project,start=project(strip.a),end=project([strip.a[0]+strip.inward[0]*10,strip.a[1]+strip.inward[1]*10]);
  assert.equal(Number(parsed.defs.linearGradient['@_x1']),start[0]);assert.equal(Number(parsed.defs.linearGradient['@_y2']),end[1]);assert.equal(parsed.defs.clipPath.polygon.length,strip.clipRegions.length);assert.equal(parsed['@_pointer-events'],'none');
  const invalid=structuredClone(shadows);invalid.strips[0].clipRegions=[regions.findIndex(c=>c.layers.status==='ordered'&&c.layers.topToBottom[0]===strip.upperFace)];assert.throws(()=>modelRegionShadowSVG(r,regions,invalid,side,0),/可见下层/);
 }
 assert.throws(()=>modelRegionShadowSVG(r,[],{strips:[],ambiguousEdges:0},'front',0,'bad"/><script>'),/标识/);
});
