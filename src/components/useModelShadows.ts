import {useEffect,useState} from 'react';
import type {FlatFoldResult} from '../core/types';
import type {FlatSide} from '../app/flatPresentation';
import {startModelShadowAnalysis,type ModelShadowReply} from '../app/modelShadowTask';

export function useModelShadows(result:FlatFoldResult,side:FlatSide,rotation:number,enabled:boolean){
  const [completed,setCompleted]=useState<{result:FlatFoldResult;side:FlatSide;rotation:number;reply:ModelShadowReply}|null>(null);
  useEffect(()=>{
    if(!enabled)return;
    let live=true;
    const task=startModelShadowAnalysis(result,side,rotation);
    task.promise.then(reply=>{if(live)setCompleted({result,side,rotation,reply});});
    return()=>{live=false;task.cancel();};
  },[result,side,rotation,enabled]);
  // Never paint the previous geometry/direction while its replacement is pending.
  return enabled&&completed?.result===result&&completed.side===side&&completed.rotation===rotation?completed.reply:null;
}
