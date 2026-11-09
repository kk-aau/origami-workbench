import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {polygonArea} from '../../src/core/geometry';
import {previewClippedCoordinates,type PaperClipPreviewRecipe} from '../../src/app/tessellationPaperClipPreview';
import type {TessGraph,TessPaperSpec,XY} from '../../src/app/tessellation';

type Fixture={source:TessGraph;preview:PaperClipPreviewRecipe['sourcePreview'];polygon:XY[];fold:TessGraph;moved:TessGraph};
let fixture:Fixture|undefined;
function generated():Fixture{
  if(fixture)return fixture;
  // Generate a genuine periodic CP, then crop a paper corner just across one
  // real source vertex. The retained triangular face is smaller than the
  // whole-sheet area tolerance but its edges exceed coordinate tolerance.
  const code=`import sys,json,math
sys.path.insert(0,'backend')
from tessellate import generate
from tessellation_paper_clip import clip_fold_to_convex_paper
core=generate(dict(family='periodic',tiling='square',rows=3,columns=3,angle=36,scale=.3))
source=core['fold'];preview=core['preview']
corner=min(source['vertices_coords'],key=lambda p:math.dist(p,[1.4668152387,1.290479663]))
polygon=[[corner[0]-3e-5,corner[1]-3e-5],[2.2,corner[1]-3e-5],[2.2,1.9],[corner[0]-3e-5,1.9]]
fold=clip_fold_to_convex_paper(source,polygon)['fold']
theta=math.radians(36.00001);c=.3*math.cos(theta);s=.3*math.sin(theta)
moved={**source,'vertices_coords':[[cx+c*x-s*y,cy+s*x+c*y] for cx,cy,x,y in preview['vertices']]}
new=clip_fold_to_convex_paper(moved,polygon)['fold']
print(json.dumps(dict(source=source,preview=preview,polygon=polygon,fold=fold,moved=new)))`;
  const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',code],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},
  });
  assert.equal(run.status,0,run.error?.message??run.stderr);
  fixture=JSON.parse(run.stdout) as Fixture;
  return fixture;
}
function input(){
  const f=generated(),paper:TessPaperSpec={shape:'rectangle',aspect:1.2,margin:.1};
  const recipe:PaperClipPreviewRecipe={kind:'convex-clip-v1',sourceFold:f.source,sourcePreview:f.preview,
    translation:[0,0],paper,polygon:f.polygon};
  return {f,paper,recipe};
}

test('real clipped thin triangles remain present during live preview and match a fresh backend clip',{timeout:20000},()=>{
  const {f,paper,recipe}=input();
  const span=Math.max(...[0,1].map(axis=>Math.max(...f.source.vertices_coords.map(p=>p[axis]))-Math.min(...f.source.vertices_coords.map(p=>p[axis]))));
  const areaEps=span*span*1e-9;
  const small=f.fold.faces_vertices.filter(face=>Math.abs(polygonArea(face.map(v=>f.fold.vertices_coords[v])))<areaEps);
  assert.ok(small.some(face=>face.length===3),'fixture must contain an actual retained thin triangular face');
  for(const face of small)for(let i=0;i<face.length;i++){
    const a=f.fold.vertices_coords[face[i]],b=f.fold.vertices_coords[face[(i+1)%face.length]];
    assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>span*1e-9);
  }
  const original=previewClippedCoordinates(f.fold,{angle:36,scale:.3,paper},recipe);
  const moved=previewClippedCoordinates(f.fold,{angle:36.00001,scale:.3,paper},recipe);
  assert.ok(original,'small true faces must not be erased by a whole-paper threshold');
  assert.ok(moved,'small true faces remain valid when the real source CP moves');
  assert.deepEqual(f.moved.faces_vertices,f.fold.faces_vertices);
  assert.deepEqual(f.moved.edges_vertices,f.fold.edges_vertices);
  assert.deepEqual(f.moved.edges_assignment,f.fold.edges_assignment);
  for(const [points,expected] of [[original,f.fold.vertices_coords],[moved,f.moved.vertices_coords]]){
    assert.equal(points.length,expected.length);
    points.forEach((p,i)=>assert.ok(Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])<1e-8,`vertex ${i}`));
  }
});

test('coordinate-degenerate crop corners and changed crease assignments still fail closed',()=>{
  const {f,paper,recipe}=input();
  const corner=f.source.vertices_coords.reduce((a,b)=>Math.hypot(a[0]-1.4668152387,a[1]-1.290479663)<Math.hypot(b[0]-1.4668152387,b[1]-1.290479663)?a:b);
  const polygon:XY[]=[[corner[0]-1e-11,corner[1]-1e-11],[2.2,corner[1]-1e-11],[2.2,1.9],[corner[0]-1e-11,1.9]];
  assert.equal(previewClippedCoordinates(f.fold,{angle:36,scale:.3,paper},{...recipe,polygon}),null,
    'sub-resolution corner collapse must not preserve stale face IDs');
  const wrong=structuredClone(f.fold),edge=wrong.edges_assignment.findIndex(kind=>kind==='M'||kind==='V');
  assert.ok(edge>=0);wrong.edges_assignment[edge]=wrong.edges_assignment[edge]==='M'?'V':'M';
  assert.equal(previewClippedCoordinates(wrong,{angle:36,scale:.3,paper},recipe),null,'M/V inheritance remains exact');
  const reordered=structuredClone(f.fold);reordered.faces_vertices.reverse();
  assert.equal(previewClippedCoordinates(reordered,{angle:36,scale:.3,paper},recipe),null,'face IDs remain exact');
});
