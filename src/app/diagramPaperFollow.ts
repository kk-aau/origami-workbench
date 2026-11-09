import {diagramDepthActive} from './diagramDepth';
import {epsilonFor} from '../core/geometry';
import type {Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import {DIAGRAM_ANNOTATION_LIMITS,validateDiagramAnnotations,isDiagramCPExistingLine,type DiagramAnnotation,type DiagramLineAnnotation} from './diagramAnnotations';
import {modelProjection} from './modelProjection';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {alignDiagramPaperAnchors} from './diagramPaperDeformation';
import {resolveDiagramArrowBinding} from './diagramPaperBinding';

interface Triangle {face:number;old:Point[];next:Point[];den:number}
interface Span {lo:number;hi:number;triangle:Triangle}
interface Piece {lo:number;hi:number;a:Point;b:Point;faces?:number[]}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const along=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const faceKey=(faces?:number[])=>faces?.join(',')??'outside';

/** Clip in the old drawing, then keep the same barycentric position on the
 * original material triangle. These maps may bend a line across triangles. */
function clip(a:Point,b:Point,triangle:Triangle,eps:number):[number,number]|null {
  let lo=0,hi=1;const sign=Math.sign(triangle.den);
  for(let i=0;i<3;i++){
    const p=triangle.old[i],q=triangle.old[(i+1)%3],start=sign*cross(p,q,a),end=sign*cross(p,q,b),delta=end-start,tolerance=eps*Math.max(eps,distance(p,q));
    if(Math.abs(delta)<=tolerance){if(start< -tolerance)return null;continue;}
    const t=-start/delta;if(delta>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [Math.max(0,lo),Math.min(1,hi)];
}
function mapped(point:Point,triangle:Triangle):Point {
  const [a,b,c]=triangle.old,wb=cross(a,point,c)/triangle.den,wc=cross(a,b,point)/triangle.den,wa=1-wb-wc;
  const result:Point=[wa*triangle.next[0][0]+wb*triangle.next[1][0]+wc*triangle.next[2][0],wa*triangle.next[0][1]+wb*triangle.next[1][1]+wc*triangle.next[2][1]];
  if(!result.every(Number.isFinite))throw Error('纸面退化，折线无法安全跟随，请恢复纸面后重试。');
  return result;
}
function nearBox(a:Point,b:Point,points:Point[],eps:number):boolean {
  return [0,1].every(axis=>Math.max(a[axis],b[axis])+eps>=Math.min(...points.map(p=>p[axis]))&&Math.min(a[axis],b[axis])-eps<=Math.max(...points.map(p=>p[axis])));
}
function hash(text:string):string {
  let value=2166136261;for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);return (value>>>0).toString(36);
}
function pieceId(original:string,piece:Piece,ids:Set<string>):string {
  const key=hash(JSON.stringify([original,piece.faces??null,Number(piece.lo.toPrecision(12)),Number(piece.hi.toPrecision(12))]));
  let attempt=0,id:string;do{const suffix=`:paper:${key}${attempt?':'+attempt:''}`;id=original.slice(0,256-suffix.length)+suffix;attempt++;}while(ids.has(id));
  ids.add(id);return id;
}

/** Follow illustration lines during a vertex edit without changing any CP.
 * Call with two poses of the exact same source snapshot. Linked mountain/
 * valley creases should instead be projected from CP by the caller. Inherited
 * F handles remain untouched until the caller reprojects their CP routes.
 * Unbound symbols remain independent. Attached arrows resolve from their saved
 * material coordinates rather than being rebound as user placement edits. */
export function followDiagramPaperAnnotations(previousPose:DiagramPose,nextPose:DiagramPose,annotations:DiagramAnnotation[],includeExistingCreases=false):DiagramAnnotation[] {
  validateDiagramAnnotations(annotations);
  if(previousPose.sourceStateId!==nextPose.sourceStateId||previousPose.sourceRevision!==nextPose.sourceRevision||!same(previousPose.sourceDoc,nextPose.sourceDoc))throw Error('折线跟随要求相同的来源 CP，不能跨步骤猜测纸面身份。');
  const [oldPose,newPose]=alignDiagramPaperAnchors(previousPose,nextPose),oldMesh=diagramIllustrationMesh(oldPose),newMesh=diagramIllustrationMesh(newPose);
  const {baseGraph,graph,triangles:sourceTriangles}=oldMesh,oldGeometry=oldPose.result.geometry,newGeometry=newPose.result.geometry;
  for(const geometry of [oldGeometry,newGeometry])if(geometry.status!=='ready'||geometry.vertices.length!==baseGraph.vertices_coords.length||!same(geometry.faces,baseGraph.faces_vertices))throw Error('折图缺少一致的原纸面身份，无法跟随折线。');
  if(!same(baseGraph,newMesh.baseGraph)||!same(graph.vertices_coords,newMesh.graph.vertices_coords)||!same(sourceTriangles,newMesh.triangles))throw Error('折图缺少一致的原纸面身份，无法跟随折线。');
  const oldProjection=modelProjection(oldGeometry.vertices,previousPose.view?.side==='back',previousPose.view?.rotation??0,previousPose.view?.projectionCenter),newProjection=modelProjection(newGeometry.vertices,nextPose.view?.side==='back',nextPose.view?.rotation??0,nextPose.view?.projectionCenter);
  const oldShown=oldMesh.vertices.map(oldProjection.project),newShown=newMesh.vertices.map(newProjection.project);
  if(same(oldShown,newShown))return annotations;
  const eps=epsilonFor(previousPose.sourceDoc),triangles:Triangle[]=[],degenerate:{face:number;points:Point[]}[]=[];
  for(let face=0;face<(graph.faces_vertices?.length??0);face++)for(const indices of sourceTriangles[face]){
    const old=indices.map(v=>oldShown[v]),next=indices.map(v=>newShown[v]),den=cross(old[0],old[1],old[2]),scale=Math.max(...old.map((p,i)=>distance(p,old[(i+1)%3])));
    if(Math.abs(den)<=eps*Math.max(eps,scale)){degenerate.push({face,points:old});continue;}
    triangles.push({face,old,next,den});
  }
  const ids=new Set(annotations.map(a=>a.id));let comparisons=0;
  const tick=()=>{if(++comparisons>500_000)throw Error('纸面与折线对应关系过多，请减少本步骤绘图对象后重试。');};
  const result:DiagramAnnotation[]=[];
  for(const annotation of annotations){
    if(annotation.kind==='symbol'&&annotation.paperBinding){result.push(resolveDiagramArrowBinding(nextPose,annotation).annotation);continue;}
    if(annotation.kind!=='line'||!includeExistingCreases&&isDiagramCPExistingLine(annotation)){result.push(annotation);continue;}
    const selected=annotation.foldFaces?new Set(annotation.foldFaces):null,length=distance(annotation.a,annotation.b),tolerance=Math.min(1e-7,eps/Math.max(eps,length));
    if(selected&&[...selected].some(f=>f>=(graph.faces_vertices?.length??0)))throw Error('折线依附的原纸面不存在，请重新计算折图。');
    if(degenerate.some(t=>(!selected||selected.has(t.face))&&nearBox(annotation.a,annotation.b,t.points,eps)))throw Error('折线经过退化纸面，无法安全跟随，请恢复纸面后重试。');
    const spans:Span[]=[],cuts=[0,1];
    for(const triangle of triangles){
      if(selected&&!selected.has(triangle.face))continue;
      tick();
      if(!nearBox(annotation.a,annotation.b,triangle.old,eps))continue;
      const range=clip(annotation.a,annotation.b,triangle,eps);if(!range||range[1]-range[0]<=tolerance)continue;
      spans.push({lo:range[0],hi:range[1],triangle});cuts.push(...range);
    }
    if(!spans.length){result.push(annotation);continue;}
    const stops:number[]=[],pieces:Piece[]=[];
    for(const cut of cuts.sort((a,b)=>a-b))if(!stops.length||cut-stops.at(-1)!>tolerance)stops.push(cut);
    for(let i=1;i<stops.length;i++){
      const lo=stops[i-1],hi=stops[i],mid=(lo+hi)/2;if(hi-lo<=tolerance)continue;
      const active=spans.filter(span=>{tick();return span.lo<=mid&&span.hi>=mid;}),a=along(annotation.a,annotation.b,lo),b=along(annotation.a,annotation.b,hi),unique:Piece[]=[];
      if(!active.length)unique.push({lo,hi,a,b,...(annotation.foldFaces?{faces:[...annotation.foldFaces]}:{})});
      for(const span of active){
        const ma=mapped(a,span.triangle),mb=mapped(b,span.triangle);
        if(distance(ma,mb)<=eps)throw Error('纸角修形将折线压缩为重合点，请恢复纸面后重试。');
        const existing=unique.find(piece=>{tick();return distance(piece.a,ma)<=eps&&distance(piece.b,mb)<=eps;});
        if(existing){if(!existing.faces!.includes(span.triangle.face))existing.faces!.push(span.triangle.face);}
        else unique.push({lo,hi,a:ma,b:mb,faces:[span.triangle.face]});
      }
      for(const piece of unique){
        piece.faces?.sort((a,b)=>a-b);
        const previous=[...pieces].reverse().find(prior=>{tick();return Math.abs(prior.hi-piece.lo)<=tolerance&&faceKey(prior.faces)===faceKey(piece.faces)&&distance(prior.b,piece.a)<=eps&&Math.abs(cross(prior.a,prior.b,piece.b))<=eps*Math.max(eps,distance(prior.a,piece.b))&&
          (prior.b[0]-prior.a[0])*(piece.b[0]-piece.a[0])+(prior.b[1]-prior.a[1])*(piece.b[1]-piece.a[1])>=-eps*eps;});
        if(previous){previous.hi=hi;previous.b=piece.b;}else pieces.push(piece);
      }
    }
    pieces.sort((a,b)=>a.lo-b.lo||(a.faces?.[0]??-1)-(b.faces?.[0]??-1)||a.hi-b.hi);
    if(pieces.length===1&&distance(pieces[0].a,annotation.a)<=eps&&distance(pieces[0].b,annotation.b)<=eps){result.push(annotation);continue;}
    for(const [index,piece] of pieces.entries()){
      const {foldFaces:_oldFaces,...base}=annotation;
      const line:DiagramLineAnnotation={...base,id:index?pieceId(annotation.id,piece,ids):annotation.id,a:piece.a,b:piece.b,...(piece.faces?{foldFaces:piece.faces}:{})};
      result.push(line);
    }
  }
  validateDiagramAnnotations(result);return result;
}

/** Layer changes can move cosmetic relief while physical geometry stays put. */
export function followDiagramDepthAnnotations(previous:DiagramPose,next:DiagramPose,annotations:DiagramAnnotation[]):DiagramAnnotation[] {
  // Reopened snapshots retain authored display coordinates while their layer
  // certificate is revalidated. Do not apply their saved relief a second time.
  if(previous.result.layers.status!=='solved')return annotations;
  return diagramDepthActive(previous)||diagramDepthActive(next)?followDiagramPaperAnnotations(previous,next,annotations,true):annotations;
}
