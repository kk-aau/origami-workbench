import type {RegionTriangle} from './regionTournament';

export interface LayerRegionPruningOptions {
  /** Optimization storage/work budgets, never limits on the solve or its
   * complete coverage certificate. Zero disables this optional accelerator. */
  maxTriangles?:number;
  /** Only cells with at least three covering faces consume this work budget. */
  maxCells?:number;
  maxTrianglesPerCell?:number;
}
export interface LayerRegionPruningStats {
  observedCells:number;
  sampledCells:number;
  attemptedTriangles:number;
  retainedTriangles:number;
  budgetExhausted:boolean;
}
export interface LayerRegionPruning {
  /** Call only for actual RegionCoverage.onCell snapshots. Transition unions
   * and pairwise-overlap neighborhoods are not evidence of a common region. */
  observe:(cell:number,faces:ReadonlySet<number>)=>void;
  readonly triangles:readonly RegionTriangle[];
  readonly stats:Readonly<LayerRegionPruningStats>;
}

function budget(value:number|undefined,fallback:number):number {
  const result=value??fallback;
  if(!Number.isSafeInteger(result)||result<0)throw Error('区域提前剪枝的缓存预算必须为非负安全整数。');
  return result;
}

/** Collect a bounded subset of NECESSARY transitivity clauses from real cells.
 * A cell with k faces contributes at most a short fan of triples, not k-choose-3
 * clauses or a k-by-k matrix. Once storage or observation work is exhausted,
 * subsequent callbacks do no sampling; the caller still walks/certifies every
 * cell and learns any missing clauses from complete coverage verification.
 *
 * These are static facts about geometry, not guessed candidate relations.
 * Install them in the solver's ordinary rule tables so propagation and every
 * rejected branch use the SAME assignment trail and rollback mechanism. No
 * separate mutable reachability state can survive a solver rollback here. */
export function createLayerRegionPruning(faceCount:number,options:LayerRegionPruningOptions={}):LayerRegionPruning {
  if(!Number.isSafeInteger(faceCount)||faceCount<0||faceCount>0x7fffffff)throw Error('区域提前剪枝的纸面数量无效。');
  const maxTriangles=budget(options.maxTriangles,8192),maxCells=budget(options.maxCells,8192),perCell=budget(options.maxTrianglesPerCell,16);
  const triangles:RegionTriangle[]=[],seen=new Set<string>();
  let observedCells=0,sampledCells=0,attemptedTriangles=0;
  const exhausted=()=>!maxTriangles||!maxCells||!perCell||triangles.length>=maxTriangles||sampledCells>=maxCells;
  return {
    get triangles(){return triangles;},
    get stats(){return {observedCells,sampledCells,attemptedTriangles,retainedTriangles:triangles.length,budgetExhausted:exhausted()};},
    observe(cell,faces){
      if(!Number.isSafeInteger(cell)||cell<0)throw Error('区域提前剪枝收到无效区域编号。');
      observedCells++;
      if(exhausted()||faces.size<3)return;
      sampledCells++;
      // Read a short prefix only. In particular, never spread/sort the entire
      // active Set of a deep stack. Each picked triple is visibly a subset of
      // this one atomic onCell snapshot, independent of previous cells.
      let anchor=-1,previous=-1,attempts=0;
      const selected=new Set<number>();
      for(const face of faces){
        if(!Number.isInteger(face)||face<0||face>=faceCount)throw Error('区域提前剪枝包含无效的纸面编号。');
        if(selected.has(face))throw Error('区域提前剪枝包含重复纸面。');
        selected.add(face);
        if(anchor<0){anchor=face;continue;}
        if(previous<0){previous=face;continue;}
        const a=Math.min(anchor,previous,face),c=Math.max(anchor,previous,face),b=anchor+previous+face-a-c;
        const key=`${a} ${b} ${c}`;
        attempts++;attemptedTriangles++;
        if(!seen.has(key)){seen.add(key);triangles.push([a,b,c]);}
        if(triangles.length>=maxTriangles||attempts>=perCell)break;
        previous=face;
      }
    },
  };
}
