from pathlib import Path
import difflib
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-nonuniform-spiral-3968-root-wiring-r2-1011'
assert not base.exists()
base.mkdir(parents=True)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def replace(text, old, new, count=1):
    assert text.count(old) == count, (old, text.count(old))
    return text.replace(old, new)

targets = ['src/App.tsx', 'src/components/TessellationPanel.tsx']
expected = ['c5504bb4eecd24f47a6f4f6ae9259432e02c0800bd813d4acfe1ee0fbd2d6d8d',
            'c3a624154e0688a63ce04756d1a6a0b7594b6e2762d6aef6ba1708fb7217eb13']
entries = []
patches = []
for name, original_sha in zip(targets, expected):
    original = (root / name).read_bytes()
    assert sha(original) == original_sha, name
    text = original.decode('utf8')
    if name == 'src/App.tsx':
        text = replace(text,
            "import ConeFourPlaneCP4039Dialog from './components/ConeFourPlaneCP4039Dialog';",
            "import ConeFourPlaneCP4039Dialog from './components/ConeFourPlaneCP4039Dialog';\n"
            "import NonuniformSpiralCP3968Dialog from './components/NonuniformSpiralCP3968Dialog';\n"
            "import {nonuniformSpiralCP3968SourceMatches,readNonuniformSpiralCP3968Recipe} from './app/nonuniformSpiralCP3968';")
        line = '  const coneFourPlane4039Recipe=useMemo(()=>readConeFourPlaneCP4039Recipe(doc),[doc]),[coneFourPlane4039Edit,setConeFourPlane4039Edit]=useState(false);'
        text = replace(text, line, line + '\n  const nonuniformSpiral3968Recipe=useMemo(()=>readNonuniformSpiralCP3968Recipe(doc),[doc]),[nonuniformSpiral3968Edit,setNonuniformSpiral3968Edit]=useState(false);')
        anchor = '  function adoptWovenCP()'
        text = replace(text, anchor,
            "  function adoptNonuniformSpiral3968CP(next:Doc){try{if(!nonuniformSpiralCP3968SourceMatches(next))throw Error('原非均匀螺旋输入、二维纸域或材料身份不一致，未采用。');\n"
            "    if(!approveReplace())return false;const regenerating=nonuniformSpiral3968Edit&&!!readNonuniformSpiralCP3968Recipe(docRef.current);\n"
            "    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n"
            "    setNonuniformSpiral3968Edit(false);inform('已采用原非均匀螺旋内切 CP：未知折痕 U、真实纸边 B，可编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}\n" + anchor)
        anchor = '          {coneFourPlane4039Recipe&&<button onClick={()=>setConeFourPlane4039Edit(true)}>修改原圆锥四带参数</button>}'
        text = replace(text, anchor, anchor + '\n          {nonuniformSpiral3968Recipe&&<button onClick={()=>setNonuniformSpiral3968Edit(true)}>修改原非均匀螺旋纸面参数</button>}')
        anchor = 'onAdoptConeFourPlane4039CP={adoptConeFourPlane4039CP}'
        text = replace(text, anchor, anchor + ' onAdoptNonuniformSpiral3968CP={adoptNonuniformSpiral3968CP}')
        anchor = '    {coneFourPlane4039Edit&&coneFourPlane4039Recipe&&<ConeFourPlaneCP4039Dialog initial={coneFourPlane4039Recipe} onAdoptCP={adoptConeFourPlane4039CP} onClose={()=>setConeFourPlane4039Edit(false)}/>}'
        text = replace(text, anchor, anchor + '\n    {nonuniformSpiral3968Edit&&nonuniformSpiral3968Recipe&&<NonuniformSpiralCP3968Dialog initial={nonuniformSpiral3968Recipe} onAdoptCP={adoptNonuniformSpiral3968CP} onClose={()=>setNonuniformSpiral3968Edit(false)}/>}')
    else:
        anchor = "import ConeFourPlaneCP4039Dialog from './ConeFourPlaneCP4039Dialog';"
        text = replace(text, anchor, anchor + "\nimport NonuniformSpiralCP3968Dialog from './NonuniformSpiralCP3968Dialog';")
        text = replace(text, 'onAdoptPlanarRuled4040CP,onAdoptConeFourPlane4039CP}', 'onAdoptPlanarRuled4040CP,onAdoptConeFourPlane4039CP,onAdoptNonuniformSpiral3968CP}')
        text = replace(text, 'onAdoptConeFourPlane4039CP?:(doc:Doc)=>boolean}', 'onAdoptConeFourPlane4039CP?:(doc:Doc)=>boolean;onAdoptNonuniformSpiral3968CP?:(doc:Doc)=>boolean}')
        text = replace(text, "|'cone-four-plane-cp-4039'|", "|'cone-four-plane-cp-4039'|'nonuniform-spiral-cp-3968'|")
        anchor = "event.target.value==='cone-four-plane-cp-4039'?setDialog('cone-four-plane-cp-4039'):"
        text = replace(text, anchor, anchor + "event.target.value==='nonuniform-spiral-cp-3968'?setDialog('nonuniform-spiral-cp-3968'):", 2)
        anchor = '<option value="cone-four-plane-cp-4039">原圆锥四带 CP · In[4039]</option>'
        text = replace(text, anchor, anchor + '<option value="nonuniform-spiral-cp-3968">原非均匀螺旋内切 CP · In[3968]</option>', 2)
        anchor = "    {dialog==='cone-four-plane-cp-4039'&&<ConeFourPlaneCP4039Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptConeFourPlane4039CP}/>}"
        text = replace(text, anchor, anchor + "\n    {dialog==='nonuniform-spiral-cp-3968'&&<NonuniformSpiralCP3968Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptNonuniformSpiral3968CP}/>}")
    data = text.encode('utf8')
    target = base / 'files' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    patches.extend(difflib.unified_diff(original.decode('utf8').splitlines(True), text.splitlines(True), fromfile='a/' + name, tofile='b/' + name))
    entries.append(dict(target=name, baselineSha256=sha(original), sha256=sha(data), source=str(target), kind='modified'))

patch = base / 'root-wiring.patch'
patch.write_bytes(''.join(patches).encode('utf8'))
manifest = base / 'manifest.json'
manifest.write_text(json.dumps(dict(files=entries, patchSha256=sha(patch.read_bytes()), productionWritten=False), ensure_ascii=False, indent=2), encoding='utf8')
frozen = [base / 'files' / name for name in targets] + [patch, manifest]
(base / 'freeze.json').write_text(json.dumps(dict(verified=True, files=[dict(file=str(f.relative_to(root)).replace('\\', '/'), sha256=sha(f.read_bytes())) for f in frozen]), ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(preparedFiles=2, productionWritten=False, baselineMatched=True, freezeSha256=sha((base / 'freeze.json').read_bytes()))))
