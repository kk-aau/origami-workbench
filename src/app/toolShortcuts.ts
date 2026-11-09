import {preferenceStorage} from './preferenceStorage';
import {TOOL_NAMES,type Tool} from './tools';
export type ToolShortcutAction=`tool:${Tool}`|'preset:M'|'preset:V'|'preset:U'|'preset:B'|'preset:A';
export type ToolShortcuts=Partial<Record<ToolShortcutAction,string|null>>;
export const TOOL_SHORTCUTS_KEY='zhezhi.tool-shortcuts.v1';
const actions=new Set<string>([...Object.keys(TOOL_NAMES).map(id=>'tool:'+id),'preset:M','preset:V','preset:B','preset:A']);
const reserved=new Set(['Ctrl+A','Ctrl+Shift+A','Ctrl+S','Ctrl+Shift+S','Ctrl+O','Ctrl+K','Ctrl+Z','Ctrl+Shift+Z','Ctrl+Y','Ctrl+C','Ctrl+V','Ctrl+X','Ctrl+N','Ctrl+T','Ctrl+W','Ctrl+R','Ctrl+Shift+R','Ctrl+F','Ctrl+L','Ctrl+P','Ctrl+D','Ctrl+H','Ctrl+J','Ctrl+U','Ctrl+Shift+I','Ctrl+Shift+J','Ctrl+Shift+C']);
export function defaultToolShortcuts():ToolShortcuts{return {'tool:select':'V','tool:line':'L','tool:pan':'H','preset:M':'1','preset:V':'2'};}
export function normalizeToolShortcut(value:string):string{
 if(typeof value!=='string'||value.length>40)throw new Error('快捷键格式无效。');
 const parts=value.trim().split('+').map(p=>p.trim().toUpperCase()),key=parts.pop();
 if(!key||!(/^[A-Z0-9]$/.test(key)||/^F(?:[1-9]|1[0-2])$/.test(key))||parts.some(p=>!['CTRL','SHIFT'].includes(p))||new Set(parts).size!==parts.length)throw new Error('请使用字母、数字或功能键，可组合 Ctrl 和 Shift。');
 const chord=(parts.includes('CTRL')?'Ctrl+':'')+(parts.includes('SHIFT')?'Shift+':'')+key;
 // App's foundational commands match Ctrl/Meta + key regardless of Shift.
 // Reject both variants here so settings cannot offer an unreachable binding.
 const appCommand=parts.includes('CTRL')&&['A','S','O','K','Z','Y'].includes(key);
 if(appCommand||reserved.has(chord)||['F1','F5','F6','F11','F12'].includes(key))throw new Error('此快捷键用于工作台或浏览器基础操作，不能分配给工具。');
 return chord;
}
/** A complete effective map: null intentionally disables a default binding. */
export function validateToolShortcuts(value:unknown):ToolShortcuts{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('工具快捷键设置格式无效。');
 const result:ToolShortcuts={...defaultToolShortcuts()},used=new Map<string,string>();
 for(const [action,chord]of Object.entries(value)){
  // Retire the old drawing preset without discarding other saved bindings.
  if(action==='preset:U')continue;
  if(!actions.has(action))throw new Error('快捷键指向未知工具或线型。');
  if(chord!==null&&typeof chord!=='string')throw new Error('快捷键必须是文字或空绑定。');
  result[action as ToolShortcutAction]=chord===null?null:normalizeToolShortcut(chord);
 }
 for(const [action,chord]of Object.entries(result)){if(chord===null)continue;if(used.has(chord))throw new Error(`快捷键 ${chord} 已分配给其他工具，请先取消原绑定。`);used.set(chord,action);}
 return result;
}
export function setToolShortcut(settings:ToolShortcuts,action:ToolShortcutAction,chord:string|null):ToolShortcuts{return validateToolShortcuts({...settings,[action]:chord});}
export interface ShortcutKeyEvent {key:string;code?:string;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;altKey:boolean;repeat?:boolean;isComposing?:boolean;defaultPrevented?:boolean;getModifierState?:(key:string)=>boolean}
/** Call only after modal/editable-target/context guards. Ctrl/Meta share a command key. */
export function matchToolShortcut(event:ShortcutKeyEvent,settings:ToolShortcuts):ToolShortcutAction|null{
 if(event.repeat||event.isComposing||event.defaultPrevented||event.altKey||event.getModifierState?.('AltGraph'))return null;
 const key=event.shiftKey&&/^Digit[0-9]$/.test(event.code??'')?event.code!.slice(5):event.key;
 let chord:string;try{chord=normalizeToolShortcut((event.ctrlKey||event.metaKey?'Ctrl+':'')+(event.shiftKey?'Shift+':'')+key);}catch{return null;}
 return (Object.entries(settings).find(([action,binding])=>actions.has(action)&&binding===chord)?.[0] as ToolShortcutAction|undefined)??null;
}
export function readToolShortcuts(storage?:Pick<Storage,'getItem'>):ToolShortcuts{
 try{const raw=(storage??preferenceStorage).getItem(TOOL_SHORTCUTS_KEY);if(!raw)return defaultToolShortcuts();const parsed=JSON.parse(raw);if(parsed.version!==1)throw Error('version');return validateToolShortcuts(parsed.bindings);}catch{return defaultToolShortcuts();}
}
export function saveToolShortcuts(settings:ToolShortcuts,storage:Pick<Storage,'setItem'>=preferenceStorage){const bindings=validateToolShortcuts(settings);storage.setItem(TOOL_SHORTCUTS_KEY,JSON.stringify({version:1,bindings}));}
