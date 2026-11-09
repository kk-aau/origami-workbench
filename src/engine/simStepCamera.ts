import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {createSimulationStepPathEvaluator} from './simStepPath';

/** One fixed camera frame encloses the full playback, including excursions
 * between equal endpoints. It changes only the camera, never material units. */
export function simulationStepCameraBounds(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):{center:[number,number,number];radius:number}{
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const include=(positions:ArrayLike<number>,bounds?:ArrayLike<number>)=>{
    for(let v=0;v<prepared.vertexCount;v++)for(let axis=0;axis<3;axis++){
      const value=positions[v*3+axis],extent=(bounds?.[v]??0)+2e-6;
      if(!Number.isFinite(value)||!Number.isFinite(extent)||extent<0)throw Error('步骤动画取景范围无效。');
      min[axis]=Math.min(min[axis],value-extent);max[axis]=Math.max(max[axis],value+extent);
    }
  };
  include(animation.initialPositions);
  if(animation.dynamic){
    for(const frame of animation.dynamic.keyframes)include(frame.positions);
  }else if(animation.flex){
    // Flex playback interpolates positions linearly; endpoint boxes enclose
    // each whole piece, including the finite-tip curved return.
    for(const frame of animation.flex.keyframes)include(frame.positions);
  }else if(animation.motion){
    const path=createSimulationStepPathEvaluator(prepared,animation,animation.motion);
    const divisions=Math.max(1,Math.floor(192/animation.motion.phases.length));
    for(const phase of animation.motion.phases)for(let i=0;i<divisions;i++){
      const start=phase.start+(phase.end-phase.start)*i/divisions,end=phase.start+(phase.end-phase.start)*(i+1)/divisions;
      // This is the same whole-interval displacement bound used for CCD,
      // rather than assuming that a few sampled poses bound a rotating flap.
      include(path.evaluate((start+end)/2),path.motionBound(start,end));
    }
  }
  const center=min.map((value,axis)=>(value+max[axis])/2) as [number,number,number];
  return {center,radius:Math.max(1e-4,Math.hypot(...max.map((value,axis)=>(value-min[axis])/2)))};
}
