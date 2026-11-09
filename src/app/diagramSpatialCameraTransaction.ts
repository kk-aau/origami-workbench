import type {Point,FlatFoldResult,Segment} from '../core/types';
import {epsilonFor,polygonArea} from '../core/geometry';
import {updateDiagramPoseResult,updateDiagramAnnotations,validateDiagramProject,type DiagramProject,type DiagramPose} from './diagramProject';
import {isDiagramCPLine,type DiagramAnnotation,type DiagramLineAnnotation,type DiagramLineCameraSource} from './diagramAnnotations';
import {completedSpatialCreases,spatialFaceMatrix,validateDiagramSpatialPose,type DiagramSpatialPose} from './diagramSpatialPose';
import {modelProjection} from './modelProjection';
import {applyDiagramFoldMatrix,diffDiagramFoldCP} from './diagramFoldLink';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {resolveDiagramPaperBindings} from './diagramPaperBinding';
import {refreshDiagramFoldDrawing,isLinkedFoldLine} from './diagramFoldTransactions';
import {diagramPreviewSourceIds} from './diagramStationarySnapReferences';
import {defaultDiagramStrokePattern} from './diagramLineStyles';

type Span=DiagramLineCameraSource['spans'][number];
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const lerp=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const linked=(a:DiagramAnnotation):a is DiagramLineAnnotation=>a.kind==='line'&&(isDiagramCPLine(a)||isLinkedFoldLine(a))&&a.foldFaces?.length!==0;

function materialProjection(pose:DiagramPose,face:number){
  const m=spatialFaceMatrix(pose.spatial!,face),view=modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter);
  const project=(p:Point)=>view.project(applyDiagramFoldMatrix(m,p));
  const o=project([0,0]),x=project([1,0]),y=project([0,1]),a=x[0]-o[0],b=x[1]-o[1],c=y[0]-o[0],d=y[1]-o[1],det=a*d-b*c;
  return {project,det,inverse:Math.abs(det)>1e-10?(p:Point):Point=>{const dx=p[0]-o[0],dy=p[1]-o[1];return [(d*dx-c*dy)/det,(-b*dx+a*dy)/det];}:null};
}
function assignment(style:DiagramLineAnnotation['style'],det:number):Span['assignment']{
  const kind=style==='mountain'?'M':style==='valley'?'V':style==='crease'?'F':'U';
  return det<0?(kind==='M'?'V':kind==='V'?'M':kind):kind;
}
function displayStyle(kind:Span['assignment'],det:number):DiagramLineAnnotation['style']{
  const shown=det<0?(kind==='M'?'V':kind==='V'?'M':kind):kind;
  return shown==='M'?'mountain':shown==='V'?'valley':shown==='F'?'crease':'auxiliary';
}
function clipTriangle(line:Pick<Segment,'a'|'b'>,triangle:Point[],eps:number):[number,number]|null{
  const sign=Math.sign(polygonArea(triangle));let lo=0,hi=1;
  for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],v=sign*cross(a,b,line.a),w=sign*cross(a,b,line.b),delta=w-v,tolerance=eps*Math.max(eps,distance(a,b));
    if(Math.abs(delta)<=tolerance){if(v< -tolerance)return null;continue;}
    const t=-v/delta;if(delta>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }
  return hi>lo?[Math.max(0,lo),Math.min(1,hi)]:null;
}

/** Recover legacy side-on handles by forward-projecting authoritative CP
 * spans. No inverse of a singular screen transform is used. */
function legacySideOnSpans(pose:DiagramPose,line:DiagramLineAnnotation,face:number,sources:readonly Segment[],eps:number):Span[]{
  const mesh=diagramIllustrationMesh(pose),projection=materialProjection(pose,face),found:Span[]=[];
  const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],length=Math.hypot(dx,dy),at=(p:Point)=>((p[0]-line.a[0])*dx+(p[1]-line.a[1])*dy)/(length*length);
  for(const segment of sources){
    if(!['M','V','F','U'].includes(segment.assignment))continue;
    if(line.style==='crease'&&segment.assignment!=='F'||line.style==='auxiliary'&&segment.assignment!=='U'||['valley','mountain'].includes(line.style)&&!['M','V'].includes(segment.assignment))continue;
    const intervals=mesh.triangles[face].map(t=>clipTriangle(segment,t.map(v=>mesh.graph.vertices_coords[v]),eps)).filter((v):v is [number,number]=>!!v).sort((a,b)=>a[0]-b[0]);
    const joined:[number,number][]=[];for(const [a,b] of intervals){const prior=joined.at(-1);if(prior&&a<=prior[1]+1e-9)prior[1]=Math.max(prior[1],b);else joined.push([a,b]);}
    for(const [lo,hi] of joined){
      const a=lerp(segment.a,segment.b,lo),b=lerp(segment.a,segment.b,hi),pa=projection.project(a),pb=projection.project(b);
      if(distance(pa,pb)<=eps||[pa,pb].some(p=>Math.abs(cross(line.a,line.b,p))>eps*length))continue;
      const ta=at(pa),tb=at(pb),start=Math.max(0,Math.min(ta,tb)),end=Math.min(1,Math.max(ta,tb));if((end-start)*length<=eps)continue;
      const first=(start-ta)/(tb-ta),last=(end-ta)/(tb-ta);
      found.push({face,a:lerp(a,b,first),b:lerp(a,b,last),assignment:segment.assignment as Span['assignment']});
    }
  }
  return found;
}

function sourceSpans(pose:DiagramPose,line:DiagramLineAnnotation,sources:readonly Segment[],eps:number):Span[]{
  const saved=line.cameraSource;
  if(saved&&saved.stateId===pose.sourceStateId&&saved.revision===pose.sourceRevision&&saved.shownStyle===line.style&&distance(saved.shownA,line.a)<=eps&&distance(saved.shownB,line.b)<=eps&&saved.spans.every(span=>line.foldFaces?.includes(span.face)&&span.face<pose.result.geometry.faces.length)){
    // The displayed handle remains as metadata when its true projection is a
    // point; otherwise require the saved material and current ink to agree.
    if(saved.spans.every(span=>{const p=materialProjection(pose,span.face),a=p.project(span.a),b=p.project(span.b);return distance(a,b)<=eps||distance(a,line.a)<=eps&&distance(b,line.b)<=eps;}))return saved.spans;
  }
  const result:Span[]=[];
  for(const face of line.foldFaces??[]){
    if(face<0||face>=pose.result.geometry.faces.length)throw Error('折线依附的纸面不存在，未改变视角。');
    const p=materialProjection(pose,face);
    if(p.inverse)result.push({face,a:p.inverse(line.a),b:p.inverse(line.b),assignment:assignment(line.style,p.det)});
    else result.push(...legacySideOnSpans(pose,line,face,sources,eps));
  }
  if(!result.length&&line.foldFaces?.length)throw Error('侧立纸面的旧折线缺少可对应的 CP 位置，未改变视角；请先更新主图折痕。');
  return result;
}

function reprojectInk(previous:DiagramPose,next:DiagramPose,annotations:DiagramAnnotation[],sources:readonly Segment[]):DiagramAnnotation[]{
  const eps=epsilonFor(previous.sourceDoc),used=new Set(annotations.map(a=>a.id));
  return annotations.flatMap<DiagramAnnotation>(annotation=>{
    if(!linked(annotation)||!annotation.foldFaces?.length)return [annotation];
    const spans=sourceSpans(previous,annotation,sources,eps),groups:{a:Point;b:Point;style:DiagramLineAnnotation['style'];spans:Span[]}[]=[];
    for(const span of spans){
      const p=materialProjection(next,span.face),rawA=p.project(span.a),rawB=p.project(span.b),collapsed=distance(rawA,rawB)<=eps;
      const a=collapsed?annotation.a:rawA,b=collapsed?annotation.b:rawB,style=displayStyle(span.assignment,p.det);
      const found=groups.find(group=>group.style===style&&distance(group.a,a)<=eps&&distance(group.b,b)<=eps);
      if(found)found.spans.push(span);else groups.push({a,b,style,spans:[span]});
    }
    return groups.map((group,index)=>{
      let id=annotation.id;if(index){let serial=0;do{id=annotation.id.slice(0,205)+`:camera:${group.spans[0].face}:${serial++}`;}while(used.has(id));used.add(id);}
      const standard=annotation.strokePattern!==undefined&&!annotation.appearanceOverrides?.includes('strokePattern')&&annotation.strokePattern===defaultDiagramStrokePattern(annotation.style);
      return {...annotation,id,a:group.a,b:group.b,style:group.style,foldFaces:[...new Set(group.spans.map(s=>s.face))],...(standard?{strokePattern:defaultDiagramStrokePattern(group.style)}:{}),
        cameraSource:{stateId:previous.sourceStateId,revision:previous.sourceRevision,spans:group.spans,shownA:group.a,shownB:group.b,shownStyle:group.style}};
    });
  });
}

/** One atomic camera edit: source CP, physical transforms and fixed material
 * anchors cannot change, even when a newly exposed view has local cycles. */
export function applyDiagramSpatialCamera(project:DiagramProject,stepId:string,answer:{result:FlatFoldResult;spatial:DiagramSpatialPose}):DiagramProject{
  const original=project.steps.find(s=>s.id===stepId),pose=original?.pose;
  if(!original||!pose?.spatial||original.paperStates?.active==='pulled'||pose.paperDeformation?.nodes.length)throw Error('请先切换到未拖角的立体状态再转动视角。');
  const source=project.states.find(s=>s.id===pose.sourceStateId);
  if(!source||source.revision!==pose.sourceRevision||!same(source.doc,pose.sourceDoc))throw Error('来源 CP 已变化，未应用旧视角。');
  if(answer.result.layers.status!=='solved'||!same(answer.spatial.vertices,pose.spatial.vertices)||!same(answer.spatial.faceTransforms,pose.spatial.faceTransforms)||!same(answer.spatial.measuredAngles,pose.spatial.measuredAngles)||!same(answer.spatial.camera.frame,pose.spatial.camera.frame)||answer.result.geometry.startingFace!==pose.result.geometry.startingFace)throw Error('视角操作不能改变真实折角、纸面位置或固定面。');
  const after=project.states.find(s=>s.id===original.afterId)!;
  let next=updateDiagramPoseResult(project,stepId,answer.result,answer.spatial);
  let step=next.steps.find(s=>s.id===stepId)!;
  if(!answer.result.layers.faceOrder)delete step.pose!.displayOrder;
  if(step.pose!.view)step.pose!.view={...step.pose!.view,cameras:{}};
  // The public annotation transaction validates its input before cloning. Keep
  // the active snapshot in sync with the camera-only edits made above.
  if(step.paperStates){step.paperStates.active='spatial';step.paperStates.spatial=structuredClone(step.pose!);}
  validateDiagramSpatialPose(step.pose!,true);
  // Old completed hinges project as existing marks, not new M/V instructions.
  // In a side-on view they can coincide exactly with a newly authored stroke.
  const sources=[...diffDiagramFoldCP(pose.sourceDoc,after.doc),...after.doc.segments.filter(s=>s.assignment==='F'),...completedSpatialCreases(pose).map(s=>({...s,assignment:'F' as const,angle:0})),...(original.foldLink?.precreases??[])];
  const mapped=resolveDiagramPaperBindings(step.pose!,reprojectInk(pose,step.pose!,original.annotations??[],sources));
  next=updateDiagramAnnotations(next,stepId,mapped);
  if(original.foldLink?.enabled){
    // Rebuild newly visible CP routes while retaining authored handle identity,
    // long extents, local paint and timing on already known material spans.
    const rebuilt=refreshDiagramFoldDrawing(next,stepId),generated=rebuilt.steps.find(s=>s.id===stepId)!.annotations??[],retained=mapped.filter(linked),used=new Set(mapped.map(a=>a.id));
    const aliases=new Map<string,string>(),extra:DiagramAnnotation[]=[];
    for(const line of generated){
      if(!linked(line)){if(!mapped.some(a=>a.id===line.id))extra.push(line);continue;}
      const faces=(line.foldFaces??[]).filter(face=>!diagramPreviewSourceIds({...line,face},retained,epsilonFor(pose.sourceDoc)).length);
      if(!faces.length)continue;
      let id=line.id,serial=0;while(used.has(id))id=line.id.slice(0,220)+`:orbit:${serial++}`;used.add(id);aliases.set(line.id,id);extra.push({...line,id,foldFaces:faces});
    }
    const appended=extra.map(a=>a.kind==='line'&&a.animationTiming&&aliases.has(a.animationTiming.afterLineId)?{...a,animationTiming:{...a.animationTiming,afterLineId:aliases.get(a.animationTiming.afterLineId)!}}:a);
    next=updateDiagramAnnotations(next,stepId,[...mapped,...appended]);
  }
  step=next.steps.find(s=>s.id===stepId)!;
  if(step.paperStates){step.paperStates.active='spatial';step.paperStates.spatial=structuredClone(step.pose!);step.paperStates.spatialAnnotations=structuredClone(step.annotations??[]);}
  validateDiagramProject(next);
  return next;
}
