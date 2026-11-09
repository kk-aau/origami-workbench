import {useState} from 'react';
import {readGorePaperParams,gorePaperPreset,gorePaperLimits,sphereGoreProfile,type GorePaperParams} from '../app/goreData';
import type {TessParams,XY} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import TessellationEditor from './TessellationEditor';
import {PotProfileSummary} from './PotProfileEditor';
import GoreDataDialog from './GoreDataDialog';

export default function GoreControls({params,onChange}:{params:GorePaperParams;onChange:(p:TessParams)=>void}){
 const [editing,setEditing]=useState(false),[data,setData]=useState(false),[error,setError]=useState('');
 const points=params.profile==='sphere'?sphereGoreProfile(params.divisions!):params.crossSection!;
 const multiple=params.petals==='multiple',extra=multiple?{petals:'multiple' as const}:{},limits=gorePaperLimits(params);
 const update=(patch:Partial<GorePaperParams>)=>{const next=readGorePaperParams({...params,...patch});if(next){onChange(next);setError('');}else setError('Gore材料需要合法剖面、m或n；多瓣总面不超过600，原完整图形不超过65536点。');};
 const changeProfile=(profile:'sphere'|'points')=>{const raw=profile==='sphere'?{...gorePaperPreset(),sectors:params.sectors,typeMinimumAngleDeg:params.typeMinimumAngleDeg,...extra}:{family:'gore-paper',profile:'points',crossSection:structuredClone(points),sectors:params.sectors,typeMinimumAngleDeg:params.typeMinimumAngleDeg,...extra},next=readGorePaperParams(raw);if(next){onChange(next);setError('');}else setError('当前n/m超过多瓣材料预算，请先减少瓣数或剖面点。');};
 const valid=(p:XY[])=>readGorePaperParams({family:'gore-paper',profile:'points',crossSection:p,sectors:params.sectors,typeMinimumAngleDeg:params.typeMinimumAngleDeg,...extra})?'':'半径须非负，内部半径须正，相邻点不能重复；多瓣需要满足总面和完整图形预算。';
 return <>
  <label className="select-field">材料方式<select aria-label="Gore材料方式" value={multiple?'multiple':'single'} onChange={e=>{if(e.target.value==='multiple')update({petals:'multiple'});else{const {petals:_petals,...single}=params;onChange(single);setError('');}}}><option value="single">原单瓣径向纸张</option><option value="multiple">原多瓣 · 独立材料集合</option></select></label>
  <label className="select-field">原Gore剖面<select aria-label="Gore剖面方式" value={params.profile} onChange={e=>changeProfile(e.target.value as 'sphere'|'points')}><option value="sphere">{multiple?'SphereMultipleGoreData':'SphereSingleGoreData'} · 球面剖面</option><option value="points">{multiple?'MultipleGoreData':'SingleGoreData'} · 实际点列</option></select></label>
  <div className="tess-pair"><TessNumberField label="瓣数 m" value={params.sectors} min={3} max={limits.sectors} step={1} onChange={sectors=>update({sectors})}/>{params.profile==='sphere'&&<TessNumberField label="球面分段 n" value={params.divisions!} min={2} max={limits.divisions} step={1} onChange={divisions=>update({divisions})}/>}</div>
  <TessNumberField label="赋型阈值 °" value={params.typeMinimumAngleDeg} min={0} max={90} step={.5} onChange={typeMinimumAngleDeg=>update({typeMinimumAngleDeg})}/>
  <PotProfileSummary points={points} label={multiple?'多瓣Gore共享源剖面':'单瓣Gore源剖面'} onEdit={()=>{if(params.profile==='sphere')changeProfile('points');setEditing(true);}}/>
  <button className="text-button" onClick={()=>setData(true)}>四个原Gore函数 · 完整图形数据</button>
  <p className="note">{multiple?`按原2πj/m旋转构造${params.sectors}个独立径向材料部件；各瓣CP与静态三维逐面等距。极点和接缝不焊接，没有认证粘合、连续路径、碰撞或层序。`:'按原累计弦长和半宽构造径向单瓣纸张，二维CP与静态三维逐面等距。采用的是单瓣径向纸面。'}柱面图和原二维重复线仍在完整帮助数据中保留。</p>
  {error&&<p role="alert">{error}</p>}
  {editing&&<TessellationEditor title="编辑原Gore剖面" initial={points} min={-1000} max={1000} xLabel="半径 x" yLabel="高度 z" invertY editablePoints orderedPath="open" minPoints={2} maxPoints={65} validateGeometry={valid} onClose={()=>setEditing(false)} onApply={crossSection=>{const p=readGorePaperParams({family:'gore-paper',profile:'points',crossSection,sectors:params.sectors,typeMinimumAngleDeg:params.typeMinimumAngleDeg,...extra});if(p){onChange(p);setEditing(false);}}}/>}
  {data&&<GoreDataDialog params={params} onClose={()=>setData(false)}/>}
 </>;
}
