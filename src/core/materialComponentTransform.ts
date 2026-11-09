import type {Doc} from './types';
import {validateDoc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {materialTransformMap,reconcileMaterialEdit,type MaterialTransformIntent} from '../app/materialEdit';
import {appendMaterialTransformGroup} from './materialCurveModel';
import {bindMaterialAnchor,resolveMaterialAnchor,type MaterialAnchorBinding,type MaterialAnchorStage} from './materialRecipeAnchors';
import type {MaterialFaceEditResult} from './materialFaceCommon';
export type MaterialComponentTransformIntent={kind:'material-transform';components:readonly number[];operation:{kind:MaterialTransformIntent['kind'];a:number;b?:number};parametric?:boolean};
const material=(doc:Doc)=>{validateDoc(doc);const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);return m;};
export function transformMaterialComponents(doc:Doc,intent:MaterialComponentTransformIntent):MaterialFaceEditResult{
 if(Object.hasOwn(intent??{},'parametric')&&typeof intent.parametric!=='boolean')throw Error('保存参数设置必须为布尔值。');
 const {parametric:_,...recipe}=intent??{};return intent?.parametric?appendMaterialTransformGroup(doc,intent):buildMaterialComponentTransform(doc,recipe as MaterialComponentTransformIntent);
}
export function buildMaterialComponentTransform(doc:Doc,intent:MaterialComponentTransformIntent):MaterialFaceEditResult{
 const m=material(doc),op=intent?.operation;
 if(!intent||Object.keys(intent).sort().join(',')!=='components,kind,operation'||intent.kind!=='material-transform'||!Array.isArray(intent.components)||!intent.components.length||intent.components.length>m.components.length||new Set(intent.components).size!==intent.components.length||Array.from(intent.components).some(i=>!Number.isInteger(i)||i<0||i>=m.components.length)||!op||Object.keys(op).sort().join(',')!==(Object.hasOwn(op,'b')?'a,b,kind':'a,kind')||!['move','rotate','scale','mirrorX','mirrorY'].includes(op.kind)||!Number.isFinite(op.a)||Object.hasOwn(op,'b')&&(op.kind!=='move'||!Number.isFinite(op.b))||op.kind==='move'&&(Math.abs(op.a)>1e6||Math.abs(op.b??0)>1e6)||op.kind==='rotate'&&Math.abs(op.a)>36000||op.kind==='scale'&&(op.a<1e-6||op.a>1000)||['mirrorX','mirrorY'].includes(op.kind)&&op.a!==0)throw Error('材料变换需要完整部件及有限的移动、旋转、正等比缩放或镜像参数。');
 const ids=intent.components.flatMap(c=>m.components[c].edges.map(e=>m.edgeSegmentIds[e])),raw:MaterialTransformIntent={...op,segmentIds:ids},{point,center}=materialTransformMap(doc,raw),chosen=new Set(ids),proposal={...structuredClone(doc),segments:doc.segments.map(s=>chosen.has(s.id)?{...s,a:point(s.a),b:point(s.b)}:structuredClone(s))},next=reconcileMaterialEdit(doc,proposal,raw);
 return {doc:next,descendants:new Map(doc.segments.map(s=>[s.id,[s.id]])),facesBefore:m.graph.faces_vertices!.length,facesAfter:m.graph.faces_vertices!.length,faceParents:m.graph.faces_vertices!.map((_,f)=>f),referenceEdges:[...ids],addedVertices:0,removedEdges:0,synchronizedBanks:0,insertedIds:[],placement:m.foldedVertices?'preserved':'unavailable',transform:{operation:op.kind,components:intent.components.length,movedEdges:ids.length,center}};
}
export function bindMaterialSelection(doc:Doc,components:readonly number[],stages:MaterialAnchorStage[]):MaterialAnchorBinding[]{
 const m=material(doc);
 return components.map(c=>{const ids=m.components[c].edges.map(e=>m.edgeSegmentIds[e]),latest=[...stages].reverse().flatMap(s=>s.result?.referenceEdges??[]),id=latest.find(id=>ids.includes(id))??ids[0];return bindMaterialAnchor({edgeId:id,fraction:.5},stages);});
}
export function resolveMaterialSelection(doc:Doc,bindings:MaterialAnchorBinding[],stages:MaterialAnchorStage[]):number[]{
 if(!Array.isArray(bindings)||!bindings.length||bindings.length>16384)throw Error('保存的材料部件选择无效。');const m=material(doc),components=bindings.map(ref=>{const anchor=resolveMaterialAnchor(ref,stages),e=m.edgeSegmentIds.indexOf(anchor.edgeId),c=m.components.findIndex(c=>c.edges.includes(e));if(c<0)throw Error('材料变换的来源部件已不存在。');return c;});return [...new Set(components)].sort((a,b)=>a-b);
}
