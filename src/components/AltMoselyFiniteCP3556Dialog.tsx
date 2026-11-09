import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import {ALT_MOSELY_FINITE_PRESET,ALT_MOSELY_CLOSED_AXIS_PRESET,ALT_MOSELY_ORIGINAL_PRESETS,altMoselyFiniteCPDocument,
 altMoselyFiniteCPSourceMatches,validateAltMoselyFiniteRecipe,type AltMoselyFiniteRecipe} from '../app/altMoselyFiniteCP3556';
import type {Doc,Point} from '../core/types';
import './AltMoselyFiniteCP3556Dialog.css';

const fmt=(x:number)=>Number(x.toPrecision(5)).toString();
type TextRecipe={profile:string[][];sectors:string;minimumAngleDeg:string};
const texts=(r:AltMoselyFiniteRecipe):TextRecipe=>({profile:r.profile.map(p=>p.map(String)),sectors:String(r.sectors),minimumAngleDeg:String(r.minimumAngleDeg)});
function sourceNumber(s:string){if(!s.trim()||!Number.isFinite(Number(s)))throw Error('请填写完整有限数值；草稿尚未应用。');return Number(s);}
function inputRecipe(r:TextRecipe){return validateAltMoselyFiniteRecipe({profile:r.profile.map(p=>p.map(sourceNumber)),sectors:sourceNumber(r.sectors),minimumAngleDeg:sourceNumber(r.minimumAngleDeg)});}

function CoordinatesPlot({points,doc,selected=0,onSelect,onMove,onGesture,resetKey=0}:{points:Point[];doc?:Doc;selected?:number;onSelect?:(i:number)=>void;onMove?:(i:number,p:Point)=>void;onGesture?:()=>void;resetKey?:number|string}){
 const svg=useRef<SVGSVGElement>(null),drag=useRef<{id:number;i:number}|null>(null),pan=useRef<{id:number;x:number;y:number;view:number[]}|null>(null);
 const [font,setFont]=useState(1),[calibrated,setCalibrated]=useState(false);
 const all=doc?doc.segments.flatMap(s=>[s.a,s.b]):points;
 const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const span=Math.max(xmax-xmin,ymax-ymin,1),pad=span*.2,
  fitBox=[xmin-pad,-ymax-pad,Math.max(xmax-xmin,span*.25)+2*pad,Math.max(ymax-ymin,span*.25)+2*pad];
 const [view,setView]=useState(fitBox),viewRef=useRef(view);viewRef.current=view;
 const fit=()=>setView(fitBox),viewBox=view.join(' '),[vx,vy,vw,vh]=view,
  unit=10**Math.floor(Math.log10(Math.max(vw,vh)/5)),step=[1,2,5,10].map(x=>x*unit).find(x=>x>=Math.max(vw,vh)/5)!;
 const xticks=Array.from({length:12},(_,i)=>(Math.ceil((vx+font)/step)+i)*step).filter(x=>x<=vx+vw-font),
  yticks=Array.from({length:12},(_,i)=>(Math.ceil((-vy-vh+font)/step)+i)*step).filter(y=>y<=-vy-font);
 useEffect(()=>{setView(fitBox);},[resetKey]);
 useEffect(()=>{
  const el=svg.current;if(!el)return;const update=()=>{const m=el.getScreenCTM();if(m){setFont(12.1/Math.hypot(m.a,m.b));setCalibrated(true);}};
  const observer=new ResizeObserver(update);observer.observe(el);const id=requestAnimationFrame(update);return()=>{observer.disconnect();cancelAnimationFrame(id);};
 },[viewBox]);
 const pointer=(event:PointerEvent<SVGSVGElement>)=>{const m=event.currentTarget.getScreenCTM();if(!m)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());return [p.x,-p.y] as Point;};
 const zoom=(factor:number,at?:Point)=>setView(prior=>{const x=at?.[0]??prior[0]+prior[2]/2,y=at?-at[1]:prior[1]+prior[3]/2;
  const width=prior[2]*factor,height=prior[3]*factor;if(width<1e-5||width>1e7||height<1e-5||height>1e7)return prior;
  return [x+(prior[0]-x)*factor,y+(prior[1]-y)*factor,width,height];});
 const move=(event:PointerEvent<SVGSVGElement>)=>{
  if(drag.current?.id===event.pointerId&&onMove){const p=pointer(event);if(p)onMove(drag.current.i,p);return;}
  if(pan.current?.id===event.pointerId){const el=event.currentTarget,m=el.getScreenCTM();if(!m)return;
   const scale=Math.hypot(m.a,m.b),d=pan.current;setView([d.view[0]-(event.clientX-d.x)/scale,d.view[1]-(event.clientY-d.y)/scale,d.view[2],d.view[3]]);}
 };
 const stop=()=>{drag.current=null;pan.current=null;};
 return <div className="alt3556-coordinates">
  <nav className="alt3556-view-tools" aria-label={doc?'纸面视图':'剖面视图'}><button type="button" aria-label={doc?'放大纸面':'放大剖面'} onClick={()=>zoom(.8)}>+</button>
   <button type="button" aria-label={doc?'缩小纸面':'缩小剖面'} onClick={()=>zoom(1.25)}>−</button><button type="button" onClick={fit}>适合</button><span>滚轮缩放 · 空白拖动平移</span></nav>
  <svg ref={svg} role="img" aria-label={doc?'交替 Mosely 当前有限纸面':'编辑交替壶体毫米剖面'} viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
   data-testid={doc?'alt3556-cp-plot':'alt3556-profile-plot'} data-mm-coordinates="true" data-font-calibrated={calibrated}
   onPointerDown={event=>{if(event.button!==0||drag.current)return;event.preventDefault();pan.current={id:event.pointerId,x:event.clientX,y:event.clientY,view:[...viewRef.current]};event.currentTarget.setPointerCapture(event.pointerId);}}
   onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
   onWheel={event=>{if(drag.current||pan.current)return;event.preventDefault();const m=event.currentTarget.getScreenCTM();if(!m)return;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());zoom(Math.exp(Math.max(-.25,Math.min(.25,event.deltaY*.001))),[p.x,-p.y]);}}>
   <g className="alt3556-grid">{xticks.map(x=><line key={'x'+x} x1={x} x2={x} y1={vy} y2={vy+vh}/>)}{yticks.map(y=><line key={'y'+y} x1={vx} x2={vx+vw} y1={-y} y2={-y}/>)}</g>
   <g className="alt3556-ticks" fontSize={font}>{xticks.map(x=><text key={'x'+x} x={x} y={vy+vh-font*.5} textAnchor="middle">{fmt(x)}</text>)}
    {yticks.map(y=><text key={'y'+y} x={vx+font*.4} y={-y-font*.2}>{fmt(y)}</text>)}
    <text x={vx+vw-font*.5} y={vy+vh-font*1.8} textAnchor="end">x / mm</text><text x={vx+font*.5} y={vy+font*1.2}>{doc?'y':'z'} / mm</text></g>
   {doc?<g className="alt3556-computed">{doc.segments.map(s=><line key={s.id} data-edge-id={s.id} data-assignment={s.assignment}
    x1={s.a[0]} y1={-s.a[1]} x2={s.b[0]} y2={-s.b[1]}/>)}</g>:<>
    <polyline className="alt3556-source" points={points.map(p=>p[0]+','+-p[1]).join(' ')}/>
    {points.map((p,i)=><g key={i}><circle data-point={i} cx={p[0]} cy={-p[1]} r={font*.38} className={selected===i?'selected':''}
     onPointerDown={e=>{e.preventDefault();e.stopPropagation();onSelect?.(i);onGesture?.();drag.current={id:e.pointerId,i};svg.current?.setPointerCapture(e.pointerId);}}/>
     {i===selected&&<text x={p[0]+font*.6} y={-p[1]-font*.4} fontSize={font}>{i+1}</text>}</g>)}</>}
   <path data-testid={doc?'alt3556-mm-scale':'alt3556-source-mm-scale'} data-mm="1" className="alt3556-scale" d={'M'+(vx+font*.5)+','+(vy+font*2.3)+' h1'}/>
  </svg>
 </div>;
}
export default function AltMoselyFiniteCP3556Dialog({initial,onAdoptCP,onClose}:{initial?:AltMoselyFiniteRecipe;onAdoptCP:(doc:Doc)=>boolean;onClose:()=>void}){
 const [draft,setDraft]=useState<TextRecipe>(()=>texts(initial??ALT_MOSELY_FINITE_PRESET)),[selected,setSelected]=useState(0),
  [state,setState]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),
  [snapshot,setSnapshot]=useState<{key:string;doc:Doc}|null>(null),[plotReset,setPlotReset]=useState(0);
 const history=useRef<TextRecipe[]>([]),draftRef=useRef(draft),svgProfile=useRef(ALT_MOSELY_FINITE_PRESET.profile);
 draftRef.current=draft;
 const parsed=useMemo(()=>{try{return {recipe:inputRecipe(draft),error:''};}catch(e){return {recipe:null,error:e instanceof Error?e.message:String(e)};}},[draft]);
 if(parsed.recipe)svgProfile.current=parsed.recipe.profile;
 const key=parsed.recipe?JSON.stringify(parsed.recipe):'',current=state==='ready'&&!!snapshot&&snapshot.key===key&&!parsed.error;
 useEffect(()=>{
  if(!parsed.recipe){setState('error');setError(parsed.error);return;}
  const recipe=parsed.recipe;setState('checking');setError('');
  const id=requestAnimationFrame(()=>{try{const doc=altMoselyFiniteCPDocument(recipe);setSnapshot({key,doc});setState('ready');}
   catch(e){const message=e instanceof Error?e.message:String(e);setError(message);setState('error');}});
  return()=>cancelAnimationFrame(id);
 },[key,parsed.error]);
 const push=()=>{history.current=[...history.current.slice(-19),structuredClone(draftRef.current)];};
 const update=(fn:(v:TextRecipe)=>TextRecipe,record=true)=>{if(record)push();setDraft(v=>fn(structuredClone(v)));};
 const preset=(r:AltMoselyFiniteRecipe)=>{push();setSelected(0);setPlotReset(i=>i+1);setDraft(texts(r));};
 const pointIndex=Math.min(selected,draft.profile.length-1),point=draft.profile[pointIndex];
 const field=(label:string,value:string,change:(v:string)=>void,min:number,max:number,step:any='any')=><label className="alt3556-number"><span>{label}</span>
  <input type="number" aria-label={label} value={value} min={min} max={max} step={step} aria-invalid={!value.trim()||!Number.isFinite(Number(value))}
   onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
 const adopt=()=>{if(!current||!snapshot)return;const next=structuredClone(snapshot.doc);
  if(!altMoselyFiniteCPSourceMatches(next)){setError('当前纸面与源参数不一致，未采用。');setState('error');return;}
  if(onAdoptCP(next)!==false)onClose();};
 const stats=snapshot?Object.entries(snapshot.doc.segments.reduce((o,s)=>(o[s.assignment]=(o[s.assignment]??0)+1,o),{} as Record<string,number>)).map(([k,n])=>k+' '+n).join(' · '):'尚无可采用纸面';
 return <div className="alt3556-backdrop"><div className="alt3556-dialog ui-dialog" role="dialog" aria-modal="true" aria-label="交替 Mosely 有限二维纸面" data-testid="alt3556-dialog" data-state={state} data-source-key={key}>
  <header><div><span>原 In[3556]</span><h2>交替壶体 · 二维纸面</h2></div><button type="button" aria-label="关闭交替壶体" onClick={onClose}>×</button></header>
  <div className="alt3556-body"><aside className="alt3556-controls">
   <div className="alt3556-presets"><button onClick={()=>preset(ALT_MOSELY_CLOSED_AXIS_PRESET)}>新闭轴剖面</button><button onClick={()=>preset(ALT_MOSELY_ORIGINAL_PRESETS[1])}>原 In[3558]</button></div>
   <div className="alt3556-pair">{field('扇区数 m',draft.sectors,v=>update(d=>({...d,sectors:v})),4,16,2)}
    {field('赋型阈值 / deg',draft.minimumAngleDeg,v=>update(d=>({...d,minimumAngleDeg:v})),0,45)}</div>
   <div className="alt3556-source-slot"><CoordinatesPlot points={svgProfile.current} resetKey={plotReset} selected={pointIndex} onSelect={setSelected} onGesture={push}
    onMove={(i,p)=>update(d=>{d.profile[i]=p.map(String);return d;},false)}/></div>
   <label className="alt3556-select">剖面点<select aria-label="剖面点" value={pointIndex} onChange={e=>setSelected(Number(e.target.value))}>
    {draft.profile.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
   <div className="alt3556-pair">{field('半径 x / mm',point[0],v=>update(d=>{d.profile[pointIndex][0]=v;return d;}),-1000,1000)}
    {field('高度 z / mm',point[1],v=>update(d=>{d.profile[pointIndex][1]=v;return d;}),-1000,1000)}</div>
   <div className="alt3556-edit-actions"><button disabled={draft.profile.length>=8||!parsed.recipe||pointIndex===draft.profile.length-1} onClick={()=>update(d=>{const a=parsed.recipe!.profile[pointIndex],b=parsed.recipe!.profile[Math.min(pointIndex+1,d.profile.length-1)];
    d.profile.splice(pointIndex+1,0,[(a[0]+b[0])/2,(a[1]+b[1])/2].map(String));setSelected(pointIndex+1);return d;})}>插入点</button>
    <button disabled={draft.profile.length<=3} onClick={()=>update(d=>{d.profile.splice(pointIndex,1);setSelected(Math.min(pointIndex,d.profile.length-1));return d;})}>删除点</button>
    <button disabled={!history.current.length} onClick={()=>{const prior=history.current.pop();if(prior){setDraft(prior);setSelected(i=>Math.min(i,prior.profile.length-1));}}}>撤销</button></div>
   <p className="alt3556-note">紫色为毫米剖面，可拖点或精确输入。按原算法补轴点与交替拼接；不会自动移动、吸附或归一化你的输入。</p>
   <div className="alt3556-status" role="status" data-testid="alt3556-status" data-state={state}>{state==='checking'?'正在检查当前有限纸域…':state==='ready'?'当前材料几何已通过，可仅采用 CP。':error}
    {!current&&snapshot&&<small>保留上次有效纸面 · 当前参数不可采用</small>}</div>
  </aside><main className="alt3556-result" data-stale={!current}>
   <div className="alt3556-result-title"><div><span>FINITE PAPER / mm</span><strong>{current?'当前交替纸域':snapshot?'上次有效纸域':'等待有限纸域'}</strong></div><small>{stats}</small></div>
   <div className="alt3556-plot-slot">{snapshot?<CoordinatesPlot points={[]} doc={snapshot.doc} resetKey={snapshot.key}/>:<div className="alt3556-placeholder">填写剖面后原地生成二维纸域</div>}</div>
   <div className="alt3556-scope"><strong>青色：实际有限 CP</strong><p>保留原山谷标记，未赋型线为 U；角度未指定。端边按真实源纸域封闭。没有导入三维显示间隙、平折或层序证书。</p></div>
  </main></div>
  <footer><span>取消不修改工程；采用后可编辑、保存与普通导出。</span><button type="button" onClick={onClose}>取消</button>
   <button type="button" className="primary" disabled={!current} onClick={adopt}>仅采用交替二维 CP →</button></footer>
 </div></div>;
}
