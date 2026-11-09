import type {Doc} from '../core/types';
import type {DiagramProject,DiagramStep} from './diagramProject';

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
export interface DiagramPDFOptions {
  paper:'A4'|'A3';orientation:'portrait'|'landscape';layout:DiagramPDFLayout;
  /** Omitted in older settings: each row reads left to right. */
  readingOrder?:'rows'|'snake';
  scope:'all'|'current'|'range';rangeStart:number;rangeEnd:number;
  cover:'diagram'|'standard'|'minimal'|'none';coverImage:'last'|'current'|'none';
  /** The diagram first page has its own grid, independent of later pages. */
  introLayout?:DiagramPDFLayout;
  title:string;author:string;paperInfo:string;coverCP:boolean;coverCPDoc?:Doc;coverCPLabel?:string;
  designer?:string;designDate?:string;diagramDate?:string;headerNote?:string;
  descriptions:boolean;pageNumbers:boolean;
}
export const PDF_PT_PER_MM=72/25.4;
export function defaultDiagramPDFOptions(project:DiagramProject):DiagramPDFOptions {
  const doc=project.states[0]?.doc;
  return {paper:'A4',orientation:'portrait',layout:'3x4',introLayout:'3x3',readingOrder:'rows',scope:'all',rangeStart:1,rangeEnd:project.steps.length,
    cover:'diagram',coverImage:'last',title:project.name,author:'',designer:'',designDate:'',diagramDate:'',headerNote:'',paperInfo:doc?`${doc.paper.width} × ${doc.paper.height} mm`:'',coverCP:true,descriptions:true,pageNumbers:true};
}
export interface DiagramPDFRect {x:number;y:number;width:number;height:number}
export interface DiagramPDFCell extends DiagramPDFRect {stepIndex:number;columns:number;rows:number;descriptionLines:string[];descriptionOverflow:boolean}
export interface DiagramPDFNote extends DiagramPDFRect {stepIndex:number;lines:string[];continued:boolean}
export interface DiagramPDFPage {kind:'intro'|'cover'|'steps'|'notes';columns:number;rows:number;cells:DiagramPDFCell[];notes:DiagramPDFNote[]}
export interface DiagramPDFPlan {width:number;height:number;margin:number;header:number;footer:number;gap:number;columns:number;rows:number;introColumns:number;introRows:number;pages:DiagramPDFPage[];selected:number[];coverStepIndex:number|null}
export interface DiagramPDFCaptionLine {text:string;x:number;y:number;fontSize:number;bold:boolean;muted:boolean;kind:'title'|'description'|'continuation'}
export interface DiagramPDFIntroGeometry {info:DiagramPDFRect;image:DiagramPDFRect;cp:DiagramPDFRect|null;noteRect:DiagramPDFRect|null;noteLines:string[];noteFont:number;noteLineHeight:number;dividerY:number;stepsY:number;titleFont:number;metadataFont:number}
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
  if(options.scope!=='all')throw new Error('导出步骤范围无效。');
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
export function diagramPDFIntroLayout(plan:DiagramPDFPlan,options:DiagramPDFOptions,projectTitle='折序图解'):DiagramPDFIntroGeometry {
  const width=plan.width-plan.margin*2,columnGap=plan.gap*.7,columnWidth=(width-columnGap*2)/3;
  const hasImage=plan.coverStepIndex!==null,visualCount=Number(hasImage)+Number(options.coverCP);
  const side=Math.min(columnWidth-8,plan.height*.2),scale=Math.min(1.35,Math.max(1,side/156));
  const titleFont=20*scale,metadataFont=10.5*scale,noteFont=7.5*scale,noteLineHeight=10*scale;
  const infoWidth=visualCount===2?columnWidth:visualCount===1?width-side-columnGap:width;
  const metrics=introTextMetrics(options.title.trim()||projectTitle,options,infoWidth,titleFont,metadataFont);
  const shortNote=options.headerNote?.trim()?wrapDiagramPDFText(options.headerNote.trim(),infoWidth,noteFont):[];
  const inlineNote=shortNote.length<=3;
  const noteLines=inlineNote?shortNote:wrapDiagramPDFText(options.headerNote!.trim(),width,noteFont);
  const noteHeight=noteLines.length*noteLineHeight;
  // Size the header from its visible content. Short notes follow the metadata,
  // instead of being pinned to the bottom of a fixed quarter-page rectangle.
  const infoHeight=metrics.height+(inlineNote?noteHeight:0),bodyHeight=Math.max(infoHeight,visualCount?side:0)+4;
  const info={x:plan.margin,y:plan.margin,width:infoWidth,height:infoHeight};
  const imageX=visualCount===2?plan.margin+columnWidth+columnGap+(columnWidth-side)/2:plan.width-plan.margin-side;
  const image={x:imageX,y:plan.margin+(bodyHeight-(hasImage?side:0))/2,width:hasImage?side:0,height:hasImage?side:0};
  const cp=options.coverCP?{x:plan.width-plan.margin-side,y:plan.margin+(bodyHeight-side)/2,width:side,height:side}:null;
  const noteRect=noteLines.length?{x:plan.margin,y:plan.margin+(inlineNote?metrics.height:bodyHeight+6),width:inlineNote?infoWidth:width,height:noteHeight}:null;
  const dividerY=plan.margin+bodyHeight+(!inlineNote&&noteLines.length?6+noteHeight:0)+8;
  return {info,image,cp,noteRect,noteLines,noteFont,noteLineHeight,dividerY,stepsY:dividerY+plan.gap*.8,titleFont,metadataFont};
}
function limitedTextLines(value:string,width:number,font:number,count:number) {
  const lines=wrapDiagramPDFText(value,width,font);
  if(lines.length<=count)return lines;
  const kept=lines.slice(0,count),last=Array.from(kept[count-1]);
  kept[count-1]=last.slice(0,Math.max(0,last.length-1)).join('')+'…';return kept;
}
function introTextMetrics(title:string,options:DiagramPDFOptions,width:number,titleFont:number,metadataFont:number) {
  const titleLines=limitedTextLines(title,width,titleFont,2),scale=titleFont/20;
  const design=[options.designer?.trim(),options.designDate?.trim()].filter(Boolean).join(' · ');
  const diagram=[options.author.trim(),options.diagramDate?.trim()].filter(Boolean).join(' · ');
  const rows=[{label:'设计 / Designer',value:design},{label:'制图 / Diagrams',value:diagram},{label:'纸张 / Paper',value:options.paperInfo.trim()}]
    .filter(row=>row.value).map(row=>({...row,lines:limitedTextLines(row.value,width,metadataFont,2)}));
  const titleGap=10*scale,rowGap=7*scale;
  const height=titleLines.length*titleFont*1.25+(rows.length||options.headerNote?.trim()?titleGap:0)+rows.reduce((total,row)=>total+(1+row.lines.length)*metadataFont*1.3+rowGap,0);
  return {titleLines,rows,titleGap,rowGap,height};
}
/** The same information text coordinates are used in preview and export. Long
 * individual fields are bounded to their column rather than crossing the rule. */
export function diagramPDFIntroText(project:DiagramProject,options:DiagramPDFOptions,geometry:DiagramPDFIntroGeometry):DiagramPDFCaptionLine[] {
  const lines:DiagramPDFCaptionLine[]=[],{info}=geometry,metrics=introTextMetrics(options.title.trim()||project.name,options,info.width,geometry.titleFont,geometry.metadataFont);let y=info.y;
  for(const value of metrics.titleLines) {
    lines.push({text:value,x:info.x,y,fontSize:geometry.titleFont,bold:true,muted:false,kind:'title'});y+=geometry.titleFont*1.25;
  }
  y+=metrics.titleGap;
  const metadataFont=geometry.metadataFont;
  for(const row of metrics.rows) {
    lines.push({text:row.label,x:info.x,y,fontSize:metadataFont,bold:true,muted:false,kind:'description'});y+=metadataFont*1.3;
    for(const line of row.lines) {
      lines.push({text:line,x:info.x,y,fontSize:metadataFont,bold:false,muted:false,kind:'description'});y+=metadataFont*1.3;
    }y+=metrics.rowGap;
  }
  if(geometry.noteRect)geometry.noteLines.forEach((line,index)=>lines.push({text:line,x:geometry.noteRect!.x,y:geometry.noteRect!.y+index*geometry.noteLineHeight,fontSize:geometry.noteFont,bold:false,muted:true,kind:'description'}));
  return lines;
}
function cellCaptionSettings(step:DiagramStep,cell:Pick<DiagramPDFCell,'stepIndex'|'width'|'height'|'columns'|'rows'>,options:DiagramPDFOptions) {
  const font=diagramPDFStepFont(cell.columns),titleFont=font+1,lineHeight=font*1.5,titleLineHeight=titleFont*1.4;
  const titleLines=limitedTextLines(diagramPDFStepLabel(step,cell.stepIndex),cell.width,titleFont,2);
  const titleHeight=Math.max(1,titleLines.length)*titleLineHeight;
  const preferred=cell.rows<=2?7:cell.rows===3?4:3,budget=Math.min(cell.height*.42,100);
  let maxDescriptionLines=Math.max(0,Math.min(preferred,Math.floor((budget-titleHeight-4)/lineHeight)));
  const description=options.descriptions&&step.description.trim()?wrapDiagramPDFText(step.description,cell.width,font):[];
  if(description.length>maxDescriptionLines)maxDescriptionLines=Math.max(0,maxDescriptionLines-1);
  return {font,titleFont,lineHeight,titleLineHeight,description,descriptionLines:description.slice(0,maxDescriptionLines),descriptionOverflow:description.length>maxDescriptionLines};
}
export function diagramPDFCellContent(step:DiagramStep,cell:DiagramPDFCell,options:DiagramPDFOptions,plan:DiagramPDFPlan) {
  const font=diagramPDFStepFont(cell.columns??plan.columns),titleFont=font+1,lineHeight=font*1.5,titleLineHeight=titleFont*1.4;
  const titleLines=limitedTextLines(diagramPDFStepLabel(step,cell.stepIndex),cell.width,titleFont,2);
  const descriptionLines=options.descriptions?cell.descriptionLines:[],overflow=options.descriptions&&cell.descriptionOverflow;
  const captionHeight=titleLines.length*titleLineHeight+(descriptionLines.length?3+descriptionLines.length*lineHeight:0)+(overflow?lineHeight:0);
  const captionRect={x:cell.x,y:cell.y+cell.height-captionHeight,width:cell.width,height:captionHeight};
  const imageRect={x:cell.x,y:cell.y,width:cell.width,height:Math.max(1,captionRect.y-cell.y-6)};
  const captionLines:DiagramPDFCaptionLine[]=[];let y=captionRect.y;
  titleLines.forEach(value=>{captionLines.push({text:value,x:cell.x,y,fontSize:titleFont,bold:true,muted:false,kind:'title'});y+=titleLineHeight;});
  if(descriptionLines.length)y+=3;
  descriptionLines.forEach(value=>{captionLines.push({text:value,x:cell.x,y,fontSize:font,bold:false,muted:false,kind:'description'});y+=lineHeight;});
  if(overflow)captionLines.push({text:'完整说明见文末',x:cell.x,y,fontSize:font,bold:false,muted:true,kind:'continuation'});
  return {font,titleFont,lineHeight,imageRect,captionRect,captionLines};
}
export function diagramPDFCaptionLines(step:DiagramStep,cell:DiagramPDFCell,options:DiagramPDFOptions,plan:DiagramPDFPlan) {return diagramPDFCellContent(step,cell,options,plan).captionLines;}
export function diagramPDFFooterLayout(plan:DiagramPDFPlan,pageIndex:number) {
  const label=String(pageIndex+1).padStart(3,'0'),x=plan.width/2,y=plan.height-plan.margin+11,fontSize=8;
  const ruleY=y+fontSize*.65,halfLabel=label.length*fontSize*.556/2,ruleWidth=18;
  return {label,x,y,fontSize,rule:{x:x-18,y:ruleY,width:36},leftRule:{x:x-halfLabel-8-ruleWidth,y:ruleY,width:ruleWidth},rightRule:{x:x+halfLabel+8,y:ruleY,width:ruleWidth}};
}
export function planDiagramPDF(project:DiagramProject,options:DiagramPDFOptions):DiagramPDFPlan {
  if(options.readingOrder!==undefined&&!['rows','snake'].includes(options.readingOrder))throw new Error('PDF 阅读顺序无效。');
  if(!['A4','A3'].includes(options.paper)||!['portrait','landscape'].includes(options.orientation)||!['diagram','standard','minimal','none'].includes(options.cover)||!['last','current','none'].includes(options.coverImage))throw new Error('PDF 纸张或封面选项无效。');
  for(const key of ['title','author','paperInfo'] as const)if(typeof options[key]!=='string'||options[key].length>(key==='paperInfo'?160:120))throw new Error('标题和作者最多 120 字，纸张信息最多 160 字。');
  for(const key of ['designer','designDate','diagramDate','headerNote'] as const)if(options[key]!==undefined&&(typeof options[key]!=='string'||options[key]!.length>(key==='headerNote'?160:key.endsWith('Date')?40:120)))throw new Error('设计者最多 120 字，日期最多 40 字，首页小字最多 160 字。');
  for(const key of ['coverCP','descriptions','pageNumbers'] as const)if(typeof options[key]!=='boolean')throw new Error('PDF 显示选项无效。');
  const layout=DIAGRAM_PDF_LAYOUTS.find(item=>item.id===options.layout);if(!layout)throw new Error('PDF 排版无效。');
  const introLayout=DIAGRAM_PDF_LAYOUTS.find(item=>item.id===(options.introLayout??'3x3'));if(!introLayout)throw new Error('PDF 首页步骤排版无效。');
  const selected=selectDiagramPDFSteps(project,options),size=options.paper==='A4'?[210,297]:[297,420];
  const [w,h]=options.orientation==='portrait'?size:[size[1],size[0]],width=w*PDF_PT_PER_MM,height=h*PDF_PT_PER_MM;
  const margin=12*PDF_PT_PER_MM,header=19,footer=18,gap=6*PDF_PT_PER_MM;
  const pages:DiagramPDFPage[]=[],overflow:number[]=[],current=project.steps.findIndex(step=>step.id===project.activeStepId);
  const plan:DiagramPDFPlan={width,height,margin,header,footer,gap,columns:layout.columns,rows:layout.rows,introColumns:introLayout.columns,introRows:introLayout.rows,pages,selected,
    coverStepIndex:options.coverImage==='none'?null:options.coverImage==='current'?Math.max(0,current):project.steps.length-1};
  if(options.cover==='standard'||options.cover==='minimal')pages.push({kind:'cover',columns:0,rows:0,cells:[],notes:[]});
  let offset=0;
  while(offset<selected.length) {
    const intro=options.cover==='diagram'&&offset===0,pageLayout=intro?introLayout:layout,columns=pageLayout.columns,rows=pageLayout.rows;
    const startY=intro?diagramPDFIntroLayout(plan,options,project.name).stepsY:margin+header;
    const cellWidth=(width-margin*2-gap*(columns-1))/columns,cellHeight=(height-margin-footer-startY-gap*(rows-1))/rows;
    const capacity=columns*rows;
    const cells=selected.slice(offset,offset+capacity).map((stepIndex,slot)=>{
      const row=Math.floor(slot/columns),column=options.readingOrder==='snake'&&row%2===1?columns-1-slot%columns:slot%columns;
      const cell={stepIndex,columns,rows,x:margin+column*(cellWidth+gap),y:startY+row*(cellHeight+gap),width:cellWidth,height:cellHeight,descriptionLines:[] as string[],descriptionOverflow:false};
      const caption=cellCaptionSettings(project.steps[stepIndex],cell,options);
      cell.descriptionLines=caption.descriptionLines;cell.descriptionOverflow=caption.descriptionOverflow;
      if(cell.descriptionOverflow)overflow.push(stepIndex);return cell;
    });
    if(intro&&cells.some(cell=>diagramPDFCellContent(project.steps[cell.stepIndex],cell,options,plan).imageRect.height<24))throw new Error('首页文字较多，折图空间不足。请减少首页行数，或精简首页信息、步骤标题。');
    pages.push({kind:intro?'intro':'steps',columns,rows,cells,notes:[]});offset+=cells.length;
  }
  // Keep all long explanations, rather than silently clipping them in a dense grid.
  let notesPage:DiagramPDFPage|undefined,y=margin+header+26;
  for(const stepIndex of overflow) {
    const lines=wrapDiagramPDFText(project.steps[stepIndex].description,width-margin*2,10),remaining=[...lines];let continued=false;
    while(remaining.length) {
      if(!notesPage){notesPage={kind:'notes',columns:1,rows:0,cells:[],notes:[]};pages.push(notesPage);y=margin+header+26;}
      const count=Math.floor((height-margin-footer-y-24)/15);
      if(count<2){notesPage=undefined;continue;}
      const chunk=remaining.splice(0,count),noteHeight=24+chunk.length*15;
      notesPage.notes.push({stepIndex,lines:chunk,continued,x:margin,y,width:width-margin*2,height:noteHeight});y+=noteHeight+18;continued=true;
      if(remaining.length)notesPage=undefined;
    }
  }
  return plan;
}
/** Small reading arrows stay entirely in grid gutters. They connect adjacent
 * numbered steps only on the same page; artwork and captions never mirror. */
export function diagramPDFReadingGuides(page:DiagramPDFPage,options:DiagramPDFOptions):{from:[number,number];to:[number,number];start:number;end:number}[] {
  if(options.readingOrder!=='snake')return [];
  return page.cells.slice(1).map((next,index)=>{
    const previous=page.cells[index];let from:[number,number],to:[number,number];
    if(previous.y===next.y){
      const forward=next.x>previous.x,lo=forward?previous.x+previous.width:next.x+next.width,hi=forward?next.x:previous.x,pad=(hi-lo)*.2,y=previous.y+previous.height*.45;
      from=[forward?lo+pad:hi-pad,y];to=[forward?hi-pad:lo+pad,y];
    }else{
      const lo=previous.y+previous.height,hi=next.y,pad=(hi-lo)*.2,x=previous.x+previous.width/2;
      from=[x,lo+pad];to=[x,hi-pad];
    }
    return {from,to,start:previous.stepIndex+1,end:next.stepIndex+1};
  });
}
export function diagramPDFStepLabel(step:DiagramStep,index:number) {const title=step.title.trim();return `${index+1}.${title&&!/^步骤\s*\d+$/.test(title)?' '+title:''}`;}
