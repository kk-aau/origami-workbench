import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {optimizeCPPaths,cpPathTurnCount,type CPPathOptimizerOptions} from '../../src/core/cpPathOptimizer';
import {exportCPProcessingDXFR12Polyline,exportCPProcessingDXFLines,exportCPProcessingDXF,exportCPProcessingSVG,verifyCPProcessingExport} from '../../src/core/cpProcessingExport';
import {exportDXF} from '../../src/core/dxf';
import type {Doc,Point,Segment,Assignment} from '../../src/core/types';
import {parseDxf} from '../../vendor/cp-path-optimizer/src/dxf.mjs';

const edge=(id:string,a:Point,b:Point,assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
const doc=(segments:Segment[],name='R12 连续回归'):Doc=>({name,paper:{width:210,height:297},segments});
const chain=()=>doc([edge('a',[10,20],[20,20]),edge('b',[30,20],[20,20]),edge('c',[30,20],[40,25])]);
const key=(a:Point,b:Point)=>[JSON.stringify(a),JSON.stringify(b)].sort().join('|');
type Pair={code:number;value:string};type Record={type:string;pairs:Pair[]};
const pairs=(text:string):Pair[]=>{const lines=text.trimEnd().split('\r\n');assert.equal(lines.length%2,0);return Array.from({length:lines.length/2},(_,i)=>({code:Number(lines[i*2]),value:lines[i*2+1]}));};
const serialize=(p:Pair[])=>p.map(q=>q.code+'\r\n'+q.value+'\r\n').join('');
function entities(text:string):Record[]{const p=pairs(text),start=p.findIndex((q,i)=>q.code===2&&q.value==='ENTITIES'&&p[i-1]?.value==='SECTION')+1,end=p.findIndex((q,i)=>i>=start&&q.code===0&&q.value==='ENDSEC');assert.ok(start>0&&end>=start);const result:Record[]=[];for(const q of p.slice(start,end)){if(q.code===0)result.push({type:q.value,pairs:[]});else result.at(-1)!.pairs.push(q);}return result;}
function mutate(text:string,change:(r:Record[])=>void):string{const p=pairs(text),start=p.findIndex((q,i)=>q.code===2&&q.value==='ENTITIES'&&p[i-1]?.value==='SECTION')+1,end=p.findIndex((q,i)=>i>=start&&q.code===0&&q.value==='ENDSEC'),r=entities(text);change(r);return serialize([...p.slice(0,start),...r.flatMap(r=>[{code:0,value:r.type},...r.pairs]),...p.slice(end)]);}
const first=(r:Record[],type:string)=>r.find(r=>r.type===type)!;
const alter=(r:Record[],type:string,code:number,value:string)=>{first(r,type).pairs.find(p=>p.code===code)!.value=value;};
function run(d:Doc,options:CPPathOptimizerOptions={}){const before=structuredClone(d),plan=optimizeCPPaths(d,options),original=structuredClone(plan),output=exportCPProcessingDXFR12Polyline(d,plan),report=verifyCPProcessingExport(output.text,'dxf-r12-polyline',d,plan),decoded=parseDxf(output.text);assert.deepEqual(d,before);assert.deepEqual(plan,original);assert.equal(decoded.version,'AC1009');assert.equal(decoded.units,null);assert.equal(report.format,'dxf-r12-polyline');assert.equal(report.representation,'dxf-polyline');assert.equal(report.units,'mm');assert.equal(report.coordinateConvention,'x,-y');assert.equal(report.entityCount,plan.paths.length);assert.equal(report.pathCount,plan.paths.length);assert.equal(report.plannedPathCount,plan.paths.length);assert.equal(report.continuousPathsPreserved,true);assert.equal(report.physicalImportVerified,false);assert.equal(report.machineTrialVerified,false);assert.equal(report.downLength,plan.after.drawLength);assert.equal(report.travelLength,plan.after.travelDistance);const records=entities(output.text);assert.equal(records.filter(r=>r.type==='POLYLINE').length,plan.paths.length);assert.equal(records.filter(r=>r.type==='SEQEND').length,plan.paths.length);assert.equal(records.filter(r=>r.type==='VERTEX').length,plan.paths.reduce((s,p)=>s+p.points.length,0));assert.ok(records.every(r=>r.pairs.every(p=>![39,40,41,42,100,210,220,230,1000,1001].includes(p.code))));return {plan,output,report,decoded,records};}

test('traditional R12 retains every source vertex, exact ordered turns and reversed edge without commands',()=>{
 const d=chain(),r=run(d);assert.equal(r.plan.paths.length,1);assert.equal(r.report.processedEdgeCount,3);assert.deepEqual(r.report.sourcePasses,{a:1,b:1,c:1});assert.equal(r.report.motion.penDownTurns,1);assert.equal(r.report.motion.reversedSourceEdges,1);
 assert.deepEqual(r.decoded.segments.map(s=>key([s.a[0],-s.a[1]],[s.b[0],-s.b[1]])).sort(),d.segments.map(s=>key(s.a,s.b)).sort());
 assert.deepEqual(r.records.map(r=>r.type),['POLYLINE','VERTEX','VERTEX','VERTEX','VERTEX','SEQEND']);assert.match(r.output.text,/1 drawing unit = 1 mm; X=x, Y=-y/);assert.ok(r.output.warnings.some(w=>w.includes('机器试压尚未验证')));assert.ok(!/LWPOLYLINE|PENUP|PENDOWN|XDATA|APPID|SPLINE/.test(r.output.text));
});
test('real off-origin closed boundary uses open flag 0 and exactly its explicit closing edge',()=>{
 const d=doc([edge('a',[-50,-80],[150,-80],'B'),edge('b',[150,-80],[150,20],'B'),edge('c',[150,20],[-50,20],'B'),edge('d',[-50,20],[-50,-80],'B')]),r=run(d);
 assert.equal(r.plan.paths.length,1);assert.equal(r.report.motion.closedPaths,1);assert.equal(r.report.processedEdgeCount,4);assert.equal(r.decoded.segments.length,4);assert.equal(r.report.downLength,600);assert.deepEqual(r.report.bounds,{x:-50,y:-80,width:200,height:100});assert.deepEqual(r.plan.paths[0].points[0],r.plan.paths[0].points.at(-1));assert.equal(first(r.records,'POLYLINE').pairs.find(p=>p.code===70)!.value,'0');assert.equal(r.records.filter(r=>r.type==='VERTEX').length,5);
});
test('disconnected lines, crossing interiors and tiny gaps never acquire extra connectors or split source edges',()=>{
 const d=doc([edge('a',[-1,-1],[1,1]),edge('b',[-1,1],[1,-1]),edge('c',[5,5],[6,5]),edge('d',[6.000000001,5],[7,5])]),r=run(d);
 assert.equal(r.plan.paths.length,4);assert.equal(r.report.processedEdgeCount,4);assert.deepEqual(r.decoded.segments.map(s=>key([s.a[0],-s.a[1]],[s.b[0],-s.b[1]])).sort(),d.segments.map(s=>key(s.a,s.b)).sort());
});
for(const [name,a,b]of [['negative decimals',[-1.234567890123456,-20],[2.99999999999999,30.1]],['tiny scale',[1e-12,-2e-12],[3e-12,5e-12]],['large scale',[-999999.12345678,-999998],[999999.98765432,999999]]]as const)test('absolute R12 XY: '+name,()=>{
 const d=doc([edge('exact',[...a],[...b])]),r=run(d),s=r.decoded.segments[0];assert.equal(key([s.a[0],-s.a[1]],[s.b[0],-s.b[1]]),key([...a],[...b]));assert.equal(r.report.downLength,Math.hypot(b[0]-a[0],b[1]-a[1]));
 const poly=first(r.records,'POLYLINE');for(const code of [10,20,30])assert.equal(poly.pairs.find(p=>p.code===code)!.value,'0');
});
test('passes are explicit complete path occurrences, never a hidden entity multiplier',()=>{
 const r=run(doc([edge('a',[0,0],[1,0]),edge('b',[1,0],[2,0])]),{profiles:{M:{passes:3}}});assert.equal(r.report.processedEdgeCount,6);assert.deepEqual(r.report.sourcePasses,{a:3,b:3});assert.equal(r.report.downLength,6);assert.equal(r.records.filter(r=>r.type==='POLYLINE').length,r.plan.paths.length);assert.equal(r.decoded.segments.length,6);
});
test('duplicate and partial overlaps require retain and keep declared source multiplicity',()=>{
 const d=doc([edge('a',[0,0],[3,0]),edge('b',[3,0],[0,0],'V'),edge('c',[1,0],[4,0])]);assert.throws(()=>optimizeCPPaths(d),/重复|重叠/);const r=run(d,{overlapPolicy:'retain'});assert.deepEqual(r.report.sourcePasses,{a:1,b:1,c:1});assert.equal(r.report.downLength,9);
 const invalid=structuredClone(r.plan);invalid.options.overlapPolicy='reject';assert.throws(()=>exportCPProcessingDXFR12Polyline(d,invalid),/重复|重叠/);
});
test('settings groups have separate layers; explicit same-setting merge alone permits a continuous mixed path',()=>{
 const d=doc([edge('m',[0,0],[1,0]),edge('v',[1,0],[2,0],'V')]),profiles={M:{groupId:'same',settingsKey:'压痕 & <1>'},V:{groupId:'same',settingsKey:'压痕 & <1>'}};
 const separate=run(d,{profiles});assert.equal(separate.plan.groups.length,2);assert.equal(new Set(separate.records.filter(r=>r.type==='POLYLINE').map(r=>r.pairs.find(p=>p.code===8)!.value)).size,2);
 const merged=run(d,{profiles,mergeSameSettings:true});assert.equal(merged.plan.groups.length,1);assert.equal(merged.plan.paths.length,1);
 const different=run(d,{profiles:{M:{settingsKey:'10'},V:{settingsKey:'20'}},mergeSameSettings:true});assert.equal(different.plan.groups.length,2);
});
test('turn, length, source-count and independent-direction limits all reuse the current optimizer contract',()=>{
 const d=doc([edge('a',[0,0],[2,0]),edge('b',[2,0],[2,2]),edge('c',[2,2],[4,2])]);for(const options of [{maxTurns:0},{maxTurns:1},{pathMode:'collinear' as const,maxMergedLength:2.1},{pathMode:'collinear' as const,maxMergedSegments:1},{pathMode:'independent' as const,origin:[99,-33]as Point}]){
  const r=run(d,options);assert.equal(r.report.processedEdgeCount,3);if(options.maxTurns!==undefined)assert.ok(r.plan.paths.every(p=>cpPathTurnCount(p.points)<=options.maxTurns!));if(options.maxMergedSegments)assert.ok(r.plan.paths.every(p=>p.sourceSegmentIds.length<=options.maxMergedSegments!));if(options.pathMode==='independent')for(const p of r.plan.paths){const s=d.segments.find(s=>s.id===p.sourceSegmentIds[0])!;assert.deepEqual(p.points,[s.a,s.b]);}
 }
});
test('explicit exclusions and zero source segments do not invent empty polylines; original full extent stays recorded',()=>{
 const r=run(doc([edge('m',[0,0],[1,0]),edge('zero',[2,2],[2,2]),edge('aux',[100,100],[101,101],'A')]),{profiles:{A:{enabled:false}}});assert.equal(r.report.processedEdgeCount,1);assert.deepEqual(r.report.sourcePasses,{m:1});assert.equal(r.plan.analysis.zeroLength.length,1);assert.equal(r.plan.analysis.excluded.length,1);assert.deepEqual(r.report.bounds,{x:0,y:0,width:101,height:101});
});
test('forged position, blank connectors, extra passes, metrics and mutated source fail before writing',()=>{
 const d=chain(),plan=optimizeCPPaths(d),text=exportCPProcessingDXFR12Polyline(d,plan).text;
 for(const modify of [(p:typeof plan)=>{p.paths[0].points[1][0]+=.1;},(p:typeof plan)=>{p.paths=[];},(p:typeof plan)=>{p.paths.push({...structuredClone(p.paths[0]),id:'extra'});},(p:typeof plan)=>{p.after.drawLength+=1;}]){const p=structuredClone(plan);modify(p);assert.throws(()=>exportCPProcessingDXFR12Polyline(d,p),/核验失败/);}
 d.segments[0].a[0]+=1;assert.throws(()=>verifyCPProcessingExport(text,'dxf-r12-polyline',d,plan),/核验失败/);
});

const attacks:[string,(records:Record[])=>void][]=[
 ...[10,20,30].map(code=>['nonzero POLYLINE base/elevation '+code,(r:Record[])=>alter(r,'POLYLINE',code,'1')]as [string,(r:Record[])=>void]),
 ...[1,2,4,8,16,64,128].map(flag=>['forbidden POLYLINE flag '+flag,(r:Record[])=>alter(r,'POLYLINE',70,String(flag))]as [string,(r:Record[])=>void]),
 ['missing follow flag',r=>{first(r,'POLYLINE').pairs=first(r,'POLYLINE').pairs.filter(p=>p.code!==66);}],['wrong follow flag',r=>alter(r,'POLYLINE',66,'0')],
 ['vertex elevation',r=>alter(r,'VERTEX',30,'1')],['3D vertex',r=>alter(r,'VERTEX',70,'32')],['mesh vertex',r=>alter(r,'VERTEX',70,'64')],['spline vertex',r=>alter(r,'VERTEX',70,'8')],
 ['vertex shift',r=>alter(r,'VERTEX',10,'11')],['double Y reflection',r=>alter(r,'VERTEX',20,'20')],['NaN vertex',r=>alter(r,'VERTEX',10,'NaN')],
 ['one ULP vertex shift',r=>{const p=first(r,'VERTEX').pairs.find(p=>p.code===10)!,v=new DataView(new ArrayBuffer(8));v.setFloat64(0,Number(p.value));v.setBigUint64(0,v.getBigUint64(0)+1n);p.value=String(v.getFloat64(0));}],
 ...[39,40,41,42,210,220,230,1000,1001,999].map(code=>['extra POLYLINE width/bulge/OCS/XData/unknown '+code,(r:Record[])=>first(r,'POLYLINE').pairs.push({code,value:code===230?'-1':'1'})]as [string,(r:Record[])=>void]),
 ...[40,41,42,210,230,1000,91].map(code=>['extra VERTEX curve/width/OCS/XData/unknown '+code,(r:Record[])=>first(r,'VERTEX').pairs.push({code,value:'1'})]as [string,(r:Record[])=>void]),
 ...['POLYLINE','VERTEX','SEQEND'].map(type=>['duplicate required code '+type,(r:Record[])=>first(r,type).pairs.push({...first(r,type).pairs[0]})]as [string,(r:Record[])=>void]),
 ['wrong polyline layer',r=>alter(r,'POLYLINE',8,'ValleyLine')],['wrong vertex layer',r=>alter(r,'VERTEX',8,'ValleyLine')],['wrong SEQEND layer',r=>alter(r,'SEQEND',8,'ValleyLine')],
 ['missing SEQEND',r=>{r.splice(r.findIndex(x=>x.type==='SEQEND'),1);}],['duplicate SEQEND',r=>r.push(structuredClone(first(r,'SEQEND')))],['missing VERTEX',r=>{r.splice(r.findIndex(x=>x.type==='VERTEX'),1);}],['duplicate VERTEX',r=>{r.splice(r.findIndex(x=>x.type==='VERTEX'),0,structuredClone(first(r,'VERTEX')));}],
 ['extra full path / repeat processing',r=>r.push(...structuredClone(r))],['SEQEND extra property',r=>first(r,'SEQEND').pairs.push({code:10,value:'0'})],
 ...['LINE','LWPOLYLINE','CIRCLE','SPLINE','PENDOWN'].map(type=>['extra entity '+type,(r:Record[])=>r.push({type,pairs:[]})]as [string,(r:Record[])=>void]),
];
for(const [name,change]of attacks)test('strict R12 readback rejects '+name,()=>{const d=chain(),plan=optimizeCPPaths(d),text=exportCPProcessingDXFR12Polyline(d,plan).text,changed=mutate(text,change);assert.notEqual(changed,text);assert.throws(()=>verifyCPProcessingExport(changed,'dxf-r12-polyline',d,plan),/核验失败/);});
test('strict infrastructure rejects altered R12 header, table, unit comment, duplicate section and malformed finish',()=>{
 const d=chain(),p=optimizeCPPaths(d),text=exportCPProcessingDXFR12Polyline(d,p).text;
 for(const bad of [text.replace('AC1009','AC1015'),text.replace('1 drawing unit = 1 mm','1 drawing unit = 1 inch'),text.replace('Solid line','Dotted line'),text.replace('0\r\nEOF\r\n',''),text+'0\r\nLINE\r\n',text.replace('0\r\nEOF\r\n','0\r\nSECTION\r\n2\r\nHEADER\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n'),text+'999\r\n']){assert.notEqual(bad,text);assert.throws(()=>verifyCPProcessingExport(bad,'dxf-r12-polyline',d,p),/核验失败/);}
});
test('ordinary LINE, processing LINE, R2000 LWPOLYLINE and SVG bytes retain their separately captured preimplementation hashes',()=>{
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 const samples=[{d:chain(),options:{},gold:{ordinary:'3df0536b42d1d7cfa664b02175b0fafd1efd3e660b02c4b68a2e75b06c409a15',lines:'457693ca3e93f7a9773efc2d4426ae2389f05a942d57deb4fdd95a5f1f957f53',modern:'381745bd627ae294e3f8caee0fa052bc8d84deaa8821519f4e2c457dbc8ea332',svg:'0086467b7d7db9b308b5e43602bfbb79c8b619dbbbc7fc429187a029a352bed5'}},
 {d:doc([edge('m',[-3,-2],[1,-2]),edge('v',[1,-2],[1,4],'V'),edge('b',[5,6],[8,6],'B')],'R12 分组回归'),options:{profiles:{M:{passes:2},V:{passes:3}}},gold:{ordinary:'08e8609e891294ae805253f7a589ade6a176bc68b7aaf959bd459b2ff4707053',lines:'0e88fc757ea909361289746d67ad22314b6fc78fb742e8095ca3dfab5a50636e',modern:'a0a2e1d01b35cf04caa804bda92ac6c6fbf3a70df1a3982a8b903ec7834f7c88',svg:'98b3c76036179515549431ad7d70eea7274add2d019c5674ce5ec1d2a9a993b9'}}];
 for(const {d,options,gold}of samples){const p=optimizeCPPaths(d,options);assert.equal(hash(exportDXF(d).text),gold.ordinary);assert.equal(hash(exportCPProcessingDXFLines(d,p).text),gold.lines);assert.equal(hash(exportCPProcessingDXF(d,p).text),gold.modern);assert.equal(hash(exportCPProcessingSVG(d,p).text),gold.svg);exportCPProcessingDXFR12Polyline(d,p);assert.equal(hash(exportDXF(d).text),gold.ordinary);assert.equal(hash(exportCPProcessingDXFLines(d,p).text),gold.lines);assert.equal(hash(exportCPProcessingDXF(d,p).text),gold.modern);assert.equal(hash(exportCPProcessingSVG(d,p).text),gold.svg);}
});
