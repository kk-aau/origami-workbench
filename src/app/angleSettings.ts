import {preferenceStorage} from './preferenceStorage';
import {angleOffsets,type AngleSystem} from './angleSystem';

export interface AngleSettings {active:0|1|2|3;dividers:[number,number];abc:[number,number,number];def:[number,number,number]}
export const ANGLE_SETTINGS_KEY='zhezhi.angle-settings.v1';
export function defaultAngleSettings():AngleSettings{return{active:1,dividers:[12,8],abc:[40,60,80],def:[30,50,100]};}
export function activeAngleSystem(s:AngleSettings):AngleSystem{
  return s.active<2?{kind:'divided',divider:s.dividers[s.active===0?0:1]}:{kind:'custom',angles:s.active===2?s.abc:s.def};
}
/** Validate every group, including inactive groups, before accepting persisted preferences. */
export function validateAngleSettings(value:unknown):AngleSettings{
  if(!value||typeof value!=='object')throw new Error('角度设置格式无效。');
  const v=value as Record<string,unknown>;
  if(!Number.isInteger(v.active)||![0,1,2,3].includes(v.active as number))throw new Error('角度组无效。');
  for(const [key,length] of [['dividers',2],['abc',3],['def',3]] as const){
    if(!Array.isArray(v[key])||v[key].length!==length||!v[key].every(n=>typeof n==='number'&&Number.isFinite(n)))throw new Error('角度设置数值无效。');
  }
  const result:AngleSettings={active:v.active as AngleSettings['active'],dividers:[...(v.dividers as AngleSettings['dividers'])],abc:[...(v.abc as AngleSettings['abc'])],def:[...(v.def as AngleSettings['def'])]};
  result.dividers.forEach(divider=>angleOffsets({kind:'divided',divider}));
  for(const angles of [result.abc,result.def])angleOffsets({kind:'custom',angles});
  return result;
}
export function readAngleSettings(storage?:Pick<Storage,'getItem'>):AngleSettings{
  try{
    const raw=(storage??preferenceStorage).getItem(ANGLE_SETTINGS_KEY);if(!raw)return defaultAngleSettings();
    const value=JSON.parse(raw);if(value?.version!==1)return defaultAngleSettings();
    return validateAngleSettings(value.settings);
  }catch{return defaultAngleSettings();}
}
export function saveAngleSettings(value:AngleSettings,storage:Pick<Storage,'setItem'>=preferenceStorage):void{
  const settings=validateAngleSettings(value);
  storage.setItem(ANGLE_SETTINGS_KEY,JSON.stringify({version:1,settings}));
}
