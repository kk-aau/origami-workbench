import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options=new Map();
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(key==='--replace-candidate'){options.set(key,true);continue;}
  if(!key.startsWith('--')||!process.argv[i+1])throw Error('Expected --payload <directory> --output <candidate-directory> [--label <version>]');
  options.set(key,process.argv[++i]);
}
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const label=String(options.get('--label')||`${version}-tauri.1`);
if(!/^[0-9A-Za-z.-]+$/.test(label))throw Error('Invalid artifact label');
const payload=path.resolve(root,String(options.get('--payload')||'output/tauri-payload'));
const output=path.resolve(root,String(options.get('--output')||`output/tauri-package-${label}`));
const within=(target,parent)=>target.startsWith(parent+path.sep)&&target!==parent;
if(!within(payload,root)||!within(output,path.join(root,'output')))throw Error('Payload must be in migration project and candidate output strictly below output/');
if(path.parse(root).root.toUpperCase()==='C:\\')throw Error('Build tools and temporary files must remain off C:');
const seven=path.join(root,'node_modules/7zip-bin/win/x64/7za.exe');
const nsis=path.join(root,'.toolchain/nsis/compiler/makensis.exe');
const plugins=path.join(root,'.toolchain/nsis/resources/plugins/x86-unicode');
for(const file of [seven,nsis,path.join(plugins,'nsis7z.dll')])if(!fs.existsSync(file))throw Error(`Missing build tool: ${file}`);
for(const file of ['zhezhi-workbench-tauri.exe','resources/runtime-layout.json','resources/dist/index.html','resources/engine/zhezhi-tess.exe'])if(!fs.statSync(path.join(payload,file)).isFile())throw Error(`Incomplete payload: ${file}`);
fs.mkdirSync(output,{recursive:true});
const tmp=path.join(root,'.toolchain/tmp');fs.mkdirSync(tmp,{recursive:true});
const env={...process.env,TEMP:tmp,TMP:tmp,NSISDIR:path.dirname(nsis)};
function run(executable,args,cwd=output,logName){
  const result=spawnSync(executable,args,{cwd,env,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024});
  const text=(result.stdout||'')+(result.stderr||'');if(logName)fs.writeFileSync(path.join(output,logName),text);
  if(result.error||result.status!==0)throw Error(`${path.basename(executable)} failed (${result.status}): ${result.error||text.slice(-9000)}`);
  return text;
}
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(directory,relative=''){
  return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(entry=>{
    const rel=path.join(relative,entry.name),absolute=path.join(directory,entry.name);
    if(entry.isSymbolicLink())throw Error(`Linked payload is forbidden: ${rel}`);
    if(entry.isDirectory())return walk(absolute,rel);
    if(!entry.isFile())throw Error(`Unexpected payload type: ${rel}`);
    return [{path:rel.split(path.sep).join('/'),bytes:fs.statSync(absolute).size,sha256:sha(absolute)}];
  });
}
const files=walk(payload);
if(files.some(row=>row.path.endsWith('.map')||/(^|\/)(node_modules|\.runtime|profile|target|\.venv)(\/|$)/.test(row.path)))throw Error('Runtime payload contains developer or user data');
const manifest=path.join(output,'payload-manifest.json');
const archive=path.join(output,`Zhezhi-Workbench-Tauri-${label}-Payload.7z`);
const prefix=`Zhezhi-Workbench-Tauri-${label}`;
const splash=fs.readFileSync(path.join(root,'build/icons/startup.bmp'));
if(splash.toString('ascii',0,2)!=='BM')throw Error('Startup artwork must be a BMP');
const splashWidth=splash.readInt32LE(18),splashHeight=Math.abs(splash.readInt32LE(22));
if(splashWidth<=0||splashWidth>4096||splashHeight<=0||splashHeight>4096)throw Error('Invalid startup artwork dimensions');
const installers=['Setup','Portable'].map(kind=>path.join(output,`${prefix}-${kind}.exe`));
const previous=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')):null;
const same=previous&&JSON.stringify(previous.files)===JSON.stringify(files);
for(const file of [...installers,...(!same?[archive]:[])]){
  if(!fs.existsSync(file))continue;
  if(!options.get('--replace-candidate'))throw Error(`Candidate already exists; inspect then explicitly use --replace-candidate: ${file}`);
  // Each target is a fixed filename under the already checked candidate folder.
  fs.unlinkSync(file);
}
if(!fs.existsSync(archive))run(seven,['a','-t7z','-mx=9','-m0=LZMA2:d=64m','-mf=off','-ms=on','-mmt=2','-mtc=off','-mtm=off','-mta=off',archive,'.'],payload,'payload-compression.log');
const listing=run(seven,['l','-slt',archive],output,'payload-7z-list.txt');
run(seven,['t',archive],output,'payload-7z-test.txt');
if(!listing.includes('Solid = +')||!listing.includes('LZMA2:26'))throw Error('Payload is not solid LZMA2 with a 64 MiB dictionary');
const escape=value=>value.replaceAll('$','$$').replaceAll('"','$\\"');
const directories=new Set();
for(const row of files){let dir=path.posix.dirname(row.path);while(dir!=='.'){directories.add(dir);dir=path.posix.dirname(dir);}}
const uninstall=files.map(row=>`Delete "$INSTDIR\\${escape(row.path.replaceAll('/','\\'))}"`)
  .concat([...directories].sort((a,b)=>b.split('/').length-a.split('/').length||b.localeCompare(a)).map(dir=>`RMDir "$INSTDIR\\${escape(dir.replaceAll('/','\\'))}"`));
const uninstallManifest=path.join(output,'uninstall-payload-files.nsh');fs.writeFileSync(uninstallManifest,'\ufeff; Generated only from this payload; no recursive uninstall deletion.\n'+uninstall.join('\n')+'\n');
for(const [index,kind] of ['setup','portable'].entries()){
  const defines={OUTPUT_EXE:installers[index],PAYLOAD_ARCHIVE:archive,PLUGIN_DIR:plugins,APP_ICON:path.join(root,'build/icons/workbench.ico'),SPLASH_IMAGE:path.join(root,'build/icons/startup.bmp'),SPLASH_WIDTH:String(splashWidth),SPLASH_HEIGHT:String(splashHeight),APP_LICENSE:path.join(root,'LICENSE'),UNINSTALL_MANIFEST:uninstallManifest,APP_VERSION:label,FILE_VERSION:version+'.0'};
  run(nsis,['/V3','/INPUTCHARSET','UTF8',...Object.entries(defines).map(([k,v])=>`/D${k}=${v}`),path.join(root,`desktop-tauri/${kind}.nsi`)],output,`${kind}-nsis-build.log`);
}
const report={version,label,createdAt:new Date().toISOString(),files,totalBytes:files.reduce((n,row)=>n+row.bytes,0),compression:'LZMA2:26; Solid=+; BCJ filters disabled',archive:{path:path.basename(archive),bytes:fs.statSync(archive).size,sha256:sha(archive)},artifacts:installers.map(file=>({path:path.basename(file),bytes:fs.statSync(file).size,sha256:sha(file)})),tools:{nsis:run(nsis,['/VERSION']).trim(),nsisSha256:sha(nsis),nsis7zSha256:sha(path.join(plugins,'nsis7z.dll')),systemPluginSha256:sha(path.join(root,'.toolchain/nsis/compiler/Plugins/x86-unicode/System.dll'))},portableUI:'silent launcher; independent Win32 bitmap splash only; no NSIS install page'};
fs.writeFileSync(manifest,JSON.stringify(report,null,2));
console.log(JSON.stringify({output,label,payloadBytes:report.totalBytes,archive:report.archive,artifacts:report.artifacts},null,2));
