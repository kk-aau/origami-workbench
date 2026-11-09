import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFoldSelection,isFoldSourceCurrent,independentFoldBoundaryCount,pickFoldTarget,foldSourceCpKey} from '../../src/app/foldSelection';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildFold} from '../../src/core/geometry';
import {exportORI,importORI} from '../../src/core/ori';
import {inspectMaterialTopology,createMaterialTopology} from '../../src/core/materialTopology';
import {prepareProjectImport} from '../../src/app/prepareProjectImport';
import {appendImportedSegments} from '../../src/app/appendImport';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {emptyFoldedModelCollection,foldedModelCollectionReducer} from '../../src/app/foldedModelCollection';
import {exportModelCollection,prepareModelCollection} from '../../src/app/modelCollectionFile';
import {singleMountainFold,overlappingMaterialPairs} from '../fixtures/layerBoundaryCases';
import type {Doc,Point} from '../../src/core/types';
import {weakToolSheet} from '../fixtures/materialWeakTools';

function pair():Doc{
  const a=singleMountainFold(20),b=singleMountainFold(20,40);
  return {...a,paper:{width:60,height:60},segments:[...a.segments,...b.segments.map(s=>({...s,id:`other-${s.id}`}))]};
}
const selected=(...ids:string[])=>new Set(ids);
function segmentedBoundary(points:Point[],parts:number):Doc{
  const segments:Doc['segments']=[];
  points.forEach((a,i)=>{const b=points[(i+1)%points.length];for(let k=0;k<parts;k++)segments.push({id:`b${i}-${k}`,a:[a[0]+(b[0]-a[0])*k/parts,a[1]+(b[1]-a[1])*k/parts],b:[a[0]+(b[0]-a[0])*(k+1)/parts,a[1]+(b[1]-a[1])*(k+1)/parts],assignment:'B',angle:0});});
  return {name:'subdivided boundary',paper:{width:100,height:100},segments};
}

test('a protected boundary is completed from existing B lines without changing either CP',()=>{
  const doc=pair(),before=structuredClone(doc),result=extractFoldSelection(doc,selected('fold'));
  assert.equal(result.boundaryCount,4);assert.equal(result.selectedCount,1);
  assert.deepEqual(result.doc.segments,doc.segments.slice(0,5));assert.deepEqual(result.doc.paper,{width:20,height:20});
  const folded=computeFlatFold(result.doc);assert.equal(folded.layers.status,'solved',folded.layers.message);assert.equal(folded.geometry.faces.length,2);
  assert.deepEqual(doc,before);result.doc.segments[0].a[0]=999;assert.deepEqual(doc,before);
});

test('a point selects exactly one complete CP, including all folds and original boundary',()=>{
 const doc=pair(),before=structuredClone(doc),first=pickFoldTarget(doc,[5,5]),second=pickFoldTarget(doc,[45,45]);
 assert.deepEqual(first.doc.segments,doc.segments.slice(0,5));assert.deepEqual(second.doc.segments,doc.segments.slice(5));
 assert.notEqual(first.key,second.key);assert.equal(first.key,foldSourceCpKey(first.doc));
 assert.notEqual(foldSourceCpKey(doc),first.key,'old whole-document results have a separate source group');
 assert.equal(computeFlatFold(second.doc).geometry.faces.length,2);
 assert.equal(pickFoldTarget(doc,[0,0]).key,first.key,'paper boundary is a valid marking position');
 assert.deepEqual(doc,before);
 const blank={...first.doc,segments:first.doc.segments.filter(s=>s.assignment==='B')};
 assert.equal(pickFoldTarget(blank,[5,5]).doc.segments.length,4);
});

test('CP keys survive internal crease edits, boundary subdivision and segment reordering',()=>{
 const doc=pair(),first=pickFoldTarget(doc,[5,5]),added=prepareProjectImport({...doc,segments:[...doc.segments,{id:'new-fold',a:[0,7],b:[20,7],assignment:'F',angle:0}]});
 assert.ok(added.segments.length>doc.segments.length);
 assert.equal(pickFoldTarget(added,[5,5]).key,first.key);
 const removed={...added,segments:added.segments.filter(s=>!s.id.startsWith('new-fold')).reverse()};
 assert.equal(pickFoldTarget(removed,[5,5]).key,first.key);
 assert.equal(isFoldSourceCurrent(first.doc,added),false,'group identity does not hide changed calculation geometry');
});

test('point picking rejects blank, invalid, crossing and nested scopes without falling back to the full editor',()=>{
 const doc=pair();assert.throws(()=>pickFoldTarget(doc,[30,30]),/边界/);assert.throws(()=>pickFoldTarget(doc,[NaN,0]),/坐标/);
 const unfinished={...doc,segments:doc.segments.filter(s=>s.id!=='other-b0')};
 assert.equal(pickFoldTarget(unfinished,[5,5]).doc.segments.length,5);
 assert.throws(()=>pickFoldTarget(unfinished,[45,45]),/边界/);
 const crossing={...doc,segments:[...doc.segments,{id:'crossing',a:[-5,6] as Point,b:[25,6] as Point,assignment:'V' as const,angle:180}]};
 assert.throws(()=>pickFoldTarget(crossing,[5,5]),/穿出/);
 const nested=singleMountainFold(20),inner=singleMountainFold(5,5);nested.segments.push(...inner.segments.map(s=>({...s,id:`inner-${s.id}`})));
 assert.throws(()=>pickFoldTarget(nested,[6,6]),/嵌套|相交/);assert.throws(()=>pickFoldTarget(nested,[2,2]),/其他纸张边界/);
});

test('material point targets preserve indexed components and do not select hole interiors',()=>{
 const doc=overlappingMaterialPairs(2),before=structuredClone(doc),first=pickFoldTarget(doc,[5,5]),second=pickFoldTarget(doc,[25,5]);
 assert.equal(first.doc.segments.length,4);assert.equal(second.doc.segments.length,4);assert.notEqual(first.key,second.key);
 const material=inspectMaterialTopology(second.doc);assert.equal(material.ok,true);if(material.ok)assert.equal(material.components.length,1);
 assert.deepEqual(doc,before);assert.throws(()=>pickFoldTarget(doc,[15,5]),/纸面/);
 const holed=weakToolSheet(true);assert.throws(()=>pickFoldTarget(holed,[50,50]),/纸面/);
 assert.equal(inspectMaterialTopology(pickFoldTarget(holed,[20,20]).doc).ok,true);
});

test('coincident indexed material CPs are ambiguous rather than merged or silently selected',()=>{
 const doc=overlappingMaterialPairs(1),material=inspectMaterialTopology(doc);assert.equal(material.ok,true);if(!material.ok)return;
 const graph=structuredClone(material.graph);for(let i=4;i<8;i++)graph.vertices_coords[i][0]-=20;
 doc.segments=doc.segments.map((s,e)=>{const [a,b]=graph.edges_vertices[e];return {...s,a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]]};});
 doc.metadata={materialTopology:createMaterialTopology(doc,graph,material.edgeSegmentIds)};
 const before=structuredClone(doc);assert.throws(()=>pickFoldTarget(doc,[5,5]),/重叠.*多个材料/);assert.throws(()=>pickFoldTarget(doc,[0,0]),/重叠.*多个材料/);assert.deepEqual(doc,before);
});

test('ORI exchange keeps multiple CPs and independently folds the translated second CP',()=>{
  const doc=importORI(exportORI(pair()).text).doc;
  assert.equal(doc.segments.length,10);
  const result=extractFoldSelection(doc,new Set(doc.segments.filter(s=>s.a[0]>=40&&s.assignment!=='B').map(s=>s.id)));
  assert.equal(result.doc.segments.length,5);assert.ok(result.doc.segments.every(s=>s.a[0]>=40));
  const folded=computeFlatFold(result.doc);assert.equal(folded.layers.status,'solved',folded.layers.message);
  assert.equal(buildFold(result.doc).graph.faces_vertices?.length,2);
});

test('partial fold selections, multiple CPs and empty selections have actionable errors',()=>{
  const doc=pair();doc.segments.push({id:'missing',a:[0,5],b:[20,5],assignment:'F',angle:0});
  assert.throws(()=>extractFoldSelection(doc,selected('fold')),/还缺 1 条/);
  assert.throws(()=>extractFoldSelection(doc,selected('fold','other-fold')),/多个 CP/);
  assert.throws(()=>extractFoldSelection(doc,selected()),/请先框选/);
});

test('no rectangle is invented for open or branched boundaries',()=>{
  const doc=singleMountainFold(20);doc.segments=doc.segments.filter(s=>s.id!=='b0');
  assert.throws(()=>extractFoldSelection(doc,selected('fold')),/闭合/);
  const branched=singleMountainFold(20);branched.segments.push({id:'branch',a:[0,0],b:[-5,0],assignment:'B',angle:0});
  assert.throws(()=>extractFoldSelection(branched,selected('fold')),/闭合/);
});

test('an unrelated unfinished CP does not prevent folding a complete selected CP',()=>{
  const doc=pair();doc.segments=doc.segments.filter(s=>s.id!=='other-b0');
  assert.equal(extractFoldSelection(doc,selected('fold')).doc.segments.length,5);
});

test('cross-boundary unselected lines are rejected rather than silently clipped',()=>{
  const doc=pair();doc.segments.push({id:'crossing',a:[-10,10],b:[30,10],assignment:'V',angle:180});
  assert.throws(()=>extractFoldSelection(doc,selected('fold')),/穿出/);
});

test('concave-boundary endpoint containment does not hide a line leaving the paper',()=>{
  const points:Point[]=[[0,0],[30,0],[30,30],[20,30],[20,10],[10,10],[10,30],[0,30]];
  const doc:Doc={name:'concave',paper:{width:30,height:30},segments:points.map((a,i)=>({id:`b${i}`,a,b:points[(i+1)%points.length],assignment:'B',angle:0}))};
  doc.segments.push({id:'inside',a:[0,5],b:[30,5],assignment:'F',angle:0},{id:'across-notch',a:[5,20],b:[25,20],assignment:'M',angle:-180});
  assert.throws(()=>extractFoldSelection(doc,selected('inside')),/穿出/);
  assert.throws(()=>extractFoldSelection(doc,selected('inside','across-notch')),/闭合/);
});

test('nested boundaries are not interpreted as an unrelated CP or filled over',()=>{
  const doc=singleMountainFold(20),inner=singleMountainFold(5,5);
  doc.segments.push(...inner.segments.map(s=>({...s,id:`inner-${s.id}`})));
  assert.throws(()=>extractFoldSelection(doc,selected('fold')),/其他纸张边界/);
  assert.throws(()=>extractFoldSelection(doc,selected('inner-fold')),/嵌套/);
});

test('auxiliary lines are excluded and unsupported crease assignments remain exact',()=>{
  const doc=singleMountainFold(20);doc.segments.at(-1)!.assignment='U';doc.segments.at(-1)!.angle=null;
  doc.segments.push({id:'aux',a:[-10,10],b:[30,10],assignment:'A',angle:0});
  const result=extractFoldSelection(doc,selected('fold','aux'));
  assert.equal(result.doc.segments.length,5);assert.equal(result.doc.segments.at(-1)!.angle,null);assert.equal(result.doc.segments.at(-1)!.assignment,'U');
  assert.throws(()=>extractFoldSelection(doc,selected('aux')),/辅助线/);
});

test('a saved selection source stays current when another CP or annotations change',()=>{
  const original=pair(),source=extractFoldSelection(original,selected('fold')).doc,next=structuredClone(original);
  next.segments.find(s=>s.id==='other-fold')!.assignment='V';next.segments.find(s=>s.id==='other-fold')!.angle=180;
  next.name='renamed';next.paper={width:100,height:100};next.objects=[{id:'note',kind:'text',position:[0,0],text:'hello',fontSize:12,color:'#000000'}];
  assert.equal(isFoldSourceCurrent(JSON.parse(JSON.stringify(source)),next),true);
});

test('changed, removed and newly drawn folds inside the calculation scope make it stale',()=>{
  const doc=pair(),source=extractFoldSelection(doc,selected('fold')).doc;
  const changed=structuredClone(doc);changed.segments.find(s=>s.id==='fold')!.angle=-90;
  assert.equal(isFoldSourceCurrent(source,changed),false);
  assert.equal(isFoldSourceCurrent(source,{...doc,segments:doc.segments.filter(s=>s.id!=='fold')}),false);
  assert.equal(isFoldSourceCurrent(source,{...doc,segments:[...doc.segments,{id:'new',a:[0,5],b:[20,5],assignment:'F',angle:0}]}),false);
  assert.equal(isFoldSourceCurrent(source,{...doc,segments:doc.segments.filter(s=>s.id!=='b0')}),false);
});

test('full document source still detects changed input but auxiliary edits do not invalidate geometry',()=>{
  const doc=pair(),next=structuredClone(doc);next.segments.at(-1)!.assignment='V';
  assert.equal(isFoldSourceCurrent(doc,next),false);
  next.segments=structuredClone(doc.segments);next.segments.push({id:'aux',a:[0,0],b:[100,100],assignment:'A',angle:0});
  assert.equal(isFoldSourceCurrent(doc,next),true);
});

test('partial material extraction preserves explicit indexed topology and independent components',()=>{
  const doc=overlappingMaterialPairs(2),before=structuredClone(doc),source=extractFoldSelection(doc,selected('boundary-4','boundary-5','boundary-6','boundary-7')).doc;
  const material=inspectMaterialTopology(source);assert.equal(material.ok,true);
  if(material.ok){assert.equal(material.components.length,1);assert.equal(material.graph.faces_vertices?.length,1);}
  assert.equal(source.segments.length,4);assert.deepEqual(doc,before);
  assert.equal(isFoldSourceCurrent(source,doc),true);
});

test('beside append and save/reopen preserve both CPs and the selected model calculation scope',()=>{
  const editor=prepareProjectImport(singleMountainFold(20)),scope=extractFoldSelection(editor,selected('fold')).doc;
  const result=computeFlatFold(scope),source={doc:scope,graph:buildFold(scope).graph};
  const collection=foldedModelCollectionReducer(emptyFoldedModelCollection(),{type:'add',id:'first-model',name:'第一张 CP',source,result});
  const appended=appendImportedSegments(editor,singleMountainFold(10),'beside'),combined=prepareEditorCommit(editor,appended.doc).doc;
  assert.equal(isFoldSourceCurrent(scope,combined),true);
  const reopened=prepareModelCollection(exportModelCollection(combined,collection)),entry=reopened.collection.entries[0];
  assert.deepEqual(reopened.doc.segments,combined.segments);
  assert.deepEqual(entry.source.doc.segments,scope.segments);
  assert.equal(isFoldSourceCurrent(entry.source.doc,reopened.doc),true);
  assert.equal(entry.history.present!.geometry.faces.length,2);
  const otherIds=new Set(combined.segments.filter(s=>!editor.segments.some(before=>before.id===s.id)&&s.assignment!=='B').map(s=>s.id));
  const other=extractFoldSelection(reopened.doc,otherIds).doc;
  assert.equal(computeFlatFold(other).layers.status,'solved');
  const changed=structuredClone(reopened.doc);changed.segments.find(s=>s.id==='fold')!.angle=-90;
  assert.equal(isFoldSourceCurrent(entry.source.doc,changed),false);
});

test('many boundary segments remain complete and preserve source checks without including another CP',()=>{
  const doc=segmentedBoundary([[0,0],[100,0],[100,100],[0,100]],64);
  doc.segments.push({id:'first',a:[10,10],b:[90,90],assignment:'M',angle:-180},{id:'second',a:[10,90],b:[90,10],assignment:'V',angle:180});
  const other=singleMountainFold(20,200);doc.segments.push(...other.segments.map(s=>({...s,id:'other-'+s.id})));
  const original=structuredClone(doc),scope=extractFoldSelection(doc,selected('first','second'));
  assert.equal(scope.boundaryCount,256);assert.equal(scope.doc.segments.length,258);assert.deepEqual(scope.doc.segments,doc.segments.slice(0,258));assert.deepEqual(doc,original);
  assert.equal(isFoldSourceCurrent(scope.doc,doc),true);
  assert.throws(()=>extractFoldSelection(doc,selected('first')),/还缺 1 条/);
  assert.equal(isFoldSourceCurrent(scope.doc,{...doc,segments:[...doc.segments,{id:'new',a:[10,40],b:[90,40],assignment:'F',angle:0}]}),false);
});

test('subdivided concave boundary still rejects a crease that crosses an empty notch',()=>{
  const doc=segmentedBoundary([[0,0],[100,0],[100,100],[60,100],[60,30],[40,30],[40,100],[0,100]],24);
  doc.segments.push({id:'inside',a:[0,10],b:[100,10],assignment:'F',angle:0},{id:'notch',a:[10,50],b:[90,50],assignment:'M',angle:-180});
  assert.throws(()=>extractFoldSelection(doc,selected('inside')),/穿出/);
  assert.throws(()=>extractFoldSelection(doc,selected('inside','notch')),/闭合/);
});

test('indexed border queries preserve tolerance endpoints without clipping and reject a true crossing',()=>{
  const doc=segmentedBoundary([[0,0],[100,0],[100,100],[0,100]],32),epsilon=1e-6;
  doc.segments.push({id:'near-border',a:[-epsilon/2,50],b:[100+epsilon/2,50],assignment:'M',angle:-180});
  const scope=extractFoldSelection(doc,selected('near-border')).doc;
  assert.deepEqual(scope.segments.at(-1),doc.segments.at(-1));assert.equal(scope.segments.length,129);
  const crossing={id:'crossing',a:[-epsilon*2,20] as Point,b:[50,20] as Point,assignment:'V' as const,angle:180};
  assert.throws(()=>extractFoldSelection({...doc,segments:[...doc.segments,crossing]},selected('near-border')),/穿出/);
});

test('independent boundary count recognizes only complete separated ordinary CPs',()=>{
  const doc=pair(),before=structuredClone(doc);
  assert.equal(independentFoldBoundaryCount(doc),2);assert.equal(independentFoldBoundaryCount(singleMountainFold(20)),1);
  extractFoldSelection(doc,selected('fold'));assert.equal(independentFoldBoundaryCount(doc),2);assert.deepEqual(doc,before);
  const broken={...doc,segments:doc.segments.filter(s=>s.id!=='other-b0')};assert.equal(independentFoldBoundaryCount(broken),0);
  assert.equal(independentFoldBoundaryCount({...doc,segments:[...doc.segments,{id:'stray-boundary',a:[100,100],b:[120,100],assignment:'B',angle:0}]}),0);
});

test('nested holes, touching boundaries and material topology are not classified as independent CPs',()=>{
  const outer=singleMountainFold(20),inner=singleMountainFold(5,5);
  const nested={...outer,segments:[...outer.segments,...inner.segments.map(s=>({...s,id:'inner-'+s.id}))]};
  assert.equal(independentFoldBoundaryCount(nested),0);
  const touching=singleMountainFold(20,20);assert.equal(independentFoldBoundaryCount({...outer,segments:[...outer.segments,...touching.segments.map(s=>({...s,id:'touching-'+s.id}))]}),0);
  assert.equal(independentFoldBoundaryCount(overlappingMaterialPairs(2)),0);
});
