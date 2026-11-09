import type {Point} from '../core/types';
import {transformPoint} from './selectionTransform';

/** Image pixels -> document mm: origin + (x*axis.x-y*axis.y, x*axis.y+y*axis.x).
 * Orientation-preserving similarity, not perspective or independent X/Y stretch.
 */
export interface BackgroundPlacement {origin:Point;axis:Point}
export interface ImageSize {width:number;height:number}
const point=(p:Point)=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6);
function checkPlacement(p:BackgroundPlacement){
  if(!p||!point(p.origin)||!point(p.axis)||Math.hypot(...p.axis)<1e-9)throw new Error('底图位置或缩放无效，不能使用零缩放。');
}
function checkSize(size:ImageSize){
  if(!size||![size.width,size.height].every(n=>Number.isInteger(n)&&n>0&&n<=1e6))throw new Error('底图像素宽高必须是正整数且不超过1000000。');
}
export function backgroundToWorld(placement:BackgroundPlacement,pixel:Point):Point {
  checkPlacement(placement);if(!point(pixel))throw new Error('图片坐标无效。');
  const {origin:o,axis:u}=placement,result:Point=[o[0]+pixel[0]*u[0]-pixel[1]*u[1],o[1]+pixel[0]*u[1]+pixel[1]*u[0]];
  if(!point(result))throw new Error('配准后的底图超出坐标范围（±1000000 mm）。');
  return result;
}
export function worldToBackground(placement:BackgroundPlacement,world:Point):Point {
  checkPlacement(placement);if(!point(world))throw new Error('配准点坐标无效。');
  const {origin:o,axis:u}=placement,x=world[0]-o[0],y=world[1]-o[1],den=u[0]*u[0]+u[1]*u[1];
  const result:Point=[(x*u[0]+y*u[1])/den,(y*u[0]-x*u[1])/den];
  if(!result.every(Number.isFinite))throw new Error('图片反向坐标无法计算。');
  return result;
}
export function backgroundCorners(placement:BackgroundPlacement,size:ImageSize):Point[]{
  checkSize(size);return ([[0,0],[size.width,0],[size.width,size.height],[0,size.height]] as Point[]).map(p=>backgroundToWorld(placement,p));
}
export function fitBackground(size:ImageSize,bounds:{x:number;y:number;width:number;height:number}):BackgroundPlacement {
  checkSize(size);
  if(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)throw new Error('底图放置范围无效。');
  const scale=Math.min(bounds.width/size.width,bounds.height/size.height);
  const placement:BackgroundPlacement={origin:[bounds.x+(bounds.width-size.width*scale)/2,bounds.y+(bounds.height-size.height*scale)/2],axis:[scale,0]};
  backgroundCorners(placement,size);return placement;
}

/** A/B are feature locations in the CURRENT displayed image, C/D their targets.
 * Composes with previous placement; source bytes/dimensions and drawing untouched.
 */
export function registerBackground(placement:BackgroundPlacement,size:ImageSize,a:Point,b:Point,c:Point,d:Point):BackgroundPlacement {
  backgroundCorners(placement,size);
  const transform={kind:'similarity' as const,a,b,c,d};
  const origin=transformPoint(placement.origin,transform);
  const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],den=ux*ux+uy*uy;
  const re=(ux*vx+uy*vy)/den,im=(ux*vy-uy*vx)/den,[x,y]=placement.axis;
  const next:BackgroundPlacement={origin,axis:[re*x-im*y,im*x+re*y]};
  backgroundCorners(next,size);return next;
}
/** SVG matrix(a b c d e f), with one uniform scale and no reflection. */
export function backgroundMatrix(placement:BackgroundPlacement):[number,number,number,number,number,number]{
  checkPlacement(placement);const {origin:o,axis:u}=placement;return[u[0],u[1],-u[1],u[0],o[0],o[1]];
}
