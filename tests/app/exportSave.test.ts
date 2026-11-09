import test from 'node:test';
import assert from 'node:assert/strict';
import {saveDownload,downloadBlob} from '../../src/app/api';

test('native export forwards the original Blob and preserves saved/cancelled/error results',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');const blob=new Blob(['DXF']);let result:{status:'saved';path:string}|{status:'cancelled'}={status:'cancelled'},failure=false;
  Object.defineProperty(globalThis,'window',{configurable:true,value:{desktop:{saveExport:async(value:Blob,name:string)=>{assert.equal(value,blob);assert.equal(name,'龙神.dxf');if(failure)throw Error('磁盘不可写');return result;}}}});
  try{assert.equal((await saveDownload(blob,'龙神.dxf')).status,'cancelled');result={status:'saved',path:'D:\\图纸\\龙神.dxf'};assert.deepEqual(await saveDownload(blob,'龙神.dxf'),result);failure=true;await assert.rejects(saveDownload(blob,'龙神.dxf'),/磁盘不可写/);}finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});

test('legacy callers still receive a visible export failure event when they ignore the returned promise',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),events:Event[]=[];
  Object.defineProperty(globalThis,'window',{configurable:true,value:{desktop:{saveExport:async()=>{throw Error('保存失败原因');}},dispatchEvent(event:Event){events.push(event);}}});
  try{await assert.rejects(downloadBlob(new Blob(['a']),'a.dxf'),/保存失败原因/);assert.equal(events.length,1);assert.equal(events[0].type,'zhezhi-export-error');assert.equal((events[0] as CustomEvent<string>).detail,'保存失败原因');}finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});

test('browser fallback reports only a requested download and releases its object URL later',async()=>{
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldTimer=globalThis.setTimeout;
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let clicked=0,revoked=0,release:(()=>void)|undefined;
  Object.defineProperty(globalThis,'window',{configurable:true,value:{}});Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({click(){clicked++;}})}});
  URL.createObjectURL=()=> 'blob:browser';URL.revokeObjectURL=()=>{revoked++;};globalThis.setTimeout=((callback:()=>void)=>{release=callback;return 1;}) as unknown as typeof setTimeout;
  try{assert.deepEqual(await saveDownload(new Blob(['DXF']),'a.dxf'),{status:'browser'});assert.equal(clicked,1);assert.equal(revoked,0);release!();assert.equal(revoked,1);}finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;globalThis.setTimeout=oldTimer;if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');}
});

test('recognized desktop hosts without a native export bridge fail visibly instead of starting browser downloads',async()=>{
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  let attemptedDownload=false;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){attemptedDownload=true;throw Error('Browser fallback must not run in a desktop host');}}});
  try{
    for(const runtime of [{desktop:{isDesktop:true}},{__TAURI_INTERNALS__:{invoke(){}}},{__TAURI__:{core:{invoke(){}}}}]){
      Object.defineProperty(globalThis,'window',{configurable:true,value:runtime});
      await assert.rejects(saveDownload(new Blob(['DXF']),'a.dxf'),/桌面保存接口.*重新打开/);
    }
    assert.equal(attemptedDownload,false);
  }finally{
    if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
    if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');
  }
});

test('same-origin simulator exports reuse the native parent bridge with its Blob realm and cancellation options',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  const blob=new Blob(['三维模型\n',new Uint8Array([0,255,17])],{type:'application/octet-stream'}),controller=new AbortController();
  const options={signal:controller.signal,onProgress:(_written:number,_total:number)=>{}};
  class ParentBlob extends Blob {}
  let calls=0;
  const parent={location:{origin:'http://127.0.0.1:15000'},Blob:ParentBlob,desktop:{isDesktop:true,async saveExport(value:Blob,name:string,received:typeof options){
    calls++;assert.ok(value instanceof ParentBlob);assert.equal(name,'模型.fold');assert.equal(value.type,blob.type);
    assert.deepEqual(new Uint8Array(await value.arrayBuffer()),new Uint8Array(await blob.arrayBuffer()));
    assert.equal(received,options);return {status:'saved',path:'D:\\图纸\\模型.fold'};
  }}};
  try{
    for(const markers of [{},{__TAURI_INTERNALS__:{invoke(){}}},{__TAURI__:{core:{invoke(){}}}}]){
      Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:parent.location.origin},parent,...markers}});
      assert.deepEqual(await saveDownload(blob,'模型.fold',options),{status:'saved',path:'D:\\图纸\\模型.fold'});
    }
    assert.equal(calls,3);
  }
  finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});

test('an iframe cannot silently download when its same-origin desktop parent has no save bridge',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'http://127.0.0.1:15000'},parent:{location:{origin:'http://127.0.0.1:15000'},desktop:{isDesktop:true}}}});
  try{await assert.rejects(saveDownload(new Blob(['data']),'model.fold'),/桌面保存接口/);}
  finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});

test('an already cancelled export never opens a picker or starts a browser download',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),controller=new AbortController();controller.abort();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{desktop:{isDesktop:true,saveExport(){throw Error('Cancelled export reached the picker');}}}});
  try{assert.deepEqual(await saveDownload(new Blob(['data']),'model.fold',{signal:controller.signal}),{status:'cancelled'});}
  finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});

test('a native iframe with an unmarked parent still rejects a missing save bridge',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{__TAURI_INTERNALS__:{},location:{origin:'http://127.0.0.1:15000'},parent:{location:{origin:'http://127.0.0.1:15000'}}}});
  try{await assert.rejects(saveDownload(new Blob(['data']),'model.fold'),/桌面保存接口/);}
  finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});
