import {test} from 'node:test';
import assert from 'node:assert/strict';
import {angleRegisterValue,emptyMeasurements,measureAngle,measureLength,resolveMeasurementValue,setMeasurement} from '../../src/app/measurements';
test('length reports physical mm separately from grid units, including zero distance',()=>{
  assert.deepEqual(measureLength([0,0],[30,40],25),{mm:50,grid:2,gridStepMm:25});
  assert.deepEqual(measureLength([-100,-100],[-100,-100],50),{mm:0,grid:0,gridStepMm:50});
  assert.equal(measureLength([0,0],[400,0],400/8).grid,8);
  assert.equal(measureLength([0,0],[200,0],200/8).grid,8);
});
test('length rejects invalid coordinates and invalid grid units',()=>{
  for(const step of [0,-1,NaN,Infinity,Number.MIN_VALUE])assert.throws(()=>measureLength([0,0],[100,0],step));
  assert.throws(()=>measureLength([NaN,0],[1,0],25));assert.throws(()=>measureLength([0,0],[1e7,0],25));
});
test('angle registers preserve their different wrapping thresholds',()=>{
  assert.equal(angleRegisterValue(180,'A1'),180);assert.equal(angleRegisterValue(181,'A1'),-179);
  assert.equal(angleRegisterValue(270,'A2'),270);assert.equal(angleRegisterValue(280,'A2'),280);assert.equal(angleRegisterValue(281,'A2'),-79);
  assert.equal(angleRegisterValue(359,'A3'),359);assert.equal(angleRegisterValue(360,'A3'),360);
  assert.equal(angleRegisterValue(270,'A1'),-90);
});
test('three-point directed angle uses second point as vertex and reverses with arms',()=>{
  assert.equal(measureAngle([1,0],[0,0],[0,1],'A1'),-90);
  assert.equal(measureAngle([1,0],[0,0],[0,1],'A2'),270);
  assert.equal(measureAngle([1,0],[0,0],[0,1],'A3'),270);
  assert.equal(measureAngle([0,1],[0,0],[1,0],'A1'),90);
  assert.equal(measureAngle([1,0],[0,0],[-1,0],'A1'),180);
  assert.equal(measureAngle([1,0],[0,0],[2,0],'A1'),0);
  assert.equal(measureAngle([-10,-9],[-10,-10],[-9,-10],'A1'),90);
});
test('degenerate angles are errors rather than upstream sentinel-derived nonsense',()=>{
  assert.throws(()=>measureAngle([0,0],[0,0],[1,0],'A1'));
  assert.throws(()=>measureAngle([1,0],[0,0],[0,0],'A2'));
  for(const n of [NaN,Infinity,-1,361])assert.throws(()=>angleRegisterValue(n,'A3'));
  assert.throws(()=>angleRegisterValue(30,'invalid' as never));
});
test('register updates are immutable, independent, and no-op retains identity',()=>{
  const initial=emptyMeasurements(),changed=setMeasurement(initial,'L1',2);
  assert.equal(initial.L1,0);assert.equal(changed.L1,2);assert.equal(changed.L2,0);
  assert.equal(setMeasurement(changed,'L1',2),changed);assert.equal(emptyMeasurements().L1,0);
  assert.equal(setMeasurement(changed,'A1',-90).A1,-90);
  assert.throws(()=>setMeasurement(initial,'L2',-1));assert.throws(()=>setMeasurement(initial,'A1',NaN));
});
test('numeric fields can resolve all five exact tokens, decimal or scientific literals',()=>{
  const values={L1:2,L2:Math.sqrt(2),A1:-90,A2:270,A3:359};
  for(const key of ['L1','L2','A1','A2','A3'] as const)assert.equal(resolveMeasurementValue(' '+key+' ',values),values[key]);
  for(const [text,value] of [['1.25',1.25],['-.5',-.5],['+2e-3',.002],['3.',3],['0',0]] as const)assert.equal(resolveMeasurementValue(text,values),value);
});
test('untrusted expression input is rejected, never evaluated or silently converted',()=>{
  for(const text of ['', ' ', 'L1+L2', 'l1', 'A4', '0x10','NaN','Infinity','1e309','1/2','globalThis.x=1','2 mm'])assert.throws(()=>resolveMeasurementValue(text,emptyMeasurements()));
  assert.throws(()=>resolveMeasurementValue('L1',{...emptyMeasurements(),L1:NaN}));
});
