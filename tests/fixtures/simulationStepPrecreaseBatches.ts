import {blankDoc} from '../../src/app/state';
import {adoptDiagramPose,appendDiagramStep,createDiagramProject,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Point} from '../../src/core/types';

function cornerBisectorStrokes():Array<[Point,Point]>{
  return Array.from({length:4},(_,quarter)=>{
    const turn=(point:Point):Point=>{
      let [x,y]=point;for(let k=0;k<quarter;k++)[x,y]=[100-y,x];return [x,y];
    };
    const split=100*Math.tan(Math.PI/8);
    return [[turn([0,0]),turn([100,split])],[turn([0,0]),turn([split,100])]] as Array<[Point,Point]>;
  }).flat();
}

/** Real drawing input, not a synthetic hinge graph: the CP transaction splits
 * intersections, records precrease intent, and leaves every resulting crease
 * flat in the operation-after CP. Each pair is one user's complete stroke.
 * Corner precreases hold the central material; pass null to exercise automatic
 * fixed-side selection, or an explicit point to retain an off-centre anchor. */
export function diagramPrecreaseBatchesFixture(kind:'diagonals'|'corner-bisectors'='diagonals',fixedPoint:Point|null=kind==='corner-bisectors'?[50,50]:[50,5]){
  const strokes:Array<[Point,Point]>=kind==='diagonals'
    ?[[[0,0],[100,100]],[[100,0],[0,100]]]
    :cornerBisectorStrokes();
  let serial=0,project=createDiagramProject(blankDoc(`分批预折-${kind}`,100,100),()=>`precrease-${kind}-${++serial}`);
  const stepId=project.activeStepId,pose=computeFlatGeometry(buildDiagramFold(project.states[0].doc).graph,1e-6);
  project=adoptDiagramPose(project,stepId,project.states[0].id,pose);
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],...(fixedPoint?{fixed:pickDiagramFoldAnchor(project.steps[0].pose!,fixedPoint)}:{})});
  project=reconcileDiagramFoldAnnotations(project,stepId,strokes.map(([a,b],i)=>({id:`precrease-stroke-${i}`,kind:'line',a,b,style:'valley',foldAction:'precrease',color:'#41634e',width:.7})));
  return {project,stepId,strokes,fixedPoint};
}

/** The photographed workflow: CP1 retains both diagonals as existing flat
 * creases; step 2 adds eight corner precreases. The central anchor avoids the
 * old X itself, while the full connected central material remains stationary. */
export function diagramTwoStepPrecreaseBatchesFixture(){
  const first=diagramPrecreaseBatchesFixture('diagonals');let serial=0;
  let project=appendDiagramStep(first.project,()=>`precrease-two-step-corners-${++serial}`);
  project={...project,name:'双对角后四角分批预折'};
  const stepId=project.activeStepId,before=project.states.find(state=>state.id===project.steps[1].beforeId)!,fixedPoint:Point=[50,45],strokes=cornerBisectorStrokes();
  project=adoptDiagramPose(project,stepId,before.id,computeFlatGeometry(buildDiagramFold(before.doc).graph,1e-6));
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],fixed:pickDiagramFoldAnchor(project.steps[1].pose!,fixedPoint)});
  project=reconcileDiagramFoldAnnotations(project,stepId,strokes.map(([a,b],i)=>({id:`precrease-corner-after-x-${i}`,kind:'line',a,b,style:'valley',foldAction:'precrease',color:'#41634e',width:.7})));
  return {project,stepId,strokes,fixedPoint,existingStrokes:first.strokes};
}
