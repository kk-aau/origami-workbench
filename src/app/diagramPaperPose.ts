import {epsilonFor} from '../core/geometry';
import {buildDiagramPoseFold} from './diagramFoldGeometry';
import type {Point} from '../core/types';
import type {DiagramPose,DiagramStep} from './diagramProject';
import {diagramPaperVertices} from './diagramPaperDeformation';
import {hasNonFlatFoldAngles,spatialFaceMatrix,validateDiagramSpatialPose} from './diagramSpatialPose';
import {applyRigidFoldTransform,type RigidFoldPoint3} from '../core/rigidFoldGeometry';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

/** Check material-face isometry without treating imported modified snapshots
 * as pulled, or conflating independently coincident material identities. */
export function isDiagramPaperPoseIsometric(pose:DiagramPose):boolean {
  const graph=buildDiagramPoseFold(pose).graph,geometry=pose.result.geometry,eps=epsilonFor(pose.sourceDoc)*10;
  if(geometry.status!=='ready'||geometry.vertices.length!==graph.vertices_coords.length||!same(geometry.faces,graph.faces_vertices))return false;
  const source=[...graph.vertices_coords,...(pose.paperDeformation?.nodes.map(node=>node.cp)??[])],shown=diagramPaperVertices(pose),baseCount=geometry.vertices.length;
  if(pose.spatial){
    try{validateDiagramSpatialPose(pose,true);}catch{return false;}
    const spatial=pose.spatial,world:RigidFoldPoint3[]=[...spatial.vertices];
    for(const [index,node] of (pose.paperDeformation?.nodes??[]).entries()){
      const matrix=spatialFaceMatrix(spatial,node.face),point=shown[baseCount+index];
      if(!point||distance([matrix[0]*node.cp[0]+matrix[2]*node.cp[1]+matrix[4],matrix[1]*node.cp[0]+matrix[3]*node.cp[1]+matrix[5]],point)>eps)return false;
      world.push(applyRigidFoldTransform(spatial.faceTransforms[node.face],node.cp));
    }
    const distance3=(a:RigidFoldPoint3,b:RigidFoldPoint3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    for(let face=0;face<geometry.faces.length;face++){
      const ids=[geometry.faces[face],...(graph.faces_holes?.[face]??[])].flat().concat(pose.paperDeformation?.nodes.flatMap((node,i)=>node.face===face?[baseCount+i]:[])??[]);
      const first=ids[0],second=ids.find(id=>distance(source[first],source[id])>eps);if(second===undefined)return false;
      const a=source[first],b=source[second],third=ids.find(id=>Math.abs((b[0]-a[0])*(source[id][1]-a[1])-(b[1]-a[1])*(source[id][0]-a[0]))>eps*distance(a,b));if(third===undefined)return false;
      // Three noncollinear material references plus the verified proper face
      // transform establish rigidity; screen lengths are deliberately ignored.
      for(const reference of [first,second,third])for(const id of ids)if(!world[id]||!world[reference]||Math.abs(distance(source[reference],source[id])-distance3(world[reference],world[id]))>eps)return false;
    }
    return true;
  }
  for(let face=0;face<geometry.faces.length;face++){
    const ids=[geometry.faces[face],...(graph.faces_holes?.[face]??[])].flat().concat(pose.paperDeformation?.nodes.flatMap((node,i)=>node.face===face?[baseCount+i]:[])??[]),first=ids[0],a=source[first],shownA=shown[first];if(!a||!shownA)return false;
    const second=ids.find(id=>distance(a,source[id])>eps);if(second===undefined)return false;
    const b=source[second],shownB=shown[second],length=distance(a,b),newLength=distance(shownA,shownB);
    if(!Number.isFinite(newLength)||Math.abs(length-newLength)>eps)return false;
    const ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length,vx=(shownB[0]-shownA[0])/newLength,vy=(shownB[1]-shownA[1])/newLength;
    const third=ids.find(id=>Math.abs((source[id][0]-a[0])*(-uy)+(source[id][1]-a[1])*ux)>eps);if(third===undefined)return false;
    const sourceThird=source[third],shownThird=shown[third],sourceSign=Math.sign((sourceThird[0]-a[0])*(-uy)+(sourceThird[1]-a[1])*ux),shownSign=Math.sign((shownThird[0]-shownA[0])*(-vy)+(shownThird[1]-shownA[1])*vx),sign=sourceSign*shownSign;
    if(!sign)return false;
    for(const id of ids){
      const point=source[id],actual=shown[id],dx=point[0]-a[0],dy=point[1]-a[1],x=dx*ux+dy*uy,y=(-dx*uy+dy*ux)*sign;
      const expected:Point=[shownA[0]+x*vx-y*vy,shownA[1]+x*vy+y*vx];if(!actual||!actual.every(Number.isFinite)||distance(expected,actual)>eps)return false;
    }
  }
  return true;
}

/** Recover old mislabeled caches without changing CP, artwork or the visible shape.
 * A lost physical snapshot must be recomputed, never certified by its label. */
export function repairDiagramPaperStatesInPlace(step:DiagramStep):void {
  const paper=step.paperStates;if(!paper||!step.pose)return;
  if(paper.flat?.spatial&&!paper.spatial){
    paper.spatial=paper.flat;delete paper.flat;
    if(paper.flatAnnotations){paper.spatialAnnotations=paper.flatAnnotations;delete paper.flatAnnotations;}
    if(paper.active==='flat')paper.active='spatial';
  }
  if(paper.flat&&!isDiagramPaperPoseIsometric(paper.flat)){
    if(paper.active==='flat'){paper.pulled=structuredClone(step.pose);paper.active='pulled';}
    delete paper.flat;delete paper.flatAnnotations;
  }
  // Older versions offered a spatial state even for a completely planar CP.
  // Reuse that valid top-view snapshot as flat, without reusing any pulled geometry.
  if(paper.spatial&&!hasNonFlatFoldAngles(paper.spatial.sourceDoc)){
    const planar=structuredClone(paper.spatial);delete planar.spatial;
    if(isDiagramPaperPoseIsometric(planar)){
      if(!paper.flat||paper.active==='spatial'){
        paper.flat=planar;
        if(paper.spatialAnnotations)paper.flatAnnotations=structuredClone(paper.spatialAnnotations);
      }
      if(paper.active==='spatial'){paper.active='flat';step.pose=structuredClone(planar);}
      delete paper.spatial;delete paper.spatialAnnotations;
    }
  }
}
