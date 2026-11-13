import {preferenceStorage,type Preferences} from './preferenceStorage';
import {validateBaseDesign,serializeBaseDesign,type BaseDesignProject} from './baseDesign';

const KEY='zhezhi.base-design-library.v1';
export interface BaseDesignEntry {id:string;revision:string;updated:string;project:BaseDesignProject;saved:string|null}
export type BaseDesignBank={version:1;entries:BaseDesignEntry[]};
export interface BaseDesignSummary {readonly id:string;readonly revision:string;readonly updated:string;readonly name:string;readonly kind:BaseDesignProject['kind'];readonly saved:boolean}
function summary(entry:BaseDesignEntry,content?:string):BaseDesignSummary{return {id:entry.id,revision:entry.revision,updated:entry.updated,name:entry.project.name,kind:entry.project.kind,saved:entry.saved!==null&&entry.saved===(content??JSON.stringify(entry.project))};}
export function summarizeBaseDesignBank(bank:BaseDesignBank):BaseDesignSummary[]{return bank.entries.map(entry=>summary(entry)).sort((a,b)=>b.updated.localeCompare(a.updated));}
const immutableSummaries=(items:readonly BaseDesignSummary[]):readonly BaseDesignSummary[]=>Object.freeze(items.map(item=>Object.freeze(item)));
export function readBaseDesignBank(text:string|null):BaseDesignBank {
 if(text===null)return {version:1,entries:[]};
 const bank=JSON.parse(text);
 if(bank?.version!==1||!Array.isArray(bank.entries))throw new Error('设计文档库格式不支持，原数据已保留。');
 const ids=new Set<string>();
 for(const entry of bank.entries){
  if(!entry||typeof entry.id!=='string'||ids.has(entry.id)||typeof entry.revision!=='string'||typeof entry.updated!=='string'||!(entry.saved===null||typeof entry.saved==='string'))throw new Error('设计文档库内容不完整，原数据已保留。');
  ids.add(entry.id);validateBaseDesign(entry.project);
 }
 return bank;
}
/** CAS protects independent windows. A stale editor can export a backup but
 * cannot silently replace another window's saved or recovered document. */
export class BaseDesignLibrary {
 private hydrated:boolean;
 private cachedText:string|null|undefined;
 private cachedBank:BaseDesignBank|undefined;
 private cachedSummaries:readonly BaseDesignSummary[]|undefined;
 private loading:Promise<void>|undefined;
 private generation=0;
 constructor(private storage:Preferences=preferenceStorage){this.hydrated=!storage.getItemAsync;}
 isReady(){return this.hydrated&&!this.loading;}
 ready(force=false):Promise<void>{
  if(this.loading&&!force)return this.loading;
  if(this.hydrated&&!force)return Promise.resolve();
  if(force)this.hydrated=false;
  const generation=++this.generation;
  const task=(async()=>{
   const text=this.storage.getItemAsync?await this.storage.getItemAsync(KEY):this.storage.getItem(KEY);
   const prepared=text===this.cachedText&&this.cachedBank?null:await prepareBank(text);
   if(generation!==this.generation)throw Error('设计文档库读取已被更新，请重试。');
   if(prepared){this.cachedText=text;this.cachedBank=prepared.bank;this.cachedSummaries=immutableSummaries(prepared.summaries);}
   this.hydrated=true;
  })();
  this.loading=task;void task.finally(()=>{if(this.loading===task)this.loading=undefined;}).catch(()=>{});return task;
 }
 private bank(){
  if(!this.hydrated||this.loading)throw Error('设计文档库正在读取，请稍后重试；当前内容未改动。');
  const text=this.storage.getItemAsync?this.cachedText??null:this.storage.getItem(KEY);
  if(text!==this.cachedText||!this.cachedBank){
   if(this.storage.getItemAsync&&this.cachedText!==undefined)throw Error('设计文档库已变化，请刷新后重试。');
   const bank=readBaseDesignBank(text);this.cachedText=text;this.cachedBank=bank;this.cachedSummaries=undefined;
  }
  return {text,bank:this.cachedBank};
 }
 private confirm(text:string,bank:BaseDesignBank,summaries?:readonly BaseDesignSummary[]){this.cachedText=text;this.cachedBank=bank;this.cachedSummaries=summaries;}
 /** UI lists contain only immutable metadata. Copy an individual source when
  * opening it, instead of cloning every saved source on each refresh. */
 listSummaries():readonly BaseDesignSummary[]{const {bank}=this.bank();return this.cachedSummaries??(this.cachedSummaries=immutableSummaries(summarizeBaseDesignBank(bank)));}
 get(id:string):BaseDesignEntry|undefined {const entry=this.bank().bank.entries.find(item=>item.id===id);return entry?structuredClone(entry):undefined;}
 list(){return structuredClone(this.bank().bank.entries).sort((a,b)=>b.updated.localeCompare(a.updated));}
 write(project:BaseDesignProject,previous:Pick<BaseDesignEntry,'id'|'revision'|'saved'>|null,saved=false):BaseDesignEntry {
  const {text,bank:current}=this.bank(),content=serializeBaseDesign(project),bank={...current,entries:[...current.entries]},old=previous?bank.entries.find(e=>e.id===previous.id):null;
  if(previous&&old?.revision!==previous.revision)throw new Error('此设计已在另一窗口修改或删除。当前内容仍保留，请导出备份或另存新文档。');
  const entry:BaseDesignEntry={id:previous?.id??crypto.randomUUID(),revision:crypto.randomUUID(),updated:new Date().toISOString(),project:structuredClone(project),saved:saved?content:previous?.saved??null};
  bank.entries=bank.entries.filter(e=>e.id!==entry.id);bank.entries.push(entry);
  const encoded=JSON.stringify(bank);if(!this.storage.compareAndSet?.(KEY,text,encoded))throw new Error('设计文档库刚有更新，暂存未完成。请重试；当前编辑仍保留。');
  const summaries=this.cachedSummaries?immutableSummaries([...this.cachedSummaries.filter(item=>item.id!==entry.id),summary(entry,content)].sort((a,b)=>b.updated.localeCompare(a.updated))):undefined;
  this.confirm(encoded,bank,summaries);
  return structuredClone(entry);
 }
 remove(entry:Pick<BaseDesignEntry,'id'|'revision'>){const {text,bank:current}=this.bank(),old=current.entries.find(e=>e.id===entry.id);if(old?.revision!==entry.revision)throw new Error('设计文档已变化，请刷新后重试。');const bank={...current,entries:current.entries.filter(e=>e.id!==entry.id)},encoded=JSON.stringify(bank);if(!this.storage.compareAndSet?.(KEY,text,encoded))throw new Error('文档库刚有更新，请刷新后重试。');this.confirm(encoded,bank,this.cachedSummaries?immutableSummaries(this.cachedSummaries.filter(item=>item.id!==entry.id)):undefined);}
}

function prepareBank(text:string|null):Promise<{bank:BaseDesignBank;summaries:BaseDesignSummary[]}>{
 if(!text||text.length<128*1024||typeof Worker==='undefined'){const bank=readBaseDesignBank(text);return Promise.resolve({bank,summaries:summarizeBaseDesignBank(bank)});}
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../workers/baseDesignLibrary.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=event=>{worker.terminate();if(event.data?.error)reject(Error(event.data.error));else resolve(event.data);};
  worker.onerror=event=>{worker.terminate();reject(Error(event.message||'设计文档库读取线程异常，原数据未改动。'));};
  worker.onmessageerror=()=>{worker.terminate();reject(Error('无法读取设计文档库结果，原数据未改动。'));};
  worker.postMessage(text);
 });
}
