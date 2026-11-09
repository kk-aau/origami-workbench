import type {FlatFoldResult} from '../core/types';
import {flatExactProof,releaseFlatExactProof} from './flatExactProof';
import {completeExactSurface} from './completeExactSurface';
import type {ModelOverlapProgress,ModelOverlapReply} from './modelOverlapTask';

export interface FlatFoldPublication {type:'result';result:FlatFoldResult;surface?:ModelOverlapReply}

/** Publish a certified large result only after its contours are complete. The
 * working topology/certificate never become part of the persisted result. */
export function flatFoldPublication(result:FlatFoldResult,onProgress?:(progress:ModelOverlapProgress)=>void):FlatFoldPublication {
 const proof=flatExactProof(result);if(!proof)return {type:'result',result};
 try{
  const surface=completeExactSurface(result,proof,{side:'front',bothSides:true,shadows:true},onProgress);
  return {type:'result',result,surface};
 }catch(error){
  // A failed surface must not restart the same work indefinitely or claim a
  // complete paper. Preserve the geometry and report the actual failure.
  return {type:'result',result:{...result,layers:{status:'error',message:`完整纸面计算未完成：${error instanceof Error?error.message:String(error)}`}}};
 }finally{releaseFlatExactProof(result);}
}
