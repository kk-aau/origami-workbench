import {wovenGraphComponents,wovenGraphFaceCycles,type WovenGraph} from './wovenGraph';
import {materialPointInside} from '../core/materialTraceGeometry';

/** Derive ring ownership from the user's source indices, never backend flags. */
export function wovenMotherRegions(graph:WovenGraph){
 const cycles=wovenGraphFaceCycles(graph);if(!cycles)throw Error('母图半边面未形成完整简单闭环。');
 const components=wovenGraphComponents(graph),owner=graph.vertices.map(()=>-1);components.forEach((c,i)=>c.forEach(v=>owner[v]=i));
 const componentFaces=components.map((_,c)=>cycles.inner.flatMap((r,f)=>owner[r[0]]===c?[f]:[])),componentOuter=components.map((_,c)=>cycles.outer.find(r=>owner[r[0]]===c));
 if(componentOuter.some(r=>!r)||componentFaces.some(fs=>!fs.length))throw Error('每个源部件必须有完整外圈和有界原面。');
 const bindings=graph.ringHoles??[],voidIds:number[]=[],holesByFace=cycles.inner.map(()=>[] as number[][]),parent=components.map((_,c)=>c);
 const inside=(p:number,ring:number[])=>materialPointInside(graph.vertices[p],ring.map(v=>graph.vertices[v]));
 if(new Set(bindings.map(b=>b.component)).size!==bindings.length)throw Error('一个轮廓不能同时绑定多个环孔母面。');
 for(const {face,component} of bindings){
  if(!cycles.inner[face]||!components[component])throw Error('环孔原面或源部件编号越界。');const p=owner[cycles.inner[face][0]],vs=components[component];
  if(p===component||componentFaces[component].length!==1||graph.edges.filter(([a])=>owner[a]===component).length!==vs.length)throw Error('环孔轮廓须是另一个简单独立闭环，内部不能有未使用的源边。');
  if(!vs.every(v=>inside(v,cycles.inner[face])))throw Error('环孔轮廓必须严格位于绑定原面内部。');
  voidIds.push(componentFaces[component][0]);holesByFace[face].push([...componentOuter[component]!]);parent[component]=p;
 }
 const oldHoles=graph.holeFaces??[],removed=new Set([...oldHoles,...voidIds]);
 if(oldHoles.some(f=>!cycles.inner[f])||removed.size!==oldHoles.length+voidIds.length||bindings.some(b=>removed.has(b.face)))throw Error('环孔不能绑定已移除的面或另一孔洞内部。');
 const voidComponents=new Set(bindings.map(b=>b.component)),border=new Set(componentOuter.flatMap((r,c)=>voidComponents.has(c)?[]:r!));
 if(oldHoles.some(f=>cycles.inner[f].some(v=>border.has(v)))||oldHoles.some((f,i)=>oldHoles.slice(i+1).some(g=>cycles.inner[g].some(v=>cycles.inner[f].includes(v)))))throw Error('内部单元孔洞不能接触纸边或其它孔洞。');
 for(const rings of holesByFace)for(let i=0;i<rings.length;i++)for(const other of rings.slice(i+1))if(inside(rings[i][0],other)||inside(other[0],rings[i]))throw Error('同一母面的环孔不能相互包含或重叠。');
 if(!graph.nestedSheets)for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++)if((inside(componentOuter[i]![0],componentOuter[j]!)||inside(componentOuter[j]![0],componentOuter[i]!))&&parent[i]!==parent[j])throw Error('未声明的嵌套轮廓不能自动当作纸片或孔洞。');
 const retained=cycles.inner.flatMap((_,f)=>removed.has(f)?[]:[f]),faces=retained.map(f=>cycles.inner[f]),holes=retained.map(f=>holesByFace[f]),physicalComponents:number[][]=[],physicalFaceIds:number[][]=[];
 for(let c=0;c<components.length;c++){if(parent[c]!==c)continue;const vertices=components.flatMap((vs,j)=>parent[j]===c?vs:[]).sort((a,b)=>a-b),fs=retained.flatMap((old,f)=>owner[cycles.inner[old][0]]===c?[f]:[]);if(!fs.length)throw Error('孔洞不能移除整个母图纸片。');physicalComponents.push(vertices);physicalFaceIds.push(fs);}
 return {cycles,faces,holes,retained,holeIds:[...oldHoles,...voidIds],voidIds,physicalComponents,physicalFaceIds};
}
