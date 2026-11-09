import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmAction} from '../../src/app/confirmAction';
async function withWindow(value:unknown,run:()=>void|Promise<void>){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value});
  try{await run();}finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
}
test('desktop confirmation preserves sequential accept/cancel without calling Chromium confirm',async()=>{
  const messages:string[]=[],answers=[true,false];
  await withWindow({confirm:()=>{throw Error('must use native bridge');},desktop:{confirm:(message:string)=>{messages.push(message);return answers.shift();}}},()=>{
    assert.equal(confirmAction('discard document'),true);assert.equal(confirmAction('discard models'),false);
    assert.deepEqual(messages,['discard document','discard models']);
  });
});
test('browser and older desktop bridges preserve ordinary confirmation',async()=>{
  for(const desktop of [undefined,{isDesktop:true}])await withWindow({confirm:(message:string)=>message==='accept',desktop},()=>{
    assert.equal(confirmAction('accept'),true);assert.equal(confirmAction('cancel'),false);
  });
});
test('failed or malformed native confirmation never approves or opens another prompt',async()=>{
  for(const confirm of [()=>{throw Error('closed');},()=>undefined,()=>1])await withWindow({confirm:()=>{throw Error('must not fallback');},desktop:{confirm}},()=>{
    assert.equal(confirmAction('replace document'),false);
  });
});
