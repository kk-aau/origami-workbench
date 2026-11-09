import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {canAdoptWovenCP,wovenCPDocument} from '../../src/app/wovenCPDocument';
import {prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessParams} from '../../src/app/tessellation';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {importDocument,exportDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
const six=JSON.parse(fs.readFileSync('tests/fixtures/woven-even-degree-20261001.json','utf8')).cases.find((c:any)=>c.name==='six-regular'),cut=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases.find((c:any)=>c.name==='internal-diagonal-fixed-F2');
const fixture=(c= six)=>{const params=c.params as TessParams,result=prepareTessResult(c.response,params);return {params,result,key:tessConstructionKey(params)};};
test('verified CP may be explicitly adopted without a layer certificate; normal adoption stays gated',()=>{
 const {params,result,key}=fixture(),before=JSON.stringify(result);assert.equal(canAdoptTessWithTileLayers(result,false,key,params,'no-solution'),false);assert.equal(canAdoptWovenCP(result,false,key,params),true);const doc=wovenCPDocument(result,params),m=inspectMaterialTopology(doc);assert.ok(m.ok);assert.equal(m.foldedVertices,undefined);assert.equal(doc.segments.length,result.doc.segments.length);assert.deepEqual(doc.paper,result.doc.paper);assert.equal(JSON.stringify(result),before);assert.deepEqual(doc.metadata!.wovenCPAdoption,{schema:'zhezhi-woven-cp-only-v1',flatFoldCertified:false,sourceGeometryValidated:true});
});
test('busy/stale/forged candidates reject independently and cannot bypass the full original construction proof',()=>{
 const {params,result,key}=fixture();assert.equal(canAdoptWovenCP(result,true,key,params),false);assert.equal(canAdoptWovenCP({...result,stats:null as any},false,key,params),false);assert.equal(canAdoptWovenCP(result,false,'stale',params),false);const changed=structuredClone(result);changed.doc.segments[0].a[0]+=.01;assert.equal(canAdoptWovenCP(changed,false,key,params),false);const forged=structuredClone(result);(forged.source.foldedForm as number[][])[0][0]+=.1;assert.equal(canAdoptWovenCP(forged,false,key,params),false);assert.equal(canAdoptWovenCP({...result,stats:{...result.stats,checks:{...result.stats.checks,geometry:{status:'failed'}}}},false,key,params),false);
});
test('CP-only cut adoption preserves material banks and one original coordinate/unit transform',()=>{
 assert.ok(cut);const {params,result,key}=fixture(cut);assert.equal(canAdoptWovenCP(result,false,key,params),true);const doc=wovenCPDocument(result,params),m=inspectMaterialTopology(doc);assert.ok(m.ok);assert.equal(m.foldedVertices,undefined);assert.ok(m.components.length>1);assert.ok(doc.segments.length>=result.doc.segments.length);const originals=new Set(result.doc.segments.flatMap(s=>[s.a.join(','),s.b.join(',')]));for(const p of m.graph.vertices_coords)assert.ok(originals.has(p.join(',')));assert.deepEqual(doc.paper,result.doc.paper);
});
test('native/FOLD reopen has no active folded frame; ordinary DXF remains original LINE geometry',()=>{
 const {params,result}=fixture(),doc=wovenCPDocument(result,params),m=inspectMaterialTopology(doc);assert.ok(m.ok);
 for(const format of ['json','fold'] as const){const text=exportDocument(doc,format).text,back=importDocument(text,format).doc,b=inspectMaterialTopology(back);assert.ok(b.ok);assert.deepEqual(b.graph,m.graph);assert.equal(b.foldedVertices,undefined);if(format==='fold'){const raw=JSON.parse(text);assert.ok(!(raw.file_frames??[]).some((f:any)=>(f.frame_classes??[]).includes('foldedForm')));}}
 const dxf=exportDXF(doc).text;assert.ok(dxf.includes('AC1009')&&!dxf.includes('LWPOLYLINE'));assert.equal((dxf.match(/\r?\nLINE\r?\n/g)??[]).length,doc.segments.length);
});
