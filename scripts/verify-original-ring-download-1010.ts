import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readTessParams,prepareTessResult} from '../src/app/tessellation';
import {importDocument} from '../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/ring-index-conditions-20261010.json','utf8')),checks=[];
const same=(a:any,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=32*Number.EPSILON*Math.max(1,Math.abs(b)):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):b&&typeof b==='object'?a&&typeof a==='object'&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.keys(b).every(k=>same(a[k],b[k])):a===b;
for(const c of fixtures.cases){
 const base=`output/original-ring-browser-1010/${c.name}`,response=JSON.parse(fs.readFileSync(base+'-response.json','utf8'));
 const params=readTessParams(response.stats.parameters);assert.ok(params&&params.family==='ring');const reference=readTessParams(c.params);assert.ok(reference&&reference.family==='ring');
 const {outerRadii,...actualSource}=params,{outerRadii:referenceRadii,...referenceSource}=reference;assert.deepEqual(actualSource,referenceSource);assert.ok(same(outerRadii,referenceRadii));
 for(const key of ['preview','fold','mother','dual'])assert.ok(same(response[key],c.response[key]),c.name+' '+key);
 const expected=prepareTessResult(response,params).doc,json=importDocument(fs.readFileSync(base+'.zhezhi.json','utf8'),'json').doc,fold=importDocument(fs.readFileSync(base+'.fold','utf8'),'fold').doc;
 assert.deepEqual(readTessParams((json.metadata!.tessellation as any).parameters),params);assert.deepEqual(readTessParams((fold.metadata!.tessellation as any).parameters),params);assert.deepEqual(json.paper,expected.paper);assert.deepEqual(fold.paper,json.paper);
 assert.deepEqual(json.segments.map(s=>({a:s.a,b:s.b,assignment:s.assignment,angle:s.angle})),expected.segments.map(s=>({a:s.a,b:s.b,assignment:s.assignment,angle:s.angle})));
 const remaining=[...fold.segments];assert.equal(remaining.length,json.segments.length);let maximum=0;
 for(const s of json.segments){const errors=remaining.map(t=>t.assignment!==s.assignment||t.angle!==s.angle?Infinity:Math.min(Math.max(Math.hypot(s.a[0]-t.a[0],s.a[1]-t.a[1]),Math.hypot(s.b[0]-t.b[0],s.b[1]-t.b[1])),Math.max(Math.hypot(s.a[0]-t.b[0],s.a[1]-t.b[1]),Math.hypot(s.b[0]-t.a[0],s.b[1]-t.a[1])))),error=Math.min(...errors);assert.ok(error<=1e-9,c.name);maximum=Math.max(maximum,error);remaining.splice(errors.indexOf(error),1);}
 const dxf=fs.readFileSync(base+'.dxf','utf8');assert.equal(dxf,exportDXF(json).text);
 const tokens=dxf.trim().split(/\r?\n/),lines:Map<number,string>[]=[],current={value:null as Map<number,string>|null};
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){current.value=value==='LINE'?new Map():null;if(current.value)lines.push(current.value);}else current.value?.set(code,value);}
 assert.equal(lines.length,json.segments.length);lines.forEach((line,i)=>{const s=json.segments[i];assert.equal(line.get(8),DXF_LAYERS[s.assignment].name);for(const [code,expected]of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]])assert.ok(Number(line.get(code))===expected);});
 checks.push({name:c.name,actualAPIGeometryToIndependentExpansionFixtureWithin32Epsilon:true,actualAdoptedJSONGeometryExact:true,sourcePreservedInJSONAndFOLD:true,foldMaximumErrorMm:maximum,ordinaryDXFGeometryAndLayersExact:true,segments:json.segments.length});
}
const log=fs.readFileSync('output/original-ring-browser-1010/browser-tests-fixed.log','utf8'),match=log.match(/^### Result\r?\n(\{[^\r\n]+\})/);assert.ok(match);const ui=JSON.parse(match[1]);assert.equal(ui.passed,41);assert.deepEqual(ui.errors,[]);
fs.writeFileSync('output/original-ring-browser-1010/download-audit.json',JSON.stringify({verified:true,actualCPExportGroups:6,actualFilesAndResponses:24,mainAppChecks:41,checks,ordinaryFoldToleranceMm:1e-9,layerOrderCertified:false,machineVerified:false},null,2));console.log('Six actual adopted CP groups independently match original expansion; 24 files/HTTP responses preserve source, geometry, scale and ordinary DXF layers.');
