import {useEffect,useMemo,useRef,useState} from 'react';
import {download as downloadFile} from '../app/api';
import {SYSTEM_HELPERS_NATIVE_PRESETS,SYSTEM_HELPERS_NDSOLVE_PRESETS,SYSTEM_HELPERS_NATIVE_NAMES,SYSTEM_HELPERS_NATIVE_SOURCE,validateGenericSystemHelpersQuery,
  fetchGenericSystemHelpersWhenIdle,type GenericSystemHelpersQuery,type GenericSystemHelpersResult,type SystemHelpersMode} from '../app/curvedNativeSystemHelpers';
import {TessDialog} from './TessellationEditor';
import {Curve2SystemPlotsDialog,StyledCurveDialog} from './Curve2StyledGraphicsDialog';
import FrenetTrihedronPlotDialog from './FrenetTrihedronPlotDialog';
import {StyledTrihedronDialog,Curve3SystemPlotsDialog} from './CurvedSystemGraphicsDialog';
import './CurvedNativeSystemHelpersDialog.css';

type Draft=Record<string,string|string[]>;
const modes=Object.keys(SYSTEM_HELPERS_NATIVE_PRESETS) as SystemHelpersMode[];
const stepFields=['ndsolveMaxSteps','ndsolveMaxStepSize'];
const toDraft=(q:GenericSystemHelpersQuery):Draft=>({...Object.fromEntries(Object.entries(q).filter(([k])=>!['mode','family','ndsolveOptions'].includes(k)).map(([k,v])=>[k,Array.isArray(v)?v.map(String):String(v)])),
 ...(q.mode.startsWith('recover')?{ndsolveMaxSteps:q.ndsolveOptions?.MaxSteps===undefined?'':String(q.ndsolveOptions.MaxSteps),ndsolveMaxStepSize:q.ndsolveOptions?.MaxStepSize===undefined?'':String(q.ndsolveOptions.MaxStepSize)}:{})});
const sourceFields=['curve','normal','baseCurve','director','coefficients'];
const labels:Record<string,string>={curve:'曲线 C(s)',normal:'原法向 U(s)',baseCurve:'基线 B(s)',director:'母线 D(s)',coefficients:'原系数',
  initialPoint:'初始位置 Cᵢ',initialTangent:'初始切向 Tᵢ',initialBinormal:'初始副法向 Bᵢ',initialLeft:'初始左向 Lᵢ',initialNormal:'初始法向 Uᵢ',
  parameterStart:'s 起点',parameterEnd:'s 终点',segments:'s 密度',initialParameter:'初始 sᵢ',sigma:'法向 σ',transverseStart:'w 起点',transverseEnd:'w 终点',rulingSegments:'w 密度'};
const ruleNames:Record<string,string>={Curve2D:'位置 C',Curve3D:'位置 C',Speed2D:'速度 v',Speed3D:'速度 v',LeftCurvature2D:'有向曲率 κₗ',Curvature2D:'曲率 κ',Curvature3D:'曲率 κ',Torsion3D:'挠率 τ',
  TangentVector2D:'切向 T',TangentVector3D:'切向 T',LeftNormalVector2D:'左向 L',NormalVector2D:'法向 N',NormalVector3D:'法向 N',BinormalVector3D:'副法向 B',
  GeodesicCurvature3D:'测地曲率 κg',NormalCurvature3D:'法曲率 κn',GeodesicTorsion3D:'测地挠率 τg',TangentNormalVector3D:'切平面左向 L',SurfaceNormalVector3D:'曲面法向 U',C:'位置 C',T:'切向 T',L:'左向 L',U:'法向 U'};
const display=(n:number)=>String(Number(n.toPrecision(5)));
const valueText=(v:number|number[]|null)=>v===null?'未定义':Array.isArray(v)?v.map(display).join(', '):display(v);
function parseDraft(mode:SystemHelpersMode,d:Draft){
  const number=(v:string)=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error('数值与初值须为有限数，不能留空。');return Number(v);};
  const options=Object.fromEntries(stepFields.filter(k=>typeof d[k]==='string'&&(d[k] as string).trim()).map(k=>[k==='ndsolveMaxSteps'?'MaxSteps':'MaxStepSize',number(d[k] as string)]));
  return validateGenericSystemHelpersQuery({family:'system-helpers-generic-native',mode,...Object.fromEntries(Object.entries(d).filter(([k])=>!stepFields.includes(k)).map(([k,v])=>
    [k,Array.isArray(v)?sourceFields.includes(k)?v:v.map(number):number(v)])),...(Object.keys(options).length?{ndsolveOptions:options}:{})});
}
const project=(p:number[],angle:number)=>{if(p.length===2)return [p[0],-p[1]];const a=angle*Math.PI/180;return [Math.cos(a)*p[0]-Math.sin(a)*p[1],.5*(Math.sin(a)*p[0]+Math.cos(a)*p[1])-.866025403784*p[2]];};
const path=(ps:number[][])=>ps.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ');
function SystemDrawing({result,index,wIndex,angle,showFrame}:{result:GenericSystemHelpersResult;index:number;wIndex:number;angle:number;showFrame:boolean}){
  const drawing=useMemo(()=>{
    const rows=result.sample.rows,ruled=result.query.mode==='ruled-normal',points=ruled?result.grid.flatMap(r=>r.normalizedPoints):rows.map(r=>r.normalizedCurve),
      projected=points.map(p=>project(p,angle)),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]),lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)],span=Math.max(hi[0]-lo[0],hi[1]-lo[1],.01),
      selected=rows[index],p=ruled?result.grid[index].normalizedPoints[wIndex]:selected.normalizedCurve,
      vectors=ruled?[result.grid[index].normals[wIndex]].filter((v):v is number[]=>v!==null):selected.frame,
      factor=.17*span/Math.max(1,...vectors.map(v=>Math.hypot(...v))),tips=vectors.map(v=>p.map((x,i)=>x+factor*v[i])),
      all=[...projected,...(showFrame?tips.map(t=>project(t,angle)):[])],
      viewLo=[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1]))],viewHi=[Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))],margin=span*.1;
    const allowed=(a:number,b:number)=>!result.domain.unresolved.some(([s0,s1])=>Math.max(a,b)>s0&&Math.min(a,b)<s1);
    const segments:string[]=[],mesh:string[]=[];
    for(let i=0;i<rows.length-1;i++)if(allowed(rows[i].s,rows[i+1].s))segments.push(path([project(rows[i].normalizedCurve,angle),project(rows[i+1].normalizedCurve,angle)]));
    if(ruled)for(let i=0;i<result.grid.length;i++){
      const r=result.grid[i];mesh.push(path(r.normalizedPoints.map(p=>project(p,angle))));
      if(i+1<result.grid.length&&allowed(r.s,result.grid[i+1].s))for(let j=0;j<r.normalizedPoints.length;j++)mesh.push(path([project(r.normalizedPoints[j],angle),project(result.grid[i+1].normalizedPoints[j],angle)]));
    }
    return {viewBox:`${viewLo[0]-margin} ${viewLo[1]-margin} ${viewHi[0]-viewLo[0]+2*margin} ${viewHi[1]-viewLo[1]+2*margin}`,segments,mesh,span,p:project(p,angle),tips:tips.map(t=>project(t,angle)),projected};
  },[result,index,wIndex,angle,showFrame]);
  return <svg data-testid="native-system-helpers-plot" role="img" aria-label="曲线与所选点原标架" viewBox={drawing.viewBox}>
    <path className="nsh-mesh" d={drawing.mesh.join(' ')} vectorEffect="non-scaling-stroke"/>
    <path className={result.query.mode.startsWith('recover')?'nsh-recovered':'nsh-curve'} d={drawing.segments.join(' ')} vectorEffect="non-scaling-stroke"/>
    {!result.domain.certified&&drawing.projected.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={drawing.span*.003} className="nsh-point"/>)}
    {showFrame&&drawing.tips.map((p,i)=><g key={i}><path className={`nsh-vector v${i}`} d={path([drawing.p,p])} vectorEffect="non-scaling-stroke"/><circle cx={p[0]} cy={p[1]} r={drawing.span*.005} className="nsh-tip"/></g>)}
    <circle cx={drawing.p[0]} cy={drawing.p[1]} r={drawing.span*.008} className="nsh-selected"/>
  </svg>;
}
const download=(data:unknown,name:string)=>downloadFile(JSON.stringify(data,null,2),name);

export default function CurvedNativeSystemHelpersDialog({initialMode='curve2',onClose,onSaved}:{initialMode?:SystemHelpersMode;onClose:()=>void;onSaved?:(mode:SystemHelpersMode)=>void}){
  const [graphics,setGraphics]=useState<'trihedron'|'plots'|'multi'|'curve2'|'styled'|null>(null);
  const [mode,setMode]=useState(initialMode),[draft,setDraft]=useState(()=>toDraft(SYSTEM_HELPERS_NATIVE_PRESETS[initialMode])),[result,setResult]=useState<GenericSystemHelpersResult|null>(null),
    [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[message,setMessage]=useState('计算中'),[index,setIndex]=useState(0),[wIndex,setWIndex]=useState(0),[angle,setAngle]=useState(-30),[showFrame,setShowFrame]=useState(true),
    generation=useRef(0),abort=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null),
    input=useMemo(()=>{try{return {query:parseDraft(mode,draft),error:null};}catch(e){return {query:null,error:e instanceof Error?e.message:String(e)};}},[mode,draft]);
  const clear=()=>{++generation.current;abort.current?.abort();setResult(null);setStatus('checking');setMessage('计算中');},
    edit=(key:string,value:string|string[])=>{clear();setDraft(d=>({...d,[key]:value}));},
    choose=(next:SystemHelpersMode)=>{clear();setMode(next);setDraft(toDraft(SYSTEM_HELPERS_NATIVE_PRESETS[next]));setIndex(0);setWIndex(0);};
  useEffect(()=>{const id=++generation.current,controller=new AbortController();abort.current?.abort();abort.current=controller;setResult(null);
    if(!input.query){setStatus('error');setMessage(input.error!);return()=>{++generation.current;controller.abort();};}
    setStatus('checking');setMessage('计算中');const q=input.query,timer=setTimeout(()=>{
      const timeout=setTimeout(()=>controller.abort('曲线系统计算超时。'),70000);
      fetchGenericSystemHelpersWhenIdle(q,controller.signal).then(r=>{if(id!==generation.current)return;setResult(r);setIndex(i=>Math.min(i,r.query.segments));setWIndex(i=>Math.min(i,r.query.rulingSegments??0));setStatus('ready');})
        .catch(e=>{if(id===generation.current){setStatus('error');setMessage(e instanceof Error?e.message:String(e));}}).finally(()=>clearTimeout(timeout));
    },120);return()=>{++generation.current;clearTimeout(timer);controller.abort();};},[input]);
  const row=result?.sample.rows[index],grid=result?.grid[index],w=result&&mode==='ruled-normal'?result.query.transverseStart!+(result.query.transverseEnd!-result.query.transverseStart!)*wIndex/result.query.rulingSegments!:null,
    rules=row?mode==='ruled-normal'?{SurfaceNormalVector3D:grid!.normals[wIndex]}:row.rules:null,
    text=status!=='ready'?message:!result!.certification.finiteSystemFullyDefined?'部分原规则未定义':result!.domain.certified?'计算完成 · 完整域已核验':'计算完成 · 部分域未证',
    coefficientNames=mode==='recover-darboux'?['ds','sdκg','sdκn','sdτg']:mode==='recover2'?['v','κₗ']:['v','κ','τ'];
  if(graphics==='styled')return <StyledCurveDialog initial={{family:'styled-curve-native',curve:Array.isArray(draft.curve)?draft.curve:mode==='curve3'?['sin(s)','s**2/4','1-cos(s)']:['s','s**2/4'],parameterStart:Number(draft.parameterStart),parameterEnd:Number(draft.parameterEnd),options:{}}} onClose={()=>setGraphics(null)}/>;
  if(graphics==='curve2'&&result)return <Curve2SystemPlotsDialog result={result} onClose={()=>setGraphics(null)}/>;
  if(graphics==='multi'&&result)return <FrenetTrihedronPlotDialog result={result} onClose={()=>setGraphics(null)}/>;
  if(graphics==='trihedron'&&result)return <StyledTrihedronDialog result={result} index={index} onClose={()=>setGraphics(null)}/>;
  if(graphics==='plots'&&result)return <Curve3SystemPlotsDialog result={result} onClose={()=>setGraphics(null)}/>;
  return <TessDialog title="曲线系统与恢复" onClose={onClose}><div className="native-system-helpers-dialog">
    <aside className="nsh-controls"><label className="nsh-mode">构造<select aria-label="曲线系统模式" value={mode} onChange={e=>choose(e.target.value as SystemHelpersMode)}>{modes.map(m=><option key={m} value={m}>{SYSTEM_HELPERS_NATIVE_NAMES[m]}</option>)}</select></label>
      <div className="nsh-fields">{Object.entries(draft).filter(([,v])=>Array.isArray(v)).map(([key,value])=><fieldset key={key} className={key==='coefficients'?'nsh-coefficients':sourceFields.includes(key)?'nsh-source':'nsh-initial'}><legend>{labels[key]}</legend>
        {(value as string[]).map((v,i)=><label key={i}><span>{key==='coefficients'?coefficientNames[i]:['x','y','z'][i]}</span><input aria-label={`曲线系统 ${key} ${i}`} type={sourceFields.includes(key)?'text':'number'} step="any" value={v} title={v} spellCheck={false} onChange={e=>edit(key,(value as string[]).map((x,j)=>j===i?e.target.value:x))}/></label>)}</fieldset>)}</div>
      <div className="nsh-numbers">{Object.entries(draft).filter(([k,v])=>!Array.isArray(v)&&!stepFields.includes(k)).map(([key,value])=><label key={key}><span>{labels[key]}</span>{key==='sigma'?<select aria-label="曲线系统 sigma" value={value as string} onChange={e=>edit(key,e.target.value)}><option value="1">+1</option><option value="-1">−1</option></select>:<input aria-label={`曲线系统 ${key}`} type="number" step={key.toLowerCase().includes('segments')?'1':'any'} value={value as string} onChange={e=>edit(key,e.target.value)}/>}</label>)}</div>
      {mode.startsWith('recover')&&<fieldset className="nsh-step-options"><legend>原 NDSolve 步选项</legend>
        <label><span>MaxSteps</span><input aria-label="曲线恢复 MaxSteps" type="number" min="1" max="4096" step="1" placeholder="留空沿用当前求解" value={draft.ndsolveMaxSteps as string} onChange={e=>edit('ndsolveMaxSteps',e.target.value)}/></label>
        <label><span>MaxStepSize</span><input aria-label="曲线恢复 MaxStepSize" type="number" min="0.000001" step="any" placeholder="原 s 参数步长" value={draft.ndsolveMaxStepSize as string} onChange={e=>edit('ndsolveMaxStepSize',e.target.value)}/></label>
        <button onClick={()=>{clear();setDraft(toDraft(SYSTEM_HELPERS_NDSOLVE_PRESETS[mode]!));setIndex(0);}}>采用步控制原初值示例</button>
      </fieldset>}
      <div className={`nsh-status ${status==='error'?'error':''}`} data-status={status} role="status" title={text}>{text}</div>
      <div className="nsh-proof"><span>原标架</span><strong>{result?result.certification.formalFrameOrthonormalCertified?'正交归一已证':'保留原值':'—'}</strong><span>未证子域</span><strong>{result?.domain.unresolved.length??'—'}</strong>{result?.diagnostics.integration.stepOptions&&<><span>成功步 · 前 / 后</span><strong>{result.diagnostics.integration.stepOptions.forwardSteps} / {result.diagnostics.integration.stepOptions.backwardSteps}</strong></>}</div>
      <div className="nsh-storage"><button disabled={!input.query} onClick={()=>download(input.query,'曲线系统来源.json')}>保存源</button><button onClick={()=>file.current?.click()}>载入源</button><button onClick={()=>choose(mode)}>重置</button></div>
      <input hidden ref={file} type="file" accept=".json,application/json" aria-label="载入曲线系统源文件" onChange={async e=>{const node=e.currentTarget,selected=node.files?.[0];if(!selected)return;clear();const id=generation.current;
        try{if(selected.size>16384)throw Error('源 JSON 超过 16 KB。');const text=await selected.text();if(id!==generation.current)return;const q=validateGenericSystemHelpersQuery(JSON.parse(text));setMode(q.mode);setDraft(toDraft(q));setIndex(0);setWIndex(0);}
        catch(e){if(id===generation.current){setStatus('error');setMessage(e instanceof Error?e.message:String(e));}}finally{if(id===generation.current)node.value='';}}}/>
    </aside>
    <main className="nsh-results"><div className="nsh-toolbar"><strong>{SYSTEM_HELPERS_NATIVE_NAMES[mode]}</strong>{['curve2','recover2'].includes(mode)&&<button disabled={!result} onClick={()=>setGraphics('curve2')}>原二维系统七图</button>}{['curve2','curve3'].includes(mode)&&<button onClick={()=>setGraphics('styled')}>原样式曲线采样</button>}{mode==='curve3'&&<button disabled={!result} onClick={()=>setGraphics('multi')}>原曲线与多标架</button>}{['curve3','recover3','darboux3','recover-darboux'].includes(mode)&&<button disabled={!result||row?.frame.length!==3} onClick={()=>setGraphics('trihedron')}>原三面体数据</button>}{['curve3','recover3'].includes(mode)&&<button disabled={!result} onClick={()=>setGraphics('plots')}>原系统七图</button>}<label><input type="checkbox" checked={showFrame} onChange={e=>setShowFrame(e.target.checked)}/>标架</label><span title="所有显示向量按同一比例缩放，保留原相对长度。黑：原曲线；紫：辅助曲面；青：计算结果。">黑原线 · 紫辅助 · 青结果</span></div>
      <section className="nsh-drawing">{result?<SystemDrawing result={result} index={index} wIndex={wIndex} angle={angle} showFrame={showFrame}/>:<div className="nsh-empty">{status==='checking'?'计算中':'请输入有效来源'}</div>}
        <label>视角<input aria-label="曲线系统视角" type="range" min="-180" max="180" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><span>{angle}°</span></label></section>
      <div className="nsh-samples"><label>s = {row?display(row.s):'—'}<input aria-label="曲线系统取样 s" type="range" min="0" max={result?.query.segments??32} value={index} disabled={!result} onChange={e=>setIndex(Number(e.target.value))}/></label>
        {mode==='ruled-normal'&&<label>w = {w===null?'—':display(w)}<input aria-label="曲线系统取样 w" type="range" min="0" max={result?.query.rulingSegments??16} value={wIndex} disabled={!result} onChange={e=>setWIndex(Number(e.target.value))}/></label>}</div>
      <div className="nsh-rules" aria-label="所选点原规则">{rules?Object.entries(rules).map(([key,value])=><div key={key} title={`${key}: ${JSON.stringify(value)}`}><span>{ruleNames[key]??key}</span><strong>{valueText(value)}</strong></div>):<div><span>原规则</span><strong>等待计算</strong></div>}
        {row&&mode.startsWith('recover')&&<div title="原速度系数与实际曲线速度在非单位初标架时可以不同。"><span>实际速度 |C′|</span><strong>{display(row.actualCurveSpeed)}</strong></div>}</div>
      <div className="nsh-note" title="保留原初值与原系数。显式步选项以原 s 控制完整域；内核默认、误差控制器、符号函数和插值对象尚未等价；积分误差区间、自碰撞与 CP/FOLD 均未认证。">{mode==='recover-darboux'?'ds 只乘 C′；其余三个系数已含参数速度。':mode.startsWith('recover')?'初始向量按输入保留，不自动归一化。':mode==='darboux3'?'输入法向按原值保留，不自动归一化。':'保留原式未定义点与完整参数域。'}<span>数值诊断 · 非折痕图</span></div>
      <footer className="nsh-footer"><span title={SYSTEM_HELPERS_NATIVE_SOURCE[mode].functions.join(' / ')}>{SYSTEM_HELPERS_NATIVE_SOURCE[mode].definitionCells.join(' / ')}</span><div><button disabled={!result} onClick={()=>download(result,'曲线系统完整规则.json')}>导出规则</button>{onSaved&&<button onClick={()=>onSaved(mode)}>原保存例</button>}<button className="primary" onClick={onClose}>关闭</button></div></footer>
    </main>
  </div></TessDialog>;
}
