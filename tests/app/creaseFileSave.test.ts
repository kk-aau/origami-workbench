import assert from 'node:assert/strict';
import test from 'node:test';
import {importDocument} from '../../src/core/formats';
import {creaseFileFormat,readProjectFile} from '../../src/app/importFile';
import {encodeCreaseFile} from '../../src/app/creaseFileSave';

const square='1 10 20 40 20\n1 40 20 40 50\n1 40 50 10 50\n1 10 50 10 20\n2 10 20 40 50\n';
for(const format of ['cp','fold','ori','orh','opx','json'] as const){
  test(format+' writes edited geometry in a file readable by its own importer',async()=>{
    const name='纸张.'+(format==='json'?'ZCP':format.toUpperCase());
    const doc=importDocument(square,'cp').doc;
    doc.segments[4]={...doc.segments[4],assignment:'V',angle:180};
    assert.equal(creaseFileFormat(name),format);
    const {bytes}=await encodeCreaseFile(doc,creaseFileFormat(name));
    const loaded=await readProjectFile(new File([bytes],name));
    assert.equal(loaded.doc.segments.length,5);
    assert.equal(loaded.doc.segments.some(s=>s.assignment==='M'),false);
    const valley=loaded.doc.segments.find(s=>s.assignment==='V');
    assert.ok(valley);
    assert.deepEqual([valley.a,valley.b].sort(),[[10,20],[40,50]]);
  });
}
for(const bom of [[255,254],[254,255],[239,187,191]]){
  test('CP retains source BOM '+bom.join(','),async()=>{
    const {bytes}=await encodeCreaseFile(importDocument(square,'cp').doc,'cp',new Blob([Uint8Array.from(bom)]));
    assert.deepEqual([...new Uint8Array(await bytes.slice(0,bom.length).arrayBuffer())],bom);
    assert.equal((await readProjectFile(new File([bytes],'图.cp'))).doc.segments.length,5);
  });
}
