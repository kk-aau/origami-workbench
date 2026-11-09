import {useEffect,useRef,useState} from 'react';
import {download} from '../app/api';
import {fetchPotCrossSection,potCrossSectionSVG,readPotCrossSectionQuery,type PotCrossSectionResult,type PotGraphicsOptions} from '../app/potCrossSectionGraphics';
import type {XY} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';
import './potCrossSectionGraphics.css';

export default function PotCrossSectionGraphicsDialog({points,onClose}:{points:XY[];onClose:()=>void}){
 const [text,setText]=useState(()=>JSON.stringify(points)),[options,setOptions]=useState<PotGraphicsOptions>({});
 const [result,setResult]=useState<PotCrossSectionResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),fileGeneration=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;fileGeneration.current++;};},[]);
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();setResult(null);setError('');
  let q;try{q=readPotCrossSectionQuery({family:'pot-cross-section-native',points:JSON.parse(text),graphicsOptions:options});}catch{}
  if(!q){setBusy(false);setError('原帮助须为非空有限二维点列；请检查七个显示选项的有限数值范围。');return;}
  setBusy(true);fetchPotCrossSection(q,controller.signal).then(r=>{if(id===generation.current)setResult(r);})
   .catch(e=>{if(id===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);})
   .finally(()=>{if(id===generation.current)setBusy(false);});
  return()=>controller.abort();
 },[text,options]);
 const option=(name:keyof PotGraphicsOptions,value:unknown)=>{
  fileGeneration.current++;
  setOptions(old=>{const next={...old};if(value===undefined)delete next[name];else (next as Record<string,unknown>)[name]=value;return next;});
 };
 const numeric=(name:keyof PotGraphicsOptions,value:string)=>option(name,value.trim()===''?undefined:Number(value));
 const size=options.ImageSize,width=Array.isArray(size)?size[0]:size,height=Array.isArray(size)?size[1]:undefined;
 const imageWidth=(value:string)=>{
  if(!value.trim())option('ImageSize',undefined);
  else option('ImageSize',height===undefined?Number(value):[Number(value),height]);
 };
 const imageHeight=(value:string)=>option('ImageSize',value.trim()===''?width??undefined:[width??320,Number(value)]);
 const origin=options.AxesOrigin??[0,0],axes=Array.isArray(options.Axes)?options.Axes.some(Boolean):!!options.Axes;
 const range=Array.isArray(options.PlotRange)?options.PlotRange:null;
 const load=async(file:File)=>{
  const fileId=++fileGeneration.current;generation.current++;setResult(null);setBusy(false);
  if(file.size>100000){setError('参数文件过大，请使用仅含点列与显示选项的源JSON。');return;}
  try{const q=readPotCrossSectionQuery(JSON.parse(await file.text()));if(!q)throw Error('不是有效的原对称剖面参数。');
   if(mounted.current&&fileId===fileGeneration.current){setText(JSON.stringify(q.points));setOptions(q.graphicsOptions);setError('');}
  }catch(e){if(mounted.current&&fileId===fileGeneration.current){setError((e as Error).message);}}
 };
 return <TessDialog title="原对称剖面 · PotCrossSectionGraphics" className="pot-cross-section-dialog" onClose={onClose}>
  <p className="pot-cross-section-note">参考图将首点平移到(0,0)，再镜像；当前壶体剖面与点编辑保持原坐标。</p>
  <div className="pot-cross-section-options">
   <label><input aria-label="对称剖面坐标轴" type="checkbox" checked={axes} onChange={e=>option('Axes',e.target.checked)}/>坐标轴</label>
   <label><input aria-label="对称剖面外框" type="checkbox" checked={!!options.Frame} onChange={e=>option('Frame',e.target.checked)}/>外框</label>
   <label>背景<select aria-label="对称剖面背景" value={typeof options.Background==='object'?'RGBColor':options.Background??'None'} onChange={e=>option('Background',e.target.value)}><option value="None">透明</option><option value="White">白色</option><option value="Black">黑色</option>{typeof options.Background==='object'&&<option value="RGBColor">原RGB颜色</option>}</select></label>
   <label>纵横比例<input aria-label="对称剖面纵横比例" type="number" min=".05" max="20" step=".05" placeholder="Automatic" value={typeof options.AspectRatio==='number'?options.AspectRatio:''} onChange={e=>numeric('AspectRatio',e.target.value)}/></label>
   <label>宽度 / pt<input aria-label="对称剖面宽度" type="number" min="20" max="1200" placeholder="自动" value={width??''} onChange={e=>imageWidth(e.target.value)}/></label>
   <label>高度 / pt<input aria-label="对称剖面高度" type="number" min="20" max="1200" placeholder="按纵横比例" value={height??''} onChange={e=>imageHeight(e.target.value)}/></label>
   <label>显示范围<select aria-label="对称剖面显示范围" value={range?'explicit':'All'} onChange={e=>option('PlotRange',e.target.value==='All'?'All':[[-2,2],[0,4]])}><option value="All">全部</option><option value="explicit">显式边界</option></select></label>
   {axes&&<><label>轴交点 X<input aria-label="对称剖面轴交点X" type="number" value={origin[0]} onChange={e=>option('AxesOrigin',[Number(e.target.value),origin[1]])}/></label><label>轴交点 Y<input aria-label="对称剖面轴交点Y" type="number" value={origin[1]} onChange={e=>option('AxesOrigin',[origin[0],Number(e.target.value)])}/></label></>}
  </div>
  {range&&<div className="pot-cross-section-range">{['X下界','X上界','Y下界','Y上界'].map((label,i)=><label key={label}>{label}<input type="number" aria-label={`对称剖面${label}`} value={range[Math.floor(i/2)][i%2]} onChange={e=>{const next=structuredClone(range);next[Math.floor(i/2)][i%2]=Number(e.target.value);option('PlotRange',next);}}/></label>)}</div>}
  <div className="pot-cross-section-plot" aria-label="原对称剖面参考图" aria-busy={busy}>
   {result&&<div dangerouslySetInnerHTML={{__html:potCrossSectionSVG(result)}}/>}
  </div>
  {result&&<p className="pot-cross-section-status" role="status">2条原Line · 每条{result.query.points.length}点 · 原首点({result.source.referenceOrigin.join(', ')})仅在参考中归零</p>}
  {busy&&<p className="pot-cross-section-status" role="status">更新原对称剖面…</p>}
  {error&&<p className="pot-cross-section-error" role="alert">{error}</p>}
  <details className="pot-cross-section-input"><summary>原点列与参数文件</summary>
   <label>原点列 JSON<textarea aria-label="对称剖面原点列JSON" value={text} onChange={e=>{fileGeneration.current++;setText(e.target.value);}} spellCheck={false}/></label>
   <div className="pot-cross-section-source-actions"><label>载入源JSON<input aria-label="载入原对称剖面参数文件" type="file" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.target.value='';}}/></label><button onClick={()=>setText('[[3,7],[4,8],[4,9],[2.5,10]]')}>偏移首点示例</button><button onClick={()=>setOptions({})}>恢复无显示选项</button></div>
  </details>
  <footer className="pot-cross-section-downloads"><button disabled={!result||busy} onClick={()=>result&&download(JSON.stringify(result.query,null,2),'PotCrossSectionGraphics-source.json')}>导出源JSON</button><button disabled={!result||busy} onClick={()=>result&&download(JSON.stringify(result,null,2),'PotCrossSectionGraphics-data.json')}>导出完整原图形JSON</button><button disabled={!result||busy} onClick={()=>result&&download(potCrossSectionSVG(result),'PotCrossSectionGraphics.svg','image/svg+xml')}>导出参考SVG</button></footer>
 </TessDialog>;
}
