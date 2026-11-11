export type LearningMaskBox={x:number;y:number;width:number;height:number};
/** Partition the viewport outside the union of permitted rectangles. SVG masks
 * only change pixels; these rectangles provide actual pointer hit regions. */
export function learningMaskRegions(width:number,height:number,holes:readonly LearningMaskBox[]):LearningMaskBox[]{
 const clipped=holes.filter(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0).map(b=>({x:Math.max(0,b.x),y:Math.max(0,b.y),right:Math.min(width,b.x+b.width),bottom:Math.min(height,b.y+b.height)})).filter(b=>b.right>b.x&&b.bottom>b.y);
 const xs=[...new Set([0,width,...clipped.flatMap(b=>[b.x,b.right])])].sort((a,b)=>a-b),ys=[...new Set([0,height,...clipped.flatMap(b=>[b.y,b.bottom])])].sort((a,b)=>a-b),out:LearningMaskBox[]=[];
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
  const x=(xs[i]+xs[i+1])/2,y=(ys[j]+ys[j+1])/2;
  if(!clipped.some(b=>x>=b.x&&x<=b.right&&y>=b.y&&y<=b.bottom))out.push({x:xs[i],y:ys[j],width:xs[i+1]-xs[i],height:ys[j+1]-ys[j]});
 }return out;
}
