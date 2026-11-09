import {useEffect,useMemo,useRef,useState} from 'react';
import {TessDialog} from './TessellationEditor';
import {SPIRAL_REFOLD_CP_3980_EXAMPLE,validateSpiralRefoldCP3980Recipe,prepareSpiralRefoldCP3980Preview,spiralRefoldCP3980SourceMatches,
 type SpiralRefoldCP3980Recipe,type SpiralRefoldCP3980Frame,type SpiralRefoldCP3980ReferenceFrame} from '../app/spiralRefoldCP3980';
import type {Doc,Point,FoldGraph} from '../core/types';
import './SpiralRefoldCP3980Dialog.css';
type Draft=Record<keyof SpiralRefoldCP3980Recipe,string>;
const draftFor=(r:SpiralRefoldCP3980Recipe)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft;
function parse(d:Draft){const values=Object.fromEntries(Object.entries(d).map(([k,v])=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error('请填写完整有限数值；没有自动回退或裁剪。');return [k,Number(v)];}));return validateSpiralRefoldCP3980Recipe(values);}

function MillimetrePlot({doc,guides,recipe}:{doc:Doc;guides:boolean;recipe:SpiralRefoldCP3980Recipe}){
 const graph=(doc.metadata!.materialTopology as {graph:FoldGraph}).graph,points=graph.vertices_coords,n=recipe.segments+1,
  rows=(doc.metadata!.originalSpiralRefold3980 as {sourceFrames:SpiralRefoldCP3980Frame[]}).sourceFrames,reference=guides?rows.flatMap(row=>[row.base.map((x,i)=>x+row.leftDirector[i]) as Point,row.base.map((x,i)=>x+row.rightDirector[i]) as Point]):[],
  all=[...points,...reference,[0,0] as Point],minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxX=Math.max(...all.map(p=>p[0])),maxY=Math.max(...all.map(p=>p[1])),
  span=Math.max(maxX-minX,maxY-minY),unit=10**Math.floor(Math.log10(span/8)),step=[1,2,5,10].map(k=>k*unit).find(v=>v>=span/8)!,margin=span*.14,size=span*.025,labelSize=span*.045,stroke=span*.002,
  ticks=(a:number,b:number)=>Array.from({length:Math.floor(b/step)-Math.ceil(a/step)+1},(_,i)=>(Math.ceil(a/step)+i)*step),
  label=(x:number)=>Number(x.toPrecision(7)).toString(),xTicks=ticks(minX,maxX),yTicks=ticks(minY,maxY),rulerX=minX+span*.08,rulerY=maxY+margin*.68,
  chain=(start:number)=>points.slice(start,start+n).map(p=>p.join(',')).join(' '),refChain=(side:'Left'|'Right')=>rows.map(row=>row.base.map((x,i)=>x+row[side==='Left'?'leftDirector':'rightDirector'][i]).join(',')).join(' ');
 return <figure className="refold3980-figure"><svg data-testid="refold3980-mm-plot" viewBox={`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`} aria-label="原展开再折回毫米坐标、轴及实际两面纸域">
  <g className="refold3980-grid" strokeWidth={stroke*.5}>{xTicks.map(x=><line key={'x'+x} x1={x} y1={minY} x2={x} y2={maxY}/>)}{yTicks.map(y=><line key={'y'+y} x1={minX} y1={y} x2={maxX} y2={y}/>)}</g>
  <g stroke="#8797a3" strokeWidth={stroke}><line x1={minX} y1={0} x2={maxX} y2={0}/><line x1={0} y1={minY} x2={0} y2={maxY}/></g>
  <g fill="#506170" fontSize={labelSize}>{xTicks.map(x=><text key={'x'+x} x={x} y={minY-margin*.32} textAnchor="middle">{label(x)}</text>)}{yTicks.map(y=><text key={'y'+y} x={minX-margin*.12} y={y+size*.3} textAnchor="end">{label(y)}</text>)}<text x={maxX} y={minY-margin*.65} textAnchor="end">X → / mm</text><text x={minX-margin*.65} y={maxY} textAnchor="middle" transform={`rotate(-90 ${minX-margin*.65} ${maxY})`}>Y ↓ / mm</text></g>
  {graph.faces_vertices!.map((f,i)=><polygon key={i} points={f.map(v=>points[v].join(',')).join(' ')} fill={i?'#dcebe7':'#e0e7f1'} stroke="none" opacity=".8"/>)}
  {guides&&<g data-testid="refold3980-unit-reference" fill="none" stroke="#aa668e" strokeWidth={stroke} strokeDasharray={`${span*.013} ${span*.008}`}><polyline points={refChain('Left')}/><polyline points={refChain('Right')}/></g>}
  {doc.segments.map(s=><line key={s.id} data-source-segment={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.assignment==='B'?'#233243':'#246ab0'} strokeWidth={stroke*1.5} strokeDasharray={s.assignment==='U'?`${span*.007} ${span*.004}`:undefined}/>)}
  <polyline points={chain(0)} fill="none" stroke="#246ab0" strokeWidth={stroke*2}/><polyline points={chain(n)} fill="none" stroke="#c37435" strokeWidth={stroke*2}/><polyline points={chain(2*n)} fill="none" stroke="#2a7b69" strokeWidth={stroke*2}/>
  {[0,n-1].map(i=><g key={i} fill="#246ab0"><circle cx={points[i][0]} cy={points[i][1]} r={size*.6}/><text x={points[i][0]+(points[i][0]>(minX+maxX)/2?-size:size)} y={points[i][1]+(points[i][1]>(minY+maxY)/2?-size:labelSize*1.25)} textAnchor={points[i][0]>(minX+maxX)/2?'end':'start'} fontSize={labelSize}>{i?'终点':'起点'} u={label(i?recipe.parameterEnd:recipe.parameterStart)}</text></g>)}
  <g data-testid="refold3980-mm-scale" stroke="#35475d" fill="#35475d" strokeWidth={stroke}><line x1={rulerX} y1={rulerY} x2={rulerX+step} y2={rulerY}/><line x1={rulerX} y1={rulerY-size*.4} x2={rulerX} y2={rulerY+size*.4}/><line x1={rulerX+step} y1={rulerY-size*.4} x2={rulerX+step} y2={rulerY+size*.4}/><text x={rulerX+step/2} y={rulerY-size*.65} stroke="none" fontSize={labelSize} textAnchor="middle">{label(step)} mm</text></g>
 </svg><figcaption><span>蓝 · 原曲线弦 U</span><span>橙 · 左纸边 B</span><span>绿 · 右纸边 B</span>{guides&&<span>紫虚线 · 原单位宽参考</span>}</figcaption><p>网格 {label(step)} mm · 1 原坐标单位 = 1 mm；显示仅改变视窗。</p></figure>;
}

type View='flat'|'source'|'refolded';
function SpaceReferencePlot({doc,recipe,recovered}:{doc:Doc;recipe:SpiralRefoldCP3980Recipe;recovered:boolean}){
 const [azimuth,setAzimuth]=useState(-35),[elevation,setElevation]=useState(28),[zoom,setZoom]=useState(1),svgRef=useRef<SVGSVGElement>(null),
  pointer=useRef<{id:number;x:number;y:number;azimuth:number;elevation:number}|null>(null);
 useEffect(()=>{const svg=svgRef.current;if(!svg)return;const wheel=(e:WheelEvent)=>{e.preventDefault();setZoom(z=>Math.max(.2,Math.min(8,z*Math.exp(-e.deltaY*.0015))));};
  svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);},[]);
 const rows=(doc.metadata!.originalSpiralRefold3980 as {continuousReference:{frames:SpiralRefoldCP3980ReferenceFrame[]}}).continuousReference.frames,
  project=(p:number[]):Point=>{const az=azimuth*Math.PI/180,el=elevation*Math.PI/180,x=Math.cos(az)*p[0]-Math.sin(az)*p[1],depth=Math.sin(az)*p[0]+Math.cos(az)*p[1];return [x,-Math.sin(el)*depth+Math.cos(el)*p[2]];},
  base=rows.map(r=>r[recovered?'recoveredBase':'sourceBase']),
  left=rows.map((r,i)=>base[i].map((x,k)=>x+recipe.leftWidth*r[recovered?'recoveredLeftDirector':'sourceLeftDirector'][k])),
  right=rows.map((r,i)=>base[i].map((x,k)=>x+recipe.rightWidth*r[recovered?'recoveredRightDirector':'sourceRightDirector'][k])),
  tracks=[base,left,right].map(ps=>ps.map(project)),world=[...base,...left,...right],worldSpan=Math.max(...[0,1,2].map(k=>Math.max(...world.map(p=>p[k]))-Math.min(...world.map(p=>p[k])))),unit=10**Math.floor(Math.log10(worldSpan/3)),axisStep=[1,2,5,10].map(k=>k*unit).find(v=>v>=worldSpan/3)!,
  axisOrigin=project([0,0,0]),axisEnds=[0,1,2].map(k=>project([0,1,2].map(j=>j===k?axisStep:0))),
  all=[...tracks.flat(),axisOrigin,...axisEnds],minX=Math.min(...all.map(p=>p[0])),maxX=Math.max(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxY=Math.max(...all.map(p=>p[1])),span=Math.max(maxX-minX,maxY-minY),pad=span*.15,
  width=(maxX-minX+2*pad)/zoom,height=(maxY-minY+2*pad)/zoom,cx=(minX+maxX)/2,cy=(minY+maxY)/2,
  chain=(ps:Point[])=>ps.map(p=>p.join(',')).join(' '),reset=()=>{pointer.current=null;setAzimuth(-35);setElevation(28);setZoom(1);};
 return <figure className="refold3980-figure refold3980-space-figure"><div className="refold3980-space-toolbar"><span>拖动旋转 · 滚轮缩放</span><button type="button" onClick={reset}>复位三维视图</button></div>
  <svg ref={svgRef} data-testid={recovered?'refold3980-continuous-refold':'refold3980-continuous-source'} data-view-azimuth={azimuth} data-view-elevation={elevation} data-view-zoom={zoom} data-mm-axis-step={axisStep}
   viewBox={`${cx-width/2} ${cy-height/2} ${width} ${height}`} aria-label={recovered?'当前中点恢复的连续空间参考；不参与 CP 采用':'原连续空间螺旋参考；不参与 CP 采用'}
   onPointerDown={e=>{if(e.button!==0)return;pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY,azimuth,elevation};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMove={e=>{const p=pointer.current;if(!p||p.id!==e.pointerId)return;setAzimuth(p.azimuth+(e.clientX-p.x)*.45);setElevation(Math.max(-85,Math.min(85,p.elevation-(e.clientY-p.y)*.45)));}}
   onPointerUp={e=>{pointer.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{pointer.current=null;}}>
   {[1,2].map((side)=><polygon key={side} points={chain([...tracks[0],...tracks[side].slice().reverse()])} fill={side===1?'#e0e7f1':'#dcebe7'} opacity=".8"/>)}
   {tracks.map((ps,i)=><polyline key={i} points={chain(ps)} fill="none" stroke={['#246ab0','#c37435','#2a7b69'][i]} strokeWidth={span*.004/zoom}/>)}
   <g stroke="#8390a0" strokeWidth={span*.0015/zoom} strokeDasharray={`${span*.01/zoom} ${span*.007/zoom}`}>{rows.map((_,i)=>i===rows.length-1||i%Math.max(1,Math.floor(rows.length/10))===0?<g key={i}>{[1,2].map(side=><line key={side} x1={tracks[0][i][0]} y1={tracks[0][i][1]} x2={tracks[side][i][0]} y2={tracks[side][i][1]}/>)}</g>:null)}</g>
   <g data-testid="refold3980-space-mm-axes" strokeWidth={span*.002/zoom} fontSize={span*.06/zoom}>{axisEnds.map((end,k)=><g key={k} stroke={['#a43e38','#45845a','#4267a0'][k]} fill={['#a43e38','#45845a','#4267a0'][k]}><line x1={axisOrigin[0]} y1={axisOrigin[1]} x2={end[0]} y2={end[1]}/><circle cx={end[0]} cy={end[1]} r={span*.006/zoom}/><text x={end[0]+span*.015/zoom} y={end[1]-span*.02/zoom} stroke="none">{['X','Y','Z'][k]} {Number(axisStep.toPrecision(7))} mm</text></g>)}<text x={axisOrigin[0]} y={axisOrigin[1]+span*.06/zoom} fill="#35475d" stroke="none">0</text></g>
   <circle cx={tracks[0][0][0]} cy={tracks[0][0][1]} r={span*.012/zoom} fill="#246ab0"/>
  </svg><figcaption><span>蓝 · 连续空间折痕</span><span>橙 / 绿 · 原左右单位母线带</span></figcaption><p>{recovered?'In[3977] 当前中点初值 + Frenet 解析恢复':'In[3959] 原保存螺旋与可展母线'} · 仅投影预览，不是有限刚性折形。</p></figure>;
}

export default function SpiralRefoldCP3980Dialog({initial,onClose,onAdoptCP}:{initial?:SpiralRefoldCP3980Recipe;onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean}){
 const [draft,setDraft]=useState<Draft>(()=>draftFor(initial??SPIRAL_REFOLD_CP_3980_EXAMPLE)),[source,setSource]=useState<{key:string;build:(r:unknown)=>Doc}|null>(null),
  [busy,setBusy]=useState(false),[sourceError,setSourceError]=useState(''),[adoptError,setAdoptError]=useState(''),[guides,setGuides]=useState(false),[view,setView]=useState<View>('flat');
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(e){return {recipe:null,error:(e as Error).message};}},[draft]),
  sourceInput=useMemo(()=>{try{return parse({...draft,leftWidth:'1',rightWidth:'1'});}catch{return null;}},[draft.parameterStart,draft.parameterEnd,draft.segments]),
  sourceKey=sourceInput?JSON.stringify([sourceInput.parameterStart,sourceInput.parameterEnd,sourceInput.segments]):'invalid-source-input';
 useEffect(()=>{
  let cancelled=false;setSource(null);setSourceError('');setAdoptError('');
  if(!sourceInput){setBusy(false);return;}
  setBusy(true);const timer=setTimeout(()=>{try{const build=prepareSpiralRefoldCP3980Preview(sourceInput);
   if(!cancelled){setSource({key:sourceKey,build});setBusy(false);}
  }catch(e){if(!cancelled){setSourceError((e as Error).message);setBusy(false);}}},150);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[sourceKey]);
 const candidate=useMemo(()=>{if(!input.recipe||!source||source.key!==sourceKey)return {doc:null,error:'',buildMs:0};const start=performance.now();
  try{return {doc:source.build(input.recipe),error:'',buildMs:performance.now()-start};}catch(e){return {doc:null,error:(e as Error).message,buildMs:performance.now()-start};}
 },[input.recipe,source,sourceKey]),doc=candidate.doc,error=input.error||sourceError||candidate.error||adoptError,
  state=error?'error':busy||!doc?'checking':'ready',recipe=input.recipe,
  edit=(k:keyof Draft,v:string)=>{setAdoptError('');setDraft(d=>({...d,[k]:v}));},
  field=(k:keyof Draft,label:string,min:number,max:number,step:number)=><label className="refold3980-field" key={k}><span>{label}</span><div>
   <input type="number" aria-label={label} value={draft[k]} min={min} max={max} step={step} onChange={e=>edit(k,e.target.value)}/>
   <input type="range" aria-label={label+'滑条'} value={Number.isFinite(Number(draft[k]))?Number(draft[k]):min} min={min} max={max} step={step} onChange={e=>edit(k,e.target.value)}/>
  </div></label>,
  adopt=()=>{if(!doc||state!=='ready'||!onAdoptCP)return;try{setAdoptError('');const adopted=structuredClone(doc);
   if(!spiralRefoldCP3980SourceMatches(adopted))throw Error('当前纸域与原展开源绑定已变化，未采用。');if(onAdoptCP(adopted))onClose();
  }catch(e){setAdoptError((e as Error).message);}};
 return <TessDialog title="原螺旋展开再折回 · 两面纸域 CP" onClose={onClose}><div className="refold3980-cp" data-testid="refold3980-dialog">
  <div className="refold3980-workspace"><aside className="refold3980-controls"><p className="refold3980-kicker">ORIGINAL IN[3980] / UNFOLD &amp; REFOLD</p>
   <h2>原单位纸宽，展开再折回</h2><p>r = 1，θ = 30°，γ(u) = 120° − 60°u/π。原两侧单位宽可保留，右母线不翻转。</p>
   <div className="refold3980-formula"><code>f(u₀) = (1, 0) · T(u₀) = (0, 1)</code><span>当前起点二维初值 · 原坐标 → 1 : 1 mm</span></div>
   <div className="refold3980-fields">{field('parameterStart','原角起点 u / rad',0,Math.PI,.01)}{field('parameterEnd','原角终点 u / rad',0,Math.PI,.01)}
    {field('leftWidth','左纸宽 / mm',.05,1,.01)}{field('rightWidth','右纸宽 / mm',.05,1,.01)}{field('segments','采样弦段数',16,128,1)}</div>
   <p className="refold3980-focus">原两侧单位宽 1 有全域纸域证明；当前材料仍逐分区严格核验，不移动端点。</p>
   <p>改变起点会重设二维初值；折回从当前区间中点恢复。100 弦与原 128 插值点分开。</p>
  </aside><section className="refold3980-results">
   <div className="refold3980-status" data-testid="refold3980-status" data-state={state} data-build-ms={candidate.buildMs} data-source-key={sourceKey} data-current-widths={JSON.stringify([Number(draft.leftWidth),Number(draft.rightWidth)])}>
    <p role="status">{error||(state==='checking'?'正在构造当前初值、原展开源与纸域…':`${recipe!.segments+1} 原点 / 轨 · ${doc!.segments.length} 真实边 · 2 个材料面`)}</p>
    {error?<p role="alert">未显示或采用失败候选。</p>:<p>{doc?'已核实际有限分区、材料身份及原毫米坐标。':'原变量折角源与原单位母线；等待当前裁域核验。'}</p>}
   </div>
   <div className="refold3980-plot-slot" data-testid="refold3980-plot-slot"><nav className="refold3980-tabs" aria-label="原构造链参考页">{([['flat','二维纸域 CP'],['source','原连续空间'],['refolded','中点连续折回']] as const).map(([v,label])=><button key={v} type="button" aria-pressed={view===v} onClick={()=>setView(v)}>{label}</button>)}</nav>{doc&&recipe?(view==='flat'?<MillimetrePlot doc={doc} recipe={recipe} guides={guides}/>:<SpaceReferencePlot doc={doc} recipe={recipe} recovered={view==='refolded'}/>):<div className="refold3980-placeholder">{state==='checking'?'等待本次原源构造…':'当前参数未通过，未生成纸域。'}</div>}</div>
   <label className="refold3980-reference"><input type="checkbox" aria-label="显示原单位宽参考" checked={guides} onChange={e=>setGuides(e.target.checked)}/>显示原单位宽参考（仅预览，不增加 CP 边）</label>
   <p>仅二维 CP · 曲线弦 U / 纸边 B。变量 γ 与空间折回是连续参考，未复现 Wolfram 插值或认证有限三维、平折、层序。</p>
  </section></div>
  <footer><span>采用后可编辑、保存和导出；源再生会恢复原 U/null。</span><button onClick={onClose}>关闭</button><button className="primary" disabled={!doc||state!=='ready'||!onAdoptCP} onClick={adopt}>仅采用原展开再折回 CP →</button></footer>
 </div></TessDialog>;
}
