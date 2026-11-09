import {rasterSize} from './paper';
import {downloadBlob} from './api';

/** Rasterize generated workbench SVG. PNG keeps alpha; JPEG explicitly composites on white. */
export async function rasterizeSVG(svg:string,format:'png'|'jpg'):Promise<Blob>{
  if(format!=='png'&&format!=='jpg')throw new Error('不支持的栅格输出格式。');
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await new Promise<void>((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('图像解码超时，请重试。')),15000);
      image.onload=()=>resolve();image.onerror=()=>reject(new Error('图像解码失败，未导出。'));image.src=url;
    });
    clearTimeout(timer);
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('图像尺寸无效，未导出。');
    const size=rasterSize(image.naturalWidth,image.naturalHeight),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
    const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法创建图像画布。');
    if(format==='jpg'){context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);}
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const type=format==='jpg'?'image/jpeg':'image/png';
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>{
      if(!blob||blob.type!==type)reject(new Error('浏览器未能按所选格式编码图像，未导出。'));else resolve(blob);
    },type,.92));
  }finally{clearTimeout(timer);image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);}
}

export function downloadRaster(blob:Blob,name:string){
  return downloadBlob(blob,name);
}
