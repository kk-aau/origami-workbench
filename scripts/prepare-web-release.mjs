import {readFile,writeFile,readdir,mkdir,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';

// This is a web-only source delivery. No desktop engine, private project,
// recovery database, cache or executable is copied into the public website.
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'build/web');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),release=JSON.parse(await readFile(path.join(root,'desktop-tauri/release.json'),'utf8')),releaseId=`${pkg.version}-${release.candidate}`;
const legal=path.join(out,'legal'),source={},manifest=[];
const sha=data=>createHash('sha256').update(data).digest('hex');
const posix=value=>value.split(path.sep).join('/');
const excluded=new Set(['.git','node_modules','__pycache__','target','.toolchain','.runtime']);
async function files(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(excluded.has(entry.name)||entry.name.endsWith('.pyc'))continue;const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected source symlink: '+file);if(entry.isDirectory())result.push(...await files(file));else if(entry.isFile())result.push(file);}return result.sort();}
async function include(relative){const file=path.join(root,relative),list=(await stat(file)).isDirectory()?await files(file):[file];for(const name of list){const key=posix(path.relative(root,name)),bytes=await readFile(name);source[key]=bytes;manifest.push({path:key,bytes:bytes.length,sha256:sha(bytes)});}}
for(const name of ['src','simulator','public','vendor/simulator','vendor/cp-path-optimizer','tests/browser','scripts/prepare-web-release.mjs','vite.config.ts','tsconfig.json','package.json','package-lock.json','desktop-tauri/release.json','index.html','LICENSE','THIRD_PARTY_NOTICES.md','docs/网页版部署与使用.md'])await include(name);
const packages=[],seen=new Set(),queue=['react','react-dom','earcut','fast-xml-parser','rabbit-ear','fflate'].map(name=>({name,from:root}));
await mkdir(legal,{recursive:true});
while(queue.length){
 const {name,from}=queue.shift();let directory=from,found;
 while(directory===root||directory.startsWith(root+path.sep)){const candidate=path.join(directory,'node_modules',name);try{await stat(path.join(candidate,'package.json'));found=candidate;break;}catch(error){if(error.code!=='ENOENT')throw error;}directory=path.dirname(directory);}
 if(!found)throw Error('Missing frontend package '+name);
 const pkg=JSON.parse(await readFile(path.join(found,'package.json'),'utf8')),key=pkg.name+'@'+pkg.version;if(seen.has(key))continue;seen.add(key);
 packages.push({name:pkg.name,version:pkg.version,license:pkg.license});
 const available=await files(found),hasLicense=available.some(file=>/^(licen[sc]e|notice|copying|copyright)/i.test(path.basename(file)));
 for(const file of available){const relative=posix(path.relative(found,file)),bytes=await readFile(file);source['third-party/npm/'+key+'/'+relative]=bytes;
  if(/^(licen[sc]e|notice|copying|copyright|authors)/i.test(path.basename(file))||relative==='package.json'||!hasLicense&&/^readme/i.test(relative)){const target=path.join(legal,'npm',key,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);}
 }
 for(const dependency of Object.keys(pkg.dependencies??{}))queue.push({name:dependency,from:found});
}
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await copyFile(path.join(root,name),path.join(legal,name));
for(const base of ['vendor/simulator','vendor/cp-path-optimizer'])for(const file of await files(path.join(root,base))){if(/^(licen[sc]e|notice|third.party|upstream)/i.test(path.basename(file))){const target=path.join(legal,posix(path.relative(root,file)));await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);}}
source['README-WEB.txt']=Buffer.from('网页版对应源码。构建说明见 docs/网页版部署与使用.md。使用 Node.js 24、npm ci、npm run build:web；无需 Rust 或 Python。third-party/npm 保留所捆绑前端依赖的包源码及许可；开发依赖由 package-lock.json 锁定。此归档不包含桌面本机引擎，桌面完整源码请从 GitHub Release 获取。\n');
source['WEB-SOURCE-MANIFEST.json']=Buffer.from(JSON.stringify({files:manifest,npmPackages:packages},null,2)+'\n');
const archive=zipSync(source,{level:6}),archiveName='origami-web-source.zip';await writeFile(path.join(out,archiveName),archive);
const info={edition:'browser',version:pkg.version,candidate:release.candidate,releaseId,source:{file:archiveName,bytes:archive.length,sha256:sha(archive)},repository:'https://github.com/kk-aau/origami-workbench',npmPackages:packages};
await writeFile(path.join(legal,'SOURCE-AVAILABILITY.json'),JSON.stringify(info,null,2)+'\n');
await writeFile(path.join(out,'.nojekyll'),'');
console.log(JSON.stringify({webSourceBytes:archive.length,sourceFiles:manifest.length,frontendPackages:packages.length}));
