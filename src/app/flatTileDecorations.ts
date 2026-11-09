import type {FlatFoldResult,FoldGraph,Point} from '../core/types';
import {polygonArea} from '../core/geometry';
import type {ModelLayerRegion} from './modelRegionLayers';
import type {DecoratedTile,TileDecorations} from './tileDecorations';

export type FlatTileDecorationSource={tiles:DecoratedTile[];options:TileDecorations;faceTileInstance:number[]};
/** A visible display fragment only; it carries no coverage or layer-order certificate. */
export type VisibleFlatTileRegion={polygon:Point[];topFace:number};
export type FlatTileRegionInput=ModelLayerRegion|VisibleFlatTileRegion;
export type VisibleTileRegion={polygon:Point[];topFace:number;tile:number;area:number;center:Point;boundarySegments?:[Point,Point][]};
export type FlatTileDecorationMapping={
  regions:VisibleTileRegion[];
  cornerIds:number[][];
  cornerPositions:Point[][];
  cornerFaceIds:number[][][];
  /** Physical CP edges on each tile boundary, indexed by folded face ID. */
  boundaryEdges:[number,number][][];
  faceVertices:number[][];
  similarityScales:number[];
  /** Derived only after all face coordinates and visible layer regions pass validation. */
  faceMaps:((point:Point)=>Point)[];
};

const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const finite=(p:Point)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
type FaceMap=(point:Point)=>Point;
function makeFaceMap(face:number[],cp:Point[],folded:Point[],eps:number):FaceMap|null{
  if(face.length<3)return null;
  const a=face[0];
  for(let j=1;j<face.length;j++)for(let k=j+1;k<face.length;k++){
    const b=face[j],c=face[k],u:Point=[cp[b][0]-cp[a][0],cp[b][1]-cp[a][1]],v:Point=[cp[c][0]-cp[a][0],cp[c][1]-cp[a][1]];
    const det=u[0]*v[1]-u[1]*v[0];
    if(Math.abs(det)<=eps*eps)continue;
    const map=(point:Point):Point=>{
      const x=point[0]-cp[a][0],y=point[1]-cp[a][1],s=(x*v[1]-y*v[0])/det,t=(u[0]*y-u[1]*x)/det;
      return [folded[a][0]+s*(folded[b][0]-folded[a][0])+t*(folded[c][0]-folded[a][0]),
        folded[a][1]+s*(folded[b][1]-folded[a][1])+t*(folded[c][1]-folded[a][1])];
    };
    return face.every(i=>distance(map(cp[i]),folded[i])<=eps*10)?map:null;
  }
  return null;
}
function clipConvex(subject:Point[],clip:Point[],eps:number):Point[]{
  let output=subject;
  const orientation=Math.sign(polygonArea(clip));
  if(!orientation)return [];
  for(let i=0;i<clip.length&&output.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],side=(p:Point)=>orientation*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
    const input=output;output=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],d=side(p),e=side(q),inside=d>=-eps,outside=e>=-eps;
      if(inside)output.push(p);
      if(inside!==outside){
        const t=d/(d-e);
        output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
      }
    }
    output=output.filter((p,j)=>!j||distance(p,output[j-1])>eps);
    if(output.length>1&&distance(output[0],output[output.length-1])<=eps)output.pop();
  }
  return output.length>=3?output:[];
}
function onSegment(point:Point,a:Point,b:Point,eps:number):boolean{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<=eps)return false;
  const cross=dx*(point[1]-a[1])-dy*(point[0]-a[0]);
  const dot=(point[0]-a[0])*dx+(point[1]-a[1])*dy;
  return Math.abs(cross)<=eps*length&&dot>=-eps*length&&dot<=length*length+eps*length;
}
function inConvexPolygon(point:Point,polygon:Point[],eps:number):boolean{
  let sign=0;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);
    const limit=eps*distance(a,b);
    if(Math.abs(cross)<=limit)continue;
    if(sign&&Math.sign(cross)!==sign)return false;
    sign=Math.sign(cross);
  }
  return true;
}
function polygonCenter(points:Point[]):Point{
  const twice=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  if(Math.abs(twice)<1e-12)return [points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];
  let x=0,y=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
    x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
  }
  return [x/(3*twice),y/(3*twice)];
}
function insideRegion(point:Point,polygon:Point[],eps:number):boolean{
  let inside=false;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    if(onSegment(point,a,b,eps))return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

/** Origamica 209166: each FF TileVertices list must be similar to its CP tile.
 * Only carry decoration onto verified visible *folded faces*, never onto an
 * affine projection of the unfolded mother polygon.
 */
export function mapVisibleFlatTileDecorations(source:FlatTileDecorationSource,graph:FoldGraph,result:FlatFoldResult,regions:readonly FlatTileRegionInput[]):FlatTileDecorationMapping|null{
  const {tiles,faceTileInstance:owners}=source,cp=graph.vertices_coords,faces=graph.faces_vertices??[],folded=result.geometry.vertices;
  const topFace=(r:FlatTileRegionInput)=>'layers' in r?(r.layers.status==='ordered'&&r.faces.includes(r.layers.topToBottom[0])?r.layers.topToBottom[0]:-1):r.topFace;
  if(!tiles.length||result.geometry.status!=='ready'||result.layers.status!=='solved'||!regions.length||
     !faces.length||faces.length!==result.geometry.faces.length||owners.length!==faces.length||
     !cp.length||cp.length!==folded.length||cp.some(p=>!finite(p))||folded.some(p=>!finite(p))||
     owners.some(i=>!Number.isInteger(i)||i< -1||i>=tiles.length)||
     regions.some(r=>r.polygon.length<3||r.polygon.some(p=>!finite(p))||
       !Number.isInteger(topFace(r))||topFace(r)<0||topFace(r)>=faces.length))return null;
  const xs=cp.map(p=>p[0]),ys=cp.map(p=>p[1]),span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
  const eps=Math.max(1e-6,span*1e-6),minVisibleArea=Math.max(eps*eps,span*span*1e-10),cornerIds:number[][]=[],cornerPositions:Point[][]=[],cornerFaceIds:number[][][]=[],similarityScales:number[]=[];
  const faceMaps=faces.map(face=>makeFaceMap(face,cp,folded,eps));
  if(faceMaps.some(map=>!map))return null;
  for(let tileIndex=0;tileIndex<tiles.length;tileIndex++){
    const polygon=tiles[tileIndex].points;
    if(polygon.length<3||polygon.some(p=>!finite(p))||Math.abs(polygonArea(polygon))<=eps*eps||
       polygon.some(p=>!inConvexPolygon(p,polygon,eps)))return null;
    const ids:number[]=[],positions:Point[]=[],cornerFaces:number[][]=[];
    for(const point of polygon){
      const candidates=cp.map((p,i)=>({i,d:distance(p,point)})).filter(x=>x.d<=eps);
      if(candidates.length>1)return null;
      const faceIds=faces.flatMap((face,index)=>insideRegion(point,face.map(i=>cp[i]),eps)?[index]:[]);
      const mapped=candidates.length?[folded[candidates[0].i]]:faceIds.map(index=>faceMaps[index]!(point));
      if(!mapped.length||mapped.some(p=>distance(p,mapped[0])>eps*10))return null;
      ids.push(candidates.length?candidates[0].i:-1);positions.push(mapped[0]);cornerFaces.push(faceIds);
    }
    if(new Set(ids.filter(i=>i>=0)).size!==ids.filter(i=>i>=0).length)return null;
    let ratio=0;
    for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
      const oldDistance=distance(polygon[a],polygon[b]),newDistance=distance(positions[a],positions[b]);
      if(oldDistance<=eps||newDistance<=eps)return null;
      const next=newDistance/oldDistance;
      if(ratio&&Math.abs(next-ratio)>1e-5*Math.max(1,ratio))return null;
      ratio=ratio||next;
    }
    if(!Number.isFinite(ratio)||ratio<=0)return null;
    cornerIds.push(ids);cornerPositions.push(positions);cornerFaceIds.push(cornerFaces);similarityScales.push(ratio);
  }
  const boundaryEdges:[number,number][][]=faces.map(()=>[]);
  for(let faceIndex=0;faceIndex<faces.length;faceIndex++){
    const face=faces[faceIndex],owner=owners[faceIndex],tile=owner>=0?tiles[owner]:null;
    if(face.length<3||face.some(v=>!Number.isInteger(v)||v<0||v>=cp.length))return null;
    for(let i=0;i<face.length;i++){
      const a=face[i],b=face[(i+1)%face.length];
      if(a===b)return null;
      if(tile?.points.some((p,j)=>onSegment(cp[a],p,tile.points[(j+1)%tile.points.length],eps)&&onSegment(cp[b],p,tile.points[(j+1)%tile.points.length],eps)))boundaryEdges[faceIndex].push([a,b]);
    }
  }
  type FaceTile={tile:number;polygon:Point[];boundarySegments:[Point,Point][]};
  const faceTileCache=new Map<number,FaceTile[]>();
  const faceTiles=(faceIndex:number):FaceTile[]=>{
    const cached=faceTileCache.get(faceIndex);
    if(cached)return cached;
    const facePolygon=faces[faceIndex].map(i=>cp[i]),candidates:FaceTile[]=[];
    for(let tile=0;tile<tiles.length;tile++){
      if(Math.abs(polygonArea(clipConvex(facePolygon,tiles[tile].points,eps*eps)))<=minVisibleArea)continue;
      const polygon=tiles[tile].points.map(point=>faceMaps[faceIndex]!(point));
      candidates.push({tile,polygon,boundarySegments:polygon.map((point,i)=>[point,polygon[(i+1)%polygon.length]] as [Point,Point])});
    }
    faceTileCache.set(faceIndex,candidates);
    return candidates;
  };
  const visible:VisibleTileRegion[]=[];
  for(const region of regions){
    const top=topFace(region);
    const area=Math.abs(polygonArea(region.polygon));
    if(!Number.isFinite(area))return null;
    // The overlap solver may retain zero-area numerical slivers. They carry no
    // visible paper and cannot be used as label anchors.
    if(area<=minVisibleArea)continue;
    const add=(polygon:Point[],tile:number,boundarySegments?:[Point,Point][])=>{
      const pieceArea=Math.abs(polygonArea(polygon));
      if(pieceArea<=minVisibleArea)return 0;
      let center=polygonCenter(polygon);
      if(!insideRegion(center,polygon,eps)){
        const a=polygon[0];
        const candidate=polygon.slice(1,-1).map((b,i)=>[(a[0]+b[0]+polygon[i+2][0])/3,(a[1]+b[1]+polygon[i+2][1])/3] as Point).find(point=>insideRegion(point,polygon,eps));
        if(!candidate)return 0;
        center=candidate;
      }
      visible.push({polygon,topFace:top,tile,area:pieceArea,center,boundarySegments});
      return pieceArea;
    };
    // A face can cross a deleted tile seam even when the generator attaches a
    // single owner to its centroid. Partition by actual tile geometry.
    let covered=0;
    for(const candidate of faceTiles(top)){
      const piece=clipConvex(region.polygon,candidate.polygon,eps*eps);
      if(piece.length)covered+=add(piece,candidate.tile,candidate.boundarySegments);
    }
    if(Math.abs(covered-area)>Math.max(minVisibleArea*tiles.length,area*1e-5))return null;
  }
  if(!visible.length)return null;
  return {regions:visible,cornerIds,cornerPositions,cornerFaceIds,boundaryEdges,faceVertices:faces,similarityScales,faceMaps:faceMaps as FaceMap[]};
}
