import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Zip,ZipDeflate,zipSync,strToU8} from 'fflate';
import {settingsCRC32} from '../../src/app/oriconfigIntegrity';
import {readOriconfigArchive} from '../../src/app/oriconfigArchive';
test('CRC32 known vector and stored content corruption are detected',()=>{
 assert.equal(settingsCRC32(strToU8('123456789')),0xcbf43926);assert.equal(settingsCRC32(new Uint8Array()),0);
 const bytes=zipSync({'hotkey.properties':strToU8('drawCreaseFreeAction=Q')},{level:0}),view=new DataView(bytes.buffer);const body=30+view.getUint16(26,true)+view.getUint16(28,true);bytes[body+20]=80;
 assert.throws(()=>readOriconfigArchive(bytes),/CRC/);
});
test('central/local header disagreement, encryption, split archives and trailing bytes are refused',()=>{
 const source=zipSync({'config.json':strToU8('{}')});
 for(const mutate of [(v:DataView)=>v.setUint16(6,1,true),(v:DataView)=>v.setUint32(14,0,true),(v:DataView)=>v.setUint16(source.length-18,1,true),(v:DataView)=>v.setUint32(source.length-6,0xffffffff,true)]){const b=source.slice();mutate(new DataView(b.buffer));assert.throws(()=>readOriconfigArchive(b));}
 const extra=new Uint8Array(source.length+1);extra.set(source);assert.throws(()=>readOriconfigArchive(extra));
});
test('streamed ZIP data descriptors are accepted and their checksums validated',()=>{
 const chunks:Uint8Array[]=[];const writer=new Zip((error,chunk)=>{if(error)throw error;chunks.push(chunk);});const file=new ZipDeflate('config.json');writer.add(file);file.push(strToU8('{"lineWidth":2}'),true);writer.end();
 const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 assert.deepEqual(readOriconfigArchive(bytes).config,{lineWidth:2});
 const view=new DataView(bytes.buffer);let descriptor=-1;for(let i=0;i<bytes.length-4;i++)if(view.getUint32(i,true)===0x08074b50){descriptor=i;break;}assert.ok(descriptor>=0);view.setUint32(descriptor+4,0,true);assert.throws(()=>readOriconfigArchive(bytes));
});
