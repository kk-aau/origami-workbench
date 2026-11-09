import {MAX_BACKGROUND_DATA_LENGTH, validateBackground, type BackgroundImage} from '../core/backgroundData.mjs';
import {rasterDimensions} from '../core/rasterHeader.mjs';
import {fitBackground} from './backgroundPlacement';
import type {Bounds} from './paper';

/** Validate bounded raster bytes before asking the browser to decode them. */
export async function loadBackground(file:File,bounds:Bounds):Promise<BackgroundImage>{
  if(!file.size||file.size>Math.floor((MAX_BACKGROUND_DATA_LENGTH-32)/4)*3)throw new Error('图片为空或超过约 3 MB，请缩小图片后重试。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=bytes[0]===137?'image/png':bytes[0]===255?'image/jpeg':bytes[0]===82?'image/webp':'';
  if(!mime)throw new Error('请选择 PNG、JPEG 或 WebP 图片，不支持 SVG。');
  const size=rasterDimensions(bytes,mime);
  const dataUrl=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('无法读取图片。'));
    reader.readAsDataURL(new Blob([bytes],{type:mime}));
  });
  const result:BackgroundImage={name:file.name.slice(0,255),dataUrl,...size,opacity:.5,visible:true,placement:fitBackground(size,bounds)};
  validateBackground(result);
  const image=new Image();image.src=dataUrl;
  try{await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error();}
  catch{throw new Error('图片无法解码或内容已损坏，原底图保持不变。');}
  return result;
}
