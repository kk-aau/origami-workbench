import {useState} from 'react';
import {readRectangularPotParams,rectangularPotPanelLimit,type RectangularPotParams} from '../app/rectangularPotParams';
import type {TessParams} from '../app/tessellation';
import {matchRectangularPotSaved,rectangularPotSavedParams,type RectangularPotSavedCell} from '../app/rectangularPotSaved';
import TessNumberField from './TessNumberField';
import PotProfileEditor,{PotProfileSummary} from './PotProfileEditor';
import './radialPot.css';

export default function RectangularPotControls({params,onChange,onPreview,onCancelPreview}:{params:RectangularPotParams;onChange:(next:RectangularPotParams)=>void;onPreview?:(next:TessParams)=>void;onCancelPreview?:()=>void}){
  const [editing,setEditing]=useState(false),[error,setError]=useState('');
  const update=(patch:Partial<RectangularPotParams>)=>{
    const next=readRectangularPotParams({...params,...patch,...('asymmetry' in patch&&Math.abs(patch.asymmetry??0)!==1?{flatFlangeInset:undefined}:{})});
    if(next){onChange(next);setError('');}else setError('矩形壶体参数超出可用范围。');
  };
  const open=()=>{setError('');setEditing(true);};
  return <>
    <div className="tess-pair"><TessNumberField label="旋转扇区 m" value={params.sectors} min={3} max={16} step={1} onChange={sectors=>update({sectors,panels:params.panels===params.sectors?sectors:params.panels>params.sectors?params.panels:Math.min(params.panels,sectors)})}/><TessNumberField label="实际面板数" value={params.panels} min={1} max={rectangularPotPanelLimit(params.crossSection.length)} step={1} onChange={panels=>update({panels})}/></div>
    <div className="tess-pair"><button className="text-button" onClick={()=>update({panels:params.sectors+1})} disabled={params.sectors+1>rectangularPotPanelLimit(params.crossSection.length)}>再绕一瓣</button><button className="text-button" onClick={()=>update({panels:2*params.sectors})} disabled={2*params.sectors>rectangularPotPanelLimit(params.crossSection.length)}>两圈面板</button></div>
    <div className="tess-pair"><TessNumberField label="不对称度 ρ" value={params.asymmetry} min={-1} max={1} step={.05} onChange={asymmetry=>update({asymmetry})}/><TessNumberField label="法兰余量" value={params.flangeExcess} min={0} max={2} step={.05} onChange={flangeExcess=>update({flangeExcess})}/></div>
    <div className="tess-pair"><TessNumberField label="接缝半角 δ" value={params.gapHalfAngleDeg} min={0} max={Math.max(0,90/params.sectors-.01)} step={.1} onChange={gapHalfAngleDeg=>update({gapHalfAngleDeg})}/><TessNumberField label="赋型阈值" value={params.typeMinimumAngleDeg} min={0} max={45} step={.5} onChange={typeMinimumAngleDeg=>update({typeMinimumAngleDeg})}/></div>
    {Math.abs(params.asymmetry)===1&&<div className="tess-pair"><TessNumberField label="法兰分层 ε" value={params.flatFlangeInset??0} min={0} max={.5} step={.01} onChange={flatFlangeInset=>update({flatFlangeInset})}/><span className="note" title="仅修饰三维显示；真实等距坐标与折痕不变">仅显示 · 真等距不变</span></div>}
    <PotProfileSummary points={params.crossSection} label="矩形壶体剖面预览" onEdit={open}/>
    <label className="rectangular-pot-saved">原版保存例<select aria-label="矩形壶体保存例" value={matchRectangularPotSaved(params)??''} onChange={event=>{const cell=Number(event.target.value);if([3489,3490,3491,3492,3493,3494,3503,3504,3505,3506].includes(cell))onChange(rectangularPotSavedParams(cell as RectangularPotSavedCell));}}><option value="">选择原版保存输入</option><optgroup label="单楔片"><option value="3489">In[3489] · 对称</option><option value="3490">In[3490] · 平法兰</option><option value="3491">In[3491] · 接缝角</option><option value="3492">In[3492] · 下向平底</option><option value="3493">In[3493] · 非对称</option><option value="3494">In[3494] · 曲面近似</option></optgroup><optgroup label="整壶体"><option value="3503">In[3503] · 默认整壶</option><option value="3504">In[3504] · 光滑对称</option><option value="3505">In[3505] · 光滑斜向</option><option value="3506">In[3506] · 缺一面板</option></optgroup></select></label>
    <p className="note radial-pot-summary">原版 MakeRectangularPot。面板在矩形纸面上依次拼接，三维绕轴旋转；部分接缝角可能无等距解。</p>
    {params.panels>params.sectors&&<p className="note rectangular-pot-repetition">绕轴重复，三维面片重合；二维逐瓣展开。碰撞、路径与层序未验。</p>}
    {error&&!editing&&<p className="tess-editor-error" role="alert">{error}</p>}
    {editing&&<PotProfileEditor title="编辑矩形壶体剖面" params={params} onPreview={onPreview} onCancelPreview={onCancelPreview} onApply={crossSection=>{const next=readRectangularPotParams({...params,crossSection});if(next)onChange(next);}} onClose={()=>{setEditing(false);setError('');}}/>}
  </>;
}
