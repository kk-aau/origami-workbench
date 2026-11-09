import {TOOL_GUIDES,type Tool} from '../app/tools';
import {DOCK_LABELS,type DockGroup} from '../app/orieditaToolLayout';
import type {ToolShortcuts} from '../app/toolShortcuts';
import {Icon} from './Fields';
export interface DockToolProps {tool:Tool;drawingSwap?:boolean;onTool:(tool:Tool)=>void;onShortcut:(tool:Tool)=>void;bindings:ToolShortcuts}
export default function DockToolGroup({group,tool,drawingSwap=false,onTool,onShortcut,bindings}:{group:DockGroup}&DockToolProps){
 return <section className="dock-tool-group" aria-label={group.name}><h2>{group.name}</h2><div className="dock-tool-grid">{group.tools.map(id=><button key={id} data-tool={id} aria-label={TOOL_GUIDES[id].name} aria-pressed={tool===id||id==='regionalswap'&&drawingSwap} title={`${TOOL_GUIDES[id].name} · ${TOOL_GUIDES[id].usage}${bindings[`tool:${id}`]?' · '+bindings[`tool:${id}`]:''} · 右击设置快捷键`} onClick={()=>onTool(id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();onShortcut(id);}} onKeyDown={e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();e.stopPropagation();onShortcut(id);}}}><Icon name={id}/><span>{DOCK_LABELS[id]??TOOL_GUIDES[id].name}</span></button>)}</div></section>;
}
