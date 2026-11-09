import {preferenceStorage} from './preferenceStorage';
import {MARK_COLOR} from './markTools';
export const MARK_COLORS={orange:{name:'橙色',value:MARK_COLOR},yellow:{name:'黄色',value:'#c6a414'}} as const;
export type MarkColor=keyof typeof MARK_COLORS;
export const MARK_COLOR_KEY='zhezhi.mark-color.v1';
export function validateMarkColor(value:unknown):MarkColor{
 if(value!=='orange'&&value!=='yellow')throw Error('标记颜色须为橙色或黄色。');
 return value;
}
export function readMarkColor(storage?:Pick<Storage,'getItem'>):MarkColor{
 try{const raw=(storage??preferenceStorage).getItem(MARK_COLOR_KEY);if(!raw)return 'orange';const data=JSON.parse(raw);if(data.version!==1)throw Error('version');return validateMarkColor(data.color);}catch{return 'orange';}
}
export function saveMarkColor(value:MarkColor,storage:Pick<Storage,'setItem'>=preferenceStorage){storage.setItem(MARK_COLOR_KEY,JSON.stringify({version:1,color:validateMarkColor(value)}));}
