import {mkdir,readdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),release=JSON.parse(await readFile(path.join(root,'desktop-tauri/release.json'),'utf8')),id=`${pkg.version}-${release.candidate}`;
const output=path.join(root,'build/tauri-release',id),payload=path.join(output,'payload');
const sha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const sourceBase=path.join(root,'build/source-tauri',id),legal=path.join(sourceBase,'resources/legal');
const sourceVerification=JSON.parse(await readFile(path.join(sourceBase,'SOURCE-VERIFICATION.json'),'utf8'));
const availability=JSON.parse(await readFile(path.join(legal,'SOURCE-AVAILABILITY.json'),'utf8'));
if(!sourceVerification.zipAnd7zVerified||sourceVerification.version!==pkg.version||sourceVerification.candidate!==release.candidate||sourceVerification.sourceDelivery!=='separate-release-attachments')throw Error('Expected verified, separately delivered corresponding source for this candidate');
if(availability.id!==id||availability.runtimeRequiresSource!==false||availability.distribution!=='same-release-location'||availability.archives?.length!==2)throw Error('Source availability metadata does not match this runtime');
for(const format of ['zip','7z']){
 const archive=sourceVerification.archives[format],reference=availability.archives.find(a=>a.format===format);
 if(!reference||reference.file!==archive.file||reference.bytes!==archive.bytes||reference.sha256!==archive.sha256||await sha(path.join(sourceBase,archive.file))!==archive.sha256)throw Error(`Corresponding source ${format} reference does not match the verified archive`);
}
await mkdir(output,{recursive:true});
try{await stat(payload);throw Error('Payload exists. Preserve prior candidates and use a fresh staging directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(payload);
async function copy(source,destination,skip=()=>false){const info=await stat(source);if(info.isDirectory()){await mkdir(destination,{recursive:true});for(const e of await readdir(source,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Runtime symlink is not permitted');if(!skip(e.name))await copy(path.join(source,e.name),path.join(destination,e.name),skip);}}else{await mkdir(path.dirname(destination),{recursive:true});await copyFile(source,destination);}}
await copy(path.join(root,'src-tauri/target/release/zhezhi-workbench-tauri.exe'),path.join(payload,'zhezhi-workbench-tauri.exe'));
await copy(path.join(root,'dist'),path.join(payload,'resources/dist'),name=>name.endsWith('.map'));
await copy(path.join(root,'build/tessellation/zhezhi-tess'),path.join(payload,'resources/engine'));
await copy(legal,path.join(payload,'resources/legal'));
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await copy(path.join(root,file),path.join(payload,'resources',file));
await copy(path.join(root,'desktop-tauri/使用说明.txt'),path.join(payload,'使用说明.txt'));
await copy(path.join(root,'build/icons/workbench.ico'),path.join(payload,'resources/workbench.ico'));
await writeFile(path.join(payload,'resources/runtime-layout.json'),JSON.stringify({product:'Zhezhi Workbench Tauri',version:pkg.version,candidate:release.candidate,engine:'engine/zhezhi-tess.exe',frontend:'dist',webview:release.webview},null,2));
const manifest=[];
async function collect(folder){for(const e of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,e.name);if(e.isDirectory())await collect(file);else manifest.push({path:path.relative(payload,file).split(path.sep).join('/'),bytes:(await stat(file)).size,sha256:await sha(file)});}}
await collect(payload);manifest.sort((a,b)=>a.path.localeCompare(b.path,'en'));
if(manifest.some(f=>/\.(map|pdb)$/i.test(f.path)||/(^|\/)(node_modules|\.runtime|\.toolchain|\.venv|target|profile)(\/|$)|(^|\/)activity\.ndjson$/i.test(f.path)))throw Error('Development or private files found in payload');
const allowedFiles=new Set(['zhezhi-workbench-tauri.exe','使用说明.txt','resources/LICENSE','resources/THIRD_PARTY_NOTICES.md','resources/workbench.ico','resources/runtime-layout.json']);
if(manifest.some(f=>!allowedFiles.has(f.path)&&!['resources/dist/','resources/engine/','resources/legal/'].some(prefix=>f.path.startsWith(prefix))))throw Error('Unexpected source/development tree found in runtime payload');
if(manifest.some(f=>!f.path.startsWith('resources/legal/')&&/(^|\/)(?:src-tauri|desktop-tauri|\.cargo)(\/|$)|(^|\/)third-party\/(?:rust|npm|additional)(\/|$)/i.test(f.path)))throw Error('Corresponding-source dependency or build tree found in runtime payload');
if(manifest.some(f=>/^resources\/source(?:\/|$)/i.test(f.path)||/(^|\/)(?:zhezhi-corresponding-source|[^/]*-Source)\.(zip|7z)$/i.test(f.path)||/^resources\/legal\/.*\.(zip|7z)$/i.test(f.path)||/^resources\/legal\/(?:BUILD-INFO|SOURCE-MANIFEST)\.json$/i.test(f.path)))throw Error('Runtime must not embed source archives, source manifests or source build records');
const legalManifest=manifest.filter(f=>f.path.startsWith('resources/legal/')).map(f=>({...f,path:f.path.slice('resources/legal/'.length)}));
const expectedLegal=[...sourceVerification.legalFiles].sort((a,b)=>a.path.localeCompare(b.path,'en'));
if(JSON.stringify(legalManifest)!==JSON.stringify(expectedLegal))throw Error('Runtime legal notices differ from the verified corresponding-source delivery');
const report={id,payload,fileCount:manifest.length,totalBytes:manifest.reduce((n,f)=>n+f.bytes,0),sourceDelivery:'separate-release-attachments',sourceAvailability:availability,files:manifest};
await writeFile(path.join(output,'PAYLOAD-MANIFEST.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({id,payload,fileCount:report.fileCount,totalBytes:report.totalBytes}));
