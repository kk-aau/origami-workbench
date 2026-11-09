import {useEffect,useMemo,useRef,useState} from 'react';
import {TessDialog} from './TessellationEditor';
import {LINKED_BANDS_PLANAR_CP_4086_EXAMPLE,validateLinkedBandsPlanarCP4086Recipe,prepareLinkedBandsPlanarCP4086Preview,linkedBandsPlanarCP4086SourceMatches,type LinkedBandsPlanarCP4086Recipe,type LinkedBandsPlanarCP4086Source} from '../app/linkedBandsPlanarCP4086';
import type {Doc} from '../core/types';
import './LinkedBandsPlanarCP4086Dialog.css';
type Draft=Record<keyof LinkedBandsPlanarCP4086Recipe,string>;
const fields:[keyof LinkedBandsPlanarCP4086Recipe,string,string][]=[['radius','初始半径','原单位'],['bandSpacing','相邻带距','原单位'],['perturbation','首带参数扰动','rad'],['firstFoldAngleDeg','源初始折角','°'],['parameterStart','裁域起点 s','rad'],['parameterEnd','裁域终点 s','rad'],['bands','相邻带数','2–4'],['segments','每条曲线弦数','8–128'],['interpolationIntervals','本地插值区间','8–64'],['unitSizeMm','原单位长度','mm']];
const draftOf=(r:LinkedBandsPlanarCP4086Recipe)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)])) as Draft,
 decimal=(s:string)=>{if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s.trim())||!Number.isFinite(Number(s)))throw Error('请填写有限十进制数值；不会执行表达式或自动补默认值。');return Number(s);},
 parse=(d:Draft)=>validateLinkedBandsPlanarCP4086Recipe(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,decimal(v)]))),
 label=(x:number)=>Number(x.toPrecision(5)).toString(),sourceKey=(r:LinkedBandsPlanarCP4086Recipe)=>JSON.stringify(Object.entries(r).filter(([k])=>k!=='unitSizeMm'));
function WorldPlot({doc,current}:{doc:Doc;current:boolean}){
 const svg=useRef<SVGSVGElement>(null),[size,setSize]=useState({w:660,h:460}),[view,setView]=useState({zoom:1,x:0,y:0});
 const drag=useRef<{pointer:number;x:number;y:number;inverse:DOMMatrix;view:typeof view}|null>(null),wheel=useRef<(e:WheelEvent)=>void>(()=>{});
 wheel.current=e=>{e.preventDefault();const inverse=svg.current?.getScreenCTM()?.inverse();if(!inverse)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse),factor=Math.exp(Math.max(-.5,Math.min(.5,e.deltaY*.001)));const xs=doc.segments.flatMap(s=>[s.a[0],s.b[0]]),ys=doc.segments.flatMap(s=>[s.a[1],s.b[1]]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;setView(v=>{const zoom=Math.max(.05,Math.min(20,v.zoom*factor)),ratio=zoom/v.zoom;return {zoom,x:p.x-cx-(p.x-cx-v.x)*ratio,y:p.y-cy-(p.y-cy-v.y)*ratio};});};
 useEffect(()=>{const el=svg.current;if(!el)return;const fn=(e:WheelEvent)=>wheel.current(e);el.addEventListener('wheel',fn,{passive:false});return()=>el.removeEventListener('wheel',fn);},[]);
 useEffect(()=>{const el=svg.current;if(!el)return;const observer=new ResizeObserver(([e])=>{if(e.contentRect.width>0&&e.contentRect.height>0)setSize({w:e.contentRect.width,h:e.contentRect.height});});observer.observe(el);return()=>observer.disconnect();},[]);
 const pts=doc.segments.flatMap(s=>[s.a,s.b]),xmin=Math.min(...pts.map(p=>p[0])),xmax=Math.max(...pts.map(p=>p[0])),ymin=Math.min(...pts.map(p=>p[1])),ymax=Math.max(...pts.map(p=>p[1])),
  span=Math.max(xmax-xmin,ymax-ymin),margin=span*.17,vw=xmax-xmin+2*margin,vh=ymax-ymin+2*margin,font=12.1*view.zoom/Math.min(size.w/vw,size.h/vh),line=span*.0025,
  unit=10**Math.floor(Math.log10(span/6)),step=[1,2,5,10].map(x=>unit*x).find(x=>x>=span/6)??unit,
  ticks=(a:number,b:number)=>Array.from({length:Math.max(0,Math.min(16,Math.floor(b/step)-Math.ceil(a/step)+1))},(_,i)=>(Math.ceil(a/step)+i)*step),ruler=Math.min(step,xmax-xmin);
 return <figure className="linked4086-figure" data-preview-current={current}><svg ref={svg} data-testid="linked4086-world-plot" viewBox={`${(xmin+xmax)/2-vw*view.zoom/2+view.x} ${(ymin+ymax)/2-vh*view.zoom/2+view.y} ${vw*view.zoom} ${vh*view.zoom}`} style={{touchAction:'none',cursor:drag.current?'grabbing':'grab'}} onPointerDown={e=>{if(e.button!==0&&e.button!==1)return;const inverse=svg.current?.getScreenCTM()?.inverse();if(!inverse)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse);drag.current={pointer:e.pointerId,x:p.x,y:p.y,inverse,view};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.inverse);setView({...d.view,x:d.view.x+d.x-p.x,y:d.view.y+d.y-p.y});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} aria-label="多关联曲折二维毫米世界坐标与刻度">
  <g stroke="#d3deda" strokeWidth={line*.4}>{ticks(xmin,xmax).map(x=><line key={'x'+x} x1={x} y1={ymin} x2={x} y2={ymax}/>)}{ticks(ymin,ymax).map(y=><line key={'y'+y} x1={xmin} y1={y} x2={xmax} y2={y}/>)}</g>
  <g fill="#4d5e58" fontSize={font}>{ticks(xmin,xmax).map(x=><text key={'x'+x} x={x} y={ymin-font*.8} textAnchor="middle">{label(x)}</text>)}{ticks(ymin,ymax).map(y=><text key={'y'+y} x={xmin-font*.8} y={y+font*.3} textAnchor="end">{label(y)}</text>)}<text x={xmax} y={ymin-margin*.65} textAnchor="end">X / mm</text><text x={xmin-margin*.65} y={ymax} textAnchor="middle" transform={`rotate(-90 ${xmin-margin*.65} ${ymax})`}>Y / mm</text></g>
  <g>{doc.segments.map(s=><line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.assignment==='B'||!current?'#151a1b':'#168b9b'} strokeWidth={line*(s.assignment==='B'?1.5:1.05)}/>)}</g>
  <g stroke="#465c53" fill="#465c53" strokeWidth={line}><line x1={xmin} y1={ymax+margin*.58} x2={xmin+ruler} y2={ymax+margin*.58}/><text x={xmin+ruler/2} y={ymax+margin*.58-font*.65} textAnchor="middle" fontSize={font} stroke="none">{label(ruler)} mm</text></g>
 </svg><figcaption><button aria-label="多带视图缩小" onClick={()=>setView(v=>({...v,zoom:Math.min(20,v.zoom*1.3)}))}>−</button><button onClick={()=>setView({zoom:1,x:0,y:0})}>适合纸域</button><button aria-label="多带视图放大" onClick={()=>setView(v=>({...v,zoom:Math.max(.05,v.zoom/1.3)}))}>＋</button><span>{current?'黑 · 纸边　青 · 内部曲线弦 U（山谷、折角未指定）':'黑 · 上一次有效纸域，当前参数尚不可采用'}</span></figcaption></figure>;
}
export default function LinkedBandsPlanarCP4086Dialog({initial,onClose,onAdoptCP}:{initial?:LinkedBandsPlanarCP4086Recipe;onClose:()=>void;onAdoptCP?:(doc:Doc)=>boolean}){
 const [draft,setDraft]=useState<Draft>(()=>draftOf(initial??LINKED_BANDS_PLANAR_CP_4086_EXAMPLE)),[result,setResult]=useState<{key:string;source:LinkedBandsPlanarCP4086Source;doc:Doc}|null>(null),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[code,setCode]=useState(''),[adoptError,setAdoptError]=useState('');
 const parsed=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(e){return {recipe:null,error:(e as Error).message};}},[draft]),key=JSON.stringify(parsed.recipe??draft),
  cache=useRef<{key:string;preview:ReturnType<typeof prepareLinkedBandsPlanarCP4086Preview>}|null>(null),generation=useRef(0),latestKey=useRef(key);latestKey.current=key;
 useEffect(()=>{const token=++generation.current;setAdoptError('');if(!parsed.recipe){setBusy(false);setCode('SOURCE_INPUT');setProblem(parsed.error);return;}
  setBusy(true);setProblem('');setCode('');const timer=requestAnimationFrame(()=>{try{
   const recipe=parsed.recipe!,sk=sourceKey(recipe);if(cache.current?.key!==sk)cache.current={key:sk,preview:prepareLinkedBandsPlanarCP4086Preview(recipe)};
   const doc=cache.current.preview.build(recipe);if(token===generation.current&&latestKey.current===key){setResult({key,source:cache.current.preview.source,doc});setBusy(false);}
  }catch(e){if(token===generation.current&&latestKey.current===key){setProblem((e as Error).message);setCode((e as {code?:string}).code??'FINITE_PAPER');setBusy(false);}}});
  return()=>{cancelAnimationFrame(timer);++generation.current;};
 },[key]);
 const current=!!result&&result.key===key&&!busy&&!problem&&!!parsed.recipe,own=result?.doc.metadata?.originalLinkedBandsPlanar4086 as any,
  change=(k:keyof Draft,value:string)=>{setDraft(d=>({...d,[k]:value}));},
  adopt=()=>{if(!current||!result||latestKey.current!==result.key)return;const doc=structuredClone(result.doc);if(!linkedBandsPlanarCP4086SourceMatches(doc)){setAdoptError('当前纸域未通过完整源回读，尚不能采用。');return;}if(onAdoptCP?.(doc))onClose();else setAdoptError(onAdoptCP?'主工程尚未采用当前副本。':'当前预览未连接主工程采用入口。');};
 return <TessDialog title="多关联曲折 · 二维多带构造" className="linked4086-dialog" onClose={onClose}>
  <div className="linked4086-workspace"><aside className="linked4086-controls">
   <div className="linked4086-intro"><span>同心曲线 · 2–4 个相邻带</span><button type="button" onClick={()=>{setDraft(draftOf(LINKED_BANDS_PLANAR_CP_4086_EXAMPLE));}}>恢复原保存参数</button><h3>多带纸域，按原坐标创作。</h3><p>调整圆族、扰动与裁域；通过有限材料检查后采用二维 CP。原保存空间链不等距，本构造不附带 3D 证书。</p></div>
   <div className="linked4086-fields">{fields.map(([k,title,unit])=><label key={k}><span>{title}<small>{unit}</small></span><input aria-label={title} type="number" step={['bands','segments','interpolationIntervals'].includes(k)?1:'any'} value={draft[k]} onChange={e=>change(k,e.target.value)}/></label>)}</div>
   <div className={`linked4086-status ${current?'ready':busy?'checking':'error'}`} role="status" data-source-key={key} data-status={current?'ready':busy?'checking':'error'}>{current?'当前有限纸域通过，可采用。':busy?'正在构造当前参数；旧预览暂不可采用。':`${code} · ${problem||parsed.error}`}</div>
   <p className="linked4086-source-note">沿用 In[4076]/In[4086] 的字面二维公式；本地均匀四次多项式与中央根，不等同原 Mathematica 默认插值。裁域保绝对 s，毫米倍率仅缩放一次。</p>
  </aside><section className="linked4086-results"><header><div><span>二维有限材料</span><strong>{current?'当前构造':result?'上一次有效构造':'等待有效构造'}</strong></div><span>U / 无指定折角</span></header>
   <div className="linked4086-plot-slot">{result?<WorldPlot doc={result.doc} current={current}/>:<div className="linked4086-placeholder">填写参数后显示原毫米坐标纸域；证明横线与三角线不会进入 CP。</div>}</div>
   <div className="linked4086-metrics"><span>{own?`${own.topology.vertices} 顶点 · ${own.topology.edges} 边 · ${own.topology.faces} 真实面`:'有限拓扑待构造'}</span><span>{own?`${own.topology.unassignedEdges} 条 U/null · ${own.topology.boundaryEdges} 纸边`:'内曲线不自动指定 M/V'}</span><span>{result?`${label(result.source.maximumEndpointExtrapolationRad)} rad 本地端 stencil 外推`:'有限纸域须正简单且只覆盖一次'}</span></div>
   <p className="linked4086-caption">源初角会改变后续二维曲线；它不是输出有限弦的刚性折角。未验证平折、层序、运动或碰撞。</p>
  </section></div><footer className="linked4086-footer"><span>采用新的二维材料副本；取消不修改工程。</span><span role="alert">{adoptError}</span><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={!current||!onAdoptCP} onClick={adopt}>采用二维多带 CP →</button></footer>
 </TessDialog>;
}
