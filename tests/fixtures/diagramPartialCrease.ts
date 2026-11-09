import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Point,Segment} from '../../src/core/types';
import {adoptDiagramPose,createDiagramProject,updateDiagramCP,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {partialCreaseDiagramProjectFixture} from './partialCreaseDiagramProject';
import {normalizeDiagramCP} from '../../src/app/diagramCP';

export function fixture(name:'single'|'interior'|'network'){
  if(name==='network'){
    const {project,stepId}=partialCreaseDiagramProjectFixture({activeRoutes:[0,1,2,3]});
    return {project,stepId};
  }
  const before=blankDoc(name==='single'?'纸边短痕压折':'纸内短痕压折',100,100),route:Segment={id:'partial-crease',a:(name==='single'?[0,40]:[25,40]) as Point,b:(name==='single'?[40,40]:[65,40]) as Point,assignment:'F',angle:0};
  let id=0,project=createDiagramProject(before,()=>`partial-${name}-${++id}`);const step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatGeometry(buildDiagramFold(before).graph,1e-6));
  project=updateDiagramCP(project,step.afterId,normalizeDiagramCP(applyDiagramFoldSegments(before,[route])).doc);
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],precreases:[{...route,assignment:'V',angle:180}]});
  project.steps[0].title=name==='single'?'只压出纸边短痕并展开':'只压出纸内短痕并展开';
  return {project,stepId:step.id};
}
