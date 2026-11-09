import {useState} from 'react';
import {createPortal} from 'react-dom';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import type {TessParams} from '../app/tessellation';
import {readTwoUniformPatchSpec,twoUniformPatchParams,twoUniformPatchPreset,
  type TwoUniformPatchNumber,type TwoUniformPatchSpec} from '../app/twoUniformPatchSource';
import {TWO_UNIFORM_PATCH_CATALOG} from '../app/twoUniformPatchCatalog';

type CustomParams=Extract<TessParams,{family:'custom'}>;

export default function TwoUniformPatchControls({params,onChange}:{
  params:CustomParams;onChange:(next:TessParams)=>void;
}){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const spec=readTwoUniformPatchSpec(params.twoUniformPatch);
  const apply=(next:TwoUniformPatchSpec)=>{
    const valid=readTwoUniformPatchSpec(next);
    if(!valid){setError('格点须为 −64～64 内升序整数，展开后最多 192 片。');return;}
    setError('');onChange(twoUniformPatchParams(valid,params.paper));
  };
  const begin=()=>{apply(twoUniformPatchPreset());setOpen(true);};
  if(!spec)return <button className="outline" aria-label="选择原版双均匀补片 1 至 20"
    onClick={begin}>双均匀补片</button>;
  const setRange=(axis:'range1'|'range2',index:0|1,value:number)=>{
    const range=[...spec[axis]] as [number,number];range[index]=value;
    apply({...spec,[axis]:range});
  };
  const saved=spec.range1[0]===0&&spec.range1[1]===1&&
    spec.range2[0]===0&&spec.range2[1]===1;
  return <>
    <button className="outline" aria-label="编辑原版双均匀补片"
      title={`TwoUniformPatch[${spec.number}] · ${spec.range1.join('…')} × ${spec.range2.join('…')}`}
      onClick={()=>setOpen(true)}>双均匀[{spec.number}]</button>
    {open&&createPortal(<TessDialog title={`TwoUniformPatch[${spec.number}] · 原版补片`}
      onClose={()=>setOpen(false)}>
      <p>原版 20 项显式 JoinTiling 来源；当前 {TWO_UNIFORM_PATCH_CATALOG[spec.number].sides.length} 片，保留面序和两条具名格矢。</p>
      <label className="select-field">原版来源编号
        <select aria-label="TwoUniformPatch 来源编号" value={spec.number}
          onChange={event=>apply(twoUniformPatchPreset(Number(event.target.value) as TwoUniformPatchNumber))}>
          {Array.from({length:20},(_,i)=>(i+1) as TwoUniformPatchNumber).map(number=>
            <option key={number} value={number}>{number} · {TWO_UNIFORM_PATCH_CATALOG[number].sides.length} 片 · In[{TWO_UNIFORM_PATCH_CATALOG[number].notebookIn[0]}]</option>)}
        </select>
      </label>
      <div className="tess-pair">
        <TessNumberField label="第一格矢起点" value={spec.range1[0]} min={-64} max={64}
          onChange={value=>setRange('range1',0,value)}/>
        <TessNumberField label="第一格矢终点" value={spec.range1[1]} min={-64} max={64}
          onChange={value=>setRange('range1',1,value)}/>
      </div>
      <div className="tess-pair">
        <TessNumberField label="第二格矢起点" value={spec.range2[0]} min={-64} max={64}
          onChange={value=>setRange('range2',0,value)}/>
        <TessNumberField label="第二格矢终点" value={spec.range2[1]} min={-64} max={64}
          onChange={value=>setRange('range2',1,value)}/>
      </div>
      {error&&<p role="alert">{error}</p>}
      <p className="note">{saved?`当前为 In[${TWO_UNIFORM_PATCH_CATALOG[spec.number].notebookIn[2]}] 保存的 2×2 母结构排布。`:
        '当前按原版周期向量扩展格点；此范围不是保存的 2×2 例。'}
        原版没有此例的数值折痕或平折输出；这里仅生成具名来源和母结构。</p>
      <footer><button className="primary" onClick={()=>setOpen(false)}>完成参数编辑</button></footer>
    </TessDialog>,document.body)}
  </>;
}
