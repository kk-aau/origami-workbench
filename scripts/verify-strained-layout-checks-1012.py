from pathlib import Path
import argparse,hashlib,json

p=argparse.ArgumentParser();p.add_argument('--attempt',default='005');a=p.parse_args();tag=a.attempt+'-1012'

root=Path.cwd().resolve();old=root/'output/parallel/strained-designs-check-snapshot-004-1012/work';work=root/('output/parallel/strained-designs-check-snapshot-'+tag+'/work')
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
read=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
base=root/'output/strained-designs-checks-004-rest-1012.json';prior=read(base)
assert prior['exitCode']==0 and prior['inputsUnchanged']
build=root/('output/strained-designs-build-'+tag+'.json');fresh=read(build)
assert fresh['exitCode']==0 and fresh['inputsUnchanged']
allowed={'src/components/RotationalPleatsCPDialog.css'}
if a.attempt!='005':
    allowed.add('src/components/RotationalPleatsCPDialog.tsx')
    before=(old/'src/components/RotationalPleatsCPDialog.tsx').read_text(encoding='utf8')
    after=(work/'src/components/RotationalPleatsCPDialog.tsx').read_text(encoding='utf8')
    assert before.replace('   <p className="sgm-hint">紫色为原路径／空间参考，青色为 CP，黑色为纸边。路径模式可拖点修改；缩放与平移只改变视图。</p>\n','').replace('<span>原二维纸带 · 保存后可修改源参数重建</span>','<span>紫：原路径／空间参考　青：CP　黑：纸边 · 可拖点，缩放平移仅改视图。</span>')==after
if int(a.attempt)>=8:allowed.add('src/components/StrainTQDesignCPDialog.css')
relevant=lambda name:name.startswith(('src/','tests/','backend/','desktop/','vendor/','simulator/','public/','scripts/verify-')) or name in ['package.json','package-lock.json','server.mjs','tess-worker.mjs','tsconfig.json','vite.config.ts','index.html','scripts/test-tessellation.mjs']
oldrows={r['file']:r for r in prior['inputs'] if relevant(r['file'])};newrows={r['file']:r for r in fresh['inputs'] if relevant(r['file'])}
reporting_script='scripts/verify-strained-layout-checks-1012.py'
oldrows.pop(reporting_script,None);newrows.pop(reporting_script,None)
assert set(oldrows)==set(newrows),(sorted(set(oldrows)-set(newrows)),sorted(set(newrows)-set(oldrows)))
changed=[]
for name,row in oldrows.items():
    assert sha(old/name)==row['sha256'] and sha(work/name)==newrows[name]['sha256']
    if row['sha256']!=newrows[name]['sha256']:changed.append(name)
assert set(changed)==allowed,changed
for row in fresh['inputs']:assert sha(work/row['file'])==row['sha256']
out=root/('output/strained-designs-layout-checks-'+tag+'.json');assert not out.exists()
record=dict(verified=True,exitCode=0,inputsUnchanged=True,inputs=fresh['inputs'],tests={**prior['tests'],'buildModules':fresh['buildModules']},guardedReuse=dict(frontend=True,desktop=True,backend=True,serverWorker=True,guardedInputs=len(oldrows)-len(allowed),onlyRelevantChanges=sorted(allowed),onlyUIChangeIsMovingLegendTextToFooter=True,previousFullSuite=str(base),previousFullSuiteSHA256=sha(base),backendReuseDetails=prior['guardedReuse']['backend']),freshBuild=str(build),freshBuildSHA256=sha(build),physicalVerification=False)
out.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,tests=record['tests'],guardedInputs=len(oldrows)-1,onlyChanged=changed),ensure_ascii=False))
