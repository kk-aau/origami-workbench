import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJavaProperties,javaToolKeyStroke,previewOrieditaHotkeys,orieditaHotkeyEntries} from '../../src/app/orieditaHotkeys';
import {defaultToolShortcuts} from '../../src/app/toolShortcuts';
test('Java properties supports escaped delimiters, unicode, continuation, comments and duplicate replacement',()=>{
 const data=parseJavaProperties('# ignored\r\n!ignored\na\\ b\\:c : ctrl \\\r\n   shift pressed Q\nname=\\u5c71\\tX\na=first\na=last\nempty\nescaped=\\\\\n');
 assert.equal(data.get('a b:c'),'ctrl shift pressed Q');assert.equal(data.get('name'),'山\tX');assert.equal(data.get('a'),'last');assert.equal(data.get('empty'),'');assert.equal(data.get('escaped'),'\\');
 assert.throws(()=>parseJavaProperties('x=\\u123Z'),/Unicode/);assert.throws(()=>parseJavaProperties('x'.repeat(262145)),/过大/);
});
test('Java pressed key syntax normalizes commands and rejects unsupported events and reserved bindings',()=>{
 assert.equal(javaToolKeyStroke('ctrl shift pressed Q'),'Ctrl+Shift+Q');assert.equal(javaToolKeyStroke('meta Q'),'Ctrl+Q');assert.equal(javaToolKeyStroke(''),null);
 for(const value of ['alt Q','released Q','typed q','ctrl meta Q','ctrl shift O','DELETE'])assert.throws(()=>javaToolKeyStroke(value));
});
test('preview merges explicit unbindings and atomic swaps without touching current preferences',()=>{
 const input=defaultToolShortcuts(),before=structuredClone(input),reply=previewOrieditaHotkeys('drawCreaseFreeAction=V\nselectAction=L\nperpendicularDrawAction=shift P',input);
 assert.deepEqual(reply.issues,[]);assert.equal(reply.bindings!['tool:line'],'V');assert.equal(reply.bindings!['tool:select'],'L');assert.equal(reply.bindings!['tool:perpendicular'],'Shift+P');assert.deepEqual(input,before);
 assert.equal(previewOrieditaHotkeys('drawCreaseFreeAction=',input).bindings!['tool:line'],null);
 for(const source of ['drawCreaseFreeAction=V','unknownAction=Q','drawCreaseFreeAction=ctrl O']){const invalid=previewOrieditaHotkeys(source,input);assert.equal(invalid.bindings,null);assert.ok(invalid.issues.length);}
});
test('actual upstream hotkey resource is parsed but unsupported defaults cannot silently become a partial import',()=>{
 const text=readFileSync(new URL('../../../zhezhi/oriedita/src/main/resources/hotkey.properties',import.meta.url),'utf8');const properties=parseJavaProperties(text);assert.equal(properties.get('perpendicularDrawAction'),'P');
 const preview=previewOrieditaHotkeys(text,defaultToolShortcuts());assert.ok(preview.recognized>20);assert.ok(preview.issues.length>0);assert.equal(preview.bindings,null);
});
test('explicit selection skips only user-excluded entries and never bypasses conflicts',()=>{
 const text='drawCreaseFreeAction=Q\nunknownAction=ctrl O\nperpendicularDrawAction=shift P',current=defaultToolShortcuts(),before=structuredClone(current);
 assert.equal(previewOrieditaHotkeys(text,current).bindings,null);
 const partial=previewOrieditaHotkeys(text,current,['drawCreaseFreeAction']);
 assert.equal(partial.bindings!['tool:line'],'Q');assert.equal(partial.bindings!['tool:perpendicular'],current['tool:perpendicular']);
 assert.deepEqual(partial.skipped,['unknownAction','perpendicularDrawAction']);assert.equal(partial.recognized,1);assert.deepEqual(current,before);
 assert.deepEqual(previewOrieditaHotkeys(text,current,[]).bindings,current);
 assert.equal(previewOrieditaHotkeys(text,current,['notInArchive']).bindings,null);
 assert.equal(previewOrieditaHotkeys('drawCreaseFreeAction=V\nselectAction=L',current,['drawCreaseFreeAction']).bindings,null);
 assert.equal(previewOrieditaHotkeys(text,{...current,'tool:select':'Q'},['drawCreaseFreeAction']).bindings,null);
 const entries=orieditaHotkeyEntries(text);assert.equal(entries[0].label,'线段');assert.equal(entries[0].target,'tool:line');assert.equal(entries[1].target,null);
});
test('real upstream settings can explicitly migrate a selected supported tool',()=>{
 const text=readFileSync(new URL('../../../zhezhi/oriedita/src/main/resources/hotkey.properties',import.meta.url),'utf8');
 const reply=previewOrieditaHotkeys(text,defaultToolShortcuts(),['perpendicularDrawAction']);
 assert.equal(reply.bindings!['tool:perpendicular'],'P');assert.deepEqual(reply.issues,[]);assert.equal(reply.skipped.length,parseJavaProperties(text).size-1);
});
