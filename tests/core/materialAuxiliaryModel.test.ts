import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import {editMaterialAuxiliary,buildMaterialAuxiliary,type MaterialAuxiliaryIntent} from '../../src/core/materialAuxiliary';
import {inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {propertiesModelCase} from '../fixtures/materialPropertiesModel';
import {weakToolMaterial as mat,weakToolSource,weakToolSheet} from '../fixtures/materialWeakTools';
import {editorHistoryReducer,emptyEditorHistory} from '../../src/app/editorHistory';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {reflectMaterialEdge} from '../../src/core/materialReflect';
import {exportDocument,importDocument} from '../../src/core/formats';
import {cutMaterialSelection,pasteMaterialSelection,copyMaterialSelection} from '../../src/app/materialClipboard';
const world=(point:Point)=>({kind:'world' as const,point}),create=(lines=[{key:'line-1',from:world([0,50]),to:world([100,50])}]):MaterialAuxiliaryIntent=>({kind:'material-auxiliary',operation:{kind:'create',lines}}),model=(d:Doc)=>{const c=inspectMaterialCurveModel(d);assert.ok(c.ok,c.ok?'':c.reason);return c;};
test('recorded creation adds only independent auxiliary marks and preserves exact original CP/FF and all IDs',()=>{
 const d=propertiesModelCase('source'),before=JSON.stringify(d),r=create(),saved=editMaterialAuxiliary(d,{...r,parametric:true}),n=saved.doc;assert.ok(model(n));assert.equal(model(n).model.schema,'zhezhi-material-curve-model-v14');assert.deepEqual(mat(n),mat(d));assert.deepEqual(n.segments.filter(s=>s.assignment!=='A'),d.segments);assert.equal(n.segments.at(-1)!.id,'curve-group-2::aux-line-1');assert.deepEqual(prepareEditorCommit(d,n,{...r,parametric:true}).doc,n);assert.equal(JSON.stringify(d),before);
});
test('stable local creation keys survive adding/removing/reordering earlier rows without replacing referenced axes',()=>{
 const d=propertiesModelCase('source'),n=editMaterialAuxiliary(d,{...create([{key:'line-1',from:world([0,50]),to:world([100,50])},{key:'line-2',from:world([0,70]),to:world([100,70])}]),parametric:true}).doc,c=model(n),g=c.model.groups.at(-1)!;if(g.recipe.kind!=='material-auxiliary'||g.recipe.operation.kind!=='create')throw Error('aux');const changed=editMaterialFaces(n,{kind:'material-curve-group-edit',group:g.id,recipe:create([g.recipe.operation.lines[1],{key:'line-3',from:world([0,80]),to:world([100,80])}])}).doc;assert.ok(model(changed));assert.ok(changed.segments.some(s=>s.id===g.id+'::aux-line-2'&&s.a[1]===70));assert.ok(!changed.segments.some(s=>s.id===g.id+'::aux-line-1'));
});
test('material-bound endpoints follow earlier geometry while explicit world points stay fixed',()=>{
 const d=propertiesModelCase('source'),edge=mat(d).edgeSegmentIds.find((_,e)=>mat(d).graph.edges_assignment[e]==='F')!,r:MaterialAuxiliaryIntent={kind:'material-auxiliary',operation:{kind:'create',lines:[{key:'line-1',from:{kind:'material',anchor:{edgeId:edge,fraction:.25}},to:world([100,90])}]}},n=editMaterialAuxiliary(d,{...r,parametric:true}).doc,c=model(n),g=c.model.groups[0],trace=g.recipe;if(trace.kind!=='material-face-trace')throw Error('trace');const changed=editMaterialFaces(n,{kind:'material-curve-group-edit',group:g.id,recipe:{...trace,from:{...trace.from,fraction:.4},to:{...trace.to,fraction:.6}}}).doc,a=changed.segments.find(s=>s.assignment==='A')!;assert.ok(model(changed));assert.notDeepEqual(a.a,n.segments.find(s=>s.assignment==='A')!.a);assert.deepEqual(a.b,[100,90]);
});
test('editing a saved auxiliary axis recomputes later material reflection without altering the source crease',()=>{
 const d=propertiesModelCase('source'),a=editMaterialAuxiliary(d,{...create(),parametric:true}).doc,axis=a.segments.find(s=>s.assignment==='A')!.id,crease=mat(a).edgeSegmentIds.find((_,e)=>mat(a).graph.edges_assignment[e]==='F')!,n=reflectMaterialEdge(a,{kind:'material-edge-reflect',sourceId:crease,axisId:axis,component:'source',fixedSide:'left',cpOnly:false,parametric:true}).doc,c=model(n),g=c.model.groups[1],changed=editMaterialFaces(n,{kind:'material-curve-group-edit',group:g.id,recipe:create([{key:'line-1',from:world([0,60]),to:world([100,60])}])}).doc;assert.ok(model(changed));assert.ok(changed.segments.some(s=>s.assignment==='F'&&s.a[1]===90&&s.b[1]===90));assert.throws(()=>editMaterialFaces(n,{kind:'material-curve-group-remove',group:g.id}));
});
test('explicit auxiliary update/removal preserve paper, styles and source identities; dependent removal rejects',()=>{
 const d=propertiesModelCase('source'),a=editMaterialAuxiliary(d,{...create(),parametric:true}).doc,id=a.segments.find(s=>s.assignment==='A')!.id;a.segments.find(s=>s.id===id)!.displayColor='#123456';const r:MaterialAuxiliaryIntent={kind:'material-auxiliary',operation:{kind:'update',lines:[{id,from:world([0,60]),to:world([100,60])}]}},n=editMaterialAuxiliary(a,{...r,parametric:true}).doc;assert.ok(model(n));assert.equal(n.segments.find(s=>s.id===id)!.displayColor,'#123456');assert.deepEqual(mat(n),mat(a));const removed=editMaterialAuxiliary(n,{kind:'material-auxiliary',operation:{kind:'remove',ids:[id]},parametric:true}).doc;assert.ok(model(removed));assert.ok(!removed.segments.some(s=>s.id===id));assert.deepEqual(mat(removed),mat(n));
});
test('empty material history can create standalone auxiliary recipes and later accept real pasted paper',()=>{
 const d=propertiesModelCase('source'),empty=cutMaterialSelection(d,{kind:'material-clipboard-cut',segmentIds:mat(d).edgeSegmentIds,lockBoundary:false,parametric:true}).doc,a=editMaterialAuxiliary(empty,{...create(),parametric:true}).doc;assert.ok(model(a));assert.equal(a.segments.length,1);const p=pasteMaterialSelection(a,{kind:'material-clipboard-paste',clipboard:copyMaterialSelection(d,mat(d).edgeSegmentIds),offset:[200,0],cpOnly:false,splitTarget:false,parametric:true}).doc;assert.ok(model(p));assert.equal(p.segments.filter(s=>s.assignment==='A').length,1);const blank:Doc={...d,segments:[],metadata:{}};delete blank.flatFold;const standalone=editMaterialAuxiliary(blank,{...create(),parametric:true}).doc;assert.ok(model(standalone));assert.equal(model(standalone).model.base.topology,null);
});
test('the shared face-edit entry supports auxiliary creation in an empty material history',()=>{
 const d=propertiesModelCase('source'),empty=cutMaterialSelection(d,{kind:'material-clipboard-cut',segmentIds:mat(d).edgeSegmentIds,lockBoundary:false,parametric:true}).doc;
 const intent={...create(),parametric:true};
 const viaEntry=editMaterialFaces(empty,intent).doc;
 assert.deepEqual(viaEntry,editMaterialAuxiliary(empty,intent).doc);
 assert.ok(model(viaEntry));assert.equal(viaEntry.segments.length,1);
 assert.deepEqual(prepareEditorCommit(empty,viaEntry,intent).doc,viaEntry);
});
test('FOLD reopens auxiliary identities after all paper was removed and permits a subsequent parameter edit',()=>{
 const d=propertiesModelCase('source'),empty=cutMaterialSelection(d,{kind:'material-clipboard-cut',segmentIds:mat(d).edgeSegmentIds,lockBoundary:false,parametric:true}).doc;
 const standalone:Doc={...empty,metadata:{},segments:[]};
 for(const source of [empty,standalone]){
  const saved=editMaterialAuxiliary(source,{...create(),parametric:true}).doc;
  const back=importDocument(exportDocument(saved,'fold').text,'fold').doc;
  assert.deepEqual(back.segments,saved.segments);assert.deepEqual(model(back).model,model(saved).model);
  const g=model(back).model.groups.at(-1)!;
  const changed=editMaterialFaces(back,{kind:'material-curve-group-edit',group:g.id,recipe:create([{key:'line-1',from:world([0,60]),to:world([100,60])}])}).doc;
  assert.ok(model(changed));assert.deepEqual(changed.segments.at(-1)!.a,[0,60]);
 }
});
test('JSON/FOLD retain auxiliary source bindings and permit reedit without moving material',()=>{
 const d=propertiesModelCase('source'),n=editMaterialAuxiliary(d,{...create(),parametric:true}).doc;for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(n,format).text,format).doc;assert.deepEqual(model(back).model,model(n).model);assert.deepEqual(mat(back),mat(n));const g=model(back).model.groups.at(-1)!;assert.ok(model(editMaterialFaces(back,{kind:'material-curve-group-edit',group:g.id,recipe:create([{key:'line-1',from:world([-20,60]),to:world([120,60])}])}).doc));}
});
test('invalid targets, duplicate keys, degenerate endpoints and forged proposals reject without any mutation',()=>{
 const d=propertiesModelCase('source'),before=JSON.stringify(d);for(const r of [{...create(),parametric:1},{...create(),extra:true},{kind:'material-auxiliary',operation:{kind:'remove',ids:[d.segments[0].id]}},create([{key:'line-1',from:world([1,1]),to:world([1,1])}]),create([{key:'line-1',from:world([NaN,1]),to:world([1,2])}]),create([{key:'line-1',from:world([1,1]),to:world([1,2])},{key:'line-1',from:world([2,2]),to:world([3,3])}])])assert.throws(()=>editMaterialAuxiliary(d,r as never));assert.equal(JSON.stringify(d),before);const pure=buildMaterialAuxiliary(d,create()).doc;pure.paper.width+=1;assert.throws(()=>prepareEditorCommit(d,pure,create()));
});
test('auxiliary marks preserve holes and the identity of coincident weak cut sides',()=>{
 for(const d of [weakToolSheet(true),weakToolSource('cross'),weakToolSource('hole')]){const m=mat(d),id=m.edgeSegmentIds.at(-1)!,r:MaterialAuxiliaryIntent={kind:'material-auxiliary',operation:{kind:'create',lines:[{key:'line-1',from:{kind:'material',anchor:{edgeId:id,fraction:.5}},to:world([-10,-10])}]}},n=editMaterialAuxiliary(d,{...r,parametric:true}).doc,c=model(n);assert.deepEqual(mat(n),m);assert.equal(c.model.groups[0].auxiliaryBinding!.anchors[0]!.edgeId,id);assert.deepEqual(n.segments.filter(s=>s.assignment!=='A'),d.segments);}
});
test('batch limits, duplicate coordinates and stale archives never silently trim geometry or old recipes',()=>{
 const d=propertiesModelCase('source'),lines=Array.from({length:32},(_,i)=>({key:`line-${i+1}`,from:world([0,50]),to:world([100,50])})),n=editMaterialAuxiliary(d,{...create(lines),parametric:true}).doc;assert.ok(model(n));assert.equal(n.segments.filter(s=>s.assignment==='A').length,32);assert.throws(()=>editMaterialAuxiliary(d,{...create([...lines,{...lines[0],key:'line-33'}]),parametric:true}),/1–32/);let full=d;for(let i=0;i<7;i++)full=editMaterialAuxiliary(full,{...create(),parametric:true}).doc;const before=JSON.stringify(full);assert.throws(()=>editMaterialAuxiliary(full,{...create(),parametric:true}),/最多8/);assert.equal(JSON.stringify(full),before);const stale=structuredClone(n);stale.segments.push({id:'outside',a:[1,2],b:[3,4],assignment:'A',angle:0});const fresh=editMaterialAuxiliary(stale,{...create(),parametric:true}).doc;assert.ok(model(fresh));assert.deepEqual((fresh.metadata!.materialCurveArchives as unknown[])[0],n.metadata!.materialCurveModel);assert.ok(fresh.segments.some(s=>s.id==='outside'));
});
test('history and saved target provenance reject missing sources while undo/redo restores the complete auxiliary edit',()=>{
 const d=propertiesModelCase('source'),n=editMaterialAuxiliary(d,{...create(),parametric:true}).doc,id=n.segments.find(s=>s.assignment==='A')!.id,r:MaterialAuxiliaryIntent={kind:'material-auxiliary',operation:{kind:'update',lines:[{id,from:world([10,60]),to:world([110,60])}]}},changed=editMaterialAuxiliary(n,{...r,parametric:true}).doc;let h=editorHistoryReducer(emptyEditorHistory(n),{type:'commit',doc:changed});h=editorHistoryReducer(h,{type:'undo'});assert.deepEqual(h.present,n);h=editorHistoryReducer(h,{type:'redo'});assert.deepEqual(h.present,changed);const forged=structuredClone(changed);(forged.metadata!.materialCurveModel as any).groups.at(-1).auxiliaryBinding.targets[0].source='missing';assert.equal(inspectMaterialCurveModel(forged).ok,false);
});
