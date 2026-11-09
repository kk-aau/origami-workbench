import {validateSolverPoseSnapshot,type SolverPoseSnapshot} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/solverBackend';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {prepareSimulationDocument} from './simmodel';
import {normalizeSimulationSolverSettings,type SimulationSolverSettings} from './simSettings';
import {isSimulationMeshQuality,type SimulationMeshQuality} from './simFlexibleMesh';

/** A resting pose, including its own source CP. Never a layer-order certificate. */
export interface SimulationPose {
  version:1;
  source:unknown;
  solver:SolverPoseSnapshot;
  progress:number;
  settings:SimulationSolverSettings;
  view:{yaw:number;pitch:number;zoom:number};
  /** Absent in older files: their original, unrefined simulation topology. */
  mesh?:SimulationMeshQuality;
  collision?:boolean;
}

/** Validate the whole pose before any live workspace is replaced. */
export function validateSimulationPose(value:unknown):SimulationPose {
  const fail=()=>{throw new Error('三维姿态格式无效或与源折痕不一致，未载入。');};
  if(!value||typeof value!=='object'||Array.isArray(value))return fail();
  const raw=value as Record<string,unknown>,keys=['version','source','solver','progress','settings','view'];
  if(Object.keys(raw).some(key=>!keys.includes(key)&&key!=='mesh'&&key!=='collision')||keys.some(key=>!Object.hasOwn(raw,key))||raw.version!==1||Object.hasOwn(raw,'mesh')&&!isSimulationMeshQuality(raw.mesh)||Object.hasOwn(raw,'collision')&&typeof raw.collision!=='boolean')return fail();
  const solver=validateSolverPoseSnapshot(raw.solver),settings=normalizeSimulationSolverSettings(raw.settings);
  const view=raw.view as SimulationPose['view'];
  if(!solver||!settings||typeof raw.progress!=='number'||!Number.isFinite(raw.progress)||Math.abs(raw.progress)>1||
    !view||Object.keys(view).length!==3||!['yaw','pitch','zoom'].every(key=>typeof view[key as keyof typeof view]==='number'&&Number.isFinite(view[key as keyof typeof view]))||view.zoom<.15||view.zoom>5||
    solver.pins.length&&settings.integrationType!=='euler')return fail();
  const source=structuredClone(raw.source);
  const mesh=raw.mesh as SimulationMeshQuality|undefined;
  const prepared=prepareSimulationDocument(source,{mesh}).prepared;
  const check=new ReferenceSolver(new OrigamiModel(prepared),{...settings,foldPercent:raw.progress*100});
  try{check.restorePose(solver);}catch{return fail();}finally{check.dispose();}
  return {version:1,source,solver,progress:raw.progress,settings,view:{yaw:view.yaw,pitch:view.pitch,zoom:view.zoom},...(mesh?{mesh}:{}),...(raw.collision===undefined?{}:{collision:raw.collision as boolean})};
}
