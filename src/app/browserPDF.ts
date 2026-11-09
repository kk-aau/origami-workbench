import {loadPDFRuntime} from './diagramPDF';

/** Browser export uses lossless page images at 300 dpi, including local CJK
 * fonts and SVG clips. Desktop export remains the original vector pipeline. */
export async function browserSVGToPDF(svg:string,signal?:AbortSignal):Promise<Uint8Array>{
  signal?.throwIfAborted();await document.fonts.ready;
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml'),root=parsed.documentElement;
  if(parsed.querySelector('parsererror')||root.localName!=='svg')throw Error('PDF 页面图像格式无效。');
  const box=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number),width=box?.[2]??parseFloat(root.getAttribute('width')??''),height=box?.[3]??parseFloat(root.getAttribute('height')??'');
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('PDF 页面尺寸无效。');
  const scale=300/72,canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  const context=canvas.getContext('2d');if(!context)throw Error('浏览器无法创建 PDF 绘图画布。');
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try{
    const image=new Image();image.src=url;await image.decode();signal?.throwIfAborted();
    context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PDF 页面导出失败，请减小页面尺寸后重试。')),'image/png'));
    signal?.throwIfAborted();
    const runtime=await loadPDFRuntime() as unknown as {PDFDocument:{create():Promise<{embedPng(bytes:ArrayBuffer):Promise<unknown>;addPage(size:number[]):{drawImage(image:unknown,options:object):void};save():Promise<Uint8Array>}>}};
    const pdf=await runtime.PDFDocument.create(),png=await pdf.embedPng(await blob.arrayBuffer());
    pdf.addPage([width,height]).drawImage(png,{x:0,y:0,width,height});const bytes=await pdf.save();signal?.throwIfAborted();return bytes;
  }finally{URL.revokeObjectURL(url);canvas.width=canvas.height=0;}
}
