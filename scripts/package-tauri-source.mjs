import {mkdir,readdir,readFile,writeFile,copyFile,stat,lstat,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const args=process.argv.slice(2),prepareOnly=args.includes('--prepare');
const release=JSON.parse(await readFile(path.join(root,'desktop-tauri/release.json'),'utf8'));
const candidate=args.find(a=>a.startsWith('--candidate='))?.split('=')[1]??release.candidate;
if(!/^[a-z0-9.-]+$/.test(candidate))throw Error('Invalid candidate identifier');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const id=`${pkg.version}-${candidate}`,base=path.join(root,'build','source-tauri',id);
const preparation=path.join(root,'.toolchain','packaging'),rustVendor=path.join(preparation,'rust-vendor');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=async file=>hash(await readFile(file));
const posix=p=>p.split(path.sep).join('/');
const excluded=new Set(['.git','node_modules','__pycache__','.pytest_cache','target','gen','.venv','.runtime','.toolchain']);
async function exists(file){try{await stat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function files(directory,skip=()=>false){
 const result=[];
 for(const item of await readdir(directory,{withFileTypes:true})){
  const name=path.join(directory,item.name);if(skip(name,item))continue;
  if(item.isSymbolicLink())throw Error(`Source symlink is not allowed: ${name}`);
  if(item.isDirectory())result.push(...await files(name,skip));else if(item.isFile())result.push(name);
 }
 return result.sort();
}
async function copy(source,destination,skip=()=>false){
 const info=await lstat(source);if(info.isSymbolicLink())throw Error(`Source symlink is not allowed: ${source}`);
 if(info.isDirectory()){
  for(const file of await files(source,skip)){const target=path.join(destination,path.relative(source,file));await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);}
 }else{await mkdir(path.dirname(destination),{recursive:true});await copyFile(source,destination);}
}
function command(binary,parameters,options={}){
 const result=spawnSync(binary,parameters,{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:64*1024*1024,...options});
 if(result.error||result.status!==0)throw Error(`${path.basename(binary)} failed: ${result.error??result.stderr??result.stdout}`);
 return result.stdout.trim();
}
const cargo=path.join(root,'.toolchain','cargo','bin','cargo.exe');
const env={...process.env,CARGO_HOME:path.join(root,'.toolchain','cargo'),RUSTUP_HOME:path.join(root,'.toolchain','rustup'),TEMP:path.join(root,'.toolchain','tmp'),TMP:path.join(root,'.toolchain','tmp')};
await mkdir(preparation,{recursive:true});await mkdir(base,{recursive:true});
const lockHash=await sha(path.join(root,'src-tauri','Cargo.lock'));
const vendorStamp=path.join(preparation,'rust-vendor-lock.sha256');
if(!await exists(rustVendor)||!await exists(vendorStamp)||(await readFile(vendorStamp,'utf8')).trim()!==lockHash){
 const config=command(cargo,['vendor','--manifest-path','src-tauri/Cargo.toml','--locked','--versioned-dirs',rustVendor],{env});
 await writeFile(path.join(preparation,'cargo-vendor-config.toml'),config+'\n');await writeFile(vendorStamp,lockHash+'\n');
}
const metadata=JSON.parse(command(cargo,['metadata','--manifest-path','src-tauri/Cargo.toml','--locked','--offline','--format-version','1'],{env}));
const rustPackages=metadata.packages.filter(p=>p.source).map(p=>({name:p.name,version:p.version,license:p.license,licenseFile:p.license_file,repository:p.repository,source:p.source}));
const patchedRuntime=metadata.packages.find(p=>p.name==='tauri-runtime-wry'&&!p.source);
if(patchedRuntime&&(patchedRuntime.version!=='2.12.3'||path.resolve(patchedRuntime.manifest_path)!==path.join(root,'vendor','tauri-runtime-wry','Cargo.toml')))throw Error('Unexpected local Tauri runtime source');
const localRustPackages=patchedRuntime?[{name:patchedRuntime.name,version:patchedRuntime.version,license:patchedRuntime.license,repository:patchedRuntime.repository,source:'path:vendor/tauri-runtime-wry',patched:true}]:[];
for(const item of rustPackages){if(!await exists(path.join(rustVendor,`${item.name}-${item.version}`,'Cargo.toml')))throw Error(`Cargo vendor missing ${item.name} ${item.version}`);}
const npmPackages=[],seen=new Set(),queue=['react','react-dom','earcut','fast-xml-parser','rabbit-ear','fflate'].map(name=>({name,from:root}));
function packageDirectory(name,from){
 let directory=from;
 while(directory.startsWith(root)){
  const found=path.join(directory,'node_modules',name);
  try{require('node:fs').statSync(path.join(found,'package.json'));return found;}catch{}
  const parent=path.dirname(directory);if(parent===directory)break;directory=parent;
 }
 throw Error(`Missing frontend dependency ${name}`);
}
while(queue.length){
 const {name,from}=queue.shift(),directory=packageDirectory(name,from),data=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
 const key=`${data.name}@${data.version}`;if(seen.has(key))continue;seen.add(key);npmPackages.push({name:data.name,version:data.version,license:data.license,directory});
 for(const dependency of Object.keys(data.dependencies??{}))queue.push({name:dependency,from:directory});
}
const python=path.join(root,'.venv','Scripts','python.exe');
const pythonInfo=JSON.parse(command(python,['-c','import sys,json;print(json.dumps({"version":sys.version,"base":sys.base_prefix}))'],{env}));
const prepared={version:pkg.version,candidate,id,cargoLockSha256:lockHash,rustPackages:rustPackages.length+localRustPackages.length,npmPackages:npmPackages.map(({directory,...p})=>p),pythonVersion:pythonInfo.version};
await writeFile(path.join(base,'PREPARED.json'),JSON.stringify(prepared,null,2)+'\n');
if(prepareOnly){console.log(JSON.stringify(prepared,null,2));process.exit(0);}

// A unique stage avoids mixing stale files into a new freeze. Never remove a
// prior delivered archive or copy private runtime directories into the source.
const run=Date.now().toString(),stage=path.join(base,`stage-${run}`);await mkdir(stage,{recursive:true});
const inputPaths=['src','src-tauri','desktop','desktop-tauri','scripts','backend','tests','migration/tests','simulator','public','docs','vendor','AGENTS.md','MIGRATION.md','server.mjs','tess-worker.mjs','index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','requirements.txt','requirements-lock.txt','requirements-build.txt','LICENSE','THIRD_PARTY_NOTICES.md','README.md','启动独立迁移版.cmd'];
const inputHashes=[];
for(const relative of inputPaths){
 const source=path.join(root,relative);if(!await exists(source))throw Error(`Required source missing: ${relative}`);
 const skip=(_file,item)=>excluded.has(item.name)||item.name.endsWith('.pyc')||item.name.endsWith('.tsbuildinfo');
 await copy(source,path.join(stage,relative),skip);
 const selected=(await stat(source)).isDirectory()?await files(source,skip):[source];
 for(const file of selected)inputHashes.push({path:posix(path.relative(root,file)),sha256:await sha(file),bytes:(await stat(file)).size});
}
await copy(rustVendor,path.join(stage,'third-party','rust'));
await mkdir(path.join(stage,'.cargo'),{recursive:true});
await writeFile(path.join(stage,'.cargo','config.toml'),'[source.crates-io]\nreplace-with = "vendored-sources"\n\n[source.vendored-sources]\ndirectory = "third-party/rust"\n');
const licenses=path.join(stage,'licenses');await mkdir(licenses,{recursive:true});
const licensePattern=/^(licen[sc]e|notice|copying|copyright|authors)/i;
for(const item of rustPackages){
 const directory=path.join(rustVendor,`${item.name}-${item.version}`),target=path.join(licenses,'rust',`${item.name}-${item.version}`);
 const available=await files(directory),hasLicense=available.some(file=>licensePattern.test(path.basename(file)));
 const selected=available.filter(file=>licensePattern.test(path.basename(file))||/^Cargo\.toml(?:\.orig)?$/.test(path.basename(file))||!hasLicense&&/^README/i.test(path.basename(file)));
 for(const file of selected)await copy(file,path.join(target,path.relative(directory,file)));
}
for(const item of localRustPackages){
 const directory=path.join(root,'vendor','tauri-runtime-wry'),target=path.join(licenses,'rust',`${item.name}-${item.version}`);
 for(const name of ['LICENSE-MIT','LICENSE-APACHE-2.0','Cargo.toml','UPSTREAM.md']){
  if(!await exists(path.join(directory,name)))throw Error(`Local Tauri runtime notice missing: ${name}`);
  await copy(path.join(directory,name),path.join(target,name));
 }
}
await writeFile(path.join(licenses,'RUST-PACKAGES.json'),JSON.stringify([...rustPackages,...localRustPackages],null,2)+'\n');
// Local path crates are not emitted by `cargo vendor`. Their original notices
// must reach the runtime license directory as well as the corresponding source.
const designUpstream=path.join(root,'vendor','design','ori-studio');
for(const relative of ['','crates/treemaker-core','crates/treemaker-fold','crates/oristudio-bp']){
 const directory=path.join(designUpstream,relative);
 for(const file of await readdir(directory))if(licensePattern.test(file)||/^(UPSTREAM\.md|LICENSING\.md|Cargo(?:\.upstream)?\.toml)$/.test(file))await copy(path.join(directory,file),path.join(licenses,'design','ori-studio',relative,file));
}
for(const item of npmPackages){
 const folder=`${item.name.replaceAll('/','__')}@${item.version}`;
 await copy(item.directory,path.join(stage,'third-party','npm',folder),(_file,entry)=>excluded.has(entry.name));
 const names=await readdir(item.directory),target=path.join(licenses,'npm',folder);
 for(const name of names)if(name==='package.json'||licensePattern.test(name)||!names.some(n=>licensePattern.test(n))&&/^README/i.test(name))await copy(path.join(item.directory,name),path.join(target,name));
}
await writeFile(path.join(licenses,'NPM-PACKAGES.json'),JSON.stringify(npmPackages.map(({directory,...p})=>p),null,2)+'\n');
const site=path.join(root,'.venv','Lib','site-packages');
for(const file of await files(site,(_file,item)=>item.isDirectory()&&['__pycache__','.git'].includes(item.name))){
 const rel=path.relative(site,file);
 if(licensePattern.test(path.basename(file))||/\.dist-info[\\/]METADATA$/i.test(rel))await copy(file,path.join(licenses,'python-packages',rel));
}
const pythonLicense=path.join(pythonInfo.base,'LICENSE_PYTHON.txt');
if(!await exists(pythonLicense))throw Error('Python runtime license missing');
await copy(pythonLicense,path.join(licenses,'python-runtime','LICENSE_PYTHON.txt'));
// The frozen engine's build-tool notices are retained from the source copy's
// own requirements. Root prepares this optional notice directory when using a
// previously validated, byte-identical engine.
const extra=path.join(preparation,'additional-notices');
if(await exists(extra))await copy(extra,path.join(licenses,'additional'));
const extraSource=path.join(preparation,'additional-source');
if(await exists(extraSource))await copy(extraSource,path.join(stage,'third-party','additional'));
const toolInfo={node:process.version,cargo:command(cargo,['--version'],{env}),rustc:command(path.join(root,'.toolchain','cargo','bin','rustc.exe'),['--version'],{env}),python:pythonInfo.version};
const info={app:pkg.version,candidate,architecture:'Tauri / Rust / Windows WebView2',platform:'Windows x64',created:new Date().toISOString(),tools:toolInfo,cargoLockSha256:lockHash,npmLockSha256:await sha(path.join(root,'package-lock.json')),pythonLockSha256:await sha(path.join(root,'requirements-lock.txt')),sourceInputs:inputHashes,rustPackages:rustPackages.length+localRustPackages.length,localRustPackages,npmPackages:npmPackages.length};
await writeFile(path.join(stage,'BUILD-INFO.json'),JSON.stringify(info,null,2)+'\n');
await writeFile(path.join(stage,'TAURI-THIRD-PARTY-NOTICES.txt'),`折纸工坊 ${id} Tauri / Rust 发行材料\n\n本次宿主不分发或运行 Electron、Node；原源码内相关文件仅供迁移追溯。\n锁定的 Rust crate 原始源码（含包内许可、版权、元数据）位于 third-party/rust，许可索引为 licenses/RUST-PACKAGES.json。\n已捆绑前端包及其传递依赖原始 npm 内容位于 third-party/npm，许可索引为 licenses/NPM-PACKAGES.json。\nPython 运行时许可与原始包元数据保留在 licenses/python-runtime 和 licenses/python-packages；包括保留的开发依赖声明，不代表所有开发包进入运行引擎。\n上游包若未随包提供独立 LICENSE，不伪造原作者声明；保留其原始 Cargo.toml/package.json 与 README。\nMicrosoft WebView2 为系统共享运行时，本源码包不包含其浏览器二进制；其许可由 Microsoft 原安装提供。\n本项目许可证和第三方既有许可不因迁移而改变。\n`);
await writeFile(path.join(stage,'REBUILD-TAURI.txt'),`重建说明\n\n1. 使用 Windows x64、Rust/MSVC 与 Windows SDK，实际版本见 BUILD-INFO.json。工具链和下载路径自行设置到非 C 盘。\n2. npm ci；按 requirements-lock.txt 与 requirements-build.txt 建立独立 Python 环境。\n3. npm run build；npm run package:icon；按 scripts/build-tessellation.ps1 构建完整 Python 引擎。\n4. cargo build --manifest-path src-tauri/Cargo.toml --locked --release --bin zhezhi-workbench-tauri。归档自带 .cargo/config.toml 与完整 Cargo vendor，可用 --offline 验证 Rust 依赖。\n5. 完整打包顺序和校验见 docs/打包与体积控制要求.md 及迁移版发布说明。\n\nthird-party/npm 保存浏览器中实际用到的包源码；npm 构建工具按 package-lock.json 另行准备。third-party/rust 原样包含锁文件所有平台 crate，Windows 构建仅选用适用子集。\nSOURCE-MANIFEST.json 记录除自身外每个文件的 SHA256；ZIP 与 7z 含完全相同文件。\n`);
const manifest=[];
for(const file of await files(stage)){manifest.push({path:posix(path.relative(stage,file)),bytes:(await stat(file)).size,sha256:await sha(file)});}
await writeFile(path.join(stage,'SOURCE-MANIFEST.json'),JSON.stringify({version:pkg.version,candidate,files:manifest},null,2)+'\n');
// Make sure no source changed while it was being frozen.
for(const item of inputHashes)if(await sha(path.join(root,item.path))!==item.sha256)throw Error(`Source changed during freeze: ${item.path}`);
const allFiles=await files(stage),list=path.join(base,`archive-list-${run}.txt`);await writeFile(list,allFiles.map(file=>posix(path.relative(stage,file))).join('\n')+'\n');
const sevenZip=require('7zip-bin').path7za,archivePrefix=`Zhezhi-Workbench-Tauri-${id}-Source`,archives={};
for(const [extension,options] of [['zip',['-tzip','-mm=Deflate','-mx=9','-mcu=on']],['7z',['-t7z','-mx=9','-md=64m','-ms=on','-mtc=off','-mtm=off','-mta=off']]]){
 const archive=path.join(base,`${archivePrefix}.${extension}`),temporary=path.join(base,`${archivePrefix}.${run}.${extension}`);
 command(sevenZip,['a',...options,temporary,`@${list}`,'-scsUTF-8','-bso0'],{cwd:stage});
 command(sevenZip,['t',temporary,'-bso0']);
 const extraction=path.join(base,`verify-${extension}-${run}`);await mkdir(extraction,{recursive:true});
 command(sevenZip,['x',temporary,`-o${extraction}`,'-y','-bso0']);
 const extracted=await files(extraction);if(extracted.length!==allFiles.length)throw Error(`${extension} file count mismatch`);
 for(const original of allFiles){const relative=path.relative(stage,original);if(await sha(path.join(extraction,relative))!==await sha(original))throw Error(`${extension} SHA mismatch: ${relative}`);}
 if(await exists(archive)){if(await sha(archive)!==await sha(temporary))throw Error(`Refusing to overwrite a different existing archive: ${archive}`);}else await rename(temporary,archive);
 archives[extension]={file:path.basename(archive),bytes:(await stat(archive)).size,sha256:await sha(archive),verifiedFiles:allFiles.length};
}
// Full corresponding source remains a separate release attachment. The runtime
// carries original notices plus a small, hash-bound pointer to those archives.
const bundled=path.join(base,'resources','legal');await mkdir(bundled,{recursive:true});
await copy(licenses,path.join(bundled,'licenses'));
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await copy(path.join(stage,name),path.join(bundled,name));
await writeFile(path.join(bundled,'TAURI-THIRD-PARTY-NOTICES.txt'),`折纸工坊 ${id} Tauri / Rust 发行材料\n\nlicenses 保留原始许可、版权、包元数据和归属声明，包括 Rust、已捆绑前端及其传递依赖、Python 运行时及计算引擎组件、NSIS 与相关插件。开发依赖声明的保留不表示相应开发工具进入运行包。\n完整项目与依赖源码、构建脚本、锁文件和构建记录另见本版本 Source.zip / Source.7z，获取方式和实际 SHA256 见 SOURCE-AVAILABILITY.json / .txt。\n本应用不包含 Electron 或 Node 运行时；Microsoft WebView2 使用系统已有共享运行时，其浏览器许可由 Microsoft 原安装提供。\n本项目许可证和第三方既有许可不因源码作为独立附件而改变。\n`);
const availability={schemaVersion:1,product:'折纸工坊 Tauri',version:pkg.version,candidate,id,runtimeRequiresSource:false,distribution:'same-release-location',archives:Object.entries(archives).map(([format,{file,bytes,sha256}])=>({format,file,bytes,sha256}))};
await writeFile(path.join(bundled,'SOURCE-AVAILABILITY.json'),JSON.stringify(availability,null,2)+'\n');
await writeFile(path.join(bundled,'SOURCE-AVAILABILITY.txt'),`折纸工坊 ${id} 完整对应源码\n\n应用运行不需要下载源码。完整对应源码作为独立附件，与本应用在同一发布页面或交付目录提供，可同等、免费获取。分发本应用时请一并提供下列附件的获取位置。\nZIP 和 7z 包含相同冻结文件，包括项目及全部依赖源码、许可、构建脚本和版本记录；两种归档均已实际解压并逐文件核对。\n\n${availability.archives.map(a=>`${a.file}\n字节数：${a.bytes}\nSHA256：${a.sha256}`).join('\n\n')}\n`);
const legalFiles=[];
for(const file of await files(bundled))legalFiles.push({path:posix(path.relative(bundled,file)),bytes:(await stat(file)).size,sha256:await sha(file)});
const report={version:pkg.version,candidate,files:allFiles.length,totalSourceBytes:(await Promise.all(allFiles.map(async file=>(await stat(file)).size))).reduce((a,b)=>a+b,0),archives,stage:posix(path.relative(root,stage)),bundledLegal:posix(path.relative(root,bundled)),legalFiles,sourceDelivery:'separate-release-attachments',zipAnd7zVerified:true,sourceInputs:inputHashes};
for(const item of inputHashes)if(await sha(path.join(root,item.path))!==item.sha256)throw Error(`Source changed after freeze: ${item.path}`);
await writeFile(path.join(base,'SOURCE-VERIFICATION.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,sourceInputs:undefined,legalFiles:undefined},null,2));
