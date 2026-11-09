import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {SURFACE_SYSTEM_NATIVE_PRESET,SURFACE_NORMAL_NATIVE_PRESET,validateGenericSurfaceSystemQuery,validateGenericSurfaceNormalQuery,
  fetchGenericSurfaceSystemWhenIdle,fetchGenericSurfaceNormalWhenIdle,type GenericSurfaceSystemQuery,type GenericSurfaceNormalQuery,
  type GenericSurfaceSystemResult,type GenericSurfaceNormalResult,type GenericSurfaceRow,type GenericSurfaceNormalRow} from '../app/curvedNativeSurfaceSystem';
import {TessDialog} from './TessellationEditor';
import './CurvedNativeSurfaceSystemDialog.css';

export type NativeSurfaceDiagnosticMode='system'|'normal';
type Query=GenericSurfaceSystemQuery|GenericSurfaceNormalQuery;
type Result=GenericSurfaceSystemResult|GenericSurfaceNormalResult;
type Draft={surface:string[];uStart:string;uEnd:string;vStart:string;vEnd:string;uSegments:string;vSegments:string;principal:boolean;orientation:1|-1};
const preset=(mode:NativeSurfaceDiagnosticMode)=>mode==='system'?SURFACE_SYSTEM_NATIVE_PRESET:SURFACE_NORMAL_NATIVE_PRESET;
const modeOf=(q:Query):NativeSurfaceDiagnosticMode=>q.family==='surface-system-generic-native'?'system':'normal';
const toDraft=(q:Query):Draft=>({surface:q.surface.slice(),uStart:String(q.uStart),uEnd:String(q.uEnd),vStart:String(q.vStart),vEnd:String(q.vEnd),
  uSegments:String(q.uSegments),vSegments:String(q.vSegments),principal:q.family==='surface-system-generic-native'?q.principalAnalysis:true,
  orientation:q.family==='surface-normal-generic-native'?q.surfaceOrientation:1});
const parse=(mode:NativeSurfaceDiagnosticMode,d:Draft):Query=>{const number=(value:string)=>{if(!value.trim())throw Error('域与密度不能为空。');
  const n=Number(value);if(!Number.isFinite(n))throw Error('域与密度须为有限数。');return n;};
  const shared={surface:d.surface,uStart:number(d.uStart),uEnd:number(d.uEnd),vStart:number(d.vStart),vEnd:number(d.vEnd),uSegments:number(d.uSegments),vSegments:number(d.vSegments)};
  return mode==='system'?validateGenericSurfaceSystemQuery({...shared,family:'surface-system-generic-native',principalAnalysis:d.principal}):
    validateGenericSurfaceNormalQuery({...shared,family:'surface-normal-generic-native',surfaceOrientation:d.orientation});};
const display=(x:number)=>x===0?'0':Math.abs(x)<.001||Math.abs(x)>=1e4?x.toExponential(2):String(Number(x.toPrecision(4)));
const valueText=(value:number|number[]|number[][])=>Array.isArray(value)?value.map(x=>Array.isArray(x)?'('+x.map(display).join(',')+')':display(x)).join(' · '):display(value);
const project=(p:number[],angle:number)=>{const az=angle*Math.PI/180,elev=30*Math.PI/180,depth=Math.sin(az)*p[0]+Math.cos(az)*p[1];
  return [Math.cos(az)*p[0]-Math.sin(az)*p[1],-Math.sin(elev)*depth+Math.cos(elev)*p[2]];};
const path=(points:number[][])=>points.map((p,i)=>`${i?'L':'M'}${p[0].toPrecision(10)} ${(-p[1]).toPrecision(10)}`).join(' ');
const normalOf=(r:GenericSurfaceRow|GenericSurfaceNormalRow)=>'rules'in r?r.rules.SurfaceNormal:r.normal;
function SurfaceDrawing({result,angle,uIndex,vIndex,showNormal,showPrincipal}:{result:Result;angle:number;uIndex:number;vIndex:number;showNormal:boolean;showPrincipal:boolean}){
  const geometry=useMemo(()=>{
    const grid=result.grid.rows,points=grid.flat().map(r=>project(r.normalizedPoint,angle)),xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]),
      minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),span=Math.max(maxX-minX,maxY-minY,.01),margin=span*.22;
    const lineAllowed=(a:GenericSurfaceRow|GenericSurfaceNormalRow,b:GenericSurfaceRow|GenericSurfaceNormalRow)=>result.domain.certified||
      !result.domain.unresolved.some(([u0,u1,v0,v1])=>a.u===b.u?a.u>=u0&&a.u<=u1&&Math.max(a.v,b.v)>v0&&Math.min(a.v,b.v)<v1:
        a.v>=v0&&a.v<=v1&&Math.max(a.u,b.u)>u0&&Math.min(a.u,b.u)<u1);
    const segments:string[]=[];
    for(let i=0;i<grid.length;i++)for(let j=0;j<grid[i].length;j++){
      const a=grid[i][j];if(i+1<grid.length&&lineAllowed(a,grid[i+1][j]))segments.push(path([project(a.normalizedPoint,angle),project(grid[i+1][j].normalizedPoint,angle)]));
      if(j+1<grid[i].length&&lineAllowed(a,grid[i][j+1]))segments.push(path([project(a.normalizedPoint,angle),project(grid[i][j+1].normalizedPoint,angle)]));
    }
    return {segments,span,viewBox:`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`};
  },[result,angle]);
  const row=result.grid.rows[uIndex][vIndex],p=row.normalizedPoint,tip=(vector:number[],length=.14)=>project(p.map((x,i)=>x+vector[i]*geometry.span*length),angle),a=project(p,angle),
    principal='rules'in row?row.rules.PrincipalDirections:undefined;
  return <svg data-testid="native-surface-system-plot" role="img" aria-label="双变量曲面、所选切向与原法向" viewBox={geometry.viewBox} preserveAspectRatio="xMidYMid meet">
    <defs><marker id="native-surface-normal-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L5 2.5 L0 5 Z"/></marker></defs>
    <path className="nss-mesh" d={geometry.segments.join(' ')} vectorEffect="non-scaling-stroke"/>
    {!result.domain.certified&&result.grid.rows.flat().map((r,i)=>{const b=project(r.normalizedPoint,angle);return <circle key={i} className="nss-sample" cx={b[0]} cy={-b[1]} r={geometry.span*.0025}/>;})}
    {showNormal&&result.sample.rows.map((r,i)=>{const b=project(r.normalizedPoint,angle),end=project(r.normalizedPoint.map((x,j)=>x+normalOf(r)[j]*geometry.span*.055),angle);
      return <path key={i} className="nss-normal-field" d={path([b,end])} vectorEffect="non-scaling-stroke"/>;})}
    {showNormal&&<path className="nss-selected-normal" d={path([a,tip(normalOf(row))])} markerEnd="url(#native-surface-normal-arrow)" vectorEffect="non-scaling-stroke"/>}
    {showPrincipal&&principal?.map((direction,i)=><path key={i} className={`nss-principal p${i}`} d={path([tip(direction,-.11),tip(direction,.11)])} vectorEffect="non-scaling-stroke"/>)}
    <circle className="nss-selected" cx={a[0]} cy={-a[1]} r={geometry.span*.009} vectorEffect="non-scaling-stroke"/>
  </svg>;
}
const ruleLabels:Record<string,string>={SurfaceTangentU:'Su',SurfaceTangentV:'Sv',SurfaceNormal:'法向 n',FundamentalFormE:'E',FundamentalFormF:'F',
  FundamentalFormG:'G',FundamentalFormL:'L',FundamentalFormM:'M',FundamentalFormN:'N',GaussianCurvature:'高斯 K',MeanCurvature:'平均 H',
  CurvatureMatrix:'形算子 A',PrincipalCurvatures:'主曲率 κ₁／κ₂',PrincipalDirectionsUV:'主方向 UV',PrincipalDirections:'主方向 3D'};
export default function CurvedNativeSurfaceSystemDialog({initialMode='system',onClose,onSaved}:{initialMode?:NativeSurfaceDiagnosticMode;onClose:()=>void;onSaved?:(mode:NativeSurfaceDiagnosticMode)=>void}){
  const [mode,setMode]=useState<NativeSurfaceDiagnosticMode>(initialMode),[draft,setDraft]=useState(()=>toDraft(preset(initialMode))),
    [result,setResult]=useState<Result|null>(null),[status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[message,setMessage]=useState('双变量原式核验中'),
    [uIndex,setUIndex]=useState(0),[vIndex,setVIndex]=useState(0),[angle,setAngle]=useState(-35),[showNormal,setShowNormal]=useState(true),[showPrincipal,setShowPrincipal]=useState(true),
    generation=useRef(0),abort=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null),
    input=useMemo(()=>{try{return {query:parse(mode,draft),error:null};}catch(error){return {query:null,error:error instanceof Error?error.message:String(error)};}},[mode,draft]);
  const clear=()=>{++generation.current;abort.current?.abort();setResult(null);setStatus('checking');setMessage('双变量原式核验中');},
    edit=(key:Exclude<keyof Draft,'surface'>,value:string|boolean|1|-1)=>{clear();setDraft(d=>({...d,[key]:value}));},
    editSource=(i:number,value:string)=>{clear();setDraft(d=>({...d,surface:d.surface.map((x,j)=>i===j?value:x)}));},
    choose=(next:NativeSurfaceDiagnosticMode)=>{clear();setMode(next);setDraft(toDraft(preset(next)));setUIndex(0);setVIndex(0);};
  useEffect(()=>{const id=++generation.current,controller=new AbortController();abort.current?.abort();abort.current=controller;setResult(null);
    if(!input.query){setStatus('error');setMessage(input.error!);return()=>{++generation.current;controller.abort();};}
    setStatus('checking');setMessage('双变量原式核验中');const query=input.query,timer=setTimeout(()=>{
      const timeout=setTimeout(()=>controller.abort('双变量曲面计算超时。'),70000),task=query.family==='surface-system-generic-native'?
        fetchGenericSurfaceSystemWhenIdle(query,controller.signal):fetchGenericSurfaceNormalWhenIdle(query,controller.signal);
      task.then(r=>{if(id!==generation.current)return;setResult(r);setUIndex(i=>Math.min(i,r.query.uSegments));setVIndex(i=>Math.min(i,r.query.vSegments));setStatus('ready');})
        .catch(error=>{if(id!==generation.current)return;setStatus('error');setMessage(error instanceof Error?error.message:String(error));}).finally(()=>clearTimeout(timeout));
    },120);return()=>{++generation.current;clearTimeout(timer);controller.abort();};},[input]);
  const row=result?.grid.rows[uIndex][vIndex],system=result?.family==='origamica-generic-surface-system'?result:null,
    rules=row&&'rules'in row?row.rules:row?{SurfaceTangentU:row.sourceTangents[0],SurfaceTangentV:row.sourceTangents[1],SurfaceNormal:row.normal}:null,
    currentChoice=row&&'principalChoice'in row?row.principalChoice:null,
    text=status==='ready'?result?.domain.certified?'原规则完成；完整矩形域正则已证。':'原规则完成；完整矩形域仍有未证子域。':message;
  const numbers=(['uStart','uEnd','uSegments','vStart','vEnd','vSegments']as const).map(key=><label className="nss-number" key={key}><span>{({uStart:'u 起点',uEnd:'u 终点',uSegments:'u 密度',vStart:'v 起点',vEnd:'v 终点',vSegments:'v 密度'})[key]}</span>
    <input aria-label={`曲面系统${key}`} type="number" step={key.endsWith('Segments')?'1':'any'} value={draft[key]} onChange={e=>edit(key,e.target.value)}/></label>);
  return <TessDialog title="第 45 节 · 双变量曲面系统／法向" onClose={onClose}><div className="native-surface-system-dialog">
    <aside className="nss-controls"><div className="nss-mode"><strong>S(u,v) · 原双变量来源</strong><select aria-label="双变量曲面模式" value={mode} onChange={e=>choose(e.target.value as NativeSurfaceDiagnosticMode)}><option value="system">曲面系统</option><option value="normal">独立曲面法向</option></select></div>
      <div className="nss-expressions">{draft.surface.map((value,i)=><label key={i}><span>{['x','y','z'][i]}</span><input aria-label={`曲面来源${['x','y','z'][i]}`} title={value} value={value} onChange={e=>editSource(i,e.target.value)}/></label>)}</div>
      <div className="nss-ranges">{numbers}</div>
      <div className="nss-option">{mode==='system'?<label><input type="checkbox" aria-label="曲面主曲率分析" checked={draft.principal} onChange={e=>edit('principal',e.target.checked)}/>PrincipalAnalysis · 主曲率／方向</label>:
        <label>SurfaceOrientation<select aria-label="独立曲面法向方向" value={draft.orientation} onChange={e=>edit('orientation',Number(e.target.value)as 1|-1)}><option value="1">+1 正向</option><option value="-1">−1 反向</option></select></label>}</div>
      <div className={`nss-status ${status==='error'?'error':result&&!result.domain.certified?'warning':''}`} role="status" data-status={status} title={text}>{text}</div>
      <div className="nss-proof"><span>完整矩形域</span><strong>{result?(result.domain.certified?'已证正则':'未证'):'—'}</strong><span>验证子域</span><strong>{result?.domain.verifiedCells??'—'}</strong>
        <span>未证子域</span><strong>{result?.domain.unresolved.length??'—'}</strong><span>主方向选支</span><strong>{mode==='normal'?'不请求':!draft.principal?'关闭':currentChoice==='non-unique-identity'?'重根／不唯一':currentChoice==='unresolved-numeric'?'数值未分离':currentChoice?'当前点已分离':'—'}</strong></div>
      <div className="nss-position">{(['u','v']as const).map(axis=><label key={axis}><span>{axis} 取样 <strong>{row?display(row[axis]):'—'}</strong></span><input aria-label={`曲面选中${axis}`} type="range" min="0" max={result?.query[axis+'Segments'as 'uSegments'|'vSegments']??16} value={axis==='u'?uIndex:vIndex} disabled={!result} onChange={e=>(axis==='u'?setUIndex:setVIndex)(Number(e.target.value))}/></label>)}</div>
      <div className="nss-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'双变量曲面原来源.json')}>保存源 JSON</button><button onClick={()=>file.current?.click()}>载入源 JSON</button><button onClick={()=>choose(mode)}>恢复原式</button>
        <input hidden ref={file} type="file" accept=".json,application/json" aria-label="载入双变量曲面源文件" onChange={async e=>{const node=e.currentTarget,selected=node.files?.[0];if(!selected)return;clear();const id=generation.current;
          try{if(selected.size>16384)throw Error('源JSON超过16KB。');const text=await selected.text();if(id!==generation.current)return;const data=JSON.parse(text),q=data.family==='surface-system-generic-native'?validateGenericSurfaceSystemQuery(data):validateGenericSurfaceNormalQuery(data);
            setMode(modeOf(q));setDraft(toDraft(q));setUIndex(0);setVIndex(0);}catch(error){if(id!==generation.current)return;setStatus('error');setMessage(error instanceof Error?error.message:String(error));}
          finally{if(id===generation.current)node.value='';}}}/></div>
    </aside>
    <main className="nss-results"><div className="nss-topline"><strong>{mode==='system'?`${draft.principal?'15':'12'} 条原曲面规则`:'原曲面正反法向'}</strong><small>数值只读</small></div>
      <div className="nss-view"><label><input aria-label="曲面显示法向" type="checkbox" checked={showNormal} onChange={e=>setShowNormal(e.target.checked)}/><i/>法向</label>
        {mode==='system'&&draft.principal&&<label><input aria-label="曲面显示主方向" type="checkbox" checked={showPrincipal} onChange={e=>setShowPrincipal(e.target.checked)}/><i className="principal"/>主方向</label>}
        <span>灰色原曲面 · 青色计算方向</span></div>
      <section className="nss-panel"><header><span>SURFACE 3D</span><strong>两个独立域 · 真实混合导数</strong></header>
        {result?<SurfaceDrawing result={result} angle={angle} uIndex={uIndex} vIndex={vIndex} showNormal={showNormal} showPrincipal={showPrincipal}/>:<div className="nss-empty">{status==='checking'?'原式核验中':'无有效曲面'}</div>}
        <label className="nss-angle">视角<input aria-label="曲面三维视角" type="range" min="-180" max="180" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><span>{angle}°</span></label></section>
      <div className="nss-rules" aria-label="所选点完整原规则">{rules?Object.entries(rules).map(([key,value])=><div className={`nss-rule ${key.startsWith('PrincipalDirections')?'directions':''}`} key={key} title={`${key}: ${JSON.stringify(value)}`}><span>{ruleLabels[key]}</span><strong>{valueText(value)}</strong></div>):<div className="nss-rule"><span>原规则</span><strong>等待有效来源</strong></div>}
        {system&&row&&'sourceSecondDerivatives'in row&&<div className="nss-rule" title={JSON.stringify(row.sourceSecondDerivatives[1])}><span>混合导数 Suv</span><strong>{valueText(row.sourceSecondDerivatives[1])}</strong></div>}</div>
      <div className="nss-scope" title="保留不对称的第一基本形式自伴形算子；重根方向不唯一。Wolfram 符号简化、插值、曲面单射、自碰撞和折痕 FOLD 尚未认证。">{mode==='system'?'形算子按原度量求解；重根方向不唯一。':'方向只作用于独立法向；原曲面系统不随之翻转。'}<span>只读诊断 · 未认证为可采用 CP／FOLD</span></div>
      <footer className="nss-footer"><span title={mode==='system'?'SurfaceSystem · In[3777]':'SurfaceNormalFromSurface · In[3746]；NSurfaceNormalFromSurface 的原 FunctionInterpolation 未复现'}>{mode==='system'?'SurfaceSystem · In[3777]':'原法向 · In[3746]'}</span><div><button disabled={!result} onClick={()=>download(JSON.stringify(result,null,2),'双变量曲面完整规则.json')}>导出规则</button>{onSaved&&<button onClick={()=>onSaved(mode)}>原保存例</button>}<button className="primary" onClick={onClose}>关闭</button></div></footer>
    </main>
  </div></TessDialog>;
}
