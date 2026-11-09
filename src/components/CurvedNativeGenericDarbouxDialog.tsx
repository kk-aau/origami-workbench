import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {GENERIC_DARBOUX_FLATTEN_PRESET,GENERIC_DARBOUX_RESHAPE_PRESET,validateGenericDarbouxQuery,fetchGenericDarbouxWhenIdle} from '../app/curvedNativeGenericDarboux';
import {TessDialog} from './TessellationEditor';
import './CurvedSavedPairDialog.css';
import './CurvedNativeGenericDarbouxDialog.css';

type Kind='flatten'|'reshape';
type Query=ReturnType<typeof validateGenericDarbouxQuery>;
type Result=Awaited<ReturnType<typeof fetchGenericDarbouxWhenIdle>>;
const presetFor=(kind:Kind)=>kind==='flatten'?GENERIC_DARBOUX_FLATTEN_PRESET:GENERIC_DARBOUX_RESHAPE_PRESET;
function makeDraft(q:Query){return {base:q.baseCurve.slice(),director:q.director.slice(),normalCurvature:'normalCurvature' in q?q.normalCurvature:'0',
 point:q.initialPoint.map(String),tangent:q.initialTangent.map(String),initialDirector:'initialDirector' in q?q.initialDirector.map(String):['0','1','0'],
 sigma:String(q.sigma),start:String(q.parameterStart),end:String(q.parameterEnd),wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),
 segments:String(q.segments),ruling:String(q.rulingSegments),ui:String(q.initialParameter),
 stepMode:q.ndsolveOptions?'explicit':'default',maxSteps:String(q.ndsolveOptions?.MaxSteps??''),maxStepSize:String(q.ndsolveOptions?.MaxStepSize??''),
 resample:q.resample===undefined?'default':String(q.resample),interpolationPoints:String(q.interpolationPoints??32),interpolationOrder:String(q.interpolationOrder??1)};}
type Draft=ReturnType<typeof makeDraft>;
type Point=[number,number];
const path=(a:Point[])=>a.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function Drawing({result,target,kind,angle,active}:{result:Result;target:boolean;kind:Kind;angle:number;active:number}){
 const space=!target||kind==='reshape',a=angle*Math.PI/180,
  project=(p:number[]):Point=>space?[Math.cos(a)*p[0]-Math.sin(a)*p[2],p[1]+.34*(Math.sin(a)*p[0]+Math.cos(a)*p[2])]:[p[0],p[1]],
  base=result.sample.rows.map(row=>project(row[target?'normalizedTargetBase':'normalizedSourceBase'])),
  points=result.grid.map(row=>row[target?'normalizedTarget':'normalizedSource']),
  first=points.map(row=>project(row[0])),last=points.map(row=>project(row.at(-1)!)),
  all=[...base,...first,...last],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x0=Math.min(...xs),y0=Math.min(...ys),
  width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,span=Math.max(width,height,1e-12),pad=span*.14,at=Math.min(active,base.length-1),
  step=Math.max(1,Math.round(result.query.segments/14)),p=base[at];
 return <svg data-testid={`native-darboux-${target?'target':'source'}`} role="img" aria-label={target?(space?'原代数实际计算的重塑三维曲面':'原初值实际计算的二维展开'):'原三维源直纹面'}
  viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
  <path className={`ndg-surface ${target?'target':'source'}`} d={path([...first,...last.slice().reverse()])+' Z'}/>
  {base.map((_,i)=>i%step===0||i===base.length-1?<line className="ndg-ruling" key={i} vectorEffect="non-scaling-stroke"
   x1={first[i][0]} y1={-first[i][1]} x2={last[i][0]} y2={-last[i][1]}/>:null)}
  <path className="ndg-edge" d={path(first)} vectorEffect="non-scaling-stroke"/><path className="ndg-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
  <path className="ndg-base" d={path(base)} vectorEffect="non-scaling-stroke"/>
  <line className="ndg-selected" vectorEffect="non-scaling-stroke" x1={first[at][0]} y1={-first[at][1]} x2={last[at][0]} y2={-last[at][1]}/>
  <circle className="ndg-marker" vectorEffect="non-scaling-stroke" cx={p[0]} cy={-p[1]} r={span*.011}/>
 </svg>;
}

export default function CurvedNativeGenericDarbouxDialog({kind,onClose,onSaved}:{kind:Kind;onClose:()=>void;onSaved:()=>void}){
 const preset=presetFor(kind),[draft,setDraft]=useState(()=>makeDraft(preset)),[result,setResult]=useState<Result|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0),
  [sourceAngle,setSourceAngle]=useState(-35),[targetAngle,setTargetAngle]=useState(-35);
 const generation=useRef(0),file=useRef<HTMLInputElement>(null);
 const input=useMemo(()=>{try{
  const values=[...draft.base,...draft.director,...draft.point,...draft.tangent,...(kind==='reshape'?[...draft.initialDirector,draft.normalCurvature]:[]),
   draft.sigma,draft.start,draft.end,draft.wStart,draft.wEnd,draft.segments,draft.ruling,draft.ui];
  if(values.some(x=>!x.trim()))throw Error('请填完整原源表达式、原初值与数值域。');
  return {query:validateGenericDarbouxQuery({family:preset.family,baseCurve:draft.base,director:draft.director,sigma:Number(draft.sigma),
   parameterStart:Number(draft.start),parameterEnd:Number(draft.end),transverseStart:Number(draft.wStart),transverseEnd:Number(draft.wEnd),
   segments:Number(draft.segments),rulingSegments:Number(draft.ruling),initialParameter:Number(draft.ui),initialPoint:draft.point.map(Number),initialTangent:draft.tangent.map(Number),
   ...(kind==='reshape'?{initialDirector:draft.initialDirector.map(Number),normalCurvature:draft.normalCurvature}:{}),
   ...(draft.stepMode==='explicit'?{ndsolveOptions:{...(draft.maxSteps.trim()?{MaxSteps:Number(draft.maxSteps)}:{}),
    ...(draft.maxStepSize.trim()?{MaxStepSize:Number(draft.maxStepSize)}:{})}}:{}),
   ...(kind==='flatten'&&draft.resample==='true'?{resample:true,interpolationPoints:Number(draft.interpolationPoints),interpolationOrder:Number(draft.interpolationOrder)}:
      kind==='flatten'&&draft.resample==='false'?{resample:false}:{})}),error:''};
 }catch(cause){return {query:null,error:(cause as Error).message};}},[draft,kind,preset.family]);
 useEffect(()=>{const id=++generation.current,controller=new AbortController();setResult(null);setActive(0);setError('');
  if(!input.query){setStatus('error');setError(input.error);return;}setStatus('checking');const q=input.query;
  const timer=setTimeout(async()=>{try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]),next=await fetchGenericDarbouxWhenIdle(q,signal);
   if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');
  }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
  return ()=>{clearTimeout(timer);controller.abort();};},[input]);
 const invalidate=()=>{++generation.current;setResult(null);setStatus('checking');setError('');};
 const edit=(key:Exclude<keyof Draft,'base'|'director'|'point'|'tangent'|'initialDirector'>,value:string)=>{invalidate();setDraft(x=>({...x,[key]:value}));};
 const editArray=(key:'base'|'director'|'point'|'tangent'|'initialDirector',i:number,value:string)=>{invalidate();setDraft(x=>({...x,[key]:x[key].map((v,j)=>j===i?value:v)}));};
 const restore=(q:Query)=>{if(q.family!==preset.family)throw Error('原函数类型与当前窗口不符。');invalidate();setDraft(makeDraft(q));setActive(0);setSourceAngle(-35);setTargetAngle(-35);};
 const component=['x','y','z'],sub=['ₓ','ᵧ','𝓏'];
 const sourceField=(key:'base'|'director',i:number)=><label className="ndg-expression" key={`${key}-${i}`}><span>{key==='base'?'b':'d'}{sub[i]}(s)</span>
  <input aria-label={`通用Darboux${key==='base'?'基线':'母线'}${component[i]}表达式`} spellCheck={false} value={draft[key][i]} onChange={e=>editArray(key,i,e.target.value)}/></label>;
 const initialField=(key:'point'|'tangent'|'initialDirector',i:number)=><label className="ndg-initial-field" key={`${key}-${i}`}><span>{key==='point'?'bᵢ':key==='tangent'?'tᵢ':'dᵢ'}{sub[i]}</span>
  <input aria-label={`通用Darboux原初值${key==='point'?'位置':key==='tangent'?'切向':'母线'}${component[i]}`} type="number" step="any"
   value={draft[key][i]} title={draft[key][i]} onChange={e=>editArray(key,i,e.target.value)}/></label>;
 const number=(key:'start'|'end'|'wStart'|'wEnd'|'segments'|'ruling'|'ui',label:string)=><label className="csp-field" key={key}><span>{label}</span>
  <input aria-label={`通用Darboux${label}`} type="number" step={key==='segments'||key==='ruling'?'1':'any'} value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
 const cert=result?.certification,domain=result?.domain,row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],
  initialMismatch=result?.initial.directorCompatible===false,initialFrameMismatch=result?.initial.frameCompatible===false;
 return <TessDialog title={`第 45 节 · 原生曲面${kind==='flatten'?'展开':'重塑'}`} onClose={onClose}>
  <div className={`curved-saved-pair-dialog native-generic-darboux-dialog ${kind}`}>
   <aside className="csp-controls">
    <div className="ndg-modes"><label className="csp-select">构造范围<select aria-label="通用Darboux构造范围" value="general" onChange={onSaved}>
     <option value="general">原式 · 一般数值</option><option value="saved">原保存解析子域</option></select></label>
     <label className="csp-select">σ · 朝向<select aria-label="通用Darboux朝向sigma" value={draft.sigma} onChange={e=>edit('sigma',e.target.value)}>
      <option value="1">+1</option><option value="-1">−1</option></select></label></div>
    <div className="ndg-expressions">{[0,1,2].flatMap(i=>[sourceField('base',i),sourceField('director',i)])}</div>
    {kind==='reshape'&&<label className="ndg-expression ndg-normal"><span>κₙ(s)</span><input aria-label="通用Darboux法曲率表达式" spellCheck={false}
     value={draft.normalCurvature} onChange={e=>edit('normalCurvature',e.target.value)}/></label>}
    <div className={`ndg-initial ${kind}`} aria-label="原函数初值输入">{Array.from({length:kind==='flatten'?2:3},(_,i)=>[
     initialField('point',i),...(kind==='reshape'?[initialField('initialDirector',i)]:[]),initialField('tangent',i)]).flat()}</div>
    <p className="ndg-guide" title="支持 Sin[]、Cos[]、Exp[]、Sqrt[]、ArcTan[]、Pi、^、相邻乘法。原母线幅度与原初值均保存。">原 d(s) 幅度保留 · 初值 sᵢ 可在共同域内。</p>
    <div className="ndg-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}
     {number('ui','初值 sᵢ')}{number('segments','纵向段数')}{number('ruling','横向段数')}</div>
    {kind==='flatten'&&<div className="ndg-resample"><label className="csp-select">原 Resample<select aria-label="通用Darboux原Resample选项"
      value={draft.resample} onChange={e=>edit('resample',e.target.value)}>
      <option value={draft.resample==='false'?'false':'default'}>连续数值恢复</option><option value="true">均匀重采样</option></select></label>
      {draft.resample==='true'&&<label className="csp-field"><span>InterpolationPoints · 间隔数</span><input aria-label="通用Darboux原InterpolationPoints"
       type="number" min="4" max="256" step="1" value={draft.interpolationPoints} onChange={e=>edit('interpolationPoints',e.target.value)}/></label>}
      {draft.resample==='true'&&<label className="csp-select">InterpolationOrder · 阶数<select aria-label="通用Darboux原InterpolationOrder"
       value={draft.interpolationOrder} onChange={e=>edit('interpolationOrder',e.target.value)}>
       <option value="1">1 · 线性</option><option value="2">2 · 局部二次</option><option value="3">3 · 局部三次</option><option value="4">4 · 局部四次</option></select></label>}
      {draft.resample==='true'&&<small>明确点数 · 两端包含，共 {Number(draft.interpolationPoints)+1} 个样本；原 Automatic 点数待确认。</small>}</div>}
    <details className="ndg-step-options"><summary>NDSolve · 原参数步数与步长</summary>
     <label className="csp-select">求解选项<select aria-label="通用Darboux原NDSolve步选项模式" value={draft.stepMode} onChange={e=>edit('stepMode',e.target.value)}>
      <option value="default">保持现有数值默认</option><option value="explicit">显式 MaxSteps／MaxStepSize</option></select></label>
     {draft.stepMode==='explicit'&&<div className="ndg-step-fields">
      <label className="csp-field"><span>MaxSteps · 成功步数</span><input aria-label="通用Darboux原MaxSteps" type="number" min="1" max="4096" step="1"
       placeholder="可省略" value={draft.maxSteps} onChange={e=>edit('maxSteps',e.target.value)}/></label>
      <label className="csp-field"><span>MaxStepSize · s 步长</span><input aria-label="通用Darboux原MaxStepSize" type="number" min=".000001" step="any"
       placeholder="可省略" value={draft.maxStepSize} onChange={e=>edit('maxStepSize',e.target.value)}/></label>
     </div>}
     <small>显式至少一项；原 s 域与初值保留，正反向共享成功步上限。AccuracyGoal／PrecisionGoal 的原世界误差范数未复现。</small>
     {result?.diagnostics.integration.stepOptions&&<code data-testid="ndg-step-usage">实际成功步 {result.diagnostics.integration.stepOptions.backwardSteps} + {result.diagnostics.integration.stepOptions.forwardSteps}；s 步长 ≤ {result.diagnostics.integration.stepOptions.effectiveMaxStepSize.toPrecision(5)}</code>}
    </details>
    <div className={`csp-status ${status}`} role={status==='error'?'alert':'status'} data-testid="native-darboux-status">{status==='error'?error:status==='ready'?
     result?.resampling?`${result.resampling.options.InterpolationOrder} 阶均匀重采样 ${result.resampling.parameters.length} 点；实际 EFG Δ ${result.diagnostics.maximumRelativeMetricDifference.toExponential(2)}，精确等距未证。`:
     initialFrameMismatch?'原初始标架未通过正交单位核验；保留原初值和实际曲面。':
     initialMismatch?'原指定初始母线不相容；保留实际计算曲面。':cert?.finiteMetricVerified===false?'原曲面度量不相容；保留实际计算曲面。':
      domain?.formalStripRegularity.status==='degenerate'?'形式带含退化边界；保留实际只读双图。':
      `${domain?.certified?'源正则区间已证':'源正则全域未证'}；${cert?.formalIsometryCertified?'精确ODE形式等距已证':'形式等距未证'}。`:'原源式与原初值正在积分、核验…'}</div>
    <div className="ndg-diagnostics" data-testid="native-darboux-diagnostics"><span>EFG Δ {result?.diagnostics.maximumRelativeMetricDifference.toExponential(2)??'—'}</span>
     <span title={result?`原初帧 Gram 残差 ${result.initial.frameGramResidual}；相容容差 ${result.initial.frameCompatibilityTolerance}`:undefined}>
      {initialFrameMismatch?`初帧 Δ ${result.initial.frameGramResidual.toExponential(2)}`:initialMismatch?`初始d残差 ${result.initial.directorResidual?.toExponential(2)??'—'}`:`源可展 ${result?.diagnostics.sourceDevelopability.status??'—'}`}</span>
     <span>源区间 {domain?.verifiedCells??'—'}；带 {domain?.formalStripRegularity.status==='verified'?'正则已证':domain?.formalStripRegularity.status==='degenerate'?'退化边界':domain?'未证':'—'}</span></div>
    <div className="csp-position"><label htmlFor="ndg-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label>
     <input id="ndg-position" aria-label="通用Darboux同步母线" type="range" min="0" max={result?.query.segments??32} disabled={!result}
      value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></div>
    <div className="ndg-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),`${kind==='flatten'?'一般展开':'一般重塑'}原源初值.json`)}>保存源 JSON</button>
     <button onClick={()=>file.current?.click()}>载入源 JSON</button><input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入通用Darboux源文件"
      onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
       try{if(selected.size>16384)throw Error('源文件过大。');const q=validateGenericDarbouxQuery(JSON.parse(await selected.text()));if(id!==generation.current)return;restore(q);}
       catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
    <button className="ndg-reset" onClick={()=>restore(preset)}>恢复非圆原式与原初值</button>
   </aside>
   <main className="csp-results"><div className="csp-topline"><div><span>{kind==='flatten'?'FLATTEN GENERIC 2D':'RESHAPE GENERIC 3D'}</span>
    <strong>{kind==='flatten'?'原三维曲面 → 二维展开':'原三维曲面 → 原式重塑'}</strong></div><small>原生数值</small></div>
    <div className="csp-panels">{[false,true].map(target=><section className={`csp-panel ${target?'target':'source'}`} key={String(target)}>
     <header><span>{target?'TARGET':'SOURCE'}</span><strong>{target?(kind==='flatten'?'二维展开':'重塑三维'):'原三维曲面'}</strong></header>
     {result?<Drawing result={result} kind={kind} target={target} angle={target?targetAngle:sourceAngle} active={active}/>:<div className="csp-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
     {!target||kind==='reshape'?<label className="csp-azimuth">视角 <input aria-label={`通用Darboux${target?'目标':'来源'}三维视角`} type="range" min="-180" max="180"
      value={target?targetAngle:sourceAngle} onChange={e=>(target?setTargetAngle:setSourceAngle)(Number(e.target.value))}/><b>{target?targetAngle:sourceAngle}°</b></label>:
      <p>原初值展开 · 同索引母线</p>}</section>)}</div>
    <div className="csp-legend"><span><i className="crease"/>基线 w=0</span><span><i className="left"/>w 起边</span><span><i className="right"/>w 终边</span></div>
    <div className="csp-certification"><strong>原函数构形 · 数值只读</strong><span>{result?.resampling?`原初值保存；采样输出的初始点相对偏差 ${result.resampling.initialNormalizedPointResidual.toExponential(2)}，切向偏差 ${result.resampling.initialTangentResidual.toExponential(2)}。${result.resampling.polynomial?`局部多项式一阶导数可跳变；原默认算法未复现。`:''}采样等距和精确FOLD未认证。`:'形式证书针对精确ODE；数值积分误差、全域单射、碰撞和精确FOLD均未认证。'}</span></div>
    <footer className="csp-footer"><span>原式、幅度、原初值完整保存；视角与母线为本地操作。</span><button className="primary" onClick={onClose}>关闭</button></footer>
   </main>
  </div>
 </TessDialog>;
}
