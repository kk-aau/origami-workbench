import {useEffect,useId,useRef,useState} from 'react';
import {MAX_TOOL_LAYOUT_TEMPLATES,type ToolLayoutSide} from '../app/toolLayoutPreferences';
import type {ToolLayoutController} from './useToolLayout';
import './toolLayout.css';

export function ToolLayoutName({name,label,onCommit}:{name:string;label:string;onCommit:(name:string)=>void}){
 const [text,setText]=useState(name);
 const skipCommit=useRef(false);
 useEffect(()=>setText(name),[name]);
 return <input className="tool-layout-name" type="text" aria-label={label} value={text} maxLength={60} onChange={event=>setText(event.target.value)} onBlur={()=>{if(skipCommit.current){skipCommit.current=false;setText(name);return;}const next=text.trim();if(next&&next!==name)onCommit(next);else setText(name);}} onKeyDown={event=>{event.stopPropagation();if(event.nativeEvent.isComposing||event.keyCode===229)return;if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){event.preventDefault();skipCommit.current=true;setText(name);event.currentTarget.blur();}}}/>;
}
export default function ToolLayoutControls({layout,side,search,onSearch,onLibrary}:{layout:ToolLayoutController;side:ToolLayoutSide;search?:string;onSearch?:(value:string)=>void;onLibrary?:()=>void}){
 const {template,editing}=layout,label=side==='left'?'左侧':'右侧';
 const [more,setMore]=useState(false),actionsId=useId();
 const hasSearch=search!==undefined&&onSearch!==undefined;
 const fileAction=(action:()=>Promise<void>)=>{setMore(false);void action();};
 return <div className="tool-layout-controls" data-layout-controls={side}>
  <div className={`tool-layout-picker${hasSearch?' has-search':''}`}>
   <select aria-label={`${label}工具排版模板`} title={`排版：${template.name}`} disabled={layout.fileBusy} value={template.id} onChange={event=>layout.selectTemplate(event.target.value)}>{layout.preferences.templates.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
   {hasSearch&&<input className="tool-layout-search" aria-label="查找工具" title="查找工具" disabled={editing||layout.fileBusy} type="search" value={search} onChange={event=>onSearch(event.target.value)} placeholder="查找"/>}
   <button className="tool-layout-new" type="button" aria-label={`${label}新建工具排版`} title="新建排版：保留默认分类，工具全部待放置" disabled={layout.fileBusy||layout.preferences.templates.length>=MAX_TOOL_LAYOUT_TEMPLATES} onClick={()=>{setMore(false);layout.createTemplate();}}>新建</button>
   <button type="button" aria-label={`${label}编辑工具排版`} title="编辑当前排版" aria-pressed={editing} disabled={editing||layout.fileBusy} onClick={()=>{setMore(false);layout.begin();}}>编辑</button>
   <button className="tool-layout-more" type="button" aria-label={`${label}排版更多操作`} title="导入、导出排版与工具目录" aria-expanded={more} aria-controls={actionsId} onClick={()=>setMore(value=>!value)}>⋯</button>
  </div>
  {more&&<div className="tool-layout-file-actions" id={actionsId}>
   <button type="button" disabled={layout.fileBusy} onClick={()=>fileAction(layout.importTemplates)}>导入排版</button>
   <button type="button" disabled={layout.fileBusy} onClick={()=>fileAction(layout.exportTemplates)}>导出排版</button>
   {onLibrary&&<button type="button" aria-label="完整工具目录" title="完整工具目录 Ctrl+K" disabled={editing||layout.fileBusy} onClick={()=>{setMore(false);onLibrary();}}>工具目录</button>}
  </div>}
  {editing&&<fieldset className="tool-layout-edit-controls" disabled={layout.fileBusy}>
   <ToolLayoutName key={template.id} name={template.name} label={`${label}模板名称`} onCommit={name=>layout.patch({name})}/>
   <div className="tool-layout-template-actions"><button type="button" disabled={layout.preferences.templates.length>=MAX_TOOL_LAYOUT_TEMPLATES} onClick={layout.copyTemplate}>复制模板</button><button type="button" disabled={layout.preferences.templates.length<=1} onClick={layout.removeTemplate}>删除模板</button><label><span>列数</span><select aria-label={`${label}工具列数`} value={template.columns[side]} onChange={event=>layout.patch({columns:{[side]:Number(event.target.value)}})}><option value={0}>自动</option>{[1,2,3,4,5,6,7,8,9,10,11,12].map(count=><option key={count} value={count}>{count}</option>)}</select></label></div>
   <p>从中间拖入工具；拖回中间收回。组名旁的手柄可移动整组。</p>
   <div className="tool-layout-save-actions"><button type="button" onClick={layout.cancel}>取消</button><button type="button" className="primary" onClick={layout.save}>保存排版</button></div>
  </fieldset>}
  {layout.fileBusy&&<p className="tool-layout-file-status" role="status">正在处理排版文件…</p>}
  {!layout.fileBusy&&layout.fileMessage&&<p className="tool-layout-file-status" role="status">{layout.fileMessage}</p>}
  {layout.error&&<p className="tool-layout-error" role="alert">{layout.error}</p>}
 </div>;
}
