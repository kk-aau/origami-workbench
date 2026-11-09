import type {FlatFoldResult} from '../core/types';
import type {FlatSide} from './flatPresentation';
import {exactGeometryBinding,type FlatExactProof} from './flatExactProof';
import {walkExactCoverage} from './modelExactTopology';
import {modelExactSurface,modelExactSurfaceShadowQueries,modelExactSurfaceShadows,type ExactModelSurface,type ExactSurfaceShadowQueries} from './modelExactSurface';
import {exactSurfaceIssue,type ExactSurfaceAnalysis,type ExactSurfaceData} from './modelExactSurfaceData';
import type {ModelOverlapProgress} from './modelOverlapTask';

export type CompleteExactSurfaceReply={status:'complete'}&ExactSurfaceData&{opposite?:ExactSurfaceData};

/** Consume a completed worker-local layer proof. Both presentations share one
 * coverage walk for certificate membership/depth checks and shadow queries.
 * No topology, cell-membership arrays or solver state enter the returned data. */
export function completeExactSurface(result:FlatFoldResult,proof:FlatExactProof,options:{side?:FlatSide;bothSides?:boolean;shadows?:boolean;pass?:number}={},onProgress?:(progress:ModelOverlapProgress)=>void):CompleteExactSurfaceReply{
 const {topology,certificate}=proof,{side='front',bothSides=false,shadows=true,pass=1}=options;
 if(side!=='front'&&side!=='back')throw Error('精确纸面观察方向无效。');
 if(result.layers.status!=='solved'||topology.faceCount!==result.geometry.faces.length||certificate.verifiedCells!==topology.cellCount
  ||!(certificate.top instanceof Int32Array)||!(certificate.bottom instanceof Int32Array)||!(certificate.depth instanceof Uint32Array)
  ||certificate.top.length!==topology.cellCount||certificate.bottom.length!==topology.cellCount||certificate.depth.length!==topology.cellCount)throw Error('精确纸面层序证书没有完整覆盖当前模型。');
 const progress=()=>onProgress?.({stage:'boundaries',pass,epsilon:0}),orders={front:certificate.top,back:certificate.bottom};progress();
 const exact=modelExactSurface(topology,orders,side,progress),other=bothSides?modelExactSurface(topology,orders,side==='front'?'back':'front',progress):undefined;
 const queries:{surface:ExactModelSurface;query:ExactSurfaceShadowQueries}[]=shadows?[exact,...(other?[other]:[])].map(surface=>({surface,query:modelExactSurfaceShadowQueries(topology,surface)})):[];
 let verifiedCells=0,emptyCells=0,maxDepth=0;
 walkExactCoverage(topology,{onCell(cell,faces){
  const depth=certificate.depth[cell],top=certificate.top[cell],bottom=certificate.bottom[cell];
  if(depth!==faces.size||depth===0&&(top!==-1||bottom!==-1)||depth>0&&(!faces.has(top)||!faces.has(bottom))||depth===1&&top!==bottom||depth>1&&top===bottom)throw Error(`精确纸面区域 ${cell+1} 的层序证书与真实覆盖不一致。`);
  verifiedCells++;emptyCells+=Number(!depth);maxDepth=Math.max(maxDepth,depth);
  for(const {query:q}of queries)for(let i=q.cellOffsets[cell];i<q.cellOffsets[cell+1];i++)q.answers[q.slots[i]]=Number(faces.has(q.faces[i]));
  if(verifiedCells%65536===0)progress();
 }});
 if(verifiedCells!==certificate.verifiedCells)throw Error('精确纸面未完成全部区域的覆盖复核。');
 for(const {surface,query}of queries)surface.shadows=modelExactSurfaceShadows(surface,query.answers);
 const exactAnalysis:ExactSurfaceAnalysis={cellCount:topology.cellCount,verifiedCells,emptyCells,maxDepth,faceCount:topology.faceCount,geometryBinding:exactGeometryBinding(result)};
 const data:ExactSurfaceData={exact,exactAnalysis},opposite=other?{exact:other,exactAnalysis}:undefined;
 const issue=exactSurfaceIssue(data,result)||(opposite?exactSurfaceIssue(opposite,result):null);if(issue)throw Error(issue);
 return {status:'complete',...data,...(opposite?{opposite}:{})};
}
