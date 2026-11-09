import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {NATIVE_PLANAR_SEQUENCE_PRESET,validateNativePlanarSequenceQuery,fetchNativePlanarSequenceWhenIdle,
 type NativePlanarSequenceQuery,type NativePlanarSequenceResult} from '../app/curvedNativePlanarSequence';
import {TessDialog} from './TessellationEditor';
import './CurvedNativePlanarSequenceDialog.css';
type Query=NativePlanarSequenceQuery;type Result=NativePlanarSequenceResult;type Point=[number,number];
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
const makeDraft=(q:Query)=>({...q,base:q.baseCurve.slice(),direction:q.director.slice(),mirrors:q.mirrors.map(m=>({point:m.point.map(String),normal:m.normal.map(String)})),
 start:String(q.parameterStart),end:String(q.parameterEnd),wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),segments:String(q.segments),ruling:String(q.rulingSegments)});
type Draft=ReturnType<typeof makeDraft>;
function Drawing({result,target,angle,active}:{result:Result;target:boolean;angle:number;active:number}){
 const a=angle*Math.PI/180,project=(p:number[]):Point=>[Math.cos(a)*p[0]-Math.sin(a)*p[2],p[1]+.34*(Math.sin(a)*p[0]+Math.cos(a)*p[2])],
  stages=target?Array.from({length:result.query.mirrors.length+1},(_,i)=>i):[0],
  drawings=stages.map(j=>({base:result.sample.rows.map(r=>project(r.stages[j].normalizedBase)),fold:result.sample.rows.map(r=>project(r.stages[j].normalizedFold)),
   first:result.grid.map(g=>project(g.stages[j].normalizedPoints[0])),last:result.grid.map(g=>project(g.stages[j].normalizedPoints.at(-1)!))})),
  all=drawings.flatMap(d=>[...d.base,...d.fold,...d.first,...d.last]),xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x0=Math.min(...xs),y0=Math.min(...ys),
  width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,span=Math.max(width,height)||1,pad=span*.12,at=Math.min(active,result.query.segments),step=Math.max(1,Math.ceil(result.query.segments/10));
 return <svg data-testid={`native-planar-sequence-${target?'target':'source'}`} role="img" aria-label={target?'全部原镜像阶段及曲线交线':'原六源三维直纹面'}
  viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
  {drawings.map((d,j)=><g key={j} data-stage-index={stages[j]} style={{color:`hsl(${(145+stages[j]*43)%360} 55% 64%)`}}>
   <path className="nps-surface" d={path([...d.first,...d.last.slice().reverse()])+' Z'}/>
   <path className="nps-edge" d={path(d.first)} vectorEffect="non-scaling-stroke"/><path className="nps-edge" d={path(d.last)} vectorEffect="non-scaling-stroke"/>
   {d.first.map((_,i)=>i%step===0||i===d.first.length-1?<path key={i} className="nps-ruling" d={path([d.first[i],d.last[i]])} vectorEffect="non-scaling-stroke"/>:null)}
   <path className="nps-base" d={path(d.base)} vectorEffect="non-scaling-stroke"/>{stages[j]>0&&<path className="nps-fold" d={path(d.fold)} vectorEffect="non-scaling-stroke"/>}
   <path className="nps-selected" d={path([d.first[at],d.last[at]])} vectorEffect="non-scaling-stroke"/>
  </g>)}
 </svg>;
}
export default function CurvedNativePlanarSequenceDialog({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [draft,setDraft]=useState(()=>makeDraft(NATIVE_PLANAR_SEQUENCE_PRESET)),[result,setResult]=useState<Result|null>(null),[status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),
  [error,setError]=useState(''),[active,setActive]=useState(0),[angle,setAngle]=useState(-35),file=useRef<HTMLInputElement>(null),generation=useRef(0),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{++generation.current;request.current?.abort();},[]);
 const input=useMemo(()=>{try{
  if([...draft.base,...draft.direction,draft.start,draft.end,draft.wStart,draft.wEnd,draft.segments,draft.ruling,...draft.mirrors.flatMap(m=>[...m.point,...m.normal])].some(x=>!x.trim()))throw Error('请填完整六源、镜面坐标和所有数值域。');
  return {query:validateNativePlanarSequenceQuery({family:'planar-sequence-native',baseCurve:draft.base,director:draft.direction,composeReflections:draft.composeReflections,
   mirrors:draft.mirrors.map(m=>({point:m.point.map(Number),normal:m.normal.map(Number)})),parameterStart:Number(draft.start),parameterEnd:Number(draft.end),
   transverseStart:Number(draft.wStart),transverseEnd:Number(draft.wEnd),segments:Number(draft.segments),rulingSegments:Number(draft.ruling)}),error:''};
 }catch(e){return {query:null,error:(e as Error).message};}},[draft]);
 useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;setResult(null);setActive(0);setError('');
  if(!input.query){setStatus('error');setError(input.error);return ()=>controller.abort();}setStatus('checking');const q=input.query,timer=setTimeout(async()=>{
   try{const next=await fetchNativePlanarSequenceWhenIdle(q,AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');}
   catch(e){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((e as Error).message);}},150);
  return ()=>{clearTimeout(timer);controller.abort();};},[input]);
 const invalidate=()=>{++generation.current;request.current?.abort();setResult(null);setActive(0);setStatus('checking');setError('');},
  edit=(change:Partial<Draft>)=>{invalidate();setDraft(old=>({...old,...change}));},restore=(q:Query)=>{invalidate();setDraft(makeDraft(q));};
 const expression=(key:'base'|'direction',i:number)=><label className="nps-expression" key={`${key}${i}`}><span>{key==='base'?'B':'D'}{['ₓ','ᵧ','𝓏'][i]}</span>
  <input aria-label={`原镜像序列${key==='base'?'基线':'母线'}${['x','y','z'][i]}表达式`} value={draft[key][i]} spellCheck={false} title={draft[key][i]}
   onChange={e=>edit({[key]:draft[key].map((x,j)=>i===j?e.target.value:x)})}/></label>;
 const number=(key:'start'|'end'|'wStart'|'wEnd'|'segments'|'ruling',label:string)=><label className="nps-field" key={key}><span>{label}</span>
  <input aria-label={`原镜像序列${label}`} type="number" step={key==='segments'||key==='ruling'?'1':'any'} value={draft[key]} onChange={e=>edit({[key]:e.target.value})}/></label>;
 const row=result?.sample.rows[Math.min(active,result.query.segments)],c=result?.certification,d=result?.diagnostics,
  statusText=status==='error'?error:status==='checking'?'正在计算原镜面交线和逐次反射…':!c?.mirrorNormalsCompatible?'原法向非单位；保字面反射，等距条件未证。':
   !c?.finiteMetricVerified?'有限EFG不相容；保原实际镜像序列。':`${result!.query.mirrors.length}个原镜面；${result!.domain.certified?'完整交线域已证':'完整交线域未证'}。`,
  scientific=(v:number|undefined)=>v===undefined?'—':v.toExponential(1),evidence=(label:string,value:string,detail?:string)=><div className="nps-evidence-item" key={label} title={detail}><span>{label}</span><strong>{value}</strong></div>;
 return <TessDialog title="第45节 · 镜像曲折序列·六源原式" onClose={onClose}><div className="native-planar-sequence-dialog">
  <aside className="nps-controls"><div className="nps-expressions">{[0,1,2].map(i=>expression('base',i))}{[0,1,2].map(i=>expression('direction',i))}</div>
   <div className="nps-mirror-options"><label className="nps-field"><span>原镜面数</span><select aria-label="原镜像序列镜面数" value={draft.mirrors.length} onChange={e=>{
    const n=Number(e.target.value),mirrors=draft.mirrors.slice(0,n);while(mirrors.length<n)mirrors.push({point:['0','0',String(mirrors.length+1)],normal:['0','0','1']});edit({mirrors});}}>
    {Array.from({length:9},(_,i)=><option key={i} value={i}>{i}个</option>)}</select></label>
    <label className="nps-field"><span>ComposeReflections</span><select aria-label="原镜像序列反射组合" value={String(draft.composeReflections)} onChange={e=>edit({composeReflections:e.target.value==='true'})}>
     <option value="true">携带后续镜面</option><option value="false">依次固定镜面</option></select></label></div>
   <div className="nps-mirror-head"><span>#</span>{['pₓ','pᵧ','p𝓏','mₓ','mᵧ','m𝓏'].map(x=><span key={x}>{x}</span>)}</div>
   <div className="nps-mirrors">{draft.mirrors.map((m,i)=><div className="nps-mirror-row" key={i}><span>{i+1}</span>{(['point','normal'] as const).flatMap(key=>m[key].map((value,j)=><input key={`${key}${j}`} aria-label={`镜面${i+1}${key==='point'?'点':'法向'}${['x','y','z'][j]}`}
    title={value} type="number" step="any" value={value} onChange={e=>edit({mirrors:draft.mirrors.map((v,k)=>i===k?{...v,[key]:v[key].map((x,n)=>j===n?e.target.value:x)}:v)})}/>))}</div>)}</div>
   <p className="nps-guide">原Reflectu不单位化法向；空镜列表保初始条目。</p>
   <div className="nps-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}{number('segments','纵向段数')}{number('ruling','横向段数')}</div>
   <div data-testid="native-planar-sequence-status" className={`nps-status ${status} ${c&&!c.mirrorNormalsCompatible?'warning':''}`} role={status==='error'?'alert':'status'} title={statusText}>{statusText}</div>
   <div className="nps-evidence">{evidence('有限EFG',scientific(d?.maximumRelativeMetricDifference),'各阶段与原源在同s／w的自然量级E／F／G差')}
    {evidence('镜法向Δ',scientific(d?.maximumMirrorNormalSquaredLengthError),'原有效镜面的平方长度误差；容差64ε')}{evidence('交线平面Δ',scientific(d?.maximumNormalizedMirrorPlaneResidual))}
    {evidence('完整交线域',result?result.domain.certified?'已证':'未证':'—',result?.domain.reason??undefined)}{evidence('条件反射等距',c?c.conditionalReflectionIsometryCertified?'已证':'未证':'—','条件：原Reflectu法向单位；不声明源整带正则或运动')}
    {evidence('输出阶段',result?String(result.query.mirrors.length+1):'—','完整初条与每次原反射条目，交线次序不被强制改写')}</div>
   <div className="nps-position"><label htmlFor="nps-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label><input id="nps-position" aria-label="原镜像序列同步母线" type="range" min="0" max={result?.query.segments??32} disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></div>
   <div className="nps-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'镜像序列六源与镜列表.json')}>保存源 JSON</button><button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>restore(NATIVE_PLANAR_SEQUENCE_PRESET)}>恢复原式</button>
    <input hidden ref={file} type="file" aria-label="载入原镜像序列源文件" accept=".json,application/json" onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
     try{if(selected.size>16384)throw Error('源文件过大。');const q=validateNativePlanarSequenceQuery(JSON.parse(await selected.text()));if(id!==generation.current)return;restore(q);}
     catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
  </aside>
  <main className="nps-results"><div className="nps-topline"><div><span>PLANAR MIRROR SEQUENCE</span><strong>原六源 · 任意镜面序列</strong></div><small>数值只读</small></div>
   <div className="nps-panels">{[false,true].map(target=><section className="nps-panel" key={String(target)}><header><span>{target?'SEQUENCE':'SOURCE'}</span><strong>{target?'全部原反射阶段':'原B+wD曲面'}</strong></header>
    {result?<Drawing result={result} target={target} angle={angle} active={active}/>:<div className="nps-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
    {target?<p>阶段颜色区分 · 不重排原交线</p>:<label className="nps-azimuth">视角<input aria-label="原镜像序列三维视角" type="range" min="-180" max="180" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><b>{angle}°</b></label>}</section>)}</div>
   <div className="nps-legend"><span><i className="crease"/>原反射交线</span><span>相同s／w对照 · 全阶段保留</span></div>
   <div className="nps-certification" title="保留原镜面列表与反射顺序。交线排序、整带单射、碰撞及折叠运动未核；不是精确CP／FOLD。"><strong>原序列保留 · CP／FOLD未认证</strong></div>
   <footer className="nps-footer"><span title="PlanarCurvedFold3DSequence · In[4038/4042] · Reflectu原法向保留">镜面序列 · In[4038/4042]</span><div><button onClick={onSaved}>原保存例</button><button className="primary" onClick={onClose}>关闭</button></div></footer>
  </main>
 </div></TessDialog>;
}
