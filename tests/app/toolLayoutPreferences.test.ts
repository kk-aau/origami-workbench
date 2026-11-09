import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ALL_DOCK_GROUPS,LEFT_MAIN_GROUPS,LEFT_EXTRA_GROUPS,RIGHT_DOCK_GROUPS,TOOL_CATEGORY_GROUPS} from '../../src/app/orieditaToolLayout';
import {TOOL_GUIDES} from '../../src/app/tools';
import {TOOL_LAYOUT_PREFERENCES_KEY,TOOL_LAYOUT_ITEM_IDS,TOOL_LAYOUT_ACTIONS,MAX_TOOL_LAYOUT_TEMPLATES,
  defaultToolLayoutPreferences,readToolLayoutPreferences,saveToolLayoutPreferences,validateToolLayoutPreferences,activeToolLayoutTemplate,
  selectToolLayoutTemplate,copyToolLayoutTemplate,createToolLayoutTemplate,renameToolLayoutTemplate,deleteToolLayoutTemplate,updateToolLayoutTemplate,moveToolLayoutItem,moveToolLayoutGroup,
  returnToolLayoutItemToPool,returnToolLayoutGroupToPool,
  type ToolLayoutPreferences,type ToolLayoutTemplate} from '../../src/app/toolLayoutPreferences';

function memoryStorage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}
function complete(template:ToolLayoutTemplate){
  const ids=[...template.groups.flatMap(group=>group.items),...template.unassigned];
  assert.equal(new Set(ids).size,ids.length,'every tool and action appears once');
  assert.deepEqual([...ids].sort(),[...TOOL_LAYOUT_ITEM_IDS].sort(),'no tool or check action is missing');
}

test('default task categories preserve every tool and check action once in the left panel',()=>{
  const preferences=defaultToolLayoutPreferences(),current=activeToolLayoutTemplate(preferences);
  assert.equal(preferences.version,1);assert.equal(preferences.activeId,'default');
  assert.deepEqual(preferences.templates.map(item=>[item.id,item.name]),[['default','默认'],['swapped','左右对调'],['all-left','全部左侧']]);
  assert.deepEqual(current.columns,{left:0,right:0});
  assert.equal(preferences.columnSizingVersion,1);
  assert.deepEqual(current.unassigned,[]);
  assert.deepEqual(current.groups.map(group=>group.name),['类型','选择','绘制','高级','删除','复制与移动','变换','修复','注释','生成','测量','整理与检查']);
  assert.ok(current.groups.every(group=>group.side==='left'));
  assert.deepEqual(current.groups.find(group=>group.id==='types')!.items,TOOL_CATEGORY_GROUPS[0].tools);
  const right=current.groups.filter(group=>group.side==='right');
  assert.deepEqual(right,[]);
  assert.deepEqual(current.groups.find(group=>group.id==='checks')!.items,['action:check','action:duplicates','action:merge','action:cross-merge','action:fold-conflicts','action:empty-branches','regioncheck']);
  const dockIds=ALL_DOCK_GROUPS.flatMap(group=>group.tools);
  assert.equal(new Set(dockIds).size,dockIds.length);assert.deepEqual([...dockIds].sort(),Object.keys(TOOL_GUIDES).sort());
  assert.deepEqual(new Set(TOOL_LAYOUT_ITEM_IDS),new Set([...Object.keys(TOOL_GUIDES),...TOOL_LAYOUT_ACTIONS.map(action=>action.id)]));
  preferences.templates.forEach(complete);
});

test('swapped and all-left presets retain original group and item order without sharing mutable arrays',()=>{
  const [normal,swapped,allLeft]=defaultToolLayoutPreferences().templates;
  assert.deepEqual(swapped.columns,{left:0,right:0});
  for(let index=0;index<normal.groups.length;index++){
    assert.deepEqual(swapped.groups[index].items,normal.groups[index].items);
    assert.equal(swapped.groups[index].side,normal.groups[index].side==='left'?'right':'left');
    assert.equal(allLeft.groups[index].side,'left');assert.deepEqual(allLeft.groups[index].items,normal.groups[index].items);
    assert.notEqual(swapped.groups[index].items,normal.groups[index].items);assert.notEqual(allLeft.groups[index].items,normal.groups[index].items);
  }
  normal.groups.find(group=>group.id==='drawing')!.items.pop();assert.deepEqual(defaultToolLayoutPreferences().templates[1],swapped);
});

test('saved layouts roundtrip through preferenceStorage-compatible access with their chosen active template and order',()=>{
  const storage=memoryStorage();
  const moved=moveToolLayoutItem(defaultToolLayoutPreferences(),'line','transform',1);
  const preferences=renameToolLayoutTemplate(selectToolLayoutTemplate(moved,'all-left'),'all-left',' 单侧工具箱 '),snapshot=structuredClone(preferences);
  saveToolLayoutPreferences(preferences,storage);
  assert.deepEqual(readToolLayoutPreferences(storage),preferences);assert.deepEqual(preferences,snapshot);
  assert.equal(JSON.parse(storage.getItem(TOOL_LAYOUT_PREFERENCES_KEY)!).version,1);
  const reopened=readToolLayoutPreferences(storage);reopened.templates[0].groups.find(group=>group.id==='drawing')!.items.pop();
  assert.deepEqual(readToolLayoutPreferences(storage),preferences);
  const unavailable={getItem:()=>{throw Error('读取失败');}};assert.deepEqual(readToolLayoutPreferences(unavailable),defaultToolLayoutPreferences());
  assert.throws(()=>saveToolLayoutPreferences(preferences,{setItem:()=>{throw Error('写入失败');}}),/写入失败/);
});

test('reading older layouts removes retired and duplicate tools while restoring new tools without losing custom placement',()=>{
  const saved=defaultToolLayoutPreferences(),current=saved.templates[0];
  for(const template of saved.templates)delete (template as Partial<ToolLayoutTemplate>).unassigned;
  current.groups.unshift({id:'favorites',name:'常用',side:'right',items:['line','retired-tool','action:obsolete']});
  for(const group of current.groups)group.items=group.items.filter(item=>item!=='circle3'&&item!=='action:merge');
  saved.activeId='removed-template';
  const storage=memoryStorage();storage.setItem(TOOL_LAYOUT_PREFERENCES_KEY,JSON.stringify(saved));
  const reopened=readToolLayoutPreferences(storage),first=reopened.templates[0];
  assert.equal(reopened.activeId,first.id);assert.deepEqual(first.groups[0],{id:'favorites',name:'常用',side:'right',items:['line']});
  assert.ok(!first.groups.find(group=>group.id==='drawing')!.items.includes('line'));
  assert.ok(first.groups.find(group=>group.id==='advanced')!.items.includes('circle3'));
  assert.ok(first.groups.find(group=>group.id==='checks')!.items.includes('action:merge'));
  assert.deepEqual(first.unassigned,[]);
  reopened.templates.forEach(complete);
});

test('new templates retain empty default categories on the left and the complete tool pool survives save and reopen',()=>{
  const original=defaultToolLayoutPreferences(),snapshot=structuredClone(original);
  const created=createToolLayoutTemplate(original,undefined,()=> 'empty-layout'),current=activeToolLayoutTemplate(created);
  assert.equal(created.activeId,'empty-layout');assert.equal(current.name,'新排版');
  assert.deepEqual(current.columns,{left:0,right:0});assert.deepEqual(current.groups,original.templates[0].groups.map(group=>({...group,items:[]})));
  assert.ok(current.groups.every(group=>group.side==='left'&&group.items.length===0));
  assert.deepEqual(current.unassigned,TOOL_LAYOUT_ITEM_IDS);complete(current);
  assert.deepEqual(original,snapshot);assert.deepEqual(created.templates.slice(0,-1),original.templates);
  assert.notEqual(current.unassigned,TOOL_LAYOUT_ITEM_IDS);
  const storage=memoryStorage();saveToolLayoutPreferences(created,storage);
  const reopened=readToolLayoutPreferences(storage);
  assert.deepEqual(reopened,created);assert.deepEqual(activeToolLayoutTemplate(reopened).groups,current.groups);
  assert.deepEqual(activeToolLayoutTemplate(reopened).unassigned,TOOL_LAYOUT_ITEM_IDS);
  activeToolLayoutTemplate(reopened).unassigned.pop();
  assert.deepEqual(readToolLayoutPreferences(storage),created);
});

test('reading pool-aware layouts restores newly missing tools to the pool while keeping both sidebars empty',()=>{
  const saved=createToolLayoutTemplate(defaultToolLayoutPreferences(),undefined,()=> 'pool-layout'),current=activeToolLayoutTemplate(saved);
  current.unassigned=current.unassigned.filter(item=>item!=='line'&&item!=='circle3'&&item!=='action:merge');
  const remaining=[...current.unassigned],storage=memoryStorage();storage.setItem(TOOL_LAYOUT_PREFERENCES_KEY,JSON.stringify(saved));
  const reopened=readToolLayoutPreferences(storage),repaired=activeToolLayoutTemplate(reopened);
  assert.equal(reopened.activeId,'pool-layout');assert.deepEqual(repaired.groups,current.groups);
  assert.deepEqual(repaired.unassigned.slice(0,remaining.length),remaining);
  assert.deepEqual(new Set(repaired.unassigned.slice(remaining.length)),new Set(['line','circle3','action:merge']));
  complete(repaired);assert.doesNotThrow(()=>saveToolLayoutPreferences(reopened,storage));
});

test('pool tools and check actions move exclusively into either sidebar and return at the requested pool position',()=>{
  const created=createToolLayoutTemplate(defaultToolLayoutPreferences(),'空白工作区',()=> 'pool-layout');
  const original=updateToolLayoutTemplate(created,'pool-layout',{groups:[
    {id:'left-custom',name:'左侧常用',side:'left',items:[]},
    {id:'right-custom',name:'右侧检查',side:'right',items:[]},
  ]}),snapshot=structuredClone(original);
  const withTool=moveToolLayoutItem(original,'line','left-custom',0);
  const placed=moveToolLayoutItem(withTool,'action:check','right-custom',0),current=activeToolLayoutTemplate(placed);
  assert.deepEqual(current.groups.map(group=>group.items),[['line'],['action:check']]);
  assert.ok(!current.unassigned.includes('line'));assert.ok(!current.unassigned.includes('action:check'));complete(current);
  const returned=returnToolLayoutItemToPool(placed,'line',1),returnedCurrent=activeToolLayoutTemplate(returned);
  assert.deepEqual(returnedCurrent.groups[0].items,[]);assert.equal(returnedCurrent.unassigned[1],'line');
  assert.deepEqual(returnedCurrent.groups[1].items,['action:check']);complete(returnedCurrent);
  assert.deepEqual(original,snapshot);assert.deepEqual(returned.templates.slice(0,-1),original.templates.slice(0,-1));
  const storage=memoryStorage();saveToolLayoutPreferences(returned,storage);
  assert.deepEqual(readToolLayoutPreferences(storage),returned);
});

test('repeated pool and sidebar transfers never duplicate a tool or restore it to its former group',()=>{
  const original=defaultToolLayoutPreferences(),snapshot=structuredClone(original);
  let preferences=original;
  for(let index=0;index<5;index++){
    preferences=returnToolLayoutItemToPool(preferences,'line');
    preferences=returnToolLayoutItemToPool(preferences,'line',0);
    let current=activeToolLayoutTemplate(preferences);
    assert.deepEqual(current.unassigned,['line']);
    assert.ok(current.groups.every(group=>!group.items.includes('line')));complete(current);
    preferences=moveToolLayoutItem(preferences,'line','transform',index);
    current=activeToolLayoutTemplate(preferences);
    assert.deepEqual(current.unassigned,[]);
    assert.equal(current.groups.find(group=>group.id==='transform')!.items.filter(item=>item==='line').length,1);
    assert.ok(!current.groups.find(group=>group.id==='drawing')!.items.includes('line'));complete(current);
  }
  assert.deepEqual(original,snapshot);
  assert.doesNotThrow(()=>saveToolLayoutPreferences(preferences,memoryStorage()));
});

test('returning a group appends its tools in order and copied templates keep independent pools',()=>{
  const original=defaultToolLayoutPreferences(),groupItems=[...original.templates[0].groups.find(group=>group.id==='checks')!.items];
  const withPool=returnToolLayoutItemToPool(original,'line');
  const returned=returnToolLayoutGroupToPool(withPool,'checks'),current=activeToolLayoutTemplate(returned);
  assert.ok(!current.groups.some(group=>group.id==='checks'));
  assert.deepEqual(current.unassigned,['line',...groupItems]);complete(current);
  const snapshot=structuredClone(returned),copied=copyToolLayoutTemplate(returned,'default','工具池副本',()=> 'pool-copy');
  assert.deepEqual(activeToolLayoutTemplate(copied).unassigned,current.unassigned);
  assert.notEqual(activeToolLayoutTemplate(copied).unassigned,copied.templates[0].unassigned);
  assert.notEqual(activeToolLayoutTemplate(copied).groups,copied.templates[0].groups);
  const edited=moveToolLayoutItem(copied,'action:check','transform',0);
  assert.ok(!activeToolLayoutTemplate(edited).unassigned.includes('action:check'));
  assert.deepEqual(edited.templates[0],current);assert.deepEqual(returned,snapshot);
  edited.templates.forEach(complete);
  const storage=memoryStorage();saveToolLayoutPreferences(edited,storage);assert.deepEqual(readToolLayoutPreferences(storage),edited);
});

test('save rejects malformed, unknown, duplicate and missing pool entries before replacing saved preferences',()=>{
  const original=createToolLayoutTemplate(defaultToolLayoutPreferences(),undefined,()=> 'pool-layout'),storage=memoryStorage();
  saveToolLayoutPreferences(original,storage);const before=storage.getItem(TOOL_LAYOUT_PREFERENCES_KEY);
  for(const change of [
    (value:ToolLayoutTemplate)=>{value.unassigned.push('unknown-tool');},
    (value:ToolLayoutTemplate)=>{value.unassigned.push('line');},
    (value:ToolLayoutTemplate)=>{value.unassigned.shift();},
    (value:ToolLayoutTemplate)=>{value.unassigned=[1] as never;},
    (value:ToolLayoutTemplate)=>{value.unassigned='line' as never;},
    (value:ToolLayoutTemplate)=>{value.groups.push({id:'duplicate',name:'重复工具',side:'left',items:['line']});},
  ]){
    const value=structuredClone(original);change(activeToolLayoutTemplate(value));
    assert.throws(()=>saveToolLayoutPreferences(value,storage));assert.equal(storage.getItem(TOOL_LAYOUT_PREFERENCES_KEY),before);
  }
  assert.deepEqual(readToolLayoutPreferences(storage),original);
});

test('missing groups recover on the existing single side and empty destination groups remain available',()=>{
  const preferences=defaultToolLayoutPreferences(),current=preferences.templates[2];
  delete (current as Partial<ToolLayoutTemplate>).unassigned;
  current.groups=current.groups.filter(group=>group.id!=='marks');current.groups.push({id:'empty-folder',name:'预留',side:'left',items:[]});
  const repaired=validateToolLayoutPreferences(preferences).templates[2];
  assert.ok(repaired.groups.every(group=>group.side==='left'));assert.deepEqual(repaired.groups.find(group=>group.id==='empty-folder')!.items,[]);complete(repaired);
  delete (preferences.templates[0] as Partial<ToolLayoutTemplate>).unassigned;
  preferences.templates[0].groups=[];const recovered=validateToolLayoutPreferences(preferences).templates[0];
  // Missing-tool recovery adds only groups containing tools. The empty Types
  // group has independent drawing controls and is retained when saved normally.
  assert.deepEqual(recovered.groups,defaultToolLayoutPreferences().templates[0].groups.filter(group=>group.items.length));complete(recovered);
});

test('malformed or future preferences fall back to defaults without partially accepting corrupted group data',()=>{
  const invalid:unknown[]=[null,[],{},'legacy-layout',{version:2,activeId:'default',templates:[]},{...defaultToolLayoutPreferences(),templates:[]}];
  for(const change of [
    (value:ToolLayoutPreferences)=>{value.templates[0].columns.left=-1;},
    (value:ToolLayoutPreferences)=>{value.templates[0].columns.right=1.5;},
    (value:ToolLayoutPreferences)=>{value.templates[0].columns.right=13;},
    (value:ToolLayoutPreferences)=>{value.templates[0].name=' ';},
    (value:ToolLayoutPreferences)=>{value.templates[0].groups[0].name='bad\nname';},
    (value:ToolLayoutPreferences)=>{value.templates[0].groups[0].side='middle' as never;},
    (value:ToolLayoutPreferences)=>{value.templates[0].groups[0].items=[1] as never;},
    (value:ToolLayoutPreferences)=>{value.templates[0].groups.push(structuredClone(value.templates[0].groups[0]));},
    (value:ToolLayoutPreferences)=>{value.templates.push(structuredClone(value.templates[0]));},
    (value:ToolLayoutPreferences)=>{value.activeId='';},
  ]){const value=defaultToolLayoutPreferences();change(value);invalid.push(value);}
  for(const value of invalid){
    assert.throws(()=>validateToolLayoutPreferences(value));
    assert.deepEqual(readToolLayoutPreferences({getItem:()=>JSON.stringify(value)}),defaultToolLayoutPreferences());
  }
  assert.deepEqual(readToolLayoutPreferences({getItem:()=>'{'}),defaultToolLayoutPreferences());
});

test('save rejects unknown, duplicated or missing IDs before overwriting a valid layout and never serializes callbacks',()=>{
  const storage=memoryStorage(),original=defaultToolLayoutPreferences();saveToolLayoutPreferences(original,storage);
  const before=storage.getItem(TOOL_LAYOUT_PREFERENCES_KEY);
  for(const change of [
    (value:ToolLayoutPreferences)=>{value.templates[0].groups[0].items.push('unknown-tool');},
    (value:ToolLayoutPreferences)=>{value.templates[0].groups[0].items.push('line');},
    (value:ToolLayoutPreferences)=>{value.templates[0].groups.find(group=>group.id==='drawing')!.items.shift();},
    (value:ToolLayoutPreferences)=>{value.activeId='missing-template';},
  ]){const value=structuredClone(original);change(value);assert.throws(()=>saveToolLayoutPreferences(value,storage));assert.equal(storage.getItem(TOOL_LAYOUT_PREFERENCES_KEY),before);}
  const withCallback={...original,onExecute:()=>{throw Error('不可执行');}};
  saveToolLayoutPreferences(withCallback,storage);assert.deepEqual(JSON.parse(storage.getItem(TOOL_LAYOUT_PREFERENCES_KEY)!),original);
});

test('desktop-like drag reorders within a group and transfers both tools and check actions across sides exactly once',()=>{
  const original=defaultToolLayoutPreferences(),snapshot=structuredClone(original),initial=original.templates[0].groups.find(group=>group.id==='drawing')!.items;
  const reordered=moveToolLayoutItem(original,'line','drawing',3);
  assert.deepEqual(reordered.templates[0].groups.find(group=>group.id==='drawing')!.items.slice(0,4),[...initial.slice(1,4),'line']);
  const movedGroup=moveToolLayoutGroup(reordered,'transform','right',0);
  const across=moveToolLayoutItem(movedGroup,'line','transform',1),checks=moveToolLayoutItem(across,'action:check','drawing',0);
  assert.equal(checks.templates[0].groups.find(group=>group.id==='transform')!.items[1],'line');
  assert.equal(checks.templates[0].groups.find(group=>group.id==='drawing')!.items[0],'action:check');
  assert.ok(!checks.templates[0].groups.find(group=>group.id==='checks')!.items.includes('action:check'));
  complete(checks.templates[0]);assert.deepEqual(original,snapshot);assert.deepEqual(checks.templates.slice(1),original.templates.slice(1));
  assert.doesNotThrow(()=>saveToolLayoutPreferences(checks,memoryStorage()));
});

test('folders can be created, renamed and merged without hiding tools and columns can change independently',()=>{
  const preferences=defaultToolLayoutPreferences(),original=preferences.templates[0];
  const added=updateToolLayoutTemplate(preferences,'default',{columns:{right:6},groups:[...original.groups,{id:'personal',name:'我的工具',side:'right',items:[]}]});
  assert.deepEqual(added.templates[0].columns,{left:0,right:6});
  const moved=moveToolLayoutItem(added,'line','personal',0);
  const groups=moved.templates[0].groups.map(group=>group.id==='transform'?{...group,name:'变换与常用',items:[...group.items,...moved.templates[0].groups.find(item=>item.id==='personal')!.items]}:group).filter(group=>group.id!=='personal');
  const merged=updateToolLayoutTemplate(moved,'default',{groups});complete(merged.templates[0]);
  assert.equal(merged.templates[0].groups.find(group=>group.id==='transform')!.name,'变换与常用');
  assert.ok(merged.templates[0].groups.find(group=>group.id==='transform')!.items.includes('line'));
  assert.ok(!merged.templates[0].groups.some(group=>group.id==='personal'));
  assert.equal(preferences.templates[0].groups.length,12);
});

test('whole-group dragging uses destination-side order and supports a side with no groups',()=>{
  const preferences=defaultToolLayoutPreferences();
  const reordered=moveToolLayoutGroup(preferences,'drawing','left',4);
  assert.deepEqual(reordered.templates[0].groups.filter(group=>group.side==='left').map(group=>group.id),['types','selection','advanced','deletion','drawing','copy-move','transform','repair','marks','generation','measurement','checks']);
  const across=moveToolLayoutGroup(reordered,'checks','left',0);
  assert.equal(across.templates[0].groups.filter(group=>group.side==='left')[0].id,'checks');
  assert.deepEqual(across.templates[0].groups.find(group=>group.id==='checks')!.items,[...TOOL_LAYOUT_ACTIONS.map(action=>action.id),'regioncheck']);
  const single=selectToolLayoutTemplate(preferences,'all-left'),emptySide=moveToolLayoutGroup(single,'drawing','right',0);
  assert.deepEqual(emptySide.templates[2].groups.filter(group=>group.side==='right').map(group=>group.id),['drawing']);
  complete(emptySide.templates[2]);assert.deepEqual(preferences,defaultToolLayoutPreferences());
});

test('copy, rename, select and delete preserve template independence and always retain an active survivor',()=>{
  const original=defaultToolLayoutPreferences(),copied=copyToolLayoutTemplate(original,'default',' 手边工具 ',()=> 'my-layout');
  assert.equal(copied.activeId,'my-layout');assert.equal(activeToolLayoutTemplate(copied).name,'手边工具');
  const edited=moveToolLayoutItem(renameToolLayoutTemplate(copied,'my-layout','左手作图'),'line','marks',0);
  assert.deepEqual(edited.templates[0],original.templates[0]);assert.equal(activeToolLayoutTemplate(edited).name,'左手作图');
  const deleted=deleteToolLayoutTemplate(edited,'my-layout');assert.equal(deleted.activeId,'all-left');assert.equal(deleted.templates.length,3);
  const selected=selectToolLayoutTemplate(deleted,'swapped');assert.equal(activeToolLayoutTemplate(selected).id,'swapped');
  const single=deleteToolLayoutTemplate(deleteToolLayoutTemplate(selected,'default'),'all-left');assert.equal(single.templates.length,1);assert.equal(single.activeId,'swapped');
  assert.throws(()=>deleteToolLayoutTemplate(single,'swapped'),/至少保留/);assert.deepEqual(original,defaultToolLayoutPreferences());
});

test('template capacity, identifiers, names and drop targets reject invalid edits without mutating the source',()=>{
  const original=defaultToolLayoutPreferences(),snapshot=structuredClone(original);
  for(const change of [
    ()=>selectToolLayoutTemplate(original,'missing'),()=>deleteToolLayoutTemplate(original,'missing'),
    ()=>renameToolLayoutTemplate(original,'default',''),()=>renameToolLayoutTemplate(original,'default','折'.repeat(61)),
    ()=>updateToolLayoutTemplate(original,'default',{columns:{left:Infinity}}),
    ()=>moveToolLayoutItem(original,'missing','drawing',0),()=>moveToolLayoutItem(original,'line','missing',0),
    ()=>moveToolLayoutItem(original,'line','drawing',NaN),()=>moveToolLayoutGroup(original,'missing','left',0),
    ()=>moveToolLayoutGroup(original,'drawing','middle' as never,0),()=>copyToolLayoutTemplate(original,'default','副本',()=> 'default'),
  ])assert.throws(change);
  assert.deepEqual(original,snapshot);
  let filled=original,index=0;while(filled.templates.length<MAX_TOOL_LAYOUT_TEMPLATES)filled=copyToolLayoutTemplate(filled,'default',undefined,()=>`copy-${++index}`);
  assert.equal(filled.templates.length,20);filled.templates.forEach(complete);assert.throws(()=>copyToolLayoutTemplate(filled,'default'),/最多保存/);
  assert.doesNotThrow(()=>saveToolLayoutPreferences(filled,memoryStorage()));
  const longName=renameToolLayoutTemplate(original,'default','折'.repeat(60)),copied=copyToolLayoutTemplate(longName,'default',undefined,()=> 'long-name');
  assert.equal([...activeToolLayoutTemplate(copied).name].length,60);
});
