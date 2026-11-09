import {modelShadowBoundaries} from '../app/modelShadowBoundaries';
import type {ModelShadowRequest,ModelShadowReply} from '../app/modelShadowTask';

const scope=globalThis as unknown as {onmessage:((event:MessageEvent<ModelShadowRequest>)=>void)|null;postMessage(reply:ModelShadowReply):void};
scope.onmessage=event=>{
  try{
    const {result,side,rotation}=event.data;
    scope.postMessage({status:'complete',analysis:modelShadowBoundaries(result,side,rotation)});
  }catch(error){
    scope.postMessage({status:'error',message:`纸层阴影分析失败：${error instanceof Error?error.message:String(error)}`});
  }
};
