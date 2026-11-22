import {coveragePairMembership,nonContactRows} from '../core/regionTournament';
import {walkExactCoverage} from './modelExactTopology';
import {certifyRelativeLayerConstraints} from '../core/relativeLayerConstraints';
import type {FlatFoldResult} from '../core/types';
import {flatExactProof,releaseFlatExactProof,rememberFlatExactProof} from './flatExactProof';
import {completeExactSurface} from './completeExactSurface';
import type {ModelOverlapProgress,ModelOverlapReply} from './modelOverlapTask';

export interface FlatFoldPublication {type:'result';result:FlatFoldResult;surface?:ModelOverlapReply}

/** Publish a certified large result only after its contours are complete. The
 * working topology/certificate never become part of the persisted result. */
export function flatFoldPublication(result:FlatFoldResult,onProgress?:(progress:ModelOverlapProgress)=>void):FlatFoldPublication {
 const proof=flatExactProof(result);if(!proof)return {type:'result',result};
 try{
  // A hinge or edge contact can constrain the search without ordering two
  // visible paper layers. Remove only rows absent from every certified cell.
  const orders=result.layers.faceOrders;
  if(orders?.length&&!proof.physicalOrdersOnly&&!proof.certificate.depth.includes(proof.topology.faceCount)){
   const {topology}=proof;
   const excluded=proof.nonContactRows??nonContactRows(orders,coveragePairMembership({
    faceCount:topology.faceCount,cellCount:topology.cellCount,walk:v=>walkExactCoverage(topology,v),
   }));
   if(excluded.length){
    let next=0;
    result.layers.faceOrders=orders.filter((_,i)=>{if(i!==excluded[next])return true;next++;return false;});
    certifyRelativeLayerConstraints(result,result.layers.relativeConstraints??[]);
    if(result.layers.status!=='solved')return {type:'result',result};
    rememberFlatExactProof(result,{topology,certificate:proof.certificate,physicalOrdersOnly:true});
   }
  }
  const surface=completeExactSurface(result,proof,{side:'front',bothSides:true,shadows:true},onProgress);
  return {type:'result',result,surface};
 }catch(error){
  // A failed surface must not restart the same work indefinitely or claim a
  // complete paper. Preserve the geometry and report the actual failure.
  return {type:'result',result:{...result,layers:{status:'error',message:`完整纸面计算未完成：${error instanceof Error?error.message:String(error)}`}}};
 }finally{releaseFlatExactProof(result);}
}
