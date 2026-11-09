import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {fetchGenericMatched,GENERIC_MATCHED_CIRCLE_QUERY,GENERIC_MATCHED_PRESET,validateGenericMatchedQuery,
  type GenericMatchedQuery,type GenericMatchedResult} from '../app/curvedGenericMatchedPair';
import type {MatchedPairSample,MatchedPoint2,MatchedPoint3} from '../app/curvedMatchedPair';
import {TessDialog} from './TessellationEditor';
import {PairDrawing} from './CurvedMatchedPairDialog';
import './CurvedGenericMatchedPairDialog.css';

const draftFor=(q:GenericMatchedQuery)=>({cx:q.flatCurve[0],cy:q.flatCurve[1],ccx:q.spaceCurve[0],ccy:q.spaceCurve[1],ccz:q.spaceCurve[2],
  psi:String(q.psi),sigma:String(q.sigma),start:String(q.parameterStart),end:String(q.parameterEnd),
  wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),segments:String(q.segments),ruling:String(q.rulingSegments)});
type Draft=ReturnType<typeof draftFor>;

export default function CurvedGenericMatchedPairDialog({onClose,onCircular}:{onClose:()=>void;onCircular:()=>void}){
  const [draft,setDraft]=useState(()=>draftFor(GENERIC_MATCHED_PRESET)),[result,setResult]=useState<GenericMatchedResult|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),
    [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35),[importError,setImportError]=useState('');
  const generation=useRef(0),file=useRef<HTMLInputElement>(null);
  const input=useMemo(()=>{try{if(Object.values(draft).some(x=>!x.trim()))throw Error('请填写全部曲线表达式与数值参数。');
    return {query:validateGenericMatchedQuery({...GENERIC_MATCHED_PRESET,flatCurve:[draft.cx,draft.cy],spaceCurve:[draft.ccx,draft.ccy,draft.ccz],
      psi:Number(draft.psi),sigma:Number(draft.sigma),parameterStart:Number(draft.start),parameterEnd:Number(draft.end),
      transverseStart:Number(draft.wStart),transverseEnd:Number(draft.wEnd),segments:Number(draft.segments),rulingSegments:Number(draft.ruling)}),error:''};
  }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
  useEffect(()=>{const id=++generation.current,controller=new AbortController();setResult(null);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return;}setStatus('checking');const query=input.query;
    const timer=setTimeout(async()=>{try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]);let next:GenericMatchedResult;
      for(;;){try{next=await fetchGenericMatched(query,signal);break;}catch(cause){
        if(signal.aborted||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;await new Promise(r=>setTimeout(r,200));}}
      if(id!==generation.current||controller.signal.aborted)return;setResult(next!);setStatus('ready');
    }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
    return ()=>{clearTimeout(timer);controller.abort();};},[input]);
  const edit=(key:keyof Draft,value:string)=>{++generation.current;setResult(null);setStatus('checking');setImportError('');setDraft(x=>({...x,[key]:value}));};
  const restore=(q:GenericMatchedQuery)=>{++generation.current;setResult(null);setStatus('checking');setDraft(draftFor(q));setActive(0);setAzimuth(-35);setImportError('');};
  const drawing=useMemo(()=>result?{grid:result.sample.grid.map(row=>row.map(p=>({parameter:p.s,transverse:p.w,
    flat:p.normalizedFlat as MatchedPoint2,space:p.normalizedSpace as MatchedPoint3}))),
    baseline:result.sample.rows.map(p=>({parameter:p.s,transverse:0,flat:p.normalizedC as MatchedPoint2,space:p.normalizedCC as MatchedPoint3}))}:null,[result]);
  const proof=result?.diagnostics.parameterDomain,speed=result?.diagnostics.speedEquality,row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)];
  const expression=(key:keyof Draft,label:string)=><label className="cmpg-expression" key={key}><span>{label}</span>
    <input aria-label={`一般匹配${label}表达式`} value={draft[key]} spellCheck={false} onChange={e=>edit(key,e.target.value)}/></label>;
  const number=(key:keyof Draft,label:string)=><label className="csp-field" key={key}><span>{label}</span>
    <input aria-label={`一般匹配${label}`} type="number" step={key==='segments'||key==='ruling'?'2':'.01'} value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
  return <TessDialog title="第 45 节 · 一般匹配曲线双视图" onClose={onClose}>
    <div className="curved-saved-pair-dialog curved-matched-pair-dialog generic-matched-pair-dialog">
      <aside className="csp-controls">
        <label className="csp-select cmpg-mode">构造范围<select aria-label="匹配曲线构造范围" value="generic" onChange={onCircular}>
          <option value="generic">原式输入 · 一般数值匹配</option><option value="circle">圆弧解析子域</option></select></label>
        <div className="cmpg-expression-fields">{expression('cx','cₓ(s)')}{expression('cy','cᵧ(s)')}
          {expression('ccx','ccₓ(s)')}{expression('ccy','ccᵧ(s)')}{expression('ccz','cc𝓏(s)')}</div>
        <p className="cmpg-guide">共同 s；支持 Sin[s]、Log[]、Pi、^、相邻乘法。</p>
        <div className="cmpg-signs">{(['psi','sigma'] as const).map((key,i)=><label className="csp-select" key={key}>{i?'σ · 母线符号':'ψ · 法向分支'}
          <select aria-label={`一般匹配${key}`} value={draft[key]} onChange={e=>edit(key,e.target.value)}><option value="1">+1</option><option value="-1">−1</option></select></label>)}</div>
        <div className="cmpg-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}
          {number('segments','纵向段数')}{number('ruling','横向段数')}</div>
        <div className={`csp-status ${importError?'error':status}`} role={importError?'alert':'status'} data-testid="matched-generic-status">{importError|| (status==='error'?error:status==='ready'?
          `${speed?.status==='analytic'?'解析同速':speed?.status==='numerical'?'同速容差已覆盖':'同速全域未证'}；${proof?.certified?'连续有限带正则已覆盖':'正则全域未证'}。`:'正在从原式计算母线、导数与有限带…')}</div>
        <div className="cmpg-diagnostics" data-testid="matched-generic-diagnostics"><span>EFG 差 {result?result.diagnostics.maximumMetricDifference.toExponential(2):'—'}</span>
          <span>纸域 {proof?.planarPaperInjective?'单射已证':'整体单射未证'}</span><span>区间 {proof?.verifiedCells??'—'}；J 下界 {proof?.minimumJacobianLowerBound?.toExponential(2)??'—'}</span></div>
        <div className="csp-position"><label htmlFor="cmpg-position">同步母线 <strong>s={row?row.s.toFixed(4):'—'}</strong></label>
          <input id="cmpg-position" aria-label="一般匹配同步母线" type="range" min="0" max={result?.query.segments??32}
            disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></div>
        <div className="cmpg-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'一般匹配曲线源参数.json')}>保存源 JSON</button>
          <button onClick={()=>file.current?.click()}>载入源 JSON</button><input ref={file} hidden type="file" aria-label="载入一般匹配曲线源文件" accept=".json,application/json"
            onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;try{
              if(selected.size>8192)throw Error('源参数文件过大。');restore(validateGenericMatchedQuery(JSON.parse(await selected.text())));
            }catch(cause){++generation.current;setResult(null);setStatus('error');setImportError((cause as Error).message);}}}/></div>
        <div className="cmpg-restore"><button onClick={()=>restore(GENERIC_MATCHED_PRESET)}>恢复非圆输入</button>
          <button onClick={()=>restore(GENERIC_MATCHED_CIRCLE_QUERY)}>恢复 In[3865/3868]</button></div>
      </aside>
      <main className="csp-results"><div className="csp-topline"><div><span>MATCH CURVES PAIR</span><strong>共同参数 · 原生曲线匹配</strong></div><small>In[3864/3867]</small></div>
        <div className="csp-panels">{[false,true].map(space=><section className="csp-panel" key={String(space)}><header><span>{space?'SPACE · 3D':'PLANE · 2D'}</span>
          <strong>{space?'空间直纹面':'真实平面直纹带'}</strong></header>{drawing?<PairDrawing grid={drawing.grid} baseline={drawing.baseline} space={space} azimuth={azimuth} active={active}/>:
            <div className="csp-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
          {space?<label className="csp-azimuth">视角 <input aria-label="一般匹配三维视角" type="range" min="-180" max="180" value={azimuth} onChange={e=>setAzimuth(Number(e.target.value))}/><b>{azimuth}°</b></label>:
            <p>原曲线与全部横向母线 · 同索引</p>}</section>)}</div>
        <div className="csp-legend"><span><i className="cmp-base-key"/>原曲线 w=0</span><span><i className="cmp-negative-key"/>w 起边</span><span><i className="cmp-positive-key"/>w 终边</span></div>
        <div className="csp-certification"><strong>一般原函数 · 数值只读</strong><span>{speed?.status==='analytic'?'同速恒等与局部等距身份独立分级。':'有限点 EFG 核验与全域数值容差独立分级。'}
          纸域未证时保留真实曲面；三维碰撞、运动与精确直线 FOLD 未认证。</span></div>
        <footer className="csp-footer"><span>来源表达式原文保存；视角与母线均为本地操作。</span><button className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
