import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectToolLayoutFile} from '../../src/app/selectToolLayoutFile';

async function withWindow(value:unknown,run:()=>Promise<void>){
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value});
 try{await run();}finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
}
test('layout import requests the native layout chooser and preserves UTF-8 JSON',async()=>{
 const content='{"模板":"常用"}',kinds:string[]=[];
 await withWindow({desktop:{openProject:async(kind:string)=>{kinds.push(kind);return{name:'常用.tool-layout.json',bytes:new TextEncoder().encode(content)};}}},async()=>{
  const file=await selectToolLayoutFile();assert.equal(file?.name,'常用.tool-layout.json');assert.equal(await file?.text(),content);assert.deepEqual(kinds,['tool-layout']);
 });
});
test('native layout cancel and read failure never open a browser chooser',async()=>{
 await withWindow({desktop:{openProject:async()=>null}},async()=>assert.equal(await selectToolLayoutFile(),null));
 await withWindow({desktop:{openProject:async()=>{throw Error('无法读取排版');}}},async()=>assert.rejects(selectToolLayoutFile(),/无法读取排版/));
});
test('missing native layout bridge is reported for every desktop marker',async()=>{
 for(const runtime of [{desktop:{isDesktop:true}},{__TAURI_INTERNALS__:{}},{__TAURI__:{}}])await withWindow(runtime,async()=>assert.rejects(selectToolLayoutFile(),/桌面文件选择接口未就绪/));
});
