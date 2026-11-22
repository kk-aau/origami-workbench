import {preferenceStorage} from './preferenceStorage';

export function firstDrawingHint(workspace:'crease'|'diagram',message:string){
  const key='zhezhi.first-drawing-'+workspace+'.v1';
  try{
    if(preferenceStorage.getItem(key)==='seen')return message;
    preferenceStorage.setItem(key,'seen');
  }catch{/* The hint is still available if preferences cannot be persisted. */}
  return message+' 选择「线段」，点两端画线。Ctrl+Z 撤销，Ctrl+S 保存。';
}
