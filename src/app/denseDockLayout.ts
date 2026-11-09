import type {DockGroup} from './orieditaToolLayout';

export function denseDockLayout(groups:DockGroup[],width:number,height:number,requestedColumns=0){
  const columns=requestedColumns||Math.max(4,Math.min(8,Math.floor((width+2)/46)));
  const rows=groups.reduce((n,g)=>n+Math.ceil(g.tools.length/columns),0);
  const headingHeight=20;
  const fullRow=Math.floor((height-groups.length*headingHeight)/Math.max(1,rows))-2;
  const showHeadings=fullRow>=22;
  const rowHeight=Math.max(1,Math.min(36,showHeadings?fullRow:Math.floor((height-groups.length*2)/Math.max(1,rows))-2));
  const showLabels=rowHeight>=22&&(width-(columns-1)*2)/columns>=42;
  return {columns,rowHeight,showHeadings,showLabels,iconSize:Math.max(1,Math.min(18,rowHeight-(showLabels?14:4)))};
}
