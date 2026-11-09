import type {StrainTQRecipe,requestStrainTQPreview} from './strainTQDesignCP';
export type TQPreviewPayload=Omit<Awaited<ReturnType<typeof requestStrainTQPreview>>,'build'>&{key:string};
export type TQPreviewRequest={kind:'request';id:number;key:string;recipe:StrainTQRecipe}|{kind:'cancel'};
export type TQPreviewReply={kind:'result';id:number;key:string;payload:TQPreviewPayload}|{kind:'error';id:number;key:string;message:string};
export type TQPreviewPort={postMessage:(request:TQPreviewRequest)=>void;subscribe:(reply:(result:TQPreviewReply)=>void,error:(message:string)=>void)=>()=>void;terminate:()=>void};
type Callbacks={onReady:(payload:TQPreviewPayload)=>void;onError:(message:string,key:string)=>void;onBusy:(busy:boolean)=>void};
/** Abort superseded network requests. Exact source key and request identity guard every publication. */
export class LatestStrainTQPreview{
 private id=0;private desired:{id:number;key:string}|null=null;private disposed=false;private fatal='';private unsubscribe:()=>void;
 constructor(private port:TQPreviewPort,private callbacks:Callbacks){this.unsubscribe=port.subscribe(reply=>this.receive(reply),message=>{this.fatal=message||'计算线程不可用。';if(this.desired)this.callbacks.onError(this.fatal,this.desired.key);this.callbacks.onBusy(false);});}
 request(recipe:StrainTQRecipe,key:string,force=false){if(this.disposed||!force&&this.desired?.key===key)return;this.desired={id:++this.id,key};if(this.fatal){this.callbacks.onError(this.fatal,key);this.callbacks.onBusy(false);return;}this.callbacks.onBusy(true);try{this.port.postMessage({kind:'request',...this.desired,recipe:structuredClone(recipe)});}catch(e){this.fatal=(e as Error).message;this.callbacks.onError(this.fatal,key);this.callbacks.onBusy(false);}}
 invalidate(){if(this.disposed)return;this.desired=null;this.port.postMessage({kind:'cancel'});this.callbacks.onBusy(false);}
 dispose(){if(this.disposed)return;this.disposed=true;this.desired=null;this.unsubscribe();this.port.terminate();}
 private receive(reply:TQPreviewReply){if(this.disposed||!this.desired||reply.id!==this.desired.id||reply.key!==this.desired.key)return;if(reply.kind==='result'&&reply.payload.key===reply.key&&JSON.stringify(reply.payload.recipe)===reply.key)this.callbacks.onReady(reply.payload);else this.callbacks.onError(reply.kind==='error'?reply.message:'当前参数与结果来源不一致。',reply.key);this.callbacks.onBusy(false);}
}
