/** Only an actual allocation with already validated sizes may attach this tag.
 * A RangeError from coverage traversal or geometry validation is not a resource
 * signal and must propagate unchanged. Fatal process OOM cannot be caught here. */
export class RegionAllocationError extends Error{
 constructor(cause:RangeError){super('无法为并行区域检查分配内存。',{cause});this.name='RegionAllocationError';}
}
export function rethrowRegionAllocation(error:unknown):never{
 if(error instanceof RangeError)throw new RegionAllocationError(error);
 throw error;
}
export function allocateRegion<T>(allocation:()=>T):T{
 try{return allocation();}catch(error){return rethrowRegionAllocation(error);}
}
