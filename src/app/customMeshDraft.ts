import type {TessParams,XY} from './tessellation';
import {readTessParams} from './tessellation';
import {readCustomMeshJson} from './customMeshJson';
export type CustomMeshParams=Extract<TessParams,{family:'custom'}>;
/** Edges are local drawing aids only. The existing custom schema remains vertices/faces. */
export type CustomMeshDraft={vertices:XY[];edges:[number,number][];faces:number[][]};
const clone=<T>(v:T):T=>structuredClone(v),key=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
const point=(p:unknown):p is XY=>Array.isArray(p)&&p.length===2&&p.every(x=>typeof x==='number'&&Number.isFinite(x));
function vertex(d:CustomMeshDraft,i:number){if(!Number.isInteger(i)||i<0||i>=d.vertices.length)throw Error('请选择现有点编号。');}
export function customMeshDraftFromParams(p:CustomMeshParams):CustomMeshDraft{const draft={vertices:clone(p.vertices),faces:clone(p.faces),edges:[]as[number,number][]},seen=new Set<string>();for(const f of p.faces)for(let i=0;i<f.length;i++){const a=f[i],b=f[(i+1)%f.length],k=key(a,b);if(!seen.has(k)){seen.add(k);draft.edges.push([a,b]);}}return draft;}
export function moveCustomDraftPoint(d:CustomMeshDraft,i:number,p:XY){vertex(d,i);if(!point(p))throw Error('点坐标须为两个有限数值；未默认或裁剪。');const next=clone(d);next.vertices[i]=[...p];return next;}
export function addCustomDraftPoint(d:CustomMeshDraft,p:XY){if(d.vertices.length>=96)throw Error('母网源最多96点。');if(!point(p))throw Error('新点须为两个有限数值。');const next=clone(d);next.vertices.push([...p]);return next;}
export function connectCustomDraftPoints(d:CustomMeshDraft,a:number,b:number){vertex(d,a);vertex(d,b);if(a===b)throw Error('两端须为不同点；不建立零索引边。');if(d.edges.some(e=>key(...e)===key(a,b)))throw Error('这条源索引连线已存在；没有合点。');const next=clone(d);next.edges.push([a,b]);return next;}
export function customDraftEdgeFaces(d:CustomMeshDraft,e:number){if(!Number.isInteger(e)||e<0||e>=d.edges.length)return [];const k=key(...d.edges[e]);return d.faces.flatMap((f,i)=>f.some((a,j)=>key(a,f[(j+1)%f.length])===k)?[i]:[]);}
export function removeCustomDraftEdge(d:CustomMeshDraft,e:number){if(!Number.isInteger(e)||e<0||e>=d.edges.length)throw Error('请选择现有草图边。');const fs=customDraftEdgeFaces(d,e);if(fs.length)throw Error(`该边属于面 ${fs.join('、')}；请先明确删面，不自动破坏面。`);const next=clone(d);next.edges.splice(e,1);return next;}
export function removeCustomDraftPoint(d:CustomMeshDraft,i:number){vertex(d,i);if(d.faces.some(f=>f.includes(i))||d.edges.some(e=>e.includes(i)))throw Error('该点仍被面或草图边引用；请先明确删除引用，不自动删边或合面。');const next=clone(d);next.vertices.splice(i,1);next.edges=next.edges.map(e=>e.map(v=>v>i?v-1:v) as[number,number]);next.faces=next.faces.map(f=>f.map(v=>v>i?v-1:v));return next;}
/** Explicit user action: this order becomes the face, and its outline edges are added. */
export function addOrderedCustomDraftFace(d:CustomMeshDraft,order:number[]){if(d.faces.length>=96)throw Error('母网源最多96面。');if(order.length<3||order.length>24||new Set(order).size!==order.length)throw Error('有序面须为3–24个不同点；不计算凸包或猜面。');order.forEach(i=>vertex(d,i));const next=clone(d);next.faces.push([...order]);for(let j=0;j<order.length;j++){const a=order[j],b=order[(j+1)%order.length];if(!next.edges.some(e=>key(...e)===key(a,b)))next.edges.push([a,b]);}return next;}
export function removeCustomDraftFace(d:CustomMeshDraft,f:number){if(!Number.isInteger(f)||f<0||f>=d.faces.length)throw Error('请选择现有面。');const next=clone(d);next.faces.splice(f,1);return next;}
/** Input-structure checks only. The unchanged backend still checks geometry and CP adoption. */
export function customDraftStructureProblem(d:CustomMeshDraft):string{
 if(d.vertices.length<3||d.vertices.length>96||d.vertices.some(p=>!point(p)||p.some(x=>Math.abs(x)>10)))return '应用源需3–96点，每点两个有限源坐标 −10…10；不会自动裁剪。';
 if(d.faces.length<1||d.faces.length>96||d.faces.some(f=>f.length<3||f.length>24||new Set(f).size!==f.length||f.some(i=>!Number.isInteger(i)||i<0||i>=d.vertices.length)))return '应用源需1–96个有序面，每面3–24个唯一有效点。';
 const used=new Set(d.faces.flat());if(used.size!==d.vertices.length)return '有未加入面的点；请显式建面或删除未引用点。';
 const owners=new Map<string,number[]>();d.faces.forEach((f,i)=>f.forEach((a,j)=>{const k=key(a,f[(j+1)%f.length]);owners.set(k,[...(owners.get(k)??[]),i]);}));if([...owners.values()].some(fs=>fs.length>2))return '三面共用同一源边；请显式调整面。';
 return '';
}
export function customMeshParamsFromDraft(p:CustomMeshParams,d:CustomMeshDraft):CustomMeshParams{const problem=customDraftStructureProblem(d);if(problem)throw Error(problem);const json=JSON.stringify({vertices:d.vertices,faces:d.faces}),next=readCustomMeshJson(p,json),valid=readTessParams(next);if(!valid||valid.family!=='custom')throw Error('现有母网参数解析拒绝；未采用。');return valid;}
export function customDraftTemporaryEdgeCount(d:CustomMeshDraft){return d.edges.filter((_,e)=>customDraftEdgeFaces(d,e).length===0).length;}
