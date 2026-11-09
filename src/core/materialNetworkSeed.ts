import type {FoldGraph,Point} from './types';
import {materialFaceRings,materialFaceInside} from './materialRings';
import {materialOrientation} from './materialTraceGeometry';
const on=(p:Point,a:Point,b:Point)=>!materialOrientation(a,b,p)&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
const intersects=(a:Point,b:Point,c:Point,d:Point)=>on(a,c,d)||on(b,c,d)||on(c,a,b)||on(d,a,b)||materialOrientation(a,b,c)*materialOrientation(a,b,d)<0&&materialOrientation(c,d,a)*materialOrientation(c,d,b)<0;
/** A bounded valid draft in the actual face. Keep the historical rectangle
 * when valid; a slit/hole/concavity must not receive an unusable bbox draft. */
export function materialNetworkSeed(g:FoldGraph,face:number):{vertices:Point[];fixedPoint:Point}|null{
 const rings=materialFaceRings(g,face),ps=rings.flat().map(v=>g.vertices_coords[v]),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0;if(!(w>0&&h>0))return null;
 let work=0;const corners=ps.length,inside=(p:Point)=>{work+=corners;return work<=500_000&&materialFaceInside(g,face,p);};
 const candidates:[[number,number],number][]=[[[.5,.5],.15],...[.15,.35,.65,.85].flatMap(x=>[.15,.35,.65,.85].map(y=>[[x,y],.035] as [[number,number],number]))];
 for(const [[x,y],r]of candidates){const cx=x0+x*w,cy=y0+y*h,vertices:Point[]=[[cx-r*w,cy-r*h],[cx+r*w,cy-r*h],[cx+r*w,cy+r*h],[cx-r*w,cy+r*h]];if(!vertices.every(inside)){if(work>500_000)return null;continue;}let valid=true;for(let i=0;i<4&&valid;i++)for(const ring of rings){for(let k=0;k<ring.length;k++){if(++work>500_000)return null;if(intersects(vertices[i],vertices[(i+1)%4],g.vertices_coords[ring[k]],g.vertices_coords[ring[(k+1)%ring.length]])){valid=false;break;}}if(!valid)break;}if(!valid)continue;
  const fixed:Point[]=[[cx-2*r*w,cy],...[.1,.25,.75,.9].flatMap(x=>[.1,.25,.75,.9].map(y=>[x0+x*w,y0+y*h] as Point))];for(const p of fixed){if(!inside(p)){if(work>500_000)return null;continue;}if(vertices.some((v,i)=>on(p,v,vertices[(i+1)%4])))continue;return {vertices,fixedPoint:p};}
 }
 return null;
}
