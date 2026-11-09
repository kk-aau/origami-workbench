from pathlib import Path
import hashlib,json,shutil
root=Path.cwd().resolve();base=root/'output/parallel/nested-mother-six-peer-input-root-1011';assert not base.exists();base.mkdir(parents=True)
names=['src/app/nestedMotherParams.ts','src/components/NestedMotherEditorDialog.tsx','src/components/NestedMotherEditorDialog.css','src/components/TessellationPanel.tsx','src/components/PrimalDualSourceControls.tsx','src/components/FlagstoneSourceControls.tsx','src/components/WovenGraphCanvas.tsx','src/app/originalArraySource.ts','src/App.tsx','src/app/yoshimuraSixCP2507.ts','tests/app/nestedMotherParams.test.ts','tests/app/yoshimuraSixCP2507.test.ts'];rows=[]
for name in names:
 target=base/'snapshot'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
 digest=hashlib.sha256(target.read_bytes()).hexdigest();assert digest==hashlib.sha256((root/name).read_bytes()).hexdigest()
 rows.append({'path':target.relative_to(base).as_posix(),'sha256':digest,'rootTarget':name})
(base/'freeze.json').write_text(json.dumps({'verified':True,'producerRoot':str(base),'files':rows,'note':'readonly peer inputs, full root snapshot hashes; no production mutation'},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'files':len(rows),'freezeSHA256':hashlib.sha256((base/'freeze.json').read_bytes()).hexdigest()}))
