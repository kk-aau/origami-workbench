import {captionTextWidth,diagramPDFIntroLayout,type DiagramPDFOptions,type DiagramPDFPlan} from './diagramPDFLayout';
import {galleryPlacementFits,type DiagramGalleryBox,type DiagramGalleryPlace,type DiagramGalleryPlacement} from './diagramPDFGallery';

export type GalleryArrangement='start'|'center'|'end'|'distribute'|'page-center';
export type GalleryArrangementAxis='x'|'y'|'both';
export function arrangeDiagramGallery(options:DiagramPDFOptions,plan:DiagramPDFPlan,pageIndex:number,projectName:string,
  boxes:readonly DiagramGalleryBox[],place:DiagramGalleryPlace,selection:readonly number[],direction:GalleryArrangementAxis,action:GalleryArrangement){
  const items=options.gallery??[],page=plan.pages[pageIndex];
  const visible=boxes.filter(entry=>entry.place===place&&items[entry.index]?.[place]);
  const rows=visible.filter(entry=>selection.includes(entry.index));
  const centeringPage=action==='page-center';
  if(rows.length<(centeringPage?1:action==='distribute'?3:2))return items;
  const axis=direction==='y'?'y':'x';
  const size=axis==='x'?'width':'height';
  rows.sort((a,b)=>a.box[axis]-b.box[axis]||a.index-b.index);
  const first=Math.min(...rows.map(({box})=>box[axis])),last=Math.max(...rows.map(({box})=>box[axis]+box[size]));
  const gap=action==='distribute'?(last-first-rows.reduce((sum,{box})=>sum+box[size],0))/(rows.length-1):0;
  function pageOffset(coord:'x'|'y',extent:'width'|'height'){
    if(!centeringPage||(direction!==coord&&direction!=='both'))return 0;
    const low=Math.min(...rows.map(({box})=>box[coord]));
    const high=Math.max(...rows.map(({box})=>box[coord]+box[extent]));
    return (plan[extent]-low-high)/2;
  }
  const dx=pageOffset('x','width'),dy=pageOffset('y','height');
  const pageBounds={x:0,y:0,width:plan.width,height:plan.height};
  let bounds=pageBounds;
  const mixed=place==='result'&&page.cells.length>0;
  const occupied=mixed?[...page.cells,...visible.filter(row=>!selection.includes(row.index)&&!items[row.index].layout?.result)
    .map(row=>({...row.box,height:row.box.height+(row.captionHeight??0)}))]:[];
  if(mixed){
    const header=page.header??plan.header,footer=page.footer??plan.footer;
    const top=page.kind==='intro'?diagramPDFIntroLayout({...plan,header,footer},options,projectName).stepsY:plan.margin+header;
    bounds={x:plan.margin,y:top,width:plan.width-2*plan.margin,height:plan.height-plan.margin-footer-top};
  }
  let cursor=first;
  const changes=new Map<number,DiagramGalleryPlacement>();
  for(const {box,index} of rows){
    const pos=action==='distribute'?cursor:action==='start'?first:action==='end'?last-box[size]:(first+last-box[size])/2;
    const next=centeringPage?{...box,x:box.x+dx,y:box.y+dy}:{...box,[axis]:pos};
    const label=items[index].caption.trim();
    const captionHeight=mixed&&label?1.6*Math.min(10,box.width/Math.max(1,captionTextWidth(label,1))):0;
    if(!galleryPlacementFits(next,captionHeight,bounds,occupied)){
      throw Error(mixed?'目标位置会越过成品区或遮挡步骤、图注或其他自动排版的成品图。请调整选图或位置。':'所选成品图在这一方向的可用空间不足。');
    }
    changes.set(index,{x:next.x/plan.width,y:next.y/plan.height,width:next.width/plan.width});
    cursor+=box[size]+gap;
  }
  return items.map((item,index)=>changes.has(index)?{...item,layout:{...item.layout,[place]:changes.get(index)!}}:item);
}
