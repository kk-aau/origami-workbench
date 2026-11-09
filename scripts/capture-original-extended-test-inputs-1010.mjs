import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const output='output/original-extended-full-run-1010.json';assert.ok(!fs.existsSync(output),'Do not overwrite a previous full-run record');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=new Set(['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs']);
for(const dir of ['src','backend','tests','vendor/simulator'])for(const relative of fs.readdirSync(dir,{recursive:true})){const file=path.join(dir,relative).replaceAll('\\','/');if(fs.statSync(file).isFile()&&!file.includes('__pycache__'))files.add(file);}
const record={startedAt:new Date().toISOString(),exitCode:null,inputs:[...files].sort().map(file=>({file,sha256:hash(file)}))};
fs.writeFileSync(output,JSON.stringify(record,null,2),{flag:'wx'});console.log(`Captured ${record.inputs.length} exact full-test inputs.`);
