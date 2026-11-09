import type {FlatFoldResult} from '../core/types';
import type {ExactModelSurface} from './modelExactSurface';
import {exactGeometryBinding} from './flatExactProof';

export interface ExactSurfaceAnalysis {
 cellCount:number;verifiedCells:number;emptyCells:number;maxDepth:number;faceCount:number;
 geometryBinding:string;
}
export interface ExactSurfaceData {exact:ExactModelSurface;exactAnalysis:ExactSurfaceAnalysis}

/** Complete cell certification is distinct from the merged presentation. No
 * fabricated one-layer cells or empty legacy analysis are used for the latter. */
export function exactSurfaceIssue(data:ExactSurfaceData,result?:FlatFoldResult):string|null {
 if(!data||typeof data!=='object')return '精确纸面结果缺失';
 const {exact:s,exactAnalysis:a}=data;
 const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 if(!s||s.kind!=='exact'||!a||![a.cellCount,a.verifiedCells,a.emptyCells,a.maxDepth,a.faceCount].every(integer)
  ||!a.cellCount||!a.faceCount||a.verifiedCells!==a.cellCount||a.emptyCells>a.cellCount||a.maxDepth>a.faceCount||(a.emptyCells<a.cellCount)!==(a.maxDepth>0)||s.cellCount!==a.cellCount
  ||s.coveredCellCount!==a.cellCount-a.emptyCells||typeof a.geometryBinding!=='string'||!a.geometryBinding)return '精确纸面尚未完整认证';
 if(result&&(a.faceCount!==result.geometry.faces.length||a.geometryBinding!==exactGeometryBinding(result)))return '精确纸面与当前模型几何不一致';
 if(s.side!=='front'&&s.side!=='back')return '精确纸面观察方向无效';
 if(!(s.vertexXY instanceof Float64Array)||s.vertexXY.length%2||!(s.faceIds instanceof Uint32Array)
  ||!(s.faceCellCounts instanceof Uint32Array)||s.faceCellCounts.length!==s.faceIds.length
  ||!(s.faceRingOffsets instanceof Uint32Array)||s.faceRingOffsets.length!==s.faceIds.length+1
  ||!(s.ringVertexOffsets instanceof Uint32Array)||!(s.ringVertices instanceof Uint32Array)
  ||!(s.boundaryVertices instanceof Uint32Array)||!(s.boundaryFaces instanceof Int32Array)
  ||!(s.sourceEdgeIds instanceof Uint32Array)||!(s.sourceLineIds instanceof Uint32Array)||!(s.boundaryDirectionXY instanceof Float64Array))return '精确纸面数组不完整';
 const vertices=s.vertexXY.length/2,edges=s.sourceEdgeIds.length,rings=s.ringVertexOffsets.length-1;
 if(s.boundaryVertices.length!==edges*2||s.boundaryFaces.length!==edges*2||s.sourceLineIds.length!==edges||s.boundaryDirectionXY.length!==edges*2
  ||s.faceRingOffsets[0]!==0||s.faceRingOffsets.at(-1)!==rings||s.ringVertexOffsets[0]!==0
  ||s.ringVertexOffsets.at(-1)!==s.ringVertices.length||s.coveredCellCount>0&&(!edges||!s.faceIds.length))return '精确纸面轮廓数量不一致';
 const faces=new Set<number>();let cells=0;
 for(let i=0;i<s.faceIds.length;i++){
  const f=s.faceIds[i];if(f>=a.faceCount||faces.has(f)||!s.faceCellCounts[i]||s.faceRingOffsets[i]>=s.faceRingOffsets[i+1])return '精确纸面可见面归属无效';
  faces.add(f);cells+=s.faceCellCounts[i];
 }
 if(cells!==s.coveredCellCount)return '精确纸面没有覆盖全部已认证区域';
 for(let i=0;i<rings;i++)if(s.ringVertexOffsets[i+1]-s.ringVertexOffsets[i]<3)return '精确纸面环不完整';
 if(s.vertexXY.some(v=>!Number.isFinite(v))||s.ringVertices.some(v=>v>=vertices)||s.boundaryVertices.some(v=>v>=vertices))return '精确纸面坐标无效';
 const byVertices=new Map<number|string,number>(),sourceEdges=new Set<number>(),numericKeys=vertices*vertices<=Number.MAX_SAFE_INTEGER,edgeKey=(a:number,b:number)=>numericKeys?Math.min(a,b)*vertices+Math.max(a,b):`${Math.min(a,b)},${Math.max(a,b)}`;
 for(let e=0;e<edges;e++){
  const l=s.boundaryFaces[e*2],r=s.boundaryFaces[e*2+1];
  const first=s.boundaryVertices[e*2],last=s.boundaryVertices[e*2+1],key=edgeKey(first,last);
  if(first===last||byVertices.has(key)||sourceEdges.has(s.sourceEdgeIds[e])||l===r||l< -1||r< -1||l>=0&&!faces.has(l)||r>=0&&!faces.has(r)
   ||!Number.isFinite(s.boundaryDirectionXY[e*2])||!Number.isFinite(s.boundaryDirectionXY[e*2+1])
   ||Math.abs(Math.hypot(s.boundaryDirectionXY[e*2],s.boundaryDirectionXY[e*2+1])-1)>1e-10)return '精确纸面边界归属无效';
  byVertices.set(key,e);sourceEdges.add(s.sourceEdgeIds[e]);
 }
 const used=new Uint8Array(edges);
 for(let fill=0;fill<s.faceIds.length;fill++)for(let ring=s.faceRingOffsets[fill];ring<s.faceRingOffsets[fill+1];ring++){
  const first=s.ringVertexOffsets[ring],end=s.ringVertexOffsets[ring+1];
  for(let i=first;i<end;i++){
   const a=s.ringVertices[i],b=s.ringVertices[i+1===end?first:i+1],edge=byVertices.get(edgeKey(a,b));if(edge===undefined)return '精确纸面填充环包含未经认证的边';
   const forward=s.boundaryVertices[edge*2]===a,bit=forward?1:2;
   if(s.boundaryFaces[edge*2+(forward?0:1)]!==s.faceIds[fill]||used[edge]&bit)return '精确纸面填充环与边界归属不一致';used[edge]|=bit;
  }
 }
 for(let e=0;e<edges;e++)if(used[e]!==((s.boundaryFaces[e*2]>=0?1:0)|(s.boundaryFaces[e*2+1]>=0?2:0)))return '精确纸面没有完整保留填充轮廓';
 if(s.shadows&&(s.shadows.ambiguousEdges!==0||!Array.isArray(s.shadows.strips)))return '精确纸面阴影尚未确认';
 const shadowEdges=new Set<number>();for(const strip of s.shadows?.strips??[]){
  if(!strip||!integer(strip.edge)||strip.edge>=edges||!integer(strip.clipFill)||strip.clipFill>=s.faceIds.length||!Array.isArray(strip.inward)||strip.inward.length!==2||strip.inward.some(n=>!Number.isFinite(n)))return '精确纸面阴影裁剪无效';
  const edge=strip.edge,l=s.boundaryFaces[edge*2],r=s.boundaryFaces[edge*2+1],left=strip.upperFace===l&&strip.lowerFace===r,right=strip.upperFace===r&&strip.lowerFace===l,dx=s.boundaryDirectionXY[edge*2],dy=s.boundaryDirectionXY[edge*2+1];
  if(l<0||r<0||!left&&!right||s.faceIds[strip.clipFill]!==strip.lowerFace||shadowEdges.has(edge)||Math.abs(strip.inward[0]-(left?dy:-dy))>1e-10||Math.abs(strip.inward[1]-(left?-dx:dx))>1e-10)return '精确纸面阴影归属或方向无效';shadowEdges.add(edge);
 }
 return null;
}

/** Both sides must describe the same complete subdivision and opposite views. */
export function exactSurfacePairIssue(first:ExactSurfaceData,opposite:ExactSurfaceData,result?:FlatFoldResult,expectedSide?:'front'|'back'):string|null {
 const issue=exactSurfaceIssue(first,result)||exactSurfaceIssue(opposite,result);if(issue)return issue;
 if(expectedSide&&first.exact.side!==expectedSide||opposite.exact.side!==(first.exact.side==='front'?'back':'front'))return '精确纸面正反观察方向不匹配';
 const a=first.exactAnalysis,b=opposite.exactAnalysis;
 if(a.cellCount!==b.cellCount||a.verifiedCells!==b.verifiedCells||a.emptyCells!==b.emptyCells||a.maxDepth!==b.maxDepth||a.faceCount!==b.faceCount||a.geometryBinding!==b.geometryBinding)return '精确纸面正反面不是同一份完整认证';
 return null;
}
