import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportOrieditaHotkeys,toJavaToolKeyStroke,javaToolKeyStroke,parseJavaProperties,previewOrieditaHotkeys} from '../../src/app/orieditaHotkeys';
import {defaultToolShortcuts} from '../../src/app/toolShortcuts';
test('Java export uses pressed syntax and round trips all supported modifier combinations',()=>{
 for(const chord of ['Q','1','F2','Shift+Q','Ctrl+Q','Ctrl+Shift+Q','Shift+1'])assert.equal(javaToolKeyStroke(toJavaToolKeyStroke(chord)),chord);
 assert.equal(toJavaToolKeyStroke(null),'');assert.equal(toJavaToolKeyStroke('ctrl + shift + q'),'ctrl shift pressed Q');assert.throws(()=>toJavaToolKeyStroke('Ctrl+O'));
});
test('current defaults export without retired presets; explicit subsets preserve data and report omissions',()=>{
 const current={...defaultToolShortcuts(),'tool:perpendicular':'Shift+P'},before=structuredClone(current);
 const full=exportOrieditaHotkeys(current);assert.ok(full.text);assert.deepEqual(full.issues,[]);assert.ok(full.warnings.some(w=>w.includes('清空现有快捷键')));
 const result=exportOrieditaHotkeys(current,['tool:line','tool:select','tool:perpendicular']);assert.deepEqual(result.issues,[]);assert.ok(result.skipped.includes('preset:M'));
 const values=parseJavaProperties(result.text!);assert.equal(values.get('drawCreaseFreeAction'),'pressed L');assert.equal(values.get('selectAction'),'pressed V');assert.equal(values.get('perpendicularDrawAction'),'shift pressed P');
 assert.equal(previewOrieditaHotkeys(result.text!,defaultToolShortcuts()).bindings!['tool:perpendicular'],'Shift+P');assert.deepEqual(current,before);
 assert.equal(result.text,exportOrieditaHotkeys(current,['tool:perpendicular','tool:select','tool:line']).text);
});
test('explicit clearing is retained and nonexistent selections cannot silently disappear',()=>{
 const current={...defaultToolShortcuts(),'tool:line':null};
 assert.equal(parseJavaProperties(exportOrieditaHotkeys(current,['tool:line']).text!).get('drawCreaseFreeAction'),'');
 assert.equal(exportOrieditaHotkeys(current,['tool:perpendicular']).text,null);
 assert.equal(exportOrieditaHotkeys(current,[]).exported.length,0);
});
