import type {SnapPoint} from './snapPoints';

/** A display-only representative per 12 CSS-pixel square. Source points,
 * geometric picking and the complete keyboard list never use this subset. */
export function creaseJunctionPresentation(points:readonly SnapPoint[],view:{x:number;y:number;w:number;h:number},size:{w:number;h:number},required:ReadonlySet<string>):SnapPoint[]{
 const result:SnapPoint[]=[],occupied=new Set<string>();
 const dx=view.w/size.w,dy=view.h/size.h;
 if(!(dx>0&&dy>0&&Number.isFinite(dx)&&Number.isFinite(dy)))return points.filter(point=>required.has(point.id));
 for(const point of points){
  const x=(point.point[0]-view.x)/dx,y=(point.point[1]-view.y)/dy,forced=required.has(point.id);
  if(!forced&&(x< -8||y< -8||x>size.w+8||y>size.h+8))continue;
  const bin=`${Math.floor(x/12)},${Math.floor(y/12)}`;
  if(forced||!occupied.has(bin)){result.push(point);occupied.add(bin);}
 }
 return result;
}
export const CREASE_JUNCTION_PAGE_SIZE=64;
export function creaseJunctionPage(points:readonly SnapPoint[],requested:number){
 const pages=Math.max(1,Math.ceil(points.length/CREASE_JUNCTION_PAGE_SIZE));
 const page=Number.isSafeInteger(requested)?Math.max(0,Math.min(pages-1,requested)):0;
 return {page,pages,points:points.slice(page*CREASE_JUNCTION_PAGE_SIZE,(page+1)*CREASE_JUNCTION_PAGE_SIZE)};
}
