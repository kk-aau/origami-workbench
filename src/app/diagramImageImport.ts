import {diagramImageDataInfo,diagramRasterDataInfo,DIAGRAM_IMAGE_MAX_BYTES,DIAGRAM_IMAGE_MAX_PIXELS,DIAGRAM_IMAGE_MAX_SIDE,type DiagramImage,type DiagramImageMime} from './diagramImages';

export type PreparedDiagramImage=Pick<DiagramImage,'name'|'dataUrl'|'pixelWidth'|'pixelHeight'|'source'>;
type ImageCapture={dataUrl:string;name:string;source:'file'|'simulation'};
export const DIAGRAM_IMAGE_SOURCE_MAX_BYTES=32*1024*1024;
const TARGET_SIDE=1600,TARGET_BYTES=500*1024;
const mimeTypes:readonly string[]=['image/png','image/jpeg','image/webp'];
const cancelled=()=>new DOMException('图片导入已取消。','AbortError');
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw cancelled();}

/** Fit the source without upscaling. Used again after decoding, since JPEG
 * orientation metadata can interchange its displayed width and height. */
export function diagramImageImportSize(width:number,height:number,longSide=TARGET_SIDE):{width:number;height:number} {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>DIAGRAM_IMAGE_MAX_SIDE||height>DIAGRAM_IMAGE_MAX_SIDE||width*height>DIAGRAM_IMAGE_MAX_PIXELS)throw new Error('图片像素尺寸过大或无效，请缩小后重试。');
  const scale=Math.min(1,longSide/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
function readBlob(blob:Blob,mode:'arrayBuffer',signal?:AbortSignal):Promise<ArrayBuffer>;
function readBlob(blob:Blob,mode:'dataUrl',signal?:AbortSignal):Promise<string>;
function readBlob(blob:Blob,mode:'arrayBuffer'|'dataUrl',signal?:AbortSignal):Promise<ArrayBuffer|string> {
  checkAbort(signal);
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(),cleanup=()=>{signal?.removeEventListener('abort',abort);reader.onload=null;reader.onerror=null;reader.onabort=null;};
    const abort=()=>{reader.abort();cleanup();reject(cancelled());};
    reader.onload=()=>{const result=reader.result;cleanup();if(result===null)reject(new Error('图片读取失败。'));else resolve(result);};
    reader.onerror=()=>{cleanup();reject(new Error('图片读取失败，请检查文件。'));};reader.onabort=()=>{cleanup();reject(cancelled());};
    signal?.addEventListener('abort',abort,{once:true});
    if(mode==='arrayBuffer')reader.readAsArrayBuffer(blob);else reader.readAsDataURL(blob);
  });
}
function sourceMime(bytes:Uint8Array,declared:string):DiagramImageMime {
  const mime=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP'?'image/webp':null;
  if(!mime||declared&&!mimeTypes.includes(declared)||declared&&declared!==mime)throw new Error('图片仅支持真实的 PNG、JPEG 或 WebP 文件。');
  return mime;
}
async function sourceBlob(input:File|ImageCapture,signal?:AbortSignal):Promise<{blob:Blob;name:string;source:'file'|'simulation';mime:DiagramImageMime}> {
  checkAbort(signal);
  let bytes:Uint8Array<ArrayBuffer>,declared:string,name:string,source:'file'|'simulation';
  if(typeof File!=='undefined'&&input instanceof File){
    if(input.size<=0||input.size>DIAGRAM_IMAGE_SOURCE_MAX_BYTES)throw new Error('源图片须大于 0 字节，且不超过 32 MB。');
    declared=input.type;name=input.name;source='file';bytes=new Uint8Array(await readBlob(input,'arrayBuffer',signal));
  }else{
    const capture=input as ImageCapture;
    if(!capture||typeof capture.dataUrl!=='string'||capture.dataUrl.length>Math.ceil(DIAGRAM_IMAGE_SOURCE_MAX_BYTES/3)*4+40||typeof capture.name!=='string'||!['file','simulation'].includes(capture.source))throw new Error('图片来源无效或超过 32 MB。');
    const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(capture.dataUrl);
    if(!match||match[2].length%4!==0)throw new Error('图片仅支持内嵌 PNG、JPEG 或 WebP。');
    let binary:string;try{binary=atob(match[2]);}catch{throw new Error('图片数据无效。');}
    if(!binary.length||binary.length>DIAGRAM_IMAGE_SOURCE_MAX_BYTES||btoa(binary)!==match[2])throw new Error('图片数据无效或超过 32 MB。');
    bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));declared=match[1];name=capture.name;source=capture.source;
  }
  checkAbort(signal);const mime=sourceMime(bytes,declared);diagramRasterDataInfo(bytes,mime);
  return {blob:new Blob([bytes],{type:mime}),name:name.trim().slice(0,160)||(source==='simulation'?'三维模拟截图':'步骤图片'),source,mime};
}
function decode(blob:Blob,signal?:AbortSignal):Promise<HTMLImageElement> {
  checkAbort(signal);
  return new Promise((resolve,reject)=>{
    const image=new Image(),url=URL.createObjectURL(blob),cleanup=()=>{clearTimeout(timeout);URL.revokeObjectURL(url);signal?.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
    const abort=()=>{cleanup();image.src='';reject(cancelled());};
    const timeout=setTimeout(()=>{cleanup();image.src='';reject(new Error('图片解码超时，请缩小后重试。'));},15000);
    const failed=()=>{cleanup();image.src='';reject(new Error('图片无法解码，请选择完整的 PNG、JPEG 或 WebP。'));};
    image.decoding='async';image.onload=()=>{image.decode().then(()=>{cleanup();resolve(image);},failed);};image.onerror=failed;
    signal?.addEventListener('abort',abort,{once:true});image.src=url;
  });
}
function encode(canvas:HTMLCanvasElement,mime:string,quality:number,signal?:AbortSignal):Promise<Blob> {
  checkAbort(signal);
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal?.removeEventListener('abort',abort);reject(cancelled());};signal?.addEventListener('abort',abort,{once:true});
    try{canvas.toBlob(blob=>{signal?.removeEventListener('abort',abort);if(signal?.aborted)reject(cancelled());else if(blob)resolve(blob);else reject(new Error('图片压缩失败，请换一张图片重试。'));},mime,quality);}
    catch{signal?.removeEventListener('abort',abort);reject(new Error('图片压缩失败，请换一张图片重试。'));}
  });
}

/** Decode locally and remove source metadata. WebP and PNG retain alpha; JPEG
 * is a fallback only for a source format that has no transparency channel. */
export async function prepareDiagramImage(input:File|ImageCapture,signal?:AbortSignal):Promise<PreparedDiagramImage> {
  const prepared=await sourceBlob(input,signal),image=await decode(prepared.blob,signal),canvas=document.createElement('canvas');
  try{
    const original={width:image.naturalWidth,height:image.naturalHeight};diagramImageImportSize(original.width,original.height);
    const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法创建图片画布。');
    let best:Blob|undefined,bestWidth=0,bestHeight=0;
    for(let attempt=0;attempt<8;attempt++){
      checkAbort(signal);const size=diagramImageImportSize(original.width,original.height,Math.round(TARGET_SIDE*Math.pow(.8,attempt)));
      canvas.width=size.width;canvas.height=size.height;context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.clearRect(0,0,size.width,size.height);context.drawImage(image,0,0,size.width,size.height);
      // Browsers may fall back to PNG when WebP encoding is unavailable.
      let encoded=await encode(canvas,'image/webp',attempt===0?.88:.8,signal);
      if(encoded.type!=='image/webp'&&prepared.mime==='image/jpeg')encoded=await encode(canvas,'image/jpeg',.86,signal);
      if(!best||encoded.size<best.size){best=encoded;bestWidth=size.width;bestHeight=size.height;}
      if(encoded.size<=TARGET_BYTES)break;
    }
    checkAbort(signal);if(!best||best.size>DIAGRAM_IMAGE_MAX_BYTES)throw new Error('图片压缩后仍超过 2 MB，请缩小图片后重试。');
    const dataUrl=await readBlob(best,'dataUrl',signal),info=diagramImageDataInfo(dataUrl);
    if(info.width!==bestWidth||info.height!==bestHeight)throw new Error('压缩后的图片尺寸不一致，请重试。');
    checkAbort(signal);return {name:prepared.name,dataUrl,pixelWidth:info.width,pixelHeight:info.height,source:prepared.source};
  }finally{image.src='';canvas.width=0;canvas.height=0;}
}
