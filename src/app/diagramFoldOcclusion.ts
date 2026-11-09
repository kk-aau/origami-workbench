import type {Point} from '../core/types';

export interface DiagramOcclusionPiece {shown:readonly Point[];shownHoles?:readonly (readonly Point[])[]}
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
function onEdge(point:Point,a:Point,b:Point,eps:number){
  const edge=sub(b,a),offset=sub(point,a),length=Math.hypot(...edge),along=offset[0]*edge[0]+offset[1]*edge[1];
  return length>eps&&Math.abs(cross(offset,edge))<=eps*length&&along>=-eps*length&&along<=length*length+eps*length;
}
function inRing(point:Point,ring:readonly Point[],eps:number,strict:boolean,tick:(amount?:number)=>void){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    tick();const a=ring[j],b=ring[i];if(onEdge(point,a,b,eps))return !strict;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

/** A paper boundary does not cover a crease beneath it. A deformed local face
 * is a union of source triangles: their shared seams still belong to the
 * paper's interior, including vertices where several cells meet. Determine
 * that local interior by covered directions, without offsetting the point by
 * a fixed distance that could jump over a valid narrow paper region. Rigid
 * faces use their original polygon and holes; nonrigid pieces are triangles. */
export function diagramPiecesStrictlyCoverPoint(pieces:readonly DiagramOcclusionPiece[],point:Point,eps:number,tick:(amount?:number)=>void=()=>{}):boolean {
  const contacts:Point[][]=[];
  for(const piece of pieces){
    tick();const holes=piece.shownHoles??[];
    if(!inRing(point,piece.shown,eps,false,tick)||holes.some(ring=>inRing(point,ring,eps,true,tick)))continue;
    if(inRing(point,piece.shown,eps,true,tick)&&!holes.some(ring=>inRing(point,ring,eps,false,tick)))return true;
    if(piece.shown.length===3&&!holes.length)contacts.push([...piece.shown]);
  }
  if(contacts.length<2)return false;
  const tau=Math.PI*2,angles:number[]=[],cones:Point[][]=[];
  for(const triangle of contacts){
    const sign=Math.sign(cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0]))),normals:Point[]=[];
    if(!sign)continue;
    for(let i=0;i<3;i++){
      tick();const a=triangle[i],b=triangle[(i+1)%3];if(!onEdge(point,a,b,eps))continue;
      const edge=sub(b,a),length=Math.hypot(...edge),angle=(Math.atan2(edge[1],edge[0])+tau)%tau;
      normals.push([-edge[1]*sign/length,edge[0]*sign/length]);angles.push(angle,(angle+Math.PI)%tau);
    }
    if(!normals.length)return true;
    cones.push(normals);
  }
  if(!cones.length)return false;
  // Opposite copies of the same indexed edge can differ by a few rounding
  // bits after atan2/modulo. Merge only floating-point angular duplicates.
  const angularRoundoff=Number.EPSILON*64,stops=angles.sort((a,b)=>a-b).filter((angle,i,list)=>!i||angle-list[i-1]>angularRoundoff);
  if(stops.length>1&&stops[0]+tau-stops[stops.length-1]<=angularRoundoff)stops.pop();
  for(let i=0;i<stops.length;i++){
    const angle=(stops[i]+(stops[(i+1)%stops.length]+(i===stops.length-1?tau:0)))/2,direction:Point=[Math.cos(angle),Math.sin(angle)];
    if(!cones.some(normals=>normals.every(normal=>{tick();return normal[0]*direction[0]+normal[1]*direction[1]>0;})))return false;
  }
  return true;
}
