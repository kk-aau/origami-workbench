import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {CONIC_NATIVE_PRESET,CONIC_NATIVE_RULE_KEYS,validateGenericConicSectionQuery,fetchGenericConicSectionWhenIdle,
  type GenericConicSectionQuery,type GenericConicSectionResult} from '../app/curvedNativeConicSection';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeConicSectionDialog.css';

type Query=GenericConicSectionQuery;
type Result=GenericConicSectionResult;
const names={line:'直线',circle:'圆',ellipse:'椭圆',hyperbola:'双曲线','parabola-left':'左侧平行抛物线','parabola-right':'右侧平行抛物线','degenerate-line':'异号同幅退化直线'};
const ruleNames=['折痕','左直截线','左母线方向','左第一截线','左第二截线','右直截线','右母线方向','右第一截线','右第二截线'];
const makeDraft=(q:Query)=>({leftInfinite:typeof q.leftFocus==='object',rightInfinite:typeof q.rightFocus==='object',
  left:String(typeof q.leftFocus==='number'?q.leftFocus:-1),right:String(typeof q.rightFocus==='number'?q.rightFocus:1),
  hLeft:String(q.leftCross),hRight:String(q.rightCross),ranges:q.parameterRanges.map(row=>row.map(String)),segments:String(q.segments)});
type Draft=ReturnType<typeof makeDraft>;
type Point=[number,number];
const path=(points:number[][])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function Drawing({result,range,active}:{result:Result;range:number;active:number}){
  const all=result.components.flatMap(c=>c.samples.flatMap(row=>[row.normalizedRules[0],row.normalizedRules[1],row.normalizedRules[4],row.normalizedRules[5],row.normalizedRules[8]])),
    xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x0=Math.min(...xs),y0=Math.min(...ys),width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,
    span=Math.max(width,height)||1,pad=.1*span,at=Math.min(active,result.query.segments),step=Math.max(1,Math.ceil(result.query.segments/12));
  return <svg data-testid="native-conic-section-drawing" role="img" aria-label="全部独立域的原九规则圆锥曲线图"
    viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
    {result.components.map((c,index)=><g key={index} data-range-index={index}>
      {[1,3,4,5,7,8].map(k=><path key={k} data-rule={CONIC_NATIVE_RULE_KEYS[k]} className={`ncsec-cross ${[1,3,4].includes(k)?'left':'right'}`}
        d={path(c.samples.map(row=>row.normalizedRules[k]))} vectorEffect="non-scaling-stroke"/>)}
      {c.samples.map((row,i)=>i%step===0||i===c.samples.length-1?<g key={i}>
        <path className="ncsec-ruling left" d={path([row.normalizedRules[4],row.normalizedRules[0]])} vectorEffect="non-scaling-stroke"/>
        <path className="ncsec-ruling right" d={path([row.normalizedRules[0],row.normalizedRules[8]])} vectorEffect="non-scaling-stroke"/>
      </g>:null)}
      <path className="ncsec-fold" data-rule="CurvedFold2D" d={path(c.samples.map(row=>row.normalizedRules[0]))} vectorEffect="non-scaling-stroke"/>
      {index===range&&<g>{[2,6].map(k=>{const row=c.samples[at],p=row.normalizedRules[0],d=row.normalizedRules[k],end:Point=[p[0]+span*.07*d[0],p[1]+span*.07*d[1]];
        return <path key={k} data-rule={CONIC_NATIVE_RULE_KEYS[k]} className={`ncsec-direction ${k===2?'left':'right'}`} d={path([p,end])} vectorEffect="non-scaling-stroke"/>;})}
        <path className="ncsec-selected" d={path([c.samples[at].normalizedRules[4],c.samples[at].normalizedRules[0],c.samples[at].normalizedRules[8]])} vectorEffect="non-scaling-stroke"/>
      </g>}
    </g>)}
  </svg>;
}

export default function CurvedNativeConicSectionDialog({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const [draft,setDraft]=useState(()=>makeDraft(CONIC_NATIVE_PRESET)),[result,setResult]=useState<Result|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[range,setRange]=useState(0),[active,setActive]=useState(0),[rule,setRule]=useState(0),
    generation=useRef(0),request=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null);
  const input=useMemo(()=>{try{
    if([...(draft.leftInfinite?[]:[draft.left]),...(draft.rightInfinite?[]:[draft.right]),draft.hLeft,draft.hRight,draft.segments,...draft.ranges.flat()].some(x=>!x.trim()))
      throw Error('请填完整四参数与所有独立闭域。');
    return {query:validateGenericConicSectionQuery({family:'conic-section-2d-native',leftFocus:draft.leftInfinite?{infinity:-1}:Number(draft.left),
      rightFocus:draft.rightInfinite?{infinity:1}:Number(draft.right),leftCross:Number(draft.hLeft),rightCross:Number(draft.hRight),
      parameterRanges:draft.ranges.map(row=>row.map(Number)),segments:Number(draft.segments)}),error:''};
  }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
  useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;setResult(null);setRange(0);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return ()=>controller.abort();}
    setStatus('checking');const query=input.query,timer=setTimeout(async()=>{try{
      const next=await fetchGenericConicSectionWhenIdle(query,AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
      if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');
    }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
    return ()=>{clearTimeout(timer);controller.abort();};},[input]);
  const invalidate=()=>{++generation.current;request.current?.abort();setResult(null);setActive(0);setRange(0);setStatus('checking');setError('');};
  const edit=(key:Exclude<keyof Draft,'ranges'>,value:string|boolean)=>{invalidate();setDraft(old=>({...old,[key]:value}));};
  const editRange=(i:number,k:number,value:string)=>{invalidate();setDraft(old=>({...old,ranges:old.ranges.map((row,j)=>j===i?row.map((x,n)=>n===k?value:x):row)}));};
  const count=(n:number)=>{invalidate();setDraft(old=>{const ranges=old.ranges.slice(0,n);while(ranges.length<n){
    const begin=Math.min(9.4,Number(ranges.at(-1)![1])+.2);ranges.push([String(begin),String(begin+.4)]);}return {...old,ranges};});};
  const restore=(query:Query)=>{invalidate();setDraft(makeDraft(query));setRule(0);};
  const focus=(side:'left'|'right')=><label className="ncsec-field ncsec-focus" key={side}>
    <span>{side==='left'?'fL':'fR'}<select aria-label={`圆锥曲线${side==='left'?'左':'右'}焦点类型`} value={draft[side==='left'?'leftInfinite':'rightInfinite']?'infinity':'finite'}
      onChange={e=>edit(side==='left'?'leftInfinite':'rightInfinite',e.target.value==='infinity')}><option value="finite">有限</option><option value="infinity">{side==='left'?'−∞':'+∞'}</option></select></span>
    <input aria-label={`圆锥曲线${side==='left'?'左':'右'}焦点值`} type="number" step="any" value={draft[side]} disabled={draft[side==='left'?'leftInfinite':'rightInfinite']}
      onChange={e=>edit(side,e.target.value)}/></label>;
  const number=(key:'hLeft'|'hRight'|'segments',label:string)=><label className="ncsec-field"><span>{label}</span><input aria-label={`圆锥曲线${label}`} value={draft[key]}
    type="number" step={key==='segments'?'1':'any'} onChange={e=>edit(key,e.target.value)}/></label>;
  const domain=result?.domain,row=result?.components[Math.min(range,result.components.length-1)].samples[Math.min(active,result.query.segments)],point=row?.rules[rule],
    statusText=status==='error'?error:status==='checking'?'正在逐项核验九个原规则与各独立闭域…':`${names[result!.source.branch]} · ${result!.components.length}个独立域；${domain?.certified?'完整源域已证':'完整源域未证'}。`,
    diag=result?.diagnostics,scientific=(x:number|undefined)=>x===undefined?'—':x.toExponential(1),
    evidence=(label:string,value:string,detail?:string)=><div className="ncsec-evidence-item" key={label} title={detail}><span>{label}</span><strong>{value}</strong></div>;
  return <TessDialog title="第 45 节 · 圆锥曲线光学·四参数原式" onClose={onClose}><div className="native-conic-section-dialog">
    <aside className="ncsec-controls"><div className="ncsec-parameters">{focus('left')}{focus('right')}{number('hLeft','hL')}{number('hRight','hR')}</div>
      <p className="ncsec-guide">左焦点非零／−∞ · 右焦点非零／+∞ · h 符号不限</p>
      <div className="ncsec-options"><label className="ncsec-field"><span>独立闭域</span><select aria-label="圆锥曲线闭域数量" value={draft.ranges.length} onChange={e=>count(Number(e.target.value))}>
        {[1,2,3,4].map(n=><option key={n} value={n}>{n}个域</option>)}</select></label>{number('segments','每域段数')}<button onClick={onSaved}>原六保存例</button></div>
      <div className="ncsec-ranges">{draft.ranges.flatMap((pair,i)=>pair.map((value,k)=><label className="ncsec-field" key={`${i}${k}`}><span>域{i+1} {k===0?'起点':'终点'}</span>
        <input aria-label={`圆锥曲线域${i+1}${k===0?'起点':'终点'}`} value={value} type="number" step="any" onChange={e=>editRange(i,k,e.target.value)}/></label>))}</div>
      <div className={`ncsec-status ${status}`} role={status==='error'?'alert':'status'} data-testid="native-conic-section-status" title={statusText}>{statusText}</div>
      <div className="ncsec-evidence" data-testid="native-conic-section-diagnostics">
        {evidence('九规则',result?'完整求值':'—','原规则顺序保留；两个第一截线与原直截线相同')}
        {evidence('源域',domain?`${domain.certified?'已证':'未证'}·${domain.verifiedCells}段`:'—',domain?.reason??domain?.roundingModel)}
        {evidence('曲线正则',domain?(domain.foldRegularity==='verified'?'已证':'未证'):'—')}
        {evidence('圆锥曲线 Δ',scientific(diag?.maximumRelativeImplicitConicResidual),'独立隐式圆锥曲线方程有限残差')}
        {evidence('单位方向 Δ',scientific(diag?.maximumDirectorUnitError))}
        {evidence('射线共线 Δ',scientific(diag?.maximumRayCollinearityResidual))}
        {evidence('光学投影 Δ',scientific(diag?.maximumSquaredOpticalProjectionResidual),'两单位母线在单位切向上的平方投影差')}
        {evidence('跨极点连接','不连接','真实极点域拒绝；所有独立域保原输入索引和次序')}
      </div>
      <div className="ncsec-position"><label><span>同步母线</span><select aria-label="圆锥曲线选中域" value={range} disabled={!result} onChange={e=>{setRange(Number(e.target.value));setActive(0);}}>
        {draft.ranges.map((_,i)=><option key={i} value={i}>域{i+1}</option>)}</select><strong>t={row?.t.toFixed(4)??'—'}</strong></label>
        <input aria-label="圆锥曲线同步母线" type="range" min="0" max={result?.query.segments??48} value={result?Math.min(active,result.query.segments):0}
          disabled={!result} onChange={e=>setActive(Number(e.target.value))}/></div>
      <div className="ncsec-rule"><select aria-label="圆锥曲线查看规则" value={rule} onChange={e=>setRule(Number(e.target.value))}>
        {ruleNames.map((name,i)=><option key={i} value={i}>{i+1} · {name}</option>)}</select><output title={point?`[${point.join(', ')}]`:undefined}>
          {point?`[${point.map(x=>x.toPrecision(4)).join(', ')}]`:'[—, —]'}</output></div>
      <div className="ncsec-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'圆锥曲线四参数原源.json')}>保存源 JSON</button>
        <button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>restore(CONIC_NATIVE_PRESET)}>恢复原式</button>
        <input hidden ref={file} type="file" accept=".json,application/json" aria-label="载入圆锥曲线原源文件" onChange={async e=>{
          const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
          try{if(selected.size>16384)throw Error('源文件过大。');const q=validateGenericConicSectionQuery(JSON.parse(await selected.text()));if(id!==generation.current)return;restore(q);}
          catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
    </aside>
    <main className="ncsec-results"><div className="ncsec-topline"><span>CONIC SECTION · NINE ORIGINAL RULES</span><strong>全部独立域 · 原光学构造</strong></div>
      <section className="ncsec-panel"><header><span>CONIC SECTION 2D</span><strong>{result?names[result.source.branch]:'原二维九规则'}</strong></header>
        {result?<Drawing result={result} range={range} active={active}/>:<div className="ncsec-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
        <p>各域分别画线；第一／第二截线与原母线方向保留。</p></section>
      <div className="ncsec-legend"><span><i className="fold"/>原折痕</span><span><i className="left"/>左截线／母线</span><span><i className="right"/>右截线／母线</span></div>
      <div className="ncsec-certification"><strong>完整原域 · 各支保留 · 原默认字面公式</strong><span>不续接原半角极点；不声明折叠运动、碰撞或精确 FOLD。</span></div>
      <footer className="ncsec-footer"><span>ConicSection2DSystem · In[4019]<br/>方向箭头按图缩放 · 只读</span><button className="primary" onClick={onClose}>关闭</button></footer>
    </main>
  </div></TessDialog>;
}
