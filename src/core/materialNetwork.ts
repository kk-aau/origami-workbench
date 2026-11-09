import type {Doc,Point,Segment} from './types';
import {inspectMaterialTopology} from './materialTopology';
import {splitMaterialNetwork,type MaterialNetworkGraph} from './materialNetworkGeometry';
import {materialCanonical,materialFaceFail as fail,materialRoot,finishMaterialFaces,type MaterialFaceEditResult} from './materialFaceCommon';
import {materialFaceRings,materialFaceEdgeRings,materialFaceInside} from './materialRings';
import {materialOrientation} from './materialTraceGeometry';
import {splitMaterialHoledFace} from './materialHoleSplit';
import {hasWeakMaterialFaceRings} from './materialWeak';
import {constructMaterialNetworkAcross} from './materialNetworkAcross';
import {appendMaterialNetworkGroup} from './materialCurveModel';
export type MaterialFaceNetworkIntent={kind:'material-face-network';face:number;graph:MaterialNetworkGraph;assignments:('M'|'V'|'F'|'U')[];fixedPoint:Point;cpOnly:boolean;scope?:'face'|'component'|'all';parametric?:boolean};
const on=(p:Point,a:Point,b:Point)=>!materialOrientation(a,b,p)&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
const intersects=(a:Point,b:Point,c:Point,d:Point)=>on(a,c,d)||on(b,c,d)||on(c,a,b)||on(d,a,b)||materialOrientation(a,b,c)*materialOrientation(a,b,d)<0&&materialOrientation(c,d,a)*materialOrientation(c,d,b)<0;
export function constructMaterialNetwork(doc:Doc,intent:MaterialFaceNetworkIntent){return intent?.parametric===true?appendMaterialNetworkGroup(doc,intent):buildMaterialNetworkGeometry(doc,intent);}
export function buildMaterialNetworkGeometry(doc:Doc,intent:MaterialFaceNetworkIntent){
 const old=inspectMaterialTopology(doc);if(!old.ok)fail(old.reason);const g=old.graph;
 const wanted=['assignments','cpOnly','face','fixedPoint','graph','kind',...(Object.hasOwn(intent??{},'scope')?['scope']:[]),...(Object.hasOwn(intent??{},'parametric')?['parametric']:[])].sort().join(',');
 if(!intent||Object.keys(intent).sort().join(',')!==wanted||Object.hasOwn(intent,'scope')&&!['face','component','all'].includes(intent.scope!)||Object.hasOwn(intent,'parametric')&&typeof intent.parametric!=='boolean'||intent.kind!=='material-face-network'||!Number.isInteger(intent.face)||intent.face<0||intent.face>=g.faces_vertices!.length||typeof intent.cpOnly!=='boolean'||!Array.isArray(intent.assignments)||intent.assignments.length!==intent.graph?.edges?.length||Array.from(intent.assignments).some(a=>!['M','V','F','U'].includes(a))||!Array.isArray(intent.fixedPoint)||intent.fixedPoint.length!==2||Array.from(intent.fixedPoint).some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))fail('闭合线网的面、点边、赋型、固定点、范围或仅CP设置无效。');
 const network=splitMaterialNetwork(intent.graph,old.tolerance),f=intent.face;if(!materialFaceInside(g,f,intent.fixedPoint))fail('固定点必须在选中材料面内部。');
 if(intent.scope){
  const result=constructMaterialNetworkAcross(doc,{face:f,scope:intent.scope,graph:intent.graph,assignments:intent.assignments,fixedPoint:intent.fixedPoint,cpOnly:intent.cpOnly});
  const details:NonNullable<MaterialFaceEditResult['network']>={inputVertices:intent.graph.vertices.length,inputEdges:intent.graph.edges.length,intersections:network.intersections,segments:result.insertedIds!.length,createdFaces:result.facesAfter-result.facesBefore+result.across.faces,cpOnly:intent.cpOnly,clipping:{scope:intent.scope,faces:result.across.faces,components:result.across.components,materialLength:result.across.materialLength,blankLength:result.across.blankLength}};
  return {...result,network:details};
 }
 for(const p of network.vertices)if(!materialFaceInside(g,f,p))fail('线网点须严格位于所选材料面内部，不能落入孔洞或其他部件。');
 const rings=materialFaceRings(g,f),ringEdges=materialFaceEdgeRings(g,f);
 for(const [a,b] of network.edges)for(const ring of rings)for(let k=0;k<ring.length;k++)if(intersects(network.vertices[a],network.vertices[b],g.vertices_coords[ring[k]],g.vertices_coords[ring[(k+1)%ring.length]]))fail('线网边穿越纸边或孔洞；未增加跨空白连接。');
 const coords=g.vertices_coords.map(p=>[...p] as Point),offset=coords.length;coords.push(...network.vertices.map(p=>[...p] as Point));
 const edges=g.edges_vertices.map(e=>[...e] as [number,number]),kinds=[...g.edges_assignment],angles=[...g.edges_foldAngle],ids=[...old.edgeSegmentIds],segments=doc.segments.map(s=>structuredClone(s)),used=new Set([...doc.segments.map(s=>s.id),...(doc.objects??[]).map(o=>o.id)]),insertedIds:string[]=[],cuts:{a:number;b:number;e:number}[]=[];
 network.edges.forEach(([a,b],i)=>{const type=intent.assignments[network.edgeSource[i]],angle=type==='M'?-180:type==='V'?180:type==='F'?0:null;let id=`material-network-${i}`,n=1;while(used.has(id))id=`material-network-${i}-${n++}`;used.add(id);const e=edges.length;edges.push([a+offset,b+offset]);kinds.push(type);angles.push(angle);ids.push(id);insertedIds.push(id);segments.push({id,a:[...coords[a+offset]],b:[...coords[b+offset]],assignment:type,angle} satisfies Segment);cuts.push({a:a+offset,b:b+offset,e});});
 const parts=splitMaterialHoledFace(coords,rings.map((vertices,i)=>({vertices:[...vertices],edges:[...ringEdges[i]]})),cuts,hasWeakMaterialFaceRings(g,f)),faces:number[][]=[],faceEdges:number[][]=[],holes:number[][][]=[],holeEdges:number[][][]=[],sources:number[][]=[],children:number[][]=[];
 g.faces_vertices!.forEach((_,oldFace)=>{children[oldFace]=[];const ps=oldFace===f?parts:materialFaceRings(g,oldFace).slice(0,1).map(vertices=>({vertices:[...vertices],edges:[...materialFaceEdgeRings(g,oldFace)[0]],holes:materialFaceRings(g,oldFace).slice(1).map((r,i)=>({vertices:[...r],edges:[...materialFaceEdgeRings(g,oldFace)[i+1]]}))}));for(const p of ps){children[oldFace].push(faces.length);faces.push(p.vertices);faceEdges.push(p.edges);holes.push((p.holes??[]).map(h=>h.vertices));holeEdges.push((p.holes??[]).map(h=>h.edges));sources.push([oldFace]);}});
 const graph=materialCanonical(coords,edges,kinds,angles,faces,faceEdges,holes,holeEdges),fixed=children[f].filter(v=>materialFaceInside(graph,v,intent.fixedPoint));if(fixed.length!==1)fail('固定点在新折痕上或没有唯一子面，请移动固定点。');
 const oldRoot=materialRoot(doc,old),root=oldRoot===f?fixed[0]:children[oldRoot][0];let ff:Point[]|undefined;
 if(!intent.cpOnly&&old.foldedVertices){
  ff=old.foldedVertices.map(p=>[...p] as Point);const face=g.faces_vertices![f],a=face[0],b=face[1],x=g.vertices_coords[a],y=g.vertices_coords[b],p=ff[a],q=ff[b],lc=Math.hypot(y[0]-x[0],y[1]-x[1]),lf=Math.hypot(q[0]-p[0],q[1]-p[1]),u:Point=[(y[0]-x[0])/lc,(y[1]-x[1])/lc],v:Point=[(q[0]-p[0])/lf,(q[1]-p[1])/lf];
  const area=(points:Point[])=>face.reduce((s,a,i)=>{const b=face[(i+1)%face.length],o=points[face[0]];return s+(points[a][0]-o[0])*(points[b][1]-o[1])-(points[a][1]-o[1])*(points[b][0]-o[0]);},0),sign=Math.sign(area(g.vertices_coords)*area(old.foldedVertices));
  for(const z of network.vertices){const dx=z[0]-x[0],dy=z[1]-x[1],along=dx*u[0]+dy*u[1],normal=(-dx*u[1]+dy*u[0])*sign;ff.push([p[0]+along*v[0]-normal*v[1],p[1]+along*v[1]+normal*v[0]]);}
 }
 const result=finishMaterialFaces(doc,old,graph,ids,segments,sources,root,oldRoot,ff,new Map(doc.segments.map(s=>[s.id,[s.id]])),{addedVertices:network.vertices.length,removedEdges:0,synchronizedBanks:0,insertedIds});
 const details:NonNullable<MaterialFaceEditResult['network']>={inputVertices:intent.graph.vertices.length,inputEdges:intent.graph.edges.length,intersections:network.intersections,segments:network.edges.length,createdFaces:parts.length,cpOnly:intent.cpOnly};return {...result,faceParents:sources.map(r=>r[0]),network:details};
}
