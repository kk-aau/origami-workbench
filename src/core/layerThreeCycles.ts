/** Enumerate the same a<b<c directed triangles as the overlap scan. Sorted
 * directional rows make the common-neighbor check linear without pair-map
 * lookups for every rejected third face. Only a single SCC can contain a cycle. */
export function* layerThreeCycles(overlap:readonly (readonly number[])[],value:(a:number,b:number)=>number,component:ArrayLike<number>,sizes:ArrayLike<number>):Generator<[number,number,number]>{
 const n=overlap.length,starts=[new Uint32Array(n+1),new Uint32Array(n+1)];
 for(let a=0;a<n;a++)if(sizes[component[a]]>=3)for(const b of overlap[a])if(b>a&&component[a]===component[b])starts[value(a,b)-1][a+1]++;
 for(const row of starts)for(let i=1;i<row.length;i++)row[i]+=row[i-1];
 const neighbors=starts.map(row=>new Uint32Array(row[n])),cursor=starts.map(row=>row.slice());
 for(let a=0;a<n;a++)if(sizes[component[a]]>=3)for(const b of overlap[a])if(b>a&&component[a]===component[b]){const side=value(a,b)-1;neighbors[side][cursor[side][a]++]=b;}
 for(let a=0;a<n;a++){
  if(sizes[component[a]]<3)continue;
  for(const b of overlap[a]){
   if(b<=a||component[a]!==component[b])continue;
   const side=value(a,b)-1,opposite=1-side,x=neighbors[opposite],y=neighbors[side],xEnd=starts[opposite][a+1],yEnd=starts[side][b+1];
   let i=starts[opposite][a],j=starts[side][b];
   while(i<xEnd&&x[i]<=b)i++;
   while(i<xEnd&&j<yEnd){const c=x[i],d=y[j];if(c===d){yield [a,b,c];i++;j++;}else if(c<d)i++;else j++;}
  }
 }
}
