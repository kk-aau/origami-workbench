import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {previewClippedCoordinates,type PaperClipPreviewRecipe} from '../src/app/tessellationPaperClipPreview';
import {shrinkAndTwist} from '../src/app/primalDualParams';
import type {TessGraph,TessPaperSpec,XY} from '../src/app/tessellation';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
type Params={family:'periodic';tiling:'square';rows:number;columns:number;angle:number;scale:number;paper:TessPaperSpec;parameterization?:'gamma-alpha';gamma?:number;pleatAngle?:number;twistDirection?:'ccw'|'cw';postRotation?:'none'|'primal'|'dual'};
type CustomParams={family:'custom';vertices:XY[];faces:number[][];repeatX:number;repeatY:number;angle:number;scale:number;paper:TessPaperSpec;parameterization:'gamma-alpha';gamma:number;pleatAngle:number;twistDirection:'ccw'|'cw';postRotation:'dual'};
type Reply={fold:TessGraph;source:{paperClipPreview:PaperClipPreviewRecipe}};
function generate(params:Params|CustomParams):Reply {
  const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
    cwd:root,input:JSON.stringify(params),encoding:'utf8',timeout:30000,maxBuffer:12*1024*1024,
    windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.error?.message||run.stderr);
  return JSON.parse(run.stdout) as Reply;
}
function edges(fold:TessGraph,coords:XY[]=fold.vertices_coords){
  const point=(p:XY)=>p.map(v=>v.toFixed(6)).join(',');
  return fold.edges_vertices.map(([a,b],i)=>`${[point(coords[a]),point(coords[b])].sort().join('|')}:${fold.edges_assignment[i]}`).sort();
}
const base:Params={family:'periodic',tiling:'square',rows:3,columns:3,angle:36,scale:.3,paper:{shape:'square',margin:.1}};
const initial=generate(base),recipe=initial.source.paperClipPreview;
assert.equal(recipe.kind,'convex-clip-v1');
const stationary=previewClippedCoordinates(initial.fold,base,recipe);
assert.ok(stationary,'base recipe must reproduce its own clipped geometry');
for(let i=0;i<stationary.length;i++)assert.ok(Math.hypot(stationary[i][0]-initial.fold.vertices_coords[i][0],stationary[i][1]-initial.fold.vertices_coords[i][1])<1e-7);
for(const next of [{...base,angle:36.5,scale:.31},{...base,angle:32,scale:.35}]){
  const started=performance.now(),predicted=previewClippedCoordinates(initial.fold,next,recipe),elapsed=performance.now()-started;
  const exact=generate(next);
  if(predicted){
    assert.deepEqual(edges(initial.fold,predicted),edges(exact.fold),`preview must equal independently regenerated clipped CP at ${next.angle} / ${next.scale}`);
  }else{
    assert.notEqual(exact.fold.edges_vertices.length,initial.fold.edges_vertices.length,'null preview needs a real topology change');
  }
  assert.ok(elapsed<100,`preview too slow: ${elapsed.toFixed(1)} ms`);
  console.log(`angle ${next.angle}, scale ${next.scale}: ${predicted?`${initial.fold.edges_vertices.length} clipped edges match worker`:'topology changed; wait for worker'}; preview ${elapsed.toFixed(1)} ms`);
}
const changed={...base,paper:{shape:'regular',sides:6,margin:.1} as TessPaperSpec};
assert.equal(previewClippedCoordinates(initial.fold,changed,recipe),null,'different paper shape waits for worker');
for(const paper of [{shape:'rectangle',aspect:1.5,margin:.1},{shape:'regular',sides:6,margin:.1}] as TessPaperSpec[]){
  const start={...base,paper},next={...start,angle:36.5,scale:.31};
  const first=generate(start),updated=generate(next),preview=previewClippedCoordinates(first.fold,next,first.source.paperClipPreview);
  assert.ok(preview,`${paper.shape} small parameter change should retain topology`);
  assert.deepEqual(edges(first.fold,preview),edges(updated.fold));
  console.log(`${paper.shape}: ${first.fold.edges_vertices.length} moving crease edges exactly match worker`);
}
const gammaBase:Params={...base,rows:2,columns:2,...shrinkAndTwist(.5,30),
  parameterization:'gamma-alpha',gamma:.5,pleatAngle:30,twistDirection:'ccw',postRotation:'none'};
const gammaStart=generate(gammaBase);
for(const postRotation of ['none','primal','dual'] as const){
  const next:Params={...gammaBase,...shrinkAndTwist(.6,42),gamma:.6,pleatAngle:42,postRotation};
  const predicted=previewClippedCoordinates(gammaStart.fold,next,gammaStart.source.paperClipPreview);
  assert.ok(predicted,`gamma/alpha ${postRotation} should keep clipped topology`);
  const exact=generate(next);
  assert.deepEqual(edges(gammaStart.fold,predicted),edges(exact.fold),`gamma/alpha ${postRotation} preview must match worker`);
  console.log(`gamma/alpha ${postRotation}: ${gammaStart.fold.edges_vertices.length} edges match worker`);
}
const customBase:CustomParams={family:'custom',
  vertices:[[0,0],[.35,0],[1,0],[0,1],[.35,1],[1,1]],
  faces:[[0,1,4,3],[1,2,5,4]],repeatX:2,repeatY:2,
  ...shrinkAndTwist(.5,30),paper:{shape:'square',margin:.1},
  parameterization:'gamma-alpha',gamma:.5,pleatAngle:30,twistDirection:'ccw',postRotation:'dual'};
const customStart=generate(customBase);
const customNext:CustomParams={...customBase,...shrinkAndTwist(.51,31),gamma:.51,pleatAngle:31};
const customPreview=previewClippedCoordinates(customStart.fold,customNext,customStart.source.paperClipPreview);
assert.ok(customPreview,'asymmetric unit should preview without realignment');
assert.deepEqual(edges(customStart.fold,customPreview),edges(generate(customNext).fold));
console.log('asymmetric custom unit: moving edges and paper alignment match worker');
