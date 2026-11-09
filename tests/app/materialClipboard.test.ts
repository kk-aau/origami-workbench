import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialCutFixture,materialSlitFixture} from '../fixtures/materialModel';
import {copyMaterialSelection,copyWorkbenchSelection,isMaterialClipboard,clipboardSize,pasteMaterialSelection,cutMaterialSelection,type MaterialPasteIntent} from '../../src/app/materialClipboard';
import {pasteDrawingObjects,isDrawingClipboard} from '../../src/app/selectionClipboard';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {setStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {blankDoc,exampleDoc} from '../../src/app/state';
import {editorHistoryReducer,emptyEditorHistory} from '../../src/app/editorHistory';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {computeMaterialFlatGeometry} from '../../src/core/materialFlatGeometry';
import type {Doc,Point} from '../../src/core/types';
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;},source=()=>materialCutFixture().source;
const intent=(doc=source(),offset:Point=[400,-20]):MaterialPasteIntent=>({kind:'material-clipboard-paste',clipboard:copyMaterialSelection(doc,material(doc).edgeSegmentIds),offset,cpOnly:false,splitTarget:false});
const empty=():Doc=>({name:'空目标',paper:{width:300,height:300},segments:[],objects:[]});
test('full original material clipboard preserves exact CP/FF, bank occurrence identity and a snapshot root',()=>{
 const doc=setStartingFace(source(),3),m=material(doc),before=JSON.stringify(doc),clip=copyMaterialSelection(doc,m.edgeSegmentIds),cm=material(clip.doc);assert.deepEqual(cm.graph,m.graph);assert.deepEqual(cm.foldedVertices,computeMaterialFlatGeometry(doc,3).geometry.vertices);assert.equal(cm.startingFace,3);assert.equal(clipboardSize(clip),16);assert.ok(isMaterialClipboard(clip));assert.equal(JSON.stringify(doc),before);doc.segments[0].a[0]+=1;assert.deepEqual(material(clip.doc).graph,m.graph);
});
test('a clipboard extracts one complete piece, auxiliary selections and styles without unrelated project data',()=>{
 const doc=source(),m=material(doc),c=m.components[1];doc.segments=doc.segments.map(s=>({...s,displayColor:'#22aacc'}));doc.segments.push({id:'guide',a:[0,0],b:[200,0],assignment:'A',angle:0});doc.objects=[{id:'text',kind:'text',position:[0,0],text:'source',fontSize:10,color:'#000000'}];doc.metadata!.unrelated={large:'do not copy'};
 const clip=copyMaterialSelection(doc,[...c.edges.map(e=>m.edgeSegmentIds[e]),'guide']),cm=material(clip.doc);assert.equal(cm.components.length,1);assert.equal(clip.doc.segments.length,c.edges.length+1);assert.equal(clip.doc.objects,undefined);assert.deepEqual(Object.keys(clip.doc.metadata!),['materialTopology']);assert.ok(clip.doc.segments.filter(s=>s.assignment!=='A').every(s=>s.displayColor==='#22aacc'));assert.equal(cm.startingFace,0);
});
test('partial, empty, stale and duplicate component selections fail before replacing a clipboard',()=>{
 const doc=source(),ids=material(doc).edgeSegmentIds,before=JSON.stringify(doc);for(const selected of [[],[ids[0]],['missing'],[...ids,ids[0]],[...ids,'missing']])assert.throws(()=>copyMaterialSelection(doc,selected));assert.equal(JSON.stringify(doc),before);
});
test('ordinary and auxiliary-only selections retain geometry clipboard snapshots',()=>{
 const doc=source();doc.segments.push({id:'guide',a:[0,0],b:[200,0],assignment:'A',angle:0});const clip=copyWorkbenchSelection(doc,new Set(['guide']));assert.equal(isMaterialClipboard(clip),false);assert.equal(clipboardSize(clip),1);const ordinary=blankDoc();assert.equal(isMaterialClipboard(copyWorkbenchSelection(ordinary,new Set(ordinary.segments.map(s=>s.id)))),false);
});

test('material plus selected circles is rejected atomically rather than silently dropping circles or topology',()=>{
 const doc=source(),ids=new Set(material(doc).edgeSegmentIds);doc.objects=[{id:'circle',kind:'circle',center:[20,20],radius:5,color:'#225588'}];const before=structuredClone(doc);
 assert.throws(()=>copyWorkbenchSelection(doc,ids,new Set(['circle'])),/完整材料部件与辅助圆不能混合/);assert.deepEqual(doc,before);
 assert.ok(isMaterialClipboard(copyWorkbenchSelection(doc,ids)),'complete components retain the existing topology clipboard');
 const circles=copyWorkbenchSelection(doc,new Set(),new Set(['circle']));assert.ok(!isMaterialClipboard(circles)&&isDrawingClipboard(circles));
 if(isMaterialClipboard(circles))throw Error('circle selection must not copy unrelated material');
 const pasted=prepareEditorCommit(doc,pasteDrawingObjects(doc,circles,[10,10])).doc;assert.deepEqual(material(pasted).graph,material(doc).graph);assert.equal(pasted.objects!.length,2);
});

test('auxiliary strokes and circles copy together inside a material document without copying its topology',()=>{
 const doc=source();doc.segments.push({id:'guide',a:[0,50],b:[100,50],assignment:'A',angle:0});doc.objects=[{id:'circle',kind:'circle',center:[20,20],radius:5,color:'#225588'}];
 const clip=copyWorkbenchSelection(doc,new Set(['guide']),new Set(['circle']));assert.ok(!isMaterialClipboard(clip)&&isDrawingClipboard(clip));if(isMaterialClipboard(clip))throw Error('unexpected material');
 const pasted=prepareEditorCommit(doc,pasteDrawingObjects(doc,clip,[0,10])).doc;assert.deepEqual(material(pasted).graph,material(doc).graph);assert.equal(pasted.objects!.length,2);assert.equal(pasted.segments.length,doc.segments.length+1);
});
test('cross-project material paste retains the whole target and offsets source CP/FF exactly once',()=>{
 const target=setStartingFace(materialSlitFixture().source,4),tm=material(target),req=intent(),cm=material(req.clipboard.doc),before=JSON.stringify(target),r=pasteMaterialSelection(target,req),m=material(r.doc);assert.equal(JSON.stringify(target),before);assert.deepEqual(r.doc.segments.slice(0,target.segments.length),target.segments);assert.deepEqual(m.graph.vertices_coords.slice(0,16),tm.graph.vertices_coords);assert.deepEqual(m.foldedVertices!.slice(0,16),tm.foldedVertices);assert.deepEqual(m.graph.vertices_coords.slice(16),cm.graph.vertices_coords.map(([x,y])=>[x+400,y-20]));assert.deepEqual(m.foldedVertices!.slice(16),cm.foldedVertices!.map(([x,y])=>[x+400,y-20]));assert.equal(m.components.length,4);assert.deepEqual(resolveStartingFace(r.doc,m.graph),{face:4,stale:false});assert.deepEqual(prepareEditorCommit(target,r.doc,req).doc,r.doc);assert.equal(computeFlatFold(r.doc,undefined,{startingFace:4}).layers.status,'solved');
});
test('in-place and repeated material pastes never merge coincident independent pieces or duplicate IDs',()=>{
 const target=source(),req=intent(target,[0,0]),one=pasteMaterialSelection(target,req).doc,two=pasteMaterialSelection(one,req).doc,m=material(two);assert.equal(m.components.length,9);assert.equal(m.graph.edges_vertices.length,48);assert.equal(new Set(two.segments.map(s=>s.id)).size,48);assert.deepEqual(m.graph.vertices_coords.slice(14,28),material(target).graph.vertices_coords);assert.equal(computeFlatFold(two).layers.status,'solved');
});
test('paste IDs also avoid independent target object IDs and retain target settings and annotations',()=>{
 const target=empty(),req=intent();target.metadata={retained:true};target.objects=[{id:req.clipboard.doc.segments[0].id+'::material-paste',kind:'text',position:[1,2],text:'target',fontSize:10,color:'#000000'}];const r=pasteMaterialSelection(target,req);assert.notEqual(r.pastedIds[0],target.objects[0].id);assert.deepEqual(r.doc.objects,target.objects);assert.equal(r.doc.metadata!.retained,true);assert.deepEqual(r.doc.paper,target.paper);
});
test('empty and auxiliary-only ordinary targets adopt source root and preserve source FF placement',()=>{
 const src=setStartingFace(source(),3),req=intent(src),target=empty();target.segments.push({id:'target-guide',a:[0,0],b:[100,0],assignment:'A',angle:0});const r=pasteMaterialSelection(target,req),m=material(r.doc);assert.equal(m.startingFace,3);assert.deepEqual(r.doc.segments[0],target.segments[0]);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('ordinary square target converts with exact original IDs and derives a verified FF rather than assuming identity',()=>{
 const target=blankDoc(),before=JSON.stringify(target),r=pasteMaterialSelection(target,intent()),m=material(r.doc);assert.deepEqual(r.doc.segments.slice(0,4),target.segments);assert.deepEqual(m.graph.vertices_coords.slice(0,4),m.foldedVertices!.slice(0,4));assert.equal(m.components.length,4);assert.ok(r.derivedTargetFF);assert.equal(JSON.stringify(target),before);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('ordinary accordion target needs explicit intersection splitting and preserves all original endpoints and coverage',()=>{
 const target=exampleDoc(),req=intent(),before=JSON.stringify(target);assert.throws(()=>pasteMaterialSelection(target,req),/整理交点/);const r=pasteMaterialSelection(target,{...req,splitTarget:true}),m=material(r.doc);assert.equal(r.targetSegmentsBefore,7);assert.equal(r.targetSegmentsAfter,13);assert.equal(JSON.stringify(target),before);for(const s of target.segments){const ids=r.descendants.get(s.id)!;const pieces=ids.map(id=>r.doc.segments.find(s=>s.id===id)!);assert.deepEqual(pieces[0].a,s.a);assert.deepEqual(pieces.at(-1)!.b,s.b);assert.ok(pieces.every(p=>p.assignment===s.assignment&&p.angle===s.angle));}assert.equal(m.components.length,4);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('duplicate, dangling and moved-near-endpoint ordinary targets do not silently lose or snap source geometry',()=>{
 const req={...intent(),splitTarget:true},duplicate=blankDoc();duplicate.segments.push({...duplicate.segments[0],id:'duplicate'});assert.throws(()=>pasteMaterialSelection(duplicate,req),/重复/);const dangling=blankDoc();dangling.segments.push({id:'dangling',a:[20,20],b:[50,50],assignment:'M',angle:-180});assert.throws(()=>pasteMaterialSelection(dangling,req));const near=blankDoc();near.segments[1].a=[200-1e-7,0];assert.throws(()=>pasteMaterialSelection(near,req));
});
test('mixed absent FF explicitly rejects unless CP-only is chosen; all absent remains absent',()=>{
 const target=source();delete (target.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;const req=intent();assert.throws(()=>pasteMaterialSelection(target,req),/仅粘贴 CP/);const cp=pasteMaterialSelection(target,{...req,cpOnly:true}).doc;assert.equal(material(cp).foldedVertices,undefined);const flat=computeFlatFold(cp);assert.equal(flat.geometry.status,'ready');assert.ok(flat.warnings.some(w=>w.includes('CP根面位置')));const cm=material(cp);for(const c of cm.components){const f=c.faces.includes(cm.startingFace??0)?(cm.startingFace??0):c.faces[0];for(const v of cm.graph.faces_vertices![f])assert.deepEqual(flat.geometry.vertices[v],cm.graph.vertices_coords[v]);}assert.equal(material(cp).foldedVertices,undefined);const noFF=source();delete (noFF.metadata!.materialTopology as {foldedVertices?:Point[]}).foldedVertices;assert.equal(material(pasteMaterialSelection(target,intent(noFF)).doc).foldedVertices,undefined);
});
test('a holed ring and its separate center remain independent in clipboard extraction and cross-project paste',()=>{
 const grid=materialSlitFixture().source,gm=material(grid),cuts=gm.graph.faces_edges![4].filter(e=>gm.graph.edges_assignment[e]!=='B').map(e=>gm.edgeSegmentIds[e]),separated=cutMaterialEdges(grid,{kind:'material-cut',segmentIds:cuts}).doc,sm=material(separated),ring=sm.components.find(c=>c.boundaryLoops.length===2)!,clip=copyMaterialSelection(separated,ring.edges.map(e=>sm.edgeSegmentIds[e]));assert.equal(material(clip.doc).components[0].boundaryLoops.length,2);const r=pasteMaterialSelection(source(),{...intent(),clipboard:clip}),m=material(r.doc);assert.equal(m.components.length,4);assert.equal(m.components.filter(c=>c.boundaryLoops.length===2).length,1);assert.equal(computeFlatFold(r.doc).layers.status,'solved');
});
test('cutting one complete component preserves remaining FF, IDs and a retained indexed root',()=>{
 const doc=setStartingFace(source(),3),m=material(doc),c=m.components.find(c=>!c.faces.includes(3))!,req={kind:'material-clipboard-cut' as const,segmentIds:c.edges.map(e=>m.edgeSegmentIds[e]),lockBoundary:false},r=cutMaterialSelection(doc,req),next=material(r.doc);assert.equal(next.components.length,2);assert.equal(r.rootChanged,false);assert.deepEqual(prepareEditorCommit(doc,r.doc,req).doc,r.doc);const remaining=m.components.filter(v=>v!==c).flatMap(v=>v.vertices).sort((a,b)=>a-b);assert.deepEqual(next.foldedVertices,remaining.map(v=>m.foldedVertices![v]));doc.segments.filter(s=>!req.segmentIds.includes(s.id)).forEach(s=>assert.deepEqual(r.doc.segments.find(v=>v.id===s.id),s));
});
test('cutting the root component migrates to a remaining face, and cutting all leaves only unrelated content',()=>{
 const doc=setStartingFace(source(),3),m=material(doc),c=m.components.find(c=>c.faces.includes(3))!,one=cutMaterialSelection(doc,{kind:'material-clipboard-cut',segmentIds:c.edges.map(e=>m.edgeSegmentIds[e]),lockBoundary:false});assert.equal(one.rootChanged,true);assert.deepEqual(resolveStartingFace(one.doc,material(one.doc).graph),{face:0,stale:false});doc.segments.push({id:'guide',a:[0,0],b:[200,0],assignment:'A',angle:0});doc.objects=[{id:'note',kind:'text',position:[0,0],text:'keep',fontSize:10,color:'#111111'}];doc.metadata!.retained='keep';const req={kind:'material-clipboard-cut' as const,segmentIds:m.edgeSegmentIds,lockBoundary:false},all=cutMaterialSelection(doc,req);assert.equal(all.empty,true);assert.equal(all.doc.metadata!.materialTopology,undefined);assert.equal(all.doc.flatFold,undefined);assert.equal(all.doc.metadata!.retained,'keep');assert.deepEqual(all.doc.objects,doc.objects);assert.deepEqual(all.doc.segments,[doc.segments.at(-1)]);assert.deepEqual(prepareEditorCommit(doc,all.doc,req).doc,all.doc);
});
test('cut protection and partial removal fail atomically, with no material boundary treated as an ordinary line',()=>{
 const doc=source(),before=JSON.stringify(doc),m=material(doc);assert.throws(()=>cutMaterialSelection(doc,{kind:'material-clipboard-cut',segmentIds:m.edgeSegmentIds,lockBoundary:true}),/边界保护/);assert.throws(()=>cutMaterialSelection(doc,{kind:'material-clipboard-cut',segmentIds:[m.edgeSegmentIds[0]],lockBoundary:false}),/完整材料/);assert.equal(JSON.stringify(doc),before);
});
test('malformed snapshots, offsets, choices and forged proposals are rejected by independent replay',()=>{
 const target=source(),req=intent(),before=JSON.stringify(target);for(const bad of [{...req,extra:true},{...req,offset:[0]},{...req,offset:[Infinity,0]},{...req,offset:[1e6,1e6]},{...req,cpOnly:undefined},{...req,splitTarget:undefined},{...req,clipboard:{kind:'material-clipboard',doc:{...req.clipboard.doc,metadata:{}}}},{...req,clipboard:{...req.clipboard,extra:true}}])assert.throws(()=>pasteMaterialSelection(target,bad as MaterialPasteIntent));assert.equal(JSON.stringify(target),before);const r=pasteMaterialSelection(target,req),tampered=structuredClone(r.doc);tampered.name='bad';assert.throws(()=>prepareEditorCommit(target,tampered,req),/独立重放/);assert.throws(()=>prepareEditorCommit(target,r.doc),/替换/);
});
test('pasting material beyond the former crease cap preserves clipboard and target geometry',()=>{
 const target=source(),req=intent();target.segments.push(...Array.from({length:12000-target.segments.length},(_,i)=>({id:'aux-'+i,a:[0,0] as Point,b:[1,0] as Point,assignment:'A' as const,angle:0})));const before=JSON.stringify(target),snapshot=JSON.stringify(req.clipboard),result=pasteMaterialSelection(target,req);assert.equal(result.doc.segments.length,12000+req.clipboard.doc.segments.length);assert.equal(JSON.stringify(target),before);assert.equal(JSON.stringify(req.clipboard),snapshot);assert.ok(material(result.doc));
});
test('actual JSON/FOLD round trips and full undo/redo retain CP/FF and target root for paste and cut',()=>{
 const target=setStartingFace(materialSlitFixture().source,4),req=intent(),r=pasteMaterialSelection(target,req),m=material(r.doc);let history=editorHistoryReducer(emptyEditorHistory(target),{type:'commit',doc:r.doc});history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,target);history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,r.doc);for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(r.doc,format).text,format).doc,lm=material(loaded);assert.deepEqual(lm.graph,m.graph);assert.deepEqual(lm.foldedVertices,m.foldedVertices);assert.equal(resolveStartingFace(loaded,lm.graph).face,4);assert.equal(computeFlatFold(loaded,undefined,{startingFace:4}).layers.status,'solved');}
});
