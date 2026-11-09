import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readProjectFile} from '../../src/app/importFile';
import {prepareProjectImport} from '../../src/app/prepareProjectImport';
import {exportDocument,importDocument,importFold} from '../../src/core/formats';
import {blankDoc} from '../../src/app/state';

const padding='x'.repeat(33*1024*1024);
for(const format of ['cp','opx','ori','orh','fold'] as const){
  test(`${format.toUpperCase()} above 32 MiB opens completely and roundtrips through native storage`,async()=>{
    let text=exportDocument(blankDoc('大文件导入',100,100),format,{cpCoordinates:'original'}).text;
    if(format==='cp')text='# '+padding+'\n'+text;
    else if(format==='opx')text=text.replace('</java>','<!--'+padding+'-->\n</java>');
    else if(format==='orh')text+='\r\n<unmapped-settings>\r\n'+padding+'\r\n';
    else text=JSON.stringify({...JSON.parse(text),originalExtension:padding});
    assert.ok(Buffer.byteLength(text)>32*1024*1024);
    const loaded=await readProjectFile(new File([text],`large.${format}`)),prepared=prepareProjectImport(loaded.doc);
    assert.equal(prepared.segments.length,4);assert.equal(prepared.segments.filter(s=>s.assignment==='B').length,4);
    const native=exportDocument(prepared,'json').text;
    assert.deepEqual(importDocument(native,'json').doc,prepared);
    if(format==='ori')assert.equal((prepared.metadata!.oriSource as Record<string,unknown>).originalExtension,padding);
    if(format==='fold')assert.equal((prepared.metadata!.sourceFoldExtras as Record<string,unknown>).originalExtension,padding);
    if(format==='orh')assert.ok((prepared.metadata!.orhSource as string).includes(padding));
  });
}

test('large CP geometry imports completely without argument-stack overflow or a segment quota',()=>{
  const count=80_000,text=Array.from({length:count},(_,i)=>`2 0 ${i} 100 ${i}`).join('\n');
  const doc=importDocument(text,'cp').doc;
  assert.equal(doc.segments.length,count);assert.deepEqual(doc.paper,{width:100,height:count-1});
  assert.deepEqual(doc.segments.at(-1)?.b,[100,count-1]);
});

test('all exchange formats retain more than the former 12000 segments',()=>{
  const count=12_001,doc=blankDoc('大量辅助线',100,100);
  doc.segments=Array.from({length:count},(_,i)=>({id:`a-${i}`,a:[0,i],b:[100,i],assignment:'A',angle:0}));
  for(const format of ['cp','ori','orh','opx','fold'] as const){
    const text=exportDocument(doc,format,{cpCoordinates:'original'}).text,loaded=importDocument(text,format).doc;
    assert.equal(loaded.segments.length,count,format);assert.ok(loaded.segments.every(s=>s.assignment==='A'),format);
    assert.deepEqual(loaded.segments.at(-1)?.b,[100,count-1],format);
  }
});

test('FOLD auxiliary extensions append without argument-stack overflow',()=>{
  const count=130_000,aux=Array.from({length:count},(_,i)=>({id:`a-${i}`,a:[0,i],b:[100,i],assignment:'A',angle:0}));
  const doc=importFold({vertices_coords:[],edges_vertices:[],zhezhi_auxiliary:aux}).doc;
  assert.equal(doc.segments.length,count);assert.deepEqual(doc.segments.at(-1)?.b,[100,count-1]);
});
