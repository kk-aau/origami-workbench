/** Rasterize the authored, self-contained thumbnail without mounting its SVG
 * tree in the workspace. The caller owns the returned PNG and its display URL. */
export async function rasterizeDiagramThumbnail(svg:string,options:{width?:number;height?:number;signal?:AbortSignal}={}):Promise<Blob> {
  const cancelled=()=>{if(options.signal?.aborted)throw new DOMException('图片生成已取消。','AbortError');};cancelled();
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml'),root=parsed.documentElement;
  if(root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg'||parsed.getElementsByTagName('parsererror').length)throw new Error('缩略图 SVG 无法解析。');
  const viewBox=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if(!viewBox||viewBox.length!==4||viewBox.some(value=>!Number.isFinite(value))||viewBox[2]<=0||viewBox[3]<=0)throw new Error('缩略图 SVG 的绘图范围无效。');
  const longest=Math.max(viewBox[2],viewBox[3]);
  if((options.width!==undefined||options.height!==undefined)&&(!Number.isFinite(options.width)||!Number.isFinite(options.height)||(options.width??0)<=0||(options.height??0)<=0))throw new Error('图片输出尺寸无效。');
  const width=Math.max(1,Math.round(options.width??512*(viewBox[2]/longest))),height=Math.max(1,Math.round(options.height??512*(viewBox[3]/longest)));
  root.setAttribute('width',String(width));root.setAttribute('height',String(height));
  const image=new Image(),canvas=document.createElement('canvas');
  const sourceURL=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml;charset=utf-8'}));
  let stopDecode=()=>{};
  try{
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{image.removeAttribute('src');reject(new DOMException('图片生成已取消。','AbortError'));};
      const clean=()=>options.signal?.removeEventListener('abort',abort);
      stopDecode=clean;
      image.onload=()=>{clean();resolve();};
      image.onerror=()=>{clean();reject(new Error('缩略图图像解码失败。'));};
      options.signal?.addEventListener('abort',abort,{once:true});
      if(options.signal?.aborted){clean();abort();return;}
      image.src=sourceURL;
    });
    cancelled();
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('无法创建缩略图绘图上下文。');
    context.drawImage(image,0,0,width,height);
    const blob=await new Promise<Blob>((resolve,reject)=>{
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('缩略图 PNG 生成失败。')),'image/png');
    });
    cancelled();return blob;
  }finally{
    stopDecode();
    image.onload=null;image.onerror=null;image.removeAttribute('src');
    URL.revokeObjectURL(sourceURL);canvas.width=0;canvas.height=0;
  }
}
