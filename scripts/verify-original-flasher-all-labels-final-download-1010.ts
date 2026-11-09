import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFlasherAllLabelsParameters,readFlasherAllLabelsResult} from '../src/app/flasherAllVerticesLabels';
const out='output/original-flasher-all-labels-browser-final-1010',log=fs.readFileSync(`${out}/browser-tests.log`,'utf8'),match=log.match(/^### Result\r?\n([^\r\n]+)/);
assert.ok(match&&!log.includes('### Error'));const ui=JSON.parse(match[1]);assert.equal(ui.passed,34);assert.deepEqual(ui.errors,[]);assert.deepEqual(ui.passiveErrors,[]);
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/flasher-all-vertices-labels-20261010.json','utf8')),checks:string[]=[];
const check=(ok:unknown,name:string)=>{assert.ok(ok,name);checks.push(name);},read=(name:string)=>fs.readFileSync(`${out}/${name}`,'utf8');
const results=new Map<string,ReturnType<typeof readFlasherAllLabelsResult>>();
for(const name of ['labels-default','labels-n6-m5','labels-custom','labels-custom-3d']){
 const r=readFlasherAllLabelsResult(read(`${name}.json`)),items=r.data.items.flat();results.set(name,r);
 check(r.data.items.length===r.query.n+2&&r.data.items.every(row=>row.length===r.query.n+1),`${name}: complete literal i/j nesting`);
 check(items.length===(r.query.n+2)*(r.query.n+1),`${name}: actual Text count includes every original Table item`);
 check(r.data.style==='Black'&&r.source.originalStyle==='Black'&&items.every(item=>item.head==='Text'&&item.content.base.style==='Bold'),`${name}: original Style/Black/Text/Subscript/Bold preserved`);
 check(items.every((item,i)=>item.content.indices.join(',')===`${Math.floor(i/(r.query.n+1))-1},${i%(r.query.n+1)},0`),`${name}: original raw labels and source ordering preserved`);
 check(r.data.items[0].every((item,j)=>item.resolvedPositionIndex.join(',')===`${j},0,-1`),`${name}: single-argument seam resolves to negative k without modulo`);
 const map=new Map(r.query.bindings.map(({index,point})=>[index.join(','),point]));
 check(items.every(item=>JSON.stringify(item.position)===JSON.stringify(map.get(item.resolvedPositionIndex.join(',')))),`${name}: actual saved positions equal original numeric v bindings`);
 check(items.every(item=>item.position.length===r.query.dimension),`${name}: source dimensionality preserved without projection or rescaling`);
 check(r.source.originalGraphicOptions.length===0&&!r.source.wolframExecuted&&!r.source.symbolicVectorDomainComplete&&!r.source.solvedCreasePattern&&!r.source.paperCertification,`${name}: no invented Graphics option or symbolic/CP certification`);
 check(!('edges_vertices' in r)&&!('faces_vertices' in r),`${name}: Text data does not add machining or crease geometry`);
}
for(const [name,oracleName] of [['labels-default','current-r2-h2-m4'],['labels-n6-m5','all-middle-points-r3-h2-m5']] as const){
 const r=results.get(name)!,expected=fixture.cases.find((c:any)=>c.name===oracleName).expectedData.items.flat();
 check(r.data.items.flat().every((item,i)=>item.position.every((x,j)=>Math.abs(x-expected[i].position[j])<1e-11)),`${name}: all actual coordinates independently match literal complex-U source formula`);
}
check(JSON.stringify(readFlasherAllLabelsParameters(read('parameters-default.json')))===JSON.stringify(results.get('labels-default')!.query),'actual original parameter download equals complete exported input binding');
check(JSON.stringify(readFlasherAllLabelsParameters(read('parameters-custom.json')))===JSON.stringify(results.get('labels-custom')!.query),'actual edited parameter download equals full original Text input');
const custom=results.get('labels-custom')!,n6=results.get('labels-n6-m5')!;
check(custom.query.origin.kind==='finite-numeric-bindings'&&custom.data.items[0][0].position[0]===12.5,'actual edited position recorded and original seed provenance revoked');
check(custom.data.items.flat().slice(1).every((item,i)=>JSON.stringify(item.position)===JSON.stringify(n6.data.items.flat()[i+1].position)),'editing one v binding preserves every other actual original position');
const three=results.get('labels-custom-3d')!,oracle=fixture.cases.find((c:any)=>c.name==='nonperiodic-three-dimensional-bindings');
check(JSON.stringify(three.query)===JSON.stringify(oracle.query),'actual 3D uploaded input retains all vector coordinates and independent u/v symbols');
check(JSON.stringify(three.data)===JSON.stringify(oracle.expectedData),'actual 3D Text output independently matches original complete Table');
check(JSON.stringify(JSON.parse(read('ordinary-app-before.zhezhi.json')))===JSON.stringify(JSON.parse(read('ordinary-app-after.zhezhi.json'))),'ordinary crease document and all project fields unchanged after helper operations');
const files=ui.downloads.map((d:any)=>{const b=fs.readFileSync(d.path);assert.ok(b.length>0);return{file:d.path,suggested:d.suggested,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};});
assert.equal(files.length,8);
const record={verified:true,uiChecks:ui.passed,downloadChecks:checks.length,actualDownloads:files.length,checks,files,layout:ui.layout,bundle:ui.bundle,
 sourceFunction:'FlasherFirstSectorAllPossibleVerticesLabels',numericOriginalReturnComplete:true,symbolicVectorDomainComplete:false,
 ordinaryExportUntouched:true,machineVerified:false};
fs.writeFileSync(`${out}/download-audit.json`,JSON.stringify(record,null,2));
console.log(JSON.stringify({verified:true,uiChecks:ui.passed,downloadChecks:checks.length,actualDownloads:files.length,bundle:ui.bundle}));
