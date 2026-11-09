import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectProjectFile} from '../../src/app/selectProjectFile';

async function withDesktop(desktop:unknown,run:()=>Promise<void>){
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{desktop}});
 try{await run();}finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
}
test('browser and older desktop builds keep the synchronous file input fallback',async()=>{
 for(const desktop of [undefined,{isDesktop:true}])await withDesktop(desktop,async()=>{
  let clicked=0;const pending=selectProjectFile({click:()=>clicked++});
  assert.equal(clicked,1,'browser chooser must still run during the user gesture');
  assert.equal(await pending,null);
 });
});
test('desktop project chooser preserves file name and binary bytes on repeated imports',async()=>{
 const kinds:string[]=[],bytes=new Uint8Array([0,255,128,13,10]);
 await withDesktop({openProject:async(kind:string)=>{kinds.push(kind);return {name:'中文工程.orh',bytes};}},async()=>{
  const input={click:()=>{throw Error('Desktop must not trigger a Chromium chooser');}};
  const first=await selectProjectFile(input),second=await selectProjectFile(input,'diagram');
  assert.equal(first?.name,'中文工程.orh');assert.notEqual(first,second);
  assert.deepEqual(new Uint8Array(await first!.arrayBuffer()),bytes);
  assert.deepEqual(kinds,['crease','diagram']);
 });
});
test('cancelled desktop selection does not fall back to another chooser and errors remain actionable',async()=>{
 await withDesktop({openProject:async()=>null},async()=>{
  assert.equal(await selectProjectFile({click:()=>assert.fail('No second chooser after cancelling')}),null);
 });
 await withDesktop({openProject:async()=>{throw Error('无法读取所选文件');}},async()=>{
  await assert.rejects(selectProjectFile(null),/无法读取所选文件/);
 });
});
