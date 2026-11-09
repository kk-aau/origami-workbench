import {DiagramWorkCounter} from './diagramWork';
import earcut from 'earcut';
import ear from 'rabbit-ear';
import {distance,epsilonFor,polygonArea} from '../core/geometry';
import {flatLayerEdges} from '../core/flatLayerOrder';
import type {Doc,FlatFoldResult,FoldGraph,Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import type {DiagramFoldAnchor,DiagramFoldMatrix} from './diagramFoldLinkTypes';
import {buildDiagramPoseDocFold,buildDiagramPoseFold} from './diagramFoldGeometry';
import {diagramFoldStartingFace,applyDiagramFoldMatrix} from './diagramFoldLink';
import {liftDiagramFoldMatrix,spatialFaceMatrix,validateDiagramSpatialPose} from './diagramSpatialPose';
import type {RigidFoldTransform3D} from '../core/rigidFoldGeometry';

/** A preference in the new geometry's material-face IDs and genuine +Z axis.
 * It is input to a fresh layer solve, never a saved drawing permutation. */
export interface DiagramLayerPreference {below:number;above:number}


function edgeDistance(p:Point,a:Point,b:Point):number{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return distance(p,[a[0]+t*dx,a[1]+t*dy]);
}
function contains(point:Point,ring:Point[],eps:number,budget:DiagramWorkCounter,strict=false):boolean{
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    budget.tick();const a=ring[j],b=ring[i];if(edgeDistance(point,a,b)<=eps)return !strict;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
function inFace(point:Point,graph:FoldGraph,face:number,eps:number,budget:DiagramWorkCounter,strict=false):boolean{
  return contains(point,graph.faces_vertices![face].map(v=>graph.vertices_coords[v]),eps,budget,strict)&&
    !(graph.faces_holes?.[face]??[]).some(ring=>contains(point,ring.map(v=>graph.vertices_coords[v]),eps,budget,!strict));
}
function triangles(graph:FoldGraph,face:number):number[][]{
  const rings=[graph.faces_vertices![face],...(graph.faces_holes?.[face]??[])],ids=rings.flat(),holes:number[]=[];
  let offset=rings[0].length;for(const ring of rings.slice(1)){holes.push(offset);offset+=ring.length;}
  const indices=earcut(ids.flatMap(v=>graph.vertices_coords[v]),holes,2);
  return Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).map(v=>ids[v]));
}
function faceMatrix(graph:FoldGraph,result:FlatFoldResult,face:number,eps:number,budget:DiagramWorkCounter):DiagramFoldMatrix|null{
  const ids=[graph.faces_vertices![face],...(graph.faces_holes?.[face]??[])].flat(),cp=graph.vertices_coords,shown=result.geometry.vertices;
  for(let j=1;j<ids.length;j++)for(let k=j+1;k<ids.length;k++){
    budget.tick();const [u,v,w]=[ids[0],ids[j],ids[k]],p=cp[u],q=cp[v],r=cp[w],det=(q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]);
    if(Math.abs(det)<=eps*eps)continue;
    const a=shown[u],b=shown[v],c=shown[w],xx=((b[0]-a[0])*(r[1]-p[1])-(c[0]-a[0])*(q[1]-p[1]))/det,
      xy=((c[0]-a[0])*(q[0]-p[0])-(b[0]-a[0])*(r[0]-p[0]))/det,
      yx=((b[1]-a[1])*(r[1]-p[1])-(c[1]-a[1])*(q[1]-p[1]))/det,
      yy=((c[1]-a[1])*(q[0]-p[0])-(b[1]-a[1])*(r[0]-p[0]))/det;
    const matrix:DiagramFoldMatrix=[xx,yx,xy,yy,a[0]-xx*p[0]-xy*p[1],a[1]-yx*p[0]-yy*p[1]];
    if(matrix.some(n=>!Number.isFinite(n))||Math.abs(xx*xx+yx*yx-1)>1e-6||Math.abs(xy*xy+yy*yy-1)>1e-6||Math.abs(xx*xy+yx*yy)>1e-6)return null;
    return ids.every(v=>{budget.tick();return distance(applyDiagramFoldMatrix(matrix,cp[v]),shown[v])<=eps*8;})?matrix:null;
  }return null;
}
function matricesMatch(a:DiagramFoldMatrix|null,b:DiagramFoldMatrix|null,eps:number):boolean{
  return !!a&&!!b&&a.every((value,i)=>Math.abs(value-b[i])<=(i<4?1e-6:eps*8));
}
function spatialTransformsMatch(a:RigidFoldTransform3D,b:RigidFoldTransform3D,eps:number):boolean{
  return a.rotation.every((n,i)=>Math.abs(n-b.rotation[i])<=1e-6)&&a.translation.every((n,i)=>Math.abs(n-b.translation[i])<=eps*8);
}
function prepared(pose:DiagramPose,doc:Doc,result:FlatFoldResult){
  const old=buildDiagramPoseFold(pose).graph,next=buildDiagramPoseDocFold(doc,{result}).graph;
  if(pose.paperDeformation||pose.result.geometry.status!=='ready'||result.geometry.status!=='ready'||
      old.vertices_coords.length!==pose.result.geometry.vertices.length||next.vertices_coords.length!==result.geometry.vertices.length||
      JSON.stringify(old.faces_vertices)!==JSON.stringify(pose.result.geometry.faces)||JSON.stringify(next.faces_vertices)!==JSON.stringify(result.geometry.faces))throw Error('材料纸面的拓扑或姿态不适合跨步继承。');
  if(JSON.stringify(pose.sourceDoc.paper)!==JSON.stringify(doc.paper))throw Error('纸张规格已改变，纸层偏好不跨纸张继承。');
  return {old,next,eps:Math.max(epsilonFor(pose.sourceDoc),epsilonFor(doc)),budget:new DiagramWorkCounter()};
}

/** Match source-material ownership, not face IDs or a previous solution index.
 * Only children that kept their full rigid placement retain layer relations;
 * newly folded/unfolded/moved pieces are left to the new CP's layer solver. */
export function diagramStepLayerPreferences(pose:DiagramPose,doc:Doc,result:FlatFoldResult):DiagramLayerPreference[]{
  if(pose.result.layers.status!=='solved'||!pose.result.layers.faceOrders?.length)return [];
  const {old,next,eps,budget}=prepared(pose,doc,result),oldFaces=old.faces_vertices!,newFaces=next.faces_vertices!;
  const oldMatrices=oldFaces.map((_,f)=>faceMatrix(old,pose.result,f,eps,budget)),children=oldFaces.map(()=>[] as number[]);
  for(let f=0;f<newFaces.length;f++){
    const matrix=faceMatrix(next,result,f,eps,budget);if(!matrix)continue;
    let parent:number|undefined,valid=true;
    for(const triangle of triangles(next,f)){
      const points=triangle.map(v=>next.vertices_coords[v]),probe:Point=[points.reduce((sum,p)=>sum+p[0],0)/3,points.reduce((sum,p)=>sum+p[1],0)/3];
      const hits=oldFaces.flatMap((_,candidate)=>inFace(probe,old,candidate,eps,budget,true)?[candidate]:[]);
      if(hits.length!==1||parent!==undefined&&parent!==hits[0]){valid=false;break;}
      parent=hits[0];
      if(!points.every(p=>inFace(p,old,parent!,eps,budget))){valid=false;break;}
    }
    if(valid&&parent!==undefined&&matricesMatch(oldMatrices[parent],matrix,eps))children[parent].push(f);
  }
  const normals=oldFaces.map(face=>Math.sign(polygonArea(face.map(v=>pose.result.geometry.vertices[v]))));
  if(normals.some(n=>!n))return [];
  const nextTriangles=newFaces.map((_,f)=>triangles(next,f).map(row=>row.map(v=>result.geometry.vertices[v]))),preferences:DiagramLayerPreference[]=[],seen=new Set<string>();
  for(const [bottom,top] of flatLayerEdges(pose.result.layers.faceOrders,normals)){
    if(!children[bottom]||!children[top])throw Error('来源纸层证书的纸面编号无效。');
    for(const below of children[bottom])for(const above of children[top]){
      let overlaps=false;
      for(const a of nextTriangles[below]){for(const b of nextTriangles[above]){budget.tick(9);if(ear.math.overlapConvexPolygons(a,b,eps)){overlaps=true;break;}}if(overlaps)break;}
      const key=`${below}:${above}`;if(overlaps&&!seen.has(key)){preferences.push({below,above});seen.add(key);}
    }
  }return preferences;
}

function simplifiedRing(graph:FoldGraph,ring:number[],eps:number):Point[]{
  const points=ring.map(v=>graph.vertices_coords[v]);let changed=true;
  while(changed&&points.length>3){changed=false;for(let i=0;i<points.length;i++)if(edgeDistance(points[i],points[(i+points.length-1)%points.length],points[(i+1)%points.length])<=eps){points.splice(i,1);changed=true;break;}}
  return points;
}
function sameRing(a:Point[],b:Point[],eps:number):boolean{
  if(a.length!==b.length)return false;
  for(let start=0;start<b.length;start++)for(const direction of [1,-1])if(a.every((p,i)=>distance(p,b[(start+direction*i+b.length)%b.length])<=eps))return true;
  return false;
}
function sameMaterialFace(old:FoldGraph,a:number,next:FoldGraph,b:number,eps:number):boolean{
  const left=[old.faces_vertices![a],...(old.faces_holes?.[a]??[])].map(r=>simplifiedRing(old,r,eps)),right=[next.faces_vertices![b],...(next.faces_holes?.[b]??[])].map(r=>simplifiedRing(next,r,eps));
  if(left.length!==right.length||!sameRing(left[0],right[0],eps))return false;
  const remaining=right.slice(1);for(const hole of left.slice(1)){const index=remaining.findIndex(other=>sameRing(hole,other,eps));if(index<0)return false;remaining.splice(index,1);}return true;
}

/** Persist the same unchanged material face on the next step. A split, merged,
 * moved or deformed face deliberately requires a new explicit fixed choice. */
export function inheritDiagramFixedAnchor(pose:DiagramPose,nextPose:DiagramPose,fixed:DiagramFoldAnchor|undefined,nextStateId=nextPose.sourceStateId,targetDoc?:Doc):DiagramFoldAnchor|undefined{
  if(!fixed)return undefined;
  try{
    const {old,next,eps,budget}=prepared(pose,nextPose.sourceDoc,nextPose.result),a=diagramFoldStartingFace(pose.sourceDoc,fixed,old),b=diagramFoldStartingFace(nextPose.sourceDoc,fixed,next);
    if(!sameMaterialFace(old,a,next,b,eps))return undefined;
    let matrix:DiagramFoldMatrix|null,spatialTransform:RigidFoldTransform3D|undefined;
    if(pose.spatial||nextPose.spatial||fixed.spatialTransform){
      if(pose.spatial)validateDiagramSpatialPose(pose,true);
      if(nextPose.spatial)validateDiagramSpatialPose(nextPose,true);
      const previousFlat=pose.spatial?null:faceMatrix(old,pose.result,a,eps,budget),nextFlat=nextPose.spatial?null:faceMatrix(next,nextPose.result,b,eps,budget);
      if(!pose.spatial&&!previousFlat||!nextPose.spatial&&!nextFlat)return undefined;
      const previous=pose.spatial?.faceTransforms[a]??liftDiagramFoldMatrix(previousFlat!),current=nextPose.spatial?.faceTransforms[b]??liftDiagramFoldMatrix(nextFlat!),anchor=fixed.spatialTransform??liftDiagramFoldMatrix(fixed.matrix);
      // Camera foreshortening/rotation is presentation. Only the same material
      // face retaining its real world frame can inherit a stationary anchor.
      if(!spatialTransformsMatch(previous,current,eps)||!spatialTransformsMatch(previous,anchor,eps))return undefined;
      matrix=nextPose.spatial?spatialFaceMatrix(nextPose.spatial,b):nextFlat;
      spatialTransform=structuredClone(current);
    }else{
      const previous=faceMatrix(old,pose.result,a,eps,budget);matrix=faceMatrix(next,nextPose.result,b,eps,budget);
      if(!matricesMatch(previous,matrix,eps)||!matricesMatch(previous,fixed.matrix,eps))return undefined;
    }
    if(!matrix)return undefined;
    let targetGraph=next;
    if(targetDoc){
      if(targetDoc.paper.width!==nextPose.sourceDoc.paper.width||targetDoc.paper.height!==nextPose.sourceDoc.paper.height)return undefined;
      targetGraph=buildDiagramPoseDocFold(targetDoc,nextPose).graph;
      // The interior material seed locates the target face independently of a
      // former CP vertex, which can legitimately disappear on a straight edge.
      const seed={point:fixed.point,matrix,...(spatialTransform?{spatialTransform}:{})},targetFace=diagramFoldStartingFace(targetDoc,seed,targetGraph);
      if(!sameMaterialFace(next,b,targetGraph,targetFace,Math.max(eps,epsilonFor(targetDoc))))return undefined;
    }
    const target=fixed.target?(fixed.target.kind==='vertex'&&!targetGraph.vertices_coords.some(p=>distance(p,fixed.target!.point)<=eps)?
      {stateId:nextStateId,kind:'face' as const,point:[...fixed.point] as Point}:{...structuredClone(fixed.target),stateId:nextStateId}):undefined;
    return {point:[...fixed.point],matrix:[...matrix],...(spatialTransform?{spatialTransform}:{}),...(target?{target}:{})};
  }catch{return undefined;}
}
