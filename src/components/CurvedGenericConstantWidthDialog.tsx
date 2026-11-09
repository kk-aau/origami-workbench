import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {fetchGenericConstantWidth,GENERIC_CONSTANT_WIDTH_PRESET,validateGenericConstantWidthQuery,
  type GenericConstantWidthQuery,type GenericConstantWidthResult} from '../app/curvedGenericConstantWidth';
import {TessDialog} from './TessellationEditor';
import './CurvedGenericNearWidthDialog.css';
import './CurvedGenericConstantWidthDialog.css';

type NumberKey='parameterStart'|'parameterEnd'|'signedOffset'|'footEvaluationStart'|'footEvaluationEnd'|'segments';
const numberFields:[NumberKey,string][]=[['parameterStart','s 起点'],['parameterEnd','s 终点'],['signedOffset','有向垂距'],
  ['footEvaluationStart','垂足求值起点'],['footEvaluationEnd','垂足求值终点'],['segments','显示段数']];
const draftFrom=(q:GenericConstantWidthQuery)=>({baseCurve:[...q.baseCurve],director:[...q.director],
  numbers:Object.fromEntries(numberFields.map(([k])=>[k,String(q[k])])) as Record<NumberKey,string>});
const path=(p:number[][])=>p.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function Figure({result,active,chart}:{result:GenericConstantWidthResult;active:number;chart:boolean}){
  const rows=result.sample.rows,a=rows.map(r=>chart?[r.s,r.normalizedScale]:r.normalizedBase),
    b=rows.map(r=>chart?[r.s,result.query.signedOffset/result.normalization.scale]:r.normalizedOuter),
    all=chart?[...a,...b]:[...a,...b,...rows.map(r=>r.normalizedFoot)],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),
    x0=Math.min(...xs),y0=Math.min(...ys),width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,
    pad=Math.max(width,height,.02)*.13,index=Math.min(active,rows.length-1),row=rows[index];
  return <svg role="img" aria-label={chart?'原式恒宽函数与垂距对照':'基线、恒宽边线与实际垂足'}
    data-testid={chart?'generic-constant-width-function':'generic-constant-width-band'}
    viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.005)+2*pad} ${Math.max(height,.005)+2*pad}`}>
    {!chart&&<path className="gnw-fill" d={`${path([...a,...b.slice().reverse()])} Z`}/>}
    {!chart&&rows.filter((_,i)=>i%Math.max(1,Math.floor(rows.length/12))===0).map((r,i)=><line key={i} className="gnw-ruling"
      x1={r.normalizedBase[0]} y1={-r.normalizedBase[1]} x2={r.normalizedOuter[0]} y2={-r.normalizedOuter[1]} vectorEffect="non-scaling-stroke"/>)}
    <path className="gnw-base" d={path(a)}/><path className="gnw-outer" d={path(b)}/>
    {!chart&&<><line className="gnw-active" x1={row.normalizedOuter[0]} y1={-row.normalizedOuter[1]}
      x2={row.normalizedFoot[0]} y2={-row.normalizedFoot[1]} vectorEffect="non-scaling-stroke"/>
      <circle className="gcw-foot" cx={row.normalizedFoot[0]} cy={-row.normalizedFoot[1]} r={pad*.09}/></>}
    <circle className="gnw-marker" cx={a[index][0]} cy={-a[index][1]} r={pad*.08}/>
  </svg>;
}

export default function CurvedGenericConstantWidthDialog({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const [draft,setDraft]=useState(()=>draftFrom(GENERIC_CONSTANT_WIDTH_PRESET)),[result,setResult]=useState<GenericConstantWidthResult|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0);
  const generation=useRef(0),file=useRef<HTMLInputElement>(null);
  const input=useMemo(()=>{try{
    if([...draft.baseCurve,...draft.director,...Object.values(draft.numbers)].some(s=>!s.trim()))throw Error('请填写完整函数与参数。');
    return {query:validateGenericConstantWidthQuery({...GENERIC_CONSTANT_WIDTH_PRESET,baseCurve:draft.baseCurve,director:draft.director,
      ...Object.fromEntries(numberFields.map(([k])=>[k,Number(draft.numbers[k])]))}),error:''};
  }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
  const invalidate=()=>{++generation.current;setResult(null);setStatus('checking');};
  const edit=(k:NumberKey,v:string)=>{invalidate();setDraft(d=>({...d,numbers:{...d.numbers,[k]:v}}));};
  const functionEdit=(k:'baseCurve'|'director',i:number,v:string)=>{invalidate();setDraft(d=>({...d,[k]:d[k].map((x,j)=>j===i?v:x)}));};
  useEffect(()=>{const id=++generation.current,controller=new AbortController();setResult(null);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return;}setStatus('checking');const q=input.query;
    const timer=setTimeout(async()=>{try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(65000)]);let r:GenericConstantWidthResult;
      for(;;){try{r=await fetchGenericConstantWidth(q,signal);break;}catch(cause){if(signal.aborted||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;await new Promise(resolve=>setTimeout(resolve,200));}}
      if(id!==generation.current||controller.signal.aborted)return;setResult(r!);setStatus('ready');}
      catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
    return ()=>{clearTimeout(timer);controller.abort();};},[input]);
  const row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)];
  return <TessDialog title="通用恒宽求垂足 · 第45节" onClose={onClose}><div className="generic-near-width-dialog generic-constant-width-dialog">
    <aside className="gnw-controls">
      <div className="gnw-mode"><select aria-label="恒宽构造范围" value="generic" onChange={()=>onSaved()}>
        <option value="generic">自定义二维曲线与母线</option><option value="saved">原版圆弧保存输入</option></select>
        <button onClick={()=>{invalidate();setDraft(draftFrom(GENERIC_CONSTANT_WIDTH_PRESET));}}>恢复</button></div>
      <div className="gnw-functions">{(['baseCurve','director'] as const).map(k=><div key={k} className="gnw-function-row">
        {draft[k].map((v,i)=><label key={i}>{k==='baseCurve'?'基线':'母线'} {'xy'[i]}<input
          aria-label={`恒宽${k==='baseCurve'?'基线':'母线'}${'xy'[i]}表达式`} value={v} spellCheck={false}
          onChange={e=>functionEdit(k,i,e.target.value)}/></label>)}</div>)}</div>
      <p className="gnw-guide">变量 s；支持 Sin[s]、Pi、^。保留母线原长度。</p>
      <div className="gnw-numbers">{numberFields.map(([k,label])=><label key={k}>{label}<input aria-label={`通用恒宽${label}`}
        type="number" step={k==='segments'?1:.01} value={draft.numbers[k]} onChange={e=>edit(k,e.target.value)}/></label>)}</div>
      <div className={`gnw-status ${status}`} role="status" data-testid="generic-constant-width-status">{status==='error'?error:status==='checking'?
        '正在求原式垂足并检查连续根分支…':result?.certification.fullIntervalDistanceCertified?
        '完整区间内垂距与连续根分支已验证。':'原方程数值已核对；区间证明尚未闭合。'}</div>
      <dl className="gnw-values"><div><dt>宽度函数 w(s)</dt><dd>{row?row.scale.toPrecision(6):'—'}</dd></div>
        <div><dt>实际垂足 u</dt><dd>{row?row.footParameter.toFixed(5):'—'}</dd></div>
        <div><dt>垂直距离</dt><dd>{row?row.perpendicularDistance.toPrecision(6):'—'}</dd></div></dl>
      <label className="gnw-position">同步位置 <b>{row?row.s.toFixed(4):'—'}</b><input aria-label="通用恒宽参数位置" type="range"
        min="0" max={result?.query.segments??64} disabled={!result} value={result?Math.min(active,result.query.segments):0}
        onChange={e=>setActive(Number(e.target.value))}/></label>
      <div className="gnw-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'通用恒宽参数.json')}>保存参数</button>
        <button onClick={()=>file.current?.click()}>载入参数</button><input hidden ref={file} type="file" accept=".json,application/json"
          aria-label="载入通用恒宽参数文件" onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;
            invalidate();
            try{if(selected.size>16384)throw Error('参数文件超过容量。');const q=validateGenericConstantWidthQuery(JSON.parse(await selected.text()));setDraft(draftFrom(q));}
            catch(cause){setError((cause as Error).message);setStatus('error');}}}/></div>
    </aside>
    <main className="gnw-results"><header><strong>原方程求垂足 → 宽度函数</strong><span>2D · 只读</span></header>
      <div className="gnw-panels"><section><header>基线 ／ 恒宽边线 ／ 紫色垂足</header>{result?<Figure result={result} active={active} chart={false}/>:
        <div className="gnw-empty">{status==='checking'?'计算中':'无有效图像'}</div>}<p>金色基线，青色边线，紫色实际垂线。</p></section>
        <section><header>宽度函数 w(s) ／ 有向垂距</header>{result?<Figure result={result} active={active} chart/>:
          <div className="gnw-empty">{status==='checking'?'计算中':'无有效图像'}</div>}<p>函数依母线长度变化；实际垂距保持不变。</p></section></div>
      <p className="gnw-note">垂足可越出 s 区间，按原曲线函数继续求值。垂足求值范围是本次计算范围；不改用端点切线。尚未保证为全局最近点或纸带无自交。</p>
      <footer><span>恒宽数值函数 · 非精确折痕图</span><button className="primary" onClick={onClose}>关闭</button></footer>
    </main>
  </div></TessDialog>;
}
