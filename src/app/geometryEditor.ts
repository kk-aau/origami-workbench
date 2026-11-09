import type {XY} from './tessellation';

export type GeometryFrame={origin:XY;unit:number};
export type GeometryView={center:XY;span:number};
export function geometryFrame(points:XY[]):GeometryFrame{
 if(!points.length)return {origin:[0,0],unit:1};
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const origin:XY=[Math.min(...xs),Math.min(...ys)];
 return {origin,unit:Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))||1};
}
export function geometryDisplay(p:XY,frame:GeometryFrame,invertY=false):XY{
 return [(p[0]-frame.origin[0])/frame.unit,(invertY?-1:1)*(p[1]-frame.origin[1])/frame.unit];
}
export function geometrySource(p:XY,frame:GeometryFrame,invertY=false):XY{
 return [frame.origin[0]+p[0]*frame.unit,frame.origin[1]+(invertY?-1:1)*p[1]*frame.unit];
}
export function fitGeometryView(points:XY[],frame:GeometryFrame,aspect:number,invertY=false):GeometryView{
 const p=points.length?points.map(q=>geometryDisplay(q,frame,invertY)):[[0,0],[1,1]];
 const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
 return {center:[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2],span:Math.max((hi[0]-lo[0])/Math.max(aspect,.01),hi[1]-lo[1],.05)*1.32};
}
export function geometryTickStep(span:number):number{
 if(!Number.isFinite(span)||span<=0)return 1;
 const target=Math.max(Number.MIN_VALUE,span/8),power=Math.max(Number.MIN_VALUE,10**Math.floor(Math.log10(target))),fraction=target/power;
 return (fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power;
}
export function geometryTicks(low:number,high:number,step:number):number[]{
 if(!Number.isFinite(low)||!Number.isFinite(high)||!Number.isFinite(step)||step<=0)return [];
 const start=Math.ceil(low/step),end=Math.floor(high/step);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end-start>100)return [];
 // Keep source coordinates at double precision. Rounding here merges nearby
 // grid lines when a small viewport is translated far from the origin.
 const ticks=Array.from({length:Math.max(0,end-start+1)},(_,i)=>(start+i)*step);
 return ticks.filter((value,i)=>!i||value>ticks[i-1]);
}
export function geometryNumber(value:number,step:number):string{
 if(!Number.isFinite(value))return '—';
 const spacing=Number.isFinite(step)&&step>0?step:1;
 if(value===0||Math.abs(value)<spacing*1e-8)return '0';
 if(Math.abs(value)>=1e6||Math.abs(value)<1e-4){
  const digits=Math.max(4,Math.min(17,Math.ceil(Math.log10(Math.abs(value)/spacing))+2));
  return Number(value.toPrecision(digits)).toString();
 }
 return Number(value.toFixed(Math.max(0,Math.min(100,1-Math.floor(Math.log10(spacing)))))).toString();
}
/** Use the effective scale after clamping, so zoom limits do not move the anchor. */
export function zoomGeometryView(view:GeometryView,factor:number,anchor:XY=view.center):GeometryView{
 if(!Number.isFinite(factor)||factor<=0)return view;
 const span=Math.max(1e-9,Math.min(1e9,view.span*factor)),scale=span/view.span;
 if(span===view.span)return view;
 return {center:[anchor[0]+(view.center[0]-anchor[0])*scale,anchor[1]+(view.center[1]-anchor[1])*scale],span};
}
export function snapGeometryPoint(point:XY,options:{step:number;grid:boolean;vertices:XY[];radius:number;min:number;max:number}):XY{
 const {step,grid,vertices,radius,min,max}=options;
 let next:XY=[...point],best=radius;
 for(const candidate of vertices){const d=Math.hypot(candidate[0]-point[0],candidate[1]-point[1]);if(d<best){best=d;next=[...candidate];}}
 if(best===radius&&grid&&Number.isFinite(step)&&step>0)next=point.map(value=>Number.isFinite(value/step)?Math.round(value/step)*step:value) as XY;
 return next.map(n=>Math.max(min,Math.min(max,n))) as XY;
}
/** Insert on the closest ordered edge, preserving the source vertex order. */
export function geometryInsertIndex(points:XY[],value:XY,closed=false):number{
 let nearest=Infinity,index=points.length;
 for(let a=0;a<points.length-(closed?0:1);a++){
  const b=(a+1)%points.length,p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],d=dx*dx+dy*dy;
  const along=d?((value[0]-p[0])*dx+(value[1]-p[1])*dy)/d:0;
  const t=Math.max(0,Math.min(1,along));
  const distance=Math.hypot(value[0]-p[0]-t*dx,value[1]-p[1]-t*dy);
  if(distance<nearest){nearest=distance;index=!closed&&a===0&&along<0?0:!closed&&a===points.length-2&&along>1?points.length:a+1;}
 }
 return index;
}
