import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';

test('prune bounds remain parametric across size, angle and saved project changes',()=>{
  const boundary=[[.2,.2],[1.8,.2],[1.8,1.8],[.2,1.8]];
  const p=readTessParams({...tessPreset('periodic'),pruneBoundary:boundary,dualTargets:[[0,0],[1,1]]})!;
  assert.deepEqual(p.pruneBoundary,boundary);
  const angle=changeTessParams(p,{angle:42}),size=changeTessParams(angle,{rows:5});
  assert.deepEqual(size.pruneBoundary,boundary);
  assert.ok(!('dualTargets' in size));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(size))),size);
  assert.equal(readTessParams({...p,pruneBoundary:[[0,0],[1,0],[.2,.2],[0,1]]}),null);
  assert.equal(readTessParams({...tessPreset('twist'),pruneBoundary:boundary}),null);
  assert.equal(readTessParams({...p,pruneBoundary:undefined})?.pruneBoundary,undefined);
});
