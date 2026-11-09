import {readAdaptiveLineStyle} from './adaptiveLineStyle';
import {getDrawingBounds} from './paper';
import type {DiagramCPState,DiagramProject,DiagramStep} from './diagramProject';
import {diagramFoldPreviewAttributes,diagramDrawingFrame,diagramDrawingSVGFrame,diagramZoomArtwork,drawingSVG} from './diagramDrawing';
import {diagramStepZoom} from './diagramStepZoom';
import type {DiagramZoomRegion} from './diagramZoomGeometry';
import {diagramAnnotationMarkup} from './diagramAnnotationSVG';
import {diagramPDFDrawingLayout} from './diagramPDFDrawing';
import {projectDiagramFoldCP} from './diagramFoldLink';
import {completeCreasePatternSVG as creasePatternSVG} from './creasePatternExport';
import {defaultCreaseDisplay} from './creaseDisplay';
import {defaultModelColors} from './modelColors';
import {applyDiagramLineAppearance,readDiagramLineDefaults,type DiagramLineDefaults} from './diagramLineStyles';
import {diagramCalloutCPMarkup} from './diagramCalloutSVG';
import {planDiagramPDF,type DiagramPDFOptions,type DiagramPDFRect} from './diagramPDFLayout';
import {startDiagramLayerDisplayPreparation} from './diagramLayerDisplay';
import {diagramDrawingRotationFrame,rotateDiagramDrawingSVG} from './diagramDrawingRotation';
import {diagramPDFPageSVG,normalizeDiagramPDFStrokes} from './diagramPDFPage';
import {convertSVGToPDFPage} from './api';

export interface DiagramPDFPreparationOptions {
  signal?:AbortSignal;
  onProgress?:(progress:{completed:number;total:number;stepId:string})=>void;
}
const abortError=()=>new DOMException('PDF 导出已取消。','AbortError');
function checkCancelled(signal?:AbortSignal):void {if(signal?.aborted)throw abortError();}

/** Prepare only paper that is actually drawn: selected panels and, when
 * present, the completion illustration. A range can use a cover outside it. */
export function diagramPDFPaperStepIds(project:DiagramProject,options:DiagramPDFOptions):string[] {
  const plan=planDiagramPDF(project,options),indices=new Set(plan.pages.flatMap(page=>page.cells.map(cell=>cell.stepIndex)));
  if(plan.coverStepIndex!==null&&plan.pages.some(page=>page.kind==='cover'||page.kind==='intro'))indices.add(plan.coverStepIndex);
  return [...indices].sort((a,b)=>a-b).map(index=>project.steps[index]).filter(step=>step.pose&&step.paperVisible!==false).map(step=>step.id);
}

/** Resolve display certificates on a private snapshot before either preview
 * or vector export. Never replace the user's saved geometry with a new fold. */
export async function prepareDiagramPDFProject(project:DiagramProject,options:DiagramPDFOptions,preparation:DiagramPDFPreparationOptions={}):Promise<DiagramProject> {
  checkCancelled(preparation.signal);
  const task=startDiagramLayerDisplayPreparation(project,{stepIds:diagramPDFPaperStepIds(project,options),onProgress:preparation.onProgress});
  const cancel=()=>task.cancel();preparation.signal?.addEventListener('abort',cancel,{once:true});
  try {
    const result=await task.promise;checkCancelled(preparation.signal);
    if(result.cancelled)throw abortError();
    if(result.issues.length){
      const details=result.issues.map(issue=>{const index=project.steps.findIndex(step=>step.id===issue.stepId),step=project.steps[index];return `${index>=0?`第 ${index+1} 步${step.title.trim()?`（${step.title.trim()}）`:''}`:'步骤'}：${issue.message}`;});
      throw new Error(`折图层序尚未就绪，未导出。${details.join('；')} 请重新分析相关步骤后重试。`);
    }
    return result.project;
  } finally {preparation.signal?.removeEventListener('abort',cancel);}
}

interface PDFPage {}
interface PDFDocument {
  addPage(page:PDFPage):PDFPage;
  copyPages(source:PDFDocument,indices:number[]):Promise<PDFPage[]>;
  setTitle(title:string):void;setAuthor(author:string):void;setCreator(creator:string):void;setSubject(subject:string):void;
  save():Promise<Uint8Array>;
}
interface PDFRuntime {PDFDocument:{create():Promise<PDFDocument>;load(data:Uint8Array):Promise<PDFDocument>}}
declare global {interface Window {PDFLib?:PDFRuntime}}
let runtimePromise:Promise<PDFRuntime>|undefined;
export function loadPDFRuntime():Promise<PDFRuntime> {
  if(window.PDFLib)return Promise.resolve(window.PDFLib);
  if(runtimePromise)return runtimePromise;
  runtimePromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=`${import.meta.env.BASE_URL}vendor/pdf-lib/pdf-lib-1.17.1.min.js`;script.async=true;
    const timeout=setTimeout(()=>{script.remove();runtimePromise=undefined;reject(new Error('PDF 导出组件加载超时，请刷新后重试。'));},15000);
    script.onload=()=>{clearTimeout(timeout);if(window.PDFLib)resolve(window.PDFLib);else{runtimePromise=undefined;reject(new Error('PDF 导出组件未就绪，请刷新后重试。'));}};
    script.onerror=()=>{clearTimeout(timeout);script.remove();runtimePromise=undefined;reject(new Error('PDF 导出组件加载失败，请刷新后重试。'));};document.head.append(script);
  });return runtimePromise;
}

/** Uses the same source/layer projection as the drawing canvas, not an unrelated
 * recalculation. This preserves pulled poses, symbols and hidden face settings. */
export function normalizeDiagramPDFSVG(svg:string):string {
  const dimensions=/\bviewBox="[^"\s]+\s+[^"\s]+\s+([^"\s]+)\s+([^"\s]+)"/.exec(svg);
  if(!dimensions)return svg;
  const width=Number(dimensions[1]),height=Number(dimensions[2]);if(!(width>0&&height>0)||!Number.isFinite(width)||!Number.isFinite(height))return svg;
  return svg.replace(/<svg\b([^>]*)>/,(_,attributes:string)=>`<svg${attributes.replace(/\s(?:width|height)="[^"]*"/g,'')} width="${width}" height="${height}">`);
}
const pdfOutputUnits=(frame:Pick<DiagramPDFRect,'width'|'height'>,size:Pick<DiagramPDFRect,'width'|'height'>)=>Math.max(frame.width/(size.width*96/72),frame.height/(size.height*96/72));
export function diagramPDFStepSVG(project:DiagramProject,step:DiagramStep,size?:Pick<DiagramPDFRect,'width'|'height'>,palette:DiagramLineDefaults=readDiagramLineDefaults(),adaptiveLines=readAdaptiveLineStyle()):string {
  const zoom=diagramStepZoom(project,step.id)?.region;
  return diagramPDFStepArtwork(step,project.states,size,palette,adaptiveLines,zoom);
}

/** The PDF panel and cached step image use one artwork renderer. Callers that
 * already replayed the step chain supply its crop without scanning it again;
 * size remains the PDF panel size in points, not the thumbnail pixel size. */
export function diagramPDFStepArtwork(step:DiagramStep,states:readonly DiagramCPState[],size?:Pick<DiagramPDFRect,'width'|'height'>,palette:DiagramLineDefaults=readDiagramLineDefaults(),adaptiveLines=readAdaptiveLineStyle(),zoom?:DiagramZoomRegion|null):string {
  const before=states.find(state=>state.id===step.beforeId),after=states.find(state=>state.id===step.afterId);
  if(!before||!after)throw new Error('步骤的 CP 状态缺失，无法导出。');
  const drawingRotation=step.canvas?.drawingRotation??0,finish=(svg:string)=>normalizeDiagramPDFSVG(rotateDiagramDrawingSVG(svg,drawingRotation));
  if(step.paperVisible!==false&&!step.pose&&!step.simulationSurface&&!step.annotations?.length&&!step.images?.length&&!step.callouts?.length){const bounds=zoom?diagramDrawingFrame(null,[],undefined,[],true,[],zoom):getDrawingBounds(before.doc),units=size?pdfOutputUnits(diagramDrawingRotationFrame(bounds,drawingRotation),size):25.4/96,svg=creasePatternSVG(before.doc,defaultCreaseDisplay(),zoom?bounds:undefined,undefined,{enabled:adaptiveLines,units});return finish(zoom?svg.replace(/^(<svg\b[^>]*>)([\s\S]*)(<\/svg>)$/,(all,open:string,body:string,close:string)=>open+diagramZoomArtwork(body,zoom,'pdf-cp')+close):svg);}
  // Canvas projection is optional feedback. Calculating the after-CP or retaining
  // an older snapshot is valid drawing work; a failed link must not hide it or
  // force an unrelated recalculation during export.
  let preview;
  if(step.paperVisible!==false&&step.foldLink?.enabled&&step.pose?.sourceStateId===before.id&&step.pose.sourceRevision===before.revision&&JSON.stringify(step.pose.sourceDoc)===JSON.stringify(before.doc)) {
    try{preview=projectDiagramFoldCP(step.pose,before.doc,after.doc,before,step.foldLink.precreases).preview;}catch{/* Preserve exactly the independent drawing shown by the canvas. */}
  }
  const annotations=(step.annotations??[]).map(annotation=>annotation.kind==='line'?applyDiagramLineAppearance(annotation,palette):annotation);
  const styles={M:'mountain',V:'valley',F:'crease',U:'auxiliary'} as const;
  const extra=(preview??[]).map((line,index)=>{
    const paint=diagramFoldPreviewAttributes(line,step.annotations??[],step.pose?.view?.colors?.line??defaultModelColors().line,palette);
    return {id:`pdf-preview-${index}`,kind:'line' as const,a:line.a,b:line.b,style:line.style??styles[line.assignment],color:paint.color,width:paint.width};
  });
  const cpMarkup=(stateId:string,sourceUnits?:number,hideExistingCreases?:boolean)=>{const state=[before,after].find(item=>item.id===stateId);return state?diagramCalloutCPMarkup(state.doc,defaultCreaseDisplay(),{enabled:adaptiveLines,units:sourceUnits,hideExistingCreases}):'';};
  // A quarter turn swaps the panel's axes. Fit margin symbols in the original
  // artwork coordinates, then rotate the complete result, including those slots.
  const quarterTurn=Math.abs(drawingRotation)%180===90,layoutSize=size&&quarterTurn?{width:size.height,height:size.width}:size;
  const layout=step.pose&&step.paperVisible!==false?diagramPDFDrawingLayout(step.pose,annotations,extra,layoutSize,step.images,step.callouts,zoom):null;
  const outputFrame=diagramDrawingRotationFrame(layout?.frame??diagramDrawingSVGFrame(diagramDrawingFrame(step.pose,annotations,undefined,step.images,step.paperVisible,step.callouts,zoom,step.simulationSurface),false),drawingRotation);
  const units=size?pdfOutputUnits(outputFrame,size):Math.max(outputFrame.width/512,outputFrame.height/384);
  const lineDisplay={enabled:adaptiveLines,units};
  if(!layout)return finish(drawingSVG(step.pose,annotations,'','',preview,step.images,step.paperVisible,palette,step.callouts,cpMarkup,lineDisplay,zoom,0,step.simulationSurface));
  const drawing=drawingSVG(step.pose,layout.main,'','',preview,step.images,step.paperVisible,palette,step.callouts,cpMarkup,lineDisplay,zoom,0,step.simulationSurface),body=drawing.slice(drawing.indexOf('>')+1,drawing.lastIndexOf('</svg>'));
  // Shrinking a distant, oversized glyph must not shrink its pen width too.
  const symbols=layout.symbols.map(({annotation,scale,penWidth,x,y,source})=>`<g data-pdf-direction-symbol="${annotation.symbol}" transform="translate(${x} ${y}) scale(${scale}) translate(${-source.x-source.width/2} ${-source.y-source.height/2})">${diagramAnnotationMarkup({...annotation,width:penWidth/scale})}</g>`).join('');
  const {frame}=layout;
  return finish(`<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}"><g data-pdf-main-artwork="">${body}</g>${symbols}</svg>`);
}

/** The completion illustration uses only the saved paper pose. Instruction
 * arrows and the next action's projected creases belong to the step panels,
 * never to the finished-model overview. Export never calculates a new pose. */
export function diagramPDFCoverSVG(project:DiagramProject,step?:DiagramStep|null,palette:DiagramLineDefaults=readDiagramLineDefaults(),adaptiveLines=readAdaptiveLineStyle(),size?:Pick<DiagramPDFRect,'width'|'height'>):string {
  const zoom=step?diagramStepZoom(project,step.id)?.region:undefined;
  const drawingRotation=step?.canvas?.drawingRotation??0,finish=(svg:string)=>normalizeDiagramPDFSVG(rotateDiagramDrawingSVG(svg,drawingRotation));
  if(step&&(step.pose||step.simulationSurface||step.images?.length||step.paperVisible===false)){
    const units=size?pdfOutputUnits(diagramDrawingRotationFrame(diagramDrawingSVGFrame(diagramDrawingFrame(step.pose,[],undefined,step.images,step.paperVisible,[],zoom,step.simulationSurface),false),drawingRotation),size):undefined;
    return finish(drawingSVG(step.pose,[],'','',undefined,step.images,step.paperVisible,palette,[],undefined,{enabled:adaptiveLines,units},zoom,0,step.simulationSurface));
  }
  const state=step?project.states.find(value=>value.id===step.afterId):project.states.at(-1);
  if(!state)throw new Error('完成效果图的 CP 状态缺失，无法导出。');
  const bounds=zoom?diagramDrawingFrame(null,[],undefined,[],true,[],zoom):getDrawingBounds(state.doc),svg=creasePatternSVG(state.doc,defaultCreaseDisplay(),zoom?bounds:undefined,undefined,{enabled:adaptiveLines,units:size?pdfOutputUnits(diagramDrawingRotationFrame(bounds,drawingRotation),size):undefined});
  return finish(zoom?svg.replace(/^(<svg\b[^>]*>)([\s\S]*)(<\/svg>)$/,(all,open:string,body:string,close:string)=>open+diagramZoomArtwork(body,zoom,'pdf-cover-cp')+close):svg);
}
/** Pages retain SVG paths, clips, masks and embedded searchable text. Only
 * original raster artwork remains raster; file saving is owned by api.ts. */
export async function exportDiagramPDF(project:DiagramProject,options:DiagramPDFOptions,onProgress?:(completed:number,total:number)=>void,palette:DiagramLineDefaults=readDiagramLineDefaults(),preparation:DiagramPDFPreparationOptions={}):Promise<Blob> {
  checkCancelled(preparation.signal);
  const adaptiveLines=readAdaptiveLineStyle(),savedOptions=structuredClone(options),linePalette=structuredClone(palette);
  const snapshot=await prepareDiagramPDFProject(project,savedOptions,preparation),plan=planDiagramPDF(snapshot,savedOptions),runtime=await loadPDFRuntime();
  options=savedOptions;checkCancelled(preparation.signal);
  if(document.fonts?.ready)await document.fonts.ready;
  checkCancelled(preparation.signal);
  const pdf=await runtime.PDFDocument.create();pdf.setTitle(options.title.trim()||snapshot.name);pdf.setAuthor(options.author.trim());pdf.setCreator('折纸工坊');pdf.setSubject('折序图解');
  for(let i=0;i<plan.pages.length;i++) {
    checkCancelled(preparation.signal);
    const svg=normalizeDiagramPDFStrokes(diagramPDFPageSVG(snapshot,options,plan,i,linePalette,adaptiveLines));
    const data=await convertSVGToPDFPage(svg,preparation.signal);checkCancelled(preparation.signal);
    const source=await runtime.PDFDocument.load(data),[page]=await pdf.copyPages(source,[0]);
    checkCancelled(preparation.signal);pdf.addPage(page);onProgress?.(i+1,plan.pages.length);
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  checkCancelled(preparation.signal);const data=await pdf.save();checkCancelled(preparation.signal);return new Blob([new Uint8Array(data).buffer],{type:'application/pdf'});
}
