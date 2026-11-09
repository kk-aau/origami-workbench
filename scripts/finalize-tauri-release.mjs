import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const read=async name=>JSON.parse((await readFile(path.join(root,name),'utf8')).replace(/^\uFEFF/,''));
const pkg=await read('package.json'),config=await read('desktop-tauri/release.json'),id=`${pkg.version}-${config.candidate}`,prefix=`Zhezhi-Workbench-Tauri-${id}`;
const evidence=`output/tauri-release-${id}`,candidate=`output/tauri-package-${id}`,source=`build/source-tauri/${id}`,debug=`build/debug/tauri/${id}`;
const sha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const validation={};
for(const name of ['engine-reuse.json','bundles.json','portable/gui-all.json','installed/gui-all.json','lifecycle.json']){
 const report=await read(`${evidence}/${name}`);if(!report.passed)throw Error(`Acceptance incomplete: ${name}`);validation[name]=true;
}
const sourceVerification=await read(`${source}/SOURCE-VERIFICATION.json`);if(!sourceVerification.zipAnd7zVerified)throw Error('Source archives not verified');
// No post-freeze edit can silently acquire a mismatched source archive.
for(const entry of sourceVerification.sourceInputs)if(await sha(path.join(root,entry.path))!==entry.sha256)throw Error(`Source changed after freeze: ${entry.path}`);
const payload=await read(`${candidate}/payload-manifest.json`);
if(sourceVerification.sourceDelivery!=='separate-release-attachments')throw Error('Source must be delivered as independent attachments');
if(payload.files.some(f=>/^resources\/source(?:\/|$)/i.test(f.path)||/(^|\/)(?:zhezhi-corresponding-source|[^/]*-Source)\.(zip|7z)$/i.test(f.path)))throw Error('Application payload contains corresponding source');
const legal=payload.files.filter(f=>f.path.startsWith('resources/legal/')).map(f=>({...f,path:f.path.slice('resources/legal/'.length)}));
const byPath=entries=>[...entries].sort((a,b)=>a.path.localeCompare(b.path,'en'));
if(JSON.stringify(byPath(legal))!==JSON.stringify(byPath(sourceVerification.legalFiles)))throw Error('Application legal materials differ from verified source delivery');
const availabilityPath=`build/tauri-release/${id}/payload/resources/legal/SOURCE-AVAILABILITY.json`;
const availabilityEntry=payload.files.find(f=>f.path==='resources/legal/SOURCE-AVAILABILITY.json');
if(!availabilityEntry||await sha(path.join(root,availabilityPath))!==availabilityEntry.sha256)throw Error('Source reference metadata changed after packaging');
const availability=await read(availabilityPath);
const expectedArchives=Object.entries(sourceVerification.archives).map(([format,a])=>({format,file:a.file,bytes:a.bytes,sha256:a.sha256}));
const byFormat=entries=>[...entries].sort((a,b)=>a.format.localeCompare(b.format));
if(availability.id!==id||availability.runtimeRequiresSource!==false||availability.distribution!=='same-release-location'||JSON.stringify(byFormat(availability.archives))!==JSON.stringify(byFormat(expectedArchives)))throw Error('Application source references do not match release attachments');
const destination=path.join(root,'release',`Tauri-${id}`);await mkdir(destination,{recursive:true});
const inputs=[...payload.artifacts.map(a=>({from:`${candidate}/${a.path}`,name:a.path,expected:a.sha256})),...Object.values(sourceVerification.archives).map(a=>({from:`${source}/${a.file}`,name:a.file,expected:a.sha256})),{from:`${debug}/${prefix}-Debug.zip`,name:`${prefix}-Debug.zip`},{from:`${debug}/BUILD-INFO.json`,name:`${prefix}-Debug-BUILD-INFO.json`},{from:'desktop-tauri/使用说明.txt',name:'使用说明.txt'}];
const delivered=[];
for(const item of inputs){
 const original=path.join(root,item.from),hash=await sha(original);if(item.expected&&hash!==item.expected)throw Error(`Artifact changed after validation: ${item.from}`);
 const target=path.join(destination,item.name);
 try{await stat(target);if(await sha(target)!==hash)throw Error(`Refusing to overwrite delivered artifact: ${target}`);}catch(e){if(e.code==='ENOENT')await copyFile(original,target);else throw e;}
 delivered.push({file:item.name,bytes:(await stat(target)).size,MiB:Math.round((await stat(target)).size/1048576*100)/100,sha256:hash});
}
const groups={host:0,frontend:0,engine:0,legal:0,other:0};
for(const file of payload.files){const group=file.path==='zhezhi-workbench-tauri.exe'?'host':file.path.startsWith('resources/dist/')?'frontend':file.path.startsWith('resources/engine/')?'engine':file.path.startsWith('resources/legal/')?'legal':'other';groups[group]+=file.bytes;}
const engineEvidence=await read(`${evidence}/engine-reuse.json`);
if(!engineEvidence.regressionBoundary)throw Error('Engine regression scope is missing');
const report={id,version:pkg.version,candidate:config.candidate,created:new Date().toISOString(),architecture:'Tauri / Rust / system WebView2',validation,payloadBytes:payload.totalBytes,payloadGroups:groups,sourceDelivery:'separate-release-attachments',embeddedSourceArchives:0,sourceAvailability:availability,artifacts:delivered,engineRegression:engineEvidence.regressionBoundary,unsigned:true,systemWebView2Required:true};
const reportName=`RELEASE-${id}.json`;await writeFile(path.join(destination,reportName),JSON.stringify(report,null,2));
const checksum=[...delivered.map(a=>`${a.sha256}  ${a.file}`),`${await sha(path.join(destination,reportName))}  ${reportName}`].join('\n')+'\n';
await writeFile(path.join(destination,`SHA256SUMS-${id}.txt`),checksum);await writeFile(path.join(destination,'SHA256SUMS.txt'),checksum);
console.log(JSON.stringify({destination,payloadBytes:report.payloadBytes,payloadGroups:groups,artifacts:delivered},null,2));
