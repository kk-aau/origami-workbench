import type {FlatFoldResult} from '../core/types';
import {polygonArea} from '../core/geometry';
import type {FlatSide} from './flatPresentation';
import type {ModelOverlapRegions,ModelOverlapCell} from './modelOverlapRegions';

export type ModelRegionLayerOrder={status:'ordered';topToBottom:number[]}|{status:'unconfirmed'|'conflict';message:string};
export interface ModelLayerRegion extends ModelOverlapCell {layers:ModelRegionLayerOrder}

/** Local top-to-bottom order, not an invented global order. Only relationships
 * among faces covering this region apply: global cycles across distinct regions
 * must not hide a locally well-defined visible face.
 */
export function modelRegionLayers(result:FlatFoldResult,regions:ModelOverlapRegions,side:FlatSide):ModelLayerRegion[]{
 if(side!=='front'&&side!=='back')throw new Error('重叠区域观察方向无效。');
 const {vertices,faces}=result.geometry;
 if(result.geometry.status!=='ready'||vertices.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))||faces.some(f=>f.length<3||f.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length)))throw new Error('重叠区域层序的模型几何无效。');
 const relations=result.layers.status==='solved'?result.layers.faceOrders??[]:[];
 if(relations.some(r=>!Array.isArray(r)||r.length!==3||!Number.isInteger(r[0])||!Number.isInteger(r[1])||r[0]<0||r[1]<0||r[0]>=faces.length||r[1]>=faces.length||r[0]===r[1]||Math.abs(r[2])!==1))throw new Error('重叠区域层序关系无效。');
 const normals=faces.map(f=>polygonArea(f.map(v=>vertices[v]))>0?1:-1);
 const outgoing=new Map<number,Set<number>>();
 for(const [first,second,sign] of relations){const [a,b]=sign*normals[second]>0?[second,first]:[first,second];const list=outgoing.get(a)??new Set<number>();list.add(b);outgoing.set(a,list);}
 // If the complete relation graph is acyclic, every induced local graph is
 // acyclic too. In a topological ordering it has a unique order exactly when
 // each adjacent pair is connected by a direct local edge. A path through a
 // face absent from this cell must not confirm the cell's order.
 const globalDegree=new Uint32Array(faces.length);
 for(const row of outgoing.values())for(const b of row)globalDegree[b]++;
 const globalOrder:number[]=[];for(let i=0;i<faces.length;i++)if(!globalDegree[i])globalOrder.push(i);
 for(let cursor=0;cursor<globalOrder.length;cursor++)for(const b of outgoing.get(globalOrder[cursor])??[])if(--globalDegree[b]===0)globalOrder.push(b);
 const rank=globalOrder.length===faces.length?new Uint32Array(faces.length):undefined;
 if(rank)globalOrder.forEach((id,i)=>{rank[id]=i;});
 const wordCount=Math.ceil(faces.length/32),matrixWords=wordCount*faces.length;
 // Dense local coverage must not rescan every relation of every covered face.
 // Keep the optional matrices below 128 MiB together, independent of input size.
 const incomingBits=!rank&&relations.length>faces.length*4&&matrixWords*8<=128*1024*1024?new Uint32Array(matrixWords):undefined;
 const outgoingBits=incomingBits?new Uint32Array(matrixWords):undefined;
 let opposite=false;
 if(incomingBits&&outgoingBits)for(const [a,row]of outgoing)for(const b of row){if(incomingBits[a*wordCount+(b>>>5)]&(1<<(b&31)))opposite=true;incomingBits[b*wordCount+(a>>>5)]|=1<<(a&31);outgoingBits[a*wordCount+(b>>>5)]|=1<<(b&31);}
 const popcount=(n:number)=>{n-=n>>>1&0x55555555;n=(n&0x33333333)+(n>>>2&0x33333333);return ((n+(n>>>4)&0x0f0f0f0f)*0x01010101)>>>24;};
 const mask=new Uint32Array(wordCount),localDegree=new Uint32Array(faces.length);
 // Vertical decomposition may split one coverage set into many cells. Its
 // order is identical in all of them, regardless of polygon or face ID order.
 const orders=new Map<string,ModelRegionLayerOrder>();
 return regions.cells.map(cell=>{
  const ids=cell.faces,set=new Set(ids);
  if(!ids.length||set.size!==ids.length||ids.some(id=>!Number.isInteger(id)||id<0||id>=faces.length))throw new Error('重叠区域包含无效的纸面编号。');
  const key=[...ids].sort((a,b)=>a-b).join(','),cached=orders.get(key);
  if(cached)return {...cell,layers:cached};
  if(rank){
   const bottomToTop=[...ids].sort((a,b)=>rank[a]-rank[b]);
   const confirmed=bottomToTop.every((id,i)=>i===0||outgoing.get(bottomToTop[i-1])?.has(id));
   const layers:ModelRegionLayerOrder=confirmed?{status:'ordered',topToBottom:side==='front'?bottomToTop.reverse():bottomToTop}:{status:'unconfirmed',message:'此区域缺少足够的上下关系，不按纸面编号猜测顺序。'};
   orders.set(key,layers);return {...cell,layers};
  }
  if(incomingBits&&outgoingBits){
   const words:number[]=[];for(const id of ids){const w=id>>>5;if(!mask[w])words.push(w);mask[w]|=1<<(id&31);}
   let edgeCount=0;const ready:number[]=[];
   for(const id of ids){let degree=0;const offset=id*wordCount;for(const word of words)degree+=popcount(incomingBits[offset+word]&mask[word]);localDegree[id]=degree;edgeCount+=degree;if(!degree)ready.push(id);}
   let bottomToTop:number[]=[],ambiguous=false,conflict=false;
   if(!opposite&&edgeCount===ids.length*(ids.length-1)/2){
    // A complete orientation is transitive iff its indegrees are 0..k-1.
    // This also detects every tournament cycle without trusting solver status.
    const byDegree=new Array<number>(ids.length);
    for(const id of ids){const degree=localDegree[id];if(byDegree[degree]!==undefined){conflict=true;break;}byDegree[degree]=id;}
    if(!conflict)bottomToTop=byDegree;
   }else{
    for(let cursor=0;cursor<ready.length;cursor++){
     if(ready.length-cursor>1)ambiguous=true;
     const id=ready[cursor];bottomToTop.push(id);const offset=id*wordCount;
     for(const word of words){let bits=(outgoingBits[offset+word]&mask[word])>>>0;while(bits){const bit=bits&-bits,upper=(word<<5)+31-Math.clz32(bit);if(--localDegree[upper]===0)ready.push(upper);bits=(bits^bit)>>>0;}}
    }
    conflict=bottomToTop.length!==ids.length;
   }
   for(const word of words)mask[word]=0;
   const layers:ModelRegionLayerOrder=conflict?{status:'conflict',message:'此区域的上下关系形成循环，不能确定可见纸面。'}:ambiguous?{status:'unconfirmed',message:'此区域缺少足够的上下关系，不按纸面编号猜测顺序。'}:{status:'ordered',topToBottom:side==='front'?bottomToTop.reverse():bottomToTop};
   orders.set(key,layers);return {...cell,layers};
  }
  const degree=new Map(ids.map(id=>[id,0]));
  for(const a of ids)for(const b of outgoing.get(a)??[])if(set.has(b)){
   degree.set(b,degree.get(b)!+1);
  }
  const ready=ids.filter(id=>degree.get(id)===0),bottomToTop:number[]=[];let ambiguous=false;
  for(let cursor=0;cursor<ready.length;cursor++){
   if(ready.length-cursor>1)ambiguous=true;
   const id=ready[cursor];bottomToTop.push(id);
   for(const upper of outgoing.get(id)??[])if(set.has(upper)){
    const remaining=degree.get(upper)!-1;degree.set(upper,remaining);if(!remaining)ready.push(upper);
   }
  }
  const layers:ModelRegionLayerOrder=bottomToTop.length!==ids.length
   ?{status:'conflict',message:'此区域的上下关系形成循环，不能确定可见纸面。'}
   :ambiguous?{status:'unconfirmed',message:'此区域缺少足够的上下关系，不按纸面编号猜测顺序。'}
   :{status:'ordered',topToBottom:side==='front'?bottomToTop.reverse():bottomToTop};
  orders.set(key,layers);return {...cell,layers};
 });
}
