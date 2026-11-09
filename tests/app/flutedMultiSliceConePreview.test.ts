import test from 'node:test';
import assert from 'node:assert/strict';
import {flutedMultiSliceConePreset,flutedMultiSliceConeSourceKey,flutedMultiSliceConeSourceMatches,type FlutedMultiSliceConeRecipe} from '../../src/app/flutedMultiSliceConeCP';
import {buildFlutedConePreviewReply,LatestFlutedConePreview,type FlutedConePreviewPayload,type FlutedConePreviewReply,type FlutedConePreviewRequest,type FlutedConeWorkerPort} from '../../src/app/flutedMultiSliceConePreview';
class Port implements FlutedConeWorkerPort{
 sent:FlutedConePreviewRequest[]=[];receive:((reply:FlutedConePreviewReply)=>void)|null=null;error:((message:string)=>void)|null=null;terminated=0;unsubscribed=0;
 postMessage=(r:FlutedConePreviewRequest)=>{this.sent.push(structuredClone(r));};
 subscribe=(receive:(reply:FlutedConePreviewReply)=>void,error:(message:string)=>void)=>{this.receive=receive;this.error=error;return()=>{this.unsubscribed++;this.receive=null;this.error=null;};};
 terminate=()=>{this.terminated++;};
}
const recipe=(angle=30)=>({...flutedMultiSliceConePreset('simple'),interiorAngleDeg:angle}) as FlutedMultiSliceConeRecipe;
function harness(){const port=new Port(),ready:FlutedConePreviewPayload[]=[],errors:{message:string;key:string}[]=[],busy:boolean[]=[],session=new LatestFlutedConePreview(port,{onReady:p=>ready.push(p),onError:(message,key)=>errors.push({message,key}),onBusy:b=>busy.push(b)});return {port,ready,errors,busy,session};}
const errorReply=(r:FlutedConePreviewRequest):FlutedConePreviewReply=>({kind:'error',id:r.id,key:r.key,message:'example computation error'});
test('worker data builder preserves both explicit policies and passes full source after cloning including Wave24',()=>{
 for(const model of ['simple','multi','wave24'] as const)for(const policy of ['original','from-folded-form'] as const){const r={...flutedMultiSliceConePreset(model),assignmentPolicy:policy},reply=structuredClone(buildFlutedConePreviewReply({id:1,key:flutedMultiSliceConeSourceKey(r),recipe:r}));assert.equal(reply.kind,'result');if(reply.kind!=='result')continue;assert.equal(flutedMultiSliceConeSourceMatches(reply.payload.doc),true);assert.equal(!!reply.payload.scene,policy==='from-folded-form');assert.equal(reply.payload.diagnostic.diagnosticOnly,policy==='original');assert.equal(reply.payload.key,flutedMultiSliceConeSourceKey(r));assert.equal('build' in reply.payload,false);}
});
test('worker refuses invalid source IDs/keys/recipes without manufacturing a result',()=>{
 const r=recipe();for(const request of [{id:0,key:flutedMultiSliceConeSourceKey(r),recipe:r},{id:1,key:'old-key',recipe:r},{id:1,key:'invalid',recipe:{...r,interiorAngleDeg:0}}])assert.equal(buildFlutedConePreviewReply(request).kind,'error');
});
test('only the latest pending recipe is sent; stale results never trigger adoption-ready data',()=>{
 const h=harness(),a=recipe(30),b=recipe(35),c=recipe(40);h.session.request(a,flutedMultiSliceConeSourceKey(a));h.session.request(b,flutedMultiSliceConeSourceKey(b));h.session.request(c,flutedMultiSliceConeSourceKey(c));assert.equal(h.port.sent.length,1);
 h.port.receive!(buildFlutedConePreviewReply(h.port.sent[0]));assert.equal(h.ready.length,0);assert.equal(h.port.sent.length,2);assert.deepEqual(h.port.sent[1].recipe,c);h.port.receive!(buildFlutedConePreviewReply(h.port.sent[1]));assert.equal(h.ready.length,1);assert.equal(h.ready[0].key,flutedMultiSliceConeSourceKey(c));assert.equal(h.busy.at(-1),false);h.session.dispose();
});
test('wrong reply ID or key cannot release the in-flight request or replace the latest result',()=>{
 const h=harness(),r=recipe();h.session.request(r,flutedMultiSliceConeSourceKey(r));const sent=h.port.sent[0];h.port.receive!({...errorReply(sent),id:99});h.port.receive!({...errorReply(sent),key:'stale'});assert.equal(h.errors.length,0);assert.equal(h.ready.length,0);h.port.receive!(buildFlutedConePreviewReply(sent));assert.equal(h.ready.length,1);h.session.dispose();
});
test('invalid draft clears pending work and blocks an old reply; a later valid recipe resumes normally',()=>{
 const h=harness(),a=recipe(30),b=recipe(35);h.session.request(a,flutedMultiSliceConeSourceKey(a));h.session.request(b,flutedMultiSliceConeSourceKey(b));h.session.invalidate();h.port.receive!(buildFlutedConePreviewReply(h.port.sent[0]));assert.equal(h.ready.length,0);assert.equal(h.port.sent.length,1);assert.equal(h.busy.at(-1),false);h.session.request(b,flutedMultiSliceConeSourceKey(b));h.port.receive!(buildFlutedConePreviewReply(h.port.sent[1]));assert.equal(h.ready.length,1);h.session.dispose();
});
test('same key is not resubmitted and disposal terminates once; late messages cannot mutate UI callbacks',()=>{
 const h=harness(),r=recipe();h.session.request(r,flutedMultiSliceConeSourceKey(r));h.session.request(r,flutedMultiSliceConeSourceKey(r));assert.equal(h.port.sent.length,1);const old=h.port.receive!;h.session.dispose();h.session.dispose();old(buildFlutedConePreviewReply(h.port.sent[0]));assert.equal(h.ready.length,0);assert.equal(h.port.terminated,1);assert.equal(h.port.unsubscribed,1);
});
test('current errors are reported but old computation errors are ignored and newest request still runs',()=>{
 const h=harness(),a=recipe(30),b=recipe(35);h.session.request(a,flutedMultiSliceConeSourceKey(a));h.session.request(b,flutedMultiSliceConeSourceKey(b));h.port.receive!(errorReply(h.port.sent[0]));assert.equal(h.errors.length,0);assert.equal(h.port.sent.length,2);h.port.receive!(errorReply(h.port.sent[1]));assert.equal(h.errors.length,1);assert.equal(h.errors[0].key,flutedMultiSliceConeSourceKey(b));assert.equal(h.busy.at(-1),false);h.session.dispose();
});
test('fatal worker errors end busy state and stay visible on a new request without a stuck queue',()=>{
 const h=harness(),a=recipe(30),b=recipe(35);h.session.request(a,flutedMultiSliceConeSourceKey(a));h.port.error!('thread failed');assert.equal(h.errors[0].message,'thread failed');assert.equal(h.busy.at(-1),false);h.session.request(b,flutedMultiSliceConeSourceKey(b));assert.equal(h.port.sent.length,1);assert.equal(h.errors.at(-1)?.key,flutedMultiSliceConeSourceKey(b));h.session.dispose();
});
