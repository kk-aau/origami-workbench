import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {WebglSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/webglSolver';

test('CPU diagnostics average nodal means with equal node weight, independently of edge mean',()=>{
  const {prepared}=prepareSimulationDocument({
    vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
    edges_assignment:['B','B','B','B','B','B','M'],
    edges_foldAngle:[null,null,null,null,null,null,-180],
    faces_vertices:[[0,1,4,5],[1,2,3,4]],
  });
  const model=new OrigamiModel(prepared),solver=new ReferenceSolver(model);
  try{
    const deformed=model.originalPositions.slice();
    deformed[0]+=.2;deformed[1]+=.08;
    solver.setInitialPositions(deformed,prepared.creaseParams.map(()=>0));
    // Independent geometric reference: visit every undirected edge exactly
    // once, then average each node's incident strains before averaging nodes.
    const total=new Float64Array(prepared.vertexCount),degree=new Uint32Array(prepared.vertexCount),edgeStrains:number[]=[];
    const length=(positions:Float32Array,a:number,b:number)=>Math.hypot(...[0,1,2].map(axis=>positions[a*3+axis]!-positions[b*3+axis]!));
    for(const [a,b] of prepared.edgesVertices){
      const strain=Math.abs(length(deformed,a,b)/length(model.originalPositions,a,b)-1);
      total[a]+=strain;total[b]+=strain;degree[a]++;degree[b]++;edgeStrains.push(strain);
    }
    const reference=Array.from(total,(sum,i)=>degree[i]?sum/degree[i]:0),expectedMean=reference.reduce((sum,value)=>sum+value,0)/reference.length;
    const edgeMean=edgeStrains.reduce((sum,value)=>sum+value,0)/edgeStrains.length;
    assert.ok(expectedMean>0&&Math.abs(expectedMean-edgeMean)>1e-4,'unequal node valence distinguishes the two statistics');
    const nodal=new Float32Array(prepared.vertexCount);solver.readStrain(nodal);
    const diagnostic=solver.readDiagnostics();
    assert.ok(Math.abs(diagnostic.meanNodalStrain!-expectedMean)<1e-7);
    assert.ok(Math.abs(diagnostic.maxNodalStrain!-Math.max(...reference))<1e-7);
    assert.ok(Math.abs(diagnostic.averageEdgeStrain!-edgeMean)<1e-7);
    assert.ok(Math.abs(nodal.reduce((sum,value)=>sum+value,0)/nodal.length-expectedMean)<1e-7);
    assert.equal(solver.readFrame().diagnostics.meanNodalStrain,diagnostic.meanNodalStrain);
    solver.reset();
    assert.equal(solver.readDiagnostics().meanNodalStrain,0);
    assert.equal(solver.readDiagnostics().maxNodalStrain,0);
  }finally{solver.dispose();}
});

test('GPU velocity readback caches the nodal mean, ignores texture padding and resets diagnostics',()=>{
  let readbacks=0;
  // Exercise the actual backend reducer and diagnostics method without a GL
  // context. Browser integration separately covers the shader-produced channel.
  const pixels=new Float32Array([.2,-.3,.1,.01, -.8,.1,0,.04, .4,0,0,.07, NaN,NaN,NaN,NaN]);
  const state={
    gl:{readTexture:(name:string)=>{assert.equal(name,'u_lastVelocity');readbacks++;return pixels;},updateTexture:()=>{}},
    nodeCount:3,diagnostics:{warnings:[],errors:[],webglAvailable:true},maxStrain:0,meanStrain:0,
    packed:{externalForces:new Float32Array(16),dims:{textureDim:2},thetaInit:new Float32Array(4)},
    vertexConstraintData:new Float32Array(16),
  } as unknown as WebglSolver;
  assert.ok(Math.abs(WebglSolver.prototype.maxVelocity.call(state)-.8)<1e-6);
  const diagnostic=WebglSolver.prototype.readDiagnostics.call(state);
  assert.ok(Math.abs(diagnostic.meanNodalStrain!-.04)<1e-7);
  assert.ok(Math.abs(diagnostic.maxNodalStrain!-.07)<1e-7);
  WebglSolver.prototype.readDiagnostics.call(state);
  assert.equal(readbacks,1,'status reads must not introduce another GPU stall');
  WebglSolver.prototype.reset.call(state);
  assert.equal(WebglSolver.prototype.readDiagnostics.call(state).meanNodalStrain,0);
  assert.equal(WebglSolver.prototype.readDiagnostics.call(state).maxNodalStrain,0);
  pixels[3]=NaN;
  assert.ok(Number.isNaN(WebglSolver.prototype.maxVelocity.call(state)));
  assert.ok(Number.isNaN(WebglSolver.prototype.readDiagnostics.call(state).meanNodalStrain));
});
