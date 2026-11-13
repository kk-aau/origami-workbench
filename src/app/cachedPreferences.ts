import type {Preferences} from './preferenceStorage';

export interface PreferenceTransport {
  snapshot():Promise<Record<string,string>>;
  read(key:string):Promise<string|null>;
  write(key:string,value:string,expectedValue?:string|null):Promise<boolean>;
  writeSync(key:string,value:string,expectedValue?:string|null):boolean;
}
export const preferenceRecordKey=(key:string)=>key==='zhezhi.diagram-project.v1'||key==='zhezhi.base-design-library.v1'||/^zhezhi\.diagram-library-doc-[a-p]{32}\.v1$/.test(key);
/** Reads used by React and settings controls never perform I/O. Large records
 * are loaded explicitly; cache updates only follow acknowledged persistence. */
export function createCachedPreferences(transport:PreferenceTransport):Preferences {
  const values=new Map<string,string>(),smallKeys=new Set<string>(),versions=new Map<string,number>();
  const records=new Map<string,number>(),retained=new Map<string,number>(),evicted=new Set<string>();
  let epoch=0,sequence=0;
  const version=(key:string)=>versions.get(key)??0;
  const trim=()=>{
    let bytes=[...records.values()].reduce((total,size)=>total+size,0);
    const newest=[...records.keys()].at(-1);
    for(const [key,size]of records){
      if(records.size<=6&&(bytes<=32*1024*1024||records.size===1))break;
      if(key===newest||retained.has(key))continue;
      records.delete(key);values.delete(key);evicted.add(key);bytes-=size;
    }
  };
  const cached=(key:string)=>{
    if(evicted.has(key))throw Error('内容缓存已释放，请重新异步读取；磁盘文件仍保留。');
    const size=records.get(key);if(size!==undefined){records.delete(key);records.set(key,size);}
    return values.get(key)??null;
  };
  const remember=(key:string,value:string|null)=>{
    evicted.delete(key);records.delete(key);
    if(value===null)values.delete(key);else{values.set(key,value);if(preferenceRecordKey(key))records.set(key,value.length*2);}
    versions.set(key,++sequence);trim();
  };
  const read=async(key:string):Promise<string|null>=>{
    const started=epoch,revision=version(key),value=await transport.read(key);
    if(started!==epoch)throw Error('保存目录已变化，请重新读取当前记录。');
    if(version(key)!==revision)return evicted.has(key)?read(key):values.get(key)??null;
    remember(key,value);return value;
  };
  return {
    cacheOnly:true,
    getItem:cached,
    setItem(key,value){
      if(!preferenceRecordKey(key)&&values.has(key)&&values.get(key)===value)return;
      // Preserve the acknowledged synchronous interface for existing small
      // settings writers. Compare to the cache so another window is not lost.
      if(!transport.writeSync(key,value,cached(key)))throw Error('设置已在其他窗口修改，请刷新后重试；本次修改未写入。');
      remember(key,value);
    },
    compareAndSet(key,expectedValue,value){const saved=transport.writeSync(key,value,expectedValue);if(saved)remember(key,value);return saved;},
    getItemAsync:read,
    async setItemAsync(key,value){
      const started=epoch,expected=version(key)&&!evicted.has(key)?values.get(key)??null:await read(key);
      if(started!==epoch)throw Error('保存目录已变化，本次修改未写入。');
      if(!await transport.write(key,value,expected))throw Error('设置已在其他窗口修改，请刷新后重试；本次修改未写入。');
      if(started===epoch)remember(key,value);
    },
    async compareAndSetAsync(key,expectedValue,value){const started=epoch,saved=await transport.write(key,value,expectedValue);if(saved&&started===epoch)remember(key,value);return saved;},
    async refresh(clearRecords=false){
      if(clearRecords){epoch++;values.clear();versions.clear();smallKeys.clear();records.clear();evicted.clear();retained.clear();}
      const started=epoch,revision=sequence;
      const snapshot=await transport.snapshot();
      if(started!==epoch)throw Error('保存目录已变化，请重新读取设置。');
      if(!snapshot||Array.isArray(snapshot)||typeof snapshot!=='object'||Object.values(snapshot).some(value=>typeof value!=='string'))throw Error('存储服务返回的设置快照无效。');
      for(const key of smallKeys)if(!Object.hasOwn(snapshot,key)&&version(key)<=revision)remember(key,null);
      smallKeys.clear();
      for(const [key,value]of Object.entries(snapshot)){
        smallKeys.add(key);if(version(key)<=revision)remember(key,value);
      }
    },
    retainRecords(keys){
      const started=epoch;
      const selected=keys.filter(preferenceRecordKey);for(const key of selected)retained.set(key,(retained.get(key)??0)+1);
      let released=false;return()=>{if(released)return;released=true;if(started!==epoch)return;for(const key of selected){const count=retained.get(key)??0;if(count<=1)retained.delete(key);else retained.set(key,count-1);}trim();};
    },
  };
}
