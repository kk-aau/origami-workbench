import {useEffect,useId,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {Point} from '../core/types';
import type {DiagramPose,DiagramCPState} from '../app/diagramProject';
import type {DiagramAnnotation} from '../app/diagramAnnotations';
import type {DiagramImage} from '../app/diagramImages';
import type {DiagramLineDefaults} from '../app/diagramLineStyles';
import {drawingSVG} from '../app/diagramDrawing';
import {defaultCreaseDisplay} from '../app/creaseDisplay';
import {creasePatternSVG} from '../app/creasePatternSVG';
import {DIAGRAM_CALLOUT_MIN_RADIUS,DIAGRAM_CALLOUT_MAX_RADIUS,diagramCalloutLocator,type DiagramCallout,type DiagramCalloutCircle} from '../app/diagramCallouts';
import {diagramCalloutSourceMarkup,diagramCalloutNamespaceMarkup} from '../app/diagramCalloutSVG';
import AppDialog from './AppDialog';
import './DiagramCalloutDialog.css';

export interface DiagramCalloutDialogProps {
  type:'paper'|'cp';pose:DiagramPose|null;annotations:DiagramAnnotation[];images?:readonly DiagramImage[];lineDefaults:DiagramLineDefaults;
  before:DiagramCPState;after:DiagramCPState;mainSVG?:string;
  initialCallout?:DiagramCallout;
  initialSourcePoint?:Point;
  onConfirm:(callout:Omit<DiagramCallout,'id'>)=>void;onClose:()=>void;
}
interface Frame {x:number;y:number;width:number;height:number}
const frameOf=(svg:string):Frame=>{
  const values=svg.match(/\bviewBox\s*=\s*["']([^"']+)["']/)?.[1].trim().split(/[\s,]+/).map(Number);
  return values?.length===4&&values.every(Number.isFinite)&&values[2]>0&&values[3]>0?{x:values[0],y:values[1],width:values[2],height:values[3]}:{x:0,y:0,width:200,height:200};
};
const initialCircle=(frame:Frame):DiagramCalloutCircle=>({center:[frame.x+frame.width/2,frame.y+frame.height/2],radius:Math.max(DIAGRAM_CALLOUT_MIN_RADIUS,Math.min(DIAGRAM_CALLOUT_MAX_RADIUS,Math.min(frame.width,frame.height)*.16))});
const clampRadius=(n:number)=>Math.max(DIAGRAM_CALLOUT_MIN_RADIUS,Math.min(DIAGRAM_CALLOUT_MAX_RADIUS,n));
interface Gesture {id:number;target:SVGElement;inverse:DOMMatrix;start:Point;circle:DiagramCalloutCircle;resize:boolean}

export default function DiagramCalloutDialog({type,pose,annotations,images=[],lineDefaults,before,after,mainSVG,initialCallout,initialSourcePoint,onConfirm,onClose}:DiagramCalloutDialogProps){
  const [sourceState,setSourceState]=useState<'before'|'after'>(()=>initialCallout?.source.kind==='cp'&&initialCallout.source.stateId===after.id?'after':'before'),[magnification,setMagnification]=useState(()=>initialCallout?initialCallout.target.radius/initialCallout.source.radius:2.5),[zoomEdited,setZoomEdited]=useState(false),[error,setError]=useState('');
  const [hideExistingCreases,setHideExistingCreases]=useState(initialCallout?.hideExistingCreases??false);
  const main=useMemo(()=>mainSVG??drawingSVG(pose,annotations,'','',undefined,images,true,lineDefaults),[mainSVG,pose,annotations,images,lineDefaults]);
  const source=sourceState==='before'?before:after;
  const prepared=useMemo(()=>{try{const svg=type==='paper'?main:creasePatternSVG(source.doc,defaultCreaseDisplay(),undefined,undefined,{solidCreases:true,hideExistingCreases});return {frame:frameOf(svg),markup:diagramCalloutSourceMarkup(svg),error:''};}catch(error){return {frame:{x:0,y:0,width:200,height:200},markup:'',error:error instanceof Error?error.message:'来源预览生成失败。'};}},[type,main,source,hideExistingCreases]);
  const [circle,setCircle]=useState<DiagramCalloutCircle>(()=>initialCallout?{center:[...initialCallout.source.center],radius:initialCallout.source.radius}:{...initialCircle(prepared.frame),...(type==='paper'&&initialSourcePoint?{center:initialSourcePoint}:{})});
  const svgRef=useRef<SVGSVGElement>(null),drag=useRef<Gesture|null>(null),clipId='callout-detail-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),frame=prepared.frame;
  const sourceMarkup=useMemo(()=>diagramCalloutNamespaceMarkup(prepared.markup,clipId+'-source'),[prepared.markup,clipId]),detailMarkup=useMemo(()=>diagramCalloutNamespaceMarkup(prepared.markup,clipId+'-detail'),[prepared.markup,clipId]);
  const comparisonPreviews=useMemo(()=>{
    if(type!=='cp')return {items:[],error:''};
    try{return {items:[before,after].map((state,index)=>({label:index===0?'操作前 CP':'操作后 CP',id:`${clipId}-${index}`,markup:diagramCalloutNamespaceMarkup(diagramCalloutSourceMarkup(creasePatternSVG(state.doc,defaultCreaseDisplay(),undefined,undefined,{solidCreases:true,hideExistingCreases})),`${clipId}-comparison-${index}`)})),error:''};}
    catch(error){return {items:[],error:error instanceof Error?error.message:'CP 对照预览生成失败。'};}
  },[type,before,after,clipId,hideExistingCreases]);
  const previewError=prepared.error||comparisonPreviews.error;
  const units=Math.max(frame.width/650,frame.height/480),detailScale=90/circle.radius,shownMagnification=initialCallout&&!zoomEdited?initialCallout.target.radius/circle.radius:magnification;
  function cancel(){const active=drag.current;drag.current=null;if(active){setCircle(active.circle);if(active.target.hasPointerCapture(active.id))active.target.releasePointerCapture(active.id);}}
  useEffect(()=>{setCircle(old=>({...old,center:[Math.max(frame.x,Math.min(frame.x+frame.width,old.center[0])),Math.max(frame.y,Math.min(frame.y+frame.height,old.center[1]))]}));},[frame.x,frame.y,frame.width,frame.height]);
  useEffect(()=>{window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel);const active=drag.current;drag.current=null;if(active?.target.hasPointerCapture(active.id))active.target.releasePointerCapture(active.id);};},[]);
  function local(inverse:DOMMatrix,x:number,y:number):Point{return [inverse.a*x+inverse.c*y+inverse.e,inverse.b*x+inverse.d*y+inverse.f];}
  function begin(event:ReactPointerEvent<SVGElement>,resize=false){
    if(event.button!==0)return;const matrix=svgRef.current?.getScreenCTM();if(!matrix)return;
    event.preventDefault();event.stopPropagation();const inverse=matrix.inverse();drag.current={id:event.pointerId,target:event.currentTarget,inverse,start:local(inverse,event.clientX,event.clientY),circle,resize};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function update(active:Gesture,x:number,y:number){
    const point=local(active.inverse,x,y),old=active.circle;
    const radialDelta=Math.hypot(point[0]-old.center[0],point[1]-old.center[1])-Math.hypot(active.start[0]-old.center[0],active.start[1]-old.center[1]);
    setCircle(active.resize?radialDelta===0?old:{...old,radius:clampRadius(Math.min(Math.hypot(frame.width,frame.height),old.radius+radialDelta))}:{...old,center:[Math.max(frame.x,Math.min(frame.x+frame.width,old.center[0]+(point[0]-active.start[0]))),Math.max(frame.y,Math.min(frame.y+frame.height,old.center[1]+(point[1]-active.start[1])))]});
  }
  function move(event:ReactPointerEvent<SVGElement>){
    const active=drag.current;if(!active||active.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(!(event.buttons&1)||event.buttons&2){cancel();return;}update(active,event.clientX,event.clientY);
  }
  function end(event:ReactPointerEvent<SVGElement>){const active=drag.current;if(!active||active.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(event.button===0)update(active,event.clientX,event.clientY);else{cancel();return;}drag.current=null;if(active.target.hasPointerCapture(active.id))active.target.releasePointerCapture(active.id);}
  function confirm(){
    if(previewError)return;
    try{const mainFrame=frameOf(main),targetRadius=initialCallout&&!zoomEdited?initialCallout.target.radius:clampRadius(circle.radius*magnification),center:Point=initialCallout?[...initialCallout.target.center]:[Math.min(1_000_000,mainFrame.x+mainFrame.width+targetRadius*1.2),Math.max(-1_000_000,Math.min(1_000_000,mainFrame.y+mainFrame.height/2))];
      const mainCircle=initialCircle(mainFrame),locator=initialCallout?diagramCalloutLocator(initialCallout):{...mainCircle,radius:clampRadius(Math.min(mainCircle.radius,targetRadius/2.5)),...(initialSourcePoint?{center:initialSourcePoint}:{})};
      const comparisonRadius=initialCallout?.comparison&&!zoomEdited?initialCallout.comparison.target.radius:targetRadius;
      const comparisonCenter:Point=initialCallout?.comparison?[...initialCallout.comparison.target.center]:[center[0],Math.max(-1_000_000,Math.min(1_000_000,center[1]+targetRadius+comparisonRadius*2.2))];
      onConfirm({source:type==='paper'?{kind:'paper',center:[...circle.center],radius:circle.radius}:{kind:'cp',stateId:before.id,center:[...circle.center],radius:circle.radius,locator:{center:[...locator.center],radius:locator.radius}},target:{center,radius:targetRadius},...(type==='cp'?{hideExistingCreases,comparison:{stateId:after.id,target:{center:comparisonCenter,radius:comparisonRadius}}}:{})});
    }catch(error){setError(error instanceof Error?error.message:'放大框插入失败，请重试。');}
  }
  const pointerEvents={onPointerMove:move,onPointerUp:end,onPointerCancel:cancel,onLostPointerCapture:cancel};
  const preview=(markup:string,id:string,label:string)=><svg viewBox="0 0 200 200" role="img" aria-label={label}><defs><clipPath id={id}><circle cx="100" cy="100" r="90"/></clipPath></defs><circle cx="100" cy="100" r="90" fill="white"/><g clipPath={`url(#${id})`}><g transform={`translate(${100-circle.center[0]*detailScale} ${100-circle.center[1]*detailScale}) scale(${detailScale})`} dangerouslySetInnerHTML={{__html:markup}}/></g><circle cx="100" cy="100" r="90" fill="none" stroke="#293d35" strokeWidth="1.3"/></svg>;
  return <AppDialog title={type==='paper'?'局部放大框':'CP结构放大框'} onClose={onClose} size="large" className="diagram-callout-dialog" bodyClassName="diagram-callout-body" onKeyDown={event=>{if(event.key==='Escape'&&drag.current){event.preventDefault();event.stopPropagation();cancel();}}} onCancel={event=>{if(drag.current){event.preventDefault();cancel();}}} footer={<>
    <span>{type==='cp'?'两个大圆对照同一区域的前后 CP；插入后可分别移动和缩放。':initialCallout?'重新选区会保留大圆的位置；拖蓝点可继续调整。':'插入后可把大圆拖到旁边，拖蓝点调整大小。'}</span><button type="button" onClick={onClose}>取消</button><button type="button" className="is-primary" disabled={!!previewError} onClick={confirm}>{initialCallout?'更新圆框':'插入圆框'}</button>
  </>}>
    <div className="diagram-callout-sourcebar">
      {type==='cp'?<label>选区参考 CP<select aria-label="圆框来源 CP" value={sourceState} onChange={event=>{cancel();setSourceState(event.target.value as 'before'|'after');setError('');}}><option value="before">操作前 CP</option><option value="after">操作后 CP</option></select></label>:<strong>在当前纸面上选择放大区域</strong>}
      {type==='cp'&&<label><input type="checkbox" checked={hideExistingCreases} onChange={e=>setHideExistingCreases(e.target.checked)}/>屏蔽已有折痕</label>}
      <button type="button" className="ui-button" onClick={()=>{cancel();setCircle(initialCircle(frame));}}>重置选区</button>
    </div>
    <div className="diagram-callout-preview-grid">
      <section className="diagram-callout-source"><h3>{type==='paper'?'纸面选区':sourceState==='before'?'操作前 CP 选区':'操作后 CP 选区'}</h3>
        <svg ref={svgRef} data-callout-source-preview viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`} aria-label={type==='paper'?'拖动纸面放大选区':'拖动 CP 结构选区'} onContextMenu={event=>{event.preventDefault();cancel();}}>
          <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="white"/>
          <g pointerEvents="none" dangerouslySetInnerHTML={{__html:sourceMarkup}}/>
          <circle {...pointerEvents} data-callout-selection cx={circle.center[0]} cy={circle.center[1]} r={circle.radius} fill="#2f68c9" fillOpacity=".08" stroke="#293d35" strokeWidth={units*1.6} role="button" tabIndex={0} aria-label="移动圆形选区" style={{cursor:'move'}} onPointerDown={event=>begin(event)} onKeyDown={event=>{
            const direction=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,Point>)[event.key];if(!direction)return;event.preventDefault();event.stopPropagation();const step=units*(event.shiftKey?10:1);setCircle(old=>({...old,center:[Math.max(frame.x,Math.min(frame.x+frame.width,old.center[0]+direction[0]*step)),Math.max(frame.y,Math.min(frame.y+frame.height,old.center[1]+direction[1]*step))]}));
          }}/>
          <circle cx={circle.center[0]+circle.radius} cy={circle.center[1]} r={units*5} fill="#2f68c9" stroke="white" strokeWidth={units*1.5} pointerEvents="none"/>
          <circle {...pointerEvents} data-callout-selection-resize cx={circle.center[0]+circle.radius} cy={circle.center[1]} r={units*10} fill="transparent" role="button" tabIndex={0} aria-label="缩放圆形选区" style={{cursor:'ew-resize'}} onPointerDown={event=>begin(event,true)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();setCircle(old=>({...old,radius:clampRadius(old.radius+(['ArrowRight','ArrowUp'].includes(event.key)?1:-1)*units*(event.shiftKey?10:1))}));}}/>
        </svg>
        <p>{type==='cp'?'圈定同一片 CP 区域，对照操作前后的结构变化。主图小圆只负责标注位置。':'拖动圆内移动选区，拖动蓝点调整范围。'}</p>
      </section>
      <section className="diagram-callout-detail"><h3>{type==='cp'?'同一区域 · 前后对照':'圆框内容预览'}</h3>
        {type==='cp'?<div className="diagram-callout-comparison-previews">{comparisonPreviews.items.map(item=><figure key={item.id}>{preview(item.markup,item.id,`${item.label} 选区放大预览`)}<figcaption>{item.label}</figcaption></figure>)}</div>:preview(detailMarkup,clipId,'选区放大预览')}
        <label>选区半径<input aria-label="圆框选区半径" type="number" min={DIAGRAM_CALLOUT_MIN_RADIUS} max={DIAGRAM_CALLOUT_MAX_RADIUS} step="0.5" value={Number(circle.radius.toFixed(3))} onChange={event=>{const n=Number(event.target.value);if(Number.isFinite(n))setCircle(old=>({...old,radius:clampRadius(n)}));}}/></label>
        <label>放大倍数<div className="diagram-callout-magnification"><input aria-label="圆框放大倍数" type="number" min="0.01" max="1000000" step="0.5" value={Number(shownMagnification.toFixed(3))} onChange={event=>{const n=Number(event.target.value);if(Number.isFinite(n)){setMagnification(Math.max(.01,Math.min(1_000_000,n)));setZoomEdited(true);}}}/><span>倍</span></div></label>
      </section>
    </div>
    {(previewError||error)&&<p className="diagram-callout-error" role="alert">{previewError||error}</p>}
  </AppDialog>;
}
