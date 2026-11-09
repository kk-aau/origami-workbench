import {useEffect,useState} from 'react';
import {computeTessFlatGeometry} from './tessellationFlatGeometry';
import {startFlatLayerReanalysis} from '../core/workerClient';
import type {TessResult} from './tessellation';
import {tessFlatInput} from './tessellationFlat';
import {primalDualTopFaceConstraints} from './primalDualVisibleFace';
import {primalDualFaceupRoot,primalDualFaceupSatisfied} from './primalDualFaceup';

export type TilePatchLayerStatus='checking'|'solved'|'no-solution'|'invalid'|'unconfirmed';
export type TilePatchLayerCheck={result:TessResult;key:string;status:TilePatchLayerStatus;message:string;solutionCountExact?:string};

/** Verify each current, complete tile patch independently of the optional flat-view panel. */
export function useTilePatchLayerCheck(result:TessResult|null,resultKey:string,currentKey:string,enabled:boolean,budgetSeconds:number,retry:number,visibleTopFace?:number,faceupFace?:number):TilePatchLayerCheck|null{
  const [state,setState]=useState<TilePatchLayerCheck|null>(null);
  useEffect(()=>{
    if(!enabled||!result||resultKey!==currentKey)return;
    let active=true;
    const update=(status:TilePatchLayerStatus,message:string,solutionCountExact?:string)=>{
      if(active)setState({result,key:currentKey,status,message,solutionCountExact});
    };
    update('checking','正在检查整片折后几何与山谷层序。');
    let cancel=()=>{};
    try{
      const input=tessFlatInput(result,result.doc,currentKey,true);
      const constraints=primalDualTopFaceConstraints(visibleTopFace,input.graph.faces_vertices?.length??0);
      if(constraints===null){update('invalid','所选可见顶面不在当前折痕面的编号范围内。');return;}
      if(faceupFace!==undefined)input.startingFace=primalDualFaceupRoot(input.graph,faceupFace);
      input.faceupFace=faceupFace;
      const geometry=computeTessFlatGeometry(input);
      if(geometry.geometry.status!=='ready')update('invalid',geometry.geometry.message);
      else{
        const job=startFlatLayerReanalysis(geometry,{timeoutMs:budgetSeconds*1000,constraints});
        cancel=job.cancel;
        void job.promise.then(solved=>{
          const faceupValid=faceupFace===undefined||solved.layers.status!=='solved'||primalDualFaceupSatisfied(solved,input.graph,faceupFace);
          const status=!faceupValid?'no-solution':solved.layers.status==='solved'?'solved':solved.layers.status==='no-solution'?'no-solution':'unconfirmed';
          update(status,faceupValid?solved.layers.message:'当前层序与 FaceupFace 的局部上下传播不一致，候选不能采用。',
            status==='solved'?solved.layers.solutionCountExact:undefined);
        }).catch(error=>update('unconfirmed',error instanceof Error?error.message:String(error)));
      }
    }catch(error){update('invalid',error instanceof Error?error.message:String(error));}
    return()=>{active=false;cancel();};
  },[result,resultKey,currentKey,enabled,budgetSeconds,retry,visibleTopFace,faceupFace]);
  return enabled&&state?.result===result&&state.key===currentKey?state:null;
}
