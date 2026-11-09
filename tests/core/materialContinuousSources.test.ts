import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point} from '../../src/core/types';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {materialMix,materialCanonical,type MaterialFaceAnchor} from '../../src/core/materialFaceCommon';
import {editMaterialCurveModel,inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
import {sampleMaterialCurves,buildMaterialCurveGeometry,type MaterialCurve,type MaterialCurveIntent} from '../../src/core/materialCurves';
import {bindMaterialAnchor,resolveMaterialAnchor,type MaterialAnchorStage} from '../../src/core/materialRecipeAnchors';
import type {MaterialCurveAnchorBinding} from '../../src/core/materialCurveSources';
import {buildMaterialComponentTransform,transformMaterialComponents} from '../../src/core/materialComponentTransform';
import {editMaterialAuxiliary,type MaterialAuxiliaryIntent} from '../../src/core/materialAuxiliary';
import {exportDocument,importDocument} from '../../src/core/formats';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {weakToolMaterial as mat,weakToolSheet,weakToolLine} from '../fixtures/materialWeakTools';
import {materialDoc,materialSlitFixture} from '../fixtures/materialModel';

const model=(doc:Doc)=>{const c=inspectMaterialCurveModel(doc);assert.ok(c.ok,c.ok?'':c.reason);return c;};
const ellipse=(center:Point=[50,50],radii:Point=[23,17],rotation=11):MaterialCurve=>({kind:'ellipse',center,radii,rotation,assignment:'F'});
const request=(curves:MaterialCurve[]=[ellipse()],deviation=1):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves,deviation,fixedPoint:[5,5],cpOnly:false,scope:'component'});
const sourceRecipe=(doc:Doc)=>model(doc).model.groups[0].recipe as MaterialCurveIntent;
const sourceId=(doc:Doc)=>model(doc).model.groups[0].id;
const curveRef=(doc:Doc,index=0)=>{const binding=model(doc).model.groups[1].auxiliaryBinding!.anchors[index];assert.ok(binding&&'curve'in binding);return binding as MaterialCurveAnchorBinding;};
const pointAt=(doc:Doc,anchor:MaterialFaceAnchor):Point=>{const m=mat(doc),e=m.edgeSegmentIds.indexOf(anchor.edgeId);assert.ok(e>=0);const [a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]);return anchor.fraction===0?[...a]:anchor.fraction===1?[...b]:materialMix(a,b,anchor.fraction);};
const close=(actual:Point,expected:Point,tolerance=1e-10)=>assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<=tolerance,`${actual} != ${expected}`);
function expectedPoint(recipe:MaterialCurveIntent,ref:MaterialCurveAnchorBinding):Point{
 const sampled=sampleMaterialCurves(recipe.curves,recipe.deviation),index=recipe.curveIds!.indexOf(ref.curve.identity),edge=sampled.curveIntervals.findIndex(interval=>{const match='nodes'in ref.curve?interval.nodes?.[0]===ref.curve.nodes[0]&&interval.nodes?.[1]===ref.curve.nodes[1]:interval.segment===ref.curve.segment;return interval.curve===index&&match&&ref.parameter>=interval.from&&ref.parameter<=interval.to;});assert.ok(edge>=0);
 const interval=sampled.curveIntervals[edge],[a,b]=sampled.graph.edges[edge].map(v=>sampled.graph.vertices[v]);return ref.parameter===interval.from?[...a]:ref.parameter===interval.to?[...b]:materialMix(a,b,(ref.parameter-interval.from)/(interval.to-interval.from));
}
function auxiliary(doc:Doc,from:MaterialFaceAnchor,to:Point=[95,5]):Doc{
 const intent:MaterialAuxiliaryIntent={kind:'material-auxiliary',operation:{kind:'create',lines:[{key:'line-1',from:{kind:'material',anchor:from},to:{kind:'world',point:to}}]},parametric:true};return editMaterialAuxiliary(doc,intent).doc;
}
const auxiliaryStart=(doc:Doc)=>doc.segments.find(s=>s.assignment==='A'&&s.id.endsWith('::aux-line-1'))!.a;
const change=(doc:Doc,recipe:MaterialCurveIntent)=>editMaterialCurveModel(doc,{kind:'material-curve-group-edit',group:sourceId(doc),recipe}).doc;

test('ellipse endpoints follow persistent analytic parameter through finer/coarser CP sampling and deformation',()=>{
 const original=weakToolSheet(),first=editMaterialFaces(original,request()),both=auxiliary(first.doc,{edgeId:first.insertedIds![3],fraction:.37}),ref=curveRef(both),coarse=sampleMaterialCurves(sourceRecipe(both).curves,1).graph.edges.length,before=JSON.stringify(both);
 assert.equal(ref.curve.identity,'curve-1');assert.equal(Object.hasOwn(ref,'edgeId'),false);assert.equal(Object.hasOwn(ref,'edgeCount'),false);
 for(const deviation of [.25,3]){
  const recipe={...sourceRecipe(both),deviation,curves:[ellipse([54,47],[26,19],-19)]},next=change(both,recipe),expected=expectedPoint(recipe,ref),count=sampleMaterialCurves(recipe.curves,deviation).graph.edges.length;
  assert.notEqual(count,coarse);close(auxiliaryStart(next),expected);assert.deepEqual(curveRef(next),ref);assert.deepEqual(mat(next).graph.vertices_coords.slice(0,4),mat(original).graph.vertices_coords);assert.deepEqual(next.paper,both.paper);
  const t=ref.parameter*2*Math.PI,a=-19*Math.PI/180,exact:Point=[54+26*Math.cos(t)*Math.cos(a)-19*Math.sin(t)*Math.sin(a),47+26*Math.cos(t)*Math.sin(a)+19*Math.sin(t)*Math.cos(a)];assert.ok(Math.hypot(expected[0]-exact[0],expected[1]-exact[1])<=deviation+1e-10);
  const intent={kind:'material-curve-group-edit' as const,group:sourceId(both),recipe};assert.deepEqual(prepareEditorCommit(both,next,intent).doc,next);
 }
 assert.equal(JSON.stringify(both),before);
});

test('Bezier endpoints retain the original input segment and local parameter after adaptive subdivision changes',()=>{
 const bezier:MaterialCurve={kind:'bezier-path',assignment:'F',nodes:[{point:[5,30],incoming:[5,30],outgoing:[15,10]},{point:[40,55],incoming:[30,70],outgoing:[55,75]},{point:[95,35],incoming:[80,15],outgoing:[95,35]}]},req=request([bezier],1),first=editMaterialFaces(weakToolSheet(),req),sampled=sampleMaterialCurves(req.curves,req.deviation),edge=sampled.curveIntervals.findIndex(interval=>interval.segment===1),both=auxiliary(first.doc,{edgeId:first.insertedIds![edge],fraction:.41}),ref=curveRef(both),recipe=structuredClone(sourceRecipe(both));
 assert.ok('nodes'in ref.curve);if(!('nodes'in ref.curve))return;assert.deepEqual(ref.curve.nodes,['node-2','node-3']);assert.equal(Object.hasOwn(ref.curve,'parts'),false);recipe.deviation=.15;const curve=recipe.curves[0];assert.notEqual(curve.kind,'ellipse');if(curve.kind==='ellipse')return;curve.nodes[1].outgoing=[58,80];curve.nodes[2].incoming=[76,9];
 const next=change(both,recipe);assert.notEqual(sampleMaterialCurves(recipe.curves,recipe.deviation).graph.edges.length,sampled.graph.edges.length);close(auxiliaryStart(next),expectedPoint(recipe,ref));assert.deepEqual(curveRef(next),ref);
 const sampledNext=sampleMaterialCurves(recipe.curves,recipe.deviation);assert.ok(sampledNext.maximumError<=recipe.deviation);
 const invalid=structuredClone(recipe);if(invalid.curves[0].kind==='ellipse')return;invalid.curves[0].nodes.splice(2,0,{point:[60,40],incoming:[55,35],outgoing:[65,45]});invalid.curves[0].nodeIds!.splice(2,0,'node-4');const before=JSON.stringify(both);assert.throws(()=>change(both,invalid),/来源|输入|参数/);assert.equal(JSON.stringify(both),before);
 const reordered=structuredClone(sourceRecipe(both));if(reordered.curves[0].kind==='ellipse')return;reordered.curves[0].nodes.reverse();delete reordered.curves[0].nodeIds;assert.throws(()=>change(both,reordered),/持久节点来源编号/);assert.equal(JSON.stringify(both),before);
});

test('Bezier parameters explicitly denote the discrete CP position and do not claim an analytic point-error bound',()=>{
 const req=weakToolLine([0,50],[100,50],'F',false),first=editMaterialFaces(weakToolSheet(),req),both=auxiliary(first.doc,{edgeId:first.insertedIds![0],fraction:.2}),ref=curveRef(both),sampled=sampleMaterialCurves(req.curves,1),point=auxiliaryStart(both),analyticX=100*(3*.2**2-2*.2**3);
 assert.equal(ref.parameter,.2);close(point,[20,50]);assert.ok(sampled.maximumError<1e-8);assert.ok(Math.abs(point[0]-analyticX)>9);close(auxiliaryStart(change(both,{...sourceRecipe(both),deviation:.01})),point);
});

test('curve insertion, deletion of another curve, and reordering carry identity rather than reuse array indices',()=>{
 const req=request([ellipse([25,30],[12,9],0),ellipse([70,65],[13,10],0)]),first=editMaterialFaces(weakToolSheet(),req),secondEdge=sampleMaterialCurves(req.curves,1).curveForEdge.findIndex(i=>i===1),both=auxiliary(first.doc,{edgeId:first.insertedIds![secondEdge+1],fraction:.63}),ref=curveRef(both),saved=sourceRecipe(both);
 assert.equal(ref.curve.identity,'curve-2');
 const reordered={...saved,curves:[saved.curves[1],saved.curves[0]],curveIds:[saved.curveIds![1],saved.curveIds![0]],deviation:.2},moved=change(both,reordered);close(auxiliaryStart(moved),expectedPoint(reordered,ref));assert.deepEqual(curveRef(moved),ref);
 const added={...reordered,curves:[ellipse([72,25],[8,6],0),...reordered.curves],curveIds:['curve-3',...reordered.curveIds]},three=change(moved,added);close(auxiliaryStart(three),expectedPoint(added,ref));
 const removedOther={...added,curves:[added.curves[0],added.curves[1]],curveIds:added.curveIds.slice(0,2)},two=change(three,removedOther);close(auxiliaryStart(two),expectedPoint(removedOther,ref));assert.deepEqual(curveRef(two),ref);
 const removedSource={...removedOther,curves:[removedOther.curves[0]],curveIds:[removedOther.curveIds[0]]},before=JSON.stringify(two);assert.throws(()=>change(two,removedSource),/来源|参数/);assert.equal(JSON.stringify(two),before);
 const {curveIds:_,...ambiguous}=reordered;assert.throws(()=>change(both,ambiguous),/持久来源编号/);
});

test('closed ellipse seam parameters zero and one resolve to the same indexed material corner after resampling',()=>{
 const first=editMaterialFaces(weakToolSheet(),request()),last=first.insertedIds!.at(-1)!,d=editMaterialAuxiliary(first.doc,{kind:'material-auxiliary',operation:{kind:'create',lines:[{key:'line-1',from:{kind:'material',anchor:{edgeId:first.insertedIds![0],fraction:0}},to:{kind:'material',anchor:{edgeId:last,fraction:.5}}},{key:'line-2',from:{kind:'material',anchor:{edgeId:last,fraction:1}},to:{kind:'world',point:[95,10]}}]},parametric:true}).doc,old=model(d).model.groups[1].auxiliaryBinding!.anchors,recipe={...sourceRecipe(d),deviation:.18},next=change(d,recipe),refs=model(next).model.groups[1].auxiliaryBinding!.anchors;
 assert.equal((old[0] as MaterialCurveAnchorBinding).parameter,0);assert.equal((old[2] as MaterialCurveAnchorBinding).parameter,1);assert.deepEqual(refs,old);close(next.segments.find(s=>s.id.endsWith('::aux-line-1'))!.a,next.segments.find(s=>s.id.endsWith('::aux-line-2'))!.a);
});

test('a later actual ray is recomputed from the same curve parameter after upstream resolution and controls change',()=>{
 const first=editMaterialFaces(weakToolSheet(),request()),both=editMaterialFaces(first.doc,{kind:'material-face-ray',component:0,from:{edgeId:first.insertedIds![0],fraction:.36},through:[100,55],assignment:'F',fixedSide:'left',cpOnly:false,parametric:true}).doc,c=model(both),ref=c.model.groups[1].anchors![0] as MaterialCurveAnchorBinding,recipe={...sourceRecipe(both),deviation:.22,curves:[ellipse([48,51],[27,20],17)]},next=change(both,recipe),updated=model(next),ray=updated.model.groups[1].recipe;
 assert.equal(ray.kind,'material-face-ray');if(ray.kind!=='material-face-ray')return;const point=pointAt(updated.stages[1],ray.from),expected=expectedPoint(recipe,ref);close(point,expected);assert.ok(next.segments.some(s=>s.id.startsWith(updated.model.groups[1].id+'::')&&(Math.hypot(s.a[0]-expected[0],s.a[1]-expected[1])<1e-10||Math.hypot(s.b[0]-expected[0],s.b[1]-expected[1])<1e-10)));assert.deepEqual(updated.model.groups[1].anchors![0],ref);
});

test('a third group retains its curve source when an earlier independent curve changes the input-face segmentation',()=>{
 const first=editMaterialFaces(weakToolSheet(),request([ellipse([25,25],[12,9],0)])).doc,second=editMaterialFaces(first,request([ellipse([72,72],[11,8],0)])).doc,id=model(second).model.groups[1].id,edge=second.segments.find(s=>s.id.startsWith(id+'::crease-2'))!.id,both=auxiliary(second,{edgeId:edge,fraction:.37}),before=model(both).model.groups[2].auxiliaryBinding!.anchors[0],start=auxiliaryStart(both),recipe={...sourceRecipe(both),deviation:.15,curves:[ellipse([29,26],[15,10],9)]},next=change(both,recipe);
 assert.equal(model(next).model.groups.length,3);assert.deepEqual(model(next).model.groups[2].auxiliaryBinding!.anchors[0],before);close(auxiliaryStart(next),start);assert.ok(model(next));
});

test('hole clipping keeps the original material side and rejects a saved parameter that enters blank space',()=>{
 const source=weakToolSheet(true),first=editMaterialFaces(source,weakToolLine([0,50],[100,50],'F',false)),both=auxiliary(first.doc,{edgeId:first.insertedIds![0],fraction:.5}),ref=curveRef(both),recipe=sourceRecipe(both),before=JSON.stringify(both);
 assert.equal(ref.parameter,.2);assert.equal(mat(both).components[0].boundaryLoops.length,2);
 const moved={...recipe,curves:weakToolLine([30,50],[90,50],'F',false).curves.map(curve=>curve.kind==='ellipse'?curve:{...curve,nodeIds:recipe.curves[0].kind==='ellipse'?[]:recipe.curves[0].nodeIds})};assert.throws(()=>change(both,moved),/空白|参数|来源/);assert.equal(JSON.stringify(both),before);
 for(const s of both.segments.filter(s=>s.id.startsWith(sourceId(both)+'::'))){const p=materialMix(s.a,s.b,.5);assert.ok(!(p[0]>40&&p[0]<60&&p[1]>40&&p[1]<60));}
});

test('coincident separate sheets keep distinct source material sides through resampling and missing-side rejection',()=>{
 const one=weakToolSheet(),g=mat(one).graph,p=[...g.vertices_coords,...g.vertices_coords.map(v=>[...v] as Point)],edges=[...g.edges_vertices,...g.edges_vertices.map(([a,b])=>[a+4,b+4] as [number,number])],source=materialDoc(materialCanonical(p,edges,Array(8).fill('B'),Array(8).fill(0),[[0,1,2,3],[4,5,6,7]],[[0,1,2,3],[4,5,6,7]]),p),req={...request(),scope:'all' as const},built=buildMaterialCurveGeometry(source,req),stages:MaterialAnchorStage[]=[{id:'base',doc:source},{id:'curve-group-1',doc:built.doc,result:built}],records=built.curveSources!,first=records.find(r=>r.curve===0)!,other=records.find(r=>r.side!==first.side&&r.from===first.from&&r.to===first.to)!,a=bindMaterialAnchor({edgeId:first.edgeId,fraction:.4},stages),b=bindMaterialAnchor({edgeId:other.edgeId,fraction:.4},stages);
 assert.ok('curve'in a&&'curve'in b);if(!('curve'in a&&'curve'in b))return;assert.notEqual(a.curve.side,b.curve.side);close(pointAt(built.doc,resolveMaterialAnchor(a,stages)),pointAt(built.doc,resolveMaterialAnchor(b,stages)));
 const finer=buildMaterialCurveGeometry(source,{...req,deviation:.2}),current:MaterialAnchorStage[]=[stages[0],{id:'curve-group-1',doc:finer.doc,result:finer}],resolved=resolveMaterialAnchor(a,current),m=mat(finer.doc),edge=m.edgeSegmentIds.indexOf(resolved.edgeId);assert.ok(m.components[0].edges.includes(edge));assert.ok(!m.components[1].edges.includes(edge));
 const missing={...finer,curveSources:finer.curveSources!.filter(r=>r.side!==a.curve.side)};assert.throws(()=>resolveMaterialAnchor(a,[stages[0],{id:'curve-group-1',doc:finer.doc,result:missing}]),/材料侧|来源/);
});

test('same-component slit banks remain separate indexed corners and their explicit bank witness is never replaced',()=>{
 const {source,banks}=materialSlitFixture(),old=mat(source),req=request([ellipse([150,95],[45,35],13)]);req.fixedPoint=[10,10];const built=buildMaterialCurveGeometry(source,req),stages:MaterialAnchorStage[]=[{id:'base',doc:source},{id:'curve-group-1',doc:built.doc,result:built}],bank=old.edgeSegmentIds[banks[0]],record=built.curveSources!.find(r=>r.fromBanks.includes(bank)||r.toBanks.includes(bank))!;
 assert.ok(record);const atStart=record.fromBanks.includes(bank),ref=bindMaterialAnchor({edgeId:record.edgeId,fraction:atStart?0:1},stages);assert.ok('curve'in ref);if(!('curve'in ref))return;assert.ok(ref.curve.banks?.includes(bank));const resolved=resolveMaterialAnchor(ref,stages),m=mat(built.doc),e=m.edgeSegmentIds.indexOf(resolved.edgeId),vertex=m.graph.edges_vertices[e][resolved.fraction];assert.equal(m.graph.vertices_coords.filter(p=>p[0]===m.graph.vertices_coords[vertex][0]&&p[1]===m.graph.vertices_coords[vertex][1]).length,2);
 const forged=structuredClone(ref);forged.curve.banks=[old.edgeSegmentIds[banks[1]]];assert.throws(()=>resolveMaterialAnchor(forged,stages),/材料侧|来源/);
});

test('identity-preserving downstream transforms carry curve parameters through coordinate frame changes',()=>{
 const source=weakToolSheet(),built=buildMaterialCurveGeometry(source,request()),transformed=buildMaterialComponentTransform(built.doc,{kind:'material-transform',components:[0],operation:{kind:'move',a:17,b:-6}}),stages:MaterialAnchorStage[]=[{id:'base',doc:source},{id:'curve-group-1',doc:built.doc,result:built},{id:'curve-group-2',doc:transformed.doc,result:transformed}],edge=built.insertedIds![2],anchor={edgeId:edge,fraction:.46},ref=bindMaterialAnchor(anchor,stages);
 assert.ok('curve'in ref);assert.equal(ref.source,'curve-group-1');const resolved=resolveMaterialAnchor(ref,stages);assert.equal(resolved.edgeId,anchor.edgeId);assert.ok(Math.abs(resolved.fraction-anchor.fraction)<1e-14);
 const first=editMaterialFaces(source,request()),moved=transformMaterialComponents(first.doc,{kind:'material-transform',components:[0],operation:{kind:'move',a:17,b:-6},parametric:true}).doc,both=auxiliary(moved,{edgeId:first.insertedIds![2],fraction:.46}),recipe={...sourceRecipe(both),deviation:.25},next=change(both,recipe),binding=model(next).model.groups[2].auxiliaryBinding!.anchors[0] as MaterialCurveAnchorBinding,point=expectedPoint(recipe,binding);close(auxiliaryStart(next),[point[0]+17,point[1]-6]);
});

test('malformed, forged and missing continuous source proofs reject atomically; metadata is not trusted as provenance',()=>{
 const source=weakToolSheet(),built=buildMaterialCurveGeometry(source,request()),stages:MaterialAnchorStage[]=[{id:'base',doc:source},{id:'curve-group-1',doc:built.doc,result:built}],ref=bindMaterialAnchor({edgeId:built.insertedIds![2],fraction:.43},stages);assert.ok('curve'in ref);if(!('curve'in ref))return;
 for(const mutate of [(r:any)=>r.curve.identity='curve-999',(r:any)=>r.curve.side='same coordinates',(r:any)=>r.curve.segment=7,(r:any)=>r.curve.extra=true,(r:any)=>r.parameter=NaN,(r:any)=>r.edgeId=built.insertedIds![2]]){const bad=structuredClone(ref);mutate(bad);assert.throws(()=>resolveMaterialAnchor(bad,stages),/来源|参数|材料侧/);}
 const absent={...built};delete absent.curveSources;assert.throws(()=>resolveMaterialAnchor(ref,[stages[0],{...stages[1],result:absent}]),/证据缺失/);
 const split=editMaterialFaces(built.doc,{kind:'material-face-ray',component:0,from:{edgeId:built.insertedIds![2],fraction:.43},through:[100,60],assignment:'F',fixedSide:'left',cpOnly:false}),missing=structuredClone(split);missing.descendants.delete(built.insertedIds![2]);assert.throws(()=>resolveMaterialAnchor(ref,[...stages,{id:'curve-group-2',doc:split.doc,result:missing}]),/后代来源证据缺失/);
 const truncated=structuredClone(split);truncated.descendants.set(built.insertedIds![2],[built.insertedIds![2]]);assert.throws(()=>resolveMaterialAnchor(ref,[...stages,{id:'curve-group-2',doc:split.doc,result:truncated}]),/未声明|旧ID/);
 const both=auxiliary(editMaterialFaces(source,request()).doc,{edgeId:'curve-group-1::crease-2',fraction:.43}),before=JSON.stringify(both);for(const mutate of [(d:any)=>d.metadata.materialCurveModel.groups[1].auxiliaryBinding.anchors[0].curve.identity='curve-99',(d:any)=>d.metadata.materialCurveModel.groups[0].recipe.curveIds=['curve-2'],(d:any)=>d.metadata.materialCurveModel.groups[1].auxiliaryBinding.anchors[0].parameter+=.01]){const bad=structuredClone(both);mutate(bad);assert.equal(inspectMaterialCurveModel(bad).ok,false);}
 for(const ids of [null,undefined,['curve-1','curve-1'],['unknown']])assert.throws(()=>change(both,{...sourceRecipe(both),curveIds:ids} as any),/持久来源编号/);
 assert.throws(()=>editMaterialCurveModel(both,{kind:'material-curve-group-remove',group:sourceId(both)}),/依赖.*删除/);assert.equal(JSON.stringify(both),before);
});

test('legacy saved curve IDs and edge-fraction anchors migrate only after original replay proves them',()=>{
 const first=editMaterialFaces(weakToolSheet(),request()),d=editMaterialFaces(first.doc,{kind:'material-face-ray',component:0,from:{edgeId:first.insertedIds![2],fraction:.4},through:[100,60],assignment:'F',fixedSide:'left',cpOnly:false,parametric:true}).doc,old=structuredClone(d),saved=old.metadata!.materialCurveModel as any;saved.groups[1].anchors[0]={source:saved.groups[0].id,edgeId:first.insertedIds![2],fraction:.4,edgeCount:first.insertedIds!.length};delete saved.groups[0].recipe.curveIds;assert.ok(model(old));
 const next=change(old,{...sourceRecipe(old),deviation:.23});assert.ok('curve'in model(next).model.groups[1].anchors![0]);assert.deepEqual((model(next).model.groups[0].recipe as MaterialCurveIntent).curveIds,['curve-1']);
 for(const format of ['json','fold'] as const){const round=importDocument(exportDocument(next,format).text,format).doc;assert.deepEqual(model(round).model.groups,model(next).model.groups);assert.ok(model(change(round,{...sourceRecipe(round),deviation:.5})));}
});
