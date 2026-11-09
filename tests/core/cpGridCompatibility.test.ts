import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportDocument,importDocument} from '../../src/core/formats';
import {blankDoc,line} from '../../src/app/state';
import {resizeDocument} from '../../src/app/drawingObjects';

test('CP default centres the real paper and matches the original tool grid without changing the document',()=>{
 const doc=blankDoc('网格对齐',210,210);
 doc.segments=doc.segments.map(s=>({...s,a:[s.a[0]-500,s.a[1]+90],b:[s.b[0]-500,s.b[1]+90]}));
 doc.segments.push(line([-447.5,90],[-447.5,300],'V'));
 const before=structuredClone(doc),output=exportDocument(doc,'cp'),loaded=importDocument(output.text,'cp').doc;
 assert.deepEqual(loaded.segments[0].a,[-200,-200]);assert.deepEqual(loaded.segments[1].b,[200,200]);
 assert.deepEqual(loaded.segments.at(-1)!.a,[-100,-200]);
 assert.ok(output.warnings.some(w=>w.includes('400')));assert.deepEqual(doc,before);
 const resized=resizeDocument(doc,420,420);
 assert.equal(exportDocument(resized,'cp').text,output.text,'physical resizing retains relative alignment in CP');
});

test('CP preserves rectangular proportions and off-paper auxiliary geometry; original coordinates remain available',()=>{
 const doc=blankDoc('矩形',300,100);doc.segments.push(line([-30,50],[330,50],'A'));
 const original=importDocument(exportDocument(doc,'cp',{cpCoordinates:'original'}).text,'cp').doc;
 assert.deepEqual(original.segments.map(s=>[s.a,s.b]),doc.segments.map(s=>[s.a,s.b]));
 const normalized=importDocument(exportDocument(doc,'cp').text,'cp').doc;
 assert.equal(normalized.paper.width,400);assert.ok(Math.abs(normalized.paper.height-400/3)<1e-8);
 assert.equal(normalized.segments.at(-1)!.a[0],-240);assert.equal(normalized.segments.at(-1)!.b[0],240);
});
