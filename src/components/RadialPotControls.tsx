import {useState} from 'react';
import {readTessParams,type TessParams} from '../app/tessellation';
import type {RadialPotParams} from '../app/radialPotParams';
import {matchRadialPotSaved,radialPotSavedParams} from '../app/radialPotSaved';
import TessNumberField from './TessNumberField';
import PotProfileEditor,{PotProfileSummary} from './PotProfileEditor';
import './radialPot.css';

export default function RadialPotControls({params,onChange,onPreview,onCancelPreview}:{params:RadialPotParams;onChange:(next:TessParams)=>void;onPreview?:(next:TessParams)=>void;onCancelPreview?:()=>void}){
  const [editing,setEditing]=useState(false),[error,setError]=useState('');
  const update=(patch:Partial<RadialPotParams>)=>{
    const next=readTessParams({...params,...patch,...('asymmetry' in patch&&Math.abs(patch.asymmetry??0)!==1?{flatFlangeInset:undefined}:{})});
    if(next){setError('');onChange(next);}else setError('当前参数组合超出原版壶体已验证的可用域。');
  };
  const setBorder=(border:RadialPotParams['border'])=>{
    const {arcMaximumAngleDeg:_angle,arcDivisions:_divisions,arcMethod:_method,...base}=params;
    const next=readTessParams(border==='circular'
      ?{...base,border,arcMaximumAngleDeg:params.arcMaximumAngleDeg??5,arcDivisions:params.arcDivisions??1,arcMethod:params.arcMethod??'inscribed'}
      :{...base,border});
    if(next){setError('');onChange(next);}
    else setError('当前圆弧外缘参数无效；请调整分角、分段数或不对称度。');
  };
  const edit=()=>{setError('');setEditing(true);};
  return <>
    <label className="select-field">纸张外缘<select aria-label="壶体纸张外缘" value={params.border} onChange={event=>setBorder(event.target.value as RadialPotParams['border'])}><option value="planar">平面外缘 PotPlanar</option><option value="polygon">正多边形 PotPolygon</option><option value="circular">圆弧 PotCircular</option></select></label>
    <div className="tess-pair"><TessNumberField label="扇区数" value={params.sectors} min={3} max={16} step={1} onChange={sectors=>update({sectors})}/><TessNumberField label="不对称度 ρ" value={params.asymmetry} min={-1} max={1} step={.05} onChange={asymmetry=>update({asymmetry})}/></div>
    <div className="tess-pair"><TessNumberField label="接缝半角 δ" value={params.gapHalfAngleDeg} min={0} max={Math.max(0,90/params.sectors-.01)} step={.1} onChange={gapHalfAngleDeg=>update({gapHalfAngleDeg})}/><TessNumberField label="赋型阈值" value={params.typeMinimumAngleDeg} min={0} max={45} step={.5} onChange={typeMinimumAngleDeg=>update({typeMinimumAngleDeg})}/></div>
    {Math.abs(params.asymmetry)===1&&<div className="tess-pair"><TessNumberField label="法兰分层 ε" value={params.flatFlangeInset??0} min={0} max={.5} step={.01} onChange={flatFlangeInset=>update({flatFlangeInset})}/><span className="note" title="仅修饰三维显示；真实等距坐标与折痕不变">仅显示 · 真等距不变</span></div>}
    {params.border==='circular'&&<><div className="tess-pair"><TessNumberField label="圆弧最大分角" value={params.arcMaximumAngleDeg??5} min={1} max={30} step={.5} onChange={arcMaximumAngleDeg=>update({arcMaximumAngleDeg})}/><TessNumberField label="最少分段" value={params.arcDivisions??1} min={1} max={32} step={1} onChange={arcDivisions=>update({arcDivisions})}/></div><label className="select-field">圆弧方式<select aria-label="壶体圆弧方式" value={params.arcMethod??'inscribed'} onChange={event=>update({arcMethod:event.target.value as RadialPotParams['arcMethod']})}><option value="inscribed">内接</option><option value="circumscribed">外切</option></select></label></>}
    <PotProfileSummary points={params.crossSection} label="壶体剖面预览" onEdit={edit}/>
    <label className="radial-pot-saved">原版保存例<select aria-label="径向壶体保存例" value={matchRadialPotSaved(params)??''} onChange={event=>{const cell=Number(event.target.value);if(cell===3481||cell===3482||cell===3483)onChange(radialPotSavedParams(cell));}}><option value="">选择原版保存输入</option><option value="3481">In[3481] · Mosely Bud 对称</option><option value="3482">In[3482] · Mosely Bud 旋翼</option><option value="3483">In[3483] · 上向法兰分层</option></select></label>
    <p className="note radial-pot-summary">原版 MakeRadialPot。输出真实三维壶体与同索引二维折痕；非平折。连续路径与自碰撞未检验。</p>
    {error&&!editing&&<p className="tess-editor-error" role="alert">{error}</p>}
    {editing&&<PotProfileEditor title="编辑旋转壶体剖面" params={params} onPreview={onPreview} onCancelPreview={onCancelPreview} onApply={crossSection=>{const next=readTessParams({...params,crossSection});if(next)onChange(next);}} onClose={()=>{setEditing(false);setError('');}}/>}
  </>;
}
