import {buildDiagramFold,distance,epsilonFor,pointOnSegment} from '../core/geometry';
import {computeFlatGeometry} from '../core/flatFold';
import {hasMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {coalescePartialCreaseRoutes} from '../engine/simPartialCreaseMesh';
import {applyDiagramFoldSegments,diffDiagramFoldCP} from './diagramFoldLink';

const mv=(segment:Segment)=>segment.assignment==='M'||segment.assignment==='V';
const subset=(doc:Doc,predicate:(segment:Segment)=>boolean):Doc=>({...doc,segments:doc.segments.filter(predicate)});
const sameCoverage=(a:Doc,b:Doc)=>!diffDiagramFoldCP(a,b).length&&!diffDiagramFoldCP(b,a).length;
const endpoint=(point:Point,line:{a:Point;b:Point},eps:number):Point|null=>distance(point,line.a)<=eps?line.b:distance(point,line.b)<=eps?line.a:null;

/** Recover only the narrow alternate-spoke press-and-return pattern: a newly
 * added F arm replaces the sole minority MV spoke at a folded four-ray vertex.
 * Both arms must reach real paper boundaries. This is a temporary animation
 * intent, not proof of a continuous path, and never changes the CP or ledger.
 * Explicit actions and later motion/collision certification remain authoritative. */
export function inferDiagramPrecreaseActions(before:Doc,after:Doc):Segment[]{
  try{
    validateDoc(before);validateDoc(after);
    if(before.paper.width!==after.paper.width||before.paper.height!==after.paper.height||
      before.segments.length+after.segments.length>4000||hasMaterialTopology(before)||hasMaterialTopology(after))return [];
    if([...before.segments,...after.segments].some(segment=>segment.assignment==='U'||mv(segment)&&segment.angle!==(segment.assignment==='M'?-180:180)))return [];
    if(!before.segments.some(mv)||!sameCoverage(subset(before,mv),subset(after,mv))||
      !sameCoverage(subset(before,segment=>segment.assignment==='B'),subset(after,segment=>segment.assignment==='B')))return [];
    const eps=Math.max(epsilonFor(before),epsilonFor(after)),graph=buildDiagramFold(before).graph;
    if(!graph.faces_vertices?.length||graph.faces_holes?.some(holes=>holes.length)||computeFlatGeometry(graph,eps).geometry.status!=='ready')return [];
    // Existing material marks and construction lines are not evidence that a
    // new fold was performed. Compare finite coverage, never IDs or subdivisions.
    const covered:Doc={...before,segments:before.segments.map(segment=>({...segment,assignment:'F',angle:0}))};
    const additions=diffDiagramFoldCP(covered,subset(after,segment=>segment.assignment==='F'&&segment.angle===0));
    const supports=coalescePartialCreaseRoutes(additions,eps);
    if(!supports.length||supports.length>16)return [];
    const boundaries=before.segments.filter(segment=>segment.assignment==='B');
    const onBoundary=(point:Point)=>boundaries.some(segment=>pointOnSegment(point,segment,eps));
    const folded=before.segments.filter(mv),candidates:Array<{hub:Point;line:Segment}>=[];
    const usedIds=new Set([...before.segments,...after.segments].map(segment=>segment.id));
    for(const support of supports){
      const aBoundary=onBoundary(support.a),bBoundary=onBoundary(support.b);
      if(aBoundary===bBoundary||distance(support.a,support.b)<=eps)continue;
      const boundary=aBoundary?support.a:support.b,hub=aBoundary?support.b:support.a;
      const rays:Array<{direction:Point;assignment:'M'|'V'}>=[];let ambiguous=false;
      for(const segment of folded){
        if(!pointOnSegment(hub,segment,eps))continue;
        for(const point of [segment.a,segment.b]){
          const length=distance(hub,point);if(length<=eps)continue;
          const direction:Point=[(point[0]-hub[0])/length,(point[1]-hub[1])/length];
          const ray=rays.find(other=>Math.abs(other.direction[0]*direction[1]-other.direction[1]*direction[0])<=eps/length&&other.direction[0]*direction[0]+other.direction[1]*direction[1]>0);
          const assignment=segment.assignment as 'M'|'V';
          if(ray){if(ray.assignment!==assignment)ambiguous=true;}
          else rays.push({direction,assignment});
        }
      }
      const mountains=rays.filter(ray=>ray.assignment==='M').length;
      if(ambiguous||rays.length!==4||mountains!==1&&mountains!==3)continue;
      const minority=mountains===1?'M':'V',angle=minority==='M'?-180:180;
      const arms=coalescePartialCreaseRoutes(folded.filter(segment=>segment.assignment===minority),eps);
      const old=arms.filter(arm=>{const tip=endpoint(hub,arm,eps);return tip!==null&&onBoundary(tip);});
      if(old.length!==1)continue;
      // Geometry can have an endpoint at a mark crossing, so require the whole
      // old arm and whole new arm, rather than recolouring one atomic piece.
      const oldFlat:Segment={id:'inferred-replaced-arm',a:[...old[0].a],b:[...old[0].b],assignment:'F',angle:0};
      let id=`animation-inferred-precrease-${candidates.length}`;while(usedIds.has(id))id+='-next';usedIds.add(id);
      const action:Segment={id,a:[...boundary],b:[...hub],assignment:minority,angle};
      const intermediate=applyDiagramFoldSegments(after,[oldFlat,action]),peak=buildDiagramFold(intermediate).graph;
      if(computeFlatGeometry(peak,eps).geometry.status!=='ready')continue;
      candidates.push({hub,line:action});
    }
    // More than one usable new arm at the same material vertex does not encode
    // an unambiguous action. Never select a branch by segment or face order.
    return candidates.filter(candidate=>candidates.filter(other=>distance(candidate.hub,other.hub)<=eps).length===1).map(candidate=>candidate.line);
  }catch{return [];}
}
