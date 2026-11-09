import test from 'node:test';
import assert from 'node:assert/strict';
import { rabbitEar } from '../../src/app/rabbitEar';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
import { distance, cross, sub, splitIntersections } from '../../src/core/geometry';
import { defaultAngle, validateDoc, type Assignment, type Doc, type Point } from '../../src/core/types';
const doc=():Doc=>({name:'兔耳',paper:{width:200,height:200},segments:[]});
const triangle:Point[]=[[0,0],[120,0],[0,90]];
test('right triangle incenter is (30,30), three spokes only, no mutation',()=>{
  const d=doc(),before=structuredClone(d),points=structuredClone(triangle),r=rabbitEar(d,points,'M');
  assert.ok(distance(r.center,[30,30])<1e-8);assert.equal(r.copies.length,3);
  r.copies.forEach((s,i)=>{assert.deepEqual(s.a,triangle[i]);assert.deepEqual(s.b,r.center);assert.equal(s.assignment,'M');assert.equal(s.angle,-180);});
  assert.deepEqual(d,before);assert.deepEqual(points,triangle);
});
test('incenter equidistant from every side for acute, obtuse and reversed triangles',()=>{
  for(const points of [[[10,20],[180,40],[60,180]],[[0,0],[200,0],[25,25]], [...triangle].reverse()] as Point[][]){
    const r=rabbitEar(doc(),points,'V');
    const distances=points.map((a,i)=>{const b=points[(i+1)%3];return Math.abs(cross(sub(r.center,a),sub(b,a)))/distance(a,b);});
    assert.ok(distances.every(d=>Math.abs(d-distances[0])<1e-8));
  }
});
test('vertex permutation preserves the center and generated geometry',()=>{
  const expected=rabbitEar(doc(),triangle,'M').center;
  for(const points of [[triangle[1],triangle[2],triangle[0]],[triangle[2],triangle[1],triangle[0]]])assert.ok(distance(rabbitEar(doc(),points,'M').center,expected)<1e-8);
});
test('all six drawing types use their own default angle without automatic MV assignment',()=>{
  for(const a of ['M','V','A','B','U','F'] as Assignment[])assert.ok(rabbitEar(doc(),triangle,a).copies.every(s=>s.assignment===a&&s.angle===defaultAngle(a)));
});
test('reject repeated, collinear, near-collinear and invalid coordinates',()=>{
  for(const points of [[],[[0,0],[0,0],[10,10]],[[0,0],[100,100],[200,200]],[[0,0],[100,0],[200,1e-8]],[[0,0],[NaN,0],[0,90]],[[0,0],[1000001,0],[0,90]]] as Point[][])assert.throws(()=>rabbitEar(doc(),points,'M'));
});
test('large translated triangle retains accuracy',()=>{
  const points=triangle.map(([x,y])=>[x+900000,y-900000] as Point);
  assert.ok(distance(rabbitEar(doc(),points,'M').center,[900030,-899970])<1e-8);
});
test('same-type overlap only fills missing intervals; fully covered construction rejects',()=>{
  const d=doc(),r=rabbitEar(d,triangle,'M');
  d.segments=[{...r.copies[0],b:[15,15]}];
  const next=rabbitEar(d,triangle,'M');assert.equal(next.copies.length,3);assert.deepEqual(next.copies[0].a,[15,15]);
  d.segments=r.copies;assert.throws(()=>rabbitEar(d,triangle,'M'),/兔耳构造结果已存在/);
});
test('different line type or angle is covered by the whole construction without mutating input',()=>{
  for(const change of [{assignment:'V' as Assignment,angle:180},{assignment:'M' as Assignment,angle:-90},{assignment:'M' as Assignment,angle:null},{assignment:'A' as Assignment,angle:0}]){
    const d=doc();d.segments=[{...rabbitEar(d,triangle,'M').copies[0],...change}];const before=structuredClone(d);
    const result=overlayDrawnSegments(d,rabbitEar(d,triangle,'M').copies);
    assert.equal(result.segments.length,3);assert.ok(result.segments.every(line=>line.assignment==='M'&&line.angle===-180));assert.deepEqual(d,before);
  }
});
test('crossing a source crease splits both real segments without changing source assignment',()=>{
  const d=doc();d.segments=[{id:'existing',a:[0,15],b:[120,15],assignment:'V',angle:90}];
  const r=rabbitEar(d,triangle,'M'),split=splitIntersections({...d,segments:[...d.segments,...r.copies]});
  assert.equal(split.segments.length,8);assert.ok(split.segments.filter(s=>s.id.startsWith('existing')).every(s=>s.assignment==='V'&&s.angle===90));
});
test('rabbit-ear construction preserves all three rays beyond the former 12000-segment limit',()=>{
  const d=doc();d.segments=Array.from({length:15000},(_,i)=>({id:'a'+i,a:[150,150+i/1000] as Point,b:[160,150+i/1000] as Point,assignment:'A' as Assignment,angle:0}));
  const before=structuredClone(d),result=rabbitEar(d,triangle,'M');
  assert.equal(result.copies.length,3);assert.ok(distance(result.center,[30,30])<1e-8);
  result.copies.forEach((s,i)=>{assert.deepEqual(s.a,triangle[i]);assert.deepEqual(s.b,result.center);assert.equal(s.assignment,'M');assert.equal(s.angle,-180);});
  const combined={...d,segments:[...d.segments,...result.copies]};
  assert.equal(combined.segments.length,15003);assert.equal(new Set(combined.segments.map(s=>s.id)).size,15003);
  assert.doesNotThrow(()=>validateDoc(combined));assert.deepEqual(d,before);
});
