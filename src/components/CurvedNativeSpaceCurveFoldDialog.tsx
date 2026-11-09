import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {GENERIC_SPACE_CURVE_FOLD_PRESET,validateGenericSpaceCurveFoldQuery,fetchGenericSpaceCurveFoldWhenIdle,
 type GenericSpaceCurveFoldQuery,type GenericSpaceCurveFoldResult} from '../app/curvedNativeSpaceCurveFold';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeSpaceCurveFoldDialog.css';
type Query=GenericSpaceCurveFoldQuery;type Result=GenericSpaceCurveFoldResult;type Point=[number,number];
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
const scientific=(n:number|undefined)=>n===undefined?'—':n.toExponential(1);
const evidenceName=(status:string|undefined)=>status===undefined?'—':({verified:'正则已证',unknown:'未证',degenerate:'有焦点'}[status]??status);
function makeDraft(q:Query){return{fold:q.foldCurve.slice(),gamma:q.foldAngle,orientation:String(q.orientation),start:String(q.parameterStart),
 end:String(q.parameterEnd),wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),segments:String(q.segments),ruling:String(q.rulingSegments)};}
type Draft=ReturnType<typeof makeDraft>;type Field=Exclude<keyof Draft,'fold'>;
function Drawing({result,target,angle,active}:{result:Result;target:boolean;angle:number;active:number}){
 const a=angle*Math.PI/180,project=(p:number[]):Point=>target?[p[0],p[1]]:
  [Math.cos(a)*p[0]-Math.sin(a)*p[2],p[1]+.34*(Math.sin(a)*p[0]+Math.cos(a)*p[2])];
 const base=result.sample.rows.map(row=>project(target?row.normalizedTargetBase:row.normalizedSourceBase)),
  sides=(['left','right'] as const).map(side=>{const points=result.grid.map(row=>target?
   side==='left'?row.normalizedTargetLeft:row.normalizedTargetRight:
   side==='left'?row.normalizedSourceLeft:row.normalizedSourceRight);
   return {side,points,first:points.map(row=>project(row[0])),last:points.map(row=>project(row.at(-1)!))};}),
  all=[...base,...sides.flatMap(side=>[...side.first,...side.last])],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),
  x0=Math.min(...xs),y0=Math.min(...ys),width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,
  span=Math.max(width,height,1e-12),pad=span*.12,at=Math.min(active,base.length-1),step=Math.max(1,Math.round(result.query.segments/14)),
  wStep=Math.max(1,Math.ceil(result.query.rulingSegments/6)),p=base[at];
 return <svg data-testid={`native-space-curve-fold-${target?'target':'source'}`} role="img"
  aria-label={target?'原固定初值展开的平面双侧曲折带':'四源原式构造的空间双侧曲折带'}
  viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
  {sides.map(({side,first,last})=><path className={`nsc-band ${side}`} key={side} d={path([...first,...last.slice().reverse()])+' Z'}/>)}
  {sides.map(({side,points,first,last})=><g className={side} key={side}>
   {Array.from({length:result.query.rulingSegments-1},(_,k)=>k+1).filter(k=>k%wStep===0).map(k=>
    <path className="nsc-mesh" key={`w${k}`} d={path(points.map(row=>project(row[k])))} vectorEffect="non-scaling-stroke"/>)}
   {base.map((_,i)=>i%step===0||i===base.length-1?<line className="nsc-ruling" key={i} vectorEffect="non-scaling-stroke"
    x1={first[i][0]} y1={-first[i][1]} x2={last[i][0]} y2={-last[i][1]}/>:null)}
   <path className="nsc-edge" d={path(first)} vectorEffect="non-scaling-stroke"/>
   <path className="nsc-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
   <line className="nsc-selected" vectorEffect="non-scaling-stroke" x1={first[at][0]} y1={-first[at][1]} x2={last[at][0]} y2={-last[at][1]}/>
  </g>)}
  <path className="nsc-crease" d={path(base)} vectorEffect="non-scaling-stroke"/>
  <circle className="nsc-marker" vectorEffect="non-scaling-stroke" cx={p[0]} cy={-p[1]} r={span*.011}/>
 </svg>;
}

export default function CurvedNativeSpaceCurveFoldDialog({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [draft,setDraft]=useState(()=>makeDraft(GENERIC_SPACE_CURVE_FOLD_PRESET)),[result,setResult]=useState<Result|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0),[angle,setAngle]=useState(-35);
 const generation=useRef(0),request=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null);
 const input=useMemo(()=>{try{
  if([...draft.fold,draft.gamma,draft.start,draft.end,draft.wStart,draft.wEnd,draft.segments,draft.ruling].some(value=>!value.trim()))
   throw Error('请填完整空间折痕ff、折角γ(s)与原数值域。');
  return {query:validateGenericSpaceCurveFoldQuery({family:'space-curve-fold-generic-native',foldCurve:draft.fold,foldAngle:draft.gamma,
   orientation:Number(draft.orientation),parameterStart:Number(draft.start),parameterEnd:Number(draft.end),
   transverseStart:Number(draft.wStart),transverseEnd:Number(draft.wEnd),segments:Number(draft.segments),rulingSegments:Number(draft.ruling)}),error:''};
 }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
 useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;
  setResult(null);setActive(0);setError('');if(!input.query){setStatus('error');setError(input.error);return ()=>controller.abort();}
  setStatus('checking');const query=input.query,timer=setTimeout(async()=>{try{
   const next=await fetchGenericSpaceCurveFoldWhenIdle(query,AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
   if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');
  }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
  return ()=>{clearTimeout(timer);controller.abort();};},[input]);
 const invalidate=()=>{++generation.current;request.current?.abort();setResult(null);setActive(0);setStatus('checking');setError('');};
 const edit=(key:Field,value:string)=>{invalidate();setDraft(previous=>({...previous,[key]:value}));};
 const editFold=(i:number,value:string)=>{invalidate();setDraft(previous=>({...previous,fold:previous.fold.map((v,j)=>j===i?value:v)}));};
 const restore=(query:Query)=>{invalidate();setDraft(makeDraft(query));setAngle(-35);};
 const number=(key:Exclude<Field,'gamma'|'orientation'>,label:string)=><label className="nsc-field" key={key}><span>{label}</span>
  <input aria-label={`空间曲折${label}`} type="number" step={key==='segments'||key==='ruling'?'1':'any'} title={draft[key]}
   value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
 const cert=result?.certification,d=result?.diagnostics,domain=result?.domain,
  incompatible=!!cert&&(!cert.finiteLeftMetricVerified||!cert.finiteRightMetricVerified||!cert.finiteDevelopabilityVerified||
   !cert.finiteSharedGeodesicCurvatureVerified||!cert.finiteUnitRulingsVerified),
  degenerate=!!domain&&[domain.sourceStripRegularity.left,domain.sourceStripRegularity.right,
   domain.formalStripRegularity.left,domain.formalStripRegularity.right].some(side=>side.status==='degenerate'),
  row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],
  statusText=status==='error'?error:status==='checking'?'四个原源式正在构造母线、展开与核验…':incompatible?'有限点证据不相容；保留原实际只读构形。':
   degenerate?'带宽内存在焦点；保留完整原域，不代表整张纸正则。':
   `${domain?.certified?'Frenet与符号分支全域已证':'Frenet或符号分支全域未证'}；${cert?.formalCommonFlatteningCertified?'形式共同展开已证':'共同展开未证'}。`;
 const evidence=(name:string,value:string,details?:string,warn=false)=><div className={`nsc-evidence-item ${warn?'warning':''}`} title={details} key={name}>
  <span>{name}</span><strong>{value}</strong></div>;
 const metricEvidence=(side:'left'|'right')=>{const verified=cert?.[side==='left'?'finiteLeftMetricVerified':'finiteRightMetricVerified'],
  residual=d?.[side==='left'?'maximumLeftRelativeMetricDifference':'maximumRightRelativeMetricDifference'];return evidence(`有限${side==='left'?'左':'右'}EFG`,
  `${verified===undefined?'—':verified?'通过':'不相容'} ${scientific(residual)}`,d?`129个纵向核验点与显示网格；E、F、G各按自身自然量级相对核验；容差${d.metricTolerance}`:undefined,verified===false);};
 const stripEvidence=(formal:boolean,side:'left'|'right')=>{const strip=domain?.[formal?'formalStripRegularity':'sourceStripRegularity'][side];return evidence(
  `${formal?'展开':'源'}${side==='left'?'左':'右'}带`,evidenceName(strip?.status),strip?`${strip.reason??'全带区间Jacobian已证'}；方向${strip.orientation??'未知'}；下界${strip.minimumAbsoluteJacobianLowerBound??'未知'}`:undefined,strip?.status==='degenerate');};
 return <TessDialog title="第 45 节 · 空间曲折·四源原式" onClose={onClose}>
  <div className="native-space-curve-fold-dialog">
   <aside className="nsc-controls">
    <div className="nsc-source-head"><span>原空间折痕 ff(s) · 三坐标</span></div>
    <div className="nsc-expressions">{draft.fold.map((value,i)=><label className="nsc-expression" key={i}><span>f{['ₓ','ᵧ','𝓏'][i]}</span>
     <input aria-label={`空间曲折折痕${['x','y','z'][i]}表达式`} value={value} title={value} spellCheck={false} onChange={e=>editFold(i,e.target.value)}/></label>)}</div>
    <div className="nsc-angle"><label className="nsc-expression"><span>γ(s)</span><input aria-label="空间曲折折角表达式" value={draft.gamma}
     title={draft.gamma} spellCheck={false} onChange={e=>edit('gamma',e.target.value)}/></label>
     <label className="nsc-field"><span>方向 ς</span><select aria-label="空间曲折原方向" value={draft.orientation} onChange={e=>edit('orientation',e.target.value)}>
      <option value="1">+1</option><option value="-1">−1</option></select></label></div>
    <p className="nsc-guide" title="输入弧度；γ=π允许。sin(γ/2)=0、原Frenet曲率或U′Sign投影退化时，保留源表达式并报告实际不规则，不代入极限。">γ用弧度 · π允许 · 原Sign/Abs单位母线</p>
    <div className="nsc-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}
     {number('segments','纵向段数')}{number('ruling','横向段数')}</div>
    <p className="nsc-fixed-initial" title="展开副视图显式采用原NCurvedFoldHelix2D In[3966] wrapper的NFlattenFold2D初值{u0,{1,0},{0,1}}。原四源函数本身没有恢复初值参数。">
     原展开初值：s₀=s起点，f₀=(1,0)，t₀=(0,1)</p>
    <div className={`nsc-status ${status} ${incompatible||degenerate?'warning':''}`} role={status==='error'?'alert':'status'}
     data-testid="native-space-curve-fold-status" title={statusText}>{statusText}</div>
    <div className="nsc-evidence" data-testid="native-space-curve-fold-diagnostics">
     {metricEvidence('left')}{metricEvidence('right')}
     {evidence('有限可展',`${cert?.finiteDevelopabilityVerified===undefined?'—':cert.finiteDevelopabilityVerified?'通过':'不相容'} ${scientific(d?Math.max(d.maximumLeftRelativeDevelopabilityResidual,d.maximumRightRelativeDevelopabilityResidual):undefined)}`,
      d?`左${d.maximumLeftRelativeDevelopabilityResidual}；右${d.maximumRightRelativeDevelopabilityResidual}；有限数值点可展核验`:undefined,cert?.finiteDevelopabilityVerified===false)}
     {evidence('共有曲率g',scientific(d?.maximumSharedGeodesicCurvatureResidual),'原左、右Darboux共有g恒等式及有限点核验',cert?.finiteSharedGeodesicCurvatureVerified===false)}
     {evidence('单位母线Δ',scientific(d?.maximumUnitRulingResidual),'原Sign/Abs产生世界单位母线；源坐标缩放不会缩放母线',cert?.finiteUnitRulingsVerified===false)}
     {evidence('标架GramΔ',scientific(d?.maximumFrameResidual),'原Frenet空间标架与展开二维标架的有限正交／单位残差')}
     {evidence('Frenet／符号域',domain?`${domain.certified?'已证':'未证'}·${domain.verifiedCells}段`:'—',domain?`${domain.evaluations}次区间细分；${domain.reason??'完整原域已证'}；速度、曲率、U′长度和左右Sign投影各独立非零下界`:undefined)}
     {evidence('形式共同展开',cert?cert.formalCommonFlatteningCertified?'已证':'未证':'—','精确ODE局部恒等式；不等于积分误差、全域单射或整带正则认证')}
     {stripEvidence(false,'left')}{stripEvidence(false,'right')}{stripEvidence(true,'left')}{stripEvidence(true,'right')}
    </div>
    <div className="nsc-position"><label htmlFor="nsc-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label>
     <input id="nsc-position" aria-label="空间曲折同步母线" type="range" min="0" max={result?.query.segments??32}
      disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></div>
    <div className="nsc-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'空间曲折四源原式.json')}>保存源 JSON</button>
     <button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>restore(GENERIC_SPACE_CURVE_FOLD_PRESET)}>恢复原式</button>
     <input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入空间曲折源文件" onChange={async e=>{
      const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
      try{if(selected.size>16384)throw Error('源文件过大。');const next=validateGenericSpaceCurveFoldQuery(JSON.parse(await selected.text()));
       if(id!==generation.current)return;restore(next);
      }catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
   </aside>
   <main className="nsc-results"><div className="nsc-topline"><div><span>SPACE CURVE FOLD</span><strong>原四源曲折构造 · 共同平面展开</strong></div><small>只读网面</small></div>
    <div className="nsc-panels">{[false,true].map(target=><section className={`nsc-panel ${target?'target':'source'}`} key={String(target)}>
     <header><span>{target?'PLANAR':'SPATIAL'}</span><strong>{target?'原固定初值展开':'原Sign/Abs空间带'}</strong></header>
     {result?<Drawing result={result} target={target} angle={angle} active={active}/>:<div className="nsc-empty">{status==='checking'?'构造核验中':'无有效构形'}</div>}
     {target?<p>In[3966]固定初值 · 完整原域</p>:<label className="nsc-azimuth">视角<input aria-label="空间曲折来源三维视角" type="range" min="-180" max="180"
      value={angle} onChange={e=>setAngle(Number(e.target.value))}/><b>{angle}°</b></label>}</section>)}</div>
    <div className="nsc-legend"><span><i className="crease"/>原折痕</span><span><i className="left"/>左原带</span><span><i className="right"/>右原带</span></div>
    <div className="nsc-certification"><strong>形式等距、有限构形和全带正则分别核验</strong><span>积分误差、全域单射及碰撞未认证；曲线网面不可采用为直折CP／FOLD。</span></div>
    <footer className="nsc-footer"><span title="FoldSpaceCurve3D / NSpaceCurveFold3D · In[3939] / In[3942]">FoldSpaceCurve3D · NSpaceCurveFold3D<br/>空间源不被替换；视角与母线为本地操作</span>
     <div><button onClick={onSaved}>原保存例</button><button className="primary" onClick={onClose}>关闭</button></div></footer>
   </main>
  </div>
 </TessDialog>;
}

