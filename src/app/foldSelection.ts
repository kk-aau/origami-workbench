import {distance,epsilonFor,interpolate,pointOnSegment,polygonArea,segmentIntersection,splitIntersections} from '../core/geometry';
import {segmentPaperSize} from '../core/exchangeCoordinates';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {BoundsIndex,type Bounds2} from '../core/boundsIndex';
import {copyMaterialSelection} from './materialClipboard';
import {materialPointInside} from '../core/materialTraceGeometry';

interface BoundaryRing {edges:Segment[];ids:Set<string>;bounds:Bounds2;index:BoundsIndex;scale:number;maxEdgeLength:number}
export interface FoldSelection {doc:Doc;selectedCount:number;boundaryCount:number}
export interface FoldTarget {doc:Doc;key:string}
const ringCache=new WeakMap<Doc,BoundaryRing[]>();
const sourceKeyCache=new WeakMap<Doc,string>();
const segmentBounds=(s:Segment):Bounds2=>[Math.min(s.a[0],s.b[0]),Math.min(s.a[1],s.b[1]),Math.max(s.a[0],s.b[0]),Math.max(s.a[1],s.b[1])];

/** Only existing, simple closed B components define paper. Neither a selection
 * rectangle nor the document's width/height creates a new paper boundary. */
function boundaryRings(doc:Doc):BoundaryRing[]{
  const cached=ringCache.get(doc);if(cached)return cached;
  const planar=splitIntersections({...doc,segments:doc.segments.filter(s=>s.assignment==='B')}),eps=epsilonFor(doc);
  const incident=new Map<string,number[]>(),key=(p:Point)=>p.join(',');
  planar.segments.forEach((s,i)=>{for(const p of [s.a,s.b]){const k=key(p),edges=incident.get(k)??[];edges.push(i);incident.set(k,edges);}});
  const visited=new Set<number>(),rings:BoundaryRing[]=[];
  for(let seed=0;seed<planar.segments.length;seed++){
    if(visited.has(seed))continue;
    const component:number[]=[],queue=[seed];visited.add(seed);
    for(let q=0;q<queue.length;q++){
      const i=queue[q];component.push(i);
      for(const p of [planar.segments[i].a,planar.segments[i].b])for(const next of incident.get(key(p))??[])if(!visited.has(next)){visited.add(next);queue.push(next);}
    }
    if(component.some(i=>[planar.segments[i].a,planar.segments[i].b].some(p=>incident.get(key(p))!.length!==2)))continue;
    const edges:Segment[]=[],ids=new Set<string>(),first=planar.segments[seed];let current=first.a,index=seed;
    do{
      const s=planar.segments[index],next=key(s.a)===key(current)?s.b:s.a;
      edges.push({...s,a:current,b:next});planar.sourceIds[index].forEach(id=>ids.add(id));
      const neighbours=incident.get(key(next))!;index=neighbours[0]===index?neighbours[1]:neighbours[0];current=next;
    }while(index!==seed&&edges.length<=component.length);
    if(edges.length!==component.length||edges.length<3||Math.abs(polygonArea(edges.map(s=>s.a)))<=eps*eps)continue;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,maxEdgeLength=0;
    for(const s of edges){minX=Math.min(minX,s.a[0]);minY=Math.min(minY,s.a[1]);maxX=Math.max(maxX,s.a[0]);maxY=Math.max(maxY,s.a[1]);maxEdgeLength=Math.max(maxEdgeLength,distance(s.a,s.b));}
    rings.push({edges,ids,bounds:[minX,minY,maxX,maxY],index:new BoundsIndex(edges.map(segmentBounds)),scale:Math.max(1,Math.abs(minX),Math.abs(minY),Math.abs(maxX),Math.abs(maxY)),maxEdgeLength});
  }
  ringCache.set(doc,rings);return rings;
}

/** A cheap, conservative multiple-paper signal before building full topology.
 * Nested, intersecting, open or explicitly indexed material boundaries are not
 * inferred as separate CPs. Reuse the selection cache and only existing B ids. */
export function independentFoldBoundaryCount(doc:Doc):number{
  if(hasMaterialTopology(doc))return 0;
  const rings=boundaryRings(doc);if(!rings.length)return 0;
  const covered=new Set(rings.flatMap(ring=>[...ring.ids]));
  if(doc.segments.some(s=>s.assignment==='B'&&!covered.has(s.id)))return 0;
  if(rings.length===1)return 1;
  const index=new BoundsIndex(rings.map(ring=>ring.bounds)),eps=epsilonFor(doc);
  for(let i=0;i<rings.length;i++)if(index.query(rings[i].bounds,eps,i).length)return 0;
  return rings.length;
}

/** An existing boundary ID anchors a CP across internal edits and subdivision:
 * editable splitting retains its original first-piece ID. Never use crease
 * geometry or a face index as the result group's identity. */
function boundaryKey(ids:readonly string[],kind='boundary'):string{
 const anchor=ids.reduce<string|undefined>((first,id)=>first===undefined||id<first?id:first,undefined);
 return `${kind}:${JSON.stringify(anchor??'')}`;
}
export function validateFoldSourceCpKey(value:unknown):asserts value is string{
 if(typeof value!=='string'||!value.trim()||/[\u0000-\u001f]/.test(value))throw new Error('CP 来源标识无效。');
}
/** Legacy models have only a source document. Recover the same grouping key;
 * an old whole-document model spanning several CPs stays a separate group. */
export function foldSourceCpKey(doc:Doc):string{
 const cached=sourceKeyCache.get(doc);if(cached)return cached;
 validateDoc(doc);let keys:string[];
 if(hasMaterialTopology(doc)){
  const material=inspectMaterialTopology(doc);if(!material.ok)throw new Error(material.reason);
  keys=material.components.map(component=>{
   const boundary=component.edges.filter(e=>material.graph.edges_assignment[e]==='B');
   return boundaryKey((boundary.length?boundary:component.edges).map(e=>material.edgeSegmentIds[e]),'material');
  });
 }else{
  keys=boundaryRings(doc).map(ring=>boundaryKey([...ring.ids]));
  if(!keys.length){const boundary=doc.segments.filter(s=>s.assignment==='B');keys=[boundaryKey((boundary.length?boundary:doc.segments.filter(s=>s.assignment!=='A')).map(s=>s.id),'document')];}
 }
 const key=keys.length===1?keys[0]:`cp-set:${JSON.stringify(keys.sort())}`;
 sourceKeyCache.set(doc,key);return key;
}

/** Pick the complete paper under the marker, not merely the clicked edge or
 * the current line selection. Ambiguous/invalid paper never falls back to all
 * geometry in the editor. Existing extraction performs the final full check. */
export function pickFoldTarget(doc:Doc,point:Point):FoldTarget{
 validateDoc(doc);
 if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('CP 标记坐标无效。');
 let ids:Set<string>;
 if(hasMaterialTopology(doc)){
  const material=inspectMaterialTopology(doc);if(!material.ok)throw new Error(material.reason);
  const graph=material.graph,eps=material.tolerance;
  const components=material.components.filter(component=>component.edges.some(e=>{
   const [a,b]=graph.edges_vertices[e];return pointOnSegment(point,{id:material.edgeSegmentIds[e],assignment:'B',angle:0,a:graph.vertices_coords[a],b:graph.vertices_coords[b]},eps);
  })||component.faces.some(face=>materialPointInside(point,graph.faces_vertices![face].map(v=>graph.vertices_coords[v]))&&!(graph.faces_holes?.[face]??[]).some(hole=>materialPointInside(point,hole.map(v=>graph.vertices_coords[v])))));
  if(components.length!==1)throw new Error(components.length?'标记位置重叠了多个材料 CP，请标记能唯一识别的纸面。':'标记位置不在任何完整材料 CP 上，请在纸面内中键点击。');
  ids=new Set(components[0].edges.map(e=>material.edgeSegmentIds[e]));
 }else{
  const eps=epsilonFor(doc),matches=boundaryRings(doc).filter(ring=>location(point,ring,eps)!=='outside');
  if(matches.length!==1)throw new Error(matches.length?'标记位置对应多个嵌套或相交 CP，不能唯一确定计算源。':'标记位置没有独立闭合的纸张边界，请在完整 CP 内中键点击。');
  const ring=matches[0];ids=new Set(ring.ids);
  for(const segment of doc.segments)if(segment.assignment!=='A'&&segment.assignment!=='B'&&segmentLocation(segment,ring,eps).contained)ids.add(segment.id);
 }
 const source=extractFoldSelection(doc,ids).doc;
 return {doc:source,key:foldSourceCpKey(source)};
}

function location(p:Point,ring:BoundaryRing,eps:number):'inside'|'border'|'outside'{
  const [x0,y0,x1,y1]=ring.bounds;if(p[0]<x0-eps||p[0]>x1+eps||p[1]<y0-eps||p[1]>y1+eps)return 'outside';
  let inside=false;
  // The rightward ray includes all parity crossings and nearby border hits.
  // pointOnSegment permits epsilon in both perpendicular and endpoint distance,
  // so use twice epsilon, plus roundoff guard, rather than a one-epsilon box.
  const padding=2*eps+64*Number.EPSILON*ring.scale;
  for(const i of ring.index.query([p[0],p[1],Math.max(p[0],x1),p[1]],padding)){
    const s=ring.edges[i];
    if(pointOnSegment(p,s,eps))return 'border';
    if((s.a[1]>p[1])!==(s.b[1]>p[1])&&p[0]<(s.b[0]-s.a[0])*(p[1]-s.a[1])/(s.b[1]-s.a[1])+s.a[0])inside=!inside;
  }
  return inside?'inside':'outside';
}
function segmentLocation(s:Segment,ring:BoundaryRing,eps:number):{contained:boolean;interior:boolean}{
  const [x0,y0,x1,y1]=ring.bounds;
  if(Math.max(s.a[0],s.b[0])<x0-eps||Math.min(s.a[0],s.b[0])>x1+eps||Math.max(s.a[1],s.b[1])<y0-eps||Math.min(s.a[1],s.b[1])>y1+eps)return {contained:false,interior:false};
  const a=location(s.a,ring,eps),b=location(s.b,ring,eps),cuts=[0,1],length=distance(s.a,s.b);
  // Both segments' accepted parameter intervals extend by epsilon. Include a
  // scale/conditioning guard for the unchanged near-parallel cross quotients;
  // extra candidates are harmless because segmentIntersection remains final.
  const scale=Math.max(ring.scale,Math.abs(s.a[0]),Math.abs(s.a[1]),Math.abs(s.b[0]),Math.abs(s.b[1])),padding=2*eps+64*Number.EPSILON*scale*Math.max(1,Math.max(length,ring.maxEdgeLength)/eps);
  for(const i of ring.index.query(segmentBounds(s),padding)){const hit=segmentIntersection(s,ring.edges[i],eps);if(hit)cuts.push(Math.max(0,Math.min(1,hit.t)));}
  cuts.sort((a,b)=>a-b);let contained=a!=='outside'&&b!=='outside',interior=a==='inside'||b==='inside';
  for(let i=1;i<cuts.length;i++)if((cuts[i]-cuts[i-1])*length>eps){const middle=location(interpolate(s.a,s.b,(cuts[i-1]+cuts[i])/2),ring,eps);contained&&=middle!=='outside';interior||=middle==='inside';}
  return {contained,interior};
}

/** Extract one complete CP, automatically including its existing protected
 * boundary. Missing creases and crossing/outside geometry are never discarded. */
export function extractFoldSelection(doc:Doc,selectedIds:ReadonlySet<string>):FoldSelection{
  validateDoc(doc);
  const selected=doc.segments.filter(s=>selectedIds.has(s.id)&&s.assignment!=='A');
  if(!selected.length)throw new Error('请先框选一个完整 CP 的折线，再点击“折叠选区”；辅助线和标记不参与折叠。');
  let source:Doc,ids:Set<string>;
  if(hasMaterialTopology(doc)){
    const material=inspectMaterialTopology(doc);if(!material.ok)throw new Error(material.reason);
    const chosen=new Set(selected.map(s=>s.id)),components=material.components.filter(c=>c.edges.some(e=>chosen.has(material.edgeSegmentIds[e])));
    if(components.length!==1)throw new Error('选区跨越多个独立材料部件，请一次框选一个完整 CP。');
    ids=new Set(components[0].edges.map(e=>material.edgeSegmentIds[e]));
    const missing=doc.segments.filter(s=>ids.has(s.id)&&s.assignment!=='B'&&!chosen.has(s.id));
    if(missing.length)throw new Error(`选区未包含这个 CP 的全部折线（还缺 ${missing.length} 条），请扩大框选范围；纸张边界会自动补入。`);
    source=copyMaterialSelection(doc,[...ids]).doc;
  }else{
    const eps=epsilonFor(doc),rings=boundaryRings(doc),matches=rings.filter(ring=>selected.every(s=>s.assignment==='B'?ring.ids.has(s.id):segmentLocation(s,ring,eps).contained));
    if(matches.length!==1)throw new Error(matches.length?'选区落在多个嵌套纸张边界内，无法唯一确定 CP；请先整理边界。':'选区未对应一个独立闭合的纸张边界，或跨越多个 CP；请完整框选一个 CP，并检查纸边是否闭合。');
    const ring=matches[0];ids=new Set(ring.ids);
    for(const s of doc.segments){
      if(s.assignment==='A'||ids.has(s.id))continue;
      const relation=segmentLocation(s,ring,eps);
      if(!relation.contained&&!relation.interior)continue;
      if(s.assignment==='B')throw new Error('所选 CP 内还有其他纸张边界；嵌套或相交边界不能作为一个普通 CP 折叠。');
      if(!relation.contained)throw new Error('有折线穿出所选 CP 的纸张边界，请先检查纸边与折线；本次不会裁断折线。');
      ids.add(s.id);
    }
    const missing=doc.segments.filter(s=>ids.has(s.id)&&s.assignment!=='B'&&!selectedIds.has(s.id));
    if(missing.length)throw new Error(`选区未包含这个 CP 的全部折线（还缺 ${missing.length} 条），请扩大框选范围；纸张边界会自动补入。`);
    source=structuredClone({...doc,segments:doc.segments.filter(s=>ids.has(s.id))});
    delete source.background;delete source.objects;
    if(source.flatFold&&!source.flatFold.startingFace.every(p=>location(p,ring,eps)!=='outside'))delete source.flatFold;
  }
  source.paper=segmentPaperSize(source.segments);
  return {doc:source,selectedCount:selected.length,boundaryCount:source.segments.filter(s=>s.assignment==='B'&&!selectedIds.has(s.id)).length};
}

function foldInput(doc:Doc):string{
  return JSON.stringify({segments:doc.segments.filter(s=>s.assignment!=='A').map(({id,a,b,assignment,angle})=>({id,a,b,assignment,angle})),tolerance:epsilonFor(doc),flatFold:doc.flatFold,material:doc.metadata?.materialTopology});
}
/** A saved source is sufficient to recover its calculation scope after reload.
 * Changes elsewhere in a multi-CP document do not invalidate this model; newly
 * added or removed creases inside its boundary do. */
export function isFoldSourceCurrent(source:Doc,current:Doc):boolean{
  if(source===current)return true;
  if(foldInput(source)===foldInput(current))return true;
  try{
    const scoped=extractFoldSelection(current,new Set(source.segments.filter(s=>s.assignment!=='A').map(s=>s.id))).doc;
    return foldInput(source)===foldInput(scoped);
  }catch{return false;}
}
