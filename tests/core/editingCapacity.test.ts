import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDoc,type Doc,type Segment} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {buildSnapPoints} from '../../src/app/snapPoints';
import {splitIntersections} from '../../src/core/geometry';
import {exportDocument,importDocument} from '../../src/core/formats';
import {overlappingSegmentPairs} from '../../src/core/segmentPairs';

const parallel=(count:number):Doc=>({...blankDoc('大图'),segments:Array.from({length:count},(_,i)=>({id:'s'+i,a:[0,i/100],b:[200,i/100],assignment:'V',angle:180} as Segment))});

test('50,000 editable segments save, export and reopen without truncation',()=>{
 const count=50000;
 const doc=parallel(count),before=structuredClone(doc);validateDoc(doc);
 for(const format of ['json','cp','ori','orh'] as const){
  const output=exportDocument(doc,format,{cpCoordinates:'original'}),loaded=importDocument(output.text,format).doc;
  assert.equal(loaded.segments.length,count,format);
  assert.deepEqual(loaded.segments.at(-1)!.b,doc.segments.at(-1)!.b,format);
 }
 validateDoc(parallel(count+1));assert.deepEqual(doc,before);
 assert.equal(buildSnapPoints(doc).length,count*2);
 assert.equal(splitIntersections(doc).segments.length,count);
});

test('real crossing geometry can exceed the former 48,000 split-edge cap',()=>{
 const doc=blankDoc('密网格',160,160);
 for(let i=1;i<160;i++)doc.segments.push(
  {id:'h'+i,a:[0,i],b:[160,i],assignment:'M',angle:-180},
  {id:'v'+i,a:[i,0],b:[i,160],assignment:'V',angle:180});
 const split=splitIntersections(doc);
 assert.equal(split.segments.length,51520);assert.ok(split.segments.length>48000);
 assert.deepEqual(doc.segments.find(s=>s.id==='h1')!.b,[160,1]);
});

test('swept bounding pairs match brute-force pairs including tolerance and degenerate segments',()=>{
 let seed=321;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 const segments=Array.from({length:150},()=>({a:[random()*20-10,random()*20-10] as [number,number],b:[random()*20-10,random()*20-10] as [number,number]}));
 segments.push({a:[0,0],b:[0,0]},{a:[0,1e-7],b:[0,1]});
 const eps=1e-6,expected:string[]=[];
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j];
  if([0,1].every(axis=>Math.max(a.a[axis],a.b[axis])+eps>=Math.min(b.a[axis],b.b[axis])&&Math.max(b.a[axis],b.b[axis])+eps>=Math.min(a.a[axis],a.b[axis])))expected.push(i+':'+j);
 }
 const actual=[...overlappingSegmentPairs(segments,eps)].map(pair=>pair.join(':'));
 assert.deepEqual(actual.sort(),expected.sort());assert.equal(new Set(actual).size,actual.length);
});
