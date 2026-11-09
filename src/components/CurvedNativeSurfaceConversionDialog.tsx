import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {GENERIC_SURFACE_TO_CONE_PRESET,GENERIC_SURFACE_TO_CYLINDER_PRESET,validateGenericSurfaceConversionQuery,fetchGenericSurfaceConversionWhenIdle,
 type GenericSurfaceConversionQuery,type GenericSurfaceConversionResult,type NativeSurfaceConversionMode} from '../app/curvedNativeSurfaceConversion';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeSurfaceConversionDialog.css';

type Draft={flatBase:string[];flatSourceDirector:string[];spaceBase:string[];spaceSourceDirector:string[];flatPoint:string[];spacePoint:string[];flatDirection:string[];spaceDirection:string[];
 literal:string;start:string;end:string;wStart:string;wEnd:string;ui:string;segments:string;ruling:string};
const modeOf=(q:GenericSurfaceConversionQuery):NativeSurfaceConversionMode=>q.family==='surface-to-cone-generic-native'?'cone':'cylinder';
const preset=(mode:NativeSurfaceConversionMode)=>mode==='cone'?GENERIC_SURFACE_TO_CONE_PRESET:GENERIC_SURFACE_TO_CYLINDER_PRESET;
const toDraft=(q:GenericSurfaceConversionQuery):Draft=>{const cone=q.family==='surface-to-cone-generic-native';return {
 flatBase:q.sourceFlatBase.slice(),flatSourceDirector:q.sourceFlatDirector.slice(),spaceBase:q.sourceSpaceBase.slice(),spaceSourceDirector:q.sourceSpaceDirector.slice(),
 flatPoint:(cone?q.flatApex:q.flatReferencePoint).map(String),spacePoint:(cone?q.spaceApex:q.spaceReferencePoint).map(String),
 flatDirection:(cone?[0,1]:q.flatDirector).map(String),spaceDirection:(cone?[0,0,1]:q.spaceDirector).map(String),literal:q.literalMode,
 start:String(q.parameterStart),end:String(q.parameterEnd),wStart:String(q.transverseStart),wEnd:String(q.transverseEnd),ui:String(cone?q.initialParameter:q.parameterStart),segments:String(q.segments),ruling:String(q.rulingSegments)};};
const parse=(mode:NativeSurfaceConversionMode,d:Draft)=>{const num=(s:string)=>{if(!s.trim())throw Error('原参数不能为空。');const n=Number(s);if(!Number.isFinite(n))throw Error('坐标须有限。');return n;};
 return validateGenericSurfaceConversionQuery({sourceFlatBase:d.flatBase,sourceFlatDirector:d.flatSourceDirector,sourceSpaceBase:d.spaceBase,sourceSpaceDirector:d.spaceSourceDirector,
 literalMode:d.literal,parameterStart:num(d.start),parameterEnd:num(d.end),transverseStart:num(d.wStart),transverseEnd:num(d.wEnd),segments:num(d.segments),rulingSegments:num(d.ruling),
 ...(mode==='cone'?{family:'surface-to-cone-generic-native',initialParameter:num(d.ui),flatApex:d.flatPoint.map(num),spaceApex:d.spacePoint.map(num)}:
 {family:'surface-to-cylinder-generic-native',flatReferencePoint:d.flatPoint.map(num),flatDirector:d.flatDirection.map(num),spaceReferencePoint:d.spacePoint.map(num),spaceDirector:d.spaceDirection.map(num)})});};
const project=(p:number[],space:boolean,angle:number)=>{if(!space)return p;const az=angle*Math.PI/180,elev=28*Math.PI/180,depth=Math.sin(az)*p[0]+Math.cos(az)*p[1];return[Math.cos(az)*p[0]-Math.sin(az)*p[1],-Math.sin(elev)*depth+Math.cos(elev)*p[2]];};
const path=(points:number[][])=>points.map((p,i)=>`${i?'L':'M'}${p[0].toPrecision(10)} ${(-p[1]).toPrecision(10)}`).join(' ');
function Drawing({result,space,angle,active,showSource,showTarget}:{result:GenericSurfaceConversionResult;space:boolean;angle:number;active:number;showSource:boolean;showTarget:boolean}){
 const source=space?'sourceSpace':'sourceFlat',target=space?'targetSpace':'targetFlat',stages=[source,target]as const,grids=stages.map(stage=>result.grid.map(row=>row[stage].normalizedPoints.map(p=>project(p,space,angle)))),
  bases=stages.map(stage=>result.sample.rows.map(row=>project(row[stage].normalizedBase,space,angle))),fold=result.sample.rows.map(row=>project(space?row.normalizedFoldSpace:row.normalizedFoldFlat,space,angle)),
  points=[...grids.flat(2),...bases.flat(),...fold],xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),
  span=Math.max(maxX-minX,maxY-minY,.01),margin=span*.12,at=Math.min(active,result.grid.length-1),step=Math.max(1,Math.ceil(result.grid.length/24));
 return <svg data-testid={`native-surface-conversion-${space?'space':'flat'}`} role="img" aria-label={space?'原十源三维来源与目标曲面':'原十源二维来源与目标曲面'} viewBox={`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`} preserveAspectRatio="xMidYMid meet">
  {grids.map((grid,k)=>{if(k===0?!showSource:!showTarget)return null;const first=grid.map(row=>row[0]),last=grid.map(row=>row.at(-1)!);return <g className={`nsc-layer ${k?'target':'source'}`} key={k}>
   <path className="nsc-surface" d={path([...first,...last.slice().reverse()])+' Z'}/>
   {grid.map((row,i)=>i%step===0||i===grid.length-1?<line className="nsc-ruling" vectorEffect="non-scaling-stroke" key={i} x1={row[0][0]} y1={-row[0][1]} x2={row.at(-1)![0]} y2={-row.at(-1)![1]}/>:null)}
   <path className="nsc-edge" d={path(first)} vectorEffect="non-scaling-stroke"/><path className="nsc-edge" d={path(last)} vectorEffect="non-scaling-stroke"/>
   <path className="nsc-base" d={path(bases[k])} vectorEffect="non-scaling-stroke"/><line className="nsc-selected" vectorEffect="non-scaling-stroke" x1={first[at][0]} y1={-first[at][1]} x2={last[at][0]} y2={-last[at][1]}/>
  </g>;})}
  <path className="nsc-fold" d={path(fold)} vectorEffect="non-scaling-stroke"/><circle className="nsc-marker" vectorEffect="non-scaling-stroke" cx={fold[at][0]} cy={-fold[at][1]} r={span*.01}/>
 </svg>;
}
const scientific=(n:number|null)=>n===null?'未定义':Number.isFinite(n)?n.toExponential(1):'—';
export default function CurvedNativeSurfaceConversionDialog({initialMode='cone',onClose,onSaved}:{initialMode?:NativeSurfaceConversionMode;onClose:()=>void;onSaved:(mode:NativeSurfaceConversionMode)=>void}){
 const [mode,setMode]=useState<NativeSurfaceConversionMode>(initialMode),[draft,setDraft]=useState(()=>toDraft(preset(initialMode))),[result,setResult]=useState<GenericSurfaceConversionResult|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[message,setMessage]=useState('原十源核验中'),[active,setActive]=useState(0),[angle,setAngle]=useState(-35),[showSource,setShowSource]=useState(true),[showTarget,setShowTarget]=useState(true),
  generation=useRef(0),abort=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null),input=useMemo(()=>{try{return {query:parse(mode,draft),error:null};}catch(e){return {query:null,error:e instanceof Error?e.message:String(e)};}},[mode,draft]);
 const clear=()=>{generation.current++;abort.current?.abort();setResult(null);setStatus('checking');setMessage('原十源核验中');},edit=(key:keyof Draft,value:string)=>{clear();setDraft(d=>({...d,[key]:value}));},
  editArray=(key:'flatBase'|'flatSourceDirector'|'spaceBase'|'spaceSourceDirector'|'flatPoint'|'spacePoint'|'flatDirection'|'spaceDirection',i:number,value:string)=>{clear();setDraft(d=>({...d,[key]:d[key].map((v,j)=>j===i?value:v)}));},
  choose=(next:NativeSurfaceConversionMode)=>{clear();setMode(next);setDraft(toDraft(preset(next)));setActive(0);};
 useEffect(()=>{const id=++generation.current,controller=new AbortController();abort.current?.abort();abort.current=controller;setResult(null);
  if(!input.query){setStatus('error');setMessage(input.error!);return()=>{++generation.current;controller.abort();};}setStatus('checking');setMessage('原十源核验中');const timer=setTimeout(()=>{const timeout=setTimeout(()=>controller.abort('十源折向曲面计算超时。'),70000);
   fetchGenericSurfaceConversionWhenIdle(input.query,controller.signal).then(r=>{if(id!==generation.current)return;setResult(r);setActive(a=>Math.min(a,r.query.segments));setStatus('ready');})
    .catch(e=>{if(id!==generation.current)return;setStatus('error');setMessage(e instanceof Error?e.message:String(e));}).finally(()=>clearTimeout(timeout));},150);
  return()=>{++generation.current;clearTimeout(timer);controller.abort();};},[input]);
 const c=result?.certification,d=result?.diagnostics,domain=result?.domain,row=result?.sample.rows[Math.min(active,result.query.segments)],noJets=result&&d!.maximumTargetPairRelativeMetricDifference===null,
  constantZero=domain?.signBranch.status==='constant-zero',incompatible=result&&(!c?.finiteSourcePairMetricVerified||!c.initialDirectorsUnitCompatible),
  statusText=status!=='ready'?message:noJets?'字面构形保留；Sign过零处原导数未定义。':constantZero?'原Sign恒零：目标母线为零，保留真实退化。':incompatible?'原源度量／原方向未兼容；构形保留，形式等距未证。':c?.formalTargetPairMetricCertified?'原定义与分支全域已证；目标等距已证。':'有限构形完成；全域／形式等距未证。';
 const number=(key:'start'|'end'|'wStart'|'wEnd'|'ui'|'segments'|'ruling',label:string)=><label className="nsc-field" key={key}><span>{label}</span><input aria-label={`十源折向${label}`} type="number" step={key==='segments'||key==='ruling'?'1':'any'} value={draft[key]} title={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>;
 const evidence=(name:string,value:string,detail?:string,warn=false)=><div className={`nsc-evidence-item ${warn?'warning':''}`} key={name} title={detail}><span>{name}</span><strong>{value}</strong></div>;
 const strip=(stage:'sourceFlat'|'sourceSpace'|'targetFlat'|'targetSpace')=>{const s=domain?.strips[stage].status;return s==='verified'?'全带正则':s==='degenerate'?'原域退化':'全带未证';};
 return <TessDialog title="第 45 节 · 十源折向圆锥／圆柱" onClose={onClose}><div className="native-surface-conversion-dialog">
  <aside className="nsc-controls"><div className="nsc-mode"><strong>二维／三维 · 原四组十源</strong><select aria-label="十源折向模式" value={mode} onChange={e=>choose(e.target.value as NativeSurfaceConversionMode)}><option value="cone">折向圆锥</option><option value="cylinder">折向圆柱</option></select></div>
   {([['flatBase','b₂','二维基线'],['flatSourceDirector','d₂','二维母线'],['spaceBase','b₃','三维基线'],['spaceSourceDirector','d₃','三维母线']]as const).map(([key,label,name])=><div className={`nsc-expressions dims-${draft[key].length}`} key={key}><span>{label}</span>{draft[key].map((value,i)=><label className="nsc-expression" key={i}><span>{['x','y','z'][i]}</span><input aria-label={`十源原${name}${['x','y','z'][i]}表达式`} spellCheck={false} value={value} title={value} onChange={e=>editArray(key,i,e.target.value)}/></label>)}</div>)}
   <div className="nsc-literal"><span>原函数</span><select aria-label="十源原函数模式" value={draft.literal} onChange={e=>edit('literal',e.target.value)}><option value="raw-numerical">N 原数值式</option><option value="normalized-symbolic">原符号式</option></select><span title={mode==='cone'?'N：Ψ固定在ui，目标母线不Normalize；原符号式：自由s的Ψ(s)及单位母线，原差异完整保留。':'原两式均使用原始dᵢ的投影系数，不除以|dᵢ|²。'}>{mode==='cone'?(draft.literal==='raw-numerical'?'固定Ψ · 原向量':'Ψ(s) · 单位向量'):'原投影 · 原向量'}</span></div>
   <div className="nsc-initial">{([['flatPoint',mode==='cone'?'a₂':'p₂','二维位置'],['spacePoint',mode==='cone'?'a₃':'p₃','三维位置'],...(mode==='cylinder'?([['flatDirection','d₂ᵢ','二维方向'],['spaceDirection','d₃ᵢ','三维方向']]as const):[])]as const).map(([key,label,name])=><div className={`nsc-vector dims-${draft[key].length}`} key={key}><span>{label}</span>{draft[key].map((value,i)=><label className="nsc-coordinate" key={i}><span>{['x','y','z'][i]}</span><input aria-label={`十源原初值${name}${['x','y','z'][i]}`} type="number" step="any" value={value} title={value} onChange={e=>editArray(key,i,e.target.value)}/></label>)}</div>)}</div>
   <div className="nsc-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('wStart','w 起点')}{number('wEnd','w 终点')}{mode==='cone'?number('ui','初值 sᵢ'):null}{number('segments','纵向段数')}{number('ruling','横向段数')}</div>
   <div className={`nsc-status ${status} ${noJets||constantZero||incompatible?'warning':''}`} role={status==='error'?'alert':'status'} data-testid="native-surface-conversion-status" title={statusText}>{statusText}</div>
   <div className="nsc-evidence" data-testid="native-surface-conversion-diagnostics">
    {evidence('源EFG',d?scientific(d.maximumSourcePairRelativeMetricDifference):'—')}{evidence('目标EFG',d?scientific(d.maximumTargetPairRelativeMetricDifference):'—',undefined,!!noJets)}
    {evidence('源身份',c?c.sourcePairMetricAnalytic?'解析':'有限／未证':'—',d?.sourcePairMetricIdentity.method)}{evidence('原定义',domain?(domain.certified?'全域已证':'未证')+'·'+domain.verifiedCells:'—')}
    {evidence('原分支',domain?domain.signBranch.status==='verified'?'已证':constantZero?'恒零':'未证':'—',domain?.signBranch.reason??undefined)}{evidence('原初向量',c?c.initialDirectorsUnitCompatible?'兼容':'未兼容':'—')}
    {evidence('目标等距',c?c.formalTargetPairMetricCertified?'形式已证':'未证':'—')}{evidence('原导数',row?row.targetJetsDefined?'已定义':'未定义':'—',undefined,!!row&&!row.targetJetsDefined)}
    {evidence('二维来源',domain?strip('sourceFlat'):'—')}{evidence('三维来源',domain?strip('sourceSpace'):'—')}{evidence('二维目标',domain?strip('targetFlat'):'—')}{evidence('三维目标',domain?strip('targetSpace'):'—')}
   </div>
   <div className="nsc-position"><label>同步母线 <strong>s={row?.s.toFixed(4)??'—'} · v={row?scientific(row.offsetParameter):'—'}{mode==='cone'?` · Ψ=${row?.branchSign??'—'}`:''}</strong></label><input aria-label="十源折向同步母线" type="range" min="0" max={result?.query.segments??32} step="1" value={active} disabled={!result} onChange={e=>setActive(Number(e.target.value))}/></div>
   <div className="nsc-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'折向曲面十源原初值.json')}>保存源 JSON</button><button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>choose(mode)}>恢复原式</button>
    <input hidden ref={file} type="file" accept=".json,application/json" aria-label="载入十源折向源文件" onChange={async e=>{const node=e.currentTarget,selected=node.files?.[0];if(!selected)return;clear();const id=generation.current;
     try{if(selected.size>16384)throw Error('源JSON超过16KB。');const text=await selected.text();if(id!==generation.current)return;const q=validateGenericSurfaceConversionQuery(JSON.parse(text));setMode(modeOf(q));setDraft(toDraft(q));setActive(0);}
     catch(error){if(id!==generation.current)return;setStatus('error');setMessage(error instanceof Error?error.message:String(error));}finally{if(id===generation.current)node.value='';}}}/>
   </div>
  </aside>
  <main className="nsc-results"><div className="nsc-topline"><div><span>TEN SOURCES · {mode==='cone'?'CONE':'CYLINDER'}</span><strong>{mode==='cone'?'圆锥顶点／原Sign分支':'圆柱参考点／原方向投影'}</strong></div><small>数值只读</small></div>
   <div className="nsc-view"><label><input aria-label="十源显示来源" type="checkbox" checked={showSource} onChange={e=>setShowSource(e.target.checked)}/><i className="source"/>来源</label><label><input aria-label="十源显示目标" type="checkbox" checked={showTarget} onChange={e=>setShowTarget(e.target.checked)}/><i className="target"/>目标</label><span><i className="fold"/>原折线</span></div>
   <div className="nsc-panels">{[false,true].map(space=><section className="nsc-panel" key={String(space)}><header><span>{space?'SPACE 3D':'FLAT 2D'}</span><strong>{space?'三维源／目标叠图':'二维源／目标叠图'}</strong></header>
    {result?<Drawing result={result} space={space} angle={angle} active={active} showSource={showSource} showTarget={showTarget}/>:<div className="nsc-empty">{status==='checking'?'原式核验中':'无有效构形'}</div>}
    {space?<label className="nsc-azimuth">视角<input aria-label="十源折向三维视角" type="range" min="-180" max="180" step="1" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><span>{angle}°</span></label>:<div className="nsc-azimuth">二维原坐标 · 等比例</div>}
   </section>)}</div>
   <div className="nsc-certification"><strong>保留原式差异、零分支与真实未证</strong><span>只读曲面，未认证单射及碰撞，不可采用为CP／FOLD。原符号式过零的导数不会补成零。</span></div>
   <footer className="nsc-footer"><span title={mode==='cone'?'FoldSurfaceToCone / NFoldSurfaceToCone；视角与显示为本地操作':'FoldSurfaceToCylinder / NFoldSurfaceToCylinder；视角与显示为本地操作'}>{mode==='cone'?'十源折向圆锥 · 原式':'十源折向圆柱 · 原式'}</span><div><button onClick={()=>onSaved(mode)}>原保存例</button><button className="primary" onClick={onClose}>关闭</button></div></footer>
  </main>
 </div></TessDialog>;
}
