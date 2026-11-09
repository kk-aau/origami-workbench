import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import {PLANAR_RULED_CP_4040_EXAMPLE,planarRuledCP4040Document,planarRuledCP4040Preview,planarRuledCP4040Query,
 validatePlanarRuledCP4040Recipe,type PlanarRuledCP4040Recipe} from '../app/planarRuledCP4040';
import {fetchNativePlanarSequenceWhenIdle,type NativePlanarSequenceResult} from '../app/curvedNativePlanarSequence';
import type {Doc,Point} from '../core/types';
import './PlanarRuledCP4040Dialog.css';

type Draft=Record<keyof PlanarRuledCP4040Recipe,string>;
const draftFor=(r:PlanarRuledCP4040Recipe):Draft=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft;
const parse=(draft:Draft)=>{
 if(Object.values(draft).some(v=>!v.trim()))throw Error('请填写完整当前区间与弦段数。');
 return validatePlanarRuledCP4040Recipe(Object.fromEntries(Object.entries(draft).map(([k,v])=>[k,Number(v)])));
};
const path=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x} ${-y}`).join(' ');
/** The grid, scale and optional ruling guides are display-only. None creates document edges. */
export function PlanarRuledCP4040Plot({recipe,doc,guides=false}:{recipe:PlanarRuledCP4040Recipe;doc?:Doc|null;guides?:boolean}){
 const count=recipe.segments+1,raw=doc?.metadata?.materialTopology as {graph?:{vertices_coords:Point[]}}|undefined,
  curves=raw?.graph?Array.from({length:4},(_,c)=>raw.graph!.vertices_coords.slice(c*count,(c+1)*count)):planarRuledCP4040Preview(recipe).curves,
  pad=.3,minY=-recipe.parameterEnd-pad,width=3+2*pad,height=recipe.parameterEnd-recipe.parameterStart+2*pad,
  xTicks=Array.from({length:7},(_,i)=>i*.5),yTicks=Array.from({length:5},(_,i)=>-.5+i*.25).filter(y=>y>=recipe.parameterStart&&y<=recipe.parameterEnd),
  yAxisX=-.12,xAxisY=-recipe.parameterStart+.12,barX=2.25,barY=minY+.15;
 return <svg className="pr4040-svg" role="img" aria-label="原 In4040 二维三面纸带毫米网格、坐标轴与标尺"
  data-testid="planar-ruled-cp-4040-plot" data-coordinate-unit="mm" viewBox={`${-pad} ${minY} ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
  <defs><pattern id="pr4040-mm-grid" width="0.25" height="0.25" patternUnits="userSpaceOnUse">
   <path d="M .25 0 L 0 0 0 .25" fill="none" stroke="#a8bdc3" strokeWidth=".0015"/></pattern></defs>
  <rect x={-pad} y={minY} width={width} height={height} fill="url(#pr4040-mm-grid)"/>
  {Array.from({length:3},(_,c)=><path key={c} className={`pr4040-face face-${c}`}
   d={path([...curves[c],...curves[c+1].slice().reverse()])+' Z'}/>)}
  {[0,3].map(c=><path key={c} d={path(curves[c])} className="pr4040-boundary"/>)}
  {[0,recipe.segments].map(i=><path key={i} d={path([curves[0][i],curves[3][i]])} className="pr4040-boundary"/>)}
  {[1,2].map(c=><path key={c} d={path(curves[c])} className="pr4040-crease"/>)}
  {guides&&curves[0].filter((_,i)=>i%Math.max(1,Math.ceil(recipe.segments/8))===0).map((p,i)=><path key={i}
   d={path([p,[3,p[1]]])} className="pr4040-guide"/>)}
  {[0,1,2].map(c=><text key={c} x={(curves[c][Math.floor(count/2)][0]+curves[c+1][Math.floor(count/2)][0])/2}
   y={-(recipe.parameterStart+recipe.parameterEnd)/2} textAnchor="middle" className="pr4040-face-label">纸面 {c+1}</text>)}
  <g className="pr4040-ruler">
   <path d={`M 0 ${xAxisY} H 3 M ${yAxisX} ${-recipe.parameterEnd} V ${-recipe.parameterStart}`}/>
   {xTicks.map(x=><g key={x}><path d={`M ${x} ${xAxisY-.018} v .036`}/><text x={x} y={xAxisY+.065} textAnchor="middle">{x}</text></g>)}
   {yTicks.map(y=><g key={y}><path d={`M ${yAxisX-.018} ${-y} h .036`}/><text x={yAxisX-.04} y={-y+.018} textAnchor="end">{y}</text></g>)}
   <text x="3.13" y={xAxisY+.035}>x / mm</text><text x={yAxisX} y={minY+.09} textAnchor="middle">y / mm</text>
   <path data-testid="planar-ruled-cp-4040-scale" data-mm="0.5" d={`M ${barX} ${barY} h .5 M ${barX} ${barY-.018} v .036 M ${barX+.5} ${barY-.018} v .036`}/>
   <text x={barX+.25} y={barY-.04} textAnchor="middle">0.5 mm</text>
  </g>
 </svg>;
}
export default function PlanarRuledCP4040Dialog({initial,onClose,onAdoptCP}:{initial?:PlanarRuledCP4040Recipe;
 onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean}){
 const dialog=useRef<HTMLDialogElement>(null),generation=useRef(0),lastValid=useRef(initial??PLANAR_RULED_CP_4040_EXAMPLE),
  [draft,setDraft]=useState(()=>draftFor(initial??PLANAR_RULED_CP_4040_EXAMPLE)),[native,setNative]=useState<NativePlanarSequenceResult|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[requestError,setRequestError]=useState(''),
  [adoptError,setAdoptError]=useState(''),[guides,setGuides]=useState(false);
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(error){return {recipe:null,error:(error as Error).message};}},[draft]);
 if(input.recipe)lastValid.current=input.recipe;
 useEffect(()=>openAppDialog(dialog.current),[]);
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();setNative(null);setAdoptError('');setRequestError('');
  if(!input.recipe){setStatus('error');return ()=>controller.abort();}
  const recipe=input.recipe;setStatus('checking');const timer=setTimeout(async()=>{
   try{const result=await fetchNativePlanarSequenceWhenIdle(planarRuledCP4040Query(recipe),AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
    if(id!==generation.current||controller.signal.aborted)return;planarRuledCP4040Document(recipe,result);setNative(result);setStatus('ready');
   }catch(error){if(id!==generation.current||controller.signal.aborted)return;setStatus('error');setRequestError((error as Error).message);}
  },150);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[input]);
 const cp=useMemo(()=>{try{return input.recipe&&native?planarRuledCP4040Document(input.recipe,native):null;}catch{return null;}},[input.recipe,native]),
  recipe=lastValid.current,delta=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments,
  edit=(key:keyof Draft,value:string)=>{setNative(null);setStatus('checking');setDraft(d=>({...d,[key]:value}));},
  field=(key:keyof Draft,label:string,min:number,max:number,step='any')=><label className="pr4040-field" key={key}><span>{label}</span>
   <input type="number" aria-label={label} value={draft[key]} min={min} max={max} step={step} onChange={e=>edit(key,e.target.value)}/></label>,
  adopt=()=>{if(!cp||!onAdoptCP)return;try{setAdoptError('');if(onAdoptCP(cp))onClose();}catch(error){setAdoptError((error as Error).message);}};
 return <dialog ref={dialog} className="pr4040-dialog ui-dialog" aria-labelledby="pr4040-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><span className="pr4040-kicker">ORIGINAL IN[4040] / PLANAR RULED PAPER</span><button aria-label="关闭原二维纸带" onClick={onClose}>×</button></header>
  <div className="pr4040-layout"><aside className="pr4040-controls"><h2 id="pr4040-title">两条曲折线，三面纸带</h2>
   <p>原文给出纸面参数化。保留原两镜面与非组合反射顺序，修改原域内区间或采样密度。</p>
   <div className="pr4040-formulas"><code>b₂(u) = (0, u)<br/>d₂(u) = (1, 0)<br/>Y(u,v) = (v, u)</code>
    <span>切距：0 / cos u / 1 + cos u / 3</span></div>
   <div className="pr4040-fields">{field('parameterStart','纸带起点 u / rad',-Math.PI/4,Math.PI/4)}
    {field('parameterEnd','纸带终点 u / rad',-Math.PI/4,Math.PI/4)}{field('segments','曲折线弦段数',16,128,'1')}</div>
   <button className="pr4040-restore" onClick={()=>{setNative(null);setDraft(draftFor(PLANAR_RULED_CP_4040_EXAMPLE));}}>恢复原 In[4040] 输入</button>
   <dl><div><dt>原坐标 → 毫米</dt><dd>1 : 1 · 无平移 / 缩放</dd></div><div><dt>全域 |Jacobian|</dt><dd>1 · 显式逆 (u,v) = (y,x)</dd></div>
    <div><dt>纸域</dt><dd>3 mm × {(recipe.parameterEnd-recipe.parameterStart).toFixed(4)} mm</dd></div></dl>
   <p className="pr4040-scope">仅原圆柱例的有界二维纸面。源三维镜像数据保留为诊断；本构造没有 FF、层序、运动或碰撞证书。</p>
  </aside><main className="pr4040-results"><div className="pr4040-heading"><strong>纸面坐标 / mm</strong><span>B 实际纸边 · U 未指定折痕</span></div>
   <div className="pr4040-plot"><PlanarRuledCP4040Plot recipe={recipe} doc={cp} guides={guides}/></div>
   <label className="pr4040-guide-control"><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/>
    显示母线参考（仅预览，不加入 CP / 加工）</label>
   <p role="status" data-testid="planar-ruled-cp-4040-status" className="pr4040-status" data-state={cp?'ready':status}>
    {input.error||requestError||(cp?`原镜像序列与纸边通过 · ${4*(recipe.segments+1)} 顶点 / ${4*recipe.segments+6} 边 / 3 面`:'正在读取并核验原镜像序列…')}</p>
   <div className="pr4040-evidence"><strong>仅采用二维 CP</strong><span>实际原切距按直弦连接，端封边形成有限纸域。每条内部曲线的弦误差 ≤ {(delta*delta/8).toExponential(3)} mm。
    山谷未赋型；不添加采样母线折痕。</span></div>
   {adoptError&&<p role="alert" className="pr4040-error">{adoptError}</p>}
   <footer><span>源参数和实际 native 数据随工程保存。</span><button onClick={onClose}>关闭</button>
    <button className="primary" disabled={!cp||!onAdoptCP} onClick={adopt}>仅采用原二维纸带 CP →</button></footer>
  </main></div>
 </dialog>;
}
