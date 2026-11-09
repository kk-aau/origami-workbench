from pathlib import Path
import hashlib,json,shutil

root=Path.cwd().resolve();work=root/'output/parallel/strained-designs-check-snapshot-004-1012/work'
prior=root/'output/strained-designs-checks-004-1012.json';data=json.loads(prior.read_text(encoding='utf8'))
assert data['exitCode']==1 and [r['exitCode'] for r in data['stages'][:2]]==[0,0] and data['stages'][2]['freshBackendTests']==0
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for r in data['inputs']:assert sha(work/r['file'])==r['sha256'],r['file']
shutil.copy2(root/'scripts/run-strained-tq-regressions.mjs',work/'scripts/run-strained-tq-regressions.mjs')
code=(work/'scripts/run-strained-designs-checks-004-1012.mjs').read_text(encoding='utf8')
code=code.replace("'../../../strained-designs-checks-004-1012.json'","'../../../strained-designs-checks-004-rest-1012.json'").replace("'../../../strained-designs-checks-004-1012.log'","'../../../strained-designs-checks-004-rest-1012.log'")
needle="try{for(const name of ['test:unit','test:desktop',"
assert code.count(needle)==1
code=code.replace(needle,"const priorRecord=JSON.parse(fs.readFileSync('../../../strained-designs-checks-004-1012.json','utf8'));assert.equal(priorRecord.stages[0].exitCode,0);assert.equal(priorRecord.stages[1].exitCode,0);output.stages=priorRecord.stages.slice(0,2);output.priorRecordSHA256=hash('../../../strained-designs-checks-004-1012.json');output.note='Resume after test harness executable quoting failed before any backend test. Same exact captured inputs; preserve passed unit/desktop and run all remaining checks.';save();try{for(const name of [")
needle="'\".venv/Scripts/python.exe\" -m unittest discover -s backend -p test_tessellation_strain_tq_practical.py -v && '"
assert code.count(needle)==1
code=code.replace(needle,"'node scripts/run-strained-tq-regressions.mjs && '")
code=code.replace('frontend:false,desktop:false,serverWorker:false','frontend:true,desktop:true,serverWorker:false')
dest=work/'scripts/run-strained-designs-rest-004-1012.mjs';assert not dest.exists();dest.write_text(code,encoding='utf8')
print(json.dumps(dict(verified=True,unchangedInputs=len(data['inputs']),frontend=data['stages'][0]['testCount'],desktop=data['stages'][1]['testCount']),ensure_ascii=False))
