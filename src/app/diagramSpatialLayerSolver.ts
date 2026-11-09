import {polygonArea} from '../core/geometry';
import {recomputeFlatLayers} from '../core/flatFold';
import type {FlatFoldResult,FlatLayerAdjustment,FlatLayerPreference,FoldGraph,Point} from '../core/types';
import type {DiagramSpatialPose} from './diagramSpatialPose';
import {modelOverlapRegions} from './modelOverlapRegions';
import {modelSurfacePrecision} from './modelSurfacePrecision';

type Orders=NonNullable<FlatFoldResult['layers']['faceOrders']>;
export interface SpatialLayerRequest {relativeConstraints?:FlatLayerPreference[];layerAdjustment?:FlatLayerAdjustment}
const key=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':');

/** Solve actual touching planes in their own orthonormal frame. A camera's
 * flattened projection is not a flat-fold model: tilted faces and depth gaps
 * must never be handed to the planar solver as if they were touching. */
export function solveSpatialLayerContacts(source:FoldGraph,spatial:DiagramSpatialPose,current:Orders,request?:SpatialLayerRequest,shown?:FlatFoldResult):{contacts:Orders;constraints:Orders;message:string}{
  const count=source.faces_vertices!.length;
  const validRows=(rows:Orders)=>{if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==3||r[0]===r[1]||r.slice(0,2).some(f=>!Number.isSafeInteger(f)||f<0||f>=count)||Math.abs(r[2])!==1))throw Error('保存的立体纸层关系无效。');};
  const saved=spatial.layerContacts??[],required=spatial.layerConstraints??[];validRows(saved);validRows(required);validRows(current);
  let magnitude=1;for(const p of spatial.vertices)for(const value of p)magnitude=Math.max(magnitude,Math.abs(value));const eps=magnitude*Number.EPSILON*2048;
  const local=(f:number,p:readonly number[])=>{const t=spatial.faceTransforms[f],r=t.rotation,d=p.map((v,k)=>v-t.translation[k]);return [0,1,2].map(i=>r[i]*d[0]+r[i+3]*d[1]+r[i+6]*d[2]);};
  const groups:number[][]=[],owner:number[]=[];
  for(let f=0;f<count;f++){
    let group=groups.findIndex(g=>{const a=spatial.faceTransforms[g[0]].rotation,b=spatial.faceTransforms[f].rotation;return Math.abs(Math.abs(a[2]*b[2]+a[5]*b[5]+a[8]*b[8])-1)<1e-10&&source.faces_vertices![f].every(v=>Math.abs(local(g[0],spatial.vertices[v])[2])<=eps);});
    if(group<0){group=groups.length;groups.push([]);}groups[group].push(f);owner[f]=group;
  }
  const screenNormal=(f:number)=>shown?Math.sign(polygonArea(shown.geometry.faces[f].map(v=>shown.geometry.vertices[v]))):0;
  let constraints=required;
  if(request?.relativeConstraints){
    constraints=request.relativeConstraints.map(({above,below})=>{
      if(!Number.isSafeInteger(above)||!Number.isSafeInteger(below)||above<0||below<0||above>=count||below>=count||above===below)throw Error('请选择两个不同的有效纸面。');
      const normal=screenNormal(below);if(!normal)throw Error('所选纸面当前侧立成线，请转动视角后指定上下关系。');
      return [above,below,normal];
    });
  }
  for(const [a,b] of [...saved,...constraints])if(owner[a]!==owner[b])throw Error(`纸面 F${a+1} 与 F${b+1} 存在真实空间夹角或间距，不能只交换层序；请调整折角。`);
  const target=request?.layerAdjustment;
  if(target&&(!Number.isSafeInteger(target.face)||target.face<0||target.face>=count))throw Error('请选择有效纸面。');
  const selected=new Set([...saved,...constraints].map(([a])=>owner[a]));if(target)selected.add(owner[target.face]);
  const contacts=new Map(current.map(row=>[key(row[0],row[1]),row]));let message='指定的立体纸层关系已通过求解。';
  for(const gi of selected){
    const ids=groups[gi],faceIndex=new Map(ids.map((f,i)=>[f,i])),root=ids[0];
    const edgeIds=[...new Set(ids.flatMap(f=>[...(source.faces_edges?.[f]??[]),...(source.faces_holeEdges?.[f]??[]).flat()]))];
    if(!edgeIds.length)throw Error('纸面缺少完整材料边界，无法调整层序。');
    const vertexIds=[...new Set(edgeIds.flatMap(e=>source.edges_vertices[e]))],vi=new Map(vertexIds.map((v,i)=>[v,i])),ei=new Map(edgeIds.map((e,i)=>[e,i]));
    const points=vertexIds.map(v=>local(root,spatial.vertices[v]).slice(0,2) as Point),faces=ids.map(f=>source.faces_vertices![f].map(v=>vi.get(v)!));
    const banks=edgeIds.map(e=>(source.edges_faces?.[e]??[]).filter(f=>faceIndex.has(f)).map(f=>faceIndex.get(f)!));
    const graph:FoldGraph={vertices_coords:points,faces_vertices:faces,edges_vertices:edgeIds.map(e=>source.edges_vertices[e].map(v=>vi.get(v)!) as [number,number]),edges_faces:banks,
      edges_assignment:edgeIds.map((e,i)=>banks[i].length<2?'B':Math.abs(spatial.measuredAngles[e]??0)<1e-7?'F':source.edges_assignment[e]),
      edges_foldAngle:edgeIds.map((e,i)=>banks[i].length<2?0:spatial.measuredAngles[e]),
      faces_edges:ids.map(f=>source.faces_edges![f].map(e=>ei.get(e)!)),
      faces_holes:ids.map(f=>(source.faces_holes?.[f]??[]).map(r=>r.map(v=>vi.get(v)!))),
      faces_holeEdges:ids.map(f=>(source.faces_holeEdges?.[f]??[]).map(r=>r.map(e=>ei.get(e)!))),
      ...(source.zhezhi_flatCreases?{zhezhi_flatCreases:source.zhezhi_flatCreases}:{})};
    const normal=(f:number)=>Math.sign(polygonArea(faces[faceIndex.get(f)!].map(v=>points[v])));
    const regionInput:FlatFoldResult={geometry:{status:'ready',message:'',vertices:points,faces,graph},layers:{status:'unknown',message:''},warnings:[]};
    const precision=modelSurfacePrecision(points);let epsilon=precision.defaultEpsilon,regions=modelOverlapRegions(regionInput,epsilon);
    while(regions.omittedThinRegions){const next=Math.max(precision.minimumEpsilon,epsilon/8);if(next>=epsilon)throw Error('共面接触区域低于坐标精度，未省略纸层。');epsilon=next;regions=modelOverlapRegions(regionInput,epsilon);}
    const pairs=new Set<string>();for(const cell of regions.cells)for(const a of cell.faces)for(const b of cell.faces)if(a!==b)pairs.add(key(ids[a],ids[b]));
    const rows=(orders:Orders)=>orders.filter(([a,b])=>owner[a]===gi&&owner[b]===gi&&pairs.has(key(a,b)));
    for(const [a,b] of constraints)if(owner[a]===gi&&!pairs.has(key(a,b)))throw Error(`纸面 F${a+1} 与 F${b+1} 没有面积重叠，请选择实际重叠的纸面。`);
    const preferences=(orders:Orders)=>rows(orders).map(([a,b,s])=>s*normal(b)>0?{above:faceIndex.get(a)!,below:faceIndex.get(b)!}:{above:faceIndex.get(b)!,below:faceIndex.get(a)!});
    // On file load every saved relation is a requirement to solve anew, never
    // a certificate. During an edit it is merely the old candidate/preference.
    const want=request?preferences(constraints):preferences([...saved,...constraints]);
    const old=rows(current),result:FlatFoldResult={geometry:{status:'ready',message:'',vertices:points,faces,graph},layers:{status:'solved',message:'',faceOrders:old.map(([a,b,s])=>[faceIndex.get(a)!,faceIndex.get(b)!,s])},warnings:[]};
    let adjustment:FlatLayerAdjustment|undefined;
    if(target&&owner[target.face]===gi){const sign=screenNormal(target.face)*normal(target.face);if(!sign)throw Error('所选纸面当前侧立成线，请转动视角后调整层序。');adjustment={...target,face:faceIndex.get(target.face)!,side:sign>0?target.side:target.side==='front'?'back':'front'};}
    let initial=result;
    if(adjustment){
      initial=recomputeFlatLayers(result,{relativeConstraints:[...want,...preferences(old)]});
      if(initial.layers.status!=='solved')throw Error(initial.layers.message);
      delete initial.layers.solutionIndex;delete initial.layers.solutionCount;delete initial.layers.solutionCountExact;
      initial.layers.relativeConstraints=want;
    }
    const solved=recomputeFlatLayers(initial,{relativeConstraints:want,...(adjustment?{layerAdjustment:adjustment}:{layerPreferences:preferences(old)})});
    if(solved.layers.status!=='solved')throw Error(solved.layers.message);
    if(adjustment)message=solved.layers.message;
    for(const [a,b] of old)contacts.delete(key(a,b));
    for(const [a,b,s] of solved.layers.faceOrders??[])contacts.set(key(ids[a],ids[b]),[ids[a],ids[b],s]);
  }
  return {contacts:[...contacts.values()],constraints:structuredClone(constraints),message};
}
