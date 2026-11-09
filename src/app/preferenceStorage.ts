export type Preferences = Pick<Storage, 'getItem' | 'setItem'>&{compareAndSet?:(key:string,expectedValue:string|null,value:string)=>boolean};
let preferenceService:Preferences|undefined;
export function setPreferenceService(service:Preferences|undefined){preferenceService=service;}

/** Desktop and local-service preferences follow the configured disk directories. */
export const preferenceStorage: Preferences = {
  getItem(key) {
    const desktop = typeof window !== 'undefined' ? window.desktop?.preferences??preferenceService : preferenceService;
    if (!desktop) return localStorage.getItem(key);
    const value = desktop.getItem(key);
    if (value !== null) return value;
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
};
