import type {DiagramDrawingTool} from '../components/DiagramDrawingCanvas';
import type {DiagramLineStyle,DiagramSymbolKind} from './diagramAnnotations';
import {SYMBOL_CATALOG} from './diagramSymbolCatalog';
import type {ToolCommand} from './toolCommands';

export type DiagramCommand=DiagramDrawingTool|`line:${DiagramLineStyle}`|`symbol:${DiagramSymbolKind}`|'copy-selection'|'clear-selection'|'delete-selection'|'action:fold'|'action:precrease';

const tools:readonly ToolCommand<DiagramDrawingTool>[]=[
  {tool:'line',name:'画折线',aliases:['L','LINE','折线']},
  {tool:'select',name:'选择',aliases:['V','SELECT']},
  {tool:'polyline',name:'连续折线',aliases:['PLINE','POLYLINE']},
  {tool:'pan',name:'平移视图',aliases:['P','PAN','H','平移']},
  {tool:'erase',name:'擦除',aliases:['E','ERASE','橡皮擦']},
  {tool:'mirror-copy',name:'镜像复制',aliases:['MI','MIRROR','镜像']},
  {tool:'parallel',name:'平行线',aliases:['PL','PARALLEL','平行']},
  {tool:'perpendicular',name:'垂线',aliases:['PER','PERP']},
  {tool:'bisector',name:'角平分线',aliases:['BI','BISECT','BISECTOR']},
  {tool:'trim',name:'修剪',aliases:['TR','TRIM','截断']},
  {tool:'extend',name:'延长',aliases:['EX','EXTEND']},
  {tool:'symbol',name:'折纸符号',aliases:['SY','SYMBOL','符号']},
  {tool:'vertex',name:'拖角',aliases:['VX','VERTEX','纸角']},
  {tool:'fixed',name:'固定侧',aliases:['FIX','FIXED']},
  {tool:'layer',name:'选择纸层',aliases:['LY','LAYER']},
  {tool:'ratio-point',name:'比例分点',aliases:['RA','RATIO']},
  {tool:'special-point',name:'特殊取点',aliases:['SP','SPECIAL']},
];

/** Only commands backed by this workspace's existing controls are offered. */
export const DIAGRAM_COMMANDS:readonly ToolCommand<DiagramCommand>[]=[
  ...tools,
  {tool:'line:valley',name:'谷折线',aliases:['MV','VALLEY','谷折']},
  {tool:'line:mountain',name:'峰折线',aliases:['MM','MOUNTAIN','山折','峰折']},
  {tool:'line:crease',name:'已有折痕',aliases:['MF','FLAT','EXISTING']},
  {tool:'line:auxiliary',name:'辅助线',aliases:['MA','AUX']},
  {tool:'line:boundary',name:'边界线',aliases:['MB','BOUNDARY','绘图边界']},
  {tool:'action:precrease',name:'预折后展开',aliases:['PFC','PRECREASE']},
  {tool:'action:fold',name:'本步折叠',aliases:['FOLD','FOLDSTEP']},
  {tool:'copy-selection',name:'复制选中',aliases:['CO','CP','COPY','复制']},
  {tool:'clear-selection',name:'取消选择',aliases:['U','UNSELECT','撤选']},
  {tool:'delete-selection',name:'删除选中',aliases:['DEL','DELETE']},
  ...SYMBOL_CATALOG.map(item=>({tool:`symbol:${item.kind}` as DiagramCommand,name:item.label,aliases:['S'+item.kind.toUpperCase(),...(item.kind==='rotate'?['旋转']:[])]})),
];

export function isDiagramDrawingCommand(command:DiagramCommand):command is DiagramDrawingTool {
  return tools.some(item=>item.tool===command);
}
