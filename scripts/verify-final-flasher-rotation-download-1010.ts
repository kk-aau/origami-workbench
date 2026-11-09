import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importDocument} from '../src/core/formats';
import {DXF_LAYERS} from '../src/core/dxf';
import {optimizeCPPaths} from '../src/core/cpPathOptimizer';
import {verifyCPProcessingExport} from '../src/core/cpProcessingExport';
import {readTessParams} from '../src/app/tessellation';
import type {Doc} from '../src/core/types';
const out='output/playwright/original-constructible-final-1010/flasher',read=(name:string)=>fs.readFileSync(`${out}/${name}`,'utf8');
const ui=JSON.parse(read('browser-checks.json')),actual=JSON.parse(read('browser-public-responses.json'));
assert.equal(ui.verified,true);assert.deepEqual(ui.errors,[]);assert.equal(ui.downloads.length,16);
const checks:string[]=[],check=(ok:unknown,name:string)=>{assert.ok(ok,name);checks.push(name);};
const near=(first:number,second:number)=>Math.abs(first-second)<=1e-8;
function sameGeometry(first:Doc,second:Doc){
 assert.equal(first.segments.length,second.segments.length);
 first.segments.forEach((s,i)=>{const t=second.segments[i];assert.equal(s.assignment,t.assignment);assert.equal(s.angle,t.angle);
  assert.ok(s.a.every((x,j)=>near(x,t.a[j])));assert.ok(s.b.every((x,j)=>near(x,t.b[j])));
 });
}
function parseLines(text:string){
 const pairs=text.trimEnd().split(/\r?\n/);assert.equal(pairs.length%2,0);
 const rows:Record<string,string>[]=[];let row:Record<string,string>={};
 for(let i=0;i<pairs.length;i+=2){if(pairs[i]==='0'){row={};rows.push(row);}row[pairs[i]]=pairs[i+1];}
 assert.ok(text.includes('AC1009'));assert.ok(!text.includes('POLYLINE'));return rows.filter(r=>r['0']==='LINE');
}
const cases:Record<string,unknown>={};
for(const {name,response} of actual.responses){
 const native=importDocument(read(`${name}.zhezhi.json`),'json').doc,meta=native.metadata?.tessellation as any;
 const reopened=importDocument(read(`${name}-json-reopen.zhezhi.json`),'json').doc;
 assert.deepEqual(reopened,native);check(true,`${name}: actual JSON reopens with every source and document field`);
 const fold=importDocument(read(`${name}.fold`),'fold',native.name).doc,foldReopen=importDocument(read(`${name}-fold-reopen.zhezhi.json`),'json').doc;
 sameGeometry(fold,native);sameGeometry(foldReopen,native);assert.deepEqual(fold.paper,native.paper);assert.deepEqual(foldReopen.paper,native.paper);
 assert.deepEqual((foldReopen.metadata?.tessellation as any).parameters,meta.parameters);assert.deepEqual((foldReopen.metadata?.tessellation as any).source,meta.source);
 check(true,`${name}: actual FOLD and UI reopened export preserve geometry, paper, recipe and literal FF`);
 assert.deepEqual(readTessParams(meta.parameters),response.stats.parameters);assert.deepEqual(meta.source,response.source);
 check(true,`${name}: actual adopted recipe and source equal real public API result`);
 const points=response.fold.vertices_coords as number[][],minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
 const span=Math.max(Math.max(...points.map(p=>p[0]))-minX,Math.max(...points.map(p=>p[1]))-minY),scale=200/span;
 assert.equal(native.segments.length,response.stats.edges);response.fold.edges_vertices.forEach(([a,b]:number[],i:number)=>{
  const segment=native.segments[i];assert.equal(segment.assignment,response.fold.edges_assignment[i]);
  for(const [point,source] of [[segment.a,points[a]],[segment.b,points[b]]]){assert.ok(near(point[0],(source[0]-minX)*scale));assert.ok(near(point[1],(source[1]-minY)*scale));}
 });check(true,`${name}: every adopted edge independently preserves source coordinates at ordinary 200 mm paper scale`);
 let maximumIsometryError=0;
 for(const face of response.fold.faces_vertices as number[][])for(let i=0;i<face.length;i++)for(let j=i+1;j<face.length;j++){
  const [a,b]=[face[i],face[j]],length=(ps:number[][])=>Math.hypot(...ps[a].map((v,k)=>v-ps[b][k]));
  maximumIsometryError=Math.max(maximumIsometryError,Math.abs(length(points)-length(meta.source.foldedForm3D)));
 }
 check(maximumIsometryError<1e-8,`${name}: every actual exported source face pair independently remains CP/FF isometric`);
 const ordinary=parseLines(read(`${name}.dxf`));assert.equal(ordinary.length,native.segments.length);
 native.segments.forEach((segment,i)=>{const e=ordinary[i];assert.equal(e['8'],DXF_LAYERS[segment.assignment].name);
  for(const [code,value] of [[10,segment.a[0]],[20,-segment.a[1]],[11,segment.b[0]],[21,-segment.b[1]]] as const)assert.ok(Number(e[code])===value);
 });check(read(`${name}.dxf`).includes('1 drawing unit = 1 mm; X=x, Y=-y'),`${name}: actual ordinary R12 LINE file independently parses all source edges, layers and mm coordinates`);
 const postOptimization=importDocument(read(`${name}-after-optimization.zhezhi.json`),'json').doc;assert.deepEqual(postOptimization,foldReopen);check(true,`${name}: optimization leaves the actual reopened source CP and all metadata intact`);
 const report=JSON.parse(read(`${name}-optimized-report.json`)),plan=optimizeCPPaths(foldReopen,report.options),optimized=read(`${name}-optimized.dxf`),verified=verifyCPProcessingExport(optimized,'dxf-lines',foldReopen,plan);
 assert.deepEqual(verified,report.readback);assert.deepEqual(plan.paths,report.paths);assert.equal(verified.units,'mm');assert.equal(verified.coordinateConvention,'x,-y');
 assert.equal(verified.machineTrialVerified,false);assert.equal(verified.physicalImportVerified,false);
 const optimizedLines=parseLines(optimized);assert.equal(optimizedLines.length,verified.entityCount);
 const lineLength=optimizedLines.reduce((sum,e)=>sum+Math.hypot(Number(e['11'])-Number(e['10']),Number(e['21'])-Number(e['20'])),0);
 assert.ok(near(lineLength,report.displayedStatistics.afterLength));
 check(true,`${name}: actual optimized LINE file is reparsed for exact source coverage, passes, units and displayed length`);
 cases[name]={counts:[response.stats.vertices,response.stats.edges,response.stats.faces],ordinaryLines:ordinary.length,optimizedLines:optimizedLines.length,maximumIsometryError,
  exactProcessingSourceCoverage:verified.sourcePasses,paper:native.paper,adoptedMillimetreScale:scale};
}
const files=ui.downloads.map((d:any)=>{const bytes=fs.readFileSync(d.path);return{file:d.path,suggested:d.suggested,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
const result={verified:true,actualUserDownloads:files.length,uiChecks:ui.passed,downloadChecks:checks.length,checks,cases,files,
 jsonAndFoldActuallyReopened:true,ordinaryAndOptimizedDXFIndependentlyReadback:true,dxfAppImportSupported:false,
 fullUnboundedOriginalIntegerDomainComplete:false,wolframExecuted:false,machineVerified:false,bundle:ui.bundle};
fs.writeFileSync(`${out}/download-audit.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({verified:true,actualUserDownloads:files.length,uiChecks:ui.passed,downloadChecks:checks.length,cases}));
