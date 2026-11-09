from pathlib import Path
import difflib
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-nonuniform-helix-general-root-wiring-1011'
assert not base.exists()
base.mkdir()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
previous = json.loads((root / 'output/audits/original-uniform-helix-general-final-1011.json').read_text(encoding='utf-8'))
expected = {r['file']: r['sha256'] for r in previous['snapshots']}
def add(text, anchor, value, count=1):
    assert text.count(anchor) == count, (anchor, text.count(anchor))
    return text.replace(anchor, anchor + value)
def change(text, old, new):
    assert text.count(old) == 1, (old, text.count(old))
    return text.replace(old, new)
rows = []
patches = []
for name in ['src/App.tsx', 'src/components/TessellationPanel.tsx']:
    p = root / name
    assert sha(p) == expected[name], name
    old = p.read_text(encoding='utf-8')
    text = old
    if name == 'src/App.tsx':
        text = add(text, "import {uniformHelixGeneralCP3951SourceMatches,readUniformHelixGeneralCP3951Recipe} from './app/uniformHelixGeneralCP3951';",
                   "\nimport NonuniformHelixGeneralCP3966Dialog from './components/NonuniformHelixGeneralCP3966Dialog';\nimport {nonuniformHelixGeneralCP3966SourceMatches,readNonuniformHelixGeneralCP3966Recipe} from './app/nonuniformHelixGeneralCP3966';")
        text = add(text, '  const uniformHelixGeneral3951Recipe=useMemo(()=>readUniformHelixGeneralCP3951Recipe(doc),[doc]),[uniformHelixGeneral3951Edit,setUniformHelixGeneral3951Edit]=useState(false);',
                   '\n  const nonuniformHelixGeneral3966Recipe=useMemo(()=>readNonuniformHelixGeneralCP3966Recipe(doc),[doc]),[nonuniformHelixGeneral3966Edit,setNonuniformHelixGeneral3966Edit]=useState(false);')
        text = change(text, '  function adoptWovenCP()',
            "  function adoptNonuniformHelixGeneral3966CP(next:Doc){try{if(!nonuniformHelixGeneralCP3966SourceMatches(next))throw Error('原任意折角螺旋参数、解析源、纸域或材料身份不一致，未采用。');\n"
            "    if(!approveReplace())return false;const regenerating=nonuniformHelixGeneral3966Edit&&!!readNonuniformHelixGeneralCP3966Recipe(docRef.current);\n"
            "    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n"
            "    setNonuniformHelixGeneral3966Edit(false);inform('已采用原任意折角螺旋 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}\n  function adoptWovenCP()")
        text = add(text, '          {uniformHelixGeneral3951Recipe&&<button onClick={()=>setUniformHelixGeneral3951Edit(true)}>修改原通用均匀螺旋纸面参数</button>}',
                   '\n          {nonuniformHelixGeneral3966Recipe&&<button onClick={()=>setNonuniformHelixGeneral3966Edit(true)}>修改原任意折角函数纸面参数</button>}')
        text = add(text, 'onAdoptUniformHelixGeneral3951CP={adoptUniformHelixGeneral3951CP}', ' onAdoptNonuniformHelixGeneral3966CP={adoptNonuniformHelixGeneral3966CP}')
        text = add(text, '    {uniformHelixGeneral3951Edit&&uniformHelixGeneral3951Recipe&&<UniformHelixGeneralCP3951Dialog initial={uniformHelixGeneral3951Recipe} onAdoptCP={adoptUniformHelixGeneral3951CP} onClose={()=>setUniformHelixGeneral3951Edit(false)}/>}',
                   '\n    {nonuniformHelixGeneral3966Edit&&nonuniformHelixGeneral3966Recipe&&<NonuniformHelixGeneralCP3966Dialog initial={nonuniformHelixGeneral3966Recipe} onAdoptCP={adoptNonuniformHelixGeneral3966CP} onClose={()=>setNonuniformHelixGeneral3966Edit(false)}/>}')
    else:
        text = add(text, "import UniformHelixGeneralCP3951Dialog from './UniformHelixGeneralCP3951Dialog';", "\nimport NonuniformHelixGeneralCP3966Dialog from './NonuniformHelixGeneralCP3966Dialog';")
        text = change(text, 'onAdoptSpiralRefold3980CP,onAdoptUniformHelixGeneral3951CP}', 'onAdoptSpiralRefold3980CP,onAdoptUniformHelixGeneral3951CP,onAdoptNonuniformHelixGeneral3966CP}')
        text = change(text, 'onAdoptUniformHelixGeneral3951CP?:(doc:Doc)=>boolean}', 'onAdoptUniformHelixGeneral3951CP?:(doc:Doc)=>boolean;onAdoptNonuniformHelixGeneral3966CP?:(doc:Doc)=>boolean}')
        text = add(text, "|'uniform-helix-general-cp-3951'", "|'nonuniform-helix-general-cp-3966'")
        text = add(text, "event.target.value==='uniform-helix-general-cp-3951'?setDialog('uniform-helix-general-cp-3951'):", "event.target.value==='nonuniform-helix-general-cp-3966'?setDialog('nonuniform-helix-general-cp-3966'):", 2)
        text = add(text, '<option value="uniform-helix-general-cp-3951">原通用均匀螺旋 CP · In[3951]</option>', '<option value="nonuniform-helix-general-cp-3966">原任意折角螺旋 CP · In[3966]</option>', 2)
        text = add(text, "    {dialog==='uniform-helix-general-cp-3951'&&<UniformHelixGeneralCP3951Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptUniformHelixGeneral3951CP}/>}",
                   "\n    {dialog==='nonuniform-helix-general-cp-3966'&&<NonuniformHelixGeneralCP3966Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptNonuniformHelixGeneral3966CP}/>}")
    saved = base / 'files' / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    saved.write_text(text, encoding='utf-8')
    rows.append(dict(target=name, baselineSha256=sha(p), sha256=sha(saved), source=str(saved), kind='modified'))
    patches.extend(difflib.unified_diff(old.splitlines(True), text.splitlines(True), fromfile='a/' + name, tofile='b/' + name))
patch = base / 'root-wiring.patch'
patch.write_text(''.join(patches), encoding='utf-8', newline='\n')
manifest = base / 'manifest.json'
manifest.write_text(json.dumps(dict(files=rows, patchSha256=sha(patch), productionWritten=False), ensure_ascii=False, indent=2), encoding='utf-8')
files = [base / 'files' / row['target'] for row in rows] + [patch, manifest]
(base / 'freeze.json').write_text(json.dumps(dict(verified=True, files=[dict(file=f.relative_to(root).as_posix(), sha256=sha(f)) for f in files]), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(prepared=2, productionWritten=False, sourceDomainUnchanged=True)))
