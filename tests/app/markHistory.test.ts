import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyMarkHistory,recordMarkHistory,stepMarkHistory} from '../../src/app/markHistory';
import {appendMark,deleteMarks} from '../../src/app/markTools';
import {exampleDoc,line} from '../../src/app/state';

test('marker undo preserves later creases, text, circles, paper and metadata',()=>{
 const base=exampleDoc(),created=appendMark(base,[10,10],[20,20]);
 const history=recordMarkHistory(emptyMarkHistory(base),base,created);
 const edited={...created,name:'后续工程名',metadata:{note:'保留'},segments:[...created.segments,line([40,0],[40,200],'V')],objects:[...created.objects!,{kind:'text' as const,id:'text',position:[50,50] as [number,number],text:'保留文字',fontSize:5,color:'#123456'},{kind:'circle' as const,id:'circle',center:[80,80] as [number,number],radius:10,color:'#abcdef'}]};
 assert.equal(recordMarkHistory(history,created,edited),history);
 const result=stepMarkHistory(history,edited,'undo');
 assert.equal(result.doc.segments,edited.segments);assert.equal(result.doc.paper,edited.paper);assert.equal(result.doc.metadata,edited.metadata);
 assert.equal(result.doc.name,edited.name);assert.deepEqual(result.doc.objects,edited.objects.filter(o=>o.kind!=='mark'));
 const redo=stepMarkHistory(result.history,result.doc,'redo');assert.deepEqual(redo.doc.objects?.find(o=>o.kind==='mark'),created.objects![0]);
 assert.equal(redo.doc.segments,edited.segments);
});

test('marker deletion restores exact geometry and colors and new marker edits discard redo',()=>{
 const base=exampleDoc(),one=appendMark(base,[1,2],[3,4],'#abcdef'),two=appendMark(one,[5,6],[7,8]);
 let history=recordMarkHistory(emptyMarkHistory(base),base,one);history=recordMarkHistory(history,one,two);
 const removed=deleteMarks(two,new Set([two.objects![0].id]));history=recordMarkHistory(history,two,removed);
 const undo=stepMarkHistory(history,removed,'undo');
 assert.deepEqual(undo.doc.objects!.filter(o=>o.kind==='mark'),two.objects);
 assert.deepEqual(new Map(undo.doc.objects!.map(o=>[o.id,o])),new Map(two.objects!.map(o=>[o.id,o])));
 const fresh=appendMark(undo.doc,[9,10],[11,12]);
 assert.equal(recordMarkHistory(undo.history,undo.doc,fresh).future.length,0);
});

test('empty steps are no-ops and snapshots cannot be changed through source coordinates',()=>{
 const base=exampleDoc(),empty=emptyMarkHistory(base);assert.equal(stepMarkHistory(empty,base,'undo').doc,base);
 const created=appendMark(base,[10,10],[20,20]),history=recordMarkHistory(empty,base,created);
 const object=created.objects![0];if(object.kind==='mark')object.a[0]=99;
 assert.equal(history.present[0].a[0],10);
 assert.throws(()=>stepMarkHistory(history,created,'undo'),/过期历史/);
 assert.throws(()=>recordMarkHistory(history,base,created),/不一致/);
});

test('redo refuses ID collisions without mutating history or unrelated geometry',()=>{
 const base=exampleDoc(),created=appendMark(base,[1,1],[2,2]),history=recordMarkHistory(emptyMarkHistory(base),base,created);
 const undone=stepMarkHistory(history,created,'undo');
 const conflicting={...undone.doc,segments:[...undone.doc.segments,{...line([10,0],[10,100],'M'),id:'mark'}]};
 const before=structuredClone(undone.history),docBefore=structuredClone(conflicting);
 assert.throws(()=>stepMarkHistory(undone.history,conflicting,'redo'),/重复/);
 assert.deepEqual(undone.history,before);assert.deepEqual(conflicting,docBefore);
});

test('marker history is bounded and replacement starts an independent session',()=>{
 let doc=exampleDoc(),history=emptyMarkHistory(doc);
 for(let i=0;i<70;i++){const next=appendMark(doc,[i,0],[i,10]);history=recordMarkHistory(history,doc,next);doc=next;}
 assert.equal(history.past.length,60);
 assert.deepEqual(emptyMarkHistory(exampleDoc()).past,[]);
 assert.equal(history.present.length,70);
});
