import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readUnsafeTwistParameters,readUnsafeTwistResult} from '../src/app/unsafeTwistRange';
const out='output/original-ring-unsafe-courteous-browser-1010/unsafe',log=fs.readFileSync(`${out}/browser-tests.log`,'utf8'),match=log.match(/^### Result\r?\n([^\r\n]+)/);
assert.ok(match&&!log.includes('### Error'));const ui=JSON.parse(match[1]);assert.equal(ui.passed,30);assert.deepEqual(ui.errors,[]);assert.deepEqual(ui.passiveWarnings,[]);
const checks:string[]=[],check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks.push(label);},read=(name:string)=>fs.readFileSync(`${out}/${name}`,'utf8');
const results=new Map<string,ReturnType<typeof readUnsafeTwistResult>>();
for(const name of ['default','edited','clockwise']){
 const r=readUnsafeTwistResult(read(`result-${name}.json`)),p=readUnsafeTwistParameters(read(`parameters-${name}.json`));results.set(name,r);
 check(JSON.stringify(p)===JSON.stringify(r.query),`${name}: actual parameter download retains all5 input arrays exactly`);
 check(Object.keys(r.query).sort().join(',')==='bverts,dfaces,dverts,pfaces,pverts',`${name}: original5-input contract contains no fake options/bindings`);
 check(r.data.primal.length===p.pfaces.length&&r.data.dual.length===p.dfaces[0].length,`${name}: exact original first-primal/first-dual selection counts`);
 check(r.data.primal.every((t,i)=>t.indices[0]===p.pfaces[i].find(v=>!p.bverts.includes(v))),`${name}: original first surviving START chosen per face`);
 check(r.data.dual.every((t,i)=>JSON.stringify(t.indices)===JSON.stringify([p.dfaces[0][i],p.dfaces[0][(i+1)%p.dfaces[0].length],p.dfaces[0][(i+2)%p.dfaces[0].length]])),`${name}: only original first dual face with cyclic order`);
 const entries=[...r.data.primal,...r.data.dual],pa=r.data.primal.map(t=>t.angleRad),da=r.data.dual.map(t=>t.angleRad);
 check(entries.every((t,i)=>t.points.every((point,j)=>JSON.stringify(point)===JSON.stringify((i<r.data.primal.length?p.pverts:p.dverts)[t.indices[j]-1]))),`${name}: actual source positions preserved without plot flip/mirror/scale`);
 check(JSON.stringify(r.data.allAnglesRad)===JSON.stringify([...pa,...da,...pa.map(a=>Math.PI-a),...da.map(a=>Math.PI-a)]),`${name}: complete original Join and Pi complements preserved`);
 check(r.data.originalReturn[0]===Math.min(...r.data.allAnglesRad)&&r.data.originalReturn[1]===Math.max(...r.data.allAnglesRad),`${name}: original literal Min/Max output correct`);
 check(r.data.rangeDeg.every((a,i)=>a===r.data.originalReturn[i]*180/Math.PI),`${name}: radians converted to display degrees exactly once`);
 check(r.source.indexBase===1&&r.source.originalAuthorStatus==='IN PROGRESS / TBD'&&r.source.publicOptions.length===0,`${name}: original1-based indices/unfinished status/no options retained`);
 check(!r.source.fullWolframDomain&&!r.source.wolframExecuted&&!r.source.localAssignmentCertified&&!r.source.creasePatternCertified&&!r.source.layerOrderCertified,`${name}: no symbolic/globalCP/layer certification invented`);
}
const oracle=JSON.parse(fs.readFileSync('tests/fixtures/unsafe-twist-range-20261010.json','utf8')).cases;
for(const[name,caseName]of [['default','local-finite-example'],['edited','edited-primal-position']] as const){
 const r=results.get(name)!,c=oracle.find((c:any)=>c.name===caseName);
 check(r.data.allAnglesRad.every((a,i)=>Math.abs(a-c.data.allAnglesRad[i])<2e-13),`${name}: actual entire angle list independently matches Python literal dot/cross source replay`);
}
check(results.get('clockwise')!.data.rangeDeg[0]===-90&&results.get('clockwise')!.data.rangeDeg[1]===270,'actual clockwise result preserves negative/>180-degree range');
check(JSON.stringify(results.get('edited')!.query.pverts[4])==='[0.4,0.2]','actual edited source point recorded');
check(results.get('clockwise')!.data.ignoredDualFaces===1,'actual later dface saved but excluded from original computation');
check(JSON.stringify(JSON.parse(read('ordinary-app-before.zhezhi.json')))===JSON.stringify(JSON.parse(read('ordinary-app-after.zhezhi.json'))),'ordinary document complete fields unchanged after pointer/file/helper flows');
const files=ui.downloads.map((d:any)=>{const b=fs.readFileSync(d.path);assert.ok(b.length);return{file:d.path,suggested:d.suggested,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};});assert.equal(files.length,8);
const record={verified:true,uiChecks:ui.passed,actualDownloads:files.length,downloadChecks:checks.length,checks,files,layout:ui.layout,bundle:ui.bundle,
 pureFrontend:true,originalHeldIn3339Claimed:false,ordinaryExportUntouched:true,nativeOrMachineVerified:false};
fs.writeFileSync(`${out}/download-audit.json`,JSON.stringify(record,null,2));console.log(JSON.stringify({verified:true,uiChecks:ui.passed,actualDownloads:files.length,downloadChecks:checks.length,bundle:ui.bundle}));
