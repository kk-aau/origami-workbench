import {computeSimulationEndpointLayers} from '../engine/simEndpointLayers';
import type {FoldGraph} from '../core/types';

self.onmessage=(event:MessageEvent<FoldGraph>)=>{
  try{self.postMessage({order:computeSimulationEndpointLayers(event.data)});}
  catch(error){self.postMessage({order:null,error:error instanceof Error?error.message:'无法确认平折显示层序。'});}
};
