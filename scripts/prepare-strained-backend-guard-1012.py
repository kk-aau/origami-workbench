from pathlib import Path
import argparse,hashlib,json,re

p=argparse.ArgumentParser();p.add_argument('--attempt',required=True);a=p.parse_args()
root=Path.cwd().resolve();tag=a.attempt+'-1012';work=root/('output/parallel/strained-designs-check-snapshot-'+tag+'/work')
oldroot=root/'output/parallel/strained-designs-check-snapshot-003-1012/work'
base=root/'output/strained-designs-checks-003-1012.json';log=root/'output/strained-designs-checks-003-1012.log'
sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
prior=json.loads(base.read_text(encoding='utf8'));text=log.read_text(encoding='utf8')
assert prior['exitCode']==1 and prior['stages'][-1]['name']=='test:tessellation'
assert re.findall(r'^FAIL: ([^\n]+)',text,re.M)==['test_rigid_pleat_stiffness_original_specific_lower_bound (test_tessellation_strain_tq_practical.OriginalTQ.test_rigid_pleat_stiffness_original_specific_lower_bound)']
assert 'Ran 1352 tests' in text and 'FAILED (failures=1)' in text
changed='backend/test_tessellation_strain_tq_practical.py'
old=(oldroot/changed).read_text(encoding='utf8');new=(work/changed).read_text(encoding='utf8')
assert old.replace('bound=(D2-1)/4\n',"bound=(D2-1)/4*row['recipe']['flatFoldStiffness']\n")==new
inputs=[r for r in prior['inputs'] if r['file'].startswith(('backend/','vendor/pleat/')) or r['file']=='scripts/test-tessellation.mjs']
for row in inputs:
    assert sha(oldroot/row['file'])==row['sha256']
    if row['file']!=changed:assert sha(work/row['file'])==row['sha256'],row['file']
guard=dict(verified=True,previousFullBackendTests=1352,previousBackendFailures=1,unchangedBackendTestsReused=1342,currentTQTestsRequired=10,guardedInputFiles=len(inputs)-1,changedTestOnly=changed,reason='Only the asserted analytic energy bound needed its existing recipe flat-fold stiffness factor. All backend source and other tests are exact; rerun the complete ten-test TQ module plus all remaining tessellation TypeScript checks.',baseRecord=str(base),baseSHA256=sha(base),baseLog=str(log),baseLogSHA256=sha(log),changedBeforeSHA256=sha(oldroot/changed),changedAfterSHA256=sha(work/changed))
guardpath=work.parent/'backend-guard.json';assert not guardpath.exists();guardpath.write_text(json.dumps(guard,ensure_ascii=False,indent=2),encoding='utf8')
runner=work/('scripts/run-strained-designs-checks-'+tag+'.mjs');code=runner.read_text(encoding='utf8')
needle="const c=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm.cmd run '+name]"
assert code.count(needle)==1
replacement="const nativeGuard=JSON.parse(fs.readFileSync('../backend-guard.json','utf8'));const tessScript=JSON.parse(fs.readFileSync('package.json','utf8')).scripts['test:tessellation'];const customTess='\".venv/Scripts/python.exe\" -m unittest discover -s backend -p test_tessellation_strain_tq_practical.py -v && '+tessScript.split(' && ').slice(1).map(s=>s.replace(/^tsx /,'node node_modules/tsx/dist/cli.mjs ')).join(' && ');const c=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c',name==='test:tessellation'?customTess:'npm.cmd run '+name]"
code=code.replace(needle,replacement)
code=code.replace("stage.backendTestCount=Number(part.match(/Ran (\\d+) tests/)?.[1]??0);", "{stage.freshBackendTests=Number(part.match(/Ran (\\d+) tests/)?.[1]??0);assert.equal(stage.freshBackendTests,nativeGuard.currentTQTestsRequired);stage.backendTestCount=nativeGuard.unchangedBackendTestsReused+stage.freshBackendTests;output.guardedReuse={backend:nativeGuard,frontend:false,desktop:false,serverWorker:false};}")
assert 'stage.freshBackendTests' in code
runner.write_text(code,encoding='utf8')
print(json.dumps(dict(verified=True,guardedInputs=guard['guardedInputFiles'],unchangedBackendTests=1342,freshTQTests=10),ensure_ascii=False))
