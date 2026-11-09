import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preferenceStorage,setPreferenceService} from '../../src/app/preferenceStorage';
import {readTheme,saveTheme} from '../../src/app/theme';
import {readAngleSettings,saveAngleSettings,defaultAngleSettings} from '../../src/app/angleSettings';

const storage=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
test('desktop preferences survive a new browser origin and migrate a current-origin value',()=>{
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const disk=storage(),firstOrigin=storage();firstOrigin.setItem('zhezhi.theme.v1',JSON.stringify({version:1,theme:'dark'}));
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,value:{desktop:{preferences:disk}}});
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:firstOrigin});
    assert.equal(readTheme(),'dark');
    const angles={...defaultAngleSettings(),active:2 as const,abc:[20,70,110] as [number,number,number]};
    saveAngleSettings(angles);saveTheme('light');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});
    assert.equal(readTheme(),'light');assert.deepEqual(readAngleSettings(),angles);
    assert.equal(preferenceStorage.getItem('zhezhi.theme.v1'),disk.getItem('zhezhi.theme.v1'));
    Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
    saveTheme('dark');assert.equal(readTheme(),'dark');assert.notEqual(localStorage.getItem('zhezhi.theme.v1'),disk.getItem('zhezhi.theme.v1'));
  }finally{
    if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');
    if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');
  }
});

test('local service preferences persist across browser origins and preserve disk values',()=>{
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),disk=storage(),legacy=storage();
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,value:{}});Object.defineProperty(globalThis,'localStorage',{configurable:true,value:legacy});
    legacy.setItem('zhezhi.theme.v1','legacy');disk.setItem('zhezhi.theme.v1','disk');setPreferenceService(disk);
    assert.equal(preferenceStorage.getItem('zhezhi.theme.v1'),'disk');preferenceStorage.setItem('zhezhi.angle-settings.v1','angles');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});assert.equal(preferenceStorage.getItem('zhezhi.angle-settings.v1'),'angles');
  }finally{setPreferenceService(undefined);if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('a failed disk write is reported without silently creating a divergent browser copy',()=>{
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),local=storage();
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,value:{}});Object.defineProperty(globalThis,'localStorage',{configurable:true,value:local});
    setPreferenceService({getItem:()=>null,setItem:()=>{throw Error('磁盘不可写');}});
    assert.throws(()=>preferenceStorage.setItem('zhezhi.theme.v1','new'),/磁盘不可写/);assert.equal(local.getItem('zhezhi.theme.v1'),null);
  }finally{setPreferenceService(undefined);if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');}
});
