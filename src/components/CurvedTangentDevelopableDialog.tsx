import {useEffect,useMemo,useRef,useState} from 'react';
import {
  TANGENT_DEVELOPABLE_PRESET,fetchTangentDevelopable,tangentDevelopableCurves,
  validateTangentDevelopableQuery,
  type Point2,type TangentDevelopableQuery,type TangentDevelopableResult,
  type TangentDevelopableSavedView,
} from '../app/curvedTangentDevelopable';
import {TessDialog} from './TessellationEditor';
import './CurvedTangentDevelopableDialog.css';

type NumericKey=Exclude<keyof TangentDevelopableQuery,'family'>;
type Draft=Record<NumericKey,string>;
const numericKeys:NumericKey[]=['curveSegments','rulingSegments','rulingEnd'];

function makeDraft(query:TangentDevelopableQuery):Draft{
  return Object.fromEntries(numericKeys.map(key=>[key,String(query[key])])) as Draft;
}
function parseDraft(draft:Draft):TangentDevelopableQuery{
  const input:Record<string,unknown>={family:'tangent-developable-in3913'};
  for(const key of numericKeys){
    if(!draft[key].trim())throw Error('请填完整采样参数。');
    input[key]=Number(draft[key]);
  }
  return validateTangentDevelopableQuery(input);
}
function path(points:Point2[]):string{
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(9)} ${(-y).toPrecision(9)}`).join(' ');
}
function bounds(points:Point2[]){
  const xs=points.map(point=>point[0]),ys=points.map(point=>-point[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const span=Math.max(x1-x0,y1-y0,.01),pad=span*.15;
  return {viewBox:`${x0-pad} ${y0-pad} ${Math.max(x1-x0,.01)+2*pad} ${Math.max(y1-y0,.01)+2*pad}`,
    markerRadius:span*.013};
}

function SurfaceDrawing({result,space,azimuth,active,savedView}:{result:TangentDevelopableResult;
  space:boolean;azimuth:number;active:number;savedView:TangentDevelopableSavedView}){
  const {regression,outer}=tangentDevelopableCurves(result,space,azimuth,savedView);
  const {viewBox,markerRadius}=bounds([...regression,...outer]);
  const index=Math.min(active,regression.length-1),point=regression[index];
  const step=Math.max(1,Math.round((regression.length-1)/12));
  const indices=regression.map((_,i)=>i).filter(i=>i===regression.length-1||i%step===0);
  return <svg data-testid={space?'tangent-developable-3d':'tangent-developable-2d'}
    role="img" aria-label={space?'螺旋切线可展面的三维正交投影':'切线可展面的二维展开'}
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
    <path className="ctd-surface" d={`${path([...regression,...outer.slice().reverse()])} Z`}/>
    {indices.map(i=><line key={i} className="ctd-ruling" vectorEffect="non-scaling-stroke"
      x1={regression[i][0]} y1={-regression[i][1]}
      x2={outer[i][0]} y2={-outer[i][1]}/>)}
    <path className="ctd-outer" d={path(outer)}/>
    <path className="ctd-regression" d={path(regression)}/>
    <line className="ctd-active" vectorEffect="non-scaling-stroke"
      x1={point[0]} y1={-point[1]} x2={outer[index][0]} y2={-outer[index][1]}/>
    <circle className="ctd-marker" cx={point[0]} cy={-point[1]} r={markerRadius}/>
  </svg>;
}
function NumberField({label,value,onChange,min,max,step='any'}:{label:string;value:string;
  onChange:(value:string)=>void;min:number;max:number;step?:string}){
  return <label className="ctd-field"><span>{label}</span>
    <input aria-label={label} type="number" min={min} max={max} step={step}
      value={value} onChange={event=>onChange(event.target.value)}/></label>;
}

/** One analytic surface pair. Its regression edge is singular, not a fold. */
export default function CurvedTangentDevelopableDialog({onClose}:{onClose:()=>void}){
  const [draft,setDraft]=useState<Draft>(()=>makeDraft(TANGENT_DEVELOPABLE_PRESET));
  const [result,setResult]=useState<TangentDevelopableResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'invalid'|'error'>('checking');
  const [error,setError]=useState('');
  const [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35);
  const [savedView,setSavedView]=useState<TangentDevelopableSavedView>('forward');
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
      fetchTangentDevelopable(query,signal).then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');setActive(0);
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'切线可展面查询失败。');
      });
    },140);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const edit=(key:NumericKey,value:string)=>{
    ++generation.current;setDraft(current=>({...current,[key]:value}));
  };
  const reset=()=>{++generation.current;setDraft(makeDraft(TANGENT_DEVELOPABLE_PRESET));
    setSavedView('forward');};
  const frame=result?.sample.parameterValues[Math.min(active,result.sample.parameterValues.length-1)];
  return <TessDialog title="第 45 节 · 切线可展面平展" onClose={onClose}>
    <div className="curved-tangent-developable-dialog">
      <aside className="ctd-controls">
        <div className="ctd-overline"><span>{savedView==='forward'?'3913':'3914 / 3919'} / SAVED CONSTRUCTION</span>
          <button type="button" onClick={reset}>恢复保存参数</button></div>
        <h3>一条回归边，<br/>两种曲面。</h3>
        <p>源面是单位速螺旋的切线可展面；设目标扭率为零后，得到对应的平面展开。</p>
        <div className="ctd-fields">
          <NumberField label="曲线段数" value={draft.curveSegments} min={8} max={256} step="1"
            onChange={value=>edit('curveSegments',value)}/>
          <NumberField label="母线段数" value={draft.rulingSegments} min={1} max={16} step="1"
            onChange={value=>edit('rulingSegments',value)}/>
          <NumberField label="母线终点 v" value={draft.rulingEnd} min={.05} max={1}
            onChange={value=>edit('rulingEnd',value)}/>
        </div>
        <div className="ctd-position"><label htmlFor="ctd-position">曲线位置
          <strong>{frame===undefined?'等待采样':`u=${(frame/Math.PI).toFixed(3)}π`}</strong></label>
          <input id="ctd-position" type="range" min="0"
            max={Math.max(0,(result?.sample.parameterValues.length??1)-1)}
            value={Math.min(active,Math.max(0,(result?.sample.parameterValues.length??1)-1))}
            onChange={event=>setActive(Number(event.target.value))} disabled={!result}/></div>
        <div className={`ctd-status ${status}`} role={status==='invalid'||status==='error'?'alert':'status'}
          aria-live="polite">{status==='ready'?'连续内域的等距与可展性已认证。':
            status==='checking'?'正在计算二维／三维对应点…':error}
          {result&&status!=='ready'&&<span>图示保留上次成功的查询。</span>}</div>
        <div className="ctd-source"><label>保存调用 <select aria-label="切线可展面保存调用"
          value={savedView} onChange={event=>setSavedView(event.target.value as TangentDevelopableSavedView)}>
          <option value="forward">正向 · In[3913]</option>
          <option value="reverse">反向 · In[3914]/[3919]</option>
        </select></label>
          <span>三维基点 bb(0)={savedView==='forward'?'(−√3/2, 0, 0)':'(−1, 0, 0)'}；反向仅整体平移。</span>
          <span>无可机读的 Wolfram 数值 Out</span></div>
      </aside>
      <main className="ctd-results">
        <div className="ctd-head"><div><span>CONTINUOUS ISOMETRY / 只读对照</span>
          <strong>平面展开 ↔ 空间螺旋</strong></div><code>E=1+¾v² · F=G=1</code></div>
        <div className="ctd-panels">
          <section className="ctd-panel"><header><span>01 / PLANE</span><strong>二维展开</strong></header>
            {result?<SurfaceDrawing result={result} space={false} azimuth={azimuth} active={active} savedView={savedView}/>:
              <div className="ctd-empty">等待二维对应点</div>}
            <p>目标扭率 0 · 平面圆弧的切线面</p></section>
          <section className="ctd-panel"><header><span>02 / SPACE</span><strong>三维源面</strong></header>
            {result?<SurfaceDrawing result={result} space azimuth={azimuth} active={active} savedView={savedView}/>:
              <div className="ctd-empty">等待三维对应点</div>}
            <label className="ctd-azimuth">视角 <input aria-label="切线可展面三维视角方位角"
              type="range" min="-180" max="180" value={azimuth}
              onChange={event=>setAzimuth(Number(event.target.value))}/><b>{azimuth}°</b></label>
          </section>
        </div>
        <div className="ctd-legend"><span><i className="edge"/>奇异回归边 v=0</span>
          <span><i className="ruling"/>对应母线</span><span><i className="outer"/>采样边界</span></div>
        <div className="ctd-cert"><strong>边界须分开理解</strong><span>
          v&gt;0 的连续曲面局部等距且可展；v=0 没有唯一切平面。这条边不是折痕，采样弦段不是精确 FOLD，不能采用为折痕图。</span></div>
        <footer className="ctd-footer"><span>只读预览；未检验连续部署、自碰撞或厚纸。</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
