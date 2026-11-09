import {useState,type ReactNode} from 'react';
import type {Tool} from '../app/tools';
import {defaultToolShortcuts,type ToolShortcuts} from '../app/toolShortcuts';
import CustomToolGroups,{type ToolLayoutActions} from './CustomToolGroups';
import ToolLayoutControls from './ToolLayoutControls';
import type {ToolLayoutController} from './useToolLayout';
import {Icon} from './Fields';
export default function ToolRail({layout,actions,tool,drawingSwap=false,onTool,bindings=defaultToolShortcuts(),width,onRemove,canRemove,onLibrary,onShortcut,leading,trailing,typeControls}:{layout:ToolLayoutController;actions:ToolLayoutActions;tool:Tool;drawingSwap?:boolean;onShortcut:(tool:Tool)=>void;bindings?:ToolShortcuts;onTool:(tool:Tool)=>void;width:number;onRemove:()=>void;canRemove:boolean;onLibrary:(id?:string)=>void;leading?:ReactNode;trailing?:ReactNode;typeControls?:ReactNode}){
 const [query,setQuery]=useState('');
 const props={tool,drawingSwap,onTool,onShortcut,bindings};
 return <aside className="tool-rail oriedita-rail compact-tool-rail" aria-label="绘图工具" style={{width}}>
  <ToolLayoutControls layout={layout} side="left" search={query} onSearch={setQuery} onLibrary={()=>onLibrary()}/>
  {typeControls&&!layout.template.groups.some(group=>group.id==='types'&&group.side==='left')&&<div className="dock-nonlayout-controls tool-category-fallback" inert={layout.editing}><span>新线类型</span>{typeControls}</div>}
  <CustomToolGroups layout={layout} side="left" actions={actions} query={query} collapsible groupLeading={typeControls?{types:typeControls}:undefined} {...props}/>
  <div className="dock-nonlayout-controls" inert={layout.editing}>{trailing}</div>
  <div className="dock-rail-footer"><div className="dock-history-controls" inert={layout.editing}>{leading}</div><button disabled={layout.editing} onClick={()=>onTool('select')} aria-pressed={tool==='select'} title="选择工具 V"><Icon name="select"/>选择</button><button onClick={onRemove} disabled={layout.editing||!canRemove}><Icon name="trash"/>删除所选</button></div>
 </aside>;
}
