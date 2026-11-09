import {memo,useCallback,useEffect,useId,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import type {DiagramCPState,DiagramStep} from '../app/diagramProject';
import type {DiagramLineDefaults} from '../app/diagramLineStyles';
import type {DiagramZoomRegion} from '../app/diagramZoomGeometry';
import {diagramThumbnailSVG} from '../app/diagramThumbnail';
import {diagramCalloutNamespaceMarkup,diagramCalloutSVGBody} from '../app/diagramCalloutSVG';
import {isDiagramImageAnnotationVisible} from '../app/diagramImages';
import type {DiagramThumbnailCache,DiagramThumbnailSource} from '../app/diagramThumbnailCache';
import {Icon} from './Fields';

export interface DiagramThumbnailProps {
  step:DiagramStep;
  states:readonly DiagramCPState[];
  lineDefaults:DiagramLineDefaults;
  adaptiveLines:boolean;
  zoom?:DiagramZoomRegion|null;
  preparation?:{pending:boolean;message?:string};
  deferred?:'rail'|'overview';
  onVisibility?:(id:string,visible:boolean,surface:'rail'|'overview')=>void;
  imageCache?:DiagramThumbnailCache;
  imageSize?:DiagramThumbnailSource['size'];
  editingSession?:object;
}

/** Keep the lightweight step button available for keyboard navigation, while
 * offscreen illustrations release their SVG tree and skip geometry work. */
export default memo(function DiagramThumbnail(props:DiagramThumbnailProps){
  const {step,deferred,onVisibility}=props,host=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(!deferred||typeof IntersectionObserver==='undefined');
  useEffect(()=>{
    if(!deferred)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);onVisibility?.(step.id,true,deferred);return()=>onVisibility?.(step.id,false,deferred);}
    const element=host.current;if(!element)return;
    const root=element.closest('.diagram-step-rail nav,.diagram-overview');
    const observer=new IntersectionObserver(([entry])=>{setVisible(entry.isIntersecting);onVisibility?.(step.id,entry.isIntersecting,deferred);},{root,rootMargin:'180px 0px'});
    observer.observe(element);
    return()=>{observer.disconnect();onVisibility?.(step.id,false,deferred);};
  },[deferred,step.id,onVisibility]);
  if(!deferred)return <ThumbnailDrawing {...props}/>;
  return <div ref={host} className="diagram-thumbnail-viewport" data-thumbnail-visible={visible}>{visible?props.imageCache&&props.imageSize?<ThumbnailImage {...props} imageCache={props.imageCache} imageSize={props.imageSize}/>:<ThumbnailDrawing {...props}/>:null}</div>;
});

function ThumbnailImage({step,states,lineDefaults,adaptiveLines,zoom,preparation,imageCache,imageSize,editingSession}:DiagramThumbnailProps&{imageCache:DiagramThumbnailCache;imageSize:DiagramThumbnailSource['size']}){
  const subscribe=useCallback((listener:()=>void)=>imageCache.subscribe(step.id,listener),[imageCache,step.id]);
  const getSnapshot=useCallback(()=>imageCache.getSnapshot(step.id),[imageCache,step.id]);
  const snapshot=useSyncExternalStore(subscribe,getSnapshot,getSnapshot),zoomKey=JSON.stringify(zoom??null);
  useEffect(()=>{imageCache.request(step.id,{step,states,lineDefaults,adaptiveLines,zoom,preparation,size:imageSize},editingSession);},
    [imageCache,step,states,lineDefaults,adaptiveLines,zoomKey,preparation?.pending,preparation?.message,imageSize.width,imageSize.height,editingSession]);
  const message=snapshot.message??'正在生成缩略图';
  if(!snapshot.src)return <div className="diagram-thumbnail-empty" role="status" title={message}><Icon name="grid"/><span>{snapshot.status==='error'?'缩略图生成失败':snapshot.status==='preparation'?'层序待确认':'正在生成缩略图'}</span></div>;
  return <div className="diagram-thumbnail-image" aria-busy={snapshot.status==='loading'} data-thumbnail-status={snapshot.status}>
    <img src={snapshot.src} alt="本步骤折图缩略图" draggable={false}/>
    {(snapshot.status==='error'||snapshot.status==='preparation')&&<span className="diagram-thumbnail-image-status" role="status" title={message}>{snapshot.status==='error'?'更新失败':'层序待确认'}</span>}
  </div>;
}

const ThumbnailDrawing=memo(function ThumbnailDrawing({step,states,lineDefaults,adaptiveLines,zoom,preparation}:DiagramThumbnailProps){
  const instanceId=useId();
  const paperVisible=step.paperVisible!==false,annotations=step.annotations??[],shown=paperVisible?annotations:annotations.filter(isDiagramImageAnnotationVisible);
  const empty=!(paperVisible&&(step.pose?.result.geometry.vertices.length||step.simulationSurface))&&!shown.length&&!step.images?.length&&!step.callouts?.length,ready=!preparation&&!empty,zoomKey=JSON.stringify(zoom??null);
  const drawing=useMemo(()=>{
    if(!ready)return null;
    const svg=diagramThumbnailSVG(step,states,{lineDefaults,adaptiveLines,zoom});
    return {viewBox:svg.match(/\bviewBox="([^"]+)"/)![1],artwork:diagramCalloutNamespaceMarkup(diagramCalloutSVGBody(svg),`thumbnail-${instanceId}`)};
  },[ready,step,states,lineDefaults,adaptiveLines,zoomKey,instanceId]);
  if(preparation)return <div className="diagram-thumbnail-empty diagram-thumbnail-preparation" role="status" title={preparation.message}><Icon name="grid"/><span>{preparation.pending?'正在准备折图':'层序待确认'}</span></div>;
  if(!drawing)return <div className="diagram-thumbnail-empty"><Icon name="grid"/><span>等待折图</span></div>;
  return <svg aria-label="本步骤折图缩略图" viewBox={drawing.viewBox}><g dangerouslySetInnerHTML={{__html:drawing.artwork}}/></svg>;
});
