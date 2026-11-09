import {useEffect,useMemo,useRef,useState} from 'react';
import {CONSTANT_WIDTH_END,CONSTANT_WIDTH_PRESET,fetchConstantWidthWhenIdle,
  validateConstantWidthQuery,type ConstantWidthQuery,type ConstantWidthResult,
  type Point2} from '../app/curvedConstantWidth';
import {TessDialog} from './TessellationEditor';
import './CurvedConstantWidthDialog.css';
import CurvedGenericConstantWidthDialog from './CurvedGenericConstantWidthDialog';

type Draft={width:string;segments:string};
const draftFrom=(query:ConstantWidthQuery):Draft=>({
  width:String(query.width),segments:String(query.segments),
});
function parseDraft(draft:Draft):ConstantWidthQuery{
  if(!draft.width.trim()||!draft.segments.trim())throw Error('请填写半宽与采样段数。');
  return validateConstantWidthQuery({family:CONSTANT_WIDTH_PRESET.family,
    width:Number(draft.width),segments:Number(draft.segments)});
}
function path(points:Point2[]){
  return points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(7)} ${(-y).toFixed(7)}`).join(' ');
}
function bounds(points:Point2[]){
  const xs=points.map(point=>point[0]),ys=points.map(point=>-point[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const pad=.12;
  return `${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`;
}
function BandFigure({result,active}:{result:ConstantWidthResult;active:number}){
  const sample=result.sample,i=Math.min(active,sample.parameterValues.length-1);
  const all=[...sample.leftBoundary,...sample.rightBoundary,
    ...sample.dashedLeftDirector,...sample.dashedRightDirector];
  const step=Math.max(1,Math.round(result.query.segments/11));
  const rulers=sample.parameterValues.map((_,j)=>j)
    .filter(j=>j%step===0||j===result.query.segments);
  const from=sample.sourceCurve[i],left=sample.leftBoundary[i],right=sample.rightBoundary[i];
  return <svg data-testid="constant-width-band" role="img"
    aria-label="恒宽圆弧带：实线为垂距恒定边界，虚线为母线定长对照"
    viewBox={bounds(all)} preserveAspectRatio="xMidYMid meet">
    <path className="ccw-fill" d={`${path([...sample.leftBoundary,
      ...sample.rightBoundary.slice().reverse()])} Z`}/>
    {rulers.map(j=><line key={j} className="ccw-ruling" vectorEffect="non-scaling-stroke"
      x1={sample.leftBoundary[j][0]} y1={-sample.leftBoundary[j][1]}
      x2={sample.rightBoundary[j][0]} y2={-sample.rightBoundary[j][1]}/>)}
    <path className="ccw-dashed" d={path(sample.dashedLeftDirector)}/>
    <path className="ccw-dashed" d={path(sample.dashedRightDirector)}/>
    <path className="ccw-left" d={path(sample.leftBoundary)}/>
    <path className="ccw-right" d={path(sample.rightBoundary)}/>
    <path className="ccw-source" d={path(sample.sourceCurve)}/>
    <line className="ccw-selected" vectorEffect="non-scaling-stroke"
      x1={left[0]} y1={-left[1]} x2={right[0]} y2={-right[1]}/>
    <circle className="ccw-dot" cx={from[0]} cy={-from[1]} r=".013"/>
    <circle className="ccw-foot" cx={left[0]} cy={-left[1]} r=".011"/>
  </svg>;
}
function WidthFigure({result,active}:{result:ConstantWidthResult;active:number}){
  const sample=result.sample,i=Math.min(active,sample.parameterValues.length-1);
  const w=result.query.width,max=Math.max(...sample.leftWidthValues,w)*1.1;
  const min=Math.min(...sample.rightWidthValues,-w)*1.1;
  const x=(s:number)=>40+370*s/CONSTANT_WIDTH_END;
  const y=(v:number)=>20+240*(max-v)/(max-min);
  const makePath=(values:number[])=>values.map((v,j)=>
    `${j?'L':'M'}${x(sample.parameterValues[j]).toFixed(3)} ${y(v).toFixed(3)}`).join(' ');
  const tick=sample.parameterValues[i],left=sample.leftWidthValues[i];
  const right=sample.rightWidthValues[i];
  return <svg data-testid="constant-width-functions" role="img"
    aria-label="左右恒宽缩放函数与母线定长函数的比较"
    viewBox="0 0 440 294" preserveAspectRatio="xMidYMid meet">
    <line className="ccw-axis" x1="40" y1="20" x2="40" y2="260"/>
    <line className="ccw-axis" x1="40" y1={y(0)} x2="410" y2={y(0)}/>
    <line className="ccw-reference" x1="40" y1={y(w)} x2="410" y2={y(w)}/>
    <line className="ccw-reference" x1="40" y1={y(-w)} x2="410" y2={y(-w)}/>
    <path className="ccw-chart-left" d={makePath(sample.leftWidthValues)}/>
    <path className="ccw-chart-right" d={makePath(sample.rightWidthValues)}/>
    <line className="ccw-cursor" x1={x(tick)} y1="20" x2={x(tick)} y2="260"/>
    <circle className="ccw-chart-dot-left" cx={x(tick)} cy={y(left)} r="4"/>
    <circle className="ccw-chart-dot-right" cx={x(tick)} cy={y(right)} r="4"/>
    <text x="39" y="282">0</text><text x="375" y="282">0.35π</text>
    <text x="5" y="27">w</text><text x="414" y={y(0)+4}>0</text>
  </svg>;
}

/** Literal saved equation only; the notebook's unused tangent helpers are a diagnostic. */
export function SavedConstantWidthDialog({onClose,onGeneric}:{onClose:()=>void;onGeneric?:()=>void}){
  const [draft,setDraft]=useState<Draft>(()=>draftFrom(CONSTANT_WIDTH_PRESET));
  const [result,setResult]=useState<ConstantWidthResult|null>(null);
  const [status,setStatus]=useState<'checking'|'ready'|'invalid'|'error'>('checking');
  const [error,setError]=useState(''),[active,setActive]=useState(0);
  const generation=useRef(0);
  const validation=useMemo(()=>{
    try{return {query:parseDraft(draft),error:''};}
    catch(cause){return {query:null,error:(cause as Error).message};}
  },[draft]);
  useEffect(()=>{
    if(!validation.query){setResult(null);setStatus('invalid');setError(validation.error);return;}
    const query=validation.query,id=++generation.current,controller=new AbortController();
    setStatus('checking');setResult(null);setError('');
    const timer=window.setTimeout(()=>{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]);
      fetchConstantWidthWhenIdle(query,signal).then(next=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setResult(next);setStatus('ready');
        setActive(current=>Math.min(current,next.query.segments));
      }).catch(cause=>{
        if(id!==generation.current||controller.signal.aborted)return;
        setStatus('error');setError((cause as Error).message||'恒宽查询失败。');
      });
    },90);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[validation]);
  const edit=(field:keyof Draft,value:string)=>{
    ++generation.current;setDraft(current=>({...current,[field]:value}));
  };
  const reset=()=>{++generation.current;setDraft(draftFrom(CONSTANT_WIDTH_PRESET));setActive(0);};
  const point=result?.sample,at=point?Math.min(active,point.parameterValues.length-1):0;
  const current=point?.parameterValues[at]??0;
  return <TessDialog title="第 45 节 · 圆弧恒宽带" onClose={onClose}>
    <div className="curved-constant-width-dialog">
      <aside className="ccw-controls">
        <div className="ccw-overline"><span>3879 / SAVED FIGURE</span>
          <button type="button" onClick={reset}>恢复原值</button></div>
        {onGeneric&&<select aria-label="恒宽构造范围" value="saved" onChange={onGeneric}><option value="saved">原版圆弧保存输入</option><option value="generic">自定义二维曲线与母线</option></select>}
        <h3>沿水平母线，<br/>保持垂距。</h3>
        <p>黑线是原圆弧；青色与紫色边界保持各侧法向距离。灰色虚线只保持母线长度。</p>
        <label className="ccw-field"><span>垂直半宽</span><strong>{draft.width}</strong>
          <input aria-label="恒宽垂直半宽" type="range" min="0.02" max="0.105"
            step="0.001" value={draft.width} onChange={event=>edit('width',event.target.value)}/></label>
        <label className="ccw-field"><span>采样段数</span>
          <input aria-label="恒宽采样段数" type="number" min="16" max="256" step="1"
            value={draft.segments} onChange={event=>edit('segments',event.target.value)}/></label>
        <label className="ccw-field ccw-position"><span>查看 u = {(current/Math.PI).toFixed(3)}π</span>
          <input aria-label="恒宽查看位置" type="range" min="0"
            max={result?.query.segments??0} value={Math.min(active,result?.query.segments??0)}
            disabled={!result} onChange={event=>setActive(Number(event.target.value))}/></label>
        <div className={`ccw-status ${status}`} role={status==='invalid'||status==='error'?'alert':'status'}
          aria-live="polite">{status==='ready'?'已逐点核对原保存求根方程。':
            status==='checking'?'正在核对圆弧和左右宽度…':error}</div>
        {result&&<div className="ccw-readout">
          <span>左侧 w <b>{point?.leftWidthValues[at].toFixed(4)}</b></span>
          <span>右侧 w <b>{point?.rightWidthValues[at].toFixed(4)}</b></span>
          <span>左侧垂足 u <b>{(point!.leftFootParameters[at]/Math.PI).toFixed(3)}π</b></span>
        </div>}
        <div className="ccw-source">原版 In[3878] / In[3879]<br/>无可机读数值 Out；这里按保存方程解析采样。</div>
      </aside>
      <main className="ccw-results">
        <header className="ccw-head"><div><small>PLANAR OFFSET / 只读诊断</small>
          <strong>同一圆弧的两种“宽”</strong></div><code>b(u)=(cos u,sin u) · d=(-1,0)</code></header>
        <div className="ccw-panels">
          <section className="ccw-panel"><header><span>01 / BAND</span><strong>二维恒宽带</strong></header>
            {result?<BandFigure result={result} active={active}/>:
              <div className="ccw-empty">等待有限样本</div>}</section>
          <section className="ccw-panel"><header><span>02 / SCALE</span><strong>左右宽度函数</strong></header>
            {result?<WidthFigure result={result} active={active}/>:
              <div className="ccw-empty">等待宽度函数</div>}</section>
        </div>
        <div className="ccw-legend"><span><i className="source"/>原圆弧</span>
          <span><i className="left"/>+垂距边界</span><span><i className="right"/>−垂距边界</span>
          <span><i className="dashed"/>母线定长对照</span></div>
        <div className="ccw-note"><strong>端点源码差异</strong><span>
          求根实际沿圆继续取垂足；定义过的切线外推辅助函数未进入方程。
          {result&&<> 原值末端左侧 w={result.diagnostic.actualCircleEndpointWidth.toFixed(3)}，
            若改用文字所述切线外推则为 {result.diagnostic.unusedTangentEndpointWidth.toFixed(3)}。</>}
          {' '}仅二维诊断，不能作为精确 FOLD 或可采用折痕图。</span></div>
        <footer className="ccw-footer"><span>圆弧区间 0–0.35π · 无碰撞或制造校验</span>
          <button className="primary" type="button" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}

export default function CurvedConstantWidthDialog({onClose}:{onClose:()=>void}){
  const [mode,setMode]=useState<'generic'|'saved'>('generic');
  return mode==='generic'?<CurvedGenericConstantWidthDialog onClose={onClose} onSaved={()=>setMode('saved')}/>:
    <SavedConstantWidthDialog onClose={onClose} onGeneric={()=>setMode('generic')}/>;
}
