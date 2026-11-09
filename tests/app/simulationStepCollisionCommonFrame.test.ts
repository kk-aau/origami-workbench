import test from 'node:test';
import assert from 'node:assert/strict';
import {certifySimulationStepPath,createSimulationStepTangentProjector,inspectSimulationStepCollisions} from '../../src/engine/simStepCollision';

const rotate=(x:number,y:number,z:number,angle:number)=>{
  const c=Math.cos(angle),s=Math.sin(angle),rx=x*c+z*s,rz=-x*s+z*c;
  return [rx,y*c-rz*s,y*s+rz*c];
};

test('common ancestor rotations cancel from the entire moving-plane certificate',()=>{
  const seed=[0,0,0,2,0,0,0,2,0,0,0,1,2,0,1,0,2,1];
  const phase={start:0,end:1,fromAngles:[0,0,0,0],toAngles:[180,180,0,0],kind:'linear' as const};
  const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[3,3,3,4,4,4],fromAngles:phase.fromAngles,
    bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[0,1],sign:1},{parent:1,crease:1,axisVertices:[0,2],sign:1},{parent:2,crease:2,axisVertices:[0,1],sign:1},{parent:2,crease:3,axisVertices:[3,4],sign:1}]},[phase]);
  const evaluate=(p:number)=>Float64Array.from(seed.flatMap((_,i)=>i%3?[]:rotate(seed[i],seed[i+1],seed[i+2],p*Math.PI)));
  assert.equal(project.separates(0,1,[0,1,2],[3,4,5],[]),true,'both common joints are removed before the full-interval sign proof');
  const certificate=certifySimulationStepPath({indices:[0,1,2,3,4,5],triangleBodies:[3,4]},
    {evaluate,motionBound:(a,b)=>20*Math.PI*(b-a),contactSeparation:project.separates,contactTransition:project.contactTransition},{maxEvaluations:3});
  assert.equal(certificate.status,'clear');assert.equal(certificate.evaluations,3,'the original full interval is certified without finite-frame acceptance or subdivision');
  // Relative-frame symbolic builds must not contaminate later world projections.
  const bounds=project(.1,.4,[.3,-.4,.5]);
  for(let k=0;k<=30;k++){
    const pose=evaluate(.1+.3*k/30);
    for(let v=0;v<6;v++){const actual=.3*pose[v*3]-.4*pose[v*3+1]+.5*pose[v*3+2];assert.ok(actual>=bounds.min[v]&&actual<=bounds.max[v]);}
  }
});

test('removing common ancestor motion preserves a genuine relative triangle crossing',()=>{
  const seed=[-2,-2,0,2,-2,0,0,2,0,0,-1,1,0,1,1,0,0,2,-2,0,0,2,0,0,0,-2,0,0,2,0];
  const phase={start:0,end:1,fromAngles:[0,0,0],toAngles:[180,180,180],kind:'linear' as const};
  const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[2,2,2,3,3,3,2,2,2,2],fromAngles:phase.fromAngles,
    bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[6,7],sign:1},{parent:1,crease:1,axisVertices:[8,9],sign:1},{parent:2,crease:2,axisVertices:[6,7],sign:1}]},[phase]);
  const evaluate=(p:number)=>{
    const angle=p*Math.PI,c=Math.cos(angle),s=Math.sin(angle);
    return Float64Array.from(seed.flatMap((_,i)=>{
      if(i%3)return [];const v=i/3,x=seed[i],y=seed[i+1],z=seed[i+2];
      return rotate(x,v>=3&&v<=5?y*c-z*s:y,v>=3&&v<=5?y*s+z*c:z,angle);
    }));
  };
  const mesh={indices:[0,1,2,3,4,5],triangleBodies:[2,3]};
  assert.equal(project.separates(0,1,[0,1,2],[3,4,5],[]),false);
  for(const p of [0,1])assert.equal(inspectSimulationStepCollisions(mesh,evaluate(p)).status,'clear');
  assert.equal(inspectSimulationStepCollisions(mesh,evaluate(.5)).status,'collision');
  const certificate=certifySimulationStepPath(mesh,{evaluate,motionBound:(a,b)=>100*Math.PI*(b-a),contactSeparation:project.separates,contactTransition:project.contactTransition});
  assert.equal(certificate.status,'collision');assert.equal(certificate.progress,.5);
});
