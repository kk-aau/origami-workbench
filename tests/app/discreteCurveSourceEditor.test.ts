import test from 'node:test';
import assert from 'node:assert/strict';
import {discreteCurveCPPreset,discreteCurveCPOriginal4093Preset,readDiscreteCurveCPParams} from '../../src/app/discreteCurveCP';
import {moveDiscreteSourceHandle,discreteSourceHandlePoint,insertDiscreteSourcePoint,deleteDiscreteSourcePoint,discreteSourceDraftError} from '../../src/app/discreteCurveSourceEditor';

test('source point movement preserves raw nonunit vectors and widths, with no input mutation',()=>{
 const original=discreteCurveCPOriginal4093Preset(),before=structuredClone(original),p=moveDiscreteSourceHandle(original,'foldPoints',0,[3.125,-2]);
 assert.deepEqual(original,before);assert.deepEqual(p.source.leftRulings,before.source.leftRulings);assert.deepEqual(p.source.rightRulings,before.source.rightRulings);assert.equal(p.leftWidth,1);assert.equal(p.rightWidth,1);
 assert.ok(Math.abs(Math.hypot(...p.source.leftRulings[0])-1.5)<1e-14);assert.deepEqual(discreteSourceHandlePoint(p,'leftRulings',0),[3.125+p.source.leftRulings[0][0],-2+p.source.leftRulings[0][1]]);
});
test('ruling endpoint movement stores coefficient-one difference, without normalization or point change',()=>{
 const original=discreteCurveCPPreset(4);original.source.foldPoints[1]=[2,3];const p=moveDiscreteSourceHandle(original,'leftRulings',1,[5,7]);
 assert.deepEqual(p.source.leftRulings[1],[3,4]);assert.equal(Math.hypot(...p.source.leftRulings[1]),5);assert.deepEqual(p.source.foldPoints,original.source.foldPoints);assert.deepEqual(p.source.rightRulings,original.source.rightRulings);
});
test('zero ruling remains an editable rejected draft, never silently normalized/repaired',()=>{
 const p=discreteCurveCPPreset(),next=moveDiscreteSourceHandle(p,'rightRulings',1,p.source.foldPoints[1] as [number,number]);
 assert.deepEqual(next.source.rightRulings[1],[0,0]);assert.equal(readDiscreteCurveCPParams(next),null);assert.match(discreteSourceDraftError(next),/模长/);assert.notDeepEqual(p.source.rightRulings[1],[0,0]);
});
test('insert preserves source order and existing pairs; only split/new edges are unassigned',()=>{
 const p=discreteCurveCPPreset(4);p.assignments=['M','V','M','V','M','V','M'];const before=structuredClone(p),next=insertDiscreteSourcePoint(p,1);
 assert.equal(next.source.foldPoints.length,5);assert.deepEqual(p,before);assert.deepEqual(next.source.foldPoints[2],p.source.foldPoints[1].map((v,k)=>(v+p.source.foldPoints[2][k])/2));
 assert.deepEqual(next.source.foldPoints.filter((_,i)=>i!==2),p.source.foldPoints);for(const key of ['leftRulings','rightRulings'] as const){assert.deepEqual(next.source[key][2],p.source[key][1]);assert.deepEqual(next.source[key].filter((_,i)=>i!==2),p.source[key]);}
 assert.deepEqual(next.assignments,['M','U','U','M','V','U','M','V','U','M']);assert.ok(readDiscreteCurveCPParams(next));
});
test('delete preserves surviving edge roles and makes the newly merged edge U',()=>{
 const p=discreteCurveCPPreset(5);p.assignments=['M','V','M','V','M','V','M','V','M','V'];const next=deleteDiscreteSourcePoint(p,2);
 assert.deepEqual(next.assignments,['M','U','V','M','M','V','V']);for(const key of ['foldPoints','leftRulings','rightRulings'] as const)assert.deepEqual(next.source[key],p.source[key].filter((_,i)=>i!==2));assert.ok(readDiscreteCurveCPParams(next));
});
test('three-point special order remains curve/curve/left/right across count changes',()=>{
 const p=discreteCurveCPPreset();p.assignments=['M','V','M','V'];const next=insertDiscreteSourcePoint(p,0);
 assert.deepEqual(next.assignments,['U','U','V','U','M','U','V']);assert.deepEqual(deleteDiscreteSourcePoint(next,1).assignments,['U','V','M','V']);
});
test('append extends last chord only by an explicit insertion command and clones terminal ruling',()=>{
 const p=discreteCurveCPPreset(4),next=insertDiscreteSourcePoint(p,3);assert.deepEqual(next.source.foldPoints[4],p.source.foldPoints[3].map((v,k)=>2*v-p.source.foldPoints[2][k]));assert.deepEqual(next.source.leftRulings[4],p.source.leftRulings[3]);assert.notEqual(next.source.leftRulings[4],next.source.leftRulings[3]);
});
test('source count bounds and malformed source coordinates are refused without clamping',()=>{
 assert.throws(()=>deleteDiscreteSourcePoint(discreteCurveCPPreset(),0),/至少/);assert.throws(()=>insertDiscreteSourcePoint(discreteCurveCPPreset(16),0),/最多/);assert.throws(()=>moveDiscreteSourceHandle(discreteCurveCPPreset(),'foldPoints',99,[0,0]));
 const p=moveDiscreteSourceHandle(discreteCurveCPPreset(),'foldPoints',0,[1001,0]);assert.equal(p.source.foldPoints[0][0],1001);assert.match(discreteSourceDraftError(p),/有限/);assert.equal(readDiscreteCurveCPParams(p),null);
});
