import {useEffect,useMemo,useRef,useState} from 'react';
import {TessDialog} from './TessellationEditor';
import {UNIFORM_HELIX_MODE_DEFAULT,UNIFORM_HELIX_MODE_EXAMPLE,validateUniformHelixModeRecipe,prepareUniformHelixModePreview,uniformHelixModeSourceMatches,uniformHelixModeSourceKey,type UniformHelixGeneralCP3951Mode,type UniformHelixModeRecipe,type UniformHelixModeView} from '../app/uniformHelixGeneralCP3951Mode';
import type {Doc,Point,FoldGraph} from '../core/types';
import './UniformHelixGeneralCP3951Dialog.css';
type Draft=Record<keyof UniformHelixModeRecipe,string>;
const draftFor=(r:UniformHelixModeRecipe)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft,
 parse=(mode:UniformHelixGeneralCP3951Mode,d:Draft)=>validateUniformHelixModeRecipe(mode,Object.fromEntries(Object.entries(d).map(([k,v])=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error('请填写八个有限数值；没有自动回退或裁剪。');return [k,Number(v)];}))),
 label=(x:number)=>Number(x.toPrecision(7)).toString();
function WorldPlot({source,doc,guides}:{source:UniformHelixModeView;doc:Doc|null;guides:boolean}){
 const plot=useRef<SVGSVGElement>(null),[size,setSize]=useState({w:640,h:360});
 useEffect(()=>{const el=plot.current;if(!el)return;const observer=new ResizeObserver(([entry])=>{const {width:w,height:h}=entry.contentRect;if(w>0&&h>0)setSize(old=>old.w===w&&old.h===h?old:{w,h});});observer.observe(el);return()=>observer.disconnect();},[]);
 const rows=source.frames,graph=doc?(doc.metadata!.materialTopology as {graph:FoldGraph}).graph:null,
  reference=guides?rows.flatMap(f=>[f.base.map((x,i)=>x+f.leftDirector[i]) as Point,f.base.map((x,i)=>x+f.rightDirector[i]) as Point]):[],
  points=[...(graph?.vertices_coords??rows.map(f=>f.base)),...reference,[0,0] as Point],
  minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1])),span=Math.max(maxX-minX,maxY-minY),
  unit=10**Math.floor(Math.log10(span/7)),step=[1,2,5,10].map(k=>k*unit).find(x=>x>=span/7)??unit,
  margin=span*.14,stroke=span*.002,decoration=span*.04,font=12.1/Math.min(size.w/(maxX-minX+2*margin),size.h/(maxY-minY+2*margin)),
  ticks=(a:number,b:number)=>Array.from({length:Math.min(14,Math.max(0,Math.floor(b/step)-Math.ceil(a/step)+1))},(_,i)=>(Math.ceil(a/step)+i)*step),
  ref=(side:'leftDirector'|'rightDirector')=>rows.map(f=>f.base.map((x,i)=>x+f[side][i]).join(',')).join(' ');
 if(!(span>0)||![span,step,minX-margin,minY-margin,maxX+margin,maxY+margin].every(Number.isFinite))return <div className="uniform-general-placeholder">原源坐标已计算；当前视窗跨度不可表示。</div>;
 const start=rows[0],end=rows.at(-1)!,rulerX=minX+span*.06,rulerY=maxY+margin*.62;
 return <figure className="uniform-general-figure"><svg ref={plot} data-testid="uniform-general-mm-plot" viewBox={`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`} aria-label="原通用均匀螺旋毫米世界坐标与实际两面纸域">
  <g className="uniform-general-grid" strokeWidth={stroke*.5}>{ticks(minX,maxX).map(x=><line key={'x'+x} x1={x} y1={minY} x2={x} y2={maxY}/>)}{ticks(minY,maxY).map(y=><line key={'y'+y} x1={minX} y1={y} x2={maxX} y2={y}/>)}</g>
  <g stroke="#8493a2" strokeWidth={stroke}><line x1={minX} y1={0} x2={maxX} y2={0}/><line x1={0} y1={minY} x2={0} y2={maxY}/></g>
  <g fill="#526270" fontSize={font}>{ticks(minX,maxX).map(x=><text key={'x'+x} x={x} y={minY-margin*.3} textAnchor="middle">{label(x)}</text>)}{ticks(minY,maxY).map(y=><text key={'y'+y} x={minX-margin*.12} y={y+font*.3} textAnchor="end">{label(y)}</text>)}
   <text x={maxX} y={minY-margin*.65} textAnchor="end">X / mm</text><text x={minX-margin*.66} y={maxY} textAnchor="middle" transform={`rotate(-90 ${minX-margin*.66} ${maxY})`}>Y / mm</text></g>
  {graph?.faces_vertices?.map((f,i)=><polygon key={i} points={f.map(v=>graph.vertices_coords[v].join(',')).join(' ')} fill={i?'#d4e8e2':'#dbe4ef'} opacity=".85"/>)}
  {guides&&<g data-testid="uniform-general-unit-reference" fill="none" stroke="#946881" strokeWidth={stroke} strokeDasharray={`${span*.01} ${span*.006}`}><polyline points={ref('leftDirector')}/><polyline points={ref('rightDirector')}/></g>}
  {doc?.segments.map(s=><line key={s.id} data-source-segment={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.assignment==='B'?'#273947':'#2873ab'} strokeWidth={stroke*1.5} strokeDasharray={s.assignment==='U'?`${span*.006} ${span*.004}`:undefined}/>)}
  <polyline points={rows.map(f=>f.base.join(',')).join(' ')} fill="none" stroke="#2873ab" strokeWidth={stroke*2}/>
  {[start,end].map((f,i)=><g key={i} fill="#2873ab"><circle cx={f.base[0]} cy={f.base[1]} r={decoration*.35}/><text x={f.base[0]+(f.base[0]>(minX+maxX)/2?-font*.5:font*.5)} y={f.base[1]+(f.base[1]>(minY+maxY)/2?-font*.5:font*1.2)} textAnchor={f.base[0]>(minX+maxX)/2?'end':'start'} fontSize={font}>{i?'终点':'起点'} u={label(f.u)}</text></g>)}
  <g data-testid="uniform-general-mm-scale" stroke="#344a5a" fill="#344a5a" strokeWidth={stroke}><line x1={rulerX} y1={rulerY} x2={rulerX+step} y2={rulerY}/><line x1={rulerX} y1={rulerY-decoration*.25} x2={rulerX} y2={rulerY+decoration*.25}/><line x1={rulerX+step} y1={rulerY-decoration*.25} x2={rulerX+step} y2={rulerY+decoration*.25}/><text x={rulerX+step/2} y={rulerY-font*.45} stroke="none" fontSize={font} textAnchor="middle">{label(step)} mm</text></g>
 </svg><figcaption><span>蓝 · 原曲线 U</span><span>纸边 B · 两个真实面</span>{guides&&<span>紫虚线 · 原单位宽参考</span>}</figcaption><p>{doc?'当前有限 CP':'原源轨迹参考，尚无可采用 CP'} · 1 原世界单位 = 1 mm；视窗不改世界点。</p></figure>;
}
export default function UniformHelixGeneralCP3951Dialog({initial,initialMode=UNIFORM_HELIX_MODE_DEFAULT,onClose,onAdoptCP}:{initial?:UniformHelixModeRecipe;initialMode?:UniformHelixGeneralCP3951Mode;onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean}){
 const [mode,setMode]=useState<UniformHelixGeneralCP3951Mode>(initialMode),[draft,setDraft]=useState<Draft>(()=>draftFor(initial??UNIFORM_HELIX_MODE_EXAMPLE)),[snapshot,setSnapshot]=useState<{key:string;view:UniformHelixModeView;build:(r:unknown)=>Doc}|null>(null),
  [busy,setBusy]=useState(false),[sourceError,setSourceError]=useState(''),[sourceErrorCode,setSourceErrorCode]=useState(''),[adoptError,setAdoptError]=useState(''),[guides,setGuides]=useState(false),
  input=useMemo(()=>{try{return {recipe:parse(mode,draft),error:'',code:''};}catch(e){return {recipe:null,error:(e as Error).message,code:(e as {code?:string}).code??'SOURCE_INPUT'};}},[mode,draft]),
  sourceInput=useMemo(()=>{try{return parse(mode,{...draft,leftWidth:'1',rightWidth:'1'});}catch{return null;}},[mode,draft.radius,draft.helicityAngleDeg,draft.foldAngleDeg,draft.parameterStart,draft.parameterEnd,draft.segments]),
  sourceKey=sourceInput?uniformHelixModeSourceKey(mode,sourceInput):'invalid-source:'+mode;
 useEffect(()=>{let cancelled=false;setSnapshot(null);setSourceError('');setSourceErrorCode('');setAdoptError('');if(!sourceInput){setBusy(false);return;}
  setBusy(true);const timer=setTimeout(()=>{try{const prepared=prepareUniformHelixModePreview(mode,sourceInput);if(!cancelled){setSnapshot(prepared);setBusy(false);}}catch(e){if(!cancelled){setSourceError((e as Error).message);setSourceErrorCode((e as {code?:string}).code??'NUMERIC_SOURCE');setBusy(false);}}},150);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[sourceKey]);
 const candidate=useMemo(()=>{if(!snapshot||snapshot.key!==sourceKey||!input.recipe)return {doc:null,error:'',code:'',buildMs:0};const t=performance.now();try{return {doc:snapshot.build(input.recipe),error:'',code:'',buildMs:performance.now()-t};}
  catch(e){return {doc:null,error:(e as Error).message,code:(e as {code?:string}).code??'',buildMs:performance.now()-t};}},[snapshot,sourceKey,input.recipe]),
  error=input.error||sourceError||candidate.error||adoptError,state=error?'error':busy||!candidate.doc?'checking':'ready',source=snapshot?.key===sourceKey?snapshot.view:null,
  edit=(k:keyof Draft,v:string)=>{setAdoptError('');setDraft(d=>({...d,[k]:v}));},
  field=(k:keyof Draft,title:string,min?:number,max?:number,step:number|'any'='any')=><label className="uniform-general-field" key={k}><span>{title}</span><input type="number" aria-label={title} value={draft[k]} min={min} max={max} step={step} onChange={e=>edit(k,e.target.value)}/></label>,
  adopt=()=>{if(!candidate.doc||state!=='ready'||!onAdoptCP)return;try{const doc=structuredClone(candidate.doc);setAdoptError('');if(!uniformHelixModeSourceMatches(mode,doc))throw Error('当前模式、原源与真实纸域绑定已变化，未采用。');if(onAdoptCP(doc))onClose();else setAdoptError('主工作区未采用；当前参数保留。');}catch(e){setAdoptError((e as Error).message);}},
  focusLabel=source?.positiveFocusSide==='none'?'横向焦点':source?.positiveFocusSide==='right'?'右焦距':'左焦距',focusValue=source?.positiveFocusSide==='right'?source.rightFocusMm:source?.leftFocusMm,
  focusDisplay=!source?'—':source.positiveFocusSide==='none'?(source.explicitPiContinuation?'直线 · 无焦点':'纸域退化'):focusValue!==null&&focusValue!==undefined?label(focusValue)+' mm':source.focusOverflows?'超 double 表示':'—',
  radiusDisplay=!source?'—':source.circleRadiusMm!==null?label(source.circleRadiusMm)+' mm':source.explicitPiContinuation?'直线解析延续':'超 double；世界点可计算';
 return <TessDialog title="原均匀螺旋 · r / θ / γ 通用两面 CP" onClose={onClose}><div className="uniform-general-cp" data-testid="uniform-general-dialog" data-source-mode={mode}>
  <div className="uniform-general-workspace"><aside className="uniform-general-controls"><p className="uniform-general-kicker">ORIGINAL IN[3951] / EXPLICIT SOURCE MODE</p><h2>三个源参数，原坐标展开</h2>
   <label className="uniform-general-mode"><span>源模式</span><select aria-label="均匀螺旋源模式" value={mode} onChange={e=>{setAdoptError('');setMode(e.target.value as UniformHelixGeneralCP3951Mode);}}><option value="principal-v1">v1 · 保留原主分支工程</option><option value="literal-extended-v2">v2 · 原 literal 扩展 / π 新增延续</option></select></label>
   <p>{mode==='principal-v1'?'v1：r>0 · −90°<θ<90° · 0°<γ<180°；旧工程重建仍为 v1。':'v2：raw θ / γ 保留，原 literal 与原假设、新增 π 延续分别标明。'}原两侧单位母线不随半径缩放。</p>
   <div className="uniform-general-formula"><code>f(0) = (1, 0) · 原绝对函数</code><span>当前起点仅裁域，不重新 seed · 1 : 1 mm</span></div>
   <div className="uniform-general-fields">{field('radius','半径 r / mm',0)}{field('helicityAngleDeg','螺旋角 θ / °',mode==='principal-v1'?-90:undefined,mode==='principal-v1'?90:undefined)}{field('foldAngleDeg','折角 γ / °',mode==='principal-v1'?0:undefined,mode==='principal-v1'?180:undefined)}{field('segments','采样弦段数',16,128,1)}
    {field('parameterStart','原角起点 u / rad')}{field('parameterEnd','原角终点 u / rad')}{field('leftWidth','左内切宽 / mm',0,1)}{field('rightWidth','右内切宽 / mm',0,1)}</div>
   <div className="uniform-general-metrics"><span>{focusLabel}<strong data-testid="uniform-general-focus-value">{focusDisplay}</strong></span><span>有符号展开半径<strong>{radiusDisplay}</strong></span></div>
   <p className="uniform-general-focus">{source?.focusText??'焦点与合法纸域按当前源计算；未自动内切。'}宽度可为任意正内切值，失败输入原样保留。</p>
   <p>{source?.explicitPiContinuation?'π 解析延续为仿射直线，允许任意有限递增 u 裁域，仍须核验当前有限图与材料接口。':'非零 K 的有限纸域须少于一个圆周；原 source 可取更长裁域作参考。'}粗图真实交叉会拒绝，合法凹分区可采用。</p>
  </aside><section className="uniform-general-results">
   <div className="uniform-general-status" data-testid="uniform-general-status" data-state={state} data-error-code={input.code||sourceErrorCode||candidate.code} data-build-ms={candidate.buildMs} data-source-key={sourceKey}>
    <p role="status">{error||(state==='checking'?'正在计算原解析源与当前纸域…':`${input.recipe!.segments+1} 点 / 轨 · ${candidate.doc!.segments.length} 真实边 · 2 个材料面`)}</p>
    {source&&<p data-testid="uniform-general-source-classification" data-source-classification={source.classification}>{source.classificationText}</p>}
    {!error&&source?<p>平面世界坐标工程误差估计 {label(source.worldErrorEstimateMm)} mm；不是区间认证。</p>:<p>{source?'原 source 已计算；当前纸域尚不可采用。':'原解析源与材料采用分开核验，未修改输入。'}</p>}
   </div>
   <div className="uniform-general-plot-slot" data-testid="uniform-general-plot-slot">{source?<WorldPlot source={source} doc={candidate.doc} guides={guides}/>:<div className="uniform-general-placeholder">{busy?'等待本次解析源…':'请填写当前选择的源模式参数。'}</div>}</div>
   <label className="uniform-general-reference"><input type="checkbox" aria-label="显示原单位宽参考" checked={guides} onChange={e=>setGuides(e.target.checked)}/>显示原单位宽参考（仅预览，不增加 CP 边）</label>
   <p>只采用二维 CP：曲线 U/null、纸边 B/0。未认证有限刚性三维、平折层序或碰撞。</p>
  </section></div>
  <footer><span>完整源参数随工程保存；源再生恢复 U/null。</span><button onClick={onClose}>关闭</button><button className="primary" disabled={!candidate.doc||state!=='ready'||!onAdoptCP} onClick={adopt}>仅采用原通用均匀螺旋 CP →</button></footer>
 </div></TessDialog>;
}
