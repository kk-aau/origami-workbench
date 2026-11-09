import {useEffect,useMemo,useRef,useState} from 'react';
import {TessDialog} from './TessellationEditor';
import {fetchGenericNonuniformHelixWhenIdle,type GenericNonuniformHelixResult} from '../app/curvedNativeNonuniformHelix';
import {NONUNIFORM_SPIRAL_CP_3968_EXAMPLE,validateNonuniformSpiralCP3968Recipe,nonuniformSpiralCP3968Query,
 prepareNonuniformSpiralCP3968Preview,nonuniformSpiralCP3968SourceMatches,nonuniformSpiralCP3968MaximumLeftWidth,
 type NonuniformSpiralCP3968Recipe} from '../app/nonuniformSpiralCP3968';
import type {Doc,Point,FoldGraph} from '../core/types';
import './NonuniformSpiralCP3968Dialog.css';

type Draft=Record<keyof NonuniformSpiralCP3968Recipe,string>;
const draftFor=(r:NonuniformSpiralCP3968Recipe)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft;
function parse(d:Draft){const values=Object.fromEntries(Object.entries(d).map(([k,v])=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error('请填写完整有限数值；没有自动回退或裁剪。');return [k,Number(v)];}));return validateNonuniformSpiralCP3968Recipe(values);}
function MillimetrePlot({doc,native,guides,recipe}:{doc:Doc;native:GenericNonuniformHelixResult;guides:boolean;recipe:NonuniformSpiralCP3968Recipe}){
 const graph=(doc.metadata!.materialTopology as {graph:FoldGraph}).graph,points=graph.vertices_coords,n=recipe.segments+1,
  rows=native.flattening.result!.sample.rows,reference=guides?rows.flatMap(row=>[row.targetBase.map((x,i)=>x+row.targetLeftDirector[i]) as Point,row.targetBase.map((x,i)=>x+row.targetRightDirector[i]) as Point]):[],
  all=[...points,...reference,[0,0] as Point],minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxX=Math.max(...all.map(p=>p[0])),maxY=Math.max(...all.map(p=>p[1])),
  span=Math.max(maxX-minX,maxY-minY),unit=10**Math.floor(Math.log10(span/8)),step=[1,2,5,10].map(k=>k*unit).find(v=>v>=span/8)!,margin=span*.14,size=span*.025,labelSize=span*.045,stroke=span*.002,
  ticks=(a:number,b:number)=>Array.from({length:Math.floor(b/step)-Math.ceil(a/step)+1},(_,i)=>(Math.ceil(a/step)+i)*step),
  label=(x:number)=>Number(x.toPrecision(7)).toString(),xTicks=ticks(minX,maxX),yTicks=ticks(minY,maxY),rulerX=minX+span*.08,rulerY=maxY+margin*.68,
  chain=(start:number)=>points.slice(start,start+n).map(p=>p.join(',')).join(' '),refChain=(side:'Left'|'Right')=>rows.map(row=>row.targetBase.map((x,i)=>x+row['target'+side+'Director' as 'targetLeftDirector'][i]).join(',')).join(' ');
 return <figure className="spiral3968-figure"><svg data-testid="spiral3968-mm-plot" viewBox={`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`} aria-label="原螺旋毫米坐标、轴及实际两面纸域">
  <g className="spiral3968-grid" strokeWidth={stroke*.5}>{xTicks.map(x=><line key={'x'+x} x1={x} y1={minY} x2={x} y2={maxY}/>)}{yTicks.map(y=><line key={'y'+y} x1={minX} y1={y} x2={maxX} y2={y}/>)}</g>
  <g stroke="#8797a3" strokeWidth={stroke}><line x1={minX} y1={0} x2={maxX} y2={0}/><line x1={0} y1={minY} x2={0} y2={maxY}/></g>
  <g fill="#506170" fontSize={labelSize}>{xTicks.map(x=><text key={'x'+x} x={x} y={minY-margin*.32} textAnchor="middle">{label(x)}</text>)}{yTicks.map(y=><text key={'y'+y} x={minX-margin*.12} y={y+size*.3} textAnchor="end">{label(y)}</text>)}<text x={maxX} y={minY-margin*.65} textAnchor="end">X → / mm</text><text x={minX-margin*.65} y={maxY} textAnchor="middle" transform={`rotate(-90 ${minX-margin*.65} ${maxY})`}>Y ↓ / mm</text></g>
  {graph.faces_vertices!.map((f,i)=><polygon key={i} points={f.map(v=>points[v].join(',')).join(' ')} fill={i?'#dcebe7':'#e0e7f1'} stroke="none" opacity=".8"/>)}
  {guides&&<g data-testid="spiral3968-unit-reference" fill="none" stroke="#aa668e" strokeWidth={stroke} strokeDasharray={`${span*.013} ${span*.008}`}><polyline points={refChain('Left')}/><polyline points={refChain('Right')}/></g>}
  {doc.segments.map(s=><line key={s.id} data-source-segment={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.assignment==='B'?'#233243':'#246ab0'} strokeWidth={stroke*1.5} strokeDasharray={s.assignment==='U'?`${span*.007} ${span*.004}`:undefined}/>)}
  <polyline points={chain(0)} fill="none" stroke="#246ab0" strokeWidth={stroke*2}/><polyline points={chain(n)} fill="none" stroke="#c37435" strokeWidth={stroke*2}/><polyline points={chain(2*n)} fill="none" stroke="#2a7b69" strokeWidth={stroke*2}/>
  {[0,n-1].map(i=><g key={i} fill="#246ab0"><circle cx={points[i][0]} cy={points[i][1]} r={size*.6}/><text x={points[i][0]+(points[i][0]>(minX+maxX)/2?-size:size)} y={points[i][1]+(points[i][1]>(minY+maxY)/2?-size:labelSize*1.25)} textAnchor={points[i][0]>(minX+maxX)/2?'end':'start'} fontSize={labelSize}>{i?'终点':'起点'} u={label(i?recipe.parameterEnd:recipe.parameterStart)}</text></g>)}
  <g data-testid="spiral3968-mm-scale" stroke="#35475d" fill="#35475d" strokeWidth={stroke}><line x1={rulerX} y1={rulerY} x2={rulerX+step} y2={rulerY}/><line x1={rulerX} y1={rulerY-size*.4} x2={rulerX} y2={rulerY+size*.4}/><line x1={rulerX+step} y1={rulerY-size*.4} x2={rulerX+step} y2={rulerY+size*.4}/><text x={rulerX+step/2} y={rulerY-size*.65} stroke="none" fontSize={labelSize} textAnchor="middle">{label(step)} mm</text></g>
 </svg><figcaption><span>蓝 · 原曲线弦 U</span><span>橙 · 左纸边 B</span><span>绿 · 右纸边 B</span>{guides&&<span>紫虚线 · 原单位宽参考</span>}</figcaption><p>网格 {label(step)} mm · 1 原坐标单位 = 1 mm；显示仅改变视窗。</p></figure>;
}

export default function NonuniformSpiralCP3968Dialog({initial,onClose,onAdoptCP}:{initial?:NonuniformSpiralCP3968Recipe;onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean}){
 const [draft,setDraft]=useState<Draft>(()=>draftFor(initial??NONUNIFORM_SPIRAL_CP_3968_EXAMPLE)),[source,setSource]=useState<{key:string;native:GenericNonuniformHelixResult;build:(r:unknown)=>Doc}|null>(null),
  [busy,setBusy]=useState(false),[requestError,setRequestError]=useState(''),[adoptError,setAdoptError]=useState(''),[guides,setGuides]=useState(false),generation=useRef(0);
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(e){return {recipe:null,error:(e as Error).message};}},[draft]),
  sourceInput=useMemo(()=>{try{return parse({...draft,leftWidth:'.05',rightWidth:'.05'});}catch{return null;}},[draft.parameterStart,draft.parameterEnd,draft.segments]),
  queryKey=sourceInput?JSON.stringify(nonuniformSpiralCP3968Query(sourceInput)):'invalid-source-input';
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();setSource(null);setRequestError('');setAdoptError('');
  if(!sourceInput){setBusy(false);return ()=>controller.abort();}
  setBusy(true);const timer=setTimeout(async()=>{try{
   const native=await fetchGenericNonuniformHelixWhenIdle(nonuniformSpiralCP3968Query(sourceInput),AbortSignal.any([controller.signal,AbortSignal.timeout(70000)]));
   if(controller.signal.aborted||id!==generation.current)return;const build=prepareNonuniformSpiralCP3968Preview(sourceInput,native);
   if(controller.signal.aborted||id!==generation.current)return;setSource({key:queryKey,native,build});setBusy(false);
  }catch(e){if(controller.signal.aborted||id!==generation.current)return;setRequestError((e as Error).message);setBusy(false);}},150);
  return()=>{clearTimeout(timer);controller.abort();};
 },[queryKey]);
 const candidate=useMemo(()=>{if(!input.recipe||!source||source.key!==queryKey)return {doc:null,error:'',buildMs:0};const start=performance.now();
  try{return {doc:source.build(input.recipe),error:'',buildMs:performance.now()-start};}catch(e){return {doc:null,error:(e as Error).message,buildMs:performance.now()-start};}
 },[input.recipe,source,queryKey]),doc=candidate.doc,error=input.error||requestError||candidate.error||adoptError,
  state=error?'error':busy||!doc?'checking':'ready',recipe=input.recipe,
  maxLeft=(()=>{try{return nonuniformSpiralCP3968MaximumLeftWidth(Number(draft.parameterStart));}catch{return 1;}})(),
  edit=(k:keyof Draft,v:string)=>{setAdoptError('');setDraft(d=>({...d,[k]:v}));},
  field=(k:keyof Draft,label:string,min:number,max:number,step:number)=><label className="spiral3968-field" key={k}><span>{label}</span><div>
   <input type="number" aria-label={label} value={draft[k]} min={min} max={max} step={step} onChange={e=>edit(k,e.target.value)}/>
   <input type="range" aria-label={label+'滑条'} value={Number.isFinite(Number(draft[k]))?Number(draft[k]):min} min={min} max={max} step={step} onChange={e=>edit(k,e.target.value)}/>
  </div></label>,
  adopt=()=>{if(!doc||state!=='ready'||!onAdoptCP)return;try{setAdoptError('');const adopted=structuredClone(doc);if(!nonuniformSpiralCP3968SourceMatches(adopted))throw Error('当前纸域与原源绑定已变化，未采用。');if(onAdoptCP(adopted))onClose();}catch(e){setAdoptError((e as Error).message);}};
 return <TessDialog title="原非均匀螺旋 · 两面纸域 CP" onClose={onClose}><div className="spiral3968-cp" data-testid="spiral3968-dialog">
  <div className="spiral3968-workspace"><aside className="spiral3968-controls"><p className="spiral3968-kicker">ORIGINAL IN[3968] / NONUNIFORM HELIX</p>
   <h2>保留原曲线，选取安全纸域</h2><p>r = 1，θ = 30°，γ(u) = π/3 + u/3。原左右单位母线保持；右侧不翻转。</p>
   <div className="spiral3968-formula"><code>f(u₀) = (1, 0) · T(u₀) = (0, 1)</code><span>二维原世界坐标 → 1 : 1 mm</span></div>
   <div className="spiral3968-fields">{field('parameterStart','原角起点 u / rad',0,Math.PI,.01)}{field('parameterEnd','原角终点 u / rad',0,Math.PI,.01)}
    {field('leftWidth','本地左纸宽 / mm',.05,maxLeft,.01)}{field('rightWidth','本地右纸宽 / mm',.05,1,.01)}{field('segments','采样弦段数',16,128,1)}</div>
   <p className="spiral3968-focus">当前左宽上限约 {Number(maxLeft.toPrecision(7))} mm；留 0.0001 mm 焦点余量。非法输入保持原值。</p>
   <p>原绘图 100 弦与原插值选项 128 分别保留；此 CP 是本地有限直弦，不冒充原插值点表。</p>
  </aside><section className="spiral3968-results">
   <div className="spiral3968-status" data-testid="spiral3968-status" data-state={state} data-build-ms={candidate.buildMs} data-source-key={queryKey} data-current-widths={JSON.stringify([Number(draft.leftWidth),Number(draft.rightWidth)])}>
    <p role="status">{error|| (state==='checking'?'正在核原源与当前纸域…':`${recipe!.segments+1} 原点 / 轨 · ${doc!.segments.length} 真实边 · 2 张材料面`)}</p>
    {error?<p role="alert">未显示或采用失败候选。</p>:<p>{doc&&source?`当前片区原单位左带：${source.native.flattening.result!.domain.formalStripRegularity.left.status==='verified'?'正则':source.native.flattening.result!.domain.formalStripRegularity.left.status==='degenerate'?'含焦点':'未认证'}；当前纸域已独立核验。`:'原完整 [0,π] 左单位宽含焦点；等待当前片区与纸宽核验。'}</p>}
   </div>
   <div className="spiral3968-plot-slot" data-testid="spiral3968-plot-slot">{doc&&source&&recipe?<MillimetrePlot doc={doc} native={source.native} recipe={recipe} guides={guides}/>:<div className="spiral3968-placeholder">{state==='checking'?'等待本次原源完成…':'当前参数未通过，未生成纸域。'}</div>}</div>
   <label className="spiral3968-reference"><input type="checkbox" aria-label="显示原单位宽参考" checked={guides} onChange={e=>setGuides(e.target.checked)}/>显示原单位宽参考（仅预览，不增加 CP 边）</label>
   <p>仅二维 CP · 曲线弦 U / 纸边 B。原 γ 是连续变折角参考，未认证有限刚性三维、平折、层序或碰撞。</p>
  </section></div>
  <footer><span>采用后可编辑、保存和导出；源再生会恢复原 U/null。</span><button onClick={onClose}>关闭</button><button className="primary" disabled={!doc||state!=='ready'||!onAdoptCP} onClick={adopt}>仅采用原螺旋纸域 CP →</button></footer>
 </div></TessDialog>;
}
