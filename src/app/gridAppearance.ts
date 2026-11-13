import {preferenceStorage} from './preferenceStorage';
import {DEFAULT_GRID_DIVISIONS,GRID_MIN,GRID_MAX} from './gridControls';
import {validateGridRotation,type GridPattern} from './gridGeometry';
export interface GridAppearance {gridColor:string;diagonalColor:string;lineWidth:number;defaultDivisions:number;minGridPixelSize:number;pattern?:GridPattern;squareRotation?:number}
export const GRID_APPEARANCE_KEY='zhezhi.grid-appearance.v1';
export const defaultGridAppearance=():GridAppearance=>({gridColor:'#d9e1d6',diagonalColor:'#e7ece3',lineWidth:.7,defaultDivisions:DEFAULT_GRID_DIVISIONS,minGridPixelSize:3,pattern:'square',squareRotation:0});
const color=(value:unknown)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function validateGridAppearance(value:unknown):GridAppearance{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('网格外观设置格式无效。');
  const v=value as Record<string,unknown>;
  if(!color(v.gridColor)||!color(v.diagonalColor))throw new Error('网格颜色须为六位十六进制颜色。');
  if(typeof v.lineWidth!=='number'||!Number.isFinite(v.lineWidth)||v.lineWidth<.1||v.lineWidth>4)throw new Error('网格线宽须为 0.1—4 像素。');
  const defaultDivisions=!Object.hasOwn(v,'defaultDivisions')?defaultGridAppearance().defaultDivisions:typeof v.defaultDivisions==='number'?v.defaultDivisions:NaN;
  if(!Number.isInteger(defaultDivisions)||defaultDivisions<GRID_MIN||defaultDivisions>GRID_MAX)throw new Error(`默认网格等分须为 ${GRID_MIN}—${GRID_MAX} 的整数。`);
  const minGridPixelSize=!Object.hasOwn(v,'minGridPixelSize')?defaultGridAppearance().minGridPixelSize:typeof v.minGridPixelSize==='number'?v.minGridPixelSize:NaN;
  if(!Number.isFinite(minGridPixelSize)||minGridPixelSize<1||minGridPixelSize>20)throw new Error('网格最小屏幕间距须为 1—20 像素。');
  const pattern=Object.hasOwn(v,'pattern')?v.pattern:'square';
  if(pattern!=='square'&&pattern!=='triangular')throw new Error('网格格式须为方格或正三角。');
  const squareRotation=Object.hasOwn(v,'squareRotation')?validateGridRotation(v.squareRotation):0;
  // Custom angles were withdrawn; importing that short-lived preference must
  // retain the other appearance settings without restoring an angled grid.
  return {gridColor:v.gridColor as string,diagonalColor:v.diagonalColor as string,lineWidth:v.lineWidth,defaultDivisions,minGridPixelSize,pattern,squareRotation};
}
export function readGridAppearance(storage?:Pick<Storage,'getItem'>):GridAppearance{
  try{const raw=(storage??preferenceStorage).getItem(GRID_APPEARANCE_KEY);if(!raw)return defaultGridAppearance();const v=JSON.parse(raw);if(v.version!==1)throw Error('version');return validateGridAppearance(v.settings);}catch{return defaultGridAppearance();}
}
export function saveGridAppearance(value:GridAppearance,storage:Pick<Storage,'setItem'>=preferenceStorage){storage.setItem(GRID_APPEARANCE_KEY,JSON.stringify({version:1,settings:validateGridAppearance(value)}));}
