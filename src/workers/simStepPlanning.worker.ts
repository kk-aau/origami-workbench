import {planDiagramStepPlayback} from '../engine/simStepPlanning';
import type {FoldGraph,FlatFoldResult} from '../core/types';
import type {SimulationStepAnimation} from '../engine/simStepAnimation';

self.onmessage=(event:MessageEvent<{fold:FoldGraph;animation:SimulationStepAnimation;initialGeometry?:FlatFoldResult;initialContactOrder?:import('../engine/simStepContactOrder').SimulationStepInitialOrder}>)=>{
  try{
    const result=planDiagramStepPlayback(event.data.fold,event.data.animation,message=>self.postMessage({type:'progress',message}),{initialGeometry:event.data.initialGeometry,initialContactOrder:event.data.initialContactOrder});
    self.postMessage({type:'result',result});
  }catch(error){
    const message=error instanceof Error&&/[\u3400-\u9fff]/.test(error.message)?error.message:'未能计算本步的折叠路径，请检查折痕或拆分步骤。';
    self.postMessage({type:'error',message});
  }
};
