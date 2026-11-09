import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {GENERIC_RIBBON_PRESET,validateGenericRibbonQuery,fetchGenericRibbonWhenIdle,
 type GenericRibbonQuery,type GenericRibbonResult} from '../app/curvedNativeRibbon';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeRibbonDialog.css';
type Query=GenericRibbonQuery;type Result=GenericRibbonResult;type Point=[number,number];
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
const scientific=(n:number|undefined)=>n===undefined?'—':n.toExponential(1);
const evidenceName=(status:string|undefined)=>status===undefined?'—':({verified:'正则已证',unknown:'未证',degenerate:'退化带'}[status]??status);
function makeDraft(q:Query){return{curve:q.spaceCurve.slice(),eta:q.normalAngle,sigma:String(q.sigma),start:String(q.parameterStart),end:String(q.parameterEnd),
 wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),segments:String(q.segments),ruling:String(q.rulingSegments),
 ui:String(q.initialParameter),point:q.initialPoint.map(String),tangent:q.initialTangent.map(String)};}
type Draft=ReturnType<typeof makeDraft>;type ArrayField='curve'|'point'|'tangent';type Field=Exclude<keyof Draft,ArrayField>;
function Drawing({result,target,angle,active}:{result:Result;target:boolean;angle:number;active:number}){
 const space=!target,a=angle*Math.PI/180,
  project=(p:number[]):Point=>space?[Math.cos(a)*p[0]-Math.sin(a)*p[2],p[1]+.34*(Math.sin(a)*p[0]+Math.cos(a)*p[2])]:[p[0],p[1]],
  base=result.sample.rows.map(row=>project(row[target?'normalizedTargetBase':'normalizedSourceBase'])),
  points=result.grid.map(row=>row[target?'normalizedTarget':'normalizedSource']),
  first=points.map(row=>project(row[0])),last=points.map(row=>project(row.at(-1)!)),
  all=[...base,...first,...last],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x0=Math.min(...xs),y0=Math.min(...ys),
  width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,span=Math.max(width,height,1e-12),pad=span*.14,at=Math.min(active,base.length-1),
  step=Math.max(1,Math.round(result.query.segments/14)),p=base[at];
 return <svg data-testid={`native-ribbon-${target?'target':'source'}`} role="img" aria-label={target?(space?'原代数实际计算的重塑三维曲面':'原初值实际计算的二维展开'):'原三维源直纹面'}
  viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
  <path className={`nrb-surface ${target?'target':'source'}`} d={path([...first,...last.slice().reverse()])+' Z'}/>
  {base.map((_,i)=>i%step===0||i===base.length-1?<line className="nrb-ruling" key={i} vectorEffect="non-scaling-stroke"
   x1={first[i][0]} y1={-first[i][1]} x2={last[i][0]} y2={-last[i][1]}/>:null)}
  <path className="nrb-edge" d={path(first)} vectorEffect="non-scaling-stroke"/><path className="nrb-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
  <path className="nrb-base" d={path(base)} vectorEffect="non-scaling-stroke"/>
  <line className="nrb-selected" vectorEffect="non-scaling-stroke" x1={first[at][0]} y1={-first[at][1]} x2={last[at][0]} y2={-last[at][1]}/>
  <circle className="nrb-marker" vectorEffect="non-scaling-stroke" cx={p[0]} cy={-p[1]} r={span*.011}/>
 </svg>;
}

export default function CurvedNativeRibbonDialog({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [draft,setDraft]=useState(()=>makeDraft(GENERIC_RIBBON_PRESET)),[result,setResult]=useState<Result|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0),[angle,setAngle]=useState(-35);
 const generation=useRef(0),request=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null);
 const input=useMemo(()=>{try{
  if([...draft.curve,...draft.point,...draft.tangent,draft.eta,draft.ui,draft.start,draft.end,draft.wStart,draft.wEnd,draft.segments,draft.ruling].some(value=>!value.trim()))
   throw Error('请填完整空间基线cc、法向角η(s)、原二维初值与数值域。');
  return {query:validateGenericRibbonQuery({family:'ribbon-generic-native',spaceCurve:draft.curve,normalAngle:draft.eta,sigma:Number(draft.sigma),
   initialParameter:Number(draft.ui),initialPoint:draft.point.map(Number),initialTangent:draft.tangent.map(Number),
   parameterStart:Number(draft.start),parameterEnd:Number(draft.end),transverseStart:Number(draft.wStart),transverseEnd:Number(draft.wEnd),
   segments:Number(draft.segments),rulingSegments:Number(draft.ruling)}),error:''};
 }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
 useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;
  setResult(null);setActive(0);setError('');if(!input.query){setStatus('error');setError(input.error);return ()=>controller.abort();}
  setStatus('checking');const query=input.query,timer=setTimeout(async()=>{try{
   const next=await fetchGenericRibbonWhenIdle(query,AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
   if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');
  }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
  return ()=>{clearTimeout(timer);controller.abort();};},[input]);
 const invalidate=()=>{++generation.current;request.current?.abort();setResult(null);setActive(0);setStatus('checking');setError('');};
 const edit=(key:Field,value:string)=>{invalidate();setDraft(previous=>({...previous,[key]:value}));};
 const editArray=(key:ArrayField,i:number,value:string)=>{invalidate();setDraft(previous=>({...previous,[key]:previous[key].map((v,j)=>j===i?value:v)}));};
 const restore=(query:Query)=>{invalidate();setDraft(makeDraft(query));setAngle(-35);};
 const number=(key:Exclude<Field,'eta'|'sigma'>,label:string)=><label className="nrb-field" key={key}><span>{label}</span>
  <input aria-label={`Ribbon原式${label}`} type="number" step={key==='segments'||key==='ruling'?'1':'any'} title={draft[key]}
   value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
 const initial=(key:'point'|'tangent',i:number)=><label className="nrb-field" key={`${key}${i}`}><span>{key==='point'?'cᵢ':'tᵢ'}{['ₓ','ᵧ'][i]}</span>
  <input aria-label={`Ribbon原二维初值${key==='point'?'位置':'切向'}${['x','y'][i]}`} type="number" step="any" title={draft[key][i]}
   value={draft[key][i]} onChange={e=>editArray(key,i,e.target.value)}/></label>;
 const cert=result?.certification,d=result?.diagnostics,domain=result?.domain,
  frameMismatch=result?.initial.frameCompatible===false,zeroRuling=!!result&&result.sample.rows.every(row=>row.coefficients.p===0&&row.coefficients.q===0),
  incompatible=!!cert&&(!cert.finiteMetricVerified||!cert.finiteDevelopabilityVerified||!cert.finiteUnitRulingsVerified),
  degenerate=!!domain&&[domain.sourceStripRegularity,domain.formalStripRegularity].some(side=>side.status==='degenerate'),
  row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],
  statusText=status==='error'?error:status==='checking'?'原cc、η与二维原初值正在构造、展开核验…':zeroRuling?'原Sign(0)／Abs(0)母线字面为零；保留退化带。':
   frameMismatch?'保留原初始切向；初帧不相容，形式等距未证。':incompatible?'有限点证据不相容；保留原实际只读构形。':
   degenerate?'原带宽内有焦点；完整原域保留，整带正则未证。':`${domain?.certified?'Frenet／符号全域已证':'Frenet／符号全域未证'}；${cert?.formalIsometryCertified?'形式等距已证':'形式等距未证'}。`;
 const evidence=(name:string,value:string,details?:string,warn=false)=><div className={`nrb-evidence-item ${warn?'warning':''}`} title={details} key={name}>
  <span>{name}</span><strong>{value}</strong></div>;
 const stripEvidence=(formal:boolean)=>{const strip=domain?.[formal?'formalStripRegularity':'sourceStripRegularity'];return evidence(
  formal?'展开整带':'源整带',evidenceName(strip?.status),strip?`${strip.reason??'全带区间Jacobian已证'}；方向${strip.orientation??'未知'}；下界${strip.minimumAbsoluteJacobianLowerBound??'未知'}`:undefined,strip?.status==='degenerate');};
 return <TessDialog title="第 45 节 · Ribbon带片·四源原式" onClose={onClose}>
  <div className="native-ribbon-dialog">
   <aside className="nrb-controls">
    <div className="nrb-source-head"><span>原空间基线 cc(s) · 三坐标</span></div>
    <div className="nrb-expressions">{draft.curve.map((value,i)=><label className="nrb-expression" key={i}><span>c{['ₓ','ᵧ','𝓏'][i]}</span>
     <input aria-label={`Ribbon原式基线${['x','y','z'][i]}表达式`} value={value} title={value} spellCheck={false} onChange={e=>editArray('curve',i,e.target.value)}/></label>)}</div>
    <div className="nrb-angle"><label className="nrb-expression"><span>η(s)</span><input aria-label="Ribbon原式法向角表达式" value={draft.eta}
     title={draft.eta} spellCheck={false} onChange={e=>edit('eta',e.target.value)}/></label>
     <label className="nrb-field"><span>方向 σ</span><select aria-label="Ribbon原式sigma" value={draft.sigma} onChange={e=>edit('sigma',e.target.value)}>
      <option value="1">+1</option><option value="-1">−1</option></select></label></div>
    <div className="nrb-initial">{initial('point',0)}{initial('point',1)}{initial('tangent',0)}{initial('tangent',1)}</div>
    <p className="nrb-guide" title="η单位为弧度。原二维ti可为任何有限坐标（含零），不Normalize；单位／正交初帧门槛与形式等距单独核验。">保留原ti含零 · η用弧度 · Sign/Abs原母线</p>
    <div className="nrb-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}
     {number('ui','初值 sᵢ')}{number('segments','纵向段数')}{number('ruling','横向段数')}</div>
    <div className={`nrb-status ${status} ${frameMismatch||incompatible||degenerate?'warning':''}`} role={status==='error'?'alert':'status'}
     data-testid="native-ribbon-status" title={statusText}>{statusText}</div>
    <div className="nrb-evidence" data-testid="native-ribbon-diagnostics">
     {evidence('有限EFG',`${cert?.finiteMetricVerified===undefined?'—':cert.finiteMetricVerified?'通过':'不相容'} ${scientific(d?.maximumRelativeMetricDifference)}`,
      d?`129个核验点与显示网格；E/F/G各按自然量级；容差${d.metricTolerance}`:undefined,cert?.finiteMetricVerified===false)}
     {evidence('有限可展',scientific(d?.maximumRelativeDevelopabilityResidual),'原U·D′有限残差；与全域解析证据分开',cert?.finiteDevelopabilityVerified===false)}
     {evidence('单位母线Δ',scientific(d?.maximumUnitRulingResidual),'源与目标世界母线的有限单位残差；零母线和非单位初Ti不修补',cert?.finiteUnitRulingsVerified===false)}
     {evidence('标架GramΔ',scientific(d?.maximumFrameResidual),'空间Frenet与目标原二维标架的有限Gram残差')}
     {evidence('原初帧Gram',result?`${result.initial.frameCompatible?'通过':'不相容'} ${scientific(result.initial.frameGramResidual)}`:'—',
      result?`原初始tᵢ与Rot90(tᵢ)；容差${result.initial.frameCompatibilityTolerance}`:undefined,frameMismatch)}
     {evidence('Frenet／符号域',domain?`${domain.certified?'已证':'未证'}·${domain.verifiedCells}段`:'—',domain?`${domain.evaluations}次细分；${domain.reason??'完整原域证据'}；速度／曲率／H／|A|各独立下界`:undefined)}
     {evidence('原母线解析',cert?cert.sourceUnitRulingsAnalytic?'已证':'未证':'—','原Frenet/η/SignAbs恒等式的正则非零分支门槛')}
     {evidence('形式等距',cert?cert.formalIsometryCertified?'已证':'未证':'—','精确ODE局部等距与原初帧条件；不冒称积分误差认证')}
     {stripEvidence(false)}{stripEvidence(true)}
     {evidence('源κ／τ',row?`${scientific(row.coefficients.curvature)}/${scientific(row.coefficients.torsion)}`:'—','原空间曲率和挠率，保留共同参数及物理量级')}
     {evidence('原Sign投影A',scientific(row?.coefficients.normalTangentProjection),'原U′·T；常量η=nπ且H>0时Sign(0)=0，DD字面零')}
    </div>
    <div className="nrb-position"><label htmlFor="nrb-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label>
     <input id="nrb-position" aria-label="Ribbon原式同步母线" type="range" min="0" max={result?.query.segments??32}
      disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></div>
    <div className="nrb-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'Ribbon四源原初值.json')}>保存源 JSON</button>
     <button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>restore(GENERIC_RIBBON_PRESET)}>恢复原式</button>
     <input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入Ribbon原式源文件" onChange={async e=>{
      const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
      try{if(selected.size>16384)throw Error('源文件过大。');const next=validateGenericRibbonQuery(JSON.parse(await selected.text()));if(id!==generation.current)return;restore(next);}
      catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
   </aside>
   <main className="nrb-results"><div className="nrb-topline"><div><span>RIBBON PAIR</span><strong>原四源空间带片 · 二维展开</strong></div><small>数值只读</small></div>
    <div className="nrb-panels">{[false,true].map(target=><section className={`nrb-panel ${target?'target':'source'}`} key={String(target)}>
     <header><span>{target?'PLANAR':'SPATIAL'}</span><strong>{target?'原二维初值展开':'原η/SignAbs空间带'}</strong></header>
     {result?<Drawing result={result} target={target} angle={angle} active={active}/>:<div className="nrb-empty">{status==='checking'?'构造核验中':'无有效构形'}</div>}
     {target?<p>原ui／ci／ti · 完整原域</p>:<label className="nrb-azimuth">视角<input aria-label="Ribbon原式来源三维视角" type="range" min="-180" max="180"
      value={angle} onChange={e=>setAngle(Number(e.target.value))}/><b>{angle}°</b></label>}</section>)}</div>
    <div className="nrb-legend"><span><i className="crease"/>基线w=0</span><span><i className="left"/>w起边</span><span><i className="right"/>w终边</span></div>
    <div className="nrb-certification"><strong>原构形、有限等距及形式证据分别保留</strong><span>零母线不报单位／正则证书；积分误差、全域单射及碰撞未认证，不可采用为CP／FOLD。</span></div>
    <footer className="nrb-footer"><span title="RibbonPair / NRibbonPair · In[3854] / In[3858]">RibbonPair · NRibbonPair<br/>原初值不修补；视角与母线为本地操作</span>
     <div><button onClick={onSaved}>原保存例</button><button className="primary" onClick={onClose}>关闭</button></div></footer>
   </main>
  </div>
 </TessDialog>;
}

