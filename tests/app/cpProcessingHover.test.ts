import test from 'node:test';import assert from 'node:assert/strict';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {processingPreviewPaths,processingPreviewLines,processingPreviewStrokeOwners} from '../../src/app/cpProcessingPreview';
import {exportCPProcessingDXFLines,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import type {Doc,Segment,Point,Assignment} from '../../src/core/types';
const edge=(id:string,a:Point,b:Point,assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0}),doc=(segments:Segment[]):Doc=>({name:'连续路径高亮',paper:{width:100,height:100},segments});
const preview=(d:Doc,options:Parameters<typeof optimizeCPPaths>[1],original=false,groups=false)=>{const plan=optimizeCPPaths(d,{optimizeTravel:false,...options}),paths=processingPreviewPaths(d,plan,original,groups),lines=processingPreviewLines(paths,processingPreviewStrokeOwners(plan,original,groups));return {plan,paths,lines};};
test('default exported-LINE view assigns both arms of a turned route to one hover owner',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0]),edge('c',[20,0],[20,10])]),{plan,lines}=preview(d,{pathMode:'continuous',maxTurns:1});assert.equal(plan.paths.length,1);assert.equal(lines.length,2);assert.deepEqual(lines.map(l=>l.path),[0,1]);assert.deepEqual(lines.map(l=>l.stroke),[0,0]);assert.deepEqual(lines.flatMap(l=>l.sourceIds),['a','b','c']);
 const text=exportCPProcessingDXFLines(d,plan).text,report=verifyCPProcessingExport(text,'dxf-lines',d,plan);assert.equal(report.entityCount,2);assert.equal(report.downLength,30);
});
test('turn limit splits hover owners at the actual optimization boundary',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[10,10]),edge('c',[10,10],[20,10]),edge('d',[20,10],[20,20])]),{plan,lines}=preview(d,{pathMode:'continuous',maxTurns:1});assert.equal(plan.paths.length,2);assert.deepEqual(lines.map(l=>l.stroke),[0,0,1,1]);
});
test('planning-group mode highlights its whole original multi-edge route too',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0]),edge('c',[20,0],[20,10])]),{lines}=preview(d,{pathMode:'continuous',maxTurns:1},false,true);assert.equal(lines.length,3);assert.deepEqual(lines.map(l=>l.stroke),[0,0,0]);
});
test('original and independent modes retain one source occurrence per hover',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[10,10])]);for(const [original,mode]of [[true,'continuous'],[false,'independent']] as const){const {lines}=preview(d,{pathMode:mode,maxTurns:1},original);assert.deepEqual(lines.map(l=>l.stroke),[0,1]);}
});
test('equal-coordinate repeated passes keep distinct collinear optimization owners',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0])]),{lines}=preview(d,{pathMode:'collinear',profiles:{M:{passes:2}}});assert.equal(lines.length,2);assert.deepEqual(lines.map(l=>l.stroke),[0,1]);assert.deepEqual(lines[0].sourceIds,lines[1].sourceIds);
});
test('separate settings and disconnected paths cannot acquire an adjacent hover owner',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[10,10]),edge('v',[10,10],[20,10],'V'),edge('isolated',[50,50],[60,50])]),{lines}=preview(d,{pathMode:'continuous',maxTurns:2});const a=lines.find(l=>l.sourceIds.includes('a'))!,b=lines.find(l=>l.sourceIds.includes('b'))!,v=lines.find(l=>l.sourceIds.includes('v'))!,isolated=lines.find(l=>l.sourceIds.includes('isolated'))!;assert.equal(a.stroke,b.stroke);assert.notEqual(a.stroke,v.stroke);assert.notEqual(a.stroke,isolated.stroke);
});
test('collinear hover covers the complete merged LINE and honors merge limits',()=>{
 const d=doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[20,0]),edge('c',[20,0],[30,0])]);const merged=preview(d,{pathMode:'collinear'});assert.equal(merged.lines.length,1);assert.deepEqual(merged.lines[0].a,[0,0]);assert.deepEqual(merged.lines[0].b,[30,0]);const limited=preview(d,{pathMode:'collinear',maxMergedSegments:2});assert.deepEqual(limited.lines.map(l=>l.stroke),[0,1]);
});
test('hover ownership never alters source, plan, entity counts or coordinates',()=>{
 const d=doc([edge('a',[-40,70],[-20,70]),edge('b',[-20,70],[-20,90])]),source=structuredClone(d),{plan}=preview(d,{pathMode:'continuous',maxTurns:1}),before=structuredClone(plan),text=exportCPProcessingDXFLines(d,plan).text;for(const original of [false,true])for(const groups of [false,true]){const paths=processingPreviewPaths(d,plan,original,groups);processingPreviewLines(paths,processingPreviewStrokeOwners(plan,original,groups));}assert.deepEqual(d,source);assert.deepEqual(plan,before);assert.equal(exportCPProcessingDXFLines(d,plan).text,text);assert.deepEqual(processingPreviewStrokeOwners(null,false,false,2),[0,1]);
});
