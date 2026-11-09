import {useEffect,useMemo,useRef,useState} from 'react';
import {
  CURVED_RIBBON_PAIR_PRESET,fetchCurvedRibbonPair,ribbonCurves,
  validateCurvedRibbonPairQuery,
  type CurvedRibbonPairQuery,type CurvedRibbonPairResult,type Point2,
} from '../app/curvedRibbonPair';
import {TessDialog} from './TessellationEditor';
import './CurvedSavedPairDialog.css';
import './CurvedRibbonPairDialog.css';

type NumericKey=keyof CurvedRibbonPairQuery;
type Draft=Record<NumericKey,string>;
const numericKeys:NumericKey[]=['radius','pitch','etaPi','orientation','parameterStartPi',
  'parameterEndPi','halfWidth','curveSegments','rulingSegments'];
function makeDraft(query:CurvedRibbonPairQuery):Draft{
  return Object.fromEntries(numericKeys.map(key=>[key,String(query[key])])) as Draft;
}
function parseDraft(draft:Draft):CurvedRibbonPairQuery{
  const input:Record<string,number>={};
  for(const key of numericKeys){
    if(!draft[key].trim())throw Error('请填完整带片参数。');
    input[key]=Number(draft[key]);
  }
  return validateCurvedRibbonPairQuery(input);
}
function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
}
function viewBounds(points:Point2[]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.01),pad=span*.14;
  return {viewBox:`${x0-pad} ${y0-pad} ${Math.max(x1-x0,.01)+2*pad} ${Math.max(y1-y0,.01)+2*pad}`,
    markerRadius:span*.014};
}
function RibbonDrawing({result,space,azimuth,active}:{result:CurvedRibbonPairResult;
  space:boolean;azimuth:number;active:number}){
  const {base,minus,plus}=ribbonCurves(result,space,azimuth);
  const {viewBox,markerRadius}=viewBounds([...base,...minus,...plus]);
  const at=Math.min(active,base.length-1),step=Math.max(1,Math.round((base.length-1)/14));
  const indices=base.map((_,i)=>i).filter(i=>i===base.length-1||i%step===0);
  return <svg data-testid={space?'curved-ribbon-3d':'curved-ribbon-2d'} role="img"
    aria-label={space?'三维螺旋连续直纹带正交投影':'二维展开连续直纹带'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path d={`${path(minus)} ${path(plus.slice().reverse())} Z`} className="crp-band"/>
    {indices.map(i=><line key={i} className="crp-ruling" vectorEffect="non-scaling-stroke"
      x1={minus[i][0]} y1={-minus[i][1]} x2={plus[i][0]} y2={-plus[i][1]}/>)}
    <line className="crp-active" vectorEffect="non-scaling-stroke"
      x1={minus[at][0]} y1={-minus[at][1]} x2={plus[at][0]} y2={-plus[at][1]}/>
    <path d={path(minus)} className="crp-boundary minus"/>
    <path d={path(plus)} className="crp-boundary plus"/>
    <path d={path(base)} className="crp-base"/>
    <circle cx={base[at][0]} cy={-base[at][1]} r={markerRadius} className="crp-marker"/>
  </svg>;
}
function NumberField({label,value,onChange,min,max,step='any'}:{label:string;value:string;
  onChange:(value:string)=>void;min:number;max:number;step?:string}){
  return <label className="csp-field"><span>{label}</span><input type="number" min={min} max={max}
    step={step} value={value} onChange={event=>onChange(event.target.value)} aria-label={label}/></label>;
}

/** Read-only comparison of a single continuous ribbon, never a fold adoption UI. */
export default function CurvedRibbonPairDialog({onClose}:{onClose:()=>void}){
  const [draft,setDraft]=useState<Draft>(()=>makeDraft(CURVED_RIBBON_PAIR_PRESET));
  const [result,setResult]=useState<CurvedRibbonPairResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'error'|'invalid'>('checking');
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const generation=useRef(0);
  const validation=useMemo(()=>{
    try{return {query:parseDraft(draft),error:''};}
    catch(cause){return {query:null,error:(cause as Error).message};}
  },[draft]);
  useEffect(()=>{
    if(!validation.query){setStatus('invalid');setError(validation.error);return;}
    const query=validation.query,id=++generation.current,controller=new AbortController();
    setStatus('checking');setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      fetchCurvedRibbonPair(query,signal).then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');setActive(0);
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'直纹带查询失败。');
      });
    },140);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const edit=(key:NumericKey,value:string)=>{
    ++generation.current;setDraft(current=>({...current,[key]:value}));
  };
  const reset=()=>{++generation.current;setDraft(makeDraft(CURVED_RIBBON_PAIR_PRESET));setActive(0);};
  const current=result?.sample.parameters[result.sample.baseIndices[Math.min(active,result.sample.baseIndices.length-1)]];
  return <TessDialog title="第 45 节 · 螺旋直纹带配对" onClose={onClose}>
    <div className="curved-saved-pair-dialog curved-ribbon-pair-dialog">
      <aside className="csp-controls">
        <div className="csp-heading-small"><span>01 / 已认证解析子域</span>
          <button type="button" onClick={reset}>恢复 In[3855/3859]</button></div>
        <p className="csp-intro">RibbonPair / NRibbonPair：一张连续直纹带的二维展开与三维曲面对应点。</p>
        <div className="csp-fields">
          <NumberField label="螺旋半径 r" value={draft.radius} min={.25} max={4}
            onChange={value=>edit('radius',value)}/>
          <NumberField label="每弧度螺距 h" value={draft.pitch} min={.05} max={2}
            onChange={value=>edit('pitch',value)}/>
          <NumberField label="曲面角 η / π" value={draft.etaPi} min={.05} max={.45}
            onChange={value=>edit('etaPi',value)}/>
          <label className="csp-select">母线朝向<select aria-label="直纹带母线朝向"
            value={draft.orientation} onChange={event=>edit('orientation',event.target.value)}>
            <option value="1">+1</option><option value="-1">−1</option>
          </select></label>
          <NumberField label="起点 s₀ / π" value={draft.parameterStartPi} min={-2} max={2}
            onChange={value=>edit('parameterStartPi',value)}/>
          <NumberField label="终点 s₁ / π" value={draft.parameterEndPi} min={-2} max={2}
            onChange={value=>edit('parameterEndPi',value)}/>
          <NumberField label="带片半宽" value={draft.halfWidth} min={.05} max={2}
            onChange={value=>edit('halfWidth',value)}/>
          <NumberField label="曲线段数" value={draft.curveSegments} min={16} max={256} step="1"
            onChange={value=>edit('curveSegments',value)}/>
          <NumberField label="母线段数 · 偶数" value={draft.rulingSegments} min={2} max={20} step="2"
            onChange={value=>edit('rulingSegments',value)}/>
        </div>
        <div className="csp-position"><label htmlFor="crp-position">基线位置
          <strong>{current?`s=${(current[0]/Math.PI).toFixed(3)}π`:'等待采样'}</strong></label>
          <input id="crp-position" type="range" min="0"
            max={Math.max(0,(result?.sample.baseIndices.length??1)-1)}
            value={Math.min(active,Math.max(0,(result?.sample.baseIndices.length??1)-1))}
            onChange={event=>setActive(Number(event.target.value))} disabled={!result}/></div>
        <div className={`csp-status ${status}`} role={status==='invalid'||status==='error'?'alert':'status'}
          aria-live="polite">{status==='ready'?`连续等距、可展；焦线距离 ${result?.sample.focalDistance.toFixed(3)}。`:
            status==='checking'?'正在认证直纹带…':error}
          {result&&status!=='ready'&&<span>图示保留上次认证结果。</span>}</div>
      </aside>
      <main className="csp-results">
        <div className="csp-topline"><div><span>02 / 同参数双视图</span>
          <strong>二维展开 ↔ 三维直纹带</strong></div>
          <small>In[3855] / In[3859] · 无可机读 Wolfram Out</small></div>
        <div className="csp-panels">
          <section className="csp-panel"><header><span>PLANE · 2D</span><strong>展开带片</strong></header>
            {result?<RibbonDrawing result={result} space={false} azimuth={azimuth} active={active}/>:
              <div className="csp-empty">等待二维采样</div>}
            <p>两条边界、基线与横向母线</p></section>
          <section className="csp-panel"><header><span>SPACE · 3D</span><strong>正交投影</strong></header>
            {result?<RibbonDrawing result={result} space azimuth={azimuth} active={active}/>:
              <div className="csp-empty">等待三维采样</div>}
            <label className="csp-azimuth">视角 <input type="range" min="-180" max="180"
              aria-label="直纹带三维视角方位角" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label></section>
        </div>
        <div className="csp-legend"><span><i className="crp-base-key"/>共同基线</span>
          <span><i className="crp-minus-key"/>负半宽边</span>
          <span><i className="crp-plus-key"/>正半宽边</span></div>
        <div className="csp-certification"><strong>单条连续直纹带 · 只读对照</strong>
          <span>基线不是折痕。采样弦段非精确等距，不是精确直折痕 FOLD，不能采用为折痕图；连续部署路径与自碰撞未验证。</span></div>
        <footer className="csp-footer"><span>此预览不会修改当前工作区或作品。</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
