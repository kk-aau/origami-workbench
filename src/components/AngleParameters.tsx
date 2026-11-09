import {NumberField} from './Fields';
import MeasurementField from './MeasurementField';
import type {Measurements} from '../app/measurements';
import type {AngleSettings} from '../app/angleSettings';
export default function AngleParameters({value,onChange,measurements}:{value:AngleSettings;onChange:(value:AngleSettings)=>void;measurements:Measurements}){
  const group=value.active===2?'abc':'def';
  return <div className="construction-parameters" aria-label="共用角度设置">
    <label>角度组 <select aria-label="角度组" value={value.active} onChange={e=>onChange({...value,active:Number(e.target.value) as AngleSettings['active']})}>
      <option value={0}>等分 A · 180/{value.dividers[0]}</option><option value={1}>等分 B · 180/{value.dividers[1]}</option><option value={2}>自定义 ABC</option><option value={3}>自定义 DEF</option>
    </select></label>
    {value.active<2?<NumberField label="角度等分数" value={value.dividers[value.active===0?0:1]} min={2} max={360} step={1} onChange={n=>{const dividers:[number,number]=[...value.dividers];dividers[value.active===0?0:1]=n;onChange({...value,dividers});}}/>:value[group].map((n,i)=><MeasurementField measurements={measurements} key={group+i} label={'角 '+(group==='abc'?'ABC':'DEF')[i]} value={n} min={0} max={360} step={1} suffix="°" onChange={n=>{const angles:[number,number,number]=[...value[group]];angles[i]=n;onChange({...value,[group]:angles});}}/>)}
    <small>自定义角支持测量槽引用 · 提交时取值 · 修改后重新构造</small>
  </div>;
}
