import type {XY,TessGraph} from './tessellation';

export interface PaperPreviewRecipe {
  originalVertices:number;
  outlineVertices:number;
  shape:'square'|'rectangle'|'regular';
  aspect:number;
  sides:number;
  margin:number;
}

const cross=(a:XY,b:XY):number=>a[0]*b[1]-a[1]*b[0];

export function paperPreviewPolygon(coords:XY[],recipe:PaperPreviewRecipe):XY[]|null {
  if(!coords.length||coords.some(p=>!p.every(Number.isFinite))||!Number.isFinite(recipe.margin)||recipe.margin<.02||recipe.margin>1)return null;
  const minX=Math.min(...coords.map(p=>p[0])),maxX=Math.max(...coords.map(p=>p[0]));
  const minY=Math.min(...coords.map(p=>p[1])),maxY=Math.max(...coords.map(p=>p[1]));
  const center:XY=[(minX+maxX)/2,(minY+maxY)/2];
  const padding=Math.max(maxX-minX,maxY-minY,1e-6)*recipe.margin;
  if(recipe.shape==='square'||recipe.shape==='rectangle'){
    const aspect=recipe.shape==='square'?1:recipe.aspect;
    if(!Number.isFinite(aspect)||aspect<.2||aspect>5)return null;
    const height=Math.max(maxY-minY+2*padding,(maxX-minX+2*padding)/aspect),width=aspect*height;
    return [[center[0]-width/2,center[1]-height/2],[center[0]+width/2,center[1]-height/2],
      [center[0]+width/2,center[1]+height/2],[center[0]-width/2,center[1]+height/2]];
  }
  if(recipe.shape!=='regular'||!Number.isInteger(recipe.sides)||recipe.sides<3||recipe.sides>12)return null;
  const unit:XY[]=Array.from({length:recipe.sides},(_,i)=>{
    const angle=-Math.PI/2+2*Math.PI*i/recipe.sides;return [Math.cos(angle),Math.sin(angle)];
  });
  const apothem=Math.cos(Math.PI/recipe.sides);
  let radius=0;
  unit.forEach((a,i)=>{
    const b=unit[(i+1)%unit.length],edge:XY=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...edge);
    const normal:XY=[edge[1]/length,-edge[0]/length];
    for(const p of coords)radius=Math.max(radius,((p[0]-center[0])*normal[0]+(p[1]-center[1])*normal[1]+padding)/apothem);
  });
  return unit.map(([x,y])=>[center[0]+radius*x,center[1]+radius*y]);
}

function rayHit(point:XY,direction:XY,outline:XY[]):{point:XY;side:number;u:number}|null {
  let best:{point:XY;side:number;u:number;t:number}|null=null;
  outline.forEach((a,side)=>{
    const b=outline[(side+1)%outline.length],edge:XY=[b[0]-a[0],b[1]-a[1]],offset:XY=[a[0]-point[0],a[1]-point[1]];
    const determinant=cross(direction,edge);if(Math.abs(determinant)<1e-12)return;
    const t=cross(offset,edge)/determinant,u=cross(offset,direction)/determinant;
    if(t<=1e-8||u< -1e-8||u>1+1e-8||best&&t>=best.t)return;
    best={point:[point[0]+t*direction[0],point[1]+t*direction[1]],side,u:Math.max(0,Math.min(1,u)),t};
  });
  return best;
}

function sideOf(point:XY,outline:XY[]):number|null {
  const span=Math.max(...outline.flatMap(p=>p.map(Math.abs)),1),epsilon=span*1e-7;
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],edge:XY=[b[0]-a[0],b[1]-a[1]],delta:XY=[point[0]-a[0],point[1]-a[1]];
    const length=Math.hypot(...edge),u=(delta[0]*edge[0]+delta[1]*edge[1])/(length*length);
    if(Math.abs(cross(edge,delta))/length<=epsilon&&u>1e-7&&u<1-1e-7)return i;
  }
  return null;
}

/** Recompute outer-paper ray hits only while their side and order stay unchanged. */
export function previewEnvelopeCoordinates(fold:TessGraph,originalCoords:XY[],recipe:PaperPreviewRecipe):XY[]|null {
  const n=recipe.originalVertices,k=recipe.outlineVertices;
  if(!Number.isInteger(n)||!Number.isInteger(k)||n!==originalCoords.length||k<3||fold.vertices_coords.length<n+k)return null;
  const outline=paperPreviewPolygon(originalCoords,recipe);
  if(!outline||outline.length!==k)return null;
  const originalOutline=fold.vertices_coords.slice(n,n+k),coords:XY[]=[...originalCoords,...outline];
  const before=new Map<number,{neighbor:number;assignment:string}[]>();
  fold.edges_vertices.forEach(([a,b],i)=>{
    if(a>=n||b>=n||!['M','V'].includes(fold.edges_assignment[i]))return;
    before.set(a,[...(before.get(a)??[]),{neighbor:b,assignment:fold.edges_assignment[i]}]);
    before.set(b,[...(before.get(b)??[]),{neighbor:a,assignment:fold.edges_assignment[i]}]);
  });
  const oldHits=new Map<number,number[]>(),newHits=new Map<number,number[]>();
  for(let i=0;i<fold.edges_vertices.length;i++){
    const [a,b]=fold.edges_vertices[i],assignment=fold.edges_assignment[i];
    if(!['M','V'].includes(assignment))continue;
    const boundary=a<n&&b>=n?a:b<n&&a>=n?b:null,target=boundary===a?b:a;
    if(boundary===null||target>=fold.vertices_coords.length)continue;
    const matching=(before.get(boundary)??[]).filter(item=>item.assignment===assignment);
    if(matching.length!==1)return null;
    const vertex=originalCoords[boundary],inner=originalCoords[matching[0].neighbor];
    const direction:XY=[vertex[0]-inner[0],vertex[1]-inner[1]],length=Math.hypot(...direction);
    if(length<1e-9)return null;
    const hit=rayHit(vertex,[direction[0]/length,direction[1]/length],outline);
    if(!hit)return null;
    if(target<n+k){
      const corner=target-n;
      if(!((hit.side===corner&&hit.u<1e-7)||((hit.side+1)%k===corner&&hit.u>1-1e-7)))return null;
    }else{
      const side=sideOf(fold.vertices_coords[target],originalOutline);
      if(side===null||side!==hit.side||hit.u<=1e-7||hit.u>=1-1e-7)return null;
      coords[target]=hit.point;
      oldHits.set(side,[...(oldHits.get(side)??[]),target]);
      newHits.set(side,[...(newHits.get(side)??[]),target]);
    }
  }
  if(coords.length!==fold.vertices_coords.length||coords.some(p=>!p||!p.every(Number.isFinite)))return null;
  for(const [side,ids] of oldHits){
    const a=originalOutline[side],b=originalOutline[(side+1)%k],edge:XY=[b[0]-a[0],b[1]-a[1]],length2=edge[0]**2+edge[1]**2;
    const oldOrder=[...ids].sort((i,j)=>((fold.vertices_coords[i][0]-a[0])*edge[0]+(fold.vertices_coords[i][1]-a[1])*edge[1])-((fold.vertices_coords[j][0]-a[0])*edge[0]+(fold.vertices_coords[j][1]-a[1])*edge[1]));
    const na=outline[side],nb=outline[(side+1)%k],ne:XY=[nb[0]-na[0],nb[1]-na[1]],nl2=ne[0]**2+ne[1]**2;
    if(length2===0||nl2===0)return null;
    const newOrder=[...(newHits.get(side)??[])].sort((i,j)=>((coords[i][0]-na[0])*ne[0]+(coords[i][1]-na[1])*ne[1])-((coords[j][0]-na[0])*ne[0]+(coords[j][1]-na[1])*ne[1]));
    if(oldOrder.some((id,i)=>id!==newOrder[i]))return null;
  }
  return coords;
}
