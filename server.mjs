import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, rename, copyFile, stat, lstat, unlink } from 'node:fs/promises';
import { existsSync, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createRequire} from 'node:module';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import {TessWorker} from './tess-worker.mjs';
import {validateDoc} from './src/core/projectValidation.mjs';
import {projectThumbnail} from './src/core/projectThumbnail.mjs';
import {createActivityLog,ACTIVITY_LIMITS} from './src/core/activityLog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
let port = Number(process.env.ZHEZHI_PORT ?? 8787);
const tessExecutable = process.env.ZHEZHI_TESS_EXECUTABLE;
const pythonExecutable = path.join(root, '.venv', 'Scripts', 'python.exe');
// Trusted launcher/test configuration only; never accepted from an HTTP request.
const dataRoot = process.env.ZHEZHI_DATA_DIR ? path.resolve(process.env.ZHEZHI_DATA_DIR) : path.join(root, 'data');
const require=createRequire(import.meta.url);
const storageLocations=require('./desktop/storageLocations.cjs').createStorageLocations({bootstrapRoot:dataRoot,legacyPreferencesFile:process.env.ZHEZHI_LEGACY_PREFERENCES});
const preferences=require('./desktop/preferences.cjs').createPreferences(storageLocations.preferenceFile,{beforeWrite:storageLocations.assertWritable});
const {createArtworkRecovery}=require('./desktop/artworkRecovery.cjs');
const artworkRecovery=createArtworkRecovery({directory:()=>{storageLocations.assertReadable('dataDir');return storageLocations.status().paths.dataDir;}});
const token = randomBytes(32).toString('hex');
const appVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const activity=createActivityLog({storage:storageLocations,appVersion,secrets:[token]});
// Directory choices, names and revision tokens are small control messages;
// document-bearing requests deliberately do not use this ceiling.
const CONTROL_REQUEST_BYTES = 16 * 1024;
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173']);
if(!storageLocations.status().unavailable?.some(item=>item.kind==='projectsDir'))await mkdir(storageLocations.status().paths.projectsDir, { recursive: true });
const tessWorker = new TessWorker(tessExecutable || pythonExecutable, tessExecutable ? ['--worker'] : [path.join(root,'backend','tessellate.py'),'--worker'], {cwd:path.dirname(tessExecutable || pythonExecutable),env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
let recoveryQueue = Promise.resolve();
const writeQueues = new Map();
const parentRequests=new Map();
async function pauseDesktopLog(){
  if(!process.parentPort)return;
  const requestId=randomUUID();
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{parentRequests.delete(requestId);reject(new Error('程序日志尚未暂停，目录未修改。'));},10000);parentRequests.set(requestId,{resolve:()=>{clearTimeout(timer);resolve();}});process.parentPort.postMessage({type:'storage-log-pause',requestId});});
}
function resumeDesktopLog(paths){process.parentPort?.postMessage({type:'storage-log-resume',dataDir:paths.dataDir});}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.md': 'text/plain; charset=utf-8' };

function send(res, status, value) {
  if (res.destroyed || res.writableEnded) return;
  if(typeof value?.error==='string')res.activityReason=value.error;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req,limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (limit !== undefined && size > limit) throw Object.assign(new Error('请求超过容量。'), {status:413});
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('请求不是有效的 JSON 数据。'); }
}
async function atomic(file, value) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
  if (existsSync(file)) await copyFile(file, file + '.bak');
  await rename(tmp, file);
}
function projectId(value) { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value) ? value : null; }
// A revision includes both saved and automatic drafts. Legacy files acquire
// revisions on read, without rewriting their bytes or trusting their clocks.
async function projectRevision(projectsRoot,id) {
  const hash=createHash('sha256');let exists=false;
  for(const suffix of ['.json','.draft.json']){
    try{const bytes=await readFile(path.join(projectsRoot,id+suffix));hash.update(suffix).update(bytes);exists=true;}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return exists?hash.digest('hex'):null;
}
async function tombstones(paths){
  try{const value=JSON.parse(await readFile(path.join(paths.dataDir,'project-tombstones.json'),'utf8'));if(value?.version!==1||!Array.isArray(value.ids)||value.ids.some(id=>!projectId(id)))throw Error('工程删除记录损坏，保存已停止，请检查数据目录。');return value;}
  catch(error){if(error.code==='ENOENT')return {version:1,ids:[]};throw error;}
}
async function assertProjectRevision(paths,id,expected){
  if((await tombstones(paths)).ids.includes(id))throw Object.assign(Error('此工程已在其他窗口删除。当前内容仍保留，请另存为副本。'),{status:409,code:'project_deleted'});
  const revision=await projectRevision(paths.projectsDir,id);
  if((revision!==null&&(typeof expected!=='string'||expected!==revision))||(revision===null&&expected!=null))throw Object.assign(Error('工程已在其他窗口修改。当前内容仍保留，请另存为副本或重新打开最新工程。'),{status:409,code:'project_conflict'});
}
function validateStoredProject(value,id) {
  if(value?.format!=='zhezhi-project'||value.version!==1||value.id!==id||!projectId(value.id)||typeof value.updated!=='string'||!Number.isFinite(Date.parse(value.updated)))throw new Error('工程文件格式损坏，原文件已保留。');
  validateDoc(value.doc);return value;
}
async function readStoredProject(projectsRoot,id,draft=false) {
  return validateStoredProject(JSON.parse(await readFile(path.join(projectsRoot,id+(draft?'.draft':'')+'.json'),'utf8')),id);
}
async function readProjectVariants(projectsRoot,id) {
  const variants=[];
  for(const draft of [false,true]){
    try{variants.push({value:await readStoredProject(projectsRoot,id,draft),draft});}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return variants;
}
function newestProject(variants) {
  return variants.sort((a,b)=>Date.parse(b.value.updated)-Date.parse(a.value.updated)||Number(a.draft)-Number(b.draft))[0];
}
function projectWrite(id,work) {
  const current=storageLocations.runWrite(work);writeQueues.set(id,current);
  return current.finally(()=>{if(writeQueues.get(id)===current)writeQueues.delete(id);});
}
async function waitProjectWrites(id) {
  // A second write may have joined the storage queue while the first settled.
  while(writeQueues.has(id))await writeQueues.get(id).catch(()=>{});
}
async function deleteProjectFiles(paths,id) {
  // Resolve paths inside the shared write/migration queue. Files are moved out
  // of the library together before disposal, so a failed second move can roll
  // back the first without losing its original bytes.
  const files=[];
  const inspect=async file=>{
    try{
      const info=await lstat(file);
      if(!info.isFile()||info.isSymbolicLink())throw Object.assign(new Error('文档保存位置含有非普通文件，未删除任何文档。'),{status:409});
      return true;
    }catch(error){if(error.code==='ENOENT')return false;throw error;}
  };
  try{
    for(const suffix of ['.json','.draft.json','.json.bak','.draft.json.bak']){
      const file=path.join(paths.projectsDir,id+suffix);
      if(await inspect(file))files.push(file);
    }
    for(const name of ['recovery.json','recovery.json.bak']){
      const file=path.join(paths.dataDir,name);
      if(!await inspect(file))continue;
      let recovery;
      try{recovery=JSON.parse(await readFile(file,'utf8'));}
      catch(error){if(error instanceof SyntaxError)continue;throw error;}
      // Unknown/damaged recovery contents never authorize deleting a different
      // document's recovery snapshot.
      if(recovery?.projectId===id)files.push(file);
    }
  }catch(error){
    if(error.status)throw error;
    throw Object.assign(new Error('无法读取文档保存位置，未删除任何文档。请检查目录权限后重试。'),{status:503});
  }
  const transaction=randomUUID(),staged=[];
  try{
    for(const file of files){
      const temporary=file+'.zhezhi-delete-'+transaction+'.tmp';
      await rename(file,temporary);staged.push({file,temporary});
    }
    const deleted=await tombstones(paths);
    if(!deleted.ids.includes(id))await atomic(path.join(paths.dataDir,'project-tombstones.json'),{version:1,ids:[...deleted.ids,id]});
  }catch{
    let restoreFailed=false;
    for(const {file,temporary} of staged.reverse()){
      try{
        // An external file created meanwhile must never be overwritten during
        // rollback. Keep the recoverable staged original if restoration fails.
        await copyFile(temporary,file,fsConstants.COPYFILE_EXCL);
        await unlink(temporary).catch(()=>{});
      }catch{restoreFailed=true;}
    }
    throw Object.assign(new Error(restoreFailed?'删除未完成，恢复副本已保留在原保存目录。请检查目录权限后重试。':'删除未完成，原文档已恢复。请检查目录权限后重试。'),{status:503});
  }
  let cleanupFailed=0;
  for(const {temporary} of staged)try{await unlink(temporary);}catch{cleanupFailed++;}
  // All public filenames are now absent: report the committed deletion even if
  // a locked quarantine copy needs later cleanup. A false failure here could
  // cause the editor to save again under the deleted id.
  return {deleted:files.length>0,files:files.length,...(cleanupFailed?{warning:'文档已删除，但部分临时副本暂时无法清理，请检查保存目录权限。'}:{})};
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  const host = req.headers.host;
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) return send(res, 403, {error:'只允许本机访问。'});
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return send(res, 403, {error:'已拒绝外部网页访问本地工作台。'});
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const activityRoute=url.pathname.startsWith('/api/activity');
    if(url.pathname.startsWith('/api/')&&!activityRoute)res.once('finish',()=>{
      if(res.statusCode>=400)void activity.append({action:'api.failure',level:res.statusCode>=500?'error':'warning',details:{method:req.method,status:res.statusCode,operation:url.pathname.split('/')[2]??'unknown',reason:res.activityReason??'接口未完成'}}).catch(()=>{});
    });
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return send(res, 200, {ok:true, app:'zhezhi-workbench', version:appVersion, token, tessAvailable:existsSync(tessExecutable || pythonExecutable)});
    }
    if (url.pathname.startsWith('/api/')) {
      if(activityRoute&&req.headers['x-zhezhi-token']!==token)return send(res,403,{error:'操作日志需要当前本机会话，请刷新页面后重试。'});
      if (req.method !== 'GET' && req.headers['x-zhezhi-token'] !== token) return send(res, 403, {error:'会话已更新，请刷新页面后重试。'});
      if(url.pathname==='/api/activity'&&req.method==='GET')return send(res,200,await activity.read(url.searchParams.has('limit')?Number(url.searchParams.get('limit')):100));
      if(url.pathname==='/api/activity'&&req.method==='POST'){
        let input;try{input=await body(req,ACTIVITY_LIMITS.requestBytes);}catch(cause){if(cause.status===413)throw Object.assign(new Error('操作日志请求超过 16 KiB，请缩短诊断字段。'),{status:413});throw cause;}
        return send(res,200,{ok:true,entry:await activity.append(input)});
      }
      if(url.pathname==='/api/activity/export'&&req.method==='GET'){
        res.setHeader('Content-Disposition','attachment; filename="zhezhi-activity-log.json"');
        return send(res,200,await activity.export());
      }
      if(url.pathname.startsWith('/api/storage')&&req.headers['x-zhezhi-token']!==token)return send(res,403,{error:'保存设置需要当前本机会话，请刷新页面后重试。'});
      if(url.pathname==='/api/storage'&&req.method==='GET')return send(res,200,storageLocations.status());
      if(url.pathname==='/api/storage/pick'&&req.method==='POST'){
        const input=await body(req,CONTROL_REQUEST_BYTES);if(!input||typeof input!=='object'||Object.keys(input).some(key=>key!=='kind'))throw new Error('目录选择请求无效。');
        return send(res,200,await storageLocations.pickDirectory(input.kind));
      }
      if(url.pathname==='/api/storage/apply'&&req.method==='POST')return send(res,200,await storageLocations.apply(await body(req,CONTROL_REQUEST_BYTES),{beforeCopy:pauseDesktopLog,afterCopy:resumeDesktopLog}));
      if(url.pathname==='/api/storage/preferences'&&req.method==='GET')return send(res,200,{value:preferences.getItem(url.searchParams.get('key'))});
      if(url.pathname==='/api/storage/preferences'&&req.method==='POST'){
        const input=await body(req);if(!input||typeof input!=='object'||Object.keys(input).some(key=>!['key','value','expectedValue'].includes(key))||Object.hasOwn(input,'expectedValue')&&input.expectedValue!==null&&typeof input.expectedValue!=='string')throw new Error('设置写入请求无效。');
        const changed=await storageLocations.runWrite(()=>Object.hasOwn(input,'expectedValue')?preferences.compareAndSet(input.key,input.expectedValue,input.value):input.key==='zhezhi.diagram-library.v1'?preferences.compareAndSet(input.key,null,input.value):(preferences.setItem(input.key,input.value),true));
        if(!changed)return send(res,409,{error:'绘图库已在其他窗口修改，请重新打开或另存当前绘图。'});return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/artwork-recovery'&&req.method==='GET')return send(res,200,await artworkRecovery.list());
      if(url.pathname==='/api/artwork-recovery'&&req.method==='POST'){
        const input=await body(req);
        return send(res,200,await storageLocations.runWrite(()=>artworkRecovery.save(input)));
      }
      const artworkMatch=/^\/api\/artwork-recovery\/([^/]+)(\/delete)?$/.exec(url.pathname);
      if(artworkMatch&&req.method==='GET'&&!artworkMatch[2])return send(res,200,await artworkRecovery.load(artworkMatch[1]));
      if(artworkMatch&&req.method==='POST'&&artworkMatch[2]){
        const input=await body(req,CONTROL_REQUEST_BYTES);if(!input||Object.keys(input).sort().join(',')!=='expectedRevision')throw new Error('完整作品恢复删除请求无效。');
        return send(res,200,await storageLocations.runWrite(()=>artworkRecovery.remove({id:artworkMatch[1],expectedRevision:input.expectedRevision})));
      }
      if (url.pathname === '/api/projects' && req.method === 'GET') {
        storageLocations.assertReadable?.('projectsDir');
        await Promise.allSettled([...writeQueues.values()]);
        const library=url.searchParams.get('library')==='1';
        const projectsRoot=storageLocations.status().paths.projectsDir;
        const files = (await readdir(projectsRoot)).filter(n => library?/^[a-f0-9-]{36}(?:\.draft)?\.json$/.test(n):/^[a-f0-9-]{36}\.json$/.test(n));
        const records=new Map();
        for (const file of files) {
          try {
            const draft=file.endsWith('.draft.json'),id=file.slice(0,draft?-11:-5);
            const p=await readStoredProject(projectsRoot,id,draft),previous=records.get(id);
            if(!previous||Date.parse(p.updated)>Date.parse(previous.value.updated)||(Date.parse(p.updated)===Date.parse(previous.value.updated)&&!draft))records.set(id,{value:p,draft});
          } catch { /* A damaged file is preserved for manual recovery. */ }
        }
        const projects=[...records.values()].map(({value:p,draft})=>{
          const curve=p.doc.metadata?.curveDesign;
          return {id:p.id,name:p.doc.name,updated:p.updated,segments:p.doc.segments.length,...(curve?.format==='zhezhi-curve-design'?{kind:'curve-design',samples:curve.result?.sample?.rows?.length}:{}),...(library?{draft,thumbnail:projectThumbnail(p.doc)}:{})};
        });
        return send(res,200,{projects:projects.sort((a,b)=>Date.parse(b.updated)-Date.parse(a.updated))});
      }
      if ((url.pathname === '/api/projects'||url.pathname === '/api/projects/draft') && req.method === 'POST') {
        const input = await body(req); validateDoc(input?.doc);
        const id = input.id === undefined || input.id === null ? randomUUID() : projectId(input.id);
        if (!id) throw new Error('工程编号无效。');
        const draft=url.pathname.endsWith('/draft');
        const saved=await projectWrite(id,async paths=>{
          await assertProjectRevision(paths,id,input.baseRevision);
          const value={format:'zhezhi-project',version:1,id,doc:input.doc,updated:new Date().toISOString(),...(draft?{draft:true}:{})};
          await atomic(path.join(paths.projectsDir,id+(draft?'.draft':'')+'.json'),value);return {value,revision:await projectRevision(paths.projectsDir,id)};
        });
        return send(res,200,{id,updated:saved.value.updated,revision:saved.revision});
      }
      if (/^\/api\/projects\/[^/]+\/rename$/.test(url.pathname) && req.method === 'POST') {
        const id=projectId(url.pathname.split('/')[3]);if(!id)throw new Error('工程编号无效。');
        const input=await body(req,CONTROL_REQUEST_BYTES),name=typeof input?.name==='string'?input.name.trim():'';
        if(!name||name.length>160)throw new Error('文档名称须为 1 至 160 个字符。');
        const revision=await projectWrite(id,async paths=>{
          await assertProjectRevision(paths,id,input.baseRevision);
          const variants=await readProjectVariants(paths.projectsDir,id);
          if(!variants.length)throw Object.assign(new Error('文件不存在。'),{code:'ENOENT'});
          // Validate both variants before changing either file. Renaming preserves
          // save times, geometry and the relationship between saved and draft copies.
          const renamed=variants.map(({value,draft})=>{const doc={...value.doc,name};validateDoc(doc);return {value:{...value,doc},draft};});
          for(const {value,draft} of renamed)await atomic(path.join(paths.projectsDir,id+(draft?'.draft':'')+'.json'),value);
          return projectRevision(paths.projectsDir,id);
        });
        return send(res,200,{id,name,revision});
      }
      if (/^\/api\/projects\/[^/]+$/.test(url.pathname) && req.method === 'DELETE') {
        const id=projectId(url.pathname.split('/')[3]);if(!id)throw new Error('工程编号无效。');
        const result=await projectWrite(id,paths=>deleteProjectFiles(paths,id));
        void activity.append({action:'project.delete',level:result.warning?'warning':'info',details:{target:id,files:result.files,result:result.warning?'deleted-with-cleanup-warning':result.deleted?'deleted':'already-absent'}}).catch(()=>{});
        return send(res,200,{id,deleted:result.deleted,...(result.warning?{warning:result.warning}:{})});
      }
      if (url.pathname.startsWith('/api/projects/') && req.method === 'GET') {
        storageLocations.assertReadable?.('projectsDir');
        const id = projectId(url.pathname.split('/').pop());
        if(!id) return send(res,400,{error:'工程编号无效。'});
        await waitProjectWrites(id);
        const result=await storageLocations.runWrite(async paths=>{
        const projectsRoot=paths.projectsDir,revision=await projectRevision(projectsRoot,id);
        if(url.searchParams.get('draft')==='1'){
          const variants=[];
          for(const draft of [false,true]){
            try{variants.push({value:await readStoredProject(projectsRoot,id,draft),draft});}
            catch{/* A healthy saved or draft copy remains openable when its sibling is damaged. */}
          }
          const latest=newestProject(variants);
          if(!latest)throw Object.assign(new Error('文件不存在。'),{code:'ENOENT'});
          return {...latest.value,draft:latest.draft,revision};
        }
        return {...await readStoredProject(projectsRoot,id),revision};
        });return send(res,200,result);
      }
      if (url.pathname === '/api/recovery' && req.method === 'GET') {
        storageLocations.assertReadable?.('dataDir');
        const file = path.join(storageLocations.status().paths.dataDir,'recovery.json');
        return send(res,200,existsSync(file) ? JSON.parse(await readFile(file,'utf8')) : {doc:null});
      }
      if (url.pathname === '/api/recovery' && req.method === 'POST') {
        const input = await body(req); validateDoc(input?.doc);
        const value = {doc:input.doc,projectId:projectId(input.projectId),baseRevision:typeof input.baseRevision==='string'?input.baseRevision:null,updated:new Date().toISOString()};
        recoveryQueue = storageLocations.runWrite(async paths=>{if(value.projectId&&(await tombstones(paths)).ids.includes(value.projectId))throw Object.assign(Error('原工程已删除，请将当前内容另存为副本。'),{status:409,code:'project_deleted'});await atomic(path.join(paths.dataDir,'recovery.json'),value);});
        await recoveryQueue; return send(res,200,{ok:true});
      }
      if ((url.pathname === '/api/tessellation/strain-tq-practical' || url.pathname === '/api/tessellation/rotational-pleats-strain' || url.pathname === '/api/tessellate' || url.pathname === '/api/tessellation/spherical-vertex' || url.pathname === '/api/tessellation/degree4-branches' || url.pathname === '/api/tessellation/degree4-fold-consistency' || url.pathname === '/api/tessellation/degree4-vertex-fan3d' || url.pathname === '/api/tessellation/lff-reduction' || url.pathname === '/api/tessellation/woven-graph-preprocess' || url.pathname === '/api/tessellation/test-pleat' || url.pathname === '/api/tessellation/three-cycle-critical' || url.pathname === '/api/tessellation/archimedean-vertex-figure' || url.pathname === '/api/tessellation/gore-data' || url.pathname === '/api/tessellation/pot-cross-section-graphics' || url.pathname === '/api/tessellation/woven-inset-separation' || url.pathname === '/api/tessellation/curved-space-curve' || url.pathname === '/api/tessellation/curved-saved-pair' || url.pathname === '/api/tessellation/curved-ribbon-pair' || url.pathname === '/api/tessellation/curved-matched-pair' || url.pathname==='/api/tessellation/curved-uncurl-generic'||url.pathname === '/api/tessellation/curved-discretization-generic' || url.pathname === '/api/tessellation/curved-discretization' || url.pathname === '/api/tessellation/curved-tangent-developable' || url.pathname === '/api/tessellation/curved-constant-width' || url.pathname === '/api/tessellation/curved-near-width' || url.pathname === '/api/tessellation/curved-canonical-generic' || url.pathname === '/api/tessellation/curved-space-curve-fold-generic' || url.pathname === '/api/tessellation/curved-ribbon-generic' || url.pathname === '/api/tessellation/curved-conic-section-generic' || url.pathname === '/api/tessellation/curved-surface-to-cone-generic' || url.pathname === '/api/tessellation/curved-surface-to-cylinder-generic' || url.pathname === '/api/tessellation/planar-functions' || url.pathname === '/api/tessellation/curved-curve2d-systems-native' || url.pathname === '/api/tessellation/curved-system-helpers-generic' || url.pathname === '/api/tessellation/curved-surface-system-generic' || url.pathname === '/api/tessellation/curved-surface-normal-generic' || url.pathname === '/api/tessellation/curved-match-speed-generic' || url.pathname === '/api/tessellation/curved-nonuniform-helix-generic' || url.pathname === '/api/tessellation/curved-planar-sequence-generic' || url.pathname === '/api/tessellation/curved-reshape-cone-generic' || url.pathname === '/api/tessellation/curved-reshape-tandev-generic' || url.pathname === '/api/tessellation/curved-fold-3d-generic' || url.pathname === '/api/tessellation/curved-fold-flatten-generic' || url.pathname === '/api/tessellation/curved-flatten-generic' || url.pathname === '/api/tessellation/curved-reshape-generic' || url.pathname === '/api/tessellation/curved-generic-across-right' || url.pathname === '/api/tessellation/curved-generic-cone-flatten' || url.pathname === '/api/tessellation/curved-linked-first-band' || url.pathname === '/api/tessellation/twisted-pot-smooth-reference' || url.pathname === '/api/tessellation/alt-mosely-pot-reference' || url.pathname === '/api/tessellation/radial-pot-cw-reference' || url.pathname === '/api/tessellation/huffman-circle4' || url.pathname === '/api/tessellation/huffman-parabola' || url.pathname === '/api/tessellation/vertex-from-fold-vectors' || url.pathname === '/api/tessellation/goldberg-reference' || url.pathname === '/api/tessellation/ring-function-graphics' || url.pathname === '/api/tessellation/circular-twist' || url.pathname === '/api/tessellation/rigid-fold-angle-scale' || url.pathname === '/api/tessellation/rigid-single-vertex-quad-mesh' || url.pathname === '/api/tessellation/rigid-quad-mesh' || url.pathname === '/api/tessellation/flagstone-tilted-star') && req.method === 'POST') {
        const input = await body(req);
        const operation=url.pathname==='/api/tessellation/strain-tq-practical'?'strain-tq-practical':url.pathname==='/api/tessellation/rotational-pleats-strain'?'rotational-pleats-strain':url.pathname==='/api/tessellation/spherical-vertex'?'spherical-maximum-dihedrals':url.pathname==='/api/tessellation/degree4-branches'?'degree4-branch-geometry':url.pathname==='/api/tessellation/degree4-fold-consistency'?'degree4-fold-consistency':url.pathname==='/api/tessellation/degree4-vertex-fan3d'?'degree4-vertex-fan3d':url.pathname==='/api/tessellation/lff-reduction'?'lff-reduction':url.pathname==='/api/tessellation/woven-graph-preprocess'?'woven-graph-preprocess':url.pathname==='/api/tessellation/test-pleat'?'test-pleat':url.pathname==='/api/tessellation/three-cycle-critical'?'three-cycle-critical':url.pathname==='/api/tessellation/archimedean-vertex-figure'?'archimedean-vertex-figure':url.pathname==='/api/tessellation/gore-data'?'gore-data':url.pathname==='/api/tessellation/pot-cross-section-graphics'?'pot-cross-section-graphics':url.pathname==='/api/tessellation/woven-inset-separation'?'woven-inset-separation':url.pathname==='/api/tessellation/curved-space-curve'?'curved-space-curve':url.pathname==='/api/tessellation/curved-saved-pair'?'curved-saved-pair':url.pathname==='/api/tessellation/curved-ribbon-pair'?'curved-ribbon-pair':url.pathname==='/api/tessellation/curved-matched-pair'?'curved-matched-pair':url.pathname==='/api/tessellation/curved-uncurl-generic'?'curved-uncurl-generic':url.pathname==='/api/tessellation/curved-discretization-generic'?'curved-discretization-generic':url.pathname==='/api/tessellation/curved-discretization'?'curved-discretization':url.pathname==='/api/tessellation/curved-tangent-developable'?'curved-tangent-developable':url.pathname==='/api/tessellation/curved-constant-width'?'curved-constant-width':url.pathname==='/api/tessellation/curved-near-width'?'curved-near-width':url.pathname==='/api/tessellation/curved-canonical-generic'?'curved-canonical-generic':url.pathname==='/api/tessellation/curved-space-curve-fold-generic'?'curved-space-curve-fold-generic':url.pathname==='/api/tessellation/curved-ribbon-generic'?'curved-ribbon-generic':url.pathname==='/api/tessellation/curved-conic-section-generic'?'curved-conic-section-generic':url.pathname==='/api/tessellation/curved-surface-to-cone-generic'?'curved-surface-to-cone-generic':url.pathname==='/api/tessellation/curved-surface-to-cylinder-generic'?'curved-surface-to-cylinder-generic':url.pathname==='/api/tessellation/planar-functions'?'planar-functions':url.pathname==='/api/tessellation/curved-curve2d-systems-native'?'curved-curve2d-systems-native':url.pathname==='/api/tessellation/curved-system-helpers-generic'?'curved-system-helpers-generic':url.pathname==='/api/tessellation/curved-surface-system-generic'?'curved-surface-system-generic':url.pathname==='/api/tessellation/curved-surface-normal-generic'?'curved-surface-normal-generic':url.pathname==='/api/tessellation/curved-match-speed-generic'?'curved-match-speed-generic':url.pathname==='/api/tessellation/curved-nonuniform-helix-generic'?'curved-nonuniform-helix-generic':url.pathname==='/api/tessellation/curved-planar-sequence-generic'?'curved-planar-sequence-generic':url.pathname==='/api/tessellation/curved-reshape-cone-generic'?'curved-reshape-cone-generic':url.pathname==='/api/tessellation/curved-reshape-tandev-generic'?'curved-reshape-tandev-generic':url.pathname==='/api/tessellation/curved-fold-3d-generic'?'curved-fold-3d-generic':url.pathname==='/api/tessellation/curved-fold-flatten-generic'?'curved-fold-flatten-generic':url.pathname==='/api/tessellation/curved-flatten-generic'?'curved-flatten-generic':url.pathname==='/api/tessellation/curved-reshape-generic'?'curved-reshape-generic':url.pathname==='/api/tessellation/curved-generic-across-right'?'curved-generic-across-right':url.pathname==='/api/tessellation/curved-generic-cone-flatten'?'curved-generic-cone-flatten':url.pathname==='/api/tessellation/curved-linked-first-band'?'curved-linked-first-band':url.pathname==='/api/tessellation/twisted-pot-smooth-reference'?'twisted-pot-smooth-reference':url.pathname==='/api/tessellation/alt-mosely-pot-reference'?'alt-mosely-pot-reference':url.pathname==='/api/tessellation/radial-pot-cw-reference'?'radial-pot-cw-reference':url.pathname==='/api/tessellation/huffman-circle4'?'huffman-circle4':url.pathname==='/api/tessellation/huffman-parabola'?'huffman-parabola':url.pathname==='/api/tessellation/vertex-from-fold-vectors'?'vertex-from-fold-vectors':url.pathname==='/api/tessellation/goldberg-reference'?'goldberg-reference':url.pathname==='/api/tessellation/ring-function-graphics'?'ring-function-graphics':url.pathname==='/api/tessellation/circular-twist'?'circular-twist':url.pathname==='/api/tessellation/rigid-fold-angle-scale'?'rigid-fold-angle-scale':url.pathname==='/api/tessellation/rigid-single-vertex-quad-mesh'?'rigid-single-vertex-quad-mesh':url.pathname==='/api/tessellation/rigid-quad-mesh'?'rigid-quad-mesh':url.pathname==='/api/tessellation/flagstone-tilted-star'?'flagstone-tilted-star':null;
        if(!operation&&input?.operation!==undefined)return send(res,400,{error:'折痕构造接口不接受分析操作。'});
        const job=operation==='curved-canonical-generic'?{operation,canonicalInput:input}:operation?{...input,operation}:input;
        const python = tessExecutable || pythonExecutable;
        if(!existsSync(python)) return send(res,503,{error:'镶嵌计算环境尚未就绪。请运行安装脚本后重试；其他工作区仍可使用。'});
        const controller=new AbortController();
        const cancel=()=>{if(!res.writableEnded)controller.abort();};
        res.on('close',cancel);
        try {send(res,200,await tessWorker.run(job,controller.signal));}
        catch(error){send(res,error.status||500,{error:error.message});}
        finally {res.off('close',cancel);}
        return;
      }
      return send(res,404,{error:'未找到请求的本地接口。'});
    }
    if(req.method!=='GET'&&req.method!=='HEAD') return send(res,405,{error:'不支持此操作。'});
    const publicRoot=process.env.ZHEZHI_DIST_DIR?path.resolve(process.env.ZHEZHI_DIST_DIR):path.join(root,'dist');
    const requested=decodeURIComponent(url.pathname);
    const file=path.resolve(publicRoot,'.'+(requested==='/'?'/index.html':requested));
    if(!file.startsWith(publicRoot+path.sep)) return send(res,403,{error:'无效文件路径。'});
    const info=await stat(file);if(!info.isFile())return send(res,404,{error:'页面不存在。'});
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Content-Length':info.size});
    res.end(req.method==='HEAD'?undefined:await readFile(file));
  } catch(err) {
    send(res,err.code==='ENOENT'?404:err.status||400,{error:err.code==='ENOENT'?'文件不存在。请从工程库选择其他工程。':err.message||'操作失败，当前工程未改变。',...(err.status===409&&err.code?{code:err.code}:{})});
  }
});
server.listen(port,'127.0.0.1',()=>{
  port=server.address().port;
  allowedOrigins.add(`http://127.0.0.1:${port}`);allowedOrigins.add(`http://localhost:${port}`);
  console.log(`折纸工坊已启动：http://127.0.0.1:${port}`);
  void activity.append({action:'service.start',level:'info',details:{version:appVersion}}).catch(()=>{});
  process.parentPort?.postMessage({type:'ready',port});
});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?'端口已被占用。请检查工作台是否已经启动。':err.message);process.exitCode=1;});
function stop(){tessWorker.stop();server.close(async()=>{await Promise.allSettled([recoveryQueue,...writeQueues.values(),activity.flush()]);process.exit(0);});server.closeIdleConnections();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.parentPort?.on('message',event=>{
  const message=event.data;
  if(message?.type==='stop')stop();
  else if(message?.type==='activity-log')void activity.append(message.event).catch(()=>{});
  else if(message?.type==='storage-selection'){
    try{process.parentPort.postMessage({type:'storage-selection-result',requestId:message.requestId,result:storageLocations.registerSelection(message.kind,message.path)});}
    catch(error){process.parentPort.postMessage({type:'storage-selection-result',requestId:message.requestId,error:error.message});}
  }else if(message?.type==='storage-log-paused'){parentRequests.get(message.requestId)?.resolve();parentRequests.delete(message.requestId);}
});
