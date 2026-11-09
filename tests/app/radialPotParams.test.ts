import assert from 'node:assert/strict';
import test from 'node:test';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';

test('Origamica In[3480] radial pot parameters persist through project restoration',()=>{
  const preset=tessPreset('radial-pot');
  assert.equal(preset.family,'radial-pot');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(preset))),preset);
  const changed=changeTessParams(preset,{sectors:6,asymmetry:.25,gapHalfAngleDeg:2,crossSection:[[0,0],[1,0],[1,1],[2,2]]});
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changed))),changed);
  assert.equal(readTessParams({...changed,paper:{shape:'square',margin:.1}}),null);
  const polygon=readTessParams({...preset,border:'polygon'});
  assert.deepEqual(polygon,{...preset,border:'polygon'});
  const circular=readTessParams({...preset,border:'circular',arcMaximumAngleDeg:10,arcDivisions:4,arcMethod:'circumscribed'});
  assert.ok(circular);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(circular))),circular);
  assert.deepEqual(readTessParams({...preset,border:'circular'}),
    {...preset,border:'circular',arcMaximumAngleDeg:5,arcDivisions:1,arcMethod:'inscribed'});
  assert.deepEqual(readTessParams({...preset,border:'circular',arcDirection:'CCW'}),
    {...preset,border:'circular',arcMaximumAngleDeg:5,arcDivisions:1,arcMethod:'inscribed'});
  for(const asymmetry of [-1,1]){
    const inset=readTessParams({...preset,asymmetry,gapHalfAngleDeg:0,flatFlangeInset:.1});
    assert.ok(inset);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(inset))),inset);
    const circularExtreme=readTessParams({...inset,border:'circular'});
    assert.deepEqual(circularExtreme,{...inset,border:'circular',arcMaximumAngleDeg:5,
      arcDivisions:1,arcMethod:'inscribed'});
  }
});

test('radial pot project reader rejects broken profile, unsupported boundary and nonfinite options',()=>{
  const preset=tessPreset('radial-pot');
  for(const patch of [
    {crossSection:[[0,0],[1,1],[1,0],[2,2]]},
    {crossSection:[[0,0],[1,1],[1,1],[2,2]]},
    {crossSection:[[0,0],[-1,1],[1,2]]},
    {sectors:17},{sectors:16,crossSection:Array.from({length:10},(_,i)=>[1+i,i])},
    {gapHalfAngleDeg:18},{asymmetry:Infinity},{border:'unknown'},
    {border:'circular',arcDivisions:0},
    {border:'circular',arcMethod:'unknown'},{border:'circular',arcMaximumAngleDeg:.5},
    {border:'circular',arcDirection:'CW'},{border:'circular',arcDirection:'unknown'},
    {border:'planar',arcDirection:'CCW'},
    {border:'planar',arcMaximumAngleDeg:5},
    {flatFlangeInset:.1},{flatFlangeInset:-.1},{flatFlangeInset:.6},
  ])assert.equal(readTessParams({...preset,...patch}),null);
});
