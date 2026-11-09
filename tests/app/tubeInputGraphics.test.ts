import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTubeInputGraphics} from '../../src/app/tubeInputGraphics';
import {joinedTubePreset,pleatReducePolygon,rotateTubePoints,type TubePoint} from '../../src/app/joinedTubeParams';

const close=(actual:TubePoint,expected:TubePoint)=>{
  assert.ok(Math.abs(actual[0]-expected[0])<1e-12,`${actual[0]} != ${expected[0]}`);
  assert.ok(Math.abs(actual[1]-expected[1])<1e-12,`${actual[1]} != ${expected[1]}`);
};

test('In[3573]/In[3574]: offset 12-gon changes diagonal with twist direction',()=>{
  const bottom=Array.from({length:12},(_,j):TubePoint=>[
    Math.cos(j*Math.PI/6),Math.sin(j*Math.PI/6)]);
  const top=bottom.map((_,j):TubePoint=>[
    .5+Math.cos((135+30*j)*Math.PI/180),.4+Math.sin((135+30*j)*Math.PI/180)]);
  const preset=joinedTubePreset('twist-joined-tube');
  const ccw=buildTubeInputGraphics({...preset,bottomPoints:bottom,topPoints:top});
  const cw=buildTubeInputGraphics({...preset,bottomPoints:bottom,topPoints:top,twistDirection:'CW'});
  close(top[0],[-.20710678118654746,1.1071067811865476]);
  close(top[1],[-.4659258262890682,.6588190451025208]);
  assert.equal(ccw.sourceFunction,'TwistJoinedTubeGraphics');
  assert.equal(ccw.pleatOpacity,1/12);
  assert.equal(ccw.pleatTriangles.length,24);
  assert.deepEqual(ccw.pleatTriangles[0],[bottom[0],bottom[1],top[1]]);
  assert.deepEqual(ccw.pleatTriangles[1],[top[1],top[1],top[0]]);
  assert.deepEqual(cw.pleatTriangles[0],[bottom[0],bottom[1],top[0]]);
  assert.deepEqual(cw.pleatTriangles[1],[top[0],bottom[1],top[1]]);
  assert.deepEqual(ccw.blueLinks[0],[bottom[0],top[0]]);
  assert.deepEqual(ccw.cyanLinks[0],[bottom[0],top[1]]);
  assert.deepEqual(cw.darkCyanLinks[0],[bottom[1],top[0]]);
  assert.deepEqual(ccw.cyanLinks[11],[bottom[11],top[0]]);
  assert.deepEqual(cw.darkCyanLinks[11],[bottom[0],top[11]]);
  assert.equal(ccw.darkCyanLinks.length,0);
  assert.equal(cw.cyanLinks.length,0);
  assert.deepEqual(ccw.bottomStart,bottom[0]);
  assert.deepEqual(ccw.topStart,top[0]);
  assert.deepEqual(ccw.bottomOutline.at(-1),bottom[0]);
  assert.deepEqual(ccw.topOutline.at(-1),top[0]);
});

test('In[3595]: 12-gon pleat preview uses 2j+1 and 2j+2 top vertices',()=>{
  const bottom=Array.from({length:12},(_,j):TubePoint=>[
    Math.cos(j*Math.PI/6),Math.sin(j*Math.PI/6)]);
  const top=rotateTubePoints(pleatReducePolygon(bottom,.5),10);
  const preset=joinedTubePreset('double-joined-tube');
  const drawing=buildTubeInputGraphics({...preset,bottomPoints:bottom,topPoints:top});
  close(top[0],[.503682659562679,.21574116908161506]);
  close(top[1],[.492403876506104,.08682408883346517]);
  assert.equal(drawing.sourceFunction,'DoubleJoinedTubeGraphics');
  assert.equal(drawing.pleatOpacity,1/12);
  assert.equal(drawing.pleatTriangles.length,36);
  assert.deepEqual(drawing.pleatTriangles.slice(0,3),[
    [bottom[0],bottom[1],top[2]],
    [bottom[0],top[2],top[1]],
    [bottom[1],top[3],top[2]],
  ]);
  assert.deepEqual(drawing.blueLinks[0],[bottom[0],top[1]]);
  assert.deepEqual(drawing.cyanLinks[0],[bottom[0],top[2]]);
  assert.deepEqual(drawing.darkCyanLinks[0],[bottom[1],top[2]]);
  assert.deepEqual(drawing.pleatTriangles.slice(-3),[
    [bottom[11],bottom[0],top[0]],
    [bottom[11],top[0],top[23]],
    [bottom[0],top[1],top[0]],
  ]);
  assert.deepEqual(drawing.bottomStart,bottom[0]);
  assert.deepEqual(drawing.topStart,top[1]);
});

test('preview rejects point-count mismatches instead of drawing misleading links',()=>{
  const twist=joinedTubePreset('twist-joined-tube');
  const double=joinedTubePreset('double-joined-tube');
  assert.throws(()=>buildTubeInputGraphics({...twist,topPoints:twist.topPoints.slice(1)}));
  assert.throws(()=>buildTubeInputGraphics({...double,topPoints:double.topPoints.slice(1)}));
});
