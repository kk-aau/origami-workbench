import type {Preferences} from './preferenceStorage';

const databaseName='origami-workbench-web-v1';
let opening:Promise<IDBDatabase>|undefined,initializing:Promise<void>|undefined;
const preferences=new Map<string,string>();
let queue:Promise<void>=Promise.resolve(),writeFailure:Error|undefined,pending=0;
const storageError=(cause:unknown)=>new Error('浏览器保存未完成，请下载工程备份后重试：'+(cause instanceof Error?cause.message:String(cause)));
export function browserDatabase():Promise<IDBDatabase>{
  if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open(databaseName,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('records');
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=()=>reject(storageError(request.error));
    request.onblocked=()=>reject(new Error('浏览器存储正在升级，请关闭其他工作台标签页后重新打开。'));
  });
  return opening;
}
export async function browserRead<T>(key:string):Promise<T|undefined>{
  const db=await browserDatabase();return new Promise((resolve,reject)=>{
    const request=db.transaction('records').objectStore('records').get(key);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(storageError(request.error));
  });
}
export async function browserEntries<T>(prefix:string):Promise<[string,T][]>{
  const db=await browserDatabase();return new Promise((resolve,reject)=>{
    const entries:[string,T][]=[],tx=db.transaction('records'),request=tx.objectStore('records').openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
    request.onsuccess=()=>{const cursor=request.result;if(cursor){entries.push([String(cursor.key),cursor.value]);cursor.continue();}};
    tx.oncomplete=()=>resolve(entries);tx.onabort=()=>reject(storageError(tx.error));
  });
}
/** Read/check/write takes place in one IDB transaction, including conflict tests. */
export async function browserMutate<T,R>(key:string,change:(current:T|undefined)=>{value:T|undefined;result:R}):Promise<R>{
  const db=await browserDatabase();return new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');let result:R,reason:unknown;
    const request=store.get(key);request.onsuccess=()=>{try{const next=change(request.result);result=next.result;if(next.value===undefined)store.delete(key);else store.put(next.value,key);}catch(error){reason=error;tx.abort();}};
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(reason??storageError(tx.error));
  });
}
function enqueue(action:()=>Promise<void>):Promise<void>{
  pending++;const job=queue.then(()=>{if(writeFailure)throw writeFailure;return action();});
  queue=job.catch(cause=>{
    if(cause?.code==='DIAGRAM_LIBRARY_CONFLICT')return;
    if(!writeFailure){writeFailure=storageError(cause);window.dispatchEvent(new CustomEvent('zhezhi-export-error',{detail:writeFailure.message}));}
  }).finally(()=>pending--);
  return job;
}
async function writePreferences(updates:[string,string][]):Promise<void>{
  const db=await browserDatabase();await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
    let reason:unknown;
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(storageError(reason??tx.error));
    try{for(const [key,value] of updates)store.put(value,'preference:'+key);}catch(error){reason=error;tx.abort();}
  });
}
export async function flushBrowserPreferences(){await queue;if(writeFailure)throw writeFailure;}
export function browserPreferenceSnapshot(){return [...preferences.entries()];}
export const browserPreferences:Preferences={
  getItem:key=>preferences.get(key)??null,
  setItem(key,value){if(writeFailure)throw writeFailure;preferences.set(key,value);void enqueue(()=>writePreferences([[key,value]]));},
  compareAndSet(key,expected,value){if((preferences.get(key)??null)!==expected)return false;browserPreferences.setItem(key,value);return true;},
};
/** A worker stages complete immutable documents. Publish only after IDB commits. */
export function commitBrowserPreferences(baseline:[string,string][],updates:[string,string][]):Promise<void>{
  const expected=new Map(baseline);
  return enqueue(async()=>{
    for(const [key] of updates)if((preferences.get(key)??null)!==(expected.get(key)??null))throw Object.assign(new Error('绘图保存期间目录已修改，请重试；原记录仍保留。'),{code:'DIAGRAM_LIBRARY_CONFLICT'});
    await writePreferences(updates);
    for(const [key,value] of updates)if((preferences.get(key)??null)===(expected.get(key)??null))preferences.set(key,value);
  });
}
export function initializeBrowserStorage():Promise<void>{
  if(!initializing)initializing=(async()=>{
    // Synchronous preference consumers use this window's cache. A lifetime lock
    // prevents another writable tab from defeating their compare-and-set checks.
    if(!navigator.locks)throw new Error('当前浏览器不支持安全的本地保存，请使用新版 Chrome、Edge、Firefox 或 Safari。');
    await new Promise<void>((resolve,reject)=>{
      void navigator.locks.request(databaseName,{ifAvailable:true},async lock=>{
        if(!lock){reject(new Error('此浏览器已打开折纸工作台。请使用已有标签页，或关闭它后重新打开。'));return;}
        resolve();await new Promise<void>(()=>{});
      }).catch(reject);
    });
    for(const [key,value] of await browserEntries<string>('preference:'))preferences.set(key.slice('preference:'.length),value);
    window.addEventListener('beforeunload',event=>{if(pending||writeFailure){event.preventDefault();event.returnValue='';}});
  })();
  return initializing;
}
