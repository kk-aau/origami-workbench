import ear from 'rabbit-ear';
import type {FlatFoldConflict,FoldGraph,Point} from './types';
import type {FaceOrder} from './layerSolutions';
import {convexFacesOverlap,convexLayerContacts,type ConvexLayerConstraints} from './convexLayerContacts';
import {faceRelationComponents} from './faceRelationComponents';
import {layerThreeCycles} from './layerThreeCycles';
import {contactComparisonRows,coveragePairMembership,nonContactRows,type RegionCoverage,type RegionCoverageCertificate,type RegionProgress} from './regionTournament';
import {checkRegionCoverage,type RegionCoverageChecker} from './regionCoverageChecker';
import {LayerPairIndex as PairIndex,LayerCandidateSearch as CandidateRules} from './layerCandidateSearch';
import {createLayerRegionPruning} from './layerRegionPruning';
import {makeLayerConflict} from './flatConflictDiagnostics';

/** Return a +Z drawing order only when all supplied relations form a DAG. */
function pairOrder(index:PairIndex,values:Uint8Array):number[]|null{
  const incoming=new Uint32Array(index.faces),offsets=new Uint32Array(index.faces+1);
  index.pairs.forEach(([a,b],i)=>{if(!values[i])return;const below=values[i]===1?b:a,above=values[i]===1?a:b;incoming[above]++;offsets[below+1]++;});
  for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
  const neighbors=new Uint32Array(offsets[index.faces]),cursor=offsets.slice();
  index.pairs.forEach(([a,b],i)=>{if(values[i])neighbors[cursor[values[i]===1?b:a]++]=values[i]===1?a:b;});
  const order:number[]=[];for(let i=0;i<index.faces;i++)if(!incoming[i])order.push(i);
  for(let q=0;q<order.length;q++)for(let k=offsets[order[q]];k<offsets[order[q]+1];k++)if(--incoming[neighbors[k]]===0)order.push(neighbors[k]);
  return order.length===index.faces?order:null;
}

export interface ConvexLayerCandidate{orders:FaceOrder[];faceOrder?:number[];coverageCertificate?:RegionCoverageCertificate;nonContactRows?:Uint32Array}
export interface ConvexLayerCandidateOptions {
  coverage?:RegionCoverage;
  /** Hard user relations, or a selected candidate being extended as-is.
   * Failure under candidate locks proves only that candidate cannot extend,
   * never that the original unrestricted model has no solution. */
  fixedOrders?:readonly FaceOrder[];
  onProgress?:RegionProgress;
  coverageChecker?:RegionCoverageChecker;
  /** Only called after a proven failure, never for a rejected trial branch. */
  onConflict?:(conflict:FlatFoldConflict)=>void;
}

export interface LayerContactProblem {
 count:number;
 overlap:number[][];
 constraints:ConvexLayerConstraints;
 winding:boolean[];
 adjacent:Record<string,number>;
 /** Without convex polygons, exact material-region coverage is mandatory. */
 polygons?:Point[][];
}
/** Find and certify one candidate without enumerating its population. Contact
 * rules are exact. Transitivity is added lazily only after a candidate violates
 * a real positive-area three-face overlap. A DAG proves all such checks at once;
 * cyclic global arrangements are checked locally and remain supported. */
export function solveConvexLayerCandidate(graph:FoldGraph,epsilon:number,options:ConvexLayerCandidateOptions={}):ConvexLayerCandidate|null{
  // Native tessellation/FOLD graphs may omit derived adjacency. Match the
  // exact solver's defaults without changing supplied face/edge identities
  // or adding the derived arrays to the caller's graph.
  if(!graph.faces_edges||!graph.edges_faces||!graph.faces_faces){
    const faces_edges=graph.faces_edges??ear.graph.makeFacesEdgesFromVertices(graph);
    graph={...graph,faces_edges,
      edges_faces:graph.edges_faces??ear.graph.makeEdgesFacesUnsorted({...graph,faces_edges}),
      faces_faces:graph.faces_faces??ear.graph.makeFacesFaces(graph)};
  }
  const count=graph.faces_vertices!.length,overlap=convexFacesOverlap(graph,epsilon);
  const constraints=convexLayerContacts(graph,epsilon),winding=ear.graph.makeFacesWinding(graph);
  const adjacent=ear.layer.solveFlatAdjacentEdges(graph,winding);
  const polygons=options.coverage?undefined:ear.graph.makeFacesPolygon(graph,epsilon).map((p,f)=>winding[f]?p:p.reverse()) as Point[][];
  return solveLayerContactCandidate({count,overlap,constraints,winding,adjacent,polygons},epsilon,options);
}

/** Shared contact search; concave original faces use certified exact regions
 * for transitivity instead of enumerating private triangle combinations. */
export function solveLayerContactCandidate(problem:LayerContactProblem,epsilon:number,options:ConvexLayerCandidateOptions={}):ConvexLayerCandidate|null{
  const {count,overlap,winding,adjacent,polygons}=problem,index=new PairIndex(count);
  const constraints=problem.constraints;
  let regionalTriangles:readonly (readonly number[])[]|undefined;
  const prepareRegionPruning=()=>{
    if(regionalTriangles)return regionalTriangles;
    const pruning=createLayerRegionPruning(count);
    options.coverage?.walk({onCell:(cell,faces)=>pruning.observe(cell,faces)});
    regionalTriangles=pruning.triangles;
    options.onProgress?.('region-pruning',{prepared:regionalTriangles.length,cells:pruning.stats.observedCells});
    return regionalTriangles;
  };
  if(!polygons&&!options.coverage)throw Error('凹面层序候选必须提供完整原面区域覆盖。');
  overlap.forEach((row,a)=>row.forEach(b=>{if(a<b)index.term(a,b);}));
  let touches:ReturnType<typeof coveragePairMembership>|undefined;
  if(options.coverage){
    if(options.coverage.faceCount!==count)throw Error('精确覆盖与层序求解的纸面编号不一致。');
    touches=coveragePairMembership(options.coverage,(a,b)=>{index.term(a,b);},options.onProgress);
  }
  for(const key of Object.keys(adjacent)){const [a,b]=key.split(' ').map(Number);index.term(a,b);}
  for(const row of options.fixedOrders??[]){
    if(!Array.isArray(row)||row.length!==3||!Number.isInteger(row[0])||!Number.isInteger(row[1])||row[0]<0||row[1]<0||row[0]>=count||row[1]>=count||row[0]===row[1]||(row[2]!==1&&row[2]!==-1))throw Error('必须保留的层序关系无效。');
    index.term(row[0],row[1]);
  }
  const rules=new CandidateRules(index,constraints);
  // The rule index now includes every real pair as well as all auxiliary
  // terms. Subsequent transitivity clauses can only refer to existing ids.
  let excluded:Uint32Array|undefined;
  if(touches){
    excluded=touches.count===index.pairs.length?new Uint32Array(0):nonContactRows(index.pairs,touches);
    touches=undefined;
  }
  const contacts=excluded?contactComparisonRows(index.pairs,excluded):undefined;
  const failed=()=>{for(const conflict of rules.conflicts)options.onConflict?.(conflict);return null;};
  const initial=new Uint8Array(index.pairs.length);
  for(const [key,value]of Object.entries(adjacent)){const [a,b]=key.split(' ').map(Number);initial[index.find(a,b)-1]=value;}
  for(const [a,b,sign]of options.fixedOrders??[]){
    const term=index.term(a,b),value=sign*(winding[b]?1:-1)>0?1:2,canonical=term<0?3-value:value,id=Math.abs(term)-1;
    if(initial[id]&&initial[id]!==canonical){options.onConflict?.(makeLayerConflict('relative-order','constraint',[a,b],{relations:[{above:a,below:b},{above:b,below:a}]}));return null;}initial[id]=canonical;
  }
  if(!rules.seed(initial))return failed();
  const preference=new Uint32Array(count);
  let rootCyclic=false,rankedRootSize=-1;
  let preservesRootOrder:((below:number,above:number,id:number)=>boolean)|undefined;
  const rankForcedRelations=()=>{
    // Forced assignments only grow between trials. An unchanged root has
    // exactly the same ranking; an existing cycle survives every extension.
    if(rules.trail.length===rankedRootSize)return;
    const previousSize=rankedRootSize;rankedRootSize=rules.trail.length;
    if(preservesRootOrder){
      let unchanged=true;
      for(let i=previousSize;i<rankedRootSize;i++){
        const v=rules.trail[i],[a,b]=index.pairs[v],firstAbove=rules.values[v]===1;
        if(!preservesRootOrder(firstAbove?b:a,firstAbove?a:b,v+1)){unchanged=false;break;}
      }
      if(unchanged)return;
    }
    let order=rootCyclic?null:pairOrder(index,rules.values);
    if(!order){
      rootCyclic=true;
      const ranking=faceRelationComponents(count,index.pairs,rules.values,index.pairs.length>=65_536?(a,b)=>index.find(a,b):undefined);
      const {component}=ranking;preservesRootOrder=ranking.preservesOrder;
      order=Array.from({length:count},(_,i)=>i).sort((a,b)=>component[a]-component[b]||a-b);
    }
    order.forEach((f,i)=>{preference[f]=i;});
  };
  rankForcedRelations();
  let iteration=0;
  while(true){
    options.onProgress?.('candidate',{iteration:++iteration,pairs:index.pairs.length,transitivity:rules.transitivityCount});
    const candidate=rules.first(preference,prepareRegionPruning);options.onProgress?.('search',{...rules.lastSearch});if(!candidate)return failed();
    // Material-region certification is mandatory whenever coverage exists.
    // A global drawing order is useful only for the final certified result.
    let faceOrder=options.coverage||rootCyclic?null:pairOrder(index,candidate);
    let added=0;const newTriangles:number[][]=[];
    if(!faceOrder&&polygons&&!options.coverage){
      const {component,sizes}=faceRelationComponents(count,index.pairs,candidate);
      // Batching limits temporary storage, not the scope of verification: only
      // a full pass with zero violations may certify this candidate. A directed
      // triangle must lie within one SCC; all other triples are already acyclic.
      // Components are recomputed above for every changed candidate.
      let previousA=-1,previousB=-1,intersection:Point[]|undefined;
      for(const [a,b,c]of layerThreeCycles(overlap,(a,b)=>candidate[index.find(a,b)-1],component,sizes)){
        if(a!==previousA||b!==previousB){previousA=a;previousB=b;intersection=undefined;}
        intersection??=(ear.math.clipPolygonPolygon(polygons[a],polygons[b],epsilon)??[]) as Point[];
        if(intersection.length&&ear.math.clipPolygonPolygon(intersection,polygons[c],epsilon)){newTriangles.push([a,b,c]);if(++added>=10_000)break;}
      }
    }
    let coverageCertificate:RegionCoverageCertificate|undefined;
    if(options.coverage&&contacts){
      const checked=(options.coverageChecker??checkRegionCoverage)(options.coverage,contacts.pairs,contacts.values(candidate),options.onProgress);
      for(const triangle of checked.triangles){newTriangles.push(triangle);added++;}
      options.onProgress?.('coverage-constraints',{iteration,added,total:rules.transitivityCount+added});
      if(!added){if(!checked.complete||!checked.certificate)throw Error('精确区域没有完成全部层序复核。');coverageCertificate=checked.certificate;}
    }
    if(!added){
      if(!rules.valid(candidate))throw Error('层序候选未通过全部接触约束复核。');
      if(options.coverage&&!rootCyclic)faceOrder=pairOrder(index,candidate);
      const orders:FaceOrder[]=index.pairs.map(([a,b],i)=>[a,b,(candidate[i]===1?1:-1)*(winding[b]?1:-1)]);
      return {orders,...(faceOrder?{faceOrder}:{}),...(coverageCertificate?{coverageCertificate,nonContactRows:excluded}:{})};
    }
    if(!rules.addTransitivity(newTriangles))return failed();
    // New necessary transitivity clauses can strengthen the forced root.
    // Prefer its order before any guesses; never promote a candidate to root.
    rankForcedRelations();
  }
}
