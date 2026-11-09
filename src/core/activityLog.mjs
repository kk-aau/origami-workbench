import {appendFile,mkdir,open,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const ACTIVITY_LIMITS=Object.freeze({fileBytes:2*1024*1024,fileCount:3,requestBytes:16*1024,entryBytes:8192,readEntries:1000,exportEntries:10000,pending:128});
const detailKeys=new Set(['fileName','reason','format','stage','result','segments','objects','bytes','durationMs','status','method','code','count','files','models','vertices','faces','operation','version','sessionId','workspace','previous','target','tool','source','line','column','attempt','mode']);
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const names=['activity.ndjson','activity.1.ndjson','activity.2.ndjson'];
const retention='日志仅保留最近最多 3 份，每份最多 2 MiB；更早记录可能已轮转清理。';

/** Only small diagnostic fields cross the persistence boundary; never serialize
 * arbitrary exceptions, requests, documents, stacks or source objects. */
export function sanitizeActivity(input,secrets=[]){
  if(!record(input)||Object.keys(input).some(key=>!['action','level','details'].includes(key)))throw error('操作日志仅接受 action、level 和 details 字段。');
  if(typeof input.action!=='string'||!/^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/.test(input.action)||/[a-fA-F0-9]{32,}/.test(input.action)||secrets.some(secret=>secret&&input.action.includes(secret)))throw error('操作日志 action 须为 1 至 80 个字母、数字、点、下划线或连字符。');
  const level=input.level??'info';if(!['info','warning','error'].includes(level))throw error('操作日志级别须为 info、warning 或 error。');
  if(input.details!==undefined&&!record(input.details))throw error('操作日志 details 须为小型标量对象。');
  const text=(value,key)=>{
    for(const secret of secrets)if(secret)value=value.split(secret).join('[已过滤]');
    if(/^\s*(?:data:|{)/i.test(value)||/^\s*\[\s*(?:\[|"|-?\d|true\b|false\b|null\b)/.test(value))return '[已过滤内容]';
    if(key==='fileName'||key==='source')value=value.split(/[?#]/)[0].split(/[\\/]/).at(-1)??'';
    value=value.replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
    if(/[{}<>]/.test(value)||/^\s*\[\s*(?:\[|"|-?\d|true\b|false\b|null\b)/.test(value))return '[已过滤内容]';
    value=value.replace(/(?:token|authorization|bearer|password|secret|cookie)\s*[:=]?\s*\S+/gi,'[已过滤]')
      .replace(/[a-fA-F0-9]{32,}/g,'[已过滤]')
      .replace(/(?:https?|file|data):\S+/gi,'[地址]')
      .replace(/[a-zA-Z]:[\\/][^\s，。；"'<>]*/g,'[路径]')
      .replace(/\\\\[^\s，。；"'<>]*/g,'[路径]')
      .replace(/(^|[\s(])\/(?:[^\s，。；"'<>]+)/g,'$1[路径]');
    return value.slice(0,key==='reason'?400:key==='fileName'||key==='source'?160:120);
  };
  const details={};
  for(const[key,value]of Object.entries(input.details??{})){
    if(!detailKeys.has(key))continue;
    if(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e12)details[key]=value;
    else if(value===null||typeof value==='boolean')details[key]=value;
    else if(typeof value==='string')details[key]=text(value,key);
  }
  return{action:input.action,level,details};
}

/** Storage.runWrite shares the directory-migration queue. Resolve dataDir only
 * inside that queue, so queued events follow an approved directory change. */
export function createActivityLog({storage,appVersion,secrets=[],fileBytes=ACTIVITY_LIMITS.fileBytes}){
  if(!Number.isSafeInteger(fileBytes)||fileBytes<256||fileBytes>ACTIVITY_LIMITS.fileBytes)throw Error('Invalid activity file budget');
  let tail=Promise.resolve(),pending=0;
  const limits={fileBytes,fileCount:3,totalBytes:fileBytes*3,maxReadEntries:ACTIVITY_LIMITS.readEntries,maxExportEntries:ACTIVITY_LIMITS.exportEntries};
  const schedule=work=>{
    if(pending>=ACTIVITY_LIMITS.pending)return Promise.reject(error('操作日志正在处理较多记录，请稍后重试；工程编辑仍可继续。',429));
    pending++;
    const task=tail.then(()=>storage.runWrite(paths=>work(paths.dataDir))).catch(cause=>{
      if(cause.status)throw cause;
      const code=typeof cause.code==='string'&&/^[A-Z_]{1,24}$/.test(cause.code)?`（${cause.code}）`:'';
      throw error(`操作日志暂不可用${code}，请检查程序数据目录权限或剩余空间；工程编辑仍可继续。`,503);
    }).finally(()=>{pending--;});
    tail=task.catch(()=>{});return task;
  };
  const fileSize=async file=>{try{return(await stat(file)).size;}catch(cause){if(cause.code==='ENOENT')return 0;throw cause;}};
  const append=async input=>{
    const safe=sanitizeActivity(input,secrets);
    const entry={id:randomUUID(),timestamp:new Date().toISOString(),appVersion,...safe},line=JSON.stringify(entry)+'\n';
    const bytes=Buffer.byteLength(line);if(bytes>ACTIVITY_LIMITS.entryBytes||bytes>fileBytes)throw error('操作日志单条内容超过容量，请缩短诊断字段。',413);
    return schedule(async directory=>{
      await mkdir(directory,{recursive:true});const files=names.map(name=>path.join(directory,name));
      const size=await fileSize(files[0]);let separator='';
      // Separate a crash-truncated final record from the next complete event.
      if(size){const handle=await open(files[0],'r');try{const byte=Buffer.alloc(1);await handle.read(byte,0,1,size-1);if(byte[0]!==10)separator='\n';}finally{await handle.close();}}
      if(size+separator.length+bytes>fileBytes){
        await rm(files[2],{force:true});
        for(let i=1;i>=0;i--)try{await rename(files[i],files[i+1]);}catch(cause){if(cause.code!=='ENOENT')throw cause;}
        separator='';
      }
      await appendFile(files[0],separator+line,'utf8');return entry;
    });
  };
  const snapshot=limit=>schedule(async directory=>{
    const entries=[],notes=[retention];let truncated=false,skipped=0,oldestPresent=false;
    for(const name of [...names].reverse()){
      const file=path.join(directory,name),size=await fileSize(file);if(!size)continue;
      if(name===names[2])oldestPresent=true;
      const length=Math.min(size,fileBytes),start=size-length,buffer=Buffer.alloc(length),handle=await open(file,'r');
      try{let position=0;while(position<length){const read=await handle.read(buffer,position,length-position,start+position);if(!read.bytesRead)break;position+=read.bytesRead;}}finally{await handle.close();}
      let text=buffer.toString('utf8');if(start){text=text.slice(text.indexOf('\n')+1);truncated=true;}
      for(const line of text.split('\n')){
        if(!line.trim())continue;
        try{
          if(Buffer.byteLength(line)>ACTIVITY_LIMITS.entryBytes)throw Error();
          const raw=JSON.parse(line);
          if(!record(raw)||typeof raw.id!=='string'||!/^[a-f0-9-]{36}$/i.test(raw.id)||typeof raw.timestamp!=='string'||!Number.isFinite(Date.parse(raw.timestamp)))throw Error();
          const safe=sanitizeActivity({action:raw.action,level:raw.level,details:raw.details},secrets);
          const version=typeof raw.appVersion==='string'&&/^[\w.+-]{1,40}$/.test(raw.appVersion)?raw.appVersion:appVersion;
          entries.push({id:raw.id,timestamp:new Date(raw.timestamp).toISOString(),appVersion:version,...safe});
        }catch{skipped++;}
      }
      if(entries.length>limit){entries.splice(0,entries.length-limit);truncated=true;}
    }
    if(oldestPresent){truncated=true;notes.push('已达到轮转文件数量上限，不能保证包含更早历史。');}
    if(skipped){truncated=true;notes.push(`已跳过 ${skipped} 条损坏、截断或不受支持的记录。`);}
    if(truncated)notes.push('本次仅返回读取上限内的最近有效记录。');
    return{appVersion,entries,truncated,notes,limits};
  });
  return{
    append,
    read(limit=100){if(!Number.isSafeInteger(limit)||limit<1||limit>ACTIVITY_LIMITS.readEntries)return Promise.reject(error('日志条数须为 1 至 1000 的整数。'));return snapshot(limit);},
    async export(){return{format:'zhezhi-activity-log',version:1,generatedAt:new Date().toISOString(),...await snapshot(ACTIVITY_LIMITS.exportEntries)};},
    flush(){return tail;},
  };
}
