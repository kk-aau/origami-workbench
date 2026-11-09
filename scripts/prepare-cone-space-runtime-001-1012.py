from pathlib import Path
import hashlib,json,shutil,re
root=Path.cwd().resolve();work=root/'output/parallel/cone-space-check-snapshot-002-1012/work';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
check=root/'output/cone-space-checks-004-1012.json';data=json.loads(check.read_text(encoding='utf8'));assert data['exitCode']==0 and data['inputsUnchanged']
out=root/'output/parallel/cone-space-main-root-001-1012';assert not out.exists();out.mkdir(parents=True);rows=[]
for r in data['inputs']:
 assert sha(work/r['file'])==r['sha256'],r['file']
 if r['file'].startswith('src/'):rows.append(dict(path=r['file'],sha256=r['sha256'],snapshot=(work/r['file']).relative_to(root).as_posix()))
compiled=root/'output/cone-space-compiled-001-1012';assert not compiled.exists();compiled.mkdir();bundleRows=[]
for p in sorted((work/'dist').rglob('*')):
 if p.is_file():
  dest=compiled/p.relative_to(work/'dist');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);assert sha(dest)==sha(p);bundleRows.append(dict(path=p.relative_to(work).as_posix(),copy=dest.relative_to(root).as_posix(),sha256=sha(dest)))
bundle=re.search(r'src="([^"]+\.js)"',(compiled/'index.html').read_text(encoding='utf8'))[1]
index=out/'ROOT-SOURCE-FROZEN.json';index.write_text(json.dumps(dict(verified=True,files=rows,bundle=bundle,checks=check.relative_to(root).as_posix(),checksSHA256=sha(check),compiledBundleCopies=bundleRows,scope='Fluted/multislice cone and finite generic space-curve paper, fixed full-source copy',physicalValidation=False),ensure_ascii=False,indent=2),encoding='utf8')
original=work/'server.mjs';text=original.read_text(encoding='utf8');needle='const root = path.dirname(fileURLToPath(import.meta.url));';assert text.count(needle)==1;text=text.replace(needle,'const root = '+json.dumps(str(work),ensure_ascii=False)+';')
needle="const publicRoot=path.join(root,'dist');";assert text.count(needle)==1;text=text.replace(needle,'const publicRoot='+json.dumps(str(compiled),ensure_ascii=False)+';')
text=re.sub(r"from '(\./[^']+)'",lambda m:'from '+json.dumps((work/m[1]).resolve().as_uri(),ensure_ascii=False),text)
server=out/'server.mjs';server.write_text(text,encoding='utf8')
binding=out/'binding.json';binding.write_text(json.dumps(dict(verified=True,sourceFreeze=str(index),sourceFreezeSHA256=sha(index),frozenServer=str(server),frozenServerSHA256=sha(server),originalServerPath=str(original),originalServerSHA256=sha(original),compiledRoot=str(compiled),backendRoot=str(work),staticFiles=bundleRows,sourceSnapshots=rows,onlyWrapperChanges=['absolute captured imports','captured original backend root','immutable compiled static root'],fixtureResponseUsed=False),ensure_ascii=False,indent=2),encoding='utf8')
dataDir=root/'output/cone-space-main-server-001-1012'
js=f'''import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8887');assert.equal(process.env.ZHEZHI_DATA_DIR,{json.dumps(dataDir.as_posix(),ensure_ascii=False)});
const binding=JSON.parse(fs.readFileSync({json.dumps(binding.as_posix(),ensure_ascii=False)},'utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(hash(binding.frozenServer),binding.frozenServerSHA256);assert.equal(hash(binding.originalServerPath),binding.originalServerSHA256);
for(const r of binding.staticFiles)assert.equal(hash(r.copy),r.sha256);for(const r of binding.sourceSnapshots)assert.equal(hash(r.snapshot),r.sha256);
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/cone-space-main-pid-001-1012.json',JSON.stringify({{pid:process.pid,port:8887,cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,startedAt:new Date().toISOString(),staticRoot:binding.compiledRoot,bindingSHA256:hash({json.dumps(binding.as_posix(),ensure_ascii=False)})}},null,2),{{flag:'wx'}});
await import({json.dumps(server.as_uri(),ensure_ascii=False)});
'''
(root/'scripts/start-cone-space-main-001-1012.mjs').write_text(js,encoding='utf8')
folder=root/'output/playwright/cone-space-main-1012';downloads=folder/'downloads-001';assert not downloads.exists();downloads.mkdir(parents=True)
config=json.loads((root/'output/playwright/tube-strip-main-1012/cli-config-002.json').read_text(encoding='utf8'));config['outputDir']=str(folder/'cli-001');(folder/'cli-config-001.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
ps=(root/'scripts/start-tube-strip-main-002-1012.ps1').read_text(encoding='utf-8-sig').replace('tube-strip-main','cone-space-main').replace('002-1012','001-1012').replace("'8886'","'8887'");(root/'scripts/start-cone-space-main-001-1012.ps1').write_text(ps,encoding='utf-8-sig')
print(json.dumps(dict(verified=True,sourceFiles=len(rows),bundle=bundle,sourceSHA256=sha(index),wrapperSHA256=sha(server),bindingSHA256=sha(binding),actualDirectory=downloads.as_posix()),ensure_ascii=False))
