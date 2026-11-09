import {useEffect,useRef,useState} from 'react';
import type {FlatFoldResult} from '../core/types';
import {flatPresentation} from '../app/flatPresentation';
import type {FlatSide} from '../app/flatPresentation';
import {foldedModelSVG} from '../app/foldedModelSVG';
import {download,safeName} from '../app/api';
import {downloadRaster,rasterizeSVG} from '../app/rasterExport';
import type {ModelColors} from '../app/modelColors';
import type {ModelShadowBoundaries} from '../app/modelShadowBoundaries';
import type {ModelViewState} from '../app/modelViewState';
import {startModelComparisonExport,type ModelComparisonExportTask} from '../app/modelComparisonExportTask';

export default function ModelImageExport({result,name,side,rotation=0,colors,shadows,xray,antiAlias=true,displayNumbers=false,disabled,singleDisabled=false,comparisonView,displayStyle}:{result:FlatFoldResult;name:string;side:FlatSide;rotation?:number;colors?:ModelColors;shadows?:ModelShadowBoundaries;xray:boolean;antiAlias?:boolean;displayNumbers?:boolean;disabled:boolean;singleDisabled?:boolean;comparisonView?:ModelViewState;displayStyle?:ModelViewState['displayStyle']}){
  const [format,setFormat]=useState<'svg'|'png'|'jpg'>('svg'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [scope,setScope]=useState('single');
  const combined=scope==='combined'&&!!comparisonView&&comparisonView.layout!==undefined&&comparisonView.layout!=='single';
  const blocked=disabled||(!combined&&singleDisabled);
  const alive=useRef(true),locked=useRef(false),cancelled=useRef(false),job=useRef<ModelComparisonExportTask|null>(null);
  function cancel(){cancelled.current=true;job.current?.cancel();}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancel();};},[]);
  useEffect(()=>{cancel();},[result]);
  async function exportImage(){
    if(locked.current||blocked)return;
    locked.current=true;cancelled.current=false;setBusy(true);setError('');
    try{
      // Capture geometry/presentation before any asynchronous raster encoding.
      const candidate=result.layers.status==='solved'?(result.layers.solutionIndex!==undefined?'第'+(result.layers.solutionIndex+1)+'解':'已确认未编号候选'):'未确认层序';
      const filename=safeName(name)+'-模型-'+candidate+'-'+(combined?(comparisonView!.layout==='four'&&comparisonView!.displayStyle!=='wire'?'四视图':'正背双视图'):(side==='front'?'正面':'背面')+(xray?'-X光':''))+'.'+format;
      let svg:string;
      const localRegions=displayStyle!=='wire'&&!xray&&result.layers.status==='solved'&&!flatPresentation(result,side,rotation).hasOrder;
      if(combined||localRegions){
        const task=startModelComparisonExport(result,name,combined?comparisonView!:{side,rotation,xray,colors,displayStyle,shadows:comparisonView?.shadows,antiAlias,displayNumbers,layout:'single',cameras:{}});job.current=task;
        const reply=await task.promise;job.current=null;
        if(cancelled.current||!alive.current)return;
        if(reply.status!=='complete')throw new Error(reply.message);
        svg=reply.svg;
      }else svg=foldedModelSVG(result,{name,side,xray,rotation,colors,shadows,displayStyle,antiAlias,displayNumbers});
      if(cancelled.current||!alive.current)return;
      if(format==='svg')download(svg,filename,'image/svg+xml');
      else {const blob=await rasterizeSVG(svg,format);if(alive.current&&!cancelled.current)downloadRaster(blob,filename);}
    }catch(e){if(alive.current&&!cancelled.current)setError(e instanceof Error?e.message:String(e));}
    finally{job.current=null;locked.current=false;if(alive.current){setBusy(false);if(cancelled.current)setError('已取消导出，未生成下载文件。');}}
  }
  return <>
    <select aria-label="模型图像格式" value={format} disabled={busy} onChange={e=>setFormat(e.target.value as typeof format)} title="输出完整模型及说明，非视图截图；PNG/JPG 最长边 2000 像素">
      <option value="svg">SVG · 矢量</option><option value="png">PNG · 无损</option><option value="jpg">JPG · 92% 质量</option>
    </select>
    {comparisonView?.layout&&comparisonView.layout!=='single'&&<select aria-label="模型导出范围" value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="single">单图</option><option value="combined">当前组合</option></select>}
    <button disabled={blocked||busy} onClick={()=>void exportImage()} title="输出完整模型，不含选择高亮或相机裁切；组合阴影每个方向最多计算 10 秒，使用点击时的显示设置">{busy?'正在生成模型图…':(combined?'导出组合 ':'导出模型 ')+format.toUpperCase()}</button>
    {busy&&<button onClick={cancel}>取消图像导出</button>}
    {error&&<span role="alert">{error}</span>}
  </>;
}
