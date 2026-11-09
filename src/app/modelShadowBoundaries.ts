import ear from 'rabbit-ear';
import {modelFaceRings,modelFaceContains} from './modelRings';
import type {FlatFoldResult,Point} from '../core/types';
import {flatPresentation,type FlatSide} from './flatPresentation';

export interface ModelShadowBoundary {
  a:Point;b:Point;
  /** Unit vector from the edge into the lower visible region. */
  inward:Point;
  upperFace:number;lowerFace:number;
}
export interface ModelShadowBoundaries {
  status:'ready'|'unconfirmed';
  boundaries:ModelShadowBoundary[];
  ambiguousEdges:number;
}
function distanceToEdge(p:Point,a:Point,b:Point){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function inside(p:Point,polygon:Point[]){
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
}

/** Identify real layer steps, not decorative exterior shadows.
 * Splitting edges handles crossings/T-junctions; two-sided coverage also handles
 * disconnected nested polygons, for which planarizeVerbose's face map is insufficient.
 * Render each strip clipped to lowerFace, before painting higher faces.
 */
export function modelShadowBoundaries(result:FlatFoldResult,side:FlatSide,rotation=0):ModelShadowBoundaries{
  const display=flatPresentation(result,side,rotation);
  if(result.geometry.status!=='ready'||!display.hasOrder)return {status:'unconfirmed',boundaries:[],ambiguousEdges:0};
  const vertices=display.vertices,faces=result.geometry.faces;
  if(!faces.length)return {status:'ready',boundaries:[],ambiguousEdges:0};
  if(vertices.some(p=>p.some(n=>Math.abs(n)>1e6)))throw new Error('阴影模型坐标超出范围。');
  const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]),scale=vertices.length?Math.max(1,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)):1;
  const epsilon=Math.max(1e-8,scale*1e-10);
  const edges:number[][]=[],seen=new Set<string>();
  faces.forEach((_,f)=>modelFaceRings(result,f).forEach(face=>face.forEach((a,i)=>{const b=face[(i+1)%face.length],key=a<b?a+','+b:b+','+a;if(!seen.has(key)){seen.add(key);edges.push([a,b]);}})));
  const planar=ear.graph.planarizeEdges({vertices_coords:vertices.map(p=>[...p]),edges_vertices:edges},epsilon) as {vertices_coords:Point[];edges_vertices:[number,number][]};
  const segments=planar.edges_vertices.map(([a,b])=>({a:planar.vertices_coords[a],b:planar.vertices_coords[b]}));
  const polygons=faces.map(face=>face.map(v=>vertices[v])),rank=new Map(display.order.map((f,i)=>[f,i]));
  const known=new Set((result.layers.faceOrders??[]).filter(([a,b,d])=>a!==b&&Math.abs(d)===1).map(([a,b])=>a<b?a+','+b:b+','+a));
  const boundaries:ModelShadowBoundary[]=[];let ambiguousEdges=0;
  for(const edge of segments){
    const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1],length=Math.hypot(dx,dy);if(length<=epsilon)continue;
    const middle:Point=[(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2],normal:Point=[-dy/length,dx/length];
    let clearance=length/4;
    for(const other of segments){
      if(other===edge)continue;
      const d=distanceToEdge(middle,other.a,other.b);
      if(d<=epsilon){clearance=0;break;}
      clearance=Math.min(clearance,d/4);
    }
    if(clearance<=epsilon*4){ambiguousEdges++;continue;}
    const probe=(sign:number):number[]=>{
      const p:Point=[middle[0]+normal[0]*clearance*sign,middle[1]+normal[1]*clearance*sign];
      return display.order.filter(f=>modelFaceContains(result,f,p,vertices));
    };
    const left=probe(1),right=probe(-1),l=left.at(-1),r=right.at(-1);
    if(l===undefined||r===undefined||l===r)continue; // Exterior, hole, or hidden seam.
    const key=l<r?l+','+r:r+','+l;if(!known.has(key))continue;
    const leftIsUpper=rank.get(l)!>rank.get(r)!,upperFace=leftIsUpper?l:r,lowerFace=leftIsUpper?r:l;
    if(!(leftIsUpper?left:right).includes(lowerFace))continue; // Adjacent nonoverlapping faces.
    const sign=leftIsUpper?-1:1;
    boundaries.push({a:[...edge.a],b:[...edge.b],inward:[normal[0]*sign,normal[1]*sign],upperFace,lowerFace});
  }
  return {status:'ready',boundaries,ambiguousEdges};
}
