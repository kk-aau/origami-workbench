import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {simulationStepFoldProfile} from './simStepAnimation';
import {compileSimulationStepRigidMechanism} from './simStepRigid';

/** Optional playback/capture stabilization. Follow the entire kinematic chain:
 * a panel carried by a moving parent is moving even if its own crease is idle.
 * Solver state, source CP, and the prescribed fold angles remain untouched. */
export function createSimulationStepStaticLock(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation){
  const mechanism=animation.flex||animation.dynamic?null:compileSimulationStepRigidMechanism(prepared,animation);
  const seed=Float32Array.from(animation.initialPositions),fixed=new Set(animation.fixedVertices);
  const mask=new Uint8Array(prepared.vertexCount);
  return (positions:Float32Array,progress:number):number=>{
    if(positions.length!==seed.length)throw Error('固定未参与纸层时，材料网格与起态不一致。');
    mask.fill(0);
    if(mechanism){
      const ranges=new Map(simulationStepFoldProfile(animation,progress).ranges.map(r=>[r.edge,r.fromAngle]));
      const moving=mechanism.components.map(c=>c.path.some(i=>ranges.get(prepared.creaseParams[i].edge)!==mechanism.fromAngles[i]));
      for(let i=0;i<mechanism.components.length;i++)if(moving[i])for(const vertex of mechanism.components[i].vertices)mask[vertex]=1;
      for(let v=0;v<prepared.vertexCount;v++)if(!moving[mechanism.vertexBodies[v]]&&mask[v]===0)mask[v]=2;
    }else{
      // Flexible/numerical paths may bend panels. Only their explicitly pinned
      // material is certified static; do not guess from endpoint similarity.
      for(const vertex of fixed)mask[vertex]=2;
    }
    let locked=0;
    for(let v=0;v<prepared.vertexCount;v++)if(mask[v]===2){positions.set(seed.subarray(v*3,v*3+3),v*3);locked++;}
    return locked;
  };
}
