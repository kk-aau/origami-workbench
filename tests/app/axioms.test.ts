import test from 'node:test';
import assert from 'node:assert/strict';
import {axiom5,axiom7,axiomCutoff,axiomFullSegment,type AxiomFold} from '../../src/app/axioms';
import {reflectPoint} from '../../src/app/mirror';
import {cross,distance,sub} from '../../src/core/geometry';
import type {Point,Segment,Doc} from '../../src/core/types';
const s=(a:Point,b:Point):Segment=>({id:JSON.stringify([a,b]),a,b,assignment:'B',angle:0});
const target=s([0,0],[200,0]);
function check(a:Point,line:Segment,f:AxiomFold){
 const reflection=reflectPoint(a,f.origin,[f.origin[0]+f.direction[0],f.origin[1]+f.direction[1]]);
 assert.ok(distance(reflection,f.mapped)<1e-6,JSON.stringify({reflection,mapped:f.mapped}));
 assert.ok(Math.abs(cross(sub(f.mapped,line.a),sub(line.b,line.a)))/distance(line.a,line.b)<1e-6);
 assert.ok(Math.abs(Math.hypot(...f.direction)-1)<1e-10);
}
test('axiom5 enumerates two valid folds through the pivot',()=>{
 const a:Point=[100,100],pivot:Point=[100,50],line=s([0,25],[200,25]),folds=axiom5(a,line,pivot);
 assert.equal(folds.length,2);for(const f of folds){assert.deepEqual(f.origin,pivot);check(a,line,f);}
});
test('axiom5 tangent is a single solution, impossible circle is no solution',()=>{
 const a:Point=[30,40],pivot:Point=[0,40];assert.throws(()=>axiom5(a,target,pivot),/无解/);
 const folds=axiom5([40,40],target,pivot);assert.equal(folds.length,1);check([40,40],target,folds[0]);
});
test('axiom5 supports pivot on line and target point already on line',()=>{
 for(const [a,p] of [[[30,40],[50,0]],[[30,0],[50,50]]] as [Point,Point][]){const fs=axiom5(a,target,p);assert.equal(fs.length,2);fs.forEach(f=>check(a,target,f));}
});
test('axiom5 target endpoints define supporting line, not restriction to finite target segment',()=>{
 const a:Point=[100,100],p:Point=[100,50],short=s([0,25],[1,25]);const fs=axiom5(a,short,p);assert.equal(fs.length,2);fs.forEach(f=>check(a,short,f));
});
test('axiom5 rejects coincident points and both points on target',()=>{
 assert.throws(()=>axiom5([10,10],target,[10,10]),/重合/);assert.throws(()=>axiom5([10,0],target,[20,0]),/两个点均/);
});
test('axiom7 maps point to target and fold is perpendicular to reference',()=>{
 const a:Point=[50,100],reference=s([0,0],[50,100]),fold=axiom7(a,target,reference);check(a,target,fold);
 assert.ok(Math.abs(fold.direction[0]*50+fold.direction[1]*100)<1e-8);
 assert.deepEqual(fold.mapped,[0,0]);assert.deepEqual(fold.origin,[25,50]);
});
test('axiom7 rejects point already on target and parallel reference',()=>{
 assert.throws(()=>axiom7([10,0],target,s([0,0],[0,100])),/已在/);
 assert.throws(()=>axiom7([10,10],target,s([0,10],[100,10])),/平行/);
});
test('target and reference endpoint reversal preserve geometric solutions',()=>{
 const a:Point=[50,100],ref=s([0,0],[50,100]);for(const t of [target,s(target.b,target.a)])for(const r of [ref,s(ref.b,ref.a)])check(a,t,axiom7(a,t,r));
 const fs=axiom5([100,100],s([0,25],[200,25]),[100,50]),reverse=axiom5([100,100],s([200,25],[0,25]),[100,50]);assert.deepEqual(fs.map(f=>f.mapped),reverse.map(f=>f.mapped));
});
test('finite cutoff works on both directions and rejects extension-only or zero endpoint',()=>{
 const fold=axiom7([50,100],target,s([0,0],[0,100]));
 assert.deepEqual(axiomCutoff(fold,s([200,0],[200,200])),{a:[50,50],b:[200,50]});
 assert.deepEqual(axiomCutoff(fold,s([0,0],[0,200])),{a:[50,50],b:[0,50]});
 assert.throws(()=>axiomCutoff(fold,s([200,100],[200,200])));assert.throws(()=>axiomCutoff(fold,s([50,0],[50,100])),/零长/);
});
test('full segment uses real stops, ignores auxiliary and refuses missing side',()=>{
 const fold=axiom7([50,100],target,s([0,0],[0,100]));
 const d:Doc={name:'公理',paper:{width:200,height:200},segments:[s([0,0],[0,200]),s([200,0],[200,200]),{...s([100,0],[100,200]),assignment:'A'}]};
 const result=axiomFullSegment(d,fold);assert.deepEqual([result.a,result.b],[[200,50],[0,50]]);
 assert.throws(()=>axiomFullSegment({...d,segments:d.segments.slice(1)},fold),/某侧/);
});
test('invalid points, zero reference lengths and out of range mapped results reject',()=>{
 assert.throws(()=>axiom5([NaN,0],target,[50,50]));assert.throws(()=>axiom7([50,50],s([0,0],[0,0]),target));
 assert.throws(()=>axiom7([0,900000],target,s([0,0],[1,.0001])),/超出范围/);
});
test('deterministic varied inputs satisfy both reflection constraints without mutating inputs',()=>{
 for(let i=1;i<=60;i++){
  const a:Point=[20+i,60+i*.7],p:Point=[80-i*.3,20+i*.1],line=s([-100,i*.2],[200,20+i*.2]),before=structuredClone({a,p,line});
  for(const f of axiom5(a,line,p))check(a,line,f);
  check(a,line,axiom7(a,line,s([0,0],[i+1,100])));assert.deepEqual({a,p,line},before);
 }
});
