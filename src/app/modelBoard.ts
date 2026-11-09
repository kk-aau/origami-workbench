import type {ModelBoardPlacement} from './modelViewState';
export const defaultBoardPlacement=(index:number):ModelBoardPlacement=>({x:(index%2)*376+16,y:Math.min(100000,Math.floor(index/2)*336+16),width:360,height:320,visible:true});
/** Board pixels are presentation only, never folded-vertex coordinates. */
export function transformBoardPlacement(start:ModelBoardPlacement,dx:number,dy:number,resize=false):ModelBoardPlacement{
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return {...start};
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
 return resize?{...start,width:clamp(start.width+dx,240,2000),height:clamp(start.height+dy,240,2000)}:{...start,x:clamp(start.x+dx,0,100000),y:clamp(start.y+dy,0,100000)};
}
