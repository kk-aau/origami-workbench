import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {GENERIC_SPECIAL_CONE_PRESET,GENERIC_SPECIAL_TANDEV_PRESET,validateGenericSpecialReshapeQuery,fetchGenericSpecialReshapeWhenIdle,
 type GenericSpecialReshapeQuery,type GenericSpecialReshapeResult,type SpecialReshapeMode} from '../app/curvedNativeSpecialReshape';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeSpecialReshapeDialog.css';

type Draft={base:string[];director:string[];law:string;sigma:string;psi:string;point:string[];initialDirector:string[];normal:string[];
 start:string;end:string;wStart:string;wEnd:string;ui:string;segments:string;ruling:string};
const modeOf=(q:GenericSpecialReshapeQuery):SpecialReshapeMode=>q.family==='reshape-cone-generic-native'?'cone':'tandev';
const preset=(mode:SpecialReshapeMode)=>mode==='cone'?GENERIC_SPECIAL_CONE_PRESET:GENERIC_SPECIAL_TANDEV_PRESET;
const toDraft=(q:GenericSpecialReshapeQuery):Draft=>({base:q.baseCurve.slice(),director:q.director.slice(),law:q.family==='reshape-cone-generic-native'?q.beta:q.torsion,
 sigma:String(q.sigma),psi:String(q.psi),point:q.initialPoint.map(String),initialDirector:q.initialDirector.map(String),normal:q.initialNormal.map(String),
 start:String(q.parameterStart),end:String(q.parameterEnd),wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),ui:String(q.initialParameter),segments:String(q.segments),ruling:String(q.rulingSegments)});
const parse=(mode:SpecialReshapeMode,d:Draft)=>{const numeric=(x:string)=>{if(!x.trim())throw Error('参数不能为空。');const value=Number(x);if(!Number.isFinite(value))throw Error('数值须有限。');return value;};
 return validateGenericSpecialReshapeQuery({family:mode==='cone'?'reshape-cone-generic-native':'reshape-tandev-generic-native',baseCurve:d.base,director:d.director,
 ...(mode==='cone'?{beta:d.law}:{torsion:d.law}),sigma:numeric(d.sigma),psi:numeric(d.psi),initialPoint:d.point.map(numeric),initialDirector:d.initialDirector.map(numeric),initialNormal:d.normal.map(numeric),
 initialParameter:numeric(d.ui),parameterStart:numeric(d.start),parameterEnd:numeric(d.end),transverseStart:numeric(d.wStart),transverseEnd:numeric(d.wEnd),segments:numeric(d.segments),rulingSegments:numeric(d.ruling)});};
const project=(p:number[],angle:number)=>{const az=angle*Math.PI/180,elev=28*Math.PI/180,depth=Math.sin(az)*p[0]+Math.cos(az)*p[1];return [Math.cos(az)*p[0]-Math.sin(az)*p[1],-Math.sin(elev)*depth+Math.cos(elev)*p[2]];};
const path=(points:number[][])=>points.map((p,i)=>`${i?'L':'M'}${p[0].toPrecision(10)} ${(-p[1]).toPrecision(10)}`).join(' ');
function Drawing({result,target,angle,active}:{result:GenericSpecialReshapeResult;target:boolean;angle:number;active:number}){
 const grid=result.grid.map(row=>(target?row.normalizedTarget:row.normalizedSource).map(p=>project(p,angle))),base=result.sample.rows.map(row=>project(target?row.normalizedTargetBase:row.normalizedSourceBase,angle)),
  points=[...grid.flat(),...base],xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]),span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),.01),margin=.14*span,
  first=grid.map(row=>row[0]),last=grid.map(row=>row.at(-1)!),at=Math.min(active,grid.length-1),step=Math.max(1,Math.ceil(grid.length/24));
 return <svg data-testid={`native-special-reshape-${target?'target':'source'}`} role="img" aria-label={target?'原专用重塑三维结果':'原六源三维直纹面'}
  viewBox={`${Math.min(...xs)-margin} ${Math.min(...ys)-margin} ${Math.max(...xs)-Math.min(...xs)+2*margin} ${Math.max(...ys)-Math.min(...ys)+2*margin}`} preserveAspectRatio="xMidYMid meet">
  <path className={`nsr-surface ${target?'target':'source'}`} d={path([...first,...last.slice().reverse()])+' Z'}/>
  {grid.map((row,i)=>i%step===0||i===grid.length-1?<line className="nsr-ruling" key={i} vectorEffect="non-scaling-stroke" x1={row[0][0]} y1={-row[0][1]} x2={row.at(-1)![0]} y2={-row.at(-1)![1]}/>:null)}
  <path className="nsr-edge" d={path(first)} vectorEffect="non-scaling-stroke"/><path className="nsr-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
  <path className="nsr-base" d={path(base)} vectorEffect="non-scaling-stroke"/><line className="nsr-selected" vectorEffect="non-scaling-stroke" x1={first[at][0]} y1={-first[at][1]} x2={last[at][0]} y2={-last[at][1]}/>
  <circle className="nsr-marker" vectorEffect="non-scaling-stroke" cx={base[at][0]} cy={-base[at][1]} r={span*.011}/>
 </svg>;
}
const scientific=(n:number)=>Number.isFinite(n)?n.toExponential(1):'—';
export default function CurvedNativeSpecialReshapeDialog({initialMode='cone',onClose,onSaved}:{initialMode?:SpecialReshapeMode;onClose:()=>void;onSaved:(mode:SpecialReshapeMode)=>void}){
 const [mode,setMode]=useState<SpecialReshapeMode>(initialMode),[draft,setDraft]=useState(()=>toDraft(preset(initialMode))),[result,setResult]=useState<GenericSpecialReshapeResult|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[message,setMessage]=useState('源式核验中'),[active,setActive]=useState(0),[sourceAngle,setSourceAngle]=useState(-35),[targetAngle,setTargetAngle]=useState(-35),
  generation=useRef(0),abort=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null),input=useMemo(()=>{try{return {query:parse(mode,draft),error:null};}catch(e){return {query:null,error:e instanceof Error?e.message:String(e)};}},[mode,draft]);
 const clear=()=>{generation.current++;abort.current?.abort();setResult(null);setStatus('checking');setMessage('源式核验中');};
 const edit=(key:keyof Draft,value:string)=>{clear();setDraft(d=>({...d,[key]:value}));},editArray=(key:'base'|'director'|'point'|'initialDirector'|'normal',i:number,value:string)=>{clear();setDraft(d=>({...d,[key]:d[key].map((v,j)=>j===i?value:v)}));};
 const choose=(next:SpecialReshapeMode)=>{clear();setMode(next);setDraft(toDraft(preset(next)));setActive(0);};
 useEffect(()=>{const id=++generation.current,controller=new AbortController();abort.current?.abort();abort.current=controller;setResult(null);
  if(!input.query){setStatus('error');setMessage(input.error!);return;}setStatus('checking');setMessage('源式核验中');const timer=setTimeout(()=>{const timeout=setTimeout(()=>controller.abort('专用重塑计算超时。'),70000);
   fetchGenericSpecialReshapeWhenIdle(input.query,controller.signal).then(r=>{if(id!==generation.current)return;setResult(r);setActive(a=>Math.min(a,r.query.segments));setStatus('ready');})
    .catch(e=>{if(id!==generation.current)return;setStatus('error');setMessage(e instanceof Error?e.message:String(e));}).finally(()=>clearTimeout(timeout));},150);
  return ()=>{++generation.current;clearTimeout(timer);controller.abort();};},[input]);
 const c=result?.certification,d=result?.diagnostics,domain=result?.domain,row=result?.sample.rows[Math.min(active,result.query.segments)],
  frameMismatch=result&&!result.initial.frameCompatible,incompatible=result&&!c?.finiteSourceCompatibilityVerified,degenerate=domain&&(domain.sourceStripRegularity.status==='degenerate'||domain.formalStripRegularity.status==='degenerate'),
  statusText=status!=='ready'?message:frameMismatch?'原初帧不兼容；保留原构形，形式等距未证。':incompatible?'原六源不满足专用几何身份；保留原构形。':degenerate?'原域含顶点／回归边；等距与退化分别保留。':
   c?.formalIsometryCertified?'原定义全域已证；形式等距已证。':'有限构形完成；原定义／等距全域未证。';
 const number=(key:'start'|'end'|'wStart'|'wEnd'|'ui'|'segments'|'ruling',label:string)=><label className="nsr-field" key={key}><span>{label}</span><input aria-label={`专用重塑${label}`} type="number" step={key==='segments'||key==='ruling'?'1':'any'} value={draft[key]} title={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
 const evidence=(name:string,value:string,detail?:string,warn=false)=><div className={`nsr-evidence-item ${warn?'warning':''}`} key={name} title={detail}><span>{name}</span><strong>{value}</strong></div>;
 const strip=(s:'source'|'formal')=>{const state=domain?.[s+'StripRegularity' as 'sourceStripRegularity'|'formalStripRegularity'];return state?.status==='verified'?'正则已证':state?.status==='degenerate'?'原域退化':'全带未证';};
 return <TessDialog title="第 45 节 · 专用重塑 · 七源原式" onClose={onClose}><div className="native-special-reshape-dialog">
  <aside className="nsr-controls">
   <div className="nsr-mode"><strong>原六源／三维原初值</strong><select aria-label="专用重塑模式" value={mode} onChange={e=>choose(e.target.value as SpecialReshapeMode)}><option value="cone">圆锥重塑</option><option value="tandev">切线可展重塑</option></select></div>
   {(['base','director'] as const).map(key=><div className="nsr-expressions" key={key}>{draft[key].map((value,i)=><label className="nsr-expression" key={i}><span>{key==='base'?'b':'d'}{['ₓ','ᵧ','𝓏'][i]}</span>
    <input aria-label={`专用重塑原${key==='base'?'基线':'母线'}${['x','y','z'][i]}表达式`} value={value} title={value} spellCheck={false} onChange={e=>editArray(key,i,e.target.value)}/></label>)}</div>)}
   <div className="nsr-law"><label className="nsr-expression"><span>{mode==='cone'?'β(s)':'τ(s)'}</span><input aria-label="专用重塑原目标系数表达式" value={draft.law} title={draft.law} spellCheck={false} onChange={e=>edit('law',e.target.value)}/></label>
    {(['sigma','psi'] as const).map(key=><label className="nsr-field" key={key}><span>{key==='sigma'?'σ':'ψ'}</span><select aria-label={`专用重塑${key}`} value={draft[key]} onChange={e=>edit(key,e.target.value)}><option value="1">+1</option><option value="-1">−1</option></select></label>)}</div>
   <div className="nsr-initial">{(['point','initialDirector','normal'] as const).map(key=><div className="nsr-vector" key={key}><span>{key==='point'?'bᵢ':key==='initialDirector'?'dᵢ':'uᵢ'}</span>{draft[key].map((value,i)=><label className="nsr-coordinate" key={i}><span>{['x','y','z'][i]}</span>
    <input aria-label={`专用重塑原初值${key==='point'?'位置':key==='initialDirector'?'母线':'法向'}${['x','y','z'][i]}`} type="number" step="any" value={value} title={value} onChange={e=>editArray(key,i,e.target.value)}/></label>)}</div>)}</div>
   <p className="nsr-guide" title={mode==='cone'?'原ds=1，g=−σψ|d′|，返回顶点固定bᵢ；原b仅用于源几何与兼容检查。':'原U=σψ Normalize(d′)×d，ζ=T(ui)·d(ui)；原d、dᵢ、uᵢ均不Normalize。'}>{mode==='cone'?'原ds=1 · 顶点固定bᵢ · 不修补原向量':'原ζ／法向按源计算 · 不修补原向量'}</p>
   <div className="nsr-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}{number('ui','初值 sᵢ')}{number('segments','纵向段数')}{number('ruling','横向段数')}</div>
   <div className={`nsr-status ${status} ${frameMismatch||incompatible||degenerate?'warning':''}`} data-testid="native-special-reshape-status" role={status==='error'?'alert':'status'} title={statusText}>{statusText}</div>
   <div className="nsr-evidence" data-testid="native-special-reshape-diagnostics">
    {evidence('有限EFG',result?(c?.finiteMetricVerified?'通过 ':'未符 ')+scientific(d!.maximumRelativeMetricDifference):'—',undefined,!!result&&!c?.finiteMetricVerified)}
    {evidence('有限可展',d?scientific(d.maximumRelativeTargetDevelopabilityResidual):'—')}{evidence('标架GramΔ',d?scientific(d.maximumFrameResidual):'—')}
    {evidence('原源身份',d?d.sourceCompatibility.status==='analytic'?'解析身份':d.sourceCompatibility.status==='incompatible'?'不兼容':'数值／未证':'—',d?.sourceCompatibility.method,!!incompatible)}
    {evidence('原初帧Gram',result?(result.initial.frameCompatible?'通过 ':'未符 ')+scientific(result.initial.frameGramResidual):'—',undefined,!!frameMismatch)}
    {evidence('原定义全域',domain?(domain.certified?'已证·':'未证·')+domain.verifiedCells+'段':'—')}{evidence('形式等距',c?c.formalIsometryCertified?'已证':'未证':'—')}
    {evidence('源整带',domain?strip('source'):'—')}{evidence('重塑整带',domain?strip('formal'):'—')}
    {evidence('原速度／|d|',row?scientific(row.coefficients.speed)+'/'+scientific(row.coefficients.sourceDirectorLength):'—')}
    {evidence('原g／目标系数',row?scientific(row.coefficients.g)+'/'+scientific(mode==='cone'?row.coefficients.h:row.coefficients.z):'—')}
    {evidence('原ζ／顶点',result?mode==='cone'?'固定bᵢ':scientific(result.initial.zeta!):'—')}
   </div>
   <div className="nsr-position"><label htmlFor="nsr-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label><input id="nsr-position" aria-label="专用重塑同步母线" type="range" min="0" max={result?.query.segments??32} step="1" value={active} disabled={!result} onChange={e=>setActive(Number(e.target.value))}/></div>
   <div className="nsr-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'专用重塑七源原初值.json')}>保存源 JSON</button><button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>choose(mode)}>恢复原式</button>
    <input hidden ref={file} type="file" accept=".json,application/json" aria-label="载入专用重塑源文件" onChange={async e=>{const node=e.currentTarget,selected=node.files?.[0];if(!selected)return;
     clear();const id=generation.current;try{if(selected.size>16384)throw Error('源JSON超过16KB。');const text=await selected.text();if(id!==generation.current)return;
      const q=validateGenericSpecialReshapeQuery(JSON.parse(text));setMode(modeOf(q));setDraft(toDraft(q));setActive(0);}catch(error){if(id!==generation.current)return;
      setStatus('error');setMessage(error instanceof Error?error.message:String(error));}finally{if(id===generation.current)node.value='';}}}/>
   </div>
  </aside>
  <main className="nsr-results"><div className="nsr-topline"><div><span>{mode==='cone'?'CONE RESHAPE':'TANGENT DEVELOPABLE'}</span><strong>{mode==='cone'?'圆锥原式 · 固定顶点重塑':'切线可展原式 · 回归边重塑'}</strong></div><small>数值只读</small></div>
   <div className="nsr-panels">{[false,true].map(target=><section className={`nsr-panel ${target?'target':'source'}`} key={String(target)}><header><span>{target?'RESHAPED':'SOURCE'}</span><strong>{target?'原三维重塑结果':'原六源直纹面'}</strong></header>
    {result?<Drawing result={result} target={target} active={active} angle={target?targetAngle:sourceAngle}/>:<div className="nsr-empty">{status==='checking'?'构造核验中':'无有效构形'}</div>}
    <label className="nsr-azimuth">视角<input aria-label={`专用重塑${target?'目标':'来源'}三维视角`} type="range" min="-180" max="180" step="1" value={target?targetAngle:sourceAngle} onChange={e=>(target?setTargetAngle:setSourceAngle)(Number(e.target.value))}/><span>{target?targetAngle:sourceAngle}°</span></label>
   </section>)}</div>
   <div className="nsr-legend"><span><i className="base"/>基线w=0</span><span><i className="edge"/>w域两边</span></div>
   <div className="nsr-certification"><strong>原构形、源身份、等距证据分别保留</strong><span>原域含顶点／回归边时保留退化；积分误差、单射及碰撞未认证，不可采用为CP／FOLD。</span></div>
   <footer className="nsr-footer"><span>{mode==='cone'?'ReshapeCone3D · NReshapeCone3D':'ReshapeTandev3D · NReshapeTandev3D'}<br/>三维原初值保真 · 视角为本地操作</span><div><button onClick={()=>onSaved(mode)}>原保存例</button><button className="primary" onClick={onClose}>关闭</button></div></footer>
  </main>
 </div></TessDialog>;
}
