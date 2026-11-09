import {useEffect,useMemo,useRef,useState} from 'react';
import {startOriconfigPreview,type OriconfigTask} from '../app/oriconfigTask';
import type {OriconfigArchive} from '../app/oriconfigArchive';
import {orieditaHotkeyEntries,previewOrieditaHotkeys} from '../app/orieditaHotkeys';
import type {ToolShortcuts} from '../app/toolShortcuts';
import {TOOL_NAMES} from '../app/tools';
import OriconfigDisplayImport from './OriconfigDisplayImport';
import OriconfigMouseImport,{type MouseImportProps} from './OriconfigMouseImport';
import type {CreaseDisplay} from '../app/creaseDisplay';
import type {GridAppearance} from '../app/gridAppearance';
import type {Theme} from '../app/theme';
import OriconfigWorkbenchImport from './OriconfigWorkbenchImport';

export default function OriconfigImport({bindings,onApply,display,onApplyDisplay,mouse,gridAppearance,onApplyGridAppearance,theme,onApplyTheme}:{bindings:ToolShortcuts;onApply:(next:ToolShortcuts)=>void;display:CreaseDisplay;onApplyDisplay:(next:CreaseDisplay)=>void;mouse:MouseImportProps;gridAppearance:GridAppearance;onApplyGridAppearance:(next:GridAppearance)=>void;theme:Theme;onApplyTheme:(next:Theme)=>void}){
 const [archive,setArchive]=useState<OriconfigArchive|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 const generation=useRef(0),task=useRef<OriconfigTask|null>(null);
 const [selected,setSelected]=useState<string[]|undefined>(undefined);
 const entries=useMemo(()=>{try{return archive?.hotkeys==null?[]:orieditaHotkeyEntries(archive.hotkeys);}catch{return [];}},[archive]);
 useEffect(()=>()=>{generation.current++;task.current?.cancel();},[]);
 const preview=useMemo(()=>{
  if(archive?.hotkeys==null)return null;
  try{return previewOrieditaHotkeys(archive.hotkeys,bindings,selected);}
  catch(e){return {bindings:null,recognized:0,skipped:[],issues:[{action:'配置',message:e instanceof Error?e.message:String(e)}]};}
 },[archive,bindings,selected]);
 const changes=preview?.bindings?Object.entries(preview.bindings).filter(([key,value])=>bindings[key as keyof ToolShortcuts]!==value):[];
 function stop(){generation.current++;task.current?.cancel();task.current=null;setBusy(false);setMessage('已取消，未修改设置。');setFailed(false);}
 async function read(file:File){
  const ticket=++generation.current;task.current?.cancel();task.current=null;setArchive(null);setName(file.name);setMessage('');setFailed(false);setBusy(true);
  try{
   if(file.size<22||file.size>4*1024*1024)throw new Error('请选择不超过 4 MB 的 ORICONFIG 设置包。');
   const bytes=new Uint8Array(await file.arrayBuffer());if(ticket!==generation.current)return;
   const running=startOriconfigPreview(bytes,bindings);task.current=running;
   const reply=await running.promise;if(ticket!==generation.current)return;
   task.current=null;
   if(reply.status!=='complete')throw new Error(reply.message);
   setSelected(undefined);setArchive(reply.archive);
  }catch(e){if(ticket!==generation.current)return;setFailed(true);setMessage(e instanceof Error?e.message:String(e));}
  finally{if(ticket===generation.current)setBusy(false);}
 }
 function apply(){
  if(!preview?.bindings||!changes.length)return;
  try{onApply(preview.bindings);setFailed(false);setMessage(`已导入所选快捷键，主动跳过 ${preview.skipped.length} 项；其他设置和作品未改变。`);}
  catch(e){setFailed(true);setMessage(e instanceof Error?e.message:String(e));}
 }
 return <details style={{marginTop:16,borderTop:'1px solid var(--border, #ddd)',paddingTop:12}}>
  <summary>导入 Oriedita 设置（.oriconfig）</summary>
  <p className="note">先预检、后分别确认快捷键、显示、缩放和拾取设置，不修改作品。快捷键默认选择全部动作，可主动取消勾选不迁移的项目；所选项目未建立对应或存在冲突时禁止应用快捷键。各组独立确认。</p>
  <label className="select-field">选择设置包<input aria-label="选择 ORICONFIG 设置包" type="file" accept=".oriconfig" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void read(file);}}/></label>
  {busy&&<p role="status">正在预检 {name}… <button onClick={stop}>取消预检</button></p>}
  {archive&&<div aria-label="设置包预检结果">
   <p>{name} · 已识别 {preview?.recognized??0} 项快捷键 · 将改变 {changes.length} 项</p>
   {(archive.workbench??archive.config)&&<OriconfigDisplayImport native={!!archive.workbench} config={(archive.workbench??archive.config)!} current={display} onApply={onApplyDisplay}/>}
   {archive.config&&<OriconfigMouseImport key={name} config={archive.config} {...mouse}/>}
   {archive.config&&<OriconfigWorkbenchImport config={archive.config} current={{gridAppearance,theme}} onApply={value=>{onApplyGridAppearance(value.gridAppearance);onApplyTheme(value.theme);}}/>}
   {archive.ignoredFiles.length>0&&<p className="note">未应用的文件：{archive.ignoredFiles.join('、')}</p>}
   {archive.warnings.map((warning,i)=><p className="note warning" key={i}>{warning}</p>)}
   {!preview&&<p className="note">包中没有 hotkey.properties，没有可导入的快捷键。</p>}
   {!!entries.length&&<fieldset><legend>选择迁移项目 · {selected?.length??entries.length} / {entries.length}</legend>
    <div className="button-pair"><button onClick={()=>setSelected(undefined)}>全选项目</button><button onClick={()=>setSelected([])}>清空选择</button></div>
    <div style={{maxHeight:200,overflow:'auto',marginTop:8}}>{entries.map(entry=><label key={entry.action} style={{display:'flex',gap:8,alignItems:'start',padding:'4px 0'}}><input type="checkbox" aria-label={`迁移 ${entry.action}`} checked={selected===undefined||selected.includes(entry.action)} onChange={e=>{const next=new Set(selected??entries.map(item=>item.action));if(e.target.checked)next.add(entry.action);else next.delete(entry.action);setSelected([...next]);}}/><span>{entry.label} · {entry.value||'解除绑定'}<small style={{display:'block'}}>{entry.action}</small></span></label>)}</div>
   </fieldset>}
   {!!preview?.skipped.length&&<details><summary>主动跳过 {preview.skipped.length} 项（不导入这些动作的配置）</summary><ul style={{maxHeight:140,overflow:'auto'}}>{preview.skipped.map(action=><li key={action}>{action}</li>)}</ul></details>}
   {!!preview?.issues.length&&<div role="alert" style={{maxHeight:160,overflow:'auto'}}><p>请先处理以下项目；所选快捷键尚未导入。</p><ul>{preview.issues.map((issue,i)=><li key={i}>{issue.action}：{issue.message}</li>)}</ul></div>}
   {!!changes.length&&<ul style={{maxHeight:180,overflow:'auto'}}>{changes.map(([key,value])=><li key={key}>{key.startsWith('tool:')?TOOL_NAMES[key.slice(5) as keyof typeof TOOL_NAMES]:({'preset:M':'山折','preset:V':'谷折','preset:U':'未指派','preset:B':'边界','preset:A':'辅助线'} as Record<string,string>)[key]}：{bindings[key as keyof ToolShortcuts]??'未绑定'} → {value??'未绑定'}</li>)}</ul>}
   {preview?.bindings&&!changes.length&&<p className="note">{selected?.length===0?'尚未选择迁移项目。':'与当前快捷键一致，无需应用。'}</p>}
   <button className="primary" disabled={!preview?.bindings||!changes.length||busy} onClick={apply}>确认导入快捷键</button>
  </div>}
  {message&&<p role={failed?'alert':'status'} className={failed?'note warning':'note'}>{message}</p>}
 </details>;
}
