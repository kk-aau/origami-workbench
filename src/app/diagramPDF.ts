import {diagramPDFDirectionGlyph,diagramPDFDirectionAngle,type DiagramPDFDirection} from './diagramPDFDirection';
import {fitDiagramArtwork,prepareDiagramFigureFrame} from './diagramProcessFigureFrame';
import {decodePaperTextures} from '../engine/simPaperTexture';
import {readAdaptiveLineStyle} from './adaptiveLineStyle';
import {getDrawingBounds} from './paper';
import type {DiagramCPState,DiagramProject,DiagramStep} from './diagramProject';
import {diagramFoldPreviewAttributes,diagramDrawingFrame,diagramDrawingSVGFrame,diagramZoomArtwork,drawingSVG} from './diagramDrawing';
import {diagramStepZoom} from './diagramStepZoom';
import type {DiagramZoomRegion} from './diagramZoomGeometry';
import {diagramAnnotationMarkup,resolveDiagramSymbolInk} from './diagramAnnotationSVG';
import {diagramPDFDrawingLayout} from './diagramPDFDrawing';
import {projectDiagramFoldCP} from './diagramFoldLink';
import {completeCPBounds} from './creasePatternExport';
import {creasePatternSVG} from './creasePatternSVG';
import type {Doc} from '../core/types';
import {defaultCreaseDisplay} from './creaseDisplay';
import {defaultModelColors} from './modelColors';
import {applyDiagramLineAppearance,readDiagramLineDefaults,type DiagramLineDefaults} from './diagramLineStyles';
import {diagramCalloutCPMarkup} from './diagramCalloutSVG';
import {diagramPanelNumber,resolveDiagramPanel,planDiagramPDF,type DiagramPanelRef,type DiagramPDFOptions,type DiagramPDFRect} from './diagramPDFLayout';
import {diagramPanelRoute} from './diagramPDFBranchPanels';
import {startDiagramLayerDisplayPreparation} from './diagramLayerDisplay';
import {diagramDrawingRotationFrame,rotateDiagramDrawingSVG} from './diagramDrawingRotation';
import {renderDiagramPDFPage,normalizeDiagramPDFStrokes} from './diagramPDFPage';
import {convertSVGToPDFPage} from './api';
import {resolveDiagramSymbolGeometry,type DiagramSymbolStyles} from './diagramSymbolStyles';
import type {DiagramExportObstacleOptions} from './diagramExportObstacles';
import type {PDFArtworkReader} from './diagramPDFArtworkCache';
import {galleryRows,gallerySources,prepareGalleryViews} from './diagramPDFGallery';

export type ArtworkFrameObserver=(frame:DiagramPDFRect,geometry:DiagramExportObstacleOptions)=>void;

export interface DiagramPDFPreparationOptions {
  timeoutMs?:number;
  signal?:AbortSignal;
  onProgress?:(progress:{completed:number;total:number;stepId:string})=>void;
}
const abortError=()=>new DOMException('PDF 导出已取消。','AbortError');
function checkCancelled(signal?:AbortSignal):void {if(signal?.aborted)throw abortError();}

/** Only exported panels and a visible completion illustration need paper certificates. */
function exportPanels(project:DiagramProject,options:DiagramPDFOptions,includeCover:boolean):DiagramPanelRef[] {
  const plan=planDiagramPDF(project,options),panels:DiagramPanelRef[]=plan.pages.flatMap(page=>page.cells);
  if(includeCover){
    const needed=new Set(galleryRows(project,options,'result').map(row=>row.item.stepId));
    if(options.cover!=='none'&&plan.coverStepIndex!==null){
      const cover=galleryRows(project,options,'cover');
      if(cover.length)for(const {item} of cover)needed.add(item.stepId);
      else needed.add(project.steps[plan.coverStepIndex].id);
    }
    for(const panel of panels)if(panel.figureIndex===undefined)needed.delete(resolveDiagramPanel(project,panel).step.id);
    if(needed.size){
      const sources=gallerySources(project);
      for(const id of needed)panels.push(sources.get(id)!.ref);
      panels.sort((a,b)=>a.stepIndex-b.stepIndex);
    }
  }
  return panels;
}
export function diagramPDFPaperStepIds(project:DiagramProject,options:DiagramPDFOptions):string[] {
  return exportPanels(project,options,true).map(panel=>resolveDiagramPanel(project,panel).step).filter(step=>step.pose&&step.paperVisible!==false).map(step=>step.id);
}

/** Each process figure has its own material coordinates, revisions and local
 * step IDs. Prepare it against its own CP chain, just like an ordinary project. */
export async function prepareDiagramExportProject(project:DiagramProject,options:DiagramPDFOptions,preparation:DiagramPDFPreparationOptions,includeCover:boolean):Promise<DiagramProject> {
  checkCancelled(preparation.signal);
  const panels=exportPanels(project,options,includeCover);
  const usesPose=(step:DiagramStep)=>!!step.pose&&step.paperVisible!==false;
  const total=panels.filter(panel=>usesPose(resolveDiagramPanel(project,panel).step)).length;
  let completed=0;
  async function prepareOwner(owner:DiagramProject,refs:DiagramPanelRef[]){
    checkCancelled(preparation.signal);
    const labels=new Map<string,string>();
    let needsTextures=false;
    for(const ref of refs){
      const {step}=resolveDiagramPanel(project,ref);
      if(usesPose(step))labels.set(step.id,`第 ${diagramPanelNumber(ref)} 步${step.title.trim()?`（${step.title.trim()}）`:''}`);
      if(step.simulationSurface)needsTextures=true;
    }
    const task=startDiagramLayerDisplayPreparation(owner,{stepIds:[...labels.keys()],purpose:'export',timeoutMs:preparation.timeoutMs,
      onProgress:({stepId})=>preparation.onProgress?.({completed:++completed,total,stepId})});
    const cancel=()=>task.cancel();preparation.signal?.addEventListener('abort',cancel,{once:true});
    try{
      const result=await task.promise;checkCancelled(preparation.signal);
      if(result.cancelled)throw abortError();
      if(result.issues.length){
        const details=result.issues.map(issue=>`${labels.get(issue.stepId)}：${issue.message}`);
        throw new Error(`折图层序尚未就绪，未导出。${details.join('；')} 请重新分析相关步骤后重试。`);
      }
      if(needsTextures&&owner.basicSettings?.paperPatterns){await decodePaperTextures(owner.basicSettings.paperPatterns);checkCancelled(preparation.signal);}
      for(const ref of refs){
        const step=ref.figureIndex===undefined?result.project.steps[ref.stepIndex]:result.project.steps[0];
        if(step.images?.length&&fitDiagramArtwork(step,ref.figureIndex!==undefined)&&!diagramStepZoom(result.project,step.id)){
          await prepareDiagramFigureFrame(step.images,preparation.signal);
        }
      }
      return result.project;
    }finally{preparation.signal?.removeEventListener('abort',cancel);}
  }
  const routes=new Map<DiagramProject,DiagramPanelRef[]>();
  for(const panel of panels){
    if(panel.figureIndex!==undefined)continue;
    const route=diagramPanelRoute(project,panel),refs=routes.get(route);
    if(refs)refs.push(panel);else routes.set(route,[panel]);
  }
  const snapshot=await prepareOwner(project,routes.get(project)??[]);
  const branchUpdates=new Map<string,DiagramStep>();
  for(const [route,refs] of routes){
    if(route===project)continue;
    const prepared=await prepareOwner(route,refs);
    for(const ref of refs){
      const step=prepared.steps[ref.stepIndex];
      branchUpdates.set(step.id,step);
    }
  }
  const updatedFigures=new Map<string,DiagramProject[]>();
  for(const panel of panels){
    if(panel.figureIndex===undefined)continue;
    const host=diagramPanelRoute(project,panel).steps[panel.stepIndex];
    const figure=resolveDiagramPanel(project,panel).project;
    let updated=updatedFigures.get(host.id);
    if(!updated){updated=[...host.processFigures!];updatedFigures.set(host.id,updated);}
    updated[panel.figureIndex]=await prepareOwner(figure,[panel]);
  }
  const withFigures=(step:DiagramStep)=>{
    const processFigures=updatedFigures.get(step.id);
    return processFigures?{...step,processFigures}:step;
  };
  if(updatedFigures.size)snapshot.steps=snapshot.steps.map(withFigures);
  if(snapshot.branchSteps)snapshot.branchSteps=snapshot.branchSteps.map(branch=>{
    const step=withFigures(branchUpdates.get(branch.step.id)??branch.step);
    return step===branch.step?branch:{...branch,step};
  });
  if(includeCover&&options.gallery?.length)await prepareGalleryViews(snapshot,options,preparation.signal);
  return snapshot;
}
export function prepareDiagramPDFProject(project:DiagramProject,options:DiagramPDFOptions,preparation:DiagramPDFPreparationOptions={}):Promise<DiagramProject> {
  return prepareDiagramExportProject(project,options,preparation,true);
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
export function pdfCPArtwork(doc:Doc,zoom:DiagramZoomRegion|null|undefined,rotation:number,size:Pick<DiagramPDFRect,'width'|'height'>|undefined,enabled:boolean,id:string,onFrame?:ArtworkFrameObserver){
  const display=defaultCreaseDisplay(),bounds=zoom?diagramDrawingFrame(null,[],undefined,[],true,[],zoom):getDrawingBounds(doc);
  const unitsFor=(frame:typeof bounds)=>size?pdfOutputUnits(diagramDrawingRotationFrame(frame,rotation),size):undefined;
  const frame=zoom?bounds:completeCPBounds(bounds,display,unitsFor(bounds));
  onFrame?.(frame,{zoom,cpBounds:bounds});
  const svg=creasePatternSVG(doc,display,frame,undefined,{enabled,units:unitsFor(frame)});
  return zoom?svg.replace(/^(<svg\b[^>]*>)([\s\S]*)(<\/svg>)$/,(_,open:string,body:string,close:string)=>open+diagramZoomArtwork(body,zoom,id)+close):svg;
}
export function diagramPDFStepSVG(project:DiagramProject,step:DiagramStep,size?:Pick<DiagramPDFRect,'width'|'height'>,palette:DiagramLineDefaults=project.basicSettings?.lineDefaults??readDiagramLineDefaults(),adaptiveLines=project.basicSettings?.adaptiveLines??readAdaptiveLineStyle(),processFigure=false):string {
  const zoom=diagramStepZoom(project,step.id)?.region;
  return diagramPDFStepArtwork(step,project.states,size,palette,adaptiveLines,zoom,project.basicSettings?.paperPatterns,processFigure,project.basicSettings?.symbolStyles);
}

/** The PDF panel and cached step image use one artwork renderer. Callers that
 * already replayed the step chain supply its crop without scanning it again;
 * size remains the PDF panel size in points, not the thumbnail pixel size. */
export function diagramPDFStepArtwork(step:DiagramStep,states:readonly DiagramCPState[],size?:Pick<DiagramPDFRect,'width'|'height'>,palette:DiagramLineDefaults=readDiagramLineDefaults(),adaptiveLines=readAdaptiveLineStyle(),zoom?:DiagramZoomRegion|null,patterns?:import('./paperPatterns').PaperPatterns,processFigure=false,symbolStyles?:DiagramSymbolStyles,onFrame?:ArtworkFrameObserver,readingDirection?:DiagramPDFDirection,readCreases?:PDFArtworkReader['creases']):string {
  const before=states.find(state=>state.id===step.beforeId),after=states.find(state=>state.id===step.afterId);
  if(!before||!after)throw new Error('步骤的 CP 状态缺失，无法导出。');
  const drawingRotation=step.canvas?.drawingRotation??0,finish=(svg:string)=>normalizeDiagramPDFSVG(rotateDiagramDrawingSVG(svg,drawingRotation));
  if(step.paperVisible!==false&&!step.pose&&!step.simulationSurface&&!step.annotations?.length&&!step.images?.length&&!step.callouts?.length)return finish(pdfCPArtwork(before.doc,zoom,drawingRotation,size,adaptiveLines,'pdf-cp',onFrame));
  // Canvas projection is optional feedback. Calculating the after-CP or retaining
  // an older snapshot is valid drawing work; a failed link must not hide it or
  // force an unrelated recalculation during export.
  const projectCreases=()=>{
    if(step.paperVisible!==false&&step.foldLink?.enabled&&step.pose?.sourceStateId===before.id&&step.pose.sourceRevision===before.revision&&JSON.stringify(step.pose.sourceDoc)===JSON.stringify(before.doc)) {
      try{return projectDiagramFoldCP(step.pose,before.doc,after.doc,before,step.foldLink.precreases).preview;}catch{/* Preserve exactly the independent drawing shown by the canvas. */}
    }
  };
  const preview=readCreases?readCreases(step,before,after,projectCreases):projectCreases();
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
  const fitArtwork=fitDiagramArtwork(step,processFigure);
  const direction=readingDirection?(['right','bottom','left','top'] as const)[Math.round((diagramPDFDirectionAngle(readingDirection)-drawingRotation+720)%360/90)%4]:undefined;
  const layout=step.pose&&step.paperVisible!==false&&(!fitArtwork||!step.simulationSurface)
    ?diagramPDFDrawingLayout(step.pose,annotations,extra,layoutSize,step.images,step.callouts,zoom,symbolStyles,direction,fitArtwork):null;
  const sourceFrame=layout?.frame??diagramDrawingSVGFrame(diagramDrawingFrame(step.pose,annotations,undefined,step.images,step.paperVisible,step.callouts,zoom,step.simulationSurface,fitArtwork,symbolStyles),false);
  const outputFrame=diagramDrawingRotationFrame(sourceFrame,drawingRotation);
  const units=size?pdfOutputUnits(outputFrame,size):Math.max(outputFrame.width/512,outputFrame.height/384);
  onFrame?.(sourceFrame,{layout,zoom,units,symbolStyles,fitArtwork});
  const lineDisplay={enabled:adaptiveLines,units,fitArtwork,symbolStyles};
  if(!layout)return finish(drawingSVG(step.pose,annotations,'','',preview,step.images,step.paperVisible,palette,step.callouts,cpMarkup,lineDisplay,zoom,0,step.simulationSurface,patterns));
  const drawing=drawingSVG(step.pose,layout.main,'','',preview,step.images,step.paperVisible,palette,step.callouts,cpMarkup,lineDisplay,zoom,0,step.simulationSurface,patterns),body=drawing.slice(drawing.indexOf('>')+1,drawing.lastIndexOf('</svg>'));
  // Shrinking a distant, oversized glyph must not shrink its pen width too.
  const symbols=layout.symbols.map(({annotation,scale,maxPenWidth,x,y,source,direction})=>{
    const ink=resolveDiagramSymbolInk(annotation,{symbolStyles,units});
    const fitted={...resolveDiagramSymbolGeometry(annotation,symbolStyles),color:ink.color,width:Math.min(ink.width,maxPenWidth)/scale};
    const fills=ink.fill?{[annotation.symbol]:{fill:ink.fill}}:undefined;
    const glyph=diagramAnnotationMarkup(fitted,{enabled:false,units:1,symbolStyles:fills});
    return `<g data-pdf-direction-symbol="${annotation.symbol}" transform="translate(${x} ${y}) scale(${scale}) ${direction?diagramPDFDirectionGlyph(annotation.symbol,direction):''} translate(${-source.x-source.width/2} ${-source.y-source.height/2})">${glyph}</g>`;
  }).join('');
  const {frame}=layout;
  return finish(`<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}"><g data-pdf-main-artwork="">${body}</g>${symbols}</svg>`);
}

/** The completion illustration uses only the saved paper pose. Instruction
 * arrows and the next action's projected creases belong to the step panels,
 * never to the finished-model overview. Export never calculates a new pose. */
export function diagramPDFCoverFrame(step:DiagramStep,zoom?:DiagramZoomRegion|null,project?:DiagramProject){
  const cp=!step.pose&&!step.simulationSurface&&!step.images?.length&&step.paperVisible!==false&&!zoom
    ?project?.states.find(state=>state.id===step.afterId)?.doc:undefined;
  const frame=cp?completeCPBounds(getDrawingBounds(cp),defaultCreaseDisplay())
    :diagramDrawingFrame(step.pose,[],undefined,step.images,step.paperVisible,[],zoom,step.simulationSurface,fitDiagramArtwork(step)&&'tight');
  return diagramDrawingRotationFrame(diagramDrawingSVGFrame(frame,false),step.canvas?.drawingRotation??0);
}
export function diagramPDFCoverSVG(project:DiagramProject,step?:DiagramStep|null,palette:DiagramLineDefaults=project.basicSettings?.lineDefaults??readDiagramLineDefaults(),adaptiveLines=project.basicSettings?.adaptiveLines??readAdaptiveLineStyle(),size?:Pick<DiagramPDFRect,'width'|'height'>,wholeModel=false):string {
  const zoom=step&&!wholeModel?diagramStepZoom(project,step.id)?.region:undefined;
  const drawingRotation=step?.canvas?.drawingRotation??0,finish=(svg:string)=>normalizeDiagramPDFSVG(rotateDiagramDrawingSVG(svg,drawingRotation));
  if(step&&(step.pose||step.simulationSurface||step.images?.length||step.paperVisible===false)){
    const fitArtwork=fitDiagramArtwork(step)&&'tight';
    const units=size?pdfOutputUnits(diagramPDFCoverFrame(step,zoom),size):undefined;
    return finish(drawingSVG(step.pose,[],'','',undefined,step.images,step.paperVisible,palette,[],undefined,{enabled:adaptiveLines,units,fitArtwork},zoom,0,step.simulationSurface,project.basicSettings?.paperPatterns));
  }
  const state=step?project.states.find(value=>value.id===step.afterId):project.states.at(-1);
  if(!state)throw new Error('完成效果图的 CP 状态缺失，无法导出。');
  return finish(pdfCPArtwork(state.doc,zoom,drawingRotation,size,adaptiveLines,'pdf-cover-cp'));
}
/** Pages retain SVG paths, clips, masks and embedded searchable text. Only
 * original raster artwork remains raster; file saving is owned by api.ts. */
export async function exportDiagramPDF(project:DiagramProject,options:DiagramPDFOptions,onProgress?:(completed:number,total:number)=>void,palette:DiagramLineDefaults=project.basicSettings?.lineDefaults??readDiagramLineDefaults(),preparation:DiagramPDFPreparationOptions={}):Promise<Blob> {
  checkCancelled(preparation.signal);
  const savedOptions=structuredClone(options),linePalette=structuredClone(palette);
  const snapshot=await prepareDiagramPDFProject(project,savedOptions,preparation);
  return exportPreparedDiagramPDF(snapshot,savedOptions,onProgress,linePalette,preparation);
}

/** The export dialog already owns an isolated, prepared snapshot for its preview. */
export async function exportPreparedDiagramPDF(snapshot:DiagramProject,options:DiagramPDFOptions,onProgress?:(completed:number,total:number)=>void,palette:DiagramLineDefaults=snapshot.basicSettings?.lineDefaults??readDiagramLineDefaults(),preparation:DiagramPDFPreparationOptions={}):Promise<Blob> {
  checkCancelled(preparation.signal);
  options=structuredClone(options);
  const adaptiveLines=snapshot.basicSettings?.adaptiveLines??readAdaptiveLineStyle(),linePalette=structuredClone(palette);
  const plan=planDiagramPDF(snapshot,options),runtime=await loadPDFRuntime();
  checkCancelled(preparation.signal);
  if(document.fonts?.ready)await document.fonts.ready;
  checkCancelled(preparation.signal);
  const pdf=await runtime.PDFDocument.create();pdf.setTitle((options.title??snapshot.name).trim());pdf.setAuthor(options.author.trim());pdf.setCreator('折纸工坊');pdf.setSubject('折序图解');
  const scales=new Map<string,number|null>();
  for(let i=0;i<plan.pages.length;i++) {
    checkCancelled(preparation.signal);
    const svg=normalizeDiagramPDFStrokes(await renderDiagramPDFPage(preparation.signal,snapshot,options,plan,i,linePalette,adaptiveLines,scales));
    const data=await convertSVGToPDFPage(svg,preparation.signal);checkCancelled(preparation.signal);
    const source=await runtime.PDFDocument.load(data),[page]=await pdf.copyPages(source,[0]);
    checkCancelled(preparation.signal);pdf.addPage(page);onProgress?.(i+1,plan.pages.length);
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  checkCancelled(preparation.signal);const data=await pdf.save();checkCancelled(preparation.signal);return new Blob([new Uint8Array(data).buffer],{type:'application/pdf'});
}
