import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import ear from 'rabbit-ear';
import {prepareTessResult,tessPreset,type TessParams} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatFold,computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {polygonArea,distance} from '../../src/core/geometry';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import type {LayerNode} from '../../src/core/layerSolutions';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';

const legacyFlagstone=():TessParams=>{const params=tessPreset('flagstone');delete params.paper;return params;};

test('Origamica In[3390] reaches a layered flat fold with its max-min reciprocal',()=>{
 const mother:TessParams={family:'custom',vertices:[[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-.5,1],[.5,1]],faces:[[0,1,4,3],[1,2,5,4],[3,4,6],[4,7,6],[4,5,7]],repeatX:1,repeatY:1,angle:36,scale:.3};
 const params:TessParams={...legacyFlagstone(),motherParams:mother,shrinkage:.5};
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps(generate(json.load(sys.stdin))))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
 assert.equal(run.status,0,run.stderr);
 const response=JSON.parse(run.stdout);
 assert.equal(response.source.junctionAssignment,'original');
 const source=prepareTessResult(response,params),input=tessFlatInput(source,source.doc,'in3390',true);
 const flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
 assert.equal(flat.geometry.status,'ready');
 assert.equal(flat.layers.status,'solved',flat.layers.message);
 const overlap=modelOverlapRegions(flat),back=modelRegionLayers(flat,overlap,'back'),front=modelRegionLayers(flat,overlap,'front');
 const total=back.reduce((sum,region)=>sum+region.area,0);
 const normals=flat.geometry.faces.map(face=>Math.sign(polygonArea(face.map(v=>flat.geometry.vertices[v]))));
 const reversed=back.reduce((sum,region)=>sum+(region.layers.status!=='ordered'||normals[region.layers.topToBottom[0]]<0?region.area:0),0);
 assert.ok(total>0);
 assert.ok(reversed<total*1e-7,`back visible reversed area ${reversed}/${total}`);
 // The notebook describes balanced pleats, not a universal monochrome
 // guarantee. In this saved irregular example, some reversed front material
 // is forced by Rabbit Ear's root relations, so searching 9,041,760 layer
 // candidates cannot remove it by choosing a different solution index.
 const {vertices}=flat.geometry,xs=vertices.map(v=>v[0]),ys=vertices.map(v=>v[1]);
 const epsilon=Math.max(1e-6,Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1e-8);
 const tree=ear.layer(flat.geometry.graph!,epsilon) as unknown as LayerNode;
 const outgoing=new Map<number,number[]>();
 for(const [a,b] of flatLayerEdges(tree.orders,normals))outgoing.set(a,[...(outgoing.get(a)??[]),b]);
 const reaches=flat.geometry.faces.map((_,face)=>{const seen=new Set<number>(),stack=[face];while(stack.length){const id=stack.pop()!;for(const next of outgoing.get(id)??[])if(!seen.has(next)){seen.add(next);stack.push(next);}}return seen;});
 const forced=overlap.cells.reduce((sum,cell)=>{const positive=cell.faces.filter(f=>normals[f]>0),negative=cell.faces.filter(f=>normals[f]<0);return sum+(negative.some(n=>positive.every(p=>reaches[p].has(n)))?cell.area:0);},0);
 const exposed=front.reduce((sum,region)=>sum+(region.layers.status==='ordered'&&normals[region.layers.topToBottom[0]]<0?region.area:0),0);
 assert.ok(forced/total>.01&&forced/total<.02,`forced reversed front area ${forced}/${total}`);
 assert.ok(Math.abs(exposed-forced)<total*1e-7,`first solution ${exposed}, all-solution lower bound ${forced}`);
});

test('original uniform flagstone assignment computes real layer results and preserves folded lengths',()=>{
 const params:TessParams[]=(['square','hexagon','triangle'] as const).map(tiling=>({...legacyFlagstone(),family:'flagstone',rows:3,columns:3,width:.25,aspect:1,tiling,shrinkage:.8,junctionAssignment:'original'}));
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
 assert.equal(run.status,0,run.stderr);
 for(const [i,response] of JSON.parse(run.stdout).entries()){
  const source=prepareTessResult(response,params[i]),input=tessFlatInput(source,source.doc,'original-test',true),flat=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
  assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,i===2?'no-solution':'solved');
  for(const [a,b] of input.graph.edges_vertices)assert.ok(Math.abs(distance(input.graph.vertices_coords[a],input.graph.vertices_coords[b])-distance(flat.geometry.vertices[a],flat.geometry.vertices[b]))<1e-5);
  if(i===2)assert.doesNotMatch(foldedModelSVG(flat,{name:'三角铺石无层序解',side:'front',xray:false}),/<polygon/);
 }
});

test('flagstone tuck assignments have real layer solutions and monochrome exposed surfaces in both workspaces',()=>{
 const params:TessParams[]=[
  {...legacyFlagstone(),rows:2,columns:2},
  legacyFlagstone(),
  {...legacyFlagstone(),rows:2,columns:3,width:.1,aspect:.5},
  {...legacyFlagstone(),rows:6,columns:6,width:.45,aspect:2},
  {...legacyFlagstone(),tiling:'hexagon'},
 ];
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000});
 assert.equal(run.status,0,run.stderr);const responses=JSON.parse(run.stdout);
 for(let i=0;i<params.length;i++){
  const source=prepareTessResult(responses[i],params[i]),input=tessFlatInput(source,source.doc,'test',true);
  assert.equal(source.stats.checks.local.status,'passed');assert.equal(source.source.version,2);
  const editor=computeFlatFold(source.doc),tess=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
  for(const [mode,result] of [['editor',editor],['tess',tess]] as const){
   assert.equal(result.geometry.status,'ready',`${i} ${mode}: ${result.geometry.message}`);
   assert.equal(result.layers.status,'solved',`${i} ${mode}: ${result.layers.message}`);
   const normals=result.geometry.faces.map(f=>Math.sign(polygonArea(f.map(v=>result.geometry.vertices[v])))),analysis=modelOverlapRegions(result);
   const sizes=result.geometry.faces.map(f=>Math.abs(polygonArea(f.map(v=>result.geometry.vertices[v])))),stoneArea=Math.max(...sizes);
   assert.ok(analysis.cells.length>0);
   for(const side of ['front','back'] as const){
    const regions=modelRegionLayers(result,analysis,side),total=regions.reduce((s,r)=>s+r.area,0);
    const bad=regions.reduce((s,r)=>s+(r.layers.status!=='ordered'||normals[r.layers.topToBottom[0]]<0?r.area:0),0);
    assert.ok(bad<total*1e-8,`${i} ${mode} ${side}: exposed reversed/uncertain area ${bad}/${total}`);
    if(side==='front'){const pleats=regions.reduce((s,r)=>s+(r.layers.status==='ordered'&&sizes[r.layers.topToBottom[0]]<stoneArea*(1-1e-7)?r.area:0),0);assert.ok(pleats<total*1e-8,'the actual stone faces cover the whole front, without exposed same-color tuck flaps');}
   }
  }
  for(const [a,b] of input.graph.edges_vertices)assert.ok(Math.abs(distance(input.graph.vertices_coords[a],input.graph.vertices_coords[b])-distance(tess.geometry.vertices[a],tess.geometry.vertices[b]))<1e-5,'folding preserves crease lengths');
  if(i===0){
   const invalid=structuredClone(editor);invalid.layers={status:'no-solution',message:'当前山谷无层序解'};
   for(const xray of [false,true]){const svg=foldedModelSVG(invalid,{name:'无解',side:'front',xray});assert.doesNotMatch(svg,/<polygon/);assert.match(svg,/<line/);assert.match(svg,/当前山谷无层序解/);}
  }
 }
});
