import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {computeFlatFold,computeFlatGeometry} from '../../src/core/flatFold';
import {prepareTessResult,type TessParams} from '../../src/app/tessellation';
import {postRotation,shrinkAndTwist} from '../../src/app/primalDualParams';

test('Origamica negative-alpha embedding matches an independent regeneration and a solvable flat fold',()=>{
 const params={family:'periodic',tiling:'square',rows:2,columns:2,
  parameterization:'gamma-alpha',gamma:.8,pleatAngle:20,twistDirection:'ccw',postRotation:'dual',
  ...shrinkAndTwist(.8,20)} satisfies TessParams;
 const negative={family:'periodic',tiling:'square',rows:2,columns:2,...shrinkAndTwist(.8,-20)};
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),
  ['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],
  {input:JSON.stringify([params,negative]),encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,OPENBLAS_NUM_THREADS:'1'}});
 assert.equal(run.status,0,run.stderr);
 const [cp,negativeGraph]=JSON.parse(run.stdout);
 const direct=cp.source.foldedForm as [number,number][];
 assert.equal(cp.source.foldedFormMethod,'Origamica gamma/-alpha direct construction');
 assert.equal(direct.length,cp.fold.vertices_coords.length);
 const labels=(a:number[])=>a.map(v=>v.toFixed(8)).join(',');
 const negativeIndex=new Map<string,number>(negativeGraph.preview.vertices.map((v:number[],i:number)=>[labels(v),i]));
 const scale=params.scale/negative.scale;
 const turn=(params.angle-negative.angle)*Math.PI/180+postRotation(params),c=Math.cos(turn),s=Math.sin(turn);
 cp.preview.vertices.forEach((coefficient:number[],i:number)=>{
  const j=negativeIndex.get(labels(coefficient));assert.notEqual(j,undefined);
  const [x,y]=negativeGraph.fold.vertices_coords[j!];
  assert.ok(Math.hypot(direct[i][0]-scale*(c*x-s*y),direct[i][1]-scale*(s*x+c*y))<1e-8);
 });
 const geometry=computeFlatGeometry(cp.fold,2e-6,{startingFace:0});
 assert.equal(geometry.geometry.status,'ready');
 const engine=geometry.geometry.vertices;
 for(let i=0;i<direct.length;i++)for(let j=i+1;j<direct.length;j++){
  const a=Math.hypot(direct[i][0]-direct[j][0],direct[i][1]-direct[j][1]);
  const b=Math.hypot(engine[i][0]-engine[j][0],engine[i][1]-engine[j][1]);
  assert.ok(Math.abs(a-b)<1e-7,`vertex pair ${i},${j}: ${a} vs ${b}`);
 }
 const result=computeFlatFold(prepareTessResult(cp,params).doc);
 assert.equal(result.geometry.status,'ready');
 assert.equal(result.layers.status,'solved');
});
