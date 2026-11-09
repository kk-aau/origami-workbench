export interface CommandBox {x:number;y:number;width:number;height:number}
export interface CommandPosition {x:number;y:number}

/** Keep the command bar reachable after a resize and clear of existing canvas controls. */
export function floatingCommandPosition(
  bounds:{width:number;height:number},size:{width:number;height:number},
  desired:CommandPosition|null,obstacles:readonly CommandBox[]=[],
):CommandPosition {
  const margin=8,gap=8;
  const maxX=Math.max(0,bounds.width-size.width-margin),maxY=Math.max(0,bounds.height-size.height-margin);
  const minX=Math.min(margin,maxX),minY=Math.min(margin,maxY);
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
  const target={x:clamp(desired?.x??16,minX,maxX),y:clamp(desired?.y??bounds.height-size.height-20,minY,maxY)};
  const visible=obstacles.filter(box=>box.width>0&&box.height>0&&box.x<bounds.width&&box.y<bounds.height&&box.x+box.width>0&&box.y+box.height>0);
  const overlap=(p:CommandPosition)=>visible.reduce((total,box)=>total+
    Math.max(0,Math.min(p.x+size.width,box.x+box.width+gap)-Math.max(p.x,box.x-gap))*
    Math.max(0,Math.min(p.y+size.height,box.y+box.height+gap)-Math.max(p.y,box.y-gap)),0);
  if(!overlap(target))return target;
  const xs=[target.x,minX,maxX,...visible.flatMap(box=>[box.x-size.width-gap,box.x+box.width+gap])].map(x=>clamp(x,minX,maxX));
  const ys=[target.y,minY,maxY,...visible.flatMap(box=>[box.y-size.height-gap,box.y+box.height+gap])].map(y=>clamp(y,minY,maxY));
  let best=target,bestOverlap=overlap(target),bestDistance=Infinity;
  for(const x of xs)for(const y of ys){
    const point={x,y},area=overlap(point),distance=(x-target.x)**2+(y-target.y)**2;
    if(area<bestOverlap||area===bestOverlap&&distance<bestDistance){best=point;bestOverlap=area;bestDistance=distance;}
  }
  return best;
}
