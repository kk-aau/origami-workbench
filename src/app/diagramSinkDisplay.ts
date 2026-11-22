import {prepareSimulationDocument} from '../engine/simmodel';
import {simulationStepCameraBounds} from '../engine/simStepCamera';
import type {DiagramFullAnimationEntry} from './diagramFullAnimation';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {Point} from '../core/types';
import {sampleDiagramMaterialPoint} from './diagramAnimationRegistration';
import {diagramSimulationSurfaceViewFromCamera} from './diagramSimulationSurfaceCamera';

const dot=(a:number[],b:number[])=>a.reduce((value,n,i)=>value+n*b[i],0);
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(v:number[])=>{const norm=Math.hypot(...v);return v.map(n=>n/norm);};

/** Look over the rim from its exposed side. A default front projection can
 * conceal the entire opening when the rim stands on edge. */
export function automaticSinkCamera(prepared:PreparedOrigamiModel,positions:number[],rim:Point[]){
  const mesh={cp:prepared.fold.vertices_coords.map(p=>[p[0],-p[2]]),indices:prepared.indices,positions,sourceFaces:prepared.triangleSourceFaces!};
  const ring=rim.map(p=>sampleDiagramMaterialPoint(mesh,p).position);
  const center=[0,1,2].map(k=>ring.reduce((sum,p)=>sum+p[k],0)/ring.length);
  const normal=[0,0,0];let longest=0,right:number[]=[];
  ring.forEach((p,i)=>{
    const j=(i+1)%ring.length,q=ring[j],edge=q.map((v,k)=>v-p[k]);
    const dx=rim[j][0]-rim[i][0],dy=rim[j][1]-rim[i][1],length=Math.hypot(dx,dy);
    const area=cross(p.map((v,k)=>v-center[k]),q.map((v,k)=>v-center[k]));
    area.forEach((n,k)=>normal[k]+=n);
    if(length>longest){right=unit(dx<0||dx===0&&dy<0?edge.map(n=>-n):edge);longest=length;}
  });
  let up=unit(normal);
  const bodyOffset=[0,1,2].map(k=>prepared.fold.vertices_coords.reduce((s,_,i)=>s+positions[3*i+k],0)/prepared.vertexCount-center[k]);
  if(dot(up,bodyOffset)>0)up=up.map(n=>-n);
  // Present the broad side of an elongated stack. Use the existing rim edge
  // for a rotationally symmetric footprint where no principal axis exists.
  const side=cross(up,right);
  let xx=0,xy=0,yy=0;
  for(let i=0;i<prepared.vertexCount;i++){
    const offset=center.map((v,k)=>positions[3*i+k]-v-bodyOffset[k]);
    const x=dot(offset,right),y=dot(offset,side);
    xx+=x*x;xy+=x*y;yy+=y*y;
  }
  if(Math.hypot(xx-yy,2*xy)>(xx+yy)*.05){
    const angle=.5*Math.atan2(2*xy,xx-yy);
    right=right.map((n,k)=>n*Math.cos(angle)+side[k]*Math.sin(angle));
  }
  const down=up.map(n=>-n),front=cross(right,down);
  const eye=unit(up.map((n,k)=>.58*n+.8*front[k]+.2*right[k]));
  const screenDown=unit(down.map((n,k)=>n-dot(down,eye)*eye[k])),screenRight=cross(screenDown,eye);
  return diagramSimulationSurfaceViewFromCamera({yaw:0,pitch:0,zoom:1},{yaw:0,elevation:0,rotation:[...screenRight,...screenDown,...eye]});
}

/** Both clips already share a rigid world frame. Frame their actual motion,
 * including the excursion beyond either endpoint, throughout the sink fold. */
export function diagramSinkDisplay(opening:DiagramFullAnimationEntry,closing:DiagramFullAnimationEntry,automaticRim?:Point[]){
  const bounds=(entry:DiagramFullAnimationEntry)=>{
    const {prepared}=prepareSimulationDocument(entry.plan.fold??entry.clip.fold);
    return simulationStepCameraBounds(prepared,entry.plan.animation);
  };
  const a=bounds(opening),b=bounds(closing);
  const offset=b.center.map((n,i)=>n-a.center[i]),distance=Math.hypot(...offset);
  let cameraFrame=a;
  if(distance+a.radius<=b.radius)cameraFrame=b;
  else if(distance+b.radius>a.radius){
    const radius=(a.radius+distance+b.radius)/2,along=(radius-a.radius)/distance;
    cameraFrame={radius,center:[a.center[0]+along*offset[0],a.center[1]+along*offset[1],a.center[2]+along*offset[2]]};
  }
  const camera=automaticRim?automaticSinkCamera(prepareSimulationDocument(closing.plan.fold??closing.clip.fold).prepared,closing.plan.animation.initialPositions,automaticRim):closing.clip.camera??opening.clip.camera;
  return {cameraFrame,camera};
}
