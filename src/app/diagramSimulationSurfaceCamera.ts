import {multiplyMat3,transposeMat3,viewRotationFor,type Mat3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {validateSimulationView,type SimulationPose} from '../engine/simPose';
import type {DiagramSpatialPose} from './diagramSpatialPose';

type View=SimulationPose['view'];
/** The simulator's view matrix has determinant -1 and screen Y points down.
 * Flipping its second row gives the proper screen rotation used by the shared
 * world-axis gizmo. The material positions remain entirely untouched. */
const flipScreenY=(m:readonly number[]):Mat3=>[m[0],m[1],m[2],-m[3],-m[4],-m[5],m[6],m[7],m[8]];
export function diagramSimulationSurfaceOrbitCamera(view:View):DiagramSpatialPose['camera'] {
  validateSimulationView(view);
  return {yaw:0,elevation:0,rotation:[...flipScreenY(viewRotationFor(view))],pivot:[0,0,0],offset:[0,0,0]};
}

/** Retain the old Euler controls and zoom; store the full additional rotation
 * in orient. This is an exact matrix composition, including world-Z rotation,
 * with no Euler decomposition or pole singularity. */
export function diagramSimulationSurfaceViewFromCamera(view:View,camera:DiagramSpatialPose['camera']):View {
  validateSimulationView(view);
  if(!Array.isArray(camera.rotation)||camera.rotation.length!==9)throw Error('曲面三轴视角缺少完整旋转矩阵。');
  const {orient:_old,...base}=view;
  const orient=multiplyMat3(transposeMat3(viewRotationFor(base)),flipScreenY(camera.rotation));
  const next={...base,orient};validateSimulationView(next);return next;
}

export function sameDiagramSimulationSurfaceView(a:View,b:View):boolean {
  const first=viewRotationFor(a),second=viewRotationFor(b);
  return a.zoom===b.zoom&&first.every((n,i)=>Math.abs(n-second[i])<1e-12);
}
