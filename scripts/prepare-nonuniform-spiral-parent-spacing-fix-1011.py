from pathlib import Path
import difflib
import hashlib
import json
import re
import shutil

root=Path.cwd().resolve()
base=root/'output/parallel/original-nonuniform-spiral-parent-spacing-fix-1011'
assert not base.exists()
base.mkdir(parents=True)
sha=lambda data:hashlib.sha256(data).hexdigest()
name='src/components/NonuniformSpiralCP3968Dialog.css'
before=(root/name).read_bytes()
assert sha(before)=='1af8b73ad04d2edc2cfa6bad2b354b365ad142f28531bf01f175de273dd550e9'
text=before.decode('utf8')

def edit(old,new,count=1):
    global text
    assert text.count(old)==count,(old,text.count(old))
    text=text.replace(old,new)

edit('padding:12px;display:flex;flex-direction:column;gap:5px','padding:10px;display:flex;flex-direction:column;gap:3px')
edit('.spiral3968-fields{display:grid;gap:5px;margin:4px 0}', '.spiral3968-fields{display:grid;gap:3px;margin:2px 0}')
edit('.spiral3968-field{display:flex;flex-direction:column;gap:4px;font-size:13px;',
     '.spiral3968-field{display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:1.5;margin:0;')
edit('gap:3px;padding:8px;background:var(--paper', 'gap:3px;padding:6px;background:var(--paper')
edit('.spiral3968-results{min-width:0;', '.spiral3968-results{padding:0!important;margin:0;border:0;min-width:0;')
# Keep the original local declarations authoritative under both App and Tess parents.
def scope(match):
    selectors=match.group(3).split(',')
    return match.group(1)+match.group(2)+','.join('.tess-dialog '+s for s in selectors)
text=re.sub(r'(^|[{},])(\s*)(\.spiral3968-[^{}]*)(?=\{)',scope,text)
after=text.encode('utf8')
target=base/'files'/name
target.parent.mkdir(parents=True,exist_ok=True)
target.write_bytes(after)
patch=base/'parent-spacing.patch'
patch.write_bytes(''.join(difflib.unified_diff(before.decode('utf8').splitlines(True),text.splitlines(True),fromfile='a/'+name,tofile='b/'+name)).encode('utf8'))
manifest=base/'manifest.json'
manifest.write_text(json.dumps(dict(files=[dict(target=name,baselineSha256=sha(before),sha256=sha(after),source=str(target),kind='modified')],
 patchSha256=sha(patch.read_bytes()),scope='Local CSS spacing and specificity only: preserve readable fonts, 30px controls, 680px dialog and 420px plot. Reset this result section against inherited important padding; no data, source JSX, geometry, source guard, metadata or export change.',
 actualAppBefore=dict(workspaceHeight=539,workspaceScroll=589,controlsHeight=589.15625,footerMarginTop=12),
 liveCandidateOnly=dict(workspaceHeight=551,workspaceScroll=551,controlsHeight=547.15625,certifiedFinal=False),productionWritten=False),ensure_ascii=False,indent=2),encoding='utf8')
files=[target,patch,manifest]
(base/'freeze.json').write_text(json.dumps(dict(verified=True,files=[dict(path=p.relative_to(base).as_posix(),sha256=sha(p.read_bytes())) for p in files]),ensure_ascii=False,indent=2),encoding='utf8')
bundle=json.loads((root/'output/original-nonuniform-spiral-final-bundle-1011.json').read_text(encoding='utf8'))
backup=root/'output/original-nonuniform-spiral-before-parent-fix-1011'
assert not backup.exists()
for row in bundle['files']:
    p=root/row['file']
    assert sha(p.read_bytes())==row['sha256']
    saved=backup/row['file']
    saved.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(p,saved)
print(json.dumps(dict(prepared=True,targets=1,files=3,freezeSha256=sha((base/'freeze.json').read_bytes()),preservedOldAssets=len(bundle['files']))))
