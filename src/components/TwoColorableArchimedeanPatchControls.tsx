import {useState} from 'react';
import {createPortal} from 'react-dom';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import type {TessParams} from '../app/tessellation';
import {TWO_COLORABLE_ARCHIMEDEAN_CATALOG,readTwoColorableArchimedeanSpec,
  twoColorableArchimedeanParams,twoColorableArchimedeanPreset,
  type TwoColorableArchimedeanNumber,type TwoColorableArchimedeanPreset,
  type TwoColorableArchimedeanSpec} from '../app/twoColorableArchimedeanPatchSource';
import {TWO_COLORABLE_OFFSET_DIAGNOSTICS,twoColorableOffsetCandidate,
  type TwoColorableOffsetCandidateNumber} from '../app/twoColorableOffsetCandidate';

type CustomParams=Extract<TessParams,{family:'custom'}>;
const PRESETS:[TwoColorableArchimedeanPreset,string][]=[
  ['mother','2×2 母结构 · In[3163]'],
  ['in3184-offset','单 patch 偏置 · In[3184]'],
  ['in3187-alt-pruned','40→16 Alt 裁剪 · In[3187]'],
  ['in3188-offset-pruned','40→16 偏置裁剪 · In[3188]'],
];

export default function TwoColorableArchimedeanPatchControls({params,onChange}:{
  params:CustomParams;onChange:(next:TessParams)=>void;
}){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const spec=readTwoColorableArchimedeanSpec(
    (params as CustomParams&{twoColorableArchimedeanPatch?:unknown}).twoColorableArchimedeanPatch);
  const apply=(next:TwoColorableArchimedeanSpec)=>{
    const valid=readTwoColorableArchimedeanSpec(next);
    if(!valid){setError('来源、奇偶或格矢范围无效；晶格展开最多 192 面。');return;}
    setError('');
    onChange(twoColorableArchimedeanParams(valid,params.paper));
  };
  const begin=()=>{apply(twoColorableArchimedeanPreset());setOpen(true);};
  if(!spec)return <button className="outline" aria-label="选择二色 ArchimedeanPatch 来源"
    onClick={begin}>二色阿基米德</button>;
  const row=TWO_COLORABLE_ARCHIMEDEAN_CATALOG.find(item=>item.number===spec.number)!;
  const candidate=spec.number===2?null:twoColorableOffsetCandidate(
    spec.number as TwoColorableOffsetCandidateNumber);
  const candidateFinding=spec.number===2?null:TWO_COLORABLE_OFFSET_DIAGNOSTICS[
    spec.number as TwoColorableOffsetCandidateNumber];
  const derivedSelected=spec.preset==='in3183-offset-derived';
  const setRange=(axis:'range1'|'range2',index:0|1,value:number)=>{
    if(spec.preset!=='mother')return;
    const range=[...spec[axis]] as [number,number];range[index]=value;
    apply({...spec,[axis]:range});
  };
  const savedMother=spec.preset==='mother'&&spec.range1[0]===0&&spec.range1[1]===1&&
    spec.range2[0]===0&&spec.range2[1]===1;
  const sourceNumber=(number:TwoColorableArchimedeanNumber)=>
    apply(twoColorableArchimedeanPreset(number));
  const sourcePreset=(preset:TwoColorableArchimedeanPreset)=>
    apply(twoColorableArchimedeanPreset(2,preset));
  return <>
    <button className="outline" aria-label="编辑二色 ArchimedeanPatch 来源"
      title={`TwoColorableArchimedeanPatch[${spec.number}] · parity ${spec.parity.join(',')} · ${spec.preset}`}
      onClick={()=>setOpen(true)}>二色阿基米德[{spec.number}]</button>
    {open&&createPortal(<TessDialog title="二色 ArchimedeanPatch" onClose={()=>setOpen(false)}>
      <p>Origamica 第 37 节独立的 TwoColorableArchimedeanPatch 来源；n=2 为两正方形。</p>
      <label className="select-field">原版二色来源编号
        <select aria-label="二色 ArchimedeanPatch 来源编号" value={spec.number}
          onChange={event=>sourceNumber(Number(event.target.value) as TwoColorableArchimedeanNumber)}>
          {TWO_COLORABLE_ARCHIMEDEAN_CATALOG.map(item=><option key={item.number} value={item.number}>
            {item.number} · {item.vertexType} · {item.sourceFaces} 个来源面
          </option>)}
        </select>
      </label>
      <p>逐来源片 parity：<strong>{row.parity.map(sign=>sign>0?'+':'−').join(' / ')}</strong></p>
      {spec.number===2&&<label className="select-field">保存样例
        <select aria-label="二色 n=2 保存样例" value={spec.preset}
          onChange={event=>sourcePreset(event.target.value as TwoColorableArchimedeanPreset)}>
          {PRESETS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select>
      </label>}
      {spec.preset==='mother'&&<>
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
      </>}
      {candidate&&candidateFinding&&<section aria-label={`二色 ${candidate.number} 偏置公式候选`}>
        <p><strong>In[3183] 偏置公式 · {candidate.number===8?'受限推演':'只读诊断'}</strong></p>
        <p className="note">原版没有 TwoColorableArchimedeanPatch[{candidate.number}] 的保存数值 CP Out；
          {derivedSelected?'当前工作区已选本地公式推演折痕。':'当前工作区仍是母结构。'}
          本地候选 w={candidate.width}、d=±{candidate.offsetMagnitude}，按 parity {candidate.parity.join(' / ')}；
          中心赋型 {candidate.centralTypes.map(types=>types.join('')).join(' / ')}。</p>
        {candidateFinding.cp?<p className="note">具名公式与通用 CP 一致：{candidateFinding.cp.join(' / ')} 顶点/边/面；
          几何、局部检查通过；平折几何可生成。整片层序：<strong>{candidateFinding.layers}</strong>。
          {candidateFinding.reason}</p>:<p className="note">{candidateFinding.reason}</p>}
        {candidate.number===8?<button className="outline"
          aria-label={derivedSelected?'返回二色 8 母结构':'选择二色 8 偏置公式推演折痕'}
          onClick={()=>apply(twoColorableArchimedeanPreset(8,
            derivedSelected?'mother':'in3183-offset-derived'))}>
          {derivedSelected?'返回 2×2 母结构':'选择此折痕 · 实时检查后采用'}
        </button>:<button disabled aria-label={`二色 ${candidate.number} 候选折痕不可采用`}>
          {candidateFinding.cp?'层序无解，禁采用折痕':'来源赋型不相容，禁采用折痕'}
        </button>}
      </section>}
      {error&&<p role="alert">{error}</p>}
      <p className="note">{spec.preset==='mother'
        ?savedMother?`当前为原版 2×2 二色母图 In[${row.notebookIn[1]}]。`
          :'当前按原版格矢扩展；此范围不是原版 2×2 保存例。'
        :spec.preset==='in3183-offset-derived'
          ?'In[3183]：双色 n=8 单补片偏置公式的本地推演；当前 CP 经独立平折几何与唯一层序检查。原版无该例保存数值 Out，工作区采用须以当前实时结果为准。'
        :spec.preset==='in3184-offset'
          ?'In[3184]：单个两方形来源 patch，w=0.2、d=±0.1、M4/M4。'
          :spec.preset==='in3187-alt-pruned'
            ?'In[3187]：w=0.2、α=30°、M4/V4；格点 40 片裁为 16 片。'
            :'In[3188]：w=0.2、d=±0.1001、M4/M4；格点 40 片裁为 16 片。'}
        {spec.preset==='mother'?'此入口只生成母结构。':
          spec.preset==='in3183-offset-derived'?'':'采用折痕前仍需工作区实时几何与层序检查。'}</p>
      <footer><button className="primary" onClick={()=>setOpen(false)}>完成参数编辑</button></footer>
    </TessDialog>,document.body)}
  </>;
}
