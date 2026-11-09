import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance,pointOnSegment} from '../../src/core/geometry';
import type {Point,Segment} from '../../src/core/types';
import {buildPartialCreaseSimulationMesh} from '../../src/engine/simPartialCreaseMesh';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';

/** Same class as the user's screenshot: a flat CP with four partial orthogonal
 * precreases and a retained network of unfolded construction/crease marks. */
export function partialCreaseNetworkFixture(options:{divisions?:number;peak?:number;network?:boolean;activeRoutes?:number[]}={}){
  const doc=blankDoc('局部四短痕曲面',100,100),t=100*(1-1/Math.sqrt(2)),u=100-t;
  const line=(id:string,a:Point,b:Point):Segment=>({id,a,b,assignment:'F',angle:0});
  const routes=[line('short-left',[0,t],[t,t]),line('short-right',[u,u],[100,u]),line('short-top',[u,0],[u,t]),line('short-bottom',[t,u],[t,100])];
  doc.segments.push(...routes);
  if(options.network!==false){
    const marks:[Point,Point][]=[[[t,0],[t,100]],[[u,0],[u,100]],[[0,t],[100,t]],[[0,u],[100,u]],[[0,50],[100,50]],[[50,0],[50,100]],[[0,0],[100,100]],[[0,100],[100,0]],[[0,0],[u,t]],[[0,0],[t,u]],[[100,0],[t,t]],[[100,0],[u,u]],[[100,100],[t,u]],[[100,100],[u,t]],[[0,100],[t,t]],[[0,100],[u,u]]];
    doc.segments.push(...marks.map(([a,b],i)=>line(`retained-${i}`,a,b)));
  }
  const activeRoutes=(options.activeRoutes??[0,1,2,3]).map(i=>routes[i]);
  const source=buildDiagramFold(doc).graph,mesh=buildPartialCreaseSimulationMesh(source,activeRoutes,{divisions:options.divisions??4}),{prepared}=prepareSimulationDocument(mesh.fold),model=new OrigamiModel(prepared);
  const central=prepared.facesVertices.map((f,i)=>({i,d:distance([f.reduce((s,v)=>s+mesh.materialCoordinates[v][0],0)/3,f.reduce((s,v)=>s+mesh.materialCoordinates[v][1],0)/3],[50,50])})).sort((a,b)=>a.d-b.d)[0].i;
  const animation:SimulationStepAnimation={version:1,sourceSignature:'partial-crease-network-fixture',initialPositions:Array.from(model.originalPositions),fixedVertices:[...prepared.facesVertices[central]],ranges:prepared.creaseParams.map(c=>{
    const [a,b]=prepared.edgesVertices[c.edge],hit=activeRoutes.find(route=>[a,b].every(v=>pointOnSegment(mesh.materialCoordinates[v],route,1e-6)));
    return {edge:c.edge,fromAngle:0,toAngle:0,...(hit?{viaAngle:options.peak??180}:{})};
  })};
  return {doc,source,routes,mesh,prepared,animation,request:{version:1 as const,bendingStiffness:mesh.bendingStiffness}};
}
