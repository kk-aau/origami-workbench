import {useState} from 'react';
import {createPortal} from 'react-dom';
import TessNumberField from './TessNumberField';
import {changeTessParams,type TessParams} from '../app/tessellation';
import GoldbergReferenceDialog from './GoldbergReferenceDialog';

type Params=Extract<TessParams,{family:'nonperiodic'}>;
export default function GoldbergControls({params,onChange}:{params:Params;onChange:(params:TessParams)=>void}){
  const original=params.goldbergVersion==='origamica',m=params.goldbergOrder??5,n=params.goldbergRings??2;
  const [referenceOpen,setReferenceOpen]=useState(false);
  const change=(patch:Record<string,unknown>)=>onChange(changeTessParams(params,patch));
  const version=(value:string)=>{
    if(value==='origamica'){change({goldbergVersion:'origamica',goldbergOrder:5,goldbergRings:2,goldbergOffset:0,goldbergOutput:'twist'});return;}
    const next={...params,goldbergVersion:'legacy' as const};
    delete next.goldbergOrder;delete next.goldbergRings;delete next.goldbergOffset;delete next.goldbergOutput;
    onChange(next);
  };
  return <>
    <div style={{display:'flex',alignItems:'center',gap:6,height:20}}>
      <label className="select-field" style={{flex:'1 1 auto',minWidth:0,margin:0}}>构造<select aria-label="Goldberg 构造" style={{width:108,minWidth:0,height:20,padding:'0 5px'}} value={original?'origamica':'legacy'} onChange={e=>version(e.target.value)}><option value="origamica">原版径向三角网</option><option value="legacy">旧版五重细分</option></select></label>
      {original&&<button className="text-button" style={{flex:'0 0 auto',whiteSpace:'nowrap',height:20,minHeight:20,padding:0}} aria-label="查看 Goldberg 数值参考" onClick={()=>setReferenceOpen(true)}>数值参考</button>}
    </div>
    {original?<>
      <div className="tess-pair"><TessNumberField label="旋转阶 m" value={m} min={3} max={16} step={1} onChange={value=>{const rings=Math.min(n,Math.floor(Math.sqrt(256/value)));change({goldbergOrder:value,goldbergRings:rings,goldbergOffset:value%2?0:Math.min(params.goldbergOffset??0,2*rings-1),goldbergOutput:value<5?'tiling':params.goldbergOutput});}}/><TessNumberField label="径向层 n" value={n} min={1} max={Math.floor(Math.sqrt(256/m))} step={1} onChange={value=>change({goldbergRings:value,goldbergOffset:Math.min(params.goldbergOffset??0,2*value-1)})}/></div>
      <div className="tess-pair tess-small-selects">{m%2===0?<TessNumberField label="上下偏移 o" value={params.goldbergOffset??0} min={0} max={2*n-1} step={1} onChange={value=>change({goldbergOffset:value})}/>:<span className="note">奇数阶无上下偏移</span>}<label className="select-field">输出<select aria-label="Goldberg 输出" value={params.goldbergOutput??'twist'} onChange={e=>change({goldbergOutput:e.target.value})}><option value="twist" disabled={m<5}>扭转折痕</option><option value="tiling">母结构排布</option></select></label></div>
      {referenceOpen&&createPortal(<GoldbergReferenceDialog order={m} rings={n} onClose={()=>setReferenceOpen(false)}/>,document.body)}
    </>:<TessNumberField label="旧版细分层数" value={params.depth} min={1} max={2} step={1} onChange={value=>change({depth:value})}/>}
  </>;
}
