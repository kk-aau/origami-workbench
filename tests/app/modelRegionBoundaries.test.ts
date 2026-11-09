import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers,type ModelLayerRegion} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
function model(rects:number[][],orders:[number,number,number][]=[]):FlatFoldResult{const vertices:Point[]=[],faces:number[][]=[];for(const [x,y,w,h]of rects){const i=vertices.length;vertices.push([x,y],[x+w,y],[x+w,y+h],[x,y+h]);faces.push([i,i+1,i+2,i+3]);}return {geometry:{status:'ready',message:'',vertices,faces},layers:{status:'solved',message:'',faceOrders:orders},warnings:[]};}
const calc=(r:FlatFoldResult,side:'front'|'back'='front')=>modelRegionBoundaries(r,modelRegionLayers(r,modelOverlapRegions(r),side));
const length=(r:ReturnType<typeof calc>)=>r.edges.reduce((sum,e)=>sum+Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),0);
test('visible edges retain exterior and top changes, hiding back-side nested seams and decomposition cuts',()=>{
 const r=model([[0,0,100,100],[25,25,50,50]],[[0,1,1]]),before=structuredClone(r),front=calc(r),back=calc(r,'back');
 assert.deepEqual([length(front),length(back)].sort((a,b)=>a-b),[400,600]);assert.equal(front.ambiguousEdges,0);assert.equal(back.ambiguousEdges,0);assert.deepEqual(r,before);
 for(const output of [front,back])for(const e of output.edges)assert.ok(e.a[0]===e.b[0]||e.a[1]===e.b[1]);
 // No vertical slab at x=25 or 75 extends outside the nested face.
 for(const e of [...front.edges,...back.edges])if(e.a[0]===e.b[0]&&[25,75].includes(e.a[0]))assert.ok(Math.min(e.a[1],e.b[1])>=25&&Math.max(e.a[1],e.b[1])<=75);
});
test('adjacent faces retain seam; holes and disconnected shapes retain their contours',()=>{
 assert.equal(length(calc(model([[0,0,50,100],[50,0,50,100]]))),500);
 assert.equal(length(calc(model([[0,0,10,10],[20,0,10,10]]))),80);
 const ring=calc(model([[0,0,100,20],[0,80,100,20],[0,20,20,60],[80,20,20,60]]));
 // Outer 400 + inner 240 + four adjacent paper-face joints 80.
 assert.equal(length(ring),720);assert.equal(ring.ambiguousEdges,0);
});
test('near-equal decomposition columns cannot erase complete exterior edges or visible same-color seams',()=>{
 // Both horizontal rectangle edge midpoints lie in the former 1e-14-wide
 // omitted slab. The two buried triangles are hidden from the front, exposed
 // from the back, and contribute an independently known perimeter there.
 const r:FlatFoldResult={geometry:{status:'ready',message:'',vertices:[[0,0],[100,0],[100,100],[0,100],[40,30],[60,30],[50,20],[40,70],[60,70],[50.00000000000001,80]],faces:[[0,1,2,3],[4,5,6],[7,8,9]]},layers:{status:'solved',message:'',faceOrders:[[0,1,-1],[0,2,1]]},warnings:[]};
 for(const side of ['front','back'] as const){
  const output=calc(r,side);
  assert.equal(output.ambiguousEdges,0);
  assert.ok(Math.abs(length(output)-(400+(side==='back'?40+40*Math.SQRT2:0)))<1e-10);
  for(const [a,b] of [[0,1],[1,2],[2,3],[3,0]])assert.ok(output.edges.some(e=>[e.a,e.b].some(p=>Math.hypot(p[0]-r.geometry.vertices[a][0],p[1]-r.geometry.vertices[a][1])<1e-10)&&[e.a,e.b].some(p=>Math.hypot(p[0]-r.geometry.vertices[b][0],p[1]-r.geometry.vertices[b][1])<1e-10)),`${side}: missing rectangle side ${a}-${b}`);
 }
});
test('unknown, conflict or missing regions do not invent top boundaries',()=>{
 const r=model([[0,0,100,100],[25,25,50,50]]),regions=modelRegionLayers(r,modelOverlapRegions(r),'front');
 const unknown=modelRegionBoundaries(r,regions);assert.equal(length(unknown),400);assert.ok(unknown.ambiguousEdges>=4);
 for(const cell of regions)if(cell.faces.length>1)cell.layers={status:'conflict',message:'test'};
 assert.deepEqual(modelRegionBoundaries(r,regions),unknown);
 const missing=modelRegionBoundaries(r,[]);assert.equal(missing.edges.length,0);assert.ok(missing.ambiguousEdges>0);
 r.geometry.vertices[0][0]=NaN;assert.throws(()=>calc(r),/坐标|几何/);
});

test('certified buried thin faces do not make visible exterior edges ambiguous',()=>{
 const source=model([[0,0,100,100],[25,25,1e-7,50]],[[0,1,1]]),regions=modelRegionLayers(source,modelOverlapRegions(source),'front');
 const front=modelRegionBoundaries(source,regions);assert.equal(length(front),400);assert.equal(front.ambiguousEdges,0);
 const missing=modelRegionBoundaries(source,regions.filter(region=>!region.faces.includes(1)));assert.ok(missing.ambiguousEdges>0);
 for(const region of regions)if(region.faces.includes(1))region.layers={status:'unconfirmed',message:'test'};
 assert.ok(modelRegionBoundaries(source,regions).ambiguousEdges>0);
});
test('roundoff-equivalent folded copies retain all four exterior edges on both sides',()=>{
 for(const delta of [1e-13,1e-9])for(const transform of ['offset','shear','rotate'] as const){
  const square:Point[]=[[0,0],[10,0],[10,10],[0,10]],copy:Point[]=square.map(([x,y])=>transform==='offset'?[x,y+delta]:transform==='shear'?[x,y+delta*x]:[x*Math.cos(delta)-y*Math.sin(delta),x*Math.sin(delta)+y*Math.cos(delta)]);
  const source:FlatFoldResult={geometry:{status:'ready',message:'',vertices:[...square,...copy],faces:[[0,1,2,3],[4,5,6,7]]},layers:{status:'solved',message:'',faceOrders:[[0,1,1]]},warnings:[]},before=structuredClone(source),analysis=modelOverlapRegions(source);
  assert.equal(analysis.omittedThinRegions,0,`${transform}/${delta}`);assert.equal(analysis.cells.reduce((sum,c)=>sum+c.area,0),100);
  for(const side of ['front','back'] as const){
   const boundaries=modelRegionBoundaries(source,modelRegionLayers(source,analysis,side));
   assert.equal(boundaries.ambiguousEdges,0,`${side}/${transform}/${delta}`);assert.equal(boundaries.edges.length,4);assert.equal(length(boundaries),40);
   for(let i=0;i<4;i++){const a=square[i],b=square[(i+1)%4];assert.ok(boundaries.edges.some(e=>[e.a,e.b].some(p=>p[0]===a[0]&&p[1]===a[1])&&[e.a,e.b].some(p=>p[0]===b[0]&&p[1]===b[1])));}
  }
  assert.deepEqual(source,before);
 }
});
test('only epsilon seams with the same verified paper-face set can reuse boundary visibility',()=>{
 const source=model([[0,0,10,10]]),epsilon=modelOverlapRegions(source).epsilon;
 const parts=(halfGap:number):ModelLayerRegion[]=>[
  {polygon:[[0,0],[5-halfGap,0],[5-halfGap,10],[0,10]] as Point[],area:(5-halfGap)*10,faces:[0],layers:{status:'ordered' as const,topToBottom:[0]}},
  {polygon:[[5+halfGap,0],[10,0],[10,10],[5+halfGap,10]] as Point[],area:(5-halfGap)*10,faces:[0],layers:{status:'ordered' as const,topToBottom:[0]}}
 ];
 for(const halfGap of [epsilon/2,-epsilon/2]){const result=modelRegionBoundaries(source,parts(halfGap));assert.equal(result.edges.length,4);assert.equal(length(result),40);assert.equal(result.ambiguousEdges,0);}
 assert.ok(modelRegionBoundaries(source,parts(epsilon*2)).ambiguousEdges>0);
 const unknown=parts(epsilon/2);unknown[0].layers={status:'unconfirmed',message:'test'};assert.ok(modelRegionBoundaries(source,unknown).ambiguousEdges>0);
 // A verified surrounding face cannot prove the order of another paper face
 // which was omitted from the region collection.
 const missing=model([[0,0,10,10],[4,0,2,10]],[[0,1,1]]);assert.ok(modelRegionBoundaries(missing,parts(epsilon/2)).ambiguousEdges>0);
});
