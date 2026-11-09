import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {download} from '../app/api';
import {fetchGenericNearWidth,GENERIC_NEAR_WIDTH_PRESET,validateGenericNearWidthQuery,
  type GenericNearWidthResult,type NearWidthQuery} from '../app/curvedGenericNearWidth';
import {projectSavedMatchedPoint,type MatchedPoint2} from '../app/curvedMatchedPair';
import {TessDialog} from './TessellationEditor';
import './CurvedGenericNearWidthDialog.css';

const fieldsFor=(q:NearWidthQuery)=>({base:[...q.baseCurve,...Array(3-q.baseCurve.length).fill('0')],
  director:[...q.director,...Array(3-q.director.length).fill('0')],dimension:q.baseCurve.length,
  start:String(q.parameterStart),end:String(q.parameterEnd),width:String(q.width),segments:String(q.segments)});
const path=(p:MatchedPoint2[])=>p.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function Drawing({result,chart,active,azimuth}:{result:GenericNearWidthResult;chart:boolean;active:number;azimuth:number}){
  const rows=result.sample.rows,project=(p:number[]):MatchedPoint2=>p.length===2?[p[0],p[1]]:projectSavedMatchedPoint(p as [number,number,number],azimuth);
  const a=rows.map(r=>chart?[r.s,r.scale] as MatchedPoint2:project(r.normalizedBase)),
    b=rows.map(r=>chart?[r.s,r.localPerpendicularDistance/result.normalization.scale] as MatchedPoint2:project(r.normalizedOuter));
  const all=[...a,...b],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x0=Math.min(...xs),y0=Math.min(...ys),
    width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,pad=Math.max(width,height,.05)*.13,index=Math.min(active,rows.length-1);
  return <svg role="img" data-testid={chart?'generic-near-width-scale':'generic-near-width-band'}
    aria-label={chart?'近恒宽比例与局部垂直距离':'通用近恒宽直纹带正交投影'}
    viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01)+2*pad} ${Math.max(height,.01)+2*pad}`}>
    {!chart&&<path className="gnw-fill" d={`${path([...a,...b.slice().reverse()])} Z`}/>}
    {!chart&&rows.filter((_,i)=>i%4===0).map((r,i)=>{const p=project(r.normalizedBase),q=project(r.normalizedOuter);
      return <line key={i} className="gnw-ruling" x1={p[0]} y1={-p[1]} x2={q[0]} y2={-q[1]} vectorEffect="non-scaling-stroke"/>;})}
    <path className="gnw-base" d={path(a)}/><path className="gnw-outer" d={path(b)}/>
    {!chart&&<line className="gnw-active" x1={a[index][0]} y1={-a[index][1]} x2={b[index][0]} y2={-b[index][1]} vectorEffect="non-scaling-stroke"/>}
    <circle className="gnw-marker" cx={a[index][0]} cy={-a[index][1]} r={pad*.08}/>
  </svg>;
}

export default function CurvedGenericNearWidthDialog({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const [fields,setFields]=useState(()=>fieldsFor(GENERIC_NEAR_WIDTH_PRESET)),[result,setResult]=useState<GenericNearWidthResult|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),
    [active,setActive]=useState(0),[azimuth,setAzimuth]=useState(-35),[importError,setImportError]=useState('');
  const generation=useRef(0),file=useRef<HTMLInputElement>(null);
  const input=useMemo(()=>{try{if([...fields.base.slice(0,fields.dimension),...fields.director.slice(0,fields.dimension),fields.start,fields.end,fields.width,fields.segments].some(x=>!x.trim()))throw Error('请填写完整函数及参数。');
    return {query:validateGenericNearWidthQuery({...GENERIC_NEAR_WIDTH_PRESET,baseCurve:fields.base.slice(0,fields.dimension),director:fields.director.slice(0,fields.dimension),
      parameterStart:Number(fields.start),parameterEnd:Number(fields.end),width:Number(fields.width),segments:Number(fields.segments)}),error:''};}
    catch(cause){return {query:null,error:(cause as Error).message};}},[fields]);
  const invalidate=()=>{++generation.current;setResult(null);setStatus('checking');setImportError('');};
  const edit=(key:'start'|'end'|'width'|'segments',value:string)=>{invalidate();setFields(x=>({...x,[key]:value}));};
  const functionEdit=(key:'base'|'director',i:number,value:string)=>{invalidate();setFields(x=>({...x,[key]:x[key].map((v,k)=>k===i?value:v)}));};
  useEffect(()=>{const id=++generation.current,controller=new AbortController();setResult(null);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return;}setStatus('checking');const query=input.query;
    const timer=setTimeout(async()=>{try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]);let next:GenericNearWidthResult;
      for(;;){try{next=await fetchGenericNearWidth(query,signal);break;}catch(cause){if(signal.aborted||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;await new Promise(r=>setTimeout(r,200));}}
      if(id!==generation.current||controller.signal.aborted)return;setResult(next!);setStatus('ready');}
      catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
    return ()=>{clearTimeout(timer);controller.abort();};},[input]);
  const row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)];
  return <TessDialog title="通用近恒宽比例 · 第45节" onClose={onClose}><div className="generic-near-width-dialog">
    <aside className="gnw-controls">
      <div className="gnw-mode"><select aria-label="近恒宽构造范围" value="generic" onChange={()=>onSaved()}><option value="generic">自定义曲线与母线</option><option value="saved">原版保存输入</option></select>
        <button onClick={()=>{invalidate();setFields(fieldsFor(GENERIC_NEAR_WIDTH_PRESET));}}>恢复</button></div>
      <label className="gnw-dimension">维数<select aria-label="近恒宽曲线维数" value={fields.dimension} onChange={e=>{invalidate();setFields(x=>({...x,dimension:Number(e.target.value)}));}}><option value="2">二维</option><option value="3">三维</option></select></label>
      <div className="gnw-functions">{(['base','director'] as const).map(key=><div key={key} className="gnw-function-row" style={{'--gnw-dimension':fields.dimension} as CSSProperties}>
        {Array.from({length:fields.dimension},(_,i)=><label key={i}>{key==='base'?'基线':'母线'} {'xyz'[i]}<input aria-label={`近恒宽${key==='base'?'基线':'母线'}${'xyz'[i]}表达式`} spellCheck={false} value={fields[key][i]} onChange={e=>functionEdit(key,i,e.target.value)}/></label>)}</div>)}</div>
      <p className="gnw-guide">变量 s；支持 Sin[s]、Pi、^。母线方向按输入保留。</p>
      <div className="gnw-numbers">{([['start','s 起点'],['end','s 终点'],['width','宽度倍率'],['segments','显示段数']] as const).map(([key,label])=><label key={key}>{label}<input type="number" aria-label={`通用近恒宽${label}`} step={key==='segments'?1:.01} value={fields[key]} onChange={e=>edit(key,e.target.value)}/></label>)}</div>
      <div className={`gnw-status ${status}`} role="status" data-testid="generic-near-width-status">{status==='error'?error:status==='checking'?'正在计算原式比例并检查完整参数区间…':result?.certification.fullDomainFormulaCertified?'完整区间内比例函数有定义。':'区间验证尚未闭合；保留真实数值只读图。'}</div>
      <dl className="gnw-values"><div><dt>比例 ws(s)</dt><dd>{row?row.scale.toFixed(6):'—'}</dd></div><div><dt>有向母线长度</dt><dd>{row?row.rulingLength.toPrecision(6):'—'}</dd></div><div><dt>局部垂直距离</dt><dd>{row?row.localPerpendicularDistance.toPrecision(6):'—'}</dd></div></dl>
      <label className="gnw-position">同步位置 <b>{row?row.s.toFixed(4):'—'}</b><input aria-label="通用近恒宽参数位置" type="range" min="0" max={result?.query.segments??64} disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></label>
      <div className="gnw-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'通用近恒宽参数.json')}>保存参数</button><button onClick={()=>file.current?.click()}>载入参数</button>
        <input hidden ref={file} type="file" accept=".json,application/json" aria-label="载入通用近恒宽参数文件" onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;
          try{if(selected.size>16384)throw Error('参数文件超过容量。');const query=validateGenericNearWidthQuery(JSON.parse(await selected.text()));invalidate();setFields(fieldsFor(query));}
          catch(cause){setImportError((cause as Error).message);}}}/></div>
      <div className="gnw-import-error" role={importError?'alert':undefined}>{importError}</div>
    </aside>
    <main className="gnw-results"><header><strong>曲线与母线 → 原式比例</strong><span>{fields.dimension}D · 只读</span></header>
      <div className="gnw-panels"><section><header>{fields.dimension===3?'三维直纹带 · 正交投影':'二维直纹带'}</header>{result?<Drawing result={result} chart={false} active={active} azimuth={azimuth}/>:<div className="gnw-empty">{status==='checking'?'计算中':'无有效图像'}</div>}
        <label className="gnw-azimuth">视角<input aria-label="近恒宽三维方位角" type="range" min="-180" max="180" disabled={fields.dimension===2} value={azimuth} onChange={e=>setAzimuth(Number(e.target.value))}/><b>{azimuth}°</b></label></section>
        <section><header>比例 ws ／ 归一化局部垂直距离</header>{result?<Drawing result={result} chart active={active} azimuth={azimuth}/>:<div className="gnw-empty">{status==='checking'?'计算中':'无有效图像'}</div>}<p>金色为原式比例，青色为局部垂直距离。</p></section></div>
      <p className="gnw-note">母线为单位向量时，局部垂直宽度等于宽度倍率的绝对值。弯曲基线到边线的最近距离可能变化；此比例函数不保证纸带无自交或曲面可展。</p>
      <footer><span>近恒宽比例 · 非精确折痕图</span><button className="primary" onClick={onClose}>关闭</button></footer>
    </main></div></TessDialog>;
}
