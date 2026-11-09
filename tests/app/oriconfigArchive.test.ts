import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {readOriconfigArchive} from '../../src/app/oriconfigArchive';
test('ORICONFIG reads stored/deflated settings and reports ignored files without modifying input',()=>{
 for(const level of [0,6] as const){const zip=zipSync({'config.json':strToU8('{"lineWidth":2}'),'hotkey.properties':strToU8('drawCreaseFreeAction=Q'),'unrelated.txt':strToU8('ignore')},{level}),before=zip.slice();const result=readOriconfigArchive(zip);assert.deepEqual(result.config,{lineWidth:2});assert.equal(result.hotkeys,'drawCreaseFreeAction=Q');assert.deepEqual(result.ignoredFiles,['unrelated.txt']);assert.deepEqual(zip,before);}
});
test('ORICONFIG rejects unsafe paths, oversized expanded entries, missing files and malformed settings',()=>{
 for(const files of [{'../config.json':strToU8('{}')},{'C:\\config.json':strToU8('{}')},{'other':strToU8('{}')},{'config.json':strToU8('[]')},{'config.json':strToU8('{')},{'config.json':new Uint8Array(262145)}])assert.throws(()=>readOriconfigArchive(zipSync(files as Record<string,Uint8Array>)));
 const files:Record<string,Uint8Array>={'config.json':strToU8('{}')};for(let i=0;i<64;i++)files['extra'+i]=new Uint8Array();assert.throws(()=>readOriconfigArchive(zipSync(files)),/数量/);
 assert.throws(()=>readOriconfigArchive(new Uint8Array(4*1024*1024+1)),/4 MB/);
});
test('ORICONFIG decodes UTF-8 strictly and warns on exact Latin-1 hotkey fallback',()=>{
 const zip=zipSync({'hotkey.properties':new Uint8Array([35,32,233,10,120,61,81])});const reply=readOriconfigArchive(zip);assert.equal(reply.hotkeys,'# é\nx=Q');assert.equal(reply.warnings.length,1);assert.equal(reply.config,null);
 assert.throws(()=>readOriconfigArchive(zipSync({'config.json':new Uint8Array([123,233,125])})),/ORICONFIG/);
});
test('truncated archives and duplicate central filenames are rejected',()=>{
 const zip=zipSync({'config.json':strToU8('{}'),'xotkey.properties':strToU8('x=Q'),'hotkey.properties':strToU8('x=P')});assert.throws(()=>readOriconfigArchive(zip.slice(0,zip.length-15)));
 // Equal-length name alteration in both local and central records makes a duplicate.
 for(let i=0;i<zip.length-17;i++)if(new TextDecoder().decode(zip.subarray(i,i+17))==='xotkey.properties')zip[i]=104;
 assert.throws(()=>readOriconfigArchive(zip),/重复/);
});
