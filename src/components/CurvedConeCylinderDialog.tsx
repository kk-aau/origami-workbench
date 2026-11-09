import {useState} from 'react';
import {
  CONE_TO_CYLINDER_EXAMPLE,CYLINDER_TO_CONE_EXAMPLE,
  sampleSurfaceConversion,surfaceConversionPoint,
  type SurfaceConversionKind,type SurfaceConversionParams,
  type SurfaceConversionSample,type SurfacePoint2,type SurfacePoint3,
} from '../app/curvedConeCylinder';
import {TessDialog} from './TessellationEditor';
import './CurvedConeCylinderDialog.css';

type Draft={startPi:string;endPi:string;coneAngleDeg:string;cylinderAxisOffset:string};
const preset=(kind:SurfaceConversionKind):SurfaceConversionParams=>
  kind==='cylinder-to-cone'?CYLINDER_TO_CONE_EXAMPLE:CONE_TO_CYLINDER_EXAMPLE;
const toDraft=(params:SurfaceConversionParams):Draft=>({
  startPi:String(params.parameterStart/Math.PI),
  endPi:String(params.parameterEnd/Math.PI),
  coneAngleDeg:String(params.coneAngleDeg),
  cylinderAxisOffset:String(params.cylinderAxisOffset),
});
function sampleDraft(kind:SurfaceConversionKind,draft:Draft):SurfaceConversionSample{
  const fields=kind==='cone-to-cylinder'
    ?[draft.startPi,draft.endPi,draft.coneAngleDeg,draft.cylinderAxisOffset]
    :[draft.startPi,draft.endPi];
  if(fields.some(value=>!value.trim()))throw Error('请填写完整当前构造的参数。');
  return sampleSurfaceConversion({...preset(kind),
    parameterStart:Number(draft.startPi)*Math.PI,
    parameterEnd:Number(draft.endPi)*Math.PI,
    coneAngleDeg:kind==='cone-to-cylinder'?Number(draft.coneAngleDeg):30,
    cylinderAxisOffset:kind==='cone-to-cylinder'?Number(draft.cylinderAxisOffset):.25,
  });
}

const project=(point:SurfacePoint3,azimuth:number):SurfacePoint2=>{
  const az=azimuth*Math.PI/180,elevation=27*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
};
const svgPath=(points:SurfacePoint2[]):string=>
  points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function bounds(points:SurfacePoint2[]):{viewBox:string;marker:number}{
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const width=Math.max(right-left,.05),height=Math.max(bottom-top,.05);
  const pad=Math.max(width,height)*.12;
  return {viewBox:`${left-pad} ${top-pad} ${width+2*pad} ${height+2*pad}`,
    marker:Math.max(width,height)*.012};
}

function ConversionDrawing({sample,folded,azimuth,active}:{sample:SurfaceConversionSample;
  folded:boolean;azimuth:number;active:number}){
  const transform=(point:SurfacePoint2|SurfacePoint3):SurfacePoint2=>
    folded?project(point as SurfacePoint3,azimuth):point as SurfacePoint2;
  const first=sample.frames.map(frame=>transform(folded?frame.bb1:frame.b1));
  const crease=sample.frames.map(frame=>transform(folded?frame.ff:frame.f));
  const second=sample.frames.map(frame=>transform(folded?frame.bb2:frame.b2));
  const {viewBox,marker}=bounds([...first,...crease,...second]);
  const index=Math.min(active,crease.length-1);
  const panelPath=(a:SurfacePoint2[],b:SurfacePoint2[])=>
    svgPath([...a,...b.slice().reverse()])+' Z';
  const rulings=(a:SurfacePoint2[],b:SurfacePoint2[],side:'first'|'second')=>
    sample.rulingFrameIndices.map(i=><line key={`${side}-${i}`}
      className={`curve-conversion-ruling ${side}`}
      x1={a[i][0]} y1={-a[i][1]} x2={b[i][0]} y2={-b[i][1]}
      vectorEffect="non-scaling-stroke"/>);
  return <svg data-testid={folded?'curve-conversion-3d':'curve-conversion-2d'}
    role="img" aria-label={folded?'原版曲面转换三维正交投影':'原版曲面转换二维展开图'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path className="curve-conversion-face first" d={panelPath(first,crease)}/>
    <path className="curve-conversion-face second" d={panelPath(crease,second)}/>
    {rulings(first,crease,'first')}{rulings(crease,second,'second')}
    <path className="curve-conversion-edge first" d={svgPath(first)}/>
    <path className="curve-conversion-edge second" d={svgPath(second)}/>
    <line className="curve-conversion-active first" x1={first[index][0]} y1={-first[index][1]}
      x2={crease[index][0]} y2={-crease[index][1]} vectorEffect="non-scaling-stroke"/>
    <line className="curve-conversion-active second" x1={crease[index][0]} y1={-crease[index][1]}
      x2={second[index][0]} y2={-second[index][1]} vectorEffect="non-scaling-stroke"/>
    <path className="curve-conversion-crease" d={svgPath(crease)}/>
    <circle className="curve-conversion-marker" cx={crease[index][0]} cy={-crease[index][1]}
      r={marker} vectorEffect="non-scaling-stroke"/>
    <circle className="curve-conversion-apex" cx={(sample.singularBoundary[0]==='first'?first:second)[0][0]}
      cy={-(sample.singularBoundary[0]==='first'?first:second)[0][1]}
      r={marker*.8} vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function NumberField({label,value,onChange,hint}:{label:string;value:string;
  onChange:(next:string)=>void;hint?:string}){
  return <label className="curve-conversion-field"><span>{label}</span>
    <input type="number" step="any" value={value} aria-label={label}
      onChange={event=>onChange(event.target.value)}/>{hint&&<small>{hint}</small>}</label>;
}

/** Read-only saved examples of the source cone/cylinder ruled-surface API. */
export default function CurvedConeCylinderDialog({onClose}:{onClose:()=>void}){
  const [kind,setKind]=useState<SurfaceConversionKind>('cylinder-to-cone');
  const [draft,setDraft]=useState<Draft>(()=>toDraft(CYLINDER_TO_CONE_EXAMPLE));
  const [sample,setSample]=useState<SurfaceConversionSample>(()=>
    sampleSurfaceConversion(CYLINDER_TO_CONE_EXAMPLE));
  const [error,setError]=useState('');
  const [active,setActive]=useState(48),[azimuth,setAzimuth]=useState(-35);
  const choose=(next:SurfaceConversionKind)=>{
    const params=preset(next);
    setKind(next);setDraft(toDraft(params));setSample(sampleSurfaceConversion(params));
    setError('');setActive(Math.round(params.curveSegments/2));
  };
  const change=(field:keyof Draft,value:string)=>{
    const next={...draft,[field]:value};setDraft(next);
    try{setSample(sampleDraft(kind,next));setError('');}
    catch(cause){setError((cause as Error).message);}
  };
  const frame=sample.frames[Math.min(active,sample.frames.length-1)];
  const close=()=>onClose();
  return <TessDialog title="圆锥 / 圆柱曲面转换 · 原版对照" onClose={close}>
    <div className="curve-conversion-dialog">
      <aside className="curve-conversion-controls">
        <div className="curve-conversion-kicker">01 / SAVED EXAMPLES</div>
        <div className="curve-conversion-switch" role="group" aria-label="曲面转换示例">
          <button type="button" className={kind==='cylinder-to-cone'?'active':''}
            aria-pressed={kind==='cylinder-to-cone'} onClick={()=>choose('cylinder-to-cone')}>
            <b>柱 → 锥</b><small>In[4047]</small></button>
          <button type="button" className={kind==='cone-to-cylinder'?'active':''}
            aria-pressed={kind==='cone-to-cylinder'} onClick={()=>choose('cone-to-cylinder')}>
            <b>锥 → 柱</b><small>In[4054]</small></button>
        </div>
        <p className="curve-conversion-intro">二维原面与三维折后面采用同一组参数。调参会立即重算两视图。</p>
        <div className="curve-conversion-fields">
          <NumberField label="起点 u₀ / π" value={draft.startPi}
            onChange={value=>change('startPi',value)}/>
          <NumberField label="终点 u₁ / π" value={draft.endPi}
            onChange={value=>change('endPi',value)}/>
          {kind==='cone-to-cylinder'&&<>
            <NumberField label="锥面半角 φ · °" value={draft.coneAngleDeg} hint="5°–30°"
              onChange={value=>change('coneAngleDeg',value)}/>
            <NumberField label="柱轴偏移 ε" value={draft.cylinderAxisOffset} hint="0–2"
              onChange={value=>change('cylinderAxisOffset',value)}/>
          </>}
        </div>
        <div className="curve-conversion-scrub"><label htmlFor="curve-conversion-position">
          折线位置 <strong>u={(frame.u/Math.PI).toFixed(3)}π</strong></label>
          <input id="curve-conversion-position" type="range" min="0"
            max={sample.params.curveSegments} value={Math.min(active,sample.params.curveSegments)}
            onChange={event=>setActive(Number(event.target.value))}/></div>
        <dl className="curve-conversion-stats">
          <div><dt>当前母线参数 v</dt><dd>{frame.sourceRulingParameter.toFixed(4)}</dd></div>
          <div><dt>折线采样点</dt><dd>{sample.frames.length}</dd></div>
          <div><dt>新面奇异边</dt><dd>{kind==='cylinder-to-cone'?'锥顶':'原锥顶'}</dd></div>
        </dl>
        <p className="curve-conversion-error" role="alert">{error||'参数限定在已证明等距且非退化的区间内。'}</p>
        <div className="curve-conversion-note"><strong>形状可自交</strong><span>原版柱到锥样例特意显示背面自交；预览不判定穿纸或厚度可行。</span></div>
      </aside>
      <main className="curve-conversion-results">
        <div className="curve-conversion-heading"><div><span>02 / PAIRED SURFACES</span>
          <strong>{kind==='cylinder-to-cone'?'柱面接锥面':'锥面接柱面'}</strong></div>
          <small>原版解析式 · 共用折线</small></div>
        <div className="curve-conversion-panels">
          <section className="curve-conversion-panel"><header><span>PLANE · 2D</span><b>展开原面</b></header>
            <ConversionDrawing sample={sample} folded={false} azimuth={azimuth} active={active}/>
            <p>二维折线与两片直纹面</p></section>
          <section className="curve-conversion-panel"><header><span>SPACE · 3D</span><b>折后目标</b></header>
            <ConversionDrawing sample={sample} folded azimuth={azimuth} active={active}/>
            <label className="curve-conversion-azimuth">视角 <input type="range" min="-180"
              max="180" value={azimuth} aria-label="三维视角方位角"
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label>
          </section>
        </div>
        <div className="curve-conversion-legend"><span><i className="old"/>已有曲面</span>
          <span><i className="new"/>构造曲面</span><span><i className="crease"/>共用折线</span>
          <span><i className="apex"/>锥顶奇异边界</span></div>
        <div className="curve-conversion-verification"><strong>连续面解析等距</strong>
          <span>采样图并非精确直折痕 FOLD；未验证自碰撞或连续折叠路径。</span></div>
        <footer className="curve-conversion-footer"><span>只读分析 · 不修改当前折痕工程</span>
          <button className="primary" onClick={close}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
