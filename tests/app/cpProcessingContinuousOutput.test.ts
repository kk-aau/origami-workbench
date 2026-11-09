import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXFLines,exportCPProcessingDXFR12Polyline,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import {processingPreviewPaths,processingPreviewLines,processingPreviewStrokeOwners,processingPreviewStatistics} from '../../src/app/cpProcessingPreview';
import type {Doc,Segment,Point,Assignment} from '../../src/core/types';
import type {CPProcessingReply,CPProcessingRequest} from '../../src/app/cpProcessingTask';

const edge=(id:string,a:Point,b:Point,assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:null});
const doc=(segments:Segment[]):Doc=>({name:'R12 连续预览',paper:{width:100,height:100},segments});
const shape=()=>doc([edge('a',[-40,70],[-30,70]),edge('b',[-30,70],[-20,70]),edge('c',[-20,70],[-20,90])]);
function output(d:Doc,options:Parameters<typeof optimizeCPPaths>[1]={}){
 const plan=optimizeCPPaths(d,{pathMode:'continuous',maxTurns:1,optimizeTravel:false,...options});
 const report=verifyCPProcessingExport(exportCPProcessingDXFR12Polyline(d,plan).text,'dxf-r12-polyline',d,plan);
 const paths=processingPreviewPaths(d,plan,false,false,report.representation);
 const lines=processingPreviewLines(paths,processingPreviewStrokeOwners(plan,false,false,paths.length,report.representation));
 return {plan,report,paths,lines,statistics:processingPreviewStatistics(plan,report)};
}

test('continuous preview counts the one actual POLYLINE and highlights all its original edges',()=>{
 const d=shape(),before=structuredClone(d),{plan,report,paths,lines,statistics}=output(d);
 assert.equal(report.entityCount,1);assert.equal(paths.length,1);assert.equal(statistics.beforeEntities,3);assert.equal(statistics.afterEntities,1);
 assert.equal(statistics.afterLength,40);assert.equal(statistics.afterTravel,plan.after.travelDistance);
 assert.deepEqual(lines.map(l=>l.path),[0,0,0]);assert.deepEqual(lines.map(l=>l.stroke),[0,0,0]);
 assert.deepEqual(lines.flatMap(l=>l.sourceIds),['a','b','c']);assert.deepEqual(paths[0].points,[[-40,70],[-30,70],[-20,70],[-20,90]]);
 assert.equal(processingPreviewPaths(d,plan,true,false,report.representation).length,3);assert.deepEqual(d,before);
});

test('explicit LINE preview remains separate from the new continuous representation',()=>{
 const d=shape(),{plan,report}=output(d),lineReport=verifyCPProcessingExport(exportCPProcessingDXFLines(d,plan).text,'dxf-lines',d,plan);
 assert.equal(processingPreviewPaths(d,plan,false,false).length,2);assert.equal(processingPreviewStatistics(plan,lineReport).afterEntities,2);
 assert.equal(processingPreviewStatistics(plan,report).afterEntities,1);
});

test('turn limits, distinct settings and repeated passes remain distinct continuous entities',()=>{
 const d=doc([...shape().segments,edge('valley',[-20,90],[0,90],'V'),edge('away',[20,120],[30,120])]);
 for(const maxTurns of [0,1]){
  const {report,lines,statistics}=output(d,{maxTurns,profiles:{M:{passes:2},V:{passes:1}}});
  assert.equal(statistics.beforeEntities,9);assert.equal(statistics.afterLength,120);assert.equal(statistics.afterEntities,report.entityCount);
  const sourceA=lines.filter(l=>l.sourceIds.includes('a')),sourceC=lines.filter(l=>l.sourceIds.includes('c'));
  assert.equal(sourceA.length,2);assert.notEqual(sourceA[0].stroke,sourceA[1].stroke);
  assert.equal(sourceA[0].stroke===sourceC[0].stroke,maxTurns===1);
  const valley=lines.find(l=>l.sourceIds.includes('valley'))!;assert.ok(sourceA.every(l=>l.stroke!==valley.stroke));
 }
});

test('continuous statistics reject stale representation, count, length and travel data',()=>{
 const {plan,report}=output(shape());
 for(const patch of [{representation:'dxf-line' as const},{entityCount:2},{pathCount:2},{downLength:41},{downLength:NaN},{travelLength:NaN},{travelLength:report.travelLength+1}])assert.throws(()=>processingPreviewStatistics(plan,{...report,...patch}),/不一致/);
});

test('processing worker selects R12 continuous only for continuous mode, keeps ordinary LINE and blocks unconfirmed overlap',async()=>{
 const global=globalThis as unknown as {self?:unknown},old=global.self;
 const replies:CPProcessingReply[]=[],scope={onmessage:null as null|((event:MessageEvent<CPProcessingRequest>)=>void),postMessage:(reply:CPProcessingReply)=>replies.push(reply)};
 try{
  global.self=scope;await import('../../src/workers/cpProcessing.worker');
  const d=shape(),before=structuredClone(d);
  for(const pathMode of ['continuous','collinear','independent'] as const){
   scope.onmessage!({data:{doc:d,options:{pathMode,maxTurns:1,optimizeTravel:false}}} as MessageEvent<CPProcessingRequest>);
   const reply=replies.at(-1)!;assert.equal(reply.status,'ready');if(reply.status!=='ready')assert.fail('worker failed');
   assert.equal(reply.files.report.format,pathMode==='continuous'?'dxf-r12-polyline':'dxf-lines');
   assert.equal(reply.files.dxf.includes('\r\nPOLYLINE\r\n'),pathMode==='continuous');assert.ok(!reply.files.dxf.includes('LWPOLYLINE'));
   assert.equal(processingPreviewStatistics(reply.plan,reply.files.report).afterEntities,pathMode==='continuous'?1:pathMode==='collinear'?2:3);
  }
  const overlap=doc([...d.segments,edge('dup',[-40,70],[-30,70])]);
  scope.onmessage!({data:{doc:overlap,options:{pathMode:'continuous'}}} as MessageEvent<CPProcessingRequest>);assert.equal(replies.at(-1)!.status,'blocked');
  scope.onmessage!({data:{doc:overlap,options:{pathMode:'continuous',overlapPolicy:'retain'}}} as MessageEvent<CPProcessingRequest>);assert.equal(replies.at(-1)!.status,'ready');
  assert.deepEqual(d,before);
 }finally{if(old===undefined)delete global.self;else global.self=old;}
});
