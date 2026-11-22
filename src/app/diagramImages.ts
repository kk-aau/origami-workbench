import {diagramImageDataInfo} from './diagramRasterData';
export {diagramImageDataInfo,diagramRasterDataInfo,DIAGRAM_IMAGE_MAX_BYTES,DIAGRAM_IMAGE_MAX_SIDE,DIAGRAM_IMAGE_MAX_PIXELS,type DiagramImageMime} from './diagramRasterData';
import type {PixelRect} from '../core/rasterBounds';
import {frameArtworkSVG,validateFrameArtwork,type DiagramFrameArtwork} from './diagramFrameArtwork';
import type {Point} from '../core/types';
import {isDiagramCPLine,type DiagramAnnotation} from './diagramAnnotations';

/** Images are embedded raster artwork, independent from CP topology and symbols.
 * Position is the unrotated top-left corner; rotation is around its centre. */
export interface DiagramImage {
  id:string;name:string;dataUrl:string;pixelWidth:number;pixelHeight:number;
  position:Point;width:number;height:number;rotation:number;source:'file'|'simulation';
  /** The saved rectangle already represents the chosen image content, including white paper. */
  croppedToContent?:true;
  artwork?:DiagramFrameArtwork;
}
export function markDiagramImageCropped(image:DiagramImage):DiagramImage {
  return image.croppedToContent?image:{...image,croppedToContent:true};
}
export const DIAGRAM_IMAGE_MAX_COUNT=16;
/** Physical paper creases stay saved with the CP while image-mode annotation
 * lines opt out of physical faces explicitly with foldFaces: []. */
export function isDiagramImageAnnotationVisible(annotation:DiagramAnnotation):boolean {
  return !isDiagramCPLine(annotation)&&(annotation.kind!=='line'||!annotation.foldFaces?.length&&((annotation.style!=='valley'&&annotation.style!=='mountain')||annotation.foldFaces?.length===0));
}
const imageKeys=['id','name','dataUrl','pixelWidth','pixelHeight','position','width','height','rotation','source'];
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export function validateDiagramImages(value:unknown):asserts value is DiagramImage[] {
  if(!Array.isArray(value)||value.length>DIAGRAM_IMAGE_MAX_COUNT)throw new Error(`每步最多放置 ${DIAGRAM_IMAGE_MAX_COUNT} 张图片。`);
  const ids=new Set<string>();
  for(const raw of value){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||imageKeys.some(key=>!Object.hasOwn(raw,key)))throw new Error('折序图片字段不完整或版本不支持。');
    const image=raw as DiagramImage;
    const marked=Object.hasOwn(image,'croppedToContent');
    const vector=Object.hasOwn(image,'artwork');
    if(vector)validateFrameArtwork(image.artwork);
    if(Object.keys(raw).length!==imageKeys.length+Number(marked)+Number(vector)||(marked&&image.croppedToContent!==true))throw new Error('折序图片字段不完整或版本不支持。');
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
export function diagramImageSVG(images:readonly DiagramImage[],regionFor?:(image:DiagramImage)=>PixelRect|null|undefined):string {
  validateDiagramImages(images);
  return images.map(image=>{
    const [x,y]=image.position,rotate=`rotate(${image.rotation} ${x+image.width/2} ${y+image.height/2})`;
    if(image.artwork)return `<g transform="${rotate}">${frameArtworkSVG(image.artwork,x,y,image.width,image.height)}</g>`;
    const artwork=`<image href="${image.dataUrl}" x="${x}" y="${y}" width="${image.width}" height="${image.height}" preserveAspectRatio="none"`;
    const content=`<title>${escapeXML(image.name)}</title></image>`,region=regionFor?.(image);
    if(region===null)return '';
    if(!region||region.width===image.pixelWidth&&region.height===image.pixelHeight)return `${artwork} transform="${rotate}">${content}`;
    const left=x+image.width*region.x/image.pixelWidth,top=y+image.height*region.y/image.pixelHeight;
    const width=image.width*region.width/image.pixelWidth,height=image.height*region.height/image.pixelHeight;
    return `<g transform="${rotate}"><svg x="${left}" y="${top}" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}" overflow="hidden">${artwork}>${content}</svg></g>`;
  }).join('');
}
