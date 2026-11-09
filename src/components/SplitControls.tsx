import {useState} from 'react';
import {SPLIT_VARIANTS,splitPreset,type ExactSplitParams,type SplitVariant} from '../app/splitParams';
import type {TessResult} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import TessellationEditor,{TessDialog} from './TessellationEditor';

export default function SplitControls({params,onChange,result}:{params:ExactSplitParams;onChange:(p:ExactSplitParams)=>void;result:TessResult|null}){
  const [dialog,setDialog]=useState<'polygon'|'types'|null>(null);
  const change=(patch:Record<string,unknown>)=>onChange({...params,...patch} as ExactSplitParams);
  const field=(label:string,key:string,value:number,min:number,max:number,step=.1)=><TessNumberField label={label} value={value} min={min} max={max} step={step} onChange={n=>change({[key]:n})}/>;
  const unit=params.variant==='unit-offset';
  const currentPolygon='polygon' in params?params.polygon:null;
  const switchVariant=(variant:SplitVariant)=>{
    const next=splitPreset(variant),defaultCurrent=splitPreset(params.variant);
    if(currentPolygon&&'polygon' in next&&'polygon' in defaultCurrent&&JSON.stringify(currentPolygon)!==JSON.stringify(defaultCurrent.polygon))next.polygon=currentPolygon;
    onChange(next);
  };
  return <>
    <label className="select-field">分裂方式<select aria-label="分裂方式" value={params.variant} onChange={e=>switchVariant(e.target.value as SplitVariant)}>{Object.entries(SPLIT_VARIANTS).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    {unit&&<>
      <div className="tess-unit-angles">{params.angles.map((angle,i)=><TessNumberField key={i} label={`内角 ${i+1}`} value={angle} min={1} max={179} step={1} onChange={value=>change({angles:params.angles.map((x,j)=>j===i?value:x)})}/>)}</div>
      <div className="tess-pair tess-unit-side">{field('指定边长','side',params.side,.05,5,.05)}<label className="select-field">指定边<select aria-label="单位四边形指定边" value={params.sideIndex} onChange={e=>change({sideIndex:Number(e.target.value)})}>{[2,3,4].map(i=><option key={i} value={i}>第 {i} 边</option>)}</select></label></div>
      <p className="note">第 1 边为 1 · 第 4 角 {(360-params.angles.reduce((a,b)=>a+b,0)).toFixed(1)}°（自动推得）</p>
    </>}
    <div className="tess-pair tess-small-selects">
      <label className="select-field">基点<select aria-label="精确分裂基点" value={params.baseVertex} onChange={e=>change({baseVertex:Number(e.target.value)})}>{[0,1,2,3].map(i=><option key={i} value={i}>{i+1}</option>)}</select></label>
      <label className="select-field">连接<select aria-label="精确分裂连接" value={params.connection} onChange={e=>change({connection:e.target.value})}><option value="M">山折</option><option value="V">谷折</option></select></label>
    </div>
    <div className="tess-pair">{field('边缘褶宽','width',params.width,.05,.8,.01)}{'tilt' in params?field('精确褶角','tilt',params.tilt,1,179):'twistAngle' in params?field('指定扭角','twistAngle',params.twistAngle,1,179):field('边缘偏置','offset',params.offset,-.4,.4,.01)}</div>
    {params.variant==='general'&&<div className="tess-pair">{field('边缘偏置','offset',params.offset,-.4,.4,.01)}<label className="select-field">赋型方向<select aria-label="分裂赋型方向" value={params.ccw?'ccw':'cw'} onChange={e=>change({ccw:e.target.value==='ccw'})}><option value="ccw">逆时针</option><option value="cw">顺时针</option></select></label></div>}
    <div className="tess-actions">{!unit&&<button className="outline" onClick={()=>setDialog('polygon')}>编辑外四边形</button>}<button className="outline" onClick={()=>setDialog('types')}>中心边山谷</button></div>
    <p className="note">褶角 {typeof result?.source.pleatAngle==='number'?result.source.pleatAngle.toFixed(2):'—'}° · {result?.source.split===false?'当前单元无需分裂':'边缘褶宽与偏置保持精确'}</p>
    {dialog==='polygon'&&'polygon' in params&&<TessellationEditor title="编辑精确分裂四边形" initial={params.polygon} min={-10} max={10} strictConvex faces={[[0,1,2,3]]} edges={[[0,1],[1,2],[2,3],[3,0]]} onApply={polygon=>change({polygon})} onClose={()=>setDialog(null)}/>}
    {dialog==='types'&&<TessDialog title="分裂中心边山谷" onClose={()=>setDialog(null)}><div className="tess-help-grid">{params.centralTypes.map((type,i)=><label className="select-field" key={i}>中心边 {i+1}<select aria-label={`分裂中心边 ${i+1}`} value={type} onChange={e=>change({centralTypes:params.centralTypes.map((t,j)=>i===j?e.target.value:t)})}><option value="M">山折</option><option value="V">谷折</option></select></label>)}</div><footer><button onClick={()=>change({centralTypes:['M','M','M','M']})}>全部山折</button><button onClick={()=>change({centralTypes:['V','V','V','V']})}>全部谷折</button><button className="primary" onClick={()=>setDialog(null)}>完成</button></footer></TessDialog>}
  </>;
}
