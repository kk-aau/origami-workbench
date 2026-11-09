import test from 'node:test';
import assert from 'node:assert/strict';
import {tubeSavedInputExample,tubeSavedInputCells} from '../../src/app/tubeSavedInputExamples';
import {buildTubeInputGraphics} from '../../src/app/tubeInputGraphics';
import {closedTubeSavedEllipsePreset} from '../../src/app/closedTubeParams';
import {pleatReducePolygon,rotateTubePoints,type TubePoint} from '../../src/app/joinedTubeParams';

const close=(a:TubePoint,b:TubePoint,tolerance=1e-11)=>{
  assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<tolerance,`${a} != ${b}`);
};

test('four saved top-view input examples map to their original graphics functions',()=>{
  assert.deepEqual(tubeSavedInputCells,[3573,3574,3575,3595]);
  for(const cell of tubeSavedInputCells){
    const example=tubeSavedInputExample(cell);
    const drawing=buildTubeInputGraphics(example.params);
    assert.equal(example.cell,cell);
    assert.equal(drawing.sourceFunction,cell===3595?'DoubleJoinedTubeGraphics':'TwistJoinedTubeGraphics');
    assert.equal(drawing.bottomOutline.length,example.params.bottomPoints.length+1);
    assert.equal(drawing.topOutline.length,example.params.topPoints.length+1);
    assert.equal(drawing.pleatTriangles.length,
      example.params.bottomPoints.length*(cell===3595?3:2));
  }
});

test('In[3573]/In[3574] preserve 135° rotation, offset, and opposite diagonals',()=>{
  const ccw=tubeSavedInputExample(3573).params;
  const cw=tubeSavedInputExample(3574).params;
  assert.equal(ccw.family,'twist-joined-tube');
  assert.equal(cw.family,'twist-joined-tube');
  assert.deepEqual(ccw.bottomPoints,cw.bottomPoints);
  assert.deepEqual(ccw.topPoints,cw.topPoints);
  close(ccw.bottomPoints[0],[1,0]);
  close(ccw.bottomPoints[1],[Math.sqrt(3)/2,.5]);
  close(ccw.topPoints[0],[.5-Math.SQRT1_2,.4+Math.SQRT1_2]);
  const firstCCW=buildTubeInputGraphics(ccw),firstCW=buildTubeInputGraphics(cw);
  assert.deepEqual(firstCCW.cyanLinks[0],[ccw.bottomPoints[0],ccw.topPoints[1]]);
  assert.deepEqual(firstCW.darkCyanLinks[0],[cw.bottomPoints[1],cw.topPoints[0]]);
});

test('In[3575] uses the 16-point equal-chord ellipse, 90° rotation and left shift by three',()=>{
  const {params}=tubeSavedInputExample(3575);
  assert.equal(params.family,'twist-joined-tube');
  assert.equal(params.twistDirection,'CW');
  assert.deepEqual(params.bottomPoints,closedTubeSavedEllipsePreset().points);
  assert.equal(params.bottomPoints.length,16);
  close(params.bottomPoints[0],[(1+Math.sqrt(5))/2,0]);
  close(params.topPoints[0],[-params.bottomPoints[3][1],params.bottomPoints[3][0]]);
  close(params.topPoints.at(-1)!,[-params.bottomPoints[2][1],params.bottomPoints[2][0]]);
  const chords=params.bottomPoints.map((p,j)=>Math.hypot(
    p[0]-params.bottomPoints[(j+1)%16][0],p[1]-params.bottomPoints[(j+1)%16][1]));
  assert.ok(Math.max(...chords)-Math.min(...chords)<1e-10);
});

test('In[3595] actually rotates the 12→24 pleated top by 10°, independent of unused φ=135°',()=>{
  const {params}=tubeSavedInputExample(3595);
  assert.equal(params.family,'double-joined-tube');
  assert.equal(params.bottomPoints.length,12);
  assert.equal(params.topPoints.length,24);
  const expected=rotateTubePoints(pleatReducePolygon(params.bottomPoints,.5),10);
  expected.forEach((p,j)=>close(params.topPoints[j],p));
  close(params.topPoints[0],[.503682659562679,.21574116908161506]);
  const drawing=buildTubeInputGraphics(params);
  assert.deepEqual(drawing.blueLinks[0],[params.bottomPoints[0],params.topPoints[1]]);
  assert.deepEqual(drawing.cyanLinks[11],[params.bottomPoints[11],params.topPoints[0]]);
});
