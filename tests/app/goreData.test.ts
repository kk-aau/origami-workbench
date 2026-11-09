import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readGoreQuery,readGoreResult,readGorePaperParams,gorePaperSourceValid,sphereGoreProfile,type GoreQuery,type GorePaperParams} from '../../src/app/goreData';
import {prepareTessResult,readTessParams,canAdoptTess,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/gore-source-20261010.json',import.meta.url),'utf8')) as {helpers:{query:GoreQuery;response:any}[];papers:{params:GorePaperParams;response:TessResponse}[]};

test('all four original functions independently read back every primitive and repeated line',()=>{
 for(const c of fixture.helpers){assert.deepEqual(readGoreQuery(c.query),c.query);assert.deepEqual(readGoreResult(c.response,c.query),c.response);}
 const c=fixture.helpers.find(c=>c.query.function==='SingleGoreData'&&c.query.sectors===4)!,r=c.response;
 assert.deepEqual(r.source.arcLengths,[0,5,8,8+Math.sqrt(18)]);assert.equal(JSON.stringify(r.data.targetPolygons[0]),JSON.stringify([[0,0,0],[3,3,4],[3,-3,4],[0,0,0]]));assert.equal(r.data.flatLines.length,4);assert.deepEqual(r.data.flatLines[0],r.data.flatLines[3]);
 assert.deepEqual(sphereGoreProfile(8).filter((_,i)=>[0,4,8].includes(i)),[[0,0],[1,1],[0,2]]);
});

test('original data verifier rejects deleted repeated lines, groups, forged coordinates or source',()=>{
 for(const c of fixture.helpers){const bad=structuredClone(c.response);if(c.query.function.includes('Multiple'))bad.data.flatLines.pop();else bad.data.flatLines.pop();assert.throws(()=>readGoreResult(bad,c.query));}
 const c=fixture.helpers[0];for(const mutate of [(r:any)=>r.data.targetPolygons[0][1][0]+=.01,(r:any)=>r.source.definitionCell='In[1]',(r:any)=>r.source.repeatedFlatLinesPreserved=false,(r:any)=>r.source.arcLengths[1]+=.01]){const bad=structuredClone(c.response);mutate(bad);assert.throws(()=>readGoreResult(bad,c.query));}
});

test('original data and paper use separate exact input domains and size budgets',()=>{
 const raw={family:'gore-data-native',function:'SingleGoreData',sectors:4,points:[[2,0],[-1,4],[-1,4]]};assert.ok(readGoreQuery(raw));assert.equal(readGorePaperParams({family:'gore-paper',profile:'points',sectors:4,crossSection:raw.points}),null);
 assert.equal(readGoreQuery({family:'gore-data-native',function:'SphereMultipleGoreData',sectors:32,divisions:64}),null);assert.equal(readGoreQuery({...raw,divisions:8}),null);assert.equal(readGorePaperParams({family:'gore-paper',profile:'sphere',crossSection:[[0,0],[1,1]]}),null);
});

test('all real public single-gore responses pass source, geometry and actual adoption gates',()=>{
 for(const c of fixture.papers){assert.deepEqual(readTessParams(c.params),c.params);const r=prepareTessResult(c.response,c.params);assert.ok(gorePaperSourceValid(r.source,r.fold,c.params));assert.ok(spatialMeshScene(r));assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),true);assert.equal(canAdoptTess(r,true,tessConstructionKey(c.params),c.params),false);assert.equal(canAdoptTess(r,false,'stale',c.params),false);assert.equal((r.stats.checks as any).layerOrder.status,'not_checked');}
});

test('static equal metrics alone cannot bypass original source or preserve omitted paper edges',()=>{
 const c=fixture.papers[2];
 for(const mutate of [(r:any)=>r.source.originalGoreData.data.flatLines.pop(),(r:any)=>r.source.originalGoreData.data.targetPolygons[0][1][0]+=.02,(r:any)=>r.source.foldedForm3D[1][2]+=.01,(r:any)=>{r.fold.edges_vertices.pop();r.fold.edges_assignment.pop();},(r:any)=>r.fold.faces_vertices.pop(),(r:any)=>r.source.radialRowVertices[0][0]=2,(r:any)=>{r.source.foldedForm3D.forEach((p:number[])=>p[0]+=1);},(r:any)=>r.source.staticGlobalIsometryChecked=false]){
  const r=prepareTessResult(structuredClone(c.response),c.params);mutate(r);assert.equal(spatialMeshScene(r),null);assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),false);
 }
 const other={...c.params,sectors:12};const r=prepareTessResult(c.response,c.params);assert.equal(canAdoptTess(r,false,tessConstructionKey(other),other),false);
});

test('adopted complete CP preserves source recipes through JSON/FOLD and all DXF lines',()=>{
 for(const c of fixture.papers){const r=prepareTessResult(c.response,c.params);for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(r.doc,format).text,format).doc;assert.equal(back.segments.length,r.doc.segments.length);assert.deepEqual((back.metadata?.tessellation as any).parameters,c.params);assert.equal(JSON.stringify((back.metadata?.tessellation as any).source.originalGoreData),JSON.stringify(c.response.source.originalGoreData));assert.equal(JSON.stringify((back.metadata?.tessellation as any).source.foldedForm3D),JSON.stringify(c.response.source.foldedForm3D));}assert.equal((exportDXF(r.doc).text.match(/\r?\nLINE\r?\n/g)??[]).length,r.doc.segments.length);}
});
