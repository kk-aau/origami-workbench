import type {Doc} from '../../src/core/types';
import {createDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {screenshotStepStageDocuments1016} from './screenshotStepStages1016';

/** Full eight-vertex aggregation, rather than a local precrease on an already
 * folded ring. The unfolded marks retain every original material subdivision. */
export function simulationStepAggregationFixture(){
  const source=screenshotStepStageDocuments1016(1),before:Doc={
    ...source.doc,name:'八顶点聚合的展开纸张',
    segments:source.doc.segments.map(segment=>segment.assignment==='B'?{...segment}:{...segment,assignment:'F',angle:0}),
  };
  let id=0,project=createDiagramProject(before,()=>`eight-vertex-aggregation-${++id}`);
  const stepId=project.activeStepId,step=project.steps[0];
  project=updateDiagramCP(project,step.afterId,source.doc);
  const clip=buildDiagramStepAnimation(project,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  return {project,stepId,before,after:source.doc,clip,prepared};
}
