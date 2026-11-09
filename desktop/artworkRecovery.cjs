const fsp=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const REVISION=/^[a-f0-9]{64}$/;
const filename=id=>`artwork-recovery-${id}.json`;
const recordName=name=>typeof name==='string'&&/^artwork-recovery-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/.test(name);
const hash=text=>createHash('sha256').update(text).digest('hex');
const error=(message,status=400,code='artwork_recovery_invalid')=>Object.assign(new Error(message),{status,code});
const conflict=()=>error('此完整作品恢复副本已在其他窗口更新或删除，当前作品仍保留，请另存完整作品后重试。',409,'artwork_recovery_conflict');
const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const queues=new Map();
let validateDocPromise;
const getValidateDoc=()=>validateDocPromise??=(import(pathToFileURL(path.join(__dirname,'../src/core/projectValidation.mjs')).href).then(mod=>mod.validateDoc));

/** The renderer owns the full geometry codec. This server boundary validates
 * every envelope/version and the shared editor validator before committing;
 * restoring runs the complete model/curve/pose validators in the renderer. */
async function readArtwork(text){
  if(typeof text!=='string')throw error('完整作品恢复副本必须是 JSON 文本。');
  let value;try{value=JSON.parse(text);}catch{throw error('完整作品恢复副本不是有效 JSON。');}
  if(!exact(value,['format','version','editor','models','diagram','simulation','construction'])||value.format!=='zhezhi-artwork'||value.version!==1)throw error('完整作品恢复副本的格式或版本不支持。');
  const validateDoc=await getValidateDoc();validateDoc(value.editor);
  if(!exact(value.construction,['tessellation','curve'])||!value.construction.tessellation||typeof value.construction.tessellation!=='object'||Array.isArray(value.construction.tessellation))throw error('完整作品构造参数无效。');
  if(value.construction.curve!==null&&(!exact(value.construction.curve,['format','version','name','millimetersPerUnit','query','result'])||value.construction.curve.format!=='zhezhi-curve-design'||value.construction.curve.version!==1))throw error('曲面设计恢复格式无效。');
  if(value.models!==null){
    if(!exact(value.models,['activeId','entries'])||!Array.isArray(value.models.entries)||!value.models.entries.length)throw error('完整作品模型集合无效。');
    const ids=new Set();
    for(const entry of value.models.entries){
      if(!exact(entry,['id','name','snapshot','view'])||typeof entry.id!=='string'||!entry.id||ids.has(entry.id)||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>200||!exact(entry.snapshot,['format','version','source','model'])||entry.snapshot.format!=='zhezhi-folded-model'||![1,2,3,4].includes(entry.snapshot.version)||!entry.snapshot.model||!Array.isArray(entry.snapshot.model.vertices)||!entry.view||typeof entry.view!=='object')throw error('完整作品模型记录无效。');
      validateDoc(entry.snapshot.source);
      ids.add(entry.id);
    }
    if(value.models.activeId!==null&&!ids.has(value.models.activeId))throw error('完整作品活动模型不存在。');
  }
  if(value.diagram!==null&&(!exact(value.diagram,['format','version','name','states','steps','activeStepId'])||value.diagram.format!=='zhezhi-diagram'||value.diagram.version!==1||!Array.isArray(value.diagram.states)||!Array.isArray(value.diagram.steps)||!value.diagram.steps.length||value.diagram.states.length!==value.diagram.steps.length+1))throw error('完整作品折序记录无效。');
  if(value.diagram!==null)for(const state of value.diagram.states){if(!exact(state,['id','doc','revision'])||typeof state.id!=='string'||!Number.isSafeInteger(state.revision)||state.revision<0)throw error('完整作品折序源记录无效。');validateDoc(state.doc);}
  if(value.simulation!==null&&(!exact(value.simulation,['version','source','solver','progress','settings','view'])||value.simulation.version!==1||!value.simulation.source||!value.simulation.solver||value.simulation.solver.version!==1||!Number.isFinite(value.simulation.progress)||Math.abs(value.simulation.progress)>1))throw error('完整作品三维姿态记录无效。');
  return value;
}

exports.isArtworkRecoveryRecordFile=recordName;
exports.createArtworkRecovery=(options)=>{
  const directory=()=>path.resolve(typeof options.directory==='function'?options.directory():options.directory);
  const validateId=id=>{if(typeof id!=='string'||!UUID.test(id))throw error('完整作品恢复编号无效。');return id;};
  const read=async(root,id)=>{
    const file=path.join(root,filename(validateId(id)));let info;
    try{info=await fsp.lstat(file);}catch(cause){if(cause.code==='ENOENT')return null;throw cause;}
    if(!info.isFile())throw error('完整作品恢复文件不是普通文件，原文件已保留。');
    const text=await fsp.readFile(file,'utf8');return {text,revision:hash(text),bytes:Buffer.byteLength(text),updated:info.mtime.toISOString()};
  };
  const decode=(saved,id)=>{
    let value;try{value=JSON.parse(saved.text);}catch{throw error('完整作品恢复文件损坏，原文件已保留。');}
    if(exact(value,['format','version','id','deleted'])&&value.format==='zhezhi-artwork-recovery'&&value.version===1&&value.id===id&&value.deleted===true)return null;
    if(!exact(value,['format','version','id','updated','artwork'])||value.format!=='zhezhi-artwork-recovery'||value.version!==1||value.id!==id||typeof value.updated!=='string'||!Number.isFinite(Date.parse(value.updated)))throw error('完整作品恢复文件格式无效，原文件已保留。');
    return value;
  };
  const summary=(id,saved,record)=>({id,name:record.artwork.editor.name.slice(0,160),updated:record.updated,revision:saved.revision,bytes:Buffer.byteLength(JSON.stringify(record.artwork)),models:record.artwork.models?.entries.length??0,steps:record.artwork.diagram?.steps.length??0,simulation:record.artwork.simulation!==null});
  async function locked(root,action){
    await fsp.mkdir(root,{recursive:true});
    const lock=path.join(root,`artwork-recovery.lock.${process.pid}.${randomUUID()}`);
    await fsp.writeFile(lock,'',{flag:'wx'});
    try{
      for(const name of await fsp.readdir(root))if(name.startsWith('artwork-recovery.lock.')&&path.join(root,name)!==lock){
        const match=/^artwork-recovery\.lock\.(\d+)\.[a-f0-9-]{36}$/.exec(name);
        if(!match)throw conflict();
        let alive=true;try{process.kill(Number(match[1]),0);}catch(cause){alive=cause.code!=='ESRCH';}
        if(alive)throw conflict();
        try{await fsp.unlink(path.join(root,name));}catch(cause){if(cause.code!=='ENOENT')throw cause;}
      }
      return await action();
    }finally{await fsp.unlink(lock).catch(()=>{});}
  }
  async function mutate(action){
    const root=directory(),key=process.platform==='win32'?root.toLowerCase():root,previous=queues.get(key)??Promise.resolve();
    const next=previous.catch(()=>{}).then(()=>locked(root,()=>action(root)));
    queues.set(key,next);try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}
  }
  async function atomic(root,id,body){
    const file=path.join(root,filename(id)),temporary=file+'.'+randomUUID()+'.tmp';
    let handle;
    try{handle=await fsp.open(temporary,'wx');await handle.writeFile(body,'utf8');await handle.sync();await handle.close();handle=null;await options.beforeCommit?.(temporary,file);await fsp.rename(temporary,file);}
    finally{if(handle)await handle.close().catch(()=>{});await fsp.unlink(temporary).catch(()=>{});}
  }
  return {
    async list(){
      const root=directory(),entries=[],warnings=[];let names;try{names=await fsp.readdir(root);}catch(cause){if(cause.code==='ENOENT')return {entries,warnings};throw cause;}
      for(const name of names.filter(recordName)){
        const id=name.slice('artwork-recovery-'.length,-5);let saved;
        try{saved=await read(root,id);if(!saved)continue;const record=decode(saved,id);if(!record)continue;await readArtwork(JSON.stringify(record.artwork));entries.push(summary(id,saved,record));}
        catch(cause){warnings.push(`${name}：${cause.message}`);if(saved)entries.push({id,name:'损坏的完整作品恢复副本',updated:saved.updated,revision:saved.revision,bytes:saved.bytes,models:0,steps:0,simulation:false,damaged:true});}
      }
      entries.sort((a,b)=>b.updated.localeCompare(a.updated)||a.id.localeCompare(b.id));return {entries,warnings};
    },
    async load(id){
      const saved=await read(directory(),id);if(!saved)throw error('找不到完整作品恢复副本。',404);const record=decode(saved,id);if(!record)throw error('完整作品恢复副本已删除。',404);
      await readArtwork(JSON.stringify(record.artwork));return {summary:summary(id,saved,record),text:JSON.stringify(record.artwork)};
    },
    async save(input){
      if(!exact(input,['id','expectedRevision','text']))throw error('完整作品恢复保存请求无效。');
      const id=validateId(input.id),expected=input.expectedRevision;if(expected!==null&&(typeof expected!=='string'||!REVISION.test(expected)))throw error('完整作品恢复修订无效。');
      const artwork=await readArtwork(input.text);
      return mutate(async root=>{
        const saved=await read(root,id);if((saved?.revision??null)!==expected||saved&&decode(saved,id)===null)throw conflict();
        const updated=new Date(options.now?.()??Date.now()).toISOString(),record={format:'zhezhi-artwork-recovery',version:1,id,updated,artwork},text=JSON.stringify(record);
        await atomic(root,id,text);return summary(id,{text,revision:hash(text)},record);
      });
    },
    async remove(input){
      if(!exact(input,['id','expectedRevision'])||typeof input.expectedRevision!=='string'||!REVISION.test(input.expectedRevision))throw error('完整作品恢复删除请求无效。');const id=validateId(input.id);
      return mutate(async root=>{const saved=await read(root,id);if(!saved||saved.revision!==input.expectedRevision)throw conflict();
        // Durable tombstones prevent stale timers from resurrecting a deleted
        // slot with expectedRevision=null. A new window always uses a new UUID.
        await atomic(root,id,JSON.stringify({format:'zhezhi-artwork-recovery',version:1,id,deleted:true}));return {id,deleted:true};});
    },
  };
};
