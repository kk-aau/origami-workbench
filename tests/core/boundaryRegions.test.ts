import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,buildDiagramFold,polygonArea} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {diagnose} from '../../src/core/diagnostics';
import type {Point,Doc} from '../../src/core/types';
const square=(x:number,y:number,s:number):Point[]=>[[x,y],[x+s,y],[x+s,y+s],[x,y+s]];
function doc(rings:Point[][]){const d=blankDoc('孔洞',100,100);d.segments=rings.flatMap(r=>r.map((a,k)=>({id:`b${rings.indexOf(r)}-${k}`,a,b:r[(k+1)%r.length],assignment:'B' as const,angle:0})));return d;}
function area(d:Doc){const g=buildFold(d).graph;return g.faces_vertices!.reduce((n,r,f)=>n+Math.abs(polygonArea(r.map(v=>g.vertices_coords[v])))-(g.faces_holes?.[f]??[]).reduce((s,h)=>s+Math.abs(polygonArea(h.map(v=>g.vertices_coords[v]))),0),0);}
for(const [name,rings,expected] of [
 ['环状纸张',[square(0,0,100),square(30,30,40)],8400],
 ['多个孔',[square(0,0,100),square(10,10,10),square(60,60,20)],9500],
 ['孔内独立纸岛',[square(0,0,100),square(20,20,60),square(40,40,20)],6800],
 ['独立纸张',[square(0,0,20),square(40,0,30)],1300],
 ['凹外轮廓',[ [[0,0],[100,0],[100,40],[50,40],[50,100],[0,100]],square(10,10,10)],6900],
 ] as [string,Point[][],number][]){test(name,()=>{const d=doc(rings),original=JSON.stringify(d);assert.equal(area(d),expected);assert.equal(diagnose(d).summary.errors,0);const result=computeFlatFold(d);assert.equal(result.geometry.status,'ready',result.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);assert.equal(JSON.stringify(d),original);assert.deepEqual(buildDiagramFold(d).graph.faces_holes,buildFold(d).graph.faces_holes);});}
test('环上折痕分面且内孔不成为纸面，方向与输入顺序无关',()=>{
 const d=doc([square(0,0,100).reverse(),square(30,30,40)]);
 d.segments.push({id:'left',a:[0,50],b:[30,50],assignment:'V',angle:180},{id:'right',a:[70,50],b:[100,50],assignment:'V',angle:180});
 d.segments.reverse();assert.equal(area(d),8400);assert.equal(diagnose(d).summary.errors,0);const r=computeFlatFold(d);assert.equal(r.geometry.status,'ready');assert.equal(r.geometry.faces.length,2);
});
test('孔内和纸外折痕仍拒绝，不丢弃用户线段',()=>{for(const a of [[40,40],[110,110]] as Point[]){const d=doc([square(0,0,100),square(30,30,40)]);d.segments.push({id:'bad',a,b:[a[0]+5,a[1]],assignment:'F',angle:0});assert.throws(()=>buildFold(d),/纸张外部或孔洞内部/);assert.throws(()=>buildDiagramFold(d),/纸张外部或孔洞内部/);}});
test('重叠边界和开口仍由诊断拦截',()=>{for(const rings of [[square(0,0,100),square(0,0,20)],[square(0,0,100),square(30,30,40)]]){const d=doc(rings);if(rings[1][0][0]===30)d.segments.pop();assert(diagnose(d).summary.errors>0);}});
test('截图：三角孔顶点接触外边界，下部两条谷折',()=>{
 const d=doc([square(0,0,100),[[50,0],[75,50],[25,50]]]);
 d.segments.push({id:'v1',a:[0,50],b:[50,100],assignment:'V',angle:180},{id:'v2',a:[50,100],b:[100,50],assignment:'V',angle:180});
 assert.equal(area(d),8750);assert.equal(diagnose(d).summary.errors,0);
 const r=computeFlatFold(d);assert.equal(r.geometry.status,'ready',r.geometry.message);assert.equal(r.layers.status,'solved',r.layers.message);
});
test('敞开凹缺口、相接独立纸片及孔间点接触',()=>{
 for(const rings of [
  [[[0,0],[40,0],[40,40],[60,40],[60,0],[100,0],[100,100],[0,100]]],
  [square(0,0,20),square(20,20,20)],
  [square(0,0,100),square(20,20,20),square(40,40,20)],
 ] as Point[][][]){const d=doc(rings);assert.equal(diagnose(d).summary.errors,0);const r=computeFlatFold(d);assert.equal(r.geometry.status,'ready',r.geometry.message);assert.equal(r.layers.status,'solved',r.layers.message);}
});
test('极小正面积孔不抹除，内外圈单桥 F 与孔周 F 标记',()=>{
 const tiny=doc([square(0,0,100),square(50,50,.0001)]);assert.equal(buildFold(tiny).graph.faces_holes?.[0].length,1);
 const d=doc([square(0,0,100),square(30,30,40)]);d.segments.push({id:'bridge',a:[0,50],b:[30,50],assignment:'F',angle:0});
 assert.equal(area(d),8400);const r=computeFlatFold(d);assert.equal(r.geometry.status,'ready',r.geometry.message);assert.equal(r.layers.status,'solved',r.layers.message);
});

