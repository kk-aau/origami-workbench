import test from 'node:test';
import assert from 'node:assert/strict';
import {localFlatCandidates,localFlatCutoff} from '../../src/app/localFlatFold';
import type {Doc,Segment,Assignment} from '../../src/core/types';
const ray=(degrees:number,id=String(degrees),assignment:Assignment='M'):Segment=>({id,a:[100,100],b:[100+50*Math.cos(degrees*Math.PI/180),100+50*Math.sin(degrees*Math.PI/180)],assignment,angle:assignment==='M'?-60:assignment==='V'?90:0});
const doc=(segments:Segment[]):Doc=>({name:'local',paper:{width:200,height:200},segments});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('degree one extends opposite direction preserving existing type and custom angle',()=>{
 const s=ray(30,'source','V'),d=doc([s]),before=structuredClone(d),r=localFlatCandidates(d,[100,100],'M');assert.equal(r.degree,1);assert.equal(r.candidates.length,1);close(r.candidates[0].degrees,210);assert.equal(r.candidates[0].assignment,'V');assert.equal(r.candidates[0].angle,90);assert.deepEqual(d,before);
});
test('symmetric degree-three vertex has three valid directions and current preset',()=>{
 const r=localFlatCandidates(doc([ray(0),ray(120),ray(240)]),[100,100],'V');assert.equal(r.candidates.length,3);r.candidates.forEach((c,i)=>{close(c.degrees,[60,180,300][i]);assert.equal(c.assignment,'V');assert.equal(c.angle,180);});
});
test('T junction has one nonzero completion and unsplit input is handled without mutation',()=>{
 const d=doc([{...ray(0),a:[50,100],b:[150,100]},ray(90)]),before=structuredClone(d),r=localFlatCandidates(d,[100,100],'M');assert.equal(r.degree,3);assert.equal(r.candidates.length,1);close(r.candidates[0].degrees,270);assert.deepEqual(d,before);
});
test('auxiliary and flat edges do not alter degree; unknown crease does participate',()=>{
 const u={...ray(0,'unknown','U'),angle:null};const r=localFlatCandidates(doc([u,ray(90,'aux','A'),ray(180,'flat','F')]),[100,100],'M');assert.equal(r.degree,1);assert.equal(r.candidates[0].assignment,'U');assert.equal(r.candidates[0].angle,null);assert.deepEqual(r.sourceIds,['unknown']);
});
test('no folding rays, even degree and duplicate directions reject clearly',()=>{
 assert.throws(()=>localFlatCandidates(doc([]),[100,100],'M'),/没有相接/);assert.throws(()=>localFlatCandidates(doc([ray(0),ray(90)]),[100,100],'M'),/偶数/);assert.throws(()=>localFlatCandidates(doc([ray(0,'one'),ray(0,'two')]),[100,100],'M'),/重叠/);assert.throws(()=>localFlatCandidates(doc([ray(0)]),[NaN,0],'M'));
});
test('reversing segment endpoints or input order preserves completion directions',()=>{
 const rays=[ray(10),ray(100),ray(230)],a=localFlatCandidates(doc(rays),[100,100],'M'),b=localFlatCandidates(doc(rays.reverse().map(s=>({...s,a:s.b,b:s.a}))),[100,100],'M');assert.deepEqual(a.candidates,b.candidates);
});
test('independent alternating sector sums verify varied odd-degree completions',()=>{
 for(const angles of [[0,50,190],[12,122,240],[0,35,90,145,250],[5,40,100,170,235,270,310]]){
  const r=localFlatCandidates(doc(angles.map(a=>ray(a))),[100,100],'M');
  for(const c of r.candidates){const sorted=[...angles,c.degrees].sort((a,b)=>a-b);let even=0,odd=0;for(let i=0;i<sorted.length;i++){const gap=(sorted[(i+1)%sorted.length]-sorted[i]+360)%360;if(i%2)odd+=gap;else even+=gap;}close(even,180);close(odd,180);}
 }
});
test('cutoff requires finite forward target and preserves assignment and angle',()=>{
 const c=localFlatCandidates(doc([ray(180,'source','V')]),[100,100],'M').candidates[0];
 const target:Segment={id:'edge',a:[200,0],b:[200,200],assignment:'B',angle:0};const s=localFlatCutoff(c,target);assert.deepEqual(s.a,[100,100]);close(s.b[0],200);close(s.b[1],100);assert.equal(s.assignment,'V');assert.equal(s.angle,90);
 for(const t of [{...target,a:[0,0] as [number,number],b:[0,200] as [number,number]},{...target,a:[200,150] as [number,number]}, {...target,a:[100,0] as [number,number],b:[100,200] as [number,number]}])assert.throws(()=>localFlatCutoff(c,t));
});
