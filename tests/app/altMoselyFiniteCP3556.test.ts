import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {ALT_MOSELY_FINITE_PRESET,ALT_MOSELY_CLOSED_AXIS_PRESET,ALT_MOSELY_ORIGINAL_PRESETS,
 altMoselyFiniteCPDocument,altMoselyFiniteCPSourceMatches,readAltMoselyFiniteRecipe,validateAltMoselyFiniteRecipe} from '../../src/app/altMoselyFiniteCP3556';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import type {Doc,Point} from '../../src/core/types';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/alt-mosely-finite-cp-3556-20261011.json',import.meta.url),'utf8'));
const clone=<T>(v:T):T=>structuredClone(v),metadata=(d:Doc)=>d.metadata as any;
const near=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=1e-13;
test('原3558逐非零源线保坐标/角色；新增边仅真实源有限端边',()=>{
 const doc=altMoselyFiniteCPDocument(fixture.recipe),source=metadata(doc).originalAltMosely3556,
  cap=new Set(source.sourcePartition.finiteEndEdges),seen=new Set<string>();let zeros=0;
 for(const line of fixture.flatLines){const [a,b]=line.points as Point[];
  if(a[0]===b[0]&&a[1]===b[1]){zeros++;continue;}
  const role=line.role==='F'?'U':line.role,s=doc.segments.find(s=>s.assignment===role&&
   ((near(s.a,a)&&near(s.b,b))||(near(s.b,a)&&near(s.a,b))));
  assert.ok(s,'遗漏原二维线 '+JSON.stringify(line));seen.add(s.id);
 }
 assert.equal(zeros,18);assert.equal(seen.size,162);assert.equal(cap.size,8);
 doc.segments.forEach((s,i)=>{if(!seen.has(s.id)){assert.ok(cap.has(i));assert.equal(s.assignment,'B');}});
 assert.deepEqual(source.recipe,fixture.recipe);assert.equal(source.sourcePartition.zeroGraphicLines.length,18);
 assert.equal(source.sourcePartition.zeroCells.length,18);assert.equal(source.sourcePartition.mergedUncreasedRails,26);
 assert.equal(source.capabilities.finiteRigid3D,false);assert.equal(source.capabilities.flatFoldOrLayerCertificate,false);
});
test('有限原例与用户新闭轴输入是真实单片材料；毫米不二次缩放',()=>{
 const rows=[{recipe:ALT_MOSELY_FINITE_PRESET,counts:[95,170,76]},
  {recipe:ALT_MOSELY_CLOSED_AXIS_PRESET,counts:[108,206,99]},
  {recipe:{profile:[[0,0],[15,15],[15,30],[0,45]],sectors:6,minimumAngleDeg:10},counts:[82,156,75]},
  {recipe:{...ALT_MOSELY_FINITE_PRESET,sectors:8,minimumAngleDeg:0},counts:[125,224,100]}];
 for(const row of rows){const before=clone(row.recipe),doc=altMoselyFiniteCPDocument(row.recipe),a=inspectMaterialTopology(doc);
  assert.deepEqual(row.recipe,before);assert.ok(a.ok);if(!a.ok)continue;
  const g=metadata(doc).materialTopology.graph;assert.deepEqual([g.vertices_coords.length,g.edges_vertices.length,g.faces_vertices.length],row.counts);
  assert.equal(row.counts[0]-row.counts[1]+row.counts[2],1);assert.equal(a.components.length,1);assert.equal(a.components[0].boundaryLoops.length,1);
  assert.ok(altMoselyFiniteCPSourceMatches(doc));assert.ok(!(doc as any).foldedVertices);assert.equal((doc.objects??[]).length,0);
  assert.equal(doc.segments.every(s=>s.assignment==='B'?s.angle===0:s.angle===null),true);
 }
 const r=clone(ALT_MOSELY_FINITE_PRESET);r.profile=r.profile.map(p=>[2*p[0],2*p[1]]);
 const a=altMoselyFiniteCPDocument(ALT_MOSELY_FINITE_PRESET),b=altMoselyFiniteCPDocument(r);
 b.segments.forEach((s,i)=>{assert.ok(near(s.a,[a.segments[i].a[0]*2,a.segments[i].a[1]*2]));assert.ok(near(s.b,[a.segments[i].b[0]*2,a.segments[i].b[1]*2]));});
});
test('原3557真实薄区精度拒绝，原参数未偷偷改成闭轴域',()=>{
 const raw=clone(ALT_MOSELY_ORIGINAL_PRESETS[0]);assert.throws(()=>altMoselyFiniteCPDocument(raw),/精度|零长/);
 assert.deepEqual(raw,ALT_MOSELY_ORIGINAL_PRESETS[0]);
 assert.deepEqual(validateAltMoselyFiniteRecipe(raw),raw);
});
test('非法结构/原方向退化/本地有限域拒绝，不修点或夹值',()=>{
 for(const bad of [null,{...ALT_MOSELY_FINITE_PRESET,extra:true},{...ALT_MOSELY_FINITE_PRESET,sectors:5},
  {...ALT_MOSELY_FINITE_PRESET,sectors:'6'},{...ALT_MOSELY_FINITE_PRESET,minimumAngleDeg:-1},
  {...ALT_MOSELY_FINITE_PRESET,profile:[[0,0],[0,0],[0,1]]},
  {...ALT_MOSELY_FINITE_PRESET,profile:[[0,0],[-1,1],[0,2]]},
  {...ALT_MOSELY_FINITE_PRESET,profile:[[0,0],[NaN,1],[0,2]]}])assert.throws(()=>altMoselyFiniteCPDocument(bad));
});
test('公开来源绑定真实Doc/材料/身份/赋型，手改仍可读原参数',()=>{
 const doc=altMoselyFiniteCPDocument(ALT_MOSELY_FINITE_PRESET),before=JSON.stringify(doc);
 const mutations=[(d:Doc)=>{d.segments[0].a[0]+=.001;},(d:Doc)=>{d.segments[0].id='fake';},
  (d:Doc)=>{d.segments.find(s=>s.assignment==='M')!.assignment='V';},(d:Doc)=>{d.segments.find(s=>s.assignment==='M')!.angle=-180;},
  (d:Doc)=>{metadata(d).materialTopology.graph.edges_vertices[0][0]+=.000000000001;},
  (d:Doc)=>{metadata(d).originalAltMosely3556.capabilities.finiteRigid3D=true;},
  (d:Doc)=>{metadata(d).originalAltMosely3556.recipe.sectors=8;},
  (d:Doc)=>{metadata(d).materialTopology.graph.vertices_coords.push([0,0]);},
  (d:Doc)=>{d.paper.width+=.001;},(d:Doc)=>{d.segments[0].a.push(0);},
  (d:Doc)=>{const i=metadata(d).originalAltMosely3556.sourcePartition.literalOriginVertex,g=metadata(d).materialTopology.graph;
   g.vertices_coords[i][0]=Number.MIN_VALUE;g.edges_vertices.forEach((e:number[],j:number)=>{if(e[0]===i)d.segments[j].a[0]=Number.MIN_VALUE;if(e[1]===i)d.segments[j].b[0]=Number.MIN_VALUE;});}];
 for(const change of mutations){const altered=clone(doc);change(altered);assert.equal(altMoselyFiniteCPSourceMatches(altered),false);}
 const hand=clone(doc);hand.segments.find(s=>s.assignment==='M')!.assignment='V';
 assert.deepEqual(readAltMoselyFiniteRecipe(hand),ALT_MOSELY_FINITE_PRESET);
 const named=clone(doc);named.name='我的剖面';assert.ok(altMoselyFiniteCPSourceMatches(named));
 assert.equal(JSON.stringify(doc),before);
});
test('普通JSON/FOLD保存重开保原M/V null及有限材料source；DXF按独立LINE读取',()=>{
 const doc=altMoselyFiniteCPDocument(ALT_MOSELY_FINITE_PRESET);
 for(const format of ['json','fold'] as const){const out=exportDocument(doc,format),opened=importDocument(out.text,format).doc;
  assert.ok(altMoselyFiniteCPSourceMatches(opened));assert.deepEqual(opened.segments.map(s=>[s.assignment,s.angle]),doc.segments.map(s=>[s.assignment,s.angle]));
  assert.deepEqual(readAltMoselyFiniteRecipe(opened),ALT_MOSELY_FINITE_PRESET);
 }
 const out=exportDXF(doc).text,rows=out.split(/\r?\n/).map(s=>s.trim()),lines:{a:Point;b:Point}[]=[];
 for(let i=0;i<rows.length-1;i++)if(rows[i]==='0'&&rows[i+1]==='LINE'){
  const fields:Record<string,string>={};for(let j=i+2;j<rows.length-1&&rows[j]!=='0';j+=2)fields[rows[j]]=rows[j+1];
  lines.push({a:[Number(fields['10']),Number(fields['20'])],b:[Number(fields['11']),Number(fields['21'])]});
 }
 assert.equal(lines.length,doc.segments.length);lines.forEach((l,i)=>{assert.ok(near(l.a,[doc.segments[i].a[0],-doc.segments[i].a[1]]));assert.ok(near(l.b,[doc.segments[i].b[0],-doc.segments[i].b[1]]));});
});
