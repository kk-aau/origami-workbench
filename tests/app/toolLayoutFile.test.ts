import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serializeToolLayoutFile,parseToolLayoutFile,mergeToolLayoutPreferences} from '../../src/app/toolLayoutFile';
import {TOOL_LAYOUT_ITEM_IDS,MAX_TOOL_LAYOUT_TEMPLATES,defaultToolLayoutPreferences,createToolLayoutTemplate,copyToolLayoutTemplate,moveToolLayoutItem,returnToolLayoutItemToPool,updateToolLayoutTemplate,activeToolLayoutTemplate} from '../../src/app/toolLayoutPreferences';

function customized(){
  let preferences=createToolLayoutTemplate(defaultToolLayoutPreferences(),'我的排版',()=> 'custom');
  preferences=moveToolLayoutItem(preferences,'line','drawing');
  preferences=moveToolLayoutItem(preferences,'action:check','checks');
  return updateToolLayoutTemplate(preferences,'custom',{columns:{left:5,right:2}});
}

test('layout file roundtrip keeps every template, selection, empty categories, pool and custom columns',()=>{
  const original=customized(),snapshot=structuredClone(original);
  const json=serializeToolLayoutFile(original),file=JSON.parse(json),reopened=parseToolLayoutFile('\uFEFF'+json);
  assert.equal(file.format,'zhezhi-tool-layout');assert.equal(file.version,1);
  assert.deepEqual(reopened,original);assert.deepEqual(original,snapshot);
  reopened.templates[0].groups[0].name='changed';assert.deepEqual(original,snapshot);
});

test('file export rejects incomplete data instead of quietly changing the layout',()=>{
  const value=customized();activeToolLayoutTemplate(value).unassigned.pop();
  assert.throws(()=>serializeToolLayoutFile(value),/缺少工具/);
});

test('wrong documents, unsupported versions, malformed groups and missing active template fail explicitly',()=>{
  const sample=JSON.parse(serializeToolLayoutFile(customized()));
  for(const value of [null,[],{},defaultToolLayoutPreferences(),{...sample,format:'project'},{...sample,version:2}])assert.throws(()=>parseToolLayoutFile(JSON.stringify(value)));
  assert.throws(()=>parseToolLayoutFile('{'),/JSON/);
  const changes=[
    (value:any)=>{value.preferences.version=2;},
    (value:any)=>{value.preferences.columnSizingVersion=2;},
    (value:any)=>{value.preferences.templates[0].groups[0].side='center';},
    (value:any)=>{value.preferences.templates[0].groups[0].items=[1];},
    (value:any)=>{value.preferences.templates[0].groups.push(value.preferences.templates[0].groups[0]);},
    (value:any)=>{value.preferences.templates.push(value.preferences.templates[0]);},
    (value:any)=>{value.preferences.activeId='missing';},
    (value:any)=>{value.preferences.templates=[];},
  ];
  for(const change of changes){const value=structuredClone(sample);change(value);assert.throws(()=>parseToolLayoutFile(JSON.stringify(value)));}
});

test('cross-version import repairs retired and new tools without changing custom group order or tool placement',()=>{
  const original=customized(),file=JSON.parse(serializeToolLayoutFile(original)),template=file.preferences.templates.find((item:any)=>item.id==='custom');
  template.groups.find((item:any)=>item.id==='drawing').items.push('retired-tool');
  template.unassigned=template.unassigned.filter((item:string)=>item!=='circle3');
  template.unassigned.push('line','action:retired');
  const actual=activeToolLayoutTemplate(parseToolLayoutFile(JSON.stringify(file)));
  assert.deepEqual(actual.groups,activeToolLayoutTemplate(original).groups);
  assert.equal(actual.unassigned.at(-1),'circle3');assert.ok(!actual.unassigned.includes('line'));
  const ids=[...actual.groups.flatMap(group=>group.items),...actual.unassigned];
  assert.equal(ids.length,TOOL_LAYOUT_ITEM_IDS.length);assert.deepEqual(new Set(ids),new Set(TOOL_LAYOUT_ITEM_IDS));
});

test('merging into a fresh portable copy preserves the imported active template and reuses unchanged presets',()=>{
  const current=defaultToolLayoutPreferences(),imported=customized(),a=structuredClone(current),b=structuredClone(imported);
  const merged=mergeToolLayoutPreferences(current,parseToolLayoutFile(serializeToolLayoutFile(imported)));
  assert.deepEqual(merged,imported);assert.deepEqual(current,a);assert.deepEqual(imported,b);
  assert.deepEqual(mergeToolLayoutPreferences(merged,imported),merged);
});

test('ID and name conflicts create separate named imports and repeated imports reuse them',()=>{
  const current=customized(),imported=returnToolLayoutItemToPool(customized(),'line'),before=structuredClone(current);
  const merged=mergeToolLayoutPreferences(current,imported),active=activeToolLayoutTemplate(merged);
  assert.equal(merged.templates.length,current.templates.length+1);
  assert.equal(active.id,'custom-import-1');assert.equal(active.name,'我的排版（导入）');
  assert.deepEqual(active.groups,activeToolLayoutTemplate(imported).groups);
  assert.deepEqual(merged.templates.slice(0,current.templates.length),before.templates);
  assert.deepEqual(mergeToolLayoutPreferences(merged,imported),merged);
  assert.deepEqual(current,before);
});

test('name-only and ID-only conflicts preserve original templates and stable selection on repeated import',()=>{
  const current=customized(),source=returnToolLayoutItemToPool(customized(),'line');
  const named=structuredClone(source);activeToolLayoutTemplate(named).id='other-id';named.activeId='other-id';
  const merged=mergeToolLayoutPreferences(current,named);
  assert.equal(activeToolLayoutTemplate(merged).id,'other-id');assert.equal(activeToolLayoutTemplate(merged).name,'我的排版（导入）');
  assert.deepEqual(mergeToolLayoutPreferences(merged,named),merged);
  const renamed=structuredClone(source);activeToolLayoutTemplate(renamed).name='另一个名称';
  const second=mergeToolLayoutPreferences(current,renamed);
  assert.equal(activeToolLayoutTemplate(second).id,'custom-import-1');assert.equal(activeToolLayoutTemplate(second).name,'另一个名称');
  assert.deepEqual(mergeToolLayoutPreferences(second,renamed),second);
});

test('capacity failures are atomic and fully identical imports work even when all template slots are used',()=>{
  let current=customized();
  while(current.templates.length<MAX_TOOL_LAYOUT_TEMPLATES)current=copyToolLayoutTemplate(current,'custom',`模板${current.templates.length}`,()=>`copy-${current.templates.length}`);
  const snapshot=structuredClone(current),imported=createToolLayoutTemplate(defaultToolLayoutPreferences(),'另一份',()=> 'another');
  assert.throws(()=>mergeToolLayoutPreferences(current,imported),/超过 20/);
  assert.deepEqual(current,snapshot);assert.deepEqual(mergeToolLayoutPreferences(current,current),current);
});

test('long conflicting names and IDs receive valid bounded unique suffixes',()=>{
  const current=customized(),active=activeToolLayoutTemplate(current);active.id='a'.repeat(128);active.name='纸'.repeat(60);current.activeId=active.id;
  const imported=returnToolLayoutItemToPool(current,'line'),merged=mergeToolLayoutPreferences(current,imported),result=activeToolLayoutTemplate(merged);
  assert.equal(result.id.length,128);assert.equal([...result.name].length,60);
  assert.ok(result.name.endsWith('（导入）'));assert.ok(result.id.endsWith('-import-1'));
  assert.deepEqual(parseToolLayoutFile(serializeToolLayoutFile(merged)),merged);
  assert.deepEqual(mergeToolLayoutPreferences(merged,imported),merged);
});

test('merge rejects malformed current or incoming preferences without repairing away missing tools',()=>{
  const current=customized(),bad=structuredClone(current);activeToolLayoutTemplate(bad).unassigned.pop();
  assert.throws(()=>mergeToolLayoutPreferences(current,bad),/缺少工具/);
  assert.throws(()=>mergeToolLayoutPreferences(bad,current),/缺少工具/);
});
