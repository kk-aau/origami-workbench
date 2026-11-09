import {diagramCalloutConnectors} from './diagramCallouts';

export const CALLOUT_MIME='application/x-zhezhi-diagram-callout';
export type DiagramCalloutSymbolType='paper'|'cp';
export interface DiagramCalloutSymbolEntry {
  type:DiagramCalloutSymbolType;label:string;group:'视图与方向';keywords:string;preview:string;
}
export function isDiagramCalloutSymbolType(value:unknown):value is DiagramCalloutSymbolType{return value==='paper'||value==='cp';}

/** Palette artwork uses the actual circle tangent geometry. No project,
 * CP document, CAD block or annotation kind is created by these entries. */
export function diagramCalloutSymbolPreview(type:DiagramCalloutSymbolType):string {
  if(type==='cp'){
    return `<g data-diagram-callout-symbol-preview="cp" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="-32" cy="0" r="9" fill="white"/><circle cx="14" cy="-24" r="20" fill="white"/><circle cx="14" cy="24" r="20" fill="white"/><g data-callout-preview-role="before"><path d="M -6 -24 H 34" stroke="#315ebe" stroke-dasharray="3 2"/><circle cx="14" cy="-24" r="20"/></g><g data-callout-preview-role="after"><path d="M -6 24 H 34" stroke="#315ebe" stroke-dasharray="3 2"/><path d="M -0.142135624 9.857864376 L 28.142135624 38.142135624" stroke="#b23d42"/><circle cx="14" cy="24" r="20"/></g><circle cx="-32" cy="0" r="9"/></g>`;
  }
  const source={kind:'paper' as const,center:[-29,23] as [number,number],radius:11},target={center:[17,-8] as [number,number],radius:27};
  const connectors=diagramCalloutConnectors({id:'palette',source,target}).map(([a,b])=>`<path d="M ${a.join(' ')} L ${b.join(' ')}"/>`).join('');
  const contents='<path d="M 17 -35 A 27 27 0 0 1 44 -8 H 17 Z" fill="#2f68c9" stroke="none"/><path d="M -2.091883092 -27.091883092 L 36.091883092 11.091883092 M 17 -35 V -8 H 44"/><path d="M -29 12 A 11 11 0 0 1 -18 23 H -29 Z" fill="#2f68c9" stroke="none"/><path d="M -36.778174593 15.221825407 L -21.221825407 30.778174593"/>';
  return `<g data-diagram-callout-symbol-preview="${type}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${connectors}<circle cx="-29" cy="23" r="11" fill="white"/><circle cx="17" cy="-8" r="27" fill="white"/>${contents}<circle cx="-29" cy="23" r="11"/><circle cx="17" cy="-8" r="27"/></g>`;
}

export const DIAGRAM_CALLOUT_SYMBOLS:readonly DiagramCalloutSymbolEntry[]=[
  {type:'paper',label:'局部放大框',group:'视图与方向',keywords:'纸面 双圆 圆框 放大 细节 paper',preview:diagramCalloutSymbolPreview('paper')},
  {type:'cp',label:'CP结构放大框',group:'视图与方向',keywords:'CP 结构 三圆 圆框 折痕 放大 操作前 操作后 前后对照 双图 同一区域 比较 before after comparison',preview:diagramCalloutSymbolPreview('cp')},
];
