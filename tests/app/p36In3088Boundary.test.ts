import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {canAdoptTessWithTileLayers,prepareTessResult,readTessParams,tessConstructionKey,type TessGraph,type TessResponse} from '../../src/app/tessellation';
import diagnostic from '../../src/app/p36In3088DiagnosticData.json';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {isP36In3088Source,p36In3088Params} from '../../src/app/p36In3088Source';
// Rabbit Ear exposes these primitives as JavaScript modules without TypeScript declarations.
// @ts-ignore
import {makeFacesEdgesFromVertices} from '../../node_modules/rabbit-ear/module/graph/make/facesEdges.js';
// @ts-ignore
import {makeEdgesFacesUnsorted} from '../../node_modules/rabbit-ear/module/graph/make/edgesFaces.js';
// @ts-ignore
import {makeSolverConstraintsFlat,makeConstraintsLookup} from '../../node_modules/rabbit-ear/module/layer/constraintsFlat.js';
// @ts-ignore
import {propagate} from '../../node_modules/rabbit-ear/module/layer/propagate.js';

type XY=[number,number];
const cross=(a:XY,b:XY)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:XY,b:XY):XY=>[a[0]-b[0],a[1]-b[1]];
function area(points:XY[]):number{
  return points.reduce((sum,p,i)=>sum+cross(p,points[(i+1)%points.length]),0)/2;
}
function clipConvex(subject:XY[],clip:XY[]):XY[]{
  let output=subject;
  const direction=Math.sign(area(clip));
  for(let i=0;i<clip.length;i++){
    const a=clip[i],edge=sub(clip[(i+1)%clip.length],a);
    const inside=(p:XY)=>direction*cross(edge,sub(p,a))>=-1e-8;
    const input=output;
    output=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length];
      const pInside=inside(p),qInside=inside(q);
      if(pInside!==qInside){
        const movement=sub(q,p),denominator=cross(movement,edge);
        assert.ok(Math.abs(denominator)>1e-12,'裁剪交点不能来自平行线');
        const t=cross(sub(a,p),edge)/denominator;
        output.push([p[0]+t*movement[0],p[1]+t*movement[1]]);
      }
      if(qInside)output.push(q);
    }
  }
  return output;
}

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const env={...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'};

/** The face vertex order is source order: ip is indexed before any mother-face reversal. */
test('In[3088] 保存的分裂四块构造成功，但当前整片层序门禁未解',()=>{
  const params=readTessParams(p36In3088Params());
  assert.ok(params&&params.family==='custom');
  assert.equal(params.stationaryFace,16);
  assert.equal(isP36In3088Source(params),true);
  assert.equal(isP36In3088Source({...params,stationaryFace:0}),false);
  assert.equal(isP36In3088Source({...params,tileTwists:params.tileTwists?.map(
    (tile,i)=>i===0?{...tile,offset:.13}:tile)}),false);
  assert.deepEqual(params.tileTwists?.map(tile=>tile.baseVertex),[0,1,3,2]);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const run=spawnSync(python,[path.join(root,'backend','tessellate.py')],{
    cwd:root,input:JSON.stringify(params),encoding:'utf8',timeout:30000,
    maxBuffer:8*1024*1024,windowsHide:true,env});
  assert.equal(run.status,0,run.error?.message||run.stderr);
  const result=JSON.parse(run.stdout) as TessResponse;
  assert.deepEqual([result.stats.vertices,result.stats.edges,result.stats.faces],[40,72,33]);
  assert.equal(result.stats.checks.geometry.status,'passed');
  assert.equal(result.stats.checks.local.status,'passed');
  const prepared=prepareTessResult(result,params);
  const key=tessConstructionKey(params);
  const input=tessFlatInput(prepared,prepared.doc,key,true);
  const graph=input.graph;
  assert.equal(input.startingFace,16);
  assert.deepEqual(diagnostic.count,[40,72,33]);
  assert.deepEqual(diagnostic.crease,{vertices:graph.vertices_coords,edges:graph.edges_vertices,
    assignment:graph.edges_assignment,faces:graph.faces_vertices});
  const geometry=computeFlatGeometry(graph,1e-6,{startingFace:input.startingFace});
  assert.equal(geometry.geometry.status,'ready',geometry.geometry.message);
  assert.deepEqual(diagnostic.folded.vertices,geometry.geometry.vertices);
  assert.ok(Math.abs(diagnostic.closureError-Number(result.source.closureError))<1e-12);
  // Independently compare the Python face-reflection coordinates with the
  // frontend embedding in its uniformly rescaled display coordinate frame.
  const raw=result.fold as TessGraph;
  const minX=Math.min(...raw.vertices_coords.map(p=>p[0]));
  const minY=Math.min(...raw.vertices_coords.map(p=>p[1]));
  const size=Math.max(Math.max(...raw.vertices_coords.map(p=>p[0]))-minX,
    Math.max(...raw.vertices_coords.map(p=>p[1]))-minY);
  const sourceFlat=result.source.foldedForm as XY[];
  assert.equal(result.source.foldedFormStationaryFace,16);
  assert.equal(sourceFlat.length,geometry.geometry.vertices.length);
  assert.ok(sourceFlat.every(([x,y],i)=>Math.hypot(
    (x-minX)*200/size-geometry.geometry.vertices[i][0],
    (y-minY)*200/size-geometry.geometry.vertices[i][1])<1e-6));
  const layers=recomputeFlatLayers(geometry);
  assert.equal(layers.layers.status,'no-solution',layers.layers.message);
  assert.equal(diagnostic.layerStatus,layers.layers.status);
  assert.equal(canAdoptTessWithTileLayers(prepared,false,key,params,layers.layers.status),false);

  // The saved CP reconstruction contains a positive-area three-face overlap.
  // Adjacent crease seeds plus taco constraints force a cyclic order there;
  // the independent transitivity condition rejects it before search branching.
  const cycleGeometry=computeFlatGeometry(graph,1e-6,{startingFace:0});
  assert.equal(cycleGeometry.geometry.status,'ready',cycleGeometry.geometry.message);
  const folded=cycleGeometry.geometry.graph;
  assert.ok(folded);
  const facePolygon=(face:number):XY[]=>folded.faces_vertices![face].map(v=>folded.vertices_coords[v] as XY);
  const overlap=clipConvex(clipConvex(facePolygon(8),facePolygon(9)),facePolygon(11));
  assert.ok(Math.abs(area(overlap))>Math.abs(area(facePolygon(8)))*1e-6,'8、9、11 号面应有正面积三重重叠');
  const faces_edges=makeFacesEdgesFromVertices(folded);
  const edges_faces=makeEdgesFacesUnsorted({...folded,faces_edges});
  const constraints=makeSolverConstraintsFlat({...folded,faces_edges,edges_faces},1e-6);
  assert.ok(constraints.constraints.transitivity.some((trio:number[])=>trio.join(',')==='8,9,11'));
  const tacoOnly={...constraints.constraints,transitivity:[]};
  const implied=propagate(tacoOnly,makeConstraintsLookup(tacoOnly),Object.keys(constraints.orders),constraints.orders);
  assert.equal(constraints.orders['8 9'],2);
  assert.equal(implied['8 11'],1);
  assert.equal(implied['9 11'],2);
  assert.throws(
    ()=>propagate(constraints.constraints,constraints.lookup,Object.keys(constraints.orders),constraints.orders),
    /invalid transitivity/,
  );
  const sourceAnchor=computeFlatGeometry(graph,1e-6,{startingFace:16});
  assert.equal(sourceAnchor.geometry.status,'ready',sourceAnchor.geometry.message);
  assert.equal(recomputeFlatLayers(sourceAnchor).layers.status,'no-solution');
  const anchorFolded=sourceAnchor.geometry.graph;
  assert.ok(anchorFolded);
  const anchorFacesEdges=makeFacesEdgesFromVertices(anchorFolded);
  const anchorEdgesFaces=makeEdgesFacesUnsorted({...anchorFolded,faces_edges:anchorFacesEdges});
  const anchorConstraints=makeSolverConstraintsFlat({...anchorFolded,faces_edges:anchorFacesEdges,edges_faces:anchorEdgesFaces},1e-6);
  const anchorTacoOnly={...anchorConstraints.constraints,transitivity:[]};
  const anchorImplied=propagate(anchorTacoOnly,makeConstraintsLookup(anchorTacoOnly),Object.keys(anchorConstraints.orders),anchorConstraints.orders);
  assert.equal(anchorConstraints.orders['8 9'],1);
  assert.equal(anchorImplied['8 11'],2);
  assert.equal(anchorImplied['9 11'],1);
});
