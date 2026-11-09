import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {prepareTessResult,readTessParams} from '../src/app/tessellation';
import {computeFlatFold} from '../src/core/flatFold';
import {DXF_LAYERS} from '../src/core/dxf';

const sameSegments=(a:any[],b:any[])=>{
 assert.equal(a.length,b.length);
 a.forEach((s,i)=>{const q=b[i];assert.equal(s.assignment,q.assignment);assert.equal(s.angle,q.angle);
  for(const [x,y] of [[s.a,q.a],[s.b,q.b]])x.forEach((v:number,j:number)=>assert.ok(Math.abs(v-y[j])<=16*Number.EPSILON*Math.max(1,Math.abs(v),Math.abs(y[j]))));
 });
};
const report:any[]=[];
for(const kind of ['base','edited']){
 const raw=JSON.parse(fs.readFileSync(`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}-response.json`,'utf8'));
 const params=raw.stats.parameters,result=prepareTessResult(raw,params);
 const native=importDocument(fs.readFileSync(`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}.json`,'utf8'),'json').doc;
 sameSegments(native.segments,result.doc.segments);
 for(const format of ['json','fold'] as const){
  const doc=importDocument(fs.readFileSync(`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}.${format}`,'utf8'),format).doc;
  sameSegments(doc.segments,native.segments);
  assert.deepEqual(readTessParams((doc.metadata!.tessellation as any).parameters),params);
  assert.deepEqual((doc.metadata!.tessellation as any).source,(result.doc.metadata!.tessellation as any).source);
  const flat=computeFlatFold(doc);
  assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');
 }
 const tokens=fs.readFileSync(`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}.dxf`,'utf8').trim().split(/\r?\n/);
 const lines:Record<string,string>[]=[];let row:Record<string,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const key=tokens[i].trim(),value=tokens[i+1].trim();
  if(key==='0'){if(row)lines.push(row);row=value==='LINE'?{}:null;}else if(row)row[key]=value;
 }if(row)lines.push(row);
 assert.equal(lines.length,native.segments.length);
 lines.forEach((line,i)=>{const s=native.segments[i];
  assert.deepEqual([Number(line['10']),-Number(line['20']),Number(line['11']),-Number(line['21'])].map(x=>x===0?0:x),[...s.a,...s.b].map(x=>x===0?0:x));
  assert.equal(line['8'],DXF_LAYERS[s.assignment].name);
 });
 for(const format of ['json','fold','library']){
  const file=format==='library'?`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}-library-reopen.json`:`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}-${format}-reimport.json`;
  const doc=importDocument(fs.readFileSync(file,'utf8'),'json').doc;
  sameSegments(doc.segments,native.segments);
  assert.deepEqual((doc.metadata!.tessellation as any).source,(native.metadata!.tessellation as any).source);
  assert.deepEqual((doc.metadata!.tessellation as any).parameters,params);
  const flat=computeFlatFold(doc);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');
 }
 const id=JSON.parse(fs.readFileSync(`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}-saved-response.json`,'utf8')).id;
 const saved=JSON.parse(fs.readFileSync(`output/original-topology-factors-server-1010/projects/${id}.json`,'utf8')).doc;
 assert.deepEqual(saved,importDocument(fs.readFileSync(`output/playwright/original-topology-factors-final-1010/dual/browser-${kind}-library-reopen.json`,'utf8'),'json').doc);
 report.push({case:kind,actualApiToNativeGeometryExact:true,jsonFoldParametersAndSourceExact:true,
  dxfLines:lines.length,dxfCoordinatesAndLayersExact:true,jsonFoldActualUiReimport:true,
  actualLibraryReopenMatchesSavedDoc:true,reopenedFlatGeometry:'ready',reopenedLayerOrder:'solved'});
}
fs.writeFileSync('output/playwright/original-topology-factors-final-1010/dual/download-verification.json',JSON.stringify({verified:true,cases:report,dxfReadback:'Independent LINE parser; existing App has no DXF importer, no DXF code was changed.'},null,2)+'\n');
console.log(JSON.stringify({verified:true,cases:report}));
