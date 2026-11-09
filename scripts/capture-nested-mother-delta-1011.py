from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();base=root/'output/parallel/nested-mother-visual-editor-root-1011'
original=json.loads((base/'manifest.json').read_text(encoding='utf8'));out=root/'output/parallel/nested-mother-visual-editor-delta-root-1011'
assert not out.exists();out.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[];patch=''
for name in ['src/components/NestedMotherEditorDialog.tsx','tests/app/nestedMotherParams.test.ts']:
 before=next(r for r in original['files'] if r['target']==name);saved=out/'files'/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,saved)
 text=Path(before['source']).read_text(encoding='utf8');actual=saved.read_text(encoding='utf8')
 patch+=''.join(difflib.unified_diff(text.splitlines(keepends=True),actual.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name))
 rows.append({'file':name,'before':before['sha256'],'after':sha(saved),'capturedBaseline':before['sha256'],'alreadyIntegratedExact':False,'delta':True,'delivery':saved.relative_to(root).as_posix()})
(out/'delta.patch').write_text(patch,encoding='utf8',newline='\n')
record={'verified':True,'files':rows,'initialFailure':{'checks':6,'passed':5,'failed':1,'failure':'initial fixture declared tile-twists without required tileTwists; existing reader correctly rejected it','productionGuardChanged':False,'initialFixturePreserved':next(r['source'] for r in original['files'] if r['target']=='tests/app/nestedMotherParams.test.ts')},'uiDelta':'incomplete or invalid numeric draft cannot apply stale last-valid parameters','rerunFocusedPassed':6,'typeCheckPassed':True}
(out/'record.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
(root/'output/parallel/nested-mother-visual-editor-delta-root-integrated-1010.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print('Recorded two explicit deltas; original 8-file candidate and invalid initial fixture preserved.')
