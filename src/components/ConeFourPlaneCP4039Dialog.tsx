import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import {CONE_FOUR_PLANE_CP_4039_EXAMPLE,coneFourPlaneCP4039Document,coneFourPlaneCP4039Preview,coneFourPlaneCP4039Query,
 validateConeFourPlaneCP4039Recipe,type ConeFourPlaneCP4039Recipe} from '../app/coneFourPlaneCP4039';
import {fetchNativePlanarSequenceWhenIdle,type NativePlanarSequenceResult} from '../app/curvedNativePlanarSequence';
import type {Doc,Point} from '../core/types';
import './ConeFourPlaneCP4039Dialog.css';

type Draft=Record<keyof ConeFourPlaneCP4039Recipe,string>;
const draftFor=(r:ConeFourPlaneCP4039Recipe):Draft=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft;
const parse=(draft:Draft)=>{
 if(Object.values(draft).some(v=>!v.trim()))throw Error('请填写完整原角区间、局部内半径、弦段数与赋型。');
 return validateConeFourPlaneCP4039Recipe({...Object.fromEntries(Object.entries(draft).filter(([k])=>k!=='assignmentMode'&&k!=='paperBoundaryMode').map(([k,v])=>[k,Number(v)])),
  assignmentMode:draft.assignmentMode,paperBoundaryMode:draft.paperBoundaryMode});
};
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x} ${-y}`).join(' ');
/** Millimetre display only. Guides never enter the material graph or processing edges. */
export function ConeFourPlaneCP4039Plot({recipe,doc,guides=false}:{recipe:ConeFourPlaneCP4039Recipe;doc?:Doc|null;guides?:boolean}){
 const count=recipe.segments+1,raw=doc?.metadata?.materialTopology as {graph?:{vertices_coords:Point[]}}|undefined,
  curves=raw?.graph?(recipe.paperBoundaryMode==='original-apex'?
   [Array.from({length:count},()=>raw.graph!.vertices_coords[0]),...Array.from({length:4},(_,c)=>raw.graph!.vertices_coords.slice(1+c*count,1+(c+1)*count))]:
   Array.from({length:5},(_,c)=>raw.graph!.vertices_coords.slice(c*count,(c+1)*count))):coneFourPlaneCP4039Preview(recipe).curves,
  pts=curves.flat(),xmin=Math.min(...pts.map(p=>p[0])),xmax=Math.max(...pts.map(p=>p[0])),
  ymin=Math.min(...pts.map(p=>p[1])),ymax=Math.max(...pts.map(p=>p[1])),pad=.35,
  xTicks=Array.from({length:Math.floor(xmax)-Math.ceil(xmin)+1},(_,i)=>Math.ceil(xmin)+i),
  yTicks=Array.from({length:Math.floor(ymax)-Math.ceil(ymin)+1},(_,i)=>Math.ceil(ymin)+i),
  axisY=-ymin+.12,axisX=xmin-.12,barX=xmax-1,barY=-ymax-.17;
 return <svg className="c4039-svg" role="img" aria-label="原圆锥四带二维纸面毫米网格、坐标轴与标尺"
  data-testid="cone-four-plane-cp-4039-plot" data-coordinate-unit="mm" viewBox={`${xmin-pad} ${-ymax-pad} ${xmax-xmin+2*pad} ${ymax-ymin+2*pad}`} preserveAspectRatio="xMidYMid meet">
  <defs><pattern id="c4039-mm-grid" width=".25" height=".25" patternUnits="userSpaceOnUse">
   <path d="M .25 0 L 0 0 0 .25" fill="none" stroke="#a5bdbe" strokeWidth=".0018"/></pattern></defs>
  <rect x={xmin-pad} y={-ymax-pad} width={xmax-xmin+2*pad} height={ymax-ymin+2*pad} fill="url(#c4039-mm-grid)"/>
  {Array.from({length:4},(_,c)=><path key={c} className={`c4039-face face-${c}`} d={path([...curves[c],...curves[c+1].slice().reverse()])+' Z'}/>)}
  {guides&&Array.from({length:recipe.segments+1},(_,i)=>i).filter(i=>i%Math.max(1,Math.ceil(recipe.segments/12))===0||i===recipe.segments)
   .flatMap(i=>[0,1,2,3].map(c=><path key={`${i}-${c}`} d={path([curves[c][i],curves[c+1][i]])} className={`c4039-guide curvature-${c%2?'negative':'positive'}`}/>))}
  {[0,4].map(c=><path key={c} d={path(curves[c])} className="c4039-boundary"/>)}
  {[0,recipe.segments].map(i=><path key={i} d={path([curves[0][i],curves[4][i]])} className="c4039-boundary"/>)}
  {[1,2,3].map(c=><path key={c} d={path(curves[c])} className={`c4039-crease ${recipe.assignmentMode==='unassigned'?'unassigned':c===2?'valley':'mountain'}`}/>)}
  {[0,1,2,3].map(c=>{const i=Math.floor(count/2),a=curves[c][i],b=curves[c+1][i];return <text key={c} x={(a[0]+b[0])/2} y={-(a[1]+b[1])/2}
   textAnchor="middle" className="c4039-face-label">{c+1}</text>;})}
  <g className="c4039-ruler"><path d={`M ${xmin} ${axisY} H ${xmax} M ${axisX} ${-ymax} V ${-ymin}`}/>
   {xTicks.map(x=><g key={x}><path d={`M ${x} ${axisY-.025} v .05`}/><text x={x} y={axisY+.09} textAnchor="middle">{x}</text></g>)}
   {yTicks.map(y=><g key={y}><path d={`M ${axisX-.025} ${-y} h .05`}/><text x={axisX-.055} y={-y+.025} textAnchor="end">{y}</text></g>)}
   <text x={xmax} y={axisY+.22} textAnchor="end">x / mm</text><text x={axisX} y={-ymax-.11} textAnchor="middle">y / mm</text>
   <path data-testid="cone-four-plane-cp-4039-scale" data-mm="1" d={`M ${barX} ${barY} h 1 M ${barX} ${barY-.025} v .05 M ${barX+1} ${barY-.025} v .05`}/>
   <text x={barX+.5} y={barY-.065} textAnchor="middle">1 mm</text>
  </g>
 </svg>;
}
export default function ConeFourPlaneCP4039Dialog({initial,onClose,onAdoptCP}:{initial?:ConeFourPlaneCP4039Recipe;
 onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean}){
 const dialog=useRef<HTMLDialogElement>(null),generation=useRef(0),lastValid=useRef(initial??CONE_FOUR_PLANE_CP_4039_EXAMPLE),
  lastLocalRadius=useRef(initial?.paperBoundaryMode==='local-cut'?initial.innerRadius:.5),
  [draft,setDraft]=useState(()=>draftFor(initial??CONE_FOUR_PLANE_CP_4039_EXAMPLE)),[native,setNative]=useState<NativePlanarSequenceResult|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[requestError,setRequestError]=useState(''),[adoptError,setAdoptError]=useState(''),[guides,setGuides]=useState(false);
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(error){return {recipe:null,error:(error as Error).message};}},[draft]);
 if(input.recipe){lastValid.current=input.recipe;if(input.recipe.paperBoundaryMode==='local-cut')lastLocalRadius.current=input.recipe.innerRadius;}
 useEffect(()=>openAppDialog(dialog.current),[]);
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();setNative(null);setAdoptError('');setRequestError('');
  if(!input.recipe){setStatus('error');return ()=>controller.abort();}
  const recipe=input.recipe;setStatus('checking');const timer=setTimeout(async()=>{
   try{const result=await fetchNativePlanarSequenceWhenIdle(coneFourPlaneCP4039Query(recipe),AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
    if(id!==generation.current||controller.signal.aborted)return;coneFourPlaneCP4039Document(recipe,result);setNative(result);setStatus('ready');
   }catch(error){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setRequestError((error as Error).message);}
  },150);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[input]);
 const cp=useMemo(()=>{try{return input.recipe&&native?coneFourPlaneCP4039Document(input.recipe,native):null;}catch{return null;}},[input.recipe,native]),
  recipe=lastValid.current,proof=cp?.metadata?.originalConeFourPlane4039 as {sampling:{curveChordErrorUpperBounds:number[]}}|undefined,
  errorBound=proof?Math.max(...proof.sampling.curveChordErrorUpperBounds):null,
  edit=(key:keyof Draft,value:string)=>{setNative(null);setStatus('checking');setDraft(d=>({...d,[key]:value}));},
  boundary=(value:string)=>{setNative(null);setStatus('checking');setDraft(d=>({...d,paperBoundaryMode:value,
   innerRadius:String(value==='original-apex'?0:lastLocalRadius.current)}));},
  field=(key:keyof Draft,label:string,min:number,max:number,step='any',disabled=false)=><label className="c4039-field" key={key}><span>{label}</span>
   <input type="number" aria-label={label} value={draft[key]} min={min} max={max} step={step} disabled={disabled} onChange={e=>edit(key,e.target.value)}/></label>,
  adopt=()=>{if(!cp||!onAdoptCP)return;try{setAdoptError('');if(onAdoptCP(cp))onClose();}catch(error){setAdoptError((error as Error).message);}};
 return <dialog ref={dialog} className="c4039-dialog ui-dialog" aria-labelledby="c4039-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><span className="c4039-kicker">ORIGINAL IN[4039] / FOUR-MIRROR CONE</span><button aria-label="关闭原圆锥四带" onClick={onClose}>×</button></header>
  <div className="c4039-layout"><aside className="c4039-controls"><h2 id="c4039-title">三条曲折线，四带纸面</h2>
   <p>保留原 30.° 圆锥、10.° 镜面与组合反射。原锥顶是唯一源顶点，也可选择局部截顶。</p>
   <div className="c4039-formulas"><code>Y(u,v) = v (cos(u sin θ), sin(u sin θ))<br/>θ = 30.° · β = 10.° · Compose = True</code>
    <span>原坐标 1 : 1 → mm · 不归一、平移或缩放</span></div>
   <label className="c4039-field"><span>纸域边界</span><select aria-label="纸域边界" value={draft.paperBoundaryMode} onChange={e=>boundary(e.target.value)}>
    <option value="original-apex">原完整锥顶纸域 · 唯一源顶点</option><option value="local-cut">局部截顶纸域 · 正内半径</option></select></label>
   <div className="c4039-fields">{field('parameterStart','原角起点 u / rad',0,Math.PI)}{field('parameterEnd','原角终点 u / rad',0,Math.PI)}
    {field('innerRadius','纸域内半径 / mm',recipe.paperBoundaryMode==='original-apex'?0:.05,1,'any',draft.paperBoundaryMode==='original-apex')}{field('segments','圆锥弦段数',16,128,'1')}</div>
   <label className="c4039-field"><span>有限弦段赋型</span><select aria-label="有限弦段赋型" value={draft.assignmentMode} onChange={e=>edit('assignmentMode',e.target.value)}>
    <option value="original-styles">原山谷标记 M/V/M · 目标角未指定</option><option value="unassigned">本地未赋型 U · 保留原标记来源</option></select></label>
   <button className="c4039-restore" onClick={()=>{setNative(null);setDraft(draftFor(CONE_FOUR_PLANE_CP_4039_EXAMPLE));}}>恢复原 In[4039] 输入与完整锥顶</button>
   <dl><div><dt>原绘图曲线密度</dt><dd>默认 100 · 当前 {recipe.segments} 段为本地有限弦</dd></div>
    <div><dt>有限纸域</dt><dd>4 带 / 1 部件 · 无径向加工缝</dd></div><div><dt>原参数域</dt><dd>{recipe.paperBoundaryMode==='original-apex'?
     '原点 |J|=0 · 原0边为同一源锥顶':'−v sin θ · |J| ≥ '+(.48*recipe.innerRadius).toPrecision(3)}</dd></div></dl>
   <p className="c4039-scope">原山谷标签保留在三条内部曲折线上，目标角未指定。母线样式表示曲率参考；不生成母线折痕。</p>
  </aside><main className="c4039-results"><div className="c4039-heading"><strong>纸面坐标 / mm</strong><span>B 纸边 · {recipe.assignmentMode==='original-styles'?'M 山 / V 谷':'U 未赋型'}</span></div>
   <div className="c4039-plot"><ConeFourPlaneCP4039Plot recipe={recipe} doc={cp} guides={guides}/></div>
   <label className="c4039-guide-control"><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/>
    显示原母线参考（仅预览，不加入 CP / 加工）</label>
   <p role={adoptError?'alert':'status'} data-testid="cone-four-plane-cp-4039-status" className="c4039-status" data-state={adoptError?'error':cp?'ready':status}>
    {input.error||requestError||adoptError||(cp?`原序列与纸域通过 · ${recipe.paperBoundaryMode==='original-apex'?4*recipe.segments+5:5*(recipe.segments+1)} 顶点 / ${recipe.paperBoundaryMode==='original-apex'?4*recipe.segments+8:5*recipe.segments+8} 边 / 4 面`:'正在读取并核验原圆锥镜像序列…')}</p>
   <div className="c4039-evidence"><strong>仅二维 CP · 无 FF / 层序 / 3D 证书</strong><span>实际原切距连接为有限弦。
    {errorBound===null?'弦误差将在原序列核验后显示。':`当前每轨弦误差 ≤ ${errorBound.toExponential(3)} mm。`}
    {recipe.paperBoundaryMode==='original-apex'?'原点逆参数不唯一；二维源商纸域简单正面积。':'局部正内半径截顶。'}纸域与端封边随配方保存。</span></div>
   <footer><span>原序列、原标记与局部配方保存。</span><button onClick={onClose}>关闭</button>
    <button className="primary" disabled={!cp||!onAdoptCP} onClick={adopt}>仅采用原圆锥四带 CP →</button></footer>
  </main></div>
 </dialog>;
}
