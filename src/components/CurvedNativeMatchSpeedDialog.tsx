import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {MATCH_SPEED_NATIVE_PRESET,validateNativeMatchSpeedQuery,fetchNativeMatchSpeedWhenIdle,
  type NativeMatchSpeedQuery,type NativeMatchSpeedResult} from '../app/curvedNativeMatchSpeed';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeMatchSpeedDialog.css';
type Query=NativeMatchSpeedQuery;type Result=NativeMatchSpeedResult;type Point=[number,number];
const makeDraft=(q:Query)=>({source:[...q.sourceCurve],target:[...q.targetCurve],initial:String(q.initialParameter),
  start:String(q.parameterStart),end:String(q.parameterEnd),segments:String(q.segments)});
type Draft=ReturnType<typeof makeDraft>;type NumericKey='initial'|'start'|'end'|'segments';
const path=(ps:Point[])=>ps.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function Drawing({result,active,xAxis,yAxis,original}:{result:Result;active:number;xAxis:number;yAxis:number;original:boolean}){
  const rows=result.sample.rows,project=(p:number[]):Point=>[p[xAxis]??0,p[yAxis]??0],
    source=rows.map(r=>project(r.normalizedSourcePoint)),target=rows.map(r=>project(r.normalizedMatchedTargetPoint)),
    all=[...source,...target,...(original?rows.flatMap(r=>r.normalizedOriginalTargetPoint?[project(r.normalizedOriginalTargetPoint)]:[]):[])],
    xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,
    span=Math.max(w,h)||1,pad=.1*span,at=Math.min(active,rows.length-1),originalPaths:Point[][]=[];
  if(original){let segment:Point[]=[];for(const r of rows){if(r.normalizedOriginalTargetPoint)segment.push(project(r.normalizedOriginalTargetPoint));
      else if(segment.length){originalPaths.push(segment);segment=[];}}if(segment.length)originalPaths.push(segment);}
  return <svg data-testid="native-match-speed-drawing" aria-label="源曲线与原式重参数曲线的坐标投影" role="img"
    viewBox={`${x-pad} ${y-pad} ${Math.max(w,.01*span)+2*pad} ${Math.max(h,.01*span)+2*pad}`}>
    {originalPaths.map((p,i)=><path className="nms-original" key={i} d={path(p)} vectorEffect="non-scaling-stroke"/>)}
    <path className="nms-source" d={path(source)} vectorEffect="non-scaling-stroke"/>
    <path className="nms-target" d={path(target)} vectorEffect="non-scaling-stroke"/>
    {[source[at],target[at]].map((p,i)=><circle key={i} className={i?'nms-target-point':'nms-source-point'} cx={p[0]} cy={-p[1]} r={span*.012}/>)}</svg>;
}
export default function CurvedNativeMatchSpeedDialog({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const [draft,setDraft]=useState(()=>makeDraft(MATCH_SPEED_NATIVE_PRESET)),[result,setResult]=useState<Result|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0),
    [xAxis,setXAxis]=useState(0),[yAxis,setYAxis]=useState(1),[original,setOriginal]=useState(true),
    generation=useRef(0),request=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{++generation.current;request.current?.abort();},[]);
  const input=useMemo(()=>{try{if([draft.initial,draft.start,draft.end,draft.segments].some(x=>!x.trim()))throw Error('请填完整初值、域和密度。');
      return {query:validateNativeMatchSpeedQuery({family:'match-curve-speed-native',sourceCurve:draft.source,targetCurve:draft.target,
        initialParameter:Number(draft.initial),parameterStart:Number(draft.start),parameterEnd:Number(draft.end),segments:Number(draft.segments)}),error:''};
    }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
  useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;setResult(null);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return ()=>controller.abort();}setStatus('checking');const query=input.query,
      timer=setTimeout(async()=>{try{const next=await fetchNativeMatchSpeedWhenIdle(query,AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
          if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');}
        catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
    return ()=>{clearTimeout(timer);controller.abort();};},[input]);
  const invalidate=()=>{++generation.current;request.current?.abort();setResult(null);setActive(0);setStatus('checking');setError('');},
    restore=(q:Query)=>{invalidate();setDraft(makeDraft(q));setXAxis(0);setYAxis(1);},
    editNumber=(key:NumericKey,value:string)=>{invalidate();setDraft(old=>({...old,[key]:value}));},
    editSource=(key:'source'|'target',index:number,value:string)=>{invalidate();setDraft(old=>({...old,[key]:old[key].map((s,i)=>i===index?value:s)}));},
    dimension=(key:'source'|'target',n:number)=>{invalidate();setDraft(old=>({...old,[key]:Array.from({length:n},(_,i)=>old[key][i]??'0')}));},
    number=(key:NumericKey,label:string)=><label className="nms-field" key={key}><span>{label}</span><input aria-label={`速度匹配${label}`} type="number"
      step={key==='segments'?'1':'any'} value={draft[key]} onChange={e=>editNumber(key,e.target.value)}/></label>,
    row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],maxDimension=Math.max(draft.source.length,draft.target.length),
    message=status==='error'?error:status==='checking'?'正在求解原重参数方程…':`原方程已求值 · 实际速度${result?.certification.finiteActualSpeedMatchVerified?'相同':'存在差异'}`;
  return <TessDialog title="第 45 节 · 曲线速度匹配原式" onClose={onClose}><div className="native-match-speed-dialog">
    <aside className="nms-controls"><div className="nms-vector-head">{(['source','target'] as const).map((key,i)=><label key={key}>{i?'c₂(s)':'c₁(s)'}
      <select aria-label={`速度匹配${i?'目标':'来源'}维数`} value={draft[key].length} onChange={e=>dimension(key,Number(e.target.value))}>
        {Array.from({length:8},(_,i)=><option key={i} value={i+1}>{i+1}维</option>)}</select></label>)}</div>
      <div className="nms-vectors">{(['source','target'] as const).map((key,k)=><div key={key}>{draft[key].map((s,i)=><label className="nms-expression" key={i}>
        <span>{i+1}</span><input aria-label={`速度匹配${k?'目标':'来源'}分量${i+1}`} spellCheck={false} value={s} title={s} onChange={e=>editSource(key,i,e.target.value)}/></label>)}</div>)}</div>
      <div className="nms-ranges">{number('initial','初始 ui')}{number('start','s 起点')}{number('end','s 终点')}{number('segments','显示段数')}</div>
      <p className="nms-equation" title="保留 In[3729]/In[3734] 的平方速度方程及原初值">f′|c₂′(f)|² = |c₁′|² · f(ui)=ui</p>
      <div className={`nms-status ${status}`} data-testid="native-match-speed-status" role={status==='error'?'alert':'status'} title={message}>{message}</div>
      <dl className="nms-evidence"><div><dt>平方速度方程 Δ</dt><dd>{result?.diagnostics.maximumRelativeSquaredTransportResidual.toExponential(1)??'—'}</dd></div>
        <div><dt>实际速度差</dt><dd>{result?.diagnostics.maximumRelativeActualSpeedDifference.toExponential(1)??'—'}</dd></div>
        <div><dt>当前位置 f(s)</dt><dd>{row?.mappedParameter.toPrecision(6)??'—'}</dd></div></dl>
      <div className="nms-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'曲线速度匹配原源.json')}>保存源 JSON</button>
        <button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>restore(MATCH_SPEED_NATIVE_PRESET)}>恢复原式</button>
        <input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入速度匹配源文件" onChange={async e=>{
          const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
          try{if(selected.size>16384)throw Error('源文件过大。');const next=validateNativeMatchSpeedQuery(JSON.parse(await selected.text()));if(id!==generation.current)return;restore(next);}
          catch(cause){if(id!==generation.current)return;++generation.current;setStatus('error');setResult(null);setError((cause as Error).message);}}}/></div>
    </aside><main className="nms-results"><div className="nms-view-controls">
      {(['x','y'] as const).map((axis,k)=><label key={axis}>{axis}<select aria-label={`速度匹配投影${axis}分量`} value={k?yAxis:xAxis}
        onChange={e=>(k?setYAxis:setXAxis)(Number(e.target.value))}>{Array.from({length:Math.max(2,maxDimension)},(_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>)}
      <label><input type="checkbox" aria-label="速度匹配显示原目标曲线" checked={original} onChange={e=>setOriginal(e.target.checked)}/>原 c₂</label></div>
      <section className="nms-panel"><header>源曲线与重参数曲线 · 坐标投影</header>
        {result?<Drawing result={result} active={active} xAxis={xAxis} yAxis={yAxis} original={original}/>:<div className="nms-empty">{status==='checking'?'求解中':'无有效曲线'}</div>}
        <div className="nms-position"><label>同步位置 s={row?.s.toFixed(4)??'—'}</label><input aria-label="速度匹配同步位置" type="range" min="0"
          max={result?.query.segments??32} value={result?Math.min(active,result.query.segments):0} disabled={!result} onChange={e=>setActive(Number(e.target.value))}/></div></section>
      <div className="nms-legend"><span>● 来源 c₁</span><span>● 返回 c₂(f)</span><span>┄ 原 c₂</span></div>
      <footer><span title="MatchCurveSpeed / NMatchCurveSpeed · In[3729]/In[3734]">原曲线与重参数只读预览</span><div><button onClick={onSaved}>原匹配构造</button><button onClick={onClose}>关闭</button></div></footer>
    </main></div></TessDialog>;
}
