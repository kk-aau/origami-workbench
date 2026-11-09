import {polygonArea} from './geometry';
import {flatLayerEdges} from './flatLayerOrder';
import type {FaceOrder,LayerNode} from './layerSolutions';
import type {FlatLayerPreference,Point} from './types';

export interface PreferredLayerSelection {
  status:'matched'|'conflict'|'unsupported'|'error';message:string;
  orders?:FaceOrder[];solutionIndex?:number;count?:bigint;
}
const pair=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
export function validateLayerPreferences(preferences:FlatLayerPreference[],faceCount:number):void{
  if(!Array.isArray(preferences)||preferences.some(row=>!row||Object.keys(row).some(k=>k!=='below'&&k!=='above')||
      !Number.isSafeInteger(row.below)||!Number.isSafeInteger(row.above)||row.below<0||row.above<0||row.below>=faceCount||row.above>=faceCount||row.below===row.above))throw Error('继承层序需要当前材料纸面的有效上下关系。');
}
/** Select in the genuine solver AND/OR tree. Whole incompatible branches are
 * pruned; raw ranks retain the ordinary deterministic candidate numbering.
 * No Cartesian enumeration, copied old certificate or fabricated order. */
export function selectPreferredLayerSolution(tree:LayerNode,vertices:Point[],faces:number[][],preferences:FlatLayerPreference[],nodeBudget=Infinity):PreferredLayerSelection{
  try{
    if(nodeBudget!==Infinity&&(!Number.isSafeInteger(nodeBudget)||nodeBudget<1))throw Error('纸层继承搜索预算必须为正整数，或设为不限量。');
    validateLayerPreferences(preferences,faces.length);
    const normals=faces.map(face=>Math.sign(polygonArea(face.map(v=>vertices[v]))));
    if(normals.some(n=>!n))return {status:'unsupported',message:'退化纸面无法可靠继承纸层关系，已保留新 CP 的合法方案。'};
    const expected=new Map<string,number>();
    for(const {below,above} of preferences){const key=pair(below,above);if(expected.has(key)&&expected.get(key)!==above)return {status:'conflict',message:'原纸层偏好互相冲突，已保留新 CP 的合法方案。'};expected.set(key,above);}
    let visits=0;const tick=()=>{if(++visits>nodeBudget)throw Error('budget');},counts=new Map<LayerNode,bigint>();
    const count=(node:LayerNode):bigint=>{const cached=counts.get(node);if(cached!==undefined)return cached;tick();const value=(node.branches??[]).reduce((n,choices)=>n*choices.reduce((sum,child)=>sum+count(child),0n),1n);counts.set(node,value);return value;};
    const total=count(tree);
    const selected=new Map<LayerNode,{orders:FaceOrder[];index:bigint}|null>();
    const choose=(node:LayerNode):{orders:FaceOrder[];index:bigint}|null=>{
      if(selected.has(node))return selected.get(node)!;tick();
      for(const [a,b,sign] of node.orders){const upper=sign*normals[b]>0?a:b,want=expected.get(pair(a,b));if(want!==undefined&&upper!==want){selected.set(node,null);return null;}}
      const groups=node.branches??[],sizes=groups.map(choices=>choices.reduce((sum,child)=>sum+count(child),0n)),suffix=Array<bigint>(groups.length+1).fill(1n);
      for(let i=groups.length-1;i>=0;i--)suffix[i]=suffix[i+1]*sizes[i];
      const orders=node.orders.map(row=>[...row] as FaceOrder);let index=0n;
      for(let i=0;i<groups.length;i++){
        let skipped=0n,found=false;
        for(const child of groups[i]){const answer=choose(child);if(answer){orders.push(...answer.orders);index+=(skipped+answer.index)*suffix[i+1];found=true;break;}skipped+=count(child);}
        if(!found){selected.set(node,null);return null;}
      }
      const answer={orders,index};selected.set(node,answer);return answer;
    };
    const answer=choose(tree);
    if(!answer)return {status:'conflict',message:'本步的新山谷指派无法同时保持原纸层关系，已保留新 CP 的合法方案。',count:total};
    if(answer.index>BigInt(Number.MAX_SAFE_INTEGER))return {status:'unsupported',message:'继承方案的候选编号超出安全整数范围，已保留新 CP 的合法方案。',count:total};
    const adjacency=faces.map(()=>new Set<number>());for(const [a,b] of flatLayerEdges(answer.orders,normals))adjacency[a].add(b);
    const reachable=new Map<number,Set<number>>();
    for(const {below,above} of preferences){let seen=reachable.get(below);if(!seen){seen=new Set<number>();const pending=[below];while(pending.length){for(const next of adjacency[pending.pop()!]){tick();if(!seen.has(next)){seen.add(next);pending.push(next);}}}reachable.set(below,seen);}if(!seen.has(above))return {status:'unsupported',message:'新层序证书未覆盖部分原纸层关系，已保留新 CP 的合法方案。',count:total};}
    return {status:'matched',message:'已在新 CP 的合法层序解中保留未改动纸面的原有上下关系。',orders:answer.orders,solutionIndex:Number(answer.index),count:total};
  }catch(error){return {status:error instanceof Error&&error.message==='budget'?'unsupported':'error',message:error instanceof Error&&error.message==='budget'?'纸层继承搜索超过有界预算，已保留新 CP 的合法方案。':error instanceof Error?error.message:String(error)};}
}
