/** Strongly connected components of below-to-above face relations. Values use
 * the layer solver convention: 0 is unknown, 1 puts b below a, 2 puts a below b.
 * Component IDs follow the condensation graph's order; a component itself has
 * no asserted order. Recompute for each candidate because guesses may change. */
export function faceRelationComponents(
  count:number,pairs:readonly (readonly [number,number])[],values:Uint8Array,
  pairId?: (a:number,b:number)=>number,
):{component:Uint32Array;sizes:Uint32Array;preservesOrder?:(below:number,above:number,id:number)=>boolean}{
  const outOffsets=new Uint32Array(count+1),inOffsets=new Uint32Array(count+1);
  pairs.forEach(([a,b],i)=>{
    if(!values[i])return;
    const below=values[i]===1?b:a,above=values[i]===1?a:b;
    outOffsets[below+1]++;inOffsets[above+1]++;
  });
  for(let i=1;i<=count;i++){outOffsets[i]+=outOffsets[i-1];inOffsets[i]+=inOffsets[i-1];}
  const outgoing=new Uint32Array(outOffsets[count]),incoming=new Uint32Array(inOffsets[count]);
  const outCursor=outOffsets.slice(),inCursor=inOffsets.slice();
  pairs.forEach(([a,b],i)=>{
    if(!values[i])return;
    const below=values[i]===1?b:a,above=values[i]===1?a:b;
    outgoing[outCursor[below]++]=above;incoming[inCursor[above]++]=below;
  });
  // Iterative Kosaraju avoids overflowing the JS stack on long fold chains.
  const seen=new Uint8Array(count),cursor=outOffsets.slice(),finish:number[]=[],stack:number[]=[];
  const tree=pairId?{entered:new Uint32Array(count),through:new Uint32Array(count),firstChild:new Uint32Array(count),sibling:new Uint32Array(count),edge:new Uint32Array(count)}:undefined;
  let visited=0;
  for(let seed=0;seed<count;seed++){
    if(seen[seed])continue;
    seen[seed]=1;stack.push(seed);
    if(tree)tree.entered[seed]=visited++;
    while(stack.length){
      const face=stack[stack.length-1];
      if(cursor[face]<outOffsets[face+1]){
        const next=outgoing[cursor[face]++];
        if(!seen[next]){
          seen[next]=1;stack.push(next);
          if(tree){
            tree.entered[next]=visited++;tree.edge[next]=pairId!(face,next);
            tree.sibling[next]=tree.firstChild[face];tree.firstChild[face]=next+1;
          }
        }
      }else{if(tree)tree.through[face]=visited-1;finish.push(face);stack.pop();}
    }
  }
  const component=new Uint32Array(count),sizes=new Uint32Array(count);let id=0;
  seen.fill(0);
  for(let i=finish.length-1;i>=0;i--){
    const seed=finish[i];if(seen[seed])continue;
    seen[seed]=1;stack.push(seed);
    while(stack.length){
      const face=stack.pop()!;component[face]=id;sizes[id]++;
      for(let k=inOffsets[face];k<inOffsets[face+1];k++){
        const next=incoming[k];if(!seen[next]){seen[next]=1;stack.push(next);}
      }
    }
    id++;
  }
  // An added forward condensation edge cannot merge components. Its new
  // adjacency slot also preserves the exact DFS finish order if the target
  // was already visited at entry or by a lower-id child of this source.
  const preservesOrder=tree?(below:number,above:number,edge:number)=>{
    if(component[below]>component[above])return false;
    const target=tree.entered[above];if(target<=tree.entered[below])return true;
    for(let child=tree.firstChild[below];child;child=tree.sibling[child-1]){
      if(tree.edge[child-1]<edge&&tree.through[child-1]>=target)return true;
    }
    return false;
  }:undefined;
  return {component,sizes:sizes.subarray(0,id),preservesOrder};
}
