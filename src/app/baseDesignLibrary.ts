import {preferenceStorage,type Preferences} from './preferenceStorage';
import {validateBaseDesign,serializeBaseDesign,type BaseDesignProject} from './baseDesign';

const KEY='zhezhi.base-design-library.v1';
export interface BaseDesignEntry {id:string;revision:string;updated:string;project:BaseDesignProject;saved:string|null}
type Bank={version:1;entries:BaseDesignEntry[]};
function read(text:string|null):Bank {
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
 constructor(private storage:Preferences=preferenceStorage){}
 list(){return read(this.storage.getItem(KEY)).entries.sort((a,b)=>b.updated.localeCompare(a.updated));}
 write(project:BaseDesignProject,previous:Pick<BaseDesignEntry,'id'|'revision'|'saved'>|null,saved=false):BaseDesignEntry {
  const content=serializeBaseDesign(project),text=this.storage.getItem(KEY),bank=read(text),old=previous?bank.entries.find(e=>e.id===previous.id):null;
  if(previous&&old?.revision!==previous.revision)throw new Error('此设计已在另一窗口修改或删除。当前内容仍保留，请导出备份或另存新文档。');
  const entry:BaseDesignEntry={id:previous?.id??crypto.randomUUID(),revision:crypto.randomUUID(),updated:new Date().toISOString(),project,saved:saved?content:previous?.saved??null};
  bank.entries=bank.entries.filter(e=>e.id!==entry.id);bank.entries.push(entry);
  if(!this.storage.compareAndSet?.(KEY,text,JSON.stringify(bank)))throw new Error('设计文档库刚有更新，暂存未完成。请重试；当前编辑仍保留。');
  return entry;
 }
 remove(entry:BaseDesignEntry){const text=this.storage.getItem(KEY),bank=read(text),old=bank.entries.find(e=>e.id===entry.id);if(old?.revision!==entry.revision)throw new Error('设计文档已变化，请刷新后重试。');bank.entries=bank.entries.filter(e=>e.id!==entry.id);if(!this.storage.compareAndSet?.(KEY,text,JSON.stringify(bank)))throw new Error('文档库刚有更新，请刷新后重试。');}
}
