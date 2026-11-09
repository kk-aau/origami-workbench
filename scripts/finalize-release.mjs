import { copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'release');
await copyFile(path.join(root,'build/source/zhezhi-corresponding-source.zip'),path.join(output,'zhezhi-corresponding-source.zip'));
await copyFile(path.join(root,'build/source/zhezhi-corresponding-source.7z'),path.join(output,'zhezhi-corresponding-source.7z'));
await copyFile(path.join(root,'desktop/使用说明.txt'),path.join(output,'使用说明.txt'));
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const files=[`Zhezhi-Workbench-${version}-Setup-x64.exe`,`Zhezhi-Workbench-${version}-Portable-x64.exe`,'zhezhi-corresponding-source.zip','zhezhi-corresponding-source.7z'];
const lines=[];
for(const name of files){const file=path.join(output,name);lines.push(`${createHash('sha256').update(await readFile(file)).digest('hex')}  ${name}`);console.log(`${name}: ${((await stat(file)).size/1024/1024).toFixed(1)} MiB`);}
await writeFile(path.join(output,'SHA256SUMS.txt'),lines.join('\n')+'\n');
