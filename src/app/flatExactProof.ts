import type {FlatFoldResult} from '../core/types';
import type {FaceOrder} from '../core/layerSolutions';
import type {ExactModelTopology} from './modelExactTopology';

export interface ExactCellLayerCertificate {
 top:Int32Array;bottom:Int32Array;depth:Uint32Array;verifiedCells:number;
}
export interface FlatExactProof {
 topology:ExactModelTopology;
 certificate:ExactCellLayerCertificate;
}
export interface FlatSurfaceBinding {
 geometry:string;geometryStatus:FlatFoldResult['geometry']['status'];layers:FlatFoldResult['layers'];layerStatus:FlatFoldResult['layers']['status'];
 orders:readonly FaceOrder[]|undefined;orderValues:Uint32Array;faceOrder:readonly number[]|undefined;faceOrderValues:Uint32Array;selection:string;
}
interface Entry extends FlatExactProof {binding:FlatSurfaceBinding}
const proofs=new WeakMap<FlatFoldResult,Entry>();

/** Transient worker data: never added to the saved result, history or project
 * JSON. Geometry binding is an exact value snapshot, not a colliding hash. */
export function exactGeometryBinding(result:FlatFoldResult):string {
 return JSON.stringify([result.geometry.vertices,result.geometry.faces,result.geometry.graph?.faces_holes??null]);
}
/** Value snapshots detect in-place edits as well as replacement immutable
 * snapshots. The typed relation copy avoids a large JSON string per cache. */
export function captureFlatSurfaceBinding(result:FlatFoldResult):FlatSurfaceBinding {
 const orders=result.layers.faceOrders,faceOrder=result.layers.faceOrder,faceCount=result.geometry.faces.length,orderValues=new Uint32Array((orders?.length??0)*3);
 orders?.forEach((order,i)=>{
  if(!Array.isArray(order)||order.length!==3)throw Error('纸面缓存的层序关系无效。');const [a,b,sign]=order;
  if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=faceCount||b>=faceCount||a===b||Math.abs(sign)!==1)throw Error('纸面缓存的层序关系无效。');
  orderValues[i*3]=a;orderValues[i*3+1]=b;orderValues[i*3+2]=sign===1?1:2;
 });
 if(faceOrder?.some(f=>!Number.isInteger(f)||f<0||f>=faceCount))throw Error('纸面缓存的全局绘制顺序无效。');
 return {geometry:exactGeometryBinding(result),geometryStatus:result.geometry.status,layers:result.layers,layerStatus:result.layers.status,orders,orderValues,faceOrder,faceOrderValues:Uint32Array.from(faceOrder??[]),selection:JSON.stringify([result.layers.solutionIndex,result.layers.constraints??null])};
}
export function flatSurfaceBindingMatches(result:FlatFoldResult,binding:FlatSurfaceBinding):boolean {
 return result.layers===binding.layers&&result.layers.faceOrders===binding.orders&&result.layers.faceOrder===binding.faceOrder&&flatSurfaceBindingValuesMatch(result,binding);
}
/** For a history/collection structuredClone: compare values first, then a new
 * binding may share the immutable typed snapshot while replacing references. */
export function flatSurfaceBindingValuesMatch(result:FlatFoldResult,binding:FlatSurfaceBinding):boolean {
 const orders=result.layers.faceOrders,faceOrder=result.layers.faceOrder;
 if(result.geometry.status!==binding.geometryStatus||result.layers.status!==binding.layerStatus||Boolean(orders)!==Boolean(binding.orders)||Boolean(faceOrder)!==Boolean(binding.faceOrder)||exactGeometryBinding(result)!==binding.geometry||JSON.stringify([result.layers.solutionIndex,result.layers.constraints??null])!==binding.selection)return false;
 if((orders?.length??0)*3!==binding.orderValues.length||orders?.some((row,i)=>!Array.isArray(row)||row.length!==3||row[0]!==binding.orderValues[i*3]||row[1]!==binding.orderValues[i*3+1]||row[2]!== (binding.orderValues[i*3+2]===1?1:-1)))return false;
 return (faceOrder?.length??0)===binding.faceOrderValues.length&&!faceOrder?.some((face,i)=>face!==binding.faceOrderValues[i]);
}
export function rememberFlatExactProof(result:FlatFoldResult,proof:FlatExactProof):void {
 const {topology,certificate}=proof;
 if(result.geometry.status!=='ready'||result.layers.status!=='solved'||!result.layers.faceOrders||topology.faceCount!==result.geometry.faces.length
  ||!(certificate.top instanceof Int32Array)||!(certificate.bottom instanceof Int32Array)||!(certificate.depth instanceof Uint32Array)
  ||certificate.verifiedCells!==topology.cellCount||certificate.top.length!==topology.cellCount||certificate.bottom.length!==topology.cellCount||certificate.depth.length!==topology.cellCount)throw Error('精确纸面证书与层序结果不一致。');
 for(let cell=0;cell<topology.cellCount;cell++){
  const top=certificate.top[cell],bottom=certificate.bottom[cell],depth=certificate.depth[cell];
  if(depth>topology.faceCount||top< -1||bottom< -1||top>=topology.faceCount||bottom>=topology.faceCount||depth===0&&(top!==-1||bottom!==-1)||depth>0&&(top<0||bottom<0)||depth===1&&top!==bottom||depth>1&&top===bottom)throw Error('精确纸面证书包含未完成的区域层序。');
 }
 proofs.set(result,{...proof,binding:captureFlatSurfaceBinding(result)});
}
/** A different layer solution or changed geometry cannot reuse a prior proof.
 * The entry lives only between synchronous solving and worker publication. */
export function flatExactProof(result:FlatFoldResult):FlatExactProof|undefined {
 const entry=proofs.get(result);
 if(!entry)return undefined;
 if(!flatSurfaceBindingMatches(result,entry.binding)){proofs.delete(result);return undefined;}
 return entry;
}
export function releaseFlatExactProof(result:FlatFoldResult):void {proofs.delete(result);}
