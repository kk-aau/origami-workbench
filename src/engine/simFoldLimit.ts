import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SolverBackend,SolverPoseSnapshot} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {SimulationAngleAnalyzer} from './simConvergence';
import {snapshotAt} from './simContact';

export interface SimulationFoldLimitResult {
  status:'clear'|'limited'|'blocked';
  advancedSteps:number;
  constrainedSteps?:number;
  reason?:string;
}

/** Limit actual geometry, not just targets or the integrator's one-step-old
 * theta texture. CPU and GPU use the same signed, continuous angle test. */
export class SimulationFoldLimitGuard {
  private readonly analyzer:SimulationAngleAnalyzer;
  private readonly rest:Float32Array;
  constructor(private prepared:PreparedOrigamiModel,private backend:SolverBackend){
    this.analyzer=new SimulationAngleAnalyzer(prepared);
    this.rest=new OrigamiModel(prepared).originalPositions;
  }
  allowed(pose:SolverPoseSnapshot,history=pose.creaseAngles):boolean{
    this.analyzer.measure(pose.positions,history);
    return this.analyzer.withinFoldLimit();
  }
  step(count:number,advance:()=>SimulationFoldLimitResult=()=>{this.backend.step(1);return {status:'clear',advancedSteps:1};}):SimulationFoldLimitResult{
    if(!Number.isSafeInteger(count)||count<0)throw Error('折角保护的推进步数无效。');
    let advancedSteps=0,constrainedSteps=0;
    for(let i=0;i<count;i++){
      const before=this.backend.capturePose();
      if(!this.allowed(before)){
        this.backend.arrestDynamics();
        return {status:'blocked',advancedSteps,reason:'当前姿态存在超过 180° 的折角或退化纸面，请复位后重新模拟。'};
      }
      let result:SimulationFoldLimitResult,after:SolverPoseSnapshot;
      try{result=advance();after=this.backend.capturePose();}
      catch(error){this.backend.restorePose(before);throw error;}
      if(!this.allowed(after,before.creaseAngles)){
        // Search the actual Float32 positions that restorePose will commit.
        // Keeping a consistent displacement and theta history also drains
        // inertia, so resuming cannot retain the rejected overshoot velocity.
        let lo=0,hi=1,accepted=before;
        for(let pass=0;pass<24;pass++){
          const fraction=(lo+hi)/2,candidate=snapshotAt(this.prepared,this.rest,before,after,fraction);
          if(this.allowed(candidate,before.creaseAngles)){lo=fraction;accepted=candidate;}else hi=fraction;
        }
        this.backend.restorePose(accepted);
        return {status:lo>0?'limited':'blocked',advancedSteps:advancedSteps+(lo>0?1:0),constrainedSteps,
          reason:'折痕已到达 180° 上限，已停止继续加大；可调小折叠比例或反向展开。'};
      }
      advancedSteps+=result.advancedSteps;constrainedSteps+=result.constrainedSteps??0;
      if(result.status!=='clear')return {...result,advancedSteps,constrainedSteps};
    }
    return {status:'clear',advancedSteps,constrainedSteps};
  }
}
