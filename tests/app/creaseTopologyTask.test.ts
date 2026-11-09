import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startCreaseTopology,CREASE_TOPOLOGY_CHUNK,type CreaseTopologyRequest,type CreaseTopologyReply} from '../../src/app/creaseTopologyTask';
import {buildSnapPoints,type SnapPoint} from '../../src/app/snapPoints';
import {creaseVertices} from '../../src/app/creaseVertices';
import type {Doc,Point,Segment} from '../../src/core/types';

function document(count=1):Doc{return {name:'test',paper:{width:200,height:200},segments:Array.from({length:count},(_,i)=>({id:'s'+i,a:[i,0],b:[i,1],assignment:'V',angle:180}))};}
function harness(){
 const fake={onmessage:null as ((event:{data:CreaseTopologyReply})=>void)|null,onerror:null as ((event:{message:string;preventDefault():void})=>void)|null,onmessageerror:null as (()=>void)|null,
  posted:[] as CreaseTopologyRequest[],terminated:0,
  terminate(){this.terminated++;},postMessage(message:CreaseTopologyRequest){this.posted.push(structuredClone(message));}};
 return {fake,factory:()=>fake as unknown as Worker,reply:(data:CreaseTopologyReply)=>fake.onmessage!({data})};
}
async function uploaded(fake:ReturnType<typeof harness>['fake']){
 for(let tries=0;tries<1000&&!fake.posted.some(message=>message.type==='compute');tries++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(fake.posted.at(-1)?.type,'compute');
}
const point=(i:number):SnapPoint=>({id:'p'+i,kind:'endpoint',point:[i,0],segmentIds:['s'+i]});

test('large topology input yields bounded exact chunks without cloning unrelated metadata',async()=>{
 const source=document(CREASE_TOPOLOGY_CHUNK*2+3),{fake,factory,reply}=harness();
 source.metadata={unrelated:{large:'do not send'}};
 const task=startCreaseTopology(source,false,undefined,factory);
 assert.equal(fake.posted.length,1);assert.deepEqual(fake.posted[0],{type:'begin',paper:source.paper,count:source.segments.length,readOnly:false,includeVertices:true});
 await uploaded(fake);
 const chunks=fake.posted.filter((message):message is Extract<CreaseTopologyRequest,{type:'segments'}>=>message.type==='segments');
 assert.deepEqual(chunks.map(chunk=>chunk.offset),[0,CREASE_TOPOLOGY_CHUNK,CREASE_TOPOLOGY_CHUNK*2]);
 assert.deepEqual(chunks.flatMap(chunk=>chunk.segments),source.segments);
 assert.ok(chunks.every(chunk=>chunk.segments.length<=CREASE_TOPOLOGY_CHUNK));
 reply({type:'result-begin',points:0,vertices:0});reply({type:'complete'});
 assert.equal((await task.promise).status,'ready');assert.equal(fake.terminated,1);
});

test('topology is published only after every ordered point and vertex chunk arrives',async()=>{
 const {fake,factory,reply}=harness(),task=startCreaseTopology(document(),false,undefined,factory);
 await uploaded(fake);let published=false;void task.promise.then(()=>{published=true;});
 const points=Array.from({length:CREASE_TOPOLOGY_CHUNK+1},(_,i)=>point(i)),vertices:Point[]=[[0,0],[1,1]];
 reply({type:'result-begin',points:points.length,vertices:vertices.length});
 reply({type:'points',offset:0,points:points.slice(0,CREASE_TOPOLOGY_CHUNK)});
 await Promise.resolve();assert.equal(published,false);
 reply({type:'points',offset:CREASE_TOPOLOGY_CHUNK,points:points.slice(CREASE_TOPOLOGY_CHUNK)});
 reply({type:'vertices',offset:0,vertices});await Promise.resolve();assert.equal(published,false);
 reply({type:'complete'});
 assert.deepEqual(await task.promise,{status:'ready',value:{points,vertices}});assert.equal(fake.terminated,1);
});

test('cancel stops input upload and ignores all late progress or partial results',async()=>{
 const {fake,factory,reply}=harness(),stages:string[]=[],task=startCreaseTopology(document(CREASE_TOPOLOGY_CHUNK+1),false,message=>stages.push(message),factory);
 task.cancel();const count=stages.length;
 reply({type:'result-begin',points:0,vertices:0});reply({type:'complete'});
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal((await task.promise).status,'cancelled');assert.equal(fake.posted.length,1);assert.equal(stages.length,count);assert.equal(fake.terminated,1);
});

test('cancel during result reception never exposes a partial set and fresh retry is independent',async()=>{
 const old=harness(),task=startCreaseTopology(document(),false,undefined,old.factory);await uploaded(old.fake);
 old.reply({type:'result-begin',points:2,vertices:0});old.reply({type:'points',offset:0,points:[point(0)]});task.cancel();
 const fresh=harness(),retry=startCreaseTopology(document(),false,undefined,fresh.factory);await uploaded(fresh.fake);
 old.reply({type:'points',offset:1,points:[point(1)]});old.reply({type:'complete'});
 fresh.reply({type:'result-begin',points:1,vertices:0});fresh.reply({type:'points',offset:0,points:[point(9)]});fresh.reply({type:'complete'});
 assert.equal((await task.promise).status,'cancelled');assert.deepEqual(await retry.promise,{status:'ready',value:{points:[point(9)],vertices:[]}});
});

test('incomplete, duplicated and out-of-order replies fail instead of making editing ready',async()=>{
 for(const invalid of [
  [{type:'complete'}],
  [{type:'result-begin',points:2,vertices:0},{type:'points',offset:0,points:[point(0)]},{type:'complete'}],
  [{type:'result-begin',points:1,vertices:1},{type:'vertices',offset:0,vertices:[[0,0]]}],
  [{type:'result-begin',points:1,vertices:0},{type:'points',offset:1,points:[point(0)]}],
  [{type:'result-begin',points:-1,vertices:0}],
 ] as CreaseTopologyReply[][]){
  const {fake,factory,reply}=harness(),task=startCreaseTopology(document(),false,undefined,factory);await uploaded(fake);
  invalid.forEach(reply);const result=await task.promise;assert.equal(result.status,'error');assert.equal(fake.terminated,1);
 }
});

test('worker startup, transfer and runtime failures stay unavailable without a synchronous fallback',async()=>{
 const failure=startCreaseTopology(document(),false,undefined,()=>{throw new Error('allocation failed');});assert.equal((await failure.promise).status,'error');
 for(const event of ['clone','runtime']){
  const {fake,factory}=harness(),task=startCreaseTopology(document(),false,undefined,factory);
  if(event==='clone')fake.onmessageerror!();else fake.onerror!({message:'failed',preventDefault(){}});
  assert.equal((await task.promise).status,'error');assert.equal(fake.terminated,1);
 }
});

test('actual worker protocol retains precise crossing, auxiliary and collinear identities',async()=>{
 const scope=globalThis as unknown as {onmessage:((event:{data:CreaseTopologyRequest})=>void)|undefined;postMessage:((reply:CreaseTopologyReply)=>void)|undefined};
 const previous={onmessage:scope.onmessage,postMessage:scope.postMessage},replies:CreaseTopologyReply[]=[];
 try{
  scope.postMessage=reply=>replies.push(structuredClone(reply));
  await import('../../src/workers/creaseTopology.worker');
  const segments:Segment[]=[{id:'a',a:[0,0],b:[3,1],assignment:'M',angle:-180},{id:'b',a:[0,1],b:[4,0],assignment:'V',angle:180},{id:'aux',a:[0,0],b:[1.5,.5],assignment:'A',angle:0}];
  const doc:Doc={name:'precise',paper:{width:10,height:10},segments},original=structuredClone(doc);
  const send=(data:CreaseTopologyRequest)=>scope.onmessage!({data});
  send({type:'begin',paper:doc.paper,count:segments.length,readOnly:false,includeVertices:true});send({type:'segments',offset:0,segments});send({type:'compute'});
  while(replies.at(-1)?.type!=='complete')send({type:'next'});
  const actualPoints=replies.flatMap(reply=>reply.type==='points'?reply.points:[]),actualVertices=replies.flatMap(reply=>reply.type==='vertices'?reply.vertices:[]);
  assert.deepEqual(actualPoints,buildSnapPoints(doc));assert.deepEqual(actualVertices,creaseVertices(doc.segments));assert.deepEqual(doc,original);
  const crossing=actualPoints.find(p=>Math.abs(p.point[0]-12/7)<1e-12);assert.ok(crossing);assert.deepEqual(crossing.segmentIds,['a','b']);
 }finally{scope.onmessage=previous.onmessage;scope.postMessage=previous.postMessage;}
});
