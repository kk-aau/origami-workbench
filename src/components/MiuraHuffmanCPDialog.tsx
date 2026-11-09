import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import {generateMiuraHuffmanDocument,miuraHuffmanPreset,validateMiuraHuffmanRecipe,type MiuraHuffmanRecipe} from '../app/miuraHuffmanCP';
import type {Doc} from '../core/types';
import {buildOriginalArrayStatic3D} from '../app/originalArrayStatic3D';
import OriginalArrayStatic3DPlot,{INITIAL_ORIGINAL_ARRAY_CAMERA,type OriginalArrayCamera} from './OriginalArrayStatic3DPlot';
import './MiuraHuffmanCPDialog.css';

type Draft=Record<keyof MiuraHuffmanRecipe,string>;
const modelLabels={miura:'Miura-ori',mars:'Mars',huffman:'Huffman'};
const draftFor=(p:MiuraHuffmanRecipe)=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,String(v)])) as Draft;
function parse(d:Draft){if(Object.values(d).some(v=>!v.trim()))throw Error('请填写完整原版网格参数。');return validateMiuraHuffmanRecipe({...Object.fromEntries(Object.entries(d).filter(([k])=>k!=='model').map(([k,v])=>[k,Number(v)])),model:d.model});}

/** Show the actual indexed material boundary, including negative source x. */
export function MiuraHuffmanCPPlot({doc}:{doc:Doc}){
 const svg=useRef<SVGSVGElement>(null),[label,setLabel]=useState<number|null>(null);
 const xs=doc.segments.flatMap(s=>[s.a[0],s.b[0]]),ys=doc.segments.flatMap(s=>[s.a[1],s.b[1]]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),
  span=Math.max(maxX-minX,maxY-minY),pad=span*.2,labelSize=label??span*.043,step=Math.pow(10,Math.floor(Math.log10(span/4))),tick=span/step>8?step*2:step,
  xTicks=Array.from({length:Math.ceil((maxX-minX)/tick)+1},(_,i)=>Math.ceil(minX/tick)*tick+i*tick).filter(x=>x<=maxX),
  yTicks=Array.from({length:Math.ceil((maxY-minY)/tick)+1},(_,i)=>Math.ceil(minY/tick)*tick+i*tick).filter(y=>y<=maxY),
  yAxis=minX-pad*.15,xAxis=-minY+pad*.35,fmt=(x:number)=>Number(x.toPrecision(4)).toString();
 useEffect(()=>{const element=svg.current;if(!element)return;const update=()=>{const m=element.getScreenCTM(),scale=m?Math.hypot(m.a,m.b):0;if(scale>0)setLabel(12.1/scale);};const observer=new ResizeObserver(update);observer.observe(element);update();return ()=>observer.disconnect();},[minX,maxX,minY,maxY]);
 return <svg ref={svg} role="img" aria-label="原版四边网格实际纸面、毫米坐标与标尺" data-testid="miura-huffman-mm-plot" data-coordinate-unit="mm"
  viewBox={`${minX-pad} ${-maxY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}`} preserveAspectRatio="xMidYMid meet">
  <g className="mhcp-grid">{xTicks.map(x=><line key={'x'+x} x1={x} x2={x} y1={-minY} y2={-maxY}/>)}{yTicks.map(y=><line key={'y'+y} x1={minX} x2={maxX} y1={-y} y2={-y}/>)}</g>
  {doc.segments.map(s=><line key={s.id} data-segment-id={s.id} data-assignment={s.assignment} x1={s.a[0]} y1={-s.a[1]} x2={s.b[0]} y2={-s.b[1]} className={s.assignment==='B'?'mhcp-boundary':'mhcp-result'}/>)}
  <g className="mhcp-ruler" fontSize={labelSize}><path d={`M ${minX} ${xAxis} H ${maxX} M ${yAxis} ${-maxY} V ${-minY}`}/>
   {xTicks.map(x=><text key={x} x={x} y={xAxis+labelSize*1.2} textAnchor="middle">{fmt(x)}</text>)}
   {yTicks.map(y=><text key={y} x={yAxis-labelSize*.25} y={-y+labelSize*.3} textAnchor="end">{fmt(y)}</text>)}
   <text x={maxX} y={-maxY-labelSize*.7} textAnchor="end">x / mm · y / mm</text>
   <path data-testid="miura-huffman-mm-scale" data-mm={tick} d={`M ${minX} ${-maxY-labelSize*.6} h ${tick}`}/>
   <text x={minX+tick/2} y={-maxY-labelSize*1.2} textAnchor="middle">{fmt(tick)} mm</text>
  </g>
 </svg>;
}

export default function MiuraHuffmanCPDialog({initial,onAdoptCP,onClose}:{initial?:MiuraHuffmanRecipe;onAdoptCP?:(doc:Doc)=>boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),lastPreview=useRef<Doc|null>(null),[draft,setDraft]=useState(()=>draftFor(initial??miuraHuffmanPreset())),[cp,setCP]=useState<Doc|null>(null),
  [status,setStatus]=useState<'checking'|'ready'|'error'>('checking'),[error,setError]=useState(''),[adoptError,setAdoptError]=useState(''),[view,setView]=useState<'cp'|'static-3d'>('cp'),[camera,setCamera]=useState<OriginalArrayCamera>(()=>({...INITIAL_ORIGINAL_ARRAY_CAMERA}));
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(e){return {recipe:null,error:(e as Error).message};}},[draft]);
 useEffect(()=>openAppDialog(dialog.current),[]);
 useEffect(()=>{setCP(null);setError('');setAdoptError('');if(!input.recipe){setStatus('error');return;}setStatus('checking');
  const frame=requestAnimationFrame(()=>{try{const doc=generateMiuraHuffmanDocument(input.recipe!);setCP(doc);setStatus('ready');}catch(e){setError((e as Error).message);setStatus('error');}});
  return ()=>cancelAnimationFrame(frame);
 },[input]);
 if(cp)lastPreview.current=cp;
 const displayed=cp??lastPreview.current,spatial=useMemo(()=>{if(!displayed)return {reference:null,error:''};try{return {reference:buildOriginalArrayStatic3D(displayed),error:''};}catch(e){return {reference:null,error:(e as Error).message};}},[displayed]),previewModel=(displayed?.metadata?.originalMiuraHuffman as {recipe:MiuraHuffmanRecipe}|undefined)?.recipe.model,
  edit=(key:keyof Draft,value:string)=>{setCP(null);setStatus('checking');setDraft(d=>({...d,[key]:value}));},
  model=draft.model as MiuraHuffmanRecipe['model'],graph=(cp?.metadata?.materialTopology as any)?.graph,
  field=(key:keyof Draft,label:string,min:number,max:number,step='any')=><label key={key} className="mhcp-field"><span>{label}</span>
   {key==='minorFoldAngleDeg'?<div className="mhcp-fold-control"><input aria-label={label} type="number" value={draft[key]} min={min} max={max} step={step} onChange={e=>edit(key,e.target.value)}/><input aria-label="种子小折角滑条 / °" type="range" min={min} max={max} step="1" value={Number(draft[key])||0} onChange={e=>edit(key,e.target.value)}/></div>:<input aria-label={label} type="number" value={draft[key]} min={min} max={max} step={step} onChange={e=>edit(key,e.target.value)}/>}</label>,
  adopt=()=>{if(!cp||!onAdoptCP)return;try{setAdoptError('');if(onAdoptCP(structuredClone(cp)))onClose();}catch(e){setAdoptError((e as Error).message);}};
 return <dialog ref={dialog} className="mhcp-dialog ui-dialog" data-testid="miura-huffman-dialog" aria-labelledby="mhcp-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><span>ORIGINAL DIRECT QUAD MESH</span><button aria-label="关闭原版四边网格" onClick={onClose}>×</button></header>
  <div className="mhcp-workspace"><aside className="mhcp-controls"><h2 id="mhcp-title">原版四边镶嵌</h2><p>调整种子和边长，生成可保存、编辑的有限纸面。</p>
   <label className="mhcp-field"><span>原版构造</span><select aria-label="原版构造" value={draft.model} onChange={e=>{setCP(null);setStatus('checking');setDraft(draftFor(miuraHuffmanPreset(e.target.value as MiuraHuffmanRecipe['model'])));}}>
    {Object.entries(modelLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   <div className="mhcp-fields">{field('columns','水平面数 / 列',1,12,'1')}{field('rows','垂直面数 / 行',1,12,'1')}
    {field('length1','第一边长 / mm',.1,200)}{field('length2','第二边长 / mm',.1,200)}
    {field('sectorAngleDeg','种子扇区角 / °',5,175)}{field('minorFoldAngleDeg','种子小折角 / °',-175,175)}</div>
   <button className="mhcp-preset" onClick={()=>{setCP(null);setStatus('checking');setDraft(draftFor(miuraHuffmanPreset(model)));}}>恢复 {modelLabels[model]} 代表参数</button>
   <p className="mhcp-note">边长直接使用毫米；原点和负坐标保持不变。正负小折角驱动原山谷及静态 3D；每次核验整面闭环，连续折叠与碰撞未认证。</p>
   <dl><div><dt>构造方法</dt><dd>{model==='huffman'?'原闭合长度方程':'原直接点递推'}</dd></div><div><dt>实际纸面</dt><dd>{cp?`${graph.vertices_coords.length} 点 / ${graph.edges_vertices.length} 边 / ${graph.faces_vertices.length} 面`:'等待有效参数'}</dd></div></dl>
  </aside><main className="mhcp-results"><div className="mhcp-heading"><strong>{modelLabels[previewModel??model]}</strong><nav className="original-array-view-tabs" aria-label="四边网格视图"><button type="button" aria-pressed={view==='cp'} onClick={()=>setView('cp')}>原 CP</button><button type="button" aria-pressed={view==='static-3d'} onClick={()=>setView('static-3d')}>原静态 3D</button></nav></div>
   <div className="mhcp-plot-slot" data-testid="miura-huffman-plot-slot" data-current={!!cp}>{view==='static-3d'?spatial.reference?<OriginalArrayStatic3DPlot reference={spatial.reference} current={!!cp} camera={camera} onCameraChange={setCamera}/>:<div className="mhcp-placeholder">{spatial.error||'等待有效原参数的静态构形…'}{cp?' 二维 CP 仍可采用。':''}</div>:displayed?<MiuraHuffmanCPPlot doc={displayed}/>:<div className="mhcp-placeholder">{status==='checking'?'正在检查有限纸面…':'当前参数没有可采用的纸面'}</div>}</div>
   <p role="status" data-testid="miura-huffman-status" data-state={cp?'ready':status} className="mhcp-status">{input.error||error||(cp?`纸面边界与逐面几何通过 · ${model==='huffman'?'In[2468]':'In[2482] / In[2484]'} 原山谷及目标角`:'正在构造并检查原版网格…')}{!cp&&displayed?' 当前显示上次已核验参数的纸面，当前参数不能采用。':''}</p>
   <p className="mhcp-scope">{view==='static-3d'&&spatial.reference?`静态等距 ${spatial.reference.proof.maximumFaceDistanceErrorMm.toExponential(1)} mm · 全邻面闭环 ${spatial.reference.proof.maximumFacePoseClosureErrorMm.toExponential(1)} mm。 `:''}采用保留二维 CP；3D 仅预览，不添加平折、全局层序、运动或碰撞证书。</p>
   {adoptError&&<p className="mhcp-error" role="alert">{adoptError}</p>}
  </main></div><footer><span>原参数、原种子和实际材料图随工程保存。</span><button onClick={onClose}>取消</button><button className="primary" disabled={!cp||!onAdoptCP} onClick={adopt}>采用原版网格 CP →</button></footer>
 </dialog>;
}
