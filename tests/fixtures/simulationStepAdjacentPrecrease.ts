import {blankDoc} from '../../src/app/state';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {adoptDiagramPose,createDiagramProject,updateDiagramCP,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Segment} from '../../src/core/types';

/** A genuine folded two-layer source and a directed, full-material precrease.
 * The horizontal daughter hinges have the same material direction, so the
 * folded stack cannot drive them together while the old vertical hinge stays
 * at 180 degrees. A legal route opens that neighbouring old hinge, presses and
 * returns the new crease, then restores the original two-layer pose.
 *
 * This deliberately tests the nontrivial reopening case. A single physical
 * valley across both coincident layers maps to opposite material directions
 * and can already fold with the old hinge locked. */
export function diagramAdjacentPrecreaseFixture(oldAssignment:'M'|'V'='V'){
  let before=blankDoc('双层相邻旧折痕释放预折',100,100);
  const oldFold:Segment={id:'old-fold',a:[50,0],b:[50,100],assignment:oldAssignment,angle:oldAssignment==='M'?-180:180};
  const newPrecrease:Segment={id:'new-precrease',a:[0,40],b:[100,40],assignment:'V',angle:180};
  before.segments.push(oldFold);before=normalizeDiagramCP(before).doc;
  let serial=0,project=createDiagramProject(before,()=>`adjacent-precrease-${oldAssignment}-${++serial}`);
  const step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,computeFlatGeometry(buildDiagramFold(before).graph,1e-6));
  const after=normalizeDiagramCP({...before,segments:[...before.segments,{...newPrecrease,assignment:'F',angle:0}]}).doc;
  project=updateDiagramCP(project,step.afterId,after);
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],fixed:pickDiagramFoldAnchor(project.steps[0].pose!,[20,80]),precreases:[newPrecrease]});
  return {project,stepId:step.id,oldFold,newPrecrease};
}
