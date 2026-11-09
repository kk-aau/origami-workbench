from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();folder=root/'output/parallel/huffman-main-entries-root-1011';manifest=folder/'manifest.json';data=json.loads(manifest.read_text(encoding='utf8'));assert not (folder/'single-main-before-extension').exists();shutil.copytree(folder/'candidate',folder/'single-main-before-extension');shutil.copy2(manifest,folder/'manifest-single-main-before-extension.json')
def edit(name,changes):
 row=next(r for r in data['files'] if r['target']==name);p=Path(row['source']);assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'];s=p.read_text(encoding='utf8')
 for old,new in changes:
  assert s.count(old)==1,(name,old,s.count(old));s=s.replace(old,new)
 p.write_text(s,encoding='utf8');row['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
adopts='''  function adoptAltMoselyFiniteCP(next:Doc):boolean{
    try{if(!altMoselyFiniteCPSourceMatches(next))throw Error('交替 Mosely 原剖面、赋型与实际纸面不一致，未采用。');
      if(!approveReplace())return false;const regenerating=altMoselyFiniteEdit&&!!readAltMoselyFiniteRecipe(docRef.current);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setAltMoselyFiniteEdit(false);inform('已采用原交替 Mosely 有限 CP，保留源剖面、峰谷及毫米坐标，可继续编辑、保存和导出。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
  function adoptEllipseAcrossFiniteCP(next:Doc,kind:'ellipse'|'across'):boolean{
    try{const read=kind==='ellipse'?readEllipseOpticalCP4034Recipe:readAcrossDescendingCP3988Recipe,match=kind==='ellipse'?ellipseOpticalCP4034SourceMatches:acrossDescendingCP3988SourceMatches;
      if(!read(next)||!match(next))throw Error('当前原曲折参数、峰谷、纸边与有限材料不一致，未采用。');
      if(!approveReplace())return false;const regenerating=ellipseAcrossFiniteEdit===kind&&!!read(docRef.current);
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setEllipseAcrossFiniteEdit(null);inform('已采用原曲折有限 CP，保留原坐标和纸边。可编辑、保存及明确恢复来源；没有三维或平折层序证书。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
'''
edit('src/App.tsx',[
 ("import {huffmanFiniteCPSourceMatches,readHuffmanFiniteCPRecipe} from './app/huffmanFiniteCP';", "import {huffmanFiniteCPSourceMatches,readHuffmanFiniteCPRecipe} from './app/huffmanFiniteCP';\nimport AltMoselyFiniteCP3556Dialog from './components/AltMoselyFiniteCP3556Dialog';\nimport {altMoselyFiniteCPSourceMatches,readAltMoselyFiniteRecipe} from './app/altMoselyFiniteCP3556';\nimport EllipseAcrossFiniteCPDialog from './components/EllipseAcrossFiniteCPDialog';\nimport {ellipseOpticalCP4034SourceMatches,readEllipseOpticalCP4034Recipe,acrossDescendingCP3988SourceMatches,readAcrossDescendingCP3988Recipe} from './app/ellipseAcrossFiniteCP';"),
 ("  const huffmanFiniteRecipe=useMemo(()=>readHuffmanFiniteCPRecipe(doc),[doc]),[huffmanFiniteEdit,setHuffmanFiniteEdit]=useState(false);", "  const huffmanFiniteRecipe=useMemo(()=>readHuffmanFiniteCPRecipe(doc),[doc]),[huffmanFiniteEdit,setHuffmanFiniteEdit]=useState(false);\n  const altMoselyFiniteRecipe=useMemo(()=>readAltMoselyFiniteRecipe(doc),[doc]),[altMoselyFiniteEdit,setAltMoselyFiniteEdit]=useState(false);\n  const ellipseOpticalRecipe=useMemo(()=>readEllipseOpticalCP4034Recipe(doc),[doc]),acrossDescendingRecipe=useMemo(()=>readAcrossDescendingCP3988Recipe(doc),[doc]),[ellipseAcrossFiniteEdit,setEllipseAcrossFiniteEdit]=useState<'ellipse'|'across'|null>(null);"),
 ('  function adoptHuffmanFiniteCP(next:Doc):boolean{',adopts+'  function adoptHuffmanFiniteCP(next:Doc):boolean{'),
 ('          {huffmanFiniteRecipe&&<button onClick={()=>setHuffmanFiniteEdit(true)}>修改 Huffman 曲折纸面参数</button>}', '          {huffmanFiniteRecipe&&<button onClick={()=>setHuffmanFiniteEdit(true)}>修改 Huffman 曲折纸面参数</button>}\n          {altMoselyFiniteRecipe&&<button onClick={()=>setAltMoselyFiniteEdit(true)}>修改交替 Mosely 纸面参数</button>}\n          {ellipseOpticalRecipe&&<button onClick={()=>setEllipseAcrossFiniteEdit(\'ellipse\')}>修改原光学椭圆纸面参数</button>}\n          {acrossDescendingRecipe&&<button onClick={()=>setEllipseAcrossFiniteEdit(\'across\')}>修改原下降折角纸面参数</button>}'),
 ('onAdoptHuffmanFiniteCP={adoptHuffmanFiniteCP} onAdoptAcrossCP=', "onAdoptAltMoselyFiniteCP={adoptAltMoselyFiniteCP} onAdoptEllipseOpticalCP={next=>adoptEllipseAcrossFiniteCP(next,'ellipse')} onAdoptAcrossDescendingCP={next=>adoptEllipseAcrossFiniteCP(next,'across')} onAdoptHuffmanFiniteCP={adoptHuffmanFiniteCP} onAdoptAcrossCP="),
 ('    {huffmanFiniteEdit&&huffmanFiniteRecipe&&<HuffmanFiniteCPDialog', "    {altMoselyFiniteEdit&&altMoselyFiniteRecipe&&<AltMoselyFiniteCP3556Dialog initial={altMoselyFiniteRecipe} onAdoptCP={adoptAltMoselyFiniteCP} onClose={()=>setAltMoselyFiniteEdit(false)}/>}\n    {ellipseAcrossFiniteEdit==='ellipse'&&ellipseOpticalRecipe&&<EllipseAcrossFiniteCPDialog kind=\"ellipse\" initial={ellipseOpticalRecipe} onAdoptCP={next=>adoptEllipseAcrossFiniteCP(next,'ellipse')} onClose={()=>setEllipseAcrossFiniteEdit(null)}/>}\n    {ellipseAcrossFiniteEdit==='across'&&acrossDescendingRecipe&&<EllipseAcrossFiniteCPDialog kind=\"across\" initial={acrossDescendingRecipe} onAdoptCP={next=>adoptEllipseAcrossFiniteCP(next,'across')} onClose={()=>setEllipseAcrossFiniteEdit(null)}/>}\n    {huffmanFiniteEdit&&huffmanFiniteRecipe&&<HuffmanFiniteCPDialog"),
])
edit('src/components/TessellationPanel.tsx',[
 ("import HuffmanFiniteCPDialog from './HuffmanFiniteCPDialog';", "import HuffmanFiniteCPDialog from './HuffmanFiniteCPDialog';\nimport AltMoselyFiniteCP3556Dialog from './AltMoselyFiniteCP3556Dialog';\nimport EllipseAcrossFiniteCPDialog from './EllipseAcrossFiniteCPDialog';"),
 ('onAdoptHuffmanFiniteCP,onAdoptAcrossCP,','onAdoptAltMoselyFiniteCP,onAdoptEllipseOpticalCP,onAdoptAcrossDescendingCP,onAdoptHuffmanFiniteCP,onAdoptAcrossCP,'),
 ('onAdoptHuffmanFiniteCP?:(doc:Doc)=>boolean;', 'onAdoptAltMoselyFiniteCP?:(doc:Doc)=>boolean;onAdoptEllipseOpticalCP?:(doc:Doc)=>boolean;onAdoptAcrossDescendingCP?:(doc:Doc)=>boolean;onAdoptHuffmanFiniteCP?:(doc:Doc)=>boolean;'),
 ("|'huffman-parabola-cp'|null>(null)","|'huffman-parabola-cp'|'alt-mosely-cp-3556'|'ellipse-optical-cp-4034'|'across-descending-cp-3988'|null>(null)"),
 ("    {(dialog==='huffman-circle-cp'||dialog==='huffman-parabola-cp')", "    {dialog==='alt-mosely-cp-3556'&&<AltMoselyFiniteCP3556Dialog onAdoptCP={next=>onAdoptAltMoselyFiniteCP?.(next)??false} onClose={()=>setDialog(null)}/>}\n    {dialog==='ellipse-optical-cp-4034'&&<EllipseAcrossFiniteCPDialog kind=\"ellipse\" onAdoptCP={next=>onAdoptEllipseOpticalCP?.(next)??false} onClose={()=>setDialog(null)}/>}\n    {dialog==='across-descending-cp-3988'&&<EllipseAcrossFiniteCPDialog kind=\"across\" onAdoptCP={next=>onAdoptAcrossDescendingCP?.(next)??false} onClose={()=>setDialog(null)}/>}\n    {(dialog==='huffman-circle-cp'||dialog==='huffman-parabola-cp')"),
])
edit('src/components/SpaceConstructionMenu.tsx',[
 ("|'huffman-parabola-cp';","|'huffman-parabola-cp'|'alt-mosely-cp-3556'|'ellipse-optical-cp-4034'|'across-descending-cp-3988';"),
 ("'paraboloidal-flasher'].map(value=>family(value as SpaceFamily))}","'paraboloidal-flasher'].map(value=>family(value as SpaceFamily)).concat(dialog('alt-mosely-cp-3556','交替 Mosely 壶体 CP'))}"),
 ("dialog('huffman-parabola-cp','Huffman 共焦抛物线 CP'),dialog('conic-circle-cp'", "dialog('huffman-parabola-cp','Huffman 共焦抛物线 CP'),dialog('ellipse-optical-cp-4034','原光学椭圆 CP · In[4034]'),dialog('across-descending-cp-3988','原下降折角反折 CP · In[3988]'),dialog('conic-circle-cp'"),
])
data['scope']='five practical CP entry/root source reconstruction candidates; helpers still independent delivery';manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'candidateFiles':len(data['files']),'newNamedEntrypoints':5,'productionWritten':False},ensure_ascii=False))
