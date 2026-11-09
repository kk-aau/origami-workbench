import {useEffect,useRef,useState} from 'react';
import type {FoldedModelCollection} from '../app/foldedModelCollection';
import {startModelBoardExport} from '../app/modelBoardExportTask';
import type {ModelComparisonExportTask} from '../app/modelComparisonExportTask';
import {download} from '../app/api';
import {downloadRaster,rasterizeSVG} from '../app/rasterExport';
import type {ModelExportFraming} from '../app/foldedModelComparisonSVG';

export default function ModelBoardExport({models}:{models:FoldedModelCollection}){
 const [format,setFormat]=useState<'svg'|'png'|'jpg'>('svg'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [framing,setFraming]=useState<ModelExportFraming>('full');
 const alive=useRef(true),locked=useRef(false),cancelled=useRef(false),job=useRef<ModelComparisonExportTask|null>(null);
 function cancel(){cancelled.current=true;job.current?.cancel();}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancel();};},[]);
 async function exportBoard(){
  if(locked.current)return;locked.current=true;cancelled.current=false;setBusy(true);setMessage('');
  try{
   const task=startModelBoardExport(models,undefined,framing);job.current=task;const reply=await task.promise;job.current=null;
   if(!alive.current||cancelled.current)return;
   if(reply.status!=='complete')throw new Error(reply.message);
   const filename='折纸工坊-'+(framing==='camera'?'当前视图范围':'完整模型')+'图板.'+format;
   if(format==='svg')download(reply.svg,filename,'image/svg+xml');
   else {const blob=await rasterizeSVG(reply.svg,format);if(alive.current&&!cancelled.current)downloadRaster(blob,filename);}
  }catch(e){if(alive.current&&!cancelled.current)setMessage(e instanceof Error?e.message:String(e));}
  finally{job.current=null;locked.current=false;if(alive.current){setBusy(false);if(cancelled.current)setMessage('已取消整板导出，未生成下载文件。');}}
 }
 return <div className="model-board-export">
  <select aria-label="整板图像格式" value={format} disabled={busy} onChange={e=>setFormat(e.target.value as typeof format)}><option value="svg">SVG</option><option value="png">PNG</option><option value="jpg">JPG</option></select>
  <select aria-label="整板导出范围" value={framing} disabled={busy} onChange={e=>setFraming(e.target.value as ModelExportFraming)} style={{maxWidth:130}}><option value="full">完整模型</option><option value="camera">当前视图范围</option></select>
  <button disabled={busy||!models.entries.some(e=>e.view?.board?.visible!==false)} onClick={()=>void exportBoard()} title="保留点击时可见模型的位置/尺寸/布局；当前视图范围采用相机矩形，附结果说明，不是界面截图。阴影每方向最多10秒；PNG/JPG最长边2000像素。">{busy?'正在生成图板…':framing==='camera'?'导出视图图板':'导出完整图板'}</button>
  {busy&&<button onClick={cancel}>取消整板导出</button>}{message&&<span role="alert">{message}</span>}
 </div>;
}
