import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveNamedDiagram} from '../../src/app/api';
import {projectFileBinding,rememberFileBinding,saveProjectFile,selectProjectFile} from '../../src/app/selectProjectFile';

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

test('diagram Save As encodes the filename chosen in the native window',async()=>{
 await withDesktop({isDesktop:true,saveNamedDiagram:async(proposed:string,encode:(selected:string)=>Promise<Blob>)=>{
   assert.equal(proposed,'旧名.zds');
   assert.equal(await (await encode('新名.zds')).text(),'新名.zds');
   return {status:'saved',path:'新名.zds'};
 }},async()=>{
   assert.deepEqual(await saveNamedDiagram('旧名.zds',async selected=>new Blob([selected!])),{status:'saved',path:'新名.zds'});
 });
});

test('file bindings survive a tab handoff and saving uses only the selected document receipt',async()=>{
 const writes:{name:string;id?:string;text:string}[]=[];
 await withDesktop({
   openProject:async()=>({name:'原文件.diagram.json',bytes:new Uint8Array([123,125]),binding:'opaque-receipt'}),
   saveExport:async(blob:Blob,name:string,options:{projectFile:boolean;binding?:string})=>{
     assert.equal(options.projectFile,true);
     writes.push({name,id:options.binding,text:await blob.text()});
     return {status:'saved',path:name,binding:options.binding??'copy-receipt'};
   },
 },async()=>{
   const source=(await selectProjectFile(null,'diagram'))!;
   const transferred=rememberFileBinding(new File([source],source.name),projectFileBinding(source));
   const current=await saveProjectFile('edited','重命名.zds',projectFileBinding(transferred));
   assert.equal(current.status,'saved');
   const copy=await saveProjectFile('copy','副本.zds');
   assert.ok(copy.status==='saved');
   await saveProjectFile('edited copy','副本.zds',copy.binding);
   assert.deepEqual(writes.map(w=>w.id),['opaque-receipt',undefined,'copy-receipt']);
   assert.deepEqual(writes.map(w=>w.text),['edited','copy','edited copy']);
 });
});
