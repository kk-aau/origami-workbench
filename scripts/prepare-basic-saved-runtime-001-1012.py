from pathlib import Path
import hashlib, json, shutil, re, subprocess

root=Path.cwd().resolve()
work=root/'output/parallel/basic-saved-check-snapshot-002-1012/work'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
check=root/'output/basic-saved-checks-002-1012.json'
data=json.loads(check.read_text(encoding='utf8'))
assert data['exitCode']==0 and data['inputsUnchanged']
out=root/'output/parallel/basic-saved-main-root-001-1012'
assert not out.exists()
out.mkdir(parents=True)
rows=[]
for r in data['inputs']:
    assert sha(work/r['file'])==r['sha256'],r['file']
    if r['file'].startswith('src/'):
        dest=out/'source-snapshot'/r['file']
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(work/r['file'],dest)
        rows.append(dict(path=r['file'],sha256=r['sha256'],snapshot=dest.relative_to(root).as_posix()))
compiled=root/'output/basic-saved-compiled-001-1012'
assert not compiled.exists()
compiled.mkdir()
bundleRows=[]
for p in sorted((work/'dist').rglob('*')):
    if p.is_file():
        dest=compiled/p.relative_to(work/'dist')
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(p,dest)
        assert sha(dest)==sha(p)
        bundleRows.append(dict(path=p.relative_to(work).as_posix(),copy=dest.relative_to(root).as_posix(),sha256=sha(dest)))
bundle=re.search(r'src="([^"]+\.js)"',(compiled/'index.html').read_text(encoding='utf8'))[1]
index=out/'ROOT-SOURCE-FROZEN.json'
index.write_text(json.dumps(dict(verified=True,files=rows,bundle=bundle,checks=check.relative_to(root).as_posix(),checksSHA256=sha(check),compiledBundleCopies=bundleRows,scope='Five basic paper models and three saved developable paper outlines, fixed complete source',physicalValidation=False),ensure_ascii=False,indent=2),encoding='utf8')
original=work/'server.mjs'
text=original.read_text(encoding='utf8')
needle='const root = path.dirname(fileURLToPath(import.meta.url));'
assert text.count(needle)==1
text=text.replace(needle,'const root = '+json.dumps(str(work),ensure_ascii=False)+';')
needle="const publicRoot=path.join(root,'dist');"
assert text.count(needle)==1
text=text.replace(needle,'const publicRoot='+json.dumps(str(compiled),ensure_ascii=False)+';')
text=re.sub(r"from '(\./[^']+)'",lambda m:'from '+json.dumps((work/m[1]).resolve().as_uri(),ensure_ascii=False),text)
server=out/'server.mjs'
server.write_text(text,encoding='utf8')
binding=out/'binding.json'
binding.write_text(json.dumps(dict(verified=True,sourceFreeze=str(index),sourceFreezeSHA256=sha(index),frozenServer=str(server),frozenServerSHA256=sha(server),originalServerPath=str(original),originalServerSHA256=sha(original),compiledRoot=str(compiled),backendRoot=str(work),staticFiles=bundleRows,sourceSnapshots=rows,onlyWrapperChanges=['absolute captured imports','captured original backend root','immutable compiled static root'],fixtureResponseUsed=False),ensure_ascii=False,indent=2),encoding='utf8')
dataDir=root/'output/basic-saved-main-server-001-1012'
js=f'''import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
assert.equal(process.env.ZHEZHI_PORT,'8888');assert.equal(process.env.ZHEZHI_DATA_DIR,{json.dumps(dataDir.as_posix(),ensure_ascii=False)});
const binding=JSON.parse(fs.readFileSync({json.dumps(binding.as_posix(),ensure_ascii=False)},'utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(hash(binding.frozenServer),binding.frozenServerSHA256);assert.equal(hash(binding.originalServerPath),binding.originalServerSHA256);
for(const r of binding.staticFiles)assert.equal(hash(r.copy),r.sha256);for(const r of binding.sourceSnapshots)assert.equal(hash(r.snapshot),r.sha256);
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync('output/basic-saved-main-pid-001-1012.json',JSON.stringify({{pid:process.pid,port:8888,cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,startedAt:new Date().toISOString(),staticRoot:binding.compiledRoot,bindingSHA256:hash({json.dumps(binding.as_posix(),ensure_ascii=False)})}},null,2),{{flag:'wx'}});
await import({json.dumps(server.as_uri(),ensure_ascii=False)});
'''
(root/'scripts/start-basic-saved-main-001-1012.mjs').write_text(js,encoding='utf8')
ps=(root/'scripts/start-tube-strip-main-002-1012.ps1').read_text(encoding='utf-8-sig').replace('tube-strip-main','basic-saved-main').replace('002-1012','001-1012').replace("'8886'","'8888'")
(root/'scripts/start-basic-saved-main-001-1012.ps1').write_text(ps,encoding='utf-8-sig')
folder=root/'output/playwright/basic-saved-main-1012'
downloads=folder/'downloads-001'
assert not downloads.exists()
downloads.mkdir(parents=True)
config=json.loads((root/'output/playwright/tube-strip-main-1012/cli-config-002.json').read_text(encoding='utf8'))
config['outputDir']=str(folder/'cli-001')
(folder/'cli-config-001.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
candidate=folder/'basic-saved-main-001.browser.js'
subprocess.run(['python',str(root/'output/parallel/basic-saved-actual-reader-1012/prepare_browser.py'),'--output',str(downloads),'--bundle',bundle,'--origin','http://127.0.0.1:8888','--target',str(candidate),'--expected-browser-sha','ba48f1b347ca2845677e516451c59699c1138c793ce0b151234b8af18f1c7cd4'],check=True,capture_output=True,text=True,encoding='utf8')
helper=(root/'output/parallel/basic-saved-layout-tight-1012/sidebar-check.js').read_text(encoding='utf8')
script=candidate.read_text(encoding='utf8')
needle=' const layout=async name=>{'
assert script.count(needle)==1
script=script.replace(needle, helper+'\n'+needle+'const side=await d().evaluate(sidebarObservation);observations.push({name,sidebar:side});check(side.verified,name+\'侧栏全部控件与最后提示不越界或覆盖footer\',side);')
candidate.write_text(script,encoding='utf8')
print(json.dumps(dict(verified=True,sourceFiles=len(rows),bundle=bundle,sourceSHA256=sha(index),wrapperSHA256=sha(server),bindingSHA256=sha(binding),actualDirectory=downloads.as_posix()),ensure_ascii=False))
