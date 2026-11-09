import {DISCRETE_MIN_POINTS,DISCRETE_MAX_POINTS,readDiscreteCurveCPParams,type DiscreteCurveCPParams} from './discreteCurveCP';
import type {XY} from './tessellation';

export type DiscreteSourceHandle='foldPoints'|'leftRulings'|'rightRulings';
/** Source handles show f+r, with the original coefficient 1 and original amplitude. */
export function discreteSourceHandlePoint(params:DiscreteCurveCPParams,key:DiscreteSourceHandle,index:number):XY{
 const f=params.source.foldPoints[index];
 return key==='foldPoints'?[f[0],f[1]]:[f[0]+params.source[key][index][0],f[1]+params.source[key][index][1]];
}
export function moveDiscreteSourceHandle(params:DiscreteCurveCPParams,key:DiscreteSourceHandle,index:number,point:XY):DiscreteCurveCPParams{
 if(!Number.isInteger(index)||index<0||index>=params.source.foldPoints.length||point.some(v=>!Number.isFinite(v)))throw Error('请选择有限的原源点或母线端点。');
 const next=structuredClone(params),f=next.source.foldPoints[index];
 next.source[key][index]=key==='foldPoints'?[...point]:[point[0]-f[0],point[1]-f[1]];
 return next;
}
const edgeKeys=(ids:number[])=>[...ids.slice(1).map((id,i)=>`curve:${ids[i]}:${id}`),...ids.slice(1,-1).map(id=>`left:${id}`),...ids.slice(1,-1).map(id=>`right:${id}`)];
/** Preserve assignments only when the same source edge survives. Split/merged/new edges are U. */
function changedAssignments(params:DiscreteCurveCPParams,ids:number[]):DiscreteCurveCPParams['assignments']{
 const old=edgeKeys(params.source.foldPoints.map((_,i)=>i)),saved=new Map(old.map((key,i)=>[key,params.assignments[i]]));
 return edgeKeys(ids).map(key=>saved.get(key)??'U');
}
export function insertDiscreteSourcePoint(params:DiscreteCurveCPParams,after:number):DiscreteCurveCPParams{
 const n=params.source.foldPoints.length;if(n>=DISCRETE_MAX_POINTS)throw Error('原离散纸带最多 16 点。');
 if(!Number.isInteger(after)||after<0||after>=n)throw Error('请选择插入位置。');
 const next=structuredClone(params),f=params.source.foldPoints,insert=after+1;
 const point=insert<n?f[after].map((v,k)=>(v+f[insert][k])/2):f[after].map((v,k)=>v+(v-f[after-1][k]));
 next.source.foldPoints.splice(insert,0,point);
 for(const side of ['leftRulings','rightRulings'] as const)next.source[side].splice(insert,0,[...params.source[side][after]]);
 const ids=Array.from({length:n},(_,i)=>i);ids.splice(insert,0,-1);next.assignments=changedAssignments(params,ids);
 return next;
}
export function deleteDiscreteSourcePoint(params:DiscreteCurveCPParams,index:number):DiscreteCurveCPParams{
 const n=params.source.foldPoints.length;if(n<=DISCRETE_MIN_POINTS)throw Error('原离散纸带至少 3 点。');
 if(!Number.isInteger(index)||index<0||index>=n)throw Error('请选择删除位置。');
 const next=structuredClone(params);for(const key of ['foldPoints','leftRulings','rightRulings'] as const)next.source[key].splice(index,1);
 next.assignments=changedAssignments(params,Array.from({length:n},(_,i)=>i).filter(i=>i!==index));return next;
}
export function discreteSourceDraftError(params:DiscreteCurveCPParams):string{
 if(readDiscreteCurveCPParams(params))return '';
 const n=params.source.foldPoints.length;
 if(n<DISCRETE_MIN_POINTS||n>DISCRETE_MAX_POINTS||!['foldPoints','leftRulings','rightRulings'].every(k=>params.source[k as DiscreteSourceHandle].length===n))return '点列与左右母线须对应，点数为 3–16。';
 for(const key of ['foldPoints','leftRulings','rightRulings'] as const)for(const [i,p] of params.source[key].entries()){
  if(p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1000))return `点 ${i+1} 的源坐标或向量分量须为 ±1000 内的有限数值。`;
  if(key!=='foldPoints'&&(Math.hypot(...p)<1e-6||Math.hypot(...p)>1000))return `点 ${i+1} 的${key==='leftRulings'?'左':'右'}原母线模长须为 0.000001–1000；不会自动归一化。`;
 }
 return '原母线系数或内部边赋型不符合当前输入合同。';
}
