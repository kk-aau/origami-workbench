import test from 'node:test';
import assert from 'node:assert/strict';
import {readTwistedPotParams,twistedPotPreset,twistedPotSavedPreset,
  twistedPotSmoothSavedPreset} from '../../src/app/twistedPotParams';
import {readTessParams} from '../../src/app/tessellation';

test('In[3521] fixed faceted thick profile loads every saved source input',()=>{
  const preset=twistedPotSavedPreset(3521);
  assert.deepEqual(preset.crossSection,[[0,0],[1,0],[1,.5],[1.5,1],[1,1.5],[1,2]]);
  assert.deepEqual([preset.sectors,preset.asymmetry,preset.goreTwist,preset.flangeRotationDeg,
    preset.border,preset.flatFlanges,preset.flangeInset],[12,1,1,25,'planar','faceted',.05]);
  assert.deepEqual(readTwistedPotParams(preset),preset);
  assert.deepEqual(readTessParams(structuredClone(preset)),preset);
  assert.deepEqual(twistedPotPreset(),{...preset,sectors:6,flangeRotationDeg:0,flangeInset:0});
});

test('In[3523] exact nine-point fine profile, six sectors and negative flange turn',()=>{
  const preset=twistedPotSavedPreset(3523);
  assert.deepEqual(preset.crossSection,[
    [0,0],[.201973165620801,0],
    [.24551521390921868,.04929828350861052],
    [.29103491611100674,.09719117040644294],
    [.3388464527060197,.14962845353074342],
    [.3844362844792038,.20295497962034656],
    [.42712836236230056,.2575101758008096],
    [.4701991399309364,.31986097513766437],
    [.5030814933671452,.37584120420889644],
  ]);
  assert.deepEqual([preset.sectors,preset.asymmetry,preset.goreTwist,preset.flangeRotationDeg,
    preset.border,preset.flatFlanges,preset.flangeInset],[6,1,1,-8,'planar','faceted',.05]);
  assert.deepEqual(readTwistedPotParams(preset),preset);
  assert.deepEqual(readTessParams(structuredClone(preset)),preset);
  preset.crossSection[1][0]=99;
  assert.equal(twistedPotSavedPreset(3523).crossSection[1][0],.201973165620801);
});

test('In[3522] fixed Smooth/Trimmed reference input keeps the faceted engineering state separate',()=>{
  const source=twistedPotSmoothSavedPreset();
  assert.deepEqual(source,{...twistedPotSavedPreset(3521),border:'trimmed'});
  assert.deepEqual([source.sectors,source.flangeRotationDeg,source.flangeInset],[12,25,.05]);
  assert.deepEqual(readTwistedPotParams(source),source);
  assert.equal(source.flatFlanges,'faceted');
  assert.equal(twistedPotSavedPreset(3521).border,'planar');
});
