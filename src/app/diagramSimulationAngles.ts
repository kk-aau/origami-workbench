import {buildDiagramFold} from '../core/geometry';
import type {Doc,Point,Segment} from '../core/types';
import {AdaptiveFoldBoundsError,solveAdaptiveFoldAngles} from '../core/adaptiveFoldAngles';
import {solveRigidFoldGeometry} from '../core/rigidFoldGeometry';
import {validateSimulationPose,type SimulationPose} from '../engine/simPose';
import {prepareSimulationDocument} from '../engine/simmodel';
import {applyDiagramFoldSegments} from './diagramFoldLink';
import {diagramSimulationGraph,retainDiagramSimulationTarget} from './diagramSimulationGraph';
export {diagramSimulationGraph} from './diagramSimulationGraph';
export interface DiagramSimulationAngleOptions {strictClosure?:boolean}

/** Capture actual mesh dihedrals, not target × slider progress. Mesh provenance
 * is checked against the exact source; incompatible geometry is never written. */
export function applyDiagramSimulationAngles(doc:Doc,input:SimulationPose,options:DiagramSimulationAngleOptions={}):{doc:Doc;maximumCorrection:number;progress:number;cappedCreases:number;maxOverfold:number;closureVerified:boolean}{
 return applySimulationAngles(doc,input,options,false);
}

/** Fit a normal editable rigid pose near the measured simulator angles. Keep
 * the strongest measured hinge fixed and solve the remaining loop constraints.
 * This is an explicit geometry conversion, not a closure-check bypass. */
export function fitDiagramSimulationAngles(doc:Doc,input:SimulationPose,drivenEdge?:number){
 return applySimulationAngles(doc,input,{strictClosure:true},true,drivenEdge);
}

export function measuredDiagramSimulationAngles(doc:Doc,input:SimulationPose):number[]{
 return applySimulationAngles(doc,input,{strictClosure:false},false).measuredAngles;
}

function applySimulationAngles(doc:Doc,input:SimulationPose,options:DiagramSimulationAngleOptions,fitEditable:boolean,drivenEdge?:number){
 if(options.strictClosure!==undefined&&typeof options.strictClosure!=='boolean')throw Error('闭合校验设置无效。');
 const strictClosure=options.strictClosure!==false;
 const pose=validateSimulationPose(input),source=diagramSimulationGraph(doc);
 if(JSON.stringify(pose.source)!==JSON.stringify(source))throw Error('三维模拟的来源 CP 已变化，请重新载入后应用。');
 const {prepared}=prepareSimulationDocument(pose.source,{mesh:pose.mesh}),positions=pose.solver.positions;
 type V=[number,number,number];
 const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 const unit=(a:V):V=>{const n=Math.hypot(...a);if(n<1e-12)throw Error('模拟纸面退化，请调整进度后重试。');return a.map(v=>v/n) as V;};
 const point=(v:number):V=>positions.slice(v*3,v*3+3) as V;
 const normals=prepared.facesVertices.map(([a,b,c])=>unit(cross(sub(point(b),point(a)),sub(point(c),point(a)))));
 const measurements=prepared.creaseParams.map((c,index)=>{
  const [a,b]=prepared.edgesVertices[c.edge],axis=unit(sub(point(b),point(a))),n1=normals[c.face1],n2=normals[c.face2];
  let angle=Math.atan2(dot(cross(n1,axis),n2),Math.max(-1,Math.min(1,dot(n1,n2))))*180/Math.PI;
  const kind=prepared.edgesAssignment[c.edge];if(Math.abs(Math.abs(angle)-180)<1e-4)angle=kind==='M'?-180:180;
  return {edge:c.edge,angle,continuousAngle:pose.solver.creaseAngles[index]*180/Math.PI};
 });
 const graph=buildDiagramFold(doc).graph,extent=Math.max(1,...graph.vertices_coords.map(p=>Math.hypot(...p))),eps=extent*1e-7;
 const cpPoint=(v:number):Point=>{const p=prepared.fold.vertices_coords[v];return [p[0],-p[2]];};
 const capped=new Set<number>();let maxOverfold=0;
 const measured=graph.edges_vertices.map(([a,b],e)=>{
  const kind=graph.edges_assignment[e];if(!['M','V'].includes(kind))return 0;
  const start=graph.vertices_coords[a],end=graph.vertices_coords[b],dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
  const matches=measurements.flatMap(m=>{
   if(prepared.edgesAssignment[m.edge]!==kind)return [];
   const points=prepared.edgesVertices[m.edge].map(cpPoint);
   if(points.some(p=>Math.abs(dx*(p[1]-start[1])-dy*(p[0]-start[0]))>eps*length))return [];
   const ts=points.map(p=>((p[0]-start[0])*dx+(p[1]-start[1])*dy)/length),lo=Math.max(0,Math.min(...ts)),hi=Math.min(length,Math.max(...ts));
   return hi-lo>eps?[{...m,lo,hi}]:[];
  }).sort((x,y)=>x.lo-y.lo);
  // One original crease can consist of many refined hinges. Require complete
  // coverage and consistent actual angles, never infer an angle across a gap.
  let covered=0;for(const m of matches){if(m.lo>covered+eps)throw Error('模拟网格的折痕映射缺失，未应用。');covered=Math.max(covered,m.hi);}
  if(covered<length-eps)throw Error('模拟网格的折痕映射缺失，未应用。');
  // The simulator tracks full turns continuously. Accept that winding only
  // when it agrees with the current mesh; the slider is never an angle source.
  const values=matches.map(m=>{const continuous=m.angle+360*Math.round((m.continuousAngle-m.angle)/360);return Math.abs(continuous-m.continuousAngle)<.25?continuous:m.angle;});
  if(!values.length||Math.max(...values)-Math.min(...values)>.25)throw Error('模拟网格的折痕映射缺失或同一折痕发生弯曲，未应用。');
  const totalLength=matches.reduce((s,m)=>s+m.hi-m.lo,0);
  const angle=values.reduce((s,v,i)=>s+v*(matches[i].hi-matches[i].lo),0)/totalLength;
  if(kind==='M'&&angle>.25||kind==='V'&&angle<-.25){
   const place=graph.edges_vertices[e].map(v=>`（${graph.vertices_coords[v].map(x=>Number(x.toFixed(2))).join('，')}）`).join('至');
   const name=kind==='M'?'山折':'谷折';
   throw Error(`第 ${e+1} 条模拟${name}${place}实际呈${kind==='M'?'谷折':'山折'} ${Math.abs(angle).toFixed(2)}°，与山谷方向冲突，未应用；请调整进度或复位后重试。`);
  }
  if(values.some(value=>Math.abs(value)>180)){
   capped.add(e);maxOverfold=Math.max(maxOverfold,...values.map(value=>Math.abs(value)-180));
   return kind==='M'?-180:180;
  }
  return kind==='M'?Math.min(0,angle):Math.max(0,angle);
 });
 let angles=measured;
 if(strictClosure&&solveRigidFoldGeometry(graph,{edgesFoldAngle:angles}).status!=='ready'){
  const driven=drivenEdge??measured.reduce((best,v,e)=>Math.abs(v)>Math.abs(measured[best])?e:best,0);
  if(!Number.isInteger(driven)||!['M','V'].includes(graph.edges_assignment[driven])||Math.abs(measured[driven])<1e-6)throw Error('模拟驱动折痕无效。');
  const targets=measured.map((a,e)=>!capped.has(e)&&e!==driven&&['M','V'].includes(graph.edges_assignment[e])?null:a);
  // Only a nearby rigid correction may be applied. Searching the full angle
  // space first can spend indefinitely on poses we would reject afterwards.
  const angleBounds=measured.map((angle,e):[number,number]|null=>capped.has(e)?[angle,angle]:['M','V'].includes(graph.edges_assignment[e])?[Math.max(-180,angle-.25),Math.min(180,angle+.25)]:null);
  try{angles=solveAdaptiveFoldAngles({...graph,edges_foldAngle:targets},{initial:measured,allowUnderdetermined:true,...(fitEditable?{}:{angleBounds})});}
  catch(error){
   if(error instanceof AdaptiveFoldBoundsError)throw Error(`${capped.size?`${capped.size} 条过折折痕已按 180° 处理，但`:''}当前模拟纸面尚未闭合，在其余折痕 ±0.25° 的允许修正范围内未找到可应用的折角，未应用；请等待模拟稳定或调整进度。`);
   throw error;
  }
 }
 if(strictClosure){const finalGeometry=solveRigidFoldGeometry(graph,{edgesFoldAngle:angles});
 if(finalGeometry.status!=='ready')throw Error(`${capped.size?`${capped.size} 条过折折痕已按 180° 处理，但`:''}当前折角未通过纸面闭合验证，未应用：${finalGeometry.message}`);}
 const maximumCorrection=Math.max(...angles.map((a,e)=>Math.abs(a-measured[e])));
 if(!fitEditable&&maximumCorrection>.25)throw Error('当前模拟纸面尚未闭合，修正折角超过 0.25°；请等待稳定或调整进度后再应用。');
 const changes:Segment[]=graph.edges_vertices.flatMap(([a,b],e)=>['M','V'].includes(graph.edges_assignment[e])?[{id:'simulation-angle:'+e,a:graph.vertices_coords[a],b:graph.vertices_coords[b],assignment:graph.edges_assignment[e] as 'M'|'V',angle:angles[e]}]:[]);
 const applied=retainDiagramSimulationTarget(applyDiagramFoldSegments(doc,changes),source,pose.progress);
 return {doc:{...applied,metadata:{...applied.metadata,diagramSimulationClosure:{verified:strictClosure,progress:pose.progress,...(fitEditable?{method:'editable-fit',maximumCorrection}:{})}}},maximumCorrection,progress:pose.progress,cappedCreases:capped.size,maxOverfold,closureVerified:strictClosure,measuredAngles:measured};
}
