import type {Segment} from './types';

interface Bounds {minX:number;minY:number;maxX:number;maxY:number}
interface Box extends Bounds {index:number}
interface Branch extends Bounds {maxIndex:number;left?:Branch;right?:Branch;boxes?:Box[]}

/** Enumerate overlapping boxes in source order, without scanning every pair.
 * A two-dimensional tree also handles mixed horizontal/vertical sparse drawings
 * where a sweep on either single axis would retain a large active set.
 */
export function* overlappingSegmentPairs(segments:readonly Pick<Segment,'a'|'b'>[],epsilon:number):Generator<[number,number]> {
  if(segments.length<2)return;
  const boxes:Box[]=[];
  segments.forEach((s,index)=>{
    if(![s.a,s.b].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return;
    boxes.push({index,minX:Math.min(s.a[0],s.b[0]),minY:Math.min(s.a[1],s.b[1]),maxX:Math.max(s.a[0],s.b[0]),maxY:Math.max(s.a[1],s.b[1])});
  });
  if(boxes.length<2)return;
  const overlaps=(a:Bounds,b:Bounds)=>!(a.maxX+epsilon<b.minX||b.maxX+epsilon<a.minX||a.maxY+epsilon<b.minY||b.maxY+epsilon<a.minY);
  const build=(items:Box[]):Branch=>{
    const node:Branch={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity,maxIndex:-1};
    let minCenterX=Infinity,minCenterY=Infinity,maxCenterX=-Infinity,maxCenterY=-Infinity;
    for(const box of items){
      node.minX=Math.min(node.minX,box.minX);node.minY=Math.min(node.minY,box.minY);
      node.maxX=Math.max(node.maxX,box.maxX);node.maxY=Math.max(node.maxY,box.maxY);node.maxIndex=Math.max(node.maxIndex,box.index);
      const x=box.minX+box.maxX,y=box.minY+box.maxY;
      minCenterX=Math.min(minCenterX,x);maxCenterX=Math.max(maxCenterX,x);minCenterY=Math.min(minCenterY,y);maxCenterY=Math.max(maxCenterY,y);
    }
    if(items.length<=8){node.boxes=items;return node;}
    const xAxis=maxCenterX-minCenterX>=maxCenterY-minCenterY;
    items.sort((a,b)=>(xAxis?a.minX+a.maxX-b.minX-b.maxX:a.minY+a.maxY-b.minY-b.maxY)||a.index-b.index);
    const middle=Math.floor(items.length/2);
    node.left=build(items.slice(0,middle));node.right=build(items.slice(middle));
    return node;
  };
  // Keep the source order separate from tree construction. The stable i/j
  // order preserves which near-coincident computed intersection is canonical.
  const root=build([...boxes]);
  const collect=(node:Branch,box:Box,matches:number[]):void=>{
    if(node.maxIndex<=box.index||!overlaps(node,box))return;
    if(node.boxes){for(const other of node.boxes)if(other.index>box.index&&overlaps(box,other))matches.push(other.index);return;}
    collect(node.left!,box,matches);collect(node.right!,box,matches);
  };
  for(const box of boxes){
    const matches:number[]=[];
    collect(root,box,matches);matches.sort((a,b)=>a-b);
    for(const other of matches)yield [box.index,other];
  }
}
