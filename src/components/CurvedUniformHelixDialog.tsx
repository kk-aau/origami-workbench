import {useState} from 'react';
import {
  CURVED_UNIFORM_HELIX_EXAMPLE, sampleCurvedUniformHelix,
  curvedUniformHelixShapeSamples,
  type CurvedPoint2,type CurvedPoint3,type CurvedUniformHelixParams,
  type CurvedUniformHelixSample,type CurvedUniformHelixShapeSample,
} from '../app/curvedUniformHelix';
import {TessDialog} from './TessellationEditor';
import './CurvedUniformHelixDialog.css';

type Draft={radius:string;helicityAngleDeg:string;foldAngleDeg:string;
  startPi:string;endPi:string;rulingLength:string;curveSegments:string};

function toDraft(params:CurvedUniformHelixParams):Draft{
  return {radius:String(params.radius),helicityAngleDeg:String(params.helicityAngleDeg),
    foldAngleDeg:String(params.foldAngleDeg),startPi:String(params.parameterStart/Math.PI),
    endPi:String(params.parameterEnd/Math.PI),rulingLength:String(params.rulingLength),
    curveSegments:String(params.curveSegments)};
}

function sampleDraft(draft:Draft):CurvedUniformHelixSample{
  if(Object.values(draft).some(value=>!value.trim()))throw Error('请填完整所有参数。');
  return sampleCurvedUniformHelix({family:'uniform-helix-curved-fold',
    radius:Number(draft.radius),helicityAngleDeg:Number(draft.helicityAngleDeg),
    foldAngleDeg:Number(draft.foldAngleDeg),parameterStart:Number(draft.startPi)*Math.PI,
    parameterEnd:Number(draft.endPi)*Math.PI,rulingLength:Number(draft.rulingLength),
    curveSegments:Number(draft.curveSegments),rulingSegments:4});
}

function path(points:CurvedPoint2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
}

function drawingBounds(points:CurvedPoint2[]):string{
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const span=Math.max(maxX-minX,maxY-minY,.01),pad=span*.12;
  return `${minX-pad} ${minY-pad} ${Math.max(maxX-minX,.01)+2*pad} ${Math.max(maxY-minY,.01)+2*pad}`;
}

function project(point:CurvedPoint3,azimuthDeg:number):CurvedPoint2{
  const az=azimuthDeg*Math.PI/180,elevation=28*Math.PI/180;
  const x=Math.cos(az)*point[0]-Math.sin(az)*point[1];
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [x,-Math.sin(elevation)*depth+Math.cos(elevation)*point[2]];
}

function PreviewDrawing({sample,folded,azimuth,active}:{sample:CurvedUniformHelixSample;
  folded:boolean;azimuth:number;active:number}){
  const crease=sample.frames.map(frame=>folded?project(frame.foldedCrease,azimuth):frame.flatCrease);
  const left=(folded?sample.foldedLeftBoundary.map(p=>project(p,azimuth)):sample.flatLeftBoundary);
  const right=(folded?sample.foldedRightBoundary.map(p=>project(p,azimuth)):sample.flatRightBoundary);
  const bounds=drawingBounds([...crease,...left,...right]);
  const markerRadius=Math.max(Number(bounds.split(' ')[2]),Number(bounds.split(' ')[3]))*.012;
  const at=Math.min(active,crease.length-1),marker=crease[at];
  const shape=(outer:CurvedPoint2[])=>path([...crease,...outer.slice().reverse()])+' Z';
  const ruling=(outer:CurvedPoint2[],side:'left'|'right')=>sample.rulingFrameIndices.map(i=><line
    key={`${side}-${i}`} data-ruling={`${side}-${i}`}
    className={`curved-helix-ruling ${side}`} x1={crease[i][0]} y1={-crease[i][1]}
    x2={outer[i][0]} y2={-outer[i][1]} vectorEffect="non-scaling-stroke"/>);
  return <svg data-testid={folded?'curved-helix-3d':'curved-helix-2d'}
    role="img" aria-label={folded?'均匀螺旋曲折三维正交投影与两侧母线':'均匀螺旋曲折二维展开曲线与两侧母线'}
    viewBox={bounds} preserveAspectRatio="xMidYMid meet">
    <path d={shape(left)} className="curved-helix-band left"/>
    <path d={shape(right)} className="curved-helix-band right"/>
    <path d={path(left)} className="curved-helix-boundary left"/>
    <path d={path(right)} className="curved-helix-boundary right"/>
    {ruling(left,'left')}{ruling(right,'right')}
    <line className="curved-helix-active left" x1={marker[0]} y1={-marker[1]}
      x2={left[at][0]} y2={-left[at][1]} vectorEffect="non-scaling-stroke"/>
    <line className="curved-helix-active right" x1={marker[0]} y1={-marker[1]}
      x2={right[at][0]} y2={-right[at][1]} vectorEffect="non-scaling-stroke"/>
    <path d={path(crease)} className="curved-helix-crease"/>
    <circle className="curved-helix-start" cx={crease[0][0]} cy={-crease[0][1]}
      r={markerRadius*.65} vectorEffect="non-scaling-stroke"/>
    <circle className="curved-helix-marker" cx={marker[0]} cy={-marker[1]}
      r={markerRadius} vectorEffect="non-scaling-stroke"/>
  </svg>;
}

type ShapeKey=keyof Pick<CurvedUniformHelixShapeSample,
  'flatLeftCurvature'|'spatialCurvature'|'geodesicCurvature'|'torsion'|
  'flatLeftRulingAngleDeg'|'flatRightRulingAngleDeg'|
  'foldedLeftRulingAngleDeg'|'foldedRightRulingAngleDeg'|'foldAngleDeg'>;
type ShapeSeries={key:ShapeKey;label:string;color:string;dash?:string};

function ShapeChart({title,subtitle,samples,active,series,angle=false,testId}:{
  title:string;subtitle:string;samples:CurvedUniformHelixShapeSample[];
  active:number;series:ShapeSeries[];angle?:boolean;testId:string;
}){
  const values=series.flatMap(item=>samples.map(sample=>sample[item.key]));
  const low=Math.min(0,...values),high=Math.max(0,...values);
  const pad=Math.max((high-low)*.12,angle?5:.05);
  const min=angle?Math.max(0,low-pad):low-pad;
  const max=angle?Math.min(180,high+pad):high+pad;
  const x=(index:number)=>26+260*index/Math.max(1,samples.length-1);
  const y=(value:number)=>106-86*(value-min)/(max-min);
  const line=(key:ShapeKey)=>samples.map((sample,index)=>
    `${index?'L':'M'}${x(index).toFixed(2)} ${y(sample[key]).toFixed(2)}`).join(' ');
  const cursor=samples[Math.min(active,samples.length-1)];
  return <section className="curved-helix-shape-card" data-testid={testId}>
    <header><strong>{title}</strong><span>{subtitle}</span></header>
    <svg role="img" aria-label={`${title} 随参数 u 的曲线`} viewBox="0 0 300 125"
      preserveAspectRatio="none">
      {[0,.5,1].map(t=><line key={t} className="curved-helix-chart-grid"
        x1="26" x2="286" y1={20+86*t} y2={20+86*t}/>)}
      <line className="curved-helix-chart-cursor" x1={x(Math.min(active,samples.length-1))}
        x2={x(Math.min(active,samples.length-1))} y1="17" y2="108"/>
      {series.map(item=><path key={item.key} d={line(item.key)} fill="none"
        stroke={item.color} strokeWidth="2.5" strokeDasharray={item.dash}
        vectorEffect="non-scaling-stroke"/>)}
      <text x="3" y="23">{max.toFixed(angle?0:2)}</text>
      <text x="3" y="108">{min.toFixed(angle?0:2)}</text>
      <text x="26" y="121">{(samples[0].u/Math.PI).toFixed(2)}π</text>
      <text x="260" y="121">{(samples.at(-1)!.u/Math.PI).toFixed(2)}π</text>
    </svg>
    <div className="curved-helix-shape-legend">{series.map(item=><span key={item.key}>
      <i style={{background:item.color}}/>{item.label} {cursor[item.key].toFixed(angle?1:4)}{angle?'°':''}
    </span>)}</div>
  </section>;
}

function ParameterField({label,value,onChange,step='any',hint}:{label:string;value:string;
  onChange:(next:string)=>void;step?:string;hint?:string}){
  return <label className="curved-helix-field"><span>{label}</span>
    <input type="number" step={step} value={value} onChange={event=>onChange(event.target.value)}
      aria-label={label}/>{hint&&<small>{hint}</small>}
  </label>;
}

/** Read-only comparison of Origamica's paired 2D and 3D analytic examples. */
export default function CurvedUniformHelixDialog({initial,onClose}:{
  initial?:Partial<CurvedUniformHelixParams>;onClose:()=>void}){
  const preset={...CURVED_UNIFORM_HELIX_EXAMPLE,...initial,
    family:'uniform-helix-curved-fold' as const};
  const [draft,setDraft]=useState<Draft>(()=>toDraft(preset));
  const [preview,setPreview]=useState<CurvedUniformHelixSample>(()=>{
    try{return sampleCurvedUniformHelix(preset);}catch{return sampleCurvedUniformHelix(CURVED_UNIFORM_HELIX_EXAMPLE);}
  });
  const [error,setError]=useState(()=>{
    try{sampleCurvedUniformHelix(preset);return '';}catch(cause){return (cause as Error).message;}
  });
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const [view,setView]=useState<'geometry'|'shape'>('geometry');
  const change=(key:keyof Draft,value:string)=>{
    const next={...draft,[key]:value};setDraft(next);
    try{setPreview(sampleDraft(next));setError('');}
    catch(cause){setError((cause as Error).message);}
  };
  const reset=()=>{
    setDraft(toDraft(CURVED_UNIFORM_HELIX_EXAMPLE));
    setPreview(sampleCurvedUniformHelix(CURVED_UNIFORM_HELIX_EXAMPLE));
    setError('');setActive(0);setAzimuth(-35);
  };
  const frame=preview.frames[Math.min(active,preview.frames.length-1)];
  const shapes=curvedUniformHelixShapeSamples(preview);
  return <TessDialog title="均匀螺旋曲折 · 原版解析对照" onClose={onClose}>
    <div className="curved-helix-dialog">
      <aside className="curved-helix-controls">
        <div className="curved-helix-section-title"><span>01 / 参数</span><button type="button"
          onClick={reset}>恢复原版示例</button></div>
        <p className="curved-helix-summary">In[3947/3953、3962/3964/3967] 共用常角解析几何；In[3957/3958] 为形状函数。</p>
        <div className="curved-helix-fields">
          <ParameterField label="半径 r" value={draft.radius} onChange={v=>change('radius',v)}/>
          <ParameterField label="母线长度" value={draft.rulingLength} onChange={v=>change('rulingLength',v)}/>
          <ParameterField label="螺旋角 θ · °" value={draft.helicityAngleDeg} onChange={v=>change('helicityAngleDeg',v)}/>
          <ParameterField label="折角 γ · °" value={draft.foldAngleDeg} onChange={v=>change('foldAngleDeg',v)}/>
          <ParameterField label="起点 u₀ / π" value={draft.startPi} onChange={v=>change('startPi',v)}/>
          <ParameterField label="终点 u₁ / π" value={draft.endPi} onChange={v=>change('endPi',v)}/>
          <ParameterField label="曲线采样段数" value={draft.curveSegments} step="1"
            onChange={v=>change('curveSegments',v)}/>
        </div>
        <div className="curved-helix-scrub"><label htmlFor="curved-helix-position">折痕位置
          <strong>u={((frame?.u??0)/Math.PI).toFixed(3)}π</strong></label>
          <input id="curved-helix-position" type="range" min="0"
            max={preview.params.curveSegments} value={Math.min(active,preview.params.curveSegments)}
            onChange={event=>setActive(Number(event.target.value))}/>
        </div>
        <dl className="curved-helix-readouts"><div><dt>展开弧半径</dt>
          <dd>{preview.params.unfoldedCreaseRadius.toFixed(4)}</dd></div>
          <div><dt>母线焦线距离</dt><dd>{preview.params.rulingFocalDistance.toFixed(4)}</dd></div>
          <div><dt>曲线采样点</dt><dd>{preview.frames.length}</dd></div></dl>
        {error&&<p role="alert" className="curved-helix-error">{error} 图示保留上一个有效参数。</p>}
      </aside>
      <main className="curved-helix-results">
        <div className="curved-helix-heading"><div><span>02 / 原版对照</span>
          <strong>{view==='geometry'?'一条曲线，两种空间':'曲率、挠率与母线角'}</strong></div>
          <div className="curved-helix-view-switch" role="group" aria-label="均匀螺旋视图">
            <button type="button" aria-pressed={view==='geometry'} onClick={()=>setView('geometry')}>几何</button>
            <button type="button" aria-pressed={view==='shape'} onClick={()=>setView('shape')}>形状函数</button>
          </div></div>
        {view==='geometry'?<div className="curved-helix-panels">
          <section className="curved-helix-panel"><header><span>PLANE · 2D</span><strong>展开曲线</strong></header>
            <PreviewDrawing sample={preview} folded={false} azimuth={azimuth} active={active}/>
            <p>圆弧折痕与纸面两侧母线</p></section>
          <section className="curved-helix-panel"><header><span>SPACE · 3D</span><strong>曲折正交投影</strong></header>
            <PreviewDrawing sample={preview} folded azimuth={azimuth} active={active}/>
            <label className="curved-helix-azimuth">视角 <input type="range" min="-180" max="180"
              value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}
              aria-label="三维视角方位角"/><b>{azimuth}°</b></label></section>
        </div>:<div className="curved-helix-shape-grid">
          <ShapeChart title="SPACE · 3D" subtitle="曲率 / 测地曲率 / 挠率"
            samples={shapes} active={active} testId="curved-helix-shape-3d-curvature"
            series={[{key:'spatialCurvature',label:'κ',color:'#83b8f6'},
              {key:'geodesicCurvature',label:'κg',color:'#2867be'},
              {key:'torsion',label:'τ',color:'#df77d5'}]}/>
          <ShapeChart title="SPACE · 3D" subtitle="左 / 右母线角与折角"
            samples={shapes} active={active} angle testId="curved-helix-shape-3d-angle"
            series={[{key:'foldedLeftRulingAngleDeg',label:'ρL',color:'#e88271'},
              {key:'foldedRightRulingAngleDeg',label:'ρR',color:'#78c29b',dash:'5 3'},
              {key:'foldAngleDeg',label:'γ',color:'#bd83d9',dash:'2 3'}]}/>
          <ShapeChart title="PLANE · 2D" subtitle="左曲率"
            samples={shapes} active={active} testId="curved-helix-shape-2d-curvature"
            series={[{key:'flatLeftCurvature',label:'κl',color:'#2867be'}]}/>
          <ShapeChart title="PLANE · 2D" subtitle="左 / 右母线角与折角"
            samples={shapes} active={active} angle testId="curved-helix-shape-2d-angle"
            series={[{key:'flatLeftRulingAngleDeg',label:'ρL',color:'#e88271'},
              {key:'flatRightRulingAngleDeg',label:'ρR',color:'#78c29b',dash:'5 3'},
              {key:'foldAngleDeg',label:'γ',color:'#bd83d9',dash:'2 3'}]}/>
        </div>}
        {view==='geometry'?<div className="curved-helix-legend"><span><i className="crease"/>曲线折痕</span>
          <span><i className="left"/>左母线</span><span><i className="right"/>右母线</span>
          <small>光标可在左栏选择同一参数位置</small></div>:<p className="curved-helix-shape-note">
          In[3957] 解析形状函数；In[3958] 的插值误差未当作连续几何。均匀螺旋的各曲线为常值。</p>}
        <div className="curved-helix-verification"><strong>连续曲面：解析等距 · 两侧可展</strong>
          <span>采样弦长仅近似；未证明连续部署、厚度或自碰撞。</span></div>
        <footer className="curved-helix-footer"><span>只读分析 · 不修改当前折痕 · 非精确直折痕 FOLD</span>
          <button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
