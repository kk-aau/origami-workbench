from pathlib import Path
import difflib
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-uniform-helix-general-root-wiring-1011'
assert not base.exists()
base.mkdir()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
previous = json.loads((root / 'output/audits/original-spiral-refold-final-1011.json').read_text(encoding='utf-8'))
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
        text = add(text, "import {spiralRefoldCP3980SourceMatches,readSpiralRefoldCP3980Recipe} from './app/spiralRefoldCP3980';",
                   "\nimport UniformHelixGeneralCP3951Dialog from './components/UniformHelixGeneralCP3951Dialog';\nimport {uniformHelixGeneralCP3951SourceMatches,readUniformHelixGeneralCP3951Recipe} from './app/uniformHelixGeneralCP3951';")
        text = add(text, '  const spiralRefold3980Recipe=useMemo(()=>readSpiralRefoldCP3980Recipe(doc),[doc]),[spiralRefold3980Edit,setSpiralRefold3980Edit]=useState(false);',
                   '\n  const uniformHelixGeneral3951Recipe=useMemo(()=>readUniformHelixGeneralCP3951Recipe(doc),[doc]),[uniformHelixGeneral3951Edit,setUniformHelixGeneral3951Edit]=useState(false);')
        text = change(text, '  function adoptWovenCP()',
            "  function adoptUniformHelixGeneral3951CP(next:Doc){try{if(!uniformHelixGeneralCP3951SourceMatches(next))throw Error('原通用均匀螺旋参数、解析源、纸域或材料身份不一致，未采用。');\n"
            "    if(!approveReplace())return false;const regenerating=uniformHelixGeneral3951Edit&&!!readUniformHelixGeneralCP3951Recipe(docRef.current);\n"
            "    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n"
            "    setUniformHelixGeneral3951Edit(false);inform('已采用原通用均匀螺旋 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}\n  function adoptWovenCP()")
        text = add(text, '          {spiralRefold3980Recipe&&<button onClick={()=>setSpiralRefold3980Edit(true)}>修改原展开再折回纸面参数</button>}',
                   '\n          {uniformHelixGeneral3951Recipe&&<button onClick={()=>setUniformHelixGeneral3951Edit(true)}>修改原通用均匀螺旋纸面参数</button>}')
        text = add(text, 'onAdoptSpiralRefold3980CP={adoptSpiralRefold3980CP}', ' onAdoptUniformHelixGeneral3951CP={adoptUniformHelixGeneral3951CP}')
        text = add(text, '    {spiralRefold3980Edit&&spiralRefold3980Recipe&&<SpiralRefoldCP3980Dialog initial={spiralRefold3980Recipe} onAdoptCP={adoptSpiralRefold3980CP} onClose={()=>setSpiralRefold3980Edit(false)}/>}',
                   '\n    {uniformHelixGeneral3951Edit&&uniformHelixGeneral3951Recipe&&<UniformHelixGeneralCP3951Dialog initial={uniformHelixGeneral3951Recipe} onAdoptCP={adoptUniformHelixGeneral3951CP} onClose={()=>setUniformHelixGeneral3951Edit(false)}/>}')
    else:
        text = add(text, "import SpiralRefoldCP3980Dialog from './SpiralRefoldCP3980Dialog';", "\nimport UniformHelixGeneralCP3951Dialog from './UniformHelixGeneralCP3951Dialog';")
        text = change(text, 'onAdoptUniformHelix3951CP,onAdoptSpiralRefold3980CP}', 'onAdoptUniformHelix3951CP,onAdoptSpiralRefold3980CP,onAdoptUniformHelixGeneral3951CP}')
        text = change(text, 'onAdoptSpiralRefold3980CP?:(doc:Doc)=>boolean}', 'onAdoptSpiralRefold3980CP?:(doc:Doc)=>boolean;onAdoptUniformHelixGeneral3951CP?:(doc:Doc)=>boolean}')
        text = add(text, "|'spiral-refold-cp-3980'", "|'uniform-helix-general-cp-3951'")
        text = add(text, "event.target.value==='spiral-refold-cp-3980'?setDialog('spiral-refold-cp-3980'):", "event.target.value==='uniform-helix-general-cp-3951'?setDialog('uniform-helix-general-cp-3951'):", 2)
        text = add(text, '<option value="spiral-refold-cp-3980">原展开再折回 CP · In[3980]</option>', '<option value="uniform-helix-general-cp-3951">原通用均匀螺旋 CP · In[3951]</option>', 2)
        text = add(text, "    {dialog==='spiral-refold-cp-3980'&&<SpiralRefoldCP3980Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptSpiralRefold3980CP}/>}",
                   "\n    {dialog==='uniform-helix-general-cp-3951'&&<UniformHelixGeneralCP3951Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptUniformHelixGeneral3951CP}/>}")
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
