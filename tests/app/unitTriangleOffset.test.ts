import assert from 'node:assert/strict';
import test from 'node:test';
import {
  unitTriangleOffsetTwistAngle,
  unitTriangleOffsetTwistAngleSelfContained,
  unitTriangleOffsetTwistOffset,
  unitTriangleOffsetTwistRotation,
  unitTriangleOffsetTwistSelfContained,
  unitTriangleOffsetTwistShrinkage,
  unitTriangleOffsetTwistValid,
  type TriangleAngles
} from '../../src/app/unitTriangleOffset';

const close=(actual:number|null,expected:number,tolerance=1e-10)=>{
  assert.notEqual(actual,null);
  assert.ok(Math.abs(actual!-expected)<tolerance,`${actual} != ${expected}`);
};

test('original Mathematica unit triangle example and its inverse',()=>{
  const triangle:TriangleAngles=[50,60,70],width=.09,offset=.06;
  const alpha=unitTriangleOffsetTwistAngle(triangle,width,offset);
  close(alpha,22.843204806313516);
  close(unitTriangleOffsetTwistOffset(triangle,width,alpha!),offset);
  // The exact polygon-tile constructor independently yields center/outer
  // side ratio 0.23183291466834566 and first-edge rotation 67.15679519°.
  close(unitTriangleOffsetTwistRotation(triangle,width,offset),67.15679519368648);
  close(unitTriangleOffsetTwistShrinkage(triangle,width,offset),.23183291466834566);
});

test('angle-offset round trip includes zero and negative offsets',()=>{
  const triangle:TriangleAngles=[20,80,80];
  for(const offset of [-.2,-.03,0,.03,.2]){
    const angle=unitTriangleOffsetTwistAngle(triangle,.12,offset);
    assert.ok(angle!==null&&angle>0&&angle<180);
    close(unitTriangleOffsetTwistOffset(triangle,.12,angle),offset);
    close(unitTriangleOffsetTwistRotation(triangle,.12,offset),90-angle);
  }
  close(unitTriangleOffsetTwistAngle(triangle,.12,0),90);
  close(unitTriangleOffsetTwistOffset(triangle,.12,90),0);
});

test('triangle-specific critical angle and M/V limits agree at the equilateral case',()=>{
  const equilateral:TriangleAngles=[60,60,60];
  assert.equal(unitTriangleOffsetTwistValid(equilateral,30,['M','M','M']),true);
  assert.equal(unitTriangleOffsetTwistValid(equilateral,30.001,['M','M','M']),false);
  assert.equal(unitTriangleOffsetTwistValid(equilateral,60,['M','M','V']),true);
  assert.equal(unitTriangleOffsetTwistValid(equilateral,60.001,['M','M','V']),false);
  const scalene:TriangleAngles=[20,80,80];
  assert.equal(unitTriangleOffsetTwistValid(scalene,20,['M','M','M']),false);
  assert.equal(unitTriangleOffsetTwistValid(scalene,20,['M','M','V']),true);
});

test('self-contained query combines assignment validity and the original one-third bound',()=>{
  const triangle:TriangleAngles=[50,60,70],width=.09,offset=.06;
  const alpha=unitTriangleOffsetTwistAngle(triangle,width,offset)!;
  assert.equal(unitTriangleOffsetTwistSelfContained(triangle,width,offset,['M','M','M']),true);
  assert.equal(unitTriangleOffsetTwistAngleSelfContained(triangle,width,alpha,['M','M','M']),true);
  assert.equal(unitTriangleOffsetTwistSelfContained(triangle,.3,offset,['M','M','M']),false);
  assert.equal(unitTriangleOffsetTwistSelfContained(triangle,width,offset,['M','V']),false);
  assert.equal(unitTriangleOffsetTwistSelfContained(triangle,width,.4,['M','M','M']),false);
});

test('invalid triangle and singular inputs never yield a finite-looking result',()=>{
  const invalid:TriangleAngles=[50,60,60],valid:TriangleAngles=[50,60,70];
  assert.equal(unitTriangleOffsetTwistAngle(invalid,.09,.06),null);
  assert.equal(unitTriangleOffsetTwistOffset(invalid,.09,45),null);
  assert.equal(unitTriangleOffsetTwistShrinkage(invalid,.09,.06),null);
  assert.equal(unitTriangleOffsetTwistRotation(invalid,.09,.06),null);
  assert.equal(unitTriangleOffsetTwistSelfContained(invalid,.09,.06,['M','M','M']),false);
  assert.equal(unitTriangleOffsetTwistAngle(valid,.09,Number.NaN),null);
  assert.equal(unitTriangleOffsetTwistAngle(valid,0,.06),null);
  assert.equal(unitTriangleOffsetTwistOffset(valid,.09,0),null);
  assert.equal(unitTriangleOffsetTwistOffset(valid,.09,180),null);
  assert.equal(unitTriangleOffsetTwistValid(valid,45,['M','X','V'] as unknown as ('M'|'V')[]),false);
});
