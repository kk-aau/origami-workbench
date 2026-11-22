import {diagramPDFBackgroundSVG,diagramPDFBranchContinuations,diagramPDFRibbonSVG} from './diagramPDFDecoration';
import {galleryGrid,galleryRows,galleryStep,galleryImageBox,galleryPlacementFits,type DiagramGalleryPlace} from './diagramPDFGallery';
import type {DiagramProject} from './diagramProject';
import {diagramPDFCoverFrame,diagramPDFCoverSVG,pdfCPArtwork} from './diagramPDF';
import {alignedTextX,diagramPDFCoverArtworkRects,diagramPanelNumber,resolveDiagramPanel,diagramPDFStepLabel,diagramPDFIntroLayout,diagramPDFIntroText,diagramPDFCellContent,diagramPDFFooterLayout,diagramPDFReadingGuides,diagramPDFPageBands,fitDiagramPDFCoverText,type DiagramPDFOptions,type DiagramPDFRect,type DiagramPDFPlan} from './diagramPDFLayout';
import type {DiagramLineDefaults} from './diagramLineStyles';
import {diagramExportPagePanels,diagramExportPanelArtwork} from './diagramExportPanel';
import {diagramPanelRoute} from './diagramPDFBranchPanels';
import {captionTextWidth,diagramPDFCoverMetadata,diagramPDFRibbonCaptionRects} from './diagramPDFLayout';
import {pdfArtworkReader,type PDFArtworkReader} from './diagramPDFArtworkCache';

const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const INK='#293d35',MUTED='#617367';
/** Keep each diagram's definition namespace private when many SVG panels share
 * one PDF page (cutaways, grid patterns and zoom clips often reuse local IDs). */
export function embedDiagramPDFSVG(svg:string,box:DiagramPDFRect,prefix:string):string {
  const ids=new Map<string,string>();
  svg=svg.replace(/\sid="([^"]+)"/g,(_,id:string)=>{const next=prefix+id;ids.set(id,next);return ` id="${next}"`;});
  svg=svg.replace(/url\(#([^)]+)\)/g,(_,id:string)=>`url(#${ids.get(id)??id})`).replace(/\b(href|xlink:href)="#([^"]+)"/g,(_,attr:string,id:string)=>`${attr}="#${ids.get(id)??id}"`);
  return svg.replace(/<svg\b([^>]*)>/,(_,attributes:string)=>`<svg${attributes.replace(/\s(?:x|y|width|height|preserveAspectRatio)="[^"]*"/g,'')} x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="xMidYMid meet">`);
}

/** Pure vector page composition; both the preview and native converter consume
 * this exact markup. User captions are XML-escaped, never treated as markup. */
type PageArgs=[project:DiagramProject,options:DiagramPDFOptions,plan:DiagramPDFPlan,pageIndex:number,palette:DiagramLineDefaults,adaptiveLines:boolean,scales?:Map<string,number|null>];
function* composeDiagramPDFPage(decorated:boolean,readArtwork:PDFArtworkReader|undefined,...args:PageArgs):Generator<void,string> {
  let [project,options,plan,pageIndex,palette,adaptiveLines,scales=new Map<string,number|null>()]=args;
  const page=plan.pages[pageIndex];if(!page)throw new Error('PDF 页码无效。');
  const bands=diagramPDFPageBands(options,project.name,plan,pageIndex);
  plan={...plan,header:bands.header,footer:bands.footer};
  const parts:string[]=[];
  if(decorated){
    const captions=diagramPDFRibbonCaptionRects(project,options,plan,page);
    parts.push(diagramPDFBackgroundSVG(options,plan,pageIndex),diagramPDFRibbonSVG(options,plan,page,pageIndex,captions));
  }
  const ink=options.pageTextColor??INK,mutedInk=options.pageTextColor??MUTED;
  if(options.readingOrder!=='snake')for(const cell of page.cells){
    if(!cell.branchReadingStart)continue;
    // The separator belongs to the row boundary, not to a hand-moved drawing.
    // A new branch at the top of a page gets the same opening separator;
    // an ordinary page break within a branch does not.
    const base=cell.baseRect??cell,y=base.y-Math.min(plan.gap,base.height)/2;
    parts.push(`<path data-pdf-branch-separator="true" data-pdf-page-rule="ink" d="M ${plan.margin} ${y} h ${plan.width-2*plan.margin}" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width=".8" pointer-events="none"/>`);
  }
  const text=(s:string,x:number,y:number,size:number,muted=false,bold=false,center:boolean|'left'|'center'|'right'=false)=>parts.push(`<text x="${x}" data-pdf-page-text="${muted?'muted':'ink'}" y="${y}" dominant-baseline="text-before-edge" font-size="${size}" fill="${muted?mutedInk:ink}" font-weight="${bold?600:400}"${center==='right'?' text-anchor="end"':center===true||center==='center'?' text-anchor="middle"':''}>${escape(s)}</text>`);
  const rule=(x:number,y:number,width:number,stroke?:string,weight=1)=>parts.push(`<path d="M ${x} ${y} h ${width}"${stroke===undefined?' data-pdf-page-rule="ink"':''} fill="none" stroke="${stroke??ink}" stroke-width="${weight}"/>`);
  const titleRule=(lines:string[],font:number,box:Pick<DiagramPDFRect,'x'|'width'>,y:number)=>{
    const width=Math.min(box.width,Math.max(...lines.map(line=>captionTextWidth(line,font)))+6);
    rule(alignedTextX({x:box.x,width:box.width-width},options.titleAlignment??'left'),y,width);
  };
  let panel=0;const scaleTransitions=new Set<string>();
  const imageAbove=(options.coverForeground??'image')==='image';
  const openGraphic=(kind:'image'|'cp',box:DiagramPDFRect)=>{
    parts.push(`<g data-diagram-cover-artwork="${kind}" data-cover-x="${box.x}" data-cover-y="${box.y}" data-cover-width="${box.width}" data-cover-height="${box.height}">`);
  };
  const artwork=(svg:string,box:DiagramPDFRect)=>parts.push(embedDiagramPDFSVG(svg.replace(/<rect\b[^>]*\bfill="white"[^>]*\/>/,''),box,`p${pageIndex}-art${panel++}-`));
  function* cover(box:DiagramPDFRect){
    if(plan.coverStepIndex===null)return;
    const views=galleryRows(project,options,'cover');
    if(views.length){yield* gallery(views,box,'cover');return;}
    openGraphic('image',box);
    const step=project.steps[plan.coverStepIndex],draw=()=>diagramPDFCoverSVG(project,step,palette,adaptiveLines,box);
    artwork(readArtwork?readArtwork.svg(step,['cover',box.width,box.height],draw):draw(),box);
    parts.push('</g>');
  }
  function* gallery(views:ReturnType<typeof galleryRows>,box:DiagramPDFRect,place:DiagramGalleryPlace,slots?:DiagramPDFRect[]){
    const steps=views.map(({item})=>galleryStep(project,item));
    const aspects=steps.map((step,index)=>{const frame=diagramPDFCoverFrame(step,undefined,diagramPanelRoute(project,views[index].ref));return frame.width/frame.height;});
    const mixed=place==='result'&&page.cells.length>0;
    const top=mixed&&page.kind==='intro'?diagramPDFIntroLayout(plan,options,project.name).stepsY:box.y;
    const bounds={...box,y:top,height:plan.height-plan.margin-plan.footer-top};
    const frames=(slots??galleryGrid(box,aspects)).map((slot,index)=>{
      const {item,index:row}=views[index],label=item.caption.trim(),labelWidth=Math.max(1,captionTextWidth(label,1));
      let font=Math.min(10,slot.height*.11,slot.width/labelWidth);
      const placement=item.layout?.[place];
      const image=galleryImageBox(slot,aspects[index],label?font*1.6:0,plan,placement);
      if(placement)font=Math.min(10,image.width/labelWidth);
      return {row,slot,label,labelWidth,font,placement,image};
    });
    const occupied=mixed?[...page.cells,...frames.filter(f=>!f.placement).map(f=>({...f.image,height:f.image.height+(f.label?f.font*1.6:0)}))]:[];
    for(const [index,frame] of frames.entries()){
      const {row,slot,label,labelWidth,placement}=frame;
      let {image,font}=frame;
      if(mixed&&placement){
        // Earlier projects positioned results on a separate sheet. Keep that
        // placement wherever it fits alongside the steps, including its caption.
        const captionHeight=label?font*1.6:0;
        if(!galleryPlacementFits(image,captionHeight,bounds,occupied)){
          const width=Math.min(image.width,slot.width,(slot.height-captionHeight)*aspects[index]);
          const height=width/aspects[index];
          image={x:Math.max(slot.x,Math.min(image.x,slot.x+slot.width-width)),y:Math.max(slot.y,Math.min(image.y,slot.y+slot.height-height-captionHeight)),width,height};
          font=Math.min(font,width/labelWidth);
        }
      }
      parts.push(`<g data-gallery-view="${row}" data-gallery-place="${place}" data-gallery-x="${image.x}" data-gallery-y="${image.y}" data-gallery-width="${image.width}" data-gallery-height="${image.height}">`);
      const {ref,item}=views[index],owner=diagramPanelRoute(project,ref);
      const draw=()=>diagramPDFCoverSVG(owner,steps[index],palette,adaptiveLines,image,true);
      const mirrored=item.mirrorX||item.mirrorY;
      if(mirrored){
        const x=item.mirrorX?2*image.x+image.width:0,y=item.mirrorY?2*image.y+image.height:0;
        parts.push(`<g data-gallery-mirror="true" transform="matrix(${item.mirrorX?-1:1} 0 0 ${item.mirrorY?-1:1} ${x} ${y})">`);
      }
      artwork(readArtwork?readArtwork.svg(owner.steps[ref.stepIndex],['gallery',item.side,item.rotation,item.drawingRotation,item.camera,item.simulationView,image.width,image.height],draw):draw(),image);
      if(mirrored)parts.push('</g>');
      if(label){
        const below=image.y+image.height+font*.25;
        text(label,image.x+image.width/2,placement&&below+font*1.35>plan.height?Math.max(0,image.y-font*1.35):below,font,true,false,true);
      }
      parts.push('</g>');
      yield;
    }
  }
  const cp=(box:DiagramPDFRect)=>{
    const doc=options.coverCPDoc??project.states.at(-1)?.doc;
    if(doc){
      openGraphic('cp',box);
      const draw=()=>pdfCPArtwork(doc,undefined,0,box,adaptiveLines,'page-cp');
      artwork(readArtwork?readArtwork.svg(doc,['cp',box.width,box.height],draw):draw(),box);parts.push('</g>');
    }
  };
  const title=options.title??project.name;
  const bandBox={x:plan.margin,width:plan.width-2*plan.margin};
  if(page.kind!=='cover'&&page.kind!=='intro'&&bands.top.lines.length){
    parts.push('<g data-pdf-page-header="true">');
    bands.top.lines.forEach((line,i)=>text(line,alignedTextX(bandBox,bands.top.alignment),bands.top.y+i*12,9,true,false,bands.top.alignment));
    parts.push('</g>');
  }
  if(page.kind==='cover'){
    const titleBox={x:plan.margin+12,width:plan.width-plan.margin*2-24};
    const {lines,fontSize:size}=fitDiagramPDFCoverText(title,titleBox.width,28,true);
    const y=plan.margin+(options.cover==='standard'?38:14),bottom=y+lines.length*size*1.4;
    const fields=diagramPDFCoverMetadata(options).map(row=>row.label+' · '+row.value);
    if(options.headerNote?.trim())fields.push(options.headerNote);
    fields.push(plan.selected.length+' 个步骤');
    const metadata=fields.map(field=>fitDiagramPDFCoverText(field,plan.width-plan.margin*2-32,10,false));
    let metaY=bottom+25;
    const imageY=metaY+metadata.reduce((height,field)=>height+field.lines.length*15,0)+18,end=plan.height-plan.margin-Math.max(22,plan.footer+4);
    const box={x:plan.margin+12,y:imageY,width:plan.width-plan.margin*2-24,height:Math.max(80,end-imageY-20)};
    const visuals=diagramPDFCoverArtworkRects(box,options,plan.coverStepIndex!==null);
    if(imageAbove&&visuals.cp)cp(visuals.cp);
    if(plan.coverStepIndex!==null)yield* cover(visuals.image);else if(!visuals.cp)text('折序图解',plan.width/2,imageY+box.height/2,14,true,false,true);
    if(visuals.cp&&!imageAbove)cp(visuals.cp);
    parts.push('<g pointer-events="none" xml:space="preserve">');
    lines.forEach((s,i)=>text(s,alignedTextX(titleBox,options.titleAlignment??'left'),y+i*size*1.4,size,false,true,options.titleAlignment??'left'));
    if(lines.length)titleRule(lines,size,titleBox,bottom+2);
    for(const field of metadata)for(const line of field.lines){
      text(line,plan.width/2,metaY,field.fontSize,true,false,true);metaY+=15;
    }
    parts.push('</g>');
  }else{
    if(page.kind==='intro'){
      const intro=diagramPDFIntroLayout(plan,options,project.name),lines=diagramPDFIntroText(project,options,intro);
      if(imageAbove&&intro.cp)cp(intro.cp);
      yield* cover(intro.image);
      if(intro.cp&&!imageAbove)cp(intro.cp);
      parts.push('<g pointer-events="none" xml:space="preserve">');
      for(const line of lines)text(line.text,line.x,line.y,line.fontSize,line.muted,line.bold,line.align);
      const titles=lines.filter(l=>l.kind==='title'),last=titles.at(-1);
      if(last)titleRule(titles.map(line=>line.text),last.fontSize,intro.info,last.y+last.fontSize*1.25+2);
      parts.push('</g>');
      rule(plan.margin,intro.dividerY,plan.width-plan.margin*2,undefined,2.2);
    }
    if(page.kind==='notes'){
      text('步骤说明（续）',plan.margin,plan.margin+plan.header-3,12,false,true);
      for(const note of page.notes){text(diagramPDFStepLabel(resolveDiagramPanel(project,note).step,note.stepIndex,note.figureIndex,note.branchLabel,note.displayNumber)+(note.continued?'（续）':''),note.x,note.y,10,false,true);note.lines.forEach((s,i)=>text(s,note.x,note.y+22+i*15,10));}
    }else for(const [index,panel] of diagramExportPagePanels(project,options,plan,pageIndex).entries()){
      yield;
      const cell=page.cells[index],{step}=resolveDiagramPanel(project,cell),content=diagramPDFCellContent(step,cell,options,plan);
      parts.push(`<g data-pdf-step="${escape(diagramPanelNumber(cell))}">`);
      const drawing=diagramExportPanelArtwork(project,panel,content.imageRect,palette,adaptiveLines,scales,undefined,true,readArtwork);
      artwork(drawing.svg,drawing.rect);parts.push(drawing.marker);
      if(drawing.marker&&panel.next)scaleTransitions.add(diagramPanelNumber(panel)+'>'+diagramPanelNumber(panel.next));
      if(!step.pose&&!step.annotations?.length&&!step.images?.length&&step.paperVisible!==false)text('待计算折图',cell.x,content.imageRect.y+content.imageRect.height-10,Math.min(content.font,8),true);
      for(const line of content.captionLines)text(line.text,line.x,line.y,line.fontSize,line.muted,line.bold,line.align);
      parts.push('</g>');
    }
    if(page.resultGallery){
      const {start,count,slots}=page.resultGallery,top=plan.margin+plan.header;
      const box={x:plan.margin,y:top,width:plan.width-2*plan.margin,height:plan.height-top-plan.margin-plan.footer};
      yield* gallery(galleryRows(project,options,'result').slice(start,start+count),box,'result',slots);
    }
  }
  for(const guide of diagramPDFReadingGuides(page,options)){
    if(scaleTransitions.has(guide.labels.join('>')))continue;
    const dx=guide.to[0]-guide.from[0],dy=guide.to[1]-guide.from[1],length=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;
    const [fromLabel,toLabel]=guide.labels.map(escape);
    parts.push(`<g data-pdf-reading-guide="${fromLabel}-${toLabel}" transform="translate(${guide.to.join(' ')}) rotate(${angle})"><title>阅读顺序：${fromLabel} → ${toLabel}</title><path d="M ${-length} 0 H 0 M -3 -2 L 0 0 L -3 2" fill="none" stroke="#526354" stroke-width=".75" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  }
  if(bands.bottom.lines.length){
    const band=bands.bottom;
    parts.push('<g data-pdf-page-footer="true">');
    if(band.numberOnly&&band.alignment==='center'){
      const footer=diagramPDFFooterLayout(plan,pageIndex);
      for(const r of [footer.leftRule,footer.rightRule])rule(r.x,r.y+(band.y-footer.y),r.width,'#c6c6c6',3);
    }
    band.lines.forEach((line,i)=>text(line,alignedTextX(bandBox,band.alignment),band.y+i*12,8,false,false,band.alignment));
    parts.push('</g>');
  }
  if(decorated)parts.push(diagramPDFBranchContinuations(options,plan,page));
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${plan.width}" height="${plan.height}" viewBox="0 0 ${plan.width} ${plan.height}" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">${parts.join('')}</svg>`;
}

function finishPage(page:Generator<void,string>):string {
  let next=page.next();
  while(!next.done)next=page.next();
  return next.value;
}
export function diagramPDFPageSVG(...args:PageArgs):string {
  return finishPage(composeDiagramPDFPage(true,undefined,...args));
}
export function diagramPDFPreviewBodySVG(...args:PageArgs):string {
  return finishPage(composeDiagramPDFPage(false,pdfArtworkReader(args[0],args[4],args[5]),...args));
}

/** A page can contain a dozen intricate models. Return control between drawings
 * so dragging controls, changing pages and cancelling can interrupt the work. */
async function renderPage(signal:AbortSignal|undefined,decorated:boolean,args:PageArgs):Promise<string> {
  const page=composeDiagramPDFPage(decorated,pdfArtworkReader(args[0],args[4],args[5]),...args);
  for(;;){
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    const deadline=performance.now()+16;
    do{
      signal?.throwIfAborted();
      const next=page.next();
      if(next.done)return next.value;
    }while(performance.now()<deadline);
  }
}
export function renderDiagramPDFPage(signal:AbortSignal|undefined,...args:PageArgs):Promise<string> {
  return renderPage(signal,true,args);
}
export function renderDiagramPDFPreviewBody(signal:AbortSignal|undefined,...args:PageArgs):Promise<string> {
  return renderPage(signal,false,args);
}

/** usvg uses SVG 1.1 strokes. Bake non-scaling stroke widths into local units
 * from the browser's actual SVG transform, including rotated nested viewports. */
export function normalizeDiagramPDFStrokes(svg:string):string {
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(parsed.querySelector('parsererror'))throw new Error('PDF 页面格式无效。');
  const root=document.importNode(parsed.documentElement,true) as unknown as SVGSVGElement;
  root.style.position='fixed';root.style.left='-100000px';root.style.top='0';root.style.visibility='hidden';
  document.body.append(root);
  try{
    const rootMatrix=root.getScreenCTM();if(!rootMatrix)throw new Error('PDF 页面变换无法计算。');
    // Bake the browser's pathLength calibration into ordinary dash units for
    // the vector PDF backend, which consumes the serialized SVG separately.
    const calibrated=[];
    for(const line of root.querySelectorAll<SVGGeometryElement>('[pathLength][stroke-dasharray]')){
      const ratio=line.getTotalLength()/line.pathLength.baseVal;
      if(!Number.isFinite(ratio)||ratio<=0)continue;
      const lengths=line.getAttribute('stroke-dasharray')!.trim().split(/[ ,]+/).map(Number);
      calibrated.push({line,dashes:lengths.map(value=>value*ratio).join(' '),offset:Number(line.getAttribute('stroke-dashoffset'))*ratio});
    }
    for(const {line,dashes,offset} of calibrated){
      line.setAttribute('stroke-dasharray',dashes);
      line.setAttribute('stroke-dashoffset',String(offset));
      line.removeAttribute('pathLength');
    }
    const strokes=[];let inverse:DOMMatrix|undefined;
    for(const element of root.querySelectorAll<SVGGraphicsElement>('[vector-effect="non-scaling-stroke"]')){
      const matrix=element.getScreenCTM();if(!matrix)throw new Error('PDF 折线变换无法计算。');
      inverse??=rootMatrix.inverse();
      const transform=inverse.multiply(matrix),scale=Math.sqrt(Math.abs(transform.a*transform.d-transform.b*transform.c));
      if(!(scale>0))throw new Error('PDF 折线变换已退化。');
      const style=getComputedStyle(element),width=parseFloat(style.strokeWidth);
      const dashes=style.strokeDasharray==='none'?undefined:style.strokeDasharray.split(/[ ,]+/).map(s=>parseFloat(s)/scale).join(' ');
      strokes.push({element,width:width/scale,dashes,offset:parseFloat(style.strokeDashoffset)/scale});
    }
    // Reading all matrices and computed lengths first avoids relaying out a
    // complex page once for every individual crease.
    root.remove();
    for(const {element,width,dashes,offset} of strokes){
      element.setAttribute('stroke-width',String(width));
      if(dashes!==undefined)element.setAttribute('stroke-dasharray',dashes);
      element.setAttribute('stroke-dashoffset',String(offset));element.removeAttribute('vector-effect');
    }
    root.removeAttribute('style');return new XMLSerializer().serializeToString(root);
  }finally{root.remove();}
}
