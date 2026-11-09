from pathlib import Path
import hashlib,json,re
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_path=root/'output/parallel/tube-strip-main-root-001-1012/ROOT-SOURCE-FROZEN.json';source=json.loads(source_path.read_text(encoding='utf8'))
for r in source['files']:assert sha(root/r['snapshot'])==r['sha256'],r['path']
for r in source['compiledBundleCopies']:assert sha(root/r['copy'])==r['sha256'],r['copy']
out=root/'output/parallel/tube-strip-runtime-002-1012';assert not out.exists();out.mkdir()
original=root/'server.mjs';text=original.read_text(encoding='utf8');old="const root = path.dirname(fileURLToPath(import.meta.url));";assert text.count(old)==1
text=text.replace(old,'const root = '+json.dumps(str(root),ensure_ascii=False)+';')
old="const publicRoot=path.join(root,'dist');";assert text.count(old)==1
compiled=root/'output/tube-strip-compiled-001-1012';text=text.replace(old,'const publicRoot='+json.dumps(str(compiled),ensure_ascii=False)+';')
text=re.sub(r"from '(\./[^']+)'",lambda m:'from '+json.dumps((root/m[1]).resolve().as_uri(),ensure_ascii=False),text)
server=out/'server.mjs';server.write_text(text,encoding='utf8')
liveChanges=[]
for r in source['files']:
 current=root/r['path']
 if current.exists() and sha(current)!=r['sha256']:liveChanges.append(dict(file=r['path'],testedSHA256=r['sha256'],currentSHA256=sha(current)))
binding=dict(verified=True,sourceFreeze=str(source_path),sourceFreezeSHA256=sha(source_path),frozenServer=str(server),frozenServerSHA256=sha(server),originalServerSHA256=sha(original),compiledRoot=str(compiled),staticFiles=source['compiledBundleCopies'],sourceSnapshots=source['files'],liveChangesPreserved=liveChanges,onlyWrapperChanges=['absolute production imports','original production backend root','immutable compiled static root'],fixtureResponseUsed=False)
(out/'binding.json').write_text(json.dumps(binding,ensure_ascii=False,indent=2),encoding='utf8')
js="""import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8886');assert.equal(process.env.ZHEZHI_DATA_DIR,'D:/codex/折纸工具/workbench/output/tube-strip-main-server-002-1012');
const binding=JSON.parse(fs.readFileSync('output/parallel/tube-strip-runtime-002-1012/binding.json','utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(hash(binding.frozenServer),binding.frozenServerSHA256);assert.equal(hash('server.mjs'),binding.originalServerSHA256);
for(const r of binding.staticFiles)assert.equal(hash(r.copy),r.sha256);for(const r of binding.sourceSnapshots)assert.equal(hash(r.snapshot),r.sha256);
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/tube-strip-main-pid-002-1012.json',JSON.stringify({pid:process.pid,port:8886,cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,startedAt:new Date().toISOString(),staticRoot:binding.compiledRoot,bindingSHA256:hash('output/parallel/tube-strip-runtime-002-1012/binding.json')},null,2),{flag:'wx'});
await import('../output/parallel/tube-strip-runtime-002-1012/server.mjs');
"""
(root/'scripts/start-tube-strip-main-002-1012.mjs').write_text(js,encoding='utf8')
folder=root/'output/playwright/tube-strip-main-1012';downloads=folder/'downloads-002';assert not downloads.exists();downloads.mkdir()
(downloads/'verify-main.browser.js').write_text((root/'scripts/tube-strip-main-1012.browser.js').read_text(encoding='utf8').replace('__OUTPUT__',downloads.as_posix()).replace('__BUNDLE__',source['bundle']),encoding='utf8')
config=json.loads((folder/'cli-config-001.json').read_text(encoding='utf8'));config['outputDir']=str(folder/'cli-002');(folder/'cli-config-002.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
ps=(root/'scripts/start-tube-strip-main-001-1012.ps1').read_text(encoding='utf-8-sig').replace('001-1012','002-1012');(root/'scripts/start-tube-strip-main-002-1012.ps1').write_text(ps,encoding='utf-8-sig')
print(json.dumps(dict(verified=True,compiledFiles=len(source['compiledBundleCopies']),parallelFilesPreserved=len(liveChanges),bindingSHA256=sha(out/'binding.json')),ensure_ascii=False))
