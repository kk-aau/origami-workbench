import {useEffect,useState} from 'react';
import {readTessParams,type TessParams} from '../app/tessellation';
import {deepBowlIn4208CutParams,type ParaboloidalFlasherParams} from '../app/paraboloidalFlasherParams';
import FlasherP46ReadonlyDialog from './FlasherP46ReadonlyDialog';
import TessNumberField from './TessNumberField';

function FocalLengthField({value,onChange}:{value:number;onChange:(next:number)=>void}){
  const [text,setText]=useState(String(value)),[invalid,setInvalid]=useState(false);
  useEffect(()=>{setText(previous=>previous.trim()&&Number(previous)===value?previous:String(value));setInvalid(false);},[value]);
  const valid=(draft:string)=>draft.trim()!==''&&Number.isFinite(Number(draft))&&Number(draft)>=.1&&Number(draft)<=1e7;
  return <div className="tess-number"><label><span>焦距 f</span><input aria-label="焦距 f" type="number" min={.1} max={1e7} step="any" value={text} aria-invalid={invalid} title="0.1–10000000" onChange={event=>{const next=event.target.value;setText(next);setInvalid(false);if(valid(next))onChange(Number(next));}} onBlur={()=>setInvalid(!valid(text))} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setText(String(value));setInvalid(false);}if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/></label><input aria-label="焦距 f 滑条" title="焦距按对数刻度调整" type="range" min={-1} max={7} step={.01} value={Math.log10(value)} onChange={event=>onChange(Number((10**Number(event.target.value)).toPrecision(6)))}/>{invalid&&<small role="alert">0.1–10000000</small>}</div>;
}

export default function ParaboloidalFlasherControls({params,onChange}:{params:ParaboloidalFlasherParams;onChange:(next:TessParams)=>void}){
  const [showReadonly,setShowReadonly]=useState(false);
  const change=(patch:Partial<ParaboloidalFlasherParams>)=>{
    const next=readTessParams({...params,...patch});
    if(next)onChange(next);
  };
  return <>
    <div className="tess-pair">
      <TessNumberField label="环数 r" value={params.rings} min={1} max={2} step={1} onChange={rings=>change({rings})}/>
      <TessNumberField label="高度阶 h" value={params.heightOrder} min={1} max={3} step={1} onChange={heightOrder=>change({heightOrder})}/>
    </div>
    <div className="tess-pair">
      <TessNumberField label="旋转阶 m" value={params.rotationalOrder} min={3} max={8} step={1} onChange={rotationalOrder=>change({rotationalOrder})}/>
      <FocalLengthField value={params.focalLength} onChange={focalLength=>change({focalLength})}/>
    </div>
    <div className="tess-pair tess-small-selects">
      <TessNumberField label="径向间隔 dr" value={params.radialIncrement} min={0} max={.5} step={.005} onChange={radialIncrement=>change({radialIncrement})}/>
      <label className="select-field">对角折线<select aria-label="抛物面 Flasher 对角折线" title="X：原行列交替对角线；Y：默认对角线；Z：反向对角线" value={params.diagonal} onChange={event=>change({diagonal:event.target.value as 'X'|'Y'|'Z'})}><option value="X">X · 交替</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
    </div>
    <div className="tess-pair">
      <TessNumberField label="赋型阈值 °" value={params.minimumAngleDeg} min={0} max={180} step={.5} onChange={minimumAngleDeg=>change({minimumAngleDeg})}/>
      <TessNumberField label="剪后阈值 °" value={params.cutMinimumAngleDeg} min={0} max={180} step={.5} onChange={cutMinimumAngleDeg=>change({cutMinimumAngleDeg})}/>
    </div>
    <button type="button" className="text-button" aria-label="载入 In[4208] 深碗原参数与本地剪裁候选" onClick={()=>{
      const next=readTessParams(deepBowlIn4208CutParams());
      if(next)onChange(next);
    }}>深碗 In[4208] 原参数 + 本地剪裁 10°</button>
    <button type="button" className="text-button" aria-label="打开 In[4206] 未剪裁 DP/FF 只读示意" onClick={()=>setShowReadonly(true)}>
      高焦距未剪示意 · In[4206]</button>
    <p className="note">二维图为剪裁后的真实等距展开；三维显示折后形 FF。原版竖直投影 CP 不是可制造的二维展开。In[4208] 仅保存未剪裁 DP／FF；一键例的剪后 10° 阈值为本地选择，剪后拓扑不是原版保存结果。</p>
    {showReadonly&&<FlasherP46ReadonlyDialog initialVariant="highF" onClose={()=>setShowReadonly(false)}/>}
  </>;
}
