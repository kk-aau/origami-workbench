import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importORI,exportORI} from '../../src/core/ori';
import {blankDoc} from '../../src/app/state';
import {exportDocument,importDocument} from '../../src/core/formats';

test('document format dispatch exports ORI JSON and imports its geometry',()=>{
  const doc=blankDoc('ORI 导出',100,100),out=exportDocument(doc,'ori');
  assert.deepEqual(out,exportORI(doc));
  assert.equal(JSON.parse(out.text)['@version'],'v1.1');
  assert.deepEqual(importDocument(out.text,'ori').doc.segments.map(({a,b,assignment})=>({a,b,assignment})),doc.segments.map(({a,b,assignment})=>({a,b,assignment})));
});
const sample=(file='save-1.0.0-v1.1.ori')=>readFileSync(new URL('../../../zhezhi/oriedita/src/test/resources/save/'+file,import.meta.url),'utf8');

test('ORI export replaces edited geometry but retains source root settings without mutating input',()=>{
  const {doc}=importORI(sample()),source=doc.metadata!.oriSource as any;doc.segments[4].a=[-123.5,45];doc.name='已编辑';const before=structuredClone(doc),out=exportORI(doc),raw=JSON.parse(out.text),loaded=importORI(out.text).doc;
  assert.equal(raw['@version'],'v1.1');assert.equal(raw.title,'已编辑');assert.equal(raw.lineSegments[4].a,'-123.5,45');assert.deepEqual(raw.gridModel,source.gridModel);assert.deepEqual(loaded.segments,doc.segments);assert.deepEqual(loaded.objects,doc.objects);assert.deepEqual(doc,before);assert.ok(out.warnings.some(w=>w.includes('未随')));
});
test('new documents export genuine ORI with separate object lists and opaque custom colors',()=>{
  const doc=blankDoc('新作',100,100);doc.segments[0].displayColor='#112233';doc.objects=[{id:'c',kind:'circle',center:[10,20],radius:3,color:'#345678'},{id:'m',kind:'mark',a:[1,2],b:[3,4],color:'#abcdef'},{id:'t',kind:'text',position:[5,6],text:'中文\n注释',fontSize:9,color:'#654321'}];
  const out=exportORI(doc),raw=JSON.parse(out.text),loaded=importORI(out.text).doc;assert.equal(raw.lineSegments.length,4);assert.equal(raw.auxLineSegments.length,1);assert.equal(raw.lineSegments[0].color,'BLACK_0');assert.equal(raw.lineSegments[0].customizedColor,'ff112233');assert.equal(loaded.segments[0].displayColor,'#112233');assert.equal(loaded.objects![0].color,'#abcdef');assert.equal(loaded.objects![1].color,'#345678');assert.equal(raw.texts[0].text,'中文\n注释');assert.ok(out.warnings.some(w=>w.includes('字号')));assert.equal(raw.creasePatternCamera,undefined);
});
test('ORI export refuses unsupported crease assignments and warns about target angle loss',()=>{
  const doc=blankDoc('x',100,100);for(const assignment of ['U','F'] as const){doc.segments[0].assignment=assignment;doc.segments[0].angle=assignment==='U'?null:0;assert.throws(()=>exportORI(doc),/不能无损/);}
  doc.segments[0].assignment='M';doc.segments[0].angle=-45;assert.ok(exportORI(doc).warnings.some(w=>w.includes('目标折角')));
});
test('upstream ORI v1.1 fixture preserves crease types, coordinates and separate objects',()=>{
  const raw=JSON.parse(sample()),{doc,warnings}=importORI(sample());assert.equal(doc.segments.length,8);assert.deepEqual(doc.segments.map(s=>s.assignment),['B','B','B','B','M','V','B','A']);assert.deepEqual(doc.segments[0].a,[-200,-200]);assert.deepEqual(doc.paper,{width:400,height:400});
  assert.equal(doc.objects!.filter(o=>o.kind==='mark').length,2);assert.equal(doc.objects!.filter(o=>o.kind==='circle').length,1);assert.equal(doc.objects!.filter(o=>o.kind==='text').length,1);assert.deepEqual(doc.metadata!.oriSource,raw);assert.ok(warnings.some(w=>w.includes('未应用')));
});
test('upstream v1 fixture loads without inventing text or crease edges for marks',()=>{const {doc}=importORI(sample('save-1.0.0-ALPHA.13.ori'));assert.equal(doc.objects!.length,3);assert.equal(doc.segments.length,8);assert.equal(doc.segments[4].angle,-180);assert.equal(doc.segments[5].angle,180);});
test('custom display color never changes mountain assignment and alpha loss is warned',()=>{const raw=JSON.parse(sample());raw.lineSegments[4].customized=1;raw.lineSegments[4].customizedColor='80887766';const {doc,warnings}=importORI(JSON.stringify(raw));assert.equal(doc.segments[4].assignment,'M');assert.equal(doc.segments[4].displayColor,'#887766');assert.ok(warnings.some(w=>w.includes('透明度')));});
test('unknown versions, folding colors and malformed points reject instead of guessing',()=>{
  for(const change of [(r:any)=>r['@version']='v9',(r:any)=>r.lineSegments[0].color='ORANGE_4',(r:any)=>r.lineSegments[0].a=' ,1',(r:any)=>r.circles[0].r=-1,(r:any)=>r.auxLineSegments[0].a='Infinity,0']){const raw=JSON.parse(sample());change(raw);assert.throws(()=>importORI(JSON.stringify(raw)));}
});
