import test from 'node:test';
import assert from 'node:assert/strict';
import { reflectionRay, reflectionEnd, lineReflectionPoints } from '../../src/app/reflection';
import type { Point, Segment } from '../../src/core/types';
const near = (a: Point, b: Point) => assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1]) < 1e-8, `${a} != ${b}`);
const target = (a: Point, b: Point): Segment => ({ id:'target',a,b,assignment:'B',angle:0 });
test('two-line reflection uses supporting intersection and second line as axis', () => {
  const p=lineReflectionPoints(target([0,0],[40,40]),target([50,20],[50,100]));
  near(p[1],[50,50]);near(p[0],[0,0]);
  const ray=reflectionRay(...p);near(ray.direction,[Math.SQRT1_2,-Math.SQRT1_2]);
  near(reflectionEnd(ray,target([0,0],[100,0])),[100,0]);
});
test('two-line reflection is invariant to reversed endpoints including equal distances', () => {
  const source=target([0,0],[100,100]),axis=target([50,0],[50,100]);
  const original=structuredClone({source,axis}),p=lineReflectionPoints(source,axis);
  assert.deepEqual(lineReflectionPoints({...source,a:source.b,b:source.a},{...axis,a:axis.b,b:axis.a}),p);
  assert.deepEqual({source,axis},original);
});
test('two-line reflection rejects parallel, coincident, short, invalid and out-of-range references', () => {
  const s=target([0,0],[10,0]);
  assert.throws(()=>lineReflectionPoints(s,target([0,10],[10,10])),/平行/);
  assert.throws(()=>lineReflectionPoints(s,s),/重合/);
  assert.throws(()=>lineReflectionPoints(s,target([0,0],[0,0])),/过短/);
  assert.throws(()=>lineReflectionPoints(s,target([NaN,0],[0,10])),/坐标/);
  assert.throws(()=>lineReflectionPoints(s,target([0,100],[1,100.000001])),/范围/);
});
test('reflection starts at second point and reflects first point about second–third axis', () => {
  const ray=reflectionRay([25,25],[50,50],[50,100]);
  near(ray.origin,[50,50]); near(ray.direction,[Math.SQRT1_2,-Math.SQRT1_2]);
  near(reflectionEnd(ray,target([0,0],[100,0])),[100,0]);
});
test('axis endpoint distance and orientation do not change reflection', () => {
  const r=reflectionRay([25,25],[50,50],[50,100]);
  near(reflectionRay([25,25],[50,50],[50,-300]).direction,r.direction);
  near(reflectionRay([0,0],[50,50],[50,60]).direction,r.direction);
});
test('oblique axis preserves reflected angle and unit direction', () => {
  const r=reflectionRay([60,20],[20,20],[50,50]);
  near(r.direction,[0,1]);near(reflectionEnd(r,target([0,80],[100,80])),[20,80]);
});
test('reflection cutoff can precede or extend beyond the mirrored point', () => {
  const r=reflectionRay([0,10],[10,10],[10,20]);
  near(reflectionEnd(r,target([15,0],[15,20])),[15,10]);
  near(reflectionEnd(r,target([80,0],[80,20])),[80,10]);
});
test('reflection rejects zero axis, zero arm, collinear points and invalid coordinates', () => {
  assert.throws(()=>reflectionRay([0,0],[10,10],[10,10]),/对称轴/);
  assert.throws(()=>reflectionRay([10,10],[10,10],[20,20]),/被反射点/);
  assert.throws(()=>reflectionRay([0,0],[10,10],[20,20]),/镜面轴/);
  assert.throws(()=>reflectionRay([NaN,0],[10,10],[20,20]),/坐标/);
});
test('reflection cutoff rejects reverse, zero, parallel and extension-only intersections', () => {
  const r=reflectionRay([0,10],[10,10],[10,20]);
  assert.throws(()=>reflectionEnd(r,target([0,0],[0,20])),/反方向/);
  assert.throws(()=>reflectionEnd(r,target([10,0],[10,20])),/起点/);
  assert.throws(()=>reflectionEnd(r,target([20,0],[30,0])),/平行/);
  assert.throws(()=>reflectionEnd(r,target([30,30],[30,40])),/延长线/);
});
test('reflection leaves input points and cutoff unchanged', () => {
  const a:Point=[0,10],v:Point=[10,10],b:Point=[10,20],t=target([20,0],[20,20]);
  const before=structuredClone({a,v,b,t});reflectionEnd(reflectionRay(a,v,b),t);
  assert.deepEqual({a,v,b,t},before);
});
