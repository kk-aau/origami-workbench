import type {ModelOverlapReply} from './modelOverlapTask';

/** Transfer compact visible buffers once; never send the full subdivision. */
export function modelSurfaceTransfer(reply:ModelOverlapReply|undefined):ArrayBuffer[]{
 if(reply?.status!=='complete'||!reply.exact)return [];
 const buffers=new Set<ArrayBuffer>();
 for(const data of [reply,reply.opposite])if(data?.exact){
  for(const value of Object.values(data.exact))if(ArrayBuffer.isView(value)&&value.buffer instanceof ArrayBuffer)buffers.add(value.buffer);
 }
 return [...buffers];
}
