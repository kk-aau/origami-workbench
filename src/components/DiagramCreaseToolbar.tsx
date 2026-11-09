import {useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import type {Point} from '../core/types';
import {diagramCreaseToolbarPosition,type DiagramCreaseToolbarPosition} from '../app/diagramCreaseToolbar';
import './DiagramCreaseToolbar.css';

interface Props {
  svg:RefObject<SVGSVGElement|null>;scene:RefObject<SVGGElement|null>;
  points:Point[];viewKey:string;children:ReactNode;
}

/** HTML controls stay upright while the SVG paper can be rotated, panned and resized. */
export default function DiagramCreaseToolbar({svg,scene,points,viewKey,children}:Props){
  const element=useRef<HTMLDivElement>(null),[position,setPosition]=useState<DiagramCreaseToolbarPosition|null>(null);
  useLayoutEffect(()=>{
    const toolbar=element.current,canvas=svg.current;if(!toolbar||!canvas)return;
    const update=()=>{
      const matrix=scene.current?.getScreenCTM(),parent=toolbar.offsetParent;
      if(!matrix||!(parent instanceof HTMLElement)){setPosition(null);return;}
      const surface=parent.getBoundingClientRect(),canvasBox=canvas.getBoundingClientRect();
      // Absolute offsets start inside the positioned parent's border box.
      const originX=surface.left+parent.clientLeft,originY=surface.top+parent.clientTop;
      const screenPoints=points.map(([x,y]):Point=>{const p=new DOMPoint(x,y).matrixTransform(matrix);return [p.x-originX,p.y-originY];});
      const next=diagramCreaseToolbarPosition(screenPoints,{x:canvasBox.left-originX,y:canvasBox.top-originY,width:canvasBox.width,height:canvasBox.height},{width:toolbar.offsetWidth,height:toolbar.offsetHeight});
      setPosition(previous=>previous?.left===next?.left&&previous?.top===next?.top&&previous?.side===next?.side&&previous?.anchor[0]===next?.anchor[0]&&previous?.anchor[1]===next?.anchor[1]?previous:next);
    };
    update();
    const observer=new ResizeObserver(update);observer.observe(canvas);observer.observe(toolbar);
    if(toolbar.offsetParent instanceof HTMLElement)observer.observe(toolbar.offsetParent);
    window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[svg,scene,points,viewKey,children]);
  return <div ref={element} className="diagram-crease-toolbar" data-diagram-crease-toolbar="true" data-diagram-toolbar-side={position?.side} data-diagram-toolbar-fallback={!points.length||undefined} role="group" aria-label="选中折痕操作" style={{left:position?.left??0,top:position?.top??0,visibility:position?'visible':'hidden'}} onPointerDown={event=>{if(event.button===0)event.stopPropagation();}} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
    {children}
  </div>;
}
