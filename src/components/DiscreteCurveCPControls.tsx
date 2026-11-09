import {useState} from 'react';
import TessNumberField from './TessNumberField';
import DiscreteCurveSourceEditor from './DiscreteCurveSourceEditor';
import CurvedNativeDiscretizationDialog from './CurvedNativeDiscretizationDialog';
import {discreteCurveCPPreset,discreteCurveCPOriginal4093Preset,readDiscreteCurveCPParams,type DiscreteCurveCPParams} from '../app/discreteCurveCP';
import type {TessParams} from '../app/tessellation';

export default function DiscreteCurveCPControls({params,onChange}:{params:DiscreteCurveCPParams;onChange:(p:TessParams)=>void}){
 const n=params.source.foldPoints.length;
 const [open,setOpen]=useState(false),[native,setNative]=useState(false),[error,setError]=useState('');
 const update=(next:unknown)=>{const value=readDiscreteCurveCPParams(next);if(value){setError('');onChange(value);}else setError('有限点列、原母线、宽度或内部边赋型无效。');};
 return <><div className="tess-pair"><TessNumberField label="左原母线系数" value={params.leftWidth} min={.0001} max={1000} step={.01} onChange={leftWidth=>update({...params,leftWidth})}/><TessNumberField label="右原母线系数" value={params.rightWidth} min={.0001} max={1000} step={.01} onChange={rightWidth=>update({...params,rightWidth})}/></div>
  <div className="tess-pair"><button onClick={()=>{setOpen(true);setError('');}}>{n===3?'原三点／母线／山谷':`原 ${n} 点／母线／山谷`}</button><button onClick={()=>setNative(true)}>核对原倍率</button></div><button className="text-button" onClick={()=>{setError('');onChange(discreteCurveCPPreset());}}>三点有限手算示例</button>
  <button className="text-button" onClick={()=>{setError('');onChange(discreteCurveCPOriginal4093Preset());}}>原 In[4093] 六点弦向示例</button>
  <label className="select-field">有限手算示例点数<select aria-label="离散纸带示例点数" value={n} onChange={e=>{setError('');onChange(discreteCurveCPPreset(Number(e.target.value)));}}>{Array.from({length:14},(_,i)=>i+3).map(count=><option value={count} key={count}>{count} 点 · {2*count-2} 面</option>)}</select></label>
  <p className="note">六点原例沿用原五弦数据；点数选择恢复本地交替折线示例。两者均保留原输入母线幅度。</p>
  <p className="note">原折线和母线构造闭合 {2*n-2} 面纸带。默认山谷未指定，可明确仅采用 CP；普通采用需要局部与整片层序通过。原函数单位沿用工作区尺度转换。</p>
  {error&&<p role="alert">{error}</p>}
  {open&&<DiscreteCurveSourceEditor initial={params} onApply={update} onClose={()=>setOpen(false)}/>}
  {native&&<CurvedNativeDiscretizationDialog initialQuery={params.source} onClose={()=>setNative(false)} onUseCP={source=>{if(source.mode==='multipliers'){const sameCount=source.foldPoints.length===n;update({...params,source,assignments:sameCount?params.assignments:Array(3*source.foldPoints.length-5).fill('U')});setNative(false);}}}/>}
 </>;
}
