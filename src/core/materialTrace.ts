/** Clip one explicitly chosen straight segment against indexed material faces,
 * build every subdivision in one graph, and only then re-fold/commit. */
import type {Doc,Point,Segment} from './types';
import {materialFaceFail as fail,materialMix as mix,materialRoot,materialCanonical,finishMaterialFaces,type CheckedMaterial,type MaterialFaceAnchor,type MaterialFaceEditResult} from './materialFaceCommon';
import {materialOrientation,materialPointInside} from './materialTraceGeometry';
import {materialFaceRings,materialFaceEdgeRings,materialFaceInside} from './materialRings';
import {splitMaterialHoledFace,type MaterialRingPart} from './materialHoleSplit';
import {hasWeakMaterialFaceRings} from './materialWeak';
import {appendMaterialTraceGroup} from './materialCurveModel';

export type MaterialFaceTraceIntent={kind:'material-face-trace';component:number|'all';from:MaterialFaceAnchor;to:MaterialFaceAnchor;assignment:'M'|'V'|'F'|'U';fixedSide:'left'|'right';cpOnly?:boolean;parametric?:boolean};
export type MaterialFaceRayIntent={kind:'material-face-ray';component:number|'all';from:MaterialFaceAnchor;through:Point;assignment:'M'|'V'|'F'|'U';fixedSide:'left'|'right';cpOnly:boolean;parametric?:boolean};
export const MATERIAL_TRACE_LIMITS={pieces:1024,corners:65536} as const;
type Hit={edge:number;fraction:number;parameter:number;vertex?:number;point?:Point};
type Piece={face:number;from:Hit;to:Hit};
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const key=(v:object,keys:string)=>Object.keys(v).sort().join(',')===keys;
const same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];

export function traceMaterialFaces(doc:Doc,old:CheckedMaterial,intent:MaterialFaceTraceIntent):MaterialFaceEditResult{
 if(Object.hasOwn(intent??{},'parametric')){if(typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');if(intent.parametric)return appendMaterialTraceGroup(doc,intent);const {parametric:_,...recipe}=intent;return traceMaterialFaces(doc,old,recipe);}
 const b=buildMaterialTrace(doc,old,intent);return finishMaterialFaces(doc,old,b.graph,b.ids,b.segments,b.sources,b.root,b.oldRoot,intent.cpOnly?undefined:b.ff,b.descendants,b.extra);
}
/** The direction point defines an unbounded forward ray, not a finite line.
 * Its private far point is only used for clipping and never becomes a crease. */
export function traceMaterialRay(doc:Doc,old:CheckedMaterial,intent:MaterialFaceRayIntent):MaterialFaceEditResult{
 if(Object.hasOwn(intent??{},'parametric')){if(typeof intent.parametric!=='boolean')fail('保存参数设置必须为布尔值。');if(intent.parametric)return appendMaterialTraceGroup(doc,intent);const {parametric:_,...recipe}=intent;return traceMaterialRay(doc,old,recipe);}
 if(!key(intent,'assignment,component,cpOnly,fixedSide,from,kind,through')||intent.kind!=='material-face-ray'||typeof intent.cpOnly!=='boolean'||!(intent.component==='all'||Number.isInteger(intent.component)&&intent.component>=0&&intent.component<old.components.length)||!['M','V','F','U'].includes(intent.assignment)||!['left','right'].includes(intent.fixedSide)||!intent.from||!key(intent.from,'edgeId,fraction')||typeof intent.from.edgeId!=='string'||!Number.isFinite(intent.from.fraction)||intent.from.fraction<0||intent.from.fraction>1||!Array.isArray(intent.through)||intent.through.length!==2||Array.from(intent.through).some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))fail('射线需要原边锚点、有限方向点、部件、线型和明确的仅CP设置。');
 const g=old.graph,selected=intent.component==='all'?old.components:[old.components[intent.component]],edges=new Set(selected.flatMap(c=>c.edges)),edge=old.edgeSegmentIds.indexOf(intent.from.edgeId);
 if(edge<0||!edges.has(edge))fail('射线起点边不属于指定材料部件。');
 const [a,b]=g.edges_vertices[edge],origin=intent.from.fraction===0?[...g.vertices_coords[a]] as Point:intent.from.fraction===1?[...g.vertices_coords[b]] as Point:mix(g.vertices_coords[a],g.vertices_coords[b],intent.from.fraction);
 const dx=intent.through[0]-origin[0],dy=intent.through[1]-origin[1],length=Math.hypot(dx,dy);if(!Number.isFinite(length)||length<=old.tolerance)fail('射线方向点与起点重合或低于可验证精度。');
 const direction:Point=[dx/length,dy/length],projection=(p:Point)=>(p[0]-origin[0])*direction[0]+(p[1]-origin[1])*direction[1],extent=Math.max(...selected.flatMap(c=>c.vertices).map(v=>projection(g.vertices_coords[v])));
 if(extent<=old.tolerance)fail('射线正向没有材料区间。');
 const reach=extent+old.tolerance*64,far:Point=[origin[0]+direction[0]*reach,origin[1]+direction[1]*reach];
 const built=buildLine(doc,old,intent,{edge,point:origin,fraction:intent.from.fraction},{edge:-1,point:far,fraction:1},false),inserted=new Set(built.extra.insertedIds),pieces=built.segments.filter(s=>inserted.has(s.id));
 if(pieces.some(s=>Math.min(projection(s.a),projection(s.b))< -old.tolerance))fail('射线划分出现反向区间，未修改工程。');
 const intervals=pieces.map(s=>[projection(s.a),projection(s.b)].sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0]),reachedLength=Math.max(...intervals.map(p=>p[1])),materialLength=pieces.reduce((n,s)=>n+Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),0);
 let coverage=0,end=0;for(const [a,b] of intervals)if(b>end){coverage+=b-Math.max(a,end);end=b;}const blankLength=Math.max(0,reachedLength-coverage);
 if(built.extra.trace)built.extra.trace={...built.extra.trace,length:materialLength,blankLength};
 const result=finishMaterialFaces(doc,old,built.graph,built.ids,built.segments,built.sources,built.root,built.oldRoot,intent.cpOnly?undefined:built.ff,built.descendants,built.extra);
 return {...result,ray:{origin,direction,reachedLength,materialLength,blankLength}};
}
/** A geometry-only subdivision plan. Internal exact points retain anchors
 * expressed on the original edge across a replayed batch of subdivisions. */
export function buildMaterialTrace(doc:Doc,old:CheckedMaterial,intent:MaterialFaceTraceIntent,exactPoints?:{from:Point;to:Point},onlyFace?:number){
 if(!(key(intent,'assignment,component,fixedSide,from,kind,to')||typeof intent.cpOnly==='boolean'&&key(intent,'assignment,component,cpOnly,fixedSide,from,kind,to'))||!(intent.component==='all'||Number.isInteger(intent.component)&&intent.component>=0&&intent.component<old.components.length)||!['M','V','F','U'].includes(intent.assignment)||!['left','right'].includes(intent.fixedSide)||[intent.from,intent.to].some(a=>!a||!key(a,'edgeId,fraction')||typeof a.edgeId!=='string'||!Number.isFinite(a.fraction)||a.fraction<0||a.fraction>1))fail('跨面构造的部件、端点、线型或固定侧无效。');
 const g=old.graph,faces=g.faces_vertices!,faceEdges=g.faces_edges!,ids=old.edgeSegmentIds,index=new Map(ids.map((id,e)=>[id,e])),selected=intent.component==='all'?old.components:[old.components[intent.component]],selectedFaces=new Set(selected.flatMap(c=>c.faces)),selectedEdges=new Set(selected.flatMap(c=>c.edges));
 const read=(anchor:MaterialFaceAnchor,exact?:Point)=>{const edge=index.get(anchor.edgeId);if(edge===undefined||!selectedEdges.has(edge))fail('端点边不属于选中的材料部件。');const [a,b]=g.edges_vertices[edge],interpolated=anchor.fraction===0?[...g.vertices_coords[a]] as Point:anchor.fraction===1?[...g.vertices_coords[b]] as Point:mix(g.vertices_coords[a],g.vertices_coords[b],anchor.fraction);if(exact&&(!Array.isArray(exact)||exact.length!==2||!exact.every(Number.isFinite)||Math.hypot(exact[0]-interpolated[0],exact[1]-interpolated[1])>old.tolerance*20))fail('原边锚点与当前细分边不一致。');return {edge,point:exact?[...exact] as Point:interpolated,fraction:anchor.fraction};};
 const from=read(intent.from,exactPoints?.from),to=read(intent.to,exactPoints?.to);
 return buildLine(doc,old,intent,from,to,!!exactPoints,onlyFace);
}
/** Finite constructed geometry is clipped without extending its endpoints.
 * A free endpoint in a face cannot form a complete material subdivision. */
export function buildMaterialSegment(doc:Doc,old:CheckedMaterial,intent:Pick<MaterialFaceTraceIntent,'component'|'assignment'|'fixedSide'>,p:Point,q:Point){
 if(!key(intent,'assignment,component,fixedSide')||!(intent.component==='all'||Number.isInteger(intent.component)&&intent.component>=0&&intent.component<old.components.length)||!['M','V','F','U'].includes(intent.assignment)||!['left','right'].includes(intent.fixedSide)||[p,q].some(v=>!Array.isArray(v)||v.length!==2||Array.from(v).some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))fail('有限构造线的部件、坐标、线型或固定侧无效。');
 const faces=intent.component==='all'?old.components.flatMap(c=>c.faces):old.components[intent.component].faces;
 if(faces.some(f=>[p,q].some(v=>materialFaceInside(old.graph,f,v))))fail('有限镜像线的端点落在材料面内部，不能形成完整面划分；未延长或吸附端点。');
 return buildLine(doc,old,intent,{edge:-1,point:p,fraction:0},{edge:-2,point:q,fraction:1},false);
}
function buildLine(doc:Doc,old:CheckedMaterial,intent:Pick<MaterialFaceTraceIntent,'component'|'assignment'|'fixedSide'|'cpOnly'>,from:{edge:number;point:Point;fraction:number},to:{edge:number;point:Point;fraction:number},exactPoints:boolean,onlyFace?:number){
 const g=old.graph,faces=g.faces_vertices!,faceEdges=g.faces_edges!,ids=old.edgeSegmentIds,selected=intent.component==='all'?old.components:[old.components[intent.component]],selectedFaces=new Set(selected.flatMap(c=>c.faces).filter(f=>onlyFace===undefined||f===onlyFace)),selectedEdges=new Set(selected.flatMap(c=>c.edges));
 const p=from.point,q=to.point,d:Point=[q[0]-p[0],q[1]-p[1]],length=Math.hypot(...d),axis=Math.abs(d[0])>=Math.abs(d[1])?0:1;
 if(!(length>old.tolerance&&Number.isFinite(length)))fail('跨面直线零长或低于可验证精度。');
 if(from.edge===to.edge)fail('直线沿已有材料边，存在重复或重叠折痕，请另选端点。');
 const parameter=(v:Point)=>(v[axis]-p[axis])/d[axis],hits=new Map<number,Hit>();
 const hit=(edge:number,u:number,t:number):Hit=>({edge,fraction:u,parameter:t,...(u===0?{vertex:g.edges_vertices[edge][0]}:u===1?{vertex:g.edges_vertices[edge][1]}:{}),...(exactPoints&&edge===from.edge&&t===0?{point:p}:exactPoints&&edge===to.edge&&t===1?{point:q}:{})});
 for(const edge of selectedEdges){
  const [a,b]=g.edges_vertices[edge].map(v=>g.vertices_coords[v]),sa=materialOrientation(p,q,a),sb=materialOrientation(p,q,b);
  if(sa===0&&sb===0){
   const ta=parameter(a),tb=parameter(b);if(Math.min(1,Math.max(ta,tb))>Math.max(0,Math.min(ta,tb)))fail(`直线与已有边 ${ids[edge]} 重复或重叠，未静默合并。`);
   if(ta>=0&&ta<=1)hits.set(edge,hit(edge,0,ta));else if(tb>=0&&tb<=1)hits.set(edge,hit(edge,1,tb));continue;
  }
  // Explicit endpoint anchors retain the user's edge fraction even if the
  // rounded interpolation differs by a last bit from the infinite edge line.
  if(edge===from.edge){hits.set(edge,hit(edge,from.fraction,0));continue;}
  if(edge===to.edge){hits.set(edge,hit(edge,to.fraction,1));continue;}
  if(sa===0){const t=parameter(a);if(t>=0&&t<=1)hits.set(edge,hit(edge,0,t));continue;}
  if(sb===0){const t=parameter(b);if(t>=0&&t<=1)hits.set(edge,hit(edge,1,t));continue;}
  if(sa===sb)continue;
  const edgeDirection:Point=[b[0]-a[0],b[1]-a[1]],offset:Point=[a[0]-p[0],a[1]-p[1]],den=cross(d,edgeDirection),bound=(Math.abs(d[0]*edgeDirection[1])+Math.abs(d[1]*edgeDirection[0]))*Number.EPSILON*8;
  if(Math.abs(den)<=bound)fail('直线交点数值病态，无法证明沿边比例；未移动或吸附端点。');
  const t=cross(offset,edgeDirection)/den,u=cross(offset,d)/den;
  if(!Number.isFinite(t)||!Number.isFinite(u))fail('交点参数不是有限值。');
  if(t>=0&&t<=1&&u>0&&u<1)hits.set(edge,hit(edge,u,t));
 }
 const pieces:Piece[]=[];let cornerWork=0;const weakFaces=faces.map((_,f)=>hasWeakMaterialFaceRings(g,f));
 for(const face of selectedFaces){
  const unique=new Map<string,Hit>();for(const edge of materialFaceEdgeRings(g,face).flat()){const h=hits.get(edge);if(h)unique.set(h.vertex===undefined?`e${edge}`:`v${h.vertex}`,h);}
  const polygon=faces[face].map(v=>g.vertices_coords[v]);
  const point=(h:Hit)=>h.vertex!==undefined?g.vertices_coords[h.vertex]:h.point??mix(...g.edges_vertices[h.edge].map(v=>g.vertices_coords[v]) as [Point,Point],h.fraction);
  const groups=new Map<string,Hit[]>();for(const h of unique.values()){const stamp=point(h).join(',');groups.set(stamp,[...(groups.get(stamp)??[]),h]);}
  const events=[...groups.values()].sort((a,b)=>a[0].parameter-b[0].parameter||a[0].edge-b[0].edge);
  const rings=materialFaceRings(g,face),edgeRings=materialFaceEdgeRings(g,face),turn=(a:Point,b:Point)=>{const angle=Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);return angle<=0?angle+2*Math.PI:angle;};
  const choose=(group:Hit[],toward:Point)=>{
   if(group.length===1)return group[0];
   const eligible=group.filter(h=>h.vertex!==undefined?rings.some(r=>r.some((v,k)=>{if(v!==h.vertex)return false;const o=g.vertices_coords[v],next=g.vertices_coords[r[(k+1)%r.length]],prior=g.vertices_coords[r[(k+r.length-1)%r.length]],start:Point=[next[0]-o[0],next[1]-o[1]],end:Point=[prior[0]-o[0],prior[1]-o[1]],ray:Point=[toward[0]-o[0],toward[1]-o[1]];return turn(start,ray)<turn(start,end);})):rings.some((r,hole)=>r.some((a,k)=>{if(edgeRings[hole][k]!==h.edge)return false;const x=g.vertices_coords[a],y=g.vertices_coords[r[(k+1)%r.length]];return cross([y[0]-x[0],y[1]-x[1]],[toward[0]-x[0],toward[1]-x[1]])>0;})));
   if(eligible.length!==1)fail('直线交点没有唯一实际切口侧或材料面角，未焊接身份。');
   for(const endpoint of [from,to])if(group.some(h=>h.edge===endpoint.edge&&h.parameter===(endpoint===from?0:1))){const picked=endpoint.fraction===0?g.edges_vertices[endpoint.edge][0]:endpoint.fraction===1?g.edges_vertices[endpoint.edge][1]:undefined;if(picked===undefined?eligible[0].edge!==endpoint.edge:eligible[0].vertex!==picked)fail('所选端点切口侧与直线出射方向不符，请明确选择另一侧。');}
   return eligible[0];
  };
  for(let i=1;i<events.length;i++){
   const left=events[i-1],right=events[i],lo=left[0].parameter,hi=right[0].parameter;if(!(hi>lo))continue;
   cornerWork+=polygon.length;if(cornerWork>MATERIAL_TRACE_LIMITS.corners)fail('面内区间检查超过有界预算。');
   if(!materialFaceInside(g,face,mix(p,q,(lo+hi)/2)))continue;
   const a=choose(left,point(right[0])),b=choose(right,point(left[0]));
   pieces.push({face,from:a,to:b});if(pieces.length>MATERIAL_TRACE_LIMITS.pieces)fail('跨面直线超过1024段构造容量。');
  }
 }
 if(!pieces.length)fail('选中材料内没有可构造的正长度区间。');
 const coords=g.vertices_coords.map(p=>[...p] as Point),ff=old.foldedVertices?.map(p=>[...p] as Point),splits=new Map<number,{vertex:number;fraction:number}>(),faceComponent:number[]=[];
 old.components.forEach((c,i)=>c.faces.forEach(f=>faceComponent[f]=i));
 const banks=new Map<string,number[]>(),bankKey=(edge:number)=>{const ends=g.edges_vertices[edge].map(v=>JSON.stringify(g.vertices_coords[v])).sort();return `${faceComponent[g.edges_faces![edge][0]]}:${ends.join(';')}`;};
 g.edges_vertices.forEach((_,edge)=>{if(g.edges_assignment[edge]==='B'){const k=bankKey(edge),group=banks.get(k);if(group)group.push(edge);else banks.set(k,[edge]);}});
 let synchronizedBanks=0;
 const register=(h:Hit):number=>{
  if(h.vertex!==undefined)return h.vertex;const cached=splits.get(h.edge);
  if(cached){const edgeLength=Math.hypot(...g.edges_vertices[h.edge].map(v=>g.vertices_coords[v]).reduce((a,b)=>[a[0]-b[0],a[1]-b[1]] as Point));if(Math.abs(cached.fraction-h.fraction)>Math.max(Number.EPSILON*64,old.tolerance/edgeLength))fail('同一边的交点参数不一致。');return cached.vertex;}
  const [a,b]=g.edges_vertices[h.edge],vertex=coords.length,point=h.point?[...h.point] as Point:mix(g.vertices_coords[a],g.vertices_coords[b],h.fraction);coords.push(point);if(ff)ff.push(mix(old.foldedVertices![a],old.foldedVertices![b],h.fraction));splits.set(h.edge,{vertex,fraction:h.fraction});
  if(g.edges_assignment[h.edge]==='B')for(const other of banks.get(bankKey(h.edge))??[]){
   if(other===h.edge||splits.has(other))continue;const [v,w]=g.edges_vertices[other],fraction=same(g.vertices_coords[a],g.vertices_coords[v])?h.fraction:1-h.fraction,newVertex=coords.length;
   coords.push([...point]);if(ff)ff.push(mix(old.foldedVertices![v],old.foldedVertices![w],fraction));splits.set(other,{vertex:newVertex,fraction});synchronizedBanks++;
  }
  return vertex;
 };
 // Preserve explicitly picked positions before registering a numerically
 // equivalent opposite bank encountered earlier in source face order.
 for(const endpoint of [from,to]){const relevant=pieces.some(piece=>[piece.from,piece.to].some(h=>h.edge===endpoint.edge&&h.vertex===undefined));if(relevant)register(hit(endpoint.edge,endpoint.fraction,endpoint===from?0:1));}
 const endpoints=pieces.map(piece=>[register(piece.from),register(piece.to)] as [number,number]),newEdges=g.edges_vertices.map(e=>[...e] as [number,number]),kinds=[...g.edges_assignment],angles=[...g.edges_foldAngle],newIDs=[...ids],sourceEdges=ids.map((_,e)=>e),usedIDs=new Set([...doc.segments.map(s=>s.id),...(doc.objects??[]).map(o=>o.id)]),descendants=new Map(doc.segments.map(s=>[s.id,[s.id]]));
 const unique=(base:string)=>{let id=base,n=1;while(usedIDs.has(id))id=`${base}-${n++}`;usedIDs.add(id);return id;},paths=new Map<number,{vertices:number[];edges:number[]}>();
 splits.forEach(({vertex},edge)=>{const [a,b]=g.edges_vertices[edge],ne=newEdges.length,id=unique(`${ids[edge]}::trace-part`);newEdges[edge]=[a,vertex];newEdges.push([vertex,b]);kinds.push(kinds[edge]);angles.push(angles[edge]);newIDs.push(id);sourceEdges.push(edge);paths.set(edge,{vertices:[a,vertex,b],edges:[edge,ne]});descendants.set(ids[edge],[ids[edge],id]);});
 const expandedRings=faces.map((_,f)=>materialFaceRings(g,f).map((face,h)=>{const vertices:number[]=[],edges:number[]=[];face.forEach((v,k)=>{const e=materialFaceEdgeRings(g,f)[h][k],path=paths.get(e);if(path){vertices.push(v,path.vertices[1]);edges.push(...(path.vertices[0]===v?path.edges:[...path.edges].reverse()));}else{vertices.push(v);edges.push(e);}});return {vertices,edges};})),allParts:MaterialRingPart[][]=expandedRings.map(rs=>[{...rs[0],holes:rs.slice(1)}]);
 const insertedIDs:string[]=[],holedCuts=faces.map(()=>[] as {a:number;b:number;e:number}[]);
 pieces.forEach((piece,i)=>{
  const [a,b]=endpoints[i],parts=allParts[piece.face];if(g.faces_holes?.[piece.face]?.length||weakFaces[piece.face]){if(a===b)fail('跨面区间退化。');const e=newEdges.length,id=unique('material-trace-crease');newEdges.push([a,b]);kinds.push(intent.assignment);angles.push(intent.assignment==='M'?-180:intent.assignment==='V'?180:intent.assignment==='F'?0:null);newIDs.push(id);insertedIDs.push(id);sourceEdges.push(-1);holedCuts[piece.face].push({a,b,e});return;}
  const at=parts.findIndex(part=>part.vertices.includes(a)&&part.vertices.includes(b));if(a===b||at<0)fail('跨面区间的材料角归属不一致。');
  const part=parts[at],start=part.vertices.indexOf(a),end=part.vertices.indexOf(b),branch=(from:number,to:number)=>{const vertices:number[]=[],edges:number[]=[];for(let k=from;k!==to;k=(k+1)%part.vertices.length){vertices.push(part.vertices[k]);edges.push(part.edges[k]);}vertices.push(part.vertices[to]);return {vertices,edges};},first=branch(start,end),second=branch(end,start);
  if(first.vertices.length<3||second.vertices.length<3)fail('直线沿已有面边或产生退化面。');
  const e=newEdges.length,id=unique('material-trace-crease');newEdges.push([a,b]);kinds.push(intent.assignment);angles.push(intent.assignment==='M'?-180:intent.assignment==='V'?180:intent.assignment==='F'?0:null);newIDs.push(id);insertedIDs.push(id);sourceEdges.push(-1);
  first.edges.push(e);second.edges.push(e);parts[at]=first;parts.push(second);
 });
 holedCuts.forEach((cuts,f)=>{if(cuts.length)allParts[f]=splitMaterialHoledFace(coords,expandedRings[f],cuts,weakFaces[f]||intent.cpOnly===true||intent.assignment==='F');});
 const newFaces=allParts.map(parts=>parts[0].vertices),newFaceEdges=allParts.map(parts=>parts[0].edges),holes=allParts.map(parts=>(parts[0].holes??[]).map(r=>r.vertices)),holeEdges=allParts.map(parts=>(parts[0].holes??[]).map(r=>r.edges)),sources=faces.map((_,f)=>[f]),children=allParts.map((_,f)=>[f]);
 allParts.forEach((parts,f)=>parts.slice(1).forEach(part=>{children[f].push(newFaces.length);newFaces.push(part.vertices);newFaceEdges.push(part.edges);holes.push((part.holes??[]).map(r=>r.vertices));holeEdges.push((part.holes??[]).map(r=>r.edges));sources.push([f]);}));
 const oldRoot=materialRoot(doc,old);let root=oldRoot;
 // The CP canvas displays increasing Y downward. Its visual left is a
 // negative numerical determinant; this changes only the chosen face ID.
 if(children[oldRoot].length>1){const wanted=intent.fixedSide==='left'?-1:1;const candidates=children[oldRoot].filter(f=>{let greatest=0;for(const v of newFaces[f]){const r:Point=[coords[v][0]-p[0],coords[v][1]-p[1]],signed=cross(d,r)/length;if(Math.abs(signed)>Math.abs(greatest))greatest=signed;}return Math.sign(greatest)===wanted;});if(!candidates.length)fail('所选固定面侧不存在。');root=candidates[0];}
 const byID=new Map(doc.segments.map(s=>[s.id,s])),updated=new Map<string,Segment>();
 newIDs.forEach((id,e)=>{const source=sourceEdges[e],[a,b]=newEdges[e];if(source<0){updated.set(id,{id,a:[...coords[a]],b:[...coords[b]],assignment:intent.assignment,angle:angles[e]});return;}const s=byID.get(ids[source])!,oldStart=g.vertices_coords[g.edges_vertices[source][0]],forward=same(s.a,oldStart);updated.set(id,{...s,id,a:[...coords[forward?a:b]],b:[...coords[forward?b:a]]});});
 const segments=[...doc.segments.map(s=>updated.get(s.id)??structuredClone(s)),...newIDs.slice(ids.length).map(id=>updated.get(id)!)];
 const ordered=pieces.map(piece=>[piece.from.parameter,piece.to.parameter]).sort((a,b)=>a[0]-b[0]);let coverage=0,end=-Infinity;for(const [a,b]of ordered){if(b>end){coverage+=b-Math.max(a,end);end=b;}}
 return {graph:materialCanonical(coords,newEdges,kinds,angles,newFaces,newFaceEdges,holes,holeEdges),ids:newIDs,segments,sources,root,oldRoot,ff,descendants,extra:{addedVertices:coords.length-g.vertices_coords.length,removedEdges:0,synchronizedBanks,insertedIds:insertedIDs,trace:{pieces:pieces.length,faces:new Set(pieces.map(p=>p.face)).size,length:pieces.reduce((sum,p)=>sum+(p.to.parameter-p.from.parameter)*length,0),blankLength:Math.max(0,1-coverage)*length,components:selected.length}}};
}
