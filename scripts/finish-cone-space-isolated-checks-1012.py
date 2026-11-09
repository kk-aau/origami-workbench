from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();base=root/'output/parallel/cone-space-check-snapshot-002-1012';work=base/'work';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
previous=json.loads((root/'output/cone-space-checks-003-1012.json').read_text(encoding='utf8'));assert previous['stages'][0]['exitCode']==0
for r in previous['inputs']:assert sha(work/r['file'])==r['sha256'],r['file']
new=[]
for p in [root/'index.html',*list((root/'simulator').rglob('*'))]:
 if p.is_file():
  name=p.relative_to(root).as_posix();dest=work/name;assert not dest.exists();dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);assert sha(dest)==sha(p);new.append(dict(file=name,sha256=sha(dest)))
(base/'build-entry-inputs.json').write_text(json.dumps(dict(verified=True,files=new,frontendInputsUnchanged=True),ensure_ascii=False,indent=2),encoding='utf8')
runner=work/'scripts/run-cone-space-checks-004-1012.mjs';assert not runner.exists()
runner.write_text('''import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const file='../../../cone-space-checks-004-1012.json',log='../../../cone-space-checks-004-1012.log',baseFile='../../../cone-space-checks-003-1012.json';assert.ok(!fs.existsSync(file)&&!fs.existsSync(log));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),base=JSON.parse(fs.readFileSync(baseFile,'utf8')),extra=JSON.parse(fs.readFileSync('../build-entry-inputs.json','utf8'));
assert.equal(base.stages[0].exitCode,0);const inputs=[...base.inputs,...extra.files];for(const r of inputs)assert.equal(hash(r.file),r.sha256,r.file);
const baseLog=fs.readFileSync('../../../cone-space-checks-003-1012.log','utf8'),frontend=Number(baseLog.match(/ℹ pass (\\d+)/)?.[1]);assert.ok(frontend>=3463);
const output={startedAt:new Date().toISOString(),baseFile,baseSHA256:hash(baseFile),inputs,isolatedWorkingCopy:process.cwd(),stages:[],tests:{...base.tests,frontend},guardedReuse:{...base.guardedReuse,frontend:true,reason:'Frontend suite passed in the held-fixed copy. Only missing root HTML/simulator build entries were copied; every existing frontend input remains exact SHA-identical. Backend/server/desktop reuse retains the original checks.'},exitCode:null};
const fd=fs.openSync(log,'wx'),save=()=>fs.writeFileSync(file,JSON.stringify(output,null,2));save();
try{const stage={name:'build',startedAt:new Date().toISOString(),exitCode:null};output.stages.push(stage);const c=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd run build'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',fd,fd]});stage.pid=c.pid;save();stage.exitCode=await new Promise((a,b)=>{c.once('error',b);c.once('exit',a)});stage.finishedAt=new Date().toISOString();assert.equal(stage.exitCode,0);for(const r of inputs)assert.equal(hash(r.file),r.sha256,r.file);output.tests.buildModules=Number(fs.readFileSync(log,'utf8').match(/(\\d+) modules transformed/)?.[1]);output.inputsUnchanged=true;output.exitCode=0;}catch(e){output.error=String(e);output.exitCode=1;process.exitCode=1;}finally{output.finishedAt=new Date().toISOString();save();fs.closeSync(fd);}
''',encoding='utf8')
print(json.dumps(dict(verified=True,buildEntries=len(new),frontendSourcesUnchanged=True),ensure_ascii=False))
