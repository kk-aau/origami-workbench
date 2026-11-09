import type {TessResult} from './tessellation';

export type RigidQuadScene={
  vertices:[number,number,number][];
  edges:[number,number][];
  assignments:('B'|'M'|'V'|'U'|'F'|'A')[];
  faces:number[][];
  maximumFaceDistanceError:number;
  maximumGridClosureError:number;
  maximumFoldAngleErrorRad:number;
  minimumSpatialEdgeLength:number;
};

export type RigidQuadProjection={
  points:[number,number][];
  depth:number[];
  faceOrder:number[];
  frontFacing:boolean[];
  surfaceOrderReliable:boolean;
};

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const vertexIndex=(value:unknown,count:number):value is number=>Number.isInteger(value)&&typeof value==='number'&&value>=0&&value<count;

/** The source carries a static spatial state; the 2D FOLD graph supplies its topology. */
export function rigidQuadScene(result:Pick<TessResult,'source'|'fold'>|null):RigidQuadScene|null{
  if(!result||result.source.output!=='rigid-3d'||result.source.staticGlobalIsometryChecked!==true)return null;
  const graph=result.fold;
  if(!graph||typeof graph!=='object'||Array.isArray(graph))return null;
  const fold=graph as Record<string,unknown>,vertices=result.source.foldedForm3D;
  const flat=fold.vertices_coords,edges=fold.edges_vertices,assignments=fold.edges_assignment,faces=fold.faces_vertices;
  const faceError=result.source.maximumFaceDistanceError,gridError=result.source.maximumGridClosureError,
    foldError=result.source.maximumFoldAngleErrorRad;
  if(!Array.isArray(flat)||!Array.isArray(vertices)||vertices.length!==flat.length||vertices.length<4||
    !Array.isArray(edges)||!Array.isArray(assignments)||edges.length!==assignments.length||!Array.isArray(faces)||!faces.length||
    !finite(faceError)||!finite(gridError)||!finite(foldError)||
    Math.min(faceError,gridError,foldError)<0||Math.max(faceError,gridError,foldError)>1e-7)return null;
  if(vertices.some(vertex=>!Array.isArray(vertex)||vertex.length!==3||vertex.some(value=>!finite(value)))||
    flat.some(vertex=>!Array.isArray(vertex)||vertex.length!==2||vertex.some(value=>!finite(value))))return null;
  if(edges.some(edge=>!Array.isArray(edge)||edge.length!==2||edge.some(value=>!vertexIndex(value,vertices.length))||edge[0]===edge[1]))return null;
  if(assignments.some(assignment=>!['B','M','V','U'].includes(assignment)))return null;
  if(faces.some(face=>!Array.isArray(face)||face.length<3||face.some(value=>!vertexIndex(value,vertices.length))||new Set(face).size!==face.length))return null;
  const spatial=vertices as [number,number,number][],spatialEdges=edges as [number,number][];
  const unfolded=flat as [number,number][];
  const xs=unfolded.map(([x])=>x),ys=unfolded.map(([,y])=>y);
  const scale=Math.max(1,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)));
  if(!finite(scale))return null;
  const tolerance=1e-7*scale;
  for(const face of faces as number[][]){
    let twiceArea=0;
    for(let position=0;position<face.length;position++){
      const first=unfolded[face[position]],second=unfolded[face[(position+1)%face.length]];
      twiceArea+=first[0]*second[1]-first[1]*second[0];
    }
    if(!finite(twiceArea)||twiceArea<=1e-9)return null;
    const first=spatial[face[0]],second=spatial[face[1]],last=spatial[face[face.length-1]];
    const u=[second[0]-first[0],second[1]-first[1],second[2]-first[2]];
    const v=[last[0]-first[0],last[1]-first[1],last[2]-first[2]];
    const normalLength=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
    if(!finite(normalLength)||normalLength<=1e-10)return null;
    for(let a=0;a<face.length;a++)for(let b=a+1;b<face.length;b++){
      const p=face[a],q=face[b];
      const flatDistance=Math.hypot(unfolded[p][0]-unfolded[q][0],unfolded[p][1]-unfolded[q][1]);
      const spatialDistance=Math.hypot(spatial[p][0]-spatial[q][0],spatial[p][1]-spatial[q][1],spatial[p][2]-spatial[q][2]);
      if(!finite(flatDistance)||!finite(spatialDistance)||Math.abs(flatDistance-spatialDistance)>tolerance)return null;
    }
  }
  const minimumSpatialEdgeLength=Math.min(...spatialEdges.map(([a,b])=>Math.hypot(
    spatial[a][0]-spatial[b][0],spatial[a][1]-spatial[b][1],spatial[a][2]-spatial[b][2])));
  if(!Number.isFinite(minimumSpatialEdgeLength)||minimumSpatialEdgeLength<=0)return null;
  return {vertices:spatial,edges:spatialEdges,
    assignments:assignments as RigidQuadScene['assignments'],faces:faces as number[][],
    maximumFaceDistanceError:faceError,maximumGridClosureError:gridError,maximumFoldAngleErrorRad:foldError,
    minimumSpatialEdgeLength};
}

export function projectRigidQuad(scene:RigidQuadScene,azimuth:number,elevation:number,back:boolean,rotation:number):RigidQuadProjection{
  const xs=scene.vertices.map(point=>point[0]),ys=scene.vertices.map(point=>point[1]),zs=scene.vertices.map(point=>point[2]);
  const center:[number,number,number]=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...zs)+Math.max(...zs))/2];
  const radius=Math.max(1e-9,...scene.vertices.map(([x,y,z])=>Math.hypot(x-center[0],y-center[1],z-center[2])));
  const scale=310/radius;
  const yaw=azimuth*Math.PI/180,tilt=(back?180-elevation:elevation)*Math.PI/180,spin=rotation*Math.PI/180;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt),cr=Math.cos(spin),sr=Math.sin(spin);
  const points:[number,number][]=[],depth:number[]=[];
  for(const [x,y,z] of scene.vertices){
    const dx=x-center[0],dy=y-center[1],dz=z-center[2];
    const horizontal=cy*dx-sy*dy,far=sy*dx+cy*dy;
    const vertical=-ct*far+st*dz;
    points.push([500+(cr*horizontal-sr*vertical)*scale,350+(sr*horizontal+cr*vertical)*scale]);
    depth.push(st*far+ct*dz);
  }
  const camera:[number,number,number]=[-sy*st,cy*st,ct];
  const frontFacing=scene.faces.map(face=>{
    // The first three FOLD vertices may be collinear after seam subdivision.
    // Newell's normal uses the whole oriented face, preserving its side color.
    let nx=0,ny=0,nz=0;
    for(let i=0;i<face.length;i++){
      const a=scene.vertices[face[i]],b=scene.vertices[face[(i+1)%face.length]];
      nx+=(a[1]-b[1])*(a[2]+b[2]);
      ny+=(a[2]-b[2])*(a[0]+b[0]);
      nz+=(a[0]-b[0])*(a[1]+b[1]);
    }
    return nx*camera[0]+ny*camera[1]+nz*camera[2]>=0;
  });
  const {faceOrder,surfaceOrderReliable}=orderRigidFaces(scene.faces,points,depth,radius,frontFacing);
  return {points,depth,faceOrder,frontFacing,surfaceOrderReliable};
}

type XY=[number,number];
const cross=(a:XY,b:XY,c:XY)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function area(poly:XY[]){return poly.reduce((sum,point,index)=>sum+point[0]*poly[(index+1)%poly.length][1]-point[1]*poly[(index+1)%poly.length][0],0)/2;}
function overlapPolygon(subject:XY[],clip:XY[]):XY[]{
  let result=subject;
  const sign=area(clip)>=0?1:-1;
  for(let index=0;index<clip.length&&result.length;index++){
    const a=clip[index],b=clip[(index+1)%clip.length],output:XY[]=[];
    let previous=result[result.length-1],previousSide=sign*cross(a,b,previous);
    for(const point of result){
      const side=sign*cross(a,b,point);
      if((side>=-1e-8)!==(previousSide>=-1e-8)){
        const t=previousSide/(previousSide-side);
        output.push([previous[0]+t*(point[0]-previous[0]),previous[1]+t*(point[1]-previous[1])]);
      }
      if(side>=-1e-8)output.push(point);
      previous=point;previousSide=side;
    }
    result=output;
  }
  return result;
}

function orderRigidFaces(faces:number[][],points:XY[],depth:number[],radius:number,frontFacing:boolean[]){
  const projected=faces.map(face=>face.map(index=>points[index]));
  const means=faces.map(face=>face.reduce((sum,index)=>sum+depth[index],0)/face.length);
  const roughOrder=faces.map((_,index)=>index).sort((a,b)=>means[a]-means[b]);
  const bounds=projected.map(poly=>({left:Math.min(...poly.map(p=>p[0])),right:Math.max(...poly.map(p=>p[0])),
    top:Math.min(...poly.map(p=>p[1])),bottom:Math.max(...poly.map(p=>p[1]))}));
  const plane=faces.map((face,index)=>{
    const poly=projected[index],origin=poly[0],z0=depth[face[0]];
    let chosen:{a:number;b:number}|null=null,maxDet=1e-8;
    for(let j=1;j<face.length;j++)for(let k=j+1;k<face.length;k++){
      const det=cross(origin,poly[j],poly[k]);
      if(Math.abs(det)<=maxDet)continue;
      const dz1=depth[face[j]]-z0,dz2=depth[face[k]]-z0;
      chosen={a:(dz1*(poly[k][1]-origin[1])-dz2*(poly[j][1]-origin[1]))/det,
        b:((poly[j][0]-origin[0])*dz2-(poly[k][0]-origin[0])*dz1)/det};
      maxDet=Math.abs(det);
    }
    return chosen?((point:XY)=>z0+chosen.a*(point[0]-origin[0])+chosen.b*(point[1]-origin[1])):null;
  });
  const edges=faces.map(()=>new Set<number>()),indegree=faces.map(()=>0),tol=Math.max(1e-10,radius*1e-9);
  for(let a=0;a<faces.length;a++)for(let b=a+1;b<faces.length;b++){
    const one=bounds[a],two=bounds[b];
    if(one.right<=two.left+1e-6||two.right<=one.left+1e-6||one.bottom<=two.top+1e-6||two.bottom<=one.top+1e-6)continue;
    const overlap=overlapPolygon(projected[a],projected[b]);
    if(overlap.length<3||Math.abs(area(overlap))<1e-4)continue;
    const planeA=plane[a],planeB=plane[b];
    if(!planeA||!planeB)return {faceOrder:roughOrder,surfaceOrderReliable:false};
    let aCloser=false,bCloser=false;
    for(const point of overlap){const difference=planeA(point)-planeB(point);if(difference>tol)aCloser=true;else if(difference<-tol)bCloser=true;}
    // Coincident same-side paper panels (for example a tube's glue overlap)
    // have the same opaque color, so either paint order is visually exact.
    // Opposite-side coincidence and depth crossings remain ambiguous.
    if(!aCloser&&!bCloser){
      if(frontFacing[a]===frontFacing[b])continue;
      return {faceOrder:roughOrder,surfaceOrderReliable:false};
    }
    if(aCloser&&bCloser)return {faceOrder:roughOrder,surfaceOrderReliable:false};
    const far=aCloser?b:a,near=aCloser?a:b;
    if(!edges[far].has(near)){edges[far].add(near);indegree[near]++;}
  }
  const queue=roughOrder.filter(index=>indegree[index]===0),faceOrder:number[]=[];
  while(queue.length){
    const next=queue.shift()!;faceOrder.push(next);
    for(const near of edges[next])if(--indegree[near]===0){queue.push(near);queue.sort((a,b)=>means[a]-means[b]);}
  }
  return {faceOrder:faceOrder.length===faces.length?faceOrder:roughOrder,
    surfaceOrderReliable:faceOrder.length===faces.length};
}
