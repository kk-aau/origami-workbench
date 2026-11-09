import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {Point} from '../core/types';
import {diagramImageCorners,type DiagramImage} from '../app/diagramImages';
import {resizeDiagramImage,translateDiagramImage,type DiagramImageCorner} from './diagramImageGesture';
import './DiagramImageLayer.css';

type ImageDrag={pointer:number;element:SVGGElement;image:DiagramImage;source:DiagramImage[];start:Point;client:Point;corner?:DiagramImageCorner;moved:boolean;draft:DiagramImage};

export default function DiagramImageLayer({images,selectedId,interactive,units,commandToken,point,onSelect,onStart,onChange,onGestureChange}:{
  images:DiagramImage[];selectedId?:string;interactive:boolean;units:number;commandToken:number;
  point:(x:number,y:number)=>Point|null;onSelect:(id:string|null)=>void;onStart:()=>void;
  onChange?:(images:DiagramImage[])=>void;onGestureChange:(moving:boolean)=>void;
}){
  const drag=useRef<ImageDrag|null>(null),[draft,setDraft]=useState<DiagramImage|null>(null);
  const callbacks=useRef({onSelect,onStart,onChange,onGestureChange});callbacks.current={onSelect,onStart,onChange,onGestureChange};
  function finish(commit=false){
    const current=drag.current;drag.current=null;setDraft(null);callbacks.current.onGestureChange(false);
    if(current){
      if(current.element.hasPointerCapture(current.pointer))current.element.releasePointerCapture(current.pointer);
      if(commit&&current.moved&&JSON.stringify(current.image)!==JSON.stringify(current.draft))callbacks.current.onChange?.(current.source.map(image=>image.id===current.image.id?current.draft:image));
    }
  }
  useEffect(()=>{finish();},[interactive,commandToken]);
  useEffect(()=>{if(drag.current&&drag.current.image.id!==selectedId)finish();},[selectedId]);
  useEffect(()=>{const blur=()=>finish();window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[]);
  useEffect(()=>()=>{const current=drag.current;if(current?.element.hasPointerCapture(current.pointer))current.element.releasePointerCapture(current.pointer);},[]);
  function begin(event:ReactPointerEvent<SVGGElement>,image:DiagramImage,corner?:DiagramImageCorner){
    if(!interactive)return;
    if(event.button===2){event.preventDefault();event.stopPropagation();finish();callbacks.current.onSelect(null);return;}
    if(event.button!==0)return;
    const start=point(event.clientX,event.clientY);if(!start)return;
    event.preventDefault();event.stopPropagation();
    callbacks.current.onStart();callbacks.current.onSelect(image.id);
    event.currentTarget.ownerSVGElement?.focus({preventScroll:true});
    if(!callbacks.current.onChange)return;
    drag.current={pointer:event.pointerId,element:event.currentTarget,image:structuredClone(image),source:structuredClone(images),start,client:[event.clientX,event.clientY],corner,moved:false,draft:image};
    callbacks.current.onGestureChange(true);event.currentTarget.setPointerCapture(event.pointerId);
  }
  function update(current:ImageDrag,clientX:number,clientY:number){
    const pointer=point(clientX,clientY);if(!pointer)return;
    if(!current.moved&&Math.hypot(clientX-current.client[0],clientY-current.client[1])<=2)return;
    current.moved=true;
    current.draft=current.corner===undefined?translateDiagramImage(current.image,current.start,pointer):resizeDiagramImage(current.image,current.corner,pointer,units*12);
    setDraft(current.draft);
  }
  function move(event:ReactPointerEvent<SVGGElement>){
    const current=drag.current;if(!current||current.pointer!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    if(!(event.buttons&1)||event.buttons&2){finish();return;}
    update(current,event.clientX,event.clientY);
  }
  const visible=images.map(image=>draft?.id===image.id?draft:image);
  return <g data-diagram-image-layer="true">
    {visible.map(image=>{
      const selected=interactive&&selectedId===image.id,corners=selected?diagramImageCorners(image):[];
      return <g key={image.id} data-diagram-image={image.id} data-diagram-image-selected={selected||undefined} data-diagram-image-source={image.source} data-image-x={image.position[0]} data-image-y={image.position[1]} data-image-width={image.width} data-image-height={image.height}
        pointerEvents={interactive?'all':'none'} onPointerDown={event=>begin(event,image)} onPointerMove={move}
        onPointerUp={event=>{const current=drag.current;if(current?.pointer===event.pointerId){event.preventDefault();event.stopPropagation();if(event.button===0)update(current,event.clientX,event.clientY);finish(event.button===0);}}}
        onPointerCancel={event=>{event.stopPropagation();finish();}} onLostPointerCapture={event=>{if(drag.current?.pointer===event.pointerId)finish();}}
        onDoubleClick={event=>{event.preventDefault();event.stopPropagation();}}
        onContextMenu={event=>{event.preventDefault();event.stopPropagation();finish();callbacks.current.onSelect(null);}}>
        <title>{image.name} · 拖动移动，四角等比缩放</title>
        <image href={image.dataUrl} x={image.position[0]} y={image.position[1]} width={image.width} height={image.height} preserveAspectRatio="none" transform={image.rotation?`rotate(${image.rotation} ${image.position[0]+image.width/2} ${image.position[1]+image.height/2})`:undefined}/>
        {selected&&<g data-diagram-image-selection={image.id}>
          <polygon points={corners.map(corner=>corner.join(',')).join(' ')} fill="none" stroke="#426f59" strokeWidth={units*1.25} strokeDasharray={`${units*5} ${units*3}`} pointerEvents="none"/>
          {corners.map((corner,index)=><g key={index} data-diagram-image-corner={index} className={index%2?'diagram-image-resize-ne':'diagram-image-resize-nw'} aria-label={`图片${['左上','右上','右下','左下'][index]}角等比缩放`} onPointerDown={event=>begin(event,image,index as DiagramImageCorner)}>
            <circle cx={corner[0]} cy={corner[1]} r={units*11} fill="transparent" stroke="none"/>
            <rect x={corner[0]-units*4} y={corner[1]-units*4} width={units*8} height={units*8} fill="#fffefa" stroke="#426f59" strokeWidth={units*1.25} pointerEvents="none"/>
          </g>)}
        </g>}
      </g>;
    })}
  </g>;
}
