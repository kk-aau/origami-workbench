import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type KeyboardEvent} from 'react';
import type {Point} from '../core/types';
import type {DiagramPDFOptions,DiagramPDFPage,DiagramPDFPlan,DiagramPDFRect} from '../app/diagramPDFLayout';
import {diagramPDFRibbonSVG,diagramPDFRibbonTracks,diagramPDFRibbonSaveNodes,diagramPDFRibbonPath,type DiagramPDFRibbon,type DiagramPDFRibbonNeighbors,type DiagramPDFRibbonBounds} from '../app/diagramPDFDecoration';

/** Preview-only editing handles. Source changes are committed once when a drag ends. */
export default function DiagramPDFRibbonEditor({options,nodes,plan,ribbon,captionRects,edgeIndex,bounded,neighbors,seamPage,onChange}:{options:DiagramPDFOptions;nodes:Point[];plan:DiagramPDFPlan;ribbon:DiagramPDFRibbon;captionRects:readonly DiagramPDFRect[];edgeIndex?:number;bounded?:DiagramPDFRibbonBounds;neighbors?:DiagramPDFRibbonNeighbors;seamPage?:DiagramPDFPage;onChange:(nodes:Point[])=>void}){
  const group=useRef<SVGGElement>(null),[selected,setSelected]=useState(0);
  const edge=edgeIndex===undefined?undefined:seamPage?.branchEdges?.[edgeIndex];
  const entryHandle=edge?.kind==='incoming'||seamPage?.linearSeams?.incoming;
  const exitHandle=edge?.kind==='outgoing'||seamPage?.linearSeams?.outgoing;
  const gesture=useRef<{id:number;index:number;inverse:DOMMatrix;nodes:Point[];circle:SVGCircleElement}|null>(null);
  const path=diagramPDFRibbonPath(nodes,plan,bounded,neighbors);
  function paint(points:Point[],context?:DiagramPDFRibbonNeighbors){
    const d=diagramPDFRibbonPath(points,plan,bounded,context),svg=group.current?.ownerSVGElement;
    if(svg&&seamPage){
      const index=plan.pages.indexOf(seamPage),track=diagramPDFRibbonTracks(options,plan,seamPage).find(track=>track.edgeIndex===edgeIndex);
      if(track){
        const preview=points===nodes?options:{...options,ribbon:{...ribbon,paths:{...ribbon.paths,[track.key]:diagramPDFRibbonSaveNodes(points,plan,seamPage)}}};
        const adjacent=new Set([index,...(seamPage.branchEdges??[]).filter(edge=>edge.otherPage!==undefined).map(edge=>edge.otherPage!),seamPage.linearSeams?.incoming?.otherPage,seamPage.linearSeams?.outgoing?.otherPage]);
        const views=svg.closest('.diagram-pdf-scroll-preview')?.querySelectorAll<SVGSVGElement>('svg[data-pdf-page-index]')??[svg];
        for(const view of views){
          const sheet=Number(view.dataset.pdfPageIndex),layer=view.querySelector('[data-pdf-ribbon-layer]');
          if(!adjacent.has(sheet)||!layer)continue;
          // Interior knots only change the opposite sheet's gradient phase.
          // Keep its caption-aware arrow placement while refreshing both ends.
          const arrows=Array.from(layer.querySelectorAll('[data-pdf-ribbon-arrows]'),element=>element.getAttribute('d')??'');
          layer.outerHTML=diagramPDFRibbonSVG(preview,plan,plan.pages[sheet],sheet,sheet===index?captionRects:[]);
          if(sheet!==index)view.querySelectorAll('[data-pdf-ribbon-layer] [data-pdf-ribbon-arrows]').forEach((element,i)=>element.setAttribute('d',arrows[i]??''));
        }
      }
    }
    group.current?.querySelector('[data-ribbon-hit]')?.setAttribute('d',d);
    points.forEach(([x,y],index)=>{const circle=group.current?.querySelector('[data-ribbon-node="'+index+'"]');circle?.setAttribute('cx',String(x*plan.width));circle?.setAttribute('cy',String(y*plan.height));});
  }
  function finish(commit=false){
    const current=gesture.current;gesture.current=null;if(!current)return;
    if(current.circle.hasPointerCapture(current.id))current.circle.releasePointerCapture(current.id);
    if(commit)onChange(current.nodes);else paint(nodes,neighbors);
  }
  useEffect(()=>()=>{finish(false);},[nodes]);
  function begin(event:ReactPointerEvent<SVGCircleElement>,index:number){
    if(event.button!==0||gesture.current)return;const matrix=event.currentTarget.ownerSVGElement?.getScreenCTM();if(!matrix)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus();setSelected(index);
    gesture.current={id:event.pointerId,index,inverse:matrix.inverse(),nodes:nodes.map(p=>[...p] as Point),circle:event.currentTarget};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:ReactPointerEvent<SVGCircleElement>){
    const current=gesture.current;if(!current||current.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    const at=new DOMPoint(event.clientX,event.clientY).matrixTransform(current.inverse);
    current.nodes[current.index]=[Math.max(0,Math.min(1,at.x/plan.width)),Math.max(0,Math.min(1,at.y/plan.height))];
    paint(current.nodes);
  }
  function key(event:KeyboardEvent<SVGCircleElement>,index:number){
    if(event.key==='Delete'||event.key==='Backspace'){
      event.preventDefault();event.stopPropagation();if(nodes.length<=2)return;
      onChange(nodes.filter((_,i)=>i!==index));setSelected(Math.max(0,index-1));return;
    }
    const directions:Record<string,Point>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=directions[event.key];
    if(!direction)return;event.preventDefault();event.stopPropagation();
    const step=event.shiftKey?.01:.001;
    onChange(nodes.map((p,i)=>i===index?[Math.max(0,Math.min(1,p[0]+direction[0]*step)),Math.max(0,Math.min(1,p[1]+direction[1]*step))]:p));
  }
  return <g ref={group} data-ribbon-editor="true">
    <path data-ribbon-hit="true" d={path} fill="none" stroke="transparent" strokeWidth={Math.max(12,plan.width*.02)} pointerEvents="stroke" onDoubleClick={event=>{
      event.preventDefault();event.stopPropagation();if(nodes.length>=256)return;
      const matrix=event.currentTarget.ownerSVGElement?.getScreenCTM();if(!matrix)return;
      const at=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()),point:Point=[Math.max(0,Math.min(1,at.x/plan.width)),Math.max(0,Math.min(1,at.y/plan.height))];
      let nearest=0,distance=Infinity;
      for(let i=0;i<nodes.length-1;i++){
        const a=nodes[i],b=nodes[i+1],dx=(b[0]-a[0])*plan.width,dy=(b[1]-a[1])*plan.height;
        const px=(point[0]-a[0])*plan.width,py=(point[1]-a[1])*plan.height,t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(px-dx*t,py-dy*t);
        if(d<distance){distance=d;nearest=i;}
      }
      onChange([...nodes.slice(0,nearest+1),point,...nodes.slice(nearest+1)]);setSelected(nearest+1);
    }}/>
    {nodes.map(([x,y],index)=>{
      if((index===0&&entryHandle)||(index===nodes.length-1&&exitHandle))return null;
      return <circle key={index} data-ribbon-node={index} cx={x*plan.width} cy={y*plan.height} r={6} fill={selected===index?'#25694d':'#ffffff'} stroke={selected===index?'#ffffff':'#25694d'} strokeWidth={2} vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-label={'彩带节点 '+(index+1)} className="diagram-ribbon-node" onFocus={()=>setSelected(index)} onKeyDown={event=>key(event,index)} onPointerDown={event=>begin(event,index)} onPointerMove={move} onPointerUp={event=>{if(gesture.current?.id===event.pointerId){move(event);finish(true);}}} onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>finish(false)}/>;
    })}
  </g>;
}
