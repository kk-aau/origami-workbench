import test from 'node:test';
import assert from 'node:assert/strict';
import {newBaseDesign,parseBaseDesign,serializeBaseDesign,validateBaseDesign,treeAddLeaf,treeRemoveLeaf,designResultDocument,designBuildFeedback,type DesignResult} from '../../src/app/baseDesign';
import {BaseDesignLibrary} from '../../src/app/baseDesignLibrary';
import {exportArtworkProject,prepareArtworkProject} from '../../src/app/artworkProject';
import {emptyFoldedModelCollection} from '../../src/app/foldedModelCollection';
import {blankDoc} from '../../src/app/state';
import {tessPreset} from '../../src/app/tessellation';

test('both independent editable designs survive file roundtrip; bad topology and values cannot replace them',()=>{
 for(const kind of ['tree','box'] as const){const design=newBaseDesign(kind),saved=serializeBaseDesign(design);assert.deepEqual(parseBaseDesign(saved),design);const bad=JSON.parse(saved);if(bad.kind==='tree')bad.model.edges[0].nodes=[1,1];else bad.model.design.tree.edges[0].n2=999;assert.throws(()=>validateBaseDesign(bad),/节点/);assert.equal(serializeBaseDesign(design),saved);}
 const tree=newBaseDesign('tree');if(tree.kind!=='tree')throw Error();tree.model.paper.scale=NaN;assert.throws(()=>serializeBaseDesign(tree),/纸张/);
});
test('tree leaf removal remaps imported node and edge conditions without dangling references',()=>{
 const p=newBaseDesign('tree');if(p.kind!=='tree')throw Error();
 p.model.conditions=[{type:'nodes_paired',node1:2,node2:5},{type:'edge_length_fixed',edge:4},{type:'node_on_edge',node:3}];
 const next=treeRemoveLeaf(p.model,3);
 assert.equal(next.nodes.length,4);assert.deepEqual(next.conditions,[{type:'nodes_paired',node1:2,node2:4},{type:'edge_length_fixed',edge:3}]);
 validateBaseDesign({...p,model:treeAddLeaf(next,1)});assert.equal(p.model.nodes.length,5);
 assert.throws(()=>treeRemoveLeaf(p.model,1),/叶节点/);
});
test('Box Pleating CP preserves border / mountain / valley and translates centered engine coordinates to the paper',()=>{
 const p=newBaseDesign('box'),result={kind:'box',ready:true,pattern:{sheet:{width:400,height:200},lines:[{id:'b',assignment:'border',p1:{x:-200,y:-100},p2:{x:200,y:-100}},{id:'m',assignment:'mountain',p1:{x:0,y:-100},p2:{x:0,y:100}},{id:'v',assignment:'valley',p1:{x:-200,y:0},p2:{x:200,y:0}}]}} as DesignResult;
 const doc=designResultDocument(p,result,200);assert.deepEqual(doc.paper,{width:200,height:100});assert.deepEqual(doc.segments[0].a,[0,0]);assert.deepEqual(doc.segments[0].b,[200,0]);assert.equal(doc.segments[0].assignment,'B');assert.equal(doc.segments[1].angle,-180);assert.equal(doc.segments[2].angle,180);
 assert.throws(()=>designResultDocument(p,{...result,ready:false} as DesignResult),/完整折痕/);
 assert.throws(()=>designResultDocument(newBaseDesign('tree'),{kind:'tree',fold:null} as DesignResult),/完整折痕/);
});
test('design library preserves drafts and rejects stale writes / deletes from a second window',()=>{
 const map=new Map<string,string>();const storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);},compareAndSet:(key:string,expected:string|null,value:string)=>{if((map.get(key)??null)!==expected)return false;map.set(key,value);return true;}};
 const a=new BaseDesignLibrary(storage),b=new BaseDesignLibrary(storage);assert.equal(a.list().length,0);
 const original=a.write(newBaseDesign('box'),null),foreign=b.list()[0],updated=a.write({...original.project,name:'另存前修改'},original);
 assert.throws(()=>b.write({...foreign.project,name:'旧窗口'},foreign),/另一窗口/);assert.throws(()=>b.remove(foreign),/变化/);
 const saved=a.write(updated.project,updated,true);assert.equal(saved.saved,serializeBaseDesign(saved.project));assert.equal(b.list()[0].project.name,'另存前修改');
 const copy=b.write(foreign.project,null);assert.notEqual(copy.id,saved.id);assert.equal(a.list().length,2);b.remove(copy);assert.equal(a.list().length,1);
});

test('tree build distinguishes partial construction, infeasible layout and validated CP',()=>{
 const p=newBaseDesign('tree');if(p.kind!=='tree')throw Error();
 const partial={kind:'tree',project:p.model,snapshot:{summary:{is_feasible:true},cp_status_report:{status:'polys_multiple_ibps'}},fold:null} as DesignResult;
 const before=serializeBaseDesign(p),failed=designBuildFeedback(p,partial);
 assert.equal(failed.doc,null);assert.match(failed.message,/未生成完整折痕图.*内骨架.*优化布局/);
 if(partial.kind!=='tree')throw Error();
 const invalid=designBuildFeedback(p,{...partial,snapshot:{...partial.snapshot,summary:{...partial.snapshot.summary,is_feasible:false}}});
 assert.match(invalid.message,/路径约束尚未满足/);
 const empty=designBuildFeedback(p,{...partial,project:{...p.model,nodes:[],edges:[]}});assert.match(empty.message,/先画出至少一条/);
 const complete={...partial,snapshot:{...partial.snapshot,cp_status_report:{status:'has_full_cp'}},fold:{vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B']}};
 const ready=designBuildFeedback(p,complete);assert.equal(ready.doc?.segments.length,4);assert.match(ready.message,/已生成.*4 条/);
 const malformed=designBuildFeedback(p,{...complete,fold:{vertices_coords:[],edges_vertices:[[0,1]],edges_assignment:['B']}});assert.equal(malformed.doc,null);assert.match(malformed.message,/未通过编辑区校验/);
 assert.equal(designBuildFeedback(p,{...complete,fold:null}).doc,null);
 assert.equal(serializeBaseDesign(p),before);
});

test('box build reports unresolved output rather than a completed CP',()=>{
 const result={kind:'box',ready:false,pattern:null,packingError:'overlap',graphics:{patternNotFound:false}} as DesignResult;
 const feedback=designBuildFeedback(newBaseDesign('box'),result);assert.equal(feedback.doc,null);assert.match(feedback.message,/未生成完整折痕图.*打包约束/);
});
test('complete artwork v2 includes the editable design and keeps v1 compatible',()=>{
 const old={editor:blankDoc('基础形',200,200),models:emptyFoldedModelCollection(),diagram:null,simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}};
 assert.equal(JSON.parse(exportArtworkProject(old)).version,1);
 for(const kind of ['tree','box'] as const){const p={...old,design:newBaseDesign(kind)},text=exportArtworkProject(p);assert.equal(JSON.parse(text).version,2);assert.deepEqual(prepareArtworkProject(text).design,p.design);const invalid=JSON.parse(text);invalid.design.model={};assert.throws(()=>prepareArtworkProject(JSON.stringify(invalid)),/纸张|信息/);}
});
