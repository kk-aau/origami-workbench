import test from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point,Segment} from '../../src/core/types';
import {canvasInteractionDocument,canvasSelectableIncidentIds} from '../../src/app/canvasInteraction';
import {pickEraseSegment,segmentsInBox,segmentsInEraseBox} from '../../src/app/erase';
import {buildSnapPoints,editorJunctionPoints} from '../../src/app/snapPoints';
import {segmentsInSelectionRegion,segmentsCrossingSelectionLine,updateRegionSelection} from '../../src/app/selectionRegions';
import {toggleMirrorSelection} from '../../src/app/mirror';
import {typeFilterHits,applyTypeFilter} from '../../src/app/typeFilter';
import {lineEraseHits} from '../../src/app/lineErase';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {materialCutFixture} from '../fixtures/materialModel';

const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:0});
const doc=(segments:Segment[]):Doc=>({name:'图层交互',paper:{width:100,height:100},segments});

test('a hidden coincident main line cannot intercept a visible auxiliary click or point erase',()=>{
  const source=doc([segment('a-hidden',[10,20],[90,20],'M'),segment('z-visible',[10,20],[90,20],'A')]);
  const before=structuredClone(source),visible=canvasInteractionDocument(source,{main:false,auxiliary:true});
  assert.equal(pickEraseSegment(source,[50,20],2,false),'a-hidden','the full-source tie formerly picks the hidden line');
  assert.equal(pickEraseSegment(visible,[50,20],2,false),'z-visible');
  assert.deepEqual(typeFilterHits(visible,{kind:'point',point:[50,20],radius:2},'A'),new Set(['z-visible']));
  const changed=applyTypeFilter(visible,{kind:'point',point:[50,20],radius:2},'A',{kind:'replace',to:'V'});
  assert.equal(changed.changed,1);
  assert.deepEqual(changed.doc.segments.map(segment=>[segment.id,segment.assignment]),[['z-visible','V']]);
  assert.deepEqual(source,before);
});

test('the same pointer view scopes rectangles, polygons and crossing lines for all four layer combinations',()=>{
  const source=doc([segment('main',[10,20],[90,20],'M'),segment('aux',[10,40],[90,40],'A'),segment('border',[10,60],[90,60],'B')]);
  const polygon:Point[]=[[0,0],[100,0],[100,100],[0,100]];
  for(const main of [false,true])for(const auxiliary of [false,true]){
    const visible=canvasInteractionDocument(source,{main,auxiliary}),expected=new Set([...(main?['main','border']:[]),...(auxiliary?['aux']:[])]);
    assert.deepEqual(segmentsInBox(visible,[0,0],[100,100],false,'contained'),expected);
    assert.deepEqual(segmentsInEraseBox(visible,[100,100],[0,0],false),expected);
    assert.deepEqual(segmentsInSelectionRegion(visible,polygon,'polygon'),expected);
    assert.deepEqual(segmentsInSelectionRegion(visible,polygon,'lasso'),expected);
    assert.deepEqual(segmentsCrossingSelectionLine(visible,[50,0],[50,100]),expected);
    assert.deepEqual(lineEraseHits(visible,[50,0],[50,100],'crossing'),expected);
    assert.deepEqual(typeFilterHits(visible,{kind:'box',a:[0,0],b:[100,100]},'any'),expected);
  }
});

test('rightward deletion still needs containment and leftward deletion still accepts crossings without hidden lines',()=>{
  const source=doc([segment('main',[0,20],[100,20],'M'),segment('aux',[0,20],[100,20],'A')]);
  const visible=canvasInteractionDocument(source,{main:false,auxiliary:true});
  assert.deepEqual(segmentsInEraseBox(visible,[30,10],[70,30],false),new Set());
  assert.deepEqual(segmentsInEraseBox(visible,[70,30],[30,10],false),new Set(['aux']));
  assert.deepEqual(segmentsInEraseBox(visible,[-1,10],[101,30],false),new Set(['aux']));
});

test('a shared junction selects only visible editable incident lines while retaining complete source snap topology',()=>{
  const source=doc([segment('main',[0,50],[100,50],'M'),segment('aux',[50,0],[50,100],'A'),segment('border',[0,0],[100,100],'B')]);
  const before=structuredClone(source),points=buildSnapPoints(source),junction=editorJunctionPoints(points).find(point=>point.point[0]===50&&point.point[1]===50)!;
  assert.ok(junction&&junction.segmentIds.length===3);
  const incident=[...junction.segmentIds];
  const auxiliaryOnly=canvasInteractionDocument(source,{main:false,auxiliary:true});
  assert.deepEqual(canvasSelectableIncidentIds(auxiliaryOnly,incident,true),new Set(['aux']));
  const mainOnly=canvasInteractionDocument(source,{main:true,auxiliary:false});
  assert.deepEqual(canvasSelectableIncidentIds(mainOnly,incident,true),new Set(['main']));
  assert.deepEqual(canvasSelectableIncidentIds(mainOnly,incident,false),new Set(['main','border']));
  assert.deepEqual(canvasSelectableIncidentIds(canvasInteractionDocument(source,{main:false,auxiliary:false}),incident,false),new Set());
  assert.deepEqual(junction.segmentIds,incident);
  assert.deepEqual(buildSnapPoints(source),points);
  assert.deepEqual(source,before);
});

test('pointer unselect and mirror selection toggle only displayed hits, retaining explicitly selected hidden objects',()=>{
  const source=doc([segment('main',[10,20],[90,20],'M'),segment('aux',[10,40],[90,40],'A')]);
  const visible=canvasInteractionDocument(source,{main:false,auxiliary:true});
  const hits=segmentsInBox(visible,[0,0],[100,100],false,'touching'),selected=new Set(['main','aux']);
  assert.deepEqual(updateRegionSelection(selected,hits,true),new Set(['main']));
  assert.deepEqual(toggleMirrorSelection(selected,hits),new Set(['main']));
  assert.deepEqual(selected,new Set(['main','aux']));
});

test('boundary protection remains independent of the displayed auxiliary layer',()=>{
  const source=doc([segment('border',[10,20],[90,20],'B'),segment('aux',[10,40],[90,40],'A')]);
  const visible=canvasInteractionDocument(source,{main:true,auxiliary:true});
  assert.deepEqual(segmentsInEraseBox(visible,[0,0],[100,100],true),new Set(['aux']));
  assert.equal(pickEraseSegment(visible,[50,20],1,true),undefined);
  assert.deepEqual(canvasSelectableIncidentIds(visible,['border','aux'],true),new Set(['aux']));
});

test('visible auxiliary deletion commits a complete material document; material-edge deletion remains rejected',()=>{
  const {source}=materialCutFixture(),edge=source.segments[0];
  const auxiliary=segment('zz-auxiliary',[...edge.a],[...edge.b],'A');
  const full={...source,segments:[...source.segments,auxiliary]},before=structuredClone(full);
  const visible=canvasInteractionDocument(full,{main:false,auxiliary:true});
  const point:Point=[(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2];
  const picked=pickEraseSegment(visible,point,1,false);
  assert.equal(picked,auxiliary.id);
  const proposal={...full,segments:full.segments.filter(segment=>segment.id!==picked)};
  const result=prepareEditorCommit(full,proposal);
  assert.equal(inspectMaterialTopology(result.doc).ok,true);
  assert.deepEqual(result.doc.segments,source.segments);
  assert.deepEqual(result.doc.metadata,source.metadata);
  assert.throws(()=>prepareEditorCommit(full,{...full,segments:full.segments.filter(segment=>segment.id!==edge.id)}),/删除了材料边/);
  assert.deepEqual(full,before);
  assert.equal(visible.metadata,full.metadata,'the pointer view does not rewrite the material contract');
});
