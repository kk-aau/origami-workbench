import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';

test('Penrose original levels and boundary option restore without reinterpreting legacy projects',()=>{
 const old={...tessPreset('nonperiodic'),kind:'penrose',depth:2};assert.deepEqual(readTessParams(old),old);
 const entered=changeTessParams(tessPreset('nonperiodic'),{kind:'penrose'});
 assert.ok(entered.family==='nonperiodic');assert.equal(entered.penroseVersion,'origamica');assert.equal(entered.depth,1);
 for(let depth=0;depth<=7;depth++)for(const borderTriangles of [false,true]){
  const p={...entered,depth,borderTriangles};assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);
 }
 const switched=changeTessParams(entered,{kind:'voronoi'});assert.ok(!('penroseVersion' in switched)&&!('borderTriangles' in switched));
 for(const patch of [{depth:8},{depth:-1},{borderTriangles:0},{penroseVersion:'bad'},{kind:'voronoi'}])assert.equal(readTessParams({...entered,...patch}),null);
});
