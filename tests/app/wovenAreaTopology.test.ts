import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {wovenScaledHighEvenPreset} from '../../src/app/wovenScaledHighEvenPreset';
import {wovenAreaBounds} from '../../src/app/wovenAreaTopology';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers} from '../../src/app/tessellation';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {canAdoptWovenCP,wovenCPDocument} from '../../src/app/wovenCPDocument';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput} from '../../src/app/tessellationFlat';
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/woven-area-topology-1010.json',import.meta.url),'utf8')).cases;
test('visible local similarity presets preserve raw points and all absolute h values',()=>{
 for(const c of cases){const p=wovenScaledHighEvenPreset(c.params.graph.vertices.length-1);assert.deepEqual(p,c.params);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);assert.ok(p.fullEdgeInsets!.entries.every(e=>e.inset===p.width/2*1e-4));}
 for(const degree of [10,14,33,NaN])assert.throws(()=>wovenScaledHighEvenPreset(degree));
});
test('uncertain zero or tiny noise remains excluded, resolvable tiny positive area survives',()=>{
 assert.ok(wovenAreaBounds([[0,0],[1e-4,0],[0,1e-4]],[0,1,2])[0]>0);
 for(const points of [[[0,0],[1e-4,0],[1e-4,0]],[[0,0],[1e-4,0],[1e-4,1e-20]]] as [number,number][][]){const bounds=wovenAreaBounds(points,[0,1,2]);assert.ok(bounds[0]<=0&&bounds[1]>=0);}
});
test('three actual generated CPs independently reconstruct original negative-chart areas and gate adoption',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),proof=inspectWovenCutTopology(r,c.params);assert.ok(proof.ok,c.name+': '+(proof.ok?'':proof.reason));assert.equal(canAdoptWovenCP(r,false,key,c.params),true);
  const input=tessFlatInput(r,r.doc,key,true),geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace}),flat=recomputeFlatLayers(geometry);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),true);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'no-solution'),false);assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'checking'),false);
 }
});
test('native/FOLD/DXF exports preserve all CP edges, parameters and finite material',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),d=wovenCPDocument(r,c.params),original=inspectMaterialTopology(d);assert.ok(original.ok);
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc,m=inspectMaterialTopology(back);assert.ok(m.ok);assert.deepEqual(m.graph,original.graph);assert.equal(m.foldedVertices,undefined);assert.deepEqual(readTessParams((back.metadata?.tessellation as {parameters:unknown}).parameters),c.params);}
  const tokens=exportDXF(d).text.trim().split(/\r?\n/),lines:Map<number,string>[]=[];let line:Map<number,string>|null=null;
  for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),v=tokens[i+1];if(code===0){line=v==='LINE'?new Map():null;if(line)lines.push(line);}else line?.set(code,v);}
  assert.equal(lines.length,d.segments.length);lines.forEach((l,i)=>{const s=d.segments[i];assert.equal(l.get(8),DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(l.get(10)),Number(l.get(20))],[s.a[0],-s.a[1]].map(x=>x||0));assert.deepEqual([Number(l.get(11)),Number(l.get(21))],[s.b[0],-s.b[1]].map(x=>x||0));});
 }
});
test('forged area bounds, uncertainty, flags, original graph and budget cannot adopt',()=>{
 const c=cases[0],r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
 for(const change of [(s:any)=>s.topologyAreaRecovery.areaBounds[0][0]=0,(s:any)=>s.topologyAreaRecovery.areaBounds[0][0]*=2,(s:any)=>s.topologyAreaRecovery.coordinateUncertainty=0,(s:any)=>s.topologyAreaRecovery.sourceCoordinatesChanged=true,(s:any)=>s.topologyAreaRecovery.extra=1,(s:any)=>s.topologyAreaRecheckAttempts=175,(s:any)=>s.topologyProbeAttempts=1,(s:any)=>s.graph.edges.pop(),(s:any)=>s.pleatFactors[0]=0,(s:any)=>s.foldedForm[0][0]+=.01]){const bad=structuredClone(r);change(bad.source);assert.equal(canAdoptWovenCP(bad,false,key,c.params),false);}
 assert.equal(canAdoptWovenCP(r,true,key,c.params),false);assert.equal(canAdoptWovenCP(r,false,'stale',c.params),false);
});
