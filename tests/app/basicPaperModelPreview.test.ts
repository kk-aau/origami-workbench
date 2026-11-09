import test from 'node:test';
import assert from 'node:assert/strict';
import {basicPaperModelPreset,basicPaperModelSourceKey,basicPaperModelSourceMatches,type BasicPaperModelRecipe} from '../../src/app/basicPaperModelsCP';
import {buildBasicPaperModelPreviewReply,LatestBasicPaperModelPreview,type BasicPaperModelPreviewPayload,type BasicPaperModelPreviewReply,type BasicPaperModelPreviewRequest,type BasicPaperModelWorkerPort} from '../../src/app/basicPaperModelPreview';
class Port implements BasicPaperModelWorkerPort{
 sent:BasicPaperModelPreviewRequest[]=[];receive:((reply:BasicPaperModelPreviewReply)=>void)|null=null;error:((message:string)=>void)|null=null;terminated=0;unsubscribed=0;
 postMessage=(r:BasicPaperModelPreviewRequest)=>{this.sent.push(structuredClone(r));};
 subscribe=(receive:(reply:BasicPaperModelPreviewReply)=>void,error:(message:string)=>void)=>{this.receive=receive;this.error=error;return()=>{this.unsubscribed++;this.receive=null;this.error=null;};};
 terminate=()=>{this.terminated++;};
}
const recipe=(angle=30)=>({model:'cube-box',foldAngleDeg:angle}) as BasicPaperModelRecipe;
function harness(){const port=new Port(),ready:BasicPaperModelPreviewPayload[]=[],errors:{message:string;key:string}[]=[],busy:boolean[]=[],session=new LatestBasicPaperModelPreview(port,{onReady:p=>ready.push(p),onError:(message,key)=>errors.push({message,key}),onBusy:b=>busy.push(b)});return {port,ready,errors,busy,session};}
const errorReply=(r:BasicPaperModelPreviewRequest):BasicPaperModelPreviewReply=>({kind:'error',id:r.id,key:r.key,message:'example computation error'});
test('cloneable worker data preserves all five source models, the explicit Hex strategy and the single flap boundary mapping',()=>{
 for(const model of ['hexagon-vertex','cube-box','flap-cube-box','unit-tetrahedron','oriceps'] as const){const variants:BasicPaperModelRecipe[]=[basicPaperModelPreset(model)];if(model==='hexagon-vertex')variants.push({model,elevationDeg:30,assignmentPolicy:'from-folded-form'});for(const r of variants){const reply=structuredClone(buildBasicPaperModelPreviewReply({id:1,key:basicPaperModelSourceKey(r),recipe:r}));assert.equal(reply.kind,'result');if(reply.kind!=='result')continue;assert.equal(basicPaperModelSourceMatches(reply.payload.doc),true);assert.equal(!!reply.payload.scene,r.model!=='hexagon-vertex'||r.assignmentPolicy==='from-folded-form');assert.equal(reply.payload.key,basicPaperModelSourceKey(r));assert.equal('build' in reply.payload,false);if(model==='flap-cube-box'){const saved=reply.payload.doc.metadata!.originalBasicPaperModel as any;assert.equal(saved.assignmentWorkflow.materialBoundaryConversions[0].edgeIndex,17);assert.equal(saved.rawSourceTargetAnglesDeg[17],45);}}}
});
test('worker refuses invalid source IDs/keys/recipes without manufacturing a result',()=>{
 const r=recipe();for(const request of [{id:0,key:basicPaperModelSourceKey(r),recipe:r},{id:1,key:'old-key',recipe:r},{id:1,key:'invalid',recipe:{model:'cube-box' as const,foldAngleDeg:1000}}])assert.equal(buildBasicPaperModelPreviewReply(request).kind,'error');
});
test('only the latest pending recipe is sent; stale results never trigger adoption-ready data',()=>{
 const h=harness(),a=recipe(30),b=recipe(35),c=recipe(40);h.session.request(a,basicPaperModelSourceKey(a));h.session.request(b,basicPaperModelSourceKey(b));h.session.request(c,basicPaperModelSourceKey(c));assert.equal(h.port.sent.length,1);
 h.port.receive!(buildBasicPaperModelPreviewReply(h.port.sent[0]));assert.equal(h.ready.length,0);assert.equal(h.port.sent.length,2);assert.deepEqual(h.port.sent[1].recipe,c);h.port.receive!(buildBasicPaperModelPreviewReply(h.port.sent[1]));assert.equal(h.ready.length,1);assert.equal(h.ready[0].key,basicPaperModelSourceKey(c));assert.equal(h.busy.at(-1),false);h.session.dispose();
});
test('wrong reply ID or key cannot release the in-flight request or replace the latest result',()=>{
 const h=harness(),r=recipe();h.session.request(r,basicPaperModelSourceKey(r));const sent=h.port.sent[0];h.port.receive!({...errorReply(sent),id:99});h.port.receive!({...errorReply(sent),key:'stale'});assert.equal(h.errors.length,0);assert.equal(h.ready.length,0);h.port.receive!(buildBasicPaperModelPreviewReply(sent));assert.equal(h.ready.length,1);h.session.dispose();
});
test('invalid draft clears pending work and blocks an old reply; a later valid recipe resumes normally',()=>{
 const h=harness(),a=recipe(30),b=recipe(35);h.session.request(a,basicPaperModelSourceKey(a));h.session.request(b,basicPaperModelSourceKey(b));h.session.invalidate();h.port.receive!(buildBasicPaperModelPreviewReply(h.port.sent[0]));assert.equal(h.ready.length,0);assert.equal(h.port.sent.length,1);assert.equal(h.busy.at(-1),false);h.session.request(b,basicPaperModelSourceKey(b));h.port.receive!(buildBasicPaperModelPreviewReply(h.port.sent[1]));assert.equal(h.ready.length,1);h.session.dispose();
});
test('same key is not resubmitted and disposal terminates once; late messages cannot mutate UI callbacks',()=>{
 const h=harness(),r=recipe();h.session.request(r,basicPaperModelSourceKey(r));h.session.request(r,basicPaperModelSourceKey(r));assert.equal(h.port.sent.length,1);const old=h.port.receive!;h.session.dispose();h.session.dispose();old(buildBasicPaperModelPreviewReply(h.port.sent[0]));assert.equal(h.ready.length,0);assert.equal(h.port.terminated,1);assert.equal(h.port.unsubscribed,1);
});
test('current errors are reported but old computation errors are ignored and newest request still runs',()=>{
 const h=harness(),a=recipe(30),b=recipe(35);h.session.request(a,basicPaperModelSourceKey(a));h.session.request(b,basicPaperModelSourceKey(b));h.port.receive!(errorReply(h.port.sent[0]));assert.equal(h.errors.length,0);assert.equal(h.port.sent.length,2);h.port.receive!(errorReply(h.port.sent[1]));assert.equal(h.errors.length,1);assert.equal(h.errors[0].key,basicPaperModelSourceKey(b));assert.equal(h.busy.at(-1),false);h.session.dispose();
});
test('fatal worker errors end busy state and stay visible on a new request without a stuck queue',()=>{
 const h=harness(),a=recipe(30),b=recipe(35);h.session.request(a,basicPaperModelSourceKey(a));h.port.error!('thread failed');assert.equal(h.errors[0].message,'thread failed');assert.equal(h.busy.at(-1),false);h.session.request(b,basicPaperModelSourceKey(b));assert.equal(h.port.sent.length,1);assert.equal(h.errors.at(-1)?.key,basicPaperModelSourceKey(b));h.session.dispose();
});
