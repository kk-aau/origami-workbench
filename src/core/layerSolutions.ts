export type FaceOrder=[number,number,number];
export interface LayerNode {orders:FaceOrder[];branches?:LayerNode[][]}

/** Matches Rabbit Ear's AND groups / OR choices without expanding their Cartesian product. */
export function createLayerSolutionSelector(tree:LayerNode):{count:bigint;select(index:number|bigint):FaceOrder[]|null}{
  const counts=new Map<LayerNode,bigint>();
  const count=(node:LayerNode):bigint=>{
    const cached=counts.get(node);if(cached!==undefined)return cached;
    const n=(node.branches??[]).reduce((product,choices)=>product*choices.reduce((sum,child)=>sum+count(child),0n),1n);
    counts.set(node,n);return n;
  };
  const total=count(tree);
  const select=(node:LayerNode,rank:bigint):FaceOrder[]=>{
    const groups=node.branches??[],sizes=groups.map(choices=>choices.reduce((sum,child)=>sum+count(child),0n));
    const suffix=Array<bigint>(groups.length+1).fill(1n);
    for(let i=groups.length-1;i>=0;i--)suffix[i]=suffix[i+1]*sizes[i];
    const orders=node.orders.map(order=>[...order] as FaceOrder);
    for(let i=0;i<groups.length;i++){
      let local=rank/suffix[i+1];rank%=suffix[i+1];
      for(const child of groups[i]){const n=count(child);if(local<n){orders.push(...select(child,local));break;}local-=n;}
    }
    return orders;
  };
  return {count:total,select(index:number|bigint){
    if(typeof index==='bigint'?index<0n:!Number.isSafeInteger(index)||index<0)throw new Error('层序解编号必须是非负安全整数。');
    return BigInt(index)>=total?null:select(tree,BigInt(index));
  }};
}

export function selectLayerSolution(tree:LayerNode,index=0):{orders:FaceOrder[]|null;count:bigint}{
  const selector=createLayerSolutionSelector(tree);
  return {orders:selector.select(index),count:selector.count};
}

/** Full filtering is the default. Explicit preview budgets may confirm an
 * individual candidate, but only an exhausted tree has an exact filtered count. */
export function selectMatchingLayerSolution(tree:LayerNode,index:number,matches:(orders:FaceOrder[])=>boolean,
  {candidateLimit=Infinity,maxTimeMs=Infinity}:{candidateLimit?:number;maxTimeMs?:number}={}){
  if(!Number.isSafeInteger(index)||index<0||candidateLimit!==Infinity&&(!Number.isSafeInteger(candidateLimit)||candidateLimit<1)||maxTimeMs!==Infinity&&(!Number.isFinite(maxTimeMs)||maxTimeMs<0))
    throw new Error('层序过滤需要有效候选编号与计算预算。');
  const selector=createLayerSolutionSelector(tree),cap=candidateLimit===Infinity||selector.count<BigInt(candidateLimit)?selector.count:BigInt(candidateLimit);
  const deadline=performance.now()+maxTimeMs;
  let checked=0n,matchingCount=0n,orders:FaceOrder[]|null=null;
  while(checked<cap){
    if(maxTimeMs!==Infinity&&performance.now()>=deadline)break;
    const candidate=selector.select(checked)!;
    if(matches(candidate)){if(matchingCount===BigInt(index))orders=candidate;matchingCount++;}
    checked++;
  }
  const complete=checked===selector.count;
  const exactCounter=(value:bigint)=>value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):value;
  return {orders,complete,checked:exactCounter(checked),matchingCount:exactCounter(matchingCount),count:complete?matchingCount:undefined};
}

/** Validate relations at the engine boundary before publishing a certificate.
 * A face cannot lie above itself; duplicate pairs cannot hide contradictions. */
export function validateLayerOrders(orders:FaceOrder[],faceCount:number):void{
  if(!Array.isArray(orders))throw new Error('层序引擎返回的纸层关系不是数组。');
  const pairs=new Set<string>();
  for(const row of orders){
    if(!Array.isArray(row)||row.length!==3||row.slice(0,2).some(n=>!Number.isSafeInteger(n)||n<0||n>=faceCount)||row[0]===row[1]||row[2]!==1&&row[2]!==-1)
      throw new Error('层序引擎返回无效纸面索引、自身关系或方向，未确认该层序解。');
    const key=row[0]<row[1]?`${row[0]}:${row[1]}`:`${row[1]}:${row[0]}`;
    if(pairs.has(key))throw new Error('层序引擎返回重复纸层关系，未确认该层序解。');
    pairs.add(key);
  }
}

export function validateLayerSolutionTree(tree:LayerNode,faceCount:number):void{
  const scopes=new Map<LayerNode,Set<string>>(),active=new Set<LayerNode>();
  const visit=(node:LayerNode):Set<string>=>{
    if(!node||typeof node!=='object')throw new Error('层序引擎返回无效解树。');
    const known=scopes.get(node);if(known)return known;
    if(active.has(node))throw new Error('层序引擎返回循环解树。');
    active.add(node);validateLayerOrders(node.orders,faceCount);
    const scope=new Set(node.orders.map(([a,b])=>a<b?`${a}:${b}`:`${b}:${a}`));
    if(node.branches!==undefined){
      if(!Array.isArray(node.branches)||node.branches.some(choices=>!Array.isArray(choices)))throw new Error('层序引擎返回无效解树分支。');
      for(const choices of node.branches){
        const group=new Set<string>();
        for(const child of choices)for(const pair of visit(child))group.add(pair);
        for(const pair of group){if(scope.has(pair))throw new Error('层序引擎解树重复指定同一纸层关系，未确认候选计数。');scope.add(pair);}
      }
    }
    active.delete(node);scopes.set(node,scope);return scope;
  };
  visit(tree);
}
