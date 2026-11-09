import test from 'node:test';
import assert from 'node:assert/strict';
import { trimBranches } from '../../src/app/branchTrim';
import type { Doc, Segment } from '../../src/core/types';

const line=(id:string,a:[number,number],b:[number,number],assignment:Segment['assignment']='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
function square():Doc{return{name:'trim',paper:{width:100,height:100},segments:[line('b0',[0,0],[100,0],'B'),line('b1',[100,0],[100,100],'B'),line('b2',[100,100],[0,100],'B'),line('b3',[0,100],[0,0],'B')]};}

test('trim removes an interior dangling chain inward but preserves boundary anchors',()=>{
  const doc=square();
  doc.segments.push(line('a',[0,0],[50,50],'M'),line('b',[50,50],[70,70],'V'));
  const before=structuredClone(doc),result=trimBranches(doc);
  assert.deepEqual(doc,before);
  assert.equal(result.removed,2);
  assert.deepEqual(result.doc.segments.map(s=>s.id),['b0','b1','b2','b3']);
});

test('trim removes a branch ending on a boundary interior after planarization',()=>{
  const doc=square();
  doc.segments.push(line('branch',[50,0],[50,35],'A'));
  const result=trimBranches(doc);
  assert.equal(result.removed,1);
  assert.ok(result.doc.segments.every(s=>s.id!=='branch'));
});

test('trim keeps closed interior loops and does nothing on a clean paper',()=>{
  const clean=square(), unchanged=trimBranches(clean);
  assert.equal(unchanged.removed,0);assert.strictEqual(unchanged.doc,clean);
  const doc=square();
  doc.segments.push(line('t0',[30,30],[70,30],'M'),line('t1',[70,30],[50,70],'V'),line('t2',[50,70],[30,30],'M'));
  const result=trimBranches(doc);
  assert.equal(result.removed,0);
  assert.deepEqual(result.doc,doc);
});
