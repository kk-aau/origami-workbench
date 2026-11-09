import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBackground,type BackgroundImage} from '../../src/core/backgroundData.mjs';
import {validateDoc,type Doc} from '../../src/core/types';
import {importDocument,exportDocument} from '../../src/core/formats';
import {buildFold} from '../../src/core/geometry';
const background:BackgroundImage={name:'参考图.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ZkAAAAASUVORK5CYII=',width:1,height:1,opacity:.5,visible:true,placement:{origin:[20,30],axis:[50,0]}};
const doc:Doc={name:'底图工程',paper:{width:200,height:200},segments:[],background};
test('screen reference roundtrips and malformed references reject on shared validator',()=>{
  const fixed={...background,viewport:{x:-50,y:25,units:.5}},project={...doc,background:fixed};
  assert.deepEqual(importDocument(exportDocument(project,'json').text,'json').doc.background,fixed);
  for(const viewport of [null,{},false,{x:0,y:0,units:0},{x:0,y:0,units:-1},{x:NaN,y:0,units:1},{x:0,y:Infinity,units:1},{x:0,y:0,units:1e7},{x:1e7,y:0,units:1}])assert.throws(()=>validateBackground({...background,viewport}),/参照/);
});
test('background embedded bytes and transform roundtrip native JSON without extras or loss',()=>{
  validateDoc(doc);const parsed=importDocument(exportDocument(doc,'json').text,'json');
  assert.deepEqual(parsed.doc.background,background);assert.deepEqual(parsed.warnings,[]);assert.equal(parsed.doc.metadata,undefined);
  assert.notEqual(parsed.doc.background,background);
});
test('remote/blob/svg references, corrupted encoding and MIME mismatch reject',()=>{
  for(const dataUrl of ['https://example.com/a.png','blob:foo','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,@@@@',background.dataUrl.replace('image/png','image/jpeg')])assert.throws(()=>validateBackground({...background,dataUrl}));
});
test('size, opacity, visibility and placement guards reject before accepting document',()=>{
  for(const patch of [{width:0},{height:1.5},{width:16385},{width:10000,height:10000},{opacity:NaN},{opacity:1.1},{visible:'yes'},{placement:{origin:[0,0],axis:[0,0]}},{placement:{origin:[1e6,1e6],axis:[100,0]}},{dataUrl:'x'.repeat(4_000_001)}])assert.throws(()=>validateDoc({...doc,background:{...background,...patch}}));
});
test('geometry ignores background and exchange formats warn instead of implying preservation',()=>{
  const square:Doc={...doc,segments:[{id:'a',a:[0,0],b:[200,0],assignment:'B',angle:0},{id:'b',a:[200,0],b:[200,200],assignment:'B',angle:0},{id:'c',a:[200,200],b:[0,200],assignment:'B',angle:0},{id:'d',a:[0,200],b:[0,0],assignment:'B',angle:0}]};
  assert.deepEqual(buildFold(square).graph,buildFold({...square,background:undefined}).graph);
  for(const format of ['cp','opx','fold'] as const){const result=exportDocument(square,format);assert.ok(result.warnings.some(w=>w.includes('底图')));assert.ok(!result.text.includes(background.dataUrl));}
});
