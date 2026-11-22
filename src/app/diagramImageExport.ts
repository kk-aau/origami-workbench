import {Zip,ZipPassThrough} from 'fflate';
import type {DiagramCPState,DiagramProject,DiagramStep} from './diagramProject';
import {prepareDiagramExportProject,diagramPDFStepArtwork,type DiagramPDFPreparationOptions} from './diagramPDF';
import {resolveDiagramPanel,planDiagramPDF,type DiagramPDFOptions,type DiagramPDFRect} from './diagramPDFLayout';
import {diagramExportPagePanels,diagramExportPanelArtwork,type DiagramExportPanel} from './diagramExportPanel';
import type {DiagramSymbolStyles} from './diagramSymbolStyles';
import {embedDiagramPDFSVG,normalizeDiagramPDFStrokes} from './diagramPDFPage';
import {readDiagramLineDefaults,type DiagramLineDefaults} from './diagramLineStyles';
import {readAdaptiveLineStyle} from './adaptiveLineStyle';
import type {DiagramZoomRegion} from './diagramZoomGeometry';
import {diagramStepZooms} from './diagramStepZoom';
import {rasterizeDiagramThumbnail} from './diagramThumbnailRaster';

export type DiagramStepImagePanel=DiagramExportPanel;
const cancelled=()=>new DOMException('步骤图片导出已取消。','AbortError');
function checkCancelled(signal?:AbortSignal){if(signal?.aborted)throw cancelled();}

/** Use the actual PDF panel dimensions, including first-page layout and the
 * caption space. The image itself contains artwork only, with no page text. */
export function diagramStepImagePanels(project:DiagramProject,options:DiagramPDFOptions,plan=planDiagramPDF(project,options)):DiagramStepImagePanel[] {
  return plan.pages.flatMap((_,pageIndex)=>diagramExportPagePanels(project,options,plan,pageIndex));
}

function imageSVG(size:Pick<DiagramPDFRect,'width'|'height'>,artwork:string){
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif"><rect width="${size.width}" height="${size.height}" fill="white"/>${artwork}</svg>`;
}

/** Shared panel wrapper for cached thumbnails and image export. Stroke
 * normalization is deliberately performed by the browser caller afterwards. */
export function diagramStepImageSVG(step:DiagramStep,states:readonly DiagramCPState[],size:Pick<DiagramPDFRect,'width'|'height'>,palette:DiagramLineDefaults,adaptiveLines:boolean,zoom?:DiagramZoomRegion|null,patterns?:import('./paperPatterns').PaperPatterns,processFigure=false,symbolStyles?:DiagramSymbolStyles):string {
  if(!(size.width>0&&size.height>0&&Number.isFinite(size.width)&&Number.isFinite(size.height)))throw new Error('步骤图片排版尺寸无效。');
  const artwork=diagramPDFStepArtwork(step,states,size,palette,adaptiveLines,zoom,patterns,processFigure,symbolStyles);
  return imageSVG(size,embedDiagramPDFSVG(artwork,{x:0,y:0,...size},'step-image-'));
}

/** Compose a panel once for the on-screen preview and the exported PNG. */
export function diagramStepImagePanelSVG(project:DiagramProject,panel:DiagramStepImagePanel,palette:DiagramLineDefaults,adaptiveLines:boolean,mainZooms?:ReturnType<typeof diagramStepZooms>,scales?:Map<string,number|null>):string {
  const drawing=diagramExportPanelArtwork(project,panel,{x:0,y:0,...panel.size},palette,adaptiveLines,scales,mainZooms);
  const size=drawing.markerRect?{...panel.size,width:Math.max(panel.size.width,drawing.markerRect.x+drawing.markerRect.width+2)}:panel.size;
  return imageSVG(size,embedDiagramPDFSVG(drawing.svg,drawing.rect,'step-image-')+drawing.marker);
}

export function diagramStepImageFilename(step:DiagramStep,index:number,figureIndex?:number,branchLabel?:string):string {
  const title=step.title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,100)||'步骤';
  const suffix=figureIndex===undefined?'':`-${String(figureIndex+1).padStart(3,'0')}`;
  const number=(branchLabel??String(index+1)).replace(/^\d+/,value=>value.padStart(3,'0'))
    .replace(/[%\\/:*?"<>|\u0000-\u001f]/g,c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0'));
  return `${number}${suffix}_${title}.png`;
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
export function prepareDiagramImageProject(project:DiagramProject,options:DiagramPDFOptions,preparation:DiagramPDFPreparationOptions={}):Promise<DiagramProject> {
  return prepareDiagramExportProject(project,options,preparation,false);
}

/** Each PNG is generated sequentially at 300 DPI. PNG is already compressed,
 * so ZIP stores it directly instead of blocking on redundant compression. */
export async function exportDiagramImagesZIP(project:DiagramProject,options:DiagramPDFOptions,onProgress?:(completed:number,total:number)=>void,palette:DiagramLineDefaults=readDiagramLineDefaults(),preparation:DiagramPDFPreparationOptions={}):Promise<Blob> {
  checkCancelled(preparation.signal);
  const savedOptions=structuredClone(options),linePalette=structuredClone(palette),adaptiveLines=readAdaptiveLineStyle();
  const snapshot=await prepareDiagramImageProject(project,savedOptions,preparation),panels=diagramStepImagePanels(snapshot,savedOptions);
  const zooms=snapshot.branchSteps?.length?undefined:diagramStepZooms(snapshot);
  if(document.fonts?.ready)await document.fonts.ready;checkCancelled(preparation.signal);
  const chunks:ArrayBuffer[]=[];let zipFailure:Error|undefined,finished=false;
  const zip=new Zip((error,data,final)=>{if(error)zipFailure=error;else{chunks.push(new Uint8Array(data).buffer);if(final)finished=true;}});
  const abort=()=>zip.terminate();preparation.signal?.addEventListener('abort',abort,{once:true});
  try{
    const scales=new Map<string,number|null>();
    for(let index=0;index<panels.length;index++){
      checkCancelled(preparation.signal);
      const panel=panels[index],{stepIndex,figureIndex}=panel,{step}=resolveDiagramPanel(snapshot,panel);
      const svg=normalizeDiagramPDFStrokes(diagramStepImagePanelSVG(snapshot,panel,linePalette,adaptiveLines,zooms,scales));
      const output=svg.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
      const image=await rasterizeDiagramThumbnail(svg,{width:output[2]*300/72,height:output[3]*300/72,signal:preparation.signal});
      checkCancelled(preparation.signal);
      const bytes=diagramImagePNG300DPI(new Uint8Array(await image.arrayBuffer()));checkCancelled(preparation.signal);
      const file=new ZipPassThrough(diagramStepImageFilename(step,stepIndex,figureIndex,panel.branchLabel));zip.add(file);file.push(bytes,true);
      if(zipFailure)throw zipFailure;
      onProgress?.(index+1,panels.length);
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    checkCancelled(preparation.signal);zip.end();if(zipFailure)throw zipFailure;
    if(!finished)throw new Error('步骤图片压缩包未完成，未保存。');
    return new Blob(chunks,{type:'application/zip'});
  }finally{preparation.signal?.removeEventListener('abort',abort);zip.terminate();}
}
