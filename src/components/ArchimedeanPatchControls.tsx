import {useState} from 'react';
import {createPortal} from 'react-dom';
import VertexFigureControls from './VertexFigureControls';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';
import type {TessParams} from '../app/tessellation';
import {ARCHIMEDEAN_PATCH_CATALOG,archimedeanPatchParams,archimedeanPatchPreset,
  archimedeanPatchIn3180Preset,
  archimedeanPatchIn3180LatticePreset,
  archimedeanPatchIn3185Preset,
  archimedeanPatchIn3182Preset,archimedeanPatchIn3186Preset,
  archimedeanPatchIn3186PrunedPreset,
  readArchimedeanPatchSpec,type ArchimedeanPatchNumber,type ArchimedeanPatchSpec}
  from '../app/archimedeanPatchSource';

type CustomParams=Extract<TessParams,{family:'custom'}>;

export default function ArchimedeanPatchControls({params,onChange}:{
  params:CustomParams;onChange:(next:TessParams)=>void;
}){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const spec=readArchimedeanPatchSpec((params as CustomParams&{archimedeanPatch?:unknown}).archimedeanPatch);
  const apply=(next:ArchimedeanPatchSpec)=>{
    const valid=readArchimedeanPatchSpec(next);
    if(!valid){setError('格矢闭区间须为 -64～64 内的升序整数，展开后最多 192 个面。');return;}
    setError('');
    onChange(archimedeanPatchParams(valid,params.paper));
  };
  const begin=()=>{apply(archimedeanPatchPreset());setOpen(true);};
  if(!spec)return <><button className="outline" aria-label="选择原版 ArchimedeanPatch 母结构"
    onClick={begin}>阿基米德</button><VertexFigureControls/></>;
  const row=ARCHIMEDEAN_PATCH_CATALOG[spec.number-1];
  const saved=!spec.preset&&spec.range1[0]===0&&spec.range1[1]===1&&
    spec.range2[0]===0&&spec.range2[1]===1;
  const setRange=(axis:'range1'|'range2',index:0|1,value:number)=>{
    const range=[...spec[axis]] as [number,number];range[index]=value;
    apply({...spec,[axis]:range});
  };
  const namedFold=spec.preset!==undefined;
  const savedPreset=spec.number===1?archimedeanPatchIn3180Preset():
    spec.number===2?archimedeanPatchIn3185Preset():
    spec.number===6?archimedeanPatchIn3182Preset():archimedeanPatchIn3186Preset();
  return <>
    <VertexFigureControls initial={row.vertexType.split('.').map(Number)}/>
    <button className="outline" aria-label="编辑原版 ArchimedeanPatch 母结构"
      title={`ArchimedeanPatch[${spec.number}] · ${row.vertexType} · ${spec.range1.join('..')} × ${spec.range2.join('..')}`}
      onClick={()=>setOpen(true)}>阿基米德[{spec.number}]</button>
    {open&&createPortal(<TessDialog title="原版 ArchimedeanPatch 母结构" onClose={()=>setOpen(false)}>
      <p>Origamica 第 37 节普通 ArchimedeanPatch[1..12]；显式接边和两条来源格矢。</p>
      <label className="select-field">原版来源编号
        <select aria-label="ArchimedeanPatch 来源编号" value={spec.number}
          onChange={event=>{
            const number=Number(event.target.value) as ArchimedeanPatchNumber;
            apply(spec.preset?archimedeanPatchPreset(number):{...spec,number});
          }}>
          {ARCHIMEDEAN_PATCH_CATALOG.map(item=><option key={item.number} value={item.number}>
            {item.number} · {item.vertexType} · {item.sourceFaces} 个来源面
          </option>)}
        </select>
      </label>
      {[1,2,6,8].includes(spec.number)&&<label className="select-field">保存样例
        <select aria-label={`普通 n=${spec.number} 保存样例`} value={spec.preset??'mother'}
          onChange={event=>apply(event.target.value==='mother'
            ?archimedeanPatchPreset(spec.number)
            :event.target.value==='in3180-centered-lattice2x2'
            ?archimedeanPatchIn3180LatticePreset()
            :event.target.value==='in3186-alt-pruned'
            ?archimedeanPatchIn3186PrunedPreset():savedPreset)}>
          <option value="mother">2×2 母结构 · In[{row.notebookIn[2]}]</option>
          <option value={savedPreset.preset}>{spec.number===1
            ?'双三角居中褶角 · In[3180]':spec.number===2
            ?'4×4 Alt 裁剪 · In[3185]':`单补片 Alt · In[${spec.number===6?3182:3186}]`}</option>
          {spec.number===1&&<option value="in3180-centered-lattice2x2">
            双三角 2×2 扭转 · In[3106]+In[3180]
          </option>}
          {spec.number===8&&<option value="in3186-alt-pruned">
            120→21 片整纸 Alt 裁剪 · In[3186]
          </option>}
        </select>
      </label>}
      {!namedFold&&<>
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
      {error&&<p role="alert">{error}</p>}
      <p className="note">{spec.preset==='in3180-centered-single'
        ?'In[3180]：普通 3⁶ 双三角单补片，以褶角 τ=70°、w=0.2 构造两片 MMM/VVV；此处的 70° 是褶角，不是中心扭角。采用仍须通过实时整片层序检查；原版没有可机比数值 Out。'
        :spec.preset==='in3180-centered-lattice2x2'
        ?'In[3106] 的双三角 2×2 格点与 In[3180] 的 w=0.2、褶角 τ=70°、MMM/VVV 配方组合：8 片跨格接缝有真实折痕及逐面等距平折；这是两个保存输入的数值组合，原版没有该组合的数值 Out。采用仍须通过实时整片层序检查。'
        :spec.preset==='in3185-alt-pruned'
        ?'In[3185]：普通正方形 4×4，w=0.2、α=30°、VVMM，裁剪到 [0,2.9]² 后保留 9 片；采用前须检查实时几何与层序。'
        :spec.preset==='in3182-alt-single'
        ?'In[3182]：普通 3.3.3.4.4 单补片 Alt；三片 M3/V3/M4，w=0.2、α=25°。本项目单补片层序已验证；原版无数值 Out。'
        :spec.preset==='in3186-alt-single'
        ?'In[3186]：普通 3.4.6.4 单六片 Alt，w=0.12、α=29°。仅验证单补片层序；整纸裁剪请选下一个预设。原版无数值 Out。'
        :spec.preset==='in3186-alt-pruned'
        ?'In[3186]：普通 3.4.6.4 整纸 Alt，先展开 120 片，再按 [0.1,3.9]² 保留 21 片；w=0.12、α=29°。本项目整纸层序有唯一受限证书，采用须以实时工作区检查为准；原版无数值 Out。'
        :saved
        ?`当前为原版保存的 2×2 母图样例 In[${row.notebookIn[2]}]。`
        :'当前范围按原版格矢规则扩展；这组范围不是原版 2×2 保存例。'}
        {!namedFold&&'此入口只生成来源多边形和母结构，未提供对应的完整折痕、平折或层序。'}</p>
      <footer><button className="primary" onClick={()=>setOpen(false)}>完成参数编辑</button></footer>
    </TessDialog>,document.body)}
  </>;
}
