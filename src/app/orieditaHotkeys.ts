import catalog from './orieditaCatalog.json';
import {TOOL_NAMES} from './tools';
import {normalizeToolShortcut,validateToolShortcuts,type ToolShortcuts,type ToolShortcutAction} from './toolShortcuts';

/** Decoded Java properties text. ZIP extraction and byte decoding happen elsewhere. */
export function parseJavaProperties(text:string):Map<string,string>{
 if(typeof text!=='string'||text.length>262144)throw new Error('快捷键配置过大或格式无效。');
 const decode=(s:string)=>s.replace(/\\(u[\s\S]{0,4}|[\s\S])/g,(_whole,escape:string)=>{
  if(escape[0]==='u'){if(!/^u[0-9a-fA-F]{4}$/.test(escape))throw new Error('配置包含无效 Unicode 转义。');return String.fromCharCode(parseInt(escape.slice(1),16));}
  return ({t:'\t',r:'\r',n:'\n',f:'\f'} as Record<string,string>)[escape]??escape;
 });
 const result=new Map<string,string>(),lines=text.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/);
 for(let index=0;index<lines.length;index++){
  let line=lines[index].replace(/^[ \t\f]+/,'');if(!line||/^[#!]/.test(line))continue;
  while((line.match(/\\+$/)?.[0].length??0)%2===1){line=line.slice(0,-1);if(++index>=lines.length)break;line+=lines[index].replace(/^[ \t\f]+/,'');}
  let end=0,escaped=false;
  for(;end<line.length;end++){const c=line[end];if(!escaped&&/[=:\t\f ]/.test(c))break;if(!escaped&&c==='\\')escaped=true;else escaped=false;}
  let start=end;while(/[ \t\f]/.test(line[start]??'')&&start<line.length)start++;
  if(line[start]==='='||line[start]===':')start++;
  while(start<line.length&&/[ \t\f]/.test(line[start]))start++;
  result.set(decode(line.slice(0,end)),decode(line.slice(start))); // Java: last duplicate wins
 }
 return result;
}
export function javaToolKeyStroke(value:string):string|null{
 if(!value.trim())return null;
 const parts=value.trim().split(/\s+/),key=parts.pop()!,modifiers=parts.filter(p=>p!=='pressed');
 if(parts.filter(p=>p==='pressed').length>1||parts.includes('released')||parts.includes('typed')||modifiers.some(p=>!['ctrl','control','meta','shift'].includes(p)))throw new Error('当前不支持该 Java 按键事件或修饰符。');
 const normalized=modifiers.map(p=>['ctrl','control','meta'].includes(p)?'Ctrl':'Shift');
 if(new Set(normalized).size!==normalized.length)throw new Error('按键修饰符重复。');
 return normalizeToolShortcut([...normalized,key].join('+'));
}
/** ASCII-only Java KeyStroke representation accepted by KeyStroke.getKeyStroke. */
export function toJavaToolKeyStroke(value:string|null):string{
 if(value===null)return '';
 const parts=normalizeToolShortcut(value).split('+'),key=parts.pop()!;
 return [...parts.map(p=>p==='Ctrl'?'ctrl':'shift'),'pressed',key].join(' ');
}
const mappings=new Map<string,Set<ToolShortcutAction>>();
for(const entry of catalog){if(!entry.tool||!Object.hasOwn(TOOL_NAMES,entry.tool)||!/^\w+$/.test(entry.source))continue;const targets=mappings.get(entry.source)??new Set<ToolShortcutAction>();targets.add(`tool:${entry.tool}` as ToolShortcutAction);mappings.set(entry.source,targets);}
for(const [source,target] of Object.entries({selectAction:'tool:select',unselectAction:'tool:unselect',colRedAction:'preset:M',colBlueAction:'preset:V',colBlackAction:'preset:B',colCyanAction:'preset:A'}))mappings.set(source,new Set([target as ToolShortcutAction]));
export interface OrieditaHotkeyEntry {action:string;value:string;target:ToolShortcutAction|null;label:string}
export function orieditaHotkeyEntries(text:string):OrieditaHotkeyEntry[]{
 return [...parseJavaProperties(text)].map(([action,value])=>{
  const targets=mappings.get(action),target=targets?.size===1?[...targets][0]:null;
  const label=target?.startsWith('tool:')?TOOL_NAMES[target.slice(5) as keyof typeof TOOL_NAMES]:target?({'preset:M':'新线：山折','preset:V':'新线：谷折','preset:B':'新线：边界','preset:A':'新线：辅助线'} as Record<string,string>)[target]: '暂未建立唯一对应';
  return {action,value,target,label};
 });
}
export interface OrieditaHotkeyPreview {bindings:ToolShortcuts|null;recognized:number;issues:{action:string;message:string}[];skipped:string[]}
export interface OrieditaHotkeyExport {text:string|null;exported:{target:ToolShortcutAction;source:string}[];skipped:string[];issues:{action:string;message:string}[];warnings:string[]}
/** No implicit omissions or guessed source aliases. Selection must be explicit when not exporting all. */
export function exportOrieditaHotkeys(current:ToolShortcuts,selectedActions?:readonly ToolShortcutAction[]):OrieditaHotkeyExport{
 const bindings=validateToolShortcuts(current),selected=selectedActions===undefined?null:new Set(selectedActions);
 const issues:OrieditaHotkeyExport['issues']=[],exported:OrieditaHotkeyExport['exported']=[],skipped:string[]=[],lines:string[]=[];
 if(selected)for(const action of selected)if(!Object.hasOwn(bindings,action))issues.push({action,message:'所选项目没有明确的绑定或解绑配置。'});
 for(const [action,chord]of Object.entries(bindings).sort(([a],[b])=>a.localeCompare(b))){
  if(selected&&!selected.has(action as ToolShortcutAction)){skipped.push(action);continue;}
  const sources=[...mappings].filter(([,targets])=>targets.size===1&&targets.has(action as ToolShortcutAction)).map(([source])=>source);
  if(sources.length!==1){issues.push({action,message:sources.length?'对应多个原版动作，尚未确认导出主动作。':'没有可导出的原版动作对应关系。'});continue;}
  exported.push({target:action as ToolShortcutAction,source:sources[0]});lines.push(`${sources[0]}=${toJavaToolKeyStroke(chord)}`);
 }
 return {text:issues.length?null:'# Zhezhi workbench: explicitly selected Oriedita hotkeys\n'+lines.join('\n')+'\n',exported,skipped,issues,warnings:['Oriedita 导入 hotkey.properties 时会先清空现有快捷键；未包含的原版动作不会保留当前绑定。请先备份原版设置。']};
}
/** Merge only mapped actions. Returns no applicable candidate if anything fails;
 * caller must show issues and never silently apply a partial migration. */
export function previewOrieditaHotkeys(text:string,current:ToolShortcuts,selectedActions?:readonly string[]):OrieditaHotkeyPreview{
 const candidate=validateToolShortcuts(current),issues:OrieditaHotkeyPreview['issues']=[],assigned=new Map<ToolShortcutAction,string|null>();let recognized=0;
 const properties=parseJavaProperties(text),selected=selectedActions===undefined?null:new Set(selectedActions),skipped:string[]=[];
 if(selected)for(const action of selected)if(!properties.has(action))issues.push({action,message:'所选动作不在此设置包中，请重新选择。'});
 for(const [action,value]of properties){
  if(selected&&!selected.has(action)){skipped.push(action);continue;}
  const targets=mappings.get(action);
  if(!targets||targets.size!==1){issues.push({action,message:targets?'该原版动作对应多个工具，不能自动选择。':'该原版动作暂未建立快捷键对应关系。'});continue;}
  const target=[...targets][0];
  try{const chord=javaToolKeyStroke(value);if(assigned.has(target)&&assigned.get(target)!==chord)throw new Error('多个原版动作对同一工具指定了不同快捷键。');assigned.set(target,chord);candidate[target]=chord;recognized++;}catch(e){issues.push({action,message:e instanceof Error?e.message:String(e)});}
 }
 let bindings:ToolShortcuts|null=null;
 try{const checked=validateToolShortcuts(candidate);if(!issues.length)bindings=checked;}catch(e){issues.push({action:'整体绑定',message:e instanceof Error?e.message:String(e)});}
 return {bindings,recognized,issues,skipped};
}
