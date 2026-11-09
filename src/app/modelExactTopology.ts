import type {FlatFoldResult,Point} from '../core/types';
import {BoundsIndex,type Bounds2} from '../core/boundsIndex';
import {modelFaceRings} from './modelRings';
import {addFraction,binaryCoordinate,compareCoordinate,exactGcd,exactRingArea,exactRingContains,fractionNumber,inputOrientation,nextNumber,ringArea,type ExactPoint,type Fraction} from './modelExactArithmetic';

export type ExactTopologyProgress=(stage:string,details:Record<string,number>)=>void;
export interface ExactModelTopology {
 vertexCount:number;edgeCount:number;cellCount:number;faceCount:number;
 /** Correctly rounded display coordinates; not a substitute for the certified topology. */
 vertexXY:Float64Array;
 /** Edge e points from [2e] to [2e+1]; its incident cells are left then right. */
 edgeVertices:Uint32Array;edgeCells:Int32Array;
 /** Source directions remain valid when distinct exact endpoints round to the
  * same display coordinate. Every edge follows its source a-to-b direction. */
 edgeSource:Uint32Array;sourceDirectionXY:Float64Array;
 /** Halfedge 2e follows edge e; 2e+1 reverses it. Next keeps its left cell. */
 halfedgeNext:Uint32Array;
 edgeOwnerOffsets:Uint32Array;edgeOwners:Uint32Array;
 /** First ring of a cell is its positive outer walk; remaining rings are holes. */
 cellRingOffsets:Uint32Array;ringVertexOffsets:Uint32Array;ringVertices:Uint32Array;
 /** Every cell has certified positive mathematical area; its double may underflow. */
 cellArea:Float64Array;
 /** Source ring-owner metadata; hole membership is union-excluded per face. */
 ringFaces:Uint32Array;ringIsHole:Uint8Array;
 /** Dual adjacency is indexed by cell+1; index 0 is the exterior cell -1. */
 cellEdgeOffsets:Uint32Array;cellEdges:Uint32Array;
 binaryExponent:number;
 /** Small-scale audit adapter only. The compact builder normally releases these. */
 exactVertices?:readonly (readonly [bigint,bigint,bigint])[];
 diagnostics:{sourceSegments:number;candidatePairs:number;intersections:number;components:number;neutralSegments:number};
}
export interface ExactCoverageTransition {fromCell:number;toCell:number;removed:readonly number[];added:readonly number[];backtrack:boolean}
export interface ExactCoverageVisitor {
 onTransition?:(transition:ExactCoverageTransition)=>void;
 /** The set is read-only and valid only during the callback; do not retain it. */
 onCell?:(cell:number,faces:ReadonlySet<number>)=>void;
}
type SourceEdge={a:number;b:number;dx:bigint;dy:bigint;owners:Set<number>;cuts:Set<number>};
const toggle=(set:Set<number>,value:number)=>{if(set.has(value))set.delete(value);else set.add(value);};

/** Build and certify a single exact plane subdivision without materializing
 * cell membership or any cell polygon copies. No geometric tolerance is used. */
export function buildExactModelTopology(result:FlatFoldResult,onProgress?:ExactTopologyProgress,options:{retainExactVertices?:boolean}={}):ExactModelTopology{
 const {vertices,faces,status}=result.geometry;
 if(status!=='ready'||!vertices.length||!faces.length)throw Error('精确分区需要有效的平折几何。');
 const binary=vertices.map(point=>{if(!Array.isArray(point)||point.length!==2)throw Error('精确分区坐标无效。');return point.map(binaryCoordinate);});
 let exponent=0,first=true;for(const point of binary)for(const [m,e]of point)if(m&&first){exponent=e;first=false;}else if(m)exponent=Math.min(exponent,e);
 const points:ExactPoint[]=[],pointIds=new Map<string,number>();
 const intern=(x:bigint,y:bigint,w=1n):number=>{if(w<0n){x=-x;y=-y;w=-w;}const g=exactGcd(exactGcd(x,y),w);x/=g;y/=g;w/=g;const key=`${x},${y},${w}`,prior=pointIds.get(key);if(prior!==undefined)return prior;const id=points.length;points.push({x,y,w,point:[fractionNumber(x,w,exponent),fractionNumber(y,w,exponent)]});pointIds.set(key,id);return id;};
 const sourceIds=binary.map(point=>intern(...point.map(([m,e])=>m?m<<BigInt(e-exponent):0n) as [bigint,bigint]));
 const rings:{face:number;hole:boolean}[]=[],sources:SourceEdge[]=[],sourceMap=new Map<string,number>();
 for(let face=0;face<faces.length;face++)for(const [hole,ring]of modelFaceRings(result,face).entries()){
  if(ring.length<2||ring.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length))throw Error('精确分区纸面环索引无效。');
  const ids=ring.map(v=>sourceIds[v]);
  if(!ringArea(ids,points,exponent).sign){
   // Native slit banks / floating F marks may be encoded as a hole walk
   // going out and back along exactly the same edges. Prove cancellation
   // by exact endpoint identity; a merely tiny or zero-net-area polygon
   // cannot pass this check. Retain its metadata and source banks below.
   const balance=new Map<string,number>();
   for(let i=0;i<ids.length;i++){const a=ids[i],b=ids[(i+1)%ids.length];if(a===b)continue;const key=a<b?`${a},${b}`:`${b},${a}`;balance.set(key,(balance.get(key)??0)+(a<b?1:-1));}
   if(!hole||!balance.size||[...balance.values()].some(value=>value!==0))throw Error('精确分区遇到零面积纸面环，不能默默删除。');
  }
  const owner=rings.length;rings.push({face,hole:hole>0});
  for(let i=0;i<ids.length;i++){const a=ids[i],b=ids[(i+1)%ids.length];if(a===b)continue;const key=a<b?`${a},${b}`:`${b},${a}`;let id=sourceMap.get(key);if(id===undefined){id=sources.length;sourceMap.set(key,id);sources.push({a,b,dx:points[b].x-points[a].x,dy:points[b].y-points[a].y,owners:new Set(),cuts:new Set([a,b])});}toggle(sources[id].owners,owner);}
 }
 let neutralSegments=sources.filter(s=>!s.owners.size).length;const segments=sources.filter(s=>s.owners.size),sourceSegments=segments.length;
 const boxes:Bounds2[]=segments.map(s=>{const a=points[s.a].point,b=points[s.b].point;return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}),bounds=new BoundsIndex(boxes);
 let candidatePairs=0,intersections=0;
 const on=(p:number,s:SourceEdge)=>{const v=points[p].point,a=points[s.a].point,b=points[s.b].point;return v[0]>=Math.min(a[0],b[0])&&v[0]<=Math.max(a[0],b[0])&&v[1]>=Math.min(a[1],b[1])&&v[1]<=Math.max(a[1],b[1]);};
 for(let i=0;i<segments.length;i++){
  const a=segments[i],A=points[a.a],B=points[a.b];
  for(const j of bounds.query(boxes[i],0,i)){
   candidatePairs++;const b=segments[j],C=points[b.a],D=points[b.b],ac=inputOrientation(A,B,C),ad=inputOrientation(A,B,D),ca=inputOrientation(C,D,A),cb=inputOrientation(C,D,B);
   if(ac*ad<0&&ca*cb<0){const ox=C.x-A.x,oy=C.y-A.y,det=a.dx*b.dy-a.dy*b.dx,t=ox*b.dy-oy*b.dx,id=intern(A.x*det+a.dx*t,A.y*det+a.dy*t,det);a.cuts.add(id);b.cuts.add(id);intersections++;}
   else{if(!ac&&on(b.a,a)){a.cuts.add(b.a);b.cuts.add(b.a);}if(!ad&&on(b.b,a)){a.cuts.add(b.b);b.cuts.add(b.b);}if(!ca&&on(a.a,b)){a.cuts.add(a.a);b.cuts.add(a.a);}if(!cb&&on(a.b,b)){a.cuts.add(a.b);b.cuts.add(a.b);}}
  }
  if(i%1024===0)onProgress?.('intersections',{processed:i,total:segments.length,candidatePairs,intersections,vertices:points.length});
 }
 const vertexCount=points.length,rawEdges=segments.reduce((n,s)=>n+s.cuts.size-1,0),edgeA=new Uint32Array(rawEdges),edgeB=new Uint32Array(rawEdges),edgeSource=new Uint32Array(rawEdges),ownerGroup=new Uint32Array(rawEdges),ownerGroups=segments.map(s=>[...s.owners].sort((a,b)=>a-b));
 const splitIds=new Map<number|string,number>(),numericKeys=vertexCount*vertexCount<=Number.MAX_SAFE_INTEGER;let edgeCount=0;
 for(let sourceId=0;sourceId<segments.length;sourceId++){
  const source=segments[sourceId],axis:0|1=source.dx===0n?1:0,direction=(axis?source.dy:source.dx)>0n?1:-1,cuts=[...source.cuts].sort((a,b)=>compareCoordinate(points[a],points[b],axis)*direction);
  for(let i=1;i<cuts.length;i++){
   const a=cuts[i-1],b=cuts[i];if(a===b)continue;const lo=Math.min(a,b),hi=Math.max(a,b),key=numericKeys?lo*vertexCount+hi:`${lo},${hi}`,prior=splitIds.get(key);
   if(prior===undefined){splitIds.set(key,edgeCount);edgeA[edgeCount]=a;edgeB[edgeCount]=b;edgeSource[edgeCount]=sourceId;ownerGroup[edgeCount]=sourceId;edgeCount++;}
   else{const owners=new Set(ownerGroups[ownerGroup[prior]]);for(const owner of ownerGroups[sourceId])toggle(owners,owner);ownerGroup[prior]=ownerGroups.length;ownerGroups.push([...owners].sort((a,b)=>a-b));}
  }
 }
 let retained=0;for(let i=0;i<edgeCount;i++)if(ownerGroups[ownerGroup[i]].length){edgeA[retained]=edgeA[i];edgeB[retained]=edgeB[i];edgeSource[retained]=edgeSource[i];ownerGroup[retained]=ownerGroup[i];retained++;}else neutralSegments++;edgeCount=retained;
 pointIds.clear();sourceMap.clear();splitIds.clear();for(const source of sources)source.cuts.clear();binary.length=0;sourceIds.length=0;
 onProgress?.('topology',{vertices:vertexCount,edges:edgeCount,candidatePairs,intersections});
 const parent=new Uint32Array(vertexCount),degrees=new Uint32Array(vertexCount);for(let i=0;i<vertexCount;i++)parent[i]=i;
 const find=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]];v=parent[v];}return v;};
 for(let e=0;e<edgeCount;e++){degrees[edgeA[e]]++;degrees[edgeB[e]]++;parent[find(edgeA[e])]=find(edgeB[e]);}
 const outgoingOffsets=new Uint32Array(vertexCount+1);let usedVertices=0,components=0;for(let v=0;v<vertexCount;v++){outgoingOffsets[v+1]=outgoingOffsets[v]+degrees[v];if(degrees[v]){usedVertices++;if(find(v)===v)components++;}}
 const outgoing=new Uint32Array(edgeCount*2),outCursor=outgoingOffsets.slice();for(let e=0;e<edgeCount;e++){outgoing[outCursor[edgeA[e]]++]=e*2;outgoing[outCursor[edgeB[e]]++]=e*2+1;}
 const halfedgeNext=new Uint32Array(edgeCount*2),oddOwners=new Set<number>();
 for(let v=0;v<vertexCount;v++){
  const row=outgoing.subarray(outgoingOffsets[v],outgoingOffsets[v+1]);oddOwners.clear();for(const h of row)for(const owner of ownerGroups[ownerGroup[h>>1]])toggle(oddOwners,owner);if(oddOwners.size)throw Error('精确分区纸面环的边界没有闭合。');
  row.sort((a,b)=>{const as=segments[edgeSource[a>>1]],bs=segments[edgeSource[b>>1]],ap=a%2?-1n:1n,bp=b%2?-1n:1n,ax=as.dx*ap,ay=as.dy*ap,bx=bs.dx*bp,by=bs.dy*bp,ha=ay>0n||ay===0n&&ax>0n?0:1,hb=by>0n||by===0n&&bx>0n?0:1;if(ha!==hb)return ha-hb;const cross=ax*by-ay*bx;if(!cross)throw Error('精确分区存在未拆开的共线重叠边。');return cross>0n?-1:1;});
  for(let i=0;i<row.length;i++)halfedgeNext[row[i]^1]=row[(i+row.length-1)%row.length];
 }
 const from=(h:number)=>h%2?edgeB[h>>1]:edgeA[h>>1],cycleOf=new Int32Array(edgeCount*2).fill(-1),cycleVertices=new Uint32Array(edgeCount*2),cycleOffsets=[0],cycleComponents:number[]=[],cycleAreas:number[]=[],positiveCycles:number[]=[],negativeCycles:number[]=[];let walkPosition=0;
 for(let start=0;start<halfedgeNext.length;start++)if(cycleOf[start]<0){
  const id=cycleAreas.length;let h=start;do{if(cycleOf[h]>=0)throw Error('精确分区半边环不能闭合。');cycleOf[h]=id;cycleVertices[walkPosition++]=from(h);h=halfedgeNext[h];}while(h!==start);
  const ring=cycleVertices.subarray(cycleOffsets[id],walkPosition),area=ringArea(ring,points,exponent);if(!area.sign)throw Error('精确分区产生零面积边界环。');cycleOffsets.push(walkPosition);cycleComponents.push(find(from(start)));cycleAreas.push(area.area);(area.sign>0?positiveCycles:negativeCycles).push(id);
  if(id%65536===0)onProgress?.('cycles',{cycles:id+1,halfedges:walkPosition,totalHalfedges:halfedgeNext.length});
 }
 const componentOutside=new Map<number,number>();for(const id of negativeCycles){const component=cycleComponents[id];if(componentOutside.has(component))throw Error('精确分区连通分量存在多个外环。');componentOutside.set(component,id);}
 if(componentOutside.size!==components)throw Error('精确分区缺少连通分量外环。');if(positiveCycles.length!==edgeCount-usedVertices+components)throw Error('精确分区未通过平面图欧拉拓扑校验。');
 const cellCount=positiveCycles.length,cycleCell=new Int32Array(cycleAreas.length).fill(-1),cellArea=new Float64Array(cellCount),holes=new Map<number,number[]>();positiveCycles.forEach((id,cell)=>{cycleCell[id]=cell;cellArea[cell]=cycleAreas[id];});
 const cycleRing=(id:number)=>cycleVertices.subarray(cycleOffsets[id],cycleOffsets[id+1]);
 if(components>1){
  const cycleBounds:Bounds2[]=positiveCycles.map(id=>{let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const v of cycleRing(id)){const [x,y]=points[v].point;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}return [nextNumber(minX,false),nextNumber(minY,false),nextNumber(maxX,true),nextNumber(maxY,true)];}),cycleIndex=new BoundsIndex(cycleBounds);
  for(const id of negativeCycles){const p=points[cycleRing(id)[0]],[x,y]=p.point;let container=-1;
   for(const candidate of cycleIndex.query([nextNumber(x,false),nextNumber(y,false),nextNumber(x,true),nextNumber(y,true)])){
    const other=positiveCycles[candidate];if(cycleComponents[other]===cycleComponents[id])continue;const contains=exactRingContains(p,cycleRing(other),points);if(!contains)throw Error('精确分区的独立分量意外接触。');if(contains<0)continue;
    if(container<0||exactRingContains(points[cycleRing(other)[0]],cycleRing(positiveCycles[container]),points)>0)container=candidate;
   }
   cycleCell[id]=container;if(container>=0){const list=holes.get(container)??[];list.push(id);holes.set(container,list);}
  }
 }
 for(const [cell,inner]of holes){let area:Fraction=exactRingArea(cycleRing(positiveCycles[cell]),points);for(const id of inner)area=addFraction(area,exactRingArea(cycleRing(id),points));if(area[0]<=0n)throw Error('精确分区的孔洞没有保留正面积区域。');cellArea[cell]=fractionNumber(area[0],area[1],exponent*2);}
 const cellRingOffsets=new Uint32Array(cellCount+1);let totalRingVertices=0;for(let cell=0;cell<cellCount;cell++){const id=positiveCycles[cell];cellRingOffsets[cell+1]=cellRingOffsets[cell]+1+(holes.get(cell)?.length??0);totalRingVertices+=cycleOffsets[id+1]-cycleOffsets[id];for(const hole of holes.get(cell)??[])totalRingVertices+=cycleOffsets[hole+1]-cycleOffsets[hole];}
 const ringVertexOffsets=new Uint32Array(cellRingOffsets[cellCount]+1),ringVertices=new Uint32Array(totalRingVertices);let ringIndex=0,ringPosition=0;
 for(let cell=0;cell<cellCount;cell++)for(const id of [positiveCycles[cell],...(holes.get(cell)??[])]){const ring=cycleRing(id);ringVertices.set(ring,ringPosition);ringPosition+=ring.length;ringVertexOffsets[++ringIndex]=ringPosition;}
 const edgeVertices=new Uint32Array(edgeCount*2),edgeCells=new Int32Array(edgeCount*2),edgeOwnerOffsets=new Uint32Array(edgeCount+1),cellEdgeOffsets=new Uint32Array(cellCount+2);
 for(let e=0;e<edgeCount;e++){
  edgeVertices[e*2]=edgeA[e];edgeVertices[e*2+1]=edgeB[e];const left=cycleCell[cycleOf[e*2]],right=cycleCell[cycleOf[e*2+1]];if(left===right)throw Error('精确分区纸面边的两侧错误地属于同一区域。');edgeCells[e*2]=left;edgeCells[e*2+1]=right;cellEdgeOffsets[left+2]++;cellEdgeOffsets[right+2]++;edgeOwnerOffsets[e+1]=edgeOwnerOffsets[e]+ownerGroups[ownerGroup[e]].length;
 }
 const edgeOwners=new Uint32Array(edgeOwnerOffsets[edgeCount]);for(let e=0;e<edgeCount;e++)edgeOwners.set(ownerGroups[ownerGroup[e]],edgeOwnerOffsets[e]);
 for(let i=1;i<cellEdgeOffsets.length;i++)cellEdgeOffsets[i]+=cellEdgeOffsets[i-1];const cellEdges=new Uint32Array(edgeCount*2),cellCursor=cellEdgeOffsets.slice();for(let e=0;e<edgeCount;e++){cellEdges[cellCursor[edgeCells[e*2]+1]++]=e;cellEdges[cellCursor[edgeCells[e*2+1]+1]++]=e;}
 const vertexXY=new Float64Array(vertexCount*2);points.forEach((point,id)=>{vertexXY[id*2]=point.point[0];vertexXY[id*2+1]=point.point[1];});
 const sourceDirectionXY=new Float64Array(segments.length*2);segments.forEach((s,id)=>{const ax=s.dx<0n?-s.dx:s.dx,ay=s.dy<0n?-s.dy:s.dy,scale=ax>ay?ax:ay,x=fractionNumber(s.dx,scale),y=fractionNumber(s.dy,scale),length=Math.hypot(x,y);sourceDirectionXY[id*2]=x/length;sourceDirectionXY[id*2+1]=y/length;});
 const exactVertices=options.retainExactVertices?points.map(p=>[p.x,p.y,p.w] as const):undefined,ringFaces=new Uint32Array(rings.map(r=>r.face)),ringIsHole=new Uint8Array(rings.map(r=>Number(r.hole)));
 onProgress?.('topology-complete',{cells:cellCount,vertices:vertexCount,edges:edgeCount,components});
 return {vertexCount,edgeCount,cellCount,faceCount:faces.length,vertexXY,edgeVertices,edgeCells,edgeSource:edgeSource.slice(0,edgeCount),sourceDirectionXY,halfedgeNext,edgeOwnerOffsets,edgeOwners,cellRingOffsets,ringVertexOffsets,ringVertices,cellArea,ringFaces,ringIsHole,cellEdgeOffsets,cellEdges,binaryExponent:exponent,...(exactVertices?{exactVertices}:{}),diagnostics:{sourceSegments,candidatePairs,intersections,components,neutralSegments}};
}

/** Repeatable coverage traversal with one mutable state and exact rollback.
 * Every transition is a batch of final face changes; owner intermediate
 * states are never exposed. Throwing from either callback cancels the walk. */
export function walkExactCoverage(topology:ExactModelTopology,visitor:ExactCoverageVisitor):void{
 const {cellCount,faceCount,ringFaces,ringIsHole,edgeOwnerOffsets,edgeOwners,edgeCells,cellEdgeOffsets,cellEdges}=topology;
 const ringInside=new Uint8Array(ringFaces.length),outerInside=new Uint8Array(faceCount),holeCount=new Uint32Array(faceCount),insideFaces=new Set<number>(),changed=new Map<number,boolean>();
 const cross=(edge:number,fromCell:number,toCell:number,backtrack:boolean)=>{
  changed.clear();for(let i=edgeOwnerOffsets[edge];i<edgeOwnerOffsets[edge+1];i++){const owner=edgeOwners[i],face=ringFaces[owner];if(!changed.has(face))changed.set(face,insideFaces.has(face));if(ringIsHole[owner])holeCount[face]+=ringInside[owner]?-1:1;else outerInside[face]=ringInside[owner]?0:1;ringInside[owner]^=1;}
  const removed:number[]=[],added:number[]=[];for(const [face,before]of changed){const after=Boolean(outerInside[face]&&!holeCount[face]);if(after)insideFaces.add(face);else insideFaces.delete(face);if(before&&!after)removed.push(face);else if(!before&&after)added.push(face);}visitor.onTransition?.({fromCell,toCell,removed,added,backtrack});
 };
 const visited=new Uint8Array(cellCount+1),parentEdge=new Int32Array(cellCount+1).fill(-1),cursor=cellEdgeOffsets.slice(0,cellCount+1),stack=new Int32Array(cellCount+1);let depth=1,visitedCount=1;visited[0]=1;
 while(depth){const current=stack[depth-1];if(cursor[current]===cellEdgeOffsets[current+1]){depth--;if(parentEdge[current]>=0)cross(parentEdge[current],current-1,stack[depth-1]-1,true);continue;}
  const id=cellEdges[cursor[current]++],other=edgeCells[id*2]+1===current?edgeCells[id*2+1]+1:edgeCells[id*2]+1;if(visited[other])continue;
  cross(id,current-1,other-1,false);visited[other]=1;visitedCount++;parentEdge[other]=id;stack[depth++]=other;visitor.onCell?.(other-1,insideFaces);
 }
 if(visitedCount!==cellCount+1||insideFaces.size||ringInside.some(Boolean))throw Error('精确分区的区域遍历没有完整返回外部。');
}
