import {useEffect,useState} from 'react';
import type {FlatLayerPreference} from '../core/types';

export default function DiagramRelativeLayerControls({faceCount,selectedFace,side,required,disabled,onChange}:{
  faceCount:number;selectedFace?:number;side:'front'|'back';required:FlatLayerPreference[];disabled:boolean;onChange:(required:FlatLayerPreference[])=>void;
}) {
  const [above,setAbove]=useState(selectedFace??0),[below,setBelow]=useState(selectedFace===1?0:1);
  useEffect(()=>{if(selectedFace!==undefined)setAbove(selectedFace);},[selectedFace]);
  const valid=above!==below&&above>=0&&below>=0&&above<faceCount&&below<faceCount;
  const add=()=>{
    if(disabled||!valid)return;
    const relation=side==='front'?{above,below}:{above:below,below:above};
    onChange([...required.filter(row=>!([above,below].includes(row.above)&&[above,below].includes(row.below))),relation]);
  };
  return <div className="diagram-relative-layers" role="group" aria-label="指定两纸面上下关系">
    <strong>指定上下关系</strong>
    <p>按当前视角选择。关系随纸面保存，翻面后上下相反。</p>
    <div className="diagram-relative-layers-fields">
      {([{label:'上方纸面',value:above,set:setAbove},{label:'下方纸面',value:below,set:setBelow}]).map(({label,value,set})=><label key={label}>{label}<select aria-label={label} disabled={disabled} value={value} onChange={event=>set(Number(event.target.value))}>{Array.from({length:faceCount},(_,face)=><option key={face} value={face}>F{face+1}</option>)}</select></label>)}
    </div>
    <button type="button" disabled={disabled||!valid} onClick={add}>应用上下关系</button>
    {!valid&&<p>请选择两个不同的纸面。</p>}
    {required.length>0&&<ul aria-label="已保存的上下关系">{required.map((row,index)=>{
      const upper=side==='front'?row.above:row.below,lower=side==='front'?row.below:row.above;
      return <li key={`${row.below}:${row.above}`}><span>F{upper+1} 在 F{lower+1} 上方</span><button type="button" disabled={disabled} aria-label={`移除 F${upper+1} 在 F${lower+1} 上方的关系`} onClick={()=>onChange(required.filter((_,i)=>i!==index))}>移除</button></li>;
    })}</ul>}
    <p>仅适用于重叠纸面。求解通过后应用；无解时保留当前图示。</p>
  </div>;
}
