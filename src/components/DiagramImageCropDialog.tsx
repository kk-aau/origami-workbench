import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {cropDiagramImage} from '../app/diagramImageCrop';
import {markDiagramImageCropped,type DiagramImage} from '../app/diagramImages';
import type {PixelRect} from '../core/rasterBounds';
import AppDialog from './AppDialog';

type Point={x:number;y:number};

function rectangle(a:Point,b:Point):PixelRect {
  const x=Math.floor(Math.min(a.x,b.x)),y=Math.floor(Math.min(a.y,b.y));
  return {x,y,width:Math.ceil(Math.max(a.x,b.x))-x,height:Math.ceil(Math.max(a.y,b.y))-y};
}

export default function DiagramImageCropDialog({image,onApply,onClose}:{
  image:DiagramImage;onApply:(result:DiagramImage)=>void;onClose:()=>void;
}){
  const [preview,setPreview]=useState(image),[selection,setSelection]=useState<PixelRect|null>(null),[drag,setDrag]=useState<PixelRect|null>(null);
  const [zoom,setZoom]=useState(1),[fit,setFit]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [panning,setPanning]=useState(false),panStart=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
  const viewport=useRef<HTMLDivElement>(null),gesture=useRef<{id:number;start:Point}|null>(null);
  const job=useRef<AbortController|null>(null);
  useEffect(()=>()=>{job.current?.abort();},[]);
  useLayoutEffect(()=>{
    const view=viewport.current;if(!view)return;
    const measure=()=>setFit(Math.min(view.clientWidth/preview.pixelWidth,view.clientHeight/preview.pixelHeight));
    measure();
    const observer=new ResizeObserver(measure);observer.observe(view);return()=>observer.disconnect();
  },[preview.pixelWidth,preview.pixelHeight]);
  function pixel(event:PointerEvent<HTMLDivElement>):Point{
    const bounds=event.currentTarget.getBoundingClientRect();
    return {
      x:Math.max(0,Math.min(preview.pixelWidth,(event.clientX-bounds.left)*preview.pixelWidth/bounds.width)),
      y:Math.max(0,Math.min(preview.pixelHeight,(event.clientY-bounds.top)*preview.pixelHeight/bounds.height)),
    };
  }
  function startSelection(event:PointerEvent<HTMLDivElement>){
    if(event.button!==0||!event.isPrimary||busy)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    if(panning&&zoom>1&&viewport.current){
      panStart.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.current.scrollLeft,top:viewport.current.scrollTop};
      return;
    }
    gesture.current={id:event.pointerId,start:pixel(event)};setDrag(null);setNotice('');
  }
  function trackSelection(event:PointerEvent<HTMLDivElement>,finish:boolean){
    const pan=panStart.current;
    if(pan?.id===event.pointerId&&viewport.current){
      viewport.current.scrollTo(pan.left+pan.x-event.clientX,pan.top+pan.y-event.clientY);
      if(finish)panStart.current=null;
      return;
    }
    const current=gesture.current;if(!current||event.pointerId!==current.id)return;
    const end=pixel(event),rect=rectangle(current.start,end);
    if(finish){
      if(current.start.x!==end.x&&current.start.y!==end.y)setSelection(rect);
      gesture.current=null;setDrag(null);
    }else setDrag(rect);
  }
  async function crop(region:PixelRect|'background'|null){
    if(job.current)return;
    if(!region){onApply(markDiagramImageCropped(preview));return;}
    const controller=new AbortController();job.current=controller;setBusy(true);setNotice('');
    try{
      const source=region==='background'?image:preview;
      const result=await cropDiagramImage(source,region,controller.signal);
      if(controller.signal.aborted)return;
      if(region==='background'){
        if(result.dataUrl===source.dataUrl){setNotice('没有可自动去除的边缘，可拖框裁切。');return;}
        setPreview(result);setSelection(null);setZoom(1);setPanning(false);
      }else onApply(result);
    }catch(cause){if(!controller.signal.aborted)setNotice(cause instanceof Error?cause.message:String(cause));}
    finally{if(!controller.signal.aborted){job.current=null;setBusy(false);}}
  }
  const rect=drag??selection,scale=fit*zoom;
  return <AppDialog title="裁切图片" size="large" bodyClassName="diagram-crop-body" onClose={onClose}
    footer={<><button onClick={onClose}>取消</button><button className="ui-dialog-primary" disabled={busy} onClick={()=>void crop(selection)}>应用裁切</button></>}>
    <div className="diagram-crop-tools">
      <button type="button" disabled={busy} title="去除透明边或与四角同色的纯色边缘" onClick={()=>void crop('background')}>自动裁边</button>
      {selection&&<button type="button" disabled={busy} onClick={()=>setSelection(null)}>重选整图</button>}
      {zoom>1&&<button type="button" aria-pressed={panning} onClick={()=>setPanning(!panning)}>平移预览</button>}
      <label>预览缩放<input aria-label="裁切预览缩放" type="range" min={1} max={8} step={0.25} value={zoom} onChange={event=>{const value=Number(event.target.value);setZoom(value);if(value===1)setPanning(false);}}/><output>{zoom}×</output></label>
    </div>
    <div ref={viewport} className="diagram-crop-viewport" aria-label="图片裁切预览" tabIndex={0}>
      <div className="diagram-crop-stage">
        <div className="diagram-crop-photo" data-pan={panning&&zoom>1||undefined} style={{width:preview.pixelWidth*scale,height:preview.pixelHeight*scale}} onPointerDown={startSelection}
          onPointerMove={event=>trackSelection(event,false)} onPointerUp={event=>trackSelection(event,true)}
          onLostPointerCapture={()=>{gesture.current=null;panStart.current=null;setDrag(null);}}>
          <img src={preview.dataUrl} alt={preview.name||'待裁切图片'} draggable={false}/>
          {rect&&rect.width>0&&rect.height>0&&<div className="diagram-crop-selection" style={{left:rect.x*scale,top:rect.y*scale,width:rect.width*scale,height:rect.height*scale}}/>}
        </div>
      </div>
    </div>
    <div className="diagram-crop-information" aria-live="polite"><span>{notice||(panning?'拖动图片移动预览，再次点击“平移预览”可框选。':'拖框选择保留区域。放大后可滚动查看细节。')}</span><output>{rect?.width??preview.pixelWidth} × {rect?.height??preview.pixelHeight} px</output></div>
  </AppDialog>;
}
