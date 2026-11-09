import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {createDiagramProject,adoptDiagramPose,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Doc,Point} from '../../src/core/types';

/** A true spherical four-bar origami vertex: alternating sectors sum to 180°,
 * and the 60/90/120/90 sectors require unequal intermediate fold angles. The
 * minority MV can be chosen to exercise both folding branches. */
export function simulationDegreeFourFixture(minority=0,precrease=false){
  const directions=[0,60,150,270].map(degrees=>degrees*Math.PI/180);
  const coords=[[0,0],...directions.map(a=>[Math.cos(a),Math.sin(a)])];
  const fold={vertices_coords:coords,
    edges_vertices:[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4]] as [number,number][],
    edges_assignment:['B','B','B','B',...directions.map((_,i)=>precrease?'F':i===minority?'V':'M')],
    edges_foldAngle:[0,0,0,0,...directions.map((_,i)=>precrease?0:i===minority?180:-180)],
    faces_vertices:[[0,1,2],[0,2,3],[0,3,4],[0,4,1]],
  };
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),
    ranges:prepared.creaseParams.map(c=>{
      const edge=prepared.edgesVertices[c.edge],rim=edge.find(v=>prepared.fold.vertices_coords[v][0]!==0||prepared.fold.vertices_coords[v][2]!==0)!;
      const cp=prepared.fold.vertices_coords[rim],direction=directions.findIndex(a=>Math.hypot(cp[0]-Math.cos(a),-cp[2]-Math.sin(a))<1e-6);
      return {edge:c.edge,fromAngle:0,toAngle:c.targetAngle,...(precrease?{viaAngle:direction===minority?180:-180}:{})};
    }),fixedVertices:[...prepared.facesVertices[0]]};
  return {fold,prepared,model,animation};
}

/** A strip of three independent rectangular material panels (a tree mechanism)
 * supplies two hinges for sequential-order and old-fold preservation tests. */
export function simulationTwoHingeFixture(){
  const fold={vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]] as [number,number][],
    edges_assignment:['B','B','B','B','B','B','B','B','V','M'],edges_foldAngle:[0,0,0,0,0,0,0,0,180,-180],
    faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle})),fixedVertices:[...prepared.facesVertices.find(face=>face.every(v=>{const x=prepared.fold.vertices_coords[v][0];return x>=1&&x<=2;}))!]};
  return {fold,prepared,model,animation};
}

/** Adjacent free flaps both fold over the same square. Folding together makes
 * them penetrate after halfway; folding either completely first leaves a clear
 * route for the other. Their shared corner is real material, not a welded layer. */
export function simulationObstructingFlapsFixture(){
  const fold={vertices_coords:[[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1],[0,-1],[1,-1]],
    edges_vertices:[[0,1],[1,6],[6,7],[7,2],[2,5],[5,4],[4,3],[3,0],[1,4],[1,2]] as [number,number][],
    edges_assignment:['B','B','B','B','B','B','B','B','V','V'],edges_foldAngle:[0,0,0,0,0,0,0,0,180,180],
    faces_vertices:[[0,1,4,3],[1,2,5,4],[6,7,2,1]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle})),fixedVertices:prepared.fold.vertices_coords.flatMap((p,v)=>p[0]>=0&&p[0]<=1&&-p[2]>=0&&-p[2]<=1?[v]:[])};
  return {fold,prepared,model,animation};
}

/** The same real mechanisms through the editor's CP mapping and shared-state
 * transaction path, which reorders/splits vertices, faces, and crease indices. */
export function diagramComplexAnimationFixture(kind:'coupled'|'sequential',precrease=false){
  const fixture=kind==='coupled'?simulationDegreeFourFixture(0):simulationObstructingFlapsFixture(),fold=fixture.fold;
  const transform=(p:readonly number[]):Point=>[100+p[0]*60,100+p[1]*60];
  const before=normalizeDiagramCP({schemaVersion:2,name:`complex-${kind}`,paper:{width:200,height:200},objects:[],segments:fold.edges_vertices.flatMap(([a,b],e)=>fold.edges_assignment[e]==='B'?[{id:`${kind}-boundary-${e}`,a:transform(fold.vertices_coords[a]),b:transform(fold.vertices_coords[b]),assignment:'B',angle:0}]:[])} as Doc).doc;
  let counter=0,project=createDiagramProject(before,()=>`complex-${kind}-fixture-${++counter}`);const stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.states[0].id,computeFlatGeometry(buildDiagramFold(before).graph,1e-6));
  const pins=fixture.animation.fixedVertices.map(v=>fixture.prepared.fold.vertices_coords[v]);
  const fixedPoint:Point=transform([pins.reduce((sum,p)=>sum+p[0],0)/pins.length,-pins.reduce((sum,p)=>sum+p[2],0)/pins.length]);
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[],fixed:pickDiagramFoldAnchor(project.steps[0].pose!,fixedPoint,0)});
  project=reconcileDiagramFoldAnnotations(project,stepId,fold.edges_vertices.flatMap(([a,b],e)=>fold.edges_assignment[e]==='B'?[]:[{id:`${kind}-fold-${e}`,kind:'line',a:transform(fold.vertices_coords[a]),b:transform(fold.vertices_coords[b]),style:fold.edges_assignment[e]==='M'?'mountain':'valley',foldAction:precrease?'precrease':'fold',color:'#41634e',width:.7}]));
  return {project,stepId};
}
