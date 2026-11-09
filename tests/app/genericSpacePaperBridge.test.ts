import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {genericSpacePaperDocument,genericSpacePaperPreset,readGenericSpacePaperRecipe,genericSpacePaperSourceMatches,prepareGenericSpacePaperPreview,validateGenericSpacePaperRecipe,fetchGenericSpacePaperPreview} from '../../src/app/genericSpacePaperBridge';
import {inspectMaterialTopology} from '../../src/core/materialTopology';import {exportDocument,importDocument} from '../../src/core/formats';import {exportDXF} from '../../src/core/dxf';
const sample=(name='noncircular')=>JSON.parse(fs.readFileSync(new URL('../fixtures/origamica-space-curve-fold-generic-'+name+'.json',import.meta.url),'utf8'));
const recipe=(raw:any,unitSizeMm=1)=>({query:raw.query,unitSizeMm});const own=(d:any)=>d.metadata.originalGenericSpaceFinitePaper;
test('existing raw noncircular backend source constructs a real 27V28E2F finite paper without triangulation creases or private rulings',()=>{
 const raw=sample(),before=JSON.stringify(raw),d=genericSpacePaperDocument(recipe(raw),raw),m=inspectMaterialTopology(d);assert.equal(m.ok,true);if(!m.ok)return;
 assert.deepEqual([m.graph.vertices_coords.length,m.graph.edges_vertices.length,m.graph.faces_vertices!.length],[27,28,2]);assert.equal(m.components.length,1);assert.equal(m.graph.edges_assignment.filter(t=>t==='U').length,8);assert.equal(m.graph.edges_assignment.filter(t=>t==='B').length,20);assert.equal(d.segments.length,28);assert.ok(d.segments.every(s=>s.assignment==='U'?s.angle===null:s.angle===0));assert.equal(own(d).finiteProof.validationTriangles,32);assert.equal(own(d).finiteProof.validationRulingsAreCPEdges,false);assert.equal(own(d).finiteProof.exactSingleCoverage,true);assert.equal(own(d).native.certification.adoptableCreasePattern,false);assert.equal(genericSpacePaperSourceMatches(d),true);assert.equal(JSON.stringify(raw),before);
});
test('focus and interval-unknown sources keep their raw flags and cannot become paper even when finite metric tests passed',()=>{
 for(const name of ['focus','unknown','nonlinear']){const raw=sample(name),before=JSON.stringify(raw);assert.throws(()=>genericSpacePaperDocument(recipe(raw),raw));assert.equal(JSON.stringify(raw),before);}
});
test('the explicit millimetre unit is applied exactly once to raw target coordinates, with original origin and y orientation preserved',()=>{
 const raw=sample(),d=genericSpacePaperDocument(recipe(raw,10),raw),g=d.metadata!.materialTopology as any;assert.deepEqual(g.graph.vertices_coords[0],[10,0]);
 raw.grid.forEach((row:any,i:number)=>assert.deepEqual(g.graph.vertices_coords[i],row.targetLeft[0].map((x:number)=>x*10)));assert.equal(genericSpacePaperSourceMatches(d),true);assert.deepEqual(readGenericSpacePaperRecipe(d),recipe(raw,10));
});

test('strict source recipe refuses aliases, coerced units, nonzero start widths, partial expressions and forged extra options',()=>{
 const p=genericSpacePaperPreset();for(const change of [{unitSizeMm:0},{unitSizeMm:'1'},{unitSizeMm:null},{unitSizeMm:Infinity},{extra:true}])assert.throws(()=>validateGenericSpacePaperRecipe({...p,...change}));
 for(const q of [{transverseStart:.01},{transverseEnd:0},{foldCurve:['s','0']},{foldAngle:'eval(s)'},{orientation:0},{segments:7},{initialPoint:[0,0]}])assert.throws(()=>validateGenericSpacePaperRecipe({...p,query:{...p.query,...q}}));
 assert.deepEqual(validateGenericSpacePaperRecipe(p),p);
});
test('variable source gamma is preserved as a source function, never fabricated as finite-chord target angles or original M/V',()=>{
 const raw=sample(),d=genericSpacePaperDocument(recipe(raw),raw),s=own(d);assert.equal(s.native.query.foldAngle,'-2*atan(sqrt(4+s**2))');assert.equal(s.source.originalMVAssignmentProvided,false);assert.equal(s.sampling.assignment,'U');assert.equal(s.sampling.targetAngle,null);assert.equal(s.sampling.exactContinuousCurve,false);assert.equal(s.scope.reference3DOnly,true);assert.equal(s.scope.rigidFlatFoldCertified,false);assert.equal(s.scope.layerOrderCertified,false);assert.equal(s.native.certification.integrationErrorIntervalCertified,false);assert.equal(Object.hasOwn(d,'flatFold'),false);assert.equal(Object.hasOwn(d.metadata!.materialTopology as object,'foldedVertices'),false);
});
test('JSON and FOLD reopen full source and indexed material; ordinary R12 LINE geometry covers every actual edge once',()=>{
 const raw=sample(),d=genericSpacePaperDocument(recipe(raw,10),raw);for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc;assert.equal(genericSpacePaperSourceMatches(back),true);assert.deepEqual(back.segments,d.segments);assert.deepEqual(own(back),own(d));assert.deepEqual(back.metadata!.materialTopology,d.metadata!.materialTopology);}
 const fields=exportDXF(d).text.trim().split(/\r?\n/),lines:Record<string,string>[]=[];for(let i=0;i<fields.length;i+=2)if(fields[i]==='0'&&fields[i+1]==='LINE'){const row:Record<string,string>={};for(let j=i+2;j<fields.length&&fields[j]!=='0';j+=2)row[fields[j]]=fields[j+1];lines.push(row);}
 assert.equal(lines.length,28);assert.ok(fields.includes('AC1009'));lines.forEach((r,i)=>{const s=d.segments[i];assert.deepEqual([+r['10'],+r['20'],+r['30'],+r['11'],+r['21'],+r['31']],[s.a[0],-s.a[1],0,s.b[0],-s.b[1],0].map(v=>v===0?0:v));assert.equal(r['8'],s.assignment==='B'?'CutLine':'UnassignedLine');});assert.equal(lines.filter(r=>r['8']==='UnassignedLine').length,8);
});
function nextUp(x:number){const view=new DataView(new ArrayBuffer(8));if(x===0)return Number.MIN_VALUE;view.setFloat64(0,x);view.setBigUint64(0,view.getBigUint64(0)+(x>0?1n:-1n));return view.getFloat64(0);}
test('coherent one-ULP CP/source-grid microshift is refused by exact replay of the preserved ODE-frame seed',()=>{
 const raw=sample(),d=genericSpacePaperDocument(recipe(raw),raw),g=(d.metadata!.materialTopology as any).graph,index=12,n=g.vertices_coords[index][0],v=nextUp(n);assert.notEqual(v,n);g.vertices_coords[index][0]=v;
 g.edges_vertices.forEach(([a,b]:[number,number],i:number)=>{if(a===index)d.segments[i].a[0]=v;if(b===index)d.segments[i].b[0]=v;});own(d).native.grid[3].targetLeft.at(-1)[0]=v;
 assert.equal(genericSpacePaperSourceMatches(d),false);assert.deepEqual(readGenericSpacePaperRecipe(d),recipe(raw));
});
test('the saved source, proof, initial coordinates, interval partition, identity, angular scope and ordinary material binding cannot be forged',()=>{
 const mutations=[(d:any)=>{own(d).native.initial.point[0]=nextUp(1);own(d).native.normalization.targetOrigin[0]=nextUp(1);},(d:any)=>{own(d).native.domain.cells[0].end=nextUp(own(d).native.domain.cells[0].end);},(d:any)=>{own(d).native.domain.certified=false;},(d:any)=>{own(d).native.certification.adoptableCreasePattern=true;},(d:any)=>{own(d).source.coordinateMirror=true;},(d:any)=>{own(d).source.DiscretizeSystem4093LinkClaimed=true;},(d:any)=>{own(d).scope.continuousSurfaceIsometryCertified=true;},(d:any)=>{own(d).finiteProof.exactSingleCoverage=false;},(d:any)=>{own(d).recipe.unitSizeMm=nextUp(1);},(d:any)=>{own(d).numericPolicy.geometryToleranceApplied=true;},(d:any)=>{d.segments[0].assignment='M';(d.metadata.materialTopology.graph as any).edges_assignment[0]='M';},(d:any)=>{d.metadata.materialTopology.graph.faces_vertices[0].reverse();},(d:any)=>{d.paper.width=nextUp(d.paper.width);},(d:any)=>{d.flatFold={};},(d:any)=>{own(d).extra=true;}];
 for(const mutate of mutations){const raw=sample(),d=genericSpacePaperDocument(recipe(raw),raw);mutate(d);assert.equal(genericSpacePaperSourceMatches(d),false,mutate.toString());}
});
test('preview snapshots retain exact current recipe and raw source while later edits cannot mutate or adopt an old view',()=>{
 const raw=sample(),p=recipe(raw),snapshot=prepareGenericSpacePaperPreview(p,raw);assert.equal(genericSpacePaperSourceMatches(snapshot.build()),true);assert.ok(Object.isFrozen(snapshot.native));assert.ok(Object.isFrozen(snapshot.native.grid));raw.grid[0].targetLeft[0][0]=500;p.unitSizeMm=2;assert.throws(()=>snapshot.build(p));snapshot.doc.segments[0].a[0]=100;assert.equal(genericSpacePaperSourceMatches(snapshot.build()),true);
});
test('the real existing API request contract is reused unchanged and is abortable; no new backend endpoint or instruction evaluation is introduced',async()=>{
 const raw=sample(),p=recipe(raw),old=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),'/api/tessellation/curved-space-curve-fold-generic');assert.deepEqual(JSON.parse(String(init?.body)),raw.query);return new Response(JSON.stringify(raw),{status:200,headers:{'Content-Type':'application/json'}});};
 try{const preview=await fetchGenericSpacePaperPreview(p,AbortSignal.timeout(5000));assert.equal(genericSpacePaperSourceMatches(preview.build()),true);assert.equal(calls,1);const controller=new AbortController();controller.abort();await assert.rejects(()=>fetchGenericSpacePaperPreview(p,controller.signal));assert.equal(calls,1);}finally{globalThis.fetch=old;}
});
test('a separately invoked existing backend short-domain source becomes 51V52E2F with the literal source retained after reopen',()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('../fixtures/origamica-space-curve-paper-finite-noncircular-short.json',import.meta.url),'utf8')),d=genericSpacePaperDocument(recipe(raw,100),raw),m=inspectMaterialTopology(d);assert.equal(m.ok,true);if(!m.ok)return;
 assert.deepEqual([m.graph.vertices_coords.length,m.graph.edges_vertices.length,m.graph.faces_vertices!.length],[51,52,2]);assert.deepEqual(own(d).native,raw);assert.equal(own(d).recipe.unitSizeMm,100);assert.equal(d.segments.filter(s=>s.assignment==='U').length,16);assert.equal(genericSpacePaperSourceMatches(d),true);assert.equal(genericSpacePaperSourceMatches(importDocument(exportDocument(d,'json').text,'json').doc),true);
});
