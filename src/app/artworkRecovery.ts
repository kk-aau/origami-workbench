import {api} from './api';
import {prepareArtworkProject,type ArtworkProject} from './artworkProject';
import {startArtworkImport} from './projectImportTask';

export interface ArtworkRecoverySummary {
  id:string;name:string;updated:string;revision:string;bytes:number;models:number;steps:number;simulation:boolean;damaged?:boolean;
}
export interface ArtworkRecoveryList {entries:ArtworkRecoverySummary[];warnings:string[]}
type Request=(route:string,value?:unknown)=>Promise<unknown>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const revision=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function id(value:string):string {if(!UUID.test(value))throw new Error('完整作品恢复编号无效。');return value;}
function summary(value:unknown):ArtworkRecoverySummary {
  const raw=value as ArtworkRecoverySummary,required=['id','name','updated','revision','bytes','models','steps','simulation'];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||required.some(key=>!Object.hasOwn(raw,key))||Object.keys(raw).some(key=>!required.includes(key)&&key!=='damaged')||!UUID.test(raw.id)||typeof raw.name!=='string'||raw.name.length>160||!revision(raw.revision)||typeof raw.updated!=='string'||!Number.isFinite(Date.parse(raw.updated))||
    ![raw.bytes,raw.models,raw.steps].every(n=>Number.isSafeInteger(n)&&n>=0)||typeof raw.simulation!=='boolean'||raw.damaged!==undefined&&typeof raw.damaged!=='boolean')throw new Error('完整作品恢复目录格式无效，未载入。');
  return {...raw};
}

/** One UUID per live window. A restored foreign record is copied into that
 * window's own slot; never reuse another window's id for automatic saves. */
export function createArtworkRecoveryStore(options:{request?:Request}={}) {
  const request:Request=options.request??api;
  return {
    async list(cachedOnly=false):Promise<ArtworkRecoveryList> {
      const raw=await request('artwork-recovery'+(cachedOnly?'?cached=1':'')) as ArtworkRecoveryList;
      if(!raw||Object.keys(raw).sort().join(',')!=='entries,warnings'||!Array.isArray(raw.entries)||!Array.isArray(raw.warnings)||raw.warnings.some(value=>typeof value!=='string'))throw new Error('完整作品恢复目录格式无效，未载入。');
      const entries=raw.entries.map(summary);if(new Set(entries.map(entry=>entry.id)).size!==entries.length)throw new Error('完整作品恢复目录编号重复，未载入。');
      return {entries,warnings:[...raw.warnings]};
    },
    async load(recordId:string):Promise<{summary:ArtworkRecoverySummary;project:ArtworkProject}> {
      const raw=await request('artwork-recovery/'+id(recordId)) as {summary:unknown;text:unknown};
      if(!raw||Object.keys(raw).sort().join(',')!=='summary,text'||typeof raw.text!=='string')throw new Error('完整作品恢复记录无效，未载入。');
      const entry=summary(raw.summary);if(entry.id!==recordId||entry.damaged)throw new Error('完整作品恢复记录与目录不一致，未载入。');
      // All geometry/source validators finish before any workspace is changed.
      if(typeof Worker==='undefined')return {summary:entry,project:prepareArtworkProject(raw.text)};
      const result=await startArtworkImport(raw.text).promise;
      if(result.kind!=='artwork')throw Error('完整作品准备结果无效。');
      return {summary:entry,project:result.project};
    },
    /** text must be the result of exportArtworkProject. That full codec already
     * validated geometry; do not repeat expensive source reconstruction here. */
    async save(input:{id:string;expectedRevision:string|null;text:string}):Promise<ArtworkRecoverySummary> {
      id(input.id);if(input.expectedRevision!==null&&!revision(input.expectedRevision))throw new Error('完整作品恢复修订无效。');
      if(typeof input.text!=='string')throw new Error('完整作品恢复副本必须是 JSON 文本。');
      const entry=summary(await request('artwork-recovery',input));if(entry.id!==input.id||entry.damaged)throw new Error('完整作品恢复保存回执无效，请检查恢复目录。');return entry;
    },
    async remove(recordId:string,expectedRevision:string):Promise<void> {
      id(recordId);if(!revision(expectedRevision))throw new Error('完整作品恢复修订无效。');
      const result=await request('artwork-recovery/'+recordId+'/delete',{expectedRevision}) as {id:unknown;deleted:unknown};
      if(!result||Object.keys(result).sort().join(',')!=='deleted,id'||result.id!==recordId||result.deleted!==true)throw new Error('完整作品恢复删除回执无效，请刷新恢复目录。');
    },
  };
}
