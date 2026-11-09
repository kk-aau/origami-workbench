import type {DiagramProject} from './diagramProject';
import {diagramPDFCellContent,planDiagramPDF,type DiagramPDFOptions,type DiagramPDFPlan,type DiagramPDFRect} from './diagramPDFLayout';

/** Cache the same artwork viewport as the PDF panel, excluding its captions.
 * Steps outside the selected export range still have navigation thumbnails;
 * use the full-document layout for those, then prefer the actual export plan. */
export function diagramThumbnailSizes(project:DiagramProject,options:DiagramPDFOptions):Map<string,Pick<DiagramPDFRect,'width'|'height'>> {
  const selected=planDiagramPDF(project,options),sizes=new Map<string,Pick<DiagramPDFRect,'width'|'height'>>();
  const collect=(plan:DiagramPDFPlan,settings:DiagramPDFOptions)=>{
    for(const page of plan.pages)for(const cell of page.cells){
      const step=project.steps[cell.stepIndex],{width,height}=diagramPDFCellContent(step,cell,settings,plan).imageRect;
      sizes.set(step.id,{width,height});
    }
  };
  if(options.scope!=='all'){
    const all={...options,scope:'all' as const};
    collect(planDiagramPDF(project,all),all);
  }
  collect(selected,options);
  return sizes;
}
