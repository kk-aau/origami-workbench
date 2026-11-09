import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultTheme, readTheme, saveTheme, validateTheme} from '../../src/app/theme';

test('theme settings roundtrip and safe fallback',()=>{
  const store=new Map<string,string>(),storage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}};
  saveTheme('dark',storage);assert.equal(readTheme(storage),'dark');assert.equal(defaultTheme(),'light');
  store.set('zhezhi.theme.v1','{"version":1,"theme":"neon"}');assert.equal(readTheme(storage),'light');
});

test('theme validation only accepts supported values',()=>{assert.equal(validateTheme('light'),'light');assert.equal(validateTheme('dark'),'dark');assert.throws(()=>validateTheme('neon'),/主题设置无效/);});
