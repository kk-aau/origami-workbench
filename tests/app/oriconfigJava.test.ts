import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixtures from '../fixtures/oriconfig-java.json';
import {readOriconfigArchive} from '../../src/app/oriconfigArchive';
import {previewOrieditaHotkeys} from '../../src/app/orieditaHotkeys';
import {defaultToolShortcuts} from '../../src/app/toolShortcuts';

test('real Java ZipOutputStream archives and KeyStroke strings read into a non-mutating preview',()=>{
 for(const name of ['deflatedUtf8','storedLatin1'] as const){
  const bytes=Uint8Array.from(Buffer.from(fixtures[name],'base64')),before=bytes.slice(),settings=defaultToolShortcuts();
  const archive=readOriconfigArchive(bytes);assert.deepEqual(archive.config,{lineWidth:2,displayComments:true,fixtureLabel:'中文'});assert.deepEqual(archive.ignoredFiles,['ignored-说明.txt']);
  assert.equal(archive.warnings.length,name==='storedLatin1'?1:0);assert.match(archive.hotkeys!,/shift pressed P/);
  const preview=previewOrieditaHotkeys(archive.hotkeys!,settings);assert.deepEqual(preview.issues,[]);assert.equal(preview.bindings!['tool:line'],'Q');assert.equal(preview.bindings!['tool:perpendicular'],'Shift+P');assert.deepEqual(settings,defaultToolShortcuts());assert.deepEqual(bytes,before);
 }
});

test('CRC rejects a modified real Java stored configuration even if the modified JSON is valid',()=>{
 const bytes=Uint8Array.from(Buffer.from(fixtures.storedLatin1,'base64')),needle=Buffer.from('"lineWidth":2'),offset=Buffer.from(bytes).indexOf(needle);assert.ok(offset>=0);bytes[offset+needle.length-1]=51;
 assert.throws(()=>readOriconfigArchive(bytes),/CRC/);
});
