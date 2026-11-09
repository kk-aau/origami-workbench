import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {GENERIC_FOLD_3D_PRESET,validateGenericFold3DQuery,fetchGenericFold3DWhenIdle,
 type GenericFold3DQuery,type GenericFold3DResult} from '../app/curvedNativeFold3D';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeFold3DDialog.css';

type Query=GenericFold3DQuery;
type Result=GenericFold3DResult;
type Point=[number,number];
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
const scientific=(n:number|undefined)=>n===undefined?'—':n.toExponential(1);
const evidenceName=(status:string|undefined)=>status===undefined?'—':({analytic:'解析已证',numerical:'有限点通过',unknown:'未证',incompatible:'不相容',
 verified:'正则已证',degenerate:'退化边界'}[status]??status);
function makeDraft(q:Query){return {fold:q.foldCurve.slice(),left:q.leftDirector.slice(),right:q.rightDirector.slice(),point:q.initialPoint.map(String),
 tangent:q.initialTangent.map(String),top:q.initialTopBinormal.map(String),gamma:String(q.initialFoldAngleRad),start:String(q.parameterStart),end:String(q.parameterEnd),wStart:String(q.transverseStart),
 wEnd:String(q.transverseEnd),initial:String(q.initialParameter),segments:String(q.segments),ruling:String(q.rulingSegments)};}
type Draft=ReturnType<typeof makeDraft>;
type ArrayField='fold'|'left'|'right'|'point'|'tangent'|'top';
type NumberField=Exclude<keyof Draft,ArrayField>;

function Drawing({result,target,angle,active}:{result:Result;target:boolean;angle:number;active:number}){
 const a=angle*Math.PI/180,project=(p:number[]):Point=>!target?[p[0],p[1]]:
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
 return <svg data-testid={`native-fold-3d-${target?'target':'source'}`} role="img"
  aria-label={target?'原初值实际计算的空间双侧曲折带':'原平面双侧曲折带'}
  viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
  {sides.map(({side,first,last})=><path className={`nf3-band ${side}`} key={side} d={path([...first,...last.slice().reverse()])+' Z'}/>)}
  {sides.map(({side,points,first,last})=><g className={side} key={side}>
   {Array.from({length:result.query.rulingSegments-1},(_,k)=>k+1).filter(k=>k%wStep===0).map(k=>
    <path className="nf3-mesh" key={`w${k}`} d={path(points.map(row=>project(row[k])))} vectorEffect="non-scaling-stroke"/>)}
   {base.map((_,i)=>i%step===0||i===base.length-1?<line className="nf3-ruling" key={i} vectorEffect="non-scaling-stroke"
    x1={first[i][0]} y1={-first[i][1]} x2={last[i][0]} y2={-last[i][1]}/>:null)}
   <path className="nf3-edge" d={path(first)} vectorEffect="non-scaling-stroke"/>
   <path className="nf3-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
   <line className="nf3-selected" vectorEffect="non-scaling-stroke" x1={first[at][0]} y1={-first[at][1]} x2={last[at][0]} y2={-last[at][1]}/>
  </g>)}
  <path className="nf3-crease" d={path(base)} vectorEffect="non-scaling-stroke"/>
  <circle className="nf3-marker" vectorEffect="non-scaling-stroke" cx={p[0]} cy={-p[1]} r={span*.011}/>
 </svg>;
}

export default function CurvedNativeFold3DDialog({onClose,onCircle}:{onClose:()=>void;onCircle:()=>void}){
 const [draft,setDraft]=useState(()=>makeDraft(GENERIC_FOLD_3D_PRESET)),[result,setResult]=useState<Result|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0),[angle,setAngle]=useState(-35);
 const generation=useRef(0),request=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null);
 const input=useMemo(()=>{try{
  if([...draft.fold,...draft.left,...draft.right,...draft.point,...draft.tangent,...draft.top,draft.gamma,draft.start,draft.end,draft.wStart,draft.wEnd,
   draft.initial,draft.segments,draft.ruling].some(value=>!value.trim()))throw Error('请填完整六个源表达式、原折角、空间点与初始标架及数值域。');
  return {query:validateGenericFold3DQuery({family:'fold-3d-generic-native',foldCurve:draft.fold,leftDirector:draft.left,rightDirector:draft.right,
   parameterStart:Number(draft.start),parameterEnd:Number(draft.end),transverseStart:Number(draft.wStart),transverseEnd:Number(draft.wEnd),
   initialParameter:Number(draft.initial),segments:Number(draft.segments),rulingSegments:Number(draft.ruling),
   initialFoldAngleRad:Number(draft.gamma),initialPoint:draft.point.map(Number),initialTangent:draft.tangent.map(Number),initialTopBinormal:draft.top.map(Number)}),error:''};
 }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
 useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;
  setResult(null);setActive(0);setError('');if(!input.query){setStatus('error');setError(input.error);return ()=>controller.abort();}
  setStatus('checking');const query=input.query,timer=setTimeout(async()=>{try{
   const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]),next=await fetchGenericFold3DWhenIdle(query,signal);
   if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');
  }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setError((cause as Error).message);}},150);
  return ()=>{clearTimeout(timer);controller.abort();};},[input]);
 const invalidate=()=>{++generation.current;request.current?.abort();setResult(null);setActive(0);setStatus('checking');setError('');};
 const edit=(key:NumberField,value:string)=>{invalidate();setDraft(previous=>({...previous,[key]:value}));};
 const editArray=(key:ArrayField,i:number,value:string)=>{invalidate();setDraft(previous=>({...previous,[key]:previous[key].map((v,j)=>j===i?value:v)}));};
 const restore=(query:Query)=>{invalidate();setDraft(makeDraft(query));setAngle(-35);};
 const component=['x','y','z'],sub=['ₓ','ᵧ','𝓏'],sourceNames={fold:'平面折痕',left:'左母线',right:'右母线'},sourceSymbols={fold:'f',left:'rL',right:'rR'};
 const expression=(key:'fold'|'left'|'right',i:number)=><label className="nf3-expression" key={`${key}${i}`}>
  <span>{sourceSymbols[key]}{sub[i]}</span><input aria-label={`曲折恢复${sourceNames[key]}${component[i]}表达式`} spellCheck={false}
   title={draft[key][i]} value={draft[key][i]} onChange={e=>editArray(key,i,e.target.value)}/></label>;
 const initial=(key:'point'|'tangent'|'top',i:number)=><label className="nf3-field" key={`${key}${i}`}>
  <span>{key==='point'?'fᵢ':key==='tangent'?'tᵢ':'bbtᵢ'}{sub[i]}</span>
  <input aria-label={`曲折恢复原初值${key==='point'?'位置':key==='tangent'?'切向':'顶面副法向'}${component[i]}`} type="number" step="any" title={draft[key][i]}
   value={draft[key][i]} onChange={e=>editArray(key,i,e.target.value)}/></label>;
 const number=(key:NumberField,label:string)=><label className="nf3-field" key={key}><span>{label}</span><input aria-label={`曲折恢复${label}`}
  type="number" step={key==='segments'||key==='ruling'?'1':'any'} title={draft[key]} value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
 const cert=result?.certification,diagnostics=result?.diagnostics,domain=result?.domain,
  initialFrameIncompatible=cert?.initialFrameCompatible===false,
  incompatible=!!result&&(!cert?.finiteDevelopabilityVerified||!cert.finiteAngleEquationVerified||!cert.finiteLeftMetricVerified||!cert.finiteRightMetricVerified),
  degenerate=!!domain&&[domain.sourceStripRegularity.left,domain.sourceStripRegularity.right,domain.formalStripRegularity.left,domain.formalStripRegularity.right].some(side=>side.status==='degenerate'),
  row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],
  statusText=status==='error'?error:status==='checking'?'六个原源式、原折角与初始标架正在积分、核验…':initialFrameIncompatible?'原数值初帧不相容；形式等距未证，保留原计算只读双图。':incompatible?'双侧可展、折角方程或度量不相容；保留原计算只读双图。':
   degenerate?'源或形式带含退化边界；保留原计算只读双图。':`${domain?.certified?'源正则全域已证':'源正则全域未证'}；${cert?.formalIsometryCertified?'精确 ODE 形式等距已证':'形式等距未证'}。`;
 const evidence=(name:string,value:string,details?:string,warn=false)=><div className={`nf3-evidence-item ${warn?'warning':''}`} title={details} key={name}>
  <span>{name}</span><strong>{value}</strong></div>;
 const metricEvidence=(side:'left'|'right')=>{const verified=cert?.[side==='left'?'finiteLeftMetricVerified':'finiteRightMetricVerified'],
  residual=diagnostics?.[side==='left'?'maximumLeftRelativeMetricDifference':'maximumRightRelativeMetricDifference'];return evidence(`${side==='left'?'左':'右'} EFG`,
  `${verified===undefined?'—':verified?'通过':'不相容'} ${scientific(residual)}`,diagnostics?`${diagnostics.validationNodes} 个纵向核验点及显示网格；有限相对度量差 ${residual}；容差 ${diagnostics.metricTolerance}`:undefined,verified===false);};
 const developabilityEvidence=(side:'left'|'right')=>{const residual=diagnostics?.[side==='left'?'maximumLeftRelativeDevelopabilityResidual':'maximumRightRelativeDevelopabilityResidual'];
  return evidence(`${side==='left'?'左':'右'}可展Δ`,scientific(residual),diagnostics?`有限相对可展残差 ${residual}；容差 ${diagnostics.developabilityTolerance}`:undefined,
   residual!==undefined&&diagnostics!==undefined&&residual>diagnostics.developabilityTolerance);};
 const stripEvidence=(formal:boolean,side:'left'|'right')=>{const strip=domain?.[formal?'formalStripRegularity':'sourceStripRegularity'][side];return evidence(
  `${formal?'形式':'源'}${side==='left'?'左':'右'}带`,evidenceName(strip?.status),strip?`${strip.reason??'区间 Jacobian 正则证据'}；方向 ${strip.orientation??'未知'}；绝对下界 ${strip.minimumAbsoluteJacobianLowerBound??'未知'}`:undefined,strip?.status==='degenerate');};
 const branch=domain?.angleBranch;
 return <TessDialog title="第 45 节 · 平面曲折到空间·原式" onClose={onClose}>
  <div className="native-fold-3d-dialog">
   <aside className="nf3-controls">
    <div className="nf3-source-head"><span>平面折痕 f(s)</span><span>左母线 rL(s)</span><span>右母线 rR(s)</span></div>
    <div className="nf3-expressions">{[0,1].flatMap(i=>[expression('fold',i),expression('left',i),expression('right',i)])}</div>
    <p className="nf3-guide" title="支持 Sin[]、Cos[]、Exp[]、Sqrt[]、ArcTan[]、Pi、^、相邻乘法；母线幅度保留，不自动修复原源输入。">原母线幅度保留 · 切向／顶面副法向须正交单位</p>
    <div className="nf3-modes"><label className="nf3-field"><span>原函数</span><select aria-label="曲折恢复示例" value="generic" onChange={e=>{if(e.target.value==='circle')onCircle();}}>
     <option value="generic">通用六源原式</option><option value="circle">原圆弧保存例 ±120°</option></select></label>
     {number('gamma','γᵢ · rad')}{number('initial','初值 sᵢ')}</div>
    <div className="nf3-initial">{[0,1,2].flatMap(i=>[initial('point',i),initial('tangent',i),initial('top',i)])}</div>
    <div className="nf3-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}
     {number('segments','纵向段数')}{number('ruling','横向段数')}</div>
    <div className={`nf3-status ${status} ${initialFrameIncompatible||incompatible||degenerate?'warning':''}`} role={status==='error'?'alert':'status'}
     data-testid="native-fold-3d-status" title={statusText}>{statusText}</div>
    <div className="nf3-evidence" data-testid="native-fold-3d-diagnostics">
     {metricEvidence('left')}{metricEvidence('right')}
     {developabilityEvidence('left')}{developabilityEvidence('right')}
     {evidence('折角方程',scientific(diagnostics?.maximumAngleEquationResidual),'有限折角 ODE 相对残差；不代表积分误差区间认证',cert?.finiteAngleEquationVerified===false)}
     {evidence('标架Δ',scientific(diagnostics?.maximumFrameResidual),'空间 Frenet 标架有限点单位／正交残差')}
     {evidence('初帧 Gram',result?`${result.initial.frameCompatible?'通过':'不相容'} ${scientific(result.initial.frameGramResidual)}`:'—',
      result?`原数值初帧 Gram 残差 ${result.initial.frameGramResidual}；相容容差 ${result.initial.frameCompatibilityTolerance}；原输入不归一化或修补` :undefined,initialFrameIncompatible)}
     {evidence('源正则',domain?`${domain.certified?'已证':'未证'}·${domain.verifiedCells}段`:'—',domain?.reason??undefined)}
     {evidence('折角分支',branch?`${branch.certified?'已证':'未证'}／${branch.cosineHalfAngleSign===1?'+':branch.cosineHalfAngleSign===-1?'−':'?'}`:'—',
      branch?`${branch.method}；cos(γ/2) 符号 ${branch.cosineHalfAngleSign}；|sin(γ/2)| 下界 ${branch.minimumAbsoluteSineHalfAngleLowerBound??'未证'}；|cos(γ/2)| 下界 ${branch.minimumAbsoluteCosineHalfAngleLowerBound??'未证'}；${branch.reason??'完整源域分支已证'}`:undefined)}
     {stripEvidence(false,'left')}{stripEvidence(false,'right')}{stripEvidence(true,'left')}{stripEvidence(true,'right')}
    </div>
    <div className="nf3-position"><label htmlFor="nf3-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label>
     <input id="nf3-position" aria-label="曲折恢复同步母线" type="range" min="0" max={result?.query.segments??32}
      disabled={!result} value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></div>
    <div className="nf3-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'平面曲折到空间原源初值.json')}>保存源 JSON</button>
     <button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>restore(GENERIC_FOLD_3D_PRESET)}>恢复原式初值</button>
     <input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入曲折恢复源文件" onChange={async e=>{
      const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
      try{if(selected.size>16384)throw Error('源文件过大。');const next=validateGenericFold3DQuery(JSON.parse(await selected.text()));
       if(id!==generation.current)return;restore(next);
      }catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
   </aside>
   <main className="nf3-results"><div className="nf3-topline"><div><span>FOLD CURVED FOLD 3D</span><strong>原平面双侧带 → 空间曲折恢复</strong></div><small>原式数值 · 只读</small></div>
    <div className="nf3-panels">{[false,true].map(target=><section className={`nf3-panel ${target?'target':'source'}`} key={String(target)}>
     <header><span>{target?'TARGET':'SOURCE'}</span><strong>{target?'空间双侧曲折带':'原平面双侧带'}</strong></header>
     {result?<Drawing result={result} target={target} angle={angle} active={active}/>:<div className="nf3-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
     {!target?<p>原六源式 · 母线幅度保留</p>:<label className="nf3-azimuth">视角<input aria-label="曲折恢复目标三维视角" type="range" min="-180" max="180"
      value={angle} onChange={e=>setAngle(Number(e.target.value))}/><b>{angle}°</b></label>}</section>)}</div>
    <div className="nf3-legend"><span><i className="crease"/>折痕 w=0</span><span><i className="left"/>左侧原带</span><span><i className="right"/>右侧原带</span></div>
    <div className="nf3-certification"><strong>精确 ODE 形式证据与数值构形分开</strong><span>积分误差、全域单射、碰撞、精确 FOLD 均未认证。</span></div>
    <footer className="nf3-footer"><span title="FoldCurvedFold3D / NFoldCurvedFold3D · In[3972] / In[3977]">FoldCurvedFold3D · NFoldCurvedFold3D<br/>视角与母线为本地操作</span><button className="primary" onClick={onClose}>关闭</button></footer>
   </main>
  </div>
 </TessDialog>;
}
