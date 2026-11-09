import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc} from '../../src/core/types';
import {applyMaterialGeneratedSwap,type MaterialGeneratedConstruction} from '../../src/app/materialGeneratedSwap';
import {constructMaterialCopy,type MaterialConstructionCopyIntent} from '../../src/app/materialConstructionCopy';
import {reflectMaterialEdge} from '../../src/core/materialReflect';
import {editMaterialLineProperties} from '../../src/core/materialLineProperties';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {editorHistoryReducer,emptyEditorHistory} from '../../src/app/editorHistory';
import {reflectModelBase} from '../fixtures/materialReflectModel';

function material(doc:Doc){const result=inspectMaterialTopology(doc);assert.ok(result.ok,result.ok?'':result.reason);return result;}
function model(doc:Doc){const result=inspectMaterialCurveModel(doc);assert.ok(result.ok,result.ok?'':result.reason);return result;}
function copyIntent(doc:Doc,parametric=false):MaterialConstructionCopyIntent{return {kind:'material-construction-copy',segmentIds:doc.segments.map(segment=>segment.id),transform:{kind:'translate',from:[0,0],to:[200,0]},...(parametric?{parametric:true}:{})};}

test('material copies exchange only new M/V, preserving original edges, graph identity, FF and unknown angles',()=>{
  for(const angle of [73,null])for(const kind of ['translate','reflect'] as const){
    const fixture=reflectModelBase('M'),doc=editMaterialLineProperties(fixture.doc,{kind:'material-line-properties',segmentIds:[fixture.recipe.sourceId],operation:{kind:'angle',magnitude:angle},cpOnly:false}).doc;
    const construction=copyIntent(doc);if(kind==='reflect')construction.transform={kind:'reflect',a:[150,0],b:[150,100]};
    const before=structuredClone(doc),plain=constructMaterialCopy(doc,construction),result=applyMaterialGeneratedSwap(doc,construction),generated=new Set(result.generatedIds),m=material(result.doc),p=material(plain.doc);
    assert.deepEqual(result.doc.segments.filter(segment=>!generated.has(segment.id)),doc.segments);
    assert.deepEqual(m.graph.vertices_coords,p.graph.vertices_coords);assert.deepEqual(m.graph.edges_vertices,p.graph.edges_vertices);assert.deepEqual(m.foldedVertices,p.foldedVertices);
    for(const segment of result.doc.segments.filter(segment=>generated.has(segment.id))){const original=plain.doc.segments.find(source=>source.id===segment.id)!;assert.equal(segment.assignment,original.assignment==='M'?'V':original.assignment);assert.equal(segment.angle,original.assignment==='M'&&original.angle!==null?-original.angle:original.angle);}
    const crease=result.doc.segments.find(segment=>generated.has(segment.id)&&segment.assignment==='V')!;assert.equal(crease.angle,angle);
    const index=m.edgeSegmentIds.indexOf(crease.id);assert.equal(m.graph.edges_assignment[index],'V');assert.equal(m.graph.edges_foldAngle[index],angle);
    const prepared=prepareEditorCommit(doc,result.doc,{kind:'material-generated-swap',construction});assert.deepEqual(prepared.doc,result.doc);assert.deepEqual(prepared.descendants,result.descendants);assert.deepEqual(doc,before);
    let history=editorHistoryReducer(emptyEditorHistory(doc),{type:'commit',doc:prepared.doc});assert.equal(history.past.length,1);history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,doc);
  }
});

test('single material crease reflection exchanges only inserted edges, with one replayable transaction',()=>{
  for(const assignment of ['M','V'] as const){const {doc,recipe}=reflectModelBase(assignment),before=structuredClone(doc),plain=reflectMaterialEdge(doc,recipe),result=applyMaterialGeneratedSwap(doc,recipe),ids=new Set(result.generatedIds);
    assert.deepEqual(result.generatedIds,plain.insertedIds);assert.deepEqual(material(result.doc).foldedVertices,material(plain.doc).foldedVertices);
    for(const segment of result.doc.segments){const original=plain.doc.segments.find(source=>source.id===segment.id)!;assert.deepEqual(segment,ids.has(segment.id)?{...original,assignment:assignment==='M'?'V':'M',angle:-original.angle!}:original);}
    assert.deepEqual(prepareEditorCommit(doc,result.doc,{kind:'material-generated-swap',construction:recipe}).doc,result.doc);assert.deepEqual(doc,before);
  }
});

test('saved copy and reflection recipes keep the output modifier when their construction is edited',()=>{
  for(const copy of [true,false]){const {doc,recipe}=reflectModelBase('M');doc.segments.push({id:'second-axis',a:[0,55],b:[100,55],assignment:'A',angle:0});
    const construction:MaterialGeneratedConstruction=copy?copyIntent(doc,true):{...recipe,parametric:true},result=applyMaterialGeneratedSwap(doc,construction),saved=model(result.doc),group=saved.model.groups[0];
    assert.equal(saved.model.groups.length,2);assert.equal(saved.model.groups[1].recipe.kind,'material-line-properties');
    const replacement=group.recipe.kind==='material-construction-copy'?{...group.recipe,transform:{kind:'translate' as const,from:[0,0] as [number,number],to:[300,0] as [number,number]}}:group.recipe.kind==='material-edge-reflect'?{...group.recipe,axisId:'second-axis'}:undefined;assert.ok(replacement);
    const edited=editMaterialFaces(result.doc,{kind:'material-curve-group-edit',group:group.id,recipe:replacement}).doc;model(edited);
    const swapped=edited.segments.filter(segment=>segment.assignment==='V');assert.ok(swapped.length>0);assert.ok(swapped.every(segment=>segment.angle===180));assert.ok(swapped.every(segment=>copy?segment.a[0]>=300:segment.a[1]===85&&segment.b[1]===85));
    assert.equal(edited.segments.find(segment=>segment.id===recipe.sourceId)?.assignment,'M');assert.deepEqual(prepareEditorCommit(doc,result.doc,{kind:'material-generated-swap',construction}).doc,result.doc);
  }
});

test('generated non-M/V edges remain unchanged without an unnecessary saved property group',()=>{
  const {doc,recipe}=reflectModelBase('F'),construction={...recipe,parametric:true},plain=reflectMaterialEdge(doc,construction),result=applyMaterialGeneratedSwap(doc,construction);
  assert.deepEqual(result.doc,plain.doc);assert.equal(model(result.doc).model.groups.length,1);
  assert.deepEqual(prepareEditorCommit(doc,result.doc,{kind:'material-generated-swap',construction}).doc,result.doc);
});

test('modified proposals or unsupported constructions fail before publication and leave the source untouched',()=>{
  const {doc,recipe}=reflectModelBase('M'),before=structuredClone(doc),construction=copyIntent(doc),result=applyMaterialGeneratedSwap(doc,construction),bad=structuredClone(result.doc);bad.name='unverified';
  assert.throws(()=>prepareEditorCommit(doc,bad,{kind:'material-generated-swap',construction}),/独立重放/);
  assert.throws(()=>prepareEditorCommit(doc,result.doc,construction),/独立重放/);
  assert.throws(()=>applyMaterialGeneratedSwap(doc,{...recipe,kind:'material-line-properties'} as unknown as MaterialGeneratedConstruction),/只支持/);
  assert.throws(()=>applyMaterialGeneratedSwap(doc,{...construction,segmentIds:['missing']}));assert.deepEqual(doc,before);
});
