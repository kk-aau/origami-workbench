import type {Point} from '../core/types';
import type {FlatSide} from './flatPresentation';
import type {ExactModelTopology} from './modelExactTopology';

/** These endpoints must come from completed local-order certification. -1 is
 * empty; initialize unfinished cells to -2, never a guessed face number. */
export interface ExactCellSurfaceOrder {front:Int32Array;back:Int32Array}
export interface ExactModelShadowStrip {
 /** Index in the compact surface's boundary arrays, not in the full topology. */
 edge:number;upperFace:number;lowerFace:number;clipFill:number;inward:Point;
}
export interface ExactModelSurfaceShadows {strips:ExactModelShadowStrip[];ambiguousEdges:0}
/** Only visible contours cross the worker boundary. There is one compound
 * nonzero-fill path per visible original face, retaining its picking identity. */
export interface ExactModelSurface {
 kind:'exact';side:FlatSide;cellCount:number;coveredCellCount:number;
 vertexXY:Float64Array;
 faceIds:Uint32Array;faceCellCounts:Uint32Array;
 faceRingOffsets:Uint32Array;ringVertexOffsets:Uint32Array;ringVertices:Uint32Array;
 boundaryVertices:Uint32Array;boundaryFaces:Int32Array;
 /** Provenance and certified a→b direction survive collapsed display endpoints. */
 sourceEdgeIds:Uint32Array;sourceLineIds:Uint32Array;boundaryDirectionXY:Float64Array;
 shadows?:ExactModelSurfaceShadows;
}
/** Worker-only queries. A coverage walk fills answers[slots[i]] with 0 or 1.
 * Unanswered slots begin at 2. These per-cell arrays must not reach the UI. */
export interface ExactSurfaceShadowQueries {cellOffsets:Uint32Array;faces:Uint32Array;slots:Uint32Array;answers:Uint8Array}

const count=(value:number)=>Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff;

/** Trace certified halfedges, cancelling same-top-face internal seams. No
 * coordinate snapping, area threshold, point probe or geometric reordering. */
export function modelExactSurface(topology:ExactModelTopology,orders:ExactCellSurfaceOrder,side:FlatSide='front',onProgress?:(details:Record<string,number>)=>void):ExactModelSurface {
 const {vertexCount:V,edgeCount:E,cellCount:C,faceCount:F,vertexXY,edgeVertices,edgeCells,halfedgeNext}=topology;
 if(![V,E,C,F,E*2].every(count)||vertexXY.length!==V*2||edgeVertices.length!==E*2||edgeCells.length!==E*2||halfedgeNext.length!==E*2||topology.edgeSource.length!==E||topology.sourceDirectionXY.length%2)throw Error('精确纸面拓扑数组不完整。');
 if(side!=='front'&&side!=='back')throw Error('精确纸面观察方向无效。');
 if(orders.front.length!==C||orders.back.length!==C)throw Error('精确纸面层序认证没有覆盖全部区域。');
 const top=orders[side],cellCounts=new Uint32Array(F);let coveredCellCount=0;
 for(let c=0;c<C;c++){
  const f=orders.front[c],b=orders.back[c];
  if(f< -1||b< -1||f>=F||b>=F||(f===-1)!==(b===-1))throw Error(`精确纸面区域 ${c+1} 的层序尚未完整认证。`);
  if(top[c]>=0){cellCounts[top[c]]++;coveredCellCount++;}
 }
 const from=(h:number)=>edgeVertices[h],to=(h:number)=>edgeVertices[h^1],left=(h:number)=>edgeCells[h],face=(cell:number)=>cell<0?-1:top[cell];
 const seenNext=new Uint8Array(E*2),faceEdges=new Uint32Array(F);let B=0,directed=0;
 for(let e=0;e<E;e++){
  const a=edgeVertices[e*2],b=edgeVertices[e*2+1],l=edgeCells[e*2],r=edgeCells[e*2+1];
  if(a>=V||b>=V||a===b||l< -1||r< -1||l>=C||r>=C||l===r)throw Error('精确纸面边邻接无效。');
  for(let h=e*2;h<e*2+2;h++){
   const n=halfedgeNext[h];
   if(n>=E*2||seenNext[n]++||from(n)!==to(h)||left(n)!==left(h))throw Error('精确纸面半边环未通过连接校验。');
  }
  const lf=face(l),rf=face(r);if(lf===rf)continue;
  B++;if(lf>=0){faceEdges[lf]++;directed++;}if(rf>=0){faceEdges[rf]++;directed++;}
 }
 const ids:number[]=[];for(let f=0;f<F;f++){if(cellCounts[f]&&!faceEdges[f])throw Error('精确纸面可见区域缺少闭合边界。');if(faceEdges[f])ids.push(f);}
 const faceIds=Uint32Array.from(ids),faceCellCounts=Uint32Array.from(ids,f=>cellCounts[f]),faceOffsets=new Uint32Array(F+1);
 for(let f=0;f<F;f++)faceOffsets[f+1]=faceOffsets[f]+faceEdges[f];
 const cursor=faceOffsets.slice(),halfedges=new Uint32Array(directed),boundaryVertices=new Uint32Array(B*2),boundaryFaces=new Int32Array(B*2),sourceEdgeIds=new Uint32Array(B),sourceLineIds=new Uint32Array(B),boundaryDirectionXY=new Float64Array(B*2);
 const compactIndex=new Uint32Array(V),coordinates=new Float64Array(Math.min(V,B*2)*2);let outputVertices=0,edgeIndex=0;
 const compactVertex=(v:number)=>{
  if(!compactIndex[v]){const x=vertexXY[v*2],y=vertexXY[v*2+1];if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('精确纸面显示坐标无效。');compactIndex[v]=++outputVertices;coordinates[(outputVertices-1)*2]=x;coordinates[(outputVertices-1)*2+1]=y;}
  return compactIndex[v]-1;
 };
 for(let e=0;e<E;e++){
  const l=face(edgeCells[e*2]),r=face(edgeCells[e*2+1]);if(l===r)continue;
  if(l>=0)halfedges[cursor[l]++]=e*2;if(r>=0)halfedges[cursor[r]++]=e*2+1;
  boundaryVertices[edgeIndex*2]=compactVertex(edgeVertices[e*2]);boundaryVertices[edgeIndex*2+1]=compactVertex(edgeVertices[e*2+1]);
  boundaryFaces[edgeIndex*2]=l;boundaryFaces[edgeIndex*2+1]=r;sourceEdgeIds[edgeIndex]=e;
  const source=topology.edgeSource[e],dx=topology.sourceDirectionXY[source*2],dy=topology.sourceDirectionXY[source*2+1];
  sourceLineIds[edgeIndex]=source;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(Math.hypot(dx,dy)-1)>1e-12)throw Error('精确纸面缺少经过认证的边方向。');
  boundaryDirectionXY[edgeIndex*2]=dx;boundaryDirectionXY[edgeIndex*2+1]=dy;edgeIndex++;
 }
 // Reuse the halfedge scratch buffer once its bijection has been checked.
 seenNext.fill(0);const visited=seenNext,faceRingOffsets=new Uint32Array(faceIds.length+1),ringOffsets=new Uint32Array(directed+1),ringVertices=new Uint32Array(directed);let rings=0,vertices=0;
 for(let fill=0;fill<faceIds.length;fill++){
  const f=faceIds[fill];faceRingOffsets[fill]=rings;
  for(let k=faceOffsets[f];k<faceOffsets[f+1];k++){
   const start=halfedges[k];if(visited[start])continue;const first=vertices;let h=start;
   do{
    if(visited[h]||face(left(h))!==f||face(left(h^1))===f)throw Error('精确纸面合并轮廓发生不一致。');
    visited[h]=1;ringVertices[vertices++]=compactVertex(from(h));
    let n=halfedgeNext[h],steps=0;
    while(face(left(n^1))===f){
     n=halfedgeNext[n^1];if(++steps>E*2)throw Error('精确纸面内部边环不能退出。');
    }
    h=n;
   }while(h!==start);
   if(vertices-first<3)throw Error('精确纸面合并环缺少拓扑顶点。');
   ringOffsets[++rings]=vertices;
  }
  if(fill%256===0)onProgress?.({faces:fill+1,totalFaces:faceIds.length,visibleEdges:B,rings});
 }
 faceRingOffsets[faceIds.length]=rings;
 if(vertices!==directed)throw Error('精确纸面未完整保留可见边界。');
 return {kind:'exact',side,cellCount:C,coveredCellCount,vertexXY:coordinates.slice(0,outputVertices*2),faceIds,faceCellCounts,faceRingOffsets,ringVertexOffsets:ringOffsets.slice(0,rings+1),ringVertices:vertices===ringVertices.length?ringVertices:ringVertices.slice(0,vertices),boundaryVertices,boundaryFaces,sourceEdgeIds,sourceLineIds,boundaryDirectionXY};
}

/** Project only for display. Identity/winding came from topology and remains
 * intact even if distinct rational vertices round to the same screen point. */
export function modelExactSurfacePath(surface:ExactModelSurface,fill:number,project:(point:Point)=>Point=(p)=>p):string {
 if(!Number.isInteger(fill)||fill<0||fill>=surface.faceIds.length)throw Error('精确纸面填充索引无效。');
 const parts:string[]=[];
 for(let ring=surface.faceRingOffsets[fill];ring<surface.faceRingOffsets[fill+1];ring++){
  for(let i=surface.ringVertexOffsets[ring];i<surface.ringVertexOffsets[ring+1];i++){
   const v=surface.ringVertices[i],p=project([surface.vertexXY[v*2],surface.vertexXY[v*2+1]]);
   if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('精确纸面投影无效。');
   parts.push(`${i===surface.ringVertexOffsets[ring]?'M':'L'}${p[0]},${p[1]}`);
  }
  parts.push('Z');
 }
 return parts.join('');
}

export function modelExactSurfaceShadowQueries(topology:ExactModelTopology,surface:ExactModelSurface):ExactSurfaceShadowQueries {
 if(surface.cellCount!==topology.cellCount)throw Error('精确阴影与纸面拓扑不匹配。');
 const B=surface.sourceEdgeIds.length,cellOffsets=new Uint32Array(topology.cellCount+1);let queryCount=0;
 for(let b=0;b<B;b++)if(surface.boundaryFaces[b*2]>=0&&surface.boundaryFaces[b*2+1]>=0){
  const e=surface.sourceEdgeIds[b],l=topology.edgeCells[e*2],r=topology.edgeCells[e*2+1];
  if(e>=topology.edgeCount||l<0||r<0||l>=topology.cellCount||r>=topology.cellCount)throw Error('精确阴影查询缺少区域邻接。');
  cellOffsets[l+1]++;cellOffsets[r+1]++;queryCount+=2;
 }
 for(let c=0;c<topology.cellCount;c++)cellOffsets[c+1]+=cellOffsets[c];
 const cursor=cellOffsets.slice(),faces=new Uint32Array(queryCount),slots=new Uint32Array(queryCount),answers=new Uint8Array(B*2).fill(2);
 for(let b=0;b<B;b++){
  const l=surface.boundaryFaces[b*2],r=surface.boundaryFaces[b*2+1];if(l<0||r<0)continue;
  const e=surface.sourceEdgeIds[b],li=cursor[topology.edgeCells[e*2]]++,ri=cursor[topology.edgeCells[e*2+1]]++;
  faces[li]=r;slots[li]=b*2;faces[ri]=l;slots[ri]=b*2+1;
 }
 return {cellOffsets,faces,slots,answers};
}

/** Clip each receiving shadow to its one merged face path, including holes and
 * occlusion. No list of all lower-face cells is duplicated per boundary. */
export function modelExactSurfaceShadows(surface:ExactModelSurface,answers:Uint8Array):ExactModelSurfaceShadows {
 if(answers.length!==surface.sourceEdgeIds.length*2)throw Error('精确阴影认证答案不完整。');
 const fillByFace=new Map<number,number>();surface.faceIds.forEach((face,fill)=>fillByFace.set(face,fill));
 const strips:ExactModelShadowStrip[]=[];
 for(let edge=0;edge<surface.sourceEdgeIds.length;edge++){
  const l=surface.boundaryFaces[edge*2],r=surface.boundaryFaces[edge*2+1];if(l<0||r<0)continue;
  const left=answers[edge*2],right=answers[edge*2+1];
  if(left>1||right>1)throw Error('精确阴影仍有未完成的纸层覆盖查询。');
  if(left&&right)throw Error('精确阴影边两侧的上下关系冲突。');
  if(!left&&!right)continue;
  const upperFace=left?l:r,lowerFace=left?r:l,clipFill=fillByFace.get(lowerFace);
  if(clipFill===undefined)throw Error('精确阴影缺少接收纸面的可见轮廓。');
  const dx=surface.boundaryDirectionXY[edge*2],dy=surface.boundaryDirectionXY[edge*2+1];
  strips.push({edge,upperFace,lowerFace,clipFill,inward:left?[dy,-dx]:[-dy,dx]});
 }
 return {strips,ambiguousEdges:0};
}

export interface ExactModelShadowChain {
 strip:ExactModelShadowStrip;startVertex:number;endVertex:number;stripIndices:number[];
}
/** Merge display rectangles only when exact source identity and vertex identity
 * prove a continuous line. All certified strips and boundaries remain intact.
 * A malformed branch/cycle is rendered per segment rather than losing a branch. */
export function modelExactSurfaceShadowChains(surface:ExactModelSurface):ExactModelShadowChain[] {
 const strips=surface.shadows?.strips??[],groups=new Map<string,number[]>(),chains:ExactModelShadowChain[]=[];
 if(!(surface.sourceLineIds instanceof Uint32Array)||surface.sourceLineIds.length!==surface.sourceEdgeIds.length)throw Error('精确阴影缺少源直线认证。');
 const start=(index:number)=>surface.boundaryVertices[strips[index].edge*2],end=(index:number)=>surface.boundaryVertices[strips[index].edge*2+1];
 const append=(indices:number[])=>chains.push({strip:strips[indices[0]],startVertex:start(indices[0]),endVertex:end(indices[indices.length-1]),stripIndices:indices});
 strips.forEach((strip,index)=>{
  const {edge,clipFill,inward}=strip;
  if(!Number.isInteger(edge)||edge<0||edge>=surface.sourceEdgeIds.length||surface.faceIds[clipFill]!==strip.lowerFace)throw Error('精确阴影裁剪关联无效。');
  const key=[surface.sourceLineIds[edge],strip.upperFace,strip.lowerFace,clipFill,...inward].join(',');
  let group=groups.get(key);if(!group)groups.set(key,group=[]);group.push(index);
 });
 for(const group of groups.values()){
  const incoming=new Map<number,number>(),outgoing=new Map<number,number>();let branch=false;
  for(const index of group){const a=start(index),b=end(index);if(a===b||outgoing.has(a)||incoming.has(b))branch=true;outgoing.set(a,index);incoming.set(b,index);}
  if(branch){for(const index of group)append([index]);continue;}
  const used=new Set<number>();
  for(const first of group){
   if(incoming.has(start(first)))continue;
   const indices:number[]=[];let index:number|undefined=first;
   while(index!==undefined&&!used.has(index)){used.add(index);indices.push(index);index=outgoing.get(end(index));}
   append(indices);
  }
  // A directed cycle cannot be a valid nonzero straight segment chain. Keep
  // every original rectangle if a damaged input nevertheless contains one.
  for(const index of group)if(!used.has(index))append([index]);
 }
 return chains;
}

/** Shared by live SVG and file export; keep caller-owned annotations above it. */
export function modelExactSurfaceShadowSVG(surface:ExactModelSurface,project:(point:Point)=>Point,prefix='exact-shadow'):string {
 if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix))throw Error('精确阴影标识无效。');
 const paths=new Map<number,string>();
 const strips=modelExactSurfaceShadowChains(surface).map(({strip,startVertex:aId,endVertex:bId,stripIndices},index)=>{
  const {clipFill,inward}=strip;
  const a:Point=[surface.vertexXY[aId*2],surface.vertexXY[aId*2+1]],b:Point=[surface.vertexXY[bId*2],surface.vertexXY[bId*2+1]],end:Point=[a[0]+inward[0]*10,a[1]+inward[1]*10],gradient=project(end),start=project(a);
  if(!paths.has(clipFill))paths.set(clipFill,modelExactSurfacePath(surface,clipFill,project));
  const id=`${prefix}-${index}`,corners:Point[]=[a,b,[b[0]+inward[0]*10,b[1]+inward[1]*10],end];
  return `<g data-region-shadow="true" data-shadow-segments="${stripIndices.length}" data-shadow-upper="${strip.upperFace}" data-shadow-lower="${strip.lowerFace}" pointer-events="none"><defs><linearGradient id="${id}-gradient" gradientUnits="userSpaceOnUse" x1="${start[0]}" y1="${start[1]}" x2="${gradient[0]}" y2="${gradient[1]}"><stop offset="0" stop-color="#000" stop-opacity="${50/255}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><polygon points="${corners.map(point=>project(point).join(',')).join(' ')}" clip-path="url(#${prefix}-clip-${clipFill})" fill="url(#${id}-gradient)"/></g>`;
 }).join('');
 if(!strips)return '';
 return `<defs>${[...paths].map(([fill,d])=>`<clipPath id="${prefix}-clip-${fill}"><path d="${d}" fill-rule="nonzero" clip-rule="nonzero"/></clipPath>`).join('')}</defs>${strips}`;
}
