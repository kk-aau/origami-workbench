import {viewRotation,type OrbitView} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {SimulationCameraPreset} from './simDisplay';

type V3=readonly [number,number,number];
export const simulationCameraAngles:Record<SimulationCameraPreset,readonly [number,number]>={
  front:[0,0],back:[0,Math.PI],left:[Math.PI/2,Math.PI/2],right:[-Math.PI/2,Math.PI/2],
  // Front-biased oblique view: the bottom is visible and the right is a narrow strip.
  top:[0,Math.PI/2],bottom:[Math.PI,Math.PI/2],isometric:[.175,-.725],
};
/** Opening a viewer and either “立体”/reset button share one camera definition. */
export const DEFAULT_SIMULATION_VIEW:Readonly<OrbitView>={yaw:simulationCameraAngles.isometric[0],pitch:simulationCameraAngles.isometric[1],zoom:.88};
const sides:Array<{preset:SimulationCameraPreset;label:string;normal:V3;corners:V3[]}>=
  [{preset:'front',label:'正面',normal:[0,1,0],corners:[[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]},
   {preset:'back',label:'背面',normal:[0,-1,0],corners:[[1,-1,-1],[-1,-1,-1],[-1,-1,1],[1,-1,1]]},
   {preset:'left',label:'左',normal:[-1,0,0],corners:[[-1,-1,-1],[-1,1,-1],[-1,1,1],[-1,-1,1]]},
   {preset:'right',label:'右',normal:[1,0,0],corners:[[1,1,-1],[1,-1,-1],[1,-1,1],[1,1,1]]},
   {preset:'top',label:'上',normal:[0,0,1],corners:[[-1,1,1],[1,1,1],[1,-1,1],[-1,-1,1]]},
   {preset:'bottom',label:'下',normal:[0,0,-1],corners:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]]}];

/** Uses the exact model camera basis, including its reflection. */
export function simulationViewCubeFaces(view:Pick<OrbitView,'yaw'|'pitch'>){
  const m=viewRotation(view.yaw,view.pitch),dot=(row:number,p:V3)=>m[row*3]*p[0]+m[row*3+1]*p[1]+m[row*3+2]*p[2];
  return sides.map(side=>{
    const points=side.corners.map(p=>[52+dot(0,p)*21,51-dot(1,p)*21] as const),depth=dot(2,side.normal);
    return {...side,points,depth,visible:depth>1e-7,cx:52+dot(0,side.normal)*21,cy:51-dot(1,side.normal)*21};
  }).sort((a,b)=>a.depth-b.depth);
}

export function orbitSimulationView(view:Pick<OrbitView,'yaw'|'pitch'>,dx:number,dy:number){
  return {yaw:view.yaw+dx*.007,pitch:view.pitch+dy*.007};
}

/** Independent UI chrome: never writes material positions or advances the solver. */
export function mountSimulationViewCube(root:HTMLElement,onChoose:(preset:SimulationCameraPreset)=>void,onOrbit:(dx:number,dy:number)=>void,onFinish?:()=>void){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 104 104');svg.setAttribute('aria-label','三维方向方块');
  const groups=new Map<SimulationCameraPreset,{group:SVGGElement;polygon:SVGPolygonElement;text:SVGTextElement}>();
  let moved=false,drag:{id:number;x:number;y:number;startX:number;startY:number}|null=null;
  for(const side of sides){
    const group=document.createElementNS(ns,'g'),polygon=document.createElementNS(ns,'polygon'),text=document.createElementNS(ns,'text'),title=document.createElementNS(ns,'title');
    group.setAttribute('role','button');group.setAttribute('aria-label',`切换到三维${side.label}视角`);group.dataset.preset=side.preset;
    title.textContent=`${side.label} · 点击切换，拖动旋转`;text.textContent=side.label;text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','central');
    group.append(title,polygon,text);svg.append(group);groups.set(side.preset,{group,polygon,text});
    group.addEventListener('click',event=>{event.stopPropagation();if(!moved)onChoose(side.preset);});
    group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onChoose(side.preset);}});
  }
  root.replaceChildren(svg);
  const reset=document.createElement('button');reset.type='button';reset.className='view-cube-reset';reset.textContent='立体';reset.setAttribute('aria-label','方向方块恢复立体视角');reset.addEventListener('click',()=>onChoose('isometric'));root.append(reset);
  root.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target===reset)return;moved=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};
  });
  root.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    if(!moved&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<3)return;
    moved=true;root.setPointerCapture(event.pointerId);onOrbit(event.clientX-drag.x,event.clientY-drag.y);drag.x=event.clientX;drag.y=event.clientY;
  });
  const finish=()=>{if(drag&&moved)onFinish?.();drag=null;};
  root.addEventListener('pointerup',finish);root.addEventListener('pointercancel',finish);root.addEventListener('lostpointercapture',finish);
  return (view:Pick<OrbitView,'yaw'|'pitch'>)=>{
    for(const side of simulationViewCubeFaces(view)){
      const {group,polygon,text}=groups.get(side.preset)!;group.style.display=side.visible?'':'none';group.setAttribute('tabindex',side.visible?'0':'-1');
      polygon.setAttribute('points',side.points.map(p=>p.join(',')).join(' '));text.setAttribute('x',String(side.cx));text.setAttribute('y',String(side.cy));
      polygon.setAttribute('fill',`hsl(142 9% ${83+Math.max(0,side.normal[1])*5+Math.max(0,side.normal[2])*3}%)`);svg.append(group);
    }
    root.dataset.yaw=String(view.yaw);root.dataset.pitch=String(view.pitch);
  };
}
