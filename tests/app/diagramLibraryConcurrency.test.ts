import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,type DiagramProject} from '../../src/app/diagramProject';
import {createDiagramLibrary,DiagramLibraryConflictError,DIAGRAM_LIBRARY_KEY} from '../../src/app/diagramLibrary';

function project(name='并发绘图'):DiagramProject {let id=0;return createDiagramProject(blankDoc(name,100,100),()=>`step-${++id}`);}
function store(){
  const values=new Map<string,string>();let beforeCompare:((key:string,expected:string|null,value:string)=>void)|undefined;
  let getHook:((key:string,value:string|null)=>string|null)|undefined;
  return {values,getItem:(key:string)=>{const value=values.get(key)??null;return getHook?getHook(key,value):value;},setItem:(key:string,value:string)=>{values.set(key,value);},
    compareAndSet(key:string,expected:string|null,value:string){beforeCompare?.(key,expected,value);if((values.get(key)??null)!==expected)return false;values.set(key,value);return true;},
    hook(callback:typeof beforeCompare){beforeCompare=callback;},
    onGet(callback:typeof getHook){getHook=callback;},
  };
}
function library(backing:ReturnType<typeof store>,prefix:string){let id=0,stamp=100;return createDiagramLibrary(backing,{idFactory:()=>`${prefix}-${++id}`,now:()=>stamp++});}

test('two windows saving different documents retry index CAS and merge both authored updates',()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),first=a.save(project('第一份'),{kind:'saved'}),second=a.save(project('第二份'),{kind:'saved'}),firstProject=a.load(first.id),secondProject=b.load(second.id);
  firstProject.steps[0].description='窗口A的修改';secondProject.steps[0].description='窗口B的修改';
  backing.hook(key=>{if(key===DIAGRAM_LIBRARY_KEY){backing.hook(undefined);b.save(secondProject,{id:second.id,kind:'saved'});}});
  a.save(firstProject,{id:first.id,kind:'saved'});
  assert.equal(a.load(first.id).steps[0].description,'窗口A的修改');assert.equal(a.load(second.id).steps[0].description,'窗口B的修改');assert.equal(a.read().documents.length,2);
});

test('a stale same-document window cannot overwrite the winner and can save its full draft as a new drawing',()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),entry=a.save(project(),{kind:'saved'}),first=a.load(entry.id),second=b.load(entry.id);
  first.steps[0].description='旧窗仍在编辑的内容';second.steps[0].description='新窗已保存的内容';
  backing.hook(key=>{if(key===DIAGRAM_LIBRARY_KEY){backing.hook(undefined);b.save(second,{id:entry.id,kind:'saved'});}});
  assert.throws(()=>a.save(first,{id:entry.id,kind:'saved'}),DiagramLibraryConflictError);
  assert.equal(a.hasExternalChanges(entry.id),true);assert.equal(b.load(entry.id).steps[0].description,'新窗已保存的内容');
  const fork=a.save(first,{kind:'saved'});assert.notEqual(fork.id,entry.id);assert.equal(a.load(fork.id).steps[0].description,'旧窗仍在编辑的内容');assert.equal(b.load(entry.id).steps[0].description,'新窗已保存的内容');
});

test('reading or renaming externally changed metadata never claims the other window content as the old editor base',()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),entry=a.save(project(),{kind:'saved'}),old=a.load(entry.id),latest=b.load(entry.id);
  latest.steps[0].description='别人保存的新内容';b.save(latest,{id:entry.id,kind:'saved'});a.read();a.getThumbnail(entry.id);
  assert.equal(a.hasExternalChanges(entry.id),true);a.renameDocument(entry.id,'仅重命名，不能认领新内容');old.name='仅重命名，不能认领新内容';
  assert.throws(()=>a.save(old,{id:entry.id,kind:'draft'}),DiagramLibraryConflictError);assert.equal(b.load(entry.id).steps[0].description,'别人保存的新内容');
  const reopened=a.load(entry.id);assert.equal(a.hasExternalChanges(entry.id),false);reopened.steps[0].description='明确打开最新后再编辑';a.save(reopened,{id:entry.id,kind:'saved'});assert.equal(b.load(entry.id).steps[0].description,'明确打开最新后再编辑');
});

test('renaming the current opened revision updates only this window base so its next draft can save',()=>{
  const backing=store(),a=library(backing,'a'),entry=a.save(project(),{kind:'saved'}),current=a.load(entry.id);
  a.renameDocument(entry.id,'我自己的新名称');current.name='我自己的新名称';current.steps[0].description='重命名后继续绘图';
  assert.equal(a.hasExternalChanges(entry.id),false);a.save(current,{id:entry.id,kind:'draft'});assert.equal(a.load(entry.id).steps[0].description,'重命名后继续绘图');
});

test('failed same-document stages clean only their owned payload and leave the winning claimed revision intact',()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),p=project(),entry=a.save(p,{kind:'saved'});
  p.steps[0].description='第一草稿';a.save(p,{id:entry.id,kind:'draft'});p.steps[0].description='第二草稿';a.save(p,{id:entry.id,kind:'draft'});
  const loser=a.load(entry.id),winner=b.load(entry.id);loser.steps[0].description='竞争失败稿';winner.steps[0].description='竞争胜出稿';
  backing.hook(key=>{if(key===DIAGRAM_LIBRARY_KEY){backing.hook(undefined);b.save(winner,{id:entry.id,kind:'saved'});}});
  assert.throws(()=>a.save(loser,{id:entry.id,kind:'saved'}),DiagramLibraryConflictError);
  const live=b.read().documents.find(item=>item.id===entry.id)!;assert.ok(backing.getItem(live.savedKey!));assert.equal(b.load(entry.id).steps[0].description,'竞争胜出稿');
  assert.ok([...backing.values.values()].filter(Boolean).every(raw=>!raw.includes('竞争失败稿')),'the losing immutable stage is released');
});

test('post-commit cleanup cannot erase an old spare claimed as a new winning revision after the index read',()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),p=project(),entry=a.save(p,{kind:'saved'});
  p.steps[0].description='旧草稿';const previous=a.save(p,{id:entry.id,kind:'draft'}),oldKey=previous.draftKey!;p.steps[0].description='A已提交';
  let winnerBody:string|undefined;
  backing.hook((key,_expected,value)=>{if(key===oldKey&&value===''){
    backing.hook(undefined);
    // Another completed cleanup may release the spare before this delayed
    // cleanup request reaches storage. B then atomically claims that slot.
    backing.setItem(oldKey,'');const next=b.load(entry.id);next.steps[0].description='B在清理间隙提交';const winner=b.save(next,{id:entry.id,kind:'saved'});assert.equal(winner.savedKey,oldKey);winnerBody=backing.getItem(oldKey)!;
  }});
  a.save(p,{id:entry.id,kind:'draft'});assert.ok(winnerBody);assert.equal(backing.getItem(oldKey),winnerBody);assert.equal(b.load(entry.id).steps[0].description,'B在清理间隙提交');assert.equal(a.hasExternalChanges(entry.id),true);
});

test('shared historical payloads cannot suffer an ABA release when another document reclaims identical old bytes',()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),original=project(),first=a.save(original,{kind:'saved'}),second=a.save(original,{kind:'saved'}),shared=first.savedKey!,oldBody=backing.getItem(shared)!;
  const index=a.read(),other=index.documents.find(entry=>entry.id===second.id)!;other.savedKey=shared;other.draftKey=shared;backing.setItem(DIAGRAM_LIBRARY_KEY,JSON.stringify(index));
  const changedA=a.load(first.id),changedB=b.load(second.id);changedA.steps[0].description='A-new';changedB.steps[0].description='B-new';
  backing.hook((key,_expected,value)=>{if(key===DIAGRAM_LIBRARY_KEY&&JSON.parse(backing.getItem(JSON.parse(value).documents.find((entry:{id:string})=>entry.id===first.id).draftKey)!).project.steps[0].description==='A-new'){
    backing.hook(undefined);backing.onGet((readKey,raw)=>{
      if(readKey!==DIAGRAM_LIBRARY_KEY)return raw;backing.onGet(undefined);
      b.save(changedB,{id:second.id,kind:'saved'});const staleIndex=backing.getItem(DIAGRAM_LIBRARY_KEY);
      const winner=b.save(original,{id:second.id,kind:'saved'});assert.equal(winner.savedKey,shared);assert.equal(backing.getItem(shared),oldBody);
      return staleIndex;
    });
  }});
  a.save(changedA,{id:first.id,kind:'saved'});
  assert.equal(backing.getItem(shared),oldBody);assert.equal(b.load(second.id).steps[0].description,'');assert.equal(a.load(first.id).steps[0].description,'A-new');
});

test('a deletion index CAS conflict cannot delete payloads or discard another document update',async()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),removed=a.save(project('要删除的绘图'),{kind:'saved'}),kept=a.save(project('保留的绘图'),{kind:'saved'}),changed=b.load(kept.id),body=backing.getItem(removed.savedKey!);
  changed.steps[0].description='删除期间另窗修改';backing.hook(key=>{if(key===DIAGRAM_LIBRARY_KEY){backing.hook(undefined);b.save(changed,{id:kept.id,kind:'saved'});}});
  await assert.rejects(a.deleteDocument(removed.id),DiagramLibraryConflictError);assert.equal(backing.getItem(removed.savedKey!),body);assert.equal(a.read().documents.length,2);assert.equal(b.load(kept.id).steps[0].description,'删除期间另窗修改');
});

test('post-delete cleanup releases only the captured original bytes and preserves a competing payload claim',async()=>{
  const backing=store(),a=library(backing,'a'),entry=a.save(project(),{kind:'saved'}),oldKey=entry.savedKey!,claimed=JSON.parse(backing.getItem(oldKey)!);claimed.project.name='其他窗口的新阶段';const body=JSON.stringify(claimed);
  backing.hook((key,_expected,value)=>{if(key===oldKey&&value===''){backing.hook(undefined);backing.setItem(key,body);}});
  await a.deleteDocument(entry.id);assert.equal(backing.getItem(oldKey),body);assert.equal(a.read().documents.length,0);
});

test('deletion pairs its parsed index with the exact same read token when a new document arrives during the first read',async()=>{
  const backing=store(),a=library(backing,'a'),b=library(backing,'b'),removed=a.save(project('旧目录里的绘图'),{kind:'saved'}),body=backing.getItem(removed.savedKey!);
  let addedId:string|undefined;backing.onGet((key,raw)=>{if(key!==DIAGRAM_LIBRARY_KEY)return raw;backing.onGet(undefined);addedId=b.save(project('并发新增的绘图'),{kind:'saved'}).id;return raw;});
  await assert.rejects(a.deleteDocument(removed.id),/删除期间发生变化|其他窗口/);assert.equal(a.read().documents.length,2);assert.equal(backing.getItem(removed.savedKey!),body);assert.equal(b.load(addedId!).name,'并发新增的绘图');
});
