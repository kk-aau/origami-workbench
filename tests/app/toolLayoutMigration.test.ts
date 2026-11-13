import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LEFT_MAIN_GROUPS,LEFT_EXTRA_GROUPS,RIGHT_DOCK_GROUPS,BACKGROUND_TOOLS} from '../../src/app/orieditaToolLayout';
import {TOOL_LAYOUT_ACTIONS,TOOL_LAYOUT_ITEM_IDS,TOOL_LAYOUT_PREFERENCES_KEY,defaultToolLayoutPreferences,readToolLayoutPreferences,saveToolLayoutPreferences,updateToolLayoutTemplate,moveToolLayoutItem,type ToolLayoutPreferences,type ToolLayoutTemplate} from '../../src/app/toolLayoutPreferences';

/** The previous release's eight-folder layout; its exports are intentionally
 * retained independently of the new category list as the migration fixture. */
function previousLayout():ToolLayoutPreferences {
 const groups:ToolLayoutTemplate['groups']=[
  ...LEFT_MAIN_GROUPS.map((group,index)=>({id:['drawing','selection','editing'][index],name:group.name,side:'left' as const,items:[...group.tools]})),
  {id:'extended',name:'扩展与特殊操作',side:'left',items:LEFT_EXTRA_GROUPS.flatMap(group=>group.tools)},
  {id:'checks',name:'整理与检查',side:'right',items:TOOL_LAYOUT_ACTIONS.map(action=>action.id)},
  {id:'angles',name:'角度系统',side:'right',items:[...RIGHT_DOCK_GROUPS[0].tools]},
  {id:'circles',name:'圆、多边形与切线',side:'right',items:RIGHT_DOCK_GROUPS.slice(1,5).flatMap(group=>group.tools)},
  {id:'marks',name:'标记与测量',side:'right',items:RIGHT_DOCK_GROUPS.slice(5).flatMap(group=>group.tools)},
 ];
 return {version:1,activeId:'default',templates:[
  {id:'default',name:'默认',columns:{left:0,right:4},groups,unassigned:[]},
  {id:'swapped',name:'左右对调',columns:{left:4,right:0},groups:groups.map(group=>({...group,side:group.side==='left'?'right':'left',items:[...group.items]})),unassigned:[]},
  {id:'all-left',name:'全部左侧',columns:{left:0,right:4},groups:groups.map(group=>({...group,side:'left',items:[...group.items]})),unassigned:[]},
 ]};
}
function reopen(value:ToolLayoutPreferences){return readToolLayoutPreferences({getItem:()=>JSON.stringify(value)});}
function complete(value:ToolLayoutPreferences){for(const template of value.templates){const ids=[...template.groups.flatMap(group=>group.items),...template.unassigned];assert.equal(new Set(ids).size,ids.length);assert.deepEqual([...ids].sort(),[...TOOL_LAYOUT_ITEM_IDS].sort());}}
function assertBackgroundSeparated(actual:ToolLayoutTemplate,before:ToolLayoutTemplate){
 assert.deepEqual({id:actual.id,name:actual.name,columns:actual.columns},{id:before.id,name:before.name,columns:before.columns});
 assert.equal(actual.groups.length,before.groups.length);
 for(let index=0;index<before.groups.length;index++){
  const current=actual.groups[index],original=before.groups[index];
  assert.deepEqual({id:current.id,name:current.name,side:current.side},{id:original.id,name:original.name,side:original.side});
  assert.deepEqual(current.items,original.items.filter(item=>!BACKGROUND_TOOLS.includes(item as never)));
 }
 assert.deepEqual(actual.unassigned.filter(item=>!BACKGROUND_TOOLS.includes(item as never)),before.unassigned.filter(item=>!BACKGROUND_TOOLS.includes(item as never)));
 assert.deepEqual(new Set(actual.unassigned.filter(item=>BACKGROUND_TOOLS.includes(item as never))),new Set(BACKGROUND_TOOLS));
 assert.equal(new Set(actual.unassigned).size,actual.unassigned.length);
}

test('unchanged previous built-ins upgrade to current categories without losing active selection or modifying stored data',()=>{
 const previous=previousLayout();previous.activeId='swapped';const raw=JSON.stringify(previous);let writes=0;
 const reopened=readToolLayoutPreferences({getItem:()=>raw,setItem:()=>writes++} as Storage);
 assert.deepEqual(reopened,{...defaultToolLayoutPreferences(),activeId:'swapped'});
 assert.equal(writes,0);assert.equal(JSON.stringify(previous),raw);complete(reopened);
});

test('renamed, reordered, moved or resized old built-ins change only their background tool placement',()=>{
 for(const edit of [
  (template:ToolLayoutTemplate)=>{template.name='我的默认';},
  (template:ToolLayoutTemplate)=>{template.columns.left=5;},
  (template:ToolLayoutTemplate)=>{template.groups[0].items.reverse();},
  (template:ToolLayoutTemplate)=>{template.groups[0].side='right';},
  (template:ToolLayoutTemplate)=>{template.groups.reverse();},
  (template:ToolLayoutTemplate)=>{const [first]=template.groups[0].items.splice(0,1);template.unassigned.push(first);},
 ]){
  const previous=previousLayout();edit(previous.templates[0]);const before=structuredClone(previous.templates[0]);
  const reopened=reopen(previous);assert.equal(reopened.activeId,'default');assertBackgroundSeparated(reopened.templates[0],before);
  assert.deepEqual(reopened.templates.slice(1),defaultToolLayoutPreferences().templates.slice(1));complete(reopened);
 }
});

test('a sole custom legacy layout stays active and receives a separate category preset exactly once',()=>{
 const previous=previousLayout();previous.templates=previous.templates.slice(0,1);previous.templates[0].groups[0].name='手边工具';
 const before=structuredClone(previous.templates[0]),first=reopen(previous);
 assert.equal(first.activeId,'default');assertBackgroundSeparated(first.templates[0],before);
 assert.equal(first.templates.length,2);assert.equal(first.templates[1].name,'分类排版');
 assert.deepEqual(first.templates[1].groups,defaultToolLayoutPreferences().templates[0].groups);
 assert.deepEqual(reopen(first),first);complete(first);
 const values=new Map<string,string>();saveToolLayoutPreferences(first,{setItem:(key,value)=>values.set(key,value)});
 assert.deepEqual(readToolLayoutPreferences({getItem:key=>values.get(key)??null}),first);
 assert.ok(values.has(TOOL_LAYOUT_PREFERENCES_KEY));
});

test('custom templates at capacity are not overwritten to make room for a new preset',()=>{
 const previous=previousLayout(),source=previous.templates[0];
 previous.templates=Array.from({length:20},(_,index)=>({...structuredClone(source),id:`custom-${index}`,name:`排版 ${index}`}));
 previous.activeId='custom-19';
 const reopened=reopen(previous);assert.equal(reopened.activeId,'custom-19');assert.equal(reopened.templates.length,20);assert.equal(reopened.backgroundPanelVersion,1);
 for(let index=0;index<20;index++)assertBackgroundSeparated(reopened.templates[index],previous.templates[index]);complete(reopened);
});

test('new category edits survive save and reopen without being reset or multiplying presets',()=>{
 const next=defaultToolLayoutPreferences();next.templates[0].groups[2].items.reverse();next.templates[0].columns.left=6;
 assert.deepEqual(reopen(next),next);complete(next);
});

/** Exact 0.13.41 categories, independent of today's defaults so migration tests
 * keep exercising the on-disk layout that users actually saved. */
function previousDrawingLayout():ToolLayoutPreferences {
 const categories:[string,string,string[]][]=[
  ['types','类型',[]],
  ['selection','选择',['select','unselect','selectpolygon','unselectpolygon','selectlasso','unselectlasso','selectcross','unselectcross']],
  ['drawing','绘制',['line','restrictedline','parallel','offsetparallel','perpendicular','bisect','bisectlines','midperp','angledrag','angledirection','angleconverge','angleproject','polygon','circle','circleradius','circle3','circleseparate','circleconcentric','circleequal','restrictedcircle','tangentpoint','tangentcircles','divide','ratio','addvertex']],
  ['deletion','删除',['erase','eraseedge','eraseaux','deletetype','eraseoverlap','erasecross']],
  ['transform','变换',['moveselection','movefour','copyselection','copyfour','rotatecopyselection','mirrorselection','mirrorline','reflection','reflectionlines','transverse','continuous','circleinvert','lineinvert','circleedit','backgroundposition','advancetype','pan','operationframe','makemountain','makevalley','makeedge','makeaux','replacetype','regionalswap','cycletype']],
  ['repair','修复',['localflat','foldableinput','foldabledraw','mergevertex','mergecrossvertex','trim','extend','lengthen','circlepair','alternatecollinear','alternatecross']],
  ['marks','注释',['mark','erasemark','text','customcolor']],
  ['generation','生成',['voronoi','axiom5','axiom7','rabbitear','fishbone','drawdivide','drawratio','circledifference']],
  ['measurement','测量',['measure','measurel1','measurel2','measurea1','measurea2','measurea3']],
  ['checks','整理与检查',['action:check','action:duplicates','action:merge','action:cross-merge','action:fold-conflicts','action:empty-branches','regioncheck']],
 ];
 const groups:ToolLayoutTemplate['groups']=categories.map(([id,name,items])=>({id,name,side:'left',items}));
 return {version:1,columnSizingVersion:1,activeId:'default',templates:[
  {id:'default',name:'默认',columns:{left:0,right:0},groups,unassigned:[]},
  {id:'swapped',name:'左右对调',columns:{left:0,right:0},groups:groups.map(group=>({...group,side:'right',items:[...group.items]})),unassigned:[]},
  {id:'all-left',name:'全部左侧',columns:{left:0,right:0},groups:groups.map(group=>({...group,items:[...group.items]})),unassigned:[]},
 ]};
}
/** Exact eleven-category layout before Copy and Move was split from Transform.
 * Derive from the historical drawing fixture, never from current defaults. */
function previousAdvancedLayout():ToolLayoutPreferences {
 const previous=previousDrawingLayout();
 const advanced=['polygon','circle','circleradius','circle3','circleseparate','circleconcentric','circleequal','restrictedcircle','tangentpoint','tangentcircles'];
 for(const template of previous.templates){
  const index=template.groups.findIndex(group=>group.id==='drawing'),drawing=template.groups[index];
  drawing.items=drawing.items.filter(item=>!advanced.includes(item));
  template.groups.splice(index+1,0,{id:'advanced',name:'高级',side:drawing.side,items:[...advanced]});
 }
 return previous;
}
/** The twelve-category layout before reflections and inversions were regrouped. */
function previousCopyMoveLayout():ToolLayoutPreferences {
 const previous=previousAdvancedLayout(),moving=['moveselection','movefour','copyselection','copyfour','rotatecopyselection','mirrorselection','mirrorline','pan'];
 for(const template of previous.templates){
  const index=template.groups.findIndex(group=>group.id==='transform'),transform=template.groups[index];
  transform.items=transform.items.filter(item=>!moving.includes(item));
  template.groups.splice(index,0,{id:'copy-move',name:'复制与移动',side:transform.side,items:[...moving]});
 }
 return previous;
}
/** The next twelve-category layout: reflections/inversions moved, but radius
 * differences still lived in Generation. Keep it independent of new defaults. */
function previousGenerationAdvancedLayout():ToolLayoutPreferences {
 const previous=previousCopyMoveLayout(),reflections=['reflection','reflectionlines','transverse','continuous'],inversions=['circleinvert','lineinvert'];
 for(const template of previous.templates){
  const transform=template.groups.find(group=>group.id==='transform')!;
  transform.items=transform.items.filter(item=>!reflections.includes(item)&&!inversions.includes(item));
  template.groups.find(group=>group.id==='generation')!.items.push(...reflections);
  template.groups.find(group=>group.id==='advanced')!.items.push(...inversions);
 }
 return previous;
}
/** Frozen layout immediately before the dedicated background section. The
 * historical chain and explicit final groups never read today's categories. */
function previousBackgroundLayout():ToolLayoutPreferences {
 const previous=previousGenerationAdvancedLayout();
 for(const template of previous.templates){
  template.groups.find(group=>group.id==='advanced')!.items=['polygon','circle','circleradius','circle3','circleedit','circleseparate','circleconcentric','circleequal','circlepair','restrictedcircle','tangentpoint','tangentcircles','circleinvert','lineinvert','circledifference'];
  template.groups.find(group=>group.id==='transform')!.items=['backgroundposition','advancetype','operationframe','makemountain','makevalley','makeedge','makeaux','replacetype','regionalswap','cycletype'];
  template.groups.find(group=>group.id==='repair')!.items=['localflat','foldableinput','foldabledraw','mergevertex','mergecrossvertex','trim','extend','lengthen','alternatecollinear','alternatecross'];
  template.groups.find(group=>group.id==='generation')!.items=['voronoi','axiom5','axiom7','rabbitear','fishbone','drawdivide','drawratio','reflection','reflectionlines','transverse','continuous'];
 }
 return previous;
}
/** Saved categories before assignment and alternating tools were regrouped. */
function previousCategoryLayout():ToolLayoutPreferences {
 const previous=previousDrawingLayout();
 for(const template of previous.templates){
  template.groups.find(group=>group.id==='types')!.items=['makemountain','makevalley','makeedge','makeaux','replacetype','regionalswap','cycletype','alternatecollinear','alternatecross'];
  template.groups.find(group=>group.id==='transform')!.items=['moveselection','movefour','copyselection','copyfour','rotatecopyselection','mirrorselection','mirrorline','reflection','reflectionlines','transverse','continuous','circleinvert','lineinvert','circleedit','backgroundposition','advancetype','pan','operationframe'];
  template.groups.find(group=>group.id==='repair')!.items=['localflat','foldableinput','foldabledraw','mergevertex','mergecrossvertex','trim','extend','lengthen','circlepair'];
 }
 return previous;
}
/** The first ten-category release saved four columns on both sides without a
 * column-sizing migration marker. */
function fixedCategoryLayout():ToolLayoutPreferences {
 const previous=previousCategoryLayout();delete previous.columnSizingVersion;
 for(const template of previous.templates)template.columns={left:4,right:4};
 return previous;
}

test('untouched automatic category presets move assignment tools while retaining active selection and source preferences',()=>{
 const previous=previousCategoryLayout();previous.activeId='swapped';const before=structuredClone(previous);let writes=0;
 const next=readToolLayoutPreferences({getItem:()=>JSON.stringify(previous),setItem:()=>writes++} as Storage);
 assert.equal(previous.columnSizingVersion,1);
 assert.deepEqual(next,{...defaultToolLayoutPreferences(),activeId:'swapped'});
 assert.deepEqual(previous,before);assert.equal(writes,0);complete(next);
 assert.deepEqual(reopen(next),next);
});

test('untouched four-column category presets update category placement and automatic sizing without changing active selection',()=>{
 const previous=fixedCategoryLayout();previous.activeId='all-left';const before=structuredClone(previous);let writes=0;
 const next=readToolLayoutPreferences({getItem:()=>JSON.stringify(previous),setItem:()=>writes++} as Storage);
 assert.deepEqual(next,{...defaultToolLayoutPreferences(),activeId:'all-left'});
 assert.deepEqual(previous,before);assert.equal(writes,0);complete(next);
 assert.deepEqual(reopen(next),next);
});

test('customized category presets retain their columns and exact group arrangement',()=>{
 for(const source of [previousCategoryLayout,fixedCategoryLayout])for(const edit of [
  (template:ToolLayoutTemplate)=>{template.id='my-layout';},
  (template:ToolLayoutTemplate)=>{template.name='我的分类';},
  (template:ToolLayoutTemplate)=>{template.columns.left=6;},
  (template:ToolLayoutTemplate)=>{template.columns.right=3;},
  (template:ToolLayoutTemplate)=>{template.groups[0].name='常用类型';},
  (template:ToolLayoutTemplate)=>{template.groups[0].side='right';},
  (template:ToolLayoutTemplate)=>{template.groups.reverse();},
  (template:ToolLayoutTemplate)=>{template.groups[0].items.reverse();},
  (template:ToolLayoutTemplate)=>{template.unassigned.push(template.groups[0].items.shift()!);},
 ]){
  const previous=source();edit(previous.templates[0]);previous.activeId=previous.templates[0].id;
  const customized=structuredClone(previous.templates[0]),next=reopen(previous);
  assert.equal(next.activeId,customized.id);assertBackgroundSeparated(next.templates[0],customized);
  assert.deepEqual(next.templates.slice(1),defaultToolLayoutPreferences().templates.slice(1));complete(next);
 }
});

test('an explicit four-column choice in the new release survives saving and reopening',()=>{
 const migrated=reopen(fixedCategoryLayout());
 const chosen=updateToolLayoutTemplate(migrated,'default',{columns:{left:4,right:4}});
 let raw='';saveToolLayoutPreferences(chosen,{setItem:(_key,value)=>{raw=value;}});
 assert.equal(JSON.parse(raw).columnSizingVersion,1);
 const reopened=readToolLayoutPreferences({getItem:()=>raw});
 assert.deepEqual(reopened,chosen);assert.deepEqual(reopened.templates[0].columns,{left:4,right:4});complete(reopened);
});

test('saving a version-one layout marks its explicit column choice without requiring a schema upgrade',()=>{
 const existing=fixedCategoryLayout();let raw='';
 saveToolLayoutPreferences(existing,{setItem:(_key,value)=>{raw=value;}});
 assert.equal(JSON.parse(raw).version,1);
 const reopened=readToolLayoutPreferences({getItem:()=>raw});assert.equal(reopened.columnSizingVersion,1);assert.equal(reopened.backgroundPanelVersion,1);assert.equal(reopened.activeId,existing.activeId);
 for(let index=0;index<existing.templates.length;index++)assertBackgroundSeparated(reopened.templates[index],existing.templates[index]);
 assert.equal(existing.columnSizingVersion,undefined);
});

test('untouched 0.13.41 drawing presets gain Advanced without changing active selection or writing preferences',()=>{
 for(const activeId of ['default','swapped','all-left']){
  const previous=previousDrawingLayout();previous.activeId=activeId;const before=structuredClone(previous);let writes=0;
  const next=readToolLayoutPreferences({getItem:()=>JSON.stringify(previous),setItem:()=>writes++} as Storage);
  assert.deepEqual(next,{...defaultToolLayoutPreferences(),activeId});
  assert.deepEqual(previous,before);assert.equal(writes,0);complete(next);
  assert.deepEqual(reopen(next),next);
 }
});

test('customized 0.13.41 drawing presets keep exact circle placement, groups, columns and pool',()=>{
 for(const edit of [
  (template:ToolLayoutTemplate)=>{template.id='my-drawing';},
  (template:ToolLayoutTemplate)=>{template.name='我的绘制';},
  (template:ToolLayoutTemplate)=>{template.columns={left:4,right:4};},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='drawing')!.name='常用绘制';},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='drawing')!.side='right';},
  (template:ToolLayoutTemplate)=>{template.groups.reverse();},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='drawing')!.items.reverse();},
  (template:ToolLayoutTemplate)=>{const drawing=template.groups.find(group=>group.id==='drawing')!;drawing.items=drawing.items.filter(item=>item!=='circle');template.groups.find(group=>group.id==='transform')!.items.unshift('circle');},
  (template:ToolLayoutTemplate)=>{const drawing=template.groups.find(group=>group.id==='drawing')!;drawing.items=drawing.items.filter(item=>item!=='polygon');template.unassigned.push('polygon');},
  (template:ToolLayoutTemplate)=>{template.groups.push({id:'advanced',name:'我的高级',side:'right',items:[]});},
 ]){
  const previous=previousDrawingLayout();edit(previous.templates[0]);previous.activeId=previous.templates[0].id;
  const customized=structuredClone(previous.templates[0]),next=reopen(previous);
  assert.equal(next.activeId,customized.id);assertBackgroundSeparated(next.templates[0],customized);
  assert.deepEqual(next.templates.slice(1),defaultToolLayoutPreferences().templates.slice(1));complete(next);
  let raw='';saveToolLayoutPreferences(next,{setItem:(_key,value)=>{raw=value;}});
  assert.deepEqual(readToolLayoutPreferences({getItem:()=>raw}),next);
 }
});

test('a sole custom category layout is not rewritten or multiplied to introduce Advanced',()=>{
 const previous=previousDrawingLayout();previous.templates=previous.templates.slice(0,1);previous.templates[0].name='我的工具';
 const reopened=reopen(previous);assert.equal(reopened.activeId,previous.activeId);assert.equal(reopened.templates.length,1);assertBackgroundSeparated(reopened.templates[0],previous.templates[0]);
 assert.deepEqual(reopen(reopened),reopened);complete(reopened);
});

test('untouched eleven- and twelve-category presets upgrade with active selection and persisted round trips intact',()=>{
 for(const [source,count] of [[previousAdvancedLayout,11],[previousCopyMoveLayout,12],[previousGenerationAdvancedLayout,12]] as const)for(const activeId of ['default','swapped','all-left']){
  const previous=source();previous.activeId=activeId;const before=structuredClone(previous);let writes=0;
  assert.equal(previous.columnSizingVersion,1);assert.equal(previous.templates[0].groups.length,count);
  const next=readToolLayoutPreferences({getItem:()=>JSON.stringify(previous),setItem:()=>writes++} as Storage);
  assert.deepEqual(next,{...defaultToolLayoutPreferences(),activeId});complete(next);
  assert.deepEqual(previous,before);assert.equal(writes,0,'reading never overwrites the stored source preferences');
  let saved='';saveToolLayoutPreferences(next,{setItem:(_key,value)=>{saved=value;}});
  const restored=readToolLayoutPreferences({getItem:()=>saved});
  assert.deepEqual(restored,next);assert.deepEqual(reopen(restored),restored);
 }
});

test('customized eleven- and twelve-category presets retain exact tool placement, names, sides, order, columns and pool',()=>{
 for(const source of [previousAdvancedLayout,previousCopyMoveLayout,previousGenerationAdvancedLayout])for(const edit of [
  (template:ToolLayoutTemplate)=>{template.id='my-movement';},
  (template:ToolLayoutTemplate)=>{template.name='我的旧分类';},
  (template:ToolLayoutTemplate)=>{template.columns={left:4,right:4};},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='transform')!.name='常用变换';},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='transform')!.side='right';},
  (template:ToolLayoutTemplate)=>{template.groups.reverse();},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='transform')!.items.reverse();},
  (template:ToolLayoutTemplate)=>{const group=template.groups.find(group=>group.items.includes('copyselection'))!;group.items=group.items.filter(item=>item!=='copyselection');template.groups.find(group=>group.id==='selection')!.items.unshift('copyselection');},
  (template:ToolLayoutTemplate)=>{const group=template.groups.find(group=>group.items.includes('continuous'))!;group.items=group.items.filter(item=>item!=='continuous');template.unassigned.push('continuous');},
  (template:ToolLayoutTemplate)=>{const group=template.groups.find(group=>group.items.includes('mirrorline'))!;group.items=group.items.filter(item=>item!=='mirrorline');const target=template.groups.find(group=>group.id==='copy-move');if(target){target.name='我的复制';target.side='right';target.items.push('mirrorline');}else template.groups.push({id:'copy-move',name:'我的复制',side:'right',items:['mirrorline']});},
  (template:ToolLayoutTemplate)=>{for(const group of template.groups)group.items=group.items.filter(item=>item!=='reflectionlines'&&item!=='circleinvert');template.groups.find(group=>group.id==='generation')!.items.unshift('reflectionlines');template.groups.find(group=>group.id==='advanced')!.items.unshift('circleinvert');},
  (template:ToolLayoutTemplate)=>{const group=template.groups.find(group=>group.items.includes('circledifference'))!;group.items=group.items.filter(item=>item!=='circledifference');template.groups.find(group=>group.id==='advanced')!.items.unshift('circledifference');},
 ]){
  const previous=source();edit(previous.templates[0]);previous.activeId=previous.templates[0].id;
  const customized=structuredClone(previous.templates[0]),next=reopen(previous);
  assert.equal(next.activeId,customized.id);assertBackgroundSeparated(next.templates[0],customized);
  assert.deepEqual(next.templates.slice(1),defaultToolLayoutPreferences().templates.slice(1));complete(next);
  let saved='';saveToolLayoutPreferences(next,{setItem:(_key,value)=>{saved=value;}});
  assert.deepEqual(readToolLayoutPreferences({getItem:()=>saved}),next);
 }
});

test('a sole customized eleven- or twelve-category layout is not rewritten or multiplied by category updates',()=>{
 for(const source of [previousAdvancedLayout,previousCopyMoveLayout,previousGenerationAdvancedLayout]){
  const previous=source();previous.templates=previous.templates.slice(0,1);previous.templates[0].name='我的工具';
  const before=structuredClone(previous),next=reopen(previous);
  assert.equal(next.activeId,before.activeId);assert.equal(next.templates.length,before.templates.length);assertBackgroundSeparated(next.templates[0],before.templates[0]);assert.deepEqual(reopen(next),next);complete(next);
 }
});

test('untouched pre-background built-ins move only dedicated background tools to the pool and remain idempotent',()=>{
 for(const activeId of ['default','swapped','all-left']){
  const previous=previousBackgroundLayout();previous.activeId=activeId;const before=structuredClone(previous);let writes=0;
  assert.equal(previous.templates[0].groups.length,12);assert.deepEqual(previous.templates[0].groups.find(group=>group.id==='transform')!.items.slice(0,3),BACKGROUND_TOOLS);
  const next=readToolLayoutPreferences({getItem:()=>JSON.stringify(previous),setItem:()=>writes++} as Storage);
  assert.deepEqual(next,{...defaultToolLayoutPreferences(),activeId});assert.deepEqual(previous,before);assert.equal(writes,0);
  for(const template of next.templates){assert.deepEqual(template.unassigned,BACKGROUND_TOOLS);assert.ok(template.groups.every(group=>group.items.every(item=>!BACKGROUND_TOOLS.includes(item as never))));}
  complete(next);assert.deepEqual(reopen(next),next);
  let saved='';saveToolLayoutPreferences(next,{setItem:(_key,value)=>{saved=value;}});assert.deepEqual(readToolLayoutPreferences({getItem:()=>saved}),next);
 }
});

test('all old custom layouts separate background tools once while preserving every other placement and active selection',()=>{
 const edits=[
  (template:ToolLayoutTemplate)=>{template.id='my-background-layout';},
  (template:ToolLayoutTemplate)=>{template.name='我的底图工作区';},
  (template:ToolLayoutTemplate)=>{template.columns={left:4,right:4};},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='transform')!.name='我的变换';},
  (template:ToolLayoutTemplate)=>{const group=template.groups.find(group=>group.id==='transform')!;group.side=group.side==='left'?'right':'left';},
  (template:ToolLayoutTemplate)=>{template.groups.reverse();},
  (template:ToolLayoutTemplate)=>{template.groups.find(group=>group.id==='transform')!.items.reverse();},
  (template:ToolLayoutTemplate)=>{const transform=template.groups.find(group=>group.id==='transform')!;transform.items=transform.items.filter(item=>item!=='backgroundposition');template.groups.find(group=>group.id==='drawing')!.items.unshift('backgroundposition');},
  (template:ToolLayoutTemplate)=>{const transform=template.groups.find(group=>group.id==='transform')!;transform.items=transform.items.filter(item=>item!=='advancetype');template.unassigned.push('advancetype');},
 ];
 for(let target=0;target<3;target++)for(const edit of edits){
  const previous=previousBackgroundLayout();edit(previous.templates[target]);previous.activeId=previous.templates[target].id;
  const before=structuredClone(previous),next=reopen(previous);
  assert.equal(next.activeId,previous.activeId);assert.equal(next.backgroundPanelVersion,1);assertBackgroundSeparated(next.templates[target],before.templates[target]);
  for(let other=0;other<3;other++)if(other!==target)assert.deepEqual(next.templates[other],defaultToolLayoutPreferences().templates[other]);
  complete(next);assert.deepEqual(previous,before);assert.deepEqual(reopen(next),next);
  let saved='';saveToolLayoutPreferences(next,{setItem:(_key,value)=>{saved=value;}});assert.deepEqual(readToolLayoutPreferences({getItem:()=>saved}),next);
 }
});

test('the migration marker preserves future explicit background placement even when it recreates an old builtin exactly',()=>{
 const previous=previousBackgroundLayout(),migrated=reopen(previous);assert.equal(previous.backgroundPanelVersion,undefined);assert.equal(migrated.backgroundPanelVersion,1);
 let restored=migrated;for(const [index,item] of BACKGROUND_TOOLS.entries())restored=moveToolLayoutItem(restored,item,'transform',index);
 assert.deepEqual(restored.templates[0],previous.templates[0],'the user deliberately reconstructs the old default arrangement');
 assert.deepEqual(reopen(restored),restored);
 let saved='';saveToolLayoutPreferences(restored,{setItem:(_key,value)=>{saved=value;}});assert.equal(JSON.parse(saved).backgroundPanelVersion,1);assert.deepEqual(readToolLayoutPreferences({getItem:()=>saved}),restored);complete(restored);
});
