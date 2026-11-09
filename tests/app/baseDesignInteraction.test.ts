import test from 'node:test';
import assert from 'node:assert/strict';
import {newBaseDesign,validateBaseDesign} from '../../src/app/baseDesign';
import {blankBaseDesign,addDesignNode,moveTreeNodes,splitTreeEdge,deleteTreeSelection,constrainDesignDelta,designSubtree,toggleDesignSelection,createDesignGestureQueue,type DesignEditCommand} from '../../src/app/baseDesignInteraction';
const tick=()=>new Promise<void>(r=>setImmediate(r));

test('blank designs can be drawn from their first vertex and keep a connected editable source',()=>{
 for(const kind of ['tree','box'] as const){let p=blankBaseDesign(kind);validateBaseDesign(p);p=addDesignNode(p,null,{x:.3,y:.3},1);p=addDesignNode(p,kind==='tree'?1:0,{x:.6,y:.6},1);p=addDesignNode(p,kind==='tree'?1:0,{x:.2,y:.7},1);validateBaseDesign(p);if(p.kind==='box')assert.equal(p.model.design.layout.flaps.length,2);else assert.equal(p.model.edges.length,2);}
});
test('splitting a tree branch preserves its total metric length; pinned manual moves update the optimizer anchor',()=>{
 const p=newBaseDesign('tree');if(p.kind!=='tree')throw Error();
 p.model.conditions=[{type:'edge_length_fixed',edge:1},{type:'node_fixed',node:2,x_fixed:true,y_fixed:true,x_fix_value:.15,y_fix_value:.15}];
 const split=splitTreeEdge(p.model,1);validateBaseDesign({...p,model:split});assert.equal(split.edges.filter(e=>e.nodes.includes(6)).reduce((n,e)=>n+e.length,0),1);assert(!split.conditions.some(c=>c.type==='edge_length_fixed'));
 const moved=moveTreeNodes(split,[{id:2,x:.2,y:.3}]);assert.equal(moved.conditions[0].x_fix_value,.2);assert.equal(p.model.nodes[1].loc.x,.15);
});
test('multi selection and group displacement preserve shape and handle large groups without argument spread',()=>{
 let s=toggleDesignSelection({nodes:[],edges:[]},'node',2,false);s=toggleDesignSelection(s,'node',3,true);s=toggleDesignSelection(s,'node',2,true);assert.deepEqual(s,{nodes:[3],edges:[]});
 assert.deepEqual(constrainDesignDelta([{x:1,y:2},{x:8,y:6}],{x:6,y:-7},10,10),{x:2,y:-2});
 const points=Array.from({length:150000},(_,i)=>({x:i/150000,y:.5}));assert.equal(constrainDesignDelta(points,{x:-1,y:0},1,1).x,0);
 const p=newBaseDesign('tree');assert.deepEqual(designSubtree(p,2),[2]);assert.equal(designSubtree(p,1).length,5);
});
test('deleting selected terminal branches is atomic and can return to a single root or an empty design',()=>{
 const p=newBaseDesign('tree');if(p.kind!=='tree')throw Error();const next=deleteTreeSelection(p.model,[2,3,4,5]);assert.equal(next.nodes.length,1);assert.equal(next.edges.length,0);validateBaseDesign({...p,model:next});
 assert.equal(deleteTreeSelection(next,[1]).nodes.length,0);assert.throws(()=>deleteTreeSelection(p.model,[1,2]),/只能删除/);assert.equal(p.model.nodes.length,5);
});
test('gesture requests are serialized, pending previews collapse, and release always receives one final solve',async()=>{
 const sent:{command:DesignEditCommand;resolve:(n:number)=>void}[]=[],seen:number[]=[],commits:number[]=[];let idle=0;
 const q=createDesignGestureQueue<number>({request:command=>new Promise(resolve=>sent.push({command,resolve})),preview:n=>seen.push(n),commit:n=>commits.push(n),error:e=>{throw e;},stop:async()=>{},idle:()=>idle++});
 q.submit({type:'moveFlaps',x:1});q.submit({type:'moveFlaps',x:2});q.submit({type:'moveFlaps',x:3});assert.equal(sent.length,1);
 sent[0].resolve(1);await tick();assert.equal(sent.length,2);assert.equal(sent[1].command.x,3);
 q.submit({type:'moveFlaps',x:3},true);sent[1].resolve(3);await tick();assert.equal(sent.length,3);sent[2].resolve(4);await tick();assert.deepEqual(seen,[1,3]);assert.deepEqual(commits,[4]);assert.equal(idle,1);
});
test('cancelled gesture discards late replies and releases its lease only after the worker acknowledges stop',async()=>{
 let complete!:(n:number)=>void,stopped!:()=>void,idle=0,updates=0;
 const q=createDesignGestureQueue<number>({request:()=>new Promise(r=>complete=r),preview:()=>updates++,commit:()=>updates++,error:()=>{},stop:()=>new Promise<void>(r=>stopped=r),idle:()=>idle++});
 q.submit({type:'moveFlaps',x:1});const stopping=q.cancel();await tick();complete(1);await tick();assert.equal(updates,0);assert.equal(idle,0);stopped();await stopping;assert.equal(idle,1);
});
test('a selection click with no movement does not terminate a warm native worker',async()=>{
 let stopped=0,idle=0;
 const q=createDesignGestureQueue<number>({request:async()=>0,preview:()=>{},commit:()=>{},error:()=>{},stop:async()=>{stopped++;},idle:()=>idle++});
 await q.cancel();assert.equal(stopped,0);assert.equal(idle,1);
});
