import {validateGridAppearance,type GridAppearance} from './gridAppearance';
import {validateTheme,type Theme} from './theme';

export const WORKBENCH_GRID_KEY='zhezhi.gridAppearance';
export const WORKBENCH_THEME_KEY='zhezhi.theme';

export interface WorkbenchPreferences {gridAppearance:GridAppearance;theme:Theme}

export function previewWorkbenchPreferences(config:Record<string,unknown>,current:WorkbenchPreferences){
  let gridAppearance=current.gridAppearance,theme=current.theme;
  const recognized:string[]=[],ignored:string[]=[],issues:string[]=[];
  if(Object.hasOwn(config,WORKBENCH_GRID_KEY)){
    try{gridAppearance=validateGridAppearance(config[WORKBENCH_GRID_KEY]);recognized.push(WORKBENCH_GRID_KEY);}catch(e){issues.push(`${WORKBENCH_GRID_KEY}：${e instanceof Error?e.message:String(e)}`);}
  }
  if(Object.hasOwn(config,WORKBENCH_THEME_KEY)){
    try{theme=validateTheme(config[WORKBENCH_THEME_KEY]);recognized.push(WORKBENCH_THEME_KEY);}catch(e){issues.push(`${WORKBENCH_THEME_KEY}：${e instanceof Error?e.message:String(e)}`);}
  }
  ignored.push(...Object.keys(config).filter(key=>key!==WORKBENCH_GRID_KEY&&key!==WORKBENCH_THEME_KEY));
  return {settings:issues.length?null:{gridAppearance,theme},recognized,ignored,issues};
}
