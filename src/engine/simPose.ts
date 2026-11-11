import {validateSolverPoseSnapshot,type SolverPoseSnapshot} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {prepareSimulationDocument} from './simmodel';
import {normalizeSimulationSolverSettings,type SimulationSolverSettings} from './simSettings';
import {isSimulationMeshQuality,type SimulationMeshQuality} from './simFlexibleMesh';
import type {OrbitView} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

/** A resting pose, including its own source CP. Never a layer-order certificate. */
export interface SimulationPose {
  version:1;
  source:unknown;
  solver:SolverPoseSnapshot;
  progress:number;
  settings:SimulationSolverSettings;
  /** Older files omit roll/orient: zero roll and identity orientation. */
  view:OrbitView;
  /** Absent in older files: their original, unrefined simulation topology. */
  mesh?:SimulationMeshQuality;
  collision?:boolean;
}

/** Camera validation is independent of the solver, so live orbit previews do
 * not reconstruct or modify material geometry. Matrices must stay rotations. */
export function validateSimulationView(value:unknown):asserts value is SimulationPose['view'] {
  const fail=()=>{throw Error('三维视角格式无效。');};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['yaw','pitch','zoom','roll','orient'].includes(key)))return fail();
  const view=value as SimulationPose['view'];
  if(![view.yaw,view.pitch,view.zoom].every(n=>typeof n==='number'&&Number.isFinite(n))||view.zoom<.15||view.zoom>5||Object.hasOwn(view,'roll')&&(typeof view.roll!=='number'||!Number.isFinite(view.roll)))return fail();
  if(Object.hasOwn(view,'orient')){
    const r=view.orient;
    if(!Array.isArray(r)||r.length!==9||!Array.from(r).every(n=>typeof n==='number'&&Number.isFinite(n)))return fail();
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(r[i]*r[j]+r[i+3]*r[j+3]+r[i+6]*r[j+6]-(i===j?1:0))>1e-8)return fail();
    const determinant=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
    if(Math.abs(determinant-1)>1e-8)return fail();
  }
}

/** Validate the whole pose before any live workspace is replaced. */
export function validateSimulationPose(value:unknown):SimulationPose {
  const fail=()=>{throw new Error('三维姿态格式无效或与源折痕不一致，未载入。');};
  if(!value||typeof value!=='object'||Array.isArray(value))return fail();
  const raw=value as Record<string,unknown>,keys=['version','source','solver','progress','settings','view'];
  if(Object.keys(raw).some(key=>!keys.includes(key)&&key!=='mesh'&&key!=='collision')||keys.some(key=>!Object.hasOwn(raw,key))||raw.version!==1||Object.hasOwn(raw,'mesh')&&!isSimulationMeshQuality(raw.mesh)||Object.hasOwn(raw,'collision')&&typeof raw.collision!=='boolean')return fail();
  const solver=validateSolverPoseSnapshot(raw.solver),settings=normalizeSimulationSolverSettings(raw.settings);
  const view=raw.view as SimulationPose['view'];
  try{validateSimulationView(view);}catch{return fail();}
  if(!solver||!settings||typeof raw.progress!=='number'||!Number.isFinite(raw.progress)||Math.abs(raw.progress)>1||
    solver.pins.length&&settings.integrationType!=='euler')return fail();
  const source=structuredClone(raw.source);
  const mesh=raw.mesh as SimulationMeshQuality|undefined;
  const prepared=prepareSimulationDocument(source,{mesh}).prepared;
  const check=new ReferenceSolver(new OrigamiModel(prepared),{...settings,foldPercent:raw.progress*100});
  try{check.restorePose(solver);}catch{return fail();}finally{check.dispose();}
  return {version:1,source,solver,progress:raw.progress,settings,view:structuredClone(view),...(mesh?{mesh}:{}),...(raw.collision===undefined?{}:{collision:raw.collision as boolean})};
}
