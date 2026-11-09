import test from 'node:test';
import assert from 'node:assert/strict';
import {parallelOffsets} from '../../src/app/parallelOffset';
import {distance,cross,sub} from '../../src/core/geometry';
import type {Segment,Assignment} from '../../src/core/types';
const source:Segment={id:'source',a:[25,100],b:[175,100],assignment:'M',angle:-45};
test('two finite offsets keep source length and never mutate source',()=>{
 const before=structuredClone(source),r=parallelOffsets(source,25,'V');assert.deepEqual(r.map(s=>[s.a,s.b]),[[[25,125],[175,125]],[[25,75],[175,75]]]);assert.ok(r.every(s=>s.assignment==='V'&&s.angle===180));assert.deepEqual(source,before);
});
test('rotated offsets are parallel with exact perpendicular spacing',()=>{
 const s:Segment={...source,a:[10,20],b:[100,140]};for(const r of parallelOffsets(s,35,'M')){
 assert.ok(Math.abs(distance(r.a,r.b)-150)<1e-8);assert.ok(Math.abs(cross(sub(r.b,r.a),sub(s.b,s.a)))<1e-8);assert.ok(Math.abs(distance(s.a,r.a)-35)<1e-8);
 }
});
test('reversing source swaps sides but preserves the same geometric pair',()=>{
 const a=parallelOffsets(source,25,'M'),b=parallelOffsets({...source,a:source.b,b:source.a},25,'M');assert.deepEqual(a[0].a,b[1].b);assert.deepEqual(a[1].b,b[0].a);
});
test('all drawing presets use default angles instead of source angle',()=>{
 for(const type of ['M','V','B','A','U','F'] as Assignment[]){const r=parallelOffsets(source,25,type);assert.ok(r.every(s=>s.assignment===type&&s.angle===(type==='M'?-180:type==='V'?180:type==='U'?null:0)));}
});
test('zero width, invalid points, degenerate sources and overflow reject',()=>{
 for(const width of [0,-25,NaN,Infinity,1000001])assert.throws(()=>parallelOffsets(source,width,'M'));
 assert.throws(()=>parallelOffsets({...source,b:source.a},25,'M'));assert.throws(()=>parallelOffsets({...source,a:[NaN,0]},25,'M'));assert.throws(()=>parallelOffsets({...source,a:[0,999999],b:[100,999999]},25,'M'));
});
