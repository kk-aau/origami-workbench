import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import type {ModelLayerRegion} from '../../src/app/modelRegionLayers';
import {modelRegionPaths} from '../../src/app/modelRegionPaths';
const cell=(polygon:Point[],face=0):ModelLayerRegion=>({polygon,faces:[face],area:1,layers:{status:'ordered',topToBottom:[face]}});
const rect=(x:number,y:number,w:number,h:number,face=0)=>cell([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],face);
const loops=(d:string):Point[][]=>(d.match(/M[^Z]+Z/g)??[]).map(s=>s.slice(1,-1).split('L').map(p=>p.split(',').map(Number) as Point));
const area=(ps:Point[])=>ps.reduce((sum,p,i)=>{const q=ps[(i+1)%ps.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;
const winding=(polygons:Point[][],p:Point)=>polygons.reduce((sum,ps)=>sum+ps.reduce((sum,a,i)=>{const b=ps[(i+1)%ps.length],cross=(b[0]-a[0])*(p[1]-a[1])-(p[0]-a[0])*(b[1]-a[1]);return sum+(a[1]<=p[1]&&b[1]>p[1]&&cross>0?1:a[1]>p[1]&&b[1]<=p[1]&&cross<0?-1:0);},0),0);
test('same material removes slab cuts and vertical T junctions without changing face identity',()=>{
 const regions=[rect(0,0,5,10),rect(5,0,5,4,1),rect(5,4,5,6,2)],before=structuredClone(regions);
 regions[1].polygon.reverse();
 const paths=modelRegionPaths(regions,p=>p,()=> '#aabbcc'),ps=loops(paths[0].d);assert.equal(paths.length,1);assert.equal(ps.length,1);assert.equal(area(ps[0]),100);
 for(const p of ps[0])assert.ok(p[0]===0||p[0]===10||p[1]===0||p[1]===10,'no internal edges survive');
 assert.deepEqual(paths[0].indices,[0,1,2]);regions[1].polygon.reverse();assert.deepEqual(regions,before);
});
test('paper holes, disconnected islands and reflected winding survive merging',()=>{
 const regions=[rect(0,0,2,10),rect(2,0,6,2),rect(2,8,6,2),rect(8,0,2,10),rect(12,0,2,2)];
 for(const mirror of [1,-1]){const paths=modelRegionPaths(regions,p=>[mirror*p[0],p[1]],()=> '#aabbcc'),ps=loops(paths[0].d);assert.equal(ps.length,3);assert.equal(Math.abs(ps.reduce((s,p)=>s+area(p),0)),68);assert.equal(winding(ps,[5*mirror,5]),0);assert.notEqual(winding(ps,[1*mirror,5]),0);assert.notEqual(winding(ps,[13*mirror,1]),0);assert.equal(winding(ps,[11*mirror,1]),0);}
});
test('material/selection differences stay separate and floating point shared endpoints weld',()=>{
 const regions=[rect(0,0,5,10),rect(5+1e-12,0,5-1e-12,4,1),rect(5,4+1e-12,5,6-1e-12,2)];
 assert.equal(loops(modelRegionPaths(regions,p=>p,()=> '#aabbcc')[0].d).length,1);
 const paths=modelRegionPaths(regions,p=>p,r=>r.faces[0]===1?'#112233':'#aabbcc');assert.equal(paths.length,2);assert.deepEqual(paths[1].indices,[1]);assert.equal(Math.round(loops(paths[1].d).reduce((s,p)=>s+area(p),0)),20);
});
test('materials and selection share one model tolerance and the same welded seam coordinates',()=>{
 const regions=[rect(0,0,5,10),rect(5+5e-8,0,5-5e-8,10,1),rect(100,100,1000,10,2)];
 const merged=modelRegionPaths(regions,p=>p,r=>r.faces[0]===2?'far':'paper');
 assert.equal(loops(merged[0].d).length,1,'a small material patch does not open a crack within the model tolerance');
 const selected=modelRegionPaths(regions,p=>p,r=>String(r.faces[0]));
 assert.equal(Math.max(...loops(selected[0].d).flat().map(p=>p[0])),Math.min(...loops(selected[1].d).flat().map(p=>p[0])),'both colors meet at precisely the same coordinate');
});
test('near-degenerate cell contacts preserve winding multiplicity and never break a material contour',()=>{
 // Real adjacent slabs in a mixed 3.6.3.6 fold can overlap by a few rounding
 // units at a tapered junction. A count-two edge must retain both traversals.
 const regions=[cell([[0,0],[1,1],[0,2]]),cell([[0,2-2e-8],[1,3],[0,4]],1)];
 for(const mirror of [1,-1]){
  const paths=modelRegionPaths(regions,p=>[mirror*p[0],p[1]],()=> 'paper'),ps=loops(paths[0].d);
  for(const p of [[.25,.75],[.25,2.75]] as Point[])assert.notEqual(winding(ps,[p[0]*mirror,p[1]]),0,'both cells remain filled');
  for(const p of [[.9,2],[1.1,1],[-.1,2]] as Point[])assert.equal(winding(ps,[p[0]*mirror,p[1]]),0,'the gap and exterior remain empty');
  assert.ok(Math.abs(ps.reduce((sum,p)=>sum+area(p),0)-mirror*regions.reduce((sum,r)=>sum+area(r.polygon),0))<1e-12);
 }
});
