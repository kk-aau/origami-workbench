import {useState} from 'react';
import {
  SAVED_RESHAPE,reshapeFrame,sampleReshape,validateReshapeParams,
  type Point3,type ReshapeMode,type ReshapeParams,type ReshapeSample,type ReshapeStage,
} from '../app/curvedGenericCylinderReshape';
import {TessDialog} from './TessellationEditor';
import './CurvedGenericCylinderReshapeDialog.css';
import CurvedNativeGenericDarbouxDialog from './CurvedNativeGenericDarbouxDialog';

type Draft={parameterEndPi:string;rulingWidth:string;curveSegments:string};
const presets:Record<ReshapeMode,{label:string;subtitle:string;source:string;target:string;
  curvatures:string;cells:string}>={
  'flatten-cylinder':{label:'圆柱 → 平面',subtitle:'Flatten a cylinder',
    source:'单位圆柱 · 原曲面',target:'XY 平面 · 重塑后',
    curvatures:'−1 → 0',cells:'In[3891] / In[3896]'},
  'curl-plane':{label:'平面 → 单位圆柱',subtitle:'Curl a cylinder',
    source:'XY 平面 · 原曲面',target:'单位圆柱 · 重塑后',
    curvatures:'0 → +1',cells:'In[3892] / In[3897]'},
};
const draftFrom=(params:ReshapeParams):Draft=>({
  parameterEndPi:String(params.parameterEnd/Math.PI),
  rulingWidth:String(params.rulingWidth),curveSegments:String(params.curveSegments),
});
function fromDraft(mode:ReshapeMode,draft:Draft):ReshapeParams{
  if(Object.values(draft).some(value=>!value.trim()))throw Error('请填完整参数。');
  return validateReshapeParams({mode,parameterEnd:Number(draft.parameterEndPi)*Math.PI,
    rulingWidth:Number(draft.rulingWidth),curveSegments:Number(draft.curveSegments)});
}
type Point2=[number,number];
function projection(point:Point3,azimuthDeg:number):Point2{
  const a=azimuthDeg*Math.PI/180,e=25*Math.PI/180;
  const x=Math.cos(a)*point[0]-Math.sin(a)*point[1];
  const y=Math.sin(a)*Math.sin(e)*point[0]+Math.cos(a)*Math.sin(e)*point[1]+Math.cos(e)*point[2];
  return [x,-y];
}
const linePath=(points:Point2[])=>points.map(([x,y],i)=>
  `${i?'L':'M'}${x.toPrecision(9)} ${y.toPrecision(9)}`).join(' ');
function viewBox(points:Point2[]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.1),pad=span*.17;
  return {box:`${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`,
    markerRadius:span*.012};
}
function SurfacePlot({sample,stage,active,azimuth}:{sample:ReshapeSample;
  stage:ReshapeStage;active:number;azimuth:number}){
  const {crease,outerBoundary}=sample.stages[stage];
  const inner=crease.map(point=>projection(point,azimuth));
  const outer=outerBoundary.map(point=>projection(point,azimuth));
  const {box,markerRadius}=viewBox([...inner,...outer]);
  const at=Math.min(active,inner.length-1);
  const rulingStep=Math.max(1,Math.round((inner.length-1)/12));
  return <svg role="img" data-testid={`generic-reshape-${stage}`}
    aria-label={`${stage==='source'?'原':'重塑后'}三维直纹曲面的正交投影`}
    viewBox={box} preserveAspectRatio="xMidYMid meet">
    <path className="rgd-surface" d={`${linePath([...inner,...outer.slice().reverse()])} Z`}/>
    {inner.map(([x,y],i)=>i%rulingStep===0||i===inner.length-1?
      <line key={i} className="rgd-ruling" vectorEffect="non-scaling-stroke"
        x1={x} y1={y} x2={outer[i][0]} y2={outer[i][1]}/>:null)}
    <path className="rgd-outer" d={linePath(outer)}/>
    <line className="rgd-selected" vectorEffect="non-scaling-stroke"
      x1={inner[at][0]} y1={inner[at][1]} x2={outer[at][0]} y2={outer[at][1]}/>
    <path className="rgd-crease" d={linePath(inner)}/>
    <circle className="rgd-marker" vectorEffect="non-scaling-stroke" cx={inner[at][0]} cy={inner[at][1]} r={markerRadius}/>
  </svg>;
}
function Field({label,value,onChange,min,max,step='any'}:{label:string;value:string;
  onChange:(next:string)=>void;min:number;max:number;step?:string}){
  return <label className="rgd-field"><span>{label}</span><input aria-label={label}
    type="number" min={min} max={max} step={step} value={value}
    onChange={event=>onChange(event.target.value)}/></label>;
}

/** Saved continuous source/target strips only; never writes an editable FOLD. */
function SavedGenericCylinderReshapeDialog({onClose,onGeneral}:{onClose:()=>void;onGeneral:()=>void}){
  const [draft,setDraft]=useState<Draft>(()=>draftFrom(SAVED_RESHAPE['flatten-cylinder']));
  const [sample,setSample]=useState<ReshapeSample>(()=>
    sampleReshape(SAVED_RESHAPE['flatten-cylinder']));
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const mode=sample.params.mode,details=presets[mode];
  const choose=(nextMode:ReshapeMode)=>{
    setDraft(draftFrom(SAVED_RESHAPE[nextMode]));
    setSample(sampleReshape(SAVED_RESHAPE[nextMode]));
    setError('');setActive(0);
  };
  const edit=(key:keyof Draft,value:string)=>{
    const next={...draft,[key]:value};setDraft(next);
    try{setSample(sampleReshape(fromDraft(mode,next)));setError('');}
    catch(cause){setError((cause as Error).message);}
  };
  const at=Math.min(active,sample.parameterValues.length-1);
  const u=sample.parameterValues[at];
  const source=reshapeFrame(sample.params,'source',u),target=reshapeFrame(sample.params,'target',u);
  return <TessDialog title="第 45 节 · 柱面重塑保存例" onClose={onClose}>
    <div className="curved-generic-reshape-dialog native-darboux-saved-reshape">
      <aside className="rgd-controls">
        <label className="ndg-saved-mode">构造范围<select aria-label="通用Darboux构造范围" value="saved" onChange={onGeneral}>
          <option value="saved">原柱面保存解析子域</option><option value="general">原式 · 一般数值</option></select></label>
        <span className="rgd-eyebrow">01 / SAVED DARBOUX DATA</span>
        <h2>同一张带片，两种形状</h2>
        <p className="rgd-intro">固定 σ=+1，初值 b=(0,0,0)、d=(0,1,0)、t=(1,0,0)。
          选择原版两组常曲率输入。</p>
        <div className="rgd-presets" role="group" aria-label="重塑保存例">
          {(Object.keys(presets) as ReshapeMode[]).map(next=><button type="button"
            key={next} className={mode===next?'selected':''}
            aria-pressed={mode===next} onClick={()=>choose(next)}>
            <strong>{presets[next].label}</strong><small>{presets[next].subtitle}</small></button>)}
        </div>
        <div className="rgd-fields">
          <Field label="终点 u₁ / π" value={draft.parameterEndPi} min={.001} max={1}
            onChange={value=>edit('parameterEndPi',value)}/>
          <Field label="母线宽度" value={draft.rulingWidth} min={.001} max={1}
            onChange={value=>edit('rulingWidth',value)}/>
          <Field label="显示采样段数" value={draft.curveSegments} min={16} max={256} step="1"
            onChange={value=>edit('curveSegments',value)}/>
        </div>
        <label className="rgd-slider" htmlFor="rgd-u">曲线位置 <strong>u={u.toFixed(3)}</strong>
          <input id="rgd-u" type="range" min="0" max={sample.parameterValues.length-1}
            value={at} onChange={event=>setActive(Number(event.target.value))}/></label>
        <label className="rgd-slider" htmlFor="rgd-azimuth">视角方位 <strong>{azimuth}°</strong>
          <input id="rgd-azimuth" type="range" min="-80" max="80" value={azimuth}
            onChange={event=>setAzimuth(Number(event.target.value))}/></label>
        <div className="rgd-readout"><span>法曲率 κn</span><strong>{details.curvatures}</strong></div>
        <div className="rgd-readout"><span>第一基本形式</span><strong>E=1 · F=0 · G=1</strong></div>
        {error&&<p className="rgd-error" role="alert">{error} 图示保留上一个有效参数。</p>}
      </aside>
      <main className="rgd-results">
        <div className="rgd-heading"><div><span>02 / SOURCE → TARGET</span>
          <h3>{details.label}</h3></div><small>{details.cells}</small></div>
        <div className="rgd-panels">
          {(['source','target'] as ReshapeStage[]).map(stage=><section key={stage}
            className={`rgd-panel ${stage}`}>
            <header><span>{stage==='source'?'原曲面':'重塑后'}</span>
              <strong>{details[stage]}</strong></header>
            <SurfacePlot sample={sample} stage={stage} active={at} azimuth={azimuth}/>
            <footer><span>κn = {stage==='source'?source.normalCurvature:target.normalCurvature}</span>
              <span>正则面积 = 1</span></footer>
          </section>)}
        </div>
        <div className="rgd-note"><strong>解析等距曲面 · 只读</strong>
          <span>两侧连续度量相同，且全带无焦线。数值保存例经 NDSolve 与插值；
            本地直接计算闭式，不声称复现 Wolfram 数值 Out。采样弦长不等距，
            因此不提供精确直折痕 FOLD 或可采用工程。</span></div>
        <footer className="rgd-footer"><span>预览不修改当前作品或撤销记录。</span>
          <button type="button" className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}

export default function CurvedGenericCylinderReshapeDialog({onClose}:{onClose:()=>void}){
  const [general,setGeneral]=useState(true);
  return general?<CurvedNativeGenericDarbouxDialog kind="reshape" onClose={onClose} onSaved={()=>setGeneral(false)}/>:
    <SavedGenericCylinderReshapeDialog onClose={onClose} onGeneral={()=>setGeneral(true)}/>;
}
