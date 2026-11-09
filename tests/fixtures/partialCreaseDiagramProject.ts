import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Point} from '../../src/core/types';
import {adoptDiagramPose,createDiagramProject,updateDiagramCP,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments,pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {partialCreaseNetworkFixture} from './partialCreaseAnimation';
import {normalizeDiagramCP} from '../../src/app/diagramCP';

/** Importable app project, using the same CP/pose/fold-link path as the UI. */
export function partialCreaseDiagramProjectFixture(options:{activeRoutes?:number[];fixed?:Point}={}){
  const fixture=partialCreaseNetworkFixture(),input=structuredClone(fixture.doc),routes=(options.activeRoutes??[0]).map(i=>fixture.routes[i]);
  input.segments=input.segments.filter(s=>!s.id.startsWith('short-'));
  const before=normalizeDiagramCP(input).doc;
  let id=0,project=createDiagramProject(before,()=>`partial-network-${++id}`);const step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatGeometry(buildDiagramFold(before).graph,1e-6));
  project=updateDiagramCP(project,step.afterId,normalizeDiagramCP(applyDiagramFoldSegments(before,routes)).doc);
  const fixed=options.fixed?pickDiagramFoldAnchor(project.steps[0].pose!,options.fixed,0):undefined;
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],precreases:routes.map(r=>({...r,assignment:'V' as const,angle:180})),...(fixed?{fixed}:{})});
  project.steps[0].title=routes.length===1?'局部短痕压折后展开':'依次压出四条局部短痕并展开';
  return {project,stepId:step.id,before,routes};
}
