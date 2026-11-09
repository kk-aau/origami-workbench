import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {materialCutFixture} from '../tests/fixtures/materialModel';
import {prepareEditorCommit} from '../src/app/editorCommit';
import {pickEraseSegment,segmentsInEraseBox} from '../src/app/erase';
import {buildSnapPoints,editorJunctionPoints,nearestSnapPoint} from '../src/app/snapPoints';
import {exportDocument,importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import type {Doc,Point,Segment} from '../src/core/types';

/** Run from workbench; creates synthetic browser inputs only, never project data. */
const directory=path.resolve('output/auxiliary-edit-fixtures');
const source=materialCutFixture().source,sourceBefore=JSON.stringify(source);
// Keep the midpoint away from material junctions, so ordinary selection can
// pick A alone instead of selecting an intersection's whole incident fan.
const guide:Segment={id:'guide',a:[25,130],b:[175,130],assignment:'A',angle:0};
const proposed:Doc={...source,name:'测试 · 材料辅助线编辑',segments:[...source.segments,guide]};
const doc=prepareEditorCommit(source,proposed).doc;
const material=inspectMaterialTopology(doc);
assert.ok(material.ok,material.ok?'':material.reason);

const midpoint:Point=[100,130],radius=4;
assert.equal(pickEraseSegment(doc,midpoint,radius,true),guide.id);
const editableIds=new Set(doc.segments.filter(s=>s.assignment!=='B').map(s=>s.id));
const junctions=editorJunctionPoints(buildSnapPoints(doc)).filter(point=>point.segmentIds.some(id=>editableIds.has(id)));
assert.equal(nearestSnapPoint(junctions,midpoint,radius),null,'the midpoint must not select an incident material fan');

const mixedBox:{a:Point;b:Point}={a:[-1,-1],b:[201,201]};
const mixedIds=segmentsInEraseBox(doc,mixedBox.a,mixedBox.b,true);
assert.ok(mixedIds.has(guide.id));
assert.ok([...mixedIds].some(id=>material.edgeSegmentIds.includes(id)));
let rejectedMessage='';
try{
  prepareEditorCommit(doc,{...doc,segments:doc.segments.filter(segment=>!mixedIds.has(segment.id))});
}catch(error){rejectedMessage=(error as Error).message;}
assert.match(rejectedMessage,/当前操作删除了材料边/);

const auxiliaryBox:{a:Point;b:Point}={a:[20,125],b:[180,135]};
const auxiliaryIds=segmentsInEraseBox(doc,auxiliaryBox.a,auxiliaryBox.b,true);
assert.deepEqual([...auxiliaryIds],[guide.id]);
const deleted=prepareEditorCommit(doc,{...doc,segments:doc.segments.filter(segment=>!auxiliaryIds.has(segment.id))}).doc;
assert.ok(!deleted.segments.some(segment=>segment.id===guide.id));
assert.deepEqual(deleted.metadata?.materialTopology,doc.metadata?.materialTopology);
assert.ok(inspectMaterialTopology(deleted).ok);
assert.equal(JSON.stringify(source),sourceBefore,'the original test source must remain unchanged');

const project=exportDocument(doc,'json').text;
const loaded=importDocument(project,'json').doc;
assert.deepEqual(loaded.segments,doc.segments);
assert.deepEqual(loaded.metadata?.materialTopology,doc.metadata?.materialTopology);
assert.ok(inspectMaterialTopology(loaded).ok);

fs.mkdirSync(directory,{recursive:true});
const fixture=path.join(directory,'material-with-auxiliary.zhezhi.json');
fs.writeFileSync(fixture,project,'utf8');
const report={
  fixture,source:'tests/fixtures/materialModel.ts → materialCutFixture()',
  guide,midpoint,worldPickingRadius:radius,boundaryProtection:true,
  materialEdges:doc.segments.filter(segment=>material.edgeSegmentIds.includes(segment.id)&&segment.assignment!=='B'),
  mixedBox:{...mixedBox,mode:'contained',hitIds:[...mixedIds],expected:'reject',message:rejectedMessage},
  auxiliaryBox:{...auxiliaryBox,mode:'contained',hitIds:[...auxiliaryIds],expected:'delete only guide'},
  checks:{auxiliaryInDocSegments:true,midpointPicksGuideOnly:true,midpointAwayFromSelectableJunctions:true,
    mixedDeleteRejected:true,auxiliaryOnlyDeleteAccepted:true,materialContractPreserved:true,
    nativeJSONReimportPreserved:true,originalTestSourceUnchanged:true},
  browserInstructions:'Import the fixture in the crease editor; use select, hide the folded overlay and display both main and auxiliary layers. The boxes drag from a to b (rightward / contained).',
};
fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report,null,2));
