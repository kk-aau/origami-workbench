import {useState} from 'react';
import {BROCARD_NAMES,brocardPreset,readBrocardParams,type BrocardKind,type BrocardParams} from '../app/brocardParams';
import type {TessResult} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import TessellationEditor,{TessDialog} from './TessellationEditor';

function CornerEditor({params,onApply,onClose}:{params:Extract<BrocardParams,{kind:'angles'}>;onApply:(p:BrocardParams)=>void;onClose:()=>void}){
  const [angles,setAngles]=useState([...params.angles]);
  const finalAngle=(angles.length-2)*180-angles.slice(0,-1).reduce((a,b)=>a+b,0);
  const valid=readBrocardParams({...params,angles});
  return <TessDialog title="Brocard 多边形内角" onClose={onClose}>
    <TessNumberField label="多边形边数" min={3} max={12} value={angles.length} onChange={n=>setAngles(Array(n).fill(180-360/n))}/>
    <div className="tess-help-grid">{angles.slice(0,-1).map((a,i)=><TessNumberField key={i} label={`内角 ${i+1}`} value={a} min={1} max={179} step={.1} onChange={n=>setAngles(values=>values.map((v,j)=>i===j?n:v))}/>)}</div>
    <p aria-live="polite">末角 {Number(finalAngle.toFixed(4))}° · 由内角和确定</p>
    {!valid&&<p role="alert">每个内角须在 1°–179° 之间，请调整前面的内角。</p>}
    <footer><button className="primary" disabled={!valid} onClick={()=>{if(valid){onApply(valid);onClose();}}}>采用内角</button></footer>
  </TessDialog>;
}

export default function BrocardControls({params,onChange,result}:{params:BrocardParams;onChange:(p:BrocardParams)=>void;result:TessResult|null}){
  const [edit,setEdit]=useState(false);
  const change=(patch:Record<string,unknown>)=>onChange({...params,...patch} as BrocardParams);
  const field=(label:string,key:string,value:number,min:number,max:number,step=.1)=><TessNumberField label={label} value={value} min={min} max={max} step={step} onChange={n=>change({[key]:n})}/>;
  const info=result?.source.brocard as {omega?:number;pleatAngle?:number}|undefined;
  return <>
    <label className="select-field">Brocard 类型<select aria-label="Brocard 类型" value={params.kind} onChange={e=>{setEdit(false);const next=brocardPreset(e.target.value as BrocardKind);if('scale' in next&&'scale' in params)next.scale=params.scale;onChange({...next,clockwise:params.clockwise});}}>{Object.entries(BROCARD_NAMES).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    {(params.kind==='triangle'||params.kind==='cyclic'||params.kind==='cyclic-offset')&&<div className="tess-pair">{field('内角一','angle1',params.angle1,1,179)}{field('内角二','angle2',params.angle2,1,179)}</div>}
    {(params.kind==='cyclic'||params.kind==='cyclic-offset')&&<div className="tess-triple">
      <label className="select-field">边数<select aria-label="圆内接边数" value={params.sides} onChange={e=>{const sides=Number(e.target.value);change({sides,angle1:180-360/sides,angle2:180-360/sides,index1:0,index2:1,...(params.kind==='cyclic-offset'?{centralTypes:Array(sides).fill('M')}:{})});}}>{Array.from({length:10},(_,i)=>i+3).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      {(['index1','index2'] as const).map((key,i)=><label className="select-field" key={key}>角{i+1}位置<select aria-label={`内角${i+1}位置`} value={params[key]} onChange={e=>{const index=Number(e.target.value),other=key==='index1'?'index2':'index1';change({[key]:index,...(params[other]===index?{[other]:params[key]}:{})});}}>{Array.from({length:params.sides},(_,j)=><option key={j} value={j}>{j+1}</option>)}</select></label>)}
    </div>}
    {(params.kind==='trapezoid'||params.kind==='parallelogram')&&field('基准内角','baseAngle',params.baseAngle,1,179)}
    {(params.kind==='angles'||params.kind==='triangle-vertices')&&<button className="outline" onClick={()=>setEdit(true)}>{params.kind==='angles'?`编辑 ${params.angles.length} 个内角`:'编辑三个顶点'}</button>}
    <div className="tess-pair">{'scale' in params&&field('内接比例','scale',params.scale,.2,.85,.01)}<label className="select-field">方向<select aria-label="Brocard 方向" value={params.clockwise?'cw':'ccw'} onChange={e=>change({clockwise:e.target.value==='cw'})}><option value="ccw">逆时针</option><option value="cw">顺时针</option></select></label>{params.kind==='cyclic-offset'&&<button className="text-button" onClick={()=>setEdit(true)}>中心边山谷</button>}</div>
    {params.kind==='cyclic-offset'&&<><div className="tess-pair">{field('边缘褶宽','width',params.width,.05,.8,.01)}{field('边缘偏置','offset',params.offset,-.4,.4,.01)}</div></>}
    <p className="note" aria-label="Brocard 求解角度">Brocard 角 {info?.omega?.toFixed(2)??'—'}° · 褶角 {info?.pleatAngle?.toFixed(2)??'—'}°</p>
    {edit&&params.kind==='cyclic-offset'&&<TessDialog title="中心边山谷" onClose={()=>setEdit(false)}><div className="tess-help-grid">{params.centralTypes.map((type,i)=><label className="select-field" key={i}>中心边 {i+1}<select aria-label={`中心边 ${i+1}`} value={type} onChange={e=>change({centralTypes:params.centralTypes.map((t,j)=>i===j?e.target.value:t)})}><option value="M">山折</option><option value="V">谷折</option></select></label>)}</div><footer><button onClick={()=>change({centralTypes:Array(params.sides).fill('M')})}>全部山折</button><button onClick={()=>change({centralTypes:Array(params.sides).fill('V')})}>全部谷折</button><button className="primary" onClick={()=>setEdit(false)}>完成</button></footer></TessDialog>}
    {edit&&params.kind==='angles'&&<CornerEditor params={params} onApply={onChange} onClose={()=>setEdit(false)}/>}
    {edit&&params.kind==='triangle-vertices'&&<TessellationEditor title="编辑 Brocard 三角形" min={-10} max={10} strictConvex faces={[[0,1,2]]} initial={params.vertices} edges={[[0,1],[1,2],[2,0]]} onApply={vertices=>change({vertices})} onClose={()=>setEdit(false)}/>}
  </>;
}
