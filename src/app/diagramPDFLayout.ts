import {diagramPDFTransitionDirection} from './diagramPDFDirection';
import {diagramPDFRibbonNodeId,diagramPDFSeamKey,validDiagramPDFSeamHeights,type DiagramPDFSeamHeights} from './diagramPDFSeams';
import {diagramPDFRibbonStrokeWidth} from './diagramPDFBranchContinuation';
import {diagramPDFRibbonArtworkBox} from './diagramPDFRibbonObstacles';
import {diagramPDFBranchPanels,diagramPanelRoute} from './diagramPDFBranchPanels';
import {diagramPDFRibbonBranchIndex,type DiagramPDFRibbonBranch} from './diagramPDFBranchColors';
import {diagramBranchNumbering} from './diagramBranches';
import {layoutDiagramPDFBranchTree,type DiagramPDFBranchPage,type DiagramPDFBranchPageSpec} from './diagramPDFBranchLayout';
import {diagramPDFSequentialRuns,layoutDiagramPDFSequentialBranches} from './diagramPDFSequentialBranches';
import {spreadSnakeSlot} from './diagramPDFSnakeSlots';
import {galleryItems,galleryRows,validateGalleryViews,type DiagramGalleryView} from './diagramPDFGallery';
import {defaultDiagramPDFRibbon,diagramPDFRibbonKey,validateDiagramPDFDecoration,type DiagramPDFPaint,type DiagramPDFRibbon} from './diagramPDFDecoration';
import type {Doc} from '../core/types';
import type {DiagramProject,DiagramStep} from './diagramProject';
import {diagramPDFPageStyle,validateDiagramPDFFurniture,type PDFPageFurniture,type PDFMarginBand} from './diagramPDFFurniture';
export {diagramPDFPageFurniture,diagramPDFPageStyle,type PDFPageFurniture,type PDFPageFurnitureStyle,type PDFMarginBand} from './diagramPDFFurniture';

/** OriTools' 02-Page+Grid palette names columns first, then rows. */
export const DIAGRAM_PDF_LAYOUTS=[
  {id:'2x3',label:'2 列 × 3 行',columns:2,rows:3,source:'OriTools'},
  {id:'2x2',label:'2 列 × 2 行',columns:2,rows:2,source:'OriTools'},
  {id:'2x4',label:'2 列 × 4 行',columns:2,rows:4,source:'OriTools'},
  {id:'3x2',label:'3 列 × 2 行',columns:3,rows:2,source:'OriTools'},
  {id:'3x3',label:'3 列 × 3 行',columns:3,rows:3,source:'OriTools'},
  {id:'3x4',label:'3 列 × 4 行',columns:3,rows:4,source:'OriTools'},
  {id:'4x3',label:'4 列 × 3 行',columns:4,rows:3,source:'OriTools'},
  {id:'4x4',label:'4 列 × 4 行',columns:4,rows:4,source:'OriTools'},
  {id:'1x1',label:'单步大图',columns:1,rows:1,source:'workbench'},
  {id:'1x2',label:'单列阅读',columns:1,rows:2,source:'workbench'},
] as const;
export type DiagramPDFLayout=typeof DIAGRAM_PDF_LAYOUTS[number]['id'];
export type DiagramPDFSnakeDirection='horizontal'|'vertical';
export interface DiagramPDFPageLayout {
  columns?:number;rows?:number;count?:number;snakeDirection?:DiagramPDFSnakeDirection;
}
export interface DiagramPDFOptions {
  gallery?:DiagramGalleryView[];
  branchPagination?:'lanes'|Partial<Record<'grid'|'free','lanes'>>;
  layoutMode?:'grid'|'free';freeSpacing?:'compact'|'airy';
  /** Physical PDF page index; affects pagination, never the project's steps. */
  pageLayouts?:Record<string,DiagramPDFPageLayout>;
  panelPlacements?:Record<string,{x:number;y:number;scale:number;farSideStart?:true;spreadRoute?:true;entrySlot?:[number,number];branchPageSpan?:[string,string]}>;
  ribbonSeamHeights?:DiagramPDFSeamHeights;
  pageBackground?:DiagramPDFPaint;pageTextColor?:string;ribbon?:DiagramPDFRibbon;
  paper:'A4'|'A3';orientation:'portrait'|'landscape';layout:DiagramPDFLayout;
  /** Omitted in older settings: each row reads left to right. */
  readingOrder?:'rows'|'snake';
  /** Endpoint of the user-selected primary route; omitted keeps longest first. */
  sequentialMainStepId?:string;
  snakeDirection?:DiagramPDFSnakeDirection;
  scope:'all'|'route'|'current'|'range';rangeStart:number;rangeEnd:number;
  cover:'diagram'|'standard'|'minimal'|'none';coverImage:'last'|'current'|'none';
  /** The diagram first page has its own grid, independent of later pages. */
  introLayout?:DiagramPDFLayout;
  titleAlignment?:'left'|'center'|'right';
  stepAlignment?:'left'|'center'|'right';
  stepNumberPosition?:'left'|'above';
  coverArrangement?:'parallel'|'overlap';
  coverImageOffset?:{x:number;y:number};
  coverCPOffset?:{x:number;y:number};
  coverForeground?:'image'|'cp';
  coverGapMm?:number;
  coverOverlapPercent?:number;
  title:string;author:string;paperInfo:string;coverCP:boolean;coverCPDoc?:Doc;coverCPLabel?:string;
  designer?:string;designDate?:string;diagramDate?:string;headerNote?:string;
  runningTitle?:boolean;runningAuthor?:boolean;runningDesigner?:boolean;runningText?:string;
  pageFurniture?:PDFPageFurniture;
  descriptions:boolean;pageNumbers:boolean;
  scaleIndicators?:boolean;
  scaleMarkerOverrides?:Record<string,'zoom'|'zoomOut'|'none'>;
  scaleChangePercent?:number;
}
export const DEFAULT_DIAGRAM_SCALE_CHANGE_PERCENT=10;
export const PDF_PT_PER_MM=72/25.4;
export function diagramPDFSnakeDirection(options:DiagramPDFOptions,pageIndex:number):DiagramPDFSnakeDirection {
  return options.pageLayouts?.[pageIndex]?.snakeDirection??options.snakeDirection??'horizontal';
}
export function defaultDiagramPDFOptions(project?:DiagramProject):DiagramPDFOptions {
  const doc=project?.states[0]?.doc;
  return {paper:'A4',orientation:'portrait',layout:'3x4',introLayout:'3x3',readingOrder:'rows',...(project?.branchSteps?.length?{readingOrder:'snake' as const,ribbon:defaultDiagramPDFRibbon()}:{}),snakeDirection:'horizontal',scope:'all',rangeStart:1,rangeEnd:project?.steps.length??1,
    cover:'diagram',coverImage:'last',titleAlignment:'left',stepAlignment:'center',stepNumberPosition:'left',coverArrangement:'parallel',coverGapMm:4,coverOverlapPercent:20,coverForeground:'image',title:project?.name??'',author:'',designer:'',designDate:'',diagramDate:'',headerNote:'',paperInfo:doc?`${doc.paper.width} × ${doc.paper.height} mm`:'',coverCP:true,descriptions:true,pageNumbers:true,scaleIndicators:false,scaleChangePercent:DEFAULT_DIAGRAM_SCALE_CHANGE_PERCENT};
}
export interface DiagramPDFRect {x:number;y:number;width:number;height:number}
export interface DiagramPanelRef {stepIndex:number;figureIndex?:number;branchStepId?:string;branchLabel?:string;displayNumber?:string}
/** Visible print number is independent of saved branch IDs and placement keys. */
export function diagramPDFCaptionNumber(cell:DiagramPanelRef):string {return cell.displayNumber??diagramPanelNumber(cell);}
export function diagramPanelNumber({stepIndex,figureIndex,branchLabel}:DiagramPanelRef):string {
  const number=branchLabel??String(stepIndex+1);
  return figureIndex===undefined?number:`${number}-${figureIndex+1}`;
}
export function resolveDiagramPanel(source:DiagramProject,ref:DiagramPanelRef) {
  const {stepIndex,figureIndex}=ref,project=diagramPanelRoute(source,ref);
  const host=project.steps[stepIndex];
  if(figureIndex===undefined)return {project,step:host};
  const figure=host.processFigures?.[figureIndex];
  if(!figure||figure.steps.length!==1)throw new Error(`第 ${stepIndex+1} 步的过程图 ${figureIndex+1} 缺少独立画面。`);
  return {project:figure,step:figure.steps[0]};
}
export interface DiagramPDFCell extends DiagramPDFRect,DiagramPanelRef {columns:number;rows:number;descriptionLines:string[];descriptionOverflow:boolean;branchReadingNotes?:string[];branchReadingStart?:boolean;rowCaptionTop?:number;baseRect?:DiagramPDFRect;branchNodeId?:string;ribbonNodeId?:string;branchColorStepId?:string;entrySlot?:[number,number];ribbonInk?:DiagramPDFRect[]}
export function diagramPDFPanelKey(project:DiagramProject,panel:DiagramPanelRef):string {
  project=diagramPanelRoute(project,panel);
  return encodeURIComponent(project.steps[panel.stepIndex].id)+(panel.figureIndex===undefined?'':'/'+encodeURIComponent(project.steps[panel.stepIndex].processFigures![panel.figureIndex].steps[0].id));
}
export function diagramPDFPanelSlotInfo(page:DiagramPDFPage,cell:DiagramPDFCell){
  const first=page.cells[0]?.branchNodeId,last=page.cells.at(-1)?.branchNodeId;
  const branchPageSpan:[string,string]|undefined=first&&last?[first,last]:undefined;
  return {...(branchPageSpan&&{branchPageSpan}),...(cell.entrySlot&&{entrySlot:cell.entrySlot}),
    ...(page.farSideStart&&{farSideStart:true as const}),...(page.spreadRoute&&{spreadRoute:true as const})};
}
export function diagramPDFPanelPlacementKey(project:DiagramProject,panel:DiagramPanelRef,mode?:DiagramPDFOptions['layoutMode']):string {
  const key=diagramPDFPanelKey(project,panel);
  return mode==='free'?key:'grid:'+key;
}
export interface DiagramPDFNote extends DiagramPDFRect,DiagramPanelRef {lines:string[];continued:boolean}
export interface DiagramPDFPage {kind:'intro'|'cover'|'steps'|'notes'|'gallery';columns:number;rows:number;cells:DiagramPDFCell[];notes:DiagramPDFNote[];header?:number;footer?:number;farSideStart?:true;spreadRoute?:true;branchEdges?:(ReturnType<typeof layoutDiagramPDFBranchTree>[number]['edges'][number]&{branchColorStepId?:string})[];linearSeams?:Partial<Record<'incoming'|'outgoing',{key:string;otherPage:number}>>;resultGallery?:{start:number;count:number;slots?:DiagramPDFRect[]}}
export interface DiagramPDFPlan {width:number;height:number;margin:number;header:number;footer:number;gap:number;columns:number;rows:number;introColumns:number;introRows:number;pages:DiagramPDFPage[];selected:number[];coverStepIndex:number|null;branchPagination?:'lanes'|'legacy';ribbonBranches?:readonly DiagramPDFRibbonBranch[]}
export interface DiagramPDFCaptionLine {text:string;x:number;y:number;fontSize:number;bold:boolean;muted:boolean;kind:'title'|'number'|'description'|'continuation';align?:'left'|'center'|'right'}
export interface DiagramPDFIntroGeometry {info:DiagramPDFRect;image:DiagramPDFRect;cp:DiagramPDFRect|null;noteRect:DiagramPDFRect|null;noteLines:string[];noteFont:number;noteLineHeight:number;dividerY:number;stepsY:number;titleFont:number;metadataFont:number;metadataRows:{label:string;lines:string[];fontSize:number}[]}
export function selectDiagramPDFSteps(project:DiagramProject,options:DiagramPDFOptions):number[] {
  if(!project.steps.length)throw new Error('工程中没有可导出的步骤。');
  if(options.scope==='current') {
    const current=project.steps.findIndex(step=>step.id===project.activeStepId);
    if(current<0)throw new Error('当前步骤不存在。');return [current];
  }
  if(options.scope==='range') {
    if(!Number.isInteger(options.rangeStart)||!Number.isInteger(options.rangeEnd)||options.rangeStart<1||options.rangeEnd>project.steps.length||options.rangeStart>options.rangeEnd)throw new Error(`步骤范围须为 1 到 ${project.steps.length}，起点不能大于终点。`);
    return Array.from({length:options.rangeEnd-options.rangeStart+1},(_,i)=>options.rangeStart-1+i);
  }
  if(options.scope!=='all'&&options.scope!=='route')throw new Error('导出步骤范围无效。');
  return project.steps.map((_,i)=>i);
}
/** Conservative CJK-aware wrapping in point units, also used by the preview. */
export function wrapDiagramPDFText(text:string,width:number,fontSize:number):string[] {
  const result:string[]=[];
  for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')) {
    let line='',used=0;
    for(const ch of Array.from(paragraph)) {
      const charWidth=fontSize*(/[\u0000-\u00ff]/.test(ch)?(ch===' '?.32:.6):1);
      if(line&&used+charWidth>width){result.push(line);line='';used=0;}
      line+=ch;used+=charWidth;
    }
    result.push(line);
  }
  return result;
}
export function diagramPDFStepFont(columns:number) {return columns>=4?7:columns>=3?7.5:9;}
export function alignedTextX(box:Pick<DiagramPDFRect,'x'|'width'>,align:'left'|'center'|'right') {
  return box.x+(align==='center'?box.width/2:align==='right'?box.width:0);
}
function coverLines(text:string):string[] {
  return text.trim()?text.replace(/\r\n?/g,'\n').split('\n'):[];
}
/** Fit explicit lines to the printable page. A neighbouring illustration
 * never changes the font, line breaks, or measured width. */
export function fitDiagramPDFCoverText(text:string,pageWidth:number,fontSize:number,bold:boolean) {
  const lines=coverLines(text);
  const naturalWidth=lines.reduce((longest,line)=>Math.max(longest,captionTextWidth(line,fontSize,bold)),0);
  const scale=naturalWidth>pageWidth?pageWidth/naturalWidth:1;
  return {lines,fontSize:fontSize*scale,width:naturalWidth*scale};
}
export function diagramPDFCoverArtworkRects(box:DiagramPDFRect,options:DiagramPDFOptions,hasImage:boolean) {
  const both=hasImage&&options.coverCP;
  const overlap=options.coverArrangement==='overlap';
  const fraction=(options.coverOverlapPercent??20)/100;
  const gap=both&&!overlap?Math.min((options.coverGapMm??4)*PDF_PT_PER_MM,box.width*.5):0;
  const span=both?(overlap?2-fraction:2):1;
  const side=Math.max(0,Math.min(box.height,(box.width-gap)/span));
  const total=side*span+gap,x=box.x+(box.width-total)/2,y=box.y+(box.height-side)/2;
  const image={x,y,width:hasImage?side:0,height:hasImage?side:0};
  const cp=options.coverCP?{x:both?x+side*(overlap?1-fraction:1)+gap:x,y,width:side,height:side}:null;
  if(hasImage&&options.coverImageOffset){image.x+=options.coverImageOffset.x*PDF_PT_PER_MM;image.y+=options.coverImageOffset.y*PDF_PT_PER_MM;}
  if(cp&&options.coverCPOffset){cp.x+=options.coverCPOffset.x*PDF_PT_PER_MM;cp.y+=options.coverCPOffset.y*PDF_PT_PER_MM;}
  return {image,cp};
}
export function diagramPDFIntroLayout(plan:DiagramPDFPlan,options:DiagramPDFOptions,projectTitle='折序图解'):DiagramPDFIntroGeometry {
  const width=plan.width-plan.margin*2,columnGap=plan.gap*.7,columnWidth=(width-columnGap*2)/3;
  const hasImage=plan.coverStepIndex!==null,visualCount=Number(hasImage)+Number(options.coverCP);
  const side=Math.min(columnWidth-8,plan.height*.2),scale=Math.min(1.35,Math.max(1,side/156));
  const title=fitDiagramPDFCoverText(options.title??projectTitle,width-6,20*scale,true);
  const metadataFont=10.5*scale;
  const metadataRows=diagramPDFCoverMetadata(options).map(({label,value})=>({
    label,...fitDiagramPDFCoverText(value,width,metadataFont,false)
  }));
  const note=fitDiagramPDFCoverText(options.headerNote??'',width,7.5*scale,false);
  const noteLines=options.headerNote?.trim()?note.lines:[];
  const noteFont=note.fontSize,noteLineHeight=noteFont*4/3;
  const noteHeight=noteLines.length*noteLineHeight;
  const infoWidth=Math.min(width,Math.max(columnWidth,title.width+6,note.width,
    ...metadataRows.map(row=>Math.max(row.width,captionTextWidth(row.label,metadataFont)))));
  const textHeight=title.lines.length*title.fontSize*1.25+
    (metadataRows.length||noteLines.length?10*scale:0)+
    metadataRows.reduce((sum,row)=>sum+metadataFont*1.3+row.lines.length*row.fontSize*1.3+7*scale,0);
  const info={x:plan.margin,y:plan.margin,width:infoWidth,height:textHeight+noteHeight};
  const noteRect=noteLines.length?{x:info.x,y:info.y+textHeight,width:infoWidth,height:noteHeight}:null;
  // Anchor the artwork at the right margin independently of the text block.
  const visualWidth=visualCount===2?width-columnWidth-columnGap:side;
  const {image,cp}=diagramPDFCoverArtworkRects({x:plan.margin+width-visualWidth,y:plan.margin+2,width:visualWidth,height:side},options,hasImage);
  const dividerY=plan.margin+Math.max(info.height,visualCount?side:0)+12;
  return {info,image,cp,noteRect,noteLines,noteFont,noteLineHeight,dividerY,stepsY:dividerY+plan.gap*.8,titleFont:title.fontSize,metadataFont,metadataRows};
}
function limitedTextLines(value:string,width:number,font:number,count:number) {
  const lines=wrapDiagramPDFText(value,width,font);
  if(lines.length<=count)return lines;
  const kept=lines.slice(0,count),last=Array.from(kept[count-1]);
  kept[count-1]=last.slice(0,Math.max(0,last.length-1)).join('')+'…';return kept;
}
export function diagramPDFCoverMetadata(options:DiagramPDFOptions) {
  const design=[options.designer?.trim(),options.designDate?.trim()].filter(Boolean).join(' · ');
  const diagram=[options.author.trim(),options.diagramDate?.trim()].filter(Boolean).join(' · ');
  return [{label:'设计 / Designer',value:design},{label:'制图 / Diagrams',value:diagram},{label:'纸张 / Paper',value:options.paperInfo.trim()}].filter(row=>row.value);
}
/** The same information text coordinates are used in preview and export. */
export function diagramPDFIntroText(project:DiagramProject,options:DiagramPDFOptions,geometry:DiagramPDFIntroGeometry):DiagramPDFCaptionLine[] {
  const lines:DiagramPDFCaptionLine[]=[],{info,metadataFont}=geometry,scale=metadataFont/10.5;let y=info.y;
  for(const value of coverLines(options.title??project.name)) {
    lines.push({text:value,x:alignedTextX(info,options.titleAlignment??'left'),y,fontSize:geometry.titleFont,bold:true,muted:false,kind:'title',align:options.titleAlignment??'left'});y+=geometry.titleFont*1.25;
  }
  y+=10*scale;
  for(const row of geometry.metadataRows) {
    lines.push({text:row.label,x:info.x,y,fontSize:metadataFont,bold:true,muted:false,kind:'description'});y+=metadataFont*1.3;
    for(const line of row.lines) {
      lines.push({text:line,x:info.x,y,fontSize:row.fontSize,bold:false,muted:false,kind:'description'});y+=row.fontSize*1.3;
    }y+=7*scale;
  }
  if(geometry.noteRect)geometry.noteLines.forEach((line,index)=>lines.push({text:line,x:geometry.noteRect!.x,y:geometry.noteRect!.y+index*geometry.noteLineHeight,fontSize:geometry.noteFont,bold:false,muted:true,kind:'description'}));
  return lines;
}
let captionMeasure:CanvasRenderingContext2D|null|undefined;
export function captionTextWidth(text:string,size:number,bold=true):number {
  if(captionMeasure===undefined&&typeof document!=='undefined'&&typeof document.createElement==='function')captionMeasure=document.createElement('canvas').getContext('2d');
  if(captionMeasure){captionMeasure.font=(bold?'600 ':'400 ')+size+'px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';return captionMeasure.measureText(text).width;}
  return Array.from(text).reduce((sum,ch)=>sum+size*(/[\u0000-\u00ff]/.test(ch)?(ch===' '?.32:.6):1),0);
}
function stepCaptionTitle(step:DiagramStep,cell:Pick<DiagramPDFCell,'width'|'stepIndex'|'figureIndex'>,size:number,options:DiagramPDFOptions) {
  const align=options.stepAlignment??'center',numberWidth=captionTextWidth(diagramPDFCaptionNumber(cell)+'.',size)+size*.4;
  const reserve=options.stepNumberPosition==='above'||align==='left'?0:numberWidth*(align==='center'?2:1);
  const width=Math.max(size,cell.width-reserve);
  const title=step.title.trim(),content=/^步骤\s*\d+$/.test(title)?'':title;
  const titleLines=!content?[]:content.includes('\n')?wrapDiagramPDFText(content,width,size):limitedTextLines(content,width,size,2);
  const rows=Math.max(1,titleLines.length)+(titleLines.length&&options.stepNumberPosition==='above'?1:0);
  return {titleLines,rows};
}
function branchReadingLines(cell:Pick<DiagramPDFCell,'width'|'branchReadingNotes'>,font:number){
  const size=Math.max(6,font*.9),lines=(cell.branchReadingNotes??[]).flatMap(note=>wrapDiagramPDFText(note,cell.width,size));
  return {size,lines,lineHeight:size*1.4,height:lines.length?4+lines.length*size*1.4:0};
}
function cellCaptionSettings(step:DiagramStep,cell:Pick<DiagramPDFCell,'stepIndex'|'figureIndex'|'width'|'height'|'columns'|'rows'|'branchReadingNotes'>,options:DiagramPDFOptions) {
  const font=diagramPDFStepFont(cell.columns),titleFont=font+1,lineHeight=font*1.5,titleLineHeight=titleFont*1.4;
  const {titleLines,rows}=stepCaptionTitle(step,cell,titleFont,options);
  const titleHeight=rows*titleLineHeight+branchReadingLines(cell,font).height;
  const preferred=cell.rows<=2?7:cell.rows===3?4:3,budget=Math.min(cell.height*.42,100);
  let maxDescriptionLines=Math.max(0,Math.min(preferred,Math.floor((budget-titleHeight-4)/lineHeight)));
  const description=options.descriptions&&step.description.trim()?wrapDiagramPDFText(step.description,cell.width,font):[];
  if(description.length>maxDescriptionLines)maxDescriptionLines=Math.max(0,maxDescriptionLines-1);
  return {font,titleFont,lineHeight,titleLineHeight,description,descriptionLines:description.slice(0,maxDescriptionLines),descriptionOverflow:description.length>maxDescriptionLines};
}
export function diagramPDFCellContent(step:DiagramStep,cell:DiagramPDFCell,options:DiagramPDFOptions,plan:DiagramPDFPlan) {
  const font=diagramPDFStepFont(cell.columns??plan.columns),titleFont=font+1,lineHeight=font*1.5,titleLineHeight=titleFont*1.4;
  const {titleLines,rows}=stepCaptionTitle(step,cell,titleFont,options);
  const descriptionLines=options.descriptions?cell.descriptionLines:[],overflow=options.descriptions&&cell.descriptionOverflow;
  const reading=branchReadingLines(cell,font);
  const captionHeight=rows*titleLineHeight+(descriptionLines.length?3+descriptionLines.length*lineHeight:0)+(overflow?lineHeight:0)+reading.height;
  const captionRect={x:cell.x,y:cell.rowCaptionTop??(cell.y+cell.height-captionHeight),width:cell.width,height:captionHeight};
  const imageRect={x:cell.x,y:cell.y,width:cell.width,height:Math.max(1,captionRect.y-cell.y-6)};
  const captionLines:DiagramPDFCaptionLine[]=[];let y=captionRect.y;
  const align=options.stepAlignment??'center',anchor=alignedTextX(cell,align),number=diagramPDFCaptionNumber(cell);
  if(!titleLines.length){
    captionLines.push({text:options.stepNumberPosition==='above'?number:number+'.',x:anchor,y,fontSize:titleFont,bold:true,muted:false,kind:'number',align});y+=titleLineHeight;
  }else{
    const width=captionTextWidth(titleLines[0],titleFont),left=anchor-(align==='center'?width/2:align==='right'?width:0);
    if(options.stepNumberPosition==='above'){
      captionLines.push({text:number,x:left+width/2,y,fontSize:titleFont,bold:true,muted:false,kind:'number',align:'center'});y+=titleLineHeight;
    }else captionLines.push({text:number+'.',x:left-titleFont*.4,y,fontSize:titleFont,bold:true,muted:false,kind:'number',align:'right'});
    titleLines.forEach(value=>{captionLines.push({text:value,x:anchor,y,fontSize:titleFont,bold:true,muted:false,kind:'title',align});y+=titleLineHeight;});
  }
  if(descriptionLines.length)y+=3;
  descriptionLines.forEach(value=>{captionLines.push({text:value,x:alignedTextX(cell,options.stepAlignment??'center'),y,fontSize:font,bold:false,muted:false,kind:'description',align:options.stepAlignment??'center'});y+=lineHeight;});
  if(overflow){captionLines.push({text:'完整说明见文末',x:alignedTextX(cell,options.stepAlignment??'center'),y,fontSize:font,bold:false,muted:true,kind:'continuation',align:options.stepAlignment??'center'});y+=lineHeight;}
  if(reading.lines.length)y+=4;
  for(const text of reading.lines){captionLines.push({text,x:anchor,y,fontSize:reading.size,bold:false,muted:true,kind:'continuation',align});y+=reading.lineHeight;}
  return {font,titleFont,lineHeight,imageRect,captionRect,captionLines};
}
export function diagramPDFCaptionLines(step:DiagramStep,cell:DiagramPDFCell,options:DiagramPDFOptions,plan:DiagramPDFPlan) {return diagramPDFCellContent(step,cell,options,plan).captionLines;}
export function diagramPDFRibbonCaptionRects(project:DiagramProject,options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage):DiagramPDFRect[] {
  if(options.readingOrder!=='snake'||!options.ribbon?.enabled||!options.ribbon.showArrows)return [];
  return page.cells.map(cell=>captionInkBox(diagramPDFCaptionLines(resolveDiagramPanel(project,cell).step,cell,options,plan)));
}
function captionInkBox(lines:DiagramPDFCaptionLine[]):DiagramPDFRect {
  let left=Infinity,right=-Infinity,bottom=-Infinity;
  for(const line of lines){
    const width=captionTextWidth(line.text,line.fontSize,line.bold);
    const x=line.x-(line.align==='center'?width/2:line.align==='right'?width:0);
    left=Math.min(left,x);right=Math.max(right,x+width);bottom=Math.max(bottom,line.y+line.fontSize*1.3);
  }
  return {x:left,y:lines[0].y,width:right-left,height:bottom-lines[0].y};
}
function ribbonInkBoxes(source:DiagramProject,cell:DiagramPDFCell,options:DiagramPDFOptions,plan:DiagramPDFPlan){
  const {project,step}=resolveDiagramPanel(source,cell);
  const {imageRect,captionLines}=diagramPDFCellContent(step,cell,options,plan);
  return [diagramPDFRibbonArtworkBox(project,step,imageRect,cell.figureIndex!==undefined),captionInkBox(captionLines)];
}
function diagramPDFPanelRibbonInk(source:DiagramProject,cell:DiagramPDFCell,options:DiagramPDFOptions,plan:DiagramPDFPlan){
  return ribbonInkBoxes(source,cell,options,plan).map(r=>({x:(r.x-cell.x)/cell.width,y:(r.y-cell.y)/cell.height,width:r.width/cell.width,height:r.height/cell.height}));
}
export function diagramPDFFooterLayout(plan:DiagramPDFPlan,pageIndex:number) {
  const label=String(pageIndex+1).padStart(3,'0'),x=plan.width/2,y=plan.height-plan.margin+11,fontSize=8;
  const ruleY=y+fontSize*.65,halfLabel=label.length*fontSize*.556/2,ruleWidth=18;
  return {label,x,y,fontSize,rule:{x:x-18,y:ruleY,width:36},leftRule:{x:x-halfLabel-8-ruleWidth,y:ruleY,width:ruleWidth},rightRule:{x:x+halfLabel+8,y:ruleY,width:ruleWidth}};
}
export function diagramPDFRunningTitle(title:string,width:number):string[] {
  return wrapDiagramPDFText(title.replace(/\s*[\r\n]+\s*/g,' '),width,9);
}
function pageBandLines(band:PDFMarginBand,options:DiagramPDFOptions,projectName:string,pageIndex:number,width:number,size:number) {
  const fields=[band.showTitle&&(options.title??projectName).trim(),band.showDesigner&&options.designer?.trim(),
    band.showAuthor&&options.author.trim(),band.text?.trim(),band.showPageNumber&&String(pageIndex+1).padStart(3,'0')].filter(Boolean);
  return fields.length?wrapDiagramPDFText(fields.join('  ·  ').replace(/\s*[\r\n]+\s*/g,' '),width,size):[];
}
export function diagramPDFHeaderLines(options:DiagramPDFOptions,projectName:string,width:number,pageIndex=0):string[] {
  return pageBandLines(diagramPDFPageStyle(options,pageIndex).header,options,projectName,pageIndex,width,9);
}
export function diagramPDFPageBands(options:DiagramPDFOptions,projectName:string,dimensions:Pick<DiagramPDFPlan,'width'|'height'|'margin'>,pageIndex:number) {
  const {width,height,margin}=dimensions,{header,footer}=diagramPDFPageStyle(options,pageIndex);
  const lineWidth=width-2*margin;
  const topLines=pageBandLines(header,options,projectName,pageIndex,lineWidth,9);
  const bottomLines=pageBandLines(footer,options,projectName,pageIndex,lineWidth,8);
  const headerY=header.offsetMm===undefined?margin-4:header.offsetMm*PDF_PT_PER_MM;
  const lastFooterY=footer.offsetMm===undefined?height-margin+11:height-footer.offsetMm*PDF_PT_PER_MM-8;
  const footerY=lastFooterY-12*Math.max(0,bottomLines.length-1);
  const label=String(pageIndex+1).padStart(3,'0');
  return {
    top:{lines:topLines,y:headerY,alignment:header.alignment},
    bottom:{lines:bottomLines,y:footerY,alignment:footer.alignment,
      numberOnly:footer.showPageNumber===true&&bottomLines.length===1&&bottomLines[0]===label},
    header:topLines.length?Math.max(0,headerY-margin+23+12*(topLines.length-1)):0,
    footer:bottomLines.length?Math.max(0,height-margin-footerY+29):18,
  };
}
/** File settings and preview share the same schema. Step limits depend on the current export. */
export function validateDiagramPDFOptions(options:DiagramPDFOptions) {
  validateGalleryViews(options.gallery);
  validateDiagramPDFDecoration(options);
  validateDiagramPDFFurniture(options.pageFurniture);
  for(const key of ['runningTitle','runningAuthor','runningDesigner'] as const)if(options[key]!==undefined&&typeof options[key]!=='boolean')throw Error('页眉选项须为布尔值。');
  if(options.runningText!==undefined&&(typeof options.runningText!=='string'||options.runningText.length>160))throw Error('页眉自定义文字最多 160 字。');
  if(options.layoutMode!==undefined&&!['grid','free'].includes(options.layoutMode))throw Error('步骤排版模式无效。');
  if(options.freeSpacing!==undefined&&!['compact','airy'].includes(options.freeSpacing))throw Error('自由排版间距无效。');
  if(options.pageLayouts!==undefined){
    if(!options.pageLayouts||typeof options.pageLayouts!=='object'||Array.isArray(options.pageLayouts))throw Error('分页设置无效。');
    for(const [key,value] of Object.entries(options.pageLayouts)){
      if(!/^\d+$/.test(key)||!value||typeof value!=='object'||Array.isArray(value)||![value.columns,value.rows].every(n=>n===undefined||Number.isInteger(n)&&n>=1&&n<=8)||value.count!==undefined&&(!Number.isInteger(value.count)||value.count<1||value.count>64))throw Error('每页行列数应为 1 至 8，步骤数量应为 1 至 64。');
      if(value.snakeDirection!==undefined&&!['horizontal','vertical'].includes(value.snakeDirection))throw Error('单页蛇形走向无效。');
    }
  }
  if(options.panelPlacements!==undefined){
    if(!options.panelPlacements||typeof options.panelPlacements!=='object'||Array.isArray(options.panelPlacements))throw Error('步骤位置设置无效。');
    for(const value of Object.values(options.panelPlacements)){
      if(!value||![value.x,value.y,value.scale].every(Number.isFinite)||Math.abs(value.x)>1||Math.abs(value.y)>1||value.scale<.3||value.scale>2)throw Error('步骤位置或缩放设置无效。');
      if(value.farSideStart!==undefined&&value.farSideStart!==true)throw Error('分支步骤的进页侧设置无效。');
      if(value.spreadRoute!==undefined&&value.spreadRoute!==true)throw Error('步骤的跨页排布设置无效。');
      if(value.entrySlot!==undefined&&(!Array.isArray(value.entrySlot)||value.entrySlot.length!==2||
        !value.entrySlot.every(n=>Number.isInteger(n)&&n>=0&&n<64)))throw Error('分支步骤的行列位置无效。');
      if(value.branchPageSpan!==undefined&&(!Array.isArray(value.branchPageSpan)||value.branchPageSpan.length!==2||
        !value.branchPageSpan.every(id=>typeof id==='string'&&id.length>0)))throw Error('分支步骤的位置记录无效。');
    }
  }
  const branchPagination=options.branchPagination;
  if(branchPagination!==undefined&&branchPagination!=='lanes'&&(!branchPagination||typeof branchPagination!=='object'||
    Array.isArray(branchPagination)||Object.entries(branchPagination).some(([mode,value])=>
      (mode!=='grid'&&mode!=='free')||value!=='lanes')))throw Error('分支跨页排布设置无效。');
  if(options.stepNumberPosition!==undefined&&!['left','above'].includes(options.stepNumberPosition))throw Error('步骤标号位置无效。');
  for(const key of ['titleAlignment','stepAlignment'] as const)if(options[key]!==undefined&&!['left','center','right'].includes(options[key]!))throw Error('文字对齐选项无效。');
  for(const key of ['coverImageOffset','coverCPOffset'] as const){
    const offset=options[key];
    if(offset!==undefined&&(!offset||typeof offset!=='object'||!Number.isFinite(offset.x)||!Number.isFinite(offset.y)||Math.abs(offset.x)>1000||Math.abs(offset.y)>1000))throw Error('封面图片偏移应为 -1000 至 1000 mm 的有限数值。');
  }
  if(options.coverForeground!==undefined&&!['image','cp'].includes(options.coverForeground))throw Error('封面图片前后顺序无效。');
  if(options.coverArrangement!==undefined&&!['parallel','overlap'].includes(options.coverArrangement))throw Error('封面图文排布无效。');
  if(options.coverGapMm!==undefined&&(!Number.isFinite(options.coverGapMm)||options.coverGapMm<0||options.coverGapMm>50))throw Error('封面图间距应为 0 至 50 mm。');
  if(options.coverOverlapPercent!==undefined&&(!Number.isFinite(options.coverOverlapPercent)||options.coverOverlapPercent<0||options.coverOverlapPercent>100))throw Error('封面重叠比例应为 0 至 100%。');
  if(options.readingOrder!==undefined&&!['rows','snake'].includes(options.readingOrder))throw new Error('PDF 阅读顺序无效。');
  if(options.sequentialMainStepId!==undefined&&(typeof options.sequentialMainStepId!=='string'||!options.sequentialMainStepId.trim()||options.sequentialMainStepId.length>512))throw Error('顺序阅读主线设置无效。');
  if(options.snakeDirection!==undefined&&!['horizontal','vertical'].includes(options.snakeDirection))throw Error('蛇形走向无效。');
  if(!['A4','A3'].includes(options.paper)||!['portrait','landscape'].includes(options.orientation)||!['diagram','standard','minimal','none'].includes(options.cover)||!['last','current','none'].includes(options.coverImage))throw new Error('PDF 纸张或封面选项无效。');
  for(const key of ['title','author','paperInfo'] as const)if(typeof options[key]!=='string'||options[key].length>(key==='paperInfo'?160:120))throw new Error('标题和作者最多 120 字，纸张信息最多 160 字。');
  for(const key of ['designer','designDate','diagramDate','headerNote'] as const)if(options[key]!==undefined&&(typeof options[key]!=='string'||options[key]!.length>(key==='headerNote'?160:key.endsWith('Date')?40:120)))throw new Error('设计者最多 120 字，日期最多 40 字，首页小字最多 160 字。');
  const seamHeights=options.ribbonSeamHeights;
  if(seamHeights!==undefined&&!validDiagramPDFSeamHeights(seamHeights))throw Error('跨页彩带节点必须位于页边上。');
  if(options.scaleMarkerOverrides!==undefined&&(!options.scaleMarkerOverrides||typeof options.scaleMarkerOverrides!=='object'||Array.isArray(options.scaleMarkerOverrides)||Object.values(options.scaleMarkerOverrides).some(value=>!['zoom','zoomOut','none'].includes(value))))throw Error('步骤间缩放标记设置无效。');
  if(options.scaleIndicators!==undefined&&typeof options.scaleIndicators!=='boolean')throw new Error('PDF 缩放标记选项无效。');
  if(options.scaleChangePercent!==undefined&&(!Number.isFinite(options.scaleChangePercent)||options.scaleChangePercent<0))throw new Error('缩放标记阈值须为大于或等于 0 的有限百分数。');
  for(const key of ['coverCP','descriptions','pageNumbers'] as const)if(typeof options[key]!=='boolean')throw new Error('PDF 显示选项无效。');
  const layout=DIAGRAM_PDF_LAYOUTS.find(item=>item.id===options.layout);if(!layout)throw new Error('PDF 排版无效。');
  const introLayout=DIAGRAM_PDF_LAYOUTS.find(item=>item.id===(options.introLayout??'3x3'));if(!introLayout)throw new Error('PDF 首页步骤排版无效。');
  if(!['all','route','current','range'].includes(options.scope)||![options.rangeStart,options.rangeEnd].every(Number.isFinite))throw Error('导出步骤范围无效。');
  if(options.coverCPLabel!==undefined&&typeof options.coverCPLabel!=='string')throw Error('封面 CP 名称无效。');
  return {layout,introLayout};
}
type GridSlot={row:number;column:number;capacity:number};
function closeRibbonOnRight(slots:GridSlot[]) {
  const last=slots.at(-1)!;
  if(last.row%2===0||last.column===last.capacity-1)return slots;
  const start=slots.findIndex(slot=>slot.row===last.row-1);
  const tail=slots.slice(start),wide=tail[0].capacity;
  return slots.slice(0,start).concat(tail.map((_,i)=>{
    const slot=spreadSnakeSlot(i,tail.length,wide,2,false);
    // Staggered free rows can be one drawing shorter than their neighbours.
    // Keep exactly the occupied slots, including their original widths.
    const capacity=slot.row===0?wide:last.capacity;
    return {row:last.row-1+slot.row,column:slot.column-(wide-capacity),capacity};
  }));
}
// Return both the occupied run and the complete set of available positions.
// Truncating the last lane must never change which axis is traversed first.
function pageSlots(columns:number,requestedRows:number,count:number,vertical:boolean,snake:boolean,shortenAlternateLanes:boolean,fitRows=false) {
  const laneCapacity=(size:number,lane:number)=>shortenAlternateLanes&&lane%2?Math.max(1,size-1):size;
  let rows=requestedRows;
  if(vertical){
    const gridCapacity=(n:number)=>columns*n-(shortenAlternateLanes&&n>1?Math.floor(columns/2):0);
    while(gridCapacity(rows)<count)rows++;
  }else{
    let needed=0,capacity=0;
    while(capacity<count)capacity+=laneCapacity(columns,needed++);
    rows=fitRows?needed:Math.max(requestedRows,needed);
  }
  const slots:GridSlot[]=[],available:GridSlot[]=[];
  const lanes=vertical?columns:rows;
  for(let lane=0;lane<lanes;lane++){
    const capacity=laneCapacity(vertical?rows:columns,lane);
    const length=Math.min(count-slots.length,capacity);
    const slot=(index:number,span:number)=>{
      const along=snake&&lane%2?span-1-index:index;
      return vertical?{row:along,column:lane,capacity:span}:{row:lane,column:along,capacity:span};
    };
    for(let i=0;i<capacity;i++)available.push(slot(i,capacity));
    for(let i=0;i<length;i++){
      // Preserve the spread of a short, single horizontal row and the
      // independently fitted rows used by the original free composition.
      const spaced=snake&&!vertical&&lane===0&&count===length&&length>1&&length<capacity;
      const index=spaced?Math.round(i*(capacity-1)/(length-1)):i;
      slots.push(slot(index,shortenAlternateLanes&&!snake&&!vertical?length:capacity));
    }
  }
  return {rows,slots,available};
}
function gridSlotRect(plan:DiagramPDFPlan,startY:number,columns:number,rows:number,slot:GridSlot,fromBottom:boolean,options:DiagramPDFOptions,free:boolean,vertical:boolean):DiagramPDFRect {
  const {width,height,margin,footer,gap}=plan;
  const cellWidth=(width-margin*2-gap*(columns-1))/columns,cellHeight=(height-margin-footer-startY-gap*(rows-1))/rows;
  const {row,column,capacity}=slot,visualRow=fromBottom?rows-1-row:row;
  const y=startY+visualRow*(cellHeight+gap);
  if(!free)return {x:margin+column*(cellWidth+gap),y,width:cellWidth,height:cellHeight};
  const factor=options.freeSpacing==='airy'?.78:.9;
  if(vertical){
    const slotHeight=(height-margin-footer-startY)/capacity,visual=fromBottom?capacity-1-row:row;
    const h=Math.min(cellHeight*1.12,slotHeight-gap*.5)*factor,w=cellWidth*(column%2===0?.96:.88);
    return {x:margin+column*(cellWidth+gap)+(cellWidth-w)/2+(row%2?cellWidth*.035:0),y:startY+slotHeight*(visual+.5)-h/2,width:w,height:h};
  }
  const slotWidth=(width-margin*2)/capacity;
  const w=Math.min(cellWidth*1.12,slotWidth-gap*.5)*factor,h=cellHeight*(row%2===0?.96:.88);
  return {x:margin+slotWidth*(column+.5)-w/2,y:y+(cellHeight-h)/2+(column%2?cellHeight*.035:0),width:w,height:h};
}
const overlapsRect=(a:DiagramPDFRect,b:DiagramPDFRect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

export function diagramPDFPlacedPanelRect(base:DiagramPDFRect,placement:{x:number;y:number;scale:number},
  plan:Pick<DiagramPDFPlan,'width'|'height'|'margin'>,startY:number,footer:number):DiagramPDFRect {
  const {width,height,margin}=plan;
  const w=Math.min(base.width*placement.scale,width-2*margin),h=Math.min(base.height*placement.scale,height-margin-footer-startY);
  return {x:Math.max(margin,Math.min(width-margin-w,base.x+(base.width-w)/2+placement.x*width)),
    y:Math.max(startY,Math.min(height-margin-footer-h,base.y+(base.height-h)/2+placement.y*height)),width:w,height:h};
}

export function planDiagramPDF(project:DiagramProject,options:DiagramPDFOptions):DiagramPDFPlan {
  const {layout,introLayout}=validateDiagramPDFOptions(options);
  const selected=selectDiagramPDFSteps(project,options),size=options.paper==='A4'?[210,297]:[297,420];
  const [w,h]=options.orientation==='portrait'?size:[size[1],size[0]],width=w*PDF_PT_PER_MM,height=h*PDF_PT_PER_MM;
  const margin=12*PDF_PT_PER_MM,gap=6*PDF_PT_PER_MM;
  const pageMargins=(index:number)=>{
    const {header,footer}=diagramPDFPageBands(options,project.name,{width,height,margin},index);
    return {header,footer};
  };
  const pages:DiagramPDFPage[]=[],overflow:DiagramPanelRef[]=[],current=project.steps.findIndex(step=>step.id===project.activeStepId);
  const galleryCover=galleryRows(project,options,'cover')[0];
  const plan:DiagramPDFPlan={width,height,margin,...pageMargins(0),gap,columns:layout.columns,rows:layout.rows,introColumns:introLayout.columns,introRows:introLayout.rows,pages,selected,
    coverStepIndex:galleryCover?galleryCover.ref.stepIndex:options.coverImage==='none'?null:options.coverImage==='current'?Math.max(0,current):project.steps.length-1};
  function placedPanel(panel:DiagramPanelRef,base:DiagramPDFRect,startY:number,footer:number):DiagramPDFRect {
    const placement=options.panelPlacements?.[diagramPDFPanelPlacementKey(project,panel,options.layoutMode)];
    return placement?diagramPDFPlacedPanelRect(base,placement,plan,startY,footer):base;
  }
  if(options.cover==='standard'||options.cover==='minimal')pages.push({kind:'cover',columns:0,rows:0,cells:[],notes:[]});
  const tree=options.scope==='all'&&project.branchSteps?.length?diagramPDFBranchPanels(project):undefined;
  const colorIndex=options.readingOrder==='snake'&&project.branchSteps?.length?diagramPDFRibbonBranchIndex(project):undefined;
  if(colorIndex)plan.ribbonBranches=colorIndex.branches;
  const firstStepPage=pages.length;
  const editedRibbonPages=new Set(Object.keys(options.ribbon?.paths??{}).filter(key=>key.includes('|branch|')).map(key=>key.split('|branch|')[0]));
  const linearRibbonPages=new Set(Object.keys(options.ribbon?.paths??{}).filter(key=>!key.includes('|branch|')));
  function treePageSpec(index:number):DiagramPDFBranchPageSpec{
    const pageIndex=firstStepPage+index,intro=options.cover==='diagram'&&index===0;
    const defaults=intro?introLayout:layout,override=options.pageLayouts?.[pageIndex];
    const {header,footer}=pageMargins(pageIndex);
    const y=intro?diagramPDFIntroLayout(plan,options,project.name).stepsY:margin+header;
    return {bounds:{x:margin,y,width:width-2*margin,height:height-margin-footer-y},paper:{x:0,y:0,width,height},gap,
      displayRect:cell=>placedPanel(tree!.refs.get(cell.id)!,cell,y,footer),fixedGridSlots:options.layoutMode!=='free',
      obstacleRects:(base,rect,columns,rows)=>{
        const panel=tree!.refs.get(base.id)!;
        const cell:DiagramPDFCell={...panel,...rect,columns,rows,descriptionLines:[],descriptionOverflow:false};
        const {descriptionLines,descriptionOverflow}=cellCaptionSettings(resolveDiagramPanel(project,cell).step,cell,options);
        return ribbonInkBoxes(project,{...cell,descriptionLines,descriptionOverflow},options,plan);
      },
      seamHeight:(from:string,to:string)=>options.ribbonSeamHeights?.[diagramPDFSeamKey(from,to)],
      ribbonWidth:diagramPDFRibbonStrokeWidth(options.ribbon),ribbon:options.ribbon,kind:intro?'intro':'steps',
      hasAuthoredRibbon:editedRibbonPages.size?page=>editedRibbonPages.has(diagramPDFRibbonKey(plan,{kind:intro?'intro':'steps',cells:page.cells})):undefined,
      savedPageSpan:cell=>options.panelPlacements?.[diagramPDFPanelPlacementKey(project,tree!.refs.get(cell.id)!,options.layoutMode)]?.branchPageSpan,
      savedEntrySlot:options.panelPlacements?cell=>{
        const key=diagramPDFPanelPlacementKey(project,tree!.refs.get(cell.id)!,options.layoutMode);
        const saved=options.panelPlacements![key];
        return saved&&(saved.entrySlot??'original');
      }:undefined,
      savedArrangement:editedRibbonPages.size||options.panelPlacements?candidates=>{
        const kind=intro?'intro':'steps';
        const fromRibbon=candidates.find(candidate=>editedRibbonPages.has(diagramPDFRibbonKey(plan,{kind,cells:candidate.cells})));
        if(fromRibbon)return fromRibbon;
        if(options.layoutMode==='free'&&options.panelPlacements){
          for(const cell of candidates[0].cells){
            const placement=options.panelPlacements[diagramPDFPanelKey(project,tree!.refs.get(cell.id)!)];
            if(placement)return candidates.find(candidate=>!!candidate.farSideStart===!!placement.farSideStart&&
              !!candidate.spreadRoute===!!placement.spreadRoute);
          }
        }
      }:undefined,
      columns:override?.columns??defaults.columns,rows:override?.rows??defaults.rows,count:override?.count,
      snake:options.readingOrder==='snake',vertical:diagramPDFSnakeDirection(options,pageIndex)==='vertical'};
  }
  const mainLeafId=tree?.nodes.filter(n=>tree.refs.get(n.id)?.branchStepId===options.sequentialMainStepId).at(-1)?.id;
  let treePages=tree&&(options.readingOrder==='snake'?layoutDiagramPDFBranchTree(tree.nodes,treePageSpec):layoutDiagramPDFSequentialBranches(tree.nodes,treePageSpec,mainLeafId));
  const branchReadingNotes=new Map<string,string[]>();
  const branchReadingStarts=new Set<string>();
  function numberBranchPanels(){
    if(!tree||!treePages)return;
    for(const ref of tree.refs.values()){
      // Number the folding chain, independently of pagination or other branches.
      const base=String(ref.stepIndex+1);
      ref.displayNumber=ref.figureIndex===undefined?base:`${base}-${ref.figureIndex+1}`;
    }
  }
  if(tree&&treePages&&options.readingOrder!=='snake'){
    for(const run of diagramPDFSequentialRuns(tree.nodes,mainLeafId).slice(1))branchReadingStarts.add(run[0].id);
    const locations=new Map(treePages.flatMap((p,i)=>p.cells.map(c=>[c.id,i+firstStepPage+1] as const)));
    numberBranchPanels();
    const label=(id:string)=>{const ref=tree.refs.get(id)!;return ref.figureIndex===undefined?`第 ${diagramPDFCaptionNumber(ref)} 步`:`过程图 ${diagramPDFCaptionNumber(ref)}`;};
    const add=(id:string,note:string)=>{const lines=branchReadingNotes.get(id)??[];lines.push(note);branchReadingNotes.set(id,lines);};
    for(const n of tree.nodes){
      const source=locations.get(n.parentId??'');
      if(source===undefined)continue;
      if(branchReadingStarts.has(n.id))add(n.id,`续第 ${source} 页 · ${label(n.parentId!)}`);
    }
  }
  if(tree&&treePages&&options.readingOrder==='snake'){
    plan.branchPagination='lanes';
    const useLanes=options.branchPagination==='lanes'||options.branchPagination?.[options.layoutMode??'grid']==='lanes';
    // A saved curve key encodes the original page geometry. A dragged drawing
    // stores its page span and base slot. Keep the old lane arrangement only
    // when it recovers actual edits that the current layout cannot place.
    function laneEdits(candidates:DiagramPDFBranchPage[]){
      const ribbons=new Set(editedRibbonPages);
      let missing=0,lastAuthoredPage=-1;
      for(const [index,page] of candidates.entries()){
        const kind=options.cover==='diagram'&&index===0?'intro':'steps';
        if(ribbons.size&&ribbons.delete(diagramPDFRibbonKey(plan,{kind,cells:page.cells})))lastAuthoredPage=index;
        if(!options.panelPlacements)continue;
        const spec=treePageSpec(index);
        for(const cell of page.cells){
          const span=spec.savedPageSpan?.(cell),pin=spec.savedEntrySlot?.(cell);
          if(!span||!pin)continue;
          if(span[0]!==page.cells[0].id||span[1]!==page.cells.at(-1)!.id||
            (pin==='original'?page.forkLanes&&cell.entrySlot:pin[0]!==cell.entrySlot?.[0]||pin[1]!==cell.entrySlot?.[1]))missing++;
          else lastAuthoredPage=index;
        }
      }
      return {missing:missing+ribbons.size,lastAuthoredPage};
    }
    if(editedRibbonPages.size||options.panelPlacements){
      let best=laneEdits(treePages);
      for(const mode of ['staggeredLanes','authoredLanes'] as const){
        if(!best.missing)break;
        const old=layoutDiagramPDFBranchTree(tree.nodes,treePageSpec,mode);
        const saved=laneEdits(old);
        if(saved.missing>=best.missing)continue;
        // Only pages through the last authored drawing or curve need their old
        // pagination. A later automatic page can use the whole sheet again.
        const candidate=saved.lastAuthoredPage===old.length-1?old:
          layoutDiagramPDFBranchTree(tree.nodes,treePageSpec,index=>index<=saved.lastAuthoredPage?mode:true);
        const edits=candidate===old?saved:laneEdits(candidate);
        if(edits.missing<best.missing){treePages=candidate;best=edits;}
      }
    }
    if(!useLanes&&(editedRibbonPages.size||Object.keys(options.panelPlacements??{}).length)){
      const modern=treePages,legacy=layoutDiagramPDFBranchTree(tree.nodes,treePageSpec,false);
      const keepOld=legacy.some((old,index)=>{
        const current=modern[index],kind=options.cover==='diagram'&&index===0?'intro':'steps';
        const oldKey=diagramPDFRibbonKey(plan,{kind,cells:old.cells});
        if(editedRibbonPages.has(oldKey)&&(!current||oldKey!==diagramPDFRibbonKey(plan,{kind,cells:current.cells})))return true;
        if(!options.panelPlacements)return false;
        const slots=new Map(current?.cells.map(cell=>[cell.id,cell]));
        return old.cells.some(cell=>{
          const saved=options.panelPlacements![diagramPDFPanelPlacementKey(project,tree.refs.get(cell.id)!,options.layoutMode)];
          const slot=slots.get(cell.id);
          return saved&&(!slot||slot.x!==cell.x||slot.y!==cell.y||slot.width!==cell.width||slot.height!==cell.height);
        });
      });
      if(keepOld){treePages=legacy;plan.branchPagination='legacy';}
    }
  }
  if(tree)plan.selected=tree.nodes.filter(node=>node.figureIndex===undefined).map(node=>node.stepIndex);
  const routeLabels=!tree&&project.branchSteps?.length?diagramBranchNumbering(project).stepLabels:undefined;
  if(tree&&treePages&&options.readingOrder==='snake'){
    numberBranchPanels();
  }
  const panels:DiagramPanelRef[]=tree?[...tree.refs.values()]:selected.flatMap(stepIndex=>{
    const step=project.steps[stepIndex];
    const ref=routeLabels?{stepIndex,branchLabel:routeLabels.get(step.id),displayNumber:String(stepIndex+1)}:{stepIndex};
    return [ref,...(step.processFigures??[]).map((_,figureIndex)=>({...ref,figureIndex,...(routeLabels?{displayNumber:`${stepIndex+1}-${figureIndex+1}`}:{})}))];
  });
  const resultCount=galleryItems(project,options,'result').length;
  let offset=0,enterAtBottom=false,legacyEnterAtBottom=false,placedResults=0,fitIntroRows=false;
  while(offset<panels.length) {
    const {header,footer}=pageMargins(pages.length);
    const pagePlan={...plan,header,footer};
    const intro=options.cover==='diagram'&&offset===0,defaults=intro?introLayout:layout,override=options.pageLayouts?.[pages.length];
    const treePage=treePages?.[pages.length-firstStepPage];
    const columns=treePage?.columns??override?.columns??defaults.columns,requestedRows=treePage?.rows??override?.rows??defaults.rows;
    const count=treePage?.cells.length??Math.min(panels.length-offset,override?.count??columns*requestedRows);
    const free=options.layoutMode==='free',snake=options.readingOrder==='snake';
    const vertical=diagramPDFSnakeDirection(options,pages.length)==='vertical';
    // A page with a specified grid keeps every slot. Its panel sizes and
    // positions still use the free composition in gridSlotRect.
    const fixedGrid=override?.rows!==undefined||override?.columns!==undefined;
    const fitRows=free&&!snake&&!vertical&&(!fixedGrid||intro&&fitIntroRows);
    const {rows,slots:original,available}=pageSlots(columns,requestedRows,count,vertical,snake,!treePage&&free&&!fixedGrid,!treePage&&fitRows);
    const startY=intro?diagramPDFIntroLayout(plan,options,project.name).stepsY:margin+header;
    const pagePanels=treePage?treePage.cells.map(cell=>tree!.refs.get(cell.id)!):panels.slice(offset,offset+count);
    let slots=original,bottomUp:boolean=enterAtBottom,spreadRoute=false;
    if(!treePage&&snake&&options.ribbon?.enabled){
      const optimized=!vertical&&offset+count<panels.length?closeRibbonOnRight(original):original;
      const legacySide:boolean=legacyEnterAtBottom;
      const rectOn=(slot:GridSlot,bottom:boolean)=>gridSlotRect(pagePlan,startY,columns,rows,slot,bottom,options,free,vertical);
      const oldSlot=rectOn(original.at(-1)!,legacySide);
      const oldLast=free?placedPanel(pagePanels.at(-1)!,oldSlot,startY,footer):oldSlot;
      const mid=(startY+height-margin-footer)/2;
      if(Math.abs(oldLast.y+oldLast.height/2-mid)>.001)legacyEnterAtBottom=oldLast.y+oldLast.height/2>mid;
      // Old files store offsets against the pre-spread grid and key their
      // edited ribbon by that grid's exact rectangles. Retain that base.
      const placement=free&&options.panelPlacements&&pagePanels.map(p=>options.panelPlacements![diagramPDFPanelKey(project,p)]).find(Boolean);
      const pathKey=(order:GridSlot[],bottom:boolean)=>diagramPDFRibbonKey(plan,{kind:intro?'intro':'steps',
        cells:pagePanels.map((panel,i)=>({...panel,...rectOn(order[i],bottom)}))});
      if((placement&&!placement.spreadRoute)||(linearRibbonPages.size>0&&linearRibbonPages.has(pathKey(original,legacySide)))){
        bottomUp=legacySide;
      }else{
        slots=optimized;
        if(placement)bottomUp=!!placement.farSideStart;
        else if(linearRibbonPages.size>0&&linearRibbonPages.has(pathKey(optimized,!bottomUp)))bottomUp=!bottomUp;
        spreadRoute=slots!==original||bottomUp!==legacySide;
      }
    }
    const slotRect=(slot:GridSlot):DiagramPDFRect=>gridSlotRect(pagePlan,startY,columns,rows,slot,bottomUp,options,free,vertical);
    const slotRects=slots.map(slotRect);
    const captionRows:DiagramPDFCell[][]=Array.from({length:rows},()=>[]);
    const cells=pagePanels.map((panel,slot)=>{
      const treeCell=treePage?.cells[slot],row=treeCell?.row??slots[slot].row,baseRect=treeCell??slotRects[slot];
      const rect=placedPanel(panel,baseRect,startY,footer);
      const cell:DiagramPDFCell={...panel,...rect,...(treeCell?{branchNodeId:treeCell.id,entrySlot:treeCell.entrySlot}:{}),baseRect,columns,rows,descriptionLines:[],descriptionOverflow:false};
      if(treeCell&&branchReadingNotes.has(treeCell.id))cell.branchReadingNotes=branchReadingNotes.get(treeCell.id);
      if(treeCell&&branchReadingStarts.has(treeCell.id))cell.branchReadingStart=true;
      if(snake){
        const stepId=panel.branchStepId??project.steps[panel.stepIndex].id;
        cell.ribbonNodeId=treeCell?.id??diagramPDFRibbonNodeId(stepId,panel.figureIndex===undefined?undefined:project.steps[panel.stepIndex].processFigures![panel.figureIndex].activeStepId);
        cell.branchColorStepId=colorIndex?.byStep.get(stepId);
      }
      const caption=cellCaptionSettings(resolveDiagramPanel(project,cell).step,cell,options);
      cell.descriptionLines=caption.descriptionLines;cell.descriptionOverflow=caption.descriptionOverflow;
      if(!treeCell&&rect===baseRect&&!(free&&vertical))captionRows[row].push(cell);
      return cell;
    });
    for(const row of captionRows){
      if(row.length>1){
        const top=Math.min(...row.map(cell=>diagramPDFCellContent(resolveDiagramPanel(project,cell).step,cell,options,plan).captionRect.y));
        for(const cell of row)cell.rowCaptionTop=top;
      }
    }
    if(snake&&options.ribbon?.enabled)for(const cell of cells)cell.ribbonInk=diagramPDFPanelRibbonInk(project,cell,options,plan);
    if(intro&&cells.some(cell=>diagramPDFCellContent(resolveDiagramPanel(project,cell).step,cell,options,plan).imageRect.height<24)){
      // Earlier free layouts could store unused rows even though the intro
      // always fitted its actual panels. Keep those projects exportable.
      if(free&&!snake&&!vertical&&!fitRows&&rows>slots.at(-1)!.row+1){fitIntroRows=true;continue;}
      throw new Error('首页文字较多，折图空间不足。请减少首页行数，或精简首页信息、步骤标题。');
    }
    for(const cell of cells)if(cell.descriptionOverflow)overflow.push(cell);
    if(snake){
      const last=free?cells.at(-1)!:cells.at(-1)!.baseRect!,middle=(startY+height-margin-footer)/2;
      const exitY=last.y+last.height/2;
      if(Math.abs(exitY-middle)>0.001)enterAtBottom=exitY>middle;
    }
    const page:DiagramPDFPage={kind:intro?'intro':'steps',columns,rows,cells,notes:[],header,footer};
    if(spreadRoute){
      page.spreadRoute=true;
      if(bottomUp)page.farSideStart=true;
    }
    if(treePage){
      if(treePage.farSideStart)page.farSideStart=true;
      if(treePage.spreadRoute)page.spreadRoute=true;
      const adjusted=new Map(treePage.cells.map((base,i)=>[base.id,{x:cells[i].x-base.x+(cells[i].width-base.width)/2,y:cells[i].y-base.y+(cells[i].height-base.height)/2}]));
      page.branchEdges=treePage.edges.map(edge=>{
        const from=adjusted.get(edge.from),to=adjusted.get(edge.to);
        const branchColorStepId=colorIndex?.byStep.get(tree!.refs.get(edge.to)!.branchStepId!);
        if(snake&&edge.kind!=='local')return {...edge,branchColorStepId,otherPage:edge.otherPage!+firstStepPage};
        return {...edge,branchColorStepId,otherPage:edge.otherPage===undefined?undefined:edge.otherPage+firstStepPage,
          points:edge.points.map(([x,y],i):[number,number]=>{
            const t=i/(edge.points.length-1);
            return [x+(from?.x??0)*(1-t)+(to?.x??0)*t,y+(from?.y??0)*(1-t)+(to?.y??0)*t];
          })};
      });
    }
    if(offset+count===panels.length&&resultCount){
      // Place results around the finished step layout, including hand-moved
      // panels and their captions. Adding views must not reflow the steps.
      const rects=available.map(slotRect),last=cells[cells.length-1];
      const distance=(rect:DiagramPDFRect)=>Math.hypot(rect.x+rect.width/2-last.x-last.width/2,rect.y+rect.height/2-last.y-last.height/2);
      const lastIndex=rects.reduce((best,rect,i)=>distance(rect)<distance(rects[best])?i:best,0);
      const occupied=cells.flatMap(cell=>{
        const {captionLines}=diagramPDFCellContent(resolveDiagramPanel(project,cell).step,cell,options,plan);
        const captions=captionLines.map(line=>{
          const width=captionTextWidth(line.text,line.fontSize,line.bold);
          const x=line.x-(line.align==='right'?width:line.align==='center'?width/2:0);
          return {x,y:line.y,width,height:line.fontSize*1.4};
        });
        return [cell,...captions];
      });
      const ordered=rects.slice(lastIndex+1).concat(rects.slice(0,lastIndex+1));
      const resultSlots=ordered.filter(slot=>!occupied.some(rect=>overlapsRect(slot,rect))).slice(0,resultCount);
      placedResults=resultSlots.length;
      if(placedResults)page.resultGallery={start:0,count:placedResults,slots:resultSlots};
      if(snake&&placedResults){
        const end=resultSlots[placedResults-1];
        enterAtBottom=end.y+end.height/2>(startY+height-margin-footer)/2;
      }
    }
    pages.push(page);offset+=cells.length;
  }
  for(let start=placedResults;start<resultCount;){
    const {header,footer}=pageMargins(pages.length);
    const pagePlan={...plan,header,footer};
    const override=options.pageLayouts?.[pages.length];
    const columns=override?.columns??layout.columns,rows=override?.rows??layout.rows;
    const count=Math.min(columns*rows,resultCount-start);
    const startY=margin+header,snake=options.readingOrder==='snake';
    const vertical=diagramPDFSnakeDirection(options,pages.length)==='vertical';
    const slots=pageSlots(columns,rows,count,vertical,snake,false).available.slice(0,count)
      .map(slot=>gridSlotRect(pagePlan,startY,columns,rows,slot,snake&&enterAtBottom,options,false,vertical));
    pages.push({kind:'gallery',columns,rows,cells:[],notes:[],header,footer,resultGallery:{start,count,slots}});
    const end=slots[count-1];
    if(snake)enterAtBottom=end.y+end.height/2>(startY+height-margin-footer)/2;
    start+=count;
  }
  // Keep all long explanations, rather than silently clipping them in a dense grid.
  let notesPage:DiagramPDFPage|undefined,y=0;
  for(const panel of overflow) {
    const lines=wrapDiagramPDFText(resolveDiagramPanel(project,panel).step.description,width-margin*2,10),remaining=[...lines];let continued=false;
    while(remaining.length) {
      if(!notesPage){
        const {header,footer}=pageMargins(pages.length);
        notesPage={kind:'notes',columns:1,rows:0,cells:[],notes:[],header,footer};pages.push(notesPage);y=margin+header+26;
      }
      const count=Math.floor((height-margin-(notesPage.footer??plan.footer)-y-24)/15);
      if(count<2&&!notesPage.notes.length)throw new Error('页眉与页脚之间的空间不足以容纳步骤说明，请减少文字或距纸边距离。');
      if(count<2){notesPage=undefined;continue;}
      const chunk=remaining.splice(0,count),noteHeight=24+chunk.length*15;
      notesPage.notes.push({...panel,lines:chunk,continued,x:margin,y,width:width-margin*2,height:noteHeight});y+=noteHeight+18;continued=true;
      if(remaining.length)notesPage=undefined;
    }
  }
  if(!tree&&options.readingOrder==='snake'){
    let previous:number|undefined;
    for(const [i,page] of pages.entries()){
      if(!page.cells.length)continue;
      if(previous!==undefined){
        const source=pages[previous],key=diagramPDFSeamKey(source.cells.at(-1)!.ribbonNodeId!,page.cells[0].ribbonNodeId!);
        source.linearSeams={...source.linearSeams,outgoing:{key,otherPage:i}};
        page.linearSeams={incoming:{key,otherPage:previous}};
      }
      previous=i;
    }
  }
  return plan;
}
/** Small reading arrows stay entirely in grid gutters. They connect adjacent
 * numbered steps only on the same page; artwork and captions never mirror. */
export function diagramPDFReadingGuides(page:DiagramPDFPage,options:DiagramPDFOptions):{from:[number,number];to:[number,number];start:number;end:number;labels:[string,string]}[] {
  if(page.branchEdges||options.readingOrder!=='snake'||options.ribbon?.enabled)return [];
  return page.cells.slice(1).map((next,index)=>{
    const previous=page.cells[index];let from:[number,number],to:[number,number];
    const direction=diagramPDFTransitionDirection(previous,next);
    if(direction==='right'||direction==='left'){
      const forward=direction==='right',lo=forward?previous.x+previous.width:next.x+next.width,hi=forward?next.x:previous.x,pad=Math.max(0,hi-lo)*.2,y=(previous.y+previous.height*.45+next.y+next.height*.45)/2;
      from=[forward?lo+pad:hi-pad,y];to=[forward?hi-pad:lo+pad,y];
    }else{
      const down=direction==='bottom',lo=down?previous.y+previous.height:next.y+next.height,hi=down?next.y:previous.y,pad=Math.max(0,hi-lo)*.2,x=(previous.x+previous.width/2+next.x+next.width/2)/2;
      from=[x,down?lo+pad:hi-pad];to=[x,down?hi-pad:lo+pad];
    }
    return {from,to,start:previous.stepIndex+1,end:next.stepIndex+1,labels:[diagramPDFCaptionNumber(previous),diagramPDFCaptionNumber(next)]};
  });
}
export function diagramPDFStepLabel(step:DiagramStep,index:number,figureIndex?:number,branchLabel?:string,displayNumber?:string) {const title=step.title.trim();return `${displayNumber??diagramPanelNumber({stepIndex:index,figureIndex,branchLabel})}.${title&&!/^步骤\s*\d+$/.test(title)?' '+title:''}`;}
