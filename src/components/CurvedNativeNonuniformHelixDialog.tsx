import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {NONUNIFORM_HELIX_NATIVE_PRESET,validateGenericNonuniformHelixQuery,fetchGenericNonuniformHelixWhenIdle,
 type GenericNonuniformHelixQuery,type GenericNonuniformHelixResult} from '../app/curvedNativeNonuniformHelix';
import {TessDialog} from './TessellationEditor';
import {createNonuniformHelixDesign,curveDesignApplyProblem,exportCurveDesignJSON,
 exportCurveDesignSVG,exportCurveDesignOBJ,parseCurveDesign,type CurveDesign} from '../app/curveDesign';
import {curveDesignDocument} from '../app/curveDesignProject';
import './CurvedNativeNonuniformHelixDialog.css';

type Query=GenericNonuniformHelixQuery;type Result=GenericNonuniformHelixResult;type Point=[number,number];
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
const scientific=(x:number|undefined)=>x===undefined?'—':x.toExponential(1);
const regularity=(s:string|undefined)=>s===undefined?'—':({verified:'正则已证',unknown:'未证',degenerate:'有焦点'}[s]??s);
const makeDraft=(q:Query)=>({radius:String(q.radius),theta:String(q.pitchAngle),gamma:q.foldAngle,start:String(q.parameterStart),end:String(q.parameterEnd),
 wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),segments:String(q.segments),ruling:String(q.rulingSegments)});
type Draft=ReturnType<typeof makeDraft>;type NumberField=Exclude<keyof Draft,'gamma'>;
function Drawing({result,target,angle,active}:{result:Result;target:boolean;angle:number;active:number}){
 const flat=result.flattening.result,a=angle*Math.PI/180,project=(p:number[]):Point=>target?[p[0],p[1]]:
  [Math.cos(a)*p[0]-Math.sin(a)*p[2],p[1]+.34*(Math.sin(a)*p[0]+Math.cos(a)*p[2])],
  base=(target?flat!.sample.rows.map(row=>row.normalizedTargetBase):result.sample.rows.map(row=>row.normalizedSourceBase)).map(project),
  sides=(['left','right'] as const).map(side=>{const grid=target?flat!.grid:result.grid,points=grid.map(row=>target?
    side==='left'?(row as NonNullable<typeof flat>['grid'][number]).normalizedTargetLeft:(row as NonNullable<typeof flat>['grid'][number]).normalizedTargetRight:
    side==='left'?row.normalizedSourceLeft:row.normalizedSourceRight);
   return {side,points,first:points.map(row=>project(row[0])),last:points.map(row=>project(row.at(-1)!))};}),
  all=[...base,...sides.flatMap(side=>[...side.first,...side.last])],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x0=Math.min(...xs),y0=Math.min(...ys),
  width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,span=Math.max(width,height)||1,pad=.12*span,at=Math.min(active,base.length-1),
  step=Math.max(1,Math.ceil(result.query.segments/14)),wStep=Math.max(1,Math.ceil(result.query.rulingSegments/6));
 return <svg data-testid={`native-nonuniform-helix-${target?'target':'source'}`} role="img" aria-label={target?'原固定初值二维展开':'原闭式非均匀空间螺旋'}
  viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,.01*span)+2*pad} ${Math.max(height,.01*span)+2*pad}`} preserveAspectRatio="xMidYMid meet">
  {sides.map(({side,first,last})=><path className={`nnh-band ${side}`} key={side} d={path([...first,...last.slice().reverse()])+' Z'}/>)}
  {sides.map(({side,points,first,last})=><g className={side} key={side}>
   {Array.from({length:result.query.rulingSegments-1},(_,i)=>i+1).filter(i=>i%wStep===0).map(i=><path className="nnh-mesh" key={`w${i}`}
    d={path(points.map(row=>project(row[i])))} vectorEffect="non-scaling-stroke"/>)}
   {base.map((_,i)=>i%step===0||i===base.length-1?<line className="nnh-ruling" key={i} x1={first[i][0]} y1={-first[i][1]} x2={last[i][0]} y2={-last[i][1]} vectorEffect="non-scaling-stroke"/>:null)}
   <path className="nnh-edge" d={path(first)} vectorEffect="non-scaling-stroke"/><path className="nnh-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
   <line className="nnh-selected" x1={first[at][0]} y1={-first[at][1]} x2={last[at][0]} y2={-last[at][1]} vectorEffect="non-scaling-stroke"/>
  </g>)}<path className="nnh-crease" d={path(base)} vectorEffect="non-scaling-stroke"/>
  <circle className="nnh-marker" cx={base[at][0]} cy={-base[at][1]} r={span*.011} vectorEffect="non-scaling-stroke"/>
 </svg>;
}

export default function CurvedNativeNonuniformHelixDialog({onClose,onSaved,initial,onApply,onPreview,onCancelPreview}:{
 onClose:()=>void;onSaved?:()=>void;initial?:CurveDesign;onApply?:(design:CurveDesign)=>boolean|void;
 onPreview?:(design:CurveDesign)=>void;onCancelPreview?:()=>void}){
 const [draft,setDraft]=useState(()=>makeDraft(initial?.query??NONUNIFORM_HELIX_NATIVE_PRESET)),[result,setResult]=useState<Result|null>(initial?.result??null),
  [name,setName]=useState(initial?.name??'非均匀螺旋曲折'),[millimeters,setMillimeters]=useState(String(initial?.millimetersPerUnit??100)),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0),[angle,setAngle]=useState(-35),
  generation=useRef(0),request=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null),
  previewCallbacks=useRef({onPreview,onCancelPreview});
 previewCallbacks.current={onPreview,onCancelPreview};
 useEffect(()=>()=>{++generation.current;request.current?.abort();previewCallbacks.current.onCancelPreview?.();},[]);
 const input=useMemo(()=>{try{if(Object.values(draft).some(x=>!x.trim()))throw Error('请填完整r、θ、γ(s)与所有域。');
  return {query:validateGenericNonuniformHelixQuery({family:'nonuniform-helix-generic-native',radius:Number(draft.radius),pitchAngle:Number(draft.theta),foldAngle:draft.gamma,
    parameterStart:Number(draft.start),parameterEnd:Number(draft.end),transverseStart:Number(draft.wStart),transverseEnd:Number(draft.wEnd),
    segments:Number(draft.segments),rulingSegments:Number(draft.ruling)}),error:''};
 }catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
 useEffect(()=>{const id=++generation.current,controller=new AbortController();request.current=controller;setActive(0);setError('');
  if(!input.query){setResult(null);setStatus('error');setError(input.error);return ()=>controller.abort();}setStatus('checking');const query=input.query,timer=setTimeout(async()=>{
   try{const next=await fetchGenericNonuniformHelixWhenIdle(query,AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
    if(id!==generation.current||controller.signal.aborted)return;setResult(next);setStatus('ready');}
   catch(cause){if(id!==generation.current||controller.signal.aborted)return;setResult(null);setStatus('error');setError((cause as Error).message);}},150);
  return ()=>{clearTimeout(timer);controller.abort();};},[input]);
 const invalidate=()=>{++generation.current;request.current?.abort();setActive(0);setStatus('checking');setError('');};
 const edit=(key:keyof Draft,value:string)=>{invalidate();setDraft(old=>({...old,[key]:value}));};
 const restore=(q:Query)=>{invalidate();setDraft(makeDraft(q));setAngle(-35);};
 const number=(key:NumberField,label:string)=><label className="nnh-field" key={key}><span>{label}</span><input aria-label={`非均匀螺旋${label}`}
  type="number" step={key==='segments'||key==='ruling'?'1':'any'} value={draft[key]} title={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
 const flat=result?.flattening.result,fd=flat?.domain,fc=flat?.certification,diag=flat?.diagnostics,
  stage=result?.flattening.status,row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],
  stageName=stage===undefined?'—':stage==='computed'?'已求值':stage==='source-singularity'?'原帧退化':stage==='integration-failed'?'积分失败':'完整帧未证',
  statusText=status==='error'?error:status==='checking'?'正在构造原螺旋母线、展开与核验…':
    `原三维${result?.domain.certified?'完整源域已证':'完整源域未证'}；二维${stageName}。`,
  evidence=(name:string,value:string,detail?:string,warn=false)=><div className={`nnh-evidence-item ${warn?'warning':''}`} key={name} title={detail}><span>{name}</span><strong>{value}</strong></div>,
  designProblem=status!=='ready'||!result?'请等待当前参数计算完成。':curveDesignApplyProblem(result),
  metadataProblem=!name.trim()||name.length>120?'请输入 1–120 字设计名称。':!millimeters.trim()||!Number.isFinite(Number(millimeters))||Number(millimeters)<=0||Number(millimeters)>1e6?'请输入有效实际尺寸。':null;
 const prepared=useMemo<{design:CurveDesign|null;error:string|null}>(()=>{
  if(designProblem||metadataProblem||!result||!input.query)return {design:null,error:null};
  if(Object.keys(input.query).some(key=>result.query[key as keyof Query]!==input.query![key as keyof Query]))
   return {design:null,error:'请等待当前参数计算完成。'};
  try{
   const design=createNonuniformHelixDesign(result,{name,millimetersPerUnit:Number(millimeters)});
   // Apply uses an ordinary project envelope. Check its dimensions and storage budget here,
   // while the parameter dialog can show the error, before publishing or committing a draft.
   curveDesignDocument(design);
   return {design,error:null};
  }catch(cause){return {design:null,error:(cause as Error).message};}
 },[result,input.query,name,millimeters,designProblem,metadataProblem]);
 const blocked=designProblem??metadataProblem??prepared.error,
  shownStatus=prepared.error??statusText,
  withDesign=(action:(design:CurveDesign)=>void)=>{if(blocked||!prepared.design)return;try{
   action(prepared.design);
  }catch(cause){setError((cause as Error).message);setStatus('error');}},
  close=()=>{previewCallbacks.current.onCancelPreview?.();onClose();};
 useEffect(()=>{
  const callbacks=previewCallbacks.current;
  if(!callbacks.onPreview)return;
  if(status==='error'||metadataProblem||(status==='ready'&&(designProblem||prepared.error))){
   callbacks.onCancelPreview?.();return;
  }
  // Keep the last valid picture while a new query is pending. Never publish a stale result.
  if(status!=='ready'||!prepared.design)return;
  try{callbacks.onPreview(prepared.design);}
  catch(cause){callbacks.onCancelPreview?.();setError((cause as Error).message);setStatus('error');}
 },[status,prepared,metadataProblem,designProblem]);
 return <TessDialog title="构造非均匀螺旋曲折" onClose={close}><div className="native-nonuniform-helix-dialog">
  <aside className="nnh-controls"><div className="nnh-native-parameters">{number('radius','半径 r')}{number('theta','θ 弧度')}</div>
   <div className="nnh-design-fields"><label className="nnh-field"><span>设计名称</span><input aria-label="曲面设计名称" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label>
    <label className="nnh-field"><span>每单位 / mm</span><input aria-label="曲面每单位毫米" type="number" min="0.000001" max="1000000" step="any" value={millimeters} onChange={e=>setMillimeters(e.target.value)}/></label></div>
   <label className="nnh-expression"><span>γ(s)</span><input aria-label="非均匀螺旋折角表达式" value={draft.gamma} title={draft.gamma} spellCheck={false} onChange={e=>edit('gamma',e.target.value)}/></label>
   <p className="nnh-guide">γ与θ用弧度 · r符号不限 · 保原母线朝向</p>
   <div className="nnh-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}
    {number('segments','纵向段数')}{number('ruling','横向段数')}</div>
   <p className="nnh-fixed-initial">原展开初值：s₀=s起点，f₀=(1,0)，t₀=(0,1)</p>
   <div className={`nnh-status ${status} ${prepared.error||stage&&stage!=='computed'?'warning':''}`} data-testid="native-nonuniform-helix-status" role={status==='error'||prepared.error?'alert':'status'} title={shownStatus}>{shownStatus}</div>
   <details className="nnh-diagnostics"><summary>几何检查详情</summary><div className="nnh-evidence" data-testid="native-nonuniform-helix-diagnostics">
    {evidence('原三维规则',result?'完整求值':'—','In3959原闭式；γ=0时不由一般Sign0替换为零母线')}
    {evidence('三维源域',result?`${result.domain.certified?'已证':'未证'}·${result.domain.verifiedCells}段`:'—',result?.domain.reason??result?.domain.roundingModel)}
    {evidence('单位母线 Δ',scientific(result?.diagnostics.maximumUnitRulingResidual))}
    {evidence('有限可展 Δ',scientific(result?.diagnostics.maximumRelativeDevelopabilityResidual))}
    {evidence('原二维阶段',stageName,result?.flattening.reason??undefined,!!stage&&stage!=='computed')}
    {evidence('形式共同展开',fc?(fc.formalCommonFlatteningCertified?'已证':'未证'):'—')}
    {evidence('有限左 EFG',`${fc?(fc.finiteLeftMetricVerified?'通过':'不相容'):'—'} ${scientific(diag?.maximumLeftRelativeMetricDifference)}`)}
    {evidence('有限右 EFG',`${fc?(fc.finiteRightMetricVerified?'通过':'不相容'):'—'} ${scientific(diag?.maximumRightRelativeMetricDifference)}`)}
    {evidence('源左带',regularity(fd?.sourceStripRegularity.left.status),fd?.sourceStripRegularity.left.reason??undefined)}
    {evidence('源右带',regularity(fd?.sourceStripRegularity.right.status),fd?.sourceStripRegularity.right.reason??undefined)}
    {evidence('展开左带',regularity(fd?.formalStripRegularity.left.status),fd?.formalStripRegularity.left.reason??undefined)}
    {evidence('展开右带',regularity(fd?.formalStripRegularity.right.status),fd?.formalStripRegularity.right.reason??undefined)}
   </div></details>
   <div className="nnh-position"><label htmlFor="nnh-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label><input id="nnh-position" aria-label="非均匀螺旋同步母线"
    type="range" min="0" max={result?.query.segments??48} value={result?Math.min(active,result.query.segments):0} disabled={!result} onChange={e=>setActive(Number(e.target.value))}/></div>
   <div className="nnh-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'非均匀螺旋原源.json')}>保存源 JSON</button>
    <button onClick={()=>file.current?.click()}>载入设计 / 源</button><button onClick={()=>restore(NONUNIFORM_HELIX_NATIVE_PRESET)}>原版预设</button>
    <input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入非均匀螺旋源文件" onChange={async e=>{
     const selected=e.target.files?.[0];e.target.value='';if(!selected)return;invalidate();const id=generation.current;
     try{if(selected.size>32*1024*1024)throw Error('曲面文件超过 32 MB。');const raw=JSON.parse(await selected.text());if(id!==generation.current)return;
      if(raw?.format==='zhezhi-curve-design'){const design=parseCurveDesign(raw);setName(design.name);setMillimeters(String(design.millimetersPerUnit));restore(design.query);}
      else restore(validateGenericNonuniformHelixQuery(raw));}
     catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
  </aside>
  <main className="nnh-results"><div className="nnh-topline"><div><span>NONUNIFORM HELIX</span><strong>空间曲面与二维展开</strong></div><small>{status==='checking'&&result?'保留上次结果 · 更新中':Number(millimeters)>0?`1 单位 = ${Number(millimeters)} mm`:'请设置实际尺寸'}</small></div>
   <div className="nnh-panels">{[false,true].map(target=><section className={`nnh-panel ${target?'target':'source'}`} key={String(target)}>
    <header><span>{target?'PLANAR':'SPATIAL'}</span><strong>{target?'原固定初值展开':'原闭式空间带'}</strong></header>
    {result&&(!target||flat)?<Drawing result={result} target={target} angle={angle} active={active}/>:<div className="nnh-empty" data-testid={target?'native-nonuniform-helix-target-state':undefined}
      title={target?result?.flattening.reason??undefined:undefined}>{status==='checking'?'构造核验中':target&&result?`二维${stageName}；保留原三维构形`:'无有效构形'}</div>}
    {target?<p>In[3966]固定初值 · 三维与二维分阶段</p>:<label className="nnh-azimuth">视角<input aria-label="非均匀螺旋来源三维视角" type="range" min="-180" max="180" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><b>{angle}°</b></label>}
   </section>)}</div><div className="nnh-legend"><span><i className="crease"/>原折痕</span><span><i className="left"/>左原带</span><span><i className="right"/>右原带</span></div>
   <div className="nnh-certification"><strong>{blocked??'曲面设计可应用 · 参数与二维 / 三维结果一起保存'}</strong><span>SVG 为实际尺寸曲线采样，OBJ 为曲面采样网格；尚未验证全局重叠、碰撞或折叠运动，不能直接当作直折痕 CP。</span></div>
   <div className="nnh-export"><button disabled={!!blocked} title={blocked??undefined} onClick={()=>withDesign(d=>download(exportCurveDesignJSON(d),'非均匀螺旋.curve-design.json'))}>保存设计</button>
    <button disabled={!!blocked} title={blocked??undefined} onClick={()=>withDesign(d=>download(exportCurveDesignSVG(d),'非均匀螺旋-展开采样.svg','image/svg+xml'))}>展开 SVG · mm</button>
    <button disabled={!!blocked} title={blocked??undefined} onClick={()=>withDesign(d=>download(exportCurveDesignOBJ(d),'非均匀螺旋-曲面采样.obj','text/plain'))}>曲面 OBJ</button></div>
   <footer className="nnh-footer"><span>{result?`${result.query.segments} × ${result.query.rulingSegments} 采样段`:'修改参数后自动更新'}</span><div>{onSaved&&<button onClick={onSaved}>原保存例</button>}<button onClick={close}>取消</button>
    {onApply&&<button className="primary" disabled={!!blocked} title={blocked??'将参数、二维展开和三维曲面应用到当前镶嵌画布'} onClick={()=>withDesign(design=>{const accepted=onApply(design);if(accepted!==false)close();})}>应用到当前画布</button>}</div></footer>
  </main>
 </div></TessDialog>;
}
