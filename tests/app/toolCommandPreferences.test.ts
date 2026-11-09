import test from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_COMMANDS} from '../../src/app/diagramCommands';
import {TOOL_COMMANDS,resolveToolCommand,type ToolCommand} from '../../src/app/toolCommands';
import {TOOL_COMMAND_PREFERENCES_KEY,TOOL_COMMAND_PREFERENCES_EVENT,applyToolCommandAliases,defaultToolCommandPreferences,findToolCommandAliasConflicts,parseToolCommandAliases,readToolCommandPreferences,saveToolCommandPreferences,type ToolCommandPreferences} from '../../src/app/toolCommandPreferences';

const memoryStorage=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
test('alias editor splits alternatives, normalizes full-width input and removes own duplicates',()=>{
  assert.deepEqual(parseToolCommandAliases(' ｚｚ，zz Zx\nＺＸ、画线;draw '),['ZZ','ZX','画线','DRAW']);
  assert.deepEqual(parseToolCommandAliases(' , ，　\t '),[]);
});

test('custom aliases replace defaults while the stable Chinese names and IDs always work',()=>{
  const preferences:ToolCommandPreferences={crease:{line:['DRAWTHIS']},diagram:{}};
  const commands=applyToolCommandAliases(TOOL_COMMANDS,'crease',preferences);
  assert.equal(resolveToolCommand('drawthis',commands)?.tool,'line');
  assert.equal(resolveToolCommand('L',commands),null);
  assert.equal(resolveToolCommand('线段',commands)?.tool,'line');
  assert.equal(resolveToolCommand('line',commands)?.tool,'line');
  assert.deepEqual(TOOL_COMMANDS.find(command=>command.tool==='line')?.aliases,['L','LINE'],'shared defaults stay unchanged');
  const cleared=applyToolCommandAliases(TOOL_COMMANDS,'crease',{crease:{line:[]},diagram:{}});
  assert.equal(resolveToolCommand('L',cleared),null);
  assert.equal(resolveToolCommand('线段',cleared)?.tool,'line');
  assert.equal(resolveToolCommand('LINE',cleared)?.tool,'line');
});

test('each workspace has its own aliases and restores defaults independently',()=>{
  const preferences:ToolCommandPreferences={crease:{line:['ZZ']},diagram:{'mirror-copy':['ZZ']}};
  assert.equal(resolveToolCommand('ZZ',applyToolCommandAliases(TOOL_COMMANDS,'crease',preferences))?.tool,'line');
  assert.equal(resolveToolCommand('ZZ',applyToolCommandAliases(DIAGRAM_COMMANDS,'diagram',preferences))?.tool,'mirror-copy');
  const restored={...preferences,diagram:{}};
  assert.equal(resolveToolCommand('MI',applyToolCommandAliases(DIAGRAM_COMMANDS,'diagram',restored))?.tool,'mirror-copy');
  assert.equal(resolveToolCommand('ZZ',applyToolCommandAliases(TOOL_COMMANDS,'crease',restored))?.tool,'line');
});

test('conflict detection protects names, IDs and other aliases after normalization',()=>{
  const catalog:readonly ToolCommand<string>[]=[{tool:'first',name:'甲功能',aliases:['ONE','ＯＮＥ','甲功能']},{tool:'second',name:'乙功能',aliases:['TWO']}];
  assert.deepEqual(findToolCommandAliasConflicts(catalog),[],'one function may repeat its own tokens');
  for(const alias of ['ｏｎｅ','first','甲功能']){
    const conflicts=findToolCommandAliasConflicts([catalog[0],{...catalog[1],aliases:[alias]}]);
    assert.equal(conflicts.length,1);
    assert.equal(conflicts[0].first.name,'甲功能');
    assert.equal(conflicts[0].second.name,'乙功能');
  }
  assert.deepEqual(findToolCommandAliasConflicts(TOOL_COMMANDS),[]);
  assert.deepEqual(findToolCommandAliasConflicts(DIAGRAM_COMMANDS),[]);
});

test('conflicting external preferences fall back to a safe complete catalog',()=>{
  for(const aliases of [['V'],['PAN'],['选择']]){
    const commands=applyToolCommandAliases(TOOL_COMMANDS,'crease',{crease:{line:aliases},diagram:{}});
    assert.equal(commands,TOOL_COMMANDS);
    assert.equal(resolveToolCommand('V',commands)?.tool,'select');
    assert.equal(resolveToolCommand('L',commands)?.tool,'line');
  }
  const stale=applyToolCommandAliases(TOOL_COMMANDS,'crease',{crease:{'removed-function':['L']},diagram:{}});
  assert.equal(resolveToolCommand('L',stale)?.tool,'line','obsolete IDs do not reserve tokens');
});

test('preferences round trip through the designated storage key and normalize saved tokens',()=>{
  const storage=memoryStorage();
  saveToolCommandPreferences({crease:{line:['ｚｚ','ZZ','zz2'],select:[]},diagram:{'mirror-copy':['MIR']}},storage);
  assert.deepEqual(readToolCommandPreferences(storage),{crease:{line:['ZZ','ZZ2'],select:[]},diagram:{'mirror-copy':['MIR']}});
  const stored=JSON.parse(storage.getItem(TOOL_COMMAND_PREFERENCES_KEY)!);
  assert.equal(stored.version,1);
  assert.deepEqual(stored.scopes.diagram,{'mirror-copy':['MIR']});
});

test('an explicitly empty shortcut survives reopening without promoting a remaining full command',()=>{
  const storage=memoryStorage();
  saveToolCommandPreferences({crease:{line:['LINE']},diagram:{},primary:{crease:{line:null}}},storage);
  const preferences=readToolCommandPreferences(storage),command=applyToolCommandAliases(TOOL_COMMANDS,'crease',preferences).find(item=>item.tool==='line')!;
  assert.deepEqual(preferences,{crease:{line:['LINE']},diagram:{},primary:{crease:{line:null}}});
  assert.equal(command.primary,null);
  assert.deepEqual(command.aliases,['LINE']);
  assert.equal(resolveToolCommand('L',[command]),null);
  assert.equal(resolveToolCommand('LINE',[command])?.tool,'line');
  assert.equal(resolveToolCommand('线段',[command])?.tool,'line');
  const stored=JSON.parse(storage.getItem(TOOL_COMMAND_PREFERENCES_KEY)!);
  assert.deepEqual(stored.primary,{crease:{line:null}});
  assert.equal(Object.hasOwn(stored.scopes,'primary'),false,'metadata stays alongside the original scopes envelope');
});

test('legacy custom shortcuts keep their first alias and legacy cleared aliases stay empty',()=>{
  const storage=memoryStorage(),legacy={crease:{line:['XL','LINE'],select:[]},diagram:{}};
  storage.setItem(TOOL_COMMAND_PREFERENCES_KEY,JSON.stringify({version:1,scopes:legacy}));
  const preferences=readToolCommandPreferences(storage),commands=applyToolCommandAliases(TOOL_COMMANDS,'crease',preferences);
  assert.deepEqual(preferences,legacy);
  assert.equal(Object.hasOwn(preferences,'primary'),false);
  const line=commands.find(item=>item.tool==='line')!,select=commands.find(item=>item.tool==='select')!;
  assert.equal(Object.hasOwn(line,'primary'),false);
  assert.equal(line.primary??line.aliases[0],'XL');
  assert.deepEqual(select.aliases,[]);
  assert.equal(resolveToolCommand('XL',commands)?.tool,'line');
  assert.equal(resolveToolCommand('L',commands),null);
});

test('explicit shortcuts normalize like aliases and can select an alias after the first',()=>{
  const storage=memoryStorage();
  saveToolCommandPreferences({crease:{line:['LINE','XL']},diagram:{},primary:{crease:{line:'ｘｌ'}}},storage);
  const preferences=readToolCommandPreferences(storage),command=applyToolCommandAliases(TOOL_COMMANDS,'crease',preferences).find(item=>item.tool==='line')!;
  assert.equal(preferences.primary?.crease?.line,'XL');
  assert.equal(command.primary,'XL');
  assert.deepEqual(command.aliases,['LINE','XL']);
  const defaultCommands=applyToolCommandAliases(TOOL_COMMANDS,'crease',{crease:{},diagram:{},primary:{crease:{line:'ｌ'}}});
  assert.equal(defaultCommands.find(item=>item.tool==='line')?.primary,'L','metadata may select an unchanged default alias');
});

test('clearing all aliases stays supported and restoring defaults removes shortcut metadata',()=>{
  const storage=memoryStorage();
  saveToolCommandPreferences({crease:{line:[]},diagram:{},primary:{crease:{line:null}}},storage);
  const cleared=applyToolCommandAliases(TOOL_COMMANDS,'crease',readToolCommandPreferences(storage)).find(item=>item.tool==='line')!;
  assert.equal(cleared.primary,null);
  assert.deepEqual(cleared.aliases,[]);
  assert.equal(resolveToolCommand('线段',[cleared])?.tool,'line');
  saveToolCommandPreferences({crease:{},diagram:{},primary:{crease:{}}},storage);
  assert.deepEqual(readToolCommandPreferences(storage),defaultToolCommandPreferences());
  assert.equal(Object.hasOwn(JSON.parse(storage.getItem(TOOL_COMMAND_PREFERENCES_KEY)!),'primary'),false);
  const restored=applyToolCommandAliases(TOOL_COMMANDS,'crease',readToolCommandPreferences(storage)).find(item=>item.tool==='line')!;
  assert.equal(restored.primary,undefined);
  assert.equal(restored.aliases[0],'L');
});

test('bad shortcut metadata is ignored without discarding usable custom aliases',()=>{
  const storage=memoryStorage(),scopes={crease:{line:['XL','LINE']},diagram:{}};
  for(const primary of [null,[],{crease:[]},{crease:{line:12}},{crease:{line:''}},{crease:{line:'A B'}},{crease:{line:'NOT-AN-ALIAS'}}]){
    storage.setItem(TOOL_COMMAND_PREFERENCES_KEY,JSON.stringify({version:1,scopes,primary}));
    assert.deepEqual(readToolCommandPreferences(storage),scopes,JSON.stringify(primary));
  }
  for(const primary of ['NOT-AN-ALIAS','A B','']){
    const commands=applyToolCommandAliases(TOOL_COMMANDS,'crease',{...scopes,primary:{crease:{line:primary}}}),line=commands.find(item=>item.tool==='line')!;
    assert.equal(Object.hasOwn(line,'primary'),false);
    assert.equal(resolveToolCommand('XL',commands)?.tool,'line');
  }
  const defaults=applyToolCommandAliases(TOOL_COMMANDS,'crease',{crease:{},diagram:{},primary:{crease:{line:'NOT-AN-ALIAS'}}});
  assert.equal(Object.hasOwn(defaults.find(item=>item.tool==='line')!,'primary'),false);
  assert.equal(resolveToolCommand('L',defaults)?.tool,'line');
});

test('saving invalid shortcut metadata rejects it before replacing persisted preferences',()=>{
  const storage=memoryStorage();
  saveToolCommandPreferences({crease:{line:['XL','LINE']},diagram:{},primary:{crease:{line:'XL'}}},storage);
  const previous=storage.getItem(TOOL_COMMAND_PREFERENCES_KEY);
  for(const primary of ['NOT-AN-ALIAS','A B',''])assert.throws(()=>saveToolCommandPreferences({crease:{line:['XL','LINE']},diagram:{},primary:{crease:{line:primary}}},storage),/简称设置无效/);
  assert.equal(storage.getItem(TOOL_COMMAND_PREFERENCES_KEY),previous);
});

test('malformed, unavailable and future-version data fall back to defaults',()=>{
  const storage=memoryStorage();
  assert.deepEqual(readToolCommandPreferences(storage),defaultToolCommandPreferences());
  for(const raw of ['{','null','[]','{"version":2,"scopes":{"crease":{},"diagram":{}}}',JSON.stringify({version:1,scopes:{crease:{line:12},diagram:{}}}),JSON.stringify({version:1,scopes:{crease:{line:['A B']},diagram:{}}}),JSON.stringify({version:1,scopes:{crease:[],diagram:{}}})]){
    storage.setItem(TOOL_COMMAND_PREFERENCES_KEY,raw);
    assert.deepEqual(readToolCommandPreferences(storage),defaultToolCommandPreferences(),raw);
  }
  assert.deepEqual(readToolCommandPreferences({getItem:()=>{throw Error('磁盘不可读');}}),defaultToolCommandPreferences());
});

test('successful saves notify listeners only after persistence; failed saves do not notify',()=>{
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),target=new EventTarget(),storage=memoryStorage();
  try {
    Object.defineProperty(globalThis,'window',{configurable:true,value:target});
    let notifications=0;
    target.addEventListener(TOOL_COMMAND_PREFERENCES_EVENT,()=>{notifications++;assert.ok(storage.getItem(TOOL_COMMAND_PREFERENCES_KEY));});
    saveToolCommandPreferences({crease:{line:['ZZ']},diagram:{}},storage);
    assert.equal(notifications,1);
    assert.throws(()=>saveToolCommandPreferences(defaultToolCommandPreferences(),{setItem:()=>{throw Error('磁盘不可写');}}),/磁盘不可写/);
    assert.equal(notifications,1);
    assert.deepEqual(readToolCommandPreferences(storage).crease,{line:['ZZ']});
  }finally{if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');}
});
