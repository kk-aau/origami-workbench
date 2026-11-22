import type {Point} from '../core/types';
import type {DiagramPDFPaint} from './diagramPDFDecoration';

interface Cubic {start:Point;c1:Point;c2:Point;end:Point;extension?:boolean}
interface Slice {curve:Cubic;start:number;length:number;mid:Point;tangent:Point}
export interface RibbonPaintGeometry {length:number;slices:Slice[]}
const cache=new Map<string,RibbonPaintGeometry>();
const mix=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function split(c:Cubic,t:number):[Cubic,Cubic]{
  const a=mix(c.start,c.c1,t),b=mix(c.c1,c.c2,t),d=mix(c.c2,c.end,t),e=mix(a,b,t),f=mix(b,d,t),p=mix(e,f,t);
  return [{...c,c1:a,c2:e,end:p},{...c,start:p,c1:f,c2:d}];
}
const distance=(a:Point,b:Point)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
function length(c:Cubic,depth=0):number{
  const chord=distance(c.start,c.end),polygon=distance(c.start,c.c1)+distance(c.c1,c.c2)+distance(c.c2,c.end);
  if(depth>=10||polygon-chord<.002)return (chord+polygon)/2;
  const [a,b]=split(c,.5);return length(a,depth+1)+length(b,depth+1);
}
/** Keep the exact Bezier geometry. Only its paint frame is subdivided; no
 * polygonal approximation or raster image is introduced into the PDF. */
export function ribbonPaintGeometry(path:string):RibbonPaintGeometry{
  const found=cache.get(path);if(found){cache.delete(path);cache.set(path,found);return found;}
  const curves:Cubic[]=[];let current:Point=[0,0];
  for(const match of path.matchAll(/([MLC])\s+([^MLC]+)/g)){
    const n=match[2].trim().split(/[ ,]+/).map(Number),end=n.slice(-2) as Point;
    if(match[1]==='C')curves.push({start:current,c1:n.slice(0,2) as Point,c2:n.slice(2,4) as Point,end});
    if(match[1]==='L')curves.push({start:current,c1:mix(current,end,1/3),c2:mix(current,end,2/3),end,extension:true});
    current=end;
  }
  const slices:Slice[]=[];let offset=0;
  // At most 512 paint frames, including author-edited paths with 256 knots.
  const perCurve=Math.max(1,Math.floor(512/Math.max(1,curves.length)));
  for(const curve of curves){
    const size=length(curve),chord=distance(curve.start,curve.end);
    const bend=distance(curve.start,curve.c1)+distance(curve.c1,curve.c2)+distance(curve.c2,curve.end)-chord;
    const count=curve.extension?1:Math.min(perCurve,Math.max(1,Math.ceil(size/12),Math.ceil(Math.sqrt(Math.max(0,bend))*4)));
    let remaining=curve,at=offset;
    for(let i=0;i<count;i++){
      const [piece,rest]=i===count-1?[remaining,remaining]:split(remaining,1/(count-i));remaining=rest;
      const span=length(piece),[left,right]=split(piece,.5),mid=left.end;
      let dx=right.c1[0]-left.c2[0],dy=right.c1[1]-left.c2[1],norm=Math.hypot(dx,dy);
      if(norm<1e-10){dx=piece.end[0]-piece.start[0];dy=piece.end[1]-piece.start[1];norm=Math.hypot(dx,dy)||1;}
      slices.push({curve:piece,start:curve.extension?(offset===0?-span:offset):at,length:span,mid,tangent:[dx/norm,dy/norm]});
      at+=span;
    }
    if(!curve.extension)offset=at;
  }
  const result={length:offset,slices};cache.set(path,result);
  if(cache.size>256)cache.delete(cache.keys().next().value!);
  return result;
}

export function ribbonPaintColor(paint:DiagramPDFPaint,along:number):{color:string;opacity:number}{
  if(paint.kind==='solid')return {color:paint.color,opacity:1};
  const u=Math.max(0,Math.min(1,along)),angle=paint.angle*Math.PI/180;
  const value=(paint.kind==='radial'?Math.hypot(u-paint.centerX/100,.5-paint.centerY/100)/(paint.radius/100):.5+(u-.5)*Math.cos(angle))*100;
  const stops=[...paint.stops].sort((a,b)=>a.offset-b.offset);
  const before=[...stops].reverse().find(s=>s.offset<=value)??stops[0],after=stops.find(s=>s.offset>value)??stops.at(-1)!;
  const t=before===after?0:Math.max(0,Math.min(1,(value-before.offset)/(after.offset-before.offset)));
  const channels=(color:string)=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const a=channels(before.color),b=channels(after.color);
  return {color:'#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join(''),opacity:before.opacity+(after.opacity-before.opacity)*t};
}

const number=(n:number)=>Number(n.toFixed(6));
/** Unroll a ribbon into (arc length, width), then map each small exact cubic
 * back through its tangent frame. Both halves of a page seam share total/offset. */
export function ribbonPathPaintSVG(path:string,width:number,paint:DiagramPDFPaint,id:string,attributes:string,offset=0,total=ribbonPaintGeometry(path).length):string{
  if(paint.kind==='solid')return `<path ${attributes} d="${path}" fill="none" stroke="${paint.color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const geometry=ribbonPaintGeometry(path),ordered=[...paint.stops].sort((a,b)=>a.offset-b.offset);
  const translucent=ordered.some(stop=>stop.opacity!==1);
  const stops=ordered.map(stop=>`<stop offset="${stop.offset}%" stop-color="${stop.color}" stop-opacity="1"/>`).join('');
  const alphaStops=ordered.map(stop=>{const value=Math.round(stop.opacity*255).toString(16).padStart(2,'0');return `<stop offset="${stop.offset}%" stop-color="#${value.repeat(3)}"/>`;}).join('');
  const span=Math.max(.000001,total),angle=paint.angle*Math.PI/180,dx=Math.cos(angle)/2,dy=Math.sin(angle)/2;
  const defs:string[]=[],paths:string[]=[],alpha:string[]=[];
  const curvePath=(c:Cubic)=>`C ${c.c1.join(' ')} ${c.c2.join(' ')} ${c.end.join(' ')}`;
  geometry.slices.forEach((slice,i)=>{
    const {curve,mid,tangent:[ux,uy]}=slice,along=offset+slice.start+slice.length/2;
    const origin:Point=[mid[0]-ux*along+uy*width/2,mid[1]-uy*along-ux*width/2];
    const transform=`matrix(${[span*ux,span*uy,-width*uy,width*ux,...origin].map(number).join(' ')})`,key=id+'-'+i;
    const gradient=(name:string,content:string)=>{
      const shared=`id="${name}" gradientUnits="userSpaceOnUse" gradientTransform="${transform}" color-interpolation="sRGB"`;
      return paint.kind==='linear'?`<linearGradient ${shared} x1="${.5-dx}" y1="${.5-dy}" x2="${.5+dx}" y2="${.5+dy}">${content}</linearGradient>`:`<radialGradient ${shared} cx="${paint.centerX/100}" cy="${paint.centerY/100}" r="${paint.radius/100}">${content}</radialGradient>`;
    };
    defs.push(gradient(key,stops));if(translucent)defs.push(gradient(key+'-alpha',alphaStops));
    // Overlap on the original cubic, rather than adding internal round caps.
    // This removes PDF antialias seams without widening the ribbon silhouette.
    const previous=geometry.slices[i-1],prefix=previous?split(previous.curve,1-Math.min(.25,.75/Math.max(.0001,previous.length)))[1]:undefined;
    const d=`M ${(prefix?.start??curve.start).join(' ')} ${prefix?curvePath(prefix)+' ':''}${curvePath(curve)}`;
    const stroke=(name:string)=>`d="${d}" fill="none" stroke="url(#${name})" stroke-width="${width}" stroke-linecap="butt" stroke-linejoin="round"`;
    paths.push(`<path ${attributes}${curve.extension?' data-pdf-ribbon-extension="true"':''} data-pdf-ribbon-paint-span="${number((offset+slice.start)/span)} ${number((offset+slice.start+slice.length)/span)}" ${stroke(key)}/>`);
    if(translucent)alpha.push(`<path ${stroke(key+'-alpha')}/>`);
  });
  for(const [index,point] of [[0,geometry.slices[0]?.curve.start],[geometry.slices.length-1,geometry.slices.at(-1)?.curve.end]] as const){
    if(!point)continue;
    const cap=(name:string)=>`<circle cx="${point[0]}" cy="${point[1]}" r="${width/2}" fill="url(#${name})"/>`;
    paths.push(cap(id+'-'+index));if(translucent)alpha.push(cap(id+'-'+index+'-alpha'));
  }
  let mask='';
  if(translucent){
    const points=geometry.slices.flatMap(({curve})=>[curve.start,curve.c1,curve.c2,curve.end]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const x=Math.min(...xs)-width,y=Math.min(...ys)-width,w=Math.max(...xs)-x+width,h=Math.max(...ys)-y+width;
    defs.push(`<mask id="${id}-opacity" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" style="mask-type:luminance" color-interpolation="sRGB">${alpha.join('')}</mask>`);
    mask=` mask="url(#${id}-opacity)"`;
  }
  // Alpha is composed once for the entire ribbon, so overlapping paint frames
  // cannot darken translucent color stops. The mask contains only vector paths.
  return `<defs>${defs.join('')}</defs>`+(mask?`<g${mask}>${paths.join('')}</g>`:paths.join(''));
}
