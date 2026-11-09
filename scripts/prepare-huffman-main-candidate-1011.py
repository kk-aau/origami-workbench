from pathlib import Path
import json,hashlib
root=Path.cwd().resolve();folder=root/'output/parallel/huffman-main-entries-root-1011';assert not folder.exists();folder.mkdir()
def edit(name,changes):
 p=root/name;s=p.read_text(encoding='utf8');before=hashlib.sha256(p.read_bytes()).hexdigest()
 for old,new in changes:
  assert s.count(old)==1,(name,old,s.count(old));s=s.replace(old,new)
 t=folder/'candidate'/name;t.parent.mkdir(parents=True,exist_ok=True);t.write_text(s,encoding='utf8');return {'target':name,'source':str(t),'baselineSha256':before,'sha256':hashlib.sha256(t.read_bytes()).hexdigest(),'kind':'root candidate, not integrated'}
adopt='''  function adoptHuffmanFiniteCP(next:Doc):boolean{
    try{const incoming=readHuffmanFiniteCPRecipe(next);if(!incoming||!huffmanFiniteCPSourceMatches(next))throw Error('Huffman 原二维源、峰谷折痕和实际纸面不一致，未采用。');
      if(!approveReplace())return false;const previous=readHuffmanFiniteCPRecipe(docRef.current),regenerating=huffmanFiniteEdit&&previous?.model===incoming.model;
      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;
      setHuffmanFiniteEdit(false);inform('已采用 Huffman 有限二维 CP，保留原峰谷、纸边和毫米坐标。可编辑、保存及普通导出；三维与平折层序未认证。');return true;
    }catch(e){setError(errorText(e));return false;}
  }
'''
rows=[edit('src/App.tsx',[
 ("import LinkedBandsPlanarCP4086Dialog from './components/LinkedBandsPlanarCP4086Dialog';","import LinkedBandsPlanarCP4086Dialog from './components/LinkedBandsPlanarCP4086Dialog';\nimport HuffmanFiniteCPDialog from './components/HuffmanFiniteCPDialog';\nimport {huffmanFiniteCPSourceMatches,readHuffmanFiniteCPRecipe} from './app/huffmanFiniteCP';"),
 ("  const linkedBands4086Recipe=useMemo(()=>readLinkedBandsPlanarCP4086Recipe(doc),[doc]);","  const linkedBands4086Recipe=useMemo(()=>readLinkedBandsPlanarCP4086Recipe(doc),[doc]);\n  const huffmanFiniteRecipe=useMemo(()=>readHuffmanFiniteCPRecipe(doc),[doc]),[huffmanFiniteEdit,setHuffmanFiniteEdit]=useState(false);"),
 ("  function adoptLinkedBands4086CP(next:Doc):boolean{",adopt+"  function adoptLinkedBands4086CP(next:Doc):boolean{"),
 ('          {linkedBands4086Recipe&&<button onClick={()=>setLinkedBands4086Dialog({edit:true})}>修改关联多带纸面参数</button>}', '          {linkedBands4086Recipe&&<button onClick={()=>setLinkedBands4086Dialog({edit:true})}>修改关联多带纸面参数</button>}\n          {huffmanFiniteRecipe&&<button onClick={()=>setHuffmanFiniteEdit(true)}>修改 Huffman 曲折纸面参数</button>}'),
 ('onAdoptAcrossCP={adoptAcrossCP} onAdoptConicCircleCP=', 'onAdoptHuffmanFiniteCP={adoptHuffmanFiniteCP} onAdoptAcrossCP={adoptAcrossCP} onAdoptConicCircleCP='),
 ('    {acrossCPEdit&&acrossCPRecipe&&<CurvedAcrossRightLinearAngleDialog', '    {huffmanFiniteEdit&&huffmanFiniteRecipe&&<HuffmanFiniteCPDialog initial={huffmanFiniteRecipe} onAdoptCP={adoptHuffmanFiniteCP} onClose={()=>setHuffmanFiniteEdit(false)}/>}\n    {acrossCPEdit&&acrossCPRecipe&&<CurvedAcrossRightLinearAngleDialog'),
 ]),edit('src/components/TessellationPanel.tsx',[
 ("import SpaceConstructionMenu from './SpaceConstructionMenu';","import SpaceConstructionMenu from './SpaceConstructionMenu';\nimport HuffmanFiniteCPDialog from './HuffmanFiniteCPDialog';\nimport {HUFFMAN_FINITE_CP_EXAMPLES} from '../app/huffmanFiniteCP';"),
 ('onAdoptAcrossCP,onAdoptConicCircleCP,','onAdoptHuffmanFiniteCP,onAdoptAcrossCP,onAdoptConicCircleCP,'),
 ('onAdoptAcrossCP?:(doc:Doc)=>boolean;', 'onAdoptHuffmanFiniteCP?:(doc:Doc)=>boolean;onAdoptAcrossCP?:(doc:Doc)=>boolean;'),
 ("|'huffman-parabola'|null>(null)","|'huffman-parabola'|'huffman-circle-cp'|'huffman-parabola-cp'|null>(null)"),
 ("    {dialog==='curved-linear-across'&&<CurvedAcrossRightLinearAngleDialog", "    {(dialog==='huffman-circle-cp'||dialog==='huffman-parabola-cp')&&<HuffmanFiniteCPDialog initial={HUFFMAN_FINITE_CP_EXAMPLES[dialog==='huffman-circle-cp'?'circle4':'parabola']} onAdoptCP={onAdoptHuffmanFiniteCP} onClose={()=>setDialog(null)}/>}\n    {dialog==='curved-linear-across'&&<CurvedAcrossRightLinearAngleDialog"),
 ]),edit('src/components/SpaceConstructionMenu.tsx',[
 ("|'discrete-curve-source';","|'discrete-curve-source'|'huffman-circle-cp'|'huffman-parabola-cp';"),
 ("{label:'曲折纸域 CP',entries:[dialog('conic-circle-cp'", "{label:'曲折纸域 CP',entries:[dialog('huffman-circle-cp','Huffman 圆曲折 CP'),dialog('huffman-parabola-cp','Huffman 共焦抛物线 CP'),dialog('conic-circle-cp'"),
 ])]
(folder/'manifest.json').write_text(json.dumps({'verifiedCandidate':True,'productionWritten':False,'files':rows},ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'productionWritten':False,'candidateFiles':len(rows)},ensure_ascii=False))
