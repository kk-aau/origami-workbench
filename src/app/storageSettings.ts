import {api, storageSessionToken} from './api';
import {setPreferenceService} from './preferenceStorage';
import {migrateBrowserPreferenceStorage} from './browserPreferenceMigration';

export type StorageDirectoryKind='projectsDir'|'diagramsDir'|'dataDir';
export type StoragePaths=Record<StorageDirectoryKind,string>;
export interface StorageStatus {configured:boolean;paths:StoragePaths;defaults:StoragePaths;busy:boolean;platform:string;pickerAvailable:boolean;unavailable?:{kind:StorageDirectoryKind;path:string;message:string}[]}
export interface StorageDirectorySelection {selectionId?:string;path?:string;cancelled:boolean}
export interface StorageApplyResult extends StorageStatus {copiedFiles:number;retainedSource:boolean}
let bootstrapStatus:StorageStatus|null=null;
export function storageBootstrapStatus(){return bootstrapStatus;}
let bootstrapError='';
export function storageBootstrapError(){return bootstrapError;}
const managedKey=(key:string)=>key==='zhezhi-panel-layout-v1'||/^zhezhi\.[a-z-]+\.v1$/.test(key);

function servicePreference(action:'get'|'set'|'compareAndSet',key:string,value?:string,expectedValue?:string|null):string|null {
  if(!managedKey(key))throw Error('不支持此偏好设置。');
  const request=new XMLHttpRequest();
  request.open(action==='get'?'GET':'POST',action==='get'?'/api/storage/preferences?key='+encodeURIComponent(key):'/api/storage/preferences',false);
  request.setRequestHeader('X-Zhezhi-Token',storageSessionToken());
  if(action!=='get')request.setRequestHeader('Content-Type','application/json');
  request.send(action==='get'?null:JSON.stringify({key,value,...(action==='compareAndSet'?{expectedValue}:{})}));
  let result:{value?:string|null;error?:string};try{result=JSON.parse(request.responseText);}catch{throw Error('存储服务未返回有效数据。');}
  if(action==='compareAndSet'&&request.status===409)return 'conflict';
  if(request.status!==200)throw Error(result.error||'保存目录暂不可用，请重试。');
  return result.value??null;
}
const servicePreferences=()=>({getItem:(key:string)=>servicePreference('get',key),setItem:(key:string,value:string)=>{servicePreference('set',key,value);},compareAndSet:(key:string,expectedValue:string|null,value:string)=>servicePreference('compareAndSet',key,value,expectedValue)!=='conflict'});

/** Old browser records remain available as a recovery copy after disk migration. */
export async function importBrowserPreferences():Promise<void> {
  if(window.desktop)return;
  const sourceValues=new Map<string,string>();
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);if(!key||!managedKey(key))continue;
    const value=localStorage.getItem(key);if(value!==null)sourceValues.set(key,value);
  }
  await migrateBrowserPreferenceStorage({getItem:key=>sourceValues.get(key)??null,setItem(){throw Error('原浏览器数据为只读迁移来源。');}},
    servicePreferences(),
    {keys:[...sourceValues.keys()]});
}

export async function readStorageStatus():Promise<StorageStatus> {
  const value=await api<StorageStatus>('storage'),keys:StorageDirectoryKind[]=['projectsDir','diagramsDir','dataDir'];
  if(!value||typeof value.configured!=='boolean'||typeof value.busy!=='boolean'||typeof value.platform!=='string'||typeof value.pickerAvailable!=='boolean'||keys.some(key=>typeof value.paths?.[key]!=='string'||typeof value.defaults?.[key]!=='string'))throw Error('当前服务未提供有效的保存目录设置。');
  return value;
}
export async function initializeStoragePreferences():Promise<StorageStatus> {
  bootstrapError='';bootstrapStatus=null;
  if(!window.desktop)setPreferenceService(undefined);
  const status=await readStorageStatus();
  if(!window.desktop&&!(status.unavailable?.length)){
    try{await importBrowserPreferences();}catch(error){bootstrapError=`浏览器绘图尚未迁移：${error instanceof Error?error.message:'导入未完成，请重试。'} 原浏览器数据仍已保留。`;bootstrapStatus=null;setPreferenceService(undefined);throw error;}
  }
  if(!window.desktop)setPreferenceService(servicePreferences());
  bootstrapStatus=status;
  return status;
}
export async function pickStorageDirectory(kind:StorageDirectoryKind):Promise<StorageDirectorySelection> {
  if(window.desktop?.storage)return window.desktop.storage.pickDirectory(kind);
  return api<StorageDirectorySelection>('storage/pick',{kind});
}
export async function applyStorageDirectories(selections:Partial<Record<StorageDirectoryKind,string>>,recoverUnavailable=false):Promise<StorageApplyResult> {
  if(!recoverUnavailable)await importBrowserPreferences();
  const result=await api<StorageApplyResult>('storage/apply',{selections,migrate:true,...(recoverUnavailable?{recoverUnavailable:true}:{})});
  if(!window.desktop)setPreferenceService(servicePreferences());
  bootstrapStatus=result;bootstrapError='';return result;
}
