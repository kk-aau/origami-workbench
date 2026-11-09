import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {modelSurfaceEpsilon,modelSurfacePrecision} from '../../src/app/modelSurfacePrecision';
import {modelRegionShadows} from '../../src/app/modelRegionShadows';

const rectangle=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function model(polygon:Point[]):FlatFoldResult{
 return {geometry:{status:'ready',message:'',vertices:polygon,faces:[polygon.map((_,i)=>i)]},layers:{status:'solved',message:'',faceOrders:[]},warnings:[]};
}
function surface(result:FlatFoldResult,epsilon?:number){
 const analysis=modelOverlapRegions(result,epsilon),regions=modelRegionLayers(result,analysis,'front');
 return {analysis,regions,boundaries:modelRegionBoundaries(result,regions,undefined,epsilon)};
}

test('finer coverage retains a positive thin face without changing default diagnostics or source',()=>{
 const source=model(rectangle(0,0,5e-9,10)),before=structuredClone(source),normal=surface(source);
 assert.equal(normal.analysis.epsilon,1e-8);assert.equal(normal.analysis.cells.length,0);assert.ok(normal.analysis.omittedThinRegions>0);
 const fine=surface(source,1e-12);
 assert.equal(fine.analysis.cells.length,1);assert.equal(fine.analysis.omittedThinRegions,0);
 assert.equal(fine.analysis.cells[0].area,5e-8);assert.equal(fine.regions[0].layers.status,'ordered');
 assert.equal(fine.boundaries.edges.length,4);assert.equal(fine.boundaries.ambiguousEdges,0);
 assert.deepEqual(surface(source),normal);assert.deepEqual(source,before);
});

test('boundary precision must follow coverage precision to resolve a fully ordered narrow face',()=>{
 const source=model(rectangle(0,0,1e-7,10)),normal=surface(source);
 assert.equal(normal.analysis.omittedThinRegions,0);assert.equal(normal.regions[0].layers.status,'ordered');
 assert.equal(normal.boundaries.edges.length,0);assert.equal(normal.boundaries.ambiguousEdges,4);
 const fine=surface(source,1e-12);
 assert.equal(fine.boundaries.edges.length,4);assert.equal(fine.boundaries.ambiguousEdges,0);
 // Changing coverage alone cannot resolve boundary probes still using the old tolerance.
 assert.equal(modelRegionBoundaries(source,fine.regions).ambiguousEdges,4);
});

test('higher precision preserves a thin real hole and its complete boundary',()=>{
 const source=model(rectangle(0,0,10,10));source.geometry.vertices.push(...rectangle(5,2,5e-9,6));
 source.geometry.graph={vertices_coords:source.geometry.vertices,faces_vertices:source.geometry.faces,faces_holes:[[[4,5,6,7]]]};
 const before=structuredClone(source),normal=surface(source),fine=surface(source,1e-12);
 assert.ok(normal.analysis.omittedThinRegions>0);assert.equal(fine.analysis.omittedThinRegions,0);
 assert.ok(Math.abs(fine.analysis.cells.reduce((sum,c)=>sum+c.area,0)-(100-3e-8))<1e-12);
 assert.equal(fine.boundaries.edges.length,8);assert.equal(fine.boundaries.ambiguousEdges,0);assert.deepEqual(source,before);
});

test('precision floor follows coordinate roundoff and clamps impractical overrides',()=>{
 const source=model(rectangle(100000,100000,1e-7,10)),precision=modelSurfacePrecision(source.geometry.vertices);
 assert.equal(precision.defaultEpsilon,1e-8);
 assert.equal(precision.minimumEpsilon,Number.EPSILON*100010*8);
 assert.equal(modelSurfaceEpsilon(source.geometry.vertices,Number.MIN_VALUE),precision.minimumEpsilon);
 const fine=surface(source,Number.MIN_VALUE);
 assert.equal(fine.analysis.epsilon,precision.minimumEpsilon);assert.equal(fine.analysis.omittedThinRegions,0);
 assert.equal(fine.boundaries.edges.length,4);assert.equal(fine.boundaries.ambiguousEdges,0);
 for(const invalid of [0,-1,NaN,Infinity]){
  assert.throws(()=>modelOverlapRegions(source,invalid),/精度/);
  assert.throws(()=>modelRegionBoundaries(source,fine.regions,undefined,invalid),/精度/);
 }
});

test('refining geometry never invents missing local layer relationships',()=>{
 const source=model(rectangle(0,0,1e-7,10));source.geometry.faces.push([...source.geometry.faces[0]]);
 const fine=surface(source,1e-12);
 assert.equal(fine.analysis.omittedThinRegions,0);assert.equal(fine.regions.length,1);
 assert.equal(fine.regions[0].layers.status,'unconfirmed');assert.ok(fine.boundaries.ambiguousEdges>0);
});

test('roundoff at ordinary rotated intersections does not claim missing paper at every precision',()=>{
 const rotated=(x:number,y:number,angle:number)=>rectangle(0,0,3,2).map(([a,b]):Point=>[x+a*Math.cos(angle)-b*Math.sin(angle),y+a*Math.sin(angle)+b*Math.cos(angle)]);
 const polygons=[rotated(.1,.2,.2),rotated(.4,.5,.3),rectangle(20,20,1,1)];
 const source=model(polygons[0]);
 for(const polygon of polygons.slice(1)){const offset=source.geometry.vertices.length;source.geometry.vertices.push(...polygon);source.geometry.faces.push(polygon.map((_,i)=>i+offset));}
 source.layers.faceOrders=[[0,1,-1]];
 const before=structuredClone(source),precision=modelSurfacePrecision(source.geometry.vertices);
 for(const epsilon of [undefined,precision.minimumEpsilon]){
  const fine=surface(source,epsilon);
  assert.equal(fine.analysis.omittedThinRegions,0);
  for(const [face,expected]of [6,6,1].entries())assert.ok(Math.abs(fine.analysis.cells.filter(c=>c.faces.includes(face)).reduce((sum,c)=>sum+c.area,0)-expected)<1e-12);
  assert.equal(fine.boundaries.ambiguousEdges,0);
 }
 assert.deepEqual(source,before);
});

test('shadow precision follows refined narrow boundaries without discarding short valid strips',()=>{
 const source=model(rectangle(0,0,10,10));source.geometry.vertices.push(...rectangle(5,2,5e-9,6));source.geometry.faces.push([4,5,6,7]);source.layers.faceOrders=[[0,1,-1]];
 const fine=surface(source,1e-12);
 assert.equal(fine.boundaries.ambiguousEdges,0);
 const normal=modelRegionShadows(fine.regions,fine.boundaries),shadows=modelRegionShadows(fine.regions,fine.boundaries,1e-12);
 assert.equal(normal.ambiguousEdges,2);assert.equal(shadows.ambiguousEdges,0);assert.equal(shadows.strips.length,4);
 for(const invalid of [0,-1,NaN,Infinity])assert.throws(()=>modelRegionShadows(fine.regions,fine.boundaries,invalid),/精度/);
});
