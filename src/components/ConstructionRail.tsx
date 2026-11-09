import type {DockToolProps} from './DockToolGroup';
import CustomToolGroups,{type ToolLayoutActions} from './CustomToolGroups';
import ToolLayoutControls from './ToolLayoutControls';
import type {ToolLayoutController} from './useToolLayout';
export default function ConstructionRail({layout,actions,...props}:DockToolProps&{layout:ToolLayoutController;actions:ToolLayoutActions}){
 if(!layout.editing&&!layout.template.groups.some(group=>group.side==='right'))return null;
 return <div className="construction-rail" aria-label="右侧构造工具"><ToolLayoutControls layout={layout} side="right"/><CustomToolGroups layout={layout} side="right" actions={actions} {...props}/></div>;
}
