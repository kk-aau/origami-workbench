import type {SimulationStepAnimation} from '../engine/simStepAnimation';

export type AutomaticSinkPhase=0|1;
export const sinkPhaseAt=(progress:number):AutomaticSinkPhase=>progress<.5?0:1;
export const stepProgressAt=(phase:AutomaticSinkPhase|undefined,local:number)=>phase===undefined?local:(phase+local)/2;
export const localProgressAt=(phase:AutomaticSinkPhase|undefined,progress:number)=>phase===undefined?progress:Math.min(1,Math.max(0,2*progress-phase));
/** The open pose is internal to the sink. The regular step pause applies
 * once the operation has finished. A negative pause means manual advance. */
export const playbackBoundaryPause=(sinkSeam:boolean,stepPause:number,sinkPause=0)=>sinkSeam?sinkPause:stepPause;

export type SinkPoseClock=Array<[elapsed:number,recorded:number]>;

/** The solver records extra samples while converging to the open or pressed
 * pose. Assign display time by the distance travelled through those same
 * poses. Explicit hinge timings and safety stops keep their original clock. */
export function createSinkPoseClock(animation:SimulationStepAnimation):SinkPoseClock|undefined{
  const frames=animation.dynamic?.keyframes??animation.flex?.keyframes;
  if(!frames||frames.length<2||animation.timings?.length||animation.dynamic?.contactStop)return;
  const clock:SinkPoseClock=[[0,0]];
  let length=0;
  for(let i=1;i<frames.length;i++){
    const previous=frames[i-1].positions,current=frames[i].positions;
    let sum=0;
    for(let k=0;k<current.length;k++)sum+=(current[k]-previous[k])**2;
    length+=Math.sqrt(sum);
    clock.push([length,frames[i].progress]);
  }
  if(!length)return;
  for(const knot of clock)knot[0]/=length;
  return clock;
}

/** Map elapsed time onto the recorded path; layer order and crease display
 * must sample the same returned position as the mesh. */
export function sinkMotionProgress(clock:SinkPoseClock|undefined,progress:number):number{
  if(!clock||progress<=0||progress>=1)return progress;
  let left=0,right=clock.length-1;
  while(right-left>1){
    const mid=(left+right)>>>1;
    if(clock[mid][0]<=progress)left=mid;else right=mid;
  }
  const [t0,p0]=clock[left],[t1,p1]=clock[right];
  return p0+(progress-t0)/(t1-t0)*(p1-p0);
}
