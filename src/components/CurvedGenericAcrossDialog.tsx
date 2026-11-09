import {useEffect,useMemo,useRef,useState} from 'react';
import {download} from '../app/api';
import {fetchGenericAcross,GENERIC_ACROSS_PRESET,validateGenericAcrossQuery,type GenericAcrossQuery,type GenericAcrossResult} from '../app/curvedGenericAcross';
import {TessDialog} from './TessellationEditor';
import './CurvedSavedPairDialog.css';
import './CurvedGenericAcrossDialog.css';

const draftFor=(q:GenericAcrossQuery)=>({mode:q.mode,fx:q.flatCurve[0],fy:q.flatCurve[1],lx:q.flatLeftRuling[0],ly:q.flatLeftRuling[1],
 sx:q.spaceCurve[0],sy:q.spaceCurve[1],sz:q.spaceCurve[2],slx:q.spaceLeftRuling[0],sly:q.spaceLeftRuling[1],slz:q.spaceLeftRuling[2],gamma:q.foldAngleExpression,
 start:String(q.parameterStart),end:String(q.parameterEnd),left:String(q.leftWidth),right:String(q.rightWidth),segments:String(q.segments),ruling:String(q.rulingSegments)});
type Draft=ReturnType<typeof draftFor>;
type Point=[number,number];
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toPrecision(10)} ${(-y).toPrecision(10)}`).join(' ');
function Drawing({result,space,angle,active}:{result:GenericAcrossResult;space:boolean;angle:number;active:number}){
 const key=space?'normalizedSpace':'normalizedFlat',a=angle*Math.PI/180,
  project=(p:number[]):Point=>space?[Math.cos(a)*p[0]-Math.sin(a)*p[2],p[1]+.34*(Math.sin(a)*p[0]+Math.cos(a)*p[2])]:[p[0],p[1]],
  crease=result.sample.rows.map(r=>project((space?r.space:r.flat)!.normalizedC)),
  left=result.sample.grid.map(g=>project(g[result.query.rulingSegments][key]!)),right=result.sample.grid.map(g=>project(g.at(-1)![key]!)),
  all=[...crease,...left,...right],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),x0=Math.min(...xs),y0=Math.min(...ys),
  width=Math.max(...xs)-x0,height=Math.max(...ys)-y0,span=Math.max(width,height,1e-12),pad=span*.14,
  at=Math.min(active,crease.length-1),p=crease[at],step=Math.max(1,Math.round(result.query.segments/14)),fill=(edge:Point[])=>path([...crease,...edge.slice().reverse()])+' Z';
 return <svg data-testid={space?'across-generic-space':'across-generic-flat'} role="img" aria-label={space?'原三维曲线与左右真实直纹面':'原二维曲线与左右真实直纹带'}
  viewBox={`${x0-pad} ${y0-pad} ${Math.max(width,span*.01)+2*pad} ${Math.max(height,span*.01)+2*pad}`} preserveAspectRatio="xMidYMid meet">
  <path className="cga-area left" d={fill(left)}/><path className="cga-area right" d={fill(right)}/>
  {([left,right] as const).map((edge,k)=><g key={k}><path className={`cga-boundary ${k?'right':'left'}`} d={path(edge)} vectorEffect="non-scaling-stroke"/>
   {crease.map((p,i)=>i%step===0||i===crease.length-1?<line className={`cga-ruling ${k?'right':'left'}`} key={i} vectorEffect="non-scaling-stroke"
    x1={p[0]} y1={-p[1]} x2={edge[i][0]} y2={-edge[i][1]}/>:null)}
   <line className={`cga-selected ${k?'right':'left'}`} vectorEffect="non-scaling-stroke" x1={p[0]} y1={-p[1]} x2={edge[at][0]} y2={-edge[at][1]}/></g>)}
  <path className="cga-crease" d={path(crease)} vectorEffect="non-scaling-stroke"/>
  <circle className="cga-marker" vectorEffect="non-scaling-stroke" cx={p[0]} cy={-p[1]} r={span*.011}/>
 </svg>;
}

export default function CurvedGenericAcrossDialog({onClose,onCircle}:{onClose:()=>void;onCircle:()=>void}){
 const [draft,setDraft]=useState(()=>draftFor(GENERIC_ACROSS_PRESET)),[result,setResult]=useState<GenericAcrossResult|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[active,setActive]=useState(0),[angle,setAngle]=useState(-35);
 const generation=useRef(0),file=useRef<HTMLInputElement>(null);
 const input=useMemo(()=>{try{if(Object.values(draft).some(x=>!x.trim()))throw Error('请填写全部原式与数值参数。');return {query:validateGenericAcrossQuery({...GENERIC_ACROSS_PRESET,mode:draft.mode,
  flatCurve:[draft.fx,draft.fy],flatLeftRuling:[draft.lx,draft.ly],spaceCurve:[draft.sx,draft.sy,draft.sz],spaceLeftRuling:[draft.slx,draft.sly,draft.slz],
  foldAngleExpression:draft.gamma,parameterStart:Number(draft.start),parameterEnd:Number(draft.end),leftWidth:Number(draft.left),rightWidth:Number(draft.right),
  segments:Number(draft.segments),rulingSegments:Number(draft.ruling)}),error:''};}catch(cause){return {query:null,error:(cause as Error).message};}},[draft]);
 useEffect(()=>{const id=++generation.current,controller=new AbortController();setResult(null);setActive(0);setError('');
  if(!input.query){setStatus('error');setError(input.error);return;}setStatus('checking');const q=input.query;
  const timer=setTimeout(async()=>{try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]);let next:GenericAcrossResult;
   for(;;){try{next=await fetchGenericAcross(q,signal);break;}catch(cause){if(signal.aborted||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;
    await new Promise(r=>setTimeout(r,200));}}if(id!==generation.current||controller.signal.aborted)return;setResult(next!);setStatus('ready');
  }catch(cause){if(id!==generation.current||controller.signal.aborted)return;setError((cause as Error).message);setStatus('error');}},150);
  return ()=>{clearTimeout(timer);controller.abort();};},[input]);
 const edit=(key:keyof Draft,value:string)=>{++generation.current;setResult(null);setStatus('checking');setDraft(x=>({...x,[key]:value}));};
 const restore=(q:GenericAcrossQuery)=>{++generation.current;setResult(null);setStatus('checking');setDraft(draftFor(q));setAngle(-35);setActive(0);};
 const expr=(key:keyof Draft,label:string)=><label className="cga-expression" key={key}><span>{label}</span>
  <input aria-label={`一般跨右侧${label}表达式`} value={draft[key]} onChange={e=>edit(key,e.target.value)} spellCheck={false}/></label>;
 const number=(key:keyof Draft,label:string)=><label className="csp-field" key={key}><span>{label}</span><input aria-label={`一般跨右侧${label}`} type="number"
  value={draft[key]} step={key==='segments'||key==='ruling'?'1':'any'} onChange={e=>edit(key,e.target.value)}/></label>;
 const proof=result?.diagnostics.parameterDomain,row=result?.sample.rows[Math.min(active,result.sample.rows.length-1)],pair=result?.diagnostics.pairStatus,
  panels=draft.mode==='both'?[false,true]:[draft.mode==='3d'];
 return <TessDialog title="第 45 节 · 原生曲线跨右侧" onClose={onClose}>
  <div className="curved-saved-pair-dialog generic-across-dialog">
   <aside className="csp-controls">
    <div className="cga-modes"><label className="csp-select">构造范围<select aria-label="跨右侧构造范围" value="generic" onChange={onCircle}>
     <option value="generic">一般源输入</option><option value="circle">圆弧解析子域</option></select></label>
     <label className="csp-select">原函数<select aria-label="一般跨右侧原函数模式" value={draft.mode} onChange={e=>edit('mode',e.target.value)}>
      <option value="2d">2D · f / rL / γ</option><option value="3d">3D · ff / rrL</option><option value="both">Both · 原双输入</option></select></label></div>
    <div className={`cga-expressions ${draft.mode==='both'?'both':''}`}>
     {draft.mode!=='3d'&&<div className="cga-source-group"><b>二维来源 · f、rL</b>{expr('fx','fₓ')}{expr('fy','fᵧ')}{expr('lx','rLₓ')}{expr('ly','rLᵧ')}
      {draft.mode==='2d'&&expr('gamma','γ')}</div>}
     {draft.mode!=='2d'&&<div className="cga-source-group"><b>三维来源 · ff、rrL</b>{expr('sx','ffₓ')}{expr('sy','ffᵧ')}{expr('sz','ff𝓏')}
      {expr('slx','rrLₓ')}{expr('sly','rrLᵧ')}{expr('slz','rrL𝓏')}</div>}
    </div>
    <p className="cga-guide" title="支持 Sin[]、ArcTan[]、Pi、^、相邻乘法；每侧母线系数 v∈[0,上限]。">共同 s · 原式语法；rL 保留幅度，v 为正系数。</p>
    <div className="cga-ranges">{number('start','s 起点')}{number('end','s 终点')}{number('left','左 v 上限')}{number('right','右 v 上限')}
     {number('segments','纵向段数')}{number('ruling','横向段数')}</div>
    <div className={`csp-status ${status}`} role={status==='error'?'alert':'status'} data-testid="across-generic-status">{status==='error'?error:status==='ready'?
     `${proof?.certified?'分支/有限带区间已证':'分支/有限带全域未证'}；${pair==='incompatible'?'原双输入 EFG 不相容':pair==='finite-numerical'?'双侧 EFG 通过有限点核验':'单来源构形'}。`:'计算原源式、右母线与连续区间…'}</div>
    <div className="cga-diagnostics" data-testid="across-generic-diagnostics"><span>EFG 差 {result?.diagnostics.maximumPairMetricDifference?.toExponential(2)??'不适用'}</span>
     <span>区间 {proof?.verifiedCells??'—'} / {proof?.evaluations??'—'}</span><span>原 sign 分支 {row?.branch.sign??'—'}；纸域单射未证</span></div>
    <div className="csp-position"><label htmlFor="cga-position">同步母线 <strong>s={row?.s.toFixed(4)??'—'}</strong></label>
     <input id="cga-position" aria-label="一般跨右侧同步母线" type="range" min="0" max={result?.query.segments??32} disabled={!result}
      value={result?Math.min(active,result.query.segments):0} onChange={e=>setActive(Number(e.target.value))}/></div>
    <div className="cga-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'一般跨右侧源参数.json')}>保存源 JSON</button>
     <button onClick={()=>file.current?.click()}>载入源 JSON</button><input ref={file} hidden type="file" accept=".json,application/json" aria-label="载入一般跨右侧源文件"
      onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;const id=++generation.current;setResult(null);setStatus('checking');try{if(selected.size>16384)throw Error('源文件过大。');
       const q=validateGenericAcrossQuery(JSON.parse(await selected.text()));if(id!==generation.current)return;restore(q);}
       catch(cause){if(id!==generation.current)return;++generation.current;setResult(null);setStatus('error');setError((cause as Error).message);}}}/></div>
    <button className="cga-reset" onClick={()=>restore({...GENERIC_ACROSS_PRESET,mode:draft.mode})}>恢复非圆原源输入</button>
   </aside>
   <main className="csp-results"><div className="csp-topline"><div><span>FOLD ACROSS RIGHT</span><strong>原生曲线 · 延续右侧</strong></div><small>{draft.mode.toUpperCase()}</small></div>
    <div className={`csp-panels ${panels.length===1?'single':''}`}>{panels.map(space=><section className="csp-panel" key={String(space)}>
     <header><span>{space?'SPACE · 3D':'PLANE · 2D'}</span><strong>{space?'原三维直纹面':'原二维直纹带'}</strong></header>
     {result?<Drawing result={result} space={space} angle={angle} active={active}/>:<div className="csp-empty">{status==='checking'?'计算中':'无有效构形'}</div>}
     {space?<label className="csp-azimuth">视角 <input aria-label="一般跨右侧三维视角" type="range" min="-180" max="180" value={angle} onChange={e=>setAngle(Number(e.target.value))}/><b>{angle}°</b></label>:
      <p>原 f、rL 与实际新增 rR</p>}</section>)}</div>
    <div className="csp-legend"><span><i className="crease"/>原折痕</span><span><i className="left"/>原左母线</span><span><i className="right"/>新增右母线</span></div>
    <div className="csp-certification"><strong>{pair==='incompatible'?'原双输入不相容 · 保留真实曲面':'原函数数值入口 · 只读'}</strong>
     <span>有限点核验与全区间证明分开。未复刻 Wolfram 插值误差；纸域单射、三维碰撞、运动及精确 FOLD 未认证。</span></div>
    <footer className="csp-footer"><span>未启用的原式仍保存；视角和母线仅本地更新。</span><button className="primary" onClick={onClose}>关闭</button></footer>
   </main>
  </div>
 </TessDialog>;
}
