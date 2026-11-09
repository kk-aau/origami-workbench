import {useEffect,useState} from 'react';
import {downloadBlob} from '../app/api';
import {exportOrieditaHotkeys} from '../app/orieditaHotkeys';
import {exportOriconfigSettings} from '../app/oriconfigExport';
import {validateToolShortcuts,type ToolShortcutAction,type ToolShortcuts} from '../app/toolShortcuts';
import {TOOL_NAMES} from '../app/tools';
import type {CreaseDisplay} from '../app/creaseDisplay';
import type {MouseImportProps} from './OriconfigMouseImport';
import type {GridAppearance} from '../app/gridAppearance';
import type {Theme} from '../app/theme';
import {WORKBENCH_GRID_KEY,WORKBENCH_THEME_KEY} from '../app/oriconfigWorkbench';
export default function OriconfigExport({bindings,display,mouse,gridAppearance,theme}:{bindings:ToolShortcuts;display:CreaseDisplay;mouse:MouseImportProps;gridAppearance:GridAppearance;theme:Theme}){
 const [selection,setSelection]=useState<ToolShortcutAction[]|null>(null),[acknowledged,setAcknowledged]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[saving,setSaving]=useState(false);
 useEffect(()=>{setAcknowledged(false);setMessage('');},[bindings]);
 const entries=Object.entries(validateToolShortcuts(bindings)) as [ToolShortcutAction,string|null][],keys=entries.map(([key])=>key);
 const selected=(selection??keys).filter(key=>keys.includes(key)),preview=exportOrieditaHotkeys(bindings,selected);
 async function save(){if(saving)return;setSaving(true);setFailed(false);setMessage('');try{
  const bytes=exportOriconfigSettings(bindings,selected,acknowledged,{...display,...mouse.zoom,...mouse.picking,[WORKBENCH_GRID_KEY]:gridAppearance,[WORKBENCH_THEME_KEY]:theme});
  const result=await downloadBlob(new Blob([new Uint8Array(bytes)],{type:'application/zip'}),'折纸工坊-设置.oriconfig');
  if(result.status==='cancelled'){setMessage('已取消导出，设置保持不变。');return;}
  setMessage(`${result.status==='saved'?'设置包已保存':'设置包已交给浏览器下载'}，包含快捷键、显示、缩放、拾取、网格与主题设置，不包含作品。`);
 }catch(e){setFailed(true);setMessage(e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 return <details style={{marginTop:16}}><summary>导出 Oriedita／工作台设置包（.oriconfig）</summary>
  <p className="note warning">{preview.warnings[0]}</p><p className="note">导出勾选的快捷键及明确的解绑项，并附带当前显示、缩放、拾取、网格和主题设置。折纸工坊可恢复这些偏好；Oriedita 仅导入快捷键。导入时各组独立确认，不包含作品。</p>
  <div style={{maxHeight:180,overflow:'auto'}}>{entries.map(([key,chord])=><label key={key} style={{display:'flex',gap:8,padding:'4px 0'}}><input type="checkbox" aria-label={`导出 ${key}`} checked={selected.includes(key)} onChange={e=>{const next=new Set(selected);if(e.target.checked)next.add(key);else next.delete(key);setSelection([...next]);setAcknowledged(false);setMessage('');}}/><span>{key.startsWith('tool:')?TOOL_NAMES[key.slice(5) as keyof typeof TOOL_NAMES]:({'preset:M':'新线：山折','preset:V':'新线：谷折','preset:U':'新线：未指派','preset:B':'新线：边界','preset:A':'新线：辅助线'} as Record<string,string>)[key]} · {chord??'解除绑定'}</span></label>)}</div>
  {!!preview.issues.length&&<ul role="alert">{preview.issues.map(issue=><li key={issue.action}>{issue.action}：{issue.message}</li>)}</ul>}
  <p className="note">已选 {selected.length} 项 · 主动跳过 {preview.skipped.length} 项</p>
  <label style={{display:'block',margin:'8px 0'}}><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>我已备份原版设置，并了解导入会替换原版全部快捷键</label>
  <button disabled={saving||!acknowledged||!preview.text||!preview.exported.length} onClick={save}>{saving?'正在保存…':'导出所选设置包'}</button>
  {message&&<p role={failed?'alert':'status'}>{message}</p>}
 </details>;
}
