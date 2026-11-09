import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {TessDialog} from './TessellationEditor';
import {fetchGenericConicSectionWhenIdle,type GenericConicSectionResult} from '../app/curvedNativeConicSection';
import {CONIC_CIRCLE_CP_EXAMPLE,conicCircleCPDocument,conicCircleCPQuery,conicCirclePreview,
 validateConicCircleCPRecipe,type ConicCircleCPRecipe} from '../app/conicCircleCP';
import type {Doc,Point} from '../core/types';
import './ConicCircleCPDialog.css';

type Draft=Record<keyof ConicCircleCPRecipe,string>;
type Handle='start'|'end'|'left'|'right';
type PlotView={span:number;pad:number;minX:number;minY:number;width:number;height:number};
const draftFor=(r:ConicCircleCPRecipe):Draft=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft;
const parse=(draft:Draft)=>{if(Object.values(draft).some(v=>!v.trim()))throw Error('请填完整当前圆例纸域参数。');
 return validateConicCircleCPRecipe(Object.fromEntries(Object.entries(draft).map(([k,v])=>[k,Number(v)])));};
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x} ${-y}`).join(' ');
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
function PaperPlot({recipe,onChange}:{recipe:ConicCircleCPRecipe;onChange:(r:ConicCircleCPRecipe)=>void}){
 const preview=conicCirclePreview(recipe),rows=preview.rows,crease=rows.map(r=>r.crease),left=rows.map(r=>r.left),right=rows.map(r=>r.right),
  svg=useRef<SVGSVGElement>(null),drag=useRef<{kind:Handle;inverse:DOMMatrix}|null>(null),[frozenView,setFrozenView]=useState<PlotView|null>(null),
  all=[...crease,...left,...right],xs=all.map(p=>p[0]),ys=all.map(p=>-p[1]),
  naturalSpan=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)),naturalPad=.17*naturalSpan,
  natural={span:naturalSpan,pad:naturalPad,minX:Math.min(...xs)-naturalPad,minY:Math.min(...ys)-naturalPad,
   width:Math.max(...xs)-Math.min(...xs)+2*naturalPad,height:Math.max(...ys)-Math.min(...ys)+2*naturalPad},
  {span,pad,minX,minY,width,height}=frozenView??natural,
  mid=(recipe.parameterStart+recipe.parameterEnd)/2,point=(radius:number):Point=>[-1+radius*Math.cos(mid),radius*Math.sin(mid)],
  handles:{kind:Handle;point:Point;label:string}[]=[{kind:'start',point:crease[0],label:'弧起点'},
   {kind:'end',point:crease.at(-1)!,label:'弧终点'},{kind:'left',point:point(1-recipe.leftCoefficient),label:'左截线'},
   {kind:'right',point:point(1-recipe.rightCoefficient),label:'右截线'}];
 const move=(event:ReactPointerEvent<SVGSVGElement>)=>{
  const current=drag.current;if(!current)return;const {kind,inverse}=current;
  const local=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse),x=local.x+1,y=-local.y,
   angle=clamp(Math.atan2(y,x),0,Math.PI/2),radius=Math.hypot(x,y);let next={...recipe};
  if(kind==='start')next.parameterStart=clamp(angle,0,recipe.parameterEnd-.1);
  else if(kind==='end')next.parameterEnd=clamp(angle,recipe.parameterStart+.1,Math.PI/2);
  else if(kind==='left')next.leftCoefficient=clamp(1-radius,.05,.95);
  else next.rightCoefficient=clamp(1-radius,-2,-.05);
  onChange(next);
 };
 const spacing=span>.8?.5:.1,ticks=Array.from({length:Math.ceil(width/spacing)+1},(_,i)=>Math.ceil(minX/spacing)*spacing+i*spacing).filter(x=>x<=minX+width),
  scaleY=minY+height-pad*.4,barLength=span>.8?.5:.1,barX=minX+pad*.35;
 return <svg ref={svg} className="cccp-svg" role="img" aria-label="原圆例二维纸域毫米标尺与可拖动参数点" data-testid="conic-circle-cp-plot"
  viewBox={`${minX} ${minY} ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
  onPointerMove={move} onPointerUp={()=>{drag.current=null;setFrozenView(null);}} onPointerCancel={()=>{drag.current=null;setFrozenView(null);}}>
  <defs><pattern id="conic-circle-paper-grid" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
   <path d={`M ${spacing} 0 L 0 0 0 ${spacing}`} fill="none" stroke="#b6c8ba" strokeWidth=".0015"/></pattern></defs>
  <rect x={minX} y={minY} width={width} height={height} fill="url(#conic-circle-paper-grid)"/>
  <path d={path([...crease,...left.slice().reverse()])+' Z'} className="cccp-inner"/>
  <path d={path([...crease.slice().reverse(),...right])+' Z'} className="cccp-outer"/>
  {[left,right].map((edge,i)=><path key={i} d={path(edge)} className="cccp-boundary"/>)}
  {[0,recipe.segments].flatMap(i=>[<path key={'l'+i} d={path([crease[i],left[i]])} className="cccp-boundary"/>,
   <path key={'r'+i} d={path([crease[i],right[i]])} className="cccp-boundary"/>])}
  <path d={path(crease)} className="cccp-crease"/>
  {rows.filter((_,i)=>i%Math.max(1,Math.ceil(recipe.segments/8))===0).map((row,i)=><path key={i} d={path([row.left,row.crease,row.right])} className="cccp-guide"/>)}
  {handles.map(h=><g key={h.kind} className={'cccp-handle '+h.kind} data-testid={'conic-circle-handle-'+h.kind}
    onPointerDown={event=>{event.preventDefault();const matrix=svg.current?.getScreenCTM();if(!matrix)return;
     drag.current={kind:h.kind,inverse:matrix.inverse()};setFrozenView({span,pad,minX,minY,width,height});svg.current?.setPointerCapture(event.pointerId);}}>
   <circle cx={h.point[0]} cy={-h.point[1]} r={span*.019}/>
   <text x={h.point[0]+span*.025} y={-h.point[1]-span*.025} fontSize={span*.031}>{h.label}</text>
  </g>)}
  <g className="cccp-ruler"><path d={`M ${barX} ${scaleY} h ${barLength}`}/>
   <path d={`M ${barX} ${scaleY-span*.013} v ${span*.026} M ${barX+barLength} ${scaleY-span*.013} v ${span*.026}`}/>
   <text x={barX+barLength/2} y={scaleY-span*.025} textAnchor="middle" fontSize={span*.033}>{barLength} mm</text>
   {ticks.map(x=><text key={x} x={x} y={minY+pad*.35} textAnchor="middle" fontSize={span*.025}>{Number(x.toFixed(1))}</text>)}
  </g>
 </svg>;
}
export default function ConicCircleCPDialog({initial,onClose,onAdoptCP,onDiagnostics}:{initial?:ConicCircleCPRecipe;onClose:()=>void;
 onAdoptCP?:(doc:Doc)=>boolean;onDiagnostics?:()=>void}){
 const [draft,setDraft]=useState(()=>draftFor(initial??CONIC_CIRCLE_CP_EXAMPLE)),[native,setNative]=useState<GenericConicSectionResult|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[requestError,setRequestError]=useState(''),[adoptError,setAdoptError]=useState(''),
  generation=useRef(0),lastValid=useRef(initial??CONIC_CIRCLE_CP_EXAMPLE);
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(error){return {recipe:null,error:(error as Error).message};}},[draft]);
 if(input.recipe)lastValid.current=input.recipe;
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();setNative(null);setAdoptError('');setRequestError('');
  if(!input.recipe){setStatus('error');return ()=>controller.abort();}
  const recipe=input.recipe;setStatus('checking');const timer=setTimeout(async()=>{
   try{const result=await fetchGenericConicSectionWhenIdle(conicCircleCPQuery(recipe),AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
    if(id!==generation.current||controller.signal.aborted)return;conicCircleCPDocument(recipe,result);setNative(result);setStatus('ready');
   }catch(error){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setRequestError((error as Error).message);}
  },150);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[input]);
 const cp=useMemo(()=>{try{return input.recipe&&native?conicCircleCPDocument(input.recipe,native):null;}catch{return null;}},[input.recipe,native]),
  recipe=lastValid.current,delta=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments,
  edit=(key:keyof Draft,value:string)=>{setStatus('checking');setNative(null);setDraft(d=>({...d,[key]:value}));},
  field=(key:keyof Draft,label:string,min:number,max:number,step='any')=><label className="cccp-field" key={key}><span>{label}</span>
   <input aria-label={label} type="number" value={draft[key]} min={min} max={max} step={step} onChange={e=>edit(key,e.target.value)}/></label>,
  adopt=()=>{if(!cp||!onAdoptCP)return;try{setAdoptError('');if(onAdoptCP(cp))onClose();}catch(error){setAdoptError((error as Error).message);}};
 return <TessDialog title="原圆例 · 二维纸域 CP" onClose={onClose}><div className="conic-circle-cp-dialog">
  <aside className="cccp-controls"><div className="cccp-kicker">CONIC SECTION / IN[4021]</div><h2>一段圆弧，两侧纸面</h2>
   <p className="cccp-intro">原焦点保持 −1 / −1。两原母线都指向圆心；右截线使用负系数。预览点可拖动，数值仍以原规则核验。</p>
   <div className="cccp-fields">{field('leftCoefficient','左原母线系数（正）',.05,.95)}{field('rightCoefficient','右原母线系数（负）',-2,-.05)}
    {field('parameterStart','圆弧起点 / rad',0,Math.PI/2)}{field('parameterEnd','圆弧终点 / rad',0,Math.PI/2)}
    {field('segments','圆例弦段数',16,128,'1')}</div>
   <div className="cccp-actions"><button onClick={()=>{setNative(null);setDraft(draftFor(CONIC_CIRCLE_CP_EXAMPLE));}}>恢复原 In[4021] 圆例</button>
    {onDiagnostics&&<button onClick={onDiagnostics}>完整四参数原式诊断 →</button>}</div>
   <dl className="cccp-readout"><div><dt>内 / 原折线 / 外半径</dt><dd>{(1-recipe.leftCoefficient).toFixed(3)} / 1 / {(1-recipe.rightCoefficient).toFixed(3)} mm</dd></div>
    <div><dt>纸域 Jacobian 下界</dt><dd>{(1-recipe.leftCoefficient).toFixed(3)} mm</dd></div>
    <div><dt>原坐标 → 毫米</dt><dd>1 : 1，无平移/缩放</dd></div></dl>
   <p className="cccp-limit">局限于原圆例的单闭域；不会把其他圆锥曲线、跨极点或三维投影安装为纸面。</p>
  </aside><main className="cccp-results"><div className="cccp-heading"><strong>真实二维坐标 · mm</strong><span>U 未指定折痕 / B 实际纸边</span></div>
   <div className="cccp-plot"><PaperPlot recipe={recipe} onChange={next=>{setStatus('checking');setNative(null);setDraft(draftFor(next));}}/>
    <div className="cccp-caption">拖动弧端点改变区间，拖动左右截线点改变有向系数。</div></div>
   <p className="cccp-status" role="status" data-testid="conic-circle-cp-status" data-state={cp?'ready':status}>{input.error||requestError||
    (cp?`原九规则通过 · ${3*(recipe.segments+1)} 顶点 / ${3*recipe.segments+4} 边 / 2 面`:'正在核验完整原九规则与材料纸边…')}</p>
   <div className="cccp-evidence"><strong>仅采用二维 CP</strong><span>原截线坐标保留；端封边与弦采样为明确的本地构造。折线误差 ≤ {(delta*delta/8).toExponential(3)} mm。
    未指定山谷，没有三维初值、FF、层序、运动或碰撞证书。</span></div>
   {adoptError&&<p role="alert" className="cccp-error">{adoptError}</p>}
   <footer><span>采用后可编辑、保存及普通/优化导出；源参数随工程保留。</span><button onClick={onClose}>关闭</button>
    <button className="primary" disabled={!cp||!onAdoptCP} onClick={adopt}>仅采用原圆例 CP →</button></footer>
  </main>
 </div></TessDialog>;
}
