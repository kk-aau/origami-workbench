import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,evaluateLinkedBandsPlanarCP4086Source,linkedBandsPlanarCP4086Document,linkedBandsPlanarCP4086SourceMatches,readLinkedBandsPlanarCP4086Recipe,prepareLinkedBandsPlanarCP4086Preview,LinkedBandsPlanarCP4086Error} from '../../src/app/linkedBandsPlanarCP4086';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {buildFold} from '../../src/core/geometry';
import {exportDocument,importDocument} from '../../src/core/formats';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/linked-bands-planar-cp4086.json',import.meta.url),'utf8'));
for(const f of fixture.cases)test(`独立MP80 Lagrange原二维公式与精确纸域：${f.name}`,()=>{
 if(f.status==='rejected'){assert.throws(()=>linkedBandsPlanarCP4086Document(f.recipe),(e:unknown)=>e instanceof LinkedBandsPlanarCP4086Error&&e.code==='FINITE_PAPER');return;}
 const source=evaluateLinkedBandsPlanarCP4086Source(f.recipe),doc=linkedBandsPlanarCP4086Document(f.recipe),material=inspectMaterialTopology(doc);assert.ok(material.ok);const g=material.graph,own=doc.metadata!.originalLinkedBandsPlanar4086 as any;
 assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices!.length,g.edges_assignment.filter(x=>x==='B').length,g.edges_assignment.filter(x=>x==='U').length],[f.proof.vertices,f.proof.edges,f.proof.faces,f.proof.boundaryEdges,f.proof.unassignedEdges]);
 for(let i=0;i<source.frames.length;i++)for(const key of ['qValues','qDerivatives','gammaDegrees','flatCurves'] as const){const a=source.frames[i][key].flat(),b=f.rows[i][key].flat();for(let k=0;k<a.length;k++)assert.ok(Math.abs(a[k]-b[k])<=source.rawReplayBudget,`${key} row${i} col${k} diff${Math.abs(a[k]-b[k])} budget${source.rawReplayBudget}`);}
 assert.equal(own.finitePaperProof.proofCells,f.proof.proofCells);assert.equal(own.finitePaperProof.proofTriangles,f.proof.proofTriangles);assert.equal(own.finitePaperProof.partitionEdges,f.proof.partitionEdges);
 assert.ok(own.finitePaperProof.minimumTriangleCross>0);assert.equal(own.evidence.originalSavedWhole3DChainCertified,false);assert.equal(own.evidence.sourceGammaIsFiniteEdgeAngle,false);
 assert.ok(g.edges_foldAngle.every((v,i)=>g.edges_assignment[i]==='B'?v===0:v===null));assert.equal(g.vertices_coords.length-g.edges_vertices.length+g.faces_vertices!.length,1);
 assert.ok(linkedBandsPlanarCP4086SourceMatches(doc));assert.deepEqual(readLinkedBandsPlanarCP4086Recipe(doc),f.recipe);assert.equal(buildFold(doc).graph.faces_vertices!.length,f.recipe.bands);
});
test('毫米倍率只缩放一次；源本地坐标、绝对裁域不重置',()=>{
 const raw={...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,parameterStart:.3,parameterEnd:2.6,segments:16},a=linkedBandsPlanarCP4086Document(raw),b=linkedBandsPlanarCP4086Document({...raw,unitSizeMm:50});
 assert.deepEqual((a.metadata!.originalLinkedBandsPlanar4086 as any).sourceFrames,(b.metadata!.originalLinkedBandsPlanar4086 as any).sourceFrames);
 for(let i=0;i<a.segments.length;i++)for(const p of ['a','b'] as const)assert.deepEqual(b.segments[i][p],a.segments[i][p].map(x=>x*50));
 const frame=(a.metadata!.originalLinkedBandsPlanar4086 as any).sourceFrames[0];assert.equal(frame.s,.3);assert.equal(frame.qValues[0],.3);assert.notDeepEqual(frame.flatCurves[0],[1,0]);
});
test('源Γ真正改变后续二维曲线，但永远不冒充有限折角',()=>{
 const a=linkedBandsPlanarCP4086Document({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,bands:2,segments:16}),b=linkedBandsPlanarCP4086Document({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,bands:2,segments:16,firstFoldAngleDeg:90});
 assert.notDeepEqual(a.segments.map(s=>[s.a,s.b]),b.segments.map(s=>[s.a,s.b]));assert.deepEqual(a.segments.map(s=>[s.assignment,s.angle]),b.segments.map(s=>[s.assignment,s.angle]));
 // Four full bands at this angle really fail this numerical interpretation;
 // retain that material refusal rather than changing the source or domain.
 assert.throws(()=>linkedBandsPlanarCP4086Document({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,segments:16,firstFoldAngleDeg:90}),(e:unknown)=>e instanceof LinkedBandsPlanarCP4086Error&&e.code==='FINITE_PAPER');
});
test('合法手改仍读原recipe供重建；公开源门禁拒绝，不修复文件',()=>{
 const original=linkedBandsPlanarCP4086Document({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,segments:16});
 const mutations=[(d:any)=>{d.segments[17].assignment='M';d.segments[17].angle=-180;},(d:any)=>{d.segments[3].a[0]+=.001;},
  (d:any)=>{d.metadata.originalLinkedBandsPlanar4086.sourceFrames[0].qValues[1]=Number.MIN_VALUE;},
  (d:any)=>{d.metadata.originalLinkedBandsPlanar4086.sourceFrames[0].flatCurves[0][1]=Number.MIN_VALUE;},
  (d:any)=>{d.metadata.originalLinkedBandsPlanar4086.sourceFrames[0].qDerivatives[1]+=Number.EPSILON;},
  (d:any)=>{d.metadata.originalLinkedBandsPlanar4086.sourceFrames[0].gammaDegrees[0]+=1e-12;},
  (d:any)=>{d.metadata.originalLinkedBandsPlanar4086.numericPolicy.intervalCertified=true;},
  (d:any)=>{d.metadata.originalLinkedBandsPlanar4086.finitePaperProof.positivePartitionAndSimpleBoundary=false;},
  (d:any)=>{d.metadata.originalLinkedBandsPlanar4086.evidence.originalSavedWhole3DChainCertified=true;}];
 for(const mutate of mutations){const d=structuredClone(original);mutate(d);const before=JSON.stringify(d);assert.equal(linkedBandsPlanarCP4086SourceMatches(d),false);assert.equal(JSON.stringify(d),before);assert.deepEqual(readLinkedBandsPlanarCP4086Recipe(d),{...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,segments:16});}
});
test('单位预览缓存保源帧身份、深冻；源变须新建，采用副本不污染缓存',()=>{
 const r={...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,segments:16},prepared=prepareLinkedBandsPlanarCP4086Preview(r),a=prepared.build(r),b=prepared.build({...r,unitSizeMm:30});
 assert.ok(Object.isFrozen(prepared.source.frames));assert.equal((a.metadata!.originalLinkedBandsPlanar4086 as any).sourceFrames,prepared.source.frames);assert.equal((b.metadata!.originalLinkedBandsPlanar4086 as any).sourceFrames,prepared.source.frames);
 assert.throws(()=>prepared.build({...r,perturbation:.03}));const adopted=structuredClone(a);adopted.segments[0].a[0]=0;assert.ok(linkedBandsPlanarCP4086SourceMatches(a));assert.equal(linkedBandsPlanarCP4086SourceMatches(adopted),false);
});
test('真实普通JSON/FOLD编码保源、U/null、毫米坐标与真实材料面',()=>{
 const doc=linkedBandsPlanarCP4086Document({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,segments:16,unitSizeMm:30});
 for(const format of ['json','fold'] as const){const file=exportDocument(doc,format),loaded=importDocument(file.text,format).doc;assert.ok(linkedBandsPlanarCP4086SourceMatches(loaded));assert.deepEqual(readLinkedBandsPlanarCP4086Recipe(loaded),readLinkedBandsPlanarCP4086Recipe(doc));assert.deepEqual(loaded.paper,doc.paper);assert.deepEqual(loaded.segments.map(s=>[s.a,s.b,s.assignment,s.angle]),doc.segments.map(s=>[s.a,s.b,s.assignment,s.angle]));assert.equal(buildFold(loaded).graph.faces_vertices!.length,4);}
});
test('源输入、数值预算及材料接口错误分开，不夹取参数',()=>{
 const reject=(r:unknown,code:string)=>assert.throws(()=>linkedBandsPlanarCP4086Document(r),(e:unknown)=>e instanceof LinkedBandsPlanarCP4086Error&&e.code===code);
 reject({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,radius:-1},'SOURCE_INPUT');reject({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,segments:129},'NUMERIC_SOURCE');reject({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,firstFoldAngleDeg:0},'NUMERIC_SOURCE');reject({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,firstFoldAngleDeg:180},'NUMERIC_SOURCE');reject({...LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,unitSizeMm:1e7},'MATERIAL_INTERFACE');
});
