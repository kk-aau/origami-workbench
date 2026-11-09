import {test} from 'node:test';
import assert from 'node:assert/strict';
import {optimizeCPPaths,cpPathTurnCount,cpProcessingLineRuns} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXFLines,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import {exportDXF} from '../../src/core/dxf';
import {parseDxf} from '../../vendor/cp-path-optimizer/src/dxf.mjs';
import {defaultProcessingSettings,processingOptions} from '../../src/app/cpProcessingSettings';
import type {Doc,Point,Segment,Assignment} from '../../src/core/types';
const edge=(id:string,a:Point,b:Point,assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
const doc=(segments:Segment[]):Doc=>({name:'优化方案',paper:{width:200,height:200},segments});
const collinear=(length?:number,count?:number)=>({pathMode:'collinear' as const,optimizeTravel:false,maxMergedLength:length,maxMergedSegments:count});
function roundtrip(d:Doc,options:Parameters<typeof optimizeCPPaths>[1]){
  const before=structuredClone(d),ordinary=exportDXF(d).text,plan=optimizeCPPaths(d,options),file=exportCPProcessingDXFLines(d,plan).text;
  const report=verifyCPProcessingExport(file,'dxf-lines',d,plan),parsed=parseDxf(file);
  assert.equal(parsed.version,'AC1009');assert.ok(!/LWPOLYLINE|POLYLINE|APPID|XDATA/.test(file));
  assert.equal(report.processedEdgeCount,plan.analysis.included.length*(options?.profiles?.M?.passes??1));
  assert.deepEqual(d,before);assert.equal(exportDXF(d).text,ordinary);
  assert.equal(report.motion.penDownTurns,0);assert.equal(report.machineTrialVerified,false);
  return {plan,file,report,parsed};
}
test('connected collinear source edges really serialize as one ordinary LINE, retaining every source visit',()=>{
  const d=doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0]),edge('c',[2,0],[3,0])]),r=roundtrip(d,collinear());
  assert.equal(r.parsed.segments.length,1);assert.deepEqual(r.parsed.segments[0].a,[0,0]);assert.deepEqual(r.parsed.segments[0].b,[3,0]);
  assert.deepEqual(r.report.sourcePasses,{a:1,b:1,c:1});assert.equal(r.report.downLength,3);
});
test('unsplit crossing, branch, near-collinearity and tiny endpoint gaps never get drawn connectors',()=>{
  const cases=[
    [edge('a',[0,0],[1,0]),edge('b',[1+1e-12,0],[2,0])],
    [edge('a',[0,0],[1,0]),edge('b',[1,0],[2,1e-12])],
    [edge('a',[0,0],[2,0]),edge('b',[1,0],[1,1])],
    [edge('a',[0,0],[2,2]),edge('b',[0,2],[2,0])],
  ];
  for(const edges of cases)assert.equal(roundtrip(doc(edges),collinear()).parsed.segments.length,2);
});
test('a split branch can merge the full straight chain without dropping the branch',()=>{
  const r=roundtrip(doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0]),edge('c',[1,0],[1,1])]),collinear());
  assert.equal(r.parsed.segments.length,2);assert.equal(r.report.downLength,3);
});
test('merged length and source count each cap entities, and 1 restores source lines',()=>{
  const d=doc(Array.from({length:6},(_,i)=>edge('s'+i,[i,0],[i+1,0])));
  for(const [length,count,expected] of [[undefined,undefined,1],[2.1,undefined,3],[undefined,2,3],[4,2,3],[undefined,1,6]] as const){
    const r=roundtrip(d,collinear(length,count));assert.equal(r.parsed.segments.length,expected);
    for(const line of r.parsed.segments)if(length!==undefined)assert.ok(Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1])<=length);
    if(count!==undefined)assert.ok(cpProcessingLineRuns(r.plan).every(run=>run.endEdge-run.firstEdge<=count));
  }
});
test('original long edges remain whole with a warning rather than being shortened to the merge limit',()=>{
  const r=roundtrip(doc([edge('a',[0,0],[10,0]),edge('b',[10,0],[11,0])]),collinear(3));
  assert.equal(r.parsed.segments.length,2);assert.ok(r.plan.analysis.issues.some(i=>i.code==='long-source'));assert.equal(r.report.downLength,11);
});
test('different assignments or settings do not merge without explicit same-setting permission',()=>{
  const d=doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0],'V')]),draft=defaultProcessingSettings();
  assert.equal(roundtrip(d,processingOptions(draft,false,false,[0,0])).parsed.segments.length,2);
  assert.equal(roundtrip(d,processingOptions(draft,true,false,[0,0])).parsed.segments.length,1);
  draft.V.pressure='20';assert.equal(roundtrip(d,processingOptions(draft,true,false,[0,0])).parsed.segments.length,2);
});
test('repeated passes remain separate full strokes after merging',()=>{
  const r=roundtrip(doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0])]),{...collinear(),profiles:{M:{passes:3}}});
  assert.equal(r.parsed.segments.length,3);assert.deepEqual(r.report.sourcePasses,{a:3,b:3});assert.equal(r.report.downLength,6);
});
test('duplicates and overlapping segments are blocked; explicit retain keeps their coverage multiplicity',()=>{
  const d=doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0]),edge('duplicate',[0,0],[1,0])]);
  assert.throws(()=>optimizeCPPaths(d,collinear()),/重叠/);
  const r=roundtrip(d,{...collinear(),overlapPolicy:'retain'});assert.deepEqual(r.report.sourcePasses,{a:1,b:1,duplicate:1});assert.equal(r.report.downLength,3);
});
test('each finite turn limit holds for paths, including a closed outline with collinear subdivisions',()=>{
  const d=doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0]),edge('c',[2,0],[2,2]),edge('d',[2,2],[0,2]),edge('e',[0,2],[0,0])]);
  for(const maxTurns of [0,1,2,3,4]){
    const r=roundtrip(d,{pathMode:'continuous',maxTurns,optimizeTravel:false});
    assert.ok(r.plan.paths.every(p=>cpPathTurnCount(p.points)<=maxTurns));assert.ok(r.report.maxPlannedTurns<=maxTurns);
    assert.equal(r.parsed.segments.length,4,'corners remain separate LINEs at every limit');assert.equal(r.report.downLength,8);
  }
});
test('both schemes preserve off-origin coordinates and ordinary DXF infrastructure without device commands',()=>{
  const d=doc([edge('a',[-51.25,72.5],[-21.25,72.5]),edge('b',[-21.25,72.5],[8.75,72.5]),edge('v',[8.75,72.5],[8.75,100])]);
  for(const options of [collinear(),{pathMode:'continuous' as const,maxTurns:1,optimizeTravel:false}]){
    const r=roundtrip(d,options),s=r.parsed.segments[0];assert.deepEqual(s.a,[-51.25,-72.5]);assert.deepEqual(s.b,[8.75,-72.5]);
    const shell=(t:string)=>t.replace(/(0\r\nSECTION\r\n2\r\nENTITIES\r\n)[\s\S]*?(0\r\nENDSEC)/,'$1$2');assert.equal(shell(r.file),shell(exportDXF(d).text));
  }
});
test('readback rejects shifted, stretched, omitted or repeated merged LINEs and forged limits',()=>{
  const d=doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0])]),r=roundtrip(d,collinear());
  const changed=r.file.replace('11\r\n2\r\n','11\r\n3\r\n');assert.notEqual(changed,r.file);assert.throws(()=>verifyCPProcessingExport(changed,'dxf-lines',d,r.plan),/核验失败/);
  const bad=structuredClone(r.plan);bad.options.maxMergedSegments=1;assert.throws(()=>exportCPProcessingDXFLines(d,bad),/上限/);
  const reversed=r.file.replace('10\r\n0\r\n','10\r\n2\r\n').replace('11\r\n2\r\n','11\r\n0\r\n');assert.throws(()=>verifyCPProcessingExport(reversed,'dxf-lines',d,r.plan),/核验失败/);
});
test('fractional chains retain exact geometry; length statistics tolerate only floating point accumulation',()=>{
  const d=doc(Array.from({length:100},(_,i)=>edge('s'+i,[i*.1,i*.1],[(i+1)*.1,(i+1)*.1]))),r=roundtrip(d,collinear());
  assert.equal(r.parsed.segments.length,1);assert.deepEqual(r.parsed.segments[0].b,[10,-10]);assert.ok(Math.abs(r.report.downLength-Math.sqrt(200))<1e-12);
});
test('invalid limits are rejected and original input and settings are untouched',()=>{
  const d=doc([edge('a',[0,0],[1,0])]);
  for(const options of [{maxTurns:-1},{maxTurns:1.5},{maxTurns:NaN},{maxMergedLength:0},{maxMergedLength:Infinity},{maxMergedSegments:0},{maxMergedSegments:1.5}])assert.throws(()=>optimizeCPPaths(d,{...collinear(),...options}));
  const draft=defaultProcessingSettings();assert.ok(Object.values(draft).every(s=>s.operation==='crease'&&s.tool==='压痕工具'));
  for(const parameters of [{maxMergedLength:'0'},{maxMergedSegments:'1.5'},{maxMergedLength:'Infinity'}])assert.throws(()=>processingOptions(draft,false,false,[0,0],'collinear',parameters));
  assert.throws(()=>processingOptions(draft,false,false,[0,0],'continuous',{maxTurns:''}));
});
