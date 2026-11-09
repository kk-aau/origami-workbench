from pathlib import Path
import difflib
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-cone-four-plane-root-wiring-1011'
assert not base.exists()
sha = lambda data: hashlib.sha256(data).hexdigest()
previous = json.loads((root / 'output/audits/original-planar-ruled-final-1011.json').read_text(encoding='utf8'))
hashes = {row['file']: row['sha256'] for row in previous['snapshots']}
targets = ['src/App.tsx', 'src/components/TessellationPanel.tsx']
patch = []
rows = []


def replace(text, old, new, count=1):
    assert text.count(old) == count, (old, text.count(old))
    return text.replace(old, new)


for name in targets:
    before = (root / name).read_bytes()
    assert sha(before) == hashes[name], name
    text = before.decode('utf8').replace('\r\n', '\n')
    if name == 'src/App.tsx':
        anchor = "import PlanarRuledCP4040Dialog from './components/PlanarRuledCP4040Dialog';"
        text = replace(text, anchor, anchor + "\nimport ConeFourPlaneCP4039Dialog from './components/ConeFourPlaneCP4039Dialog';\nimport {coneFourPlaneCP4039SourceMatches,readConeFourPlaneCP4039Recipe} from './app/coneFourPlaneCP4039';")
        anchor = 'const planarRuled4040Recipe=useMemo(()=>readPlanarRuledCP4040Recipe(doc),[doc]),[planarRuled4040Edit,setPlanarRuled4040Edit]=useState(false);'
        text = replace(text, anchor, anchor + '\n  const coneFourPlane4039Recipe=useMemo(()=>readConeFourPlaneCP4039Recipe(doc),[doc]),[coneFourPlane4039Edit,setConeFourPlane4039Edit]=useState(false);')
        text = replace(text, '  function adoptWovenCP(){', "  function adoptConeFourPlane4039CP(next:Doc){try{if(!coneFourPlaneCP4039SourceMatches(next))throw Error('原圆锥输入、四阶段来源或二维材料身份不一致，未采用。');\n    if(!approveReplace())return false;const regenerating=coneFourPlane4039Edit&&!!readConeFourPlaneCP4039Recipe(docRef.current);\n    if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n    setConeFourPlane4039Edit(false);inform('已仅采用原圆锥四带 CP：保留所选折痕标记与真实纸边，可以编辑、保存和导出。');return true;}catch(e){setError(errorText(e));return false;}}\n  function adoptWovenCP(){")
        anchor = '{planarRuled4040Recipe&&<button onClick={()=>setPlanarRuled4040Edit(true)}>修改原直纹纸面参数</button>}'
        text = replace(text, anchor, anchor + '\n          {coneFourPlane4039Recipe&&<button onClick={()=>setConeFourPlane4039Edit(true)}>修改原圆锥四带参数</button>}')
        text = replace(text, 'onAdoptPlanarRuled4040CP={adoptPlanarRuled4040CP} curveEditRequest=', 'onAdoptPlanarRuled4040CP={adoptPlanarRuled4040CP} onAdoptConeFourPlane4039CP={adoptConeFourPlane4039CP} curveEditRequest=')
        anchor = '{planarRuled4040Edit&&planarRuled4040Recipe&&<PlanarRuledCP4040Dialog initial={planarRuled4040Recipe} onAdoptCP={adoptPlanarRuled4040CP} onClose={()=>setPlanarRuled4040Edit(false)}/>}'
        text = replace(text, anchor, anchor + '\n    {coneFourPlane4039Edit&&coneFourPlane4039Recipe&&<ConeFourPlaneCP4039Dialog initial={coneFourPlane4039Recipe} onAdoptCP={adoptConeFourPlane4039CP} onClose={()=>setConeFourPlane4039Edit(false)}/>}')
    else:
        anchor = "import PlanarRuledCP4040Dialog from './PlanarRuledCP4040Dialog';"
        text = replace(text, anchor, anchor + "\nimport ConeFourPlaneCP4039Dialog from './ConeFourPlaneCP4039Dialog';")
        text = replace(text, 'onAdoptPlanarRuled4040CP}:', 'onAdoptPlanarRuled4040CP,onAdoptConeFourPlane4039CP}:')
        text = replace(text, 'onAdoptPlanarRuled4040CP?:(doc:Doc)=>boolean}){', 'onAdoptPlanarRuled4040CP?:(doc:Doc)=>boolean;onAdoptConeFourPlane4039CP?:(doc:Doc)=>boolean}){')
        text = replace(text, "|'planar-ruled-cp-4040'|", "|'planar-ruled-cp-4040'|'cone-four-plane-cp-4039'|")
        anchor = "event.target.value==='planar-ruled-cp-4040'?setDialog('planar-ruled-cp-4040'):"
        text = replace(text, anchor, anchor + "event.target.value==='cone-four-plane-cp-4039'?setDialog('cone-four-plane-cp-4039'):", 2)
        anchor = '<option value="planar-ruled-cp-4040">原直纹三面 CP · In[4040]</option>'
        text = replace(text, anchor, anchor + '<option value="cone-four-plane-cp-4039">原圆锥四带 CP · In[4039]</option>', 2)
        anchor = "{dialog==='planar-ruled-cp-4040'&&<PlanarRuledCP4040Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptPlanarRuled4040CP}/> }".replace('/> }', '/>}')
        text = replace(text, anchor, anchor + "\n    {dialog==='cone-four-plane-cp-4039'&&<ConeFourPlaneCP4039Dialog onClose={()=>setDialog(null)} onAdoptCP={onAdoptConeFourPlane4039CP}/>}")
    after = text.encode('utf8')
    for part, data in [('before', before), ('after', after)]:
        file = base / part / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
    patch.extend(difflib.unified_diff(before.decode('utf8').replace('\r\n', '\n').splitlines(True), text.splitlines(True), fromfile='a/' + name, tofile='b/' + name))
    rows.append(dict(target=name, baselineSha256=sha(before), sha256=sha(after), source=str(base / 'after' / name)))
patch_file = base / 'entry.patch'
patch_file.write_bytes(''.join(patch).encode('utf8'))
(base / 'manifest.json').write_text(json.dumps(dict(files=rows, patchSha256=sha(patch_file.read_bytes()), sourceBaseline='output/audits/original-planar-ruled-final-1011.json', originalHelpersWritten=False, entryAndSourceReeditOnly=True), ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(targets=len(rows), patch=str(patch_file)), ensure_ascii=False))
