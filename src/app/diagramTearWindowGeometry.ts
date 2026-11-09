import type {Point} from '../core/types';
import type {DiagramAnnotation,DiagramSymbolAnnotation} from './diagramAnnotations';

/** The same deterministic outline drives the glyph, cutaway mask and picking.
 * Values are local symbol units; world size follows the existing size/100
 * convention and position is always the centre of the viewing window. */
export function diagramTearWindowLocalOutline(radius=30):Point[] {
  if(!Number.isFinite(radius)||radius<=0)throw Error('撕纸透视半径必须为有限正数。');
  return Array.from({length:96},(_,i)=>{
    const angle=i*Math.PI/48,jitter=(((i*73+19)%101)/100-.5)*.018;
    const r=radius*(1+.024*Math.sin(angle*5+.7)+.016*Math.sin(angle*13+1.2)+.009*Math.sin(angle*31)+jitter);
    return [r*Math.cos(angle),r*Math.sin(angle)];
  });
}

function frame(annotation:DiagramSymbolAnnotation){
  if(annotation.symbol!=='tearWindow')throw Error('撕纸透视几何仅适用于撕纸透视符号。');
  const radius=annotation.params?.radius??30,scale=annotation.size/100,angle=annotation.rotation%360*Math.PI/180;
  if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(angle)||annotation.position.some(n=>!Number.isFinite(n)))throw Error('撕纸透视的位置、尺寸或旋转无效。');
  return {radius,scale,cos:Math.cos(angle),sin:Math.sin(angle),sign:annotation.mirrored?-1:1};
}

/** Actual world-coordinate paper window, with the complete annotation frame. */
export function diagramTearWindowOutline(annotation:DiagramSymbolAnnotation):Point[] {
  const f=frame(annotation);
  return diagramTearWindowLocalOutline(f.radius).map(([x,y])=>{
    const dx=x*f.scale*f.sign,dy=y*f.scale;
    return [annotation.position[0]+dx*f.cos-dy*f.sin,annotation.position[1]+dx*f.sin+dy*f.cos];
  });
}

/** Closed world-coordinate M/L/Z path, safe to use directly in an SVG mask. */
export function diagramTearWindowPath(annotation:DiagramSymbolAnnotation):string {
  return diagramTearWindowOutline(annotation).map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+' Z';
}

/** Interior picking uses that exact irregular window, including its boundary,
 * rather than a larger circle or its rectangular bounds. */
export function diagramTearWindowContainsPoint(annotation:DiagramSymbolAnnotation,point:Point):boolean {
  if(point.some(n=>!Number.isFinite(n)))return false;
  const f=frame(annotation),dx=point[0]-annotation.position[0],dy=point[1]-annotation.position[1];
  const p:Point=[(dx*f.cos+dy*f.sin)/f.scale*f.sign,(-dx*f.sin+dy*f.cos)/f.scale],outline=diagramTearWindowLocalOutline(f.radius);
  const epsilon=Math.max(1,f.radius)*Number.EPSILON*64+Math.max(...point.map(Math.abs),...annotation.position.map(Math.abs))*Number.EPSILON*8/f.scale;
  let inside=false;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const a=outline[j],b=outline[i],vx=b[0]-a[0],vy=b[1]-a[1],length=vx*vx+vy*vy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/length)):0;
    if(Math.hypot(p[0]-a[0]-t*vx,p[1]-a[1]-t*vy)<=epsilon)return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

/** Hiding is local to each window. The paper's global visibility and material
 * topology are independent; an empty range deliberately hides nothing. */
export function diagramTearWindowHidesFace(annotations:readonly DiagramAnnotation[],face:number,point:Point):boolean {
  return annotations.some(annotation=>annotation.kind==='symbol'&&annotation.symbol==='tearWindow'&&annotation.cutawayFaces?.includes(face)&&diagramTearWindowContainsPoint(annotation,point));
}
