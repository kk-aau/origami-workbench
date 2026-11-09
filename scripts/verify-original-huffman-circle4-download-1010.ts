import fs from 'node:fs';import assert from 'node:assert/strict';
import {readCircle4DirectResult,readCircle4ParameterFile} from '../src/app/huffmanCircle4Direct';
const out='output/original-huffman-circle4-browser-1010',log=fs.readFileSync(`${out}/browser-tests.log`,'utf8'),m=log.match(/^### Result\r?\n([^\r\n]+)/);assert.ok(m&&!log.includes('### Error'));const ui=JSON.parse(m[1]),fixture=JSON.parse(fs.readFileSync('tests/fixtures/huffman-circle4-direct-20261010.json','utf8')),checks:string[]=[];
assert.equal(ui.passed,20);assert.deepEqual(ui.errors,[]);const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks.push(label);};
for(const name of ['direct-default','direct-variant']){
 const actual=JSON.parse(fs.readFileSync(`${out}/${name}.json`,'utf8')),http=ui.responses.find((r:any)=>r.name===name);assert.deepEqual(actual,http.response);check(true,name+': actual downloaded original items equal this real HTTP payload');
 const parsed=readCircle4DirectResult(actual,http.query);check(parsed.originalItems.length===17,name+': all 17 items independently replay original equations');
 const parameter=readCircle4ParameterFile(JSON.parse(fs.readFileSync(`${out}/parameters-${name==='direct-default'?'default':'variant'}.json`,'utf8')));assert.deepEqual(parameter,parsed.query);check(true,name+': actual parameter JSON retains all input values and units');
 check(parsed.source.argumentUnits==='radians'&&JSON.stringify(parsed.source.arguments)===JSON.stringify(parsed.query.parametersDeg.map(x=>x*(Math.PI/180))),name+': degree input transformed exactly once to original radians');
 check(parsed.closure.mode==='not-enforced'&&parsed.closure.rootSearchExecuted===false&&parsed.closure.closedColumnCertified===false,name+': nonclosed direct data cannot claim a saved closed result');
 check(parsed.certification.adoptableCreasePattern===false&&parsed.certification.completeBlockExactIsometry===false,name+': original nonisometric graphical return remains physically unclaimed');
 check(parsed.sample.rows.length===26,name+': actual source parameter positions cover whole 0..pi/2 interval');
 check(parsed.sample.rows.every(row=>Math.abs(row.foldedThirdRulingLength-row.flatThirdRulingLength-1e-6)<1e-12),name+': every actual row preserves literal third-ruling offset');
 assert.deepEqual(parsed.sample.rows[0].flat,[[0,0],[1,0],[2,0],[2,0]]);assert.deepEqual(parsed.sample.rows[0].folded[1],[1,0,0]);check(true,name+': original coordinates/scale and initial frame origin preserved');
 check(parsed.numerics.evaluationCount<=12000,name+': actual direct computation reports within shared RHS budget');
}
const old=ui.responses.find((r:any)=>r.name==='saved-default');assert.deepEqual(old.response,fixture.savedDefaults.find((r:any)=>r.query.divisions===25).response);check(true,'actual old closed UI response remains all-field equal to captured original baseline');
assert.deepEqual(JSON.parse(fs.readFileSync(`${out}/ordinary-app-before.zhezhi.json`,'utf8')),JSON.parse(fs.readFileSync(`${out}/ordinary-app-after.zhezhi.json`,'utf8')));check(true,'actual ordinary full document unchanged before/after four-parameter source tools');
assert.deepEqual(ui.responses.find((r:any)=>r.name==='restored-default').response,ui.responses.find((r:any)=>r.name==='direct-default').response);check(true,'actual saved parameter file import recomputes identical complete result');
for(const file of ['root-initial-guess','direct-variant','low-angle','short-first-cone']){const r=JSON.parse(fs.readFileSync(`${out}/${file}.http.json`,'utf8'));readCircle4DirectResult(r.response,r.query);check(true,file+': independently parsed actual public HTTP original 17-item response');}
const report={verified:true,uiChecks:20,downloadChecks:checks.length,actualDownloads:6,actualHttpResponses:6,bundle:ui.bundle,checks,layout:ui.layout,ordinaryDocumentUnchanged:true,physicalCPAdoptionAdded:false,machineVerified:false};fs.writeFileSync(`${out}/download-audit.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({verified:true,uiChecks:20,downloadChecks:checks.length,actualDownloads:6,actualHttpResponses:6,bundle:ui.bundle}));
