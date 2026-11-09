import {DiagramWorkCounter} from './diagramWork';
import {buildDiagramFold,distance,epsilonFor,polygonArea} from '../core/geometry';
import {buildDiagramPoseDocFold} from './diagramFoldGeometry';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {diagramDepthActive} from './diagramDepth';
import {diagramPiecesStrictlyCoverPoint} from './diagramFoldOcclusion';
import {flatLayerEdges} from '../core/flatLayerOrder';
import {hasMaterialTopology} from '../core/materialTopology';
import {defaultAngle,validateDoc,type Assignment,type Doc,type FlatFoldResult,type FoldGraph,type Point,type Segment} from '../core/types';
import type {DiagramCPState,DiagramPose} from './diagramProject';
import type {DiagramLineAnnotation} from './diagramAnnotations';
import {modelProjection} from './modelProjection';
import {diagramPresentation,diagramFaceVisible} from './diagramDrawing';
import type {DiagramFoldAnchor,DiagramFoldLinkSettings,DiagramFoldMatrix,DiagramFoldPreviewSegment} from './diagramFoldLinkTypes';
import {completedSpatialCreases,spatialFaceMatrix,validateDiagramSpatialPose} from './diagramSpatialPose';
import type {RigidFoldTransform3D} from '../core/rigidFoldGeometry';

export type {DiagramFoldAnchor,DiagramFoldLinkSettings,DiagramFoldMatrix,DiagramFoldPreviewSegment} from './diagramFoldLinkTypes';
type Interval=[number,number];
type Line={a:Point;b:Point};
type SourceSegment={s:Segment;source:Segment};
type ProjectedStroke={face:number;lo:number;hi:number;line:Line;matrix:DiagramFoldMatrix;strokeSpan?:DiagramFoldPreviewSegment['strokeSpan']};
type FacePiece={cp:Point[];shown:Point[];matrix:DiagramFoldMatrix;cpHoles?:Point[][];shownHoles?:Point[][]};
type Prepared={pose:DiagramPose;baseCP:Point[];cp:Point[];faces:number[][];holes:number[][][];raw:Point[];shown:Point[];matrices:(DiagramFoldMatrix|null)[];displayMatrices:(DiagramFoldMatrix|null)[];pieces:FacePiece[][];localCells:boolean[];eps:number;budget:DiagramWorkCounter;relations:[number,number][];displayFallback:boolean};

const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const lerp=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const finitePoint=(p:Point)=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1_000_000);
function pointCheck(p:Point){if(!finitePoint(p))throw Error('折痕联动坐标无效或超出范围。');}
const det=(m:DiagramFoldMatrix)=>m[0]*m[3]-m[1]*m[2];
export function applyDiagramFoldMatrix(m:DiagramFoldMatrix,p:Point):Point{return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
function inverse(m:DiagramFoldMatrix):DiagramFoldMatrix {
  const d=det(m);if(!Number.isFinite(d)||Math.abs(d)<1e-10)throw Error('纸面变换退化，无法映射折痕。');
  const a=m[3]/d,b=-m[1]/d,c=-m[2]/d,e=m[0]/d;return [a,b,c,e,-a*m[4]-c*m[5],-b*m[4]-e*m[5]];
}
function compose(a:DiagramFoldMatrix,b:DiagramFoldMatrix):DiagramFoldMatrix {
  const q=applyDiagramFoldMatrix(a,[b[4],b[5]]);return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],q[0],q[1]];
}
function rigidMatrix(m:DiagramFoldMatrix){
  if(!Array.isArray(m)||m.length!==6||m.some(n=>!Number.isFinite(n)||Math.abs(n)>1_000_000)||Math.abs(m[0]**2+m[1]**2-1)>1e-6||Math.abs(m[2]**2+m[3]**2-1)>1e-6||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-6||Math.abs(Math.abs(det(m))-1)>1e-6)throw Error('固定纸面必须具有有效的等距变换。');
}
function rigidSpatialTransform(value:RigidFoldTransform3D){
  if(!value||!Array.isArray(value.rotation)||value.rotation.length!==9||!Array.isArray(value.translation)||value.translation.length!==3||[...value.rotation,...value.translation].some(n=>!Number.isFinite(n)||Math.abs(n)>1_000_000))throw Error('固定纸面的三维刚体变换无效。');
  const r=value.rotation;
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)if(Math.abs(r[a*3]*r[b*3]+r[a*3+1]*r[b*3+1]+r[a*3+2]*r[b*3+2]-(a===b?1:0))>1e-8)throw Error('固定纸面不能包含三维缩放或剪切。');
  const determinant=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
  if(Math.abs(determinant-1)>1e-8)throw Error('固定纸面必须是有效的三维旋转，不能镜像材料。');
}
function faceMatrix(cp:Point[],ff:Point[],face:number[],eps:number,budget:DiagramWorkCounter):DiagramFoldMatrix {
  let edge=0,length=0;
  for(let i=0;i<face.length;i++){budget.tick();const d=distance(cp[face[i]],cp[face[(i+1)%face.length]]);if(d>length){length=d;edge=i;}}
  const source=face.map(v=>cp[v]),target=face.map(v=>ff[v]),sa=polygonArea(source),ta=polygonArea(target);
  if(length<=eps||Math.abs(sa)<=eps*eps||Math.abs(ta)<=eps*eps)throw Error('存在退化纸面，不能进行折痕联动。');
  const a=cp[face[edge]],b=cp[face[(edge+1)%face.length]],x=ff[face[edge]],y=ff[face[(edge+1)%face.length]],s=sub(b,a),t=sub(y,x),l2=dot(s,s),parity=Math.sign(sa*ta);
  if(Math.abs(Math.hypot(...t)-length)>eps*20)throw Error('纸面已被非等距修形，请恢复真实平折图后再联动 CP。');
  const m:DiagramFoldMatrix=[(t[0]*s[0]+parity*t[1]*s[1])/l2,(t[1]*s[0]-parity*t[0]*s[1])/l2,(t[0]*s[1]-parity*t[1]*s[0])/l2,(t[1]*s[1]+parity*t[0]*s[0])/l2,0,0];
  const q=applyDiagramFoldMatrix(m,a);m[4]=x[0]-q[0];m[5]=x[1]-q[1];rigidMatrix(m);
  for(const v of face){budget.tick();if(distance(applyDiagramFoldMatrix(m,cp[v]),ff[v])>eps*20)throw Error('纸面已被非等距修形，请恢复真实平折图后再联动 CP。');}
  return m;
}
function ordinary(doc:Doc){validateDoc(doc);if(hasMaterialTopology(doc))throw Error('独立材料与切口工程尚未验证折痕联动路径，请在 CP 中编辑。');}
function triangleMatrix(cp:Point[],raw:Point[],ids:number[],eps:number):DiagramFoldMatrix {
  const [a,b,c]=ids.map(v=>cp[v]),[x,y,z]=ids.map(v=>raw[v]),s=sub(b,a),t=sub(c,a),u=sub(y,x),v=sub(z,x),d=cross(s,t);
  if(Math.abs(d)<=eps*eps||Math.abs(cross(u,v))<=eps*eps)throw Error('存在退化纸面，不能进行折痕联动。');
  const matrix:DiagramFoldMatrix=[(u[0]*t[1]-v[0]*s[1])/d,(u[1]*t[1]-v[1]*s[1])/d,(v[0]*s[0]-u[0]*t[0])/d,(v[1]*s[0]-u[1]*t[0])/d,0,0];
  const q=applyDiagramFoldMatrix(matrix,a);matrix[4]=x[0]-q[0];matrix[5]=x[1]-q[1];inverse(matrix);
  if(matrix.some(n=>!Number.isFinite(n))||ids.some(v=>distance(applyDiagramFoldMatrix(matrix,cp[v]),raw[v])>eps*20))throw Error('纸面修形的变换精度不足，无法可靠映射折痕。');return matrix;
}
/** Ordinary face edits remain injective. Existing F marks additionally provide
 * illustration hinges: their locally flipped cells may overlap in a diagram,
 * while every source triangle still needs a finite, invertible map. */
function validateIllustrationFace(graph:FoldGraph,raw:Point[],rings:number[][],ids:number[][],eps:number,budget:DiagramWorkCounter,localCells=false){
  const edges=rings.flatMap((ring,r)=>ring.map((a,i)=>({a:raw[a],b:raw[ring[(i+1)%ring.length]],ring:r,index:i,length:ring.length})));
  for(let i=0;!localCells&&i<edges.length;i++){
    const a=edges[i];if(distance(a.a,a.b)<=eps)throw Error('存在退化纸面，不能进行折痕联动。');
    for(let j=i+1;j<edges.length;j++){
      budget.tick();const b=edges[j];
      if(a.ring===b.ring&&(Math.abs(a.index-b.index)===1||Math.abs(a.index-b.index)===a.length-1))continue;
      const r=sub(a.b,a.a),s=sub(b.b,b.a),q=sub(b.a,a.a),d=cross(r,s),rl=Math.hypot(...r),sl=Math.hypot(...s);
      if(Math.abs(d)>eps*Math.max(rl,sl)){
        const t=cross(q,s)/d,u=cross(q,r)/d;
        if(t>=-eps/rl&&t<=1+eps/rl&&u>=-eps/sl&&u<=1+eps/sl)throw Error('纸面修形产生自交，无法唯一映射折痕。');
      }else if(onSegment(a.a,b,eps)||onSegment(a.b,b,eps)||onSegment(b.a,a,eps)||onSegment(b.b,a,eps))throw Error('纸面修形产生自交，无法唯一映射折痕。');
    }
  }
  let parity=0,area=0;
  for(const triangle of ids){
    budget.tick();const source=polygonArea(triangle.map(v=>graph.vertices_coords[v])),target=polygonArea(triangle.map(v=>raw[v]));
    if(Math.abs(source)<=eps*eps||Math.abs(target)<=eps*eps)throw Error('存在退化纸面，不能进行折痕联动。');
    const sign=Math.sign(source*target);if(!localCells&&parity&&sign!==parity)throw Error('纸面修形产生翻折或重叠，无法唯一映射折痕。');parity=sign;area+=Math.abs(source);
  }
  const expected=Math.abs(polygonArea(rings[0].map(v=>graph.vertices_coords[v])))-rings.slice(1).reduce((sum,ring)=>sum+Math.abs(polygonArea(ring.map(v=>graph.vertices_coords[v]))),0);
  if(!ids.length||Math.abs(area-expected)>eps*Math.max(1,Math.sqrt(expected))*20)throw Error('纸面三角划分不完整，不能映射折痕。');
}
function prepare(pose:DiagramPose,source?:DiagramCPState,rigidOnly=false):Prepared {
  ordinary(pose.sourceDoc);
  if(source&&(source.id!==pose.sourceStateId||source.revision!==pose.sourceRevision||JSON.stringify(source.doc)!==JSON.stringify(pose.sourceDoc)))throw Error('折图来源 CP 已变化，请重新计算折图后再联动。');
  const {vertices:baseRaw,faces,status}=pose.result.geometry;
  if(status!=='ready'||!baseRaw.length||!faces.length)throw Error('折痕联动需要有效的平折纸面。');
  if(pose.spatial)validateDiagramSpatialPose(pose,true);
  const {baseGraph,graph,triangles,vertices:raw,rings}=diagramIllustrationMesh(pose),cp=graph.vertices_coords,baseCP=baseGraph.vertices_coords;
  const depth=diagramDepthActive(pose),physical=depth?baseRaw:raw;
  if(baseCP.length!==baseRaw.length||JSON.stringify(baseGraph.faces_vertices)!==JSON.stringify(faces))throw Error('折图与来源 CP 的纸面身份不一致，请重新计算。');
  if(raw.length!==cp.length)throw Error('折痕联动的纸面锚点与来源顶点不对应。');
  raw.forEach(pointCheck);
  const budget=new DiagramWorkCounter(),eps=epsilonFor(pose.sourceDoc),holes=rings.map(row=>row.slice(1)),anchorFaces=new Set(pose.paperDeformation?.nodes.map(node=>node.face)??[]);
  const flatEdges=pose.result.geometry.graph?.zhezhi_flatCreases==='marks'?graph.edges_vertices.filter((_,i)=>graph.edges_assignment[i]==='F'):[];
  const flatFoldCells=faces.map((face,f)=>flatEdges.some(([a,b])=>{budget.tick();const point=lerp(cp[a],cp[b],.5);return contains(point,face.map(v=>cp[v]),eps,true)&&!(holes[f]??[]).some(r=>contains(point,r.map(v=>cp[v]),eps));}));
  const localCells=flatFoldCells.map((flat,f)=>depth||flat||anchorFaces.has(f));
  const edgeOn=new Set((pose.result.geometry.graph?.zhezhi_spatialEdgeOnFaces as number[]|undefined)??[]),projectionScale=raw.reduce((scale,p)=>Math.max(scale,Math.abs(p[0]),Math.abs(p[1])),1);
  const matrices=faces.map((face,f)=>{
    try{
      if(edgeOn.has(f)&&Math.abs(polygonArea(face.map(v=>raw[v])))<=Number.EPSILON*128*projectionScale**2)return null;
      const matrix=pose.spatial?spatialFaceMatrix(pose.spatial,f):faceMatrix(cp,physical,face,eps,budget);
      // Projection may foreshorten a perfectly rigid 3D face. It must still
      // be invertible and agree with every indexed material point.
      if(pose.spatial){
        if(matrix.some(n=>!Number.isFinite(n)))throw Error('空间投影无效。');
        if(Math.abs(det(matrix))<Number.EPSILON*64)return null;
        if(Math.abs(det(matrix))<1e-10||Math.abs(polygonArea(face.map(v=>raw[v])))<=eps*eps)throw Error('纸面接近侧立，无法可靠映射折痕，请调整空间视角。');
        inverse(matrix);
        for(const v of face){budget.tick();if(distance(applyDiagramFoldMatrix(matrix,cp[v]),raw[v])>eps*20)throw Error('空间纸面的投影与真实姿态不一致，请重新计算。');}
      }
      // A pulled F endpoint can live inside a physically unsplit face. Its
      // boundary still looks rigid, but every illustration cell must agree.
      for(const v of new Set([...(holes[f]??[]).flat(),...triangles[f].flat()])){budget.tick();if(distance(applyDiagramFoldMatrix(matrix,cp[v]),physical[v])>eps*20)throw Error('纸面已被非等距修形，请恢复真实平折图后再联动 CP。');}
      return matrix;
    }
    catch(error){if(rigidOnly||!(error instanceof Error)||!/(非等距|等距变换)/.test(error.message)&&!(flatFoldCells[f]&&/存在退化纸面/.test(error.message)))throw error;return null;}
  });
  // Illustration-only anchors must not recenter the saved model's camera.
  const view=pose.view,projection=modelProjection(baseRaw,view?.side==='back',view?.rotation??0,view?.projectionCenter),o=projection.project([0,0]),x=projection.project([1,0]),y=projection.project([0,1]);
  const camera:DiagramFoldMatrix=[x[0]-o[0],x[1]-o[1],y[0]-o[0],y[1]-o[1],o[0],o[1]],shown=raw.map(projection.project),displayMatrices=matrices.map(m=>m&&!depth?compose(camera,m):null);
  const pieces=faces.map((face,f):FacePiece[]=>{
    const matrix=displayMatrices[f];if(matrix)return [{cp:rings[f][0].map(v=>cp[v]),shown:rings[f][0].map(v=>shown[v]),matrix,cpHoles:(holes[f]??[]).map(r=>r.map(v=>cp[v])),shownHoles:(holes[f]??[]).map(r=>r.map(v=>shown[v]))}];
    if(pose.spatial||edgeOn.has(f))return []; // An edge-on face has no invertible screen interior.
    const ids=triangles[f];validateIllustrationFace(graph,raw,rings[f],ids,eps,budget,flatFoldCells[f]);
    return ids.map(t=>({cp:t.map(v=>cp[v]),shown:t.map(v=>shown[v]),matrix:compose(camera,triangleMatrix(cp,raw,t,eps))}));
  });
  const orders=pose.result.layers.status==='solved'?pose.result.layers.faceOrders??[]:[];
  if(orders.some(r=>!Array.isArray(r)||r.length!==3||!Number.isInteger(r[0])||!Number.isInteger(r[1])||r[0]<0||r[1]<0||r[0]>=faces.length||r[1]>=faces.length||r[0]===r[1]||Math.abs(r[2])!==1))throw Error('折图层序证书无效，请重新分析层序。');
  const relations=flatLayerEdges(orders,faces.map(face=>polygonArea(face.map(v=>raw[v]))>0?1:-1));
  return {pose,baseCP,cp,raw,faces,holes,shown,matrices,displayMatrices,pieces,localCells,eps,budget,relations,displayFallback:false};
}
function parameter(p:Point,line:Line){const d=sub(line.b,line.a);return dot(sub(p,line.a),d)/dot(d,d);}
function onLine(p:Point,line:Line,eps:number){const d=sub(line.b,line.a),length=Math.hypot(...d);return length>eps&&Math.abs(cross(sub(p,line.a),d))<=eps*length;}
function onSegment(p:Point,line:Line,eps:number){if(!onLine(p,line,eps))return false;const t=parameter(p,line),e=eps/distance(line.a,line.b);return t>=-e&&t<=1+e;}
function contains(p:Point,polygon:Point[],eps:number,strict=false){
  for(let i=0;i<polygon.length;i++)if(onSegment(p,{a:polygon[i],b:polygon[(i+1)%polygon.length]},eps))return !strict;
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;
}
function sortedBreaks(values:number[],length:number,eps:number){
  const sorted=values.map(t=>Math.max(0,Math.min(1,t))).sort((a,b)=>a-b),result:number[]=[];
  for(const t of sorted)if(!result.length||(t-result[result.length-1])*length>eps)result.push(t);
  return result;
}
function clip(line:Line,polygon:Point[],eps:number,budget:DiagramWorkCounter):Interval[]{
  const r=sub(line.b,line.a),length=Math.hypot(...r);if(length<=eps)return [];
  const minX=Math.min(line.a[0],line.b[0])-eps*2,maxX=Math.max(line.a[0],line.b[0])+eps*2;
  const minY=Math.min(line.a[1],line.b[1])-eps*2,maxY=Math.max(line.a[1],line.b[1])+eps*2;
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const p of polygon){left=Math.min(left,p[0]);right=Math.max(right,p[0]);top=Math.min(top,p[1]);bottom=Math.max(bottom,p[1]);}
  if(left>maxX||right<minX||top>maxY||bottom<minY)return [];
  const breaks=[0,1];
  for(let i=0;i<polygon.length;i++){
    budget.tick();const a=polygon[i],b=polygon[(i+1)%polygon.length],s=sub(b,a),q=sub(a,line.a),den=cross(r,s),sl=Math.hypot(...s);
    if(Math.abs(den)>eps*Math.max(length,sl)){
      const t=cross(q,s)/den,u=cross(q,r)/den;if(t>=-eps/length&&t<=1+eps/length&&u>=-eps/Math.max(sl,eps)&&u<=1+eps/Math.max(sl,eps))breaks.push(t);
    }else if(onLine(a,line,eps)&&onLine(b,line,eps))breaks.push(parameter(a,line),parameter(b,line));
  }
  const ts=sortedBreaks(breaks,length,eps),result:Interval[]=[];
  for(let i=1;i<ts.length;i++){budget.tick(polygon.length);if((ts[i]-ts[i-1])*length>eps&&contains(lerp(line.a,line.b,(ts[i]+ts[i-1])/2),polygon,eps))result.push([ts[i-1],ts[i]]);}
  return result;
}
function clipFace(line:Line,outer:Point[],holes:Point[][],eps:number,budget:DiagramWorkCounter):Interval[]{
  let result=clip(line,outer,eps,budget);const length=distance(line.a,line.b);
  if(!result.length)return result;
  for(const hole of holes){
    const removed=clip(line,hole,eps,budget).filter(([lo,hi])=>contains(lerp(line.a,line.b,(lo+hi)/2),hole,eps,true));
    for(const [start,end] of removed)result=result.flatMap(([lo,hi])=>{
      if(end<=lo||start>=hi)return [[lo,hi] as Interval];
      const parts:Interval[]=[];if((start-lo)*length>eps)parts.push([lo,Math.min(hi,start)]);if((hi-end)*length>eps)parts.push([Math.max(lo,end),hi]);return parts;
    });
  }
  return result;
}
function containsFace(prepared:Prepared,face:number,point:Point){
  if(prepared.localCells[face])return prepared.pieces[face].some(piece=>contains(point,piece.shown,prepared.eps)&&!(piece.shownHoles??[]).some(r=>contains(point,r,prepared.eps,true)));
  return contains(point,prepared.faces[face].map(v=>prepared.shown[v]),prepared.eps)&&!(prepared.holes[face]??[]).some(r=>contains(point,r.map(v=>prepared.shown[v]),prepared.eps,true));
}
function clipShownFace(prepared:Prepared,face:number,line:Line,preserveBreaks=false):Interval[]{
  const {faces,holes,shown,eps,budget}=prepared;
  if(!prepared.localCells[face])return clipFace(line,faces[face].map(v=>shown[v]),(holes[face]??[]).map(r=>r.map(v=>shown[v])),eps,budget);
  const spans=prepared.pieces[face].flatMap(piece=>clipFace(line,piece.shown,piece.shownHoles??[],eps,budget)).sort((a,b)=>a[0]-b[0]),result:Interval[]=[],tolerance=eps/distance(line.a,line.b);
  if(preserveBreaks)return spans;
  for(const span of spans){const prior=result.at(-1);if(prior&&span[0]<=prior[1]+tolerance)prior[1]=Math.max(prior[1],span[1]);else result.push([...span]);}
  return result;
}
/** Certified relationships take precedence; otherwise use the actual artwork
 * paint order without manufacturing a physical layer certificate. */
function order(prepared:Prepared,cover:number[]):number[] {
  if(cover.length<=1)return [...cover];
  const {pose,budget,relations}=prepared;
  const displayOrder=()=>{prepared.displayFallback=true;const covered=new Set(cover);return diagramPresentation(pose).order.filter(face=>covered.has(face)).reverse();};
  if(pose.result.layers.status!=='solved')return displayOrder();
  if(!relations.length){const global=pose.result.layers.faceOrder;if(global&&global.length===prepared.faces.length&&new Set(global).size===global.length&&global.every(f=>Number.isInteger(f)&&f>=0&&f<prepared.faces.length)){const set=new Set(cover),sorted=global.filter(f=>set.has(f));return pose.view?.side==='back'?sorted:sorted.reverse();}return displayOrder();}
  const ids=new Set(cover),next=new Map(cover.map(f=>[f,new Set<number>()])),degrees=new Map(cover.map(f=>[f,0]));
  for(const [a,b] of relations){budget.tick();if(ids.has(a)&&ids.has(b)&&!next.get(a)!.has(b)){next.get(a)!.add(b);degrees.set(b,degrees.get(b)!+1);}}
  const remaining=new Set(cover),bottom:number[]=[];
  while(remaining.size){budget.tick(remaining.size);const options=[...remaining].filter(f=>degrees.get(f)===0);if(options.length!==1)return displayOrder();const f=options[0];bottom.push(f);remaining.delete(f);for(const g of next.get(f)!)degrees.set(g,degrees.get(g)!-1);}
  return pose.view?.side==='back'?bottom:bottom.reverse();
}
function screenAssignment(assignment:Assignment,matrix:DiagramFoldMatrix):Assignment{return det(matrix)<0?(assignment==='V'?'M':assignment==='M'?'V':assignment):assignment;}
function previewLine(prepared:Prepared,line:Line,faceAssignments:Map<number,Assignment>,displayOnly=false,strokeSpan?:DiagramFoldPreviewSegment['strokeSpan'],visibleOnly=false):DiagramFoldPreviewSegment[]{
  const {faces,eps,budget}=prepared,preserveBreaks=displayOnly||diagramDepthActive(prepared.pose),clips=faces.map((_,f)=>clipShownFace(prepared,f,line,preserveBreaks)),length=distance(line.a,line.b);
  const breaks=sortedBreaks([0,1,...clips.flat(2)],length,eps),out:DiagramFoldPreviewSegment[]=[],lastDisplayPart=new Map<number,DiagramFoldPreviewSegment>();
  for(let i=1;i<breaks.length;i++){
    const lo=breaks[i-1],hi=breaks[i],mid=(lo+hi)/2;if((hi-lo)*length<=eps)continue;
    budget.tick(clips.reduce((n,row)=>n+row.length,0));const cover=clips.flatMap((row,f)=>(!displayOnly&&!visibleOnly||diagramFaceVisible(prepared.pose,f))&&row.some(([a,b])=>mid>a-eps/length&&mid<b+eps/length)?[f]:[]),sorted=order(prepared,cover);
    const interior=new Map<number,boolean>(),point=lerp(line.a,line.b,mid);
    const strictlyCovered=(face:number)=>{if(!interior.has(face))interior.set(face,diagramPiecesStrictlyCoverPoint(prepared.pieces[face],point,eps,n=>budget.tick(n)));return interior.get(face)!;};
    for(const face of cover){const assignment=faceAssignments.get(face);if(assignment===undefined||!['M','V','F','U'].includes(assignment))continue;
      // Display a lower crease over a coincident upper paper outline. Only
      // actual interior coverage hides it; material targeting for new strokes
      // keeps the original top-face rule and never expands its CP scope.
      const hidden=displayOnly?sorted.slice(0,sorted.indexOf(face)).some(strictlyCovered):sorted[0]!==face;
      const materialSpan=clips[face].find(([a,b])=>mid>=a-eps/length&&mid<=b+eps/length)!;
      const span=strokeSpan?{length:strokeSpan.length,offset:strokeSpan.offset+lo*length}:{length:(materialSpan[1]-materialSpan[0])*length,offset:(lo-materialSpan[0])*length};
      const part:DiagramFoldPreviewSegment={face,a:lerp(line.a,line.b,lo),b:lerp(line.a,line.b,hi),assignment:assignment as DiagramFoldPreviewSegment['assignment'],visibility:hidden?'hidden':'visible',strokeSpan:span},previous=lastDisplayPart.get(face);
      if(displayOnly&&previous&&previous.assignment===part.assignment&&previous.visibility===part.visibility&&distance(previous.b,part.a)<=eps)previous.b=part.b;
      else{out.push(part);if(displayOnly)lastDisplayPart.set(face,part);}
      }
  }
  return out;
}
// Assignment-free crease replacement deliberately leaves B/A untouched.
// Geometry-only subtraction is reserved for clipping new strokes at paper edges.
function segmentPieces(s:Segment,subtract:Segment[],eps:number,budget:DiagramWorkCounter,matchAssignments:boolean|'geometry'=true):Segment[]{
  const length=distance(s.a,s.b);if(length<=eps)return [];
  const minX=Math.min(s.a[0],s.b[0])-eps*2,maxX=Math.max(s.a[0],s.b[0])+eps*2;
  const minY=Math.min(s.a[1],s.b[1])-eps*2,maxY=Math.max(s.a[1],s.b[1])+eps*2;
  const covered:Interval[]=[];
  for(const other of subtract){
    if(Math.min(other.a[0],other.b[0])>maxX||Math.max(other.a[0],other.b[0])<minX||Math.min(other.a[1],other.b[1])>maxY||Math.max(other.a[1],other.b[1])<minY)continue;
    budget.tick();if((matchAssignments===true?(s.assignment!==other.assignment||s.angle!==other.angle):matchAssignments===false&&(!['M','V','U','F'].includes(s.assignment)||!['M','V','U','F'].includes(other.assignment)))||!onLine(other.a,s,eps)||!onLine(other.b,s,eps))continue;const ts=[parameter(other.a,s),parameter(other.b,s)].sort((a,b)=>a-b),lo=Math.max(0,ts[0]),hi=Math.min(1,ts[1]);if((hi-lo)*length>eps)covered.push([lo,hi]);}
  covered.sort((a,b)=>a[0]-b[0]);let cursor=0;const remain:Interval[]=[];
  for(const [lo,hi] of covered){if((lo-cursor)*length>eps)remain.push([cursor,lo]);cursor=Math.max(cursor,hi);}if((1-cursor)*length>eps)remain.push([cursor,1]);
  return remain.map(([a,b],i)=>({...s,id:remain.length===1&&a===0&&b===1?s.id:`${s.id}~link-${i}`,a:lerp(s.a,s.b,a),b:lerp(s.a,s.b,b)}));
}
function sameSegmentKey(s:Segment){
  const forward=s.a[0]<s.b[0]||s.a[0]===s.b[0]&&s.a[1]<=s.b[1],a=forward?s.a:s.b,b=forward?s.b:s.a;
  return JSON.stringify([s.assignment,s.angle===undefined?'undefined':s.angle===null?'null':s.angle,a,b]);
}
/** Shared triangulation boundaries belong to one displayed crease, not two. */
function appendPreview(out:DiagramFoldPreviewSegment[],part:DiagramFoldPreviewSegment,prepared:Prepared){
  const candidate:Segment={id:'preview',a:part.a,b:part.b,assignment:part.assignment,angle:defaultAngle(part.assignment)};
  const prior=out.filter(p=>p.face===part.face&&p.assignment===part.assignment&&p.visibility===part.visibility&&p.style===part.style&&p.existing===part.existing&&p.unfolding===part.unfolding).map(p=>({...candidate,a:p.a,b:p.b}));
  for(const piece of segmentPieces(candidate,prior,prepared.eps,prepared.budget))out.push({...part,a:piece.a,b:piece.b,...(part.strokeSpan?{strokeSpan:{length:part.strokeSpan.length,offset:part.strokeSpan.offset+distance(part.a,piece.a)}}:{})});
}
function uniqueIds(segments:Segment[],reserved:Iterable<string>=[]){const ids=new Set(reserved);return segments.map((s,i)=>{let id=s.id,index=0;while(ids.has(id))id=`${s.id}~link-${i}-${++index}`;ids.add(id);return id===s.id?s:{...s,id};});}
/** Geometric subtraction preserves differently assigned hand-authored creases. */
export function subtractDiagramFoldSegments(doc:Doc,segments:Segment[],matchAssignments=true):Doc {
  ordinary(doc);if(!segments.length)return doc;
  validateDoc({name:'联动扣除',paper:doc.paper,segments:uniqueIds(segments)});
  const budget=new DiagramWorkCounter(),eps=epsilonFor(doc),next=uniqueIds(doc.segments.flatMap(s=>segmentPieces(s,segments,eps,budget,matchAssignments)));
  return {...doc,segments:next};
}
/** Reassign existing physical crease coverage without retaining a conflicting duplicate. */
export function applyDiagramFoldSegments(doc:Doc,segments:Segment[]):Doc {
  ordinary(doc);if(!segments.length)return doc;
  if(segments.some(s=>!['M','V','U','F'].includes(s.assignment)))throw Error('联动赋型只支持山折、谷折、未指派或展开线；纸边与辅助线保持独立。');
  validateDoc({name:'联动折痕',paper:doc.paper,segments:uniqueIds(segments)});
  const base=subtractDiagramFoldSegments(doc,segments,false),budget=new DiagramWorkCounter(),added:Segment[]=[];
  for(const s of segments)added.push(...segmentPieces(s,added,epsilonFor(doc),budget));
  const next={...base,segments:[...base.segments,...uniqueIds(added,base.segments.map(s=>s.id))]};validateDoc(next);return next;
}
/** IDs and segmentation do not constitute a CP change; geometry and fold semantics do. */
function diffSourceSegments(before:Doc,after:Doc):SourceSegment[]{
  ordinary(before);ordinary(after);const budget=new DiagramWorkCounter(),eps=Math.max(epsilonFor(before),epsilonFor(after)),out:SourceSegment[]=[],covered:Segment[]=[];
  const unchanged=new Set(before.segments.map(sameSegmentKey));
  for(const source of after.segments){
    if(unchanged.has(sameSegmentKey(source)))continue;
    for(const piece of segmentPieces(source,before.segments,eps,budget))for(const s of segmentPieces(piece,covered,eps,budget)){out.push({s,source});covered.push(s);}
  }
  return out;
}
export function diffDiagramFoldCP(before:Doc,after:Doc):Segment[]{
  return uniqueIds(diffSourceSegments(before,after).map(item=>item.s));
}
/** Preserve input assignments while retaining only covered physical geometry.
 * This lets M/V illustration intent follow authoritative F/0° CP segments. */
function intersectSourceSegments(doc:Doc,segments:Segment[],coverage:Segment[]):SourceSegment[]{
  ordinary(doc);if(!segments.length||!coverage.length)return [];
  validateDoc({name:'折痕覆盖',paper:doc.paper,segments:uniqueIds([...segments,...coverage])});
  const budget=new DiagramWorkCounter(),eps=epsilonFor(doc),out:SourceSegment[]=[],covered:Segment[]=[];
  for(const source of segments){
    const outside=segmentPieces(source,coverage,eps,budget,false);
    for(const part of segmentPieces(source,outside,eps,budget,false))for(const s of segmentPieces(part,covered,eps,budget)){out.push({s,source});covered.push(s);}
  }
  return out;
}
export function intersectDiagramFoldSegments(doc:Doc,segments:Segment[],coverage:Segment[]):Segment[]{
  return uniqueIds(intersectSourceSegments(doc,segments,coverage).map(item=>item.s));
}
/** Keep directed F presses and same-direction, unchanged old MV excursions.
 * A newly established actual fold is never turned into a press-and-return by
 * a coincident instruction. Geometry coverage, not IDs/subdivisions, decides. */
export function retainDiagramPrecreaseIntents(before:Doc,after:Doc,intents:Segment[]):Segment[]{
  const retained=intersectDiagramFoldSegments(after,intents,after.segments.filter(s=>s.assignment==='F'&&s.angle===0));
  for(const assignment of ['M','V'] as const){
    // An out-and-return operation may retain an explicit partial old angle,
    // but must not infer an excursion from null or a different target angle.
    const angles=new Set(before.segments.filter(s=>s.assignment===assignment&&typeof s.angle==='number'&&Number.isFinite(s.angle)&&Math.abs(s.angle)<=180&&s.angle*(assignment==='M'?-1:1)>0).map(s=>s.angle!));
    for(const angle of angles){
      const matching=(s:Segment)=>s.assignment===assignment&&s.angle===angle;
      const unchanged=intersectDiagramFoldSegments(after,before.segments.filter(matching),after.segments.filter(matching));
      retained.push(...intersectDiagramFoldSegments(after,intents.filter(matching),unchanged));
    }
  }
  return uniqueIds(retained);
}
export function mapDiagramFoldLines(pose:DiagramPose,lines:DiagramLineAnnotation[],settings:DiagramFoldLinkSettings,source?:DiagramCPState):{segments:Segment[];preview:DiagramFoldPreviewSegment[];warnings:string[];precreases:Segment[]} {
  const prepared=prepare(pose,source,true),selected=new Set(settings.selectedFaces),segments:Segment[]=[],precreases:Segment[]=[],preview:DiagramFoldPreviewSegment[]=[];
  // Completed folds belong to the before state. A new drawing instruction may
  // touch their two oppositely oriented material banks, but must neither
  // reassign that historical hinge nor map it twice as conflicting M/V. Use
  // physical CP coverage after inverse projection: another sheet at the same
  // screen coordinates is still a distinct, eligible part of the new fold.
  // Explicit press-and-return instructions keep their existing old-hinge path.
  if(lines.length&&settings.layers==='selected'&&settings.selectedFaces.some(f=>!prepared.pieces[f]?.length))throw Error('所选纸面正对视线侧立，请调整空间视角后画折痕。');
  const completed=pose.spatial?completedSpatialCreases(pose):pose.sourceDoc.segments.filter(s=>(s.assignment==='M'||s.assignment==='V')&&s.angle!==0);
  const boundaries=pose.sourceDoc.segments.filter(s=>s.assignment==='B');
  let skippedCompleted=false,skippedBoundary=false;
  if(!['all','top','selected'].includes(settings.layers)||[...selected].some(f=>!Number.isInteger(f)||f<0||f>=prepared.faces.length))throw Error('联动纸层选择无效，请重新选择。');
  if(settings.layers==='selected'&&!selected.size)throw Error('请先选择参与本步折叠的纸面。');
  for(const line of lines){
    if(line.style!=='valley'&&line.style!=='mountain')continue;pointCheck(line.a);pointCheck(line.b);if(distance(line.a,line.b)<=prepared.eps)continue;
    const displayAssignment=line.style==='valley'?'V':'M',assignments=new Map(prepared.faces.map((_,face)=>[face,displayAssignment as Assignment]));
    // Automatic picking follows the visible paper. Explicit saved ownership
    // and the all-layer operation remain physical scopes, so hiding a sheet
    // never silently deletes or reassigns an already bound crease.
    const parts=previewLine(prepared,line,assignments,false,undefined,settings.layers==='top');
    if(settings.layers==='top'&&parts.some(part=>part.visibility==='unknown'))throw Error('当前遮挡层序尚未确认，不能自动确定上层；请改选全部纸层或指定纸面。');
    // Visibility chooses material faces, not cut-off intervals. Once chosen,
    // the whole finite stroke on that same face also folds behind other paper.
    const topFaces=settings.layers==='top'?new Set(parts.filter(part=>part.visibility==='visible').map(part=>part.face)):undefined;
    for(const part of parts){
      if(settings.layers==='selected'&&!selected.has(part.face))continue;
      if(topFaces&&!topFaces.has(part.face))continue;
      const matrix=prepared.displayMatrices[part.face]??prepared.pieces[part.face].find(piece=>contains(lerp(part.a,part.b,.5),piece.shown,prepared.eps))?.matrix;
      if(!matrix)throw Error('当前图示没有可对应的材料纸面，请重新计算折图。');
      const back=inverse(matrix),assignment=screenAssignment(displayAssignment,matrix),a=applyDiagramFoldMatrix(back,part.a),b=applyDiagramFoldMatrix(back,part.b);
      const magnitude=line.foldAngle===undefined?180:line.foldAngle;
      if(magnitude!==null&&(!Number.isFinite(magnitude)||magnitude<0||magnitude>180))throw Error('折叠角度须为 0 到 180 度。');
      const intent:Segment={id:`fold-link:${line.id}:${part.face}:${segments.length}`,a,b,assignment,angle:magnitude===null?null:assignment==='M'?-magnitude:magnitude};
      if(magnitude===null&&line.foldAction==='precrease')throw Error('预折后展开需要明确折角，请指定角度后再预折。');
      const precrease=line.foldAction==='precrease',candidate:Segment=precrease?{...intent,assignment:'F',angle:0}:intent;
      const unfolded=precrease||!completed.length?[candidate]:segmentPieces(candidate,completed,prepared.eps,prepared.budget,false);
      const clippedToCompleted=unfolded.length!==1||distance(unfolded[0].a,a)>prepared.eps||distance(unfolded[0].b,b)>prepared.eps;
      // A paper edge is not a hinge, even for a press-and-return instruction.
      // Clip in source CP coordinates, after choosing material faces, so a
      // coincident interior crease on another layer remains eligible.
      const uncovered=boundaries.length?unfolded.flatMap(piece=>segmentPieces(piece,boundaries,prepared.eps,prepared.budget,'geometry')):unfolded;
      const clippedToBoundary=uncovered.length!==unfolded.length||uncovered.some((piece,i)=>distance(piece.a,unfolded[i].a)>prepared.eps||distance(piece.b,unfolded[i].b)>prepared.eps);
      const clippedToProtected=clippedToCompleted||clippedToBoundary,pieces=clippedToProtected?uncovered:[candidate];
      if(clippedToCompleted)skippedCompleted=true;
      if(clippedToBoundary)skippedBoundary=true;
      for(const piece of pieces){
        segments.push(...segmentPieces(piece,segments,prepared.eps,prepared.budget));
        const clipped=clippedToProtected?{...part,a:applyDiagramFoldMatrix(matrix,piece.a),b:applyDiagramFoldMatrix(matrix,piece.b)}:part;
        const marked=precrease?{...clipped,assignment:'F' as const,style:line.style,existing:false,foldAngle:magnitude}:{...clipped,foldAngle:magnitude};
        preview.push(part.strokeSpan?{...marked,strokeSpan:{length:part.strokeSpan.length,offset:part.strokeSpan.offset+distance(part.a,clipped.a)}}:marked);
        if(precrease)precreases.push(...segmentPieces({...intent,id:piece.id,a:piece.a,b:piece.b},precreases,prepared.eps,prepared.budget));
      }
      
    }
  }
  const warnings=prepared.displayFallback?['按当前绘图顺序确定上层，实际层序尚未确认。']:preview.some(p=>p.visibility==='unknown')?['部分折线的遮挡层序尚未确认。']:[];
  if(skippedCompleted)warnings.push('已跳过与操作前已完成折叠的折痕重合的部分，原有折叠保持不变。');
  if(skippedBoundary)warnings.push('已跳过与纸张边界重合的部分，原有纸边保持不变。');
  return {segments:uniqueIds(segments,pose.sourceDoc.segments.map(s=>s.id)),precreases:uniqueIds(precreases),preview,warnings};
}
/** A shared indexed source boundary can continue a stroke; coincident screen
 * coordinates alone never establish material identity. */
function sameStrokeMaterial(prepared:Prepared,left:ProjectedStroke[],right:ProjectedStroke[],point:Point):boolean {
  for(const a of left)for(const b of right){
    prepared.budget.tick();if(a.face===b.face)return true;
    const ar=[prepared.faces[a.face],...prepared.holes[a.face]],br=[prepared.faces[b.face],...prepared.holes[b.face]],other=new Set(br.flat());
    for(const ring of ar)for(let i=0;i<ring.length;i++){
      prepared.budget.tick();const u=ring[i],v=ring[(i+1)%ring.length];
      if(other.has(u)&&distance(prepared.cp[u],point)<=prepared.eps)return true;
      if(other.has(u)&&other.has(v)&&onSegment(point,{a:prepared.cp[u],b:prepared.cp[v]},prepared.eps)&&br.some(row=>row.some((w,j)=>w===u&&row[(j+1)%row.length]===v||w===v&&row[(j+1)%row.length]===u)))return true;
    }
  }
  return false;
}
function projectedStrokePart(piece:ProjectedStroke,lo:number,hi:number):Line {
  return {a:lerp(piece.line.a,piece.line.b,(lo-piece.lo)/(piece.hi-piece.lo)),b:lerp(piece.line.a,piece.line.b,(hi-piece.lo)/(piece.hi-piece.lo))};
}
/** Integrate the displayed arc before visibility clips. Atomic CP intervals
 * count shared triangle/face seams once, including non-isometric bends. */
function setProjectedStrokeSpans(prepared:Prepared,source:Segment,pieces:ProjectedStroke[],perFace=false){
  if(!pieces.length)return;
  const sourceLength=distance(source.a,source.b),breaks=sortedBreaks(pieces.flatMap(p=>[p.lo,p.hi]),sourceLength,prepared.eps);
  type Run={length:number};
  type Atom={lo:number;hi:number;line:Line;owners:ProjectedStroke[];run:Run;offset:number};
  const atoms:Atom[]=[];let previous:Atom|undefined;
  for(let i=1;i<breaks.length;i++){
    const lo=breaks[i-1],hi=breaks[i],mid=(lo+hi)/2;prepared.budget.tick(pieces.length);
    const owners=pieces.filter(p=>mid>p.lo&&mid<p.hi);if(!owners.length)continue;
    const line=projectedStrokePart(owners[0],lo,hi);
    const agrees=owners.every(piece=>{prepared.budget.tick();const other=projectedStrokePart(piece,lo,hi);return distance(line.a,other.a)<=prepared.eps&&distance(line.b,other.b)<=prepared.eps;});
    if(!agrees){
      // A pulled bank can have a distinct illustration on either side of the
      // same CP interval. Do not invent one arc by choosing a screen overlap.
      if(!perFace){const faces=new Set(pieces.map(p=>p.face));for(const face of faces)setProjectedStrokeSpans(prepared,source,pieces.filter(p=>p.face===face),true);}
      else for(const piece of pieces)piece.strokeSpan={length:distance(piece.line.a,piece.line.b),offset:0};
      return;
    }
    const continuous=previous&&(lo-previous.hi)*sourceLength<=prepared.eps&&distance(previous.line.b,line.a)<=prepared.eps&&sameStrokeMaterial(prepared,previous.owners,owners,lerp(source.a,source.b,lo));
    const run=continuous?previous!.run:{length:0},atom:Atom={lo,hi,line,owners,run,offset:run.length};run.length+=distance(line.a,line.b);atoms.push(atom);previous=atom;
  }
  for(const atom of atoms)for(const piece of atom.owners)if(!piece.strokeSpan)piece.strokeSpan={length:atom.run.length,offset:atom.offset};
}
function projectSourceStroke(prepared:Prepared,source:Segment):ProjectedStroke[]{
  const pieces:ProjectedStroke[]=[];
  for(let face=0;face<prepared.faces.length;face++)for(const piece of prepared.pieces[face])for(const [lo,hi] of clipFace(source,piece.cp,piece.cpHoles??[],prepared.eps,prepared.budget)){
    pieces.push({face,lo,hi,matrix:piece.matrix,line:{a:applyDiagramFoldMatrix(piece.matrix,lerp(source.a,source.b,lo)),b:applyDiagramFoldMatrix(piece.matrix,lerp(source.a,source.b,hi))}});
  }
  setProjectedStrokeSpans(prepared,source,pieces);return pieces;
}
/** Display CP creases on a safe piecewise-affine illustration. This never edits
 * the CP; drawing new physical creases and fixing the next fold remain rigid. */
export function projectDiagramFoldCP(pose:DiagramPose,before:Doc,after:Doc,source?:DiagramCPState,precreases:Segment[]=[]):{preview:DiagramFoldPreviewSegment[];warnings:string[]} {
  const prepared=prepare(pose,source),changed=diffSourceSegments(before,after),preview:DiagramFoldPreviewSegment[]=[];
  const beforeGraph=buildDiagramPoseDocFold(before,pose).graph;
  if(JSON.stringify(beforeGraph.faces_vertices)!==JSON.stringify(prepared.faces)||JSON.stringify(beforeGraph.vertices_coords)!==JSON.stringify(prepared.baseCP))throw Error('本步操作前 CP 与主图纸面不一致，请重新计算操作前折图。');
  const flat=after.segments.filter(s=>s.assignment==='F'),pending=intersectSourceSegments(after,precreases,flat),pendingSegments=pending.map(item=>item.s);
  // A fold opened to F has no new CP geometry. Retain its old material M/V
  // identity, then map it through each paper face's current visible side.
  const changedFlat=changed.filter(item=>item.s.assignment==='F').map(item=>item.s);
  const unfolding=(['M','V'] as const).flatMap(from=>intersectSourceSegments(after,changedFlat,before.segments.filter(s=>s.assignment===from))
    .map(item=>({...item,unfoldFrom:from})));
  const openingSegments=unfolding.map(item=>item.s);
  const pendingDisplay=pending.flatMap(item=>segmentPieces(item.s,openingSegments,prepared.eps,prepared.budget,false).map(s=>({...item,s})));
  const existing=flat.flatMap(source=>segmentPieces(source,[...pendingSegments,...openingSegments],prepared.eps,prepared.budget,false).map(s=>({s,source})));
  const lines:(SourceSegment&{existing?:boolean;unfoldFrom?:'M'|'V'})[]=[...changed.filter(item=>['M','V','U'].includes(item.s.assignment)),
    ...existing.map(item=>({...item,existing:true})),...pendingDisplay.map(item=>({...item,existing:false})),...unfolding.map(item=>({...item,existing:true}))],projected=new Map<Segment,ProjectedStroke[]>();
  for(const item of lines){const {s}=item,parent=item.source;
    let pieces=projected.get(parent);if(!pieces){pieces=projectSourceStroke(prepared,parent);projected.set(parent,pieces);}
    const start=parameter(s.a,parent),end=parameter(s.b,parent);
    for(const piece of pieces){
      const lo=Math.max(start,piece.lo),hi=Math.min(end,piece.hi);if((hi-lo)*distance(parent.a,parent.b)<=prepared.eps)continue;
      const f=piece.face,matrix=piece.matrix,line=projectedStrokePart(piece,lo,hi),span=piece.strokeSpan&&{length:piece.strokeSpan.length,offset:piece.strokeSpan.offset+distance(piece.line.a,line.a)};
      const assignment=screenAssignment(s.assignment,matrix);
      for(const part of previewLine(prepared,line,new Map([[f,assignment]]),true,span)){
        const opened=item.unfoldFrom?screenAssignment(item.unfoldFrom,matrix):undefined;
        const marked=item.existing!==undefined?{...part,assignment:'F' as const,existing:item.existing,
          ...(opened?{unfolding:true}:{}),
          style:opened?(opened==='M'?'mountain' as const:'valley' as const):item.existing?'crease' as const:assignment==='V'?'valley' as const:'mountain' as const}:part;
        appendPreview(preview,{...marked,...(!item.existing?{foldAngle:s.angle===null?null:Math.abs(s.angle)}:{})},prepared);
      }
      
    }
  }
  return {preview,warnings:prepared.displayFallback?['按当前绘图顺序确定上层，实际层序尚未确认。']:preview.some(p=>p.visibility==='unknown')?['部分折线的遮挡层序尚未确认。']:[]};
}
/** Face IDs identify source CP paper; fallback numbering is never an occlusion certificate. */
export function diagramFoldFacesAtPoint(pose:DiagramPose,point:Point,source?:DiagramCPState):number[]{
  pointCheck(point);const prepared=prepare(pose,source),hits=prepared.faces.flatMap((_,f)=>diagramFaceVisible(pose,f)&&containsFace(prepared,f,point)?[f]:[]);return order(prepared,hits)??hits;
}
export function pickDiagramFoldAnchor(pose:DiagramPose,point:Point,face?:number,source?:DiagramCPState):DiagramFoldAnchor {
  pointCheck(point);const prepared=prepare(pose,source,true),hits=prepared.faces.flatMap((_,f)=>diagramFaceVisible(pose,f)&&containsFace(prepared,f,point)?[f]:[]),sorted=order(prepared,hits);
  const chosen=face??sorted?.[0];if(chosen===undefined||!hits.includes(chosen))throw Error(hits.length?'重合纸面缺少确定层序，请明确选择固定纸面。':'请在要保持不动的纸面内部点击。');
  const display=prepared.displayMatrices[chosen]??prepared.pieces[chosen].find(piece=>contains(point,piece.shown,prepared.eps))?.matrix;
  if(!display||!prepared.matrices[chosen])throw Error('无法对应固定纸面的原始位置。');
  const cpPoint=applyDiagramFoldMatrix(inverse(display),point);return {point:cpPoint,matrix:[...prepared.matrices[chosen]!],...(pose.spatial?{spatialTransform:structuredClone(pose.spatial.faceTransforms[chosen])}:{})};
}
export function diagramFoldStartingFace(doc:Doc,fixed:DiagramFoldAnchor,graph:FoldGraph=buildDiagramFold(doc).graph):number {
  ordinary(doc);pointCheck(fixed.point);
  if(fixed.spatialTransform){rigidSpatialTransform(fixed.spatialTransform);if(!Array.isArray(fixed.matrix)||fixed.matrix.length!==6||fixed.matrix.some(n=>!Number.isFinite(n)||Math.abs(n)>1_000_000))throw Error('固定纸面的投影变换无效。');inverse(fixed.matrix);}
  else rigidMatrix(fixed.matrix);
  const eps=epsilonFor(doc),faces=graph.faces_vertices??[];
  const hits=faces.flatMap((face,f)=>contains(fixed.point,face.map(v=>graph.vertices_coords[v]),eps,true)?[f]:[]);
  if(hits.length!==1)throw Error('固定点位于新折痕或纸面边界，请在固定侧纸面内部重新指定。');
  if(fixed.target?.kind==='vertex'&&!contains(fixed.target.point,faces[hits[0]].map(v=>graph.vertices_coords[v]),eps))throw Error('新折痕分开了固定顶点与参考纸面，请重新选择该顶点的邻接纸面。');
  return hits[0];
}
/** Place the new root in the previous face pose, including its genuine front/back parity. */
export function alignDiagramFoldResult(doc:Doc,result:FlatFoldResult,fixed:DiagramFoldAnchor):FlatFoldResult {
  if(fixed.spatialTransform)throw Error('空间固定姿态需要按真实折角计算，不能用二维平折结果替代。');
  const graph=buildDiagramPoseDocFold(doc,{result}).graph,face=diagramFoldStartingFace(doc,fixed,graph),cp=graph.vertices_coords;
  if(result.geometry.status!=='ready'||JSON.stringify(result.geometry.faces)!==JSON.stringify(graph.faces_vertices)||result.geometry.vertices.length!==cp.length)throw Error('新折图与当前 CP 的纸面身份不一致，无法保持固定侧。');
  result.geometry.vertices.forEach(pointCheck);const old=faceMatrix(cp,result.geometry.vertices,result.geometry.faces[face],epsilonFor(doc),new DiagramWorkCounter()),transform=compose(fixed.matrix,inverse(old)),next=structuredClone(result);
  next.geometry.vertices=result.geometry.vertices.map(p=>{const q=applyDiagramFoldMatrix(transform,p);pointCheck(q);return q;});
  next.geometry.graph={...structuredClone(result.geometry.graph??graph),vertices_coords:structuredClone(next.geometry.vertices)};
  delete next.geometry.graph.faces_matrix;delete next.geometry.graph.faces_matrix2;delete next.geometry.graph.faces_normal;delete next.geometry.graph.faceOrders;
  if(det(transform)<0){next.layers={status:'unknown',message:'已保持固定侧的正背姿态，需重新分析反射后的层序。',...(next.layers.constraints?{constraints:structuredClone(next.layers.constraints)}:{}),...(next.layers.relativeConstraints?{relativeConstraints:next.layers.relativeConstraints.map(({below,above})=>({below:above,above:below}))}:{})};}
  return next;
}
