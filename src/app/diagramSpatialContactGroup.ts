import type {FlatFoldResult,FlatLayerAdjustment,FlatLayerPreference} from '../core/types';
import {recomputeFlatLayers,solveIndependentFlatGroup} from '../core/flatFold';

export interface SpatialContactGroupInput {
  result:FlatFoldResult;
  required:FlatLayerPreference[];
  preferred:FlatLayerPreference[];
  adjustment?:FlatLayerAdjustment;
  independentFlatEpsilon?:number;
}
export type SpatialContactGroupResult=
  |{ok:true;orders:NonNullable<FlatFoldResult['layers']['faceOrders']>;message:string}
  |{ok:false;message:string};

export function solveSpatialContactGroup({result,required,preferred,adjustment,independentFlatEpsilon}:SpatialContactGroupInput):SpatialContactGroupResult{
  let initial=result;
  if(adjustment){
    initial=recomputeFlatLayers(result,{relativeConstraints:[...required,...preferred]});
    if(initial.layers.status!=='solved')return {ok:false,message:initial.layers.message};
    delete initial.layers.solutionIndex;delete initial.layers.solutionCount;delete initial.layers.solutionCountExact;
    initial.layers.relativeConstraints=required;
  }
  const solved=independentFlatEpsilon!==undefined?solveIndependentFlatGroup(initial,independentFlatEpsilon):recomputeFlatLayers(initial,{relativeConstraints:required,...(adjustment?{layerAdjustment:adjustment}:{layerPreferences:preferred})});
  return solved.layers.status==='solved'
    ?{ok:true,orders:solved.layers.faceOrders??[],message:solved.layers.message}
    :{ok:false,message:solved.layers.message};
}
