import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultDisplayLayers, readDisplayLayers, saveDisplayLayers, validateDisplayLayers} from '../../src/app/displayLayers';

test('display layer settings roundtrip and fall back safely',()=>{
 const store=new Map<string,string>(),storage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}};
 const next={main:false,auxiliary:true,marks:false,comments:false};saveDisplayLayers(next,storage);assert.deepEqual(readDisplayLayers(storage),next);assert.deepEqual(defaultDisplayLayers(),{main:true,auxiliary:true,marks:true,comments:true});
 store.set('zhezhi.display-layers.v1','{"version":1,"settings":{"main":false}}');assert.deepEqual(readDisplayLayers(storage),defaultDisplayLayers());
});

test('display layer validation rejects non-boolean fields',()=>{assert.throws(()=>validateDisplayLayers({main:true,auxiliary:'yes',marks:true}),/必须是布尔值/);assert.throws(()=>validateDisplayLayers({main:true,auxiliary:true,marks:true,comments:'yes'}),/文字显示设置/);});
