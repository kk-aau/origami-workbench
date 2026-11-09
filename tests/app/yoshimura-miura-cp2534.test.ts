import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildYoshimuraMiuraCP,evaluateYoshimuraMiuraSource,yoshimuraMiuraSourceMatches,yoshimuraMiuraRecipeFromDoc,prepareYoshimuraMiuraPreview,YOSHIMURA_MIURA_MIXED_EXAMPLE,YOSHIMURA_MIURA_DOUBLE_SPIRAL_EXAMPLE,YOSHIMURA_MIURA_RUNS_EXAMPLE,YoshimuraMiuraError,type YoshimuraMiuraRecipe} from '../../src/app/yoshimuraMiuraCP2534';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {buildFold} from '../../src/core/geometry';
import {exportDocument,importDocument} from '../../src/core/formats';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/yoshimura-miura-cp2534.json',import.meta.url),'utf8'));
for(const f of fixture.cases)test(`独立源 MP80、原边顺序与实际材料：${f.name}`,()=>{
 const doc=buildYoshimuraMiuraCP(f.recipe),inspected=inspectMaterialTopology(doc);assert.ok(inspected.ok);const g=inspected.graph,source=evaluateYoshimuraMiuraSource(f.recipe);
 assert.deepEqual(g.edges_vertices,f.edges);assert.deepEqual(g.edges_assignment,f.assignments);assert.deepEqual(g.faces_vertices,f.faces);
 assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices!.length,g.edges_assignment.filter(x=>x==='B').length],[f.counts.V,f.counts.E,f.counts.F,f.counts.B]);
 for(let i=0;i<f.vertices.length;i++)for(let k=0;k<2;k++)assert.ok(Math.abs(g.vertices_coords[i][k]-f.vertices[i][k])<=Math.max(1e-13,source.numericalPolicy.worldErrorEstimateMm),`原点${i}/${k}`);
 for(let i=0;i<f.foldAnglesDeg.length;i++)assert.ok(Math.abs(g.edges_foldAngle[i]!-f.foldAnglesDeg[i])<=source.numericalPolicy.angleErrorEstimateDeg,`原折角${i}`);
 assert.deepEqual(buildFold(doc).graph.edges_vertices,f.edges);assert.ok(yoshimuraMiuraSourceMatches(doc));assert.deepEqual(yoshimuraMiuraRecipeFromDoc(doc),f.recipe);
 assert.ok(g.edges_vertices.every(([a,b],i)=>g.vertices_coords[a][0]!==g.vertices_coords[b][0]||g.edges_assignment[i]==='B'),'未添加内部竖线');
});
test('Γ改变真实折角而保原CP平面；负Γ保原字面首角',()=>{
 const a=buildYoshimuraMiuraCP(YOSHIMURA_MIURA_MIXED_EXAMPLE),b=buildYoshimuraMiuraCP({...YOSHIMURA_MIURA_MIXED_EXAMPLE,horizontalFoldDeg:60}),negative=buildYoshimuraMiuraCP({...YOSHIMURA_MIURA_MIXED_EXAMPLE,horizontalFoldDeg:-45});
 assert.deepEqual(a.segments.map(s=>[s.a,s.b]),b.segments.map(s=>[s.a,s.b]));assert.notDeepEqual(a.segments.map(s=>s.angle),b.segments.map(s=>s.angle));assert.deepEqual(a.segments.map(s=>s.angle),negative.segments.map(s=>s.angle));assert.ok(a.segments.some(s=>s.angle!==0&&Math.abs(s.angle!)!==180));
});
test('用户毫米单位只缩放一次，保存/原参数读回无归一化',()=>{
 const r={...YOSHIMURA_MIURA_DOUBLE_SPIRAL_EXAMPLE,unitSizeMm:20},doc=buildYoshimuraMiuraCP(r),source=evaluateYoshimuraMiuraSource(r),g=buildFold(doc).graph;
 assert.equal(doc.paper.width,source.columns.at(-1)!*20);assert.equal(doc.paper.height,200);assert.deepEqual(g.vertices_coords[11],[source.columns[1]*20,0]);
 const saved=JSON.parse(JSON.stringify(doc));assert.ok(yoshimuraMiuraSourceMatches(saved));assert.deepEqual(yoshimuraMiuraRecipeFromDoc(saved),r);assert.equal(saved.metadata.originalYoshimuraMiura2534.nativeSource.scalingAppliedOnce,true);
});
test('两原重载尺度分别保持，显式模式改变不是暗中转换',()=>{
 const a=buildYoshimuraMiuraCP({mode:'signed-columns',columnAnglesDeg:[30,-30],rows:2,horizontalFoldDeg:45,unitSizeMm:1}),b=buildYoshimuraMiuraCP({mode:'uniform-runs',angleDeg:30,runs:[2],rows:2,horizontalFoldDeg:45,unitSizeMm:1});
 assert.equal(b.paper.width,2);assert.ok(Math.abs(b.paper.height-2/Math.sqrt(3))<1e-14);assert.ok(Math.abs(a.paper.width-2*Math.sqrt(3))<1e-14);assert.equal(a.paper.height,2);
});
test('源与预算分开，奇点/有限退化/接口拒绝不夹取',()=>{
 const reject=(r:unknown,code:string)=>assert.throws(()=>buildYoshimuraMiuraCP(r),(e:unknown)=>e instanceof YoshimuraMiuraError&&e.code===code);
 reject({...YOSHIMURA_MIURA_MIXED_EXAMPLE,columnAnglesDeg:[0]},'SOURCE_SINGULARITY');reject({...YOSHIMURA_MIURA_MIXED_EXAMPLE,columnAnglesDeg:[90]},'FINITE_GEOMETRY');reject({...YOSHIMURA_MIURA_RUNS_EXAMPLE,angleDeg:90},'SOURCE_SINGULARITY');reject({...YOSHIMURA_MIURA_MIXED_EXAMPLE,horizontalFoldDeg:0},'SOURCE_CAPABILITY');reject({...YOSHIMURA_MIURA_MIXED_EXAMPLE,horizontalFoldDeg:180},'SOURCE_CAPABILITY');reject({...YOSHIMURA_MIURA_MIXED_EXAMPLE,rows:100000},'MATERIAL_INTERFACE');reject({...YOSHIMURA_MIURA_MIXED_EXAMPLE,unitSizeMm:1e6},'MATERIAL_INTERFACE');
 const literal=buildYoshimuraMiuraCP({mode:'signed-columns',columnAnglesDeg:[390,-390],rows:3,horizontalFoldDeg:60,unitSizeMm:1});assert.ok(yoshimuraMiuraSourceMatches(literal));assert.equal((literal.metadata!.originalYoshimuraMiura2534 as any).recipe.columnAnglesDeg[0],390);
});
test('公开源绑定拒绝手改/单叶伪造，不修复实际图',()=>{
 const original=buildYoshimuraMiuraCP(YOSHIMURA_MIURA_MIXED_EXAMPLE),mutations=[
  (d:any)=>d.metadata.originalYoshimuraMiura2534.recipe.horizontalFoldDeg=60,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.nativeSource.nativeColumns[0]=Number.MIN_VALUE,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.nativeSource.nativeRowPitch=1+Number.EPSILON,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.nativeSource.diagonalAnglesDeg[0]+=1e-12,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.nativeSource.tiltBases[0]*=-1,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.numericalPolicy.sourceCoordinateReplayULPs+=1,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.numericalPolicy.worldErrorEstimateMm=-1,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.finitePaperProof.rectangleCoveredExactlyOnce=false,
  (d:any)=>d.segments[3].angle+=1e-12,
  (d:any)=>d.segments[3].a[0]+=1e-6,
  (d:any)=>d.paper.width+=1e-3,
  (d:any)=>d.metadata.originalYoshimuraMiura2534.scope.originalFoldGraph3DReproduced=true,
 ];
 for(const [index,mutate] of mutations.entries()){const d=structuredClone(original);mutate(d);const bytes=JSON.stringify(d);assert.equal(yoshimuraMiuraSourceMatches(d),false,`mutation ${index}`);assert.equal(JSON.stringify(d),bytes);assert.deepEqual(yoshimuraMiuraRecipeFromDoc(d),(d.metadata!.originalYoshimuraMiura2534 as any).recipe);}
 const d=structuredClone(original);(d.metadata!.originalYoshimuraMiura2534 as any).numericalPolicy.worldErrorEstimateMm*=1+Number.EPSILON;assert.ok(yoshimuraMiuraSourceMatches(d),'派生工程诊断叶保有限跨runtime预算');
});
test('预览源缓存深冻，结果采用为独立副本',()=>{
 const prepared=prepareYoshimuraMiuraPreview(YOSHIMURA_MIURA_MIXED_EXAMPLE),a=prepared.build(),b=prepared.build();assert.ok(Object.isFrozen(prepared.source.columns));assert.ok(Object.isFrozen(prepared.source.recipe));assert.deepEqual(a,b);a.segments[0].a[0]=10;assert.ok(yoshimuraMiuraSourceMatches(b));assert.notDeepEqual(a,b);
});
test('实际CP手改仍可显式读原参数重建，采用源门禁不放宽',()=>{
 const original=buildYoshimuraMiuraCP(YOSHIMURA_MIURA_MIXED_EXAMPLE);
 for(const mutate of [(d:any)=>{d.segments[3].assignment='V';d.segments[3].angle=180;},(d:any)=>{d.segments[3].a[0]+=.1;}]){const d=structuredClone(original);mutate(d);assert.equal(yoshimuraMiuraSourceMatches(d),false);assert.deepEqual(yoshimuraMiuraRecipeFromDoc(d),YOSHIMURA_MIURA_MIXED_EXAMPLE);const bytes=JSON.stringify(d),regenerated=buildYoshimuraMiuraCP(yoshimuraMiuraRecipeFromDoc(d));assert.ok(yoshimuraMiuraSourceMatches(regenerated));assert.equal(JSON.stringify(d),bytes);}
 for(const mutate of [(d:any)=>d.metadata.originalYoshimuraMiura2534.schema='unknown',(d:any)=>d.metadata.originalYoshimuraMiura2534.recipe.rows=0,(d:any)=>d.metadata.originalYoshimuraMiura2534.recipe.unknown=1]){const d=structuredClone(original);mutate(d);assert.equal(yoshimuraMiuraRecipeFromDoc(d),null);}
});
test('真实普通JSON/FOLD编码再导入保完整源参数、单位和原目标角',()=>{
 const recipe={...YOSHIMURA_MIURA_DOUBLE_SPIRAL_EXAMPLE,unitSizeMm:12},doc=buildYoshimuraMiuraCP(recipe);
 for(const format of ['json','fold'] as const){const encoded=exportDocument(doc,format),loaded=importDocument(encoded.text,format).doc;assert.ok(yoshimuraMiuraSourceMatches(loaded));assert.deepEqual(yoshimuraMiuraRecipeFromDoc(loaded),recipe);assert.deepEqual(loaded.paper,doc.paper);assert.deepEqual(loaded.segments.map(s=>[s.a,s.b,s.assignment,s.angle]),doc.segments.map(s=>[s.a,s.b,s.assignment,s.angle]));assert.deepEqual(buildFold(loaded).graph.faces_vertices,buildFold(doc).graph.faces_vertices);}
});
