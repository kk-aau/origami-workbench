import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXFLines,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import {processingPreviewPaths,processingPreviewLines,processingPreviewStatistics} from '../../src/app/cpProcessingPreview';
import type {Doc,Segment,Point,Assignment} from '../../src/core/types';
const edge=(id:string,a:Point,b:Point,assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
const doc=(segments:Segment[]):Doc=>({name:'加工预览',paper:{width:100,height:100},segments});
function data(d:Doc,options:Parameters<typeof optimizeCPPaths>[1]){const plan=optimizeCPPaths(d,{optimizeTravel:false,...options}),text=exportCPProcessingDXFLines(d,plan).text,report=verifyCPProcessingExport(text,'dxf-lines',d,plan);return {plan,text,report};}
test('LINE statistics and preview indices count actual serialized entities rather than turn-limited trails',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0]),edge('c',[20,0],[20,10])]),{plan,report}=data(d,{pathMode:'continuous',maxTurns:1}),s=processingPreviewStatistics(plan,report);assert.equal(plan.paths.length,1);assert.equal(s.beforeEntities,3);assert.equal(s.afterEntities,2);assert.equal(s.plannedGroups,1);assert.equal(s.beforeLength,30);assert.equal(s.afterLength,30);const output=processingPreviewPaths(d,plan,false,false),items=processingPreviewLines(output);assert.equal(output.length,report.entityCount);assert.equal(items.length,2);assert.deepEqual(items[0].sourceIds,['a','b']);assert.deepEqual(items[1].sourceIds,['c']);assert.deepEqual(items.map(l=>l.path),[0,1]);assert.equal(processingPreviewPaths(d,plan,false,true).length,1);
});
test('source exclusions and zero length do not inflate participating before counts',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0]),edge('aux',[0,10],[10,10],'A'),edge('zero',[40,0],[40,0])]),{plan,report}=data(d,{pathMode:'collinear',profiles:{A:{enabled:false}}}),s=processingPreviewStatistics(plan,report);assert.equal(s.sourceEdges,2);assert.equal(s.beforeEntities,2);assert.equal(s.afterEntities,1);assert.equal(processingPreviewPaths(d,plan,true,false).length,2);assert.equal(processingPreviewPaths(d,null,true,false).length,4);
});
test('repeated passes appear in entity statistics, length and displayed line numbering',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0])]),{plan,report}=data(d,{pathMode:'collinear',profiles:{M:{passes:3}}}),s=processingPreviewStatistics(plan,report);assert.equal(s.sourceEdges,2);assert.equal(s.beforeEntities,6);assert.equal(s.afterEntities,3);assert.equal(s.afterLength,60);assert.equal(processingPreviewLines(processingPreviewPaths(d,plan,false,false)).length,3);
});
test('different settings, explicit overlaps and merge limits retain actual multiplicity',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0]),edge('duplicate',[0,0],[10,0]),edge('v',[20,0],[30,0],'V')]);
 for(const count of [1,2]){const {plan,report}=data(d,{pathMode:'collinear',overlapPolicy:'retain',maxMergedSegments:count}),s=processingPreviewStatistics(plan,report);assert.equal(s.beforeEntities,4);assert.equal(s.afterLength,40);assert.equal(s.afterEntities,processingPreviewPaths(d,plan,false,false).length);assert.equal(processingPreviewLines(processingPreviewPaths(d,plan,false,false)).flatMap(l=>l.sourceIds).length,report.processedEdgeCount);}
});
test('mismatching count, processing multiplicity, planned count or length is rejected before presentation',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0])]),{plan,report}=data(d,{pathMode:'collinear'});for(const patch of [{entityCount:2},{pathCount:2},{processedEdgeCount:3},{plannedPathCount:2},{downLength:21}])assert.throws(()=>processingPreviewStatistics(plan,{...report,...patch}),/不一致/);
});
test('preview items keep off-origin coordinates, source identities and style without mutation',()=>{
 const d=doc([edge('a',[-50,70],[-20,70]),edge('b',[-20,70],[10,70]),edge('v',[10,70],[10,90],'V')]),before=structuredClone(d),{plan,report}=data(d,{pathMode:'collinear'}),copy=structuredClone(plan),items=processingPreviewLines(processingPreviewPaths(d,plan,false,false));assert.deepEqual(items[0].a,[-50,70]);assert.deepEqual(items[0].b,[10,70]);assert.equal(items[1].assignment,'V');assert.deepEqual(items[0].sourceIds,['a','b']);processingPreviewStatistics(plan,report);assert.deepEqual(d,before);assert.deepEqual(plan,copy);
});
