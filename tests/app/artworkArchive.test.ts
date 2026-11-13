import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,Zip,ZipDeflate,ZipPassThrough,type Zippable} from 'fflate';
import {encodeArtworkArchive,decodeArtworkArchive,ARTWORK_ARCHIVE_EXTENSION,ARTWORK_ARCHIVE_MIME} from '../../src/app/artworkArchive';
import {inspectArtworkZip,ARTWORK_ZIP_FILES,artworkCRC32} from '../../src/app/artworkZipIntegrity';

const utf8=new TextEncoder(),decode=new TextDecoder();
test('CRC32 matches standard vectors',()=>{assert.equal(artworkCRC32(utf8.encode('123456789')),0xcbf43926);assert.equal(artworkCRC32(new Uint8Array()),0);});
function fixture(version:1|2=1){
 const metadata=JSON.parse('{"__proto__":{"preserved":"own data"},"constructor":{"prototype":"also data"},"$ref":"editor.json#/metadata","unicode":"中文😀","nested":[null,{},[],false,0,1e-20]}');
 return {format:'zhezhi-artwork',version,editor:{name:'精确往返😀',metadata},models:{activeId:null,entries:[{id:'independent',source:{doc:{name:'模型独立源',metadata:{origin:'model'}}}}]},
  diagram:{states:[{doc:{name:'折序独立源',metadata:{origin:'diagram'}}}],steps:[{description:'不改元数据中的 $ref 字符串'}]},simulation:{source:{metadata:{origin:'simulation'}}},construction:{tessellation:{},curve:null},...(version===2?{design:null}:{})};
}
function trustedFiles(bytes=encodeArtworkArchive(JSON.stringify(fixture()))):Record<string,Uint8Array>{return unzipSync(bytes);}
function pack(files:Record<string,Uint8Array>){const entries:Zippable=Object.create(null);for(const [name,bytes]of Object.entries(files))entries[name]=[bytes,{level:name==='manifest.json'?0:3}];return zipSync(entries,{mtime:new Date(2000,0,1)});}
function manifest(files:Record<string,Uint8Array>,change:(value:any)=>void){const value=JSON.parse(decode.decode(files['manifest.json']));change(value);files['manifest.json']=utf8.encode(JSON.stringify(value));}
function section(files:Record<string,Uint8Array>,name:string,bytes:Uint8Array){files[`${name}.json`]=bytes;manifest(files,value=>{value.sections[name].bytes=bytes.length;value.sections[name].crc32=artworkCRC32(bytes);});}
function centralRecords(bytes:Uint8Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-22,records:{name:string;offset:number;local:number}[]=[];let offset=view.getUint32(end+16,true);for(let index=0;index<view.getUint16(end+10,true);index++){const size=view.getUint16(offset+28,true);records.push({name:decode.decode(bytes.subarray(offset+46,offset+46+size)),offset,local:view.getUint32(offset+42,true)});offset+=46+size+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);}return records;}
function patch(bytes:Uint8Array,change:(view:DataView,records:ReturnType<typeof centralRecords>)=>void){const output=bytes.slice();change(new DataView(output.buffer),centralRecords(output));return output;}
/** Change a raw DEFLATE stream while keeping all ZIP offsets/packed sizes valid. */
function replacePacked(bytes:Uint8Array,name:string,packed:Uint8Array){
 const target=inspectArtworkZip(bytes).find(entry=>entry.name===name)!;const difference=packed.length-target.compressedSize,output=new Uint8Array(bytes.length+difference),oldView=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 output.set(bytes.subarray(0,target.dataStart));output.set(packed,target.dataStart);output.set(bytes.subarray(target.dataEnd),target.dataStart+packed.length);
 const view=new DataView(output.buffer);for(const record of centralRecords(bytes)){const offset=record.offset+difference;view.setUint32(offset+42,record.local>=target.dataEnd?record.local+difference:record.local,true);if(record.name===name){view.setUint32(offset+20,packed.length,true);view.setUint32(record.local+18,packed.length,true);}}
 view.setUint32(output.length-22+16,oldView.getUint32(bytes.length-22+16,true)+difference,true);return output;
}

test('ORIW partitions the old envelope without changing independent sources or unknown metadata',()=>{
 const value=fixture(),before=JSON.stringify(value),bytes=encodeArtworkArchive(before),entries=inspectArtworkZip(bytes);
 assert.equal(ARTWORK_ARCHIVE_EXTENSION,'.oriw');assert.equal(ARTWORK_ARCHIVE_MIME,'application/zip');
 assert.deepEqual(entries.map(entry=>entry.name),ARTWORK_ZIP_FILES);assert.ok(entries.every(entry=>entry.compression===0),'new ORIW files store every section without compression');
 const result=decodeArtworkArchive(bytes) as ReturnType<typeof fixture>;assert.deepEqual(result,value);assert.equal(JSON.stringify(value),before);assert.equal(Object.hasOwn(result.editor.metadata,'__proto__'),true);assert.equal(({} as {preserved?:string}).preserved,undefined);
 const framed=new Uint8Array(bytes.length+10);framed.set(bytes,5);assert.deepEqual(decodeArtworkArchive(framed.subarray(5,5+bytes.length)),value,'nonzero byteOffset must be respected');
 assert.deepEqual(encodeArtworkArchive(before),bytes,'ZIP dates and index bytes are deterministic');
});

test('old v1 design absence and v2 explicit null or design data remain distinct',()=>{
 for(const value of [fixture(1),fixture(2),{...fixture(2),design:{format:'custom-for-envelope-test',nested:{retained:true}}}]){const result=decodeArtworkArchive(encodeArtworkArchive(JSON.stringify(value)));assert.deepEqual(result,value);assert.equal(Object.hasOwn(result as object,'design'),value.version===2);}
 const files=trustedFiles();section(files,'design',utf8.encode('{}'));assert.throws(()=>decodeArtworkArchive(pack(files)),/第一版/);
});

test('the codec validates only the envelope and preserves valid JSON extension values',()=>{
 const value=fixture();(value.editor as any).unknown={deep:['constructor','__proto__',{arbitrary:'source-preserved'}]};assert.deepEqual(decodeArtworkArchive(encodeArtworkArchive(JSON.stringify(value))),value);
 for(const value of [{...fixture(),format:'other'},{...fixture(),version:3},{...fixture(),extra:true},(()=>{const value:any=fixture();delete value.construction;return value;})(),{...fixture(),design:null},(()=>{const value:any=fixture(2);delete value.design;return value;})()])assert.throws(()=>encodeArtworkArchive(JSON.stringify(value)),/字段或版本/);
 assert.throws(()=>encodeArtworkArchive('{bad json'),/无法创建 ORIW/);
});

test('index paths, versions, summaries and section declarations must agree exactly',()=>{
 for(const change of [(value:any)=>{value.version=2;},(value:any)=>{value.format='zip';},(value:any)=>{value.extra=true;},(value:any)=>{value.sections.editor.path='../editor.json';},(value:any)=>{value.sections.editor.bytes++;},(value:any)=>{value.sections.editor.crc32^=1;},(value:any)=>{delete value.sections.models;},(value:any)=>{value.summary.name='spoof';},(value:any)=>{value.summary.steps=-1;}]){const files=trustedFiles();manifest(files,change);assert.throws(()=>decodeArtworkArchive(pack(files)),/ORIW/);}
 const files=trustedFiles();files['editor.json']=utf8.encode('{}');assert.throws(()=>decodeArtworkArchive(pack(files)),/索引声明/);
});

test('rejects missing, extra, unsafe, duplicate and inconsistent ZIP records',()=>{
 const original=encodeArtworkArchive(JSON.stringify(fixture()));
 for(const name of ['../editor.json','/editor.json','editor\\.json','C:editor.json','__proto__']){const files=trustedFiles();files[name]=files['editor.json'];delete files['editor.json'];assert.throws(()=>decodeArtworkArchive(pack(files)),/ORIW/);}
 {const files=trustedFiles();delete files['models.json'];assert.throws(()=>decodeArtworkArchive(pack(files)),/ORIW/);}
 {const files=trustedFiles();files['extra.json']=utf8.encode('null');assert.throws(()=>decodeArtworkArchive(pack(files)),/ORIW/);}
 const mutations=[
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{const record=records.find(record=>record.name==='models.json')!;for(const [index,byte]of utf8.encode('editor.json').entries()){view.setUint8(record.offset+46+index,byte);view.setUint8(record.local+30+index,byte);}},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{const record=records[1];view.setUint16(record.offset+8,1,true);view.setUint16(record.local+6,1,true);},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{const record=records[1];view.setUint16(record.offset+10,99,true);view.setUint16(record.local+8,99,true);},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{view.setUint16(records[1].local+8,8,true);},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{view.setUint32(records[1].local+14,0,true);},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{view.setUint32(records[2].offset+42,records[1].local,true);},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{view.setUint16(records[1].offset+30,4,true);},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{view.setUint16(records[1].offset+6,45,true);},
  (view:DataView,records:ReturnType<typeof centralRecords>)=>{view.setUint32(records[1].offset+24,0xffffffff,true);},
  (view:DataView)=>{view.setUint16(original.length-22+4,1,true);},
  (view:DataView)=>{view.setUint16(original.length-22+8,0xffff,true);},
  (view:DataView)=>{view.setUint32(original.length-22+16,0xffffffff,true);},
 ];
 for(const change of mutations)assert.throws(()=>decodeArtworkArchive(patch(original,change)),/ORIW/);
 assert.throws(()=>decodeArtworkArchive(original.subarray(0,original.length-1)),/ORIW/);
 const trailing=new Uint8Array(original.length+1);trailing.set(original);assert.throws(()=>decodeArtworkArchive(trailing),/ORIW/);
 const prefix=new Uint8Array(original.length+1);prefix.set(original,1);assert.throws(()=>decodeArtworkArchive(prefix),/ORIW/);
});

test('real output CRC, strict UTF8 and actual lengths are verified before JSON publication',()=>{
 const original=encodeArtworkArchive(JSON.stringify(fixture())),entry=inspectArtworkZip(original)[0],damaged=original.slice();damaged[entry.dataStart]^=1;assert.throws(()=>decodeArtworkArchive(damaged),/CRC/);
 const invalidUTF8=trustedFiles();section(invalidUTF8,'editor',Uint8Array.of(0x22,0xc0,0xaf,0x22));assert.throws(()=>decodeArtworkArchive(pack(invalidUTF8)),/无法读取 ORIW/);
 const invalidJSON=trustedFiles();section(invalidJSON,'editor',utf8.encode('{'));assert.throws(()=>decodeArtworkArchive(pack(invalidJSON)),/无法读取 ORIW/);
 const forged=trustedFiles();manifest(forged,value=>{value.sections.editor.bytes=0xfffffffe;});const hugeDeclaration=patch(pack(forged),(view,records)=>{const record=records.find(record=>record.name==='editor.json')!;view.setUint32(record.offset+24,0xfffffffe,true);view.setUint32(record.local+22,0xfffffffe,true);});
 assert.throws(()=>decodeArtworkArchive(hugeDeclaration),/长度或 CRC/,'a huge declared size is not preallocated');
});

test('DEFLATE must finish at the declared boundary without ignored garbage or missing BFINAL',()=>{
 const original=pack(trustedFiles()),entry=inspectArtworkZip(original).find(entry=>entry.name==='editor.json')!,packed=original.subarray(entry.dataStart,entry.dataEnd);
 const garbage=new Uint8Array(packed.length+4);garbage.set(packed);garbage.set([1,2,3,4],packed.length);
 for(const bytes of [replacePacked(original,entry.name,garbage),replacePacked(original,entry.name,packed.subarray(0,packed.length-1)),(()=>{const body=packed.slice();body[0]&=0xfe;return replacePacked(original,entry.name,body);})()]){assert.doesNotThrow(()=>inspectArtworkZip(bytes),'the framing remains valid, so the DEFLATE boundary check must reject');assert.throws(()=>decodeArtworkArchive(bytes),/ORIW/);}
});

test('stream-created ZIP data descriptors are matched at exact offsets',()=>{
 const files=trustedFiles(),chunks:Uint8Array[]=[];let finished=false;
 const zip=new Zip((error,chunk,final)=>{if(error)throw error;chunks.push(chunk);if(final)finished=true;});
 for(const [name,bytes]of Object.entries(files)){const entry=name==='manifest.json'?new ZipPassThrough(name):new ZipDeflate(name,{level:3});entry.mtime=new Date(2000,0,1);zip.add(entry);entry.push(bytes,true);}zip.end();assert.equal(finished,true);
 const bytes=new Uint8Array(chunks.reduce((size,chunk)=>size+chunk.length,0));let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 assert.deepEqual(decodeArtworkArchive(bytes),fixture());
 const entry=inspectArtworkZip(bytes)[1],damaged=bytes.slice();damaged[entry.dataEnd+4]^=1;assert.throws(()=>decodeArtworkArchive(damaged),/ORIW/);
});

test('large highly repetitive metadata is supported without legacy small-file quotas',()=>{
 const value=fixture();value.editor.metadata.large='CP与元数据😀'.repeat(600_000);const text=JSON.stringify(value),bytes=encodeArtworkArchive(text);assert.ok(utf8.encode(text).length>4*1024*1024);assert.deepEqual(decodeArtworkArchive(bytes),value);
});
