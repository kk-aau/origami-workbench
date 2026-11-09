import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {defaultEquilateralEllipseSource,ellipsePointsMatch,readEquilateralEllipseSource,solveEquilateralEllipse,type EquilateralEllipseSource} from '../../src/app/equilateralEllipse';
import {closedTubeSavedEllipsePreset,readClosedTubeParams} from '../../src/app/closedTubeParams';
import {joinedTubeEllipsePoints,joinedTubePreset,joinedTubeSavedEllipsePreset,readJoinedTubeParams} from '../../src/app/joinedTubeParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey} from '../../src/app/tessellation';

const python=path.resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
function checkEquations(source:EquilateralEllipseSource,points:[number,number][]){
  const [a,b]=source.semiAxes,theta=source.rotationDeg*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
  const lengths=points.map(([x,y],i)=>{
    const u=c*x+s*y,v=-s*x+c*y;
    assert.ok(Math.abs(u*u/(a*a)+v*v/(b*b)-1)<2e-12);
    const next=points[(i+1)%points.length];return Math.hypot(x-next[0],y-next[1]);
  });
  assert.ok(Math.max(...lengths)-Math.min(...lengths)<2e-10*a);
  const phi=source.phaseDeg*Math.PI/180,r=1/Math.sqrt(Math.cos(phi)**2/a**2+Math.sin(phi)**2/b**2);
  assert.ok(Math.hypot(points[0][0]-r*Math.cos(phi+theta),points[0][1]-r*Math.sin(phi+theta))<2e-12*a);
}

test('In[458] numerical equations cover every count 3–48 with a nonzero source phase and rotation',()=>{
  for(let count=3;count<=48;count++){
    const source={...defaultEquilateralEllipseSource(count),phaseDeg:17,rotationDeg:-31};
    checkEquations(source,solveEquilateralEllipse(source));
  }
});

test('In[459] phi=theta=45 uses the literal first polar point and recomputes equal chords',()=>{
  const base=defaultEquilateralEllipseSource(16),source={...base,phaseDeg:45,rotationDeg:45};
  const points=solveEquilateralEllipse(source);checkEquations(source,points);
  assert.ok(Math.abs(points[0][0])<1e-15);
  assert.ok(Math.abs(points[0][1]-Math.sqrt(2/(1+1/base.semiAxes[0]**2)))<1e-14);
  const chord=(p:[number,number][])=>Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);
  assert.ok(Math.abs(chord(points)-.5169150501386995)<1e-12);
  assert.ok(Math.abs(chord(points)-chord(solveEquilateralEllipse(base)))>1e-5);
});

test('saved 16/24 golden ellipse vertices match generated source without changing the old fixtures',()=>{
  const closed=closedTubeSavedEllipsePreset(),joined=joinedTubeSavedEllipsePreset();
  assert.ok(ellipsePointsMatch(closed.points,solveEquilateralEllipse(closed.ellipseSource!)));
  assert.ok(ellipsePointsMatch(joined.bottomPoints,solveEquilateralEllipse(joined.ellipseSource!.ellipse)));
  assert.equal(closed.points[1][0],1.421208662185828);
  assert.equal(joined.bottomPoints[1][0],1.525354458859344);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(closed))),closed);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(joined))),joined);
});

test('source readers reject wrong phase, vertex ordering, top transform and extra source fields',()=>{
  const closed=closedTubeSavedEllipsePreset(),joined=joinedTubeSavedEllipsePreset();
  assert.equal(readClosedTubeParams({...closed,ellipseSource:{...closed.ellipseSource,phaseDeg:1}}),null);
  assert.equal(readClosedTubeParams({...closed,points:[...closed.points.slice(1),closed.points[0]]}),null);
  assert.equal(readClosedTubeParams({...closed,ellipseSource:{...closed.ellipseSource,other:0}}),null);
  assert.equal(readJoinedTubeParams({...joined,ellipseSource:{...joined.ellipseSource,topShift:2}}),null);
  assert.equal(readJoinedTubeParams({...joined,ellipseSource:{...joined.ellipseSource,topRotationDeg:91}}),null);
  assert.equal(readJoinedTubeParams({...joined,ellipseSource:{...joined.ellipseSource,pleatReduction:.5}}),null);
  assert.equal(readEquilateralEllipseSource({...closed.ellipseSource,count:49}),null);
  assert.equal(readEquilateralEllipseSource({...closed.ellipseSource,semiAxes:[4.1,1]}),null);
  assert.equal(readEquilateralEllipseSource({...closed.ellipseSource,count:3.5}),null);
  assert.equal(readEquilateralEllipseSource({...closed.ellipseSource,phaseDeg:true}),null);
});

test('minimum semi-axis source retains the same relative matching tolerance as a unit ellipse',()=>{
  for(const scale of [.001,1]){
    const ellipseSource={...defaultEquilateralEllipseSource(),semiAxes:[1.5*scale,scale] as [number,number],phaseDeg:23,rotationDeg:19};
    const points=solveEquilateralEllipse(ellipseSource),params={...closedTubeSavedEllipsePreset(),points,ellipseSource};
    assert.deepEqual(readClosedTubeParams(JSON.parse(JSON.stringify(params))),params);
    const altered=structuredClone(points);altered[0][0]+=1e-7*scale;
    assert.equal(readClosedTubeParams({...params,points:altered}),null);
  }
});

test('frontend results agree with independent backend literal-distance roots at high eccentricity and small scale',()=>{
  const sources=[{...defaultEquilateralEllipseSource(16),phaseDeg:45,rotationDeg:45},
    {...defaultEquilateralEllipseSource(3),semiAxes:[4,1] as [number,number],phaseDeg:31,rotationDeg:12},
    {...defaultEquilateralEllipseSource(48),semiAxes:[4,1] as [number,number],phaseDeg:17,rotationDeg:-31},
    {...defaultEquilateralEllipseSource(16),semiAxes:[.0015,.001] as [number,number],phaseDeg:23,rotationDeg:19},
    {...defaultEquilateralEllipseSource(12),semiAxes:[1,(1+Math.sqrt(5))/2] as [number,number],phaseDeg:23,rotationDeg:19}];
  const run=spawnSync(python,['-c','import json,sys; sys.path.insert(0,"backend"); from tessellation_equilateral_ellipse import solve_equilateral_ellipse; print(json.dumps([solve_equilateral_ellipse(s).tolist() for s in json.load(sys.stdin)]))'],{
    input:JSON.stringify(sources),encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.stderr);
  const results=JSON.parse(run.stdout) as [number,number][][];
  for(let i=0;i<sources.length;i++){assert.ok(ellipsePointsMatch(results[i],solveEquilateralEllipse(sources[i])));checkEquations(sources[i],results[i]);}
});

test('parameterized closed, joined and double ellipse sources pass actual static tube construction and adoption',()=>{
  const closedSource={...defaultEquilateralEllipseSource(16),phaseDeg:45,rotationDeg:45};
  const joinedSource={ellipse:{...defaultEquilateralEllipseSource(8),semiAxes:[1.25,1] as [number,number],phaseDeg:17,rotationDeg:15},topRotationDeg:30,topShift:0};
  const doubleSource={ellipse:{...defaultEquilateralEllipseSource(4),semiAxes:[1.1,1] as [number,number],phaseDeg:15,rotationDeg:10},topRotationDeg:45,topShift:0,pleatReduction:.5};
  const cases=[{...closedTubeSavedEllipsePreset(),ellipseSource:closedSource,points:solveEquilateralEllipse(closedSource)},
    {...joinedTubePreset('twist-joined-tube'),...joinedTubeEllipsePoints(joinedSource),ellipseSource:joinedSource},
    {...joinedTubePreset('double-joined-tube'),...joinedTubeEllipsePoints(doubleSource,true),ellipseSource:doubleSource}];
  for(const params of cases){
    const restored=readTessParams(JSON.parse(JSON.stringify(params)));assert.deepEqual(restored,params);
    const run=spawnSync(python,[path.resolve('backend/tessellate.py')],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,
      timeout:30000,maxBuffer:16*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
    assert.equal(run.status,0,run.stderr);
    const response=JSON.parse(run.stdout);assert.equal(response.stats.checks.geometry.status,'passed');
    assert.equal(response.source.ellipseSourceVerified,true);assert.deepEqual(response.source.ellipseSource,params.ellipseSource);
    assert.ok(response.source.maximumFaceDistanceError<1e-9);
    const prepared=prepareTessResult(response,restored!);assert.equal(canAdoptTess(prepared,false,tessConstructionKey(restored!),restored!),true);
    assert.deepEqual(prepared.doc.metadata?.tessellation&&readTessParams((prepared.doc.metadata.tessellation as {parameters:unknown}).parameters),params);
  }
});
