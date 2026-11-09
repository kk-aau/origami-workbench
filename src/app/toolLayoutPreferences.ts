import {LEFT_MAIN_GROUPS,LEFT_EXTRA_GROUPS,RIGHT_DOCK_GROUPS,TOOL_CATEGORY_GROUPS} from './orieditaToolLayout';
import {TOOL_GUIDES,type Tool} from './tools';
import {preferenceStorage} from './preferenceStorage';

export type ToolLayoutSide='left'|'right';
export interface ToolLayoutGroup {id:string;name:string;side:ToolLayoutSide;items:string[]}
export interface ToolLayoutTemplate {id:string;name:string;columns:{left:number;right:number};groups:ToolLayoutGroup[];unassigned:string[]}
export interface ToolLayoutPreferences {version:1;columnSizingVersion?:1;activeId:string;templates:ToolLayoutTemplate[]}
export interface ToolLayoutTemplatePatch {name?:string;columns?:Partial<ToolLayoutTemplate['columns']>;groups?:ToolLayoutGroup[];unassigned?:string[]}
export const TOOL_LAYOUT_PREFERENCES_KEY='zhezhi.tool-layout.v1';
export const MAX_TOOL_LAYOUT_TEMPLATES=20;
export const MAX_TOOL_LAYOUT_COLUMNS=12;
const MAX_GROUPS=100,MAX_NAME=60,MAX_ID=128;
export const TOOL_LAYOUT_ACTIONS=[
  {id:'action:check',name:'检查折痕'},
  {id:'action:duplicates',name:'删除重复线'},
  {id:'action:merge',name:'批量合点'},
  {id:'action:cross-merge',name:'跨类型合点'},
  {id:'action:fold-conflicts',name:'折角冲突'},
  {id:'action:empty-branches',name:'清除悬空分枝'},
] as const;
export type ToolLayoutActionId=typeof TOOL_LAYOUT_ACTIONS[number]['id'];
export type ToolLayoutItemId=Tool|ToolLayoutActionId;
export const TOOL_LAYOUT_ITEM_IDS:readonly ToolLayoutItemId[]=[...Object.keys(TOOL_GUIDES) as Tool[],...TOOL_LAYOUT_ACTIONS.map(action=>action.id)];
const itemIds=new Set<string>(TOOL_LAYOUT_ITEM_IDS);
export function isToolLayoutItemId(value:unknown):value is ToolLayoutItemId {return typeof value==='string'&&itemIds.has(value);}

/** Stable group IDs retain user placement when a later app release adds tools. */
function legacyGroups():ToolLayoutGroup[] {
  const left=LEFT_MAIN_GROUPS.map((group,index)=>({id:['drawing','selection','editing'][index]??`drawing-${index}`,name:group.name,side:'left' as const,items:[...group.tools]}));
  const groups:ToolLayoutGroup[]=[...left,
    {id:'extended',name:'扩展与特殊操作',side:'left',items:LEFT_EXTRA_GROUPS.flatMap(group=>group.tools)},
    {id:'checks',name:'整理与检查',side:'right',items:TOOL_LAYOUT_ACTIONS.map(action=>action.id)},
    {id:'angles',name:'角度系统',side:'right',items:[...RIGHT_DOCK_GROUPS[0].tools]},
    {id:'circles',name:'圆、多边形与切线',side:'right',items:RIGHT_DOCK_GROUPS.slice(1,5).flatMap(group=>group.tools)},
    {id:'marks',name:'标记与测量',side:'right',items:RIGHT_DOCK_GROUPS.slice(5).flatMap(group=>group.tools)},
  ];
  const seen=new Set<string>();
  for(const group of groups)group.items=group.items.filter(id=>{
    if(!isToolLayoutItemId(id)||seen.has(id))return false;
    seen.add(id);return true;
  });
  // TOOL_GUIDES is authoritative even when its dock assignment has not yet shipped.
  groups.find(group=>group.id==='extended')!.items.push(...TOOL_LAYOUT_ITEM_IDS.filter(id=>!seen.has(id)));
  return groups;
}
function legacyToolLayoutTemplates():ToolLayoutTemplate[] {
  const groups=legacyGroups();
  return [
    {id:'default',name:'默认',columns:{left:0,right:4},groups,unassigned:[]},
    {id:'swapped',name:'左右对调',columns:{left:4,right:0},groups:groups.map(group=>({...group,side:group.side==='left'?'right':'left',items:[...group.items]})),unassigned:[]},
    {id:'all-left',name:'全部左侧',columns:{left:0,right:4},groups:groups.map(group=>({...group,side:'left',items:[...group.items]})),unassigned:[]},
  ];
}
function defaultGroups():ToolLayoutGroup[] {
  const groups:ToolLayoutGroup[]=TOOL_CATEGORY_GROUPS.map(group=>({id:group.id,name:group.name,side:'left',items:[...group.tools]}));
  groups.find(group=>group.id==='checks')!.items.unshift(...TOOL_LAYOUT_ACTIONS.map(action=>action.id));
  const placed=new Set(groups.flatMap(group=>group.items));
  // Future tools remain available until their task category is assigned.
  groups.find(group=>group.id==='drawing')!.items.push(...TOOL_LAYOUT_ITEM_IDS.filter(id=>!placed.has(id)));
  return groups;
}
export function defaultToolLayoutPreferences():ToolLayoutPreferences {
  const groups=defaultGroups();
  return {version:1,columnSizingVersion:1,activeId:'default',templates:[
    {id:'default',name:'默认',columns:{left:0,right:0},groups,unassigned:[]},
    {id:'swapped',name:'左右对调',columns:{left:0,right:0},groups:groups.map(group=>({...group,side:'right',items:[...group.items]})),unassigned:[]},
    {id:'all-left',name:'全部左侧',columns:{left:0,right:0},groups:groups.map(group=>({...group,items:[...group.items]})),unassigned:[]},
  ]};
}
/** Exact category presets shipped before assignment tools moved out of Types.
 * Keep this snapshot independent of defaults so later category edits cannot
 * make a customized saved arrangement look like an untouched old preset. */
function previousCategoryToolLayoutTemplates():ToolLayoutTemplate[] {
  const categories:[string,string,string[]][]=[
    ['types','类型',['makemountain','makevalley','makeedge','makeaux','replacetype','regionalswap','cycletype','alternatecollinear','alternatecross']],
    ['selection','选择',['select','unselect','selectpolygon','unselectpolygon','selectlasso','unselectlasso','selectcross','unselectcross']],
    ['drawing','绘制',['line','restrictedline','parallel','offsetparallel','perpendicular','bisect','bisectlines','midperp','angledrag','angledirection','angleconverge','angleproject','polygon','circle','circleradius','circle3','circleseparate','circleconcentric','circleequal','restrictedcircle','tangentpoint','tangentcircles','divide','ratio','addvertex']],
    ['deletion','删除',['erase','eraseedge','eraseaux','deletetype','eraseoverlap','erasecross']],
    ['transform','变换',['moveselection','movefour','copyselection','copyfour','rotatecopyselection','mirrorselection','mirrorline','reflection','reflectionlines','transverse','continuous','circleinvert','lineinvert','circleedit','backgroundposition','advancetype','pan','operationframe']],
    ['repair','修复',['localflat','foldableinput','foldabledraw','mergevertex','mergecrossvertex','trim','extend','lengthen','circlepair']],
    ['marks','注释',['mark','erasemark','text','customcolor']],
    ['generation','生成',['voronoi','axiom5','axiom7','rabbitear','fishbone','drawdivide','drawratio','circledifference']],
    ['measurement','测量',['measure','measurel1','measurel2','measurea1','measurea2','measurea3']],
    ['checks','整理与检查',['action:check','action:duplicates','action:merge','action:cross-merge','action:fold-conflicts','action:empty-branches','regioncheck']],
  ];
  const groups:ToolLayoutGroup[]=categories.map(([id,name,items])=>({id,name,side:'left',items}));
  return [
    {id:'default',name:'默认',columns:{left:0,right:0},groups,unassigned:[]},
    {id:'swapped',name:'左右对调',columns:{left:0,right:0},groups:groups.map(group=>({...group,side:'right',items:[...group.items]})),unassigned:[]},
    {id:'all-left',name:'全部左侧',columns:{left:0,right:0},groups:groups.map(group=>({...group,items:[...group.items]})),unassigned:[]},
  ];
}
/** The 0.13.41 presets already regrouped assignment tools, but still kept
 * circles, polygons and tangents in Drawing. Derive only from the historical
 * snapshot above, never from current defaults when recognizing saved layouts. */
function previousDrawingToolLayoutTemplates():ToolLayoutTemplate[] {
  const templates=previousCategoryToolLayoutTemplates();
  for(const template of templates){
    template.groups.find(group=>group.id==='types')!.items=[];
    template.groups.find(group=>group.id==='transform')!.items.push('makemountain','makevalley','makeedge','makeaux','replacetype','regionalswap','cycletype');
    template.groups.find(group=>group.id==='repair')!.items.push('alternatecollinear','alternatecross');
  }
  return templates;
}
/** The eleven-category presets kept copying and moving under Transform.
 * Freeze their Advanced group independently of current defaults. */
function previousAdvancedToolLayoutTemplates():ToolLayoutTemplate[] {
  const templates=previousDrawingToolLayoutTemplates();
  const advanced=['polygon','circle','circleradius','circle3','circleseparate','circleconcentric','circleequal','restrictedcircle','tangentpoint','tangentcircles'];
  for(const template of templates){
    const drawingIndex=template.groups.findIndex(group=>group.id==='drawing'),drawing=template.groups[drawingIndex];
    drawing.items=drawing.items.filter(id=>!advanced.includes(id));
    template.groups.splice(drawingIndex+1,0,{id:'advanced',name:'高级',side:drawing.side,items:[...advanced]});
  }
  return templates;
}
/** The first Copy and Move presets still placed reflections and inversions
 * in Transform. Recognize that exact arrangement without rewriting edits. */
function previousCopyMoveToolLayoutTemplates():ToolLayoutTemplate[] {
  const templates=previousAdvancedToolLayoutTemplates();
  const copying=['moveselection','movefour','copyselection','copyfour','rotatecopyselection','mirrorselection','mirrorline','pan'];
  for(const template of templates){
    const transformIndex=template.groups.findIndex(group=>group.id==='transform'),transform=template.groups[transformIndex];
    transform.items=transform.items.filter(id=>!copying.includes(id));
    template.groups.splice(transformIndex,0,{id:'copy-move',name:'复制与移动',side:transform.side,items:[...copying]});
  }
  return templates;
}
/** The regrouped presets moved reflections and inversions, but still kept
 * Radius Difference in Generation. Preserve this historical item order. */
function previousGenerationToolLayoutTemplates():ToolLayoutTemplate[] {
  const templates=previousCopyMoveToolLayoutTemplates();
  const reflections=['reflection','reflectionlines','transverse','continuous'],inversions=['circleinvert','lineinvert'];
  for(const template of templates){
    const transform=template.groups.find(group=>group.id==='transform')!;
    transform.items=transform.items.filter(id=>!reflections.includes(id)&&!inversions.includes(id));
    template.groups.find(group=>group.id==='generation')!.items.push(...reflections);
    template.groups.find(group=>group.id==='advanced')!.items.push(...inversions);
  }
  return templates;
}
/** Presets before Circle Edit and Tangent Pair joined Advanced. */
function previousCircleToolLayoutTemplates():ToolLayoutTemplate[] {
  const templates=previousGenerationToolLayoutTemplates();
  for(const template of templates){
    const generation=template.groups.find(group=>group.id==='generation')!;
    generation.items=generation.items.filter(id=>id!=='circledifference');
    template.groups.find(group=>group.id==='advanced')!.items.push('circledifference');
  }
  return templates;
}
/** Only a byte-for-byte-equivalent built-in arrangement is upgraded. A user
 * renamed, reordered, resized or edited template is never replaced. */
function migrateBuiltinLayouts(value:unknown):unknown {
  if(!value||typeof value!=='object')return value;
  const input=value as Partial<ToolLayoutPreferences>;
  if(input.version!==1||!Array.isArray(input.templates))return value;
  const defaults=defaultToolLayoutPreferences().templates,previousCategories=[...previousCategoryToolLayoutTemplates(),...previousDrawingToolLayoutTemplates(),...previousAdvancedToolLayoutTemplates(),...previousCopyMoveToolLayoutTemplates(),...previousGenerationToolLayoutTemplates(),...previousCircleToolLayoutTemplates()];
  // Older category presets fixed both sides at four columns. Only recognize
  // that exact shipped arrangement once; choosing four columns now must persist.
  const legacy=[...legacyToolLayoutTemplates(),...previousCategories,...(input.columnSizingVersion===1?[]:[...previousCategories,...defaults].map(template=>({...template,columns:{left:4,right:4}})))];
  const templates=input.templates.map(raw=>{
    if(!raw||typeof raw!=='object')return raw;
    const normalized={id:raw.id,name:raw.name,columns:raw.columns,groups:raw.groups,unassigned:raw.unassigned??[]};
    const old=legacy.find(template=>template.id===raw.id&&JSON.stringify(normalized)===JSON.stringify(template));
    return old?defaults.find(template=>template.id===old.id)!:raw;
  });
  // Keep edited legacy templates selectable and offer the new default without
  // changing their active selection or silently overwriting an existing ID.
  const hasOldGroups=templates.some(template=>Array.isArray(template?.groups)&&template.groups.some(group=>group.id==='extended'&&group.name==='扩展与特殊操作'));
  const hasCategories=templates.some(template=>Array.isArray(template?.groups)&&template.groups.some(group=>group.id==='types'&&group.name==='类型'));
  if(hasOldGroups&&!hasCategories&&templates.length<MAX_TOOL_LAYOUT_TEMPLATES){
    let id='categories';while(templates.some(template=>template?.id===id))id+='-new';
    templates.push({...defaults[0],id,name:'分类排版'});
  }
  return {...input,columnSizingVersion:1,templates};
}
function record(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('工具布局格式无效。');
  return value as Record<string,unknown>;
}
function identifier(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>MAX_ID||/[\u0000-\u001f\u007f-\u009f]/.test(value))throw new Error('工具布局标识无效。');
  return value;
}
function name(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||[...value.trim()].length>MAX_NAME||/[\u0000-\u001f\u007f-\u009f]/.test(value))throw new Error(`模板或分组名称须为 1～${MAX_NAME} 个字，且不含控制字符。`);
  return value.trim();
}
function side(value:unknown):ToolLayoutSide {
  if(value!=='left'&&value!=='right')throw new Error('工具分组位置必须为左侧或右侧。');
  return value;
}
function columns(value:unknown):ToolLayoutTemplate['columns'] {
  const input=record(value),result={left:0,right:0};
  for(const key of ['left','right'] as const){const count=input[key];if(typeof count!=='number'||!Number.isInteger(count)||count<0||count>MAX_TOOL_LAYOUT_COLUMNS)throw new Error(`工具列数须为 0～${MAX_TOOL_LAYOUT_COLUMNS} 的整数；0 表示自动。`);result[key]=count;}
  return result;
}
/** Recover retired/new tools on read, but reject incomplete writes so an editor
 * bug cannot silently replace a user's order with a repaired layout. */
function template(value:unknown,repairItems:boolean):ToolLayoutTemplate {
  const input=record(value),id=identifier(input.id),title=name(input.name),counts=columns(input.columns);
  if(!Array.isArray(input.groups)||input.groups.length>MAX_GROUPS)throw new Error(`每个工具模板最多包含 ${MAX_GROUPS} 个分组。`);
  const groupIds=new Set<string>(),seen=new Set<string>();
  const groups:ToolLayoutGroup[]=input.groups.map(raw=>{
    const group=record(raw),groupId=identifier(group.id);
    if(groupIds.has(groupId))throw new Error('同一模板内的分组标识不能重复。');groupIds.add(groupId);
    if(!Array.isArray(group.items)||group.items.length>1000||group.items.some(item=>typeof item!=='string'))throw new Error('工具分组项目必须为工具标识数组。');
    const items:string[]=[];
    for(const item of group.items){
      if(!isToolLayoutItemId(item)||seen.has(item)){if(!repairItems)throw new Error('工具布局包含未知或重复工具，请检查布局后重试。');continue;}
      seen.add(item);items.push(item);
    }
    return {id:groupId,name:name(group.name),side:side(group.side),items};
  });
  if(input.unassigned!==undefined&&(!Array.isArray(input.unassigned)||input.unassigned.length>1000||input.unassigned.some(item=>typeof item!=='string')))throw new Error('未分配工具必须为工具标识数组。');
  const unassigned:string[]=[];
  for(const item of input.unassigned as string[]|undefined??[]){
    if(!isToolLayoutItemId(item)||seen.has(item)){if(!repairItems)throw new Error('工具布局包含未知或重复工具，请检查布局后重试。');continue;}
    seen.add(item);unassigned.push(item);
  }
  if(!repairItems&&seen.size!==TOOL_LAYOUT_ITEM_IDS.length)throw new Error('工具布局缺少工具，请检查布局后重试。');
  if(repairItems&&input.unassigned!==undefined){
    unassigned.push(...TOOL_LAYOUT_ITEM_IDS.filter(item=>!seen.has(item)));
  }
  else if(repairItems){
    const soleSide=groups.length&&groups.every(group=>group.side===groups[0].side)?groups[0].side:undefined;
    for(const fallback of defaultGroups()){
      const missing=fallback.items.filter(item=>!seen.has(item));if(!missing.length)continue;
      let target=groups.find(group=>group.id===fallback.id);
      if(!target){
        if(groups.length>=MAX_GROUPS)target=groups.find(group=>group.side===(soleSide??fallback.side))??groups[0];
        else {target={...fallback,side:soleSide??fallback.side,items:[]};groups.push(target);}
      }
      target.items.push(...missing);for(const item of missing)seen.add(item);
    }
  }
  return {id,name:title,columns:counts,groups,unassigned};
}
function preferences(value:unknown,repairItems:boolean):ToolLayoutPreferences {
  const input=record(value);
  if(input.version!==1||!Array.isArray(input.templates)||!input.templates.length||input.templates.length>MAX_TOOL_LAYOUT_TEMPLATES)throw new Error(`工具布局版本无效，或模板数量超出 1～${MAX_TOOL_LAYOUT_TEMPLATES} 个。`);
  const templates=input.templates.map(value=>template(value,repairItems)),ids=new Set<string>();
  for(const item of templates){if(ids.has(item.id))throw new Error('工具模板标识不能重复。');ids.add(item.id);}
  const activeId=identifier(input.activeId);
  if(!repairItems&&!ids.has(activeId))throw new Error('当前工具模板不存在，请重新选择后保存。');
  return {version:1,columnSizingVersion:1,activeId:ids.has(activeId)?activeId:templates[0].id,templates};
}
export function validateToolLayoutPreferences(value:unknown,repairItems=true):ToolLayoutPreferences {return preferences(value,repairItems);}
export function readToolLayoutPreferences(storage:Pick<Storage,'getItem'>=preferenceStorage):ToolLayoutPreferences {
  try{const raw=storage.getItem(TOOL_LAYOUT_PREFERENCES_KEY);return raw?validateToolLayoutPreferences(migrateBuiltinLayouts(JSON.parse(raw))):defaultToolLayoutPreferences();}catch{return defaultToolLayoutPreferences();}
}
export function saveToolLayoutPreferences(value:ToolLayoutPreferences,storage:Pick<Storage,'setItem'>=preferenceStorage):void {
  storage.setItem(TOOL_LAYOUT_PREFERENCES_KEY,JSON.stringify(preferences(value,false)));
}
export function activeToolLayoutTemplate(value:ToolLayoutPreferences):ToolLayoutTemplate {
  return value.templates.find(item=>item.id===value.activeId)??value.templates[0];
}
function templateIndex(value:ToolLayoutPreferences,id:string):number {
  const index=value.templates.findIndex(item=>item.id===id);if(index<0)throw new Error('找不到指定的工具模板。');return index;
}
export function selectToolLayoutTemplate(value:ToolLayoutPreferences,id:string):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value);templateIndex(next,id);return {...next,activeId:id};
}
export function updateToolLayoutTemplate(value:ToolLayoutPreferences,id:string,patch:ToolLayoutTemplatePatch):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value),index=templateIndex(next,id),current=next.templates[index];
  next.templates[index]=template({...current,name:patch.name??current.name,columns:{...current.columns,...patch.columns},groups:patch.groups??current.groups,unassigned:patch.unassigned??current.unassigned},true);
  return next;
}
export function renameToolLayoutTemplate(value:ToolLayoutPreferences,id:string,title:string):ToolLayoutPreferences {
  return updateToolLayoutTemplate(value,id,{name:title});
}
export function copyToolLayoutTemplate(value:ToolLayoutPreferences,id:string,title?:string,idFactory:()=>string=()=>crypto.randomUUID()):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value),source=next.templates[templateIndex(next,id)];
  if(next.templates.length>=MAX_TOOL_LAYOUT_TEMPLATES)throw new Error(`最多保存 ${MAX_TOOL_LAYOUT_TEMPLATES} 个工具模板。`);
  const used=new Set(next.templates.map(item=>item.id));let nextId='',attempts=0;
  do{if(++attempts>100)throw new Error('无法生成新的工具模板标识。');nextId=identifier(idFactory());}while(used.has(nextId));
  const copied=template({...source,id:nextId,name:title??`${[...source.name].slice(0,MAX_NAME-3).join('')} 副本`},false);
  return {...next,activeId:nextId,templates:[...next.templates,copied]};
}
export function createToolLayoutTemplate(value:ToolLayoutPreferences,title='新排版',idFactory:()=>string=()=>crypto.randomUUID()):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value);
  if(next.templates.length>=MAX_TOOL_LAYOUT_TEMPLATES)throw new Error(`最多保存 ${MAX_TOOL_LAYOUT_TEMPLATES} 个工具模板。`);
  const used=new Set(next.templates.map(item=>item.id));let nextId='',attempts=0;
  do{if(++attempts>100)throw new Error('无法生成新的工具模板标识。');nextId=identifier(idFactory());}while(used.has(nextId));
  const created=template({id:nextId,name:title,columns:{left:0,right:0},groups:defaultGroups().map(group=>({...group,items:[]})),unassigned:[...TOOL_LAYOUT_ITEM_IDS]},false);
  return {...next,activeId:nextId,templates:[...next.templates,created]};
}
export function deleteToolLayoutTemplate(value:ToolLayoutPreferences,id:string):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value),index=templateIndex(next,id);
  if(next.templates.length===1)throw new Error('至少保留一个工具模板。');
  next.templates.splice(index,1);if(next.activeId===id)next.activeId=next.templates[Math.min(index,next.templates.length-1)].id;
  return next;
}
function insertionIndex(index:number|undefined,length:number):number {
  if(index===undefined)return length;
  if(!Number.isInteger(index)||!Number.isFinite(index))throw new Error('工具排序位置必须为整数。');
  return Math.max(0,Math.min(index,length));
}
/** The index addresses the destination after the dragged item has been removed. */
export function moveToolLayoutItem(value:ToolLayoutPreferences,itemId:string,targetGroupId:string,index?:number,templateId=value.activeId):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value),targetTemplate=next.templates[templateIndex(next,templateId)];
  if(!isToolLayoutItemId(itemId))throw new Error('找不到指定的工具。');
  const target=targetTemplate.groups.find(group=>group.id===targetGroupId);if(!target)throw new Error('找不到目标工具分组。');
  for(const group of targetTemplate.groups)group.items=group.items.filter(item=>item!==itemId);
  targetTemplate.unassigned=targetTemplate.unassigned.filter(item=>item!==itemId);
  target.items.splice(insertionIndex(index,target.items.length),0,itemId);return next;
}
export function returnToolLayoutItemToPool(value:ToolLayoutPreferences,itemId:string,index?:number,templateId=value.activeId):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value),targetTemplate=next.templates[templateIndex(next,templateId)];
  if(!isToolLayoutItemId(itemId))throw new Error('找不到指定的工具。');
  for(const group of targetTemplate.groups)group.items=group.items.filter(item=>item!==itemId);
  targetTemplate.unassigned=targetTemplate.unassigned.filter(item=>item!==itemId);
  targetTemplate.unassigned.splice(insertionIndex(index,targetTemplate.unassigned.length),0,itemId);return next;
}
export function returnToolLayoutGroupToPool(value:ToolLayoutPreferences,groupId:string,templateId=value.activeId):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value),targetTemplate=next.templates[templateIndex(next,templateId)],group=targetTemplate.groups.find(group=>group.id===groupId);
  if(!group)throw new Error('找不到指定的工具分组。');
  targetTemplate.groups=targetTemplate.groups.filter(item=>item.id!==groupId);targetTemplate.unassigned.push(...group.items);return next;
}
/** Group indices are local to the destination side, after removing the source. */
export function moveToolLayoutGroup(value:ToolLayoutPreferences,groupId:string,targetSide:ToolLayoutSide,index?:number,templateId=value.activeId):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(value),targetTemplate=next.templates[templateIndex(next,templateId)],groupIndex=targetTemplate.groups.findIndex(group=>group.id===groupId);
  if(groupIndex<0)throw new Error('找不到指定的工具分组。');
  const [group]=targetTemplate.groups.splice(groupIndex,1);group.side=side(targetSide);
  const positions=targetTemplate.groups.flatMap((item,index)=>item.side===group.side?[index]:[]),position=insertionIndex(index,positions.length);
  const targetIndex=position<positions.length?positions[position]:positions.length?positions[positions.length-1]+1:targetTemplate.groups.length;
  targetTemplate.groups.splice(targetIndex,0,group);return next;
}
