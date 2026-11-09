// Concept test for a real crop of a finite crease graph.  Kept separate from
// the product API until paper-shape semantics and layer results are settled.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeFlatGeometry,recomputeFlatLayers} from '../src/core/flatFold';
import {polygonArea} from '../src/core/geometry';
import {tessFlatRoot} from '../src/app/tessellationFlat';
import type {FoldGraph} from '../src/core/types';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const py=`import json,sys,time
from tessellate import generate
from tessellation_paper_clip import clip_fold_to_convex_paper,inscribed_paper_polygon
request=json.loads(sys.stdin.read())
started=time.perf_counter()
source=generate(request['params'])
fold=source['fold']
paper=inscribed_paper_polygon(fold,request['paperConfig']) if request.get('paperConfig') else request.get('paper')
if paper:
 result=clip_fold_to_convex_paper(fold,paper,source['source'].get('foldedForm'))
 fold=result['fold']
 kept={i for i,p in enumerate(source['fold']['vertices_coords']) if any((p[0]-q[0])**2+(p[1]-q[1])**2<1e-18 for q in fold['vertices_coords'])}
else:kept=set(range(len(fold['vertices_coords'])))
complete=sum(all(i in kept for i in face) for face in source['fold']['faces_vertices'])
print(json.dumps({'fold':fold,'paper':paper,'pythonMs':round((time.perf_counter()-started)*1000),'keptOldVertices':len(kept),'completeOldFaces':complete,'sourceFaces':len(source['fold']['faces_vertices'])}))`;

const cases=[
  {name:'periodic 3x3 original',params:{family:'periodic',tiling:'square',rows:3,columns:3}},
  {name:'periodic 3x3 square inset',params:{family:'periodic',tiling:'square',rows:3,columns:3},paperConfig:{shape:'square'}},
  {name:'periodic 3x3 rectangle 1.5',params:{family:'periodic',tiling:'square',rows:3,columns:3},paperConfig:{shape:'rectangle',aspect:1.5}},
  {name:'periodic 3x3 triangle',params:{family:'periodic',tiling:'square',rows:3,columns:3},paperConfig:{shape:'regular',sides:3}},
  {name:'periodic 3x3 hexagon',params:{family:'periodic',tiling:'square',rows:3,columns:3},paperConfig:{shape:'regular',sides:6}},
  {name:'periodic 3x3 octagon',params:{family:'periodic',tiling:'square',rows:3,columns:3},paperConfig:{shape:'regular',sides:8}},
  {name:'periodic 5x5 core crop',params:{family:'periodic',tiling:'square',rows:5,columns:5},paperConfig:{shape:'square'}},
  {name:'periodic 3x3 triangles crop',params:{family:'periodic',tiling:'triangle',rows:3,columns:3},paperConfig:{shape:'square'}},
  {name:'periodic 3x3 triangles original',params:{family:'periodic',tiling:'triangle',rows:3,columns:3}},
  {name:'periodic 5x5 triangles crop',params:{family:'periodic',tiling:'triangle',rows:5,columns:5},paperConfig:{shape:'square'}},
  {name:'periodic 3x3 hexagons crop',params:{family:'periodic',tiling:'hexagon',rows:3,columns:3},paperConfig:{shape:'square'}},
  {name:'periodic 3x3 hexagons original',params:{family:'periodic',tiling:'hexagon',rows:3,columns:3}},
  {name:'archimedean 3.6.3.6 ring 1 crop',params:{family:'archimedean',tiling:'3.6.3.6',rings:1},paperConfig:{shape:'square'}},
  {name:'archimedean 3.6.3.6 ring 2 crop',params:{family:'archimedean',tiling:'3.6.3.6',rings:2},paperConfig:{shape:'square'}},
  {name:'twist square crop',params:{family:'twist',sides:4},paperConfig:{shape:'square'}},
  {name:'twist original',params:{family:'twist',sides:4}},
  {name:'twist rectangle 1.5 crop',params:{family:'twist',sides:4},paperConfig:{shape:'rectangle',aspect:1.5}},
  {name:'twist hexagon crop',params:{family:'twist',sides:4},paperConfig:{shape:'regular',sides:6}},
  {name:'flagstone square crop',params:{family:'flagstone'},paperConfig:{shape:'square'}},
];
for(const item of cases){
  if(process.argv[2]&&!item.name.includes(process.argv[2]))continue;
  const run=spawnSync(python,['-c',py],{cwd:path.join(root,'backend'),input:JSON.stringify(item),encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  if(run.status!==0)throw Error(`${item.name}: ${run.stderr||run.error?.message}`);
  const data=JSON.parse(run.stdout) as {fold:FoldGraph;paper:number[][]|undefined;pythonMs:number;keptOldVertices:number;completeOldFaces:number;sourceFaces:number};
  const graph={...data.fold,faces_vertices:data.fold.faces_vertices!.map(face=>polygonArea(face.map(v=>data.fold.vertices_coords[v]))<0?[...face].reverse():face)};
  const points=graph.vertices_coords;
  const span=Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]));
  const height=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));
  const started=performance.now();
  const geometry=computeFlatGeometry(graph,Math.max(1e-6,Math.max(span,height)*1e-8),{startingFace:tessFlatRoot(graph)});
  const layers=geometry.geometry.status==='ready'?recomputeFlatLayers(geometry).layers:geometry.layers;
  console.log(JSON.stringify({name:item.name,paper:data.paper,vertices:points.length,edges:graph.edges_vertices.length,faces:graph.faces_vertices!.length,sourceFaces:data.sourceFaces,keptOldVertices:data.keptOldVertices,completeOldFaces:data.completeOldFaces,pythonMs:data.pythonMs,jsMs:Math.round(performance.now()-started),geometry:geometry.geometry.status,layers:layers.status,solutions:layers.solutionCountExact,message:layers.message}));
}
