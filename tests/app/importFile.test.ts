import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readProjectFile} from '../../src/app/importFile';
const file=(name:string,bytes:Uint8Array)=>({name,size:bytes.length,text:async()=>{throw Error('must decode original bytes');},arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
const utf16=(text:string,encoding:'le'|'be')=>Buffer.concat([Buffer.from(encoding==='le'?[0xff,0xfe]:[0xfe,0xff]),encoding==='le'?Buffer.from(text,'utf16le'):Buffer.from(text,'utf16le').swap16()]);
test('ORH file route decodes raw bytes and records encoding before replacing any state',async()=>{
 const bytes=readFileSync(new URL('../fixtures/oriedita-export.orh',import.meta.url));
 const result=await readProjectFile(file('EXAMPLE.ORH',bytes));
 assert.equal(result.doc.segments.length,8);assert.equal(result.doc.objects!.length,3);
 assert.equal(result.doc.metadata!.sourceEncoding,'utf-8');
});
test('legacy ORH bytes are detected and the user is told which encoding was used',async()=>{
 const result=await readProjectFile(file('旧作品.orh',Uint8Array.from([0x3c,0x90,0xfc,0x95,0xaa,0x8f,0x57,0x8d,0x87,0x3e,0x0a])));
 assert.equal(result.doc.name,'旧作品');assert.equal(result.doc.metadata!.sourceEncoding,'shift_jis');
 assert.ok(result.warnings[0].includes('shift_jis'));
});
test('invalid encoding rejects before destructive confirmation',async()=>{
 await assert.rejects(readProjectFile(file('bad.orh',Uint8Array.from([255,255]))),/无法识别/);
});
test('uppercase CP file route reads strict UTF-8 bytes and preserves CP 4 auxiliary type',async()=>{
 const result=await readProjectFile(file('辅助.CP',new TextEncoder().encode('\uFEFF4 0 0 10 10')));
 assert.equal(result.doc.name,'辅助');assert.equal(result.doc.segments[0].assignment,'A');
});
test('BOM-marked UTF-16 LE and BE CP files preserve geometry and mixed line endings',async()=>{
 const text='# 旧折痕\r1 -10 -10 10 -10\r\n2 -10 -10 10 10\n4 0 0 10 0';
 const baseline=await readProjectFile(file('旧作品.CP',new TextEncoder().encode(text)));
 for(const encoding of ['le','be'] as const){
  const result=await readProjectFile(file('旧作品.CP',utf16(text,encoding)));
  assert.deepEqual(result.doc,baseline.doc);
  assert.deepEqual(result.doc.segments.map(s=>s.assignment),['B','M','A']);
  assert.ok(result.warnings[0].includes('UTF-16'+encoding.toUpperCase()));
 }
});
const fold={file_title:'中文折痕 🦢',frame_unit:'mm',vertices_coords:[[0,0],[10,0],[10,10]],edges_vertices:[[0,1],[0,2]],edges_assignment:['B','M'],edges_foldAngle:[0,-90]};
test('BOM-marked UTF-16 LE and BE FOLD files preserve Chinese titles, surrogate pairs and signed angles',async()=>{
 const text=JSON.stringify(fold),baseline=await readProjectFile(new File([text],'baseline.fold'));
 for(const encoding of ['le','be'] as const){
  const result=await readProjectFile(new File([utf16(text,encoding)],'legacy.FOLD'));
  assert.deepEqual(result.doc,baseline.doc);assert.equal(result.doc.name,'中文折痕 🦢');
  assert.deepEqual(result.doc.segments.map(s=>s.angle),[0,-90]);
 }
});
test('invalid UTF-8, truncated UTF-16 and unmarked UTF-16 fail explicitly without replacement decoding',async()=>{
 for(const name of ['bad.CP','bad.fold']){
  for(const bytes of [Uint8Array.from([0xff]),Uint8Array.from([0xff,0xfe,0x31]),Uint8Array.from([0xfe,0xff,0x31]),Uint8Array.from([0xff,0xfe,0,0]),Uint8Array.from([0,0,0xfe,0xff])])
   await assert.rejects(readProjectFile(file(name,bytes)),/编码.*UTF-8.*BOM.*UTF-16/);
 }
 await assert.rejects(readProjectFile(file('unmarked.CP',Buffer.from('2 0 0 10 10','utf16le'))),/编码/);
 await assert.rejects(readProjectFile(file('unmarked.fold',Buffer.from(JSON.stringify(fold),'utf16le'))),/编码/);
});
test('UTF-16 files can exceed the former byte quota before or after decoding',async()=>{
 const text=JSON.stringify({...fold,file_title:'字'.repeat(12_000_000)});
 const bytes=utf16(text,'le');assert.ok(bytes.length<32*1024*1024);assert.ok(Buffer.byteLength(text)>32*1024*1024);
 const result=await readProjectFile(file('expanded.fold',bytes));
 assert.equal(result.doc.name,JSON.parse(text).file_title);assert.equal(result.doc.segments.length,2);
 const cp='# '+'x'.repeat(17*1024*1024)+'\n2 0 0 10 10';
 const cpBytes=utf16(cp,'be');assert.ok(cpBytes.length>32*1024*1024);
 assert.equal((await readProjectFile(file('large.cp',cpBytes))).doc.segments.length,1);
});
