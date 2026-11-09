import type {FoldedModelCollection} from './foldedModelCollection';
import {copyModelView,validateModelBoardPlacement} from './modelViewState';
import {defaultBoardPlacement} from './modelBoard';
import type {ModelExportFraming} from './foldedModelComparisonSVG';
import {startModelComparisonExport,type ModelComparisonExportTask,type ModelComparisonExportReply} from './modelComparisonExportTask';

/** Snapshot all visible models; serial workers avoid multiplying heavy shadow computations.
 * Both framing modes retain board positions; camera mode clips to saved pane rectangles.
 */
export function startModelBoardExport(collection:FoldedModelCollection,render:typeof startModelComparisonExport=startModelComparisonExport,framing:ModelExportFraming='full'):ModelComparisonExportTask{
 if(framing!=='full'&&framing!=='camera')throw new Error('整板导出范围无效。');
 const entries=collection.entries.map((entry,index)=>({entry,placement:entry.view?.board??defaultBoardPlacement(index)})).filter(({placement})=>placement.visible).map(({entry,placement})=>{
  validateModelBoardPlacement(placement);
  if(!entry.history.present)throw new Error('模型缺少可导出的结果。');
  return {id:entry.id,name:entry.name,result:structuredClone(entry.history.present),view:copyModelView(entry.view),placement:{...placement}};
 });
 if(!entries.length)throw new Error('没有可见模型，请先勾选要导出的模型。');
 // Match board paint order: inactive models in collection order, active model on top.
 entries.sort((a,b)=>Number(a.id===collection.activeId)-Number(b.id===collection.activeId));
 const width=Math.max(752,...entries.map(e=>e.placement.x+e.placement.width+16)),height=Math.max(480,...entries.map(e=>e.placement.y+e.placement.height+16));
 let cancelled=false,active:ModelComparisonExportTask|undefined;
 const stopped=():ModelComparisonExportReply=>({status:'cancelled',message:'整板导出已取消，未生成下载文件。'});
 const promise=(async():Promise<ModelComparisonExportReply>=>{
  const images:string[]=[];let bytes=0;
  try{
   for(const entry of entries){
    // Yield between models even when no shadow worker is needed, so Cancel can run.
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    if(cancelled)return stopped();
    active=render(entry.result,entry.name,entry.view,10_000,undefined,framing);
    const reply=await active.promise;active=undefined;
    if(cancelled||reply.status==='cancelled')return stopped();
    if(reply.status!=='complete')return {status:reply.status,message:`${entry.name}：${reply.message}`};
    const p=entry.placement,uri=encodeURIComponent(reply.svg).replace(/'/g,'%27');
    const image=`<svg x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}"><rect width="100%" height="100%" fill="#fffefb" stroke="#9faf99"/><image width="100%" height="100%" preserveAspectRatio="xMidYMid meet" href="data:image/svg+xml;charset=utf-8,${uri}"/></svg>`;
    bytes+=image.length;if(bytes>64*1024*1024)throw new Error('图板超过 64 MB，请隐藏部分模型后分开导出。');
    images.push(image);
   }
   if(cancelled)return stopped();
   return {status:'complete',svg:`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="board-title"><title id="board-title">折纸工坊 · ${framing==='camera'?'当前视图范围':'完整模型'}图板</title><desc>仅导出可见模型，保留摆放位置及组合布局；${framing==='camera'?'采用各小视图的相机矩形范围，含结果说明，不是界面截图':'模型完整显示，不采用交互相机的缩放裁切'}。结果不证明连续可折性。</desc><rect width="100%" height="100%" fill="#f4f3ec"/>${images.join('\n')}</svg>`};
  }catch(e){return {status:'error',message:`整板导出失败：${e instanceof Error?e.message:String(e)}`};}
  finally{active?.cancel();active=undefined;}
 })();
 return {promise,cancel(){cancelled=true;active?.cancel();}};
}
