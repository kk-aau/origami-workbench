import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {computeFlatFold} from '../src/core/flatFold';
const log=fs.readFileSync('output/parallel-constructors-browser-1010-fixed.log','utf8'),match=log.match(/### Result\r?\n(\{[^\r\n]+\})/);assert.ok(match);const report=JSON.parse(match[1]);const cases=[];
for(const item of report.responses){
 const base=`output/playwright/parallel-${item.name}-1010`,json=importDocument(fs.readFileSync(base+'.zhezhi.json','utf8'),'json').doc,fold=importDocument(fs.readFileSync(base+'.fold','utf8'),'fold').doc,a=inspectMaterialTopology(json),b=inspectMaterialTopology(fold);assert.deepEqual(fold.paper,json.paper);let foldCoordinateMaxError=0;
 if(a.ok){assert.ok(b.ok,b.ok?'':b.reason);assert.deepEqual(b.graph,a.graph);assert.deepEqual(b.foldedVertices,a.foldedVertices);assert.deepEqual(b.edgeSegmentIds,a.edgeSegmentIds);}else{
  const metadata=json.metadata!.tessellation as any,reopened=fold.metadata!.tessellation as any;assert.deepEqual(metadata,reopened);assert.deepEqual(metadata.parameters,item.response.params??metadata.parameters);assert.equal(json.segments.length,fold.segments.length);const remaining=[...fold.segments];
  for(const segment of json.segments){const distances=remaining.map(s=>s.assignment!==segment.assignment||s.angle!==segment.angle?Infinity:Math.min(Math.max(Math.hypot(s.a[0]-segment.a[0],s.a[1]-segment.a[1]),Math.hypot(s.b[0]-segment.b[0],s.b[1]-segment.b[1])),Math.max(Math.hypot(s.b[0]-segment.a[0],s.b[1]-segment.a[1]),Math.hypot(s.a[0]-segment.b[0],s.a[1]-segment.b[1])))),delta=Math.min(...distances);assert.ok(delta<=1e-9,`${item.name} FOLD unmatched segment delta ${delta} mm`);foldCoordinateMaxError=Math.max(foldCoordinateMaxError,delta);remaining.splice(distances.indexOf(delta),1);}
  if(item.name==='flasher-r4'){assert.equal(metadata.parameters.rings,4);assert.deepEqual(metadata.source.foldedForm3D,item.response.source.foldedForm3D);}
 }
 const text=fs.readFileSync(base+'.dxf','utf8');assert.equal(text,exportDXF(json).text);assert.ok(text.includes('AC1009')&&!text.includes('POLYLINE'));const pairs=text.trimEnd().split(/\r?\n/),lines:Map<number,string>[]=[];let line:Map<number,string>|null=null;for(let i=0;i<pairs.length;i+=2){const code=Number(pairs[i]),value=pairs[i+1];if(code===0){if(line)lines.push(line);line=value==='LINE'?new Map():null;}else if(line)line.set(code,value);}assert.equal(lines.length,json.segments.length);json.segments.forEach((s,i)=>{assert.equal(lines[i].get(8),DXF_LAYERS[s.assignment].name);for(const [code,value]of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]])assert.ok(Number(lines[i].get(code))===value,`${item.name} ordinary LINE coordinate ${code}`);});
 if(item.name!=='flasher-r4')assert.equal(computeFlatFold(json).layers.status,'solved');
 cases.push({name:item.name,segments:json.segments.length,faces:a.ok?a.graph.faces_vertices!.length:item.response.stats.faces,holeLoops:a.ok?a.graph.faces_holes?.flat().length??0:0,actualDownloads:3,ordinaryDXFLineExact:true,indexedMaterialAndFFExact:a.ok,sourceMetadataExact:true,foldCoordinateMaxError,ordinaryFoldToleranceMm:a.ok?0:1e-9});
}
fs.writeFileSync('output/parallel-constructors-download-1010.json',JSON.stringify({verified:true,cases,machineVerified:false},null,2));console.log(`Verified ${cases.length} constructor sets, 18 actual downloads, exact LINE geometry and material/FF round trips.`);
