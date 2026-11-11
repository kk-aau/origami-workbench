import {buildDiagramFold,polygonArea} from '../core/geometry';
import type {Doc,Point} from '../core/types';
import type {RigidFoldPoint3,RigidFoldTransform3D} from '../core/rigidFoldGeometry';
import {prepareSimulationDocument} from '../engine/simmodel';
import type {SimulationPose} from '../engine/simPose';
import {viewRotationFor} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {fitDiagramSimulationAngles,measuredDiagramSimulationAngles} from './diagramSimulationAngles';
import {createDiagramSpatialPose} from './diagramSpatialPose';
import {adoptDiagramPose,appendDiagramStep,updateDiagramCP,updateDiagramFoldLink,selectDiagramStep,type DiagramProject} from './diagramProject';
import {applyDiagramSimulationFoldAngles,refreshDiagramFoldDrawing} from './diagramFoldTransactions';
import {defaultModelView} from './modelViewState';
import type {ModelColors} from './modelColors';

type V=RigidFoldPoint3;
const sub=(a:V,b:V):V=>a.map((v,k)=>v-b[k]) as V;
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(v:V):V=>{const n=Math.hypot(...v);if(n<1e-12)throw Error('模拟固定纸面退化，请调整姿态后再应用。');return v.map(x=>x/n) as V;};

/** Recover the captured orientation from one stable material panel. Its scale
 * remains the CP's millimetres; numerical stretching is never made material. */
function capturedFrame(doc:Doc,pose:SimulationPose,face:number):RigidFoldTransform3D {
 const graph=buildDiagramFold(doc).graph,ring=graph.faces_vertices![face],points=graph.vertices_coords;
 const a=ring[0],b=ring.reduce((best,v)=>Math.hypot(...sub([...points[v],0],[...points[a],0]))>Math.hypot(...sub([...points[best],0],[...points[a],0]))?v:best,a);
 const area=(v:number)=>(points[b][0]-points[a][0])*(points[v][1]-points[a][1])-(points[b][1]-points[a][1])*(points[v][0]-points[a][0]);
 const c=ring.reduce((best,v)=>Math.abs(area(v))>Math.abs(area(best))?v:best,a);
 const {prepared}=prepareSimulationDocument(pose.source,{mesh:pose.mesh}),cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]] as Point);
 const rotation=viewRotationFor(pose.view),positions=pose.solver.positions;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 prepared.originalPositions.forEach((v,i)=>{min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);});
 const center=min.map((v,k)=>(v+max[k])/2);let radius=0;
 for(let i=0;i<prepared.originalPositions.length;i+=3)radius=Math.max(radius,Math.hypot(...center.map((v,k)=>prepared.originalPositions[i+k]-v)));
 const sample=(p:Point):V=>{
  for(const ids of prepared.facesVertices){
   const [x,y,z]=ids.map(v=>cp[v]),ux=y[0]-x[0],uy=y[1]-x[1],vx=z[0]-x[0],vy=z[1]-x[1],d=ux*vy-uy*vx;
   if(Math.abs(d)<1e-14)continue;
   const u=((p[0]-x[0])*vy-(p[1]-x[1])*vx)/d,v=(ux*(p[1]-x[1])-uy*(p[0]-x[0]))/d,w=[1-u-v,u,v];
   if(w.some(n=>n< -1e-7))continue;
   const q=[0,1,2].map(k=>ids.reduce((sum,id,i)=>sum+w[i]*positions[3*id+k],0));
   // Simulator screen Y points down; reversing its view Y restores a proper
   // right-handed physical frame, with depth still pointing toward the eye.
   return [0,1,2].map(k=>(k===1?-1:1)*radius*q.reduce((sum,value,i)=>sum+rotation[3*k+i]*value,0)) as V;
  }
  throw Error('模拟纸面与 CP 固定面的映射缺失，未生成下一步。');
 };
 const pa=sample(points[a]),pb=sample(points[b]),pc=sample(points[c]);
 const u=unit(sub(pb,pa)),n=unit(cross(u,sub(pc,pa))).map(v=>v*Math.sign(area(c))) as V,v=cross(n,u);
 const dx=points[b][0]-points[a][0],dy=points[b][1]-points[a][1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
 const r=[0,1,2].flatMap(k=>[u[k]*ux-v[k]*uy,u[k]*uy+v[k]*ux,n[k]]);
 return {rotation:r,translation:pa.map((value,k)=>value-r[3*k]*points[a][0]-r[3*k+1]*points[a][1]) as V};
}

/** Worker-side conversion. Both closure and depth are resolved before any CP
 * or step is changed, so cancellation/failure leaves the entire project intact. */
export function prepareDiagramSimulationEditable(doc:Doc,pose:SimulationPose){
 const measured=measuredDiagramSimulationAngles(doc,pose);
 const drivers=measured.flatMap((a,e)=>Math.abs(a)>1e-6?[e]:[]),values=drivers.map(e=>Math.abs(measured[e])).sort((a,b)=>a-b),median=values[Math.floor(values.length/2)];
 // An underdetermined multi-crease vertex can have several closure branches.
 // If the first driver gives an intersection, try other actual measured
 // drivers near the median. Never publish the intersecting candidate or use a
 // search/time cutoff; the worker remains manually cancellable throughout.
 drivers.sort((a,b)=>Math.abs(Math.abs(measured[a])-median)-Math.abs(Math.abs(measured[b])-median));
 let failure:unknown;
 for(const driver of [undefined,...drivers]){
  try{
   const fitted=fitDiagramSimulationAngles(doc,pose,driver),graph=buildDiagramFold(fitted.doc).graph;
   const face=graph.faces_vertices!.reduce((best,ring,f)=>Math.abs(polygonArea(ring.map(v=>graph.vertices_coords[v])))>Math.abs(polygonArea(graph.faces_vertices![best].map(v=>graph.vertices_coords[v])))?f:best,0);
   const spatialTransform=capturedFrame(fitted.doc,pose,face),point=graph.faces_vertices![face].reduce<Point>((p,v)=>[p[0]+graph.vertices_coords[v][0]/graph.faces_vertices![face].length,p[1]+graph.vertices_coords[v][1]/graph.faces_vertices![face].length],[0,0]);
   const geometry=createDiagramSpatialPose(fitted.doc,face,{point,matrix:[1,0,0,1,0,0],spatialTransform},undefined,{yaw:0,elevation:0},true);
   if(geometry.result.layers.status!=='solved')throw Error('当前姿态的纸面遮挡未能确认，未生成可编辑下一步。');
   return {...fitted,...geometry};
  }catch(error){failure=error;}
 }
 throw failure;
}

export function applyDiagramSimulationEditable(project:DiagramProject,stepId:string,answer:ReturnType<typeof prepareDiagramSimulationEditable>,colors:ModelColors):DiagramProject {
 const index=project.steps.findIndex(s=>s.id===stepId);if(index<0)throw Error('找不到要应用姿态的步骤。');
 const oldFollowing=project.steps[index+1],unchangedFollowing=oldFollowing&&JSON.stringify(project.states.find(s=>s.id===oldFollowing.beforeId)!.doc)===JSON.stringify(project.states.find(s=>s.id===oldFollowing.afterId)!.doc);
 let next=applyDiagramSimulationFoldAngles(project,stepId,answer.doc);
 // An already-created empty next step inherits the measured state too. Do
 // not turn its former full target into a new, unintended folding operation.
 if(unchangedFollowing)next=updateDiagramCP(next,oldFollowing.afterId,next.states.find(s=>s.id===oldFollowing.beforeId)!.doc);
 const following=next.steps[index+1];
 next=following?selectDiagramStep(next,following.id):appendDiagramStep(next,undefined,{inheritSurface:false});
 const target=next.steps.find(s=>s.id===next.activeStepId)!;
 next=adoptDiagramPose(next,target.id,target.beforeId,answer.result,{...defaultModelView(),colors},answer.spatial);
 next=updateDiagramFoldLink(next,target.id,{enabled:true,layers:target.foldLink?.layers??'top',selectedFaces:[]});
 return refreshDiagramFoldDrawing(next,target.id);
}
