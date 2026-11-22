import {useEffect,useRef,type PointerEvent as ReactPointerEvent} from 'react';
import type {DiagramProject} from '../app/diagramProject';
import {diagramPDFCaptionNumber,diagramPanelNumber,diagramPDFIntroLayout,diagramPDFPanelPlacementKey,diagramPDFPlacedPanelRect,diagramPDFRibbonCaptionRects,type DiagramPDFOptions,type DiagramPDFPlan,type DiagramPDFCell,type DiagramPDFRect} from '../app/diagramPDFLayout';
import {diagramPDFBranchContinuations,diagramPDFRibbonSVG} from '../app/diagramPDFDecoration';
import {diagramPDFDragPreviewPlan} from '../app/diagramPDFPreviewPlan';
type Placement={x:number;y:number;scale:number};
type LiveSheet={index:number;view:SVGSVGElement;originalRibbon:string;captions:DiagramPDFRect[];labels:Element|null;originalLabels:string};
export default function DiagramPDFPanelEditor({project,options,plan,pageIndex,selected,onSelect,onChange}:{
  project:DiagramProject;options:DiagramPDFOptions;plan:DiagramPDFPlan;pageIndex:number;selected:string;
  onSelect:(key:string)=>void;onChange:(key:string,placement:Placement)=>void;
}){
  const root=useRef<SVGGElement>(null),page=plan.pages[pageIndex];
  const panelKey=(cell:DiagramPDFCell)=>diagramPDFPanelPlacementKey(project,cell,options.layoutMode);
  const pageKeys=page.cells.map(panelKey),activeKey=pageKeys.includes(selected)?selected:pageKeys[0];
  const startY=page.kind==='intro'?diagramPDFIntroLayout(plan,options,project.name).stepsY:plan.margin+(page.header??plan.header);
  const footer=page.footer??plan.footer;
  function movePlacement(cell:DiagramPDFCell,placement:Placement,dx:number,dy:number):Placement {
    const base=cell.baseRect??cell;
    const x=(cell.x-base.x-(base.width-cell.width)/2+dx)/plan.width;
    const y=(cell.y-base.y-(base.height-cell.height)/2+dy)/plan.height;
    return {...placement,x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y))};
  }
  const gesture=useRef<{id:number;key:string;cell:DiagramPDFCell;inverse:DOMMatrix;start:DOMPoint;placement:Placement;last:Placement;resize:boolean;transform:string;graphic:Element|null;outline:Element;sheets:LiveSheet[];movingCaptions:DiagramPDFRect[]}|null>(null);
  function restore(){
    const g=gesture.current;if(!g)return;
    g.graphic?.removeAttribute('transform');g.outline.removeAttribute('transform');
    for(const sheet of g.sheets){
      const layer=sheet.view.querySelector('[data-pdf-ribbon-layer]');if(layer)layer.outerHTML=sheet.originalRibbon;
      if(sheet.labels)sheet.labels.innerHTML=sheet.originalLabels;
    }
    gesture.current=null;
  }
  useEffect(()=>()=>restore(),[plan,pageIndex]);
  function begin(event:ReactPointerEvent<SVGGElement>,cell:DiagramPDFCell,resize=false){
    if(event.button!==0||gesture.current)return;const svg=root.current?.ownerSVGElement,matrix=svg?.getScreenCTM();if(!matrix)return;
    event.preventDefault();event.stopPropagation();const key=panelKey(cell),inverse=matrix.inverse(),placement=options.panelPlacements?.[key]??{x:0,y:0,scale:1};
    const visible=svg!.closest('.diagram-pdf-scroll-preview')?.querySelectorAll<SVGSVGElement>('svg[data-pdf-page-index]')??[svg!];
    const sheets:LiveSheet[]=[];
    for(const view of visible){
      const index=Number(view.dataset.pdfPageIndex),sheet=plan.pages[index];
      const layer=view.querySelector('[data-pdf-ribbon-layer]');
      if(!sheet||!layer)continue;
      const fixed=index===pageIndex?{...page,cells:page.cells.filter(other=>other!==cell)}:sheet;
      const labels=view.querySelector('[data-pdf-branch-continuation]')?.parentElement??null;
      sheets.push({index,view,originalRibbon:layer.outerHTML,captions:diagramPDFRibbonCaptionRects(project,options,plan,fixed),labels,originalLabels:labels?.innerHTML??''});
    }
    const movingCaptions=diagramPDFRibbonCaptionRects(project,options,plan,{...page,cells:[cell]});
    gesture.current={id:event.pointerId,key,cell,inverse,start:new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse),placement,last:placement,resize,transform:'',graphic:svg!.querySelector('[data-pdf-step="'+diagramPanelNumber(cell)+'"]'),outline:event.currentTarget.closest('[data-panel-editor]')??event.currentTarget,sheets,movingCaptions};
    event.currentTarget.setPointerCapture(event.pointerId);onSelect(key);
  }
  function move(event:ReactPointerEvent<SVGGElement>){
    const g=gesture.current;if(!g||event.pointerId!==g.id)return;event.preventDefault();event.stopPropagation();
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(g.inverse),dx=p.x-g.start.x,dy=p.y-g.start.y,c=g.cell,base=c.baseRect??c;
    g.last=dx===0&&dy===0?g.placement:g.resize
      ?{...g.placement,scale:Math.max(.3,Math.min(2,g.placement.scale+(dx+dy)/(base.width+base.height)))}
      :movePlacement(c,g.placement,dx,dy);
    const {x,y,width:w,height:h}=diagramPDFPlacedPanelRect(base,g.last,plan,startY,footer);
    const sx=w/c.width,sy=h/c.height;
    g.transform=`translate(${x} ${y}) scale(${sx} ${sy}) translate(${-c.x} ${-c.y})`;
    g.graphic?.setAttribute('transform',g.transform);g.outline.setAttribute('transform',g.transform);
    if(g.sheets.length){
      const livePage={...page,cells:page.cells.map(cell=>cell===c?{...cell,x,y,width:w,height:h}:cell)};
      const livePlan=diagramPDFDragPreviewPlan(plan,options,pageIndex,livePage);
      const movingCaptions=g.movingCaptions.map(rect=>({x:x+(rect.x-c.x)*sx,y:y+(rect.y-c.y)*sy,width:rect.width*sx,height:rect.height*sy}));
      for(const sheet of g.sheets){
        const drawing=livePlan.pages[sheet.index];
        const captions=sheet.index===pageIndex?[...sheet.captions,...movingCaptions]:sheet.captions;
        const layer=sheet.view.querySelector('[data-pdf-ribbon-layer]');
        if(layer)layer.outerHTML=diagramPDFRibbonSVG(options,livePlan,drawing,sheet.index,captions);
        if(sheet.labels)sheet.labels.innerHTML=diagramPDFBranchContinuations(options,livePlan,drawing);
      }
    }
  }
  function finish(event:ReactPointerEvent<SVGGElement>){const g=gesture.current;if(!g||event.pointerId!==g.id)return;move(event);restore();if(event.currentTarget.hasPointerCapture(g.id))event.currentTarget.releasePointerCapture(g.id);if(JSON.stringify(g.last)!==JSON.stringify(g.placement))onChange(g.key,g.last);}
  return <g ref={root} className="diagram-pdf-panel-editor">{page.cells.map(cell=>{
    const key=panelKey(cell),active=key===activeKey;
    return <g key={key} role="button" tabIndex={0} aria-label={'调整第 '+diagramPDFCaptionNumber(cell)+' 步位置'} aria-pressed={active} data-panel-editor={diagramPanelNumber(cell)}
      onPointerDown={event=>begin(event,cell)} onPointerMove={move} onPointerUp={finish} onPointerCancel={restore} onLostPointerCapture={restore}
      onKeyDown={event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();onSelect(key);const p=options.panelPlacements?.[key]??{x:0,y:0,scale:1},n=event.shiftKey?8:1;
        onChange(key,movePlacement(cell,p,event.key==='ArrowLeft'?-n:event.key==='ArrowRight'?n:0,event.key==='ArrowUp'?-n:event.key==='ArrowDown'?n:0));
      }}>
      <title>第 {diagramPDFCaptionNumber(cell)} 步：拖动移动，右下角缩放</title>
      <rect x={cell.x} y={cell.y} width={cell.width} height={cell.height} fill="transparent" stroke={active?'#42705b':'#91a797'} strokeWidth={active?1.5:.7} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>
      {active&&<rect aria-label="缩放所选步骤" x={cell.x+cell.width-7} y={cell.y+cell.height-7} width={8} height={8} fill="#42705b" stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{cursor:'nwse-resize'}} onPointerDown={event=>{event.stopPropagation();begin(event,cell,true);}}/>}
    </g>;
  })}</g>;
}
