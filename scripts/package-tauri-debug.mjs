import {mkdir,readdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),release=JSON.parse(await readFile(path.join(root,'desktop-tauri/release.json'),'utf8')),id=`${pkg.version}-${release.candidate}`;
const output=path.join(root,'build/debug/tauri',id);await mkdir(output,{recursive:true});
const sha=async file=>createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
const files=[];
async function walk(folder){for(const entry of await readdir(path.join(root,folder),{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else if(file.endsWith('.map'))files.push({file,sha256:await sha(file),generated:file.slice(0,-4),generatedSha256:await sha(file.slice(0,-4))});}}
await walk('dist');if(!files.length)throw Error('No sourcemaps found');
const exe='src-tauri/target/release/zhezhi-workbench-tauri.exe',pdb='src-tauri/target/release/zhezhi_workbench_tauri.pdb';await stat(path.join(root,pdb));
const manifest=path.join('build/debug/tauri',id,'BUILD-INFO.json');
await writeFile(path.join(root,manifest),JSON.stringify({id,assets:files,native:{executable:exe,sha256:await sha(exe),symbols:pdb,symbolsSha256:await sha(pdb)}},null,2));
const archive=path.join(output,`Zhezhi-Workbench-Tauri-${id}-Debug.zip`);
try{await stat(archive);throw Error('Debug archive already exists; use a new candidate directory instead of overwriting');}catch(e){if(e.code!=='ENOENT')throw e;}
const result=spawnSync(require('7zip-bin').path7za,['a','-tzip','-mcu=on',archive,manifest,pdb,...files.map(f=>f.file)],{cwd:root,windowsHide:true,stdio:'inherit'});
if(result.status!==0)throw Error('Debug archive failed');
console.log(JSON.stringify({archive,mapCount:files.length,bytes:(await stat(archive)).size}));
