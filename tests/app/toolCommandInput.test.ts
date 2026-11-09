import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readToolCommandInput,saveToolCommandInput,toolCommandCharacter,TOOL_COMMAND_INPUT_CHANGED} from '../../src/app/toolCommandInput';

function preferences(run:(data:Map<string,string>,events:EventTarget)=>void){
  const windowBefore=Object.getOwnPropertyDescriptor(globalThis,'window'),storageBefore=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const data=new Map<string,string>(),events=new EventTarget();
  Object.defineProperty(globalThis,'window',{configurable:true,value:events});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)}});
  try{run(data,events);}finally{if(windowBefore)Object.defineProperty(globalThis,'window',windowBefore);else Reflect.deleteProperty(globalThis,'window');if(storageBefore)Object.defineProperty(globalThis,'localStorage',storageBefore);else Reflect.deleteProperty(globalThis,'localStorage');}
}

test('CAD direct input defaults on and both workspaces receive changes only after persistence',()=>preferences((data,events)=>{
  const key='zhezhi.tool-command-input.v1';assert.equal(readToolCommandInput(),true);
  const received:boolean[]=[];events.addEventListener(TOOL_COMMAND_INPUT_CHANGED,()=>received.push(readToolCommandInput()));
  saveToolCommandInput(false);assert.deepEqual(received,[false]);assert.equal(readToolCommandInput(),false);
  saveToolCommandInput(true);assert.deepEqual(received,[false,true]);
  for(const raw of ['{','null','{"version":2,"direct":false}','{"version":1,"direct":"false"}']){data.set(key,raw);assert.equal(readToolCommandInput(),true);}
}));

test('failed direct-input preference writes do not announce an unpersisted setting',()=>preferences((_data,events)=>{
  let notifications=0;events.addEventListener(TOOL_COMMAND_INPUT_CHANGED,()=>notifications++);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw new Error('disk failure');}}});
  assert.throws(()=>saveToolCommandInput(false),/disk failure/);assert.equal(notifications,0);
}));

test('only normal alphabetic input starts a command, including the Windows 229 composition guard',()=>{
  const key={key:'l',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false};
  assert.equal(toolCommandCharacter(key),'l');assert.equal(toolCommandCharacter({...key,key:'L',shiftKey:true}),'L');
  for(const patch of [{isComposing:true},{keyCode:229},{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true},{defaultPrevented:true},{getModifierState:()=>true},{key:'Enter'},{key:'1'}])assert.equal(toolCommandCharacter({...key,...patch}),null);
});
