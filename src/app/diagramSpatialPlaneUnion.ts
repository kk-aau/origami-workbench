import type {FlatFoldResult,FoldGraph,Point} from '../core/types';
import type {RigidFoldPoint3} from '../core/rigidFoldGeometry';
import type {DiagramSpatialPose} from './diagramSpatialPose';
import {buildExactModelTopology,walkExactCoverage} from './modelExactTopology';
import type {SpatialDepthPlane} from './diagramSpatialDepthKernel';
import {polygonArea} from '../core/geometry';
import {spatialOverlapRegions} from './modelOverlapRegions';

type Vec=readonly number[];
const dot=(p:Vec,q:Vec)=>p[0]*q[0]+p[1]*q[1]+p[2]*q[2];
function relative(p:Vec,q:Vec):RigidFoldPoint3{return [p[0]-q[0],p[1]-q[1],p[2]-q[2]];}

export interface SpatialPlaneUnion {
  root:number;origin:RigidFoldPoint3;x:RigidFoldPoint3;y:RigidFoldPoint3;normal:RigidFoldPoint3;
  /** Oriented contours of the boolean union in this plane's coordinates. */
  contours:Point[][];
}

/** Keep the boundary between occupied and empty cells, eliminating internal
 * edges even when the inputs overlap only partially. At a point contact the
 * halfedge successor follows the correct component without welding its rings. */
export function materialUnionContours(vertices:Point[],faces:number[][],holes:number[][][]):Point[][]{
  if(faces.length===1)return [faces[0],...(holes[0]??[])].map((ring,i)=>{
    const points=ring.map(v=>vertices[v]);
    return (polygonArea(points)>0)===(i===0)?points:points.reverse();
  });
  const graph={vertices_coords:vertices,faces_vertices:faces,faces_holes:holes,edges_vertices:[],edges_assignment:[],edges_foldAngle:[]};
  const input:FlatFoldResult={geometry:{status:'ready',message:'',vertices,faces,graph},layers:{status:'unknown',message:''},warnings:[]};
  const topology=buildExactModelTopology(input);
  const occupied=new Uint8Array(topology.cellCount);
  walkExactCoverage(topology,{onCell(id,owners){occupied[id]=Number(owners.size>0);}});
  const {edgeCells,edgeVertices,vertexXY,halfedgeNext}=topology;
  const visited=new Uint8Array(edgeCells.length),contours:Point[][]=[];
  for(let start=0;start<edgeCells.length;start++){
    if(visited[start]||!occupied[edgeCells[start]]||occupied[edgeCells[start^1]])continue;
    const ring:Point[]=[];
    let h=start;
    do{
      if(visited[h])throw Error('平面并集的边界无法闭合。');
      visited[h]=1;
      const v=edgeVertices[h]*2;
      ring.push([vertexXY[v],vertexXY[v+1]]);
      h=halfedgeNext[h];
      while(occupied[edgeCells[h^1]])h=halfedgeNext[h^1];
    }while(h!==start);
    contours.push(ring);
  }
  return contours;
}

export function buildSpatialPlaneUnions(source:FoldGraph,spatial:DiagramSpatialPose,shown:readonly (SpatialDepthPlane|null)[],
  samePlane:(a:number,b:number)=>boolean){
  const faces=source.faces_vertices!,owner=new Int32Array(faces.length).fill(-1),groups:number[][]=[];
  for(let f=0;f<faces.length;f++){
    if(!shown[f])continue;
    let id=groups.findIndex(group=>group.every(other=>samePlane(other,f)));
    if(id<0){id=groups.length;groups.push([]);}
    owner[f]=id;groups[id].push(f);
  }
  const planes=groups.map(group=>{
    const root=group[0],r=spatial.faceTransforms[root].rotation,origin=spatial.vertices[faces[root][0]];
    const x:RigidFoldPoint3=[r[0],r[3],r[6]],y:RigidFoldPoint3=[r[1],r[4],r[7]],normal:RigidFoldPoint3=[r[2],r[5],r[8]];
    const indices=new Map<number,number>(),vertices:Point[]=[];
    const local=(ring:number[])=>ring.map(id=>{
      let v=indices.get(id);
      if(v===undefined){v=vertices.length;indices.set(id,v);const p=relative(spatial.vertices[id],origin);vertices.push([dot(p,x),dot(p,y)]);}
      return v;
    });
    const outer=group.map(f=>local(faces[f])),holes=group.map(f=>(source.faces_holes?.[f]??[]).map(local));
    const contours=materialUnionContours(vertices,outer,holes);
    let overlaps:Set<number>|undefined;
    const touches=(a:number,b:number)=>{
      if(!overlaps){
        const graph={vertices_coords:vertices,faces_vertices:outer,faces_holes:holes,edges_vertices:[],edges_assignment:[],edges_foldAngle:[]};
        const layers=spatialOverlapRegions({geometry:{status:'ready',message:'',vertices,faces:outer,graph},layers:{status:'unknown',message:''},warnings:[]});
        overlaps=new Set();
        for(const cell of layers.cells)for(let i=0;i<cell.faces.length;i++)for(let j=i+1;j<cell.faces.length;j++){
          const a=group[cell.faces[i]],b=group[cell.faces[j]];
          overlaps.add(Math.min(a,b)*faces.length+Math.max(a,b));
        }
      }
      return overlaps.has(Math.min(a,b)*faces.length+Math.max(a,b));
    };
    return {root,origin,x,y,normal,contours,touches};
  });
  return {planes,owner};
}

/** Cut the actual union by the other plane. Ring winding preserves holes and
 * disconnected pieces. On concave rings, coincident cut-edge runs cancel.
 * The original CP and the union chosen as splitter keep their full geometry. */
export function cutPlaneUnion(paper:SpatialPlaneUnion,splitter:SpatialPlaneUnion){
  const offset=dot(relative(paper.origin,splitter.origin),splitter.normal);
  const x=dot(paper.x,splitter.normal),y=dot(paper.y,splitter.normal);
  const distance=(p:Point)=>{
    const d=offset+x*p[0]+y*p[1];
    const error=128*Number.EPSILON*(1+Math.abs(p[0])+Math.abs(p[1])+Math.abs(offset)+
      Math.abs(paper.origin[0])+Math.abs(paper.origin[1])+Math.abs(paper.origin[2]));
    return Math.abs(d)<=error?0:d;
  };
  const positive:Point[][]=[],negative:Point[][]=[];
  const uncertain:Point[][]=[];
  let anchor:Point|undefined;
  for(const ring of paper.contours){
    const offsets=ring.map(distance);
    if(offsets.every(d=>d===0)){uncertain.push(ring);continue;}
    if(offsets.every(d=>d>=0)){if(offsets.some(d=>d>0))positive.push(ring);continue;}
    if(offsets.every(d=>d<=0)){if(offsets.some(d=>d<0))negative.push(ring);continue;}
    const front:Point[]=[],back:Point[]=[];
    for(let i=0;i<ring.length;i++){
      const j=(i+1)%ring.length,a=ring[i],b=ring[j],da=offsets[i],db=offsets[j];
      if(da>=0)front.push(a);
      if(da<=0)back.push(a);
      if((da>0&&db<0)||(da<0&&db>0)){
        const t=da/(da-db),p:Point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
        anchor??=p;front.push(p);back.push(p);
      }
    }
    if(front.length>=3)positive.push(front);
    if(back.length>=3)negative.push(back);
  }
  return {positive,negative,uncertain,anchor,gradient:[x,y] as Point,offset};
}

export function unionSide(cut:ReturnType<typeof cutPlaneUnion>){
  if(cut.uncertain.length)return 0;
  return cut.positive.length?(cut.negative.length?0:1):cut.negative.length?-1:0;
}

type CameraPlane=SpatialDepthPlane&{normalSign:number};
export interface UnionOrder {whole:number;at:(polygon:readonly Point[])=>number}

/** Build each intersecting union-pair partition once per camera, before any
 * original paper layer is mapped back onto it. Positive means A is nearer. */
export function planeUnionOrder(a:SpatialPlaneUnion,b:SpatialPlaneUnion,depthA:CameraPlane,depthB:CameraPlane,
  project:(p:RigidFoldPoint3)=>readonly number[],direction:(p:RigidFoldPoint3)=>readonly number[]):UnionOrder{
  const ab=cutPlaneUnion(a,b),ba=cutPlaneUnion(b,a);
  // Keep an unsplit union whenever either plane separates the entire other
  // union. For edge-only contact either legal painter order looks identical.
  const singleA=unionSide(ab)!==0,singleB=unionSide(ba)!==0;
  const useA=singleA===singleB?depthB.condition<=depthA.condition:singleA;
  const paper=useA?a:b,cut=useA?ab:ba,factor=useA?depthB.normalSign:-depthA.normalSign;
  const whole=unionSide(cut)*factor;
  if(whole)return {whole,at:()=>whole};
  const dx=direction(paper.x),dy=direction(paper.y),det=dx[0]*dy[1]-dx[1]*dy[0];
  const base=cut.anchor??[0,0],anchor=project(paper.origin.map((n,i)=>n+paper.x[i]*base[0]+paper.y[i]*base[1]) as RigidFoldPoint3);
  const [u,v]=cut.gradient;
  const gx=u*dy[1]-v*dx[1],gy=v*dx[0]-u*dy[0];
  const originTerm=cut.anchor?0:cut.offset*det;
  return {whole,at(polygon){
    let sign=0;
    for(const p of polygon){
      const x=gx*(p[0]-anchor[0]),y=gy*(p[1]-anchor[1]),value=originTerm+x+y;
      const error=16*Number.EPSILON*(Math.abs(originTerm)+Math.abs(x)+Math.abs(y)+
        Math.abs(gx)*(Math.abs(p[0])+Math.abs(anchor[0]))+Math.abs(gy)*(Math.abs(p[1])+Math.abs(anchor[1])));
      if(Math.abs(value)<=error)continue;
      const side=Math.sign(value)*Math.sign(det)*factor;
      if(sign&&side!==sign)return 2;
      sign=side;
    }
    return sign;
  }};
}

/** Coordinates of the actual union boundaries in the current camera. The
 * overlap solver takes these rings alone. Winding is recorded before camera
 * projection, so a back-facing plane keeps its holes and islands. */
export function projectedUnionRegions(planes:readonly SpatialPlaneUnion[],project:(p:RigidFoldPoint3)=>readonly number[]){
  const incomplete=new Set<number>(),cells:{polygon:Point[];faces:number[]}[]=[];
  if(planes.length<2)return {cells,incomplete};
  const vertices:Point[]=[],rings:number[][]=[],owners:{plane:number;winding:number}[]=[];
  for(const [plane,paper] of planes.entries()){
    for(const ring of paper.contours){
      const winding=Math.sign(polygonArea(ring));
      const points=ring.map(([x,y])=>{
        const world=paper.origin.map((v,i)=>v+paper.x[i]*x+paper.y[i]*y) as RigidFoldPoint3;
        const [sx,sy]=project(world);
        return [sx,sy] as Point;
      });
      if(!winding||!polygonArea(points)){
        // A rounded contour cannot certify uniform depth over the entire
        // plane. Keep its native-space cut available when mapping layers.
        incomplete.add(plane);continue;
      }
      owners.push({plane,winding});
      rings.push(points.map(p=>vertices.push(p)-1));
    }
  }
  if(!rings.length)return {cells,incomplete};
  const graph={vertices_coords:vertices,faces_vertices:rings,edges_vertices:[],edges_assignment:[],edges_foldAngle:[]};
  const input:FlatFoldResult={geometry:{status:'ready',message:'',vertices,faces:rings,graph},layers:{status:'unknown',message:''},warnings:[]};
  const topology=buildExactModelTopology(input);
  walkExactCoverage(topology,{onCell(cell,coverage){
    const counts=new Map<number,number>();
    for(const id of coverage){const {plane,winding}=owners[id];counts.set(plane,(counts.get(plane)??0)+winding);}
    const faces=[...counts].filter(([,count])=>count>0).map(([plane])=>plane).sort((a,b)=>a-b);
    if(faces.length<2)return;
    const ring=topology.cellRingOffsets[cell],polygon:Point[]=[];
    for(let i=topology.ringVertexOffsets[ring];i<topology.ringVertexOffsets[ring+1];i++){
      const v=topology.ringVertices[i]*2;
      polygon.push([topology.vertexXY[v],topology.vertexXY[v+1]]);
    }
    cells.push({polygon,faces});
  }});
  return {cells,incomplete};
}
