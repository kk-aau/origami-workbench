import {diagramImageDataInfo} from './diagramRasterData';
import {diagramPaperColorPixel} from './diagramPaperColorPixel';
import {PrintPaintServers,type PrintMapping,type PrintSources} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/paperPrintSvg';
import type {PixelRect} from '../core/rasterBounds';
import {polygonSeamWidth} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/contactVisibility';

/** Painter-ordered visible paper and ink, expressed in the captured camera's coordinates. */
export interface DiagramFrameArtwork {
  box:PixelRect;
  pieces:{kind:'face'|'line';color:string;points:number[];print?:PrintMapping}[];
  prints?:PrintSources;
}

const inkCache=new WeakMap<DiagramFrameArtwork,string>();
let frameId=0;

export function validateFrameArtwork(value:unknown):asserts value is DiagramFrameArtwork {
  const frame=value as DiagramFrameArtwork;
  if(!frame?.box||![frame.box.x,frame.box.y,frame.box.width,frame.box.height].every(Number.isFinite)||
     frame.box.width<=0||frame.box.height<=0||!Array.isArray(frame.pieces)||!frame.pieces.length)throw Error('过程图矢量画幅无效。');
  if(inkCache.has(frame))return;
  if(frame.prints){
    if(typeof frame.prints!=='object'||Object.keys(frame.prints).some(k=>k!=='front'&&k!=='back'))throw Error('过程图纸面印花无效。');
    for(const source of Object.values(frame.prints))diagramImageDataInfo(source);
  }
  for(const piece of frame.pieces){
    const print=piece?.print;
    if(print&&(piece.kind!=='face'||!['front','back'].includes(print.side)||!frame.prints?.[print.side]||
        !Array.isArray(print.matrix)||print.matrix.length!==6||!print.matrix.every(Number.isFinite)))throw Error('过程图印花投影无效。');
    if(!piece||!['line','face'].includes(piece.kind)||typeof piece.color!=='string'||!/^#[0-9a-f]{6}$/i.test(piece.color)||
       !Array.isArray(piece.points)||!piece.points.every(Number.isFinite)||(piece.kind==='line'?piece.points.length!==4:piece.points.length<6||piece.points.length%2!==0))throw Error('过程图纸面或线段无效。');
  }
}

/** Only numeric geometry, validated raster assets and solid colours cross the document boundary. */
export function frameArtworkFromSVG(svg:string):DiagramFrameArtwork {
  const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
  const [x,y,width,height]=(root.getAttribute('viewBox')??'').trim().split(/\s+/).map(Number);
  const pieces:DiagramFrameArtwork['pieces']=[];
  const prints:PrintSources={},mappings=new Map<string,{base:string;print:PrintMapping}>();
  for(const image of root.querySelectorAll('defs > image[data-paper-side]')){
    const side=image.getAttribute('data-paper-side');
    if(side==='front'||side==='back')prints[side]=image.getAttribute('href')??'';
  }
  for(const pattern of root.querySelectorAll('defs > pattern')){
    const ref=pattern.querySelector('use')?.getAttribute('href')??'';
    const side=root.ownerDocument.getElementById(ref.slice(1))?.getAttribute('data-paper-side');
    const matrix=/^matrix\(([^()]+)\)$/.exec(pattern.getAttribute('patternTransform')??'')?.[1].trim().split(/[\s,]+/).map(Number);
    if((side==='front'||side==='back')&&matrix)mappings.set('url(#'+pattern.id+')',{base:pattern.querySelector('rect')?.getAttribute('fill')??'',print:{side,matrix}});
  }
  for(const element of root.querySelectorAll('polygon,line')){
    const face=element.localName==='polygon';
    const points=face?(element.getAttribute('points')??'').trim().split(/[\s,]+/).map(Number):
      ['x1','y1','x2','y2'].map(key=>Number(element.getAttribute(key)));
    const fill=element.getAttribute(face?'fill':'stroke')??'',mapped=face?mappings.get(fill):undefined;
    pieces.push({kind:face?'face':'line',color:mapped?.base??fill,points,...(mapped?{print:mapped.print}:{})});
  }
  const frame={box:{x,y,width,height},pieces,...(Object.keys(prints).length?{prints}:{})};validateFrameArtwork(frame);return frame;
}

export function frameInkSVG(frame:DiagramFrameArtwork):string {
  validateFrameArtwork(frame);
  const cached=inkCache.get(frame);if(cached!==undefined)return cached;
  const paint=new PrintPaintServers('frame-print-'+ ++frameId,side=>frame.prints![side]!);
  const solid={front:diagramPaperColorPixel(frame.prints?.front),back:diagramPaperColorPixel(frame.prints?.back)};
  const parts:string[]=[];
  for(let index=0;index<frame.pieces.length;){
    const piece=frame.pieces[index++],{kind,color,points}=piece;
    if(kind==='line'){parts.push(`<line x1="${points[0]}" y1="${points[1]}" x2="${points[2]}" y2="${points[3]}" stroke="${color}" stroke-width="1.35" vector-effect="non-scaling-stroke"/>`);continue;}
    if(piece.print){
      const fill=solid[piece.print.side]??paint.fill(piece.print,color),ring=Array.from({length:points.length/2},(_,i)=>[points[2*i],points[2*i+1]]);
      const seam=polygonSeamWidth(ring,.35);
      if(seam>0)parts.push(`<polygon points="${points.join(' ')}" fill="${fill}" stroke="${fill}" stroke-width="${seam}" vector-effect="non-scaling-stroke"/>`);
      continue;
    }
    const rings=[points];
    while(index<frame.pieces.length&&frame.pieces[index].kind==='face'&&!frame.pieces[index].print&&frame.pieces[index].color===color)rings.push(frame.pieces[index++].points);
    const valid=rings.map(p=>Array.from({length:p.length/2},(_,i)=>[p[i*2],p[i*2+1]])).filter(p=>polygonSeamWidth(p,.35)>0);
    if(!valid.length)continue;
    if(valid.length===1){const ring=valid[0],width=polygonSeamWidth(ring,.35);parts.push(`<polygon points="${ring.flat().join(' ')}" fill="${color}" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`);continue;}
    // One compound fill closes internal triangulation seams without rebuilding
    // an outline, dropping holes or drawing a wide stroke around thin pieces.
    const paths=valid.map(ring=>{
      const a=ring[0],signed=ring.slice(1,-1).reduce((sum,b,i)=>{const c=ring[i+2];return sum+(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);},0);
      const points=signed<0?[...ring].reverse():ring;return 'M '+points.map(p=>p.join(' ')).join(' L ')+' Z';
    });
    parts.push(`<path data-diagram-frame-faces="${valid.length}" d="${paths.join(' ')}" fill="${color}" stroke="none" fill-rule="nonzero"/>`);
  }
  const pieces=paint.defs()+parts.join('');
  inkCache.set(frame,pieces);return pieces;
}

export function frameArtworkSVG(frame:DiagramFrameArtwork,x:number,y:number,width:number,height:number):string {
  const ink=frameInkSVG(frame),box=frame.box;
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" preserveAspectRatio="none" overflow="hidden" stroke-linejoin="round" stroke-linecap="round">${ink}</svg>`;
}
