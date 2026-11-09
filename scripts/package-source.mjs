import { mkdir, cp, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'build','source');
await mkdir(output,{recursive:true});
const archives=['src','desktop','scripts','backend','tests','simulator','public','docs','server.mjs','tess-worker.mjs','launch.ps1','index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','requirements.txt','requirements-lock.txt','requirements-build.txt','LICENSE','THIRD_PARTY_NOTICES.md','README.md','vendor/cp-path-optimizer','vendor/pleat/pleat','vendor/pleat/LICENSE','vendor/pleat/UPSTREAM.md','vendor/simulator/UPSTREAM.md','vendor/simulator/oristudio/packages/origami-simulator','node_modules/rabbit-ear'];
// Rebuild rather than update an old ZIP, so removed sources cannot linger.
// Force UTF-8 filenames; the Windows locale otherwise produces ambiguous names.
// Keep a conventional ZIP for separate distribution; ship the identical source
// payload as solid 7z to avoid embedding a large, already-deflated ZIP in the EXE.
for(const [extension,options] of [
  ['zip',['-tzip','-mcu=on']],
  ['7z',['-t7z','-mx=9','-md=64m','-ms=on','-mtc=off','-mtm=off','-mta=off']],
]){
  const temporaryArchive=path.join(output,`source-${process.pid}-${Date.now()}.${extension}`);
  const result=spawnSync(require('7zip-bin').path7za,['a',...options,temporaryArchive,...archives,'-xr!.git','-xr!__pycache__','-xr!*.pyc'],{cwd:root,windowsHide:true,stdio:'inherit'});
  if(result.status!==0){await rm(temporaryArchive,{force:true});throw new Error('Corresponding source archive failed');}
  await rename(temporaryArchive,path.join(output,`zhezhi-corresponding-source.${extension}`));
}
const licenses=path.join(output,'licenses');await mkdir(licenses,{recursive:true});
const frontendPackages=new Set(['react','react-dom','earcut','fast-xml-parser','rabbit-ear','fflate']);
// Frontend packages are build dependencies, but their bundled code still ships.
// Preserve their dependency licenses before omitting npm modules from the app.
for(const name of frontendPackages){
  const metadata=JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8'));
  for(const dependency of Object.keys(metadata.dependencies??{}))frontendPackages.add(dependency);
}
for(const name of [...frontendPackages,'electron']){
  const directory=path.join(root,'node_modules',name);
  const files=await readdir(directory),prefix=name.replaceAll('/','-');
  await cp(path.join(directory,'package.json'),path.join(licenses,`${prefix}-package.json`));
  for(const file of files)if(/^(license|notice|copying)/i.test(file)||!files.some(item=>/^(license|notice|copying)/i.test(item))&&/^readme/i.test(file))await cp(path.join(directory,file),path.join(licenses,`${prefix}-${file}`),{recursive:true});
}
const site=path.join(root,'.venv','Lib','site-packages');
for(const name of await readdir(site))if(name.endsWith('.dist-info')){
  const directory=path.join(site,name);
  for(const file of await readdir(directory))if(/^(license|notice|copying|metadata)/i.test(file))await cp(path.join(directory,file),path.join(licenses,name,file),{recursive:true});
}
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(output,'BUILD-INFO.json'),JSON.stringify({app:pkg.version,electron:pkg.devDependencies.electron,builder:pkg.devDependencies['electron-builder'],pyinstaller:'6.22.0',platform:'Windows x64',created:new Date().toISOString()},null,2));
await writeFile(path.join(output,'README.txt'),'完整对应源码保存在 zhezhi-corresponding-source.7z，可使用 7-Zip 等兼容工具解压。\n单独发布的 zhezhi-corresponding-source.zip 包含相同文件，便于使用常规 ZIP 工具。\nlicenses 目录保留第三方许可文件及包信息，构建步骤见源码中的 README 和 scripts。\n');
