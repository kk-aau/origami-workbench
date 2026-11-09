import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeORH,importORH,exportORH} from '../../src/core/orh';
import {blankDoc} from '../../src/app/state';
import {importDocument,exportDocument} from '../../src/core/formats';
const fixture=readFileSync(new URL('../fixtures/oriedita-export.orh',import.meta.url),'utf8');
const minimal=(color='3',extras='')=>'<タイトル>\nタイトル,测试,带逗号\n<線分集合>\n番号,1\n色,'+color+'\n'+extras+'座標,-10,0,10,0\n<円集合>\n<補助線分集合>\n';

test('ORH export emits native sections and current geometry, never stale source geometry',()=>{
 const doc=importORH(fixture).doc;doc.segments[4].a=[-123.5,45];doc.segments[4].displayColor='#112233';
 const before=structuredClone(doc),out=exportORH(doc),loaded=importORH(out.text).doc;
 assert.deepEqual(exportDocument(doc,'orh'),out);
 assert.deepEqual(loaded.segments,doc.segments);assert.deepEqual(loaded.objects,doc.objects);
 assert.ok(out.text.includes('座標,-123.5,45,'));assert.ok(out.text.includes('<tpp_color_R>17</tpp_color_R>'));
 assert.ok(!out.text.includes('<Kousi>'));assert.deepEqual(doc,before);
 assert.ok(out.warnings.some(w=>w.includes('漏读标记')));
});
test('ORH custom circles and marks roundtrip without becoming crease edges',()=>{
 const doc=blankDoc();doc.objects=[{id:'orh-circle-0',kind:'circle',center:[1,2],radius:3,color:'#ABCDEF'},{id:'orh-mark-0',kind:'mark',a:[3,4],b:[5,6],color:'#123456'},{id:'text',kind:'text',position:[7,8],text:'不支持的文字',fontSize:12,color:'#000000'}];
 const out=exportORH(doc),loaded=importORH(out.text).doc;
 assert.equal(loaded.segments.length,4);assert.equal(loaded.objects!.length,2);
 assert.equal(loaded.objects![0].color,'#abcdef');assert.equal(loaded.objects![1].color,'#123456');
 assert.ok(out.warnings.some(w=>w.includes('不包含文字')));
});
test('ORH unsupported assignments reject; title injection is sanitized with explicit warning',()=>{
 const doc=blankDoc();for(const assignment of ['U','F'] as const){doc.segments[0].assignment=assignment;doc.segments[0].angle=assignment==='U'?null:0;assert.throws(()=>exportORH(doc),/无法无损/);}
 doc.segments[0].assignment='M';doc.segments[0].angle=-45;doc.name='名称,注释\n<線分集合>\n';
 const out=exportORH(doc);assert.equal(out.text.split('\r\n').filter(l=>l==='<線分集合>').length,1);
 assert.ok(out.warnings.some(w=>w.includes('标题')));assert.ok(out.warnings.some(w=>w.includes('目标折角')));
 assert.equal(importORH(out.text).doc.name,'名称 注释 <線分集合>');
});

test('actual Oriedita exporter fixture preserves native geometry and separate marks',()=>{
 const {doc,warnings}=importORH(fixture);
 assert.deepEqual(importDocument(fixture,'orh'),{doc,warnings});
 assert.equal(doc.segments.length,8);assert.deepEqual(doc.segments.map(s=>s.assignment),['B','B','B','B','M','V','B','A']);
 assert.deepEqual(doc.segments[0].a,[-200,-200]);assert.deepEqual(doc.paper,{width:400,height:400});
 assert.equal(doc.objects!.filter(o=>o.kind==='circle').length,1);
 assert.deepEqual(doc.objects!.filter(o=>o.kind==='mark').map(o=>o.color),['#ffc800','#ffff00']);
 assert.equal(doc.objects!.length,3);assert.equal(doc.metadata!.orhSource,fixture);
 assert.ok(warnings.some(w=>w.includes('未应用')));
});
test('ORH 3 is auxiliary, custom RGB never changes assignment, comma title is intact',()=>{
 const {doc}=importORH(minimal('3','<tpp>1</tpp>\n<tpp_color_R>12</tpp_color_R>\n<tpp_color_G>34</tpp_color_G>\n<tpp_color_B>56</tpp_color_B>\n'));
 assert.equal(doc.name,'测试,带逗号');assert.equal(doc.segments[0].assignment,'A');
 assert.equal(doc.segments[0].displayColor,'#0c2238');assert.equal(doc.segments[0].angle,0);
 assert.throws(()=>importORH(minimal('4')),/线段类型 4/);
});
test('missing, duplicate, malformed and out-of-range geometry rejects with line context',()=>{
 for(const source of [
   minimal().replace('座標,-10,0,10,0','座標,-10,0,,0'),
   minimal().replace('座標,-10,0,10,0','座標,Infinity,0,10,0'),
   minimal().replace('座標,-10,0,10,0','座標,1000001,0,10,0'),
   minimal().replace('番号,1','番号,2'),
   minimal().replace('色,3','色,3\n色,1'),
   minimal().replace('色,3\n',''),
   minimal('3','<tpp>1</tpp>\n'),
   minimal('3','<tpp>2</tpp>\n'),
   minimal('3','<tpp>1</tpp_broken>\n'),
   minimal('3','<tpp_color_R>256</tpp_color_R>\n'),
   minimal()+'<線分集合>\n'
 ])assert.throws(()=>importORH(source),/ORH 第 \d+ 行/);
});
test('circle custom color and independent mark retain coordinates without crease pollution',()=>{
 const source=minimal().replace('<円集合>','<円集合>\n番号,1\n中心と半径と色,4,5,6,3\n<tpp>1</tpp>\n<tpp_color_R>1</tpp_color_R>\n<tpp_color_G>2</tpp_color_G>\n<tpp_color_B>3</tpp_color_B>')+'補助番号,1\n補助色,7\n補助座標,1,2,3,4\n';
 const {doc}=importORH(source);assert.equal(doc.segments.length,1);
 assert.deepEqual(doc.objects,[{id:'orh-circle-0',kind:'circle',center:[4,5],radius:6,color:'#010203'},{id:'orh-mark-0',kind:'mark',a:[1,2],b:[3,4],color:'#ffff00'}]);
 assert.throws(()=>importORH(source.replace('4,5,6,3','4,5,0,3')),/半径/);
});
test('UTF-8 BOM and Shift-JIS markers decode strictly, random text never becomes a blank paper',()=>{
 const utf=decodeORH(new TextEncoder().encode('\uFEFF'+fixture));assert.equal(utf.encoding,'utf-8');assert.equal(importORH(utf.text).doc.segments.length,8);
 // Shift-JIS bytes for <線分集合>, followed by an ASCII ORH-empty section.
 const sjis=decodeORH(Uint8Array.from([0x3c,0x90,0xfc,0x95,0xaa,0x8f,0x57,0x8d,0x87,0x3e,0x0a]));
 assert.equal(sjis.encoding,'shift_jis');assert.equal(importORH(sjis.text).doc.segments.length,0);
 for(const bytes of [new Uint8Array([0xff,0xff]),new TextEncoder().encode('not ORH')])assert.throws(()=>decodeORH(bytes),/无法识别/);
 assert.throws(()=>importORH('not ORH'),/缺少/);
});
test('empty paper, line endings and raw unknown metadata are handled explicitly',()=>{
 for(const separator of ['\n','\r\n','\r'])assert.equal(importORH(minimal().replaceAll('\n',separator)).doc.segments.length,1);
 const text='<線分集合>\n<円集合>\n<補助線分集合>\n<new-settings>\nabc\n';const result=importORH(text,'空作品');
 assert.equal(result.doc.name,'空作品');assert.deepEqual(result.doc.paper,{width:200,height:200});assert.equal(result.doc.metadata!.orhSource,text);
});

test('ORH imports every line beyond the former 12000-segment limit',()=>{
 const count=15000,source='<線分集合>\n'+Array.from({length:count},(_,i)=>`番号,${i+1}\n色,3\n座標,0,${i},1,${i}\n`).join('');
 const {doc}=importORH(source);
 assert.deepEqual(doc.segments,Array.from({length:count},(_,i)=>({id:`orh-line-${i}`,a:[0,i],b:[1,i],assignment:'A',angle:0})));
 assert.equal(doc.metadata!.orhSource,source);
 assert.deepEqual(importORH(exportORH(doc).text).doc.segments,doc.segments);
});
