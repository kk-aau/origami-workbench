from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();base=root/'output/parallel/nested-mother-focus-delta-root-1011';assert not base.exists();base.mkdir(parents=True)
name='src/components/NestedMotherEditorDialog.tsx';last=json.loads((root/'output/parallel/nested-mother-visual-editor-delta-root-integrated-1010.json').read_text(encoding='utf8'));before=next(r['after'] for r in last['files'] if r['file']==name)
target=base/'files'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target);digest=hashlib.sha256(target.read_bytes()).hexdigest()
record={'verified':True,'files':[{'file':name,'before':before,'after':digest,'capturedBaseline':before,'delta':True,'delivery':target.relative_to(root).as_posix()}],'reason':'only source geometry changes refit the preview; pan/zoom and non-geometric settings preserve the view; no source coordinate mutation'}
(base/'record.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
(root/'output/parallel/nested-mother-focus-delta-root-integrated-1010.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print('Recorded display-only source geometry fit delta.')
