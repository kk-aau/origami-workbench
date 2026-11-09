import test from 'node:test';
import assert from 'node:assert/strict';
import {ANGLE_SETTINGS_KEY,defaultAngleSettings,validateAngleSettings,readAngleSettings,saveAngleSettings,activeAngleSystem} from '../../src/app/angleSettings';
test('all angle groups and current group roundtrip with a versioned dedicated key',()=>{
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 const settings=defaultAngleSettings();settings.active=3;settings.dividers=[16,9];settings.abc=[0,45,180];settings.def=[30,90,360];
 saveAngleSettings(settings,storage);assert.deepEqual(readAngleSettings(storage),settings);assert.deepEqual([...values.keys()],[ANGLE_SETTINGS_KEY]);assert.deepEqual(activeAngleSystem(readAngleSettings(storage)),{kind:'custom',angles:[30,90,360]});
});
test('defaults and validation return independent copies',()=>{
 const a=defaultAngleSettings(),b=defaultAngleSettings();a.abc[0]=10;assert.equal(b.abc[0],40);const c=validateAngleSettings(a);c.dividers[0]=20;assert.equal(a.dividers[0],12);
});
test('malformed, missing, unsupported and blocked storage safely fall back',()=>{
 for(const raw of [null,'{','null','[]','{}',JSON.stringify({version:2,settings:defaultAngleSettings()}),JSON.stringify({version:1,settings:{}})])assert.deepEqual(readAngleSettings({getItem:()=>raw}),defaultAngleSettings());
 assert.deepEqual(readAngleSettings({getItem:()=>{throw new Error('blocked');}}),defaultAngleSettings());
});
test('invalid inactive settings reject before writing and preserve previous storage',()=>{
 let calls=0;const storage={setItem:()=>{calls++;}};
 for(const mutate of [(s:any)=>s.active=4,(s:any)=>s.dividers[0]=2.5,(s:any)=>s.dividers[1]=0,(s:any)=>s.abc=[40,60],(s:any)=>s.def[0]=Infinity,(s:any)=>s.def[2]=361,(s:any)=>s.abc[0]='40']){
  const s=defaultAngleSettings();mutate(s);assert.throws(()=>saveAngleSettings(s,storage));
 }assert.equal(calls,0);
});
test('write failures propagate for user-visible notification, without modifying input',()=>{
 const s=defaultAngleSettings(),before=structuredClone(s);assert.throws(()=>saveAngleSettings(s,{setItem:()=>{throw new Error('quota');}}),/quota/);assert.deepEqual(s,before);
});
