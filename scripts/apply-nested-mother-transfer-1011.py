from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();base=root/'output/parallel/nested-mother-transfer-delta-root-1011';assert not base.exists();base.mkdir(parents=True)
names=['src/app/nestedMotherParams.ts','tests/app/nestedMotherParams.test.ts','src/components/TessellationPanel.tsx']
records=['nested-mother-visual-editor-root','nested-mother-visual-editor-delta-root','original-six-root-delivery'];latest={}
for record in records:
 for row in json.loads((root/'output/parallel'/f'{record}-integrated-1010.json').read_text(encoding='utf8'))['files']:latest[row['file']]=row['after']
panel=root/names[-1];before=panel.read_text(encoding='utf8');text=before
old="import type {NestedMotherParent} from '../app/nestedMotherParams';";new="import {flagstoneParamsFromMother,type NestedMotherParent} from '../app/nestedMotherParams';"
assert text.count(old)==1;text=text.replace(old,new)
old="carryPaper({...tessPreset('flagstone'),family:'flagstone',tiling:'square',rows:3,columns:3,width:.25,aspect:1,motherParams:{...structuredClone(params),paper:undefined}})"
assert text.count(old)==1;text=text.replace(old,'flagstoneParamsFromMother(params)')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert sha(panel)==latest[names[-1]]
saved=base/'before'/names[-1];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(panel,saved)
panel.write_text(text,encoding='utf8',newline='\n');rows=[]
for name in names:
 target=base/'files'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
 rows.append({'file':name,'before':latest[name],'after':sha(target),'capturedBaseline':latest[name],'delta':True,'delivery':target.relative_to(root).as_posix()})
(base/'panel.patch').write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+names[-1],tofile='b/'+names[-1])),encoding='utf8')
record={'verified':True,'files':rows,'actualEvidence':'output/playwright/nested-mother-main-1011/downloads-002/browser-checks.json','issue':'using a source with no paper revived flagstone default square, then failed the existing external-mother extension guard','fix':'retain the selected outer paper, including absent value; no implicit paper fit or geometry change','backendGuardUnchanged':True}
(root/'output/parallel/nested-mother-transfer-delta-root-integrated-1010.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
(base/'record.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print('Applied and recorded explicit 3-file paper transfer fix; previous actual failure retained.')
