import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {importDocument} from '../src/core/formats';
import {prepareProjectImport} from '../src/app/prepareProjectImport';
import {computeFlatFold} from '../src/core/flatFold';
import {computeModelSurface} from '../src/app/modelSurfaceAnalysis';
import type {FlatFoldResult} from '../src/core/types';

const input=process.argv[2],output=path.resolve(process.argv[3]??'.runtime/qa-complete-flat');
if(!input)throw Error('请提供 CP/ORI 文件路径。');
fs.mkdirSync(output,{recursive:true});
const started=performance.now();
const report=(stage:string,details:Record<string,unknown>={})=>{
 const event={stage,seconds:Math.round((performance.now()-started)/100)/10,rssMiB:Math.round(process.memoryUsage().rss/1048576),...details};
 console.log(JSON.stringify(event));fs.appendFileSync(path.join(output,'progress.ndjson'),JSON.stringify(event)+'\n');
};
let result:FlatFoldResult;
if(input.endsWith('.result.json'))result=JSON.parse(fs.readFileSync(input,'utf8'));
else{
 const bytes=fs.readFileSync(input);report('read',{bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 const format=path.extname(input).slice(1).toLowerCase();
 if(!['ori','cp','fold'].includes(format))throw Error('验证仅接受 ori/cp/fold 文件。');
 const imported=importDocument(bytes.toString('utf8'),format as 'ori'|'cp'|'fold',path.basename(input));report('parsed',{segments:imported.doc.segments.length,warnings:imported.warnings});
 const doc=prepareProjectImport(imported.doc);report('prepared',{segments:doc.segments.length});
 result=computeFlatFold(doc,geometry=>report('geometry',{faces:geometry.geometry.faces.length,vertices:geometry.geometry.vertices.length}),{},graph=>report('source',{faces:graph.faces_vertices?.length,vertices:graph.vertices_coords.length}));
 fs.writeFileSync(path.join(output,'fold.result.json'),JSON.stringify(result));
 report('layers',{geometry:result.geometry.status,status:result.layers.status,message:result.layers.message,relations:result.layers.faceOrders?.length});
}
if(result.layers.status==='solved'){
 const surface=computeModelSurface({result,side:'front',bothSides:true,shadows:false},progress=>report('surface',progress));
 const summary=surface.status==='complete'?{status:surface.status,cells:surface.analysis.cells.length,omitted:surface.analysis.omittedThinRegions,boundaries:surface.boundaries?.edges.length,ambiguous:surface.boundaries?.ambiguousEdges,epsilon:surface.analysis.epsilon}:{status:surface.status,message:surface.message};
 fs.writeFileSync(path.join(output,'surface-summary.json'),JSON.stringify(summary,null,2));report('surface-result',summary);
 if(surface.status!=='complete')process.exitCode=1;
}else process.exitCode=1;
