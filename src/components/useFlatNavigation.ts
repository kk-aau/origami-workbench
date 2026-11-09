import {useLayoutEffect,useRef,type RefObject} from 'react';
import {flushSync} from 'react-dom';
import type {Point} from '../core/types';

export type FlatNavigationTarget='crease'|'fold';
export type CanvasMarkTarget={kind:'crease';point:Point}|{kind:'fold';id:string;point:Point};
export interface FlatNavigationOptions {activeModelId?:string|null;onMark?:(target:CanvasMarkTarget)=>void}

/** Hit the material itself, including holes, even when its overlay is inert. */
export function findFoldNavigationHit(svg:SVGSVGElement,clientX:number,clientY:number):SVGGeometryElement|null{
  const bounds=svg.getBoundingClientRect();
  if(!bounds.width||!bounds.height||clientX<bounds.left||clientX>bounds.right||clientY<bounds.top||clientY>bounds.bottom)return null;
  const shapes=svg.querySelectorAll<SVGGeometryElement>('[data-face-id],[data-region-status]');
  for(let index=shapes.length-1;index>=0;index--){
    const shape=shapes[index],matrix=shape.getScreenCTM();
    if(!matrix||!shape.getClientRects().length)continue;
    const style=getComputedStyle(shape);
    if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')continue;
    const point=new DOMPoint(clientX,clientY).matrixTransform(matrix.inverse());
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
    if(shape.isPointInFill(point)||(style.stroke!=='none'&&shape.isPointInStroke(point)))return shape;
  }
  return null;
}

/** A middle tap marks a target; a middle drag only pans the hit canvas. */
export function useFlatNavigation(ref:RefObject<HTMLElement|null>,target:FlatNavigationTarget,onTargetChange:(target:FlatNavigationTarget)=>void,options?:FlatNavigationOptions){
  const current=useRef({target,onTargetChange,options});current.current={target,onTargetChange,options};
  const forwarded=useRef(new WeakSet<Event>());
  const binding=useRef<{root:HTMLElement;dispose:()=>void}|null>(null);
  useLayoutEffect(()=>{
    if((binding.current?.root??null)===ref.current)return;
    binding.current?.dispose();binding.current=null;
    const root=ref.current;if(!root)return;
    let gesture:{id:number;x:number;y:number;exceeded:boolean;kind:FlatNavigationTarget;modelId:string;point:Point}|null=null;
    function canvases(event:Event){
      const origin=event.target instanceof Element?event.target:null;
      if(!origin||origin.closest('button,input,select,textarea,summary,a[href],[contenteditable]'))return null;
      const crease=root!.querySelector<SVGSVGElement>('svg.crease-canvas');
      const folded=Array.from(root!.querySelectorAll<SVGSVGElement>('.flat-workspace > svg'));
      // Comparison panes and model boards retain their own independent controls.
      if(!crease||root!.querySelector('.model-board,[aria-label="模型组合工作区"]'))return null;
      const owner=origin.closest('svg');
      if(owner!==crease&&!folded.includes(owner as SVGSVGElement))return null;
      return {crease,folded,owner};
    }
    const pointerDown=(event:PointerEvent)=>{
      if(event.button!==1||forwarded.current.has(event))return;
      const views=canvases(event);if(!views)return;
      // All result SVGs are transparent overlays. Search their painted material
      // from top to bottom, including holes, regardless of pointer-events policy.
      const folded=views.folded.map((svg,index)=>({svg,index,z:Number(getComputedStyle(svg.parentElement!).zIndex)||0})).sort((a,b)=>b.z-a.z||b.index-a.index);
      const fold=folded.find(({svg})=>findFoldNavigationHit(svg,event.clientX,event.clientY))?.svg;
      const kind=fold?'fold':'crease',destination=fold??views.crease,matrix=destination.getScreenCTM();
      if(!matrix)return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
      gesture={id:event.pointerId,x:event.clientX,y:event.clientY,exceeded:false,kind,modelId:fold?.dataset.modelId??'',point:[point.x,point.y]};
      // Do not mark yet: the gesture can still become a pan or be cancelled.
      if(views.owner===destination)return;
      event.preventDefault();event.stopImmediatePropagation();
      // The original pointer is still active, so its id can capture the real
      // subsequent move/up events even though this forwarded down is synthetic.
      const routed=new PointerEvent(event.type,event);
      forwarded.current.add(routed);destination.dispatchEvent(routed);
    };
    const pointerMove=(event:PointerEvent)=>{
      if(!gesture||gesture.id!==event.pointerId)return;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>4)gesture.exceeded=true;
      if(!(event.buttons&4)||(event.buttons&3))gesture=null;
    };
    const pointerUp=(event:PointerEvent)=>{
      const press=gesture;if(!press||press.id!==event.pointerId)return;gesture=null;
      if(event.button!==1||press.exceeded||Math.hypot(event.clientX-press.x,event.clientY-press.y)>4)return;
      // Keep legacy navigation users working; scene users additionally receive
      // the stable model id or a CP-space point for their independent target.
      flushSync(()=>{
        current.current.onTargetChange(press.kind);
        if(press.kind==='crease')current.current.options?.onMark?.({kind:'crease',point:press.point});
        else if(press.modelId)current.current.options?.onMark?.({kind:'fold',id:press.modelId,point:press.point});
      });
    };
    const cancel=()=>{gesture=null;};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel();};
    const wheel=(event:WheelEvent)=>{
      if(forwarded.current.has(event))return;
      const views=canvases(event);if(!views)return;
      const active=current.current.options?.activeModelId;
      const fold=active?views.folded.find(svg=>svg.dataset.modelId===active):views.folded.length===1?views.folded[0]:undefined;
      const destination=current.current.target==='fold'?(fold??views.crease):views.crease;
      if(views.owner===destination)return;
      event.preventDefault();event.stopImmediatePropagation();
      const routed=new WheelEvent(event.type,event);
      forwarded.current.add(routed);destination.dispatchEvent(routed);
    };
    root.addEventListener('pointerdown',pointerDown,{capture:true});
    root.addEventListener('pointermove',pointerMove,{capture:true});
    root.addEventListener('pointerup',pointerUp,{capture:true});
    root.addEventListener('pointercancel',cancel,{capture:true});
    root.addEventListener('lostpointercapture',cancel,{capture:true});
    root.addEventListener('wheel',wheel,{capture:true,passive:false});
    window.addEventListener('keydown',key);window.addEventListener('blur',cancel);
    binding.current={root,dispose:()=>{
      root.removeEventListener('pointerdown',pointerDown,true);
      root.removeEventListener('pointermove',pointerMove,true);
      root.removeEventListener('pointerup',pointerUp,true);
      root.removeEventListener('pointercancel',cancel,true);
      root.removeEventListener('lostpointercapture',cancel,true);
      root.removeEventListener('wheel',wheel,true);
      window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);
    }};
  });
  useLayoutEffect(()=>()=>{binding.current?.dispose();binding.current=null;},[]);
}
