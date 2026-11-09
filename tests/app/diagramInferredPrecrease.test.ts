import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc,line} from '../../src/app/state';
import {inferDiagramPrecreaseActions} from '../../src/app/diagramInferredPrecrease';
import {screenshotStepStageDocuments1016} from '../fixtures/screenshotStepStages1016';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import type {Doc,Point,Segment} from '../../src/core/types';

const close=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5,`${a} != ${b}`);
const docs=()=>({first:screenshotStepStageDocuments1016(1),last:screenshotStepStageDocuments1016(4)});
function assertVertical(actions:Segment[],vertical:Segment){
  assert.equal(actions.length,1);assert.equal(actions[0].assignment,'M');assert.equal(actions[0].angle,-180);
  close(actions[0].a,vertical.a);close(actions[0].b,vertical.b);
}
function splitAndRename(doc:Doc):Doc{
  let index=0;return {...structuredClone(doc),segments:doc.segments.flatMap(segment=>{
    const middle:Point=[(segment.a[0]+segment.b[0])/2,(segment.a[1]+segment.b[1])/2];
    return [{...segment,id:`copied-${index++}`,a:[...segment.a] as Point,b:middle},{...segment,id:`copied-${index++}`,a:middle,b:[...segment.b] as Point}];
  })};
}

test('the confirmed screenshot 1-to-4 action infers the complete upper-right vertical mountain excursion',()=>{
  const {first,last}=docs(),savedBefore=structuredClone(first.doc),savedAfter=structuredClone(last.doc);
  assertVertical(inferDiagramPrecreaseActions(first.doc,last.doc),last.vertical);
  assert.deepEqual(first.doc,savedBefore);assert.deepEqual(last.doc,savedAfter);
});

test('inference ignores all segment IDs, directions and material subdivisions',()=>{
  const {first,last}=docs(),before=splitAndRename(first.doc),after=splitAndRename(last.doc);
  after.segments=after.segments.reverse().map(segment=>({...segment,a:segment.b,b:segment.a}));
  assertVertical(inferDiagramPrecreaseActions(before,after),last.vertical);
});

test('the same unique minority-valley pattern infers a positive valley excursion',()=>{
  const {first,last}=docs();
  const reverse=(doc:Doc):Doc=>({...structuredClone(doc),segments:doc.segments.map(segment=>segment.assignment==='M'?{...segment,assignment:'V',angle:180}:segment.assignment==='V'?{...segment,assignment:'M',angle:-180}:{...segment})});
  const actions=inferDiagramPrecreaseActions(reverse(first.doc),reverse(last.doc));
  assert.equal(actions.length,1);assert.equal(actions[0].assignment,'V');assert.equal(actions[0].angle,180);
  close(actions[0].a,last.vertical.a);close(actions[0].b,last.vertical.b);
});

test('a two-mountain two-valley vertex has no unique minority direction to infer',()=>{
  const {first,last}=docs(),before=structuredClone(first.doc),hub=last.ring[2];
  const ray=before.segments.find(segment=>segment.assignment==='V'&&[segment.a,segment.b].some(point=>Math.hypot(point[0]-hub[0],point[1]-hub[1])<1e-6))!;
  ray.assignment='M';ray.angle=-180;
  const after=normalizeDiagramCP({...before,segments:[...before.segments,last.vertical]}).doc;
  assert.deepEqual(inferDiagramPrecreaseActions(before,after),[]);
});

test('renamed or resegmented old F marks do not create animation actions',()=>{
  const {first}=docs();assert.deepEqual(inferDiagramPrecreaseActions(first.doc,splitAndRename(first.doc)),[]);
});

test('reusing the already present vertical F arm does not infer that it was pressed again',()=>{
  const second=screenshotStepStageDocuments1016(2),fourth=screenshotStepStageDocuments1016(4);
  assert.deepEqual(inferDiagramPrecreaseActions(second.doc,fourth.doc),[]);
});

test('flat paper with new F marks does not invent mountain or valley instructions',()=>{
  const before=blankDoc('展开纸'),after={...before,segments:[...before.segments,line([100,0],[100,100],'F')]};
  assert.deepEqual(inferDiagramPrecreaseActions(before,after),[]);
});

test('new auxiliary lines and existing auxiliary geometry promoted to F are not inferred as actions',()=>{
  const {first,last}=docs(),auxiliary={...last.vertical,assignment:'A' as const,angle:0};
  assert.deepEqual(inferDiagramPrecreaseActions(first.doc,{...first.doc,segments:[...first.doc.segments,auxiliary]}),[]);
  const withAux={...first.doc,segments:[...first.doc.segments,auxiliary]};
  assert.deepEqual(inferDiagramPrecreaseActions(withAux,last.doc),[]);
});

test('unrelated new F marks away from a folded minority vertex do not create actions',()=>{
  const {first}=docs(),after=normalizeDiagramCP({...first.doc,segments:[...first.doc.segments,{id:'unrelated-F',a:[10,0],b:[10,13],assignment:'F',angle:0}]}).doc;
  assert.deepEqual(inferDiagramPrecreaseActions(first.doc,after),[]);
});

test('an incomplete addition that extends a pre-existing F arm is not treated as a complete new press',()=>{
  const {first,last}=docs(),mid:Point=[(last.vertical.a[0]+last.vertical.b[0])/2,(last.vertical.a[1]+last.vertical.b[1])/2];
  const before=normalizeDiagramCP({...first.doc,segments:[...first.doc.segments,{...last.vertical,id:'old-half',a:mid,b:last.vertical.b}]}).doc;
  assert.deepEqual(inferDiagramPrecreaseActions(before,last.doc),[]);
});

test('an actual MV refold is not converted into a guessed press-and-return action',()=>{
  const third=screenshotStepStageDocuments1016(3),fourth=screenshotStepStageDocuments1016(4);
  assert.deepEqual(inferDiagramPrecreaseActions(third.doc,fourth.doc),[]);
});

test('new F segments must reach a true paper boundary rather than two interior points',()=>{
  const {first,last}=docs(),tip:Point=[last.vertical.a[0],last.vertical.a[1]+5];
  const after=normalizeDiagramCP({...first.doc,segments:[...first.doc.segments,{...last.vertical,a:tip}]}).doc;
  assert.deepEqual(inferDiagramPrecreaseActions(first.doc,after),[]);
});

test('unknown or non-flat MV angles and changed boundaries disable inference',()=>{
  const {first,last}=docs(),unknown=structuredClone(first.doc),partial=structuredClone(first.doc);
  const old=unknown.segments.find(segment=>segment.assignment==='M')!;old.assignment='U';old.angle=null;
  partial.segments.find(segment=>segment.assignment==='M')!.angle=-90;
  assert.deepEqual(inferDiagramPrecreaseActions(unknown,last.doc),[]);
  assert.deepEqual(inferDiagramPrecreaseActions(partial,last.doc),[]);
  assert.deepEqual(inferDiagramPrecreaseActions(first.doc,{...last.doc,paper:{...last.doc.paper,width:101}}),[]);
  const boundaryChanged=structuredClone(last.doc);boundaryChanged.segments.find(segment=>segment.assignment==='B')!.a=[1,0];
  assert.deepEqual(inferDiagramPrecreaseActions(first.doc,boundaryChanged),[]);
});

test('a unique-looking added ray is rejected if replacing the old mountain cannot close its flat geometry',()=>{
  const {first,last}=docs(),hub=last.ring[2],after=applyDiagramFoldSegments(first.doc,[{id:'wrong-peak-ray',a:[75,0],b:hub,assignment:'F',angle:0}]);
  assert.deepEqual(inferDiagramPrecreaseActions(first.doc,after),[]);
});
