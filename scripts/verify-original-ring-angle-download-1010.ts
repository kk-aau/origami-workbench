import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readTessParams,prepareTessResult} from '../src/app/tessellation';
import {importDocument} from '../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),folder=process.argv[2]??'output/original-ring-angle-browser-1010';
const fixture=JSON.parse(fs.readFileSync(path.join(here,'tests/fixtures/ring-angular-if-20261010.json'),'utf8')),checks=[],actual=new Map();
const same=(a:any,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=32*Number.EPSILON*Math.max(1,Math.abs(b)):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):b&&typeof b==='object'?a&&typeof a==='object'&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.keys(b).every(k=>same(a[k],b[k])):a===b;
for(const c of fixture.cases)for(const kind of ['if','piecewise']){
 const name=c.name+'-'+kind,base=path.join(folder,name),reference=kind==='if'?c.params:c.piecewiseParameters,expectedResponse=kind==='if'?c.response:c.piecewiseResponse,response=JSON.parse(fs.readFileSync(base+'-response.json','utf8'));
 const p=readTessParams(response.stats.parameters),q=readTessParams(reference);assert.ok(p&&q&&p.family==='ring'&&q.family==='ring');assert.deepEqual(p.vectorFunctionDefinitions,q.vectorFunctionDefinitions);assert.ok(same(p,q));
 for(const key of ['preview','fold','mother','dual','source'])assert.ok(same(response[key],expectedResponse[key]),name+' '+key);
 const expected=prepareTessResult(response,p).doc,json=importDocument(fs.readFileSync(base+'.zhezhi.json','utf8'),'json').doc,fold=importDocument(fs.readFileSync(base+'.fold','utf8'),'fold').doc;
 assert.deepEqual(readTessParams((json.metadata!.tessellation as any).parameters),p);assert.deepEqual(readTessParams((fold.metadata!.tessellation as any).parameters),p);assert.deepEqual(json.paper,expected.paper);assert.deepEqual(fold.paper,json.paper);
 assert.deepEqual(json.segments.map(s=>({a:s.a,b:s.b,assignment:s.assignment,angle:s.angle})),expected.segments.map(s=>({a:s.a,b:s.b,assignment:s.assignment,angle:s.angle})));
 const remaining=[...fold.segments];assert.equal(remaining.length,json.segments.length);let maximum=0;
 for(const s of json.segments){const errors=remaining.map(t=>t.assignment!==s.assignment||t.angle!==s.angle?Infinity:Math.min(Math.max(Math.hypot(s.a[0]-t.a[0],s.a[1]-t.a[1]),Math.hypot(s.b[0]-t.b[0],s.b[1]-t.b[1])),Math.max(Math.hypot(s.a[0]-t.b[0],s.a[1]-t.b[1]),Math.hypot(s.b[0]-t.a[0],s.b[1]-t.a[1])))),error=Math.min(...errors);assert.ok(error<=1e-9,name);maximum=Math.max(maximum,error);remaining.splice(errors.indexOf(error),1);}
 const dxf=fs.readFileSync(base+'.dxf','utf8');assert.equal(dxf,exportDXF(json).text);const tokens=dxf.trim().split(/\r?\n/),lines:Map<number,string>[]=[];let line:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){line=value==='LINE'?new Map():null;if(line)lines.push(line);}else line?.set(code,value);}
 assert.equal(lines.length,json.segments.length);lines.forEach((line,i)=>{const s=json.segments[i];assert.equal(line.get(8),DXF_LAYERS[s.assignment].name);for(const [code,v]of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]])assert.ok(Number(line.get(code))===v);});
 actual.set(name,{response,json,dxf});checks.push({name,sourcePreserved:true,actualCPMatchesEquivalentPiecewiseFixture:true,actualProjectGeometryExact:true,foldMaximumErrorMm:maximum,DXFEndpointsAndMVLayersExact:true,segments:json.segments.length});
}
for(const c of fixture.cases){const a=actual.get(c.name+'-if'),b=actual.get(c.name+'-piecewise');assert.ok(same(a.response.fold,b.response.fold));assert.ok(same(a.response.source,b.response.source));assert.ok(same(a.json.segments,b.json.segments));assert.ok(same(a.json.paper,b.json.paper));const sa=a.json.metadata.tessellation.parameters.vectorFunctionDefinitions,sb=b.json.metadata.tessellation.parameters.vectorFunctionDefinitions;assert.notDeepEqual(sa,sb);}
const result={verified:true,actualCPExportGroups:8,actualFilesAndResponses:32,checks,ordinaryFoldToleranceMm:1e-9,layerOrderCertified:false,machineVerified:false};
fs.writeFileSync(path.join(folder,'download-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
