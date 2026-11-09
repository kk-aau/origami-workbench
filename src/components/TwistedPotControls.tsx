import {useState} from 'react';
import {readTwistedPotParams,twistedPotSavedPreset,twistedPotSmoothSavedPreset,type TwistedPotParams} from '../app/twistedPotParams';
import type {TessParams} from '../app/tessellation';
import TwistedPotSmoothDialog from './TwistedPotSmoothDialog';
import TessNumberField from './TessNumberField';
import PotProfileEditor,{PotProfileSummary} from './PotProfileEditor';
import './radialPot.css';

export default function TwistedPotControls({params,onChange,onPreview,onCancelPreview}:{params:TwistedPotParams;onChange:(next:TwistedPotParams)=>void;onPreview?:(next:TessParams)=>void;onCancelPreview?:()=>void}){
  const [editing,setEditing]=useState(false),[error,setError]=useState('');
  const [viewingSmoothSaved,setViewingSmoothSaved]=useState(false);
  const update=(patch:Partial<TwistedPotParams>)=>{
    const next=readTwistedPotParams({...params,...patch});
    if(next){onChange(next);setError('');}
    else setError('参数超出严格等距构造的可用范围。');
  };
  const open=()=>{setError('');setEditing(true);};
  const points=params.crossSection;
  return <>
    <div className="tess-pair">
      <TessNumberField label="旋转扇区 m" value={params.sectors} min={3} max={Math.min(16,Math.floor(500/(3*points.length-5)))} step={1} onChange={sectors=>update({sectors})}/>
      <TessNumberField label="法兰旋转 °" value={params.flangeRotationDeg} min={-45} max={45} step={.5} onChange={flangeRotationDeg=>update({flangeRotationDeg})}/>
    </div>
    <div className="tess-pair tess-small-selects">
      <label className="select-field">不对称 ρ<select aria-label="不对称 ρ" value={params.asymmetry} onChange={event=>update({asymmetry:Number(event.target.value) as -1|1})}><option value="1">+1</option><option value="-1">−1</option></select></label>
      <label className="select-field">斜褶方向 τ<select aria-label="斜褶方向 τ" value={params.goreTwist} onChange={event=>update({goreTwist:Number(event.target.value) as -1|1})}><option value="1">+1</option><option value="-1">−1</option></select></label>
    </div>
    <div className="tess-pair tess-small-selects">
      <label className="select-field">边缘<select aria-label="扭转壶体边缘" value={params.border} onChange={event=>update({border:event.target.value as 'planar'|'trimmed'})}><option value="planar">平面法兰</option><option value="trimmed">裁切法兰</option></select></label>
      <TessNumberField label="赋型阈值 °" value={params.typeMinimumAngleDeg} min={0} max={45} step={.5} onChange={typeMinimumAngleDeg=>update({typeMinimumAngleDeg})}/>
    </div>
    <div className="tess-pair"><TessNumberField label="法兰分层 ε" value={params.flangeInset} min={0} max={.5} step={.01} onChange={flangeInset=>update({flangeInset})}/><span className="note" title="仅修饰三维显示；真实等距坐标与折痕不变">仅显示 · 真等距不变</span></div>
    <PotProfileSummary points={points} label="扭转壶体剖面预览" onEdit={open}><select className="twisted-pot-saved-select" aria-label="原版扭转壶体保存例" value="" onChange={event=>{
      const cell=Number(event.target.value);
      if(cell===3522){setViewingSmoothSaved(true);return;}
      if(cell!==3521&&cell!==3523)return;
      const next=readTwistedPotParams(twistedPotSavedPreset(cell));
      if(next){setError('');onChange(next);}else setError('原版扭转壶体保存例未通过参数校验。');
    }}><option value="">原版保存例…</option><option value="3521">厚剖面 · In[3521]</option><option value="3522">Smooth 只读 · In[3522]</option><option value="3523">细剖面 · In[3523]</option></select></PotProfileSummary>
    <p className="note radial-pot-summary">仅 faceted 的逐面等距静态构形；连续折叠和碰撞未核验。</p>
    {error&&!editing&&<p className="tess-editor-error" role="alert">{error}</p>}
    {viewingSmoothSaved&&<TwistedPotSmoothDialog params={twistedPotSmoothSavedPreset()} savedCell={3522} onClose={()=>setViewingSmoothSaved(false)}/>}
    {editing&&<PotProfileEditor title="编辑扭转壶体剖面" params={params} onPreview={onPreview} onCancelPreview={onCancelPreview} onApply={crossSection=>{const next=readTwistedPotParams({...params,crossSection});if(next)onChange(next);}} onClose={()=>{setEditing(false);setError('');}}/>}
  </>;
}
