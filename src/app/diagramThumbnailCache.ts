import type {DiagramCPState,DiagramStep} from './diagramProject';
import type {DiagramLineDefaults} from './diagramLineStyles';
import type {DiagramZoomRegion} from './diagramZoomGeometry';
import type {DiagramPDFRect} from './diagramPDFLayout';
import {diagramStepImageSVG} from './diagramImageExport';
import {normalizeDiagramPDFStrokes} from './diagramPDFPage';
import {rasterizeDiagramThumbnail} from './diagramThumbnailRaster';
import {defaultModelView} from './modelViewState';

export interface DiagramThumbnailSource {
  step:DiagramStep;
  states:readonly DiagramCPState[];
  lineDefaults:DiagramLineDefaults;
  adaptiveLines:boolean;
  zoom?:DiagramZoomRegion|null;
  size:Pick<DiagramPDFRect,'width'|'height'>;
  preparation?:{pending:boolean;message?:string};
}
export interface DiagramThumbnailSnapshot {
  src?:string;
  status:'idle'|'loading'|'ready'|'preparation'|'error';
  message?:string;
}
interface CachedImage {src:string;bytes:number}
interface Entry {
  key?:string;session?:object;version:number;image?:CachedImage;
  snapshot:DiagramThumbnailSnapshot;listeners:Set<()=>void>;touched:number;
}
const EMPTY:DiagramThumbnailSnapshot={status:'idle'};

async function renderImage(source:DiagramThumbnailSource):Promise<CachedImage> {
  const svg=diagramStepImageSVG(source.step,source.states,source.size,source.lineDefaults,source.adaptiveLines,source.zoom);
  const blob=await rasterizeDiagramThumbnail(normalizeDiagramPDFStrokes(svg)),src=URL.createObjectURL(blob);
  // Commit only after the replacement itself can be decoded. A failed refresh
  // must not discard the last good image or flash an empty card.
  try{const image=new Image();image.src=src;await image.decode();return {src,bytes:blob.size};}
  catch(error){URL.revokeObjectURL(src);throw error;}
}

/** Session-only PNGs. Saved projects and full-resolution exports never depend
 * on these disposable previews. Object identity keys do not retain old geometry. */
export class DiagramThumbnailCache {
  private entries=new Map<string,Entry>();
  private identities=new WeakMap<object,number>();
  private serial=0;
  private clock=0;
  private generation=0;
  private queued=new Map<string,()=>Promise<void>>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private running=false;
  private bytes=0;
  constructor(private render:(source:DiagramThumbnailSource)=>Promise<CachedImage>=renderImage,private release:(url:string)=>void=url=>URL.revokeObjectURL(url),private maxBytes=32*1024*1024){}

  private entry(id:string):Entry {
    let entry=this.entries.get(id);
    if(!entry){entry={version:0,snapshot:EMPTY,listeners:new Set(),touched:++this.clock};this.entries.set(id,entry);}
    return entry;
  }
  getSnapshot=(id:string):DiagramThumbnailSnapshot=>this.entries.get(id)?.snapshot??EMPTY;
  subscribe=(id:string,listener:()=>void):(()=>void)=>{
    const entry=this.entry(id);entry.listeners.add(listener);entry.touched=++this.clock;
    return()=>{entry.listeners.delete(listener);};
  };
  private publish(entry:Entry,snapshot:DiagramThumbnailSnapshot){entry.snapshot=snapshot;for(const listener of entry.listeners)listener();}
  private identity(value:object|null|undefined):number {
    if(!value)return 0;
    let id=this.identities.get(value);if(!id){id=++this.serial;this.identities.set(value,id);}return id;
  }
  private poseArtworkKey(pose:DiagramStep['pose']):unknown {
    if(!pose)return null;
    const {view=defaultModelView(),...content}=pose,{cameras:_,...appearance}=view;
    // PDF panels fit their artwork independently of the editor's pan/zoom.
    // Preserve every other pose field without serializing large geometry; view
    // settings are small values because viewport commits also copy that shell.
    return [Object.entries(content).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,value&&typeof value==='object'?this.identity(value):value]),appearance];
  }
  private key(source:DiagramThumbnailSource):string {
    const {step,states,size,preparation}=source,ids=new Set([step.beforeId,step.afterId]);
    for(const callout of step.callouts??[]){if(callout.source.kind==='cp')ids.add(callout.source.stateId);if(callout.comparison)ids.add(callout.comparison.stateId);}
    const cp=[...ids].map(id=>{const state=states.find(item=>item.id===id);return [id,state?.revision,this.identity(state?.doc)];});
    return JSON.stringify([this.poseArtworkKey(step.pose),this.identity(step.simulationSurface),this.identity(step.annotations),this.identity(step.images),this.identity(step.callouts),step.paperVisible!==false,
      step.foldLink?.enabled,step.foldLink?.precreases,step.canvas?.drawingRotation??0,cp,this.identity(source.lineDefaults),source.adaptiveLines,source.zoom??null,size.width,size.height,
      preparation?.pending,preparation?.message]);
  }

  /** A new editing session first refreshes dependencies inherited from earlier
   * steps. Subsequent edits keep its existing image until the session is left. */
  request(id:string,source:DiagramThumbnailSource,session?:object):void {
    const entry=this.entry(id);entry.touched=++this.clock;
    if(session&&entry.session===session&&(entry.image||entry.snapshot.status==='loading'))return;
    entry.session=session;
    const key=this.key(source);if(entry.key===key)return;
    entry.key=key;const version=++entry.version,generation=this.generation;
    this.queued.delete(id);
    if(source.preparation){
      this.publish(entry,{src:entry.image?.src,status:'preparation',message:source.preparation.message??(source.preparation.pending?'正在准备折图':'层序待确认')});return;
    }
    this.publish(entry,{src:entry.image?.src,status:'loading'});
    this.queued.set(id,async()=>{
      const current=()=>generation===this.generation&&this.entries.get(id)===entry&&entry.version===version;
      if(!current())return;
      try{
        const image=await this.render(source);
        if(!current()){this.release(image.src);return;}
        const previous=entry.image;entry.image=image;this.bytes+=image.bytes-(previous?.bytes??0);
        this.publish(entry,{src:image.src,status:'ready'});
        if(previous)this.release(previous.src);
        this.trim();
      }catch(error){if(current()){entry.key=undefined;this.publish(entry,{src:entry.image?.src,status:'error',message:error instanceof Error?error.message:'缩略图生成失败。'});}}
    });
    this.schedule();
  }
  private schedule(){
    if(this.running||this.timer!==undefined||!this.queued.size)return;
    this.timer=setTimeout(()=>{
      this.timer=undefined;const next=this.queued.entries().next().value;if(!next)return;
      this.queued.delete(next[0]);this.running=true;
      void next[1]().finally(()=>{this.running=false;this.schedule();});
    },0);
  }
  private trim(){
    if(this.bytes<=this.maxBytes)return;
    const unused=[...this.entries.values()].filter(entry=>entry.image&&!entry.listeners.size&&!entry.session).sort((a,b)=>a.touched-b.touched);
    for(const entry of unused){
      if(this.bytes<=this.maxBytes)break;
      this.bytes-=entry.image!.bytes;this.release(entry.image!.src);entry.image=undefined;entry.key=undefined;entry.snapshot=EMPTY;
    }
  }
  prune(ids:ReadonlySet<string>):void {
    for(const [id,entry] of this.entries){if(ids.has(id))continue;
      this.queued.delete(id);entry.version++;if(entry.image){this.bytes-=entry.image.bytes;this.release(entry.image.src);}
      this.entries.delete(id);
    }
  }
  /** Also safe for React's effect cleanup/replay in development. */
  clear():void {
    this.generation++;clearTimeout(this.timer);this.timer=undefined;this.queued.clear();
    for(const entry of this.entries.values()){
      if(entry.image)this.release(entry.image.src);
      entry.version++;entry.key=undefined;entry.session=undefined;entry.image=undefined;this.publish(entry,EMPTY);
    }
    this.bytes=0;
  }
}
