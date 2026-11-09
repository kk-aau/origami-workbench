import ear from 'rabbit-ear';
import {polygonArea} from './geometry';
import {createLayerSolutionSelector,validateLayerOrders,type FaceOrder,type LayerNode} from './layerSolutions';
import type {FlatLayerAdjustment,Point} from './types';

interface AdjustmentResult {
  status:'solved'|'unsupported'|'error'|'no-solution';message:string;
  orders?:FaceOrder[];solutionIndex?:number;count?:bigint;
}
interface AdjustmentSearch {
  vertices:Point[];faces:number[][];epsilon:number;request:FlatLayerAdjustment;solutionIndex:number;
  /** This is the same filter used for ordinary candidate numbering. */
  matches?:(orders:FaceOrder[])=>boolean;
  candidateLimit?:number;
  /** Already certified unnumbered candidate; never substitute numbered zero. */
  currentOrders?:FaceOrder[];
}

/** Search the existing valid-solution tree once. A paper face's rank counts
 * only positive-area overlapping peers; unrelated faces never fake a move. */
export function selectAdjustedLayerSolution(tree:LayerNode,{vertices,faces,epsilon,request,solutionIndex,matches,candidateLimit=Infinity,currentOrders}:AdjustmentSearch):AdjustmentResult {
  if(!request||!Number.isSafeInteger(request.face)||request.face<0||request.face>=faces.length||
      !['up','down','top','bottom'].includes(request.direction)||!['front','back'].includes(request.side)||
      !Number.isSafeInteger(solutionIndex)||solutionIndex<0||candidateLimit!==Infinity&&(!Number.isSafeInteger(candidateLimit)||candidateLimit<1))
    return {status:'error',message:'纸层调整需要有效纸面、升降方向和当前观察方向。'};
  const selector=createLayerSolutionSelector(tree),total=selector.count,cap=candidateLimit===Infinity||total<BigInt(candidateLimit)?total:BigInt(candidateLimit),complete=total===cap;
  if(!total)return {status:'no-solution',message:'当前平折几何和山谷指派没有合法层序解。',count:0n};
  let filteredCount=0n,rawCurrent:bigint|undefined=matches?undefined:BigInt(solutionIndex);
  // Count and find the current filtered rank without materializing one index
  // per candidate. Enumeration remains cancellable through its owning Worker.
  if(matches){for(let index=0n;index<cap;index++)if(matches(selector.select(index)!)){if(filteredCount===BigInt(solutionIndex))rawCurrent=index;filteredCount++;}}
  const count=matches?(complete?filteredCount:undefined):total;
  const current=currentOrders??(rawCurrent===undefined?null:selector.select(rawCurrent));
  if(!current)return complete?{status:count===0n?'no-solution':'error',message:count===0n?'当前正反色约束没有合法层序解。':'当前纸层方案编号超出合法解范围。',count}:
    {status:'unsupported',message:`合法层序候选超过 ${candidateLimit.toLocaleString('en-US')} 个，尚未找到当前方案；已保留原纸层顺序。`};
  const normals=faces.map(face=>Math.sign(polygonArea(face.map(vertex=>vertices[vertex]))));
  if(normals.some(normal=>!normal))return {status:'unsupported',message:'当前纸面含退化区域，无法可靠调整纸层顺序。'};
  const overlaps=ear.graph.getFacesFacesOverlap({vertices_coords:vertices,faces_vertices:faces},epsilon) as number[][];
  const peers=new Set(overlaps[request.face]??[]),up=request.direction==='up'||request.direction==='top';
  const pairKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const relations=(orders:FaceOrder[])=>{
    const map=new Map<string,number>();
    for(const [a,b,sign] of orders){
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=faces.length||b>=faces.length||a===b||Math.abs(sign)!==1)return null;
      const upper=sign*normals[b]>0?a:b,key=pairKey(a,b);
      if(map.has(key)&&map.get(key)!==upper)return null;
      map.set(key,upper);
    }
    return map;
  };
  const rank=(map:Map<string,number>)=>{
    let above=0;
    for(const peer of peers){const upper=map.get(pairKey(request.face,peer));if(upper===undefined)return null;if((upper===request.face)===(request.side==='front'))above++;}
    return above;
  };
  const base=relations(current),currentRank=base&&rank(base);
  if(!base||currentRank===null)return {status:'unsupported',message:'选中纸面与相交纸层的上下关系尚未完整确认，无法调整。'};
  if(currentOrders){
    try{validateLayerOrders(currentOrders,faces.length);}catch{return {status:'error',message:'当前未编号候选的纸层关系无效。'};}
    const compatible=(node:LayerNode):boolean=>node.orders.every(([a,b,sign])=>base.get(pairKey(a,b))===(sign*normals[b]>0?a:b))&&(node.branches??[]).every(group=>group.some(compatible));
    if(!compatible(tree)||matches&&!matches(currentOrders))return {status:'unsupported',message:'当前未编号候选不属于本次合法层序解集，已保留原顺序。'};
  }
  const end=up?peers.size:0;
  const unchanged=():AdjustmentResult=>({status:'solved',orders:current,...(currentOrders?{}:{solutionIndex}),count,message:peers.size?`已在有效解可达的最${up?'上':'下'}层；原纸层顺序保留。`:'该纸面没有面积重叠的纸层，无需调整顺序。'});
  if(currentRank===end)return unchanged();
  let best:{index:bigint;orders:FaceOrder[];rank:number;others:number;target:number}|null=null,unreadable=false,proved=false,filtered=0n;
  for(let raw=0n;raw<cap;raw++){
    const orders=selector.select(raw)!;if(matches&&!matches(orders))continue;
    const index=matches?filtered++:raw,map=relations(orders),candidateRank=map&&rank(map);
    if(!map||candidateRank===null){unreadable=true;continue;}
    if(up?candidateRank<=currentRank:candidateRank>=currentRank)continue;
    let others=0,target=0;
    for(const [key,upper] of map)if(base.get(key)!==upper){const [a,b]=key.split(':').map(Number);if(a===request.face||b===request.face)target++;else others++;}
    const nearest=request.direction==='up'||request.direction==='down';
    if(!best)best={index,orders,rank:candidateRank,others,target};
    else {
      const gain=Math.abs(candidateRank-currentRank),bestGain=Math.abs(best.rank-currentRank);
      const betterRank=nearest?gain<bestGain:gain>bestGain;
      if(betterRank||best.rank===candidateRank&&(others<best.others||others===best.others&&target<best.target))best={index,orders,rank:candidateRank,others,target};
    }
    // An adjacent peer rank is the nearest possible upward/downward move.
    // A face above/below every actual peer is a proven geometric extreme.
    if(!complete&&best&&(nearest?Math.abs(best.rank-currentRank)===1:best.rank===end)){proved=true;break;}
  }
  if(!complete&&!proved)return {status:'unsupported',message:`层序候选超过 ${candidateLimit.toLocaleString('en-US')} 个，尚未证实可达层位，已保留原纸层顺序。`};
  if(unreadable&&!proved)return {status:'unsupported',message:'部分合法解的局部纸层关系不能完整比较，未替换当前纸层顺序。'};
  if(!best)return unchanged();
  if(best.index>BigInt(Number.MAX_SAFE_INTEGER))return {status:'unsupported',message:'调整方案的候选编号超出安全整数范围，已保留原纸层顺序。',count};
  return {status:'solved',orders:best.orders,solutionIndex:Number(best.index),count,message:`已在合法层序解内将纸面${request.direction==='up'?'上移':request.direction==='down'?'下移':request.direction==='top'?'置于可达最上层':'置于可达最下层'}；纸张几何保持不变。`};
}
