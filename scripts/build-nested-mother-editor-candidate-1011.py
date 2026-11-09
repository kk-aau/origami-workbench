from pathlib import Path
import json,hashlib,difflib
root=Path.cwd().resolve();folder=root/'output/parallel/nested-mother-visual-editor-root-1011'
def edit(name,changes):
 path=folder/'files'/name;text=(folder/'before'/name).read_text(encoding='utf8')
 for before,after in changes:
  assert text.count(before)==1,(name,before[:100],text.count(before))
  text=text.replace(before,after)
 path.write_text(text,encoding='utf8',newline='\n')
edit('src/components/PrimalDualSourceControls.tsx',[
 ("export const PRIMAL_DUAL_MOTHER_FAMILIES:TessFamily[]=['periodic','archimedean','nonperiodic','custom','ring'];","export {PRIMAL_DUAL_MOTHER_FAMILIES} from '../app/nestedMotherParams';\nimport {PRIMAL_DUAL_MOTHER_FAMILIES} from '../app/nestedMotherParams';"),
 ("export default function PrimalDualSourceControls({params,onChange}:{\n  params:Extract<TessParams,{family:'primal-dual'}>;onChange:(p:TessParams)=>void}){","export default function PrimalDualSourceControls({params,onChange,onEdit}:{\n  params:Extract<TessParams,{family:'primal-dual'}>;onChange:(p:TessParams)=>void;onEdit?:()=>void}){"),
 ("  const edit=()=>{\n    setText", "  const edit=()=>{\n    if(onEdit){onEdit();return;}\n    setText")])
edit('src/components/FlagstoneSourceControls.tsx',[
 ("({params,onChange}:{params:Extract<TessParams,{family:'flagstone'}>;onChange:(p:TessParams)=>void})", "({params,onChange,onEdit}:{params:Extract<TessParams,{family:'flagstone'}>;onChange:(p:TessParams)=>void;onEdit?:()=>void})"),
 ("onClick={()=>{setText(JSON.stringify(params.motherParams,null,2));", "onClick={()=>{if(onEdit){onEdit();return;}setText(JSON.stringify(params.motherParams,null,2));")])
edit('src/components/WovenGraphCanvas.tsx',[
 ("editable?:boolean;tool?:MotherTool;focus?:", "editable?:boolean;tool?:MotherTool;minimumLabelPixels?:number;focus?:"),
 ("editable=false,tool='move',focus,onEdgePick", "editable=false,tool='move',minimumLabelPixels=0,focus,onEdgePick"),
 ("font=view.span*11/Math.max(height,90)", "font=view.span*Math.max(11,minimumLabelPixels/.85)/Math.max(height,90)")])
name='src/components/TessellationPanel.tsx';before=(folder/'before'/name).read_text(encoding='utf8');text=before
changes=[
 ("import type {OriginalArrayKind}","import NestedMotherEditorDialog from './NestedMotherEditorDialog';\nimport type {NestedMotherParent} from '../app/nestedMotherParams';\nimport type {OriginalArrayKind}"),
 ("TessellationPanel({onOpenArray,", "TessellationPanel({motherEditor,onOpenArray,"),
 ("}:{onOpenArray?:(kind:OriginalArrayKind)","}:{motherEditor?:{families:TessFamily[];hidePaper:boolean};onOpenArray?:(kind:OriginalArrayKind)"),
 ("  const [dualSession,setDualSession]", "  const [motherSession,setMotherSession]=useState<NestedMotherParent|null>(null);\n  const [dualSession,setDualSession]"),
 ("      {!['circular-twist'", "      {!motherEditor?.hidePaper&&!['circular-twist'"),
 ("<PrimalDualSourceControls params={params} onChange={onChange}/>","<PrimalDualSourceControls params={params} onChange={onChange} onEdit={()=>setMotherSession(structuredClone(params))}/>"),
 ("<FlagstoneSourceControls params={params} onChange={onChange}/>","<FlagstoneSourceControls params={params} onChange={onChange} onEdit={()=>setMotherSession(structuredClone(params))}/>"),
 ("<button className=\"outline\" aria-label=\"从当前折痕提取\" onClick={onUseDrawing}>提取折痕</button>","{!motherEditor&&<button className=\"outline\" aria-label=\"从当前折痕提取\" onClick={onUseDrawing}>提取折痕</button>}"),
 ("{canPrune&&<button className=\"text-button\" onClick={()=>onChange(carryPaper", "{canPrune&&!motherEditor&&<button className=\"text-button\" onClick={()=>onChange(carryPaper"),
 ("{canPrimalDualSource&&<button className=\"text-button\"", "{canPrimalDualSource&&!motherEditor&&<button className=\"text-button\""),
 ("    <section><div className=\"tess-section-title\"><h2>{tilingOnly?'排布检查'", "    {!motherEditor&&<section><div className=\"tess-section-title\"><h2>{tilingOnly?'排布检查'"),
 ("    </section>\n    {dialog==='help'", "    </section>}\n    {motherSession&&<NestedMotherEditorDialog parent={motherSession} onApply={onChange} onClose={()=>setMotherSession(null)}\n      renderControls={controls=><TessellationPanel {...controls} motherEditor={{families:controls.families,hidePaper:controls.hidePaper}} onCancel={()=>{}} onUseDrawing={()=>{}}/>}/>}\n    {dialog==='help'")]
for old,new in changes:
 assert text.count(old)==1,(old[:100],text.count(old));text=text.replace(old,new)
old=next(line for line in text.splitlines() if line.startswith('    <section><div className="tess-section-title"><h2>构造方式'))
assert text.count(old)==1
new='    {!motherEditor?'+old.strip()+':<section><h2>母结构类型</h2><label className="select-field">构造类型<select aria-label="嵌套母结构类型" value={params.family} onChange={e=>onChange(tessPreset(e.target.value as TessFamily))}>{motherEditor.families.map(f=><option key={f} value={f}>{TESS_NAMES[f]}</option>)}</select></label></section>}'
text=text.replace(old,new)
(folder/'files'/name).write_text(text,encoding='utf8',newline='\n')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
files=[];patch=''
for path in sorted((folder/'files').rglob('*')):
 if not path.is_file():continue
 target=path.relative_to(folder/'files').as_posix();baseline=folder/'before'/target
 old=baseline.read_text(encoding='utf8') if baseline.exists() else ''
 new=path.read_text(encoding='utf8')
 patch+=''.join(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='a/'+target if baseline.exists() else '/dev/null',tofile='b/'+target))
 files.append({'target':target,'baselineSha256':sha(baseline) if baseline.exists() else None,'sha256':sha(path),'source':str(path.resolve()),'kind':'modified' if baseline.exists() else 'new'})
patch_path=folder/'nested-mother.patch';patch_path.write_text(patch,encoding='utf8',newline='\n')
(folder/'manifest.json').write_text(json.dumps({'schema':'root-frozen-candidate-v1','previous':'output/audits/original-arrays-final-1011.json','files':files,'patchSha256':sha(patch_path),'geometryAndBackendUnchanged':True,'productionUnchanged':True},ensure_ascii=False,indent=2),encoding='utf8')
print(f'Prepared {len(files)} candidate files with exact baseline and result SHA.')
