import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {diagramSimulationGraph} from '../../src/app/diagramSimulationGraph';
import {diagramSimulationSurfaceOrbitCamera,diagramSimulationSurfaceViewFromCamera,sameDiagramSimulationSurfaceView} from '../../src/app/diagramSimulationSurfaceCamera';
import {rotateDiagramCameraAxis,type DiagramRotationAxis} from '../../src/app/diagramAxisRotation';
import {createDiagramProject,applyDiagramSimulationSurface,updateDiagramSimulationSurfaceView,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {diagramSimulationSurfaceCamera,diagramSimulationSurfaceGeometry} from '../../src/app/diagramSimulationSurfaceRender';
import {prepareDiagramSimulationEditable} from '../../src/app/diagramSimulationEditable';
import {validateSimulationPose,validateSimulationView,type SimulationPose} from '../../src/engine/simPose';
import {simulationViewCubeFaces} from '../../src/engine/simViewCube';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {viewRotationFor,multiplyMat3,transposeMat3,type Mat3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

const close=(a:readonly number[],b:readonly number[],epsilon=1e-9)=>{assert.equal(a.length,b.length);a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<epsilon,`${i}: ${n} != ${b[i]}`));};
const point=(r:readonly number[],p:readonly number[])=>[0,1,2].map(i=>r[3*i]*p[0]+r[3*i+1]*p[1]+r[3*i+2]*p[2]);
function fixture(){
  const doc=blankDoc('曲面三轴',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const source=diagramSimulationGraph(doc),settings={...DEFAULT_SIMULATION_SOLVER_SETTINGS},prepared=prepareSimulationDocument(source).prepared;
  const solver=new ReferenceSolver(new OrigamiModel(prepared),{...settings,foldPercent:50});solver.step(3000);
  const pose:SimulationPose={version:1,source,solver:solver.capturePose(),progress:.5,settings,view:{yaw:.3,pitch:.2,zoom:1}};solver.dispose();return {doc,pose};
}

test('legacy camera maps exactly to the shared right-handed gizmo and roundtrips at both poles',()=>{
  for(const pitch of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const view={yaw:.35,pitch,zoom:.88},camera=diagramSimulationSurfaceOrbitCamera(view),r=camera.rotation!,m=viewRotationFor(view);
    close(r,[m[0],m[1],m[2],-m[3],-m[4],-m[5],m[6],m[7],m[8]]);
    const next=diagramSimulationSurfaceViewFromCamera(view,camera);assert.equal(next.zoom,view.zoom);assert.ok(sameDiagramSimulationSurfaceView(view,next));
    const v=[.2,.3,.4];close(point(r,v),point(m,v).map((n,i)=>i===1?-n:n));
  }
});

test('all three axes rotate about actual world axes, with Z independent from screen roll',()=>{
  const view={yaw:0,pitch:0,zoom:1},m=viewRotationFor(view),angle=Math.PI/4,c=Math.cos(angle),s=Math.sin(angle);
  const expected:Record<DiagramRotationAxis,Mat3>={x:[1,0,0,0,c,-s,0,s,c],y:[c,0,s,0,1,0,-s,0,c],z:[c,-s,0,s,c,0,0,0,1]};
  for(const axis of ['x','y','z'] as const){
    const next=diagramSimulationSurfaceViewFromCamera(view,rotateDiagramCameraAxis(diagramSimulationSurfaceOrbitCamera(view),axis,angle));
    close(viewRotationFor(next),multiplyMat3(m,expected[axis]));assert.equal(next.zoom,1);
    const index={x:0,y:1,z:2}[axis],unit=[0,0,0];unit[index]=1;close(point(viewRotationFor(next),unit),point(m,unit));
    const restored=diagramSimulationSurfaceViewFromCamera(next,rotateDiagramCameraAxis(diagramSimulationSurfaceOrbitCamera(next),axis,-angle));assert.ok(sameDiagramSimulationSurfaceView(view,restored));
  }
  const z=diagramSimulationSurfaceViewFromCamera(view,rotateDiagramCameraAxis(diagramSimulationSurfaceOrbitCamera(view),'z',angle));
  assert.notDeepEqual(viewRotationFor(z).slice(6),viewRotationFor({...view,roll:angle}).slice(6),'world Z changes the viewing direction, screen roll does not');
});

test('matrix and roll persist through simulation and diagram save/reopen without changing CP or surface geometry',()=>{
  const {doc,pose}=fixture();pose.view={...pose.view,roll:.6};
  let next=diagramSimulationSurfaceViewFromCamera(pose.view,rotateDiagramCameraAxis(diagramSimulationSurfaceOrbitCamera(pose.view),'z',.45));
  const saved=validateSimulationPose({...pose,view:next});close(viewRotationFor(saved.view),viewRotationFor(next));assert.deepEqual(saved.solver,pose.solver);
  const project=createDiagramProject(doc),applied=applyDiagramSimulationSurface(project,project.activeStepId,saved),step=applied.steps[1],surface=step.simulationSurface!;
  const geometry=diagramSimulationSurfaceGeometry(surface);
  next=diagramSimulationSurfaceViewFromCamera(next,rotateDiagramCameraAxis(diagramSimulationSurfaceOrbitCamera(next),'x',.7));
  const rotated=updateDiagramSimulationSurfaceView(applied,step.id,next),actual=rotated.steps[1].simulationSurface!;
  assert.equal(actual.pose.solver,surface.pose.solver);assert.equal(diagramSimulationSurfaceGeometry(actual),geometry);assert.deepEqual(rotated.states,applied.states);
  const restored=importDiagramProject(exportDiagramProject(rotated));close(viewRotationFor(restored.steps[1].simulationSurface!.pose.view),viewRotationFor(next));assert.deepEqual(restored.steps[1].simulationSurface!.pose.solver,pose.solver);
  const expected=structuredClone(actual.pose.view);(next.orient as number[])[0]+=1;assert.deepEqual(actual.pose.view,expected,'submitted orientation cannot mutate an undo snapshot');
  assert.notEqual(saved.view.orient,next.orient);close(diagramSimulationSurfaceCamera(actual,100,100).rotation,viewRotationFor(expected));
});

test('extended view validation still rejects scale, shear, reflection and malformed matrices',()=>{
  const view={yaw:0,pitch:0,zoom:1};assert.doesNotThrow(()=>validateSimulationView(view));assert.doesNotThrow(()=>validateSimulationView({...view,roll:0}));
  for(const extra of [{roll:NaN},{roll:'0'},{orient:[]},{orient:Array(9)},{orient:[1,0,0,0,1,0,0,0,-1]},{orient:[2,0,0,0,1,0,0,0,1]},{orient:[1,0,.1,0,1,0,0,0,1]},{orient:[1,0,0,0,1,0,0,0,Infinity]},{unknown:0}])assert.throws(()=>validateSimulationView({...view,...extra}));
  const {pose}=fixture();assert.deepEqual(validateSimulationPose(pose).view,pose.view,'older files retain their exact three-field representation');
});

test('creating editable material from a rolled and oriented simulation preserves the complete captured orientation',()=>{
  const {doc,pose}=fixture(),before=structuredClone(pose),base=prepareDiagramSimulationEditable(doc,pose);
  const rolled={...pose.view,roll:.6},view=diagramSimulationSurfaceViewFromCamera(rolled,rotateDiagramCameraAxis(diagramSimulationSurfaceOrbitCamera(rolled),'z',.45));
  const turned=prepareDiagramSimulationEditable(doc,{...pose,view});
  const a=diagramSimulationSurfaceOrbitCamera(pose.view).rotation! as unknown as Mat3,b=diagramSimulationSurfaceOrbitCamera(view).rotation! as unknown as Mat3,delta=multiplyMat3(b,transposeMat3(a));
  base.spatial.vertices.forEach((p,i)=>close(turned.spatial.vertices[i],point(delta,p),1e-6));
  close(turned.spatial.measuredAngles.map(a=>a??0),base.spatial.measuredAngles.map(a=>a??0),1e-7);assert.deepEqual(pose,before);
});

test('direction cube uses the full persisted camera rather than discarding roll and orient',()=>{
  const base={yaw:.3,pitch:.2,zoom:1,roll:.4},view=diagramSimulationSurfaceViewFromCamera(base,rotateDiagramCameraAxis(diagramSimulationSurfaceOrbitCamera(base),'z',.7));
  const m=viewRotationFor(view);
  for(const face of simulationViewCubeFaces(view))face.corners.forEach((p,i)=>{const q=point(m,p);close(face.points[i],[52+q[0]*21,51-q[1]*21]);});
});
