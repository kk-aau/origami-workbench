import {useEffect,useMemo,useState} from 'react';
import {TessDialog} from './TessellationEditor';
import {UNIFORM_HELIX_CP_3951_EXAMPLE,validateUniformHelixCP3951Recipe,prepareUniformHelixCP3951Preview,uniformHelixCP3951SourceMatches,
 type UniformHelixCP3951Recipe,type UniformHelixCP3951Frame} from '../app/uniformHelixCP3951';
import type {Doc,Point,FoldGraph} from '../core/types';
import './UniformHelixCP3951Dialog.css';
type Draft=Record<keyof UniformHelixCP3951Recipe,string>;
const draftFor=(r:UniformHelixCP3951Recipe)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft;
function parse(d:Draft){const values=Object.fromEntries(Object.entries(d).map(([k,v])=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error('请填写完整有限数值；没有自动回退或裁剪。');return [k,Number(v)];}));return validateUniformHelixCP3951Recipe(values);}

function MillimetrePlot({doc,guides,recipe}:{doc:Doc;guides:boolean;recipe:UniformHelixCP3951Recipe}){
 const graph=(doc.metadata!.materialTopology as {graph:FoldGraph}).graph,points=graph.vertices_coords,n=recipe.segments+1,
  rows=(doc.metadata!.originalUniformHelix3951 as {sourceFrames:UniformHelixCP3951Frame[]}).sourceFrames,reference=guides?rows.flatMap(row=>[row.base.map((x,i)=>x+row.leftDirector[i]) as Point,row.base.map((x,i)=>x+row.rightDirector[i]) as Point]):[],
  all=[...points,...reference,[0,0] as Point],minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxX=Math.max(...all.map(p=>p[0])),maxY=Math.max(...all.map(p=>p[1])),
  span=Math.max(maxX-minX,maxY-minY),unit=10**Math.floor(Math.log10(span/8)),step=[1,2,5,10].map(k=>k*unit).find(v=>v>=span/8)!,margin=span*.14,size=span*.025,labelSize=span*.045,stroke=span*.002,
  ticks=(a:number,b:number)=>Array.from({length:Math.floor(b/step)-Math.ceil(a/step)+1},(_,i)=>(Math.ceil(a/step)+i)*step),
  label=(x:number)=>Number(x.toPrecision(7)).toString(),xTicks=ticks(minX,maxX),yTicks=ticks(minY,maxY),rulerX=minX+span*.08,rulerY=maxY+margin*.68,
  chain=(start:number)=>points.slice(start,start+n).map(p=>p.join(',')).join(' '),refChain=(side:'Left'|'Right')=>rows.map(row=>row.base.map((x,i)=>x+row[side==='Left'?'leftDirector':'rightDirector'][i]).join(',')).join(' ');
 return <figure className="uniform3951-figure"><svg data-testid="uniform3951-mm-plot" viewBox={`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`} aria-label="原均匀螺旋毫米坐标、轴及实际两面纸域">
  <g className="uniform3951-grid" strokeWidth={stroke*.5}>{xTicks.map(x=><line key={'x'+x} x1={x} y1={minY} x2={x} y2={maxY}/>)}{yTicks.map(y=><line key={'y'+y} x1={minX} y1={y} x2={maxX} y2={y}/>)}</g>
  <g stroke="#8797a3" strokeWidth={stroke}><line x1={minX} y1={0} x2={maxX} y2={0}/><line x1={0} y1={minY} x2={0} y2={maxY}/></g>
  <g fill="#506170" fontSize={labelSize}>{xTicks.map(x=><text key={'x'+x} x={x} y={minY-margin*.32} textAnchor="middle">{label(x)}</text>)}{yTicks.map(y=><text key={'y'+y} x={minX-margin*.12} y={y+size*.3} textAnchor="end">{label(y)}</text>)}<text x={maxX} y={minY-margin*.65} textAnchor="end">X → / mm</text><text x={minX-margin*.65} y={maxY} textAnchor="middle" transform={`rotate(-90 ${minX-margin*.65} ${maxY})`}>Y ↓ / mm</text></g>
  {graph.faces_vertices!.map((f,i)=><polygon key={i} points={f.map(v=>points[v].join(',')).join(' ')} fill={i?'#dcebe7':'#e0e7f1'} stroke="none" opacity=".8"/>)}
  {guides&&<g data-testid="uniform3951-unit-reference" fill="none" stroke="#aa668e" strokeWidth={stroke} strokeDasharray={`${span*.013} ${span*.008}`}><polyline points={refChain('Left')}/><polyline points={refChain('Right')}/></g>}
  {doc.segments.map(s=><line key={s.id} data-source-segment={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.assignment==='B'?'#233243':'#246ab0'} strokeWidth={stroke*1.5} strokeDasharray={s.assignment==='U'?`${span*.007} ${span*.004}`:undefined}/>)}
  <polyline points={chain(0)} fill="none" stroke="#246ab0" strokeWidth={stroke*2}/><polyline points={chain(n)} fill="none" stroke="#c37435" strokeWidth={stroke*2}/><polyline points={chain(2*n)} fill="none" stroke="#2a7b69" strokeWidth={stroke*2}/>
  {[0,n-1].map(i=><g key={i} fill="#246ab0"><circle cx={points[i][0]} cy={points[i][1]} r={size*.6}/><text x={points[i][0]+(points[i][0]>(minX+maxX)/2?-size:size)} y={points[i][1]+(points[i][1]>(minY+maxY)/2?-size:labelSize*1.25)} textAnchor={points[i][0]>(minX+maxX)/2?'end':'start'} fontSize={labelSize}>{i?'终点':'起点'} u={label(i?recipe.parameterEnd:recipe.parameterStart)}</text></g>)}
  <g data-testid="uniform3951-mm-scale" stroke="#35475d" fill="#35475d" strokeWidth={stroke}><line x1={rulerX} y1={rulerY} x2={rulerX+step} y2={rulerY}/><line x1={rulerX} y1={rulerY-size*.4} x2={rulerX} y2={rulerY+size*.4}/><line x1={rulerX+step} y1={rulerY-size*.4} x2={rulerX+step} y2={rulerY+size*.4}/><text x={rulerX+step/2} y={rulerY-size*.65} stroke="none" fontSize={labelSize} textAnchor="middle">{label(step)} mm</text></g>
 </svg><figcaption><span>蓝 · 原曲线弦 U</span><span>橙 · 左纸边 B</span><span>绿 · 右纸边 B</span>{guides&&<span>紫虚线 · 原单位宽参考</span>}</figcaption><p>网格 {label(step)} mm · 1 原坐标单位 = 1 mm；显示仅改变视窗。</p></figure>;
}

export default function UniformHelixCP3951Dialog({initial,onClose,onAdoptCP}:{initial?:UniformHelixCP3951Recipe;onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean}){
 const [draft,setDraft]=useState<Draft>(()=>draftFor(initial??UNIFORM_HELIX_CP_3951_EXAMPLE)),[source,setSource]=useState<{key:string;build:(r:unknown)=>Doc}|null>(null),
  [busy,setBusy]=useState(false),[sourceError,setSourceError]=useState(''),[adoptError,setAdoptError]=useState(''),[guides,setGuides]=useState(false);
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(e){return {recipe:null,error:(e as Error).message};}},[draft]),
  sourceInput=useMemo(()=>{try{return parse({...draft,leftWidth:'1',rightWidth:'1'});}catch{return null;}},[draft.parameterStart,draft.parameterEnd,draft.segments]),
  sourceKey=sourceInput?JSON.stringify([sourceInput.parameterStart,sourceInput.parameterEnd,sourceInput.segments]):'invalid-source-input';
 useEffect(()=>{
  let cancelled=false;setSource(null);setSourceError('');setAdoptError('');
  if(!sourceInput){setBusy(false);return;}
  setBusy(true);const timer=setTimeout(()=>{try{const build=prepareUniformHelixCP3951Preview(sourceInput);
   if(!cancelled){setSource({key:sourceKey,build});setBusy(false);}
  }catch(e){if(!cancelled){setSourceError((e as Error).message);setBusy(false);}}},150);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[sourceKey]);
 const candidate=useMemo(()=>{if(!input.recipe||!source||source.key!==sourceKey)return {doc:null,error:'',buildMs:0};const start=performance.now();
  try{return {doc:source.build(input.recipe),error:'',buildMs:performance.now()-start};}catch(e){return {doc:null,error:(e as Error).message,buildMs:performance.now()-start};}
 },[input.recipe,source,sourceKey]),doc=candidate.doc,error=input.error||sourceError||candidate.error||adoptError,
  state=error?'error':busy||!doc?'checking':'ready',recipe=input.recipe,
  edit=(k:keyof Draft,v:string)=>{setAdoptError('');setDraft(d=>({...d,[k]:v}));},
  field=(k:keyof Draft,label:string,min:number,max:number,step:number)=><label className="uniform3951-field" key={k}><span>{label}</span><div>
   <input type="number" aria-label={label} value={draft[k]} min={min} max={max} step={step} onChange={e=>edit(k,e.target.value)}/>
   <input type="range" aria-label={label+'滑条'} value={Number.isFinite(Number(draft[k]))?Number(draft[k]):min} min={min} max={max} step={step} onChange={e=>edit(k,e.target.value)}/>
  </div></label>,
  adopt=()=>{if(!doc||state!=='ready'||!onAdoptCP)return;try{setAdoptError('');const adopted=structuredClone(doc);
   if(!uniformHelixCP3951SourceMatches(adopted))throw Error('当前纸域与原解析源绑定已变化，未采用。');if(onAdoptCP(adopted))onClose();
  }catch(e){setAdoptError((e as Error).message);}};
 return <TessDialog title="原均匀螺旋 · 解析两面纸域 CP" onClose={onClose}><div className="uniform3951-cp" data-testid="uniform3951-dialog">
  <div className="uniform3951-workspace"><aside className="uniform3951-controls"><p className="uniform3951-kicker">ORIGINAL IN[3951/3953] / UNIFORM HELIX</p>
   <h2>原单位纸宽，解析圆弧展开</h2><p>r = 1，θ = 30°，γ = 90°。原左右单位母线保持；右侧不翻转。</p>
   <div className="uniform3951-formula"><code>f(0) = (1, 0) · T(0) = (0, 1)</code><span>原零点初值 · 绝对函数裁域 → 1 : 1 mm</span></div>
   <div className="uniform3951-fields">{field('parameterStart','原角起点 u / rad',0,Math.PI,.01)}{field('parameterEnd','原角终点 u / rad',0,Math.PI,.01)}
    {field('leftWidth','左纸宽 / mm',.05,1,.01)}{field('rightWidth','右纸宽 / mm',.05,1,.01)}{field('segments','采样弦段数',16,128,1)}</div>
   <p className="uniform3951-focus">原左焦距 8/√30 ≈ 1.460593 mm；两侧单位宽 1 可保留。非法输入保持原值。</p>
   <p>起点改变只裁取原解析函数；不在当前起点重新设为 (1, 0)。默认 100 弦沿用原绘图密度。</p>
  </aside><section className="uniform3951-results">
   <div className="uniform3951-status" data-testid="uniform3951-status" data-state={state} data-build-ms={candidate.buildMs} data-source-key={sourceKey} data-current-widths={JSON.stringify([Number(draft.leftWidth),Number(draft.rightWidth)])}>
    <p role="status">{error||(state==='checking'?'正在构造原解析源与当前纸域…':`${recipe!.segments+1} 原点 / 轨 · ${doc!.segments.length} 真实边 · 2 个材料面`)}</p>
    {error?<p role="alert">未显示或采用失败候选。</p>:<p>{doc?'已核实际有限分区、材料身份及原毫米坐标。':'原解析圆弧与原单位母线；等待当前裁域核验。'}</p>}
   </div>
   <div className="uniform3951-plot-slot" data-testid="uniform3951-plot-slot">{doc&&recipe?<MillimetrePlot doc={doc} recipe={recipe} guides={guides}/>:<div className="uniform3951-placeholder">{state==='checking'?'等待本次解析源构造…':'当前参数未通过，未生成纸域。'}</div>}</div>
   <label className="uniform3951-reference"><input type="checkbox" aria-label="显示原单位宽参考" checked={guides} onChange={e=>setGuides(e.target.checked)}/>显示原单位宽参考（仅预览，不增加 CP 边）</label>
   <p>仅二维 CP · 曲线弦 U / 纸边 B。原常 γ 是连续源参考，未认证有限刚性三维、平折、层序或碰撞。</p>
  </section></div>
  <footer><span>采用后可编辑、保存和导出；源再生会恢复原 U/null。</span><button onClick={onClose}>关闭</button><button className="primary" disabled={!doc||state!=='ready'||!onAdoptCP} onClick={adopt}>仅采用原均匀螺旋 CP →</button></footer>
 </div></TessDialog>;
}
