import type {BackgroundImage} from '../core/backgroundData.mjs';
import {backgroundCorners,type BackgroundPlacement} from './backgroundPlacement';

/** Top-left of the canvas in world mm, and mm per CSS pixel (not device pixel). */
export interface BackgroundView {x:number;y:number;units:number}
function checkView(v:BackgroundView,bounded=true){
  if(!v||![v.x,v.y,v.units].every(Number.isFinite)||(bounded&&(Math.abs(v.x)>1e6||Math.abs(v.y)>1e6))||v.units<1e-9||v.units>1e6)throw new Error('底图屏幕参照坐标或比例无效。');
}

/** Convert a stored reference-camera placement to the current drawing camera.
 * Only commits require world-coordinate bounds; a screen-fixed image may be
 * displayed while panning far outside the editable domain.
 */
export function backgroundViewTransform(reference:BackgroundView,current:BackgroundView):{scale:number;x:number;y:number}{
  checkView(reference);checkView(current,false);
  const scale=current.units/reference.units;
  return{scale,x:current.x-reference.x*scale,y:current.y-reference.y*scale};
}
export function backgroundInView(bg:BackgroundImage,current:BackgroundView):BackgroundPlacement{
  checkView(current);
  if(!bg.viewport){backgroundCorners(bg.placement,bg);return bg.placement;}
  const {scale,x,y}=backgroundViewTransform(bg.viewport,current),p=bg.placement;
  const result:BackgroundPlacement={origin:[x+p.origin[0]*scale,y+p.origin[1]*scale],axis:[p.axis[0]*scale,p.axis[1]*scale]};
  backgroundCorners(result,bg);return result;
}

/** Upstream lock=true means follow the drawing, not pin to the screen.
 * Toggle at the current camera without moving any displayed image feature.
 */
export function setBackgroundFollow(bg:BackgroundImage,current:BackgroundView,follow:boolean):BackgroundImage{
  checkView(current);
  if(follow===!bg.viewport)return bg;
  if(!follow){backgroundCorners(bg.placement,bg);return{...bg,viewport:{...current}};}
  const placement=backgroundInView(bg,current),{viewport:_,...rest}=bg;
  return{...rest,placement};
}

/** Mode 26 leaves the image screen-fixed after committing registration. */
export function registeredScreenBackground(bg:BackgroundImage,placement:BackgroundPlacement,current:BackgroundView):BackgroundImage{
  checkView(current);backgroundCorners(placement,bg);
  return{...bg,placement:{origin:[...placement.origin],axis:[...placement.axis]},viewport:{...current}};
}
