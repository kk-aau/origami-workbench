import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {CANONICAL_NATIVE_PRESETS,validateGenericCanonicalQuery,fetchGenericCanonicalWhenIdle,
  type GenericCanonicalQuery,type GenericCanonicalResult,type CanonicalIdentity} from '../app/curvedNativeCanonical';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeCanonicalDialog.css';

type Query=GenericCanonicalQuery;
type Result=GenericCanonicalResult;
const operationNames={cylinder:'柱面',cone:'锥面',tangent:'切线面',general:'一般规范'};
const proofName=(p:CanonicalIdentity|undefined)=>p===undefined?'—':({zero:'恒等已证',nonzero:'非恒等',unknown:'未证','not-applicable':'不适用'}[p.status]);
const regularityName=(s:string|undefined)=>s===undefined?'—':({verified:'正则已证',unknown:'未证',singular:'含奇异'}[s]??s);
const scientific=(n:number|undefined)=>n===undefined?'—':n.toExponential(1);
const makeDraft=(q:Query)=>({operation:q.operation,base:q.baseCurve.slice(),director:q.operation==='tangent'?['0','0','1']:q.director.slice(),
  start:String(q.parameterStart),end:String(q.parameterEnd),wStart:String(q.rulingStart),wEnd:String(q.rulingEnd),
  vStart:String(q.crossParameterStart),vEnd:String(q.crossParameterEnd),segments:String(q.segments),ruling:String(q.rulingSegments)});
type Draft=ReturnType<typeof makeDraft>;
type NumberField=Exclude<keyof Draft,'operation'|'base'|'director'>;
type Point=[number,number];
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function Drawing({result,which,angle,active}:{result:Result;which:'raw'|'canonical'|'cross';angle:number;active:number}){
  const grid=result[which==='raw'?'normalizedRawGrid':which==='canonical'?'normalizedCanonicalGrid':'normalizedCrossGrid'],
    a=angle*Math.PI/180,project=(p:number[]):Point=>[Math.cos(a)*p[0]-Math.sin(a)*p[2],p[1]+.34*(Math.sin(a)*p[0]+Math.cos(a)*p[2])],
    projected=grid.map(row=>row.map(project)),all=projected.flat(),xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),
    x0=Math.min(...xs),y0=Math.min(...ys),width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,span=Math.max(width,height)||1,
    pad=span*.12,first=projected.map(row=>row[0]),last=projected.map(row=>row.at(-1)!),
    at=Math.min(active,grid.length-1),step=Math.max(1,Math.ceil(result.query.segments/14)),wStep=Math.max(1,Math.ceil(result.query.rulingSegments/6));
  return <svg data-testid={`native-canonical-${which}`} role="img" aria-label={`${which==='raw'?'原来源':which==='canonical'?'规范':'Cross'}三维曲面`}
    viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
    <path className="ncan-sheet" d={path([...first,...last.slice().reverse()])+' Z'}/>
    {Array.from({length:result.query.rulingSegments-1},(_,k)=>k+1).filter(k=>k%wStep===0).map(k=>
      <path className="ncan-mesh" key={`v${k}`} d={path(projected.map(row=>row[k]))} vectorEffect="non-scaling-stroke"/>)}
    {projected.map((row,i)=>i%step===0||i===projected.length-1?<path className="ncan-ruling" key={i} d={path(row)} vectorEffect="non-scaling-stroke"/>:null)}
    <path className="ncan-edge" d={path(first)} vectorEffect="non-scaling-stroke"/><path className="ncan-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
    <path className="ncan-selected" d={path(projected[at])} vectorEffect="non-scaling-stroke"/>
  </svg>;
}

export default function CurvedNativeCanonicalDialog({onClose,onSaved}:{onClose:()=>void;onSaved:(kind:'cone-cylinder'|'tangent-general')=>void}){
  const [draft,setDraft]=useState(()=>makeDraft(CANONICAL_NATIVE_PRESETS.general)),[result,setResult]=useState<Result|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),
    [view,setView]=useState<'raw'|'canonical'>('canonical'),[active,setActive]=useState(0),[angle,setAngle]=useState(-35),
    generation=useRef(0),request=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null);
  const input=useMemo(()=>{try{
    if([...draft.base,...(draft.operation==='tangent'?[]:draft.director),draft.start,draft.end,draft.wStart,draft.wEnd,draft.vStart,draft.vEnd,draft.segments,draft.ruling].some(x=>!x.trim()))
      throw Error('请填完整原源表达式和三个独立数值域。');
    return {query:validateGenericCanonicalQuery({family:'canonical-developable-native',operation:draft.operation,baseCurve:draft.base,
      ...(draft.operation==='tangent'?{}:{director:draft.director}),parameterStart:Number(draft.start),parameterEnd:Number(draft.end),
      rulingStart:Number(draft.wStart),rulingEnd:Number(draft.wEnd),crossParameterStart:Number(draft.vStart),crossParameterEnd:Number(draft.vEnd),
      segments:Number(draft.segments),rulingSegments:Number(draft.ruling)}),error:''};
  }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
  useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;setResult(null);setActive(0);setError('');
    if(!input.query){setStatus('error');setError(input.error);return ()=>controller.abort();}
    setStatus('checking');const query=input.query,timer=setTimeout(async()=>{try{
      const next=await fetchGenericCanonicalWhenIdle(query,AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
      if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');
    }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
    return ()=>{clearTimeout(timer);controller.abort();};},[input]);
  const invalidate=()=>{++generation.current;request.current?.abort();setResult(null);setActive(0);setStatus('checking');setError('');};
  const edit=(key:NumberField,value:string)=>{invalidate();setDraft(old=>({...old,[key]:value}));};
  const editSource=(key:'base'|'director',i:number,value:string)=>{invalidate();setDraft(old=>({...old,[key]:old[key].map((x,j)=>j===i?value:x)}));};
  const restore=(q:Query)=>{invalidate();setDraft(makeDraft(q));setView('canonical');setAngle(-35);};
  const expression=(key:'base'|'director',i:number)=><label className="ncan-expression" key={`${key}${i}`}><span>{key==='base'?'b':'d'}{['ₓ','ᵧ','𝓏'][i]}</span>
    <input aria-label={`规范构造${key==='base'?'基线':'母线'}${['x','y','z'][i]}表达式`} value={draft[key][i]} spellCheck={false}
      title={draft[key][i]} onChange={e=>editSource(key,i,e.target.value)}/></label>;
  const number=(key:NumberField,label:string)=><label className="ncan-field" key={key}><span>{label}</span><input aria-label={`规范构造${label}`}
    value={draft[key]} title={draft[key]} type="number" step={key==='segments'||key==='ruling'?'1':'any'} onChange={e=>edit(key,e.target.value)}/></label>;
  const cert=result?.certification,domain=cert?.sourceDomain,arc=result?.source.canonicalBranch==='tangent',nondev=cert?.developabilityIdentity.status==='nonzero',
    statusText=status==='error'?error:status==='checking'?'正在核验原源、恒等分支与完整弧长域…':nondev?'原字面输出非可展；保留三维曲面，只读。':
      `${operationNames[result!.source.canonicalBranch==='cylinder'?'cylinder':result!.source.canonicalBranch==='cone'?'cone':'tangent']}分支；${domain?.certified?'完整源域已证':'完整源域未证'}，三维规则只读。`,
    row=result?.samples[Math.min(active,result.samples.length-1)];
  const evidence=(name:string,value:string,title?:string,warn=false)=><div className={`ncan-evidence-item ${warn?'warning':''}`} key={name} title={title}><span>{name}</span><strong>{value}</strong></div>;
  return <TessDialog title="第 45 节 · 规范可展系统·原式" onClose={onClose}><div className="native-canonical-dialog">
    <aside className="ncan-controls">
      <div className="ncan-modes"><label className="ncan-field"><span>原函数</span><select aria-label="规范构造原函数" value={draft.operation}
        onChange={e=>restore(CANONICAL_NATIVE_PRESETS[e.target.value as Query['operation']])}>
        {(['cylinder','cone','tangent','general'] as const).map(op=><option key={op} value={op}>{operationNames[op]}</option>)}</select></label>
        <button onClick={()=>onSaved(draft.operation==='cylinder'||draft.operation==='cone'?'cone-cylinder':'tangent-general')}>原保存例</button></div>
      <div className={`ncan-source-head ${draft.operation==='tangent'?'tangent':''}`}><span>基线 b(s)</span>{draft.operation!=='tangent'&&<span>母线 d(s)</span>}</div>
      <div className={`ncan-expressions ${draft.operation==='tangent'?'tangent':''}`}>
        {[0,1,2].flatMap(i=>draft.operation==='tangent'?[expression('base',i)]:[expression('base',i),expression('director',i)])}</div>
      <p className="ncan-guide" title="支持 Sin[]、Cos[]、Sqrt[]、ArcTan[]、Exp[]、Log[]、Pi 与整数幂；切线面仅有基线源。">{draft.operation==='cylinder'?'柱面母线不含 s':draft.operation==='tangent'?'切线方向由基线导数计算':'保留原母线方向'} · 三个参数域分别保存</p>
      <div className="ncan-ranges">{number('start','u 起点')}{number('end','u 终点')}{number('wStart','长度 w 起点')}{number('wEnd','长度 w 终点')}
        {number('vStart','Cross v 起点')}{number('vEnd','Cross v 终点')}{number('segments','纵向段数')}{number('ruling','横向段数')}</div>
      <div className={`ncan-status ${status} ${nondev?'warning':''}`} role={status==='error'?'alert':'status'} title={statusText} data-testid="native-canonical-status">{statusText}</div>
      <div className="ncan-evidence" data-testid="native-canonical-diagnostics">
        {evidence('规范分支',result?operationNames[result.source.canonicalBranch]:'—',result?.source.function)}
        {evidence('D′ 恒等零',proofName(cert?.cylinderBranchIdentity),cert?.cylinderBranchIdentity.method)}
        {evidence('B′ 恒等零',proofName(cert?.apexIdentity),cert?.apexIdentity.method)}
        {evidence('回归边',proofName(cert?.edgeOfRegressionIdentity),cert?.edgeOfRegressionIdentity.method)}
        {evidence('源可展',proofName(cert?.developabilityIdentity),cert?.developabilityIdentity.method,nondev)}
        {evidence('完整源域',domain?`${domain.certified?'已证':'未证'}·${domain.verifiedCells}段`:'—',domain?.reason??domain?.roundingModel)}
        {evidence('规范正则',regularityName(domain?.canonicalRegularity.status),`Jacobian 下界 ${domain?.canonicalRegularity.minimumNormalizedJacobianLowerBound??'未证'}`)}
        {evidence('Cross 正则',regularityName(domain?.crossRegularity.status),`Jacobian 下界 ${domain?.crossRegularity.minimumNormalizedJacobianLowerBound??'未证'}`)}
        {evidence('单位母线 Δ',scientific(cert?.unitDirectorFiniteMaximumError),'有限显示点单位长度误差')}
        {evidence('可展残差',scientific(cert?.finiteDevelopabilityMaximumRelativeResidual),'有限点相对残差；恒等常点基线取确切 B′=0，数值导数另保留')}
      </div>
      <div className="ncan-position"><label htmlFor="ncan-position">同步母线 <strong>u={row?.s.toFixed(4)??'—'}</strong></label><input id="ncan-position"
        aria-label="规范构造同步母线" type="range" min="0" max={result?.query.segments??32} disabled={!result} value={result?Math.min(active,result.query.segments):0}
        onChange={e=>setActive(Number(e.target.value))}/></div>
      <div className="ncan-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'规范可展系统原源.json')}>保存源 JSON</button>
        <button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>restore(CANONICAL_NATIVE_PRESETS[draft.operation])}>恢复原式</button>
        <input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入规范构造源文件" onChange={async e=>{
          const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
          try{if(selected.size>16384)throw Error('源文件过大。');const q=validateGenericCanonicalQuery(JSON.parse(await selected.text()));if(id!==generation.current)return;restore(q);}
          catch(cause){if(id!==generation.current)return;++generation.current;setStatus('error');setError((cause as Error).message);setResult(null);}}}/></div>
    </aside>
    <main className="ncan-results"><div className="ncan-topline"><div><span>CANONICAL DEVELOPABLE SYSTEM</span><strong>原三维规范规则 · 双曲面</strong></div><small>只读</small></div>
      <div className="ncan-panels"><section className="ncan-panel canonical"><header><span>DEVELOPABLE</span><select aria-label="规范构造原片规范片视图" value={view} onChange={e=>setView(e.target.value as typeof view)}>
        <option value="canonical">规范曲面</option><option value="raw">原来源曲面</option></select></header>
        {result?<Drawing result={result} which={view} angle={angle} active={active}/>:<div className="ncan-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
        <p>{view==='raw'?'原母线系数 w':'规范母线长度 w'} · {draft.wStart}…{draft.wEnd}</p></section>
        <section className="ncan-panel cross"><header><span>CROSS</span><strong>Cross 曲面</strong></header>
          {result?<Drawing result={result} which="cross" angle={angle} active={active}/>:<div className="ncan-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
          <p>{result?(arc?'原基线参数 v · 弧长差':'独立母线长度 v'):'独立第二参数 v'} · {draft.vStart}…{draft.vEnd}</p></section></div>
      <div className="ncan-view"><label>三维视角<input aria-label="规范构造三维视角" type="range" min="-180" max="180" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><b>{angle}°</b></label>
        <span><i/>同步母线</span></div>
      <div className="ncan-certification"><strong>{draft.operation==='cone'?'原锥面字面规则 · 锥顶身份单独核验':nondev?'字面原规则可计算；源非可展已证':'三维原规则 · 不声明二维展开或同一有限原片'}</strong>
        <span>积分误差、运动、碰撞及精确 FOLD 均未认证。</span></div>
      <footer className="ncan-footer"><span title={result?.source.function}>{result?.source.definitionCell??'In[3825/3829/3832/3836]'} · 原函数四个三维规则<br/>视角与母线为本地操作</span><button className="primary" onClick={onClose}>关闭</button></footer>
    </main>
  </div></TessDialog>;
}
