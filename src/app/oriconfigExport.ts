import {strToU8,zipSync} from 'fflate';
import {exportOrieditaHotkeys} from './orieditaHotkeys';
import type {ToolShortcutAction,ToolShortcuts} from './toolShortcuts';
function buildArchive(bindings:ToolShortcuts,selected:readonly ToolShortcutAction[],acknowledgeReplacement:boolean,config?:Record<string,unknown>):Uint8Array{
 if(acknowledgeReplacement!==true)throw new Error('请先确认：原版导入会清空现有快捷键。');
 const preview=exportOrieditaHotkeys(bindings,selected);
 if(!preview.exported.length)throw new Error('至少选择一项可导出的快捷键配置。');
 if(preview.text===null)throw new Error(preview.issues.map(issue=>`${issue.action}：${issue.message}`).join('\n'));
 const files:Record<string,Uint8Array>={'hotkey.properties':strToU8(preview.text)};
 if(config!==undefined){if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('设置配置必须是对象。');const bytes=strToU8(JSON.stringify({version:1,settings:config}));if(bytes.length>256*1024)throw new Error('设置配置超过 256 KB。');files['workbench.json']=bytes;}
 return zipSync(files,{level:0,mtime:new Date(2000,0,1)});
}
/** Hotkeys-only archive. Never emits a partial application config which could reset unrelated settings. */
export function exportOriconfigHotkeys(bindings:ToolShortcuts,selected:readonly ToolShortcutAction[],acknowledgeReplacement:boolean):Uint8Array{
 return buildArchive(bindings,selected,acknowledgeReplacement);
}
/** Workbench-aware archive: preserves the same Oriedita hotkeys plus explicitly selected compatible preferences. */
export function exportOriconfigSettings(bindings:ToolShortcuts,selected:readonly ToolShortcutAction[],acknowledgeReplacement:boolean,config:Record<string,unknown>):Uint8Array{
 return buildArchive(bindings,selected,acknowledgeReplacement,config);
}
