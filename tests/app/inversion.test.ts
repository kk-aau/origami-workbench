import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invertCircle,invertSupportingLine,radiusDifferenceCircle,sameCircle} from '../../src/app/inversion';
import {distance} from '../../src/core/geometry';
import {lineTarget} from '../../src/app/segmentTools';
import type {CircleGeometry} from '../../src/app/circleTools';
import type {Point,Segment} from '../../src/core/types';
const c=(x:number,y:number,radius:number):CircleGeometry=>({center:[x,y],radius});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const edge=(a:Point,b:Point):Segment=>({id:'s',a,b,assignment:'M',angle:-90});
const invertPoint=(p:Point,b:CircleGeometry):Point=>{const v:Point=[p[0]-b.center[0],p[1]-b.center[1]],k=b.radius*b.radius/(v[0]*v[0]+v[1]*v[1]);return[b.center[0]+k*v[0],b.center[1]+k*v[1]];};
test('radius difference uses third minus second and keeps first center',()=>{assert.deepEqual(radiusDifferenceCircle(c(5,6,20),c(50,50,10),c(70,80,30)),c(5,6,40));});
test('radius difference supports shrinking and repeated first reference',()=>{assert.deepEqual(radiusDifferenceCircle(c(5,6,20),c(50,50,30),c(70,80,15)),c(5,6,5));assert.deepEqual(radiusDifferenceCircle(c(5,6,20),c(5,6,20),c(70,80,15)),c(5,6,15));});
test('radius difference rejects zero delta nonpositive radius and overflow',()=>{assert.throws(()=>radiusDifferenceCircle(c(0,0,20),c(0,0,10),c(5,0,10)),/半径相同/);assert.throws(()=>radiusDifferenceCircle(c(0,0,20),c(0,0,30),c(5,0,10)),/不为正/);assert.throws(()=>radiusDifferenceCircle(c(0,0,1e6),c(0,0,10),c(5,0,20)));});
test('outside circle inversion has analytic center and radius',()=>{const r=invertCircle(c(150,100,25),c(100,100,50));assert.equal(r.kind,'circle');if(r.kind==='circle'){near(r.circle.center[0],100+200/3);near(r.circle.radius,100/3);}});
test('circle containing the inversion center maps with reversed center direction',()=>{const r=invertCircle(c(10,0,20),c(0,0,30));assert.deepEqual(r,{kind:'circle',circle:c(-30,0,60)});});
test('concentric circle inversion is finite and basis circle is invariant',()=>{assert.deepEqual(invertCircle(c(0,0,20),c(0,0,10)),{kind:'circle',circle:c(0,0,5)});const basis=c(4,7,10);assert.deepEqual(invertCircle(basis,basis),{kind:'circle',circle:basis});});
test('circle through inversion center becomes perpendicular straight line',()=>{const r=invertCircle(c(150,100,50),c(100,100,50));assert.equal(r.kind,'line');if(r.kind==='line'){assert.deepEqual(r.origin,[125,100]);near(r.direction[0],0);near(Math.abs(r.direction[1]),1);}});
test('sampled circumference inversion lies on analytic circle or line',()=>{
  const basis=c(3,4,30);
  for(const source of [c(70,30,15),c(8,9,25),c(33,4,30)]){
    const r=invertCircle(source,basis);
    for(let i=0;i<20;i++){const t=i*.29,p:Point=[source.center[0]+source.radius*Math.cos(t),source.center[1]+source.radius*Math.sin(t)];if(distance(p,basis.center)<1e-5)continue;const q=invertPoint(p,basis);if(r.kind==='circle')near(distance(q,r.circle.center),r.circle.radius);else if(r.kind==='line')near((q[0]-r.origin[0])*r.direction[1]-(q[1]-r.origin[1])*r.direction[0],0);}
  }
});
test('circle inversion is involutive when result is a circle',()=>{for(const source of [c(60,20,10),c(5,7,30),c(0,0,10)]){const basis=c(2,3,25),first=invertCircle(source,basis);assert.equal(first.kind,'circle');if(first.kind!=='circle')continue;const second=invertCircle(first.circle,basis);assert.equal(second.kind,'circle');if(second.kind==='circle'){near(distance(second.circle.center,source.center),0);near(second.circle.radius,source.radius);}}});
test('near-through circle is rejected on overflow, not silently converted to line',()=>{assert.throws(()=>invertCircle(c(50+1e-8,0,50),c(0,0,50)));});
test('vertical support line maps to a circle through inversion center',()=>{const r=invertSupportingLine(edge([150,0],[150,200]),c(100,100,50));assert.deepEqual(r,{kind:'circle',circle:c(125,100,25)});});
test('reversing or shortening the source segment preserves supporting line inversion',()=>{const basis=c(100,100,50),r=invertSupportingLine(edge([150,0],[150,200]),basis);assert.deepEqual(invertSupportingLine(edge([150,90],[150,60]),basis),r);});
test('source line through center remains unchanged, including center beyond segment',()=>{assert.deepEqual(invertSupportingLine(edge([0,0],[10,0]),c(100,0,20)),{kind:'unchanged'});});
test('oblique line sampled points map to computed circumference',()=>{const s=edge([20,40],[80,90]),basis=c(10,10,25),r=invertSupportingLine(s,basis);assert.equal(r.kind,'circle');if(r.kind==='circle')for(const t of [-2,0,.3,1,3]){const p:Point=[s.a[0]+t*(s.b[0]-s.a[0]),s.a[1]+t*(s.b[1]-s.a[1])];near(distance(invertPoint(p,basis),r.circle.center),r.circle.radius);}});
test('invalid or degenerate source inputs reject',()=>{assert.throws(()=>invertSupportingLine(edge([1,1],[1,1]),c(0,0,10)));assert.throws(()=>invertSupportingLine(edge([NaN,1],[0,0]),c(0,0,10)));assert.throws(()=>invertCircle(c(0,0,-1),c(0,0,10)));assert.throws(()=>invertCircle(c(0,0,10),c(Infinity,0,10)));});
test('circle-to-line result respects finite cutoff targets on both sides',()=>{const r=invertCircle(c(150,100,50),c(100,100,50));assert.equal(r.kind,'line');if(r.kind==='line'){assert.deepEqual(lineTarget(r.origin,r.direction,edge([0,0],[200,0])),[125,0]);assert.deepEqual(lineTarget(r.origin,r.direction,edge([0,200],[200,200])),[125,200]);assert.throws(()=>lineTarget(r.origin,r.direction,edge([0,0],[50,0])),/延长/);assert.throws(()=>lineTarget(r.origin,r.direction,edge([125,0],[125,200])),/平行或重合/);}});
test('same-circle test recognizes self-inversion without merging nearby distinct circles',()=>{assert.equal(sameCircle(c(0,0,10),c(0,0,10)),true);assert.equal(sameCircle(c(0,0,10),c(1e-6,0,10)),false);});
test('inversion does not mutate source or reference objects',()=>{const source=c(60,20,10),basis=c(0,0,25),before=JSON.stringify([source,basis]);invertCircle(source,basis);invertSupportingLine(edge([20,0],[20,20]),basis);assert.equal(JSON.stringify([source,basis]),before);});
