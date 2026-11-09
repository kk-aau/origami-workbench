import type {FoldGraph} from '../core/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {validateSimulationStepAnimationStructure} from './simStepAnimation';
import {prepareSimulationDocument} from './simmodel';
import {refinePreparedSimulationMesh,simulationInputMeshFold,type SimulationMeshProvenance} from './simFlexibleMesh';
import {simulationSourceSignature} from './simLayerOrder';

/** A private playback mesh: CP segments and original project data stay intact.
 * Every new hinge inherits its physical parent; numerical F seams merely
 * supply curvature. Fixed source-face points are interpolated with the same
 * material weights as the initial pose. */
export function refineSimulationStepForBending(fold:FoldGraph,animation:SimulationStepAnimation):{fold:FoldGraph;animation:SimulationStepAnimation}{
  const {prepared:base}=prepareSimulationDocument(fold);
  const refined=refinePreparedSimulationMesh(base,1,{maxVertices:1200,maxTriangles:2400});
  const provenance=refined.fold.zhezhi_flexible_mesh as SimulationMeshProvenance;
  const graph=simulationInputMeshFold(refined),sourceSignature=simulationSourceSignature(graph);
  const byEdge=new Map(animation.ranges.map(r=>[r.edge,r])),fixed=new Set(animation.bendingFixedVertices??animation.fixedVertices);
  const ranges=refined.creaseParams.map(c=>{
    const parent=provenance.edgeSourceEdges[c.edge],range=parent===null?undefined:byEdge.get(parent);
    return range?{...range,edge:c.edge}:{edge:c.edge,fromAngle:0,toAngle:0};
  });
  const initialPositions=provenance.vertexWeights.flatMap(row=>[0,1,2].map(axis=>row.reduce((sum,[v,w])=>sum+w*animation.initialPositions[3*v+axis],0)));
  const fixedVertices=provenance.vertexWeights.flatMap((row,v)=>row.every(([source])=>fixed.has(source))?[v]:[]);
  const retained=new Set(animation.retainedCreases??[]);
  const retainedCreases=provenance.edgeSourceEdges.flatMap((source,e)=>source!==null&&retained.has(source)?[e]:[]);
  const timeByEdge=new Map(animation.timings?.map(t=>[t.edge,t]));
  const timings=ranges.flatMap(r=>{const source=provenance.edgeSourceEdges[r.edge],timing=source===null?undefined:timeByEdge.get(source);return timing?[{...timing,edge:r.edge}]:[];});
  const next:SimulationStepAnimation={version:1,sourceSignature,initialPositions,ranges,fixedVertices,materialMode:'bendable',motionPolicy:'allow-dynamic',collisionPolicy:animation.collisionPolicy,retainedCreases,...timings.length?{timings}:{}};
  validateSimulationStepAnimationStructure(next,refined,sourceSignature);
  return {fold:graph,animation:next};
}
