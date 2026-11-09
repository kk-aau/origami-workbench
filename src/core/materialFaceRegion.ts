/** A face is identified by the selected material side of an indexed source
 * edge. No saved face number or nearby coordinate chooses another piece. */
import type {Doc} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {materialFaceRings,materialFaceEdgeRings} from './materialRings';
import {bindMaterialAnchor,resolveMaterialAnchor,type MaterialAnchorBinding,type MaterialAnchorStage} from './materialRecipeAnchors';
import type {MaterialFaceAnchor} from './materialFaceCommon';
export type MaterialFaceRegion={anchor:MaterialAnchorBinding;side:'left'|'right';owner?:number};
const material=(doc:Doc)=>{const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);return m;};
type Material=ReturnType<typeof material>;
const sides=(m:Material,face:number,edge:number)=>{const found=new Set<'left'|'right'>(),[a]=m.graph.edges_vertices[edge];materialFaceRings(m.graph,face).forEach((ring,h)=>materialFaceEdgeRings(m.graph,face)[h].forEach((e,k)=>{if(e===edge)found.add(ring[k]===a?'left':'right');}));return [...found];};
function lineage(region:MaterialFaceRegion,stages:MaterialAnchorStage[]){
 const index=stages.findIndex(s=>s.id===region.anchor.source);if(index<0)throw Error('插面依赖的原材料来源已删除。');const source=material(stages[index].doc),sourceAnchor=resolveMaterialAnchor(region.anchor,stages.slice(0,index+1)),edge=source.edgeSegmentIds.indexOf(sourceAnchor.edgeId);if(edge<0)throw Error('插面来源边已不存在。');
 let origins=source.graph.faces_vertices!.map((_,f)=>[f]);for(const stage of stages.slice(index+1)){const rows=stage.result?.faceSources??stage.result?.faceParents?.map(f=>[f]);if(!rows||rows.some(row=>!row.length&&!stage.result?.paste||row.some(f=>!Number.isInteger(f)||!origins[f])))throw Error('插面缺少完整原面关系，未推断其它纸片。');origins=rows.map(row=>[...new Set(row.flatMap(f=>origins[f]))]);}
 return {source,edge,origins};
}
function attachOwner(region:MaterialFaceRegion,face:number,stages:MaterialAnchorStage[]){
 const {source,edge,origins}=lineage(region,stages),owners=source.graph.edges_faces![edge],matches=[...new Set(owners)].filter(f=>origins[face]?.includes(f));if(matches.length!==1)throw Error('插面没有唯一来源面身份。');region.owner=owners.indexOf(matches[0]);const orientation=sides(source,matches[0],edge);if(!orientation.length)throw Error('插面来源边与原面关联无效。');region.side=orientation.includes(region.side)?region.side:orientation[0];return region;
}
export function bindMaterialFaceRegion(doc:Doc,face:number,stages:MaterialAnchorStage[]):MaterialFaceRegion{
 const m=material(doc);if(!Number.isInteger(face)||face<0||face>=m.graph.faces_vertices!.length)throw Error('插面参考面无效。');
 const candidates:({rank:number}&MaterialFaceRegion)[]=[];
 materialFaceRings(m.graph,face).forEach((ring,h)=>materialFaceEdgeRings(m.graph,face)[h].forEach((e,k)=>{const anchor=bindMaterialAnchor({edgeId:m.edgeSegmentIds[e],fraction:.5},stages),[a,b]=m.graph.edges_vertices[e],v=ring[k],w=ring[(k+1)%ring.length];if(v!==a&&v!==b||w!==a&&w!==b)throw Error('插面参考侧关联无效。');candidates.push({anchor,side:v===a?'left':'right',rank:stages.findIndex(s=>s.id===anchor.source)});}));
 candidates.sort((a,b)=>b.rank-a.rank);for(const {anchor,side} of candidates){try{return attachOwner({anchor,side},face,stages);}catch{/* A merged weak edge can have multiple source owners. Try another actual face edge. */}}throw Error('插面没有可唯一引用的来源面身份。');
}
export function resolveMaterialFaceRegion(doc:Doc,region:MaterialFaceRegion,stages:MaterialAnchorStage[],refresh=false,endpoints?:MaterialFaceAnchor[]):number{
 const owned=region&&Object.hasOwn(region,'owner');if(!region||Object.keys(region).sort().join(',')!==(owned?'anchor,owner,side':'anchor,side')||!['left','right'].includes(region.side)||owned&&(!Number.isInteger(region.owner)||region.owner!<0))throw Error('保存插面的来源侧无效。');
 const m=material(doc),anchor=resolveMaterialAnchor(region.anchor,stages),e=m.edgeSegmentIds.indexOf(anchor.edgeId),[a]=m.graph.edges_vertices[e],matches=new Set<number>();
 if(owned){
  const {source,edge,origins}=lineage(region,stages),owners=source.graph.edges_faces![edge],owner=owners[region.owner!];if(owner===undefined||owners.indexOf(owner)!==region.owner)throw Error('保存插面的来源面身份无效。');const orientation=sides(source,owner,edge);if(!orientation.length)throw Error('来源边没有对应原面。');if(refresh)region.side=orientation.includes(region.side)?region.side:orientation[0];else if(!orientation.includes(region.side))throw Error('保存来源面的方向侧不一致。');
  for(const face of m.graph.edges_faces![e])if(origins[face]?.includes(owner))matches.add(face);
 }else{
 m.graph.faces_vertices!.forEach((_,f)=>materialFaceRings(m.graph,f).forEach((ring,h)=>materialFaceEdgeRings(m.graph,f)[h].forEach((edge,k)=>{if(edge===e&&(ring[k]===a?'left':'right')===region.side)matches.add(f);})));if(matches.size!==1)throw Error('插面来源侧没有唯一当前材料面，未按旧面编号改其它面。');
 }
 if(endpoints){
  if(endpoints.length!==2)throw Error('插面端点来源数量无效。');const incident=endpoints.map(p=>{const e=m.edgeSegmentIds.indexOf(p.edgeId);if(e<0)throw Error('插面端点边已不存在。');return new Set(m.graph.edges_faces![e]);}),witnesses=new Set([...incident[0]].filter(f=>incident[1].has(f)));
  // Canonical face winding can reverse the order of children created by an
  // earlier reflected chord. Both retained boundary identities must agree on
  // its physical child before refreshing the creator-relative owner.
  if(owned&&refresh&&witnesses.size===1&&!matches.has([...witnesses][0])&&m.graph.edges_faces![e].includes([...witnesses][0])){const face=[...witnesses][0];attachOwner(region,face,stages);matches.clear();matches.add(face);}
  for(const face of [...matches])if(!witnesses.has(face))matches.delete(face);
 }
 if(matches.size!==1)throw Error('插面来源面没有唯一当前后代，未改其它材料面。');const face=[...matches][0];if(!owned&&refresh)attachOwner(region,face,stages);return face;
}
