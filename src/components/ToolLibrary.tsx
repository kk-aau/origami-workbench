import { useEffect, useRef, useState } from 'react';
import {openAppDialog} from './AppDialog';
import catalog from '../app/orieditaCatalog.json';
import { getToolPurpose, type Tool } from '../app/tools';
import { TOOL_PANEL_SPECS } from '../app/toolPanelSpecs';
import {catalogSettings} from '../app/catalogSettings';
const GROUPS=Object.keys(TOOL_PANEL_SPECS);
export default function ToolLibrary({onClose,onTool,initialId,onSettings,onMergeAll}:{onClose:()=>void;onTool:(tool:Tool)=>void;initialId?:string;onSettings:(kind:'display'|'shortcuts')=>void;onMergeAll:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const initial=catalog.find(t=>t.id===initialId)||catalog[0];
  const [query,setQuery]=useState(''),[group,setGroup]=useState(initialId?initial.group:'全部'),[selected,setSelected]=useState(initial);
  useEffect(()=>openAppDialog(dialog.current),[]);
  const visible=catalog.filter(t=>(group==='全部'||t.group===group)&&(!query||`${t.name} ${t.source} ${t.id} ${t.description}`.toLowerCase().includes(query.toLowerCase())));
  const executableEntries=catalog.filter(t=>!!t.tool);
  const executableCount=new Set(executableEntries.map(t=>t.tool)).size;
  const recordCount=catalog.length;
  return <dialog ref={dialog} className="tool-library ui-dialog" aria-labelledby="library-title" onCancel={e=>{e.preventDefault();onClose();}} onKeyDown={e=>e.stopPropagation()}>
    <header><div><small>完整工具范围 · 源码对照目录</small><h2 id="library-title">Oriedita 工具库</h2></div><button onClick={onClose} aria-label="关闭工具目录">×</button></header>
    <p className="catalog-disclaimer">当前目录映射 {executableCount} 个可执行工具（{executableEntries.length} 个目录入口），共 {recordCount} 条 Oriedita 动作／设置记录。目录记录不等于独立工具数量；没有执行入口的条目仅查看说明，不会伪装成已实现功能。</p>
    <label className="catalog-search"><span>搜索全部工具</span><input autoFocus type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="中文名称、原动作 ID、功能说明…"/></label>
    {catalogSettings(selected.id)&&<button onClick={()=>{const kind=catalogSettings(selected.id);if(kind){onClose();onSettings(kind);}}}>打开此项已实现的{catalogSettings(selected.id)==='display'?'显示':'快捷键／导入'}设置</button>}
    {selected.id==='v_del_allAction'&&<button onClick={()=>{onClose();onMergeAll();}}>执行全图同线型合点</button>}
    <div className="catalog-layout"><nav aria-label="工具分类">{['全部',...GROUPS].map(g=><button key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}<small>{g==='全部'?catalog.length:catalog.filter(t=>t.group===g).length}</small></button>)}</nav>
      <div className="catalog-results" aria-label="工具目录结果"><p className="catalog-count">{visible.length} 项目录记录 · 点选查看规格</p>{visible.map(entry=><button key={entry.id} className="catalog-entry" aria-pressed={selected.id===entry.id} onClick={()=>setSelected(entry)}><span><strong>{entry.name}</strong><small>{entry.group} / {entry.kind}</small></span><em>{entry.status}</em></button>)}{!visible.length&&<p>没有匹配项。试试中文名称或原动作 ID。</p>}</div>
      <section className="catalog-detail" aria-label="工具设计规格"><small>{selected.group}</small><h3>{selected.name}</h3><span className="catalog-status">{selected.status}</span>{selected.tool&&<><h4>工具作用</h4><p>{getToolPurpose(selected.tool as Tool)}</p></>}<h4>功能与操作范围</h4><p>{selected.description.split(' · ').at(-1)}</p><h4>规划中的参数区</h4><div className="spec-fields">{TOOL_PANEL_SPECS[selected.group]?.fields.map(field=><span key={field}>{field}</span>)}</div><p className="note">这是参数区设计说明，尚未接入的参数不作为可操作控件显示。</p><h4>设计位置</h4><p>{TOOL_PANEL_SPECS[selected.group]?.location}</p><h4>交互与结果反馈</h4><p>{TOOL_PANEL_SPECS[selected.group]?.feedback}</p><details className="catalog-source"><summary>查看原版源码核对记录</summary><p>{selected.description}</p><code>{selected.id}<br/>{selected.source}</code></details>{selected.tool?<button className="primary full" onClick={()=>{onTool(selected.tool as Tool);onClose();}}>使用当前基础版</button>:<p className="catalog-pending">{selected.id==='v_del_allAction'?'可从上方预览全图合点，确认后才修改作品。':catalogSettings(selected.id)?'可从上方打开已实现的设置；同组其余功能以状态说明为准。':'本目录未提供此项执行入口，请勿将规格预览视为已实现。'}</p>}</section>
    </div>
  </dialog>;
}
