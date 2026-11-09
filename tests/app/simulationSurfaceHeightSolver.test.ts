import test from 'node:test';
import assert from 'node:assert/strict';
import {solveSimulationSurfacePanelHeights,type SimulationSurfaceHeightConstraint,type SimulationSurfaceHeightPanel} from '../../src/engine/simSurfaceHeightSolver';

const panels:SimulationSurfaceHeightPanel[]=Array.from({length:3},()=>({center:[0,0],scale:1}));
const height=(coefficients:Float64Array,panel:number,point:readonly number[])=>coefficients[panel*3]*point[0]+coefficients[panel*3+1]*point[1]+coefficients[panel*3+2];
const verify=(coefficients:Float64Array,constraints:SimulationSurfaceHeightConstraint[])=>{
  for(const row of constraints)assert.ok(height(coefficients,row.above,row.point)-height(coefficients,row.below,row.point)>=row.gap-1e-6,'every original layer inequality holds');
};

test('complete planar sheets can keep a trusted local cycle without subdivision or a false global rank',()=>{
  const constraints:SimulationSurfaceHeightConstraint[]=[];
  for(const [above,below,x,y] of [[0,1,-1,0],[1,2,0,1],[2,0,1,0]]){
    for(const [dx,dy] of [[-.05,-.05],[.05,-.05],[.05,.05],[-.05,.05]])constraints.push({above,below,point:[x+dx,y+dy],gap:1});
  }
  const before=structuredClone({panels,constraints}),solution=solveSimulationSurfacePanelHeights({panels,constraints});
  assert.equal(solution.status,'solved');verify(solution.coefficients,constraints);
  assert.ok(solution.coefficients.some((value,i)=>i%3!==2&&Math.abs(value)>.01),'the cycle uses whole-plane tilt rather than an invented constant order');
  assert.deepEqual({panels,constraints},before,'geometry and trusted layer constraints remain immutable');
});

test('an incompatible same-location cycle is never reported as a partial success',()=>{
  const constraints:SimulationSurfaceHeightConstraint[]=[[0,1],[1,2],[2,0]].map(([above,below])=>({above,below,point:[0,0],gap:1}));
  const result=solveSimulationSurfacePanelHeights({panels,constraints,maxSweeps:40});
  assert.equal(result.status,'inconclusive');assert.ok(result.maxViolation>1e-6);assert.ok(result.reason);
});

test('different panel coordinate scales preserve the world-space gap constraints',()=>{
  const scaled:SimulationSurfaceHeightPanel[]=[{center:[-20,400],scale:.03},{center:[30,-80],scale:200}];
  const constraints:SimulationSurfaceHeightConstraint[]=[[0,0],[.5,1],[-2,.25]].map(point=>({above:0,below:1,point:point as [number,number],gap:2}));
  const result=solveSimulationSurfacePanelHeights({panels:scaled,constraints});
  assert.equal(result.status,'solved');
  for(const row of constraints){
    const h=(p:number)=>result.coefficients[p*3]*(row.point[0]-scaled[p].center[0])/scaled[p].scale+result.coefficients[p*3+1]*(row.point[1]-scaled[p].center[1])/scaled[p].scale+result.coefficients[p*3+2];
    assert.ok(h(0)-h(1)>=row.gap-1e-6);
  }
});

test('invalid or oversized layer constraints reject before attempting a layout',()=>{
  const valid:SimulationSurfaceHeightConstraint={above:0,below:1,point:[0,0],gap:1};
  for(const problem of [
    {panels,constraints:[valid],maxRows:0},
    {panels,constraints:[{...valid,above:9}]},
    {panels,constraints:[{...valid,point:[NaN,0] as [number,number]}]},
    {panels:[{center:[0,0] as [number,number],scale:0}],constraints:[]},
  ])assert.equal(solveSimulationSurfacePanelHeights(problem).status,'inconclusive');
});
