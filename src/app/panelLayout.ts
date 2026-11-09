import {preferenceStorage} from './preferenceStorage';
export const PANEL_KEY='zhezhi-panel-layout-v1';
export const DEFAULT_PANELS={left:246,right:252};
export const TOOL_PANEL_MAX=560;
export function panelWidths(left:number,right:number,viewport:number,showTools=true){
  const width=Number.isFinite(viewport)?Math.max(800,viewport):1280;
  const r=Math.max(236,Math.min(440,Number.isFinite(right)?right:DEFAULT_PANELS.right,width-352-(showTools?192:0)-16));
  const l=Math.max(192,Math.min(TOOL_PANEL_MAX,Number.isFinite(left)?left:DEFAULT_PANELS.left,width-r-352-16));
  return {left:l,right:r};
}
export function readPanels(storage:Pick<Storage,'getItem'>=preferenceStorage){try{const data=JSON.parse(storage.getItem(PANEL_KEY)||'null');if(data&&typeof data.left==='number'&&typeof data.right==='number'){if(data.left===260&&data.right===284||data.left===400&&data.right===252)return {...DEFAULT_PANELS};return panelWidths(data.left,data.right,2000);}}catch{}return {...DEFAULT_PANELS};}
