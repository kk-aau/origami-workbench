import {validateDoc,type Doc} from '../core/types';
import {validateSimulationPose,validateSimulationView,type SimulationPose} from '../engine/simPose';
import {prepareSimulationDocument} from '../engine/simmodel';
import {matchesDiagramSimulationSurfaceSource} from './diagramSimulationGraph';
import {validateModelColors,type ModelColors} from './modelColors';

/** Captured material surface, independent from a rigid fold/flat-layer result.
 * Mesh quality plus the exact source reconstructs its indexed triangles;
 * solver.positions are the actual displayed 3D vertices, never solved angles. */
export interface DiagramSimulationSurface {
  version:1;
  sourceStateId:string;
  sourceRevision:number;
  sourceDoc:Doc;
  pose:SimulationPose;
  colors:ModelColors;
  /** Paper-only roll in the drawing plane; symbols retain their own angles. */
  displayRotation?:number;
}

export function validateDiagramSimulationSurfaceView(view:unknown):asserts view is SimulationPose['view'] {
  try{validateSimulationView(view);}catch{throw Error('曲面视角或缩放无效。');}
}

export function validateDiagramSimulationSurface(value:unknown,checkGeometry=true):asserts value is DiagramSimulationSurface {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['colors','displayRotation','pose','sourceDoc','sourceRevision','sourceStateId','version'].includes(key))||['colors','pose','sourceDoc','sourceRevision','sourceStateId','version'].some(key=>!Object.hasOwn(value,key)))throw Error('模拟曲面字段不完整或版本不支持。');
  const surface=value as DiagramSimulationSurface;
  if(surface.version!==1||typeof surface.sourceStateId!=='string'||!surface.sourceStateId.trim()||!Number.isSafeInteger(surface.sourceRevision)||surface.sourceRevision<0)throw Error('模拟曲面来源编号或版本无效。');
  if(surface.displayRotation!==undefined&&(!Number.isFinite(surface.displayRotation)||surface.displayRotation<0||surface.displayRotation>=360))throw Error('模拟曲面纸张角度无效。');
  validateDoc(surface.sourceDoc);validateModelColors(surface.colors);
  if(!surface.pose||surface.pose.version!==1||!surface.pose.solver||!Array.isArray(surface.pose.solver.positions)||surface.pose.solver.positions.length<9||surface.pose.solver.positions.length%3!==0)throw Error('模拟曲面缺少实际纸面坐标。');
  validateDiagramSimulationSurfaceView(surface.pose.view);
  if(!checkGeometry)return;
  const pose=validateSimulationPose(surface.pose);
  if(!matchesDiagramSimulationSurfaceSource(surface.sourceDoc,pose.source))throw Error('模拟曲面与来源 CP 不一致，请重新载入三维模拟后应用。');
  const prepared=prepareSimulationDocument(pose.source,{mesh:pose.mesh}).prepared,p=pose.solver.positions;
  for(const [a,b,c] of prepared.facesVertices){
    const u=[0,1,2].map(k=>p[3*b+k]-p[3*a+k]),v=[0,1,2].map(k=>p[3*c+k]-p[3*a+k]);
    if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<=1e-13)throw Error('当前模拟含退化纸面，请调整姿态后再应用到下一步。');
  }
}

/** Geometry for rendering only. No flat-fold result or layer certificate is
 * created, and no rigid closure or inverse fold-angle solve is performed. */
export function prepareDiagramSimulationSurface(surface:DiagramSimulationSurface){
  validateDiagramSimulationSurface(surface,true);
  const prepared=prepareSimulationDocument(surface.pose.source,{mesh:surface.pose.mesh}).prepared;
  return {prepared,positions:Float32Array.from(surface.pose.solver.positions)};
}
