import test from 'node:test';
import assert from 'node:assert/strict';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {inspectMaterialCurveModel,editMaterialCurveModel} from '../../src/core/materialCurveModel';
import {materialDoc,materialSlitFixture} from '../fixtures/materialModel';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import type {MaterialCurveIntent} from '../../src/core/materialCurves';
import {sampleMaterialCurves} from '../../src/core/materialCurves';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {importDocument,exportDocument} from '../../src/core/formats';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Doc,Point} from '../../src/core/types';
const base=()=>{const p:Point[]=[[0,0],[100,0],[100,100],[0,100]],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0]];return materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3]],[[0,1,2,3]]),p);};
const recipe=(radius=15,center:Point=[50,50]):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves:[{kind:'ellipse',center,radii:[radius,radius],rotation:13,assignment:'F'}],deviation:1,fixedPoint:[10,10],cpOnly:false,scope:'component'});
const mat=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const model=(doc:Doc)=>{const m=inspectMaterialCurveModel(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
test('saved curve recipes rebuild changed radii and sampling instead of accumulating obsolete edges',()=>{
 const source=base(),old=mat(source),one=editMaterialFaces(source,recipe()).doc,id=model(one).model.groups[0].id;
 for(const radius of [25,10,22]){const intent={kind:'material-curve-group-edit' as const,group:id,recipe:recipe(radius)},r=editMaterialCurveModel(one,intent),m=mat(r.doc),direct=editMaterialFaces(source,recipe(radius));assert.deepEqual(m.graph,mat(direct.doc).graph);assert.deepEqual(m.foldedVertices,mat(direct.doc).foldedVertices);assert.equal(m.graph.edges_vertices.length,4+sampleMaterialCurves(recipe(radius).curves,1).graph.edges.length);assert.deepEqual(m.graph.vertices_coords.slice(0,4),old.graph.vertices_coords);assert.equal(model(r.doc).model.groups.length,1);assert.deepEqual(prepareEditorCommit(one,r.doc,intent).doc,r.doc);assert.equal(computeFlatFold(r.doc).layers.status,'solved');}
});
test('editing an earlier group replays later groups against base ancestry without changing their recipes or IDs',()=>{
 const source=base(),first=editMaterialFaces(source,recipe(22,[45,50])).doc,secondRecipe=recipe(12,[68,50]),two=editMaterialFaces(first,secondRecipe).doc,checked=model(two),ids=checked.model.groups.map(g=>g.id),r=editMaterialCurveModel(two,{kind:'material-curve-group-edit',group:ids[0],recipe:recipe(28,[40,50])});
 assert.equal(model(r.doc).model.groups.length,2);assert.deepEqual(model(r.doc).model.groups.map(g=>g.id),ids);assert.deepEqual(model(r.doc).model.groups[1].recipe.curves,secondRecipe.curves);assert.ok(r.doc.segments.some(s=>s.id.startsWith(ids[1]+'::')));assert.equal(mat(r.doc).components.length,1);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
 const without=editMaterialCurveModel(r.doc,{kind:'material-curve-group-remove',group:ids[0]}).doc;assert.equal(model(without).model.groups.length,1);assert.deepEqual(mat(without).graph,mat(editMaterialFaces(source,secondRecipe).doc).graph);const empty=editMaterialCurveModel(without,{kind:'material-curve-group-remove',group:ids[1]}).doc;assert.deepEqual(mat(empty).graph,mat(source).graph);assert.deepEqual(mat(empty).foldedVertices,mat(source).foldedVertices);assert.equal(model(empty).model.groups.length,0);
});
test('JSON/FOLD reopening retains a valid model and permits a new independent parameter rebuild',()=>{
 const doc=editMaterialFaces(base(),recipe()).doc,id=model(doc).model.groups[0].id;
 for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(doc,format).text,format).doc;assert.ok(model(back));const r=editMaterialCurveModel(back,{kind:'material-curve-group-edit',group:id,recipe:recipe(25)});assert.equal(model(r.doc).model.groups[0].recipe.curves[0].kind,'ellipse');assert.equal(computeFlatFold(r.doc).layers.status,'solved');}
});
test('parameter replay retains conservative unsupported layers for unprovable thin faces',()=>{
 const req=(x:number,r:number):MaterialCurveIntent=>({...recipe(r,[x,50]),curves:[{kind:'ellipse',center:[x,50],radii:[r,15],rotation:13,assignment:'F'}]});
 const first=editMaterialFaces(base(),req(45,28)).doc,two=editMaterialFaces(first,req(70,12)).doc,id=model(two).model.groups[1].id;
 const good=editMaterialCurveModel(two,{kind:'material-curve-group-edit',group:id,recipe:req(70,13)}).doc;assert.equal(computeFlatFold(good).layers.status,'solved');
 const thin=editMaterialCurveModel(two,{kind:'material-curve-group-edit',group:id,recipe:req(70,14)}).doc;assert.ok(model(thin));const r=computeFlatFold(thin);assert.equal(r.layers.status,'unsupported');assert.match(r.layers.message,/过薄辅助片/);assert.equal(computeFlatFold(two).layers.status,'solved');
});
test('eight-group capacity rejects additions atomically and removal preserves monotonic group identities',()=>{
 let doc=base();for(let i=0;i<8;i++)doc=editMaterialFaces(doc,recipe(3,[20+(i%4)*20,30+Math.floor(i/4)*40])).doc;
 const m=model(doc),before=JSON.stringify(doc);assert.equal(m.model.groups.length,8);assert.throws(()=>editMaterialFaces(doc,recipe(3,[10,80])),/最多8/);assert.equal(JSON.stringify(doc),before);
 const deleted=editMaterialCurveModel(doc,{kind:'material-curve-group-remove',group:m.model.groups[0].id}).doc,next=editMaterialFaces(deleted,recipe(3,[10,80])).doc;assert.equal(model(next).model.groups.at(-1)!.id,'curve-group-9');assert.equal(model(next).model.groups.length,8);
 const archives=structuredClone(doc);archives.metadata!.materialCurveArchives=Array.from({length:8},()=>structuredClone(m.model));const archivedBefore=JSON.stringify(archives);assert.throws(()=>editMaterialCurveModel(archives,{kind:'material-curves-rebase'}),/超过8/);assert.equal(JSON.stringify(archives),archivedBefore);
});
test('current auxiliary drawings, annotations, paper/display metadata and names survive reconstruction',()=>{
 const doc=editMaterialFaces(base(),recipe()).doc,id=model(doc).model.groups[0].id;doc.name='保留当前名称';doc.segments.push({id:'aux-after',a:[4,7],b:[70,90],assignment:'A',angle:null,displayColor:'#765432'});doc.metadata!.customNote={text:'后续标注'};doc.paper.width=150;
 assert.ok(model(doc));const r=editMaterialCurveModel(doc,{kind:'material-curve-group-edit',group:id,recipe:recipe(23)}).doc;assert.equal(r.name,doc.name);assert.deepEqual(r.paper,doc.paper);assert.deepEqual(r.metadata!.customNote,doc.metadata!.customNote);assert.deepEqual(r.segments.find(s=>s.id==='aux-after'),doc.segments.at(-1));
});
test('manual material edits invalidate replay; explicit rebasing preserves changed geometry and archives old recipes',()=>{
 const source=editMaterialFaces(base(),recipe()).doc,id=model(source).model.groups[0].id,manual=structuredClone(source),m=manual.metadata!.materialTopology as any;for(const p of m.graph.vertices_coords)p[0]+=7;for(const p of m.foldedVertices)p[0]+=7;for(const s of manual.segments){s.a[0]+=7;s.b[0]+=7;}if(manual.flatFold)for(const p of manual.flatFold.startingFace)p[0]+=7;mat(manual);const before=JSON.stringify(manual);assert.equal(inspectMaterialCurveModel(manual).ok,false);assert.throws(()=>editMaterialCurveModel(manual,{kind:'material-curve-group-edit',group:id,recipe:recipe(23)}),/组外修改/);assert.equal(JSON.stringify(manual),before);
 const r=editMaterialCurveModel(manual,{kind:'material-curves-rebase'});assert.deepEqual(mat(r.doc),mat(manual));assert.equal((r.doc.metadata!.materialCurveArchives as unknown[]).length,1);assert.equal(model(r.doc).model.groups.length,0);const appended=editMaterialFaces(r.doc,recipe(8,[30,30])).doc;assert.equal(model(appended).model.groups.length,1);assert.ok(appended.metadata!.materialCurveArchives);
});
test('snapshots, recipes and actual proposals are independently verified; malformed or forged data reject atomically',()=>{
 const doc=editMaterialFaces(base(),recipe()).doc,before=JSON.stringify(doc),id=model(doc).model.groups[0].id;
 for(const mutate of [(d:any)=>d.metadata.materialCurveModel.applied.segments[0].a[0]=3,(d:any)=>d.metadata.materialCurveModel.base.topology.graph.vertices_coords[0][0]=4,(d:any)=>d.metadata.materialCurveModel.groups[0].recipe.deviation=NaN,(d:any)=>d.metadata.materialCurveModel.groups[0].baseFace=999,(d:any)=>d.metadata.materialCurveModel.groups[0].recipe.face=999,(d:any)=>d.metadata.materialCurveModel.nextId=1,(d:any)=>d.metadata.materialCurveModel.extra=true]){const bad=structuredClone(doc);mutate(bad);assert.equal(inspectMaterialCurveModel(bad).ok,false);}
 const r=editMaterialCurveModel(doc,{kind:'material-curve-group-edit',group:id,recipe:recipe(24)}),forged=structuredClone(r.doc);forged.segments.at(-1)!.a[0]+=.01;assert.throws(()=>prepareEditorCommit(doc,forged,{kind:'material-curve-group-edit',group:id,recipe:recipe(24)}));assert.equal(JSON.stringify(doc),before);
});
test('cross-face and slit groups preserve bank identities and may switch explicitly between CP-only and verified FF',()=>{
 const {source}=materialSlitFixture(),req=recipe(40,[150,95]);req.curves[0]={kind:'ellipse',center:[150,95],radii:[45,35],rotation:13,assignment:'F'};const first=editMaterialFaces(source,req).doc,id=model(first).model.groups[0].id,next=structuredClone(req);next.curves[0]={...next.curves[0],kind:'ellipse',center:[150,95],radii:[42,32],rotation:25,assignment:'F'};const r=editMaterialCurveModel(first,{kind:'material-curve-group-edit',group:id,recipe:next});assert.equal(mat(r.doc).components.length,mat(source).components.length);assert.deepEqual(mat(r.doc).foldedVertices!.slice(0,mat(source).graph.vertices_coords.length),mat(source).foldedVertices);
 const cp={...next,cpOnly:true};cp.curves=cp.curves.map(c=>({...c,assignment:'M'}));const c=editMaterialCurveModel(r.doc,{kind:'material-curve-group-edit',group:id,recipe:cp});assert.equal(mat(c.doc).foldedVertices,undefined);assert.ok(model(c.doc));const restored=editMaterialCurveModel(c.doc,{kind:'material-curve-group-edit',group:id,recipe:next});assert.ok(mat(restored.doc).foldedVertices);assert.equal(computeFlatFold(restored.doc).layers.status,'solved');
});
