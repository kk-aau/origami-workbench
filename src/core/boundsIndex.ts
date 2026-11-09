/** Closed axis-aligned bounds, in minX/minY/maxX/maxY order. */
export type Bounds2=readonly [number,number,number,number];
interface Box {index:number;bounds:Bounds2}
interface Branch {bounds:Bounds2;maxIndex:number;left?:Branch;right?:Branch;boxes?:Box[]}

/** The same two-dimensional median tree used by segmentPairs, with independent
 * queries so point/edge and face/edge searches can reuse one built index. */
export class BoundsIndex {
 private readonly root:Branch|undefined;
 constructor(boxes:readonly Bounds2[]){
  const build=(items:Box[]):Branch=>{
   let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,maxIndex=-1;
   let minCenterX=Infinity,minCenterY=Infinity,maxCenterX=-Infinity,maxCenterY=-Infinity;
   for(const {bounds:b,index}of items){
    minX=Math.min(minX,b[0]);minY=Math.min(minY,b[1]);maxX=Math.max(maxX,b[2]);maxY=Math.max(maxY,b[3]);maxIndex=Math.max(maxIndex,index);
    const x=b[0]+b[2],y=b[1]+b[3];minCenterX=Math.min(minCenterX,x);maxCenterX=Math.max(maxCenterX,x);minCenterY=Math.min(minCenterY,y);maxCenterY=Math.max(maxCenterY,y);
   }
   const node:Branch={bounds:[minX,minY,maxX,maxY],maxIndex};
   if(items.length<=8){node.boxes=items;return node;}
   const axis=maxCenterX-minCenterX>=maxCenterY-minCenterY?0:1;
   items.sort((a,b)=>(a.bounds[axis]+a.bounds[axis+2]-b.bounds[axis]-b.bounds[axis+2])||a.index-b.index);
   const middle=Math.floor(items.length/2);node.left=build(items.slice(0,middle));node.right=build(items.slice(middle));return node;
  };
  if(boxes.length)this.root=build(boxes.map((bounds,index)=>({bounds,index})));
 }
 /** Retain the contact predicates' max+padding comparisons, including equality,
  * and return ascending source indices independently of the tree partition. */
 query(box:Bounds2,padding=0,after=-1):number[]{
  const found:number[]=[],overlaps=(other:Bounds2)=>box[0]<=other[2]+padding&&other[0]<=box[2]+padding&&box[1]<=other[3]+padding&&other[1]<=box[3]+padding;
  const visit=(node:Branch):void=>{
   if(node.maxIndex<=after||!overlaps(node.bounds))return;
   if(node.boxes){for(const item of node.boxes)if(item.index>after&&overlaps(item.bounds))found.push(item.index);return;}
   visit(node.left!);visit(node.right!);
  };
  if(this.root)visit(this.root);found.sort((a,b)=>a-b);return found;
 }
}
