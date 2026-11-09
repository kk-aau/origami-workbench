import {useEffect,useRef,useState} from 'react';
import {confirmAction} from '../app/confirmAction';
import type {FlatFoldResult} from '../core/types';
import {startLayerBatch,type LayerBatchResult} from '../app/layerBatch';
import {layerBatchDocument} from '../app/layerBatchDocument';
import {download,safeName} from '../app/api';
import type {ModelViewState} from '../app/modelViewState';

/** Always mounted: navigating away cancels work but keeps completed results available. */
export default function LayerBatchPanel({result,name,disabled,visible,timeoutMs,xray,view}:{result:FlatFoldResult|null;name:string;disabled:boolean;visible:boolean;timeoutMs:number;xray:boolean;view?:ModelViewState}){
  const [count,setCount]=useState('100'),[side,setSide]=useState<'front'|'back'>('front');
  const [running,setRunning]=useState(false),[completed,setCompleted]=useState(0),[error,setError]=useState('');
  const [saved,setSaved]=useState<{name:string;result:LayerBatchResult}|null>(null);
  const job=useRef<ReturnType<typeof startLayerBatch>|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;job.current?.cancel();};},[]);
  useEffect(()=>{job.current?.cancel();},[result,disabled,visible]);
  useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(running||saved?.result.items.length){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[running,saved]);
  const amount=Number(count),valid=/^\d+$/.test(count)&&Number.isInteger(amount)&&amount>=1&&amount<=100;
  async function start(){
    if(job.current||disabled||!visible||!result||!valid)return;
    if(saved?.result.items.length&&!confirmAction('新批次会替换此前保留的结果图。请先下载并确认保存成功，是否继续？'))return;
    setError('');
    try{
      const task=startLayerBatch(result,{name,side,xray,rotation:view?.rotation,colors:view?.colors,shadows:view?.shadows,antiAlias:view?.antiAlias,displayNumbers:view?.displayNumbers,displayStyle:view?.displayStyle,count:amount,timeoutMs,onProgress:p=>{if(mounted.current)setCompleted(p.completed);}});
      job.current=task;setSaved(null);setCompleted(0);setRunning(true);
      const output=await task.promise;
      if(mounted.current)setSaved({name,result:output});
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}
    finally{job.current=null;if(mounted.current)setRunning(false);}
  }
  function exportBatch(){if(!saved)return;try{download(layerBatchDocument(saved.result,saved.name),safeName(saved.name)+'-候选图册.html','text/html;charset=utf-8');setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}
  return <section aria-label="批量候选输出" hidden={!visible}>
    <h2>批量候选输出</h2>
    <p className="note">从当前候选的下一解开始；无已确认候选时从第 1 解开始。不会切换当前模型。</p>
    <label className="select-field">每批数量<input aria-label="批量候选数量" inputMode="numeric" value={count} onChange={e=>setCount(e.target.value)} disabled={running} style={{width:'100%',minWidth:0}}/></label>
    <label className="select-field">输出方向<select aria-label="批量输出方向" value={side} onChange={e=>setSide(e.target.value as 'front'|'back')} disabled={running}><option value="front">正面</option><option value="back">背面</option></select></label>
    <button className="outline full" disabled={running||disabled||!valid||result?.geometry.status!=='ready'} onClick={()=>void start()}>批量计算候选</button>
    {!valid&&<p className="note warning">每批请输入 1—100 的整数。</p>}
    {running&&<><progress aria-label="批量输出进度" max={amount} value={completed} style={{width:'100%'}}/><p className="note" role="status">已完成 {completed} 个，正在计算下一候选…</p><button className="outline full" onClick={()=>job.current?.cancel()}>停止批量计算</button></>}
    {saved&&<><p className="note" role="status" data-batch-status={saved.result.status}>{saved.name} · 保留 {saved.result.items.length} 个结果。{saved.result.message}</p><button className="outline full" onClick={exportBatch}>下载候选图册</button></>}
    {error&&<p className="note warning" role="alert">{error}</p>}
    <p className="note">每解使用启动时的显示样式（当前{view?.displayStyle==='wire'?'线框':'纸面'}）、X 光、模型配色、阴影（当前{view?.shadows?'开启':'关闭'}）、抗锯齿（当前{view?.antiAlias===false?'关闭':'开启'}）、面编号（当前{view?.displayNumbers?'开启':'关闭'}）与旋转角度（当前 {view?.rotation??0}°）。层序与阴影各自使用一次时间预算；X 光及线框不绘制阴影。正背面按本面板的输出方向选择。批次运行中修改显示设置不会改变本批图像。切换页面或修改模型将停止本批并保留结果。SVG 内容预算 64 MB；图册编码后更大。下载后请确认文件成功保存，关闭页面仍会提醒。</p>
  </section>;
}
