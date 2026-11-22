import {prepareSimulationDocument} from './simmodel';
import {simulationSourceSignature} from './simLayerOrder';
import {validateSimulationStepAnimation} from './simStepAnimation';
import {simulationStepCameraBounds} from './simStepCamera';

export interface SinkPlaybackInput {fold:unknown;animation:unknown}
export function prepareSinkPhase({fold,animation}:SinkPlaybackInput){
  const result=prepareSimulationDocument(fold);
  const signature=simulationSourceSignature(fold);
  const checked=validateSimulationStepAnimation(animation,result.prepared,signature);
  return {result,signature,animation:checked,frame:simulationStepCameraBounds(result.prepared,checked)};
}
export type PreparedSinkPhase=ReturnType<typeof prepareSinkPhase>;
export type PreparedSinkPair=[PreparedSinkPhase,PreparedSinkPhase];
