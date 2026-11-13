import {api, storageSessionToken} from './api';
import {setPreferenceService,type Preferences} from './preferenceStorage';
import {createCachedPreferences,preferenceRecordKey} from './cachedPreferences';
import {migrateBrowserPreferenceStorage} from './browserPreferenceMigration';
import {WEB_APP} from './webRuntime';

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

function servicePreferenceWrite(key:string,value:string,expectedValue?:string|null):boolean {
  if(!managedKey(key))throw Error('不支持此偏好设置。');
  const request=new XMLHttpRequest();
  request.open('POST','/api/storage/preferences',false);
  request.setRequestHeader('X-Zhezhi-Token',storageSessionToken());
  request.setRequestHeader('Content-Type','application/json');
  request.send(JSON.stringify({key,value,...(expectedValue===undefined?{}:{expectedValue})}));
  let result:{value?:string|null;error?:string};try{result=JSON.parse(request.responseText);}catch{throw Error('存储服务未返回有效数据。');}
  if(request.status===409)return false;
  if(request.status!==200)throw Error(result.error||'保存目录暂不可用，请重试。');
  return true;
}
function servicePreferences():Preferences {
  return createCachedPreferences({
    snapshot:async()=>{const response=await api<{values:Record<string,string>}>('storage/preferences/snapshot');return response.values;},
    read:async key=>{if(!managedKey(key))throw Error('不支持此偏好设置。');const response=await api<{value:string|null}>('storage/preferences?key='+encodeURIComponent(key),undefined,preferenceRecordKey(key)?new AbortController().signal:undefined);return response.value??null;},
    write:async(key,value,expectedValue)=>{
      if(!managedKey(key))throw Error('不支持此偏好设置。');
      try{await api('storage/preferences',{key,value,...(expectedValue===undefined?{}:{expectedValue})},preferenceRecordKey(key)?new AbortController().signal:undefined);return true;}
      catch(error){if((error as {status?:number}).status===409)return false;throw error;}
    },
    writeSync:servicePreferenceWrite,
  });
}

/** Old browser records remain available as a recovery copy after disk migration. */
export async function importBrowserPreferences():Promise<void> {
  const sourceValues=new Map<string,string>();
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);if(!key||!managedKey(key))continue;
    const value=localStorage.getItem(key);if(value!==null)sourceValues.set(key,value);
  }
  if(!sourceValues.size)return;
  const target=window.desktop?.preferences??servicePreferences();
  await target.refresh?.();
  await migrateBrowserPreferenceStorage({getItem:key=>sourceValues.get(key)??null,setItem(){throw Error('原浏览器数据为只读迁移来源。');}},
    target,
    {keys:[...sourceValues.keys()]});
}

export async function readStorageStatus():Promise<StorageStatus> {
  const value=await api<StorageStatus>('storage'),keys:StorageDirectoryKind[]=['projectsDir','diagramsDir','dataDir'];
  if(!value||typeof value.configured!=='boolean'||typeof value.busy!=='boolean'||typeof value.platform!=='string'||typeof value.pickerAvailable!=='boolean'||keys.some(key=>typeof value.paths?.[key]!=='string'||typeof value.defaults?.[key]!=='string'))throw Error('当前服务未提供有效的保存目录设置。');
  return value;
}
export async function initializeStoragePreferences():Promise<StorageStatus> {
  if(WEB_APP){const {initializeBrowserStorage,browserPreferences}=await import('./browserStorage');await initializeBrowserStorage();setPreferenceService(browserPreferences);bootstrapStatus=await readStorageStatus();return bootstrapStatus;}
  bootstrapError='';bootstrapStatus=null;
  if(!window.desktop)setPreferenceService(undefined);
  const status=await readStorageStatus();
  if(!(status.unavailable?.length)){
    try{await importBrowserPreferences();}catch(error){bootstrapError=`浏览器绘图尚未迁移：${error instanceof Error?error.message:'导入未完成，请重试。'} 原浏览器数据仍已保留。`;bootstrapStatus=null;setPreferenceService(undefined);throw error;}
  }
  const preferences=window.desktop?.preferences??servicePreferences();
  if(!(status.unavailable?.length))await preferences.refresh?.();
  if(!window.desktop)setPreferenceService(preferences);
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
  const preferences=window.desktop?.preferences??servicePreferences();
  await preferences.refresh?.(true);
  if(!window.desktop)setPreferenceService(preferences);
  bootstrapStatus=result;bootstrapError='';return result;
}
