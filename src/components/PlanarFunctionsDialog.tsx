import {useEffect,useMemo,useRef,useState} from 'react';
import {PLANAR_FUNCTION_PRESETS,fetchPlanarFunctions,validatePlanarFunctionQuery,type PlanarFunctionQuery,type PlanarFunctionResult} from '../app/planarFunctions';
import {download} from '../app/api';
import {TessDialog} from './TessellationEditor';
import './PlanarFunctionsDialog.css';
const display=(value:number)=>String(Number(value.toPrecision(8)));
function Points({result}:{result:PlanarFunctionResult}){
 const points=result.sample.rows.filter(row=>row.values!==null).map(row=>row.values!),xy=points.map(p=>p.length===2?[p[0],-p[1]]:[.866*p[0]-.5*p[1],.25*p[0]+.433*p[1]-.866*p[2]]),xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]),lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)],span=Math.max(hi[0]-lo[0],hi[1]-lo[1],1e-6),margin=span*.12;
 if(!points.length)return <p className="pf-empty">当前求值点的保留分量均未定义。</p>;
 return <svg role="img" aria-label="转换后的函数求值点" viewBox={`${lo[0]-margin} ${lo[1]-margin} ${hi[0]-lo[0]+2*margin} ${hi[1]-lo[1]+2*margin}`}>
  <line x1={lo[0]-margin} y1="0" x2={hi[0]+margin} y2="0" className="pf-axis" vectorEffect="non-scaling-stroke"/><line x1="0" y1={lo[1]-margin} x2="0" y2={hi[1]+margin} className="pf-axis" vectorEffect="non-scaling-stroke"/>
  {xy.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={span*.009} className="pf-point"><title>{points[i].map(display).join(', ')}</title></circle>)}
 </svg>;
}
export default function PlanarFunctionsDialog({onClose}:{onClose:()=>void}){
 const [mode,setMode]=useState<PlanarFunctionQuery['mode']>('planarize'),[form,setForm]=useState<'slots'|'parameters'>('slots'),[names,setNames]=useState('x'),[arity,setArity]=useState('1'),[body,setBody]=useState(PLANAR_FUNCTION_PRESETS.planarize.input.body),[args,setArgs]=useState(JSON.stringify(PLANAR_FUNCTION_PRESETS.planarize.arguments)),[result,setResult]=useState<PlanarFunctionResult|null>(null),[status,setStatus]=useState('等待求值'),file=useRef<HTMLInputElement>(null),generation=useRef(0);
 const input=useMemo(()=>{try{const query=validatePlanarFunctionQuery({family:'planar-functions-native',mode,input:form==='slots'?{form,arity:Number(arity),body}:{form,parameters:names.trim()?names.split(',').map(s=>s.trim()):[],body},arguments:JSON.parse(args)});return {query,error:null};}catch(error){return {query:null,error:(error as Error).message};}},[mode,form,names,arity,body,args]);
 const clear=()=>{++generation.current;setResult(null);setStatus('等待求值');},reset=(nextMode:PlanarFunctionQuery['mode'],nextForm?:'slots'|'parameters')=>{clear();const preset=structuredClone(PLANAR_FUNCTION_PRESETS[nextMode]),selected=nextForm??preset.input.form;setMode(nextMode);setForm(selected);setNames('x');setArity('1');setBody(preset.input.body.map(s=>selected==='slots'?s.replace(/\bx\b/g,'#'):s.replace(/#/g,'x')));setArgs(JSON.stringify(preset.arguments));};
 useEffect(()=>{const id=++generation.current,controller=new AbortController();setResult(null);if(!input.query){setStatus(input.error!);return()=>controller.abort();}setStatus('计算中');const timer=setTimeout(()=>fetchPlanarFunctions(input.query!,controller.signal).then(r=>{if(id===generation.current){setResult(r);setStatus(r.sample.rows.every(row=>row.values!==null)?'转换与求值完成':'转换完成 · 部分求值点未定义');}}).catch(error=>{if(id===generation.current)setStatus((error as Error).message);}),120);return()=>{++generation.current;clearTimeout(timer);controller.abort();};},[input]);
 return <TessDialog title="平面函数嵌入" onClose={onClose}><div className="planar-function-dialog">
  <aside className="pf-controls"><p className="pf-description">截取前两分量，或为二维函数追加零分量。参数与保留分量保持原值。</p>
   <label>转换<select aria-label="平面函数转换" value={mode} onChange={e=>reset(e.target.value as typeof mode)}><option value="planarize">Planarize · 3D → 2D</option><option value="unplanarize">Unplanarize · 2D → 3D</option></select></label>
   <label>函数形式<select aria-label="平面函数形式" value={form} onChange={e=>reset(mode,e.target.value as typeof form)}><option value="slots">纯 Slot 函数</option><option value="parameters">显式参数函数</option></select></label>
   {form==='slots'?<label>参数个数<input aria-label="平面函数参数个数" type="number" min="1" max="8" value={arity} onChange={e=>{clear();setArity(e.target.value);}}/></label>:<label>参数名称<input aria-label="平面函数参数名称" value={names} onChange={e=>{clear();setNames(e.target.value);}} placeholder="x, y"/></label>}
   <fieldset><legend>原函数返回列表</legend>{body.map((source,i)=><label key={i}><span>分量 {i+1}</span><input aria-label={`平面函数分量 ${i+1}`} value={source} spellCheck={false} onChange={e=>{clear();setBody(body.map((s,j)=>j===i?e.target.value:s));}}/></label>)}</fieldset>
   <label className="pf-arguments">参数求值点<textarea aria-label="平面函数求值点" value={args} spellCheck={false} onChange={e=>{clear();setArgs(e.target.value);}}/></label><small>每行参数构成一个数组；多参数例：[[0,1],[1,2]]。最多129点。</small>
   <div className="pf-storage"><button disabled={!input.query} onClick={()=>download(JSON.stringify(input.query,null,2),'平面函数源.json')}>保存源</button><button onClick={()=>file.current?.click()}>载入源</button><button onClick={()=>reset(mode)}>重置</button></div>
   <input hidden ref={file} type="file" accept=".json,application/json" aria-label="载入平面函数源文件" onChange={async e=>{const node=e.currentTarget,selected=node.files?.[0];if(!selected)return;clear();const id=generation.current;try{if(selected.size>32768)throw Error('源文件超过32KB。');const text=await selected.text();if(id!==generation.current)return;const query=validatePlanarFunctionQuery(JSON.parse(text));setMode(query.mode);setForm(query.input.form);setBody(query.input.body);setArgs(JSON.stringify(query.arguments));if(query.input.form==='slots')setArity(String(query.input.arity));else setNames(query.input.parameters.join(', '));}catch(error){if(id===generation.current)setStatus((error as Error).message);}finally{if(id===generation.current)node.value='';}}}/>
  </aside>
  <main className="pf-results"><div className="pf-status" role="status" data-ready={!!result}>{status}</div><div className="pf-transformed"><span>转换后的函数</span><code>{result?`${result.convertedFunction.form==='slots'?'Slot('+result.convertedFunction.arity+')':'('+result.convertedFunction.parameters.join(', ')+')'} → {${result.convertedFunction.body.join(', ')}}`:'等待有效来源'}</code></div>
   <div className="pf-plot">{result?<Points result={result}/>:<p className="pf-empty">函数求值点预览</p>}</div>
   <div className="pf-table"><table aria-label="平面函数求值结果"><thead><tr><th>原参数</th><th>返回列表</th></tr></thead><tbody>{result?.sample.rows.map((row,i)=><tr key={i}><td>{row.arguments.map(display).join(', ')||'无参数'}</td><td title={row.error??JSON.stringify(row.values)}>{row.values?row.values.map(display).join(', '):'保留分量未定义'}</td></tr>)}</tbody></table></div>
   <footer><span>{result?.source.definitionCell??(mode==='planarize'?'In[3844]':'In[3849]')}</span><button disabled={!result} onClick={()=>download(JSON.stringify(result,null,2),'平面函数完整结果.json')}>导出完整结果</button><button className="primary" onClick={onClose}>关闭</button></footer>
  </main>
 </div></TessDialog>;
}
