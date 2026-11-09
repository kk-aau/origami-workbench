import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import type {Point} from '../../src/core/types';
import {polygonArea} from '../../src/core/geometry';
import {prepareTessResult,tessPreset} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionPaths} from '../../src/app/modelRegionPaths';

const loops=(d:string):Point[][]=>(d.match(/M[^Z]+Z/g)??[]).map(s=>s.slice(1,-1).split('L').map(p=>p.split(',').map(Number) as Point));
function winding(polygons:Point[][],p:Point):number{
 let sum=0;
 for(const polygon of polygons)for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=(b[0]-a[0])*(p[1]-a[1])-(p[0]-a[0])*(b[1]-a[1]);
  if(a[1]<=p[1]&&b[1]>p[1]&&cross>0)sum++;
  if(a[1]>p[1]&&b[1]<=p[1]&&cross<0)sum--;
 }
 return sum;
}

test('mixed tiling material contours cover the original cells on both sides, including degenerate slab contacts',()=>{
 const original=tessPreset('archimedean');delete original.paper;
 const params=[[20,.5],[60,.2],[60,.3]].map(([angle,scale])=>({...original,angle,scale}));
 const run=spawnSync(path.resolve('.venv/Scripts/python.exe'),['-c',"import sys,json;sys.path.insert(0,'backend');from tessellate import generate;print(json.dumps([generate(p) for p in json.load(sys.stdin)]))"],{input:JSON.stringify(params),encoding:'utf8',windowsHide:true,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},timeout:30000,maxBuffer:20*1024*1024});
 assert.equal(run.status,0,run.stderr);const responses=JSON.parse(run.stdout);
 for(let index=0;index<params.length;index++){
  const source=prepareTessResult(responses[index],params[index]),input=tessFlatInput(source,source.doc,'contours',true);
  const result=recomputeFlatLayers(computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)}));
  assert.equal(result.layers.status,'solved');
  const analysis=modelOverlapRegions(result),normals=result.geometry.faces.map(f=>Math.sign(polygonArea(f.map(v=>result.geometry.vertices[v]))));
  for(const side of ['front','back'] as const){
   const regions=modelRegionLayers(result,analysis,side),mirror=side==='back'?-1:1;
   for(const mode of ['material','face','selected'] as const){
    const paths=modelRegionPaths(regions,p=>[p[0]*mirror,p[1]],region=>{
     assert.equal(region.layers.status,'ordered');if(region.layers.status!=='ordered')return region.layers.status;
     const face=region.layers.topToBottom[0];return mode==='face'?String(face):mode==='selected'&&face===0?'selection':String(normals[face]);
    });
    for(const contour of paths){
     const outlines=loops(contour.d),cells=contour.indices.map(i=>regions[i].polygon),total=cells.reduce((sum,polygon)=>sum+Math.abs(polygonArea(polygon)),0);
     assert.ok(Math.abs(Math.abs(outlines.reduce((sum,polygon)=>sum+polygonArea(polygon),0))-total)<1e-4,`${index} ${side} ${mode}: material area is preserved`);
     const ps=cells.flat(),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
     // Compare filled winding against the original cell union, not against
     // another outline routine. Probes include material holes and exterior.
     for(let x=0;x<25;x++)for(let y=0;y<25;y++){
      const probe:Point=[left+(right-left)*((x+.371)/23-1/23),bottom+(top-bottom)*((y+.619)/23-1/23)];
      assert.equal(winding(outlines,[probe[0]*mirror,probe[1]])!==0,winding(cells,probe)!==0,`${index} ${side} ${mode}: coverage at ${probe}`);
     }
    }
   }
  }
 }
});
