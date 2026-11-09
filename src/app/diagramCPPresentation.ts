import {BoundsIndex,type Bounds2} from '../core/boundsIndex';
import {buildDiagramFold,epsilonFor,polygonArea,distance} from '../core/geometry';
import type {Doc,Segment} from '../core/types';
import type {DiagramCPState,DiagramPose} from './diagramProject';
import type {DiagramFoldLinkSettings} from './diagramFoldLinkTypes';
import {validateDiagramSpatialPose} from './diagramSpatialPose';
import {buildDiagramPoseFold} from './diagramFoldGeometry';

export interface DiagramCPPresentationContext {
  before:DiagramCPState;
  pose?:DiagramPose|null;
  phase:'before'|'after';
  precreases?:DiagramFoldLinkSettings['precreases'];
}
export interface CreaseSegmentPresentation {title:string;emphasis:boolean}
export interface DiagramCPSegmentPresentation extends CreaseSegmentPresentation {origin:'previous'|'new'|'modified'|'mixed';actualAngle?:number}
const names:Record<Segment['assignment'],string>={M:'峰折（山折）',V:'谷折',F:'已有折痕',B:'边界',A:'辅助线',U:'未定折痕'};
const box=(s:Pick<Segment,'a'|'b'>):Bounds2=>[Math.min(s.a[0],s.b[0]),Math.min(s.a[1],s.b[1]),Math.max(s.a[0],s.b[0]),Math.max(s.a[1],s.b[1])];
const fmt=(a:number)=>`${Number(Math.abs(a).toFixed(3))}°`;
const status=(a:number)=>Math.abs(a)<1e-5?'未折':Math.abs(a)<180-1e-5?'部分折叠':'完全折叠';
const angleText=(a:number|null|undefined)=>a===null||a===undefined?'未知':fmt(a);
type Piece={lo:number;hi:number;segment:Segment};
function indexed(segments:readonly Segment[]){return {segments,index:new BoundsIndex(segments.map(box))};}
function pieces(s:Segment,source:ReturnType<typeof indexed>,eps:number):Piece[]{
  const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],length=Math.hypot(dx,dy),den=length*length;
  if(!length)return [];
  return source.index.query(box(s),eps).flatMap(i=>{
    const other=source.segments[i],cross=(p:readonly number[])=>Math.abs((p[0]-s.a[0])*dy-(p[1]-s.a[1])*dx)/length;
    if(cross(other.a)>eps||cross(other.b)>eps)return [];
    const ts=[other.a,other.b].map(p=>((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/den).sort((a,b)=>a-b),lo=Math.max(0,ts[0]),hi=Math.min(1,ts[1]);
    return (hi-lo)*length>eps?[{lo,hi,segment:other}]:[];
  });
}
function coverage(p:Piece[]):number {
  let end=0,total=0;for(const r of [...p].sort((a,b)=>a.lo-b.lo)){total+=Math.max(0,r.hi-Math.max(end,r.lo));end=Math.max(end,r.hi);}return total;
}
const sameValue=(values:(number|null)[]):number|null|'mixed'|undefined=>values.length?values.every(a=>a===values[0]||typeof a==='number'&&typeof values[0]==='number'&&Math.abs(a-values[0])<1e-5)?values[0]:'mixed':undefined;
const poseEvidence=new WeakMap<DiagramPose,Segment[]>();
function actualEvidence(pose:DiagramPose):Segment[]{
  const cached=poseEvidence.get(pose);if(cached)return cached;
  // Failed or deliberately unsupported evidence is stable for this immutable
  // pose too; hovering another view must not retry the full validation.
  poseEvidence.set(pose,[]);
  try{
    const graph=buildDiagramPoseFold(pose).graph,eps=epsilonFor(pose.sourceDoc),faces=graph.faces_vertices??[];
    let measured:(number|null)[];
    if(pose.spatial){validateDiagramSpatialPose(pose,true);measured=pose.spatial.measuredAngles;}
    else{
      if(pose.paperDeformation||pose.result.geometry.status!=='ready'||JSON.stringify(faces)!==JSON.stringify(pose.result.geometry.faces))return [];
      const shown=pose.result.geometry.vertices;
      if(shown.length!==graph.vertices_coords.length)return [];
      // Verify geometry, not graph fold-angle metadata: a legacy 45° target
      // may have been flattened to 180° by the old flat-only solver.
      for(const face of faces)for(const v of face)for(const anchor of face.slice(0,3))if(Math.abs(distance(shown[v],shown[anchor])-distance(graph.vertices_coords[v],graph.vertices_coords[anchor]))>eps*20)return [];
      const signs=faces.map(face=>Math.sign(polygonArea(face.map(v=>shown[v]))));if(signs.some(n=>!n))return [];
      const owners=new Map<string,number[]>(),key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
      faces.forEach((face,f)=>face.forEach((a,i)=>{const k=key(a,face[(i+1)%face.length]);owners.set(k,[...(owners.get(k)??[]),f]);}));
      measured=graph.edges_vertices.map(([a,b],e)=>{
        const fs=owners.get(key(a,b)),assignment=graph.edges_assignment[e],target=graph.edges_foldAngle[e];
        if(!fs||fs.length!==2||target===null||!Number.isFinite(target)||assignment==='U')return null;
        const actual=signs[fs[0]]===signs[fs[1]]?0:assignment==='M'?-180:180;
        return Math.abs(actual-target)<1e-5?actual:null;
      });
    }
    const segments=graph.edges_vertices.flatMap(([a,b],e)=>typeof measured[e]==='number'&&['M','V','F'].includes(graph.edges_assignment[e])?[{id:`measured:${e}`,a:graph.vertices_coords[a],b:graph.vertices_coords[b],assignment:graph.edges_assignment[e] as Segment['assignment'],angle:measured[e]}]:[]);
    poseEvidence.set(pose,segments);return segments;
  }catch{return [];}
}
function matchingPose(context:DiagramCPPresentationContext):DiagramPose|null {
  const pose=context.pose,before=context.before;
  if(!pose||pose.sourceStateId!==before.id||pose.sourceRevision!==before.revision||pose.sourceDoc.segments.length!==before.doc.segments.length)return null;
  if(JSON.stringify(pose.sourceDoc.paper)!==JSON.stringify(before.doc.paper)||JSON.stringify(pose.sourceDoc.metadata)!==JSON.stringify(before.doc.metadata))return null;
  const old=pose.sourceDoc.segments;
  if(!old.every((s,i)=>{const t=before.doc.segments[i];return s.assignment===t.assignment&&s.angle===t.angle&&s.a[0]===t.a[0]&&s.a[1]===t.a[1]&&s.b[0]===t.b[0]&&s.b[1]===t.b[1];}))return null;
  return pose;
}

/** All comparisons use material intervals, never screen overlap or split IDs.
 * Display records contain no edits and cannot change assignments/target angles. */
export function createDiagramCPPresentation(doc:Doc,context?:DiagramCPPresentationContext){
  const eps=Math.max(epsilonFor(doc),context?epsilonFor(context.before.doc):0),prior=indexed(context?.before.doc.segments??[]);
  const pose=context?matchingPose(context):null,actual=indexed(pose?actualEvidence(pose):[]),press=indexed(context?.precreases??[]);
  const describe=(s:Segment):DiagramCPSegmentPresentation=>{
    const old=pieces(s,prior,eps),length=Math.max(distance(s.a,s.b),eps),tolerance=eps/length*2;
    const oldCoverage=coverage(old),identical=coverage(old.filter(p=>p.segment.assignment===s.assignment&&p.segment.angle===s.angle));
    const origin:DiagramCPSegmentPresentation['origin']=!context||context.phase==='before'?'previous':oldCoverage<=tolerance?'new':identical>=1-tolerance?'previous':oldCoverage>=1-tolerance?'modified':'mixed';
    const sourceText=!context?'来源未标记':origin==='new'?'本步新增':origin==='modified'?'本步修改':origin==='mixed'?'含本步新增／修改':'此前已有';
    const parts=[names[s.assignment],sourceText],isCrease=['M','V','F','U'].includes(s.assignment);
    let actualAngle:number|undefined,hasPress=false;
    if(isCrease){
      const measured=pieces(s,actual,eps),value=sameValue(measured.map(p=>p.segment.angle));
      if(coverage(measured)>=1-tolerance&&typeof value==='number')actualAngle=value;
      if(actualAngle!==undefined)parts.push(`当前已折 ${fmt(actualAngle)}（${status(actualAngle)}）`);
      else if(context&&old.length){const previous=sameValue(old.map(p=>p.segment.angle));parts.push(`此前目标 ${previous==='mixed'?'混合':angleText(previous)} · 实际角未确认`);}
      else if(context)parts.push('新折痕 · 当前未执行');
      if(context?.phase==='after')parts.push(`本步目标 ${angleText(s.angle)}${s.angle===null?'':`（${status(s.angle)}）`}`);
      else if(!context)parts.push(`目标 ${angleText(s.angle)} · 实际角未确认`);
      const intents=pieces(s,press,eps),angles=[...new Set(intents.map(p=>p.segment.angle).filter((a):a is number=>typeof a==='number'&&Number.isFinite(a)))];
      hasPress=angles.length>0;
      if(angles.length)parts.push(`${context?.phase==='before'?'本步计划':'本步'}预折 ${angles.map(fmt).join('／')} → ${s.assignment==='F'?'展开':'恢复原折角'}`);
    }
    return {title:parts.join(' · '),emphasis:origin!=='previous'||context?.phase==='after'&&hasPress,origin,...(actualAngle===undefined?{}:{actualAngle})};
  };
  return {describe,segments:new Map(doc.segments.map(s=>[s.id,describe(s)]))};
}
