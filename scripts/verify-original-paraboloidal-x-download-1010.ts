import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importDocument} from '../src/core/formats';
import {importFoldInterchange} from '../src/core/foldInterchange';
import {readTessParams} from '../src/app/tessellation';
import {DXF_LAYERS,exportDXF} from '../src/core/dxf';
const base='output/original-ring-unsafe-courteous-browser-1010/paraboloidal-x',read=(f:string)=>fs.readFileSync(`${base}/${f}`,'utf8'),checks:string[]=[];
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks.push(label);};
const log=read('browser-tests.log'),match=log.match(/^### Result\r?\n([^\r\n]+)/);assert.ok(match&&!log.includes('### Error'));const ui=JSON.parse(match[1]);
check(ui.verified&&ui.passed===21&&ui.errors.length===0,'21 actual main UI checks passed without page exceptions');
const audits=[];
for(const suffix of ['default','edited']){
 const response=JSON.parse(read(`actual-main-${suffix}-X-api.json`)),text=read(`adopted-${suffix}-X.zhezhi.json`),doc=importDocument(text,'json').doc,
       record=JSON.parse(text),foldRaw=JSON.parse(read(`adopted-${suffix}-X.fold`)),foldDoc=importDocument(read(`adopted-${suffix}-X.fold`),'fold').doc;
 const t=doc.metadata!.tessellation as any;
 check(t.parameters.diagonal==='X'&&t.parameters.focalLength===(suffix==='default'?6:7),`${suffix}: actual source parameters X/f preserved`);
 assert.deepEqual(readTessParams(t.parameters),response.stats.parameters);checks.push(`${suffix}: actual JSON original source parameters independently parse and match API`);
 assert.deepEqual(t.source,response.source);checks.push(`${suffix}: all actual original spatial/cut source fields exactly match API`);
 assert.deepEqual(t.stats,response.stats);checks.push(`${suffix}: actual complete stats and checks retained`);
 const raw=response.fold,points=raw.edges_vertices.flatMap(([a,b]:number[])=>[raw.vertices_coords[a],raw.vertices_coords[b]]),
   min=[0,1].map(k=>Math.min(...points.map((p:number[])=>p[k]))),max=[0,1].map(k=>Math.max(...points.map((p:number[])=>p[k]))),scale=200/Math.max(max[0]-min[0],max[1]-min[1]),
   expected=raw.edges_vertices.map(([a,b]:number[],i:number)=>({a:raw.vertices_coords[a].map((x:number,k:number)=>(x-min[k])*scale),b:raw.vertices_coords[b].map((x:number,k:number)=>(x-min[k])*scale),assignment:raw.edges_assignment[i]}));
 check(doc.segments.length===196&&expected.length===196,`${suffix}: actual196 original CP edges retained once`);
 check(doc.segments.every((s,i)=>JSON.stringify(s.a)===JSON.stringify(expected[i].a)&&JSON.stringify(s.b)===JSON.stringify(expected[i].b)&&s.assignment===expected[i].assignment),`${suffix}: every actual JSON endpoint uses existing min/200-span conversion exactly once`);
 check(doc.paper.width===(max[0]-min[0])*scale&&doc.paper.height===(max[1]-min[1])*scale,`${suffix}: existing physical paper dimensions preserved exactly`);
 check(t.stats.checks.layerOrder.status==='not_checked'&&t.source.continuousRigidPathChecked===false,`${suffix}: static result does not invent flat-fold/continuous certificate`);
 check(foldRaw.frame_unit==='mm'&&foldRaw.edges_vertices.length===196,`${suffix}: actual FOLD is ordinary mm CP with196 edges`);
 assert.deepEqual((importFoldInterchange(foldRaw).zhezhi_metadata as any).tessellation,t);checks.push(`${suffix}: actual FOLD contains complete original parameter/source data`);
 const tolerance=16*Number.EPSILON*Math.max(1,...doc.segments.flatMap(s=>[...s.a,...s.b]).map(Math.abs));
 const available=[...doc.segments],errors:number[]=[];
 for(const s of foldDoc.segments){const index=available.findIndex(e=>e.assignment===s.assignment&&
  (Math.max(Math.hypot(e.a[0]-s.a[0],e.a[1]-s.a[1]),Math.hypot(e.b[0]-s.b[0],e.b[1]-s.b[1]))<=tolerance||
   Math.max(Math.hypot(e.a[0]-s.b[0],e.a[1]-s.b[1]),Math.hypot(e.b[0]-s.a[0],e.b[1]-s.a[1]))<=tolerance));
  assert.ok(index>=0,`${suffix}: FOLD coverage ${s.id}`);const e=available.splice(index,1)[0];errors.push(Math.min(
    Math.max(Math.hypot(e.a[0]-s.a[0],e.a[1]-s.a[1]),Math.hypot(e.b[0]-s.b[0],e.b[1]-s.b[1])),
    Math.max(Math.hypot(e.a[0]-s.b[0],e.a[1]-s.b[1]),Math.hypot(e.b[0]-s.a[0],e.b[1]-s.a[1]))));}
 check(available.length===0&&foldDoc.segments.length===196,`${suffix}: actual FOLD independent reparse covers all segments once within16epsilon world bound`);
 const dxf=read(`adopted-${suffix}-X.dxf`);
 check(dxf===exportDXF(doc).text,`${suffix}: actual DXF matches unchanged ordinary LINE exporter byte for byte`);
 const lines=dxf.trim().split(/\r?\n/),entities:Map<number,string>[]=[],types:string[]=[];let entity:Map<number,string>|null=null;
 for(let i=0;i<lines.length;i+=2){const code=Number(lines[i]),value=lines[i+1];if(code===0){if(entity)entities.push(entity);entity=value==='LINE'?new Map():null;if(['LINE','POLYLINE','LWPOLYLINE','SEQEND','VERTEX'].includes(value))types.push(value);}else if(entity)entity.set(code,value);}
 check(types.length===196&&types.every(x=>x==='LINE'),`${suffix}: independently parsed DXF contains only196 ordinary LINE entities`);
 check(entities.every((e,i)=>Number(e.get(10))===doc.segments[i].a[0]&&Number(e.get(20))===-doc.segments[i].a[1]&&Number(e.get(11))===doc.segments[i].b[0]&&Number(e.get(21))===-doc.segments[i].b[1]&&e.get(8)===DXF_LAYERS[doc.segments[i].assignment].name),`${suffix}: DXF coverage/scale/position/layers exact, single existing Y reflection`);
 check(dxf.includes('AC1009')&&!/\n(?:PU|PD|SP|VS|PA)\n/.test(dxf),`${suffix}: R12 ordinary format adds no machining/pen instruction`);
 audits.push({suffix,segments:196,normalization:{min,scale,paper:doc.paper},maximumFoldError:Math.max(...errors),foldTolerance:tolerance});
}
const reopen=importDocument(read('reopened-edited-X-fold.zhezhi.json'),'json').doc,edited=importDocument(read('adopted-edited-X.zhezhi.json'),'json').doc;
assert.deepEqual((reopen.metadata!.tessellation as any).parameters,(edited.metadata!.tessellation as any).parameters);checks.push('actual main FOLD reopen and subsequent ordinary JSON retain all original X inputs');
assert.deepEqual((reopen.metadata!.tessellation as any).source,(edited.metadata!.tessellation as any).source);checks.push('actual main FOLD reopen retains complete indexed spatial/cut source');
check(reopen.segments.length===196&&edited.segments.length===196,'actual main FOLD reopen retains processing count');
const files=ui.downloads.map((d:any)=>{const bytes=fs.readFileSync(d.path);assert.ok(bytes.length>0);return{...d,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
check(files.filter((f:any)=>f.origin==='user-button').length===7,'7 actual user-button exports distinguished from2 real API captures');
const result={verified:true,checks:checks.length,labels:checks,actualUserDownloads:7,actualBrowserResponseCaptures:2,files,audits,bundle:ui.bundle,geometryCoverage:true,ordinaryDXFUnchanged:true,
             notVerified:['root unified suite after integration','Wolfram Out','native portable app','continuous folding/self-collision','third-party cutter import or machine testing']};
fs.writeFileSync(`${base}/download-audit.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({verified:true,checks:checks.length,actualUserDownloads:7,actualBrowserResponseCaptures:2,audits}));
