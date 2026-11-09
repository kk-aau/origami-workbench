import {computeModelSurface} from '../app/modelSurfaceAnalysis';
import type {ModelOverlapRequest,ModelOverlapReply,ModelOverlapProgress} from '../app/modelOverlapTask';
import {modelSurfaceTransfer} from '../app/modelSurfaceTransfer';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<ModelOverlapRequest>)=>void)|null;postMessage(reply:ModelOverlapReply|{type:'progress';progress:ModelOverlapProgress},transfer?:ArrayBuffer[]):void};
scope.onmessage=event=>{
 try{
  const reply=computeModelSurface(event.data,progress=>scope.postMessage({type:'progress',progress}));
  scope.postMessage(reply,modelSurfaceTransfer(reply));
 }
 catch(e){scope.postMessage({status:'error',message:`重叠区域分析失败：${e instanceof Error?e.message:String(e)}`});}
};
