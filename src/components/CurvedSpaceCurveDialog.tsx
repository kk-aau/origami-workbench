import {useEffect,useMemo,useRef,useState} from 'react';
import {
  CURVED_SPACE_CURVE_PRESETS,curvedSpaceBoundaries,fetchCurvedSpaceCurveQuery,
  validateCurvedSpaceCurveQuery,
  type CurvedSpaceCurveFamily,type CurvedSpaceCurveQuery,type CurvedSpaceCurveResult,type Point2,
} from '../app/curvedSpaceCurve';
import {TessDialog} from './TessellationEditor';
import './CurvedSpaceCurveDialog.css';

type NumericKey=Exclude<keyof CurvedSpaceCurveQuery,'family'>;
type Draft={family:CurvedSpaceCurveFamily;angleMode:'constant'|'linear'}&
  Record<NumericKey,string>;
const labels:Record<CurvedSpaceCurveFamily,string>={
  'planar-circle':'平面圆 · γ 120°','circular-helix':'圆柱螺旋 · h 0.5 / γ 90°',
  'planar-ellipse':'平面椭圆 · 验证扩展',
};
function explainServerError(cause:unknown):string{
  const message=(cause as Error)?.message||'曲线折痕认证失败。';
  const focal=message.match(/(left|right) ruling width cannot be certified before its focal set/i);
  if(focal)return `${focal[1].toLowerCase()==='left'?'左':'右'}侧母线宽度无法证明位于焦线之前；请缩小宽度。`;
  return message;
}
const fields:NumericKey[]=['parameterStartPi','parameterEndPi','foldAngleStartDeg',
  'foldAngleEndDeg','orientation','rulingWidth','curveSegments','rulingSegments',
  'radius','pitchPerRadian','axisX','axisY'];
function makeDraft(query:CurvedSpaceCurveQuery):Draft{
  const values={} as Record<NumericKey,string>;
  for(const field of fields)values[field]=query[field]===undefined?'':String(query[field]);
  return {...values,family:query.family,
    angleMode:query.family==='planar-circle'&&query.foldAngleEndDeg!==query.foldAngleStartDeg?'linear':'constant'};
}
function parseDraft(draft:Draft):CurvedSpaceCurveQuery{
  const needed:NumericKey[]=['parameterStartPi','parameterEndPi','foldAngleStartDeg',
    'rulingWidth','orientation','curveSegments','rulingSegments',
    ...(draft.family==='planar-ellipse'?['axisX','axisY'] as NumericKey[]:['radius'] as NumericKey[]),
    ...(draft.family==='circular-helix'?['pitchPerRadian'] as NumericKey[]:[]),
    ...(draft.angleMode==='linear'?['foldAngleEndDeg'] as NumericKey[]:[])];
  for(const field of needed)if(!draft[field].trim())throw Error('请填完整当前曲线族的参数。');
  const input:Record<string,unknown>={family:draft.family};
  for(const field of needed)input[field]=Number(draft[field]);
  if(draft.angleMode==='constant')input.foldAngleEndDeg=input.foldAngleStartDeg;
  return validateCurvedSpaceCurveQuery(input);
}
function linePath(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
}
function boundsFor(points:Point2[]):{viewBox:string;markerRadius:number}{
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.01),pad=span*.12;
  return {viewBox:`${x0-pad} ${y0-pad} ${Math.max(x1-x0,.01)+2*pad} ${Math.max(y1-y0,.01)+2*pad}`,
    markerRadius:span*.014};
}
function CurveDrawing({result,folded,azimuth,active}:{result:CurvedSpaceCurveResult;
  folded:boolean;azimuth:number;active:number}){
  const {crease,left,right}=curvedSpaceBoundaries(result,folded,azimuth);
  const {viewBox,markerRadius}=boundsFor([...crease,...left,...right]);
  const at=Math.min(active,crease.length-1),marker=crease[at];
  const fill=(edge:Point2[])=>linePath([...crease,...edge.slice().reverse()])+' Z';
  const step=Math.max(1,Math.round((crease.length-1)/12));
  const indices=crease.map((_,i)=>i).filter(i=>i===crease.length-1||i%step===0);
  const rulings=(edge:Point2[],side:'left'|'right')=>indices.map(i=><line
    key={`${side}-${i}`} className={`csc-ruling ${side}`} vectorEffect="non-scaling-stroke"
    x1={crease[i][0]} y1={-crease[i][1]} x2={edge[i][0]} y2={-edge[i][1]}/>);
  return <svg data-testid={folded?'curved-space-3d':'curved-space-2d'}
    role="img" aria-label={folded?'空间曲线折痕的三维正交投影与母线':'曲线折痕的二维展开与母线'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path d={fill(left)} className="csc-band left"/><path d={fill(right)} className="csc-band right"/>
    <path d={linePath(left)} className="csc-boundary left"/>
    <path d={linePath(right)} className="csc-boundary right"/>
    {rulings(left,'left')}{rulings(right,'right')}
    <line className="csc-active left" vectorEffect="non-scaling-stroke" x1={marker[0]}
      y1={-marker[1]} x2={left[at][0]} y2={-left[at][1]}/>
    <line className="csc-active right" vectorEffect="non-scaling-stroke" x1={marker[0]}
      y1={-marker[1]} x2={right[at][0]} y2={-right[at][1]}/>
    <path d={linePath(crease)} className="csc-crease"/>
    <circle className="csc-origin" cx={crease[0][0]} cy={-crease[0][1]} r={markerRadius*.7}/>
    <circle className="csc-marker" cx={marker[0]} cy={-marker[1]} r={markerRadius}/>
  </svg>;
}
function NumberField({label,value,onChange,min,max,step='any'}:{label:string;value:string;
  onChange:(value:string)=>void;min:number;max:number;step?:string}){
  return <label className="csc-field"><span>{label}</span><input type="number" min={min} max={max}
    step={step} value={value} onChange={event=>onChange(event.target.value)} aria-label={label}/></label>;
}

/** Read-only paired analytic fold preview; the server certifies each query. */
export default function CurvedSpaceCurveDialog({initial,onClose}:{
  initial?:Partial<CurvedSpaceCurveQuery>;onClose:()=>void}){
  const [draft,setDraft]=useState<Draft>(()=>{
    const family=initial?.family??'planar-circle';
    return makeDraft({...CURVED_SPACE_CURVE_PRESETS[family],...initial,family});
  });
  const [result,setResult]=useState<CurvedSpaceCurveResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'error'|'invalid'>('checking');
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const generation=useRef(0),inflight=useRef<AbortController|null>(null);
  const validation=useMemo(()=>{
    try{return {query:parseDraft(draft),error:''};}
    catch(cause){return {query:null,error:(cause as Error).message};}
  },[draft]);
  useEffect(()=>{
    if(!validation.query){setStatus('invalid');setError(validation.error);return;}
    const query=validation.query,id=++generation.current,controller=new AbortController();
    inflight.current=controller;setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      fetchCurvedSpaceCurveQuery(query,signal).then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');setError('');setActive(0);
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError(explainServerError(cause));
      });
    },160);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const change=(update:Partial<Draft>)=>{
    ++generation.current;inflight.current?.abort();setStatus('checking');setError('');
    setDraft(current=>({...current,...update}));
  };
  const chooseFamily=(family:CurvedSpaceCurveFamily)=>{change(makeDraft(CURVED_SPACE_CURVE_PRESETS[family]));setActive(0);};
  const chooseMode=(mode:'constant'|'linear')=>{
    if(mode==='constant')change({angleMode:mode,foldAngleEndDeg:draft.foldAngleStartDeg});
    else change({angleMode:mode,foldAngleStartDeg:'90',foldAngleEndDeg:'96',
      parameterEndPi:'0.5',rulingWidth:'0.1'});
  };
  const edit=(key:NumericKey,value:string)=>change({[key]:value});
  const frame=result?.sample.frames[Math.min(active,result.sample.frames.length-1)];
  return <TessDialog title="通用曲线折痕 · 原版解析对照" onClose={onClose}>
    <div className="curved-space-dialog">
      <aside className="csc-controls">
        <div className="csc-section-title"><span>01 / 认证参数</span><button type="button"
          onClick={()=>chooseFamily(draft.family)}>恢复此族示例</button></div>
        <p className="csc-source">原版 FoldSpaceCurve3D / FlattenFold2D · 封闭 JSON 曲线族</p>
        <label className="csc-select-label">曲线族<select aria-label="曲线族" value={draft.family}
          onChange={event=>chooseFamily(event.target.value as CurvedSpaceCurveFamily)}>
          {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        {draft.family==='planar-circle'&&<div className="csc-angle-mode" aria-label="折角模式">
          <button type="button" className={draft.angleMode==='constant'?'selected':''}
            onClick={()=>chooseMode('constant')}>恒定折角</button>
          <button type="button" className={draft.angleMode==='linear'?'selected':''}
            onClick={()=>chooseMode('linear')}>线性变角</button></div>}
        <div className="csc-fields">
          {(draft.family!=='planar-ellipse')&&<NumberField label="半径 r" value={draft.radius}
            min={.25} max={4} onChange={v=>edit('radius',v)}/>}
          {draft.family==='circular-helix'&&<NumberField label="每弧度螺距 h" value={draft.pitchPerRadian}
            min={-4} max={4} onChange={v=>edit('pitchPerRadian',v)}/>}
          {draft.family==='planar-ellipse'&&<><NumberField label="轴参数 a" value={draft.axisX}
            min={.25} max={4} onChange={v=>edit('axisX',v)}/><NumberField label="轴参数 b" value={draft.axisY}
            min={.25} max={4} onChange={v=>edit('axisY',v)}/></>}
          <NumberField label="起点 u₀ / π" value={draft.parameterStartPi} min={-2} max={2}
            onChange={v=>edit('parameterStartPi',v)}/>
          <NumberField label="终点 u₁ / π" value={draft.parameterEndPi} min={-2} max={2}
            onChange={v=>edit('parameterEndPi',v)}/>
          <NumberField label={draft.angleMode==='linear'?'起始折角 γ₀ · °':'折角 γ · °'}
            value={draft.foldAngleStartDeg} min={0} max={180}
            onChange={v=>change({foldAngleStartDeg:v,...(draft.angleMode==='constant'?{foldAngleEndDeg:v}:{})})}/>
          {draft.angleMode==='linear'&&<NumberField label="终止折角 γ₁ · °"
            value={draft.foldAngleEndDeg} min={0} max={180}
            onChange={v=>edit('foldAngleEndDeg',v)}/>}
          <NumberField label="母线宽度" value={draft.rulingWidth} min={0} max={4}
            onChange={v=>edit('rulingWidth',v)}/>
          <label className="csc-select-label csc-orientation">曲折朝向<select value={draft.orientation}
            aria-label="曲折朝向" onChange={event=>edit('orientation',event.target.value)}>
            <option value="1">+1</option><option value="-1">−1</option></select></label>
        </div>
        <div className="csc-position"><label htmlFor="csc-position">折痕位置
          <strong>{frame?`u=${(frame.u/Math.PI).toFixed(3)}π`:'等待采样'}</strong></label>
          <input id="csc-position" type="range" min="0" max={Math.max(0,(result?.sample.frames.length??1)-1)}
            value={Math.min(active,Math.max(0,(result?.sample.frames.length??1)-1))}
            onChange={event=>setActive(Number(event.target.value))} disabled={!result}/></div>
        <div className={`csc-status ${status}`} role={status==='error'||status==='invalid'?'alert':'status'}
          aria-live="polite">{status==='ready'?'已通过连续曲面与母线宽度认证。':
            status==='checking'?'正在计算并认证解析构造…':error}
          {result&&status!=='ready'&&<span>图示保留上次已认证参数。</span>}</div>
      </aside>
      <main className="csc-results">
        <div className="csc-heading"><div><span>02 / 配对几何</span><strong>二维展开 ↔ 三维曲折</strong></div>
          <small>{result?`${labels[result.query.family]} · ${result.sample.frames.length} 点`:'等待认证结果'}</small></div>
        <div className="csc-panels">
          <section className="csc-panel"><header><span>PLANE · 2D</span><strong>展开曲线</strong></header>
            {result?<CurveDrawing result={result} folded={false} azimuth={azimuth} active={active}/>:
              <div className="csc-empty">等待已认证的二维采样</div>}
            <p>折痕、两侧边界与母线</p></section>
          <section className="csc-panel"><header><span>SPACE · 3D</span><strong>正交投影</strong></header>
            {result?<CurveDrawing result={result} folded azimuth={azimuth} active={active}/>:
              <div className="csc-empty">等待已认证的三维采样</div>}
            <label className="csc-azimuth">视角 <input type="range" min="-180" max="180"
              value={azimuth} onChange={event=>setAzimuth(Number(event.target.value))}
              aria-label="三维视角方位角"/><b>{azimuth}°</b></label></section>
        </div>
        <div className="csc-legend"><span><i className="crease"/>曲线折痕</span>
          <span><i className="left"/>左侧母线</span><span><i className="right"/>右侧母线</span></div>
        <div className="csc-certification"><strong>{result?
          `${status==='ready'?'连续曲面':'上次认证曲面'}：解析等距 · 两侧可展`:
          '等待连续曲面认证'}</strong>
          <span>采样折线仅预览，非精确直折痕 FOLD；部署路径与自碰撞未验证。</span></div>
        <footer className="csc-footer"><span>只读分析 · 不修改当前构造或画布</span>
          <button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
