import {useMemo,useRef,useState} from 'react';
import {download as save} from '../app/api';
import {createPortal} from 'react-dom';
import {LOCAL_UNSAFE_INPUT_EXAMPLE,readUnsafeTwistParameters,readUnsafeTwistQuery,readUnsafeTwistResult,unsafeTwistRange,writeUnsafeTwistParameters,
 type UnsafeTriple,type UnsafeTwistQuery,type UnsafeTwistResult} from '../app/unsafeTwistRange';
import type {Point} from '../core/types';
import TessellationEditor,{TessDialog} from './TessellationEditor';
import './UnsafeTwistRangeControls.css';

const format=(n:number)=>Number(n.toPrecision(9)).toString();
const segments=(faces:number[][])=>faces.flatMap(face=>face.map((a,i)=>[a-1,face[(i+1)%face.length]-1] as [number,number]));
function Diagram({points,faces,boundary,selected,triple,title,onSelect}:{points:Point[];faces:number[][];boundary?:number[];selected:number;
 triple?:UnsafeTriple;title:string;onSelect:(v:number)=>void}){
 if(!points.length)return <p className="utr-empty">原点表为空</p>;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,
  span=Math.max(w,h,1e-20),pad=.12*span,edges=segments(faces);
 return <svg role="img" aria-label={title} data-testid={boundary?'unsafe-primal-plot':'unsafe-dual-plot'} viewBox={`${x-pad} ${-y-h-pad} ${w+2*pad} ${h+2*pad}`}>
  {edges.map(([a,b],i)=><line key={i} x1={points[a][0]} y1={-points[a][1]} x2={points[b][0]} y2={-points[b][1]}
   stroke={boundary?'#303b35':'#078a96'} strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
  {triple&&<polyline points={triple.points.map(p=>`${p[0]},${-p[1]}`).join(' ')} fill="none" stroke="#c07539" strokeWidth="3" vectorEffect="non-scaling-stroke"/>}
  {points.map((p,i)=><g key={i} onClick={()=>onSelect(i)} className="utr-point" data-point-index={i+1}>
   <circle cx={p[0]} cy={-p[1]} r={span*.015} fill={selected===i?'#038b94':boundary?.includes(i+1)?'#777e76':'#8953b4'}/>
   <text x={p[0]+span*.023} y={-p[1]-span*.015} fontSize={span*.038} fill="#27473e">{i+1}</text></g>)}
 </svg>;
}
function RangeDialog({onClose}:{onClose:()=>void}){
 const [text,setText]=useState(()=>JSON.stringify(LOCAL_UNSAFE_INPUT_EXAMPLE,null,2)),[active,setActive]=useState<'primal'|'dual'>('primal'),
  [vertex,setVertex]=useState(0),[pSelection,setPSelection]=useState(0),[dSelection,setDSelection]=useState(0),[editing,setEditing]=useState(false),
  [message,setMessage]=useState(''),[fileError,setFileError]=useState('');
 const editBaseline=useRef(''),editCommitted=useRef(false);
 const computed=useMemo(()=>{let query:UnsafeTwistQuery|null=null;try{query=readUnsafeTwistQuery(JSON.parse(text));
  return{query,result:unsafeTwistRange(query),error:''};}catch(e){return{query,result:null,error:(e as Error).message};}},[text]);
 const {query,result}=computed,error=fileError||computed.error,r=fileError?null:result;
 const points=query?(active==='primal'?query.pverts:query.dverts):[],faces=query?(active==='primal'?query.pfaces:query.dfaces):[],v=Math.min(vertex,Math.max(0,points.length-1)),
  primal=r?.data.primal[Math.min(pSelection,Math.max(0,r.data.primal.length-1))],dual=r?.data.dual[Math.min(dSelection,Math.max(0,r.data.dual.length-1))];
 const update=(next:UnsafeTwistQuery)=>{setText(JSON.stringify(next,null,2));setFileError('');setMessage('');};
 const pick=(kind:'primal'|'dual',i:number)=>{setActive(kind);setVertex(i);};
 const changeCoordinate=(axis:number,value:string)=>{if(!query)return;
  if(!value.trim()||!Number.isFinite(Number(value))||Math.abs(Number(value))>1e8){setFileError('点坐标须为±10⁸内的有限数。');return;}
  const next=structuredClone(query);(active==='primal'?next.pverts:next.dverts)[v][axis]=Number(value);update(next);
 };
 const importFile=async(file:File)=>{try{if(file.size>300000)throw Error('五输入参数文件超过300KB。');update(readUnsafeTwistParameters(await file.text()));
  setVertex(0);setPSelection(0);setDSelection(0);setMessage('已重开全部原五输入。');}catch(e){setFileError((e as Error).message);setMessage('');}};
 const reopenResult=async(file:File)=>{try{if(file.size>1000000)throw Error('角域结果文件超过1MB。');const value=readUnsafeTwistResult(await file.text());update(value.query);
  setVertex(0);setPSelection(0);setDSelection(0);setMessage('全部原结果及来源独立回读一致。');}catch(e){setFileError((e as Error).message);setMessage('');}};
 const selector=(items:UnsafeTriple[],selected:number,apply:(i:number)=>void,label:string)=><label>{label}<select aria-label={label} value={Math.min(selected,Math.max(0,items.length-1))}
  onChange={e=>apply(Number(e.target.value))} disabled={!items.length}>{items.length?items.map((t,i)=><option key={i} value={i}>F{t.face} · {t.indices.join('→')} · {format(t.angleRad*180/Math.PI)}°</option>):<option>原列表为空</option>}</select></label>;
 return <TessDialog title="原始—对偶原角域 · 五输入" onClose={onClose}><div className="unsafe-twist-range">
  <div className="utr-source"><strong>In[3338] · 原五参数</strong><span>本地有限输入例 · 不冒充原 In[3339] 保存输出</span>
   <button type="button" onClick={()=>{update(structuredClone(LOCAL_UNSAFE_INPUT_EXAMPLE));setVertex(0);setPSelection(0);setDSelection(0);}}>恢复本地有限例</button></div>
  <div className="utr-range" data-testid="unsafe-range-summary"><span>原返回 · 弧度</span><strong>{r?`[${r.data.originalReturn.map(format).join(', ')}]`:'—'}</strong>
   <span>显示 · 角度</span><strong>{r?`[${r.data.rangeDeg.map(format).join('°, ')}°]`:'—'}</strong></div>
  {error&&<p className="utr-error" role="alert">{error}</p>}
  <div className="utr-plots"><figure><figcaption>pverts / pfaces · 首非边界三点</figcaption>{query&&!fileError&&<Diagram points={query.pverts} faces={query.pfaces}
   boundary={query.bverts} selected={active==='primal'?v:-1} triple={primal} title="原p点与面序、选中首非边界三点" onSelect={i=>pick('primal',i)}/>}</figure>
   <figure><figcaption>dverts / dfaces · 只用原首面</figcaption>{query&&!fileError&&<Diagram points={query.dverts} faces={query.dfaces}
    selected={active==='dual'?v:-1} triple={dual} title="原d点与面序、原首对偶面三点" onSelect={i=>pick('dual',i)}/>}</figure></div>
  <div className="utr-triples">{r&&<>{selector(r.data.primal,pSelection,setPSelection,'原pface选中三点')}{selector(r.data.dual,dSelection,setDSelection,'原首dface选中三点')}
   <span data-testid="unsafe-selection-provenance">原p三点 {primal?.indices.join('→')??'空'}；原d三点 {dual?.indices.join('→')??'空'}；其余{r.data.ignoredDualFaces}个dface未入原范围。</span></>}</div>
  {query&&<div className="utr-coordinates"><label>点表<select aria-label="角域编辑点表" value={active} onChange={e=>{setActive(e.target.value as 'primal'|'dual');setVertex(0);}}><option value="primal">原 pverts</option><option value="dual">原 dverts</option></select></label>
   <label>原1-based点<select aria-label="角域选中点" disabled={!points.length} value={v} onChange={e=>setVertex(Number(e.target.value))}>{points.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
   {points[v]&&points[v].map((x,i)=><label key={`${active}-${v}-${i}-${x}`}>{['X','Y'][i]}<input aria-label={`原角域点 ${['X','Y'][i]}`} type="number" step="any" min={-1e8} max={1e8}
    defaultValue={x} onChange={e=>changeCoordinate(i,e.target.value)}/></label>)}
   {active==='primal'&&points.length>0&&<label className="utr-boundary"><input type="checkbox" aria-label="原选中点属于bverts" checked={query.bverts.includes(v+1)}
    onChange={e=>update({...query,bverts:e.target.checked?[...query.bverts,v+1]:query.bverts.filter(i=>i!==v+1)})}/>原边界点 bverts</label>}
   <button type="button" disabled={points.length<2} onClick={()=>{editBaseline.current=text;editCommitted.current=false;setEditing(true);}}>拖动{active==='primal'?'p':'d'}点 · 刻度／缩放</button></div>}
  <details className="utr-raw"><summary>原五输入精确 JSON · 可改面序与边界索引</summary><textarea aria-label="原五输入JSON" value={text} spellCheck={false}
   onChange={e=>{setText(e.target.value);setFileError('');setMessage('');}}/></details>
  <p className="utr-status" role="status">{message|| (r?'实时原式计算：首非bverts三点、仅首dface与完整π补角表。':'修正原输入后直接重算。')}</p>
  <div className="utr-files"><label>重开参数<input type="file" accept=".json,application/json" aria-label="原角域五参数文件" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value='';}}/></label>
   <label>回读原结果<input type="file" accept=".json,application/json" aria-label="原角域结果文件" onChange={e=>{const f=e.target.files?.[0];if(f)void reopenResult(f);e.target.value='';}}/></label>
   <button type="button" disabled={!query||!!error} onClick={()=>save(writeUnsafeTwistParameters(query!),'原始对偶-五输入角域参数.json')}>保存五输入参数</button>
   <button type="button" disabled={!r||!!error} onClick={()=>save(JSON.stringify(r,null,2)+'\n','原始对偶-完整原角域结果.json')}>保存完整原结果</button></div>
  <p className="utr-note">原作者标记 IN PROGRESS / TBD。保留负角及超过180°的原代数值；该局部范围不构成赋型、CP或层序证明。</p>
  <footer><span>关闭后当前作品与构造参数不变。</span><button type="button" className="primary" onClick={onClose}>关闭角域工具</button></footer>
 </div>{editing&&query&&<TessellationEditor title={`原${active==='primal'?'pverts':'dverts'}位置`} initial={points} edges={segments(faces)} min={-1e8} max={1e8}
  xLabel="原 X" yLabel="原 Y" invertY minPoints={points.length} maxPoints={points.length} validateGeometry={p=>p.length===points.length?'':'保留原点数与点序。'}
  previewSummary={<span data-testid="unsafe-editor-live-range">实时原角域 {r?r.data.rangeDeg.map(format).join('° … ')+'°':'原方向未得有限值'}</span>}
  onPreview={p=>update(active==='primal'?{...query,pverts:p}:{...query,dverts:p})}
  onClose={()=>{if(!editCommitted.current){setText(editBaseline.current);setFileError('');}setEditing(false);}}
  onApply={p=>{editCommitted.current=true;update(active==='primal'?{...query,pverts:p}:{...query,dverts:p});}}/>}</TessDialog>;
}
export default function UnsafeTwistRangeControls(){
 const [open,setOpen]=useState(false);return <><button type="button" className="text-button" aria-label="原始对偶原五输入角域" onClick={()=>setOpen(true)}>原五输入角域</button>
  {open&&createPortal(<RangeDialog onClose={()=>setOpen(false)}/>,document.body)}</>;
}
