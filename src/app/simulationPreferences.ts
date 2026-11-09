import {preferenceStorage} from './preferenceStorage';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS,normalizeSimulationSolverSettings,type SimulationSolverSettings} from '../engine/simSettings';
import {DEFAULT_SIMULATION_DISPLAY_OPTIONS,normalizeSimulationDisplayOptions,type SimulationDisplayOptions,type SimulationDisplayMode,type SimulationCameraPreset,type SimulationCreaseStyle} from '../engine/simDisplay';
import {DEFAULT_SIM_TARGET_ANIMATION_STEPS,validateSimTargetAnimationSteps,type SimTargetAnimationStep} from '../engine/simTargetAnimation';

export const SIMULATION_PREFERENCES_KEY='zhezhi.simulation-preferences.v1';

export interface SimulationPreferences {
  solver:SimulationSolverSettings;
  display:SimulationDisplayOptions;
  mode:SimulationDisplayMode;
  creaseStyle:SimulationCreaseStyle;
  camera:SimulationCameraPreset|'free';
  front:string;
  back:string;
  speed:.25|.5|1|2;
  loop:boolean;
  animation:SimTargetAnimationStep[];
  pngScale:1|2|4;
  collision:boolean;
}

export function defaultSimulationPreferences():SimulationPreferences {
  return {
    solver:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},display:{...DEFAULT_SIMULATION_DISPLAY_OPTIONS},
    mode:'paper',creaseStyle:'assignment',camera:'isometric',front:'#faf4e0',back:'#7fa78f',
    speed:1,loop:false,animation:validateSimTargetAnimationSteps(DEFAULT_SIM_TARGET_ANIMATION_STEPS),pngScale:1,collision:false,
  };
}

const preferenceKeys=['solver','display','mode','creaseStyle','camera','front','back','speed','loop','animation','pngScale','collision'] as const;
const solverKeys=Object.keys(DEFAULT_SIMULATION_SOLVER_SETTINGS);
const displayKeys=Object.keys(DEFAULT_SIMULATION_DISPLAY_OPTIONS);
const modes:readonly unknown[]=['paper','wireframe','xray','strain','normals'];
const cameras:readonly unknown[]=['front','back','left','right','top','bottom','isometric','free'];
const colorPattern=/^#[0-9a-f]{6}$/i;

function onlyKeys(value:unknown,keys:readonly string[]):value is Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return (prototype===Object.prototype||prototype===null)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&keys.includes(key));
}

/** Missing top-level fields inherit defaults; any unknown or malformed supplied value rejects the record. */
export function normalizeSimulationPreferences(value:unknown):SimulationPreferences|null {
  try{
    if(!onlyKeys(value,preferenceKeys))return null;
    const next=defaultSimulationPreferences();
    if(Object.hasOwn(value,'solver')){
      if(!onlyKeys(value.solver,solverKeys))return null;
      const solver=normalizeSimulationSolverSettings(value.solver);if(!solver)return null;next.solver=solver;
    }
    if(Object.hasOwn(value,'display')){
      if(!onlyKeys(value.display,displayKeys))return null;
      const display=normalizeSimulationDisplayOptions(value.display);if(!display)return null;next.display=display;
    }
    if(Object.hasOwn(value,'mode')){if(!modes.includes(value.mode))return null;next.mode=value.mode as SimulationDisplayMode;}
    if(Object.hasOwn(value,'creaseStyle')){if(value.creaseStyle!=='assignment'&&value.creaseStyle!=='crease'&&value.creaseStyle!=='diagram')return null;next.creaseStyle=value.creaseStyle;}
    if(Object.hasOwn(value,'camera')){if(!cameras.includes(value.camera))return null;next.camera=value.camera as SimulationCameraPreset|'free';}
    for(const key of ['front','back'] as const){
      if(Object.hasOwn(value,key)){const color=value[key];if(typeof color!=='string'||!colorPattern.test(color))return null;next[key]=color.toLowerCase();}
    }
    if(Object.hasOwn(value,'speed')){if(value.speed!==.25&&value.speed!==.5&&value.speed!==1&&value.speed!==2)return null;next.speed=value.speed;}
    if(Object.hasOwn(value,'loop')){if(typeof value.loop!=='boolean')return null;next.loop=value.loop;}
    if(Object.hasOwn(value,'collision')){if(typeof value.collision!=='boolean')return null;next.collision=value.collision;}
    if(Object.hasOwn(value,'pngScale')){if(value.pngScale!==1&&value.pngScale!==2&&value.pngScale!==4)return null;next.pngScale=value.pngScale;}
    if(Object.hasOwn(value,'animation')){
      if(!Array.isArray(value.animation)||Array.from(value.animation).some(step=>!onlyKeys(step,step?.kind==='fold'?['id','kind','target','duration']:['id','kind','duration'])))return null;
      next.animation=validateSimTargetAnimationSteps(value.animation);
    }
    return next;
  }catch{return null;}
}

/** Read-only fallback preserves unknown versions and damaged records for later recovery. */
export function readSimulationPreferences(storage:Pick<Storage,'getItem'>=preferenceStorage):SimulationPreferences {
  try{
    const saved:unknown=JSON.parse(storage.getItem(SIMULATION_PREFERENCES_KEY)??'null');
    if(!onlyKeys(saved,['version','preferences'])||saved.version!==1||!Object.hasOwn(saved,'preferences'))return defaultSimulationPreferences();
    return normalizeSimulationPreferences(saved.preferences)??defaultSimulationPreferences();
  }catch{return defaultSimulationPreferences();}
}

/** Validation and write errors propagate so the UI can retain its preview and explain failed persistence. */
export function saveSimulationPreferences(preferences:SimulationPreferences,storage:Pick<Storage,'setItem'>=preferenceStorage):void {
  const normalized=normalizeSimulationPreferences(preferences);
  if(!normalized)throw new Error('模拟偏好设置无效，未保存。');
  storage.setItem(SIMULATION_PREFERENCES_KEY,JSON.stringify({version:1,preferences:normalized}));
}
