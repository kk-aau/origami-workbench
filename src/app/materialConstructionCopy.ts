import type {Doc,Point,Segment} from '../core/types';
import {validateDoc} from '../core/types';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {copyMaterialMappedComponents} from '../core/materialCopy';
import {epsilonFor} from '../core/geometry';
import {transformPoint,type SelectionTransform} from './selectionTransform';
import {reflectPoint} from './mirror';
import {appendMaterialConstructionCopyGroup} from '../core/materialCurveModel';

export type MaterialConstructionCopyIntent={kind:'material-construction-copy';segmentIds:readonly string[];transform:SelectionTransform|{kind:'reflect';a:Point;b:Point};parametric?:boolean};
const keys=(v:object,allowed:string)=>Object.keys(v).sort().join(',')===allowed;
export function selectionContainsMaterial(doc:Doc,ids:readonly string[]):boolean{
 if(!hasMaterialTopology(doc))return false;const chosen=new Set(ids),material=inspectMaterialTopology(doc);if(!material.ok)throw new Error(material.reason);return material.edgeSegmentIds.some(id=>chosen.has(id));
}
function mapper(doc:Doc,request:MaterialConstructionCopyIntent){
 if(!request||request.kind!=='material-construction-copy'||!keys(request,'kind,segmentIds,transform')||!request.transform)throw new Error('材料构造复制意图无效。');
 const t=request.transform,eps=epsilonFor(doc);
 if(t.kind==='translate'&&!keys(t,'from,kind,to')||t.kind==='similarity'&&!keys(t,'a,b,c,d,kind')||t.kind==='reflect'&&!keys(t,'a,b,kind')||!['translate','similarity','reflect'].includes(t.kind))throw new Error('材料构造复制坐标格式无效。');
 const point=(p:Point):Point=>t.kind==='reflect'?reflectPoint(p,t.a,t.b,eps):transformPoint(p,t,eps);
 // Evaluate once before graph duplication to catch malformed/degenerate references.
 point(t.kind==='translate'?t.from:t.a);return {point,mirrored:t.kind==='reflect'};
}
export function constructMaterialCopy(doc:Doc,request:MaterialConstructionCopyIntent){
 if(Object.hasOwn(request??{},'parametric')&&typeof request.parametric!=='boolean')throw Error('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=request??{};
 if(request?.parametric){const r=appendMaterialConstructionCopyGroup(doc,recipe as MaterialConstructionCopyIntent);return {...r.copy!,doc:r.doc,descendants:r.descendants};}return buildMaterialConstructionCopy(doc,recipe as MaterialConstructionCopyIntent);
}
export function buildMaterialConstructionCopy(doc:Doc,request:MaterialConstructionCopyIntent){
 validateDoc(doc);const map=mapper(doc,request);return copyMaterialMappedComponents(doc,request.segmentIds,[()=>map]);
}
/** A pure segment preview does not create/trim/weld graph identities. */
export function previewMaterialConstructionCopy(doc:Doc,request:MaterialConstructionCopyIntent):Segment[]{
 if(Object.hasOwn(request??{},'parametric')&&typeof request.parametric!=='boolean')throw Error('保存参数设置必须为布尔值。');const {parametric:_,...recipe}=request??{};validateDoc(doc);const map=mapper(doc,recipe as MaterialConstructionCopyIntent),ids=new Set(request.segmentIds),source=doc.segments.filter(s=>ids.has(s.id));if(!source.length||source.length!==ids.size)throw new Error('请选择有效的材料部件线段。');
 return source.map(s=>({...s,a:map.point(s.a),b:map.point(s.b)}));
}
