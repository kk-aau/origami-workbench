import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultProcessingSettings,processingOptions} from '../../src/app/cpProcessingSettings';

test('加工默认一次、山谷设置相同但保持独立分组，明确勾选才允许合并',()=>{
  const draft=defaultProcessingSettings(),before=structuredClone(draft),normal=processingOptions(draft,false,false,[0,0]);
  assert.equal(normal.mergeSameSettings,false);assert.equal(normal.overlapPolicy,'reject');
  assert.equal(normal.profiles!.M!.settingsKey,normal.profiles!.V!.settingsKey);
  assert.notEqual(normal.profiles!.M!.groupId,normal.profiles!.V!.groupId);
  for(const row of Object.values(normal.profiles!))assert.equal(row.passes,1);
  assert.equal(processingOptions(draft,true,true,[-12,90]).mergeSameSettings,true);
  assert.deepEqual(draft,before);
});
test('速度压力与加工次数参与分组标识，数值写法等价，名称去除外部空格',()=>{
  const draft=defaultProcessingSettings();draft.M.speed='12.0';draft.V.speed='12';draft.M.tool=' 压痕工具 ';
  let profiles=processingOptions(draft,true,false,[0,0]).profiles!;
  assert.equal(profiles.M!.settingsKey,profiles.V!.settingsKey);
  draft.V.pressure='50';profiles=processingOptions(draft,true,false,[0,0]).profiles!;
  assert.notEqual(profiles.M!.settingsKey,profiles.V!.settingsKey);
  draft.V.pressure='';draft.V.passes='2';profiles=processingOptions(draft,true,false,[0,0]).profiles!;
  assert.notEqual(profiles.M!.settingsKey,profiles.V!.settingsKey);
});
test('加工设置拒绝无效数值和空工具，不把空次数转换为零，禁用行不影响有效导出',()=>{
  for(const [field,value] of [['speed','NaN'],['pressure','Infinity'],['speed','-1'],['passes',''],['passes','1.5'],['passes','21'],['tool',' ']] as const){
    const draft=defaultProcessingSettings();draft.M[field]=value;assert.throws(()=>processingOptions(draft,false,false,[0,0]));
    draft.M.enabled=false;assert.doesNotThrow(()=>processingOptions(draft,false,false,[0,0]));
  }
  assert.throws(()=>processingOptions(defaultProcessingSettings(),false,false,[NaN,0]));
});
