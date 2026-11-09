from pathlib import Path
import argparse, hashlib, json, re, shutil

parser=argparse.ArgumentParser()
parser.add_argument('--attempt',required=True)
args=parser.parse_args()
root=Path.cwd().resolve()
tag=args.attempt+'-1012'
record=root/('output/strained-designs-checks-'+tag+'.json')
log=root/('output/strained-designs-checks-'+tag+'.log')
data=json.loads(record.read_text(encoding='utf8'))
assert data['exitCode']==0 and data['inputsUnchanged']
backup=record.with_suffix('.runner-raw.json')
assert not backup.exists()
shutil.copy2(record,backup)
text=log.read_text(encoding='utf8')
parts=re.split(r'\n=== ([a-z0-9:-]+) ===\n',text)
sections=dict(zip(parts[1::2],parts[2::2]))
for stage in data['stages']:
    assert stage['exitCode']==0
    part=sections[stage['name']]
    count=re.search(r'(?:ℹ|#) pass (\d+)',part)
    if count:stage['testCount']=int(count[1])
    if stage['name']=='test:tessellation':
        stage['backendTestCount']=int(re.search(r'Ran (\d+) tests',part)[1])
        assert re.search(r'\nOK\s',part)
    if stage['name']=='build':stage['buildModules']=int(re.search(r'(\d+) modules transformed',part)[1])
byname={s['name']:s for s in data['stages']}
data['tests']=dict(frontend=byname['test:unit']['testCount'],desktop=byname['test:desktop']['testCount'],backend=byname['test:tessellation']['backendTestCount'],serverWorker=byname['test:server']['testCount'],buildModules=byname['build']['buildModules'])
assert data['tests']['frontend']>=3645 and data['tests']['desktop']==7 and data['tests']['backend']>=1352 and data['tests']['serverWorker']>=68
data['countsVerifiedFromCompleteUTF8Sections']=True
data['rawRunnerRecord']=str(backup)
data['rawRunnerSHA256']=hashlib.sha256(backup.read_bytes()).hexdigest()
data['logSHA256']=hashlib.sha256(log.read_bytes()).hexdigest()
data['countCorrectionReason']='The runner used a byte offset as a Unicode string index for stage counts. Full log sections independently establish counts; stage processes, exit codes and unchanged source inputs are retained.'
record.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,tests=data['tests']),ensure_ascii=False))
