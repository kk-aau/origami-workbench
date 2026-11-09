import test from 'node:test';
import assert from 'node:assert/strict';
import { appendImportedSegments } from '../../src/app/appendImport';
import type { Doc } from '../../src/core/types';

const base:Doc={name:'base',paper:{width:100,height:100},segments:[{id:'same',a:[0,0],b:[100,0],assignment:'B',angle:0}]};
const incoming:Doc={name:'incoming',paper:{width:200,height:200},segments:[{id:'same',a:[10,10],b:[50,10],assignment:'M',angle:-180}],objects:[{id:'circle',kind:'circle',center:[20,20],radius:5,color:'#aabbcc'}]};

test('append keeps the current paper and remaps imported segment ids',()=>{
  const before=structuredClone(base),result=appendImportedSegments(base,incoming);
  assert.deepEqual(base,before);assert.equal(result.appended,1);assert.equal(result.doc.paper.width,100);
  assert.equal(result.doc.segments.length,2);assert.notEqual(result.doc.segments[1].id,'same');assert.deepEqual(result.doc.segments[1].a,[10,10]);
  assert.equal(result.warnings.length,2);assert.match(result.warnings[0],/未缩放/);assert.match(result.warnings[1],/未复制对象/);
});

test('append returns a stable no-op for an empty import',()=>{
  const empty:Doc={name:'empty',paper:{width:100,height:100},segments:[]};const result=appendImportedSegments(base,empty);
  assert.strictEqual(result.doc.segments,base.segments);assert.equal(result.appended,0);assert.deepEqual(result.warnings,[]);
});

test('append beside separates CPs by translation while preserving dimensions, assignments and the original document',()=>{
  const before=structuredClone({base,incoming}),result=appendImportedSegments(base,incoming,'beside');
  assert.deepEqual({base,incoming},before);
  assert.deepEqual(result.doc.segments[1].a,[110,0]);assert.deepEqual(result.doc.segments[1].b,[150,0]);
  assert.equal(result.doc.segments[1].assignment,'M');assert.equal(result.doc.segments[1].angle,-180);
  assert.deepEqual(result.doc.segments[0],base.segments[0]);assert.match(result.warnings[0],/右侧/);
});

test('append beside respects drawing coordinate bounds and leaves input untouched on failure',()=>{
  const far=structuredClone(base);far.segments[0].a=[999900,0];far.segments[0].b=[1000000,0];
  const before=structuredClone(far);assert.throws(()=>appendImportedSegments(far,incoming,'beside'));assert.deepEqual(far,before);
});
