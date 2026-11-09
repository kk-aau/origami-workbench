import {test} from 'node:test';
import assert from 'node:assert/strict';
import {segmentsInSelectionRegion,segmentsCrossingSelectionLine,updateRegionSelection} from '../../src/app/selectionRegions';
import type {Doc,Point,Segment} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-90:0});
const doc=(segments:Segment[]):Doc=>({name:'区域选择',paper:{width:200,height:200},segments});
const square:Point[]=[[0,0],[100,0],[100,100],[0,100]];
const ids=(v:Set<string>)=>[...v].sort();

test('polygon contains complete interior and border segments, not crossing or external lines',()=>{
  const d=doc([s('inside',[20,20],[80,80]),s('border',[0,0],[100,0]),s('cross',[-10,50],[110,50]),s('outside',[-20,-20],[-10,-10]),s('from-border',[0,50],[50,50])]);
  assert.deepEqual(ids(segmentsInSelectionRegion(d,square,'polygon')),['border','from-border','inside']);
});
test('concave polygon rejects segment whose endpoints are inside but middle exits',()=>{
  const concave:Point[]=[[0,0],[100,0],[100,100],[60,100],[60,40],[40,40],[40,100],[0,100]];
  const d=doc([s('bridge',[20,80],[80,80]),s('base',[20,20],[80,20]),s('edge',[40,40],[60,40])]);
  assert.deepEqual(ids(segmentsInSelectionRegion(d,concave,'polygon')),['base','edge']);
  assert.deepEqual(ids(segmentsInSelectionRegion(d,[...concave].reverse(),'polygon')),['base','edge']);
});
test('lasso excludes boundary contact, including interior tangent at a reflex vertex',()=>{
  const notch:Point[]=[[0,0],[100,0],[100,100],[50,50],[0,100]];
  const d=doc([s('inside',[20,20],[80,20]),s('touch',[20,50],[80,50]),s('border',[0,0],[100,0])]);
  assert.deepEqual(ids(segmentsInSelectionRegion(d,notch,'lasso')),['inside']);
  assert.deepEqual(ids(segmentsInSelectionRegion(d,notch,'polygon')),['border','inside','touch']);
});
test('lasso closing edge participates: no leak through implicitly closed concavity',()=>{
  const points:Point[]=[[60,40],[40,40],[40,100],[0,100],[0,0],[100,0],[100,100],[60,100]];
  assert.equal(segmentsInSelectionRegion(doc([s('leak',[50,20],[80,80])]),points,'lasso').size,0);
});
test('self-overlapping contours distinguish even-odd polygon and nonzero lasso fill',()=>{
  const twice=[...square,...square],d=doc([s('inside',[20,20],[80,80])]);
  assert.equal(segmentsInSelectionRegion(d,twice,'polygon').size,0);
  assert.deepEqual(ids(segmentsInSelectionRegion(d,twice,'lasso')),['inside']);
});
test('crossing selection selects X and positive overlap, never isolated T or endpoint contact',()=>{
  const d=doc([s('x',[50,-20],[50,20]),s('overlap',[20,0],[80,0]),s('t',[30,0],[30,30]),s('end',[100,0],[120,20]),s('collinear-end',[100,0],[120,0]),s('reference-end',[0,-10],[0,10]),s('outside',[150,-20],[150,20])]);
  assert.deepEqual(ids(segmentsCrossingSelectionLine(d,[0,0],[100,0])),['overlap','x']);
  assert.deepEqual(ids(segmentsCrossingSelectionLine(d,[100,0],[0,0])),['overlap','x']);
});
test('boundary protection applies while auxiliary segments remain selectable and document is immutable',()=>{
  const d=doc([s('paper',[20,20],[80,20],'B'),s('aux',[20,30],[80,30],'A')]),before=JSON.stringify(d);
  assert.deepEqual(ids(segmentsInSelectionRegion(d,square,'polygon',true)),['aux']);
  assert.deepEqual(ids(segmentsCrossingSelectionLine(d,[50,0],[50,100],true)),['aux']);
  assert.equal(segmentsInSelectionRegion(d,square,'polygon').size,2);assert.equal(JSON.stringify(d),before);
});
test('repeated points and explicit closure are accepted but degenerate/nonfinite contours reject',()=>{
  const d=doc([s('inside',[20,20],[80,80])]);
  assert.equal(segmentsInSelectionRegion(d,[square[0],square[0],...square.slice(1),square[0]],'polygon').size,1);
  for(const path of [[],[[0,0],[1,1]],[[0,0],[1,1],[2,2]],[[0,0],[1,1],[NaN,2]]] as Point[][])assert.throws(()=>segmentsInSelectionRegion(d,path,'polygon'));
  assert.throws(()=>segmentsCrossingSelectionLine(d,[0,0],[0,0]),/不能重合/);
});
test('region select adds and unselect subtracts without toggling unrelated selections',()=>{
  const original=new Set(['old','a']);assert.deepEqual(ids(updateRegionSelection(original,['a','b','b'])),['a','b','old']);
  assert.deepEqual(ids(updateRegionSelection(original,['a','missing'],true)),['old']);assert.deepEqual(ids(original),['a','old']);
});
