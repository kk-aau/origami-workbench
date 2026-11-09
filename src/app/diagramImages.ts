import type {Point} from '../core/types';
import {isDiagramCPLine,type DiagramAnnotation} from './diagramAnnotations';

/** Images are embedded raster artwork, independent from CP topology and symbols.
 * Position is the unrotated top-left corner; rotation is around its centre. */
export interface DiagramImage {
  id:string;name:string;dataUrl:string;pixelWidth:number;pixelHeight:number;
  position:Point;width:number;height:number;rotation:number;source:'file'|'simulation';
}
export const DIAGRAM_IMAGE_MAX_BYTES=2*1024*1024;
export const DIAGRAM_IMAGE_MAX_PIXELS=32_000_000;
export const DIAGRAM_IMAGE_MAX_SIDE=8192;
export const DIAGRAM_IMAGE_MAX_COUNT=16;
/** Physical paper creases stay saved with the CP while image-mode annotation
 * lines opt out of physical faces explicitly with foldFaces: []. */
export function isDiagramImageAnnotationVisible(annotation:DiagramAnnotation):boolean {
  return !isDiagramCPLine(annotation)&&(annotation.kind!=='line'||!annotation.foldFaces?.length&&((annotation.style!=='valley'&&annotation.style!=='mountain')||annotation.foldFaces?.length===0));
}
const imageKeys=['id','name','dataUrl','pixelWidth','pixelHeight','position','width','height','rotation','source'];
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const dimensionsCache=new Map<string,{width:number;height:number;mime:string;bytes:number}>();
export type DiagramImageMime='image/png'|'image/jpeg'|'image/webp';
const pngCRCTable=Uint32Array.from({length:256},(_,value)=>{let crc=value;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0);return crc>>>0;});
function pngCRC(bytes:Uint8Array,start:number,end:number){let crc=0xffffffff;for(let i=start;i<end;i++)crc=pngCRCTable[(crc^bytes[i])&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

/** Shared header preflight for original files and bounded project payloads.
 * The caller limits byte size before calling; pixel limits always apply. */
export function diagramRasterDataInfo(bytes:Uint8Array,mime:DiagramImageMime):{width:number;height:number;mime:DiagramImageMime;bytes:number} {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(offset:number,count:number)=>String.fromCharCode(...bytes.subarray(offset,offset+count));
  let width=0,height=0;
  if(mime==='image/png'){
    if(bytes.length<45||ascii(0,8)!=='\x89PNG\r\n\x1a\n'||view.getUint32(8)!==13||ascii(12,4)!=='IHDR')throw new Error('PNG 图片签名或尺寸头无效。');
    width=view.getUint32(16);height=view.getUint32(20);
    let offset=8,hasData=false,ended=false;
    while(offset+12<=bytes.length){const length=view.getUint32(offset),kind=ascii(offset+4,4);if(length>bytes.length-offset-12)break;if(pngCRC(bytes,offset+4,offset+8+length)!==view.getUint32(offset+8+length))throw new Error('PNG 图片数据校验失败，文件可能已损坏。');if(kind==='IDAT')hasData=true;offset+=length+12;if(kind==='IEND'){ended=length===0&&offset===bytes.length;break;}}
    if(!hasData||!ended)throw new Error('PNG 图片数据不完整。');
  }else if(mime==='image/jpeg'){
    if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error('JPEG 图片签名无效或数据不完整。');
    let offset=2,scan=false;
    while(offset+3<bytes.length){
      if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===0xda){scan=true;break;}if(marker===0xd9)break;
      if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
      if(offset+2>bytes.length)break;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){height=view.getUint16(offset+3);width=view.getUint16(offset+5);}
      offset+=length;
    }
    if(!scan||!width||!height)throw new Error('JPEG 图片缺少有效尺寸或像素数据。');
  }else if(mime==='image/webp'){
    if(bytes.length<30||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WEBP'||view.getUint32(4,true)+8!==bytes.length)throw new Error('WebP 图片签名或长度无效。');
    let offset=12,hasPixels=false;
    while(offset+8<=bytes.length){
      const kind=ascii(offset,4),length=view.getUint32(offset+4,true),start=offset+8;if(length>bytes.length-start)break;
      if(kind==='VP8X'&&length>=10){width=1+bytes[start+4]+(bytes[start+5]<<8)+(bytes[start+6]<<16);height=1+bytes[start+7]+(bytes[start+8]<<8)+(bytes[start+9]<<16);}
      if(kind==='VP8 '&&length>=10&&ascii(start+3,3)==='\x9d\x01\x2a'){const w=view.getUint16(start+6,true)&0x3fff,h=view.getUint16(start+8,true)&0x3fff;if(!width){width=w;height=h;}hasPixels=true;}
      if(kind==='VP8L'&&length>=5&&bytes[start]===0x2f){const bits=view.getUint32(start+1,true);if(!width){width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}hasPixels=true;}
      offset=start+length+(length%2);
    }
    if(!hasPixels||offset!==bytes.length)throw new Error('WebP 图片缺少有效像素数据。');
  }else throw new Error('图片仅支持 PNG、JPEG 或 WebP。');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>DIAGRAM_IMAGE_MAX_SIDE||height>DIAGRAM_IMAGE_MAX_SIDE||width*height>DIAGRAM_IMAGE_MAX_PIXELS)throw new Error('图片像素尺寸过大或无效，请缩小后重试。');
  return {width,height,mime,bytes:bytes.length};
}

/** Only bounded, embedded PNG/JPEG/WebP bytes reach SVG image hrefs. Dimensions
 * come from the raster header instead of trusting project JSON or file names. */
export function diagramImageDataInfo(dataUrl:unknown):{width:number;height:number;mime:string;bytes:number} {
  if(typeof dataUrl!=='string'||dataUrl.length>Math.ceil(DIAGRAM_IMAGE_MAX_BYTES/3)*4+40)throw new Error('图片须为不超过 2 MB 的内嵌 PNG、JPEG 或 WebP。');
  const cached=dimensionsCache.get(dataUrl);if(cached)return {...cached};
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if(!match||match[2].length%4!==0)throw new Error('图片仅支持内嵌 PNG、JPEG 或 WebP，不能引用外部地址或 SVG。');
  let binary:string;try{binary=atob(match[2]);}catch{throw new Error('图片的 Base64 数据无效。');}
  if(!binary.length||binary.length>DIAGRAM_IMAGE_MAX_BYTES||btoa(binary)!==match[2])throw new Error('图片数据无效或超过 2 MB。');
  const info=diagramRasterDataInfo(Uint8Array.from(binary,c=>c.charCodeAt(0)),`image/${match[1]}` as DiagramImageMime);dimensionsCache.set(dataUrl,info);
  while(dimensionsCache.size>16)dimensionsCache.delete(dimensionsCache.keys().next().value!);
  return {...info};
}

export function validateDiagramImages(value:unknown):asserts value is DiagramImage[] {
  if(!Array.isArray(value)||value.length>DIAGRAM_IMAGE_MAX_COUNT)throw new Error(`每步最多放置 ${DIAGRAM_IMAGE_MAX_COUNT} 张图片。`);
  const ids=new Set<string>();
  for(const raw of value){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==imageKeys.length||imageKeys.some(key=>!Object.hasOwn(raw,key)))throw new Error('折序图片字段不完整或版本不支持。');
    const image=raw as DiagramImage;
    if(typeof image.id!=='string'||!image.id.trim()||image.id.length>160||ids.has(image.id))throw new Error('折序图片编号无效或重复。');ids.add(image.id);
    if(typeof image.name!=='string'||image.name.length>160||!['file','simulation'].includes(image.source))throw new Error('折序图片名称或来源无效。');
    if(!Array.isArray(image.position)||image.position.length!==2||image.position.some(n=>!finite(n)||Math.abs(n)>1_000_000)||!finite(image.width)||image.width<=0||image.width>1_000_000||!finite(image.height)||image.height<=0||image.height>1_000_000||!finite(image.rotation)||Math.abs(image.rotation)>360_000)throw new Error('折序图片的位置、大小或旋转角度无效。');
    const info=diagramImageDataInfo(image.dataUrl);
    if(image.pixelWidth!==info.width||image.pixelHeight!==info.height)throw new Error('折序图片的像素尺寸与实际数据不一致。');
  }
}

export function diagramImageCorners(image:DiagramImage):Point[] {
  const cx=image.position[0]+image.width/2,cy=image.position[1]+image.height/2,angle=image.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]):Point=>[cx+x*image.width/2*c-y*image.height/2*s,cy+x*image.width/2*s+y*image.height/2*c]);
}
export function diagramImageBounds(image:DiagramImage) {
  const corners=diagramImageCorners(image),xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
  return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};
}
const escapeXML=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function diagramImageSVG(images:readonly DiagramImage[]):string {
  validateDiagramImages(images);
  return images.map(image=>`<image href="${image.dataUrl}" x="${image.position[0]}" y="${image.position[1]}" width="${image.width}" height="${image.height}" preserveAspectRatio="none" transform="rotate(${image.rotation} ${image.position[0]+image.width/2} ${image.position[1]+image.height/2})"><title>${escapeXML(image.name)}</title></image>`).join('');
}
