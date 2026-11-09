import {test} from 'node:test';
import assert from 'node:assert/strict';
import {optimizeCPPaths} from '../../src/core/cpPathOptimizer';
import {exportDXF} from '../../src/core/dxf';
import {exportCPProcessingDXF,exportCPProcessingDXFLines,exportCPProcessingSVG,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import {defaultProcessingSettings,processingOptions} from '../../src/app/cpProcessingSettings';
import {parseDxf} from '../../vendor/cp-path-optimizer/src/dxf.mjs';
import type {Assignment,Doc,Point,Segment} from '../../src/core/types';
const edge=(id:string,a:Point,b:Point,assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:assignment==='V'?180:assignment==='M'?-180:0});
const document=(segments:Segment[]):Doc=>({name:'方向与转向',paper:{width:200,height:200},segments});
function directedCoverage(doc:Doc,passes=1){
  const plan=optimizeCPPaths(doc,{pathMode:'independent',profiles:{M:{passes},V:{passes}},overlapPolicy:'retain'});
  for(const path of plan.paths){const source=doc.segments.find(s=>s.id===path.sourceSegmentIds[0])!;assert.equal(path.sourceSegmentIds.length,1);assert.deepEqual(path.points,[source.a,source.b]);}
  assert.equal(plan.paths.length,doc.segments.length*passes);assert.ok(plan.after.travelDistance<=plan.before.travelDistance);
  return plan;
}
test('user default is collinear without travel sorting; limited continuous planning requires explicit selection',()=>{
  const doc=document([edge('a',[0,0],[10,0]),edge('b',[10,0],[10,10])]);
  const options=processingOptions(defaultProcessingSettings(),false,false,[0,0]);assert.equal(options.pathMode,'collinear');assert.equal(options.optimizeTravel,false);
  const plan=optimizeCPPaths(doc,options);assert.equal(plan.paths.length,2);
  const continuous=optimizeCPPaths(doc,processingOptions(defaultProcessingSettings(),false,false,[0,0],'continuous'));assert.equal(continuous.paths.length,1);
  assert.deepEqual(verifyCPProcessingExport(exportCPProcessingDXF(doc,continuous).text,'dxf',doc,continuous).motion,{penDownTurns:1,reversedSourceEdges:0,closedPaths:0});
});
test('independent mode never reverses a source even when its end is nearer the tool origin',()=>{
  const doc=document([edge('a',[20,0],[10,0]),edge('b',[40,0],[30,0])]);const plan=directedCoverage(doc);
  assert.deepEqual(plan.paths[0].points,[[20,0],[10,0]]);
  for(const [format,write] of [['dxf',exportCPProcessingDXF],['dxf-lines',exportCPProcessingDXFLines],['svg',exportCPProcessingSVG]] as const){
    const report=verifyCPProcessingExport(write(doc,plan).text,format,doc,plan);assert.equal(report.motion.reversedSourceEdges,0);assert.equal(report.motion.penDownTurns,0);
  }
});
test('independent crossing, turn, disconnected and closed-loop inputs retain every full directed edge',()=>{
  for(const segments of [
    [edge('a',[-1,0],[0,0]),edge('b',[0,0],[1,0]),edge('c',[0,-1],[0,0]),edge('d',[0,0],[0,1])],
    [edge('a',[0,0],[10,0]),edge('b',[10,0],[0,1])],
    [edge('a',[0,0],[1,0]),edge('b',[10,1],[11,1])],
    [edge('a',[0,0],[10,0]),edge('b',[10,0],[10,10]),edge('c',[10,10],[0,10]),edge('d',[0,10],[0,0])],
  ]){
    const doc=document(segments),plan=directedCoverage(doc);
    const text=exportCPProcessingDXFLines(doc,plan).text,report=verifyCPProcessingExport(text,'dxf-lines',doc,plan);
    assert.equal(report.processedEdgeCount,segments.length);assert.deepEqual(report.motion,{penDownTurns:0,reversedSourceEdges:0,closedPaths:0});
    assert.equal(parseDxf(text).segments.length,segments.length);
  }
});
test('R12 independent output has the exact directed entity records of ordinary DXF, only in a different order',()=>{
  const doc=document([edge('far',[90.123456789123,-30],[60,-50],'M'),edge('near',[-2,-1],[3,4],'V'),edge('next',[5,0],[9,0],'M')]);
  const plan=optimizeCPPaths(doc,{pathMode:'independent'}),ordinary=exportDXF(doc).text,optimized=exportCPProcessingDXFLines(doc,plan).text;
  const entities=(text:string)=>text.split('0\r\nSECTION\r\n2\r\nENTITIES\r\n')[1].split('0\r\nENDSEC')[0].split('0\r\nLINE\r\n').slice(1).sort();
  assert.deepEqual(entities(optimized),entities(ordinary));
  const shell=(text:string)=>text.replace(/(0\r\nSECTION\r\n2\r\nENTITIES\r\n)[\s\S]*?(0\r\nENDSEC)/,'$1$2');
  assert.equal(shell(optimized),shell(ordinary));assert.ok(plan.after.travelDistance<=plan.before.travelDistance);
});
test('explicit multi-pass and overlap retain directed processing counts without connecting return moves',()=>{
  const doc=document([edge('a',[10,0],[0,0]),edge('b',[0,0],[10,0],'V')]),plan=directedCoverage(doc,3);
  const report=verifyCPProcessingExport(exportCPProcessingDXFLines(doc,plan).text,'dxf-lines',doc,plan);
  assert.deepEqual(report.sourcePasses,{a:3,b:3});assert.equal(report.pathCount,6);assert.equal(report.motion.reversedSourceEdges,0);
});
test('independent mode rejects reversal or a continuous plan relabeled as independent',()=>{
  const doc=document([edge('a',[0,0],[1,0]),edge('b',[1,0],[1,1])]);
  const continuous=optimizeCPPaths(doc);continuous.options.pathMode='independent';
  assert.throws(()=>exportCPProcessingDXF(doc,continuous),/逐边/);
  const plan=directedCoverage(doc);plan.paths[0].points.reverse();
  assert.throws(()=>exportCPProcessingDXFLines(doc,plan),/逐边/);
  assert.throws(()=>optimizeCPPaths(doc,{pathMode:'bogus' as 'independent'}),/模式/);
});
test('continuous R12 reports zero pen-down turns but still reports any reversed source directions',()=>{
  const doc=document([edge('a',[10,0],[0,0]),edge('b',[10,0],[10,10])]),plan=optimizeCPPaths(doc);
  const report=verifyCPProcessingExport(exportCPProcessingDXFLines(doc,plan).text,'dxf-lines',doc,plan);
  assert.equal(report.motion.penDownTurns,0);assert.ok(report.motion.reversedSourceEdges>0);
});
test('large independent mode keeps directions and bounded fallback even for nearest-route exceptions',()=>{
  const doc=document(Array.from({length:1600},(_,i)=>edge('s'+i,[i*2+1,i%9],[i*2,i%9])));directedCoverage(doc);
});
test('R2000 and R12 keep off-origin paper boundary and inner folds in one unchanged coordinate frame',()=>{
  const doc=document([
    edge('B0',[-43.2,-17.8],[156.8,-17.8],'B'),edge('B1',[156.8,-17.8],[156.8,82.2],'B'),
    edge('B2',[156.8,82.2],[-43.2,82.2],'B'),edge('B3',[-43.2,82.2],[-43.2,-17.8],'B'),
    edge('M0',[-20.123456789,-5.9],[40.75,61.875],'M'),edge('V0',[120.4,11.25],[70.2,72.875],'V'),
  ]);
  for(const pathMode of ['independent','continuous'] as const){
    const plan=optimizeCPPaths(doc,{pathMode});assert.deepEqual(plan.groups[0].assignments,['B'],'boundary is not forcibly moved to the last group');
    for(const write of [exportCPProcessingDXF,exportCPProcessingDXFLines]){
      const imported=parseDxf(write(doc,plan).text).segments;
      const geometry=(segments:any[])=>segments.map(s=>JSON.stringify([s.layer,[s.a,s.b].sort((a:Point,b:Point)=>a[0]-b[0]||a[1]-b[1])])).sort();
      const expected=parseDxf(exportDXF(doc).text).segments;
      assert.deepEqual(geometry(imported),geometry(expected),'each boundary and fold edge keeps its exact layer and relative position');
    }
  }
});
test('readback rejects translating only the paper boundary while inner folds stay correct',()=>{
  const doc=document([edge('B0',[-20,10],[180,10],'B'),edge('M0',[0,25],[60,80],'M')]),plan=optimizeCPPaths(doc,{pathMode:'continuous'});
  const text=exportCPProcessingDXF(doc,plan).text;
  const changed=text.replace(/(\s*0\r\nLWPOLYLINE\r\n[\s\S]*?\s*8\r\nCutLine\r\n[\s\S]*?\s*10\r\n)([^\r]+)/,(_,prefix,value)=>prefix+String(Number(value)+2));
  assert.notEqual(changed,text);assert.throws(()=>verifyCPProcessingExport(changed,'dxf',doc,plan),/核验失败/);
});
