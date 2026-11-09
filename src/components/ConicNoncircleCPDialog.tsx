import {useEffect,useState} from 'react';
import {TessDialog} from './TessellationEditor';
import TessNumberField from './TessNumberField';
import {CONIC_NONCIRCLE_PRESETS,validateConicNoncircleRecipe,fetchConicNoncircleCP,conicNoncircleCPSourceMatches,type ConicNoncircleRecipe} from '../app/conicNoncircleCP';
import type {Doc,Point} from '../core/types';
import './ConicNoncircleCPDialog.css';

/** The grid is a view only. Every line/marker uses the original saved millimetres. */
function NativeMillimetrePlot({doc,recipe}:{doc:Doc;recipe:ConicNoncircleRecipe}){
 const graph=(doc.metadata!.materialTopology as {graph:{vertices_coords:Point[]}}).graph,points=graph.vertices_coords,n=recipe.divisions+1,
  focuses:Point[]=typeof recipe.leftFocus==='number'?[[recipe.leftFocus,0],[recipe.rightFocus,0]]:[[recipe.rightFocus,0]],
  all=[...points,...focuses,[0,0] as Point],minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxX=Math.max(...all.map(p=>p[0])),maxY=Math.max(...all.map(p=>p[1])),
  span=Math.max(maxX-minX,maxY-minY),unit=10**Math.floor(Math.log10(span/8)),step=[1,2,5,10].map(k=>k*unit).find(v=>v>=span/8)!,
  margin=span*.14,size=span*.026,stroke=span*.002,
  ticks=(a:number,b:number)=>Array.from({length:Math.floor(b/step)-Math.ceil(a/step)+1},(_,i)=>(Math.ceil(a/step)+i)*step),
  label=(v:number)=>Number(v.toPrecision(7)).toString(),xTicks=ticks(minX,maxX),yTicks=ticks(minY,maxY),rulerX=minX+span*.08,rulerY=maxY+margin*.68,
  chain=(start:number)=>points.slice(start,start+n).map(p=>p.join(',')).join(' ');
 return <figure className="conic-noncircle-figure"><svg data-testid="conic-noncircle-mm-plot" className="conic-noncircle-preview" viewBox={`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`} aria-label="原坐标毫米网格、轴及真实纸域预览">
  <g className="conic-mm-grid" strokeWidth={stroke*.5}>{xTicks.map(x=><line key={'x'+x} x1={x} y1={minY} x2={x} y2={maxY}/>)}{yTicks.map(y=><line key={'y'+y} x1={minX} y1={y} x2={maxX} y2={y}/>)}</g>
  <g stroke="#8996a7" strokeWidth={stroke}><line x1={minX} y1={0} x2={maxX} y2={0}/><line x1={0} y1={minY} x2={0} y2={maxY}/></g>
  <g fill="#526074" fontSize={size}>{xTicks.map(x=><text key={'x'+x} x={x} y={minY-margin*.32} textAnchor="middle">{label(x)}</text>)}{yTicks.map(y=><text key={'y'+y} x={minX-margin*.12} y={y+size*.3} textAnchor="end">{label(y)}</text>)}<text x={maxX} y={minY-margin*.75} textAnchor="end">X → / mm</text><text x={minX-margin*.65} y={maxY} textAnchor="middle" transform={`rotate(-90 ${minX-margin*.65} ${maxY})`}>Y ↓ / mm</text></g>
  {doc.segments.map(s=><line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.assignment==='B'?'#172334':'#698491'} strokeWidth={stroke*1.5} strokeDasharray={s.assignment==='U'?`${span*.007} ${span*.004}`:undefined}/>)}
  <polyline points={chain(0)} fill="none" stroke="#2469b2" strokeWidth={stroke*2}/><polyline points={chain(n)} fill="none" stroke="#d47736" strokeWidth={stroke*2}/><polyline points={chain(2*n)} fill="none" stroke="#287b69" strokeWidth={stroke*2}/>
  {focuses.map((p,i)=><g key={i} fill="#91539a"><circle cx={p[0]} cy={p[1]} r={size*.65}/><text x={p[0]} y={p[1]-size*1.3} fontSize={size} textAnchor="middle">{typeof recipe.leftFocus==='number'&&i===0?'左焦点':'右焦点'}</text></g>)}
  {[0,n-1].map((i)=><g key={i} fill="#2469b2"><circle cx={points[i][0]} cy={points[i][1]} r={size*.6}/><text x={points[i][0]+size} y={points[i][1]+size*1.4} fontSize={size}>{i===0?'起点':'终点'} t={label(i===0?recipe.parameterStart:recipe.parameterEnd)}</text></g>)}
  <g data-testid="conic-noncircle-mm-scale" stroke="#35475d" fill="#35475d" strokeWidth={stroke}><line x1={rulerX} y1={rulerY} x2={rulerX+step} y2={rulerY}/><line x1={rulerX} y1={rulerY-size*.4} x2={rulerX} y2={rulerY+size*.4}/><line x1={rulerX+step} y1={rulerY-size*.4} x2={rulerX+step} y2={rulerY+size*.4}/><text x={rulerX+step/2} y={rulerY-size*.65} stroke="none" fontSize={size} textAnchor="middle">{label(step)} mm</text></g>
 </svg><figcaption><span className="conic-native-crease">蓝：原折曲线与起终 t</span><span className="conic-native-left">橙：原左第二截线</span><span className="conic-native-right">绿：原右第二截线</span><span className="conic-native-focus">紫：原焦点{typeof recipe.leftFocus==='object'?'（左−∞为平行母线）':''}</span></figcaption><p className="note">网格间距 {label(step)} mm；X 向右、Y 向下显示。预览仅改变视窗，实际材料坐标保持原值。</p></figure>;
}

export default function ConicNoncircleCPDialog({onClose,onAdopt,initialRecipe,projectName}:{onClose:()=>void;onAdopt:(doc:Doc)=>boolean;initialRecipe?:ConicNoncircleRecipe;projectName?:string}){
 const [recipe,setRecipe]=useState<ConicNoncircleRecipe>(()=>structuredClone(initialRecipe??CONIC_NONCIRCLE_PRESETS[0])),
  [candidate,setCandidate]=useState<{key:string;doc:Doc}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=JSON.stringify(recipe),parabola=typeof recipe.leftFocus==='object',hyperbola=recipe.rightFocus>0;
 useEffect(()=>{
  const controller=new AbortController();setError('');setBusy(true);
  const timer=setTimeout(()=>{let valid:ConicNoncircleRecipe;try{valid=validateConicNoncircleRecipe(recipe);}catch(e){setError((e as Error).message);setBusy(false);return;}
   fetchConicNoncircleCP(valid,controller.signal).then(doc=>{if(controller.signal.aborted)return;if(projectName)doc.name=projectName;setCandidate({key,doc});setBusy(false);})
    .catch(e=>{if(controller.signal.aborted)return;setError((e as Error).message);setBusy(false);});
  },220);return()=>{clearTimeout(timer);controller.abort();};
 },[key,projectName]);
 const doc=candidate?.key===key?candidate.doc:null,adoptable=!!doc&&!busy&&conicNoncircleCPSourceMatches(doc);
 const change=(field:keyof ConicNoncircleRecipe,value:number)=>setRecipe(r=>({...r,[field]:value}));
 return <TessDialog title="原非圆截线 · 有限二维 CP" onClose={onClose}><div className="conic-noncircle-cp">
  <div className="conic-noncircle-workspace"><section className="conic-noncircle-controls">
  <div className="conic-noncircle-presets">{['原椭圆 In[4093]','原左抛物输入','原双曲输入'].map((label,i)=><button key={label} onClick={()=>setRecipe(structuredClone(CONIC_NONCIRCLE_PRESETS[i]))}>{label}</button>)}</div>
  <p className="note">椭圆沿用原五弦驻定；抛物与双曲使用原九规则作本地有限离散。原母线保幅，未指定山谷时为 U；仅采用二维 CP。</p>
  <div className="conic-noncircle-fields">
  <div className="tess-pair">{parabola?<label className="select-field">原左焦点<span>−∞（原左准直支）</span></label>:<TessNumberField label="原左焦点" value={recipe.leftFocus as number} min={-3} max={-.5} step={.1} onChange={v=>change('leftFocus',v)}/>}<TessNumberField label="原右焦点" value={recipe.rightFocus} min={hyperbola?.5:-3} max={hyperbola?3:-.5} step={.1} onChange={v=>change('rightFocus',v)}/></div>
  <div className="tess-pair"><TessNumberField label="原左第二截线参数" value={recipe.leftCross} min={-3} max={3} step={.1} onChange={v=>change('leftCross',v)}/><TessNumberField label="原右第二截线参数" value={recipe.rightCross} min={-3} max={3} step={.1} onChange={v=>change('rightCross',v)}/></div>
  <div className="tess-pair"><TessNumberField label={parabola?'原长度参数起点':'原角参数起点'} value={recipe.parameterStart} min={0} max={parabola?2:hyperbola?Math.PI/4:Math.PI/2} step={.05} onChange={v=>change('parameterStart',v)}/><TessNumberField label={parabola?'原长度参数终点':'原角参数终点'} value={recipe.parameterEnd} min={0} max={parabola?2:hyperbola?Math.PI/4:Math.PI/2} step={.05} onChange={v=>change('parameterEnd',v)}/></div>
  <TessNumberField label="原驻定弦段数" value={recipe.divisions} min={2} max={15} step={1} onChange={v=>change('divisions',v)}/>
  </div></section><section className="conic-noncircle-results">
  <div className="conic-noncircle-status" data-state={busy?'busy':error?'error':doc?'ready':'waiting'}>
  <p role="status">{busy?'正在按原驻定与九规则构造…':doc?`${recipe.divisions+1} 原点 · ${doc.segments.length} 真实边 · 单一闭合纸域`:error||'等待有效原参数。'}</p>{error&&<p role="alert">{error}</p>}
  </div>
  <div className="conic-noncircle-plot-slot" data-testid="conic-noncircle-plot-slot">{doc?<NativeMillimetrePlot doc={doc} recipe={recipe}/>:<div className="conic-noncircle-plot-placeholder">{busy?'本次参数正在生成原纸域…':error?'本次参数未通过，未显示候选纸域。':'等待本次有效原参数。'}</div>}</div>
  <p className="note">1 原平面坐标单位按 1 mm 保持，未平移或缩放。尚未认证平折、三维、连续路径或碰撞。采用后可在材料工作区编辑并保存；恢复原参数需要重新构造。</p>
  </section></div>
  <footer><button onClick={onClose}>关闭</button><button className="primary" disabled={!adoptable} onClick={()=>{if(doc&&adoptable&&onAdopt(doc))onClose();}}>仅采用 CP →</button></footer>
 </div></TessDialog>;
}
