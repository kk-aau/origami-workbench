import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFlasherParams} from '../../src/app/flasherParams';
import {readTessParams} from '../../src/app/tessellation';

const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/flasher-input-contract-20261010.json',import.meta.url),'utf8'));

test('only absent Flasher fields default; valid finite and integer JSON numbers keep their values',()=>{
  for(const c of cases.valid){
    assert.deepEqual(readFlasherParams(c.input),c.expected,c.name);
    assert.deepEqual(readTessParams(c.input),c.expected,c.name);
  }
  for(const c of cases.raw){
    assert.deepEqual(readFlasherParams(JSON.parse(c.text)),c.expected,c.name);
    assert.deepEqual(readTessParams(JSON.parse(c.text)),c.expected,c.name);
  }
});

test('explicit null, array, object, string and boolean values never silently default or coerce',()=>{
  for(const c of cases.invalid){
    assert.equal(readFlasherParams(c.input),null,c.name);
    assert.equal(readTessParams(c.input),null,c.name);
  }
  for(const key of Object.keys(cases.default).filter(key=>key!=='family')){
    assert.equal(readFlasherParams({family:'flasher',[key]:undefined}),null,`${key}-undefined`);
  }
  let called=false;
  assert.equal(readFlasherParams({family:'flasher',diagonal:{toString(){called=true;return 'Y';}}}),null);
  assert.equal(called,false,'untrusted diagonal must never be coerced');
});

test('all numeric fields reject nonfinite values before saved-parameter adoption',()=>{
  for(const key of ['rings','heightOrder','rotationalOrder','radialIncrement','minimumAngleDeg']){
    for(const value of [NaN,Infinity,-Infinity]){
      assert.equal(readFlasherParams({family:'flasher',[key]:value}),null,`${key}:${value}`);
      assert.equal(readTessParams({family:'flasher',[key]:value}),null,`${key}:${value}`);
    }
  }
});
