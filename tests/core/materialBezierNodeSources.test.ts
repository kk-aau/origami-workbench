import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Doc,Point} from '../../src/core/types';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {editMaterialAuxiliary} from '../../src/core/materialAuxiliary';
import {editMaterialCurveModel,inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
import {sampleMaterialCurves,buildMaterialCurveGeometry,type MaterialCurve,type MaterialCurveIntent} from '../../src/core/materialCurves';
import {materialMix,type MaterialFaceAnchor} from '../../src/core/materialFaceCommon';
import {bindMaterialAnchor,resolveMaterialAnchor,type MaterialAnchorStage} from '../../src/core/materialRecipeAnchors';
import type {MaterialCurveAnchorBinding} from '../../src/core/materialCurveSources';
import {exportDocument,importDocument} from '../../src/core/formats';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {weakToolSheet,weakToolMaterial as mat} from '../fixtures/materialWeakTools';

type Bezier=Exclude<MaterialCurve,{kind:'ellipse'}>;
const model=(doc:Doc)=>{const m=inspectMaterialCurveModel(doc);assert.ok(m.ok,m.ok?'':m.reason);return m;};
const path=():Bezier=>({kind:'bezier-path',assignment:'F',nodes:[{point:[0,40],incoming:[0,40],outgoing:[8,25]},{point:[30,50],incoming:[22,65],outgoing:[40,65]},{point:[60,45],incoming:[50,25],outgoing:[68,25]},{point:[100,55],incoming:[86,75],outgoing:[100,55]}]});
const loop=():Bezier=>{const k=20*.5522847498307936;return {kind:'bezier-loop',assignment:'F',nodes:[{point:[70,50],incoming:[70,50-k],outgoing:[70,50+k]},{point:[50,70],incoming:[50+k,70],outgoing:[50-k,70]},{point:[30,50],incoming:[30,50+k],outgoing:[30,50-k]},{point:[50,30],incoming:[50-k,30],outgoing:[50+k,30]}]};};
const request=(curve:Bezier=path(),deviation=1):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves:[curve],deviation,fixedPoint:[5,5],cpOnly:false,scope:'component'});
const recipe=(doc:Doc)=>structuredClone(model(doc).model.groups[0].recipe) as MaterialCurveIntent;
const curve=(intent:MaterialCurveIntent)=>{const c=intent.curves[0];assert.notEqual(c.kind,'ellipse');return c as Bezier;};
const sourceId=(doc:Doc)=>model(doc).model.groups[0].id;
const ref=(doc:Doc)=>{const binding=model(doc).model.groups[1].auxiliaryBinding!.anchors[0];assert.ok(binding&&'curve'in binding&&'nodes'in binding.curve);return binding as MaterialCurveAnchorBinding;};
const start=(doc:Doc)=>doc.segments.find(s=>s.id.endsWith('::aux-line-1'))!.a;
const close=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-9,`${a} != ${b}`);
const pointAt=(doc:Doc,anchor:MaterialFaceAnchor)=>{const m=mat(doc),e=m.edgeSegmentIds.indexOf(anchor.edgeId);assert.ok(e>=0);const [a,b]=m.graph.edges_vertices[e].map(v=>m.graph.vertices_coords[v]);return materialMix(a,b,anchor.fraction);};
function sampledPoint(intent:MaterialCurveIntent,binding:MaterialCurveAnchorBinding):Point{
 assert.ok('nodes'in binding.curve);if(!('nodes'in binding.curve))throw Error('missing node pair');const [from,to]=binding.curve.nodes,c=curve(intent),index=c.nodeIds!.findIndex((id,i)=>id===from&&c.nodeIds![(i+1)%c.nodeIds!.length]===to),reverse=index<0,segment=reverse?c.nodeIds!.findIndex((id,i)=>id===to&&c.nodeIds![(i+1)%c.nodeIds!.length]===from):index,t=reverse?1-binding.parameter:binding.parameter,sampled=sampleMaterialCurves(intent.curves,intent.deviation),edge=sampled.curveIntervals.findIndex(interval=>interval.segment===segment&&t>=interval.from&&t<=interval.to);assert.ok(edge>=0);const interval=sampled.curveIntervals[edge],[a,b]=sampled.graph.edges[edge].map(v=>sampled.graph.vertices[v]);return materialMix(a,b,(t-interval.from)/(interval.to-interval.from));
}
function fixture(sourceCurve:Bezier=path(),segment=1){
 const intent=request(sourceCurve),first=editMaterialFaces(weakToolSheet(),intent),sampled=sampleMaterialCurves(intent.curves,intent.deviation),indices=sampled.curveIntervals.flatMap((interval,index)=>interval.segment===segment?[index]:[]),edge=indices[Math.floor(indices.length/2)],anchor={edgeId:first.insertedIds![edge],fraction:.61},doc=editMaterialAuxiliary(first.doc,{kind:'material-auxiliary',operation:{kind:'create',lines:[{key:'line-1',from:{kind:'material',anchor},to:{kind:'world',point:[95,5]}}]},parametric:true}).doc;return {doc,anchor};
}
const change=(doc:Doc,intent:MaterialCurveIntent)=>editMaterialCurveModel(doc,{kind:'material-curve-group-edit',group:sourceId(doc),recipe:intent}).doc;
function splitNode(c:Bezier,index:number,id:string){
 const a=c.nodes[index],b=c.nodes[(index+1)%c.nodes.length],mix=(p:Point,q:Point)=>materialMix(p,q,.5),ab=mix(a.point,a.outgoing),bc=mix(a.outgoing,b.incoming),cd=mix(b.incoming,b.point),abc=mix(ab,bc),bcd=mix(bc,cd);a.outgoing=ab;b.incoming=cd;c.nodes.splice(index+1,0,{point:mix(abc,bcd),incoming:abc,outgoing:bcd});c.nodeIds!.splice(index+1,0,id);
}

test('new raw Bezier requests return the same persisted node-pair provenance as independent model replay',()=>{
 const source=weakToolSheet(),result=editMaterialFaces(source,request()),saved=curve(recipe(result.doc)),record=result.curveSources!.find(interval=>interval.segment===1)!,stages:MaterialAnchorStage[]=[{id:'base',doc:source},{id:sourceId(result.doc),doc:result.doc,result}],binding=bindMaterialAnchor({edgeId:record.edgeId,fraction:.43},stages);assert.deepEqual(saved.nodeIds,['node-1','node-2','node-3','node-4']);assert.deepEqual(record.nodes,['node-2','node-3']);assert.ok('curve'in binding&&'nodes'in binding.curve);if(!('curve'in binding&&'nodes'in binding.curve))return;assert.deepEqual(binding.curve.nodes,['node-2','node-3']);assert.ok(model(result.doc));
});

test('adding/removing other Bezier nodes changes the segment index/count while the actual auxiliary follows its node pair',()=>{
 const {doc}=fixture(),binding=ref(doc),original=recipe(doc),initialNodes=curve(original).nodeIds!;
 assert.ok('nodes'in binding.curve);if(!('nodes'in binding.curve))return;assert.deepEqual(binding.curve.nodes,['node-2','node-3']);assert.equal(Object.hasOwn(binding.curve,'segment'),false);assert.equal(Object.hasOwn(binding.curve,'parts'),false);
 const added=structuredClone(original);splitNode(curve(added),0,'node-5');added.deviation=.18;const first=change(doc,added);assert.equal(curve(recipe(first)).nodes.length,5);assert.equal(curve(recipe(first)).nodeIds!.indexOf('node-2'),2);assert.deepEqual(ref(first),binding);close(start(first),sampledPoint(added,binding));assert.deepEqual(mat(first).graph.vertices_coords.slice(0,4),mat(weakToolSheet()).graph.vertices_coords);assert.deepEqual(first.paper,doc.paper);
 const removed=recipe(first),c=curve(removed),at=c.nodeIds!.indexOf(initialNodes[0]);c.nodes.splice(at,1);c.nodeIds!.splice(at,1);const second=change(first,removed);assert.equal(curve(recipe(second)).nodes.length,4);assert.equal(curve(recipe(second)).nodeIds!.indexOf('node-2'),1);assert.deepEqual(ref(second),binding);close(start(second),sampledPoint(removed,binding));assert.deepEqual(prepareEditorCommit(first,second,{kind:'material-curve-group-edit',group:sourceId(first),recipe:removed}).doc,second);
 const another=recipe(second);splitNode(curve(another),curve(another).nodeIds!.indexOf('node-3'),'node-6');const third=change(second,another);assert.equal(curve(recipe(third)).nodes.length,5);assert.deepEqual(ref(third),binding);close(start(third),sampledPoint(another,binding));
});

test('closed-loop cyclic node reorder and unrelated node deletion preserve the original closing segment and parameter',()=>{
 const {doc}=fixture(loop(),3),binding=ref(doc),original=recipe(doc),c=curve(original);assert.ok('nodes'in binding.curve);if(!('nodes'in binding.curve))return;assert.deepEqual(binding.curve.nodes,['node-4','node-1']);const ids=[...c.nodeIds!],nodes=[...c.nodes];c.nodes=[nodes[2],nodes[3],nodes[0],nodes[1]];c.nodeIds=[ids[2],ids[3],ids[0],ids[1]];original.deviation=.2;const rotated=change(doc,original);assert.deepEqual(ref(rotated),binding);assert.equal(curve(recipe(rotated)).nodeIds!.indexOf('node-4'),1);close(start(rotated),sampledPoint(original,binding));
 const removed=recipe(rotated),next=curve(removed),at=next.nodeIds!.indexOf('node-2');next.nodes.splice(at,1);next.nodeIds!.splice(at,1);const changed=change(rotated,removed);assert.equal(curve(recipe(changed)).nodes.length,3);assert.deepEqual(ref(changed),binding);close(start(changed),sampledPoint(removed,binding));
});

test('reversing a declared adjacent node pair maps parameter t to 1-t without using positions or array indices',()=>{
 const {doc}=fixture(),binding=ref(doc),intent=recipe(doc),c=curve(intent),point=start(doc);c.nodes=c.nodes.slice().reverse().map(node=>({...node,incoming:[...node.outgoing],outgoing:[...node.incoming]}));c.nodeIds=c.nodeIds!.slice().reverse();const next=change(doc,intent);assert.deepEqual(ref(next),binding);close(start(next),sampledPoint(intent,binding));close(start(next),point);
});

test('opening a closed Bezier curve removes only the closing span; retained node pairs continue and the removed pair rejects',()=>{
 const boundaryLoop:Bezier={kind:'bezier-loop',assignment:'F',nodes:[{point:[0,50],incoming:[30,50],outgoing:[10,65]},{point:[30,80],incoming:[20,80],outgoing:[45,80]},{point:[70,80],incoming:[55,80],outgoing:[85,75]},{point:[100,50],incoming:[95,60],outgoing:[70,50]}]}, {doc}=fixture(boundaryLoop,1),binding=ref(doc),intent=recipe(doc);curve(intent).kind='bezier-path';const next=change(doc,intent);assert.deepEqual(ref(next),binding);close(start(next),sampledPoint(intent,binding));const closing=fixture(boundaryLoop,3).doc,closedIntent=recipe(closing);curve(closedIntent).kind='bezier-path';const before=JSON.stringify(closing);assert.throws(()=>change(closing,closedIntent),/原节点对.*删除|来源/);assert.equal(JSON.stringify(closing),before);
});

test('an actual later ray recomputes from the retained node pair after unrelated input segments are inserted and deleted',()=>{
 const req=request(),first=editMaterialFaces(weakToolSheet(),req),sampled=sampleMaterialCurves(req.curves,1),indices=sampled.curveIntervals.flatMap((interval,i)=>interval.segment===1?[i]:[]),edge=indices[Math.floor(indices.length/2)],from={edgeId:first.insertedIds![edge],fraction:.37},doc=editMaterialFaces(first.doc,{kind:'material-face-ray',component:0,from,through:[100,20],assignment:'F',fixedSide:'left',cpOnly:false,parametric:true}).doc,binding=model(doc).model.groups[1].anchors![0] as MaterialCurveAnchorBinding,intent=recipe(doc);splitNode(curve(intent),0,'node-5');intent.deviation=.2;const next=change(doc,intent),updated=model(next),ray=updated.model.groups[1].recipe;assert.equal(ray.kind,'material-face-ray');if(ray.kind!=='material-face-ray')return;const expected=sampledPoint(intent,binding);close(pointAt(updated.stages[1],ray.from),expected);assert.deepEqual(updated.model.groups[1].anchors![0],binding);assert.ok(next.segments.some(segment=>segment.id.startsWith(updated.model.groups[1].id+'::')&&(Math.hypot(segment.a[0]-expected[0],segment.a[1]-expected[1])<1e-9||Math.hypot(segment.b[0]-expected[0],segment.b[1]-expected[1])<1e-9)));
});

test('deleting a referenced node, breaking its adjacency, or replacing it at the same coordinates rejects atomically',()=>{
 const {doc}=fixture(),before=JSON.stringify(doc);for(const mutation of [(c:Bezier)=>{const i=c.nodeIds!.indexOf('node-2');c.nodes.splice(i,1);c.nodeIds!.splice(i,1);},(c:Bezier)=>splitNode(c,c.nodeIds!.indexOf('node-2'),'node-5'),(c:Bezier)=>{c.nodeIds![c.nodeIds!.indexOf('node-2')]='node-99';},(c:Bezier)=>{c.nodeIds=['node-2','node-1','node-3','node-4'];}]){const intent=recipe(doc);mutation(curve(intent));assert.throws(()=>change(doc,intent),/来源|参数|材料侧/);assert.equal(JSON.stringify(doc),before);}
});

test('missing, malformed and forged node identities never fall back to the current slot or nearest curve point',()=>{
 const {doc}=fixture(),before=JSON.stringify(doc);for(const nodeIds of [null,undefined,[],['node-1','node-1','node-3','node-4'],['missing','node-2','node-3','node-4']]){const intent=recipe(doc);(curve(intent) as any).nodeIds=nodeIds;assert.throws(()=>change(doc,intent));}
 const missing=recipe(doc);splitNode(curve(missing),0,'node-5');delete curve(missing).nodeIds;assert.throws(()=>change(doc,missing),/持久节点来源编号/);assert.equal(JSON.stringify(doc),before);
 for(const mutate of [(d:any)=>d.metadata.materialCurveModel.groups[1].auxiliaryBinding.anchors[0].curve.nodes=['node-1','node-4'],(d:any)=>d.metadata.materialCurveModel.groups[0].recipe.curves[0].nodeIds[1]='node-99',(d:any)=>d.metadata.materialCurveModel.groups[1].auxiliaryBinding.anchors[0].curve.segment=1]){const bad=structuredClone(doc);mutate(bad);assert.equal(inspectMaterialCurveModel(bad).ok,false);}
 const intent=recipe(doc),built=buildMaterialCurveGeometry(weakToolSheet(),intent),sampled=sampleMaterialCurves(intent.curves,1),edge=sampled.curveIntervals.findIndex(interval=>interval.nodes?.[0]==='node-2'&&interval.nodes?.[1]==='node-3'),stages:MaterialAnchorStage[]=[{id:'base',doc:weakToolSheet()},{id:'curve-group-1',doc:built.doc,result:built}],saved=bindMaterialAnchor({edgeId:built.insertedIds![edge],fraction:.4},stages),absent=structuredClone(built);absent.curveSources!.forEach(source=>delete source.nodes);assert.throws(()=>resolveMaterialAnchor(saved,[stages[0],{...stages[1],result:absent}]),/来源|参数|材料侧/);
});

test('JSON/FOLD preserve node identities, adjacent-pair bindings and future edits after unrelated node insertion',()=>{
 const {doc}=fixture(),intent=recipe(doc);splitNode(curve(intent),0,'node-5');const edited=change(doc,intent);for(const format of ['json','fold'] as const){const round=importDocument(exportDocument(edited,format).text,format).doc;assert.deepEqual(model(round).model.groups,model(edited).model.groups);const nextIntent=recipe(round),c=curve(nextIntent);c.nodes[c.nodeIds!.indexOf('node-2')].outgoing=[42,71];nextIntent.deviation=.15;const next=change(round,nextIntent);assert.deepEqual(ref(next),ref(edited));close(start(next),sampledPoint(nextIntent,ref(next)));}
});

test('first-phase positional Bezier bindings and nested material-side proofs migrate from independently verified original geometry',()=>{
 const old=JSON.parse(readFileSync(new URL('../fixtures/materialContinuousNodesLegacy.json',import.meta.url),'utf8')) as Doc,before=JSON.stringify(old);assert.ok(model(old));const original=model(old).model.groups[0].recipe as MaterialCurveIntent;assert.equal(Object.hasOwn((original.curves[0] as Bezier),'nodeIds'),false);const intent=structuredClone(original);intent.curves=[{...curve(intent),nodeIds:['node-1','node-2','node-3','node-4']}];splitNode(curve(intent),0,'node-5');const next=change(old,intent);assert.equal(model(next).model.groups.length,3);assert.deepEqual(curve(recipe(next)).nodeIds,['node-1','node-5','node-2','node-3','node-4']);assert.ok(model(next));assert.equal(JSON.stringify(old),before);close(next.segments.find(s=>s.id.endsWith('::aux-line-1'))!.a,old.segments.find(s=>s.id.endsWith('::aux-line-1'))!.a);
});
