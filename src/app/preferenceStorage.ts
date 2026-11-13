export type Preferences = Pick<Storage, 'getItem' | 'setItem'>&{
  compareAndSet?:(key:string,expectedValue:string|null,value:string)=>boolean;
  getItemAsync?:(key:string)=>Promise<string|null>;
  setItemAsync?:(key:string,value:string)=>Promise<void>;
  compareAndSetAsync?:(key:string,expectedValue:string|null,value:string)=>Promise<boolean>;
  refresh?:(clearRecords?:boolean)=>Promise<void>;
  retainRecords?:(keys:readonly string[])=>()=>void;
  /** Disk-backed caches migrate browser values during their asynchronous bootstrap. */
  cacheOnly?:boolean;
};
let preferenceService:Preferences|undefined;
export function setPreferenceService(service:Preferences|undefined){preferenceService=service;}

/** Desktop and local-service preferences follow the configured disk directories. */
export const preferenceStorage: Preferences & Required<Pick<Preferences,'getItemAsync'|'setItemAsync'|'compareAndSetAsync'|'refresh'|'retainRecords'>> = {
  getItem(key) {
    const desktop = typeof window !== 'undefined' ? window.desktop?.preferences??preferenceService : preferenceService;
    if (!desktop) return localStorage.getItem(key);
    const value = desktop.getItem(key);
    if (value !== null||desktop.cacheOnly) return value;
    // Preserve settings from the current origin when first upgrading to the bridge.
    let legacy: string | null = null;
    try { legacy = localStorage.getItem(key); } catch { /* Browser storage may be unavailable. */ }
    if (legacy !== null) desktop.setItem(key, legacy);
    return legacy;
  },
  setItem(key, value) {
    const desktop = typeof window !== 'undefined' ? window.desktop?.preferences??preferenceService : preferenceService;
    if (desktop) desktop.setItem(key, value);
    else localStorage.setItem(key, value);
  },
  compareAndSet(key,expectedValue,value){
    const service=typeof window!=='undefined'?window.desktop?.preferences??preferenceService:preferenceService;
    if(!service?.compareAndSet)throw new Error('当前存储服务尚未提供并发保存保护，请重启本地服务后重试；当前绘图仍保留，可下载工程备份。');
    return service.compareAndSet(key,expectedValue,value);
  },
  async getItemAsync(key){
    const service=typeof window!=='undefined'?window.desktop?.preferences??preferenceService:preferenceService;
    return service?.getItemAsync?service.getItemAsync(key):preferenceStorage.getItem(key);
  },
  async setItemAsync(key,value){
    const service=typeof window!=='undefined'?window.desktop?.preferences??preferenceService:preferenceService;
    if(service?.setItemAsync)await service.setItemAsync(key,value);else preferenceStorage.setItem(key,value);
  },
  async compareAndSetAsync(key,expectedValue,value){
    const service=typeof window!=='undefined'?window.desktop?.preferences??preferenceService:preferenceService;
    return service?.compareAndSetAsync?service.compareAndSetAsync(key,expectedValue,value):preferenceStorage.compareAndSet!(key,expectedValue,value);
  },
  async refresh(clearRecords){
    const service=typeof window!=='undefined'?window.desktop?.preferences??preferenceService:preferenceService;
    await service?.refresh?.(clearRecords);
  },
  retainRecords(keys){
    const service=typeof window!=='undefined'?window.desktop?.preferences??preferenceService:preferenceService;
    return service?.retainRecords?.(keys)??(()=>{});
  },
};
