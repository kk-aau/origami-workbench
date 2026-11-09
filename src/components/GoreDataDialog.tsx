import {useEffect,useRef,useState} from 'react';
import {fetchGoreData,readGoreQuery,GORE_FUNCTIONS,type GoreFunction,type GorePaperParams,type GoreResult,type GoreDataKey} from '../app/goreData';
import {download} from '../app/api';
import {TessDialog} from './TessellationEditor';
import TessNumberField from './TessNumberField';

function DataPlot({result,kind}:{result:GoreResult;kind:GoreDataKey}){
 const raw=result.data[kind],primitives=(result.query.function.includes('Multiple')?raw.flat():raw) as number[][][],project=(p:number[])=>p.length===2?p:[.707*p[0]-.707*p[1],.25*p[0]+.25*p[1]-.92*p[2]],shown=primitives.map(poly=>poly.map(project)),all=shown.flat(),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),span=Math.max(Math.max(...xs)-x,Math.max(...ys)-y,1e-8),pad=span*.05;
 return <svg aria-label={`Gore原数据${kind}`} viewBox={`${x-pad} ${y-pad} ${Math.max(...xs)-x+2*pad} ${Math.max(...ys)-y+2*pad}`} style={{width:'100%',height:120,background:'#f5f7f6'}}>{shown.map((poly,i)=><polyline key={i} points={(kind==='flatLines'?poly:[...poly,poly[0]]).map(p=>p.join(',')).join(' ')} fill="none" stroke={kind==='flatLines'?'#7a4aa0':'#087e88'} strokeWidth={span*.002}/>)}</svg>;
}
export default function GoreDataDialog({params,onClose}:{params:GorePaperParams;onClose:()=>void}){
 const [fn,setFn]=useState<GoreFunction>(params.profile==='sphere'?params.petals==='multiple'?'SphereMultipleGoreData':'SphereSingleGoreData':params.petals==='multiple'?'MultipleGoreData':'SingleGoreData'),[m,setM]=useState(params.sectors),[n,setN]=useState(params.divisions??16),[text,setText]=useState(JSON.stringify(params.crossSection??[[0,0],[1,1],[1,2],[0,3]])),[result,setResult]=useState<GoreResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),generation=useRef(0),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{generation.current++;request.current?.abort();},[]);
 const invalidate=()=>{generation.current++;request.current?.abort();setResult(null);setBusy(false);setError('');};
 const calculate=async()=>{let points;try{if(!fn.startsWith('Sphere'))points=JSON.parse(text);}catch{setError('剖面须为二维JSON点列。');return;}
  const q=readGoreQuery({family:'gore-data-native',function:fn,sectors:m,...(fn.startsWith('Sphere')?{divisions:n}:{points})});if(!q){setError('原输入无效或完整图形预算过大；请减少n/m，不会删除重复线。');return;}
  const id=++generation.current;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');setResult(null);
  try{const r=await fetchGoreData(q,controller.signal);if(id===generation.current)setResult(r);}catch(e){if(id===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}
 };
 const labels:Record<GoreDataKey,string>={targetPolygons:'折后 t3d',radialPolygons:'径向 r3d',cylindricalPolygons:'柱面 c3d',flatLines:'原二维 u2d'};
 return <TessDialog title="四个原Gore函数 · 完整数据" onClose={onClose}>
  <label className="select-field">原函数<select aria-label="Gore原函数" value={fn} onChange={e=>{invalidate();setFn(e.target.value as GoreFunction);}}>{Object.entries(GORE_FUNCTIONS).map(([name,cell])=><option key={name} value={name}>{name} · {cell}</option>)}</select></label>
  <div className="tess-pair"><TessNumberField label="原瓣数 m" value={m} min={3} max={32} step={1} onChange={v=>{invalidate();setM(v);}}/>{fn.startsWith('Sphere')&&<TessNumberField label="原球面分段 n" value={n} min={2} max={64} step={1} onChange={v=>{invalidate();setN(v);}}/>}</div>
  {!fn.startsWith('Sphere')&&<label>原 pts JSON<textarea aria-label="Gore原剖面JSON" value={text} onChange={e=>{invalidate();setText(e.target.value);}} style={{width:'100%',minHeight:70}}/></label>}
  <button onClick={()=>void calculate()} disabled={busy}>{busy?'计算完整原数据…':'计算四组原数据'}</button>
  {error&&<p role="alert">{error}</p>}
  {result&&<><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>{(Object.keys(labels) as GoreDataKey[]).map(kind=><div key={kind}><b>{labels[kind]}</b><DataPlot result={result} kind={kind}/></div>)}</div><p role="status">{result.source.inputPoints.length}剖面点；{result.query.function.includes('Multiple')?result.query.sectors:1}瓣；原u2d每瓣保留{result.source.inputPoints.length}条重复线。剖面／四组数据与旋转顺序已独立回读。</p><button onClick={()=>download(JSON.stringify(result,null,2),`${result.query.function}-原完整数据.json`)}>导出完整原数据 JSON</button></>}
  <p className="note">这是原函数的四组图形数据；绘图使用坐标投影。纸张构造区可生成并采用经过独立等距检查的径向单瓣CP或原多瓣独立材料集合，原二维线图或柱面图不会直接安装为纸张。</p>
 </TessDialog>;
}
