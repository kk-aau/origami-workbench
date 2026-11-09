import { test } from 'node:test';
import assert from 'node:assert/strict';
import { divideSegment, divisionParameters, extendSegment, lengthenSegment, lineTarget, perpendicularBisector, ratioParameter, trimSegment } from '../../src/app/segmentTools';
import { splitEditableSegments } from '../../src/app/planarize';
import { validateDoc, type Doc, type Point, type Segment } from '../../src/core/types';

const line=(id:string,a:Point,b:Point):Segment=>({id,a,b,assignment:'M',angle:-90});
const source=line('source',[25,75],[175,75]);
const doc=(segments:Segment[]=[source]):Doc=>({schemaVersion:2,name:'线段工具',paper:{width:200,height:200},segments});

test('extend selected end preserves opposite endpoint, identity and fold settings',()=>{
  const before=structuredClone(source);
  assert.deepEqual(extendSegment(source,'b',line('target',[200,0],[200,200])),{...source,b:[200,75]});
  assert.deepEqual(extendSegment(source,'a',line('target',[0,0],[0,200])),{...source,a:[0,75]});
  assert.deepEqual(source,before);
});
test('lengthen applies the active assignment and its default fold angle',()=>{
  const valley={...source,assignment:'V' as const,angle:null};
  const result=lengthenSegment(valley,'b',line('target',[200,0],[200,200]),'M');
  assert.deepEqual(result,{...valley,b:[200,75],assignment:'M',angle:-180});
  assert.deepEqual(valley,{...source,assignment:'V',angle:null});
});
test('extension rejects self, backward, zero length and target extension',()=>{
  assert.throws(()=>extendSegment(source,'b',source));
  assert.throws(()=>extendSegment(source,'b',line('target',[100,0],[100,200])));
  assert.throws(()=>extendSegment(source,'b',line('target',[175,0],[175,200])));
  assert.throws(()=>extendSegment(source,'b',line('target',[200,100],[200,200])));
  assert.throws(()=>extendSegment(source,'b',line('target',[200,75],[200,75])));
});
test('finite target intersection rejects parallel, collinear and out-of-range results',()=>{
  assert.throws(()=>lineTarget([0,0],[1,0],line('t',[0,1],[100,1])));
  assert.throws(()=>lineTarget([0,0],[1,0],line('t',[0,0],[100,0])));
  assert.throws(()=>lineTarget([0,0],[1,0],line('t',[1000001,-1],[1000001,1])));
  assert.deepEqual(lineTarget([0,0],[1,0],line('t',[10,0],[10,10])),[10,0]);
});
test('trim projects an interior point and replaces only the selected end',()=>{
  assert.deepEqual(trimSegment(source,'a',[75,75.5],1),{...source,a:[75,75]});
  assert.deepEqual(trimSegment(source,'b',[100,75],0),{...source,b:[100,75]});
});
test('trim rejects off-line, endpoint, extension and invalid tolerance',()=>{
  for(const point of [[100,77],[25,75],[175,75],[200,75]] as Point[])assert.throws(()=>trimSegment(source,'b',point,1));
  assert.throws(()=>trimSegment(source,'a',[100,75],-1));
});
test('equal divisions allow integers 2 through 100 only',()=>{
  assert.deepEqual(divisionParameters(4),[.25,.5,.75]);
  assert.equal(divisionParameters(100).length,99);
  for(const n of [0,1,2.5,101,NaN,Infinity])assert.throws(()=>divisionParameters(n));
});
test('ratio calculation rejects invalid values and avoids overflow',()=>{
  assert.equal(ratioParameter(1,3),.25);
  assert.equal(ratioParameter(1e308,1e308),.5);
  for(const n of [0,-1,NaN,Infinity])assert.throws(()=>ratioParameter(n,2));
  assert.throws(()=>ratioParameter(1,0));
});
test('division creates independent pieces retaining assignments and null angles',()=>{
  const s={...source,assignment:'V' as const,angle:null};
  const original=doc([s]);const before=structuredClone(original);
  const pieces=divideSegment(original,s,divisionParameters(3));
  assert.deepEqual(pieces.map(p=>[p.a,p.b]),[[[25,75],[75,75]],[[75,75],[125,75]],[[125,75],[175,75]]]);
  assert.equal(new Set(pieces.map(p=>p.id)).size,3);
  assert.ok(pieces.every(p=>p.assignment==='V'&&p.angle===null));
  assert.deepEqual(original,before);
});
test('ratio is measured from the selected endpoint',()=>{
  assert.deepEqual(divideSegment(doc(),source,[ratioParameter(1,2)],'a')[0].b,[75,75]);
  const reversed=divideSegment(doc(),source,[ratioParameter(1,2)],'b')[0].b;
  assert.ok(Math.abs(reversed[0]-125)<1e-10);assert.equal(reversed[1],75);
});
test('division IDs cannot collide with existing lines or annotation objects',()=>{
  const drawing=doc([source,line('source::divide:2',[0,0],[10,0])]);
  drawing.objects=[{id:'source::divide:2:2',kind:'text',position:[10,10],text:'x',fontSize:5,color:'#000000'}];
  const pieces=divideSegment(drawing,source,[.5]);
  assert.equal(pieces[1].id,'source::divide:2:3');
  validateDoc({...drawing,segments:[...pieces,drawing.segments[1]]});
});
test('duplicate, endpoint, nonfinite and too-close subdivision points fail atomically',()=>{
  for(const parameters of [[],[0],[1],[NaN],[.5,.5],[.5,.50000000000001]])assert.throws(()=>divideSegment(doc(),source,parameters));
});
test('manual subdivision vertices survive planarization and JSON roundtrip',()=>{
  const divided=doc(divideSegment(doc(),source,divisionParameters(3)));
  const restored=splitEditableSegments(JSON.parse(JSON.stringify(divided)));
  assert.deepEqual(restored.segments,divided.segments);
  validateDoc(restored);
});
test('extension creates a T junction which is truly split for subsequent editing',()=>{
  const s=line('s',[25,75],[75,75]),target=line('target',[150,25],[150,150]);
  const edited=splitEditableSegments(doc([extendSegment(s,'b',target),target]));
  assert.equal(edited.segments.length,3);
  assert.deepEqual(edited.segments[0].b,[150,75]);
  assert.deepEqual(edited.segments[1].b,[150,75]);
  assert.deepEqual(edited.segments[2].a,[150,75]);
});
test('perpendicular bisector starts at midpoint and ends on the chosen side',()=>{
  assert.deepEqual(perpendicularBisector([50,50],[150,50],line('t',[0,200],[200,200])),{a:[100,50],b:[100,200]});
  assert.deepEqual(perpendicularBisector([50,50],[150,50],line('t',[0,0],[200,0])),{a:[100,50],b:[100,0]});
  assert.deepEqual(perpendicularBisector([50,50],[50,150],line('t',[0,0],[0,200])),{a:[50,100],b:[0,100]});
});
test('perpendicular bisector rejects coincident points, midpoint cutoff and target extension',()=>{
  assert.throws(()=>perpendicularBisector([50,50],[50,50],source));
  assert.throws(()=>perpendicularBisector([50,50],[150,50],line('t',[0,50],[200,50])));
  assert.throws(()=>perpendicularBisector([50,50],[150,50],line('t',[125,200],[200,200])));
});
