/** The protocol and cached DFS schedule support at most 64 independent slices.
 * This is not a face/cell limit, and does not assume this computer's core count. */
export const REGION_MAX_WORKERS=64;
export function regionParallelWorkerCount(reported:unknown,availableChunks:unknown=REGION_MAX_WORKERS):number{
 const cores=typeof reported==='number'&&Number.isSafeInteger(reported)&&reported>0?reported:1;
 const chunks=typeof availableChunks==='number'&&Number.isSafeInteger(availableChunks)&&availableChunks>0?availableChunks:1;
 return Math.min(cores,chunks,REGION_MAX_WORKERS);
}
