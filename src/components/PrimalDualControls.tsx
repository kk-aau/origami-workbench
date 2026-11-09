import {useState} from 'react';
import {MIN_TOTAL_METHOD,minTotalPleatPreset} from '../app/reciprocalMinTotalPleat';
import {changeTessParams,type TessParams} from '../app/tessellation';
import {gammaAndAlpha} from '../app/primalDualParams';
import {TessDialog} from './TessellationEditor';

export default function PrimalDualControls({params,onChange}:{params:Extract<TessParams,{angle:number;scale:number}>;onChange:(p:TessParams)=>void}){
 const [open,setOpen]=useState(false),[error,setError]=useState('');
 const gammaMode=params.parameterization==='gamma-alpha';
 const change=(patch:Record<string,unknown>)=>{setError('');onChange(changeTessParams(params,patch));};
 return <>{params.family==='primal-dual'&&<button onClick={()=>onChange(minTotalPleatPreset())}>原最小总褶宽 · 有限数值示例</button>}<button aria-label="原始对偶参数设置" onClick={()=>{setOpen(true);setError('');}}>参数／定向</button>{open&&<TessDialog title="原始—对偶参数与定向" onClose={()=>setOpen(false)}>
 <label className="select-field">参数方式<select aria-label="原始对偶参数方式" value={gammaMode?'gamma-alpha':'rho-beta'} onChange={e=>{
  if(e.target.value==='gamma-alpha'){
   const converted=gammaAndAlpha(params.scale,params.angle);
   if(converted.pleatAngle<.1||converted.pleatAngle>89.9||converted.gamma<.01||converted.gamma>100){setError('当前比例与转角不在正 α 折痕构造范围。请先调整比例或转角。');return;}
   change({parameterization:'gamma-alpha',...converted});
  }else{
   const minimum=['periodic','primal-dual'].includes(params.family)?.2:.1;
   if(params.scale<minimum||params.scale>.85||Math.abs(params.angle)<.1||Math.abs(params.angle)>80){setError('当前 γ／α 超出兼容参数的滑条范围；请先调整 γ／α。');return;}
   change({parameterization:'rho-beta',gamma:undefined,pleatAngle:undefined,twistDirection:undefined});
  }
 }}><option value="rho-beta">收缩率 ρ／旋转角 β</option><option value="gamma-alpha">原版比例 γ／褶角 α</option></select></label>
 {params.family==='primal-dual'&&<><label className="select-field">对偶求解方法<select aria-label="对偶求解方法" value={params.reciprocalMethod??'compatible'} onChange={e=>{
  if(e.target.value===MIN_TOTAL_METHOD){
   if(params.motherParams?.family!=='custom'||!params.dualTargets){setError('原最小总褶宽需要自定义母结构和显式输入对偶，请先载入有限数值示例。');return;}
   onChange({...params,reciprocalMethod:MIN_TOTAL_METHOD});
  }else{const next={...params};delete next.reciprocalMethod;onChange(next);}
 }}><option value="compatible">当前垂直对偶</option><option value={MIN_TOTAL_METHOD}>原 MinTotalPleat · 最小总褶宽</option></select></label>
 {params.reciprocalMethod===MIN_TOTAL_METHOD&&<p className="note">按输入对偶确定褶宽符号，先以首点为零求解最小总褶宽，再拟合回输入尺度与位置。只接有限连通母图；原解不能确认唯一时拒绝。采用仍需几何、局部与整片层序检查。</p>}</>}
 <label className="select-field">图样定向<select aria-label="图样定向" value={params.postRotation??'none'} onChange={e=>change({postRotation:e.target.value})}><option value="none">不追加旋转</option><option value="primal">保持原始多边形方向</option><option value="dual">保持对偶多边形方向</option></select></label>
 <p className="note">γ／α 按原版公式换算，不改变母结构或对偶点。正 α 生成折痕时会同步计算原版负 α 折后坐标；画布继续独立求解层序和可见面。</p>
 <p className="note">当前 ρ = {params.scale.toFixed(6)}，β = {params.angle.toFixed(4)}°。定向同时作用于生成结果与实时预览。</p>
 {error&&<p role="alert">{error}</p>}
 </TessDialog>}</>;
}
