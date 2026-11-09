import {DXF_LAYERS} from '../src/core/dxf';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareTessResult,readTessParams} from '../src/app/tessellation';
import {inspectWovenCutTopology} from '../src/app/wovenCutTopology';
import {wovenCPDocument} from '../src/app/wovenCPDocument';
import {wovenMaterialDocument} from '../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {importDocument} from '../src/core/formats';
import {computeFlatFold} from '../src/core/flatFold';
let downloads=0;const inside=(p:number[],ring:number[][])=>{let ok=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])ok=!ok;}return ok;};
for(const kind of ['symmetric','asymmetric','two-independent']){
 const raw=JSON.parse(fs.readFileSync(`output/original-woven-cell-hole-browser-1010/browser-${kind}-public-response.json`,'utf8')),p=raw.stats.parameters,r=prepareTessResult(raw,p),proof=inspectWovenCutTopology(r,p);assert.ok(proof.ok);
 for(const cycle of raw.source.topologyAreaRecovery.cellHoles.excludedCycles){const center=cycle.reduce((q,v)=>[q[0]+raw.fold.vertices_coords[v][0]/cycle.length,q[1]+raw.fold.vertices_coords[v][1]/cycle.length],[0,0]);assert.ok(raw.fold.faces_vertices.every(face=>!inside(center,face.map(v=>raw.fold.vertices_coords[v]))),'void is actually empty in CP');}
 for(const role of ['cp','ff']){const wanted=role==='cp'?wovenCPDocument(r,p):wovenMaterialDocument(r,p),wm=inspectMaterialTopology(wanted);assert.ok(wm.ok);
  for(const format of ['json','fold'] as const){const actual=importDocument(fs.readFileSync(`output/original-woven-cell-hole-browser-1010/browser-${kind}-${role}.${format}`,'utf8'),format).doc,m=inspectMaterialTopology(actual);assert.ok(m.ok);assert.deepEqual(m.graph,wm.graph);assert.deepEqual(m.foldedVertices,wm.foldedVertices);assert.deepEqual(readTessParams((actual.metadata?.tessellation as any).parameters),p);if(role==='ff')assert.equal(computeFlatFold(actual).layers.status,'solved');else assert.equal(m.foldedVertices,undefined);downloads++;}
 }

 const wantedCP=wovenCPDocument(r,p),tokens=fs.readFileSync(`output/original-woven-cell-hole-browser-1010/browser-${kind}-cp.dxf`,'utf8').trim().split(/\r?\n/),lines:Map<number,string>[]=[];
 let line:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){line=value==='LINE'?new Map():null;if(line)lines.push(line);}else line?.set(code,value);}
 assert.equal(lines.length,wantedCP.segments.length);
 lines.forEach((l,i)=>{const s=wantedCP.segments[i];assert.equal(l.get(8),DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(l.get(10)),Number(l.get(20))],[s.a[0],-s.a[1]].map(x=>x||0));assert.deepEqual([Number(l.get(11)),Number(l.get(21))],[s.b[0],-s.b[1]].map(x=>x||0));});downloads++;
 console.log(kind,'actual normal DXF LINE count/coordinates/layers exact; each original CP edge once',lines.length);
 const reimport=importDocument(fs.readFileSync(`output/original-woven-cell-hole-browser-1010/browser-${kind}-reimport.json`,'utf8'),'json').doc,ff=importDocument(fs.readFileSync(`output/original-woven-cell-hole-browser-1010/browser-${kind}-ff.json`,'utf8'),'json').doc;assert.deepEqual(reimport,ff);assert.equal(computeFlatFold(reimport).layers.status,'solved');downloads++;
 const savedResponse=JSON.parse(fs.readFileSync(`output/original-woven-cell-hole-browser-1010/browser-${kind}-saved-response.json`,'utf8')),saved=JSON.parse(fs.readFileSync(`output/original-parameter-construct-server-1010/projects/${savedResponse.id}.json`,'utf8'));assert.deepEqual(saved.doc,reimport);
 console.log(kind,'actual CP void empty; CP+FF JSON/FOLD exact; reimport layers solved; saved doc exact');
}
console.log('actual downloads independently checked',downloads);

fs.writeFileSync('output/original-woven-cell-hole-browser-1010/download-audit.json',JSON.stringify({verified:true,actualDownloads:downloads,CPVoidEmpty:true,CPAndFFCoordinatesExact:true,reopenedLayersSolved:true,isolatedSavedDocumentsExact:true,normalDXFGeometryAndCountsExact:true},null,2));
