import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareTessResult,tessConstructionKey,readTessParams} from '../src/app/tessellation';
import {canAdoptWovenCP,wovenCPDocument} from '../src/app/wovenCPDocument';
import {importDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {DXF_LAYERS} from '../src/core/dxf';
import {validateDoc} from '../src/core/types';
let count=0;
for(const degree of [12,16,32]){
 const actual=JSON.parse(fs.readFileSync(`output/original-woven-area-browser-1010/browser-${degree}-public-response.json`,'utf8')),p=actual.stats.parameters,r=prepareTessResult(actual,p);assert.ok(canAdoptWovenCP(r,false,tessConstructionKey(p),p));
 const wanted=wovenCPDocument(r,p),topology=inspectMaterialTopology(wanted);assert.ok(topology.ok);
 for(const format of ['json','fold'] as const){const text=fs.readFileSync(`output/original-woven-area-browser-1010/browser-${degree}-cp.${format}`,'utf8'),back=importDocument(text,format).doc,material=inspectMaterialTopology(back);assert.ok(material.ok);assert.deepEqual(material.graph,topology.graph);assert.equal(material.foldedVertices,undefined);assert.equal(back.segments.length,8*degree);assert.deepEqual(readTessParams((back.metadata?.tessellation as any).parameters),p);count++;}
 const reimport=importDocument(fs.readFileSync(`output/original-woven-area-browser-1010/browser-${degree}-reimport.json`,'utf8'),'json').doc,reloaded=inspectMaterialTopology(reimport);assert.ok(reloaded.ok);assert.deepEqual(reloaded.graph,topology.graph);assert.deepEqual(readTessParams((reimport.metadata?.tessellation as any).parameters),p);assert.equal(reloaded.foldedVertices,undefined);count++;
 const tokens=fs.readFileSync(`output/original-woven-area-browser-1010/browser-${degree}-cp.dxf`,'utf8').trim().split(/\r?\n/),lines:Map<number,string>[]=[];let line:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),v=tokens[i+1];if(code===0){line=v==='LINE'?new Map():null;if(line)lines.push(line);}else line?.set(code,v);}
 assert.equal(lines.length,wanted.segments.length);lines.forEach((l,i)=>{const s=wanted.segments[i];assert.equal(l.get(8),DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(l.get(10)),Number(l.get(20))],[s.a[0],-s.a[1]].map(x=>x||0));assert.deepEqual([Number(l.get(11)),Number(l.get(21))],[s.b[0],-s.b[1]].map(x=>x||0));});count++;
 console.log(degree,'raw source bound proof/JSON/FOLD/DXF independently read back; all edges',8*degree);
}
const normal=importDocument(fs.readFileSync('output/original-woven-area-browser-1010/browser-32-normal-adopt.json','utf8'),'json').doc,last=JSON.parse(fs.readFileSync('output/original-woven-area-browser-1010/browser-32-public-response.json','utf8'));validateDoc(normal);assert.deepEqual(normal.segments,prepareTessResult(last,last.stats.parameters).doc.segments);assert.deepEqual(readTessParams((normal.metadata?.tessellation as any).parameters),last.stats.parameters);assert.equal(normal.metadata?.materialTopology,undefined);count++;
const savedPath=fs.readdirSync('output/original-three-inputs-server-1010/projects').find(x=>x.endsWith('.json'))!,saved=JSON.parse(fs.readFileSync('output/original-three-inputs-server-1010/projects/'+savedPath,'utf8'));const back=importDocument(fs.readFileSync('output/original-woven-area-browser-1010/browser-32-reimport.json','utf8'),'json').doc;assert.deepEqual(saved.doc,back);console.log('isolated saved project doc equals actual 32-degree reimport');
console.log('actual downloads independently checked:',count);
