import {useState} from 'react';
import {confirmAction} from '../app/confirmAction';
import OriconfigImport from './OriconfigImport';
import OriconfigExport from './OriconfigExport';
import type {MouseImportProps} from './OriconfigMouseImport';
import type {CreaseDisplay} from '../app/creaseDisplay';
import type {GridAppearance} from '../app/gridAppearance';
import type {Theme} from '../app/theme';
import {TOOL_NAMES} from '../app/tools';
import {defaultToolShortcuts,setToolShortcut,type ToolShortcutAction,type ToolShortcuts} from '../app/toolShortcuts';
const choices:[ToolShortcutAction,string][]=[...Object.entries(TOOL_NAMES).map(([id,name])=>['tool:'+id,name] as [ToolShortcutAction,string]),['preset:M','新线：山折'],['preset:V','新线：谷折'],['preset:B','新线：边界'],['preset:A','新线：辅助线']];
export default function ToolShortcutSettings({bindings,onSave,display,onSaveDisplay,mouse,gridAppearance,onSaveGridAppearance,theme,onSaveTheme,initialAction='tool:line'}:{bindings:ToolShortcuts;onSave:(value:ToolShortcuts)=>void;display:CreaseDisplay;onSaveDisplay:(value:CreaseDisplay)=>void;mouse:MouseImportProps;gridAppearance:GridAppearance;onSaveGridAppearance:(value:GridAppearance)=>void;theme:Theme;onSaveTheme:(value:Theme)=>void;initialAction?:ToolShortcutAction}){
 const [search,setSearch]=useState(''),[action,setAction]=useState<ToolShortcutAction>(initialAction),[draft,setDraft]=useState(bindings[initialAction]??''),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 const [boundOnly,setBoundOnly]=useState(false);
 const filtered=choices.filter(([id,name])=>(!boundOnly||!!bindings[id])&&(name+' '+id).toLowerCase().includes(search.trim().toLowerCase())),label=choices.find(([id])=>id===action)![1];
 function apply(value:ToolShortcuts){try{onSave(value);setDraft(value[action]??'');setFailed(false);setMessage('快捷键已保存到本机并生效。');}catch(e){setFailed(true);setMessage(e instanceof Error?e.message:String(e));}}
 function assign(value:string|null){try{apply(setToolShortcut(bindings,action,value));}catch(e){setFailed(true);setMessage(e instanceof Error?e.message:String(e));}}
 return <section aria-label="工具快捷键配置">
  <p className="note">仅用于折痕编辑区；输入文字、弹窗、输入法组字时不切换工具。不修改作品或撤销历史。保存、撤销、取消等基础命令保持原样。</p>
  <label className="select-field">搜索工具<input aria-label="搜索快捷键工具" value={search} onChange={e=>setSearch(e.target.value)} placeholder="中文名称或工具标识"/></label>
  <label><input type="checkbox" checked={boundOnly} onChange={e=>setBoundOnly(e.target.checked)}/>仅显示已有快捷键</label>
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:16,margin:'12px 0'}}>
   <div><label htmlFor="shortcut-action">工具与线型 · {filtered.length} 项</label><select id="shortcut-action" aria-label="配置快捷键的工具" size={9} style={{width:'100%',height:250,marginTop:8}} value={filtered.some(([id])=>id===action)?action:''} onChange={e=>{const next=e.target.value as ToolShortcutAction;setAction(next);setDraft(bindings[next]??'');setMessage('');}}>{filtered.map(([id,name])=><option key={id} value={id}>{name} · {bindings[id]??'未绑定'}</option>)}</select>{!filtered.length&&<p className="note">没有匹配的工具。</p>}</div>
   <div><h3>{label}</h3><p>当前：<kbd>{bindings[action]??'未绑定'}</kbd></p><label className="select-field">新的快捷键<input aria-label="新的工具快捷键" value={draft} maxLength={40} onChange={e=>setDraft(e.target.value)} placeholder="例如 Shift+Q 或 Ctrl+Shift+Q"/></label><p className="note">填写字母、数字或功能键名称，可组合 Ctrl、Shift；大小写不限。空白表示解除绑定。Ctrl 同时适用于 macOS 的 Command。Alt 与部分浏览器保留键不支持。</p><div className="button-pair"><button className="primary" onClick={()=>assign(draft.trim()||null)}>保存快捷键</button><button onClick={()=>assign(null)}>清除绑定</button></div></div>
  </div>
  <button onClick={()=>assign(defaultToolShortcuts()[action]??null)}>恢复此项默认 · {label}</button>
  {message&&<p role={failed?'alert':'status'} className={failed?'note warning':'note'}>{message}</p>}
  <button onClick={()=>{if(confirmAction('恢复所有绘图工具与新线类型的默认快捷键？自定义绑定将被替换。'))apply(defaultToolShortcuts());}}>恢复默认快捷键</button>
  <OriconfigImport mouse={mouse} display={display} onApplyDisplay={onSaveDisplay} gridAppearance={gridAppearance} onApplyGridAppearance={onSaveGridAppearance} theme={theme} onApplyTheme={onSaveTheme} bindings={bindings} onApply={value=>{onSave(value);setDraft(value[action]??'');setMessage('');}}/>
  <OriconfigExport bindings={bindings} display={display} mouse={mouse} gridAppearance={gridAppearance} theme={theme}/>
 </section>;
}
