import {materialOuterContour} from '../core/materialWeak';
import type {Doc,FoldGraph,Point,Segment} from '../core/types';
import {validateDoc} from '../core/types';
import {createMaterialTopology,hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {refoldMaterialGeometry} from '../core/materialRefold';
import {resolveStartingFace} from './flatFoldSettings';

/** A declared editor operation, independently replayed against the proposed CP.
 * It expresses world placement; it never bypasses material/FF validation. */
export type MaterialTransformIntent={
  kind:'move'|'rotate'|'mirrorX'|'mirrorY'|'scale';
  segmentIds:readonly string[];
  a:number;
  b?:number;
};

const samePoint=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
const sameEndpoints=(a:Segment,b:Segment)=>samePoint(a.a,b.a)&&samePoint(a.b,b.b);
function fail(reason:string):never{throw new Error(reason);}
function material(doc:Doc){const result=inspectMaterialTopology(doc);if(!result.ok)fail(result.reason);return result;}

/** Preserve indexed material identity while reconciling an ordinary editor Doc.
 * General shape edits retain old per-component anchors through refold. Explicit
 * whole-component transforms move CP and FF together in world coordinates.
 * Layer results are deliberately not reused: the caller's Doc revision changes. */
export function reconcileMaterialEdit(previous:Doc,next:Doc,intent?:MaterialTransformIntent):Doc{
  validateDoc(next);
  if(!hasMaterialTopology(previous)){
    if(hasMaterialTopology(next))fail('添加材料工程请使用明确的打开或采用操作，不能作为普通折痕编辑。');
    return next;
  }
  validateDoc(previous);
  const old=material(previous);
  if(!hasMaterialTopology(next))fail('材料编辑不能删除独立材料合同或退回坐标焊接。');
  if(JSON.stringify(previous.metadata!.materialTopology)!==JSON.stringify(next.metadata!.materialTopology))
    fail('材料编辑不能替换未经验证的来源合同；请从当前材料边身份修改折痕。');
  const previousById=new Map(previous.segments.map(s=>[s.id,s])),nextById=new Map(next.segments.map(s=>[s.id,s]));
  const bound=new Set(old.edgeSegmentIds);
  for(const s of next.segments)if(s.assignment!=='A'&&!bound.has(s.id))
    fail('当前操作新增了非辅助折痕，需要明确的材料面细分；不会按坐标焊接。');
  for(const id of old.edgeSegmentIds){
    const before=previousById.get(id)!,after=nextById.get(id);
    if(!after)fail('当前操作删除了材料边，需要明确的材料拓扑操作。');
    if(after.assignment==='A')fail('材料边不能直接改为辅助线。');
    if((before.assignment==='B')!==(after.assignment==='B'))fail('切口边界与折痕之间的转换需要明确切割或粘合，不能直接赋型。');
  }

  const transform=intent?replayTransform(previous,next,intent):undefined;
  const graph=structuredClone(old.graph),coordinates:(Point|undefined)[]=old.graph.vertices_coords.map(()=>undefined);
  old.edgeSegmentIds.forEach((id,e)=>{
    const before=previousById.get(id)!,after=nextById.get(id)!,[a,b]=graph.edges_vertices[e];
    const forward=samePoint(before.a,old.graph.vertices_coords[a]);
    // Only an endpoint-only reversal may change segment notation without a
    // declared transform. Otherwise old a/b identity must remain authoritative.
    const reverseNotation=!intent&&samePoint(after.a,before.b)&&samePoint(after.b,before.a);
    const p=reverseNotation?after.b:after.a,q=reverseNotation?after.a:after.b;
    for(const [v,value] of [[forward?a:b,p],[forward?b:a,q]] as [number,Point][]){
      if(coordinates[v]&&!samePoint(coordinates[v]!,value))fail('同一个材料顶点的端点被分到不同位置；不能通过线段移动撕裂或焊接材料。');
      coordinates[v]=[...value];
    }
    graph.edges_assignment[e]=after.assignment;graph.edges_foldAngle[e]=after.angle;
  });
  graph.vertices_coords=coordinates.map(p=>{if(!p)fail('材料顶点缺少当前绑定端点。');return p;});
  const moved=graph.vertices_coords.some((p,v)=>!samePoint(p,old.graph.vertices_coords[v]));
  const hingeChanged=graph.edges_assignment.some((kind,e)=>(kind==='F')!==(old.graph.edges_assignment[e]==='F'));
  const typesChanged=graph.edges_assignment.some((kind,e)=>kind!==old.graph.edges_assignment[e])||
    graph.edges_foldAngle.some((angle,e)=>angle!==old.graph.edges_foldAngle[e]);
  if(!moved&&!typesChanged){material(next);return next;}

  // Negative determinant changes CP winding. Retain face IDs and explicit edge
  // occurrences; endpoint equality is insufficient to recover parallel banks.
  if(moved)reorientFaces(graph);
  let result:Doc=structuredClone(next);
  if(moved&&result.flatFold){
    const root=resolveStartingFace(previous,old.graph);
    if(root.stale)fail('原起始面已失效，请先明确选择材料起始面。');
    let face=root.face;
    if(JSON.stringify(next.flatFold)!==JSON.stringify(previous.flatFold)){
      const requested=resolveStartingFace(next,old.graph);
      if(requested.stale)fail('坐标编辑同时修改起始面时，必须保留可识别的原材料面身份。');
      face=requested.face;
    }
    result.flatFold={startingFace:materialOuterContour(graph,face).map(v=>[...graph.vertices_coords[v]]),...(result.flatFold?.materialFace===undefined?{}:{materialFace:face})};
  }
  const options=old.startingFace===undefined?{}:{startingFace:old.startingFace};
  result.metadata={...result.metadata,materialTopology:createMaterialTopology(result,graph,old.edgeSegmentIds,options)};

  let folded:Point[]|undefined;
  if(!moved&&!hingeChanged)folded=old.foldedVertices?structuredClone(old.foldedVertices):undefined;
  else if(transform&&!hingeChanged){
    // A partial-component edit has no single world placement for the component.
    const partial=old.components.some(c=>{
      const count=c.edges.filter(e=>transform.ids.has(old.edgeSegmentIds[e])).length;
      return count>0&&count<c.edges.length;
    });
    if(!partial){
      const selectedVertices=new Set(old.components.filter(c=>transform.ids.has(old.edgeSegmentIds[c.edges[0]])).flatMap(c=>c.vertices));
      folded=old.foldedVertices?.map((p,v)=>selectedVertices.has(v)?transform.point(p):[...p]);
    }
    else folded=refoldMaterialGeometry(previous,result);
  }else folded=refoldMaterialGeometry(previous,result);
  result.metadata.materialTopology=createMaterialTopology(result,graph,old.edgeSegmentIds,{...options,...(folded?{foldedVertices:folded}:{})});
  validateDoc(result);material(result);
  return result;
}

export function materialTransformMap(previous:Doc,intent:MaterialTransformIntent){
  if(!intent||!['move','rotate','mirrorX','mirrorY','scale'].includes(intent.kind)||
    !Array.isArray(intent.segmentIds)||!intent.segmentIds.length||new Set(intent.segmentIds).size!==intent.segmentIds.length||
    intent.segmentIds.some(id=>typeof id!=='string'||!id)||!Number.isFinite(intent.a)||
    intent.b!==undefined&&!Number.isFinite(intent.b)||intent.kind==='scale'&&intent.a<=0)
    fail('材料变换参数无效：只支持有限移动、旋转、镜像及正等比缩放。');
  const ids=new Set(intent.segmentIds),chosen=previous.segments.filter(s=>ids.has(s.id));
  if(chosen.length!==ids.size)fail('材料变换选择含有不存在的线段。');
  const points=chosen.flatMap(s=>[s.a,s.b]),cx=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,
    cy=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;
  const point=(p:Point):Point=>{
    const x=p[0]-cx,y=p[1]-cy,t=intent.a*Math.PI/180;
    if(intent.kind==='move')return [p[0]+intent.a,p[1]+(intent.b??0)];
    if(intent.kind==='rotate')return [cx+x*Math.cos(t)-y*Math.sin(t),cy+x*Math.sin(t)+y*Math.cos(t)];
    if(intent.kind==='mirrorX')return [cx-x,p[1]];
    if(intent.kind==='mirrorY')return [p[0],cy-y];
    return [cx+x*intent.a,cy+y*intent.a];
  };
  return {ids,point,center:[cx,cy] as Point};
}

function replayTransform(previous:Doc,next:Doc,intent:MaterialTransformIntent){
  const {ids,point}=materialTransformMap(previous,intent);
  const afterById=new Map(next.segments.map(s=>[s.id,s]));
  for(const s of previous.segments){
    const after=afterById.get(s.id);
    // Auxiliary additions/removals are independent annotations. Any retained
    // endpoint is nevertheless checked against the declared operation.
    if(!after){if(s.assignment!=='A')fail('材料变换不能删除材料边。');continue;}
    const expected=ids.has(s.id)?{...s,a:point(s.a),b:point(s.b)}:s;
    if(!sameEndpoints(expected,after))fail('新折痕与声明的材料变换不一致；不会把局部形变当作整片变换。');
  }
  return {ids,point};
}

function reorientFaces(graph:FoldGraph):void{
  graph.faces_vertices!.forEach((face,f)=>{
    const origin=graph.vertices_coords[face[0]];
    const twice=face.reduce((sum,v,k)=>{
      const p=graph.vertices_coords[v],q=graph.vertices_coords[face[(k+1)%face.length]];
      return sum+(p[0]-origin[0])*(q[1]-origin[1])-(p[1]-origin[1])*(q[0]-origin[0]);
    },0);
    if(twice<0){graph.faces_vertices![f]=[face[0],...face.slice(1).reverse()];graph.faces_edges![f]=[...graph.faces_edges![f]].reverse();if(graph.faces_holes){graph.faces_holes[f]=graph.faces_holes[f].map(r=>[r[0],...r.slice(1).reverse()]);graph.faces_holeEdges![f]=graph.faces_holeEdges![f].map(r=>[...r].reverse());}}
  });
  graph.faces_faces=graph.faces_edges!.map((row,f)=>row.map(e=>graph.edges_faces![e].length===2?graph.edges_faces![e][0]===f?graph.edges_faces![e][1]:graph.edges_faces![e][0]:null)) as unknown as number[][];
  if(graph.faces_holeEdges)graph.faces_holeFaces=graph.faces_holeEdges.map((rs,f)=>rs.map(r=>r.map(e=>graph.edges_faces![e].length===2?graph.edges_faces![e][0]===f?graph.edges_faces![e][1]:graph.edges_faces![e][0]:null)));
}
