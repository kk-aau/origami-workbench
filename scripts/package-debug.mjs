import {mkdir,readdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const directory=path.join(root,'build','debug');await mkdir(directory,{recursive:true});
const assets=[];
async function collect(relative){
  for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
    const file=path.join(relative,entry.name);
    if(entry.isDirectory())await collect(file);
    else if(entry.name.endsWith('.map')){
      const bytes=await readFile(path.join(root,file)),generated=file.slice(0,-4);
      assets.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),generated,generatedSha256:createHash('sha256').update(await readFile(path.join(root,generated))).digest('hex')});
    }
  }
}
await collect('dist');if(!assets.length)throw Error('No production source maps found; run npm run build first.');
const manifest=path.join('build','debug',`BUILD-INFO-${version}.json`);
await writeFile(path.join(root,manifest),JSON.stringify({version,created:new Date().toISOString(),assets},null,2)+'\n');
const archive=path.join(directory,`zhezhi-debug-${version}.zip`),temporary=archive+`.${process.pid}.tmp.zip`;
const result=spawnSync(require('7zip-bin').path7za,['a','-tzip','-mcu=on',temporary,manifest,...assets.map(asset=>asset.file)],{cwd:root,windowsHide:true,stdio:'inherit'});
if(result.status!==0){await rm(temporary,{force:true});throw Error('Debug archive failed.');}
await rename(temporary,archive);console.log(`Debug maps archived separately: ${archive}`);
