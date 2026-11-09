import {useEffect,useRef,useState} from 'react';
import {TessDialog} from './TessellationEditor';
import type {Doc,Point} from '../core/types';
import {ELLIPSE_OPTICAL_CP_4034_EXAMPLE,ACROSS_DESCENDING_CP_3988_EXAMPLE,ellipseOpticalCP4034Document,acrossDescendingCP3988Document,
 ellipseOpticalCP4034SourceMatches,acrossDescendingCP3988SourceMatches,type EllipseOpticalCP4034Recipe,type AcrossDescendingCP3988Recipe,type EllipseAcrossCPKind} from '../app/ellipseAcrossFiniteCP';
import './EllipseAcrossFiniteCPDialog.css';

type Recipe=EllipseOpticalCP4034Recipe|AcrossDescendingCP3988Recipe;
const ns=(kind:EllipseAcrossCPKind)=>kind==='ellipse'?'originalEllipseOptical4034':'originalAcrossDescending3988',label=(x:number)=>Number(x.toPrecision(6)).toString();
type Field={key:string;label:string;min:number;max:number;step:number};
const common:Field[]=[{key:'parameterStart',label:'原参数起点 / rad',min:0,max:2*Math.PI/3,step:.01},{key:'parameterEnd',label:'原参数终点 / rad',min:0,max:2*Math.PI/3,step:.01},{key:'segments',label:'曲线弦段数',min:16,max:128,step:1},{key:'unitSizeMm',label:'每原单位 / mm',min:.01,max:1000,step:.01}];
const ellipseFields:Field[]=[{key:'leftFocus',label:'原左焦点',min:-99.95,max:-.05,step:.01},{key:'rightFocus',label:'原右焦点',min:-100,max:-.1,step:.01},{key:'leftCross',label:'原左第二截线参数',min:-99.95,max:-.0001,step:.01},{key:'rightCross',label:'原右第二截线参数',min:.0001,max:100,step:.01},...common,{key:'rulingDivisions',label:'原半格母线密度',min:2,max:32,step:1}];
const acrossFields:Field[]=[{key:'initialAngleDeg',label:'原起始折角 / °',min:.001,max:179.999,step:.1},{key:'dropFraction',label:'原下降比例',min:.00001,max:.99999,step:.0001},{key:'leftWidth',label:'左纸域宽 / 原单位',min:.01,max:1,step:.01},{key:'rightWidth',label:'右纸域宽 / 原单位',min:.01,max:1,step:.01},...common.map(f=>f.key==='parameterStart'||f.key==='parameterEnd'?{...f,max:Math.PI/2}:f)];
function draftOf(r:Recipe){return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,String(v)]));}
function parsed(draft:Record<string,string>):Recipe{
 const r:Record<string,number|string>={};for(const [k,v]of Object.entries(draft)){if(k==='assignmentMode'){r[k]=v;continue;}if(!v.trim()||!Number.isFinite(Number(v)))throw Error('请填写当前全部数值；空数字不回退到旧参数。');r[k]=Number(v);}return r as Recipe;
}
function PaperPlot({doc,kind,sourceKey}:{doc:Doc;kind:EllipseAcrossCPKind;sourceKey:string}){
 const meta=doc.metadata![ns(kind)] as any,graph=(doc.metadata!.materialTopology as any).graph,points=graph.vertices_coords as Point[],
  focuses:Point[]=kind==='ellipse'?[[meta.recipe.leftFocus*meta.recipe.unitSizeMm,0],[meta.recipe.rightFocus*meta.recipe.unitSizeMm,0]]:[[0,0]],all=[...points,...focuses],
  minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxX=Math.max(...all.map(p=>p[0])),maxY=Math.max(...all.map(p=>p[1])),span=Math.max(maxX-minX,maxY-minY),margin=span*.22,
  fit={x:(minX+maxX)/2,y:(minY+maxY)/2,width:maxX-minX+2*margin,height:maxY-minY+2*margin},
  svg=useRef<SVGSVGElement>(null),drag=useRef<{pointer:number;point:Point;center:Point}|null>(null),[view,setView]=useState({...fit,zoom:1}),[size,setSize]=useState({w:680,h:340}),[references,setReferences]=useState(false);
 useEffect(()=>{setView({...fit,zoom:1});},[sourceKey]);
 useEffect(()=>{const node=svg.current;if(!node)return;const observer=new ResizeObserver(([entry])=>{const {width:w,height:h}=entry.contentRect;if(w>0&&h>0)setSize({w,h});});observer.observe(node);return()=>observer.disconnect();},[]);
 useEffect(()=>{const node=svg.current;if(!node)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const matrix=node.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),factor=Math.exp(-Math.max(-600,Math.min(600,e.deltaY))*.002);
  setView(v=>{const z=Math.min(1000,Math.max(.1,v.zoom*factor)),q=v.zoom/z;return {...v,x:p.x+(v.x-p.x)*q,y:p.y+(v.y-p.y)*q,zoom:z};});};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[]);
 const width=fit.width/view.zoom,height=fit.height/view.zoom,left=view.x-width/2,top=view.y-height/2,font=12.1*Math.max(width/size.w,height/size.h),stroke=Math.max(width/size.w,height/size.h)*1.25,
  rawStep=Math.max(width,height)/7,base=10**Math.floor(Math.log10(rawStep)),step=[1,2,5,10].map(x=>x*base).find(x=>x>=rawStep)!,
  ticks=(a:number,b:number)=>Array.from({length:Math.max(0,Math.min(24,Math.floor(b/step)-Math.ceil(a/step)+1))},(_,i)=>(Math.ceil(a/step)+i)*step),
  xs=ticks(left+font*3,left+width-font*3),ys=ticks(top+font*3,top+height-font*3),
  world=(x:number,y:number):Point=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return [view.x,view.y];const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());return [p.x,p.y];},
  zoom=(factor:number,anchor:Point=[view.x,view.y])=>setView(v=>{const z=Math.min(1000,Math.max(.1,v.zoom*factor)),q=v.zoom/z;return {...v,x:anchor[0]+(v.x-anchor[0])*q,y:anchor[1]+(v.y-anchor[1])*q,zoom:z};}),
  guideFrames=meta.sourceFrames.filter((_:unknown,i:number)=>i%Math.max(1,Math.floor(meta.sourceFrames.length/10))===0),unit=meta.recipe.unitSizeMm;
 return <figure className="ea-figure"><div className="ea-toolbar"><div><button aria-label="预览缩小" onClick={()=>zoom(1/1.4)}>−</button><button aria-label="预览放大" onClick={()=>zoom(1.4)}>＋</button><button onClick={()=>setView({...fit,zoom:1})}>适合纸域</button></div><label><input type="checkbox" checked={references} onChange={e=>setReferences(e.target.checked)}/>原参考线</label><span>滚轮缩放 · 拖动平移</span></div>
 <svg ref={svg} data-testid="ellipse-across-mm-plot" data-kind={kind} data-source-key={sourceKey} data-zoom={view.zoom} viewBox={`${left} ${top} ${width} ${height}`} aria-label={kind==='ellipse'?'原光学椭圆毫米纸域与原山谷母线':'原下降折角 Across 毫米纸域与源圆心'}
  onPointerDown={e=>{if(e.button!==0)return;drag.current={pointer:e.pointerId,point:world(e.clientX,e.clientY),center:[view.x,view.y]};e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const p=world(e.clientX,e.clientY);setView(v=>({...v,x:v.x+d.point[0]-p[0],y:v.y+d.point[1]-p[1]}));}}
  onPointerUp={e=>{if(drag.current?.pointer===e.pointerId){drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}} onPointerCancel={()=>{drag.current=null;}}>
  <g stroke="#dce5e7" strokeWidth={stroke*.55}>{xs.map(x=><line key={'x'+x} x1={x} y1={top} x2={x} y2={top+height}/>)}{ys.map(y=><line key={'y'+y} x1={left} y1={y} x2={left+width} y2={y}/>)}</g>
  <g fill="#516976" fontSize={font}>{xs.map(x=><text key={'x'+x} x={x} y={top+height-font*.65} textAnchor="middle">{label(x)}</text>)}{ys.map(y=><text key={'y'+y} x={left+font*.5} y={y+font*.3}>{label(y)}</text>)}<text x={left+width-font*.5} y={top+font*1.2} textAnchor="end">X → / mm · Y ↓ / mm</text></g>
  {references&&<g data-testid="ellipse-across-reference" stroke="#927ba0" strokeWidth={stroke} strokeDasharray={`${stroke*4} ${stroke*3}`}>{guideFrames.flatMap((f:any,j:number)=>kind==='ellipse'?[[meta.recipe.leftFocus,0],[meta.recipe.rightFocus,0]].map((p,i)=><line key={`${j}-${i}`} x1={f.base[0]*unit} y1={f.base[1]*unit} x2={p[0]*unit} y2={p[1]*unit}/>):['leftDirector','rightDirector'].map(k=><line key={`${j}-${k}`} x1={f.base[0]*unit} y1={f.base[1]*unit} x2={(f.base[0]+f[k][0])*unit} y2={(f.base[1]+f[k][1])*unit}/>))}</g>}
  {doc.segments.map(s=><line key={s.id} data-edge-id={s.id} data-assignment={s.assignment} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.assignment==='B'?'#203b42':s.assignment==='M'?'#b25c45':s.assignment==='V'?'#397fac':'#5f8793'} strokeWidth={stroke*(s.assignment==='B'?1.6:1.15)} strokeDasharray={s.assignment==='V'||s.assignment==='U'?`${stroke*4} ${stroke*2}`:undefined}/>)}
  {focuses.map((p,i)=><g key={i} fill="#785b92"><circle cx={p[0]} cy={p[1]} r={font*.3}/><text x={p[0]+font*.45} y={p[1]-font*.6} fontSize={font}>{kind==='ellipse'?`${i===0?'左':'右'}焦点`:'源圆心'}</text></g>)}
  <g data-testid="ellipse-across-mm-scale" stroke="#405d6b" strokeWidth={stroke} fill="#405d6b"><line x1={left+font*3} y1={top+font*2.1} x2={left+font*3+step} y2={top+font*2.1}/><text x={left+font*3} y={top+font*3.2} fontSize={font} stroke="none">{label(step)} mm</text></g>
 </svg><figcaption>{kind==='ellipse'?'黑：原 cL/cR 纸边 · 蓝虚线：谷 · 红实线：山 · 紫：焦点参考':'黑：实际纸边 · 蓝虚线：未赋型 U · 紫：单源圆心'}<span>原坐标 × {label(unit)} mm；视图不改变纸面。</span></figcaption></figure>;
}

export default function EllipseAcrossFiniteCPDialog({kind,initial,onAdoptCP,onClose,projectName}:{kind:EllipseAcrossCPKind;initial?:Recipe;onAdoptCP:(doc:Doc)=>boolean;onClose:()=>void;projectName?:string}){
 const preset=kind==='ellipse'?ELLIPSE_OPTICAL_CP_4034_EXAMPLE:ACROSS_DESCENDING_CP_3988_EXAMPLE,[draft,setDraft]=useState(()=>draftOf(initial??preset)),[candidate,setCandidate]=useState<{key:string;doc:Doc;milliseconds:number}|null>(null),
  [state,setState]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),key=JSON.stringify({kind,draft}),fields=kind==='ellipse'?ellipseFields:acrossFields;
 useEffect(()=>{setState('checking');setError('');const raf=requestAnimationFrame(()=>{const start=performance.now();try{const r=parsed(draft),doc=kind==='ellipse'?ellipseOpticalCP4034Document(r):acrossDescendingCP3988Document(r);if(projectName)doc.name=projectName;setCandidate({key,doc,milliseconds:performance.now()-start});setState('ready');}catch(e){setState('error');setError((e as Error).message);}});return()=>cancelAnimationFrame(raf);},[key,projectName]);
 const current=candidate?.key===key&&state==='ready',displayState=candidate?.key!==key&&state==='ready'?'checking':state,
  change=(field:string,text:string)=>setDraft(d=>({...d,[field]:text})),title=kind==='ellipse'?'原光学椭圆 CP · In[4034]':'原下降折角 Across CP · In[3988]';
 return <TessDialog title={title} onClose={onClose}><div className="ea-finite-cp" data-testid="ellipse-across-dialog" data-kind={kind}>
  <div className="ea-workspace"><section className="ea-controls"><p className="ea-kicker">ORIGAMICA · 实际二维纸域</p><h2>{kind==='ellipse'?'双焦点与原山谷线':'下降折角与原圆心'}</h2>
   <p>{kind==='ellipse'?'原 f/cL/cR 构成纸面，原半格母线保留 V/M。焦点辅助线只作参考。':'γ(u)=起始折角 × (1−下降比例 u/(π/2))。原单位宽左边收于同一源圆心；裁域不重置原角参数。'}</p>
   <div className="ea-fields">{fields.map(f=><label key={f.key} className="ea-field"><span>{f.label}</span><input aria-label={f.label} type="number" value={draft[f.key]} min={f.min} max={f.max} step={f.step} onChange={e=>change(f.key,e.target.value)}/><input aria-label={`${f.label}滑条`} type="range" min={f.min} max={f.max} step={f.step} value={Number.isFinite(Number(draft[f.key]))&&draft[f.key].trim()?Number(draft[f.key]):f.min} onChange={e=>change(f.key,e.target.value)}/></label>)}</div>
   {kind==='ellipse'&&<label className="ea-mode">折痕标记<select aria-label="原光学椭圆折痕标记" value={draft.assignmentMode} onChange={e=>change('assignmentMode',e.target.value)}><option value="original-styles">采用原山谷标记 V/M</option><option value="unassigned">本地未赋型 U</option></select></label>}
   <button className="ea-reset" onClick={()=>setDraft(draftOf(preset))}>恢复原保存输入</button><p className="ea-scope">曲线以有限弦表示。无指定刚性折角、三维姿态或层序证书；采用后可编辑、保存、重开和恢复来源。</p>
  </section><section className="ea-results"><div className="ea-status" data-testid="ellipse-across-status" data-state={displayState} data-source-key={key} data-build-ms={candidate?.milliseconds??0}>
   <p role="status">{current?`${candidate.doc.segments.length} 条真实边 · ${(candidate.doc.metadata!.materialTopology as any).graph.faces_vertices.length} 个材料面 · 当前来源核验通过`:displayState==='checking'?'正在核验当前有限纸域；保留上次预览，暂不可采用。':error||'等待当前有效参数。'}</p>
   {!current&&candidate&&<p>图中为上次有效参数，未写入工程。</p>}{error&&<p role="alert">{error}</p>}
  </div><div className="ea-plot-slot" data-testid="ellipse-across-plot-slot" data-current={!!current}>{candidate?<PaperPlot doc={candidate.doc} kind={kind} sourceKey={candidate.key}/>:<div className="ea-placeholder">等待原纸域；非法输入不会重建或补点。</div>}</div>
  <p className="ea-result-scope">{kind==='ellipse'?'左右原第二截线为纸边；只输出原半格母线，验证分区不会变成加工缝。':'圆心为一个明确源顶点，参数矩形在那里不单射；有限纸面覆盖另作严格验证，未新增径向加工缝。'}</p>
  </section></div><footer><span>毫米坐标只转换一次 · 仅采用二维 CP</span><button onClick={onClose}>取消</button><button className="primary" disabled={!current} onClick={()=>{if(!current||!candidate)return;const doc=structuredClone(candidate.doc),ok=kind==='ellipse'?ellipseOpticalCP4034SourceMatches(doc):acrossDescendingCP3988SourceMatches(doc);if(ok&&onAdoptCP(doc))onClose();}}>仅采用 CP →</button></footer>
 </div></TessDialog>;
}
