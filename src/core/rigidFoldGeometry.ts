import ear from 'rabbit-ear';
import type {FoldGraph,Point} from './types';
import {materialFaceRings} from './materialRings';
import {materialOrientation,materialPointInside} from './materialTraceGeometry';

export type RigidFoldPoint3=[number,number,number];
/** Row-major rotation, followed by translation; maps CP [x,y,0] into world. */
export interface RigidFoldTransform3D {rotation:number[];translation:RigidFoldPoint3}
export function applyRigidFoldTransform(transform:RigidFoldTransform3D,point:readonly [number,number]|readonly [number,number,number]):RigidFoldPoint3 {
  const r=transform.rotation,t=transform.translation,[x,y]=point,z=point[2]??0;
  return [r[0]*x+r[1]*y+r[2]*z+t[0],r[3]*x+r[4]*y+r[5]*z+t[1],r[6]*x+r[7]*y+r[8]*z+t[2]];
}
export interface RigidFoldGeometryOptions {
  /** Absolute signed targets. Zero is unfolded, including zero-angle M/V edges. */
  edgesFoldAngle?:readonly (number|null)[];
  startingFace?:number;
  /** Optional pose of the stationary face, not an additional fold-angle delta. */
  fixedFaceTransform?:RigidFoldTransform3D;
}
export interface RigidFoldGeometryDiagnostics {
  maximumClosureErrorMm:number;
  maximumFaceDistanceErrorMm:number;
  maximumAngleErrorDeg:number;
  positionToleranceMm:number;
  angleToleranceDeg:number;
}
export type RigidFoldGeometryResult={
  status:'ready';message:string;vertices:RigidFoldPoint3[];faces:number[][];
  faceTransforms:RigidFoldTransform3D[];faceNormals:RigidFoldPoint3[];
  /** Same indices as graph.edges_vertices. Non-hinge F marks have no dihedral. */
  measuredAngles:(number|null)[];targetAngles:number[];startingFace:number;
  diagnostics:RigidFoldGeometryDiagnostics;
  collisionChecked:false;continuousPathCertified:false;
}|{
  status:'invalid'|'inconsistent'|'unsupported';message:string;code:string;
  edge?:number;face?:number;diagnostics?:RigidFoldGeometryDiagnostics;
};

type V=RigidFoldPoint3;
type Occurrence={face:number;direction:1|-1};
type Failure=Extract<RigidFoldGeometryResult,{code:string}>;
class Refusal extends Error {constructor(readonly result:Failure){super(result.message);}}
const fail=(status:Failure['status'],code:string,message:string,place:Pick<Failure,'edge'|'face'>={}):never=>{throw new Refusal({status,code,message,...place});};
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=(a:V)=>Math.hypot(...a);
const unit=(a:V):V=>{const n=norm(a);return [a[0]/n,a[1]/n,a[2]/n];};
const cp=(p:Point):V=>[p[0],p[1],0];
const pairKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
const identity=()=>[1,0,0,0,1,0,0,0,1,0,0,0];
const apply=(m:number[],p:Point):V=>[m[0]*p[0]+m[3]*p[1]+m[9],m[1]*p[0]+m[4]*p[1]+m[10],m[2]*p[0]+m[5]*p[1]+m[11]];
const transform=(m:number[]):RigidFoldTransform3D=>({rotation:[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]],translation:[m[9],m[10],m[11]]});
function rotationError(m:number[]):number {
  const columns:V[]=[[m[0],m[1],m[2]],[m[3],m[4],m[5]],[m[6],m[7],m[8]]];
  let error=Math.abs(dot(cross(columns[0],columns[1]),columns[2])-1);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)error=Math.max(error,Math.abs(dot(columns[i],columns[j])-(i===j?1:0)));
  return error;
}
function fixedMatrix(value:RigidFoldTransform3D|undefined):number[]{
  if(value===undefined)return identity();
  if(!Array.isArray(value.rotation)||value.rotation.length!==9||!Array.isArray(value.translation)||value.translation.length!==3||[...value.rotation,...value.translation].some(n=>!Number.isFinite(n)))fail('invalid','FIXED_FRAME','固定面的三维刚体变换无效。');
  const r=value.rotation,m=[r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8],...value.translation];
  if(rotationError(m)>1e-10)fail('invalid','FIXED_FRAME','固定面变换包含缩放、剪切或三维镜像，不能作为刚性纸面姿态。');
  return m;
}
function area(points:Point[],ring:number[]):number {
  const a=points[ring[0]];let result=0;
  for(let i=0;i<ring.length;i++){const b=points[ring[i]],c=points[ring[(i+1)%ring.length]];result+=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
  return result/2;
}
function ringNormal(vertices:V[],ring:number[],sign:number):V {
  const a=vertices[ring[0]],sum:V=[0,0,0];
  for(let i=0;i<ring.length;i++){const n=cross(sub(vertices[ring[i]],a),sub(vertices[ring[(i+1)%ring.length]],a));for(let k=0;k<3;k++)sum[k]+=n[k]*sign;}
  return unit(sum);
}
function onRing(point:Point,points:Point[],ring:number[]):boolean {
  return ring.some((v,i)=>{const a=points[v],b=points[ring[(i+1)%ring.length]];return !materialOrientation(a,b,point)&&point[0]>=Math.min(a[0],b[0])&&point[0]<=Math.max(a[0],b[0])&&point[1]>=Math.min(a[1],b[1])&&point[1]<=Math.max(a[1],b[1]);});
}

/** Exact requested endpoint by a face spanning tree, followed by independent
 * closure and dihedral checks on EVERY indexed material connection. The tree
 * is a candidate construction, never a proof of a compatible closed mechanism.
 * Existing CP fold angles are absolute, so an already folded hinge is not folded
 * again. This endpoint says nothing about collision-free reachability. */
export function solveRigidFoldGeometry(graph:FoldGraph,options:RigidFoldGeometryOptions={}):RigidFoldGeometryResult {
  let diagnostics:RigidFoldGeometryDiagnostics|undefined;
  try{
    const points=graph.vertices_coords,edges=graph.edges_vertices,faces=graph.faces_vertices,assignments=graph.edges_assignment,angles=options.edgesFoldAngle??graph.edges_foldAngle;
    if(!Array.isArray(points)||points.length<3||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n))))fail('invalid','VERTICES','刚性折角计算需要有限的二维展开材料坐标。');
    if(!Array.isArray(edges)||!edges.length||!Array.isArray(faces)||!faces.length)fail('invalid','TOPOLOGY','尚未建立完整材料面，请先闭合边界并分割折痕交点。');
    if(!Array.isArray(assignments)||assignments.length!==edges.length||!Array.isArray(angles)||angles.length!==edges.length)fail('invalid','ANGLES','折痕赋型、目标角和材料边的数量不一致。');
    const sourceFaces=faces!,root=options.startingFace??0;
    if(!Number.isInteger(root)||root<0||root>=sourceFaces.length)fail('invalid','STARTING_FACE','固定纸面不存在，请重新选择。');
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,magnitude=0;
    for(const [x,y] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);magnitude=Math.max(magnitude,Math.abs(x),Math.abs(y));}
    const extent=Math.hypot(maxX-minX,maxY-minY),fixed=fixedMatrix(options.fixedFaceTransform);
    for(const n of fixed.slice(9))magnitude=Math.max(magnitude,Math.abs(n));
    const tolerance=Math.max(extent*1e-8,magnitude*Number.EPSILON*128,1e-12),angleTolerance=1e-5;
    diagnostics={maximumClosureErrorMm:0,maximumFaceDistanceErrorMm:0,maximumAngleErrorDeg:0,positionToleranceMm:tolerance,angleToleranceDeg:angleTolerance};
    const vertexIndex=(v:number)=>Number.isInteger(v)&&v>=0&&v<points.length;
    const lookup=new Map<string,number[]>(),uses:Occurrence[][]=edges.map(()=>[]),targetAngles:number[]=[];
    edges.forEach((edge,e)=>{
      if(!Array.isArray(edge)||edge.length!==2||!edge.every(vertexIndex)||edge[0]===edge[1])fail('invalid','EDGE','折痕端点索引无效。',{edge:e});
      if(norm(sub(cp(points[edge[0]]),cp(points[edge[1]])))===0)fail('invalid','EDGE','存在零长度材料边，不能确定转轴。',{edge:e});
      const kind=assignments[e],a=angles[e];
      if(!['B','M','V','F','U'].includes(kind))fail('unsupported','ASSIGNMENT','刚性折角不支持该材料边类型。',{edge:e});
      const angle=a===null&&(kind==='B'||kind==='F')?0:a;
      if(typeof angle!=='number'||!Number.isFinite(angle)||Math.abs(angle)>180)fail('invalid','ANGLE_RANGE','每条材料铰链需要 −180° 至 180° 之间的明确目标角。',{edge:e});
      if(kind==='M'&&angle!>0||kind==='V'&&angle!<0||(kind==='B'||kind==='F')&&angle!==0)fail('invalid','ANGLE_SIGN','目标角与折线类型冲突：峰折为负、谷折为正，边界和展开折痕为 0°。',{edge:e});
      targetAngles.push(angle!);
      const key=pairKey(...edge);lookup.set(key,[...(lookup.get(key)??[]),e]);
    });
    const signs:number[]=[],rings:number[][][]=[],faceVertices:number[][]=[];
    sourceFaces.forEach((face,f)=>{
      if(!Array.isArray(face))fail('invalid','FACE','材料面顶点列表无效。',{face:f});
      if(graph.faces_holes?.[f]!==undefined&&!Array.isArray(graph.faces_holes[f]))fail('invalid','FACE','材料孔环无效。',{face:f});
      const rs=materialFaceRings(graph,f);rings.push(rs);
      rs.forEach((ring,h)=>{
        if(!Array.isArray(ring)||ring.length<3||!ring.every(vertexIndex))fail('invalid','FACE','材料边界环的顶点索引无效。',{face:f});
        if(new Set(ring).size!==ring.length)fail('unsupported','WEAK_FACE','此材料面包含重复边界顶点，需要先明确切口与刚性分面。',{face:f});
        const signed=area(points,ring);
        if(!Number.isFinite(signed)||signed===0)fail('invalid','FACE','材料面退化，不能确定朝向。',{face:f});
        if(h===0)signs[f]=Math.sign(signed);
        else if(Math.sign(signed)===signs[f])fail('invalid','HOLE_WINDING','孔环方向必须与外边界相反。',{face:f});
        const explicit=h===0?graph.faces_edges?.[f]:graph.faces_holeEdges?.[f]?.[h-1];
        if(explicit!==undefined&&(!Array.isArray(explicit)||explicit.length!==ring.length))fail('invalid','FACE_EDGES','材料边界与显式边索引数量不一致。',{face:f});
        ring.forEach((a,k)=>{
          const b=ring[(k+1)%ring.length],candidates=lookup.get(pairKey(a,b))??[],e=explicit?.[k]??(candidates.length===1?candidates[0]:-1);
          if(!Number.isInteger(e)||!candidates.includes(e))fail('invalid','FACE_EDGES','面边界缺少唯一材料边；切口重边需要显式边索引。',{face:f});
          const direction=((edges[e][0]===a?1:-1)*signs[f]) as 1|-1;
          uses[e].push({face:f,direction});
        });
      });
      faceVertices.push([...new Set(rs.flat())]);
    });
    const neighbors=sourceFaces.map(()=>[] as {face:number;edge:number;direction:1|-1}[]);
    uses.forEach((owners,e)=>{
      const kind=assignments[e];
      if(owners.length>2||owners.length===2&&(owners[0].face===owners[1].face||owners[0].direction===owners[1].direction))fail('invalid','NONMANIFOLD','同一材料边两侧的面关联无效。',{edge:e});
      if(kind==='B'){
        if(owners.length!==1)fail('invalid','BOUNDARY_INCIDENCE','纸边必须只属于一个材料面，切口不能自动焊接。',{edge:e});
      }else if(owners.length===2){
        const [a,b]=owners;neighbors[a.face].push({face:b.face,edge:e,direction:b.direction});neighbors[b.face].push({face:a.face,edge:e,direction:a.direction});
      }else if(kind!=='F'||targetAngles[e]!==0)fail('invalid','HINGE_INCIDENCE','折痕未连接两个完整材料面，不能生成目标折角。',{edge:e});
      if(graph.edges_faces?.[e]&&owners.length){
        const declared=graph.edges_faces[e];
        if(!Array.isArray(declared)||declared.length!==owners.length||[...declared].sort((a,b)=>a-b).some((f,i)=>f!==owners.map(o=>o.face).sort((a,b)=>a-b)[i]))fail('invalid','EDGE_FACES','显式面关联与材料边界不一致。',{edge:e});
      }
    });
    // F marks inside a material region do not create hinges. Their indexed
    // endpoints still receive the real rigid pose of every containing face.
    const usedVertices=new Set(faceVertices.flat());
    points.forEach((p,v)=>{
      if(usedVertices.has(v))return;
      if(edges.some((edge,e)=>edge.includes(v)&&assignments[e]!=='F'))fail('invalid','UNOWNED_VERTEX','折痕顶点不属于完整材料面。');
      let count=0;
      rings.forEach((rs,f)=>{
        const inOuter=onRing(p,points,rs[0])||materialPointInside(p,rs[0].map(i=>points[i]));
        if(inOuter&&!rs.slice(1).some(r=>materialPointInside(p,r.map(i=>points[i])))){faceVertices[f].push(v);count++;}
      });
      if(!count)fail('invalid','UNOWNED_VERTEX','展开折痕标记落在纸面外或孔洞内。');
    });
    const matrices:(number[]|undefined)[]=sourceFaces.map(()=>undefined),queue=[root];matrices[root]=fixed;
    for(let head=0;head<queue.length;head++){
      const f=queue[head],parent=matrices[f]!;
      for(const next of neighbors[f]){
        if(matrices[next.face])continue;
        const [a,b]=edges[next.edge],angle=targetAngles[next.edge];
        const local=angle===0?identity():ear.math.makeMatrix3Rotate(next.direction*angle*Math.PI/180,unit(sub(cp(points[b]),cp(points[a]))),cp(points[a]));
        matrices[next.face]=angle===0?[...parent]:ear.math.multiplyMatrices3(parent,local);
        queue.push(next.face);
      }
    }
    if(queue.length!==sourceFaces.length)fail('unsupported','DISCONNECTED','存在未连接固定面的独立纸片，需要分别确定其固定姿态。');
    const vertices:V[]=Array(points.length),owner:number[]=Array(points.length).fill(-1);
    for(const f of queue){
      const matrix=matrices[f]!;
      if(matrix.some(n=>!Number.isFinite(n))||rotationError(matrix)>1e-8)fail('inconsistent','NUMERIC_RIGIDITY','三维面变换精度不足，未生成拉伸后的纸面。',{face:f});
      for(const v of faceVertices[f]){
        const proposed=apply(matrix,points[v]);
        if(owner[v]<0){owner[v]=f;vertices[v]=proposed;}
        else{
          const difference=norm(sub(proposed,vertices[v]));diagnostics.maximumClosureErrorMm=Math.max(diagnostics.maximumClosureErrorMm,difference);
          if(difference>tolerance)fail('inconsistent','CLOSURE','这些目标折角不能同时闭合：同一材料顶点在不同纸面得到的位置不一致。',{face:f});
        }
      }
    }
    // Pairwise distance verification uses the published shared vertices, not
    // each face's private proposal, so a seam cannot hide a stretched facet.
    for(let f=0;f<sourceFaces.length;f++){
      const vs=faceVertices[f];
      for(let i=0;i<vs.length;i++)for(let j=i+1;j<vs.length;j++){
        const a=vs[i],b=vs[j],error=Math.abs(norm(sub(vertices[a],vertices[b]))-Math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1]));
        diagnostics.maximumFaceDistanceErrorMm=Math.max(diagnostics.maximumFaceDistanceErrorMm,error);
        if(!Number.isFinite(error)||error>2*tolerance)fail('inconsistent','FACE_ISOMETRY','目标折角使纸面发生拉伸，不能作为刚性折叠结果。',{face:f});
      }
    }
    const normals=sourceFaces.map((face,f)=>ringNormal(vertices,face,signs[f])),measuredAngles:(number|null)[]=edges.map(()=>null);
    if(normals.some(n=>n.some(v=>!Number.isFinite(v))))fail('inconsistent','FACE_NORMAL','目标纸面朝向退化。');
    uses.forEach((owners,e)=>{
      if(owners.length!==2){if(assignments[e]==='B')measuredAngles[e]=0;return;}
      const left=owners.find(o=>o.direction===1)!.face,right=owners.find(o=>o.direction===-1)!.face,[a,b]=edges[e],axis=unit(sub(vertices[b],vertices[a]));
      let measured=Math.atan2(dot(normals[right],cross(normals[left],axis)),Math.max(-1,Math.min(1,dot(normals[left],normals[right]))))*180/Math.PI;
      const delta=(measured-targetAngles[e])*Math.PI/180,error=Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))*180/Math.PI);
      diagnostics!.maximumAngleErrorDeg=Math.max(diagnostics!.maximumAngleErrorDeg,error);
      if(!Number.isFinite(error)||error>angleTolerance)fail('inconsistent','DIHEDRAL','这些目标折角互相冲突，至少一条材料铰链无法达到指定角度。',{edge:e});
      // At exactly 180°, geometry has no signed side distinction. Keep the
      // requested M/V branch only at this numerical branch cut, never at 179°.
      if(Math.abs(targetAngles[e])===180&&Math.abs(Math.abs(measured)-180)<=angleTolerance)measured=targetAngles[e];
      measuredAngles[e]=Object.is(measured,-0)?0:measured;
    });
    return {status:'ready',message:'已求得保持固定面、材料连接和面内距离的目标折角姿态。',vertices,faces:sourceFaces.map(f=>[...f]),faceTransforms:matrices.map(m=>transform(m!)),faceNormals:normals,measuredAngles,targetAngles,startingFace:root,diagnostics,collisionChecked:false,continuousPathCertified:false};
  }catch(error){
    if(error instanceof Refusal)return {...error.result,...(diagnostics?{diagnostics}:{})};
    return {status:'invalid',code:'INVALID_GRAPH',message:`无法读取完整材料折角数据：${error instanceof Error?error.message:String(error)}`,...(diagnostics?{diagnostics}:{})};
  }
}
