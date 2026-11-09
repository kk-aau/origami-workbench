import {validateDoc,type Doc} from '../core/types';
import {VERSION} from './state';
import {projectThumbnail} from '../core/projectThumbnail.mjs';
import {browserRead,browserMutate,browserEntries,browserPreferences,flushBrowserPreferences,initializeBrowserStorage} from './browserStorage';

type Saved={format:'zhezhi-project';version:1;id:string;doc:Doc;updated:string;draft:boolean};
type ProjectRecord={saved?:Saved;draft?:Saved;revision:string;deleted?:boolean};
const fail=(message:string,status=400,code?:string)=>Object.assign(new Error(message),{status,code});
const uuid=(value:unknown):string=>{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))throw fail('工程编号无效。');return value;};
const revision=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const newest=(record:ProjectRecord,withDraft=true)=>withDraft&&record.draft&&(!record.saved||record.draft.updated>record.saved.updated)?record.draft:record.saved;
const checkRevision=(record:ProjectRecord|undefined,expected:unknown)=>{if(record?.deleted)throw fail('原工程已删除，请另存当前副本。',409,'project_deleted');if((record?.revision??null)!==(expected??null))throw fail('工程已被修改，请重新打开或另存副本。',409,'project_conflict');};
export const browserStorageStatus=()=>{const paths={projectsDir:'当前浏览器 · 折痕文档',diagramsDir:'当前浏览器 · 折序文档',dataDir:'当前浏览器 · 恢复记录'};return {configured:true,paths,defaults:paths,busy:false,platform:'browser',pickerAvailable:false};};

export async function browserRequest(route:string,method:'GET'|'POST'|'DELETE',input?:any,signal?:AbortSignal):Promise<any>{
  signal?.throwIfAborted();await initializeBrowserStorage();signal?.throwIfAborted();
  const url=new URL(route,'https://browser.invalid/'),name=url.pathname.slice(1);
  if(name==='health')return {ok:true,app:'zhezhi-workbench',version:VERSION,runtime:'browser',token:'browser-local',tessAvailable:false};
  if(name==='storage')return browserStorageStatus();
  if(name==='storage/preferences'){
    if(method==='GET')return {value:browserPreferences.getItem(url.searchParams.get('key')??'')};
    if(typeof input?.key!=='string'||typeof input.value!=='string')throw fail('偏好设置格式无效。');
    if(Object.hasOwn(input,'expectedValue')&&!browserPreferences.compareAndSet!(input.key,input.expectedValue,input.value))throw fail('目录已修改，请重试。',409);
    if(!Object.hasOwn(input,'expectedValue'))browserPreferences.setItem(input.key,input.value);
    await flushBrowserPreferences();return {value:input.value};
  }
  if(name==='recovery'){
    if(method==='GET')return await browserRead('recovery')??{doc:null};
    validateDoc(input.doc);const value={doc:input.doc,projectId:input.projectId??null,baseRevision:input.baseRevision??null,updated:new Date().toISOString()};
    return browserMutate('recovery',()=>({value,result:{ok:true}}));
  }
  if(name==='projects'&&method==='GET'){
    const entries=await browserEntries<ProjectRecord>('project:');
    return {projects:entries.flatMap(([,record])=>{const library=url.searchParams.get('library')==='1',value=newest(record,library);return record.deleted||!value?[]:[{id:value.id,name:value.doc.name,updated:value.updated,segments:value.doc.segments.length,draft:value.draft,...(library?{thumbnail:projectThumbnail(value.doc)}:{})}];}).sort((a,b)=>b.updated.localeCompare(a.updated))};
  }
  if((name==='projects'||name==='projects/draft')&&method==='POST'){
    validateDoc(input.doc);const id=uuid(input.id??crypto.randomUUID()),draft=name.endsWith('/draft'),updated=new Date().toISOString();
    const nextRevision=await revision(JSON.stringify(input)+updated+crypto.randomUUID());signal?.throwIfAborted();
    return browserMutate<ProjectRecord,unknown>('project:'+id,record=>{checkRevision(record,input.baseRevision);const stamp=new Date(Math.max(Date.parse(updated),Date.parse(record?.saved?.updated??'')+1||0,Date.parse(record?.draft?.updated??'')+1||0)).toISOString();const value:Saved={format:'zhezhi-project',version:1,id,doc:input.doc,updated:stamp,draft};return {value:{...record,[draft?'draft':'saved']:value,revision:nextRevision},result:{id,updated:stamp,revision:nextRevision}};});
  }
  const project=/^projects\/([^/]+)(?:\/(revision|rename))?$/.exec(name);
  if(project){
    const id=uuid(project[1]),key='project:'+id;
    if(method==='DELETE')return browserMutate<ProjectRecord,unknown>(key,record=>({value:{revision:record?.revision??'',deleted:true},result:{id,deleted:true}}));
    if(project[2]==='rename'&&method==='POST'){
      const label=String(input.name??'').trim();if(!label||label.length>160)throw fail('文档名称须为 1 至 160 个字符。');
      const nextRevision=await revision(label+crypto.randomUUID());
      return browserMutate<ProjectRecord,unknown>(key,record=>{checkRevision(record,input.baseRevision);if(!record)throw fail('工程不存在。',404);for(const saved of [record.saved,record.draft])if(saved)saved.doc.name=label;return {value:{...record,revision:nextRevision},result:{id,name:label,revision:nextRevision}};});
    }
    const record=await browserRead<ProjectRecord>(key);if(!record||record.deleted)throw fail('工程不存在。',404);
    if(project[2]==='revision')return {id,revision:record.revision};
    const saved=newest(record,url.searchParams.get('draft')==='1');if(!saved)throw fail('工程尚未手动保存。',404);return {...saved,revision:record.revision};
  }
  if(name==='artwork-recovery'&&method==='GET')return {entries:(await browserEntries<any>('artwork:')).map(([,value])=>value.summary).sort((a,b)=>b.updated.localeCompare(a.updated)),warnings:[]};
  if(name==='artwork-recovery'&&method==='POST'){
    const id=uuid(input.id),text=input.text;if(typeof text!=='string')throw fail('完整作品必须是 JSON 文本。');
    const body=JSON.parse(text);if(body.format!=='zhezhi-artwork')throw fail('完整作品格式无效。');
    const summary={id,name:String(body.editor?.name??'未命名作品').slice(0,160),updated:new Date().toISOString(),revision:await revision(text),bytes:new TextEncoder().encode(text).length,models:body.models?.entries?.length??0,steps:body.diagram?.steps?.length??0,simulation:!!body.simulation};
    signal?.throwIfAborted();return browserMutate<any,unknown>('artwork:'+id,current=>{if((current?.summary.revision??null)!==input.expectedRevision)throw fail('恢复副本已修改。',409);return {value:{summary,text},result:summary};});
  }
  const artwork=/^artwork-recovery\/([^/]+)(\/delete)?$/.exec(name);
  if(artwork){const id=uuid(artwork[1]),key='artwork:'+id;
    if(artwork[2]&&method==='POST')return browserMutate<any,unknown>(key,current=>{if(current?.summary.revision!==input.expectedRevision)throw fail('恢复副本已修改。',409);return {value:undefined,result:{id,deleted:true}};});
    const value=await browserRead(key);if(!value)throw fail('恢复副本不存在。',404);return value;
  }
  if(name==='activity'&&method==='POST')return browserMutate<any[],unknown>('activity',entries=>({value:[...(entries??[]).slice(-499),{...input,id:crypto.randomUUID(),timestamp:new Date().toISOString(),appVersion:VERSION}],result:{ok:true}}));
  if(name==='activity'||name==='activity/export'){const entries=await browserRead<any[]>('activity')??[];return {format:'zhezhi-activity-log',version:1,appVersion:VERSION,generatedAt:new Date().toISOString(),entries:name.endsWith('/export')?entries:entries.slice(-100).reverse(),warnings:[]};}
  if(name.endsWith('/cancel'))return {cancelled:true};
  throw fail('此功能需要桌面版的本机计算引擎。网页版当前支持折痕编辑、平折、折序绘图与三维模拟；请下载桌面版使用此功能。',501,'desktop_required');
}
