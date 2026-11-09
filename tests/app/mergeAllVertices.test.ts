import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point,Segment,Assignment} from '../../src/core/types';
import {mergeAllCrossTypeVertices,mergeAllVertices} from '../../src/app/mergeAllVertices';
const s=(id:string,a:Point,b:Point,assignment:Assignment='M',angle:number|null=assignment==='M'?-180:assignment==='V'?180:0):Segment=>({id,a,b,assignment,angle});
const doc=(...segments:Segment[]):Doc=>({name:'batch',paper:{width:200,height:200},segments});
test('batch merge collapses a chain in one operation, preserves source and other document fields',()=>{
 const source={...doc(s('c',[20,0],[30,0]),s('a',[0,0],[10,0]),s('b',[10,0],[20,0])),metadata:{author:'test'},objects:[{id:'txt',kind:'text' as const,position:[1,1] as Point,text:'keep',fontSize:3,color:'#000000'}]};
 const before=structuredClone(source),r=mergeAllVertices(source);assert.equal(r.merged,2);assert.equal(r.doc.segments.length,1);assert.deepEqual(r.doc.segments[0],s('a',[0,0],[30,0]));assert.deepEqual([...r.changedIds],['a']);assert.deepEqual(source,before);assert.equal(r.doc.objects,source.objects);assert.equal(r.doc.metadata,source.metadata);assert.equal(mergeAllVertices(r.doc).merged,0);
});
test('T and X junctions remain even for unsegmented input, collinear chains elsewhere merge',()=>{
 const r=mergeAllVertices(doc(s('h',[0,0],[40,0]),s('v',[20,-20],[20,20]),s('one',[0,60],[10,60]),s('two',[10,60],[20,60])));
 assert.equal(r.merged,1);assert.equal(r.doc.segments.length,5);
 const t=doc(s('a',[0,0],[10,0]),s('b',[10,0],[20,0]),s('c',[10,0],[10,10]));assert.equal(mergeAllVertices(t).doc,t);
});
test('boundary protection, colour/angle conflicts, turns and auxiliary lines are preserved',()=>{
 for(const source of [doc(s('a',[0,0],[10,0]),s('b',[10,0],[20,0],'V')),doc(s('a',[0,0],[10,0]),s('b',[10,0],[20,0],'M',-90)),doc(s('a',[0,0],[10,0]),s('b',[10,0],[10,10])),doc(s('a',[0,0],[10,0],'A'),s('b',[10,0],[20,0],'A'))])assert.equal(mergeAllVertices(source).doc,source);
 const boundary=doc(s('a',[0,0],[10,0],'B'),s('b',[10,0],[20,0],'B'));assert.equal(mergeAllVertices(boundary,true).merged,0);assert.equal(mergeAllVertices(boundary,false).merged,1);
});
test('overlapping duplicate edges do not collapse into an invalid segment',()=>{
 const source=doc(s('a',[0,0],[10,0]),s('b',[0,0],[10,0]));assert.equal(mergeAllVertices(source).merged,0);
});
test('cross-type batch merge applies explicit mountain/valley rules',()=>{
 const mv=mergeAllCrossTypeVertices(doc(s('m',[0,0],[10,0],'M'),s('v',[10,0],[20,0],'V')));
 assert.equal(mv.merged,1);assert.equal(mv.doc.segments[0].assignment,'B');assert.equal(mv.doc.segments[0].angle,0);
 const bm=mergeAllCrossTypeVertices(doc(s('b',[0,0],[10,0],'B'),s('m',[10,0],[20,0],'M')));
 assert.equal(bm.merged,1);assert.equal(bm.doc.segments[0].assignment,'M');
});
test('cross-type batch leaves same-type angle conflicts unless resolved explicitly',()=>{
 const source=doc(s('a',[0,0],[10,0],'M',-90),s('b',[10,0],[20,0],'M',-180));
 assert.equal(mergeAllCrossTypeVertices(source).merged,0);
 const resolved=mergeAllCrossTypeVertices(source,false,null);
 assert.equal(resolved.merged,1);assert.equal(resolved.doc.segments[0].angle,null);
});
