import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import {copyMaterialSelection,pasteMaterialSelection,cutMaterialSelection,buildMaterialClipboardPaste,type MaterialPasteIntent} from '../../src/app/materialClipboard';
import {inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {exportDocument,importDocument} from '../../src/core/formats';
import {blankDoc,exampleDoc} from '../../src/app/state';
import {weakToolSheet,weakToolSource,weakToolMaterial as mat,weakToolLine} from '../fixtures/materialWeakTools';
import {faceIdentityRecipe} from '../fixtures/materialFaceIdentity';
import {exportDXF} from '../../src/core/dxf';
import {editorHistoryReducer,emptyEditorHistory} from '../../src/app/editorHistory';
const empty=():Doc=>({name:'空目标',paper:{width:300,height:300},segments:[],objects:[],metadata:{keep:true}});
const model=(d:Doc)=>{const r=inspectMaterialCurveModel(d);assert.ok(r.ok,r.ok?'':r.reason);return r;};
const req=(source=weakToolSheet(),offset:Point=[200,20]):MaterialPasteIntent=>({kind:'material-clipboard-paste',clipboard:copyMaterialSelection(source,mat(source).edgeSegmentIds),offset,cpOnly:false,splitTarget:false,parametric:true});
const change=(d:Doc,i:number,recipe:MaterialPasteIntent)=>{const {parametric:_,...r}=recipe;return editMaterialFaces(d,{kind:'material-curve-group-edit',group:model(d).model.groups[i].id,recipe:r}).doc;};
test('saved paste keeps source snapshot independent and CP/FF equal to the existing geometry method',()=>{
 const target=weakToolSheet(),r=req(),{parametric:_,...raw}=r,before=JSON.stringify(target),out=pasteMaterialSelection(target,r),pure=buildMaterialClipboardPaste(target,raw),m=mat(out.doc),p=mat(pure.doc);assert.deepEqual(m.graph,p.graph);assert.deepEqual(m.foldedVertices,p.foldedVertices);assert.deepEqual(out.doc.segments.map(({id:_,...s})=>s),pure.doc.segments.map(({id:_,...s})=>s));assert.equal(JSON.stringify(target),before);assert.deepEqual(prepareEditorCommit(target,out.doc,r).doc,out.doc);const saved=model(out.doc);assert.equal(saved.model.schema,'zhezhi-material-curve-model-v9');assert.deepEqual(saved.origins,[[0],[65536]]);r.clipboard.doc.segments[0].a[0]+=2;assert.ok(model(out.doc));
});
test('empty, auxiliary-only and ordinary targets retain their exact base and support changed offsets and paste removal',()=>{
 for(const target of [empty(),{...empty(),segments:[{id:'guide',a:[0,0] as Point,b:[10,0] as Point,assignment:'A' as const,angle:0}]},blankDoc()]){
  const r=req(),out=pasteMaterialSelection(target,r),checked=model(out.doc);assert.equal(checked.model.base.topology,null);const moved=change(out.doc,0,{...r,offset:[230,-15]});assert.deepEqual(mat(moved).graph.vertices_coords.slice(-4),mat(r.clipboard.doc).graph.vertices_coords.map(([x,y])=>[x+230,y-15]));assert.ok(model(moved));const restored=editMaterialFaces(moved,{kind:'material-curve-group-remove',group:checked.model.groups[0].id}).doc;assert.deepEqual(restored.segments,target.segments);assert.equal(restored.metadata?.materialTopology,undefined);assert.ok(model(restored));
 }
});
test('ordinary intersections require an explicit split choice, preserve endpoints, and can be edited after paste',()=>{
 const target=exampleDoc(),r=req(),before=JSON.stringify(target);assert.throws(()=>pasteMaterialSelection(target,r));const out=pasteMaterialSelection(target,{...r,splitTarget:true});assert.equal(out.targetSegmentsBefore,7);assert.equal(out.targetSegmentsAfter,13);assert.equal(JSON.stringify(target),before);assert.ok(model(out.doc));const edited=change(out.doc,0,{...r,splitTarget:true,offset:[300,30]});assert.deepEqual(edited.segments.slice(0,13),out.doc.segments.slice(0,13));assert.ok(model(edited));
});
test('later imported-face subdivision follows paste movement without borrowing target-face ancestry',()=>{
 const r=req(),p=pasteMaterialSelection(weakToolSheet(),r).doc,sub=editMaterialFaces(p,{...faceIdentityRecipe(p,1),parametric:true}).doc,before=mat(sub),edited=change(sub,0,{...r,offset:[300,-20]}),after=mat(edited);assert.deepEqual(after.graph.vertices_coords.slice(0,4),before.graph.vertices_coords.slice(0,4));assert.deepEqual(after.graph.vertices_coords.slice(4),before.graph.vertices_coords.slice(4).map(([x,y])=>[x+100,y-40]));assert.deepEqual(model(edited).origins,[[0],[65536],[65536]]);assert.throws(()=>editMaterialFaces(sub,{kind:'material-curve-group-remove',group:model(sub).model.groups[0].id}),/来源|依赖|不存在/);
});
test('paste after an existing face operation preserves original lineage and edits replay both target and imported children',()=>{
 const target=editMaterialFaces(weakToolSheet(),{...faceIdentityRecipe(weakToolSheet()),parametric:true}).doc,r=req(),p=pasteMaterialSelection(target,r).doc,sub=editMaterialFaces(p,{...faceIdentityRecipe(p,0),parametric:true}).doc,edited=change(sub,1,{...r,offset:[250,30]});assert.ok(model(edited));assert.deepEqual(mat(edited).graph.vertices_coords.slice(0,6),mat(sub).graph.vertices_coords.slice(0,6));assert.deepEqual(model(edited).origins.slice(0,2),[[0],[0]]);
});
test('curves and transforms on imported material retain distinct origins and v16 through later positioning copy',()=>{
 const r=req(),p=pasteMaterialSelection(weakToolSheet(),r).doc,curve={...weakToolLine([220,40],[260,40],'F',false),face:1,fixedPoint:[210,30] as Point},c=editMaterialFaces(p,curve).doc,t=editMaterialFaces(c,{kind:'material-transform',components:[1],operation:{kind:'move',a:10,b:5},parametric:true}).doc;assert.ok(model(t));assert.equal(model(t).model.groups[1].baseFace,65536);const cpy=editMaterialFaces(t,{kind:'material-construction-copy',segmentIds:mat(t).components[1].edges.map(e=>mat(t).edgeSegmentIds[e]),transform:{kind:'translate',from:[0,0],to:[200,0]},parametric:true}).doc;assert.equal(model(cpy).model.schema,'zhezhi-material-curve-model-v16');assert.equal(mat(cpy).components.length,3);
});
test('cut follows full component selection and a changed earlier paste rather than deleting target material',()=>{
 const r=req(),p=pasteMaterialSelection(weakToolSheet(),r).doc,m=mat(p),cutReq={kind:'material-clipboard-cut' as const,segmentIds:m.components[1].edges.map(e=>m.edgeSegmentIds[e]),lockBoundary:false,parametric:true},cut=cutMaterialSelection(p,cutReq);assert.equal(mat(cut.doc).components.length,1);assert.deepEqual(mat(cut.doc).graph,mat(weakToolSheet()).graph);assert.ok(model(cut.doc));assert.deepEqual(prepareEditorCommit(p,cut.doc,cutReq).doc,cut.doc);const changed=change(cut.doc,0,{...r,offset:[400,40]});assert.deepEqual(mat(changed).graph,mat(cut.doc).graph);assert.ok(model(changed));
});
test('cut all retains a valid empty history, restores through deletion and accepts another independent paste',()=>{
 const p=pasteMaterialSelection(empty(),req()).doc,cut=cutMaterialSelection(p,{kind:'material-clipboard-cut',segmentIds:mat(p).edgeSegmentIds,lockBoundary:false,parametric:true}).doc;assert.equal(cut.segments.length,0);assert.equal(cut.metadata?.materialTopology,undefined);assert.equal(model(cut).model.groups.length,2);const restored=editMaterialFaces(cut,{kind:'material-curve-group-remove',group:model(cut).model.groups[1].id}).doc;assert.deepEqual(mat(restored).graph,mat(p).graph);const again=pasteMaterialSelection(cut,req(weakToolSheet(true),[350,0])).doc;assert.equal(model(again).model.groups.length,3);assert.deepEqual(model(again).origins,[[196608]]);const chord=editMaterialFaces(again,{...weakToolLine([350,30],[450,30],'F',false),fixedPoint:[360,10]}).doc;assert.ok(model(chord));
});
test('cutting root and auxiliary selections keeps surviving pose and does not resurrect removed auxiliaries',()=>{
 const target=weakToolSheet();target.segments.push({id:'guide',a:[0,0],b:[10,0],assignment:'A',angle:0});const p=pasteMaterialSelection(target,req()).doc,m=mat(p),cut=cutMaterialSelection(p,{kind:'material-clipboard-cut',segmentIds:[...m.components[0].edges.map(e=>m.edgeSegmentIds[e]),'guide'],lockBoundary:false,parametric:true});assert.equal(cut.rootChanged,true);assert.equal(cut.doc.segments.some(s=>s.id==='guide'),false);assert.deepEqual(mat(cut.doc).foldedVertices,mat(req().clipboard.doc).foldedVertices!.map(([x,y])=>[x+200,y+20]));assert.ok(model(cut.doc));
});
test('holed and weak-bank sources replay without welding coincident material identities',()=>{
 for(const source of [weakToolSheet(true),weakToolSource('boundary')]){const r={...req(source,[0,0]),cpOnly:true},p=pasteMaterialSelection(source,r).doc,c=model(p);assert.equal(mat(p).components.length,2);assert.ok(c.origins.some(row=>row[0]>=65536));const moved=change(p,0,{...r,offset:[200,0]});assert.deepEqual(mat(moved).graph.faces_holes,mat(p).graph.faces_holes);assert.ok(model(moved));}
});
test('JSON/FOLD and undo/redo retain empty and nonempty recipe stacks while ordinary DXF remains exact LINE output',()=>{
 const p=pasteMaterialSelection(weakToolSheet(),req()).doc,cut=cutMaterialSelection(p,{kind:'material-clipboard-cut',segmentIds:mat(p).edgeSegmentIds,lockBoundary:false,parametric:true}).doc;
 for(const d of [p,cut])for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(d,format).text,format).doc;assert.ok(model(loaded));assert.deepEqual(model(loaded).model,model(d).model);assert.equal(exportDXF(loaded).text,exportDXF(d).text);}
 let h=editorHistoryReducer(emptyEditorHistory(p),{type:'commit',doc:cut});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,p);h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,cut);
});
test('malformed flags, partial cuts, altered versions and forged origins reject atomically',()=>{
 const target=weakToolSheet(),before=JSON.stringify(target),r=req();assert.throws(()=>pasteMaterialSelection(target,{...r,parametric:1} as unknown as MaterialPasteIntent));assert.throws(()=>cutMaterialSelection(target,{kind:'material-clipboard-cut',segmentIds:[mat(target).edgeSegmentIds[0]],lockBoundary:false,parametric:true}));assert.throws(()=>cutMaterialSelection(target,{kind:'material-clipboard-cut',segmentIds:mat(target).edgeSegmentIds,lockBoundary:true,parametric:true}));assert.equal(JSON.stringify(target),before);const p=pasteMaterialSelection(target,r).doc;for(const mutate of [(d:Doc)=>{(d.metadata!.materialCurveModel as {schema:string}).schema='zhezhi-material-curve-model-v8';},(d:Doc)=>{(d.metadata!.materialCurveModel as {groups:{baseFace:number}[]}).groups[0].baseFace=0;}]){const bad=structuredClone(p);mutate(bad);assert.equal(inspectMaterialCurveModel(bad).ok,false);}assert.ok(model(p));
});
test('editing a cut selection removes selected auxiliaries in both document and descendant map',()=>{
 const target=weakToolSheet();target.segments.push({id:'guide',a:[1,2],b:[3,4],assignment:'A',angle:0});const p=pasteMaterialSelection(target,req()).doc,m=mat(p),one=cutMaterialSelection(p,{kind:'material-clipboard-cut',segmentIds:m.components[1].edges.map(e=>m.edgeSegmentIds[e]),lockBoundary:false,parametric:true}).doc,c=model(one),r=c.model.groups[1].recipe;assert.equal(r.kind,'material-clipboard-cut');if(r.kind!=='material-clipboard-cut')return;const edited=editMaterialFaces(one,{kind:'material-curve-group-edit',group:c.model.groups[1].id,recipe:{...r,segmentIds:[...r.segmentIds,'guide']}});assert.deepEqual(edited.descendants.get('guide'),[]);assert.ok(!edited.doc.segments.some(s=>s.id==='guide'));assert.ok(model(edited.doc));
});
test('capacity and stale-model archival preserve previous work and reject without truncation',()=>{
 const r=req(),p=pasteMaterialSelection(weakToolSheet(),r).doc,stale=structuredClone(p);stale.segments.push({id:'external',a:[1,2],b:[3,4],assignment:'A',angle:0});const archived=pasteMaterialSelection(stale,r).doc;assert.deepEqual((archived.metadata!.materialCurveArchives as unknown[])[0],p.metadata!.materialCurveModel);assert.ok(archived.segments.some(s=>s.id==='external'));assert.equal(model(archived).model.groups.length,1);let full=p;for(let i=1;i<8;i++)full=pasteMaterialSelection(full,{...r,offset:[i*200+200,20]}).doc;const before=JSON.stringify(full);assert.throws(()=>pasteMaterialSelection(full,r),/最多8/);assert.equal(JSON.stringify(full),before);assert.equal(model(full).model.groups.length,8);
});
