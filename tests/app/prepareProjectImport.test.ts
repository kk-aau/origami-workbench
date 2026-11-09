import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProjectImport} from '../../src/app/prepareProjectImport';
import {upgradeProject} from '../../src/core/project';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {defaultAngle,validateDoc,type Doc,type Point,type Segment,type Assignment} from '../../src/core/types';
import {materialSlitFixture} from '../fixtures/materialModel';

const segment=(id:string,a:Point,b:Point,assignment:Assignment='M'):Segment=>({id,a,b,assignment,angle:defaultAngle(assignment)});
const document=(segments:Segment[]):Doc=>({name:'导入准备',paper:{width:100,height:100},segments});

test('import preparation upgrades and splits real intersections without changing the source',()=>{
  const source=document([segment('horizontal',[0,50],[100,50]),segment('vertical',[50,0],[50,100],'V')]);
  source.segments[0].displayColor='#123456';source.metadata={sourceFormat:'cp'};
  const before=structuredClone(source),prepared=prepareProjectImport(source);
  assert.equal(prepared.schemaVersion,2);assert.deepEqual(prepared.objects,[]);
  assert.equal(prepared.segments.length,4);assert.equal(new Set(prepared.segments.map(s=>s.id)).size,4);
  assert.deepEqual(prepared.segments.map(s=>[s.a,s.b]),[
    [[0,50],[50,50]],[[50,50],[100,50]],[[50,0],[50,50]],[[50,50],[50,100]],
  ]);
  assert.deepEqual(prepared.segments.slice(0,2).map(s=>[s.assignment,s.angle,s.displayColor]),[['M',-180,'#123456'],['M',-180,'#123456']]);
  assert.deepEqual(prepared.metadata,source.metadata);assert.doesNotThrow(()=>validateDoc(prepared));
  assert.deepEqual(source,before);assert.notEqual(prepared,source);
});

test('already upgraded native import skips a redundant upgrade with the same prepared result',()=>{
  const source=document([segment('horizontal',[0,50],[100,50]),segment('vertical',[50,0],[50,100],'V')]);
  const upgraded=upgradeProject(source);
  assert.deepEqual(prepareProjectImport(upgraded,true),prepareProjectImport(source));
});

test('an 80 by 80 grid imports all 13284 editable pieces without dropping lines',()=>{
  const segments=[segment('top',[0,0],[100,0],'B'),segment('right',[100,0],[100,100],'B'),segment('bottom',[100,100],[0,100],'B'),segment('left',[0,100],[0,0],'B')];
  for(let i=1;i<=80;i++){const p=100*i/81;segments.push(segment(`h-${i}`,[0,p],[100,p]),segment(`v-${i}`,[p,0],[p,100]));}
  const source=document(segments),before=structuredClone(source);assert.equal(source.segments.length,164);
  const prepared=prepareProjectImport(source);
  assert.equal(prepared.segments.length,13284);
  assert.equal(new Set(prepared.segments.map(s=>s.id)).size,13284);
  for(const original of source.segments){
    const pieces=prepared.segments.filter(s=>s.id===original.id||s.id.startsWith(`${original.id}::split:`));
    assert.equal(pieces.length,81);
    assert.ok(pieces.every(s=>s.assignment===original.assignment&&s.angle===original.angle));
  }
  assert.deepEqual(source,before);assert.equal(source.segments.length,164);
});

test('large sparse imports preserve every segment and metadata beyond the former input limit',()=>{
  const source=document(Array.from({length:20000},(_,i)=>segment(`line-${i}`,[0,i/200],[100,i/200],i%2?'V':'M')));
  source.metadata={source:'large-import',custom:{keep:true}};
  const prepared=prepareProjectImport(source);
  assert.equal(prepared.segments.length,20000);
  assert.deepEqual(prepared.segments,source.segments);
  assert.deepEqual(prepared.metadata,source.metadata);
  assert.notEqual(prepared.segments,source.segments);
  assert.doesNotThrow(()=>validateDoc(prepared));
});

test('import preparation preserves material cut banks and indexed topology instead of welding their coordinates',()=>{
  const {source,banks}=materialSlitFixture(),before=structuredClone(source),original=inspectMaterialTopology(source);
  assert.ok(original.ok);assert.equal(banks.length,2);
  const prepared=prepareProjectImport(source),material=inspectMaterialTopology(prepared);assert.ok(material.ok);
  assert.deepEqual(prepared.segments,source.segments);assert.deepEqual(prepared.metadata,source.metadata);
  assert.deepEqual(material.graph,original.graph);assert.deepEqual(material.edgeSegmentIds,original.edgeSegmentIds);
  assert.deepEqual(material.foldedVertices,original.foldedVertices);assert.equal(material.startingFace,original.startingFace);
  assert.deepEqual(banks.map(e=>material.edgeSegmentIds[e]),banks.map(e=>original.edgeSegmentIds[e]));
  assert.notEqual(material.edgeSegmentIds[banks[0]],material.edgeSegmentIds[banks[1]]);
  assert.deepEqual(source,before);assert.notEqual(prepared.segments,source.segments);
});

test('invalid imported documents reject before preparing editable geometry',()=>{
  const valid=document([segment('crease',[0,0],[100,100])]);
  const badDocuments=[null,{...valid,paper:{width:0,height:100}},{...valid,segments:[valid.segments[0],valid.segments[0]]},
    {...valid,segments:[{...valid.segments[0],a:[NaN,0]}]},
    {...valid,metadata:{materialTopology:null}}];
  for(const bad of badDocuments){const before=structuredClone(bad);assert.throws(()=>prepareProjectImport(bad as Doc));assert.deepEqual(bad,before);}
});
