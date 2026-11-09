import type {Doc} from '../core/types';
import type {RigidQuadScene} from './rigidQuadView';
import {prepareBasicPaperModelPreview,basicPaperModelSourceMatches,basicPaperModelScene,basicPaperModelSpatialDiagnostic,type BasicPaperModelRecipe} from './basicPaperModelsCP';

export type BasicPaperModelDiagnostic=NonNullable<ReturnType<typeof basicPaperModelSpatialDiagnostic>>;
export type BasicPaperModelPreviewPayload={key:string;doc:Doc;scene:RigidQuadScene|null;diagnostic:BasicPaperModelDiagnostic};
export type BasicPaperModelPreviewRequest={id:number;key:string;recipe:BasicPaperModelRecipe};
export type BasicPaperModelPreviewReply={kind:'result';id:number;key:string;payload:BasicPaperModelPreviewPayload}|{kind:'error';id:number;key:string;message:string};
/** Only cloneable data crosses the worker boundary, after full current-source checks. */
export function buildBasicPaperModelPreviewReply(request:BasicPaperModelPreviewRequest):BasicPaperModelPreviewReply{
 try{
  if(!Number.isSafeInteger(request.id)||request.id<1)throw Error('无效预览请求编号。');
  const prepared=prepareBasicPaperModelPreview(request.recipe);if(prepared.key!==request.key)throw Error('预览请求与当前源参数不一致。');
  const doc=prepared.build();if(!basicPaperModelSourceMatches(doc))throw Error('当前原构造与来源不一致，不能采用。');
  const scene=basicPaperModelScene(doc),diagnostic=basicPaperModelSpatialDiagnostic(doc);if(!diagnostic)throw Error('原目标形态来源核验失败。');
  return {kind:'result',id:request.id,key:request.key,payload:{key:request.key,doc,scene,diagnostic}};
 }catch(e){return {kind:'error',id:request.id,key:request.key,message:(e as Error).message};}
}
export type BasicPaperModelWorkerPort={postMessage:(request:BasicPaperModelPreviewRequest)=>void;subscribe:(receive:(reply:BasicPaperModelPreviewReply)=>void,error:(message:string)=>void)=>()=>void;terminate:()=>void};
type Callbacks={onReady:(payload:BasicPaperModelPreviewPayload)=>void;onError:(message:string,key:string)=>void;onBusy:(busy:boolean)=>void};
/** One in flight and one replaceable pending request; replies bind both exact ID and source key. */
export class LatestBasicPaperModelPreview{
 private sequence=0;private desired:BasicPaperModelPreviewRequest|null=null;private running:BasicPaperModelPreviewRequest|null=null;private pending:BasicPaperModelPreviewRequest|null=null;private disposed=false;private fatal='';private unsubscribe:()=>void;
 constructor(private port:BasicPaperModelWorkerPort,private callbacks:Callbacks){this.unsubscribe=port.subscribe(reply=>this.receive(reply),message=>this.failed(message));}
 request(recipe:BasicPaperModelRecipe,key:string){
  if(this.disposed)return;if(this.desired?.key===key)return;
  const request={id:++this.sequence,key,recipe:structuredClone(recipe)};this.desired=request;
  if(this.fatal){this.callbacks.onError(this.fatal,key);this.callbacks.onBusy(false);return;}
  this.callbacks.onBusy(true);if(this.running){this.pending=request;return;}this.start(request);
 }
 invalidate(){if(this.disposed)return;this.desired=null;this.pending=null;this.callbacks.onBusy(false);}
 dispose(){if(this.disposed)return;this.disposed=true;this.desired=this.running=this.pending=null;this.unsubscribe();this.port.terminate();}
 private start(request:BasicPaperModelPreviewRequest){if(this.disposed)return;this.running=request;try{this.port.postMessage(request);}catch(e){this.failed((e as Error).message);}}
 private failed(message:string){if(this.disposed)return;this.fatal=message||'预览计算线程不可用。';this.running=this.pending=null;if(this.desired)this.callbacks.onError(this.fatal,this.desired.key);this.callbacks.onBusy(false);}
 private receive(reply:BasicPaperModelPreviewReply){
  if(this.disposed||!this.running||reply.id!==this.running.id||reply.key!==this.running.key)return;
  const completed=this.running;this.running=null;
  if(this.desired?.id===completed.id&&this.desired.key===completed.key){
   if(reply.kind==='result'&&reply.payload.key===completed.key)this.callbacks.onReady(reply.payload);
   else this.callbacks.onError(reply.kind==='error'?reply.message:'计算结果与当前源参数不一致。',completed.key);
  }
  const pending=this.pending;this.pending=null;if(pending&&this.desired?.id===pending.id)this.start(pending);else this.callbacks.onBusy(false);
 }
}
