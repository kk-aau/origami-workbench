import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readGorePaperParams,gorePaperLimits,gorePaperSourceValid,type GorePaperParams} from '../../src/app/goreData';
import {prepareTessResult,readTessParams,canAdoptTess,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {multipleGoreMaterialMatches} from '../../src/app/goreMultipleMaterial';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {splitEditableSegments} from '../../src/app/planarize';
import {buildFold} from '../../src/core/geometry';
import {transformSelection} from '../../src/app/state';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import type {FoldGraph} from '../../src/core/types';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/multiple-gore-cp-source-20261010.json',import.meta.url),'utf8')) as {cases:{name:string;params:GorePaperParams;response:TessResponse}[]};
const out=new URL('../../../actual-export/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('independent original multi-petal CP and actual 3D pass source, geometry and normal adoption gates',()=>{
 for(const c of fixture.cases){
  assert.deepEqual(readTessParams(c.params),readGorePaperParams(c.params));
  const r=prepareTessResult(c.response,c.params),material=inspectMaterialTopology(r.doc),scene=spatialMeshScene(r);
  assert.ok(material.ok);assert.equal(material.components.length,c.params.sectors);assert.equal(material.foldedVertices,undefined);assert.ok(scene);assert.ok(gorePaperSourceValid(r.source,r.fold,c.params));assert.ok(multipleGoreMaterialMatches(r,c.params));
  assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),true);assert.equal(canAdoptTess(r,true,tessConstructionKey(c.params),c.params),false);assert.equal(canAdoptTess(r,false,'stale',c.params),false);
  const graph=r.fold as FoldGraph,ff=scene.vertices;
  for(const f of graph.faces_vertices!)for(let a=0;a<f.length;a++)for(let b=a+1;b<f.length;b++)assert.ok(Math.abs(distance(graph.vertices_coords[f[a]],graph.vertices_coords[f[b]])-distance(ff[f[a]],ff[f[b]]))<1e-9);
  assert.equal(r.source.gluingApplied,false);assert.equal(r.source.coordinateWeldingApplied,false);assert.equal(r.source.standardSingleSheetFold,false);assert.equal(r.source.selfCollisionChecked,false);assert.equal(r.source.continuousRigidPathChecked,false);assert.equal((r.stats.checks as any).layerOrder.status,'not_checked');
  assert.deepEqual(buildFold(splitEditableSegments(r.doc)).graph.vertices_coords,material.graph.vertices_coords);
 }
});

test('shared finite multi-material domain binds dynamic controls to face and complete source budgets',()=>{
 const p:GorePaperParams={family:'gore-paper',profile:'sphere',sectors:24,divisions:25,typeMinimumAngleDeg:.5,petals:'multiple'};
 assert.equal(gorePaperLimits(p).divisions,25);assert.equal(gorePaperLimits(p).sectors,24);assert.ok(readGorePaperParams(p));
 for(const bad of [{...p,divisions:26},{...p,sectors:32,divisions:64},{...p,petals:'single'},{...p,petals:true},{...p,glue:true},{...p,typeMinimumAngleDeg:true},{...p,crossSection:[[0,0],[1,1]]}])assert.equal(readTessParams(bad),null);
 assert.equal(gorePaperLimits({...p,petals:undefined}).sectors,32);
});

test('coincident poles, seams and overlapping independent placements never weld or invent connectivity',()=>{
 for(const c of [fixture.cases[0],fixture.cases[3]]){
  const r=prepareTessResult(c.response,c.params),m=inspectMaterialTopology(r.doc);assert.ok(m.ok);const original=r.fold as FoldGraph;
  assert.equal(m.graph.vertices_coords.length,original.vertices_coords.length);assert.equal(m.graph.edges_vertices.length,original.edges_vertices.length);assert.deepEqual(m.graph.edges_vertices,original.edges_vertices);assert.deepEqual(m.graph.faces_vertices,original.faces_vertices);
  const all=new Set<number>();for(const part of m.components){assert.equal(part.boundaryLoops.length,1);for(const v of part.vertices){assert.ok(!all.has(v));all.add(v);}for(const e of part.edges){const [a,b]=m.graph.edges_vertices[e];assert.ok(part.vertices.includes(a)&&part.vertices.includes(b));}}
  const first=(r.source.independentMaterials as any[]).map(p=>p.radialRowVertices[0][0]);assert.equal(new Set(first).size,c.params.sectors);
  if(c.name==='points-six')assert.equal(new Set(first.map(v=>m.graph.vertices_coords[v].join(','))).size,1);
 }
});

test('source marker, deleted petal identity, exact topology, original data and FF tampering reject before adoption',()=>{
 const c=fixture.cases[0];
 const mutations=[(r:any)=>r.source.algorithm='foreign',(r:any)=>r.source.originalGoreData.data.flatLines.pop(),(r:any)=>r.source.originalGoreData.data.targetPolygons[1][0][1][0]+=.01,(r:any)=>r.source.independentMaterials[1].vertices[0]=0,(r:any)=>r.source.independentMaterials[1].id='gore-petal-0',(r:any)=>r.source.independentMaterials[1].rotationRad=0,(r:any)=>r.source.foldedForm3D[5][2]+=.01,(r:any)=>r.fold.vertices_coords[5][0]+=.01,(r:any)=>r.fold.faces_vertices.pop(),(r:any)=>{r.fold.edges_vertices.pop();r.fold.edges_assignment.pop();r.fold.edges_foldAngle.pop();},(r:any)=>r.fold.edges_foldAngle[2]+=.01,(r:any)=>r.source.gluingApplied=true,(r:any)=>r.source.coordinateWeldingApplied=true,(r:any)=>r.source.standardSingleSheetFold=true,(r:any)=>r.source.paperParameters.sectors=7,(r:any)=>r.source.staticGlobalIsometryChecked=false];
 for(const mutate of mutations){const r=prepareTessResult(structuredClone(c.response),c.params);mutate(r);assert.equal(gorePaperSourceValid(r.source,r.fold,c.params),false);assert.equal(spatialMeshScene(r),null);assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),false);assert.throws(()=>prepareTessResult(r,c.params));}
 const r=prepareTessResult(c.response,c.params);for(const other of [{...c.params,sectors:7},{...c.params,typeMinimumAngleDeg:2},{...c.params,petals:undefined}])assert.equal(canAdoptTess(r,false,tessConstructionKey(other),other),false);
 const bad=structuredClone(r);bad.doc.segments[0].a[0]+=.01;assert.equal(canAdoptTess(bad,false,tessConstructionKey(c.params),c.params),false);
});

test('existing material editor moves one complete petal without changing any other identity or certifying edited 3D',()=>{
 const c=fixture.cases[0],r=prepareTessResult(c.response,c.params),m=inspectMaterialTopology(r.doc);assert.ok(m.ok);
 const ids=m.components[2].edges.map(e=>m.edgeSegmentIds[e]),chosen=new Set(ids),proposed=transformSelection(r.doc,chosen,'move',13,-7),committed=prepareEditorCommit(r.doc,proposed,{kind:'move',segmentIds:ids,a:13,b:-7}).doc,next=inspectMaterialTopology(committed);
 assert.ok(next.ok);assert.equal(next.components.length,6);assert.deepEqual(next.graph.edges_vertices,m.graph.edges_vertices);assert.deepEqual(next.graph.faces_vertices,m.graph.faces_vertices);assert.deepEqual(next.edgeSegmentIds,m.edgeSegmentIds);
 for(let v=0;v<m.graph.vertices_coords.length;v++){const p=m.graph.vertices_coords[v],moved=m.components[2].vertices.includes(v);assert.deepEqual(next.graph.vertices_coords[v],moved?[p[0]+13,p[1]-7]:p);}
 assert.equal(multipleGoreMaterialMatches({...r,doc:committed},c.params),false);assert.deepEqual((committed.metadata!.tessellation as any).source.foldedForm3D,r.source.foldedForm3D);
});

test('actual JSON/FOLD files reopen distinct indexed materials; every ordinary LINE preserves mm coordinates and source FF',()=>{
 const audit:any[]=[];
 for(const c of fixture.cases){const r=prepareTessResult(c.response,c.params),m=inspectMaterialTopology(r.doc);assert.ok(m.ok);
  for(const format of ['json','fold'] as const){const text=exportDocument(r.doc,format).text,file=new URL(`${c.name}.${format==='json'?'zhezhi.json':'fold'}`,out);fs.writeFileSync(file,text);const bytes=fs.readFileSync(file),back=importDocument(bytes.toString(),format).doc,checked=inspectMaterialTopology(back);assert.ok(checked.ok);assert.equal(checked.components.length,c.params.sectors);assert.deepEqual(checked.graph,m.graph);assert.deepEqual(checked.edgeSegmentIds,m.edgeSegmentIds);assert.equal(JSON.stringify((back.metadata!.tessellation as any).source.foldedForm3D),JSON.stringify(c.response.source.foldedForm3D));assert.deepEqual((back.metadata!.tessellation as any).source.independentMaterials,c.response.source.independentMaterials);audit.push({file:file.pathname,sha256:createHash('sha256').update(bytes).digest('hex'),format,materials:checked.components.length,vertices:checked.graph.vertices_coords.length});}
  const file=new URL(`${c.name}.dxf`,out);fs.writeFileSync(file,exportDXF(r.doc).text);const bytes=fs.readFileSync(file),tokens=bytes.toString().trim().split(/\r?\n/),lines:Map<number,string>[]=[];
  for(let i=0;i<tokens.length;i+=2)if(tokens[i]==='0'&&tokens[i+1]==='LINE'){const row=new Map<number,string>();for(i+=2;i<tokens.length&&tokens[i]!=='0';i+=2)row.set(Number(tokens[i]),tokens[i+1]);lines.push(row);i-=2;}
  assert.equal(lines.length,r.doc.segments.length);for(let i=0;i<lines.length;i++){const s=r.doc.segments[i],row=lines[i];assert.equal(row.get(8),DXF_LAYERS[s.assignment].name);for(const [code,n] of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]],[30,0],[31,0]])assert.ok(Number(row.get(code))===n);}
  const scale=(r.doc.metadata!.goreMaterialPlacement as any).millimetresPerSourceUnit,original=r.fold as FoldGraph;for(let i=0;i<m.graph.edges_vertices.length;i++){const [a,b]=m.graph.edges_vertices[i];assert.ok(Math.abs(distance(m.graph.vertices_coords[a],m.graph.vertices_coords[b])-scale*distance(original.vertices_coords[a],original.vertices_coords[b]))<1e-8);}
  audit.push({file:file.pathname,sha256:createHash('sha256').update(bytes).digest('hex'),format:'dxf',ordinaryLines:lines.length,allLineCoordinatesExactlyParsed:true,millimetresPerSourceUnit:scale});
 }
 fs.writeFileSync(new URL('download-audit.json',out),JSON.stringify({verified:true,actualFiles:audit.length,cases:audit,wolframExecuted:false,collisionChecked:false,layerOrderChecked:false},null,2));
});
