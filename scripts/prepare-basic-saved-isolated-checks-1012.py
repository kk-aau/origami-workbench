from pathlib import Path
import hashlib, json, shutil

root = Path.cwd().resolve()
out = root / 'output/parallel/basic-saved-check-snapshot-001-1012'
assert not out.exists()
work = out / 'work'
work.mkdir(parents=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
files = []
for folder in ['src','tests','backend','desktop','public','scripts','docs','vendor','simulator']:
    for p in (root / folder).rglob('*'):
        if p.is_file() and not any(x in p.parts for x in ['.git','node_modules','__pycache__']):
            files.append(p)
for name in ['package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs','tess-worker.mjs','index.html']:
    files.append(root / name)
rows = []
for p in sorted(set(files)):
    name = p.relative_to(root).as_posix()
    before = sha(p)
    dest = work / name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,dest)
    assert sha(dest) == before
    rows.append(dict(file=name,sha256=before,snapshot=dest.relative_to(root).as_posix()))
drift = [r['file'] for r in rows if sha(root / r['file']) != r['sha256']]
(out / 'inputs.json').write_text(json.dumps(dict(verified=not drift,files=rows,parallelDrift=drift,productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
assert not drift, drift
runner = '''import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const file='../../../basic-saved-checks-001-1012.json',log='../../../basic-saved-checks-001-1012.log',baseFile='../../../cone-space-checks-008-1012.json';assert.ok(!fs.existsSync(file)&&!fs.existsSync(log));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),base=JSON.parse(fs.readFileSync(baseFile,'utf8')),snapshot=JSON.parse(fs.readFileSync('../inputs.json','utf8'));assert.equal(base.exitCode,0);assert.equal(snapshot.verified,true);
const inputs=snapshot.files.map(({file,sha256})=>({file,sha256}));for(const r of inputs)assert.equal(hash(r.file),r.sha256,r.file);
const backendInputs=base.inputs.filter(r=>(r.file.startsWith('backend/')||r.file.startsWith('desktop/')||r.file.startsWith('tests/desktop/')||r.file.startsWith('tests/')&&r.file.endsWith('.mjs')||['server.mjs','package.json','package-lock.json'].includes(r.file))&&!r.file.includes('__pycache__'));
for(const r of backendInputs)assert.equal(hash(r.file),r.sha256,r.file);
const output={startedAt:new Date().toISOString(),baseFile,baseSHA256:hash(baseFile),inputs,isolatedWorkingCopy:process.cwd(),stages:[],tests:{backend:base.tests.backend,serverWorker:base.tests.serverWorker,desktop:base.tests.desktop},guardedReuse:{backend:true,serverWorker:true,desktop:true,frontend:false,guardedInputs:backendInputs.length,reason:'Backend/server/desktop and their tests match the previously verified sources; all frontend tests and TypeScript/Vite build run again in this complete fixed copy.'},exitCode:null};
const fd=fs.openSync(log,'wx'),save=()=>fs.writeFileSync(file,JSON.stringify(output,null,2));save();
try{for(const name of ['test:unit','build']){const stage={name,startedAt:new Date().toISOString(),exitCode:null};output.stages.push(stage);save();fs.writeSync(fd,`\\n=== ${name} ===\\n`);const c=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd run '+name],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',fd,fd]});stage.pid=c.pid;save();stage.exitCode=await new Promise((a,b)=>{c.once('error',b);c.once('exit',a)});stage.finishedAt=new Date().toISOString();save();assert.equal(stage.exitCode,0,name);}for(const r of inputs)assert.equal(hash(r.file),r.sha256,r.file);const text=fs.readFileSync(log,'utf8');output.tests.frontend=Number(text.match(/ℹ pass (\\d+)/)?.[1]);output.tests.buildModules=Number(text.match(/(\\d+) modules transformed/)?.[1]);assert.ok(output.tests.frontend>=3506);output.exitCode=0;output.inputsUnchanged=true;}catch(e){output.exitCode=1;output.error=String(e);process.exitCode=1;}finally{output.finishedAt=new Date().toISOString();save();fs.closeSync(fd);}
'''
(work / 'scripts/run-basic-saved-checks-001-1012.mjs').write_text(runner,encoding='utf8')
print(json.dumps(dict(verified=True,files=len(rows),workingCopy=str(work)),ensure_ascii=False))
