import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {correctSimulationLayerGapInput,DEFAULT_SIMULATION_LAYER_GAP_PREFERENCE,MAX_SIMULATION_LAYER_GAP,parseSimulationLayerGapInput,simulationLayerGapPreferences} from '../app/simulationLayerGap';
import './SimulationLayerGapControl.css';

export function useSimulationLayerGap() {
  const preference=useSyncExternalStore(simulationLayerGapPreferences.subscribe,simulationLayerGapPreferences.getSnapshot,()=>DEFAULT_SIMULATION_LAYER_GAP_PREFERENCE);
  return {...preference,setMultiplier:simulationLayerGapPreferences.set};
}

export default function SimulationLayerGapControl({multiplier,onChange,error,saveError}:{multiplier:number;onChange:(value:number)=>void;error?:string;saveError?:string}) {
  const [draft,setDraft]=useState(String(multiplier)),id=useId(),helpId=useId(),lastSent=useRef(multiplier);
  useEffect(()=>{if(lastSent.current!==multiplier)setDraft(String(multiplier));lastSent.current=multiplier;},[multiplier]);
  const change=(value:number)=>{lastSent.current=value;onChange(value);};
  const commit=()=>{
    const value=correctSimulationLayerGapInput(draft,multiplier);
    setDraft(String(value));if(value!==multiplier||saveError)change(value);
  };
  const choose=(value:number)=>{setDraft(String(value));change(value);};
  const message=error||saveError;
  return <div className="sim-layer-gap-control">
    <div className="sim-layer-gap-settings">
      <label htmlFor={id}>纸层间距</label>
      <div className="sim-layer-gap-number"><input id={id} aria-label="纸层间距倍数" aria-describedby={helpId} type="number" min="0" max={MAX_SIMULATION_LAYER_GAP} step="any" value={draft} onChange={event=>{const text=event.target.value;setDraft(text);const value=parseSimulationLayerGapInput(text);if(value!==null&&value!==multiplier)change(value);}} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit();}}}/><span aria-hidden="true">×</span></div>
      <div className="sim-layer-gap-presets" role="group" aria-label="纸层间距快捷倍率">{[0,1,10,100].map(value=><button key={value} type="button" aria-label={value===0?'关闭纸层间距':`纸层间距 ${value} 倍`} aria-pressed={multiplier===value} onClick={()=>choose(value)}>{value===0?'关闭':`${value}×`}</button>)}</div>
      <button type="button" className="sim-layer-gap-reset" onClick={()=>choose(1)} aria-label="恢复默认纸层间距">恢复默认</button>
    </div>
    <p id={helpId} className={'sim-layer-gap-help'+(message?' is-error':'')} role={message?'status':undefined}>{message||'仅在 100% 平折稳定后生效 · 0 关闭，1 为默认'}</p>
  </div>;
}
