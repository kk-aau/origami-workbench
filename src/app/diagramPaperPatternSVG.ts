import type {Point} from '../core/types';
import type {PaperPatterns} from './paperPatterns';
import {diagramPaperColorPixel} from './diagramPaperColorPixel';

// Keep the print fixed to the original sheet while the projected triangle changes.
export function paperPrintMatrix(src:Point[],dst:Point[]):number[]|null{
  const [p,q,r]=src,[a,b,c]=dst;
  const x=q[0]-p[0],y=q[1]-p[1],u=r[0]-p[0],v=r[1]-p[1],det=x*v-y*u;
  if(!det)return null;
  const row=(axis:0|1)=>{const h=b[axis]-a[axis],k=c[axis]-a[axis],s=(h*v-k*y)/det,t=(x*k-u*h)/det;return [s,t,a[axis]-s*p[0]-t*p[1]];};
  const X=row(0),Y=row(1);return [X[0],Y[0],X[1],Y[1],X[2],Y[2]];
}
export function diagramPaperPrint(patterns:PaperPatterns,source:Point[],projected:Point[]){
  const prefix='paper-print-'+crypto.randomUUID(),defs:string[]=[];
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for(const [sx,sy] of source){x=Math.min(x,sx);y=Math.min(y,sy);right=Math.max(right,sx);bottom=Math.max(bottom,sy);}
  const colors={front:diagramPaperColorPixel(patterns.front),back:diagramPaperColorPixel(patterns.back)};
  for(const side of ['front','back'] as const)if(patterns[side]&&!colors[side])defs.push(`<image id="${prefix}-${side}" href="${patterns[side]}" x="${x}" y="${y}" width="${right-x}" height="${bottom-y}" preserveAspectRatio="none"/>`);
  let count=0;
  return {defs,triangle(ids:number[],front:boolean,opacity:number){
    const side=front?'front':'back';if(!patterns[side])return '';
    const dst=ids.map(i=>projected[i]);if(dst.some(p=>!p))return '';
    const m=paperPrintMatrix(ids.map(i=>source[i]),dst);if(!m)return '';
    if(colors[side])return `<polygon points="${dst.map(p=>p.join(',')).join(' ')}" fill="${colors[side]}" opacity="${opacity}"/>`;
    const id=prefix+'-'+count++;defs.push(`<clipPath id="${id}"><polygon points="${dst.map(p=>p.join(',')).join(' ')}"/></clipPath>`);
    const mirror=front?'':` translate(${x+right} 0) scale(-1 1)`;
    return `<g clip-path="url(#${id})" opacity="${opacity}"><use href="#${prefix}-${side}" transform="matrix(${m.join(' ')})${mirror}"/></g>`;
  }};
}
