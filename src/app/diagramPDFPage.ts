import type {DiagramProject} from './diagramProject';
import {diagramPDFStepSVG,diagramPDFCoverSVG} from './diagramPDF';
import {diagramPDFStepLabel,diagramPDFIntroLayout,diagramPDFIntroText,diagramPDFCellContent,diagramPDFFooterLayout,diagramPDFReadingGuides,wrapDiagramPDFText,type DiagramPDFOptions,type DiagramPDFRect,type DiagramPDFPlan} from './diagramPDFLayout';
import {completeCreasePatternSVG as creasePatternSVG} from './creasePatternExport';
import {defaultCreaseDisplay} from './creaseDisplay';
import type {DiagramLineDefaults} from './diagramLineStyles';

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
export function diagramPDFPageSVG(project:DiagramProject,options:DiagramPDFOptions,plan:DiagramPDFPlan,pageIndex:number,palette:DiagramLineDefaults,adaptiveLines:boolean):string {
  const page=plan.pages[pageIndex];if(!page)throw new Error('PDF 页码无效。');
  const parts:string[]=[`<rect width="${plan.width}" height="${plan.height}" fill="white"/>`];
  const text=(s:string,x:number,y:number,size:number,muted=false,bold=false,center=false)=>parts.push(`<text x="${x}" y="${y}" dominant-baseline="text-before-edge" font-size="${size}" fill="${muted?MUTED:INK}" font-weight="${bold?600:400}"${center?' text-anchor="middle"':''}>${escape(s)}</text>`);
  const rule=(x:number,y:number,width:number,stroke=INK,weight=1)=>parts.push(`<path d="M ${x} ${y} h ${width}" fill="none" stroke="${stroke}" stroke-width="${weight}"/>`);
  let panel=0;
  const artwork=(svg:string,box:DiagramPDFRect)=>parts.push(embedDiagramPDFSVG(svg,box,`p${pageIndex}-art${panel++}-`));
  const cover=(box:DiagramPDFRect)=>{if(plan.coverStepIndex!==null){
    const step=project.steps[plan.coverStepIndex];artwork(diagramPDFCoverSVG(project,step,palette,adaptiveLines,box),box);
    if(!step.pose&&!step.images?.length&&step.paperVisible!==false)text('完成姿态未保存 · 显示 CP',box.x,box.y+box.height-10,7,true);
  }};
  const cp=(box:DiagramPDFRect)=>{
    const doc=options.coverCPDoc??project.states.at(-1)?.doc;
    if(doc)artwork(creasePatternSVG(doc,defaultCreaseDisplay(),undefined,undefined,{enabled:adaptiveLines,units:Math.max(doc.paper.width/(box.width*96/72),doc.paper.height/(box.height*96/72))}),box);
  };
  const title=options.title.trim()||project.name;
  if(page.kind==='cover'){
    const size=title.length>50?20:28,y=plan.margin+(options.cover==='standard'?38:14),lines=wrapDiagramPDFText(title,plan.width-plan.margin*2-24,size),bottom=y+lines.length*size*1.4;
    lines.forEach((s,i)=>text(s,plan.width/2,y+i*size*1.4,size,false,true,true));rule(plan.width*.36,bottom+12,plan.width*.28,'#dae1d9',.7);
    const meta=[options.author.trim()?'绘图 / '+options.author.trim():'',options.paperInfo.trim()?options.paperInfo.trim():'',plan.selected.length+' 个步骤'].filter(Boolean).join(' · '),metaLines=wrapDiagramPDFText(meta,plan.width-plan.margin*2-32,10);
    metaLines.forEach((s,i)=>text(s,plan.width/2,bottom+25+i*15,10,true,false,true));
    const imageY=bottom+25+metaLines.length*15+18,end=plan.height-plan.margin-22,cpSize=options.coverCP?Math.min(120,plan.width*.24):0;
    const box={x:plan.margin+12,y:imageY,width:plan.width-plan.margin*2-24,height:Math.max(80,end-imageY-(options.coverCP?cpSize+38:0))};
    if(plan.coverStepIndex!==null)cover(box);else text('折序图解',plan.width/2,imageY+box.height/2,14,true,false,true);
    if(options.coverCP){const box={x:(plan.width-cpSize)/2,y:end-cpSize-12,width:cpSize,height:cpSize};cp(box);text(options.coverCPLabel??'CP · 最后状态',box.x,end-4,8,true);}
  }else{
    if(page.kind==='intro'){
      const intro=diagramPDFIntroLayout(plan,options,project.name),lines=diagramPDFIntroText(project,options,intro);
      for(const line of lines)text(line.text,line.x,line.y,line.fontSize,line.muted,line.bold);
      const last=lines.filter(l=>l.kind==='title').at(-1);if(last)rule(intro.info.x,last.y+last.fontSize*1.25+2,intro.info.width);
      cover(intro.image);
      if(intro.cp&&options.coverCP){cp(intro.cp);const r=intro.cp;parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="${INK}" stroke-width=".65"/>`);}
      rule(plan.margin,intro.dividerY,plan.width-plan.margin*2,INK,2.2);
    }else text(wrapDiagramPDFText(title,plan.width-plan.margin*2,9)[0]??'',plan.margin,plan.margin-4,9,true);
    if(page.kind==='notes'){
      text('步骤说明（续）',plan.margin,plan.margin+plan.header-3,12,false,true);
      for(const note of page.notes){text(diagramPDFStepLabel(project.steps[note.stepIndex],note.stepIndex)+(note.continued?'（续）':''),note.x,note.y,10,false,true);note.lines.forEach((s,i)=>text(s,note.x,note.y+22+i*15,10));}
    }else for(const cell of page.cells){
      const step=project.steps[cell.stepIndex],content=diagramPDFCellContent(step,cell,options,plan);
      parts.push(`<g data-pdf-step="${cell.stepIndex+1}">`);
      artwork(diagramPDFStepSVG(project,step,content.imageRect,palette,adaptiveLines),content.imageRect);
      if(!step.pose&&!step.annotations?.length&&!step.images?.length&&step.paperVisible!==false)text('待计算折图',cell.x,content.imageRect.y+content.imageRect.height-10,Math.min(content.font,8),true);
      for(const line of content.captionLines)text(line.text,line.x,line.y,line.fontSize,line.muted,line.bold);
      parts.push('</g>');
    }
  }
  for(const guide of diagramPDFReadingGuides(page,options)){
    const dx=guide.to[0]-guide.from[0],dy=guide.to[1]-guide.from[1],length=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;
    parts.push(`<g data-pdf-reading-guide="${guide.start}-${guide.end}" transform="translate(${guide.to.join(' ')}) rotate(${angle})"><title>阅读顺序：${guide.start} → ${guide.end}</title><path d="M ${-length} 0 H 0 M -3 -2 L 0 0 L -3 2" fill="none" stroke="#526354" stroke-width=".75" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  }
  if(options.pageNumbers){const footer=diagramPDFFooterLayout(plan,pageIndex);for(const r of [footer.leftRule,footer.rightRule])rule(r.x,r.y,r.width,'#c6c6c6',3);text(footer.label,footer.x,footer.y,footer.fontSize,false,false,true);}
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${plan.width}" height="${plan.height}" viewBox="0 0 ${plan.width} ${plan.height}" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">${parts.join('')}</svg>`;
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
    for(const element of root.querySelectorAll<SVGGraphicsElement>('[vector-effect="non-scaling-stroke"]')){
      const matrix=element.getScreenCTM();if(!matrix)throw new Error('PDF 折线变换无法计算。');
      const transform=rootMatrix.inverse().multiply(matrix),scale=Math.sqrt(Math.abs(transform.a*transform.d-transform.b*transform.c));
      if(!(scale>0))throw new Error('PDF 折线变换已退化。');
      const style=getComputedStyle(element),width=parseFloat(style.strokeWidth);
      element.setAttribute('stroke-width',String(width/scale));
      if(style.strokeDasharray!=='none')element.setAttribute('stroke-dasharray',style.strokeDasharray.split(/[ ,]+/).map(s=>parseFloat(s)/scale).join(' '));
      element.setAttribute('stroke-dashoffset',String(parseFloat(style.strokeDashoffset)/scale));element.removeAttribute('vector-effect');
    }
    root.removeAttribute('style');return new XMLSerializer().serializeToString(root);
  }finally{root.remove();}
}
