import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serializeProject} from '../../src/core/projectData.mjs';
import {validateDoc} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {appendText} from '../../src/app/textTools';
import {readProjectFile} from '../../src/app/importFile';
import {importDocument,exportDocument} from '../../src/core/formats';

test('previously exported native backups above 8 MB reopen through the file picker',async()=>{
  const doc=blankDoc('大工程中文往返');
  doc.objects=Array.from({length:266},(_,i)=>({id:'text'+i,kind:'text',position:[10,10],text:'字'.repeat(9980),fontSize:5,color:'#123456'}));
  const legacy=JSON.stringify({...doc,format:'zhezhi-workbench',version:2},null,2);
  assert.ok(Buffer.byteLength(legacy)>8_000_000);
  const loaded=await readProjectFile({name:'旧备份.zhezhi.json',size:Buffer.byteLength(legacy),text:async()=>legacy,arrayBuffer:async()=>{throw Error('text file');}});
  assert.deepEqual(loaded.doc,doc);
  assert.deepEqual(importDocument(exportDocument(loaded.doc,'json').text,'json').doc,doc);
});

test('native files above the former 32 MiB quota remain editable and roundtrip without data loss',async()=>{
  const doc={...blankDoc('大工程'),metadata:{padding:'字'.repeat(12_000_000)}};
  validateDoc(doc);
  const exported=exportDocument(doc,'json');assert.ok(Buffer.byteLength(exported.text)>32*1024*1024);
  const loaded=await readProjectFile(new File([exported.text],'large.json'));
  assert.deepEqual(loaded.doc,doc);
  const edited=appendText(loaded.doc,{position:[0,0],text:'再加一个字',fontSize:5,color:'#123456'});
  assert.equal(edited.objects?.at(-1)?.kind,'text');assert.equal(edited.metadata?.padding,doc.metadata.padding);
  assert.deepEqual(importDocument(serializeProject(edited),'json').doc,edited);
  assert.equal(doc.objects?.length,0);
});

test('removing file quotas retains structural and coordinate validation',()=>{
  assert.throws(()=>importDocument('{broken','json'),/JSON/);
  const invalid=blankDoc();invalid.segments[0].a[0]=Infinity;
  assert.throws(()=>validateDoc(invalid),/坐标/);
});
