import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,tessGeometryError,tessPreset,type XY} from '../../src/app/tessellation';

test('edited dual targets survive angle, scale and reverse adjustments but reset for a changed mother mesh',()=>{
  const params={...tessPreset('periodic'),dualTargets:[[0,0],[1,1]] as XY[]};
  for(const patch of [{angle:42},{scale:.4},{angle:-36}])assert.deepEqual((changeTessParams(params,patch) as typeof params).dualTargets,params.dualTargets);
  for(const patch of [{rows:4},{tiling:'triangle'}])assert.equal('dualTargets' in changeTessParams(params,patch),false);
  assert.equal((changeTessParams(params,{dualTargets:undefined}) as typeof params).dualTargets,undefined);
  assert.deepEqual(params.dualTargets,[[0,0],[1,1]]);
});
test('saved polygon and seeds survive transform changes, explicit regeneration resets them',()=>{
  const polygon:XY[]=[[.8,0],[0,1],[-1,0],[0,-1]],twist={...tessPreset('twist'),polygon};
  assert.deepEqual((changeTessParams(twist,{angle:42}) as typeof twist).polygon,polygon);
  assert.equal('polygon' in changeTessParams(twist,{sides:5}),false);
  assert.deepEqual((changeTessParams(twist,{polygon,sides:4}) as typeof twist).polygon,polygon);
  const seeded={...tessPreset('nonperiodic'),points:[[.1,.1],[.8,.1],[.8,.8],[.1,.8]] as XY[]};
  assert.deepEqual((changeTessParams(seeded,{scale:.4}) as typeof seeded).points,seeded.points);
  assert.equal('points' in changeTessParams(seeded,{seed:2}),false);
});
test('shape validation accepts either boundary direction and rejects out-of-range, duplicate, concave and crossed contours',()=>{
  const polygon:XY[]=[[.8,0],[0,1],[-1,0],[0,-1]],faces=[[0,1,2,3]];
  assert.equal(tessGeometryError(polygon,-1,1,faces,true),'');
  assert.equal(tessGeometryError([...polygon].reverse(),-1,1,faces,true),'');
  assert.match(tessGeometryError([[1.1,0],...polygon.slice(1)],-1,1,faces,true),/坐标/);
  assert.match(tessGeometryError([[NaN,0],...polygon.slice(1)],-1,1,faces,true),/坐标/);
  assert.match(tessGeometryError([polygon[1],...polygon.slice(1)],-1,1,faces,true),/重合/);
  assert.match(tessGeometryError([[-.4,0],...polygon.slice(1)],-1,1,faces,true),/凸多边形/);
  const pentagon=Array.from({length:5},(_,i)=>[Math.cos(i*2*Math.PI/5),Math.sin(i*2*Math.PI/5)] as XY);
  assert.match(tessGeometryError([0,2,4,1,3].map(i=>pentagon[i]),-1,1,[[0,1,2,3,4]],true),/凸多边形/);
});
test('custom faces permit boundary subdivision but reject collapsed or inverted faces; seed coordinates stay in the unit square',()=>{
  const ps:XY[]=[[0,0],[.5,0],[1,0],[1,1],[0,1]],faces=[[0,1,2,3,4]];
  assert.equal(tessGeometryError(ps,-10,10,faces),'');
  assert.match(tessGeometryError(ps,-1,1,faces,true),/凸多边形/);
  assert.match(tessGeometryError([[0,0],[.5,0],[1,0]],-10,10,[[0,1,2]]),/凸多边形/);
  assert.match(tessGeometryError([[0,0],[.5,2],[1,0],[1,1],[0,1]],-10,10,faces),/凸多边形/);
  assert.match(tessGeometryError([[-.01,0],[.5,.5]],0,1),/坐标/);
});
