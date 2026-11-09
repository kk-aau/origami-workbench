from pathlib import Path
import argparse, hashlib, json, shutil

parser = argparse.ArgumentParser()
parser.add_argument('--attempt', default='001')
args = parser.parse_args()
tag = args.attempt + '-1012'

root = Path.cwd().resolve()
out = root / ('output/parallel/strained-designs-check-snapshot-' + tag)
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
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)
    assert sha(dest) == before
    rows.append(dict(file=name, sha256=before, snapshot=dest.relative_to(root).as_posix()))
drift = [r['file'] for r in rows if sha(root / r['file']) != r['sha256']]
(out / 'inputs.json').write_text(json.dumps(dict(verified=not drift, files=rows, parallelDrift=drift, productionWritten=False), ensure_ascii=False, indent=2), encoding='utf8')
assert not drift, drift
runner = r'''import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const file='../../../strained-designs-checks-001-1012.json',log='../../../strained-designs-checks-001-1012.log';assert.ok(!fs.existsSync(file)&&!fs.existsSync(log));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),snapshot=JSON.parse(fs.readFileSync('../inputs.json','utf8'));assert.equal(snapshot.verified,true);
const inputs=snapshot.files.map(({file,sha256})=>({file,sha256}));for(const r of inputs)assert.equal(hash(r.file),r.sha256,r.file);
const output={startedAt:new Date().toISOString(),inputs,isolatedWorkingCopy:process.cwd(),stages:[],tests:{},guardedReuse:false,exitCode:null};
const fd=fs.openSync(log,'wx'),save=()=>fs.writeFileSync(file,JSON.stringify(output,null,2));save();
try{for(const name of ['test:unit','test:desktop','test:tessellation','test:goldberg-saved-layer','test:p39-layer','test:p37-two-uniform','test:server','build']){const stage={name,startedAt:new Date().toISOString(),exitCode:null};output.stages.push(stage);save();const before=fs.statSync(log).size;fs.writeSync(fd,`\n=== ${name} ===\n`);const c=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd run '+name],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});stage.pid=c.pid;save();stage.exitCode=await new Promise((a,b)=>{c.once('error',b);c.once('exit',a)});stage.finishedAt=new Date().toISOString();const part=fs.readFileSync(log,'utf8').slice(before);stage.testCount=Number(part.match(/ℹ pass (\d+)/)?.[1]??part.match(/# pass (\d+)/)?.[1]??0);if(name==='test:tessellation')stage.backendTestCount=Number(part.match(/Ran (\d+) tests/)?.[1]??0);if(name==='build')stage.buildModules=Number(part.match(/(\d+) modules transformed/)?.[1]??0);save();assert.equal(stage.exitCode,0,name);}for(const r of inputs)assert.equal(hash(r.file),r.sha256,r.file);output.tests={frontend:output.stages[0].testCount,desktop:output.stages[1].testCount,backend:output.stages[2].backendTestCount,serverWorker:output.stages[6].testCount,buildModules:output.stages[7].buildModules};output.exitCode=0;output.inputsUnchanged=true;}catch(e){output.exitCode=1;output.error=String(e);process.exitCode=1;}finally{output.finishedAt=new Date().toISOString();save();fs.closeSync(fd);}
'''
runner = runner.replace("fs.readFileSync(log,'utf8').slice(before)", "fs.readFileSync(log).subarray(before).toString('utf8')")
(work / ('scripts/run-strained-designs-checks-' + tag + '.mjs')).write_text(runner.replace('001-1012', tag), encoding='utf8')
print(json.dumps(dict(verified=True, files=len(rows), workingCopy=str(work)), ensure_ascii=False))
