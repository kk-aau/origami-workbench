import assert from 'node:assert/strict';
import test from 'node:test';
import {
  certifySimulationStepPath,
  createSimulationStepIntervalProjector,
  createSimulationStepTangentProjector,
  inspectSimulationStepCollisions,
  type SimulationStepCollisionMesh,
} from '../../src/engine/simStepCollision';
import {simulationDegreeFourFixture} from '../fixtures/simulationStepComplex';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';

const mesh:SimulationStepCollisionMesh={indices:[0,1,2,3,4,5],triangleBodies:[0,1],triangleSourceFaces:[8,12]};
const horizontal=[-2,-2,0,2,-2,0,0,2,0];
const vertical=(z:number)=>[0,-.5,z-.8,0,.5,z-.8,0,0,z+.8];
const pose=(z:number)=>new Float64Array([...horizontal,...vertical(z)]);

test('static triangle collision reports the original material face pair',()=>{
  const collision=inspectSimulationStepCollisions(mesh,pose(0));
  assert.equal(collision.status,'collision');
  assert.deepEqual(collision.pairs[0].faces,[8,12]);
  assert.deepEqual(collision.pairs[0].triangles,[0,1]);
  assert.equal(inspectSimulationStepCollisions(mesh,pose(2)).status,'clear');
});

test('continuous bounds find a crossing missed at all nine uniformly sampled frames',()=>{
  const evaluate=(t:number)=>pose(1-1.5*Math.sin(8*Math.PI*t)**2);
  for(let i=0;i<=8;i++)assert.equal(inspectSimulationStepCollisions(mesh,evaluate(i/8)).status,'clear');
  const certificate=certifySimulationStepPath(mesh,{
    evaluate,
    // |d(-1.5sin²(8pi t))/dt| <= 12pi. Relative to an interval
    // midpoint, maximum travel is therefore <= 6pi * interval length.
    motionBound:(a,b)=>[0,0,0,6*Math.PI*(b-a),6*Math.PI*(b-a),6*Math.PI*(b-a)],
  });
  assert.equal(certificate.status,'collision');
  assert.ok(certificate.progress!>0&&certificate.progress!<1);
  assert.ok(certificate.evaluations>3);
});

test('a shared material vertex does not hide a crossing farther down the face',()=>{
  const vertices=[0,0,0,2,0,0,0,2,0,1,1,1,1,1,-1];
  const inspection=inspectSimulationStepCollisions({indices:[0,1,2,0,3,4]},vertices);
  assert.equal(inspection.status,'collision');
  assert.deepEqual(inspection.pairs[0].sharedVertices,[0]);
});

test('a true shared hinge permits opening, closing and coplanar final contact',()=>{
  const hingeMesh={indices:[0,1,2,1,0,3],triangleBodies:[0,1]};
  const evaluate=(t:number)=>new Float64Array([0,0,0,1,0,0,0,1,0,0,-Math.cos(Math.PI*t),-Math.sin(Math.PI*t)]);
  const certificate=certifySimulationStepPath(hingeMesh,{evaluate,motionBound:(a,b)=>Math.PI*(b-a)/2});
  assert.equal(certificate.status,'clear');
  assert.ok(certificate.evaluations<=3);
});

test('pre-existing coplanar paper layers in one rigid component remain legal',()=>{
  const layeredMesh={...mesh,triangleBodies:[4,4]};
  const evaluate=(t:number)=>new Float64Array([-2,-2,t,2,-2,t,0,2,t,-1,-1,t,1,-1,t,0,1,t]);
  const certificate=certifySimulationStepPath(layeredMesh,{evaluate,motionBound:(a,b)=>(b-a)/2});
  assert.equal(certificate.status,'clear');
  assert.equal(inspectSimulationStepCollisions(layeredMesh,evaluate(0)).pairs[0].kind,'coplanar-contact');
});

test('a rigid-component identifier cannot conceal an already penetrated starting mesh',()=>{
  const certificate=certifySimulationStepPath({...mesh,triangleBodies:[0,0]},{evaluate:()=>pose(0),motionBound:()=>0});
  assert.equal(certificate.status,'collision');
  assert.equal(certificate.progress,0);
});

test('a stationary paper face is certified with zero displacement without modifying its coordinates',()=>{
  const initial=pose(3),copy=[...initial];
  const certificate=certifySimulationStepPath(mesh,{evaluate:()=>initial,motionBound:()=>0});
  assert.equal(certificate.status,'clear');
  assert.deepEqual([...initial],copy);
});

test('budget exhaustion and unknown zero-gap motion never masquerade as collision-free paths',()=>{
  const samePlane=new Float64Array([...horizontal,...horizontal]);
  const budget=certifySimulationStepPath(mesh,{evaluate:()=>pose(3),motionBound:()=>10},{maxEvaluations:3});
  assert.equal(budget.status,'inconclusive');
  assert.match(budget.reason!,/预算/);
  const depth=certifySimulationStepPath(mesh,{evaluate:()=>samePlane,motionBound:()=>1},{maxDepth:2});
  assert.equal(depth.status,'inconclusive');
  assert.ok(depth.interval);
  const bad=certifySimulationStepPath(mesh,{evaluate:()=>samePlane,motionBound:()=>Number.NaN});
  assert.equal(bad.status,'inconclusive');
});

test('interval Rodrigues projections enclose every point of a nonlinear angle path',()=>{
  const seed=[0,0,0,1,0,0,0,1,0,1,1,0];
  const project=createSimulationStepIntervalProjector({initialPositions:seed,vertexBodies:[0,0,1,1],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[0,1],sign:1}]});
  const bounds=project([{min:0,max:180}],[0,0,1]);
  for(let i=0;i<=100;i++){
    const angle=Math.PI*(i/100)**2;
    for(const v of [2,3])assert.ok(Math.sin(angle)>=bounds.min[v]&&Math.sin(angle)<=bounds.max[v]);
  }
  assert.ok(bounds.min[2]>=-1e-10);
  assert.ok(bounds.max[2]>=1);
});

test('interval separating planes certify a zero-gap layer opening without skipping the interval',()=>{
  const seed=[0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0];
  const project=createSimulationStepIntervalProjector({initialPositions:seed,vertexBodies:[0,0,0,1,1,1],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[3,4],sign:1}]});
  const evaluate=(t:number)=>new Float64Array([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,Math.cos(Math.PI*t),Math.sin(Math.PI*t)]);
  const certificate=certifySimulationStepPath(mesh,{evaluate,motionBound:(a,b)=>Math.PI*(b-a)/2,projectionBounds:(a,b,axis,origin)=>project([{min:180*a,max:180*b}],axis,origin)});
  assert.equal(certificate.status,'clear');
  assert.ok(certificate.evaluations<=3);
});

test('a rotating shared-vertex fan can be certified while its shared point remains exactly fixed',()=>{
  const seed=[0,0,0,2,0,0,0,2,0,-2,0,0,0,-2,0];
  const fanMesh={indices:[0,1,2,0,3,4],triangleBodies:[0,1]};
  const project=createSimulationStepIntervalProjector({initialPositions:seed,vertexBodies:[0,0,0,1,1],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[0,1],sign:1}]});
  const evaluate=(t:number)=>new Float64Array([0,0,0,2,0,0,0,2,0,-2,0,0,0,-2*Math.cos(t),-2*Math.sin(t)]);
  const certificate=certifySimulationStepPath(fanMesh,{evaluate,motionBound:(a,b)=>b-a,projectionBounds:(a,b,axis,origin)=>project([{min:a*180/Math.PI,max:b*180/Math.PI}],axis,origin)});
  assert.equal(certificate.status,'clear');
});

test('multijoint interval projections contain composed rotations and relative material coordinates',()=>{
  const seed=[0,0,0,1,0,0,0,1,0,0,1,1,1,1,1];
  const project=createSimulationStepIntervalProjector({initialPositions:seed,vertexBodies:[0,0,1,1,2],fromAngles:[0,0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[0,1],sign:1},{parent:1,crease:1,axisVertices:[2,3],sign:1}]});
  const bounds=project([{min:10,max:70},{min:-40,max:20}],[.3,-.4,.5],0);
  for(let i=0;i<=100;i++){
    const a=(10+60*i/100)*Math.PI/180,b=(-40+60*(i/100)**2)*Math.PI/180;
    // First rotate the leaf around seed Z through (0,1,0), then the
    // resulting point around the root's X axis.
    const p=[Math.cos(b),1+Math.sin(b),1],y=p[1]*Math.cos(a)-p[2]*Math.sin(a),z=p[1]*Math.sin(a)+p[2]*Math.cos(a),value=.3*p[0]-.4*y+.5*z;
    assert.ok(value>=bounds.min[4]&&value<=bounds.max[4]);
  }
});

test('a real four-sector closed vertex has a continuous rotating separation certificate through its flat endpoint',()=>{
  for(const [minority,precrease] of [[0,false],[1,false],[0,true]] as const){
    const {prepared,animation}=simulationDegreeFourFixture(minority,precrease),motion=planSimulationStepPath(prepared,animation),path=createSimulationStepPathEvaluator(prepared,animation,motion),m=path.mechanism;
    const project=createSimulationStepTangentProjector({initialPositions:m.seedPositions,vertexBodies:m.vertexBodies,fromAngles:m.fromAngles,bodies:m.components.map(body=>({parent:body.parent,crease:body.parentCrease,sign:body.rotationSign,axisVertices:body.parentCrease===null?undefined:prepared.edgesVertices[prepared.creaseParams[body.parentCrease].edge]}))},motion.phases);
    const certificate=certifySimulationStepPath({indices:prepared.indices,triangleBodies:m.triangleBodies},{evaluate:path.evaluate,motionBound:path.motionBound,projectionBounds:(a,b,axis,origin)=>project(a,b,axis,origin,path.angleBounds(a,b)),contactSeparation:project.separates,contactTransition:project.contactTransition});
    assert.equal(certificate.status,'clear');
    assert.ok(certificate.certifiedIntervals>0);
    assert.ok(certificate.evaluations<100);
    for(let i=0;i<=50;i++){
      const a=i/51,b=(i+1)/51,axis:[number,number,number]=[.3,-.4,.5],bounds=project(a,b,axis,0,path.angleBounds(a,b));
      for(const t of [a,(a+b)/2,b]){
        const exact=m.evaluateAngles(path.angles(t)).positions;
        for(let v=0;v<m.vertexBodies.length;v++){
          const actual=axis.reduce((sum,c,k)=>sum+c*(exact[3*v+k]-exact[k]),0);
          assert.ok(actual>=bounds.min[v]-1e-10&&actual<=bounds.max[v]+1e-10,`${minority}/${precrease}: projected interval missed vertex ${v}`);
        }
      }
    }
  }
});

test('a sheet cannot exchange sides by passing through an interior coplanar overlap',()=>{
  for(const depth of [1,.7]){
  const seed=[0,0,0,2,0,0,0,2,0,1,-1,-depth,-1,-1,-depth],crossingMesh={indices:[0,1,2,0,3,4],triangleBodies:[0,1]};
  const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[0,0,0,1,1],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[0,1],sign:1}]},[{start:0,end:1,fromAngles:[0],toAngles:[180],kind:'linear'}]);
  const evaluate=(t:number)=>{const angle=Math.PI*t,y=-Math.cos(angle)+depth*Math.sin(angle),z=-Math.sin(angle)-depth*Math.cos(angle);return new Float64Array([0,0,0,2,0,0,0,2,0,1,y,z,-1,y,z]);};
  const certificate=certifySimulationStepPath(crossingMesh,{evaluate,motionBound:(a,b)=>Math.sqrt(2)*Math.PI*(b-a)/2,projectionBounds:(a,b,axis,origin)=>project(a,b,axis,origin,[{min:a*180,max:b*180}]),contactSeparation:project.separates,contactTransition:project.contactTransition});
  assert.notEqual(certificate.status,'clear');
  }
});

test('initial normal separation uses the analytic first coefficient even for a very slow half-angle branch',()=>{
  const seed=[0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],weightsA:[[number,number],[number,number],[number,number]]=[[3,1/3],[4,1/3],[5,1/3]],weightsB:[[number,number],[number,number],[number,number]]=[[0,1/3],[1,1/3],[2,1/3]];
  for(const k of [1e-5,1,1e5])for(const sign of [-1,1] as const){
    const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[0,0,0,1,1,1],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[0,1],sign}]},[{start:0,end:1,fromAngles:[0],toAngles:[180],kind:'tangent',coefficients:[k]}]);
    assert.equal(project.initialContactSide([0,1,2],weightsA,weightsB),sign);
  }
});

test('the broad-phase deadline cannot be bypassed by parallel triangles',()=>{
  const coplanar=new Float64Array([...horizontal,...horizontal]);
  const certificate=certifySimulationStepPath(mesh,{evaluate:()=>coplanar,motionBound:()=>0},{maxTimeMs:0});
  assert.equal(certificate.status,'inconclusive');
  assert.match(certificate.reason!,/预算/);
});

test('a material moving-plane proof without shared vertex IDs never certifies a genuine crossing',()=>{
  const seed=[...horizontal,0,-1,1,0,1,1,0,0,2,-2,0,0,2,0,0];
  const phase={start:0,end:1,fromAngles:[0],toAngles:[180],kind:'linear' as const};
  const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[0,0,0,1,1,1,0,0],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[6,7],sign:1}]},[phase]);
  const evaluate=(progress:number)=>{
    const angle=progress*Math.PI,c=Math.cos(angle),s=Math.sin(angle),result=[...seed];
    for(const v of [3,4,5]){result[v*3+1]=seed[v*3+1]*c-seed[v*3+2]*s;result[v*3+2]=seed[v*3+1]*s+seed[v*3+2]*c;}return Float64Array.from(result);
  };
  assert.equal(project.separates(0,1,[0,1,2],[3,4,5],[]),false);
  assert.equal(inspectSimulationStepCollisions(mesh,evaluate(0)).status,'clear');assert.equal(inspectSimulationStepCollisions(mesh,evaluate(1)).status,'clear');
  const result=certifySimulationStepPath(mesh,{evaluate,motionBound:(a,b)=>Math.PI*(b-a),projectionBounds:(a,b,axis,origin)=>project(a,b,axis,origin,[{min:a*180,max:b*180}]),contactSeparation:project.separates,contactTransition:project.contactTransition});
  assert.equal(result.status,'collision');assert.ok(result.progress!>0&&result.progress!<1);assert.deepEqual(result.pairs[0].sharedVertices,[]);
});

test('unwelded triangles cannot swap sides through an internal coplanar overlap',()=>{
  const seed=[0,0,0,2,0,0,0,2,0,0,0,0,1,-1,-1,-1,-1,-1,-2,0,0,2,0,0],phase={start:0,end:1,fromAngles:[0],toAngles:[180],kind:'linear' as const};
  const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[0,0,0,1,1,1,0,0],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[6,7],sign:1}]},[phase]);
  const evaluate=(progress:number)=>{const angle=progress*Math.PI,c=Math.cos(angle),s=Math.sin(angle),result=[...seed];for(const v of [3,4,5]){result[v*3+1]=seed[v*3+1]*c-seed[v*3+2]*s;result[v*3+2]=seed[v*3+1]*s+seed[v*3+2]*c;}return Float64Array.from(result);};
  assert.equal(project.separates(.5,1,[0,1,2],[3,4,5],[]),false);assert.equal(project.contactTransition(.75,[0,1,2],[3,4,5]),'crossing');
  for(const progress of [0,1])assert.equal(inspectSimulationStepCollisions(mesh,evaluate(progress)).status,'clear');
  const result=certifySimulationStepPath(mesh,{evaluate,motionBound:(a,b)=>Math.sqrt(2)*Math.PI*(b-a)/2,projectionBounds:(a,b,axis,origin)=>project(a,b,axis,origin,[{min:a*180,max:b*180}]),contactSeparation:project.separates,contactTransition:project.contactTransition});
  assert.equal(result.status,'collision');assert.equal(result.progress,.75);assert.match(result.reason!,/交换/);
});

test('cached lazy tangent projections retain exact interval bounds regardless of vertex access order or caller axis mutation',()=>{
  const seed=[0,0,0,1,0,0,0,1,0,1,1,0],input={initialPositions:seed,vertexBodies:[0,0,1,1],fromAngles:[0],bodies:[{parent:null,crease:null,sign:1 as const},{parent:0,crease:0,axisVertices:[0,1] as const,sign:1 as const}]};
  const phases=[{start:0,end:1,fromAngles:[0],toAngles:[180],kind:'linear' as const}],project=createSimulationStepTangentProjector(input,phases),axis:[number,number,number]=[.3,-.4,.5],before=structuredClone({input,phases});
  const bounds=project(.1,.45,axis,0);axis[0]=99;axis[1]=100;axis[2]=101;
  for(const v of [3,1,2,0,3])for(let sample=0;sample<=30;sample++){
    const angle=(.1+.35*sample/30)*Math.PI,x=seed[v*3],y=v<2?seed[v*3+1]:seed[v*3+1]*Math.cos(angle),z=v<2?seed[v*3+2]:seed[v*3+1]*Math.sin(angle),actual=.3*x-.4*y+.5*z;
    assert.ok(actual>=bounds.min[v]-1e-12&&actual<=bounds.max[v]+1e-12);
  }
  assert.equal(project(.1,.45,[.3,-.4,.5],0),bounds,'exact identical requests reuse the original certified result');
  assert.equal(bounds.min.length,input.vertexBodies.length);assert.ok(Array.from(bounds.min).every(Number.isFinite));assert.ok(Array.from(bounds.max).every(Number.isFinite));
  assert.deepEqual({input,phases},before);
});

test('nonshared material planes cannot change their separation side between phases away from the global midpoint',()=>{
  const seed=[...horizontal,-.25,.5,0,.25,.5,0,0,1,0,0,0,0,1,0,0];
  const phases=[{start:0,end:.25,fromAngles:[0,0],toAngles:[180,0],kind:'linear' as const},{start:.25,end:1,fromAngles:[180,0],toAngles:[180,180],kind:'linear' as const}];
  const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[0,0,0,2,2,2,0,0],fromAngles:[0,0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[6,7],sign:1},{parent:1,crease:1,axisVertices:[6,7],sign:1}]},phases);
  const evaluate=(progress:number)=>{
    const angle=progress<=.25?Math.PI*progress/.25:Math.PI+Math.PI*(progress-.25)/.75,result=[...seed];
    for(const v of [3,4,5]){result[v*3+1]=seed[v*3+1]*Math.cos(angle);result[v*3+2]=seed[v*3+1]*Math.sin(angle);}return Float64Array.from(result);
  };
  assert.equal(project.contactTransition(.25,[0,1,2],[3,4,5]),'crossing');
  assert.equal(project.separates(0,1,[0,1,2],[3,4,5],[]),false,'separate phase certificates must not combine opposite sides into one full-interval proof');
  const result=certifySimulationStepPath(mesh,{evaluate,motionBound:(a,b)=>Math.PI/.25*(b-a)/2,projectionBounds:(a,b,axis,origin)=>project(a,b,axis,origin,[{min:0,max:180},{min:0,max:180}]),contactSeparation:project.separates,contactTransition:project.contactTransition});
  assert.equal(result.status,'collision');assert.equal(result.progress,.25);assert.match(result.reason!,/交换/);
});

test('a shared vertex does not permit a cross-phase side exchange at a noncentral contact boundary',()=>{
  const seed=[0,0,0,2,0,0,0,2,0,1,-1,0,-1,-1,0],sharedMesh={indices:[0,1,2,0,3,4],triangleBodies:[0,1]};
  const phases=[{start:0,end:.25,fromAngles:[0,0],toAngles:[180,0],kind:'linear' as const},{start:.25,end:1,fromAngles:[180,0],toAngles:[180,180],kind:'linear' as const}];
  const project=createSimulationStepTangentProjector({initialPositions:seed,vertexBodies:[0,0,0,2,2],fromAngles:[0,0],bodies:[{parent:null,crease:null,sign:1},{parent:0,crease:0,axisVertices:[0,1],sign:1},{parent:1,crease:1,axisVertices:[0,1],sign:1}]},phases);
  const evaluate=(progress:number)=>{const angle=progress<=.25?Math.PI*progress/.25:Math.PI+Math.PI*(progress-.25)/.75,result=[...seed];for(const v of [3,4]){result[v*3+1]=seed[v*3+1]*Math.cos(angle);result[v*3+2]=seed[v*3+1]*Math.sin(angle);}return Float64Array.from(result);};
  assert.equal(project.contactTransition(.25,[0,1,2],[0,3,4]),'crossing');assert.equal(project.separates(0,1,[0,1,2],[0,3,4],[0]),false);
  const result=certifySimulationStepPath(sharedMesh,{evaluate,motionBound:(a,b)=>Math.PI/.25*(b-a)/2,projectionBounds:(a,b,axis,origin)=>project(a,b,axis,origin,[{min:0,max:180},{min:0,max:180}]),contactSeparation:project.separates,contactTransition:project.contactTransition});
  assert.equal(result.status,'collision');assert.equal(result.progress,.25);
});
