import {validateBackground,type BackgroundImage} from '../core/backgroundData.mjs';
import {backgroundInView,type BackgroundView} from './backgroundAnchor';
import {backgroundCorners} from './backgroundPlacement';
import {frameWorldBounds,type OperationFrame} from './operationFrame';

export function backgroundCropPlan(bg:BackgroundImage,frame:OperationFrame,view:BackgroundView){
  if(!bg.visible||bg.opacity<=0)throw new Error('请先显示底图，并将不透明度设为大于零。');
  frameWorldBounds(frame,view);
  const left=Math.floor(frame.x),top=Math.floor(frame.y),width=Math.ceil(frame.x+frame.width)-left,height=Math.ceil(frame.y+frame.height)-top;
  if(width>16384||height>16384||width*height>40_000_000)throw new Error('裁剪范围过大，最多4000万像素、单边16384像素。');
  const current=backgroundInView(bg,view),[ax,ay]=current.axis,[ox,oy]=current.origin,u=view.units;
  const placement={origin:[view.x+left*u,view.y+top*u] as [number,number],axis:[u,0] as [number,number]};
  backgroundCorners(placement,{width,height});
  return{width,height,placement,
    clip:{x:frame.x-left,y:frame.y-top,width:frame.width,height:frame.height},
    matrix:[ax/u,ay/u,-ay/u,ax/u,(ox-view.x)/u-left,(oy-view.y)/u-top] as [number,number,number,number,number,number],
    ...(bg.viewport?{viewport:{...view}}:{})};
}

/** Snapshot only the raster, in screen pixels, with original opacity retained
 * as metadata rather than baked a second time into every successive crop.
 */
export async function cropBackground(bg:BackgroundImage,frame:OperationFrame,view:BackgroundView,signal?:AbortSignal):Promise<BackgroundImage>{
  if(signal?.aborted)throw new Error('裁剪已取消。');
  validateBackground(bg);const plan=backgroundCropPlan(bg,frame,view),image=new Image();image.src=bg.dataUrl;
  try{await image.decode();}catch{throw new Error('底图无法解码，未裁剪或替换原图。');}
  if(signal?.aborted)throw new Error('裁剪已取消。');
  const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
  try{
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建裁剪画布，请缩小操作框后重试。');
    ctx.beginPath();ctx.rect(plan.clip.x,plan.clip.y,plan.clip.width,plan.clip.height);ctx.clip();ctx.setTransform(...plan.matrix);
    // Match SVG preserveAspectRatio="xMidYMid meet", including decoder EXIF orientation.
    const scale=Math.min(bg.width/image.naturalWidth,bg.height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    ctx.drawImage(image,(bg.width-w)/2,(bg.height-h)/2,w,h);
    const result:BackgroundImage={name:(bg.name.replace(/\.[^.]+$/,'').slice(0,235)+'-裁剪.png'),dataUrl:canvas.toDataURL('image/png'),width:plan.width,height:plan.height,opacity:bg.opacity,visible:bg.visible,placement:plan.placement,...(plan.viewport?{viewport:plan.viewport}:{})};
    validateBackground(result);return result;
  }finally{canvas.width=0;canvas.height=0;}
}
