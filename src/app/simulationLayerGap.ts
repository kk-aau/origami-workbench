import {preferenceStorage} from './preferenceStorage';

export const SIMULATION_LAYER_GAP_KEY='zhezhi.simulation-layer-gap.v1';
export const DEFAULT_SIMULATION_LAYER_GAP=1;
export const MAX_SIMULATION_LAYER_GAP=1000;
type GapStorage=Pick<Storage,'getItem'|'setItem'>;
const DECIMAL=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function validateSimulationLayerGap(value:unknown):number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>MAX_SIMULATION_LAYER_GAP)throw Error('纸层间距请输入 0 至 1000 之间的数值。');
  return value===0?0:value;
}

/** Empty or incomplete edits are not commands. */
export function parseSimulationLayerGapInput(text:string):number|null {
  const value=text.trim();
  if(!DECIMAL.test(value))return null;
  try{return validateSimulationLayerGap(Number(value));}catch{return null;}
}

export function correctSimulationLayerGapInput(text:string,fallback:number):number {
  const value=text.trim(),number=DECIMAL.test(value)?Number(value):NaN;
  return Number.isFinite(number)?Math.min(MAX_SIMULATION_LAYER_GAP,Math.max(0,number)):validateSimulationLayerGap(fallback);
}

export function readSimulationLayerGap(storage:Pick<Storage,'getItem'>=preferenceStorage):number {
  try{
    const saved=JSON.parse(storage.getItem(SIMULATION_LAYER_GAP_KEY)??'null');
    return saved?.version===1?validateSimulationLayerGap(saved.multiplier):DEFAULT_SIMULATION_LAYER_GAP;
  }catch{return DEFAULT_SIMULATION_LAYER_GAP;}
}

export function saveSimulationLayerGap(multiplier:number,storage:Pick<Storage,'setItem'>=preferenceStorage):void {
  storage.setItem(SIMULATION_LAYER_GAP_KEY,JSON.stringify({version:1,multiplier:validateSimulationLayerGap(multiplier)}));
}

export interface SimulationLayerGapPreference {multiplier:number;saveError?:string}
export const DEFAULT_SIMULATION_LAYER_GAP_PREFERENCE:SimulationLayerGapPreference={multiplier:DEFAULT_SIMULATION_LAYER_GAP};

/** Both simulation views share one setting; failed disk writes retain the current preview. */
export function createSimulationLayerGapPreferenceStore(storage:GapStorage=preferenceStorage) {
  let snapshot:SimulationLayerGapPreference|undefined;
  const listeners=new Set<()=>void>();
  const notify=(next:SimulationLayerGapPreference)=>{
    if(snapshot?.multiplier===next.multiplier&&snapshot?.saveError===next.saveError)return;
    snapshot=next;for(const listener of listeners)listener();
  };
  const refresh=()=>notify({multiplier:readSimulationLayerGap(storage)});
  const storageChanged=(event:StorageEvent)=>{if(event.key===SIMULATION_LAYER_GAP_KEY||event.key===null)refresh();};
  return {
    getSnapshot:()=>snapshot??(snapshot={multiplier:readSimulationLayerGap(storage)}),
    subscribe:(listener:()=>void)=>{
      if(!listeners.size&&typeof window!=='undefined')window.addEventListener('storage',storageChanged);
      listeners.add(listener);
      return()=>{listeners.delete(listener);if(!listeners.size&&typeof window!=='undefined')window.removeEventListener('storage',storageChanged);};
    },
    set:(value:number)=>{
      const multiplier=validateSimulationLayerGap(value);let saveError:string|undefined;
      try{saveSimulationLayerGap(multiplier,storage);}catch{saveError='间距已调整，但暂未保存；请检查保存目录后重试。';}
      notify(saveError?{multiplier,saveError}:{multiplier});
    },
    refresh,
  };
}

export const simulationLayerGapPreferences=createSimulationLayerGapPreferenceStore();
