import {memo,useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {Point} from '../core/types';
import {frameInkSVG,type DiagramFrameArtwork} from '../app/diagramFrameArtwork';
import {diagramImageCorners,type DiagramImage} from '../app/diagramImages';
import {resizeDiagramImage,translateDiagramImage,type DiagramImageCorner} from './diagramImageGesture';
import './DiagramImageLayer.css';
import type {DiagramLineDefaults} from '../app/diagramLineStyles';

type ImageDrag={pointer:number;element:SVGGElement;image:DiagramImage;source:DiagramImage[];inverse:DOMMatrix;start:Point;client:Point;corner?:DiagramImageCorner;moved:boolean;draft:DiagramImage};

const VectorInk=memo(function VectorInk({frame,lineDefaults}:{frame:DiagramFrameArtwork;lineDefaults?:DiagramLineDefaults}){
  return <g dangerouslySetInnerHTML={{__html:frameInkSVG(frame,lineDefaults)}}/>;
});

export default function DiagramImageLayer({images,lineDefaults,selectedId,interactive,units,commandToken,inBounds,onSelect,onStart,onChange,onGestureChange}:{
  lineDefaults?:DiagramLineDefaults;
  images:DiagramImage[];selectedId?:string;interactive:boolean;units:number;commandToken:number;
  inBounds:(point:Point)=>boolean;onSelect:(id:string|null)=>void;onStart:()=>void;
  onChange?:(images:DiagramImage[])=>void;onGestureChange:(moving:boolean)=>void;
}){
  const drag=useRef<ImageDrag|null>(null),frame=useRef(0),[draft,setDraft]=useState<DiagramImage|null>(null);
  const callbacks=useRef({onSelect,onStart,onChange,onGestureChange});callbacks.current={onSelect,onStart,onChange,onGestureChange};
  function finish(commit=false){
    const current=drag.current;drag.current=null;cancelAnimationFrame(frame.current);frame.current=0;setDraft(null);callbacks.current.onGestureChange(false);
    if(current){
      if(current.element.hasPointerCapture(current.pointer))current.element.releasePointerCapture(current.pointer);
      const before=current.image,after=current.draft;
      if(commit&&current.moved&&current.source===images&&(before.position[0]!==after.position[0]||before.position[1]!==after.position[1]||before.width!==after.width||before.height!==after.height)){
        callbacks.current.onChange?.(images.map(image=>image.id===before.id?after:image));
      }
    }
  }
  useEffect(()=>{finish();},[interactive,commandToken]);
  useEffect(()=>{if(drag.current&&(drag.current.image.id!==selectedId||drag.current.source!==images))finish();},[selectedId,images]);
  useEffect(()=>{const blur=()=>finish();window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[]);
  useEffect(()=>()=>{cancelAnimationFrame(frame.current);const current=drag.current;if(current){callbacks.current.onGestureChange(false);if(current.element.hasPointerCapture(current.pointer))current.element.releasePointerCapture(current.pointer);}},[]);
  function begin(event:ReactPointerEvent<SVGGElement>,image:DiagramImage,corner?:DiagramImageCorner){
    if(!interactive)return;
    if(event.button===2){event.preventDefault();event.stopPropagation();finish();callbacks.current.onSelect(null);return;}
    if(event.button!==0||drag.current)return;
    const matrix=event.currentTarget.getScreenCTM();if(!matrix)return;
    const inverse=matrix.inverse(),local=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse),start:Point=[local.x,local.y];
    if(!inBounds(start))return;
    event.preventDefault();event.stopPropagation();
    callbacks.current.onStart();callbacks.current.onSelect(image.id);
    event.currentTarget.ownerSVGElement?.focus({preventScroll:true});
    if(!callbacks.current.onChange)return;
    drag.current={pointer:event.pointerId,element:event.currentTarget,image,source:images,inverse,start,client:[event.clientX,event.clientY],corner,moved:false,draft:image};
    callbacks.current.onGestureChange(true);event.currentTarget.setPointerCapture(event.pointerId);
  }
  function update(current:ImageDrag,clientX:number,clientY:number){
    const local=new DOMPoint(clientX,clientY).matrixTransform(current.inverse),pointer:Point=[local.x,local.y];
    if(!inBounds(pointer))return;
    if(!current.moved&&Math.hypot(clientX-current.client[0],clientY-current.client[1])<=2)return;
    current.moved=true;
    current.draft=current.corner===undefined?translateDiagramImage(current.image,current.start,pointer):resizeDiagramImage(current.image,current.corner,pointer,units*12);
    if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;if(drag.current===current)setDraft(current.draft);});
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
        {image.artwork?<g transform={`rotate(${image.rotation} ${image.position[0]+image.width/2} ${image.position[1]+image.height/2})`} ><svg x={image.position[0]} y={image.position[1]} width={image.width} height={image.height}
          viewBox={`${image.artwork.box.x} ${image.artwork.box.y} ${image.artwork.box.width} ${image.artwork.box.height}`}
          preserveAspectRatio="none" overflow="hidden" strokeLinejoin="round" strokeLinecap="round"><VectorInk frame={image.artwork} lineDefaults={lineDefaults}/></svg></g>:<image href={image.dataUrl} x={image.position[0]} y={image.position[1]} width={image.width} height={image.height} preserveAspectRatio="none" transform={image.rotation?`rotate(${image.rotation} ${image.position[0]+image.width/2} ${image.position[1]+image.height/2})`:undefined}/>}
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
