import {polygonArea} from '../core/geometry';
import {flatLayerEdges} from '../core/flatLayerOrder';
import type {FlatFoldResult,Point} from '../core/types';
import {modelOverlapRegions,type ModelOverlapRegions} from './modelOverlapRegions';
import {modelRegionLayers} from './modelRegionLayers';

export interface FlagstoneFaceGroup {
  /** A longest-chain rank in the verified bottom-to-top partial order. */
  level:number;
  faces:number[];
}

export interface FlagstoneGroupOcclusion {
  belowGroup:number;
  aboveGroup:number;
  /** Witnesses of immediate vertical adjacency in actual overlap cells. */
  facePairs:[number,number][];
  cellIndices:number[];
}

export type FlagstoneFaceGroupResult=
  | {status:'grouped';groups:FlagstoneFaceGroup[];occlusions:FlagstoneGroupOcclusion[];regionTopFaces:number[];omittedThinRegions:number}
  | {status:'unconfirmed'|'conflict';message:string;groups:[];occlusions:[]};

const unavailable=(status:'unconfirmed'|'conflict',message:string):FlagstoneFaceGroupResult=>({status,message,groups:[],occlusions:[]});

/** Group solved flagstone faces by partial-order rank, not by colour or an
 * arbitrary draw-order list. Each overlap cell must have a unique local order,
 * and the solver's complete face-order graph must be acyclic. The notebook
 * declares GroupFaces but never applies its gf option or returns its seven
 * construction-category gfaces lists; these verified ranks implement its
 * documented intent, not byte-for-byte notebook output. Run on demand in a
 * Worker, never during each preview pointer move.
 */
export function groupFlagstoneFaces(result:FlatFoldResult,regions?:ModelOverlapRegions):FlagstoneFaceGroupResult{
  if(result.geometry.status!=='ready'||result.layers.status!=='solved')return unavailable('unconfirmed','需要有效的平折几何与已求解的层序。');
  const {vertices,faces}=result.geometry;
  if(!faces.length||!vertices.length)return unavailable('unconfirmed','平折结果没有可分组的纸面。');
  if(vertices.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))||
    faces.some(face=>face.length<3||new Set(face).size!==face.length||face.some(v=>!Number.isInteger(v)||v<0||v>=vertices.length)))
    return unavailable('unconfirmed','平折纸面几何无效。');
  const areas=faces.map(face=>polygonArea(face.map(v=>vertices[v])));
  if(areas.some(area=>!Number.isFinite(area)||Math.abs(area)<1e-12))return unavailable('unconfirmed','存在退化纸面，无法确定层序等级。');
  const relations=result.layers.faceOrders??[];
  if(relations.some(r=>!Array.isArray(r)||r.length!==3||!Number.isInteger(r[0])||!Number.isInteger(r[1])||r[0]<0||r[1]<0||r[0]>=faces.length||r[1]>=faces.length||r[0]===r[1]||Math.abs(r[2])!==1))
    return unavailable('conflict','求解器返回的面层序关系无效。');

  // Check the complete solver graph first. Distinct geometric regions can
  // each look ordered while their union forms a contradictory cycle.
  const solverEdges=flatLayerEdges(relations,areas.map(area=>area>0?1:-1));
  const solverNext=Array.from({length:faces.length},()=>new Set<number>());
  for(const [below,above] of solverEdges)solverNext[below].add(above);
  if(!acyclic(solverNext))return unavailable('conflict','求解器面层序形成循环，不能确定层序分组。');

  let coverage:ModelOverlapRegions;
  try{coverage=regions??modelOverlapRegions(result);}
  catch{return unavailable('unconfirmed','无法确认平折纸面的真实重叠区域。');}
  if(!coverage.cells.length)return unavailable('unconfirmed','没有可验证的平折重叠区域。');
  if(!validCoverage(coverage,vertices,faces,areas))return unavailable('unconfirmed','重叠区域与当前平折几何不一致，不能据此确定面组。');
  let local:ReturnType<typeof modelRegionLayers>;
  try{local=modelRegionLayers(result,coverage,'front');}
  catch{return unavailable('unconfirmed','重叠区域与层序数据不匹配。');}
  const conflict=local.find(cell=>cell.layers.status==='conflict');
  if(conflict)return unavailable('conflict','至少一个重叠区域的面层序形成循环。');
  const unknown=local.find(cell=>cell.layers.status==='unconfirmed');
  if(unknown)return unavailable('unconfirmed','至少一个重叠区域缺少确定的面层序。');

  const directNext=Array.from({length:faces.length},()=>new Set<number>());
  const witnesses=new Map<string,Set<number>>(),seenFaces=new Set<number>(),regionTopFaces:number[]=[];
  local.forEach((cell,index)=>{
    const order=cell.layers.status==='ordered'?cell.layers.topToBottom:[];
    regionTopFaces.push(order[0]);
    order.forEach(id=>seenFaces.add(id));
    for(let j=1;j<order.length;j++){
      const below=order[j],above=order[j-1],key=`${below},${above}`;
      directNext[below].add(above);
      const cells=witnesses.get(key)??new Set<number>();cells.add(index);witnesses.set(key,cells);
    }
  });
  if(seenFaces.size!==faces.length)return unavailable('unconfirmed','部分纸面没有可验证的面积区域。');
  const levels=longestPathLevels(directNext);
  if(!levels)return unavailable('conflict','重叠区域的遮挡关系形成循环。');
  const groups:FlagstoneFaceGroup[]=[];
  levels.forEach((level,face)=>{(groups[level]??={level,faces:[]}).faces.push(face);});
  const byGroups=new Map<string,FlagstoneGroupOcclusion>();
  for(const [key,cells] of witnesses){
    const [below,above]=key.split(',').map(Number),belowGroup=levels[below],aboveGroup=levels[above];
    const groupKey=`${belowGroup},${aboveGroup}`;
    let edge=byGroups.get(groupKey);
    if(!edge){edge={belowGroup,aboveGroup,facePairs:[],cellIndices:[]};byGroups.set(groupKey,edge);}
    edge.facePairs.push([below,above]);
    edge.cellIndices.push(...cells);
  }
  const occlusions=[...byGroups.values()].sort((a,b)=>a.belowGroup-b.belowGroup||a.aboveGroup-b.aboveGroup);
  for(const edge of occlusions){
    edge.facePairs.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    edge.cellIndices=[...new Set(edge.cellIndices)].sort((a,b)=>a-b);
  }
  return {status:'grouped',groups,occlusions,regionTopFaces,omittedThinRegions:coverage.omittedThinRegions};
}

/** The optional precomputed coverage can belong to a previous slider frame.
 * Verify its polygons, memberships and area partition before trusting it.
 * The same check detects omitted finite-area slivers in fresh decompositions.
 */
function validCoverage(regions:ModelOverlapRegions,vertices:Point[],faces:number[][],faceAreas:number[]):boolean{
  const {cells,epsilon,maxDepth,omittedThinRegions}=regions;
  if(!Number.isFinite(epsilon)||epsilon<=0||!Number.isInteger(maxDepth)||maxDepth<1||
    !Number.isInteger(omittedThinRegions)||omittedThinRegions<0)return false;
  const polygons=faces.map(face=>face.map(id=>vertices[id]));
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of vertices){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const extent=Math.max(1,maxX-minX,maxY-minY);
  const covered=faces.map(()=>0);
  let foundDepth=0;
  for(const cell of cells){
    if(!cell||!Array.isArray(cell.polygon)||cell.polygon.length<3||
      cell.polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))||
      !Number.isFinite(cell.area)||cell.area<=0||!Array.isArray(cell.faces)||
      !cell.faces.length||new Set(cell.faces).size!==cell.faces.length||
      cell.faces.some(id=>!Number.isInteger(id)||id<0||id>=faces.length))return false;
    const polygonAreaAbs=Math.abs(polygonArea(cell.polygon));
    if(Math.abs(polygonAreaAbs-cell.area)>Math.max(cell.area*1e-5,epsilon*extent*4))return false;
    const probe:Point=[
      cell.polygon.reduce((sum,p)=>sum+p[0],0)/cell.polygon.length,
      cell.polygon.reduce((sum,p)=>sum+p[1],0)/cell.polygon.length,
    ];
    const actual=polygons.flatMap((polygon,id)=>inside(probe,polygon)?[id]:[]);
    if(actual.length!==cell.faces.length||actual.some(id=>!cell.faces.includes(id)))return false;
    cell.faces.forEach(id=>covered[id]+=cell.area);
    foundDepth=Math.max(foundDepth,cell.faces.length);
  }
  if(foundDepth!==maxDepth)return false;
  return faceAreas.every((area,id)=>Math.abs(covered[id]-Math.abs(area))<=Math.max(Math.abs(area)*1e-5,epsilon*extent*8));
}

function inside(p:Point,polygon:Point[]):boolean{
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
}

function acyclic(next:Set<number>[]):boolean{return longestPathLevels(next)!==null;}

function longestPathLevels(next:Set<number>[]):number[]|null{
  const indegree=next.map(()=>0),levels=next.map(()=>0);
  next.forEach(above=>above.forEach(id=>indegree[id]++));
  const queue:number[]=[];
  indegree.forEach((degree,id)=>{if(!degree)queue.push(id);});
  let done=0;
  for(let head=0;head<queue.length;head++){
    const below=queue[head];done++;
    for(const above of next[below]){
      levels[above]=Math.max(levels[above],levels[below]+1);
      if(--indegree[above]===0)queue.push(above);
    }
  }
  return done===next.length?levels:null;
}
