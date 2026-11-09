import {Zip,ZipPassThrough} from 'fflate';
import type {DiagramCPState,DiagramProject,DiagramStep} from './diagramProject';
import {diagramPDFStepArtwork,type DiagramPDFPreparationOptions} from './diagramPDF';
import {diagramPDFCellContent,planDiagramPDF,type DiagramPDFOptions,type DiagramPDFRect} from './diagramPDFLayout';
import {embedDiagramPDFSVG,normalizeDiagramPDFStrokes} from './diagramPDFPage';
import {readDiagramLineDefaults,type DiagramLineDefaults} from './diagramLineStyles';
import {readAdaptiveLineStyle} from './adaptiveLineStyle';
import type {DiagramZoomRegion} from './diagramZoomGeometry';
import {diagramStepZooms} from './diagramStepZoom';
import {startDiagramLayerDisplayPreparation} from './diagramLayerDisplay';
import {rasterizeDiagramThumbnail} from './diagramThumbnailRaster';

export interface DiagramStepImagePanel {stepIndex:number;size:Pick<DiagramPDFRect,'width'|'height'>}
const cancelled=()=>new DOMException('步骤图片导出已取消。','AbortError');
function checkCancelled(signal?:AbortSignal){if(signal?.aborted)throw cancelled();}

/** Use the actual PDF panel dimensions, including first-page layout and the
 * caption space. The image itself contains artwork only, with no page text. */
export function diagramStepImagePanels(project:DiagramProject,options:DiagramPDFOptions):DiagramStepImagePanel[] {
  const plan=planDiagramPDF(project,options),panels=new Map<number,DiagramStepImagePanel>();
  for(const page of plan.pages)for(const cell of page.cells){
    const {width,height}=diagramPDFCellContent(project.steps[cell.stepIndex],cell,options,plan).imageRect;
    panels.set(cell.stepIndex,{stepIndex:cell.stepIndex,size:{width,height}});
  }
  return plan.selected.map(index=>{const panel=panels.get(index);if(!panel)throw new Error(`第 ${index+1} 步缺少图片排版范围。`);return panel;});
}

/** Shared panel wrapper for cached thumbnails and image export. Stroke
 * normalization is deliberately performed by the browser caller afterwards. */
export function diagramStepImageSVG(step:DiagramStep,states:readonly DiagramCPState[],size:Pick<DiagramPDFRect,'width'|'height'>,palette:DiagramLineDefaults,adaptiveLines:boolean,zoom?:DiagramZoomRegion|null):string {
  if(!(size.width>0&&size.height>0&&Number.isFinite(size.width)&&Number.isFinite(size.height)))throw new Error('步骤图片排版尺寸无效。');
  const artwork=diagramPDFStepArtwork(step,states,size,palette,adaptiveLines,zoom);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif"><rect width="${size.width}" height="${size.height}" fill="white"/>${embedDiagramPDFSVG(artwork,{x:0,y:0,...size},'step-image-')}</svg>`;
}

export function diagramStepImageFilename(step:DiagramStep,index:number):string {
  const title=step.title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,100)||'步骤';
  return `${String(index+1).padStart(3,'0')}_${title}.png`;
}

/** Canvas encoders usually label PNGs as 96 DPI. Replace only that metadata;
 * the 300-DPI panel pixels, colour profiles and all other chunks stay intact. */
export function diagramImagePNG300DPI(input:Uint8Array):Uint8Array<ArrayBuffer> {
  const signature=[137,80,78,71,13,10,26,10];
  if(input.length<33||signature.some((byte,index)=>input[index]!==byte))throw new Error('步骤图片不是有效的 PNG 文件。');
  // pHYs: 11811 pixels/metre on each axis, unit=metre. Its standard PNG CRC32
  // over "pHYs" and these nine payload bytes is 0x78a53f76.
  const resolution=Uint8Array.from([0,0,0,9,112,72,89,115,0,0,46,35,0,0,46,35,1,120,165,63,118]);
  const view=new DataView(input.buffer,input.byteOffset,input.byteLength),chunks=[input.subarray(0,8)];let ended=false;
  for(let cursor=8;cursor<input.length;){
    if(cursor+12>input.length)throw new Error('步骤 PNG 数据不完整。');
    const size=view.getUint32(cursor),end=cursor+12+size,type=String.fromCharCode(...input.subarray(cursor+4,cursor+8));
    if(end>input.length||cursor===8&&(type!=='IHDR'||size!==13))throw new Error('步骤 PNG 数据不完整。');
    if(type!=='pHYs')chunks.push(input.subarray(cursor,end));
    if(cursor===8)chunks.push(resolution);
    cursor=end;
    if(type==='IEND'){if(size!==0||end!==input.length)throw new Error('步骤 PNG 结束数据无效。');ended=true;break;}
  }
  if(!ended)throw new Error('步骤 PNG 数据不完整。');
  const result=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}

/** An image package has no cover; only the selected panels need certificates.
 * Explicit export waits for complete layer analysis until the user cancels. */
export async function prepareDiagramImageProject(project:DiagramProject,options:DiagramPDFOptions,preparation:DiagramPDFPreparationOptions={}):Promise<DiagramProject> {
  checkCancelled(preparation.signal);
  const ids=diagramStepImagePanels(project,options).map(panel=>project.steps[panel.stepIndex]).filter(step=>step.pose&&step.paperVisible!==false).map(step=>step.id);
  const task=startDiagramLayerDisplayPreparation(project,{stepIds:ids,timeoutMs:Infinity,onProgress:preparation.onProgress});
  const cancel=()=>task.cancel();preparation.signal?.addEventListener('abort',cancel,{once:true});
  try{
    const result=await task.promise;checkCancelled(preparation.signal);
    if(result.cancelled)throw cancelled();
    if(result.issues.length)throw new Error('折图层序尚未就绪，未导出。'+result.issues.map(issue=>`第 ${project.steps.findIndex(step=>step.id===issue.stepId)+1} 步：${issue.message}`).join('；'));
    return result.project;
  }finally{preparation.signal?.removeEventListener('abort',cancel);}
}

/** Each PNG is generated sequentially at 300 DPI. PNG is already compressed,
 * so ZIP stores it directly instead of blocking on redundant compression. */
export async function exportDiagramImagesZIP(project:DiagramProject,options:DiagramPDFOptions,onProgress?:(completed:number,total:number)=>void,palette:DiagramLineDefaults=readDiagramLineDefaults(),preparation:DiagramPDFPreparationOptions={}):Promise<Blob> {
  checkCancelled(preparation.signal);
  const savedOptions=structuredClone(options),linePalette=structuredClone(palette),adaptiveLines=readAdaptiveLineStyle();
  const snapshot=await prepareDiagramImageProject(project,savedOptions,preparation),panels=diagramStepImagePanels(snapshot,savedOptions),zooms=diagramStepZooms(snapshot);
  if(document.fonts?.ready)await document.fonts.ready;checkCancelled(preparation.signal);
  const chunks:ArrayBuffer[]=[];let zipFailure:Error|undefined,finished=false;
  const zip=new Zip((error,data,final)=>{if(error)zipFailure=error;else{chunks.push(new Uint8Array(data).buffer);if(final)finished=true;}});
  const abort=()=>zip.terminate();preparation.signal?.addEventListener('abort',abort,{once:true});
  try{
    for(let index=0;index<panels.length;index++){
      checkCancelled(preparation.signal);
      const {stepIndex,size}=panels[index],step=snapshot.steps[stepIndex];
      const svg=normalizeDiagramPDFStrokes(diagramStepImageSVG(step,snapshot.states,size,linePalette,adaptiveLines,zooms.get(step.id)?.region));
      const image=await rasterizeDiagramThumbnail(svg,{width:size.width*300/72,height:size.height*300/72,signal:preparation.signal});
      checkCancelled(preparation.signal);
      const bytes=diagramImagePNG300DPI(new Uint8Array(await image.arrayBuffer()));checkCancelled(preparation.signal);
      const file=new ZipPassThrough(diagramStepImageFilename(step,stepIndex));zip.add(file);file.push(bytes,true);
      if(zipFailure)throw zipFailure;
      onProgress?.(index+1,panels.length);
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    checkCancelled(preparation.signal);zip.end();if(zipFailure)throw zipFailure;
    if(!finished)throw new Error('步骤图片压缩包未完成，未保存。');
    return new Blob(chunks,{type:'application/zip'});
  }finally{preparation.signal?.removeEventListener('abort',abort);zip.terminate();}
}
