from pathlib import Path
import argparse, hashlib, json, shutil, re

parser = argparse.ArgumentParser()
parser.add_argument('--attempt', default='001')
parser.add_argument('--check-record')
args = parser.parse_args()
root = Path.cwd().resolve()
tag = args.attempt + '-1012'
work = root / ('output/parallel/strained-designs-check-snapshot-' + tag + '/work')
check = root / (args.check_record or ('output/strained-designs-checks-' + tag + '.json'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
data = json.loads(check.read_text(encoding='utf8'))
assert data['exitCode'] == 0 and data['inputsUnchanged']
out = root / ('output/parallel/strained-designs-main-root-' + tag)
assert not out.exists()
out.mkdir(parents=True)
rows = []
for row in data['inputs']:
    assert sha(work / row['file']) == row['sha256'], row['file']
    dest = out / 'source-snapshot' / row['file']
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(work / row['file'], dest)
    rows.append(dict(path=row['file'], sha256=row['sha256'], snapshot=str(dest)))
compiled = root / ('output/strained-designs-compiled-' + tag)
assert not compiled.exists()
compiled.mkdir()
bundle_rows = []
for p in sorted((work / 'dist').rglob('*')):
    if p.is_file():
        dest = compiled / p.relative_to(work / 'dist')
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)
        assert sha(dest) == sha(p)
        bundle_rows.append(dict(path=p.relative_to(work).as_posix(), copy=str(dest), sha256=sha(dest)))
bundle = re.search(r'src="([^"]+\.js)"', (compiled/'index.html').read_text(encoding='utf8'))[1]
index = out / 'ROOT-SOURCE-FROZEN.json'
index.write_text(json.dumps(dict(verified=True, files=rows, bundle=bundle, checks=str(check), checksSHA256=sha(check), compiledBundleCopies=bundle_rows, scope='P77 rotational pleats and P78 original TQ practical design; complete fixed source', physicalValidation=False), ensure_ascii=False, indent=2), encoding='utf8')
original = work / 'server.mjs'
text = original.read_text(encoding='utf8')
needle = 'const root = path.dirname(fileURLToPath(import.meta.url));'
assert text.count(needle) == 1
text = text.replace(needle, 'const root = ' + json.dumps(str(work), ensure_ascii=False) + ';')
needle = "const publicRoot=path.join(root,'dist');"
assert text.count(needle) == 1
text = text.replace(needle, 'const publicRoot=' + json.dumps(str(compiled), ensure_ascii=False) + ';')
text = re.sub(r"from '(\./[^']+)'", lambda m: 'from ' + json.dumps((work/m[1]).resolve().as_uri(), ensure_ascii=False), text)
server = out / 'server.mjs'
server.write_text(text, encoding='utf8')
binding = out / 'binding.json'
binding.write_text(json.dumps(dict(verified=True, sourceFreeze=str(index), sourceFreezeSHA256=sha(index), frozenServer=str(server), frozenServerSHA256=sha(server), originalServerPath=str(original), originalServerSHA256=sha(original), compiledRoot=str(compiled), backendRoot=str(work), workingInputs=[dict(path=str(work/r['file']), sha256=r['sha256']) for r in data['inputs']], staticFiles=bundle_rows, sourceSnapshots=rows, onlyWrapperChanges=['absolute captured imports','captured original backend root','immutable compiled static root'], fixtureResponseUsed=False), ensure_ascii=False, indent=2), encoding='utf8')
meta = dict(verified=True, sourceFiles=len(rows), bundle=bundle, sourceFreeze=str(index), sourceSHA256=sha(index), server=str(server), wrapperSHA256=sha(server), binding=str(binding), bindingSHA256=sha(binding), runs=[])
for kind, port, template in [('rotational-pleats',8889,root/'scripts/rotational-pleats-main.browser.js'),('strain-tq',8890,root/'output/parallel/strain-tq-actual-reader-1012/browser-candidate/strain-tq-main.browser.js')]:
    data_dir = root / ('output/' + kind + '-main-server-' + tag)
    folder = root / ('output/playwright/' + kind + '-main-1012')
    downloads = folder / ('downloads-' + args.attempt)
    assert not downloads.exists()
    downloads.mkdir(parents=True)
    script = template.read_text(encoding='utf8')
    if kind == 'strain-tq':
        assert sha(template) == '8fe2f73bd3eefa40b8ad16d9a09b3e23782657292e053fd1485df978b31109a0'
        needle = "field('TQ 平面约束索引').selectOption('1')"
        assert script.count(needle) == 1
        script = script.replace(needle, "field('TQ 平面约束索引').selectOption({value:'1'})")
        needle = "else for(const i of [2,3]){await point(i);await fill('TQ 点目标 Z / mm',Number(await field('TQ 点目标 Z / mm').inputValue())+10);}"
        assert script.count(needle) == 1
        script = script.replace(needle, "else for(const i of [2,3]){await point(i);await field('TQ 点目标 Z / mm').fill(String(Number(await field('TQ 点目标 Z / mm').inputValue())+10));}")
        needle = "check(await d().locator('.tqd-scope').innerText().then(t=>t.includes('θ₂')&&t.includes('未参与')),'原unused第二角明确');"
        assert script.count(needle) == 1
        script = script.replace(needle, needle + "const sourceBefore=await key();await field('TQ 水雷开合角 / °滑条').focus();await field('TQ 水雷开合角 / °滑条').press('ArrowRight');await ready();check(await key()!==sourceBefore,'实际开合滑条改源');await field('TQ 水雷开合角 / °滑条').press('ArrowLeft');await ready();check(await key()===sourceBefore,'实际开合滑条还原当前源');")
        needle = "await layout('TQ-'+size.width+'-'+t);}await close();}"
        assert script.count(needle) == 1
        script = script.replace(needle, "await layout('TQ-'+size.width+'-'+t);}await selectModel('waterbomb-base');await tab('能量与分面');await layout('TQ-'+size.width+'-水雷双角最大控件');await close();}")
    else:
        needle = 'const layout=async name=>{'
        assert script.count(needle) == 1
        script = script.replace(needle, needle+"await page.waitForFunction(()=>[...document.querySelectorAll('.rpl-dialog[open] .rpl-plots svg[data-coordinate-unit=mm]')].every(s=>{const m=s.getScreenCTM();return m&&[...s.querySelectorAll('.sgm-ticks text')].every(t=>Number(t.getAttribute('font-size')??t.parentElement.getAttribute('font-size'))*Math.hypot(m.a,m.b)>=12);}),{},{timeout:5000});")
    script = script.replace('__OUTPUT__', downloads.as_posix()).replace('__BUNDLE__', bundle).replace('__ORIGIN__', 'http://127.0.0.1:' + str(port))
    candidate = folder / (kind + '-main-' + args.attempt + '.browser.js')
    assert not candidate.exists()
    candidate.write_text(script, encoding='utf8')
    config = json.loads((root/'output/playwright/basic-saved-main-1012/cli-config-001.json').read_text(encoding='utf8'))
    config['outputDir'] = str(folder / ('cli-' + args.attempt))
    (folder / ('cli-config-' + args.attempt + '.json')).write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf8')
    js = '''import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const binding=JSON.parse(fs.readFileSync(BINDING,'utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
assert.equal(process.env.ZHEZHI_PORT,PORT);assert.equal(process.env.ZHEZHI_DATA_DIR,DATA);
assert.equal(hash(binding.frozenServer),binding.frozenServerSHA256);assert.equal(hash(binding.originalServerPath),binding.originalServerSHA256);
for(const r of binding.staticFiles)assert.equal(hash(r.copy),r.sha256);for(const r of binding.sourceSnapshots)assert.equal(hash(r.snapshot),r.sha256);
for(const r of binding.workingInputs)assert.equal(hash(r.path),r.sha256,r.path);
process.env.PYTHONDONTWRITEBYTECODE='1';process.env.OPENBLAS_NUM_THREADS='1';process.env.OMP_NUM_THREADS='1';
fs.writeFileSync(PIDFILE,JSON.stringify({pid:process.pid,port:Number(PORT),cwd:process.cwd(),data:process.env.ZHEZHI_DATA_DIR,startedAt:new Date().toISOString(),staticRoot:binding.compiledRoot,bindingSHA256:hash(BINDING)},null,2),{flag:'wx'});
await import(SERVER);
'''
    substitutions = {'BINDING':str(binding),'PORT':str(port),'DATA':data_dir.as_posix(),'PIDFILE':'output/'+kind+'-main-pid-'+tag+'.json','SERVER':server.as_uri()}
    js = re.sub(r'\b(BINDING|PORT|DATA|PIDFILE|SERVER)\b', lambda m: json.dumps(substitutions[m[1]],ensure_ascii=False), js)
    startup = root / ('scripts/start-' + kind + '-main-' + tag + '.mjs')
    startup.write_text(js, encoding='utf8')
    ps = "$ErrorActionPreference = 'Stop'\n$env:ZHEZHI_PORT = '"+str(port)+"'\n$env:ZHEZHI_DATA_DIR = '"+data_dir.as_posix()+"'\n$ownServer = Start-Process -FilePath 'D:/Program Files/nodejs/node.exe' -ArgumentList @('scripts/"+startup.name+"') -WorkingDirectory '"+root.as_posix()+"' -WindowStyle Hidden -RedirectStandardOutput '"+data_dir.as_posix()+".log' -RedirectStandardError '"+data_dir.as_posix()+".err.log' -PassThru\n$ownServer.Id\n"
    startup.with_suffix('.ps1').write_text(ps, encoding='utf-8-sig')
    meta['runs'].append(dict(kind=kind, port=port, dataDirectory=str(data_dir), downloads=str(downloads), candidate=str(candidate), candidateSHA256=sha(candidate), startup=str(startup), config=str(folder/('cli-config-'+args.attempt+'.json'))))
(out/'runtime.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(meta, ensure_ascii=False))
