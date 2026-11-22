import {useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import {clampDiagramGalleryPlacement,readDiagramPDFGalleryBoxes,type DiagramGalleryBox,type DiagramGalleryPlace,type DiagramGalleryPlacement} from '../app/diagramPDFGallery';
import type {DiagramPDFRect} from '../app/diagramPDFLayout';

type Corner='nw'|'ne'|'sw'|'se';
type Pointer=ReactPointerEvent<SVGSVGElement>;
export interface GalleryPreviewProps {
  selectedGallery?:number|null;
  selectedGalleryPlace?:DiagramGalleryPlace;
  gallerySelection?:number[];
  onGalleryToggle?:(index:number,place:DiagramGalleryPlace)=>void;
  onGallerySelect?:(index:number,place:DiagramGalleryPlace)=>void;
  onGalleryMove?:(index:number,place:DiagramGalleryPlace,layout:DiagramGalleryPlacement)=>void;
  onGalleryBoxes?:(boxes:DiagramGalleryBox[])=>void;
}
const corners:Corner[]=['nw','ne','sw','se'];
function placedBox(start:DiagramPDFRect,dx:number,dy:number,corner:Corner|null,page:{width:number;height:number}):DiagramPDFRect {
  let x=start.x+dx,y=start.y+dy,width=start.width;
  const aspect=start.width/start.height;
  if(corner){
    const east=corner.endsWith('e'),south=corner.startsWith('s');
    const anchorX=east?start.x:start.x+start.width,anchorY=south?start.y:start.y+start.height;
    const delta=((east?dx:-dx)*start.width+(south?dy:-dy)*start.height)/(start.width**2+start.height**2);
    const maxWidth=Math.min(east?page.width-anchorX:anchorX,(south?page.height-anchorY:anchorY)*aspect);
    width=Math.max(1,Math.min(start.width*(1+delta),maxWidth));
    x=east?anchorX:anchorX-width;y=south?anchorY:anchorY-width/aspect;
  }
  const layout=clampDiagramGalleryPlacement({x:x/page.width,y:y/page.height,width:width/page.width},aspect,page);
  return {x:layout.x*page.width,y:layout.y*page.height,width:layout.width*page.width,height:layout.width*page.width/aspect};
}

export function useGalleryPreview(root:RefObject<SVGSVGElement|null>,svg:string|undefined,page:{width:number;height:number},editable:boolean,props:GalleryPreviewProps){
  const {selectedGallery,selectedGalleryPlace,onGallerySelect,onGalleryMove,onGalleryBoxes}=props;
  const [boxes,setBoxes]=useState<DiagramGalleryBox[]>([]),lastBoxes=useRef<DiagramGalleryBox[]|null>(null),outline=useRef<SVGGElement>(null);
  const gesture=useRef<{id:number;start:DOMPoint;startClient:{x:number;y:number};inverse:DOMMatrix;entry:DiagramGalleryBox;graphic:SVGGElement;corner:Corner|null;last:DiagramPDFRect;changed:boolean}|null>(null);
  useLayoutEffect(()=>{
    const next=root.current&&svg?readDiagramPDFGalleryBoxes(root.current):[];
    if(JSON.stringify(next)!==JSON.stringify(lastBoxes.current)){
      lastBoxes.current=next;setBoxes(next);
    }
    onGalleryBoxes?.(lastBoxes.current??next);
  },[svg,root,onGalleryBoxes]);
  const selected=boxes.find(b=>b.index===selectedGallery&&(!selectedGalleryPlace||b.place===selectedGalleryPlace));
  function cancel(){
    const drag=gesture.current;if(!drag)return false;
    gesture.current=null;drag.graphic.removeAttribute('transform');outline.current?.removeAttribute('transform');
    if(root.current?.hasPointerCapture(drag.id))root.current.releasePointerCapture(drag.id);
    return true;
  }
  useLayoutEffect(()=>()=>{cancel();},[svg,editable]);
  function begin(event:Pointer){
    if(!editable||!onGalleryMove||event.button!==0||gesture.current)return false;
    const target=event.target as Element,handle=target.closest<SVGElement>('[data-gallery-corner]');
    const graphic=handle&&selected?root.current?.querySelector<SVGGElement>('[data-gallery-view="'+selected.index+'"][data-gallery-place="'+selected.place+'"]'):target.closest<SVGGElement>('[data-gallery-view]');
    if(!graphic)return false;
    const entry=boxes.find(b=>b.index===Number(graphic.dataset.galleryView)&&b.place===graphic.dataset.galleryPlace);
    const matrix=root.current?.getScreenCTM();if(!entry||!matrix)return false;
    event.preventDefault();event.stopPropagation();
    if((event.shiftKey||event.ctrlKey||event.metaKey)&&props.onGalleryToggle){
      props.onGalleryToggle(entry.index,entry.place);return true;
    }
    const inverse=matrix.inverse(),startClient=new DOMPoint(event.clientX,event.clientY);
    gesture.current={id:event.pointerId,start:startClient.matrixTransform(inverse),startClient,inverse,entry,graphic,corner:handle?handle.dataset.galleryCorner as Corner:null,last:entry.box,changed:false};
    event.currentTarget.setPointerCapture(event.pointerId);
    onGallerySelect?.(entry.index,entry.place);return true;
  }
  function move(event:Pointer){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return false;
    event.preventDefault();
    if(!g.changed&&Math.hypot(event.clientX-g.startClient.x,event.clientY-g.startClient.y)<2)return true;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(g.inverse),base=g.entry.box;
    const next=placedBox(base,point.x-g.start.x,point.y-g.start.y,g.corner,page);
    const transform='translate('+next.x+' '+next.y+') scale('+next.width/base.width+') translate('+(-base.x)+' '+(-base.y)+')';
    g.last=next;g.changed=true;g.graphic.setAttribute('transform',transform);outline.current?.setAttribute('transform',transform);
    return true;
  }
  function finish(event:Pointer){
    const g=gesture.current;if(!g||!move(event))return false;
    cancel();
    if(g.changed){const r=g.last;onGalleryMove?.(g.entry.index,g.entry.place,{x:r.x/page.width,y:r.y/page.height,width:r.width/page.width});}
    return true;
  }
  const handles=editable&&selected&&onGalleryMove? <>
    {boxes.filter(b=>b.place===selectedGalleryPlace&&b.index!==selected.index&&props.gallerySelection?.includes(b.index)).map(b=>
      <rect key={b.index} {...b.box} data-gallery-selection={b.index} fill="none" stroke="#42705b" strokeWidth={1.3} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>)}
    <g ref={outline} data-gallery-selection={selected.index}>
    <rect {...selected.box} fill="none" stroke="#42705b" strokeWidth={1.3} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
    {corners.map(corner=>{
      const x=selected.box.x+(corner.endsWith('e')?selected.box.width:0),y=selected.box.y+(corner.startsWith('s')?selected.box.height:0);
      return <g key={corner} data-gallery-corner={corner} style={{cursor:corner==='nw'||corner==='se'?'nwse-resize':'nesw-resize'}}>
        <title>拖动角点等比缩放</title><rect x={x-7} y={y-7} width={14} height={14} fill="transparent"/>
        <rect x={x-3} y={y-3} width={6} height={6} fill="white" stroke="#42705b" strokeWidth={1.4} vectorEffect="non-scaling-stroke" pointerEvents="none"/>
      </g>;
    })}
  </g></>:null;
  return {begin,move,finish,cancel,handles};
}
