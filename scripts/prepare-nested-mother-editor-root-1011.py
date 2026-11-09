from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve()
folder=root/'output/parallel/nested-mother-visual-editor-root-1011'
assert not folder.exists()
folder.mkdir(parents=True)
old=json.loads((root/'output/audits/original-arrays-final-1011.json').read_text(encoding='utf8'))
assert old['verified'] and len(old['snapshots'])==2273
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for row in old['snapshots']:
 assert sha(root/old['archive']/row['file'])==row['sha256'],row['file']
targets=['src/components/TessellationPanel.tsx','src/components/PrimalDualSourceControls.tsx','src/components/FlagstoneSourceControls.tsx','src/components/WovenGraphCanvas.tsx']
baseline={r['file']:r['sha256'] for r in old['snapshots']}
rows=[]
for name in targets:
 source=root/name
 assert sha(source)==baseline[name],name
 saved=folder/'before'/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,saved)
 target=folder/'files'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
 rows.append({'file':name,'before':baseline[name]})
(folder/'baseline.json').write_text(json.dumps({'verified':True,'previous':'output/audits/original-arrays-final-1011.json','previousSnapshots':2273,'files':rows},ensure_ascii=False,indent=2),encoding='utf8')
print('Verified P68 archive and copied four exact baselines; production unchanged.')
