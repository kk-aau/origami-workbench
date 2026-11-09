import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyEditorHistory,editorHistoryReducer as reduce} from '../../src/app/editorHistory';
import {appendMark} from '../../src/app/markTools';
import {exampleDoc,line} from '../../src/app/state';

test('selective mark undo retains later geometry and global undo restores both histories',()=>{
 let state=emptyEditorHistory(exampleDoc());
 state=reduce(state,{type:'commit',doc:appendMark(state.present,[1,1],[2,2])});
 state=reduce(state,{type:'commit',doc:{...state.present,segments:[...state.present.segments,line([20,0],[20,200],'M')]}});
 const before=state,segments=state.present.segments;
 state=reduce(state,{type:'markundo'});assert.equal(state.present.segments,segments);assert.equal(state.marks.future.length,1);assert.equal(state.present.objects!.length,0);
 const undone=state;
 state=reduce(state,{type:'undo'});assert.equal(state.present,before.present);assert.equal(state.marks,before.marks);
 state=reduce(state,{type:'redo'});assert.equal(state.present,undone.present);assert.equal(state.marks,undone.marks);
 state=reduce(state,{type:'markredo'});assert.equal(state.present.segments,segments);assert.equal(state.present.objects!.length,1);assert.equal(state.error,null);
});

test('non-marker edits preserve selective redo while new marker edits invalidate it',()=>{
 let state=emptyEditorHistory(exampleDoc());state=reduce(state,{type:'commit',doc:appendMark(state.present,[1,1],[2,2])});
 state=reduce(state,{type:'markundo'});
 state=reduce(state,{type:'commit',doc:{...state.present,name:'changed'}});assert.equal(state.marks.future.length,1);
 state=reduce(state,{type:'markredo'});assert.equal(state.present.name,'changed');
 state=reduce(state,{type:'markundo'});
 state=reduce(state,{type:'commit',doc:appendMark(state.present,[3,3],[4,4])});assert.equal(state.marks.future.length,0);
});

test('global undo of mark creation restores marker redo state exactly',()=>{
 let state=emptyEditorHistory(exampleDoc());const empty=state;
 state=reduce(state,{type:'commit',doc:appendMark(state.present,[1,1],[2,2])});
 const created=state;state=reduce(state,{type:'undo'});assert.equal(state.marks,empty.marks);
 assert.equal(reduce(state,{type:'markundo'}),state);
 state=reduce(state,{type:'redo'});assert.equal(state.marks,created.marks);
});

test('failed selective redo reports a conflict and preserves all undo frames',()=>{
 let state=emptyEditorHistory(exampleDoc());state=reduce(state,{type:'commit',doc:appendMark(state.present,[1,1],[2,2])});
 state=reduce(state,{type:'markundo'});
 state=reduce(state,{type:'commit',doc:{...state.present,segments:[...state.present.segments,{...line([20,0],[20,200],'M'),id:'mark'}]}});
 const result=reduce(state,{type:'markredo'});assert.match(result.error!,/重复/);
 for(const key of ['present','past','future','marks','pastMarks','futureMarks'] as const)assert.equal(result[key],state[key]);
});

test('bounded document frames and marker frames stay aligned through undo redo and replacement',()=>{
 let state=emptyEditorHistory(exampleDoc());
 for(let i=0;i<80;i++)state=reduce(state,{type:'commit',doc:i%2?{...state.present,name:String(i)}:appendMark(state.present,[i,0],[i,10])});
 assert.equal(state.past.length,60);assert.equal(state.pastMarks.length,60);
 for(let i=0;i<60;i++){state=reduce(state,{type:'undo'});assert.ok(state.marks);assert.equal(state.past.length,state.pastMarks.length);assert.equal(state.future.length,state.futureMarks.length);}
 for(let i=0;i<60;i++){state=reduce(state,{type:'redo'});assert.equal(state.error,null);assert.equal(state.past.length,state.pastMarks.length);}
 state=reduce(state,{type:'replace',doc:exampleDoc()});assert.equal(state.past.length+state.future.length+state.marks.past.length+state.marks.future.length,0);
});
