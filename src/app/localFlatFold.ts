import {defaultAngle,validateDoc,type Doc,type Point,type Assignment,type Segment} from '../core/types';
import {distance,epsilonFor,pointOnSegment} from '../core/geometry';
import {angleRayCutoff} from './angleSystem';

export interface LocalFlatCandidate {origin:Point;direction:Point;degrees:number;assignment:Assignment;angle:number|null}
const normalize=(a:number)=>(a%360+360)%360;
/** Local angular completion only: neither M/V feasibility nor global flat-foldability proof. */
export function localFlatAnalysis(doc:Doc,origin:Point,preset:Assignment):{degree:number;candidates:LocalFlatCandidate[];sourceIds:string[]}{
  validateDoc(doc);const eps=epsilonFor(doc);
  if(!Array.isArray(origin)||origin.length!==2||origin.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('请选择有效的已有顶点。');
  const rays:{degrees:number;source:Segment}[]=[];
  for(const source of doc.segments){
    if(source.assignment==='A'||source.assignment==='F'||!pointOnSegment(origin,source,eps))continue;
    for(const end of [source.a,source.b]){
      if(distance(origin,end)<=eps)continue;
      const degrees=normalize(Math.atan2(end[1]-origin[1],end[0]-origin[0])*180/Math.PI);
      if(rays.some(r=>Math.min(normalize(r.degrees-degrees),normalize(degrees-r.degrees))<1e-6))throw new Error('顶点附近存在同方向重叠线，请先整理重复或冲突线段。');
      rays.push({degrees,source});
    }
  }
  rays.sort((a,b)=>a.degrees-b.degrees);
  const degree=rays.length;
  const sourceIds=[...new Set(rays.map(r=>r.source.id))];
  if(!degree||degree%2===0)return{degree,candidates:[],sourceIds};
  const gaps=rays.map((r,i)=>degree===1?360:normalize(rays[(i+1)%degree].degrees-r.degrees));
  const candidates:LocalFlatCandidate[]=[];
  for(let i=0;i<degree;i++){
    let alternate=0;for(let k=0;k<degree;k++)alternate+=(k%2?-1:1)*gaps[(i+k)%degree];
    const offset=alternate/2;
    if(offset<=1e-6||offset>=gaps[i]-1e-6)continue;
    const degrees=normalize(rays[i].degrees+offset),rad=degrees*Math.PI/180;
    const assignment=degree===1?rays[0].source.assignment:preset;
    candidates.push({origin:[...origin],direction:[Math.cos(rad),Math.sin(rad)],degrees,assignment,angle:degree===1?rays[0].source.angle:defaultAngle(preset)});
  }
  return{degree,candidates,sourceIds};
}
export function localFlatCandidates(doc:Doc,origin:Point,preset:Assignment):ReturnType<typeof localFlatAnalysis>{
  const result=localFlatAnalysis(doc,origin,preset);
  if(!result.degree)throw new Error('该点没有相接的折线；辅助线和平面边不参与补线。');
  if(result.degree%2===0)throw new Error('单条补线需要奇数度顶点；当前相邻折线数量为偶数。');
  if(!result.candidates.length)throw new Error('该顶点没有满足局部交替角和条件的非退化单条补线。');
  return result;
}
export function localFlatCutoff(candidate:LocalFlatCandidate,target:Segment,eps=1e-6):Omit<Segment,'id'>{
  return{a:[...candidate.origin],b:angleRayCutoff(candidate.origin,candidate.direction,target,eps),assignment:candidate.assignment,angle:candidate.angle};
}
