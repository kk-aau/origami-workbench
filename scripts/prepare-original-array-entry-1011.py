"""Prepare root-owned App/Panel wiring without changing live production files."""
from pathlib import Path
import difflib,hashlib,json
root=Path.cwd().resolve();folder=root/'output/parallel/practical-array-entry-root-1011'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def replace_once(text,before,after):
    assert text.count(before)==1,before[:90]
    return text.replace(before,after,1)
def generate(name):
    text=(root/name).read_text(encoding='utf-8')
    if name=='src/App.tsx':
        text=replace_once(text,"import NonuniformHelixGeneralCP3966Dialog from './components/NonuniformHelixGeneralCP3966Dialog';", """import NonuniformHelixGeneralCP3966Dialog from './components/NonuniformHelixGeneralCP3966Dialog';
import MiuraHuffmanCPDialog from './components/MiuraHuffmanCPDialog';
import YoshimuraMiuraCP2534Dialog from './components/YoshimuraMiuraCP2534Dialog';
import WaterbombTessellation2604Dialog from './components/WaterbombTessellation2604Dialog';
import {readOriginalArraySource,originalArraySourceMatches,sameOriginalArrayFamily,type OriginalArrayKind} from './app/originalArraySource';""")
        marker="  const [dockSettings,setDockSettings]=useState<'properties'|'clipboard'|'background'|'canvashelp'|null>(null);"
        text=replace_once(text,marker,"""  const originalArraySource=useMemo(()=>readOriginalArraySource(doc),[doc]);
  const [originalArrayDialog,setOriginalArrayDialog]=useState<{kind:OriginalArrayKind;edit:boolean}|null>(null);
"""+marker)
        marker='  function adoptWovenCP(){'
        text=replace_once(text,marker,"""  function adoptOriginalArrayCP(next:Doc):boolean{
    try{
      const source=readOriginalArraySource(next);
      if(!source||source.kind!==originalArrayDialog?.kind||!originalArraySourceMatches(next))throw Error('原阵列参数、折痕或材料来源不一致，未采用。');
      if(!approveReplace())return false;
      const regenerating=originalArrayDialog.edit&&sameOriginalArrayFamily(readOriginalArraySource(docRef.current),source);
      if(regenerating)next={...next,name:docRef.current.name};
      if(!replace(next,regenerating?projectId:null))return false;
      setOriginalArrayDialog(null);
      inform('已仅采用原阵列 CP，保留原折角和毫米坐标；可以编辑、保存、导出及明确重建来源。未载入平折或层序证书。');
      return true;
    }catch(e){setError(errorText(e));return false;}
  }
"""+marker)
        marker='          {nonuniformHelixGeneral3966Recipe&&<button onClick={()=>setNonuniformHelixGeneral3966Edit(true)}>修改原任意折角函数纸面参数</button>}'
        text=replace_once(text,marker,marker+'\n          {originalArraySource&&<button onClick={()=>setOriginalArrayDialog({kind:originalArraySource.kind,edit:true})}>修改原阵列构造参数</button>}')
        text=replace_once(text,'<TessellationPanel params=',"<TessellationPanel onOpenArray={kind=>setOriginalArrayDialog({kind,edit:false})} params=")
        marker='    {acrossCPEdit&&acrossCPRecipe&&'
        text=replace_once(text,marker,"""    {originalArrayDialog?.kind==='wave-grid'&&<MiuraHuffmanCPDialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='wave-grid'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}
    {originalArrayDialog?.kind==='yoshimura-miura'&&<YoshimuraMiuraCP2534Dialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='yoshimura-miura'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}
    {originalArrayDialog?.kind==='waterbomb'&&<WaterbombTessellation2604Dialog initial={originalArrayDialog.edit&&originalArraySource?.kind==='waterbomb'?originalArraySource.recipe:undefined} onAdoptCP={adoptOriginalArrayCP} onClose={()=>setOriginalArrayDialog(null)}/>}
"""+marker)
    else:
        text=replace_once(text,"import type {Doc} from '../core/types';","import type {Doc} from '../core/types';\nimport type {OriginalArrayKind} from '../app/originalArraySource';")
        text=replace_once(text,'export default function TessellationPanel({params,','export default function TessellationPanel({onOpenArray,params,')
        text=replace_once(text,':{params:TessParams;onChange:',':{onOpenArray?:(kind:OriginalArrayKind)=>void;params:TessParams;onChange:')
        marker='</button>)}</div></section>\n    <section><div className="tess-section-title"><h2>构造参数</h2>'
        text=replace_once(text,marker,"""</button>)}</div>{onOpenArray&&<div className="tess-actions" aria-label="原版参数阵列构造"><button onClick={()=>onOpenArray('wave-grid')}>波纹阵列</button><button onClick={()=>onOpenArray('yoshimura-miura')}>双向螺旋／混合</button><button onClick={()=>onOpenArray('waterbomb')}>水雷阵列</button></div>}</section>
    <section><div className="tess-section-title"><h2>构造参数</h2>""")
    return text
manifest=[];patch=[]
for name in ['src/App.tsx','src/components/TessellationPanel.tsx']:
    source=root/name;out=folder/'files'/name;assert not out.exists();out.parent.mkdir(parents=True,exist_ok=True)
    before=source.read_text(encoding='utf-8');after=generate(name);out.write_text(after,encoding='utf-8')
    manifest.append({'target':name,'baselineSha256':sha(source),'sha256':sha(out),'source':out.as_posix(),'kind':'modified'})
    patch.extend(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name))
name='src/app/originalArraySource.ts';source=folder/'files'/name;assert not (root/name).exists()
manifest.append({'target':name,'baselineSha256':None,'sha256':sha(source),'source':source.as_posix(),'kind':'new'})
patch.extend(difflib.unified_diff([],source.read_text(encoding='utf-8').splitlines(keepends=True),fromfile='/dev/null',tofile='b/'+name))
patch_path=folder/'original-array-entry.patch';assert not patch_path.exists();patch_path.write_text(''.join(patch),encoding='utf-8')
with (folder/'manifest.json').open('x',encoding='utf-8') as f:json.dump({'files':manifest,'patchSha256':sha(patch_path),'productionWritten':False,'entryScope':'three actual arrays, shared explicit source editing/adoption, same model identity retained'},f,ensure_ascii=False,indent=2)
print(json.dumps({'prepared':True,'targets':len(manifest),'productionWritten':False}))
