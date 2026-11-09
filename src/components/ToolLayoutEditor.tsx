import type {DockToolProps} from './DockToolGroup';
import type {ToolLayoutController} from './useToolLayout';
import CustomToolGroups,{layoutItemName,type ToolLayoutActions} from './CustomToolGroups';
import {MAX_TOOL_LAYOUT_TEMPLATES} from '../app/toolLayoutPreferences';
import './toolLayoutEditor.css';

export default function ToolLayoutEditor({layout,actions,...props}:DockToolProps&{layout:ToolLayoutController;actions:ToolLayoutActions}){
 const {template,drag}=layout;
 const movingName=drag?.kind==='group'?template.groups.find(group=>group.id===drag.id)?.name:drag?layoutItemName(drag.id):'';
 return <section className="tool-layout-editor" aria-label="编辑工具排版">
  <header className="tool-layout-editor-header">
   <div className="tool-layout-editor-heading"><h1>编辑工具排版</h1><span className="tool-layout-editor-template"><span>当前模板</span><strong>{template.name}</strong></span><button className="tool-layout-create-template" type="button" disabled={layout.fileBusy||layout.preferences.templates.length>=MAX_TOOL_LAYOUT_TEMPLATES} onClick={layout.createTemplate}>新建排版</button></div>
   <p>将中间工具拖到左侧或右侧；从侧栏拖回中间可收回。每个工具只保留一处。</p>
  </header>
  <div className="tool-layout-editor-content">
   <div className="tool-layout-editor-columns">
    <section className="tool-layout-editor-column" aria-label="未分配工具">
     <header className="tool-layout-editor-column-heading"><h2>待放置工具</h2><span>{template.unassigned.length} 个工具</span></header>
     <CustomToolGroups {...props} layout={layout} side="pool" actions={actions} surface="canvas"/>
    </section>
   </div>
  </div>
  <footer className="tool-layout-editor-footer">
   <p role="status" aria-live="polite">{drag?`正在移动「${movingName}」，拖到目标位置松开。`:'新建时左侧保留默认分类，工具全部在中间；可拖入分类，也可点击工具选择放置位置。'}</p>
   <div className="tool-layout-editor-actions"><button type="button" disabled={layout.fileBusy} onClick={layout.cancel}>取消</button><button type="button" className="primary" disabled={layout.fileBusy} onClick={layout.save}>保存排版</button></div>
  </footer>
  {layout.error&&<p className="tool-layout-editor-error" role="alert">{layout.error}</p>}
 </section>;
}
