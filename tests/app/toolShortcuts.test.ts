import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultToolShortcuts,normalizeToolShortcut,validateToolShortcuts,setToolShortcut,matchToolShortcut,readToolShortcuts,saveToolShortcuts,TOOL_SHORTCUTS_KEY} from '../../src/app/toolShortcuts';
import {TOOL_NAMES,type Tool} from '../../src/app/tools';
test('retired unassigned preset cannot be activated; legacy bindings preserve other customizations',()=>{
 const legacy={'preset:U':'3','tool:circle':'Q'} as const;
 assert.equal(defaultToolShortcuts()['preset:U'],undefined);
 const migrated=validateToolShortcuts(legacy);
 assert.equal(migrated['preset:U'],undefined);
 assert.equal(migrated['tool:circle'],'Q');
 assert.equal(readToolShortcuts({getItem:()=>JSON.stringify({version:1,bindings:legacy})})['tool:circle'],'Q');
 assert.equal(matchToolShortcut({key:'3',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false},legacy),null);
});
test('all current tools accept bindings; defaults remain unless explicitly disabled',()=>{
 for(const tool of Object.keys(TOOL_NAMES) as Tool[]){const settings=setToolShortcut(defaultToolShortcuts(),`tool:${tool}`,'Shift+Q');assert.equal(settings[`tool:${tool}`],'Shift+Q');}
 const initial=defaultToolShortcuts(),next=setToolShortcut(initial,'tool:line',null);assert.equal(initial['tool:line'],'L');assert.equal(next['tool:line'],null);assert.equal(setToolShortcut(next,'tool:perpendicular','l')['tool:perpendicular'],'L');
 assert.throws(()=>setToolShortcut(initial,'tool:perpendicular','l'),/已分配/);
});
test('canonicalization rejects protected commands, malformed keys and unknown actions atomically',()=>{
 assert.equal(normalizeToolShortcut('shift + ctrl + q'),'Ctrl+Shift+Q');
 for(const key of ['Ctrl+S','Ctrl+Shift+Z','F5','Alt+Q','Ctrl+Ctrl+Q','Escape','Space','Delete','Shift+F12'])assert.throws(()=>normalizeToolShortcut(key));
 assert.throws(()=>validateToolShortcuts({'tool:fake':'Q'}),/未知/);assert.throws(()=>validateToolShortcuts([]),/格式/);assert.throws(()=>validateToolShortcuts({'tool:line':10}),/文字/);
});

test('Shift variants of foundational App commands cannot be assigned or restored as unreachable tools',()=>{
 for(const key of ['A','S','O','K','Z','Y'])for(const shift of ['', 'Shift+']){
  const chord='Ctrl+'+shift+key;assert.throws(()=>setToolShortcut(defaultToolShortcuts(),'tool:circle',chord),/基础操作/);
  assert.equal(matchToolShortcut({key:key.toLowerCase(),ctrlKey:true,metaKey:false,altKey:false,shiftKey:!!shift},{'tool:circle':chord}),null);
 }
 const raw=JSON.stringify({version:1,bindings:{'tool:circle':'Ctrl+Shift+O'}});assert.deepEqual(readToolShortcuts({getItem:()=>raw}),defaultToolShortcuts());
});
test('event matching respects modifiers, IME, auto repeat and AltGraph without stealing cancellation',()=>{
 const settings=setToolShortcut(defaultToolShortcuts(),'tool:perpendicular','Ctrl+Shift+Q'),base={key:'q',ctrlKey:true,metaKey:false,shiftKey:true,altKey:false};
 assert.equal(matchToolShortcut(base,settings),'tool:perpendicular');assert.equal(matchToolShortcut({...base,ctrlKey:false,metaKey:true},settings),'tool:perpendicular');
 assert.equal(matchToolShortcut({...base,key:'!',code:'Digit1',ctrlKey:false},setToolShortcut(settings,'tool:circle','Shift+1')),'tool:circle');
 for(const extra of [{repeat:true},{isComposing:true},{altKey:true},{defaultPrevented:true},{shiftKey:false},{getModifierState:()=>true},{key:'Escape'}])assert.equal(matchToolShortcut({...base,...extra},settings),null);
});
test('storage restores unbindings and validates before writing; corrupt data falls back and failures surface',()=>{
 let raw='';const storage={getItem:(key:string)=>{assert.equal(key,TOOL_SHORTCUTS_KEY);return raw;},setItem:(key:string,value:string)=>{assert.equal(key,TOOL_SHORTCUTS_KEY);raw=value;}};
 const settings=setToolShortcut(defaultToolShortcuts(),'tool:line',null);saveToolShortcuts(settings,storage);assert.deepEqual(readToolShortcuts(storage),settings);
 const previous=raw;assert.throws(()=>saveToolShortcuts({'tool:line':'V'},storage));assert.equal(raw,previous);
 for(const bad of ['{','{"version":2,"bindings":{}}','{"version":1,"bindings":{"tool:line":"V"}}']){raw=bad;assert.deepEqual(readToolShortcuts(storage),defaultToolShortcuts());}
 assert.throws(()=>saveToolShortcuts(settings,{setItem(){throw Error('quota');}}),/quota/);
});
