import test from 'node:test';
import assert from 'node:assert/strict';
import { transverseReflection } from '../../src/app/transverseReflection';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
import type { Doc, Segment, Point, Assignment } from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Assignment='B',angle:number|null=0):Segment=>({id,a,b,assignment,angle});
const boundary=[s('t',[0,0],[200,0]),s('r',[200,0],[200,200]),s('b',[200,200],[0,200]),s('l',[0,200],[0,0])];
const sources=[s('m',[25,50],[100,50],'M',-90),s('v',[25,150],[100,150],'V',null)];
const doc=(extra:Segment[]=sources):Doc=>({name:'横截',paper:{width:200,height:200},segments:[...boundary,...extra]});
test('transverse reflects multiple T joins, preserving assignments and angles without source edits',()=>{
  const d=doc(),before=structuredClone(d),r=transverseReflection(d,[100,25],[100,175]);
  assert.equal(r.sources.length,2);assert.equal(r.copies.length,2);
  assert.deepEqual(r.copies.map(s=>[s.a,s.b,s.assignment,s.angle]),[[[100,50],[200,50],'M',-90],[[100,150],[200,150],'V',null]]);
  assert.deepEqual(d,before);
});
test('axis reversal preserves all results and uses first non-auxiliary cutoff',()=>{
  const d=doc([...sources,s('stop',[175,0],[175,200],'M',-180),s('aux',[125,0],[125,200],'A',0)]);
  const a=transverseReflection(d,[100,25],[100,175]),b=transverseReflection(d,[100,175],[100,25]);
  assert.deepEqual(a,b);assert.ok(a.copies.every(s=>s.b[0]===175));
});
test('crossings, L joins, collinear and extension-only sources do not qualify',()=>{
  for(const source of [s('cross',[50,50],[150,50],'M',-180),s('end',[50,25],[100,25],'M',-180),s('collinear',[100,50],[100,100],'M',-180),s('extension',[25,50],[75,50],'M',-180)])
    assert.throws(()=>transverseReflection(doc([source]),[100,25],[100,175]),/T 形/);
});
test('one missing stop rejects the whole batch, not a partial result',()=>{
  const d={...doc(),segments:[...sources,s('short-stop',[175,0],[175,100],'M',-180)]};
  assert.throws(()=>transverseReflection(d,[100,25],[100,175]),/整组尚未生成/);
});
test('same-assignment duplicates are removed and partial coverage is trimmed',()=>{
  const d=doc([...sources,s('existing',[100,50],[150,50],'M',-90)]);
  const result=transverseReflection(d,[100,25],[100,175]);
  assert.ok(result.copies.some(s=>s.assignment==='M'&&s.a[0]===150&&s.b[0]===200));
});
test('different overlap is covered by the reflected source assignment and angle',()=>{
  const d=doc([...sources,s('conflict',[125,50],[150,50],'V',180)]),before=structuredClone(d);
  const result=overlayDrawnSegments(d,transverseReflection(d,[100,25],[100,175]).copies,true);
  assert.equal(result.segments.some(line=>line.id.startsWith('conflict')),false);
  assert.ok(result.segments.filter(line=>line.id.includes('::transverse:')&&line.a[1]===50).every(line=>line.assignment==='M'&&line.angle===-90));
  assert.deepEqual(d,before);
});
test('boundary protection excludes boundary sources but allows boundary stops',()=>{
  const d=doc([s('edge',[25,50],[100,50])]);
  assert.equal(transverseReflection(d,[100,25],[100,175],false).copies[0].assignment,'B');
  assert.throws(()=>transverseReflection(d,[100,25],[100,175],true),/T 形/);
});
test('invalid or degenerate axis is rejected',()=>{
  assert.throws(()=>transverseReflection(doc(),[100,25],[100,25]),/不能重合/);
  assert.throws(()=>transverseReflection(doc(),[NaN,25],[100,175]),/坐标/);
});
