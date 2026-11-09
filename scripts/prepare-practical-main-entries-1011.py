from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();base=root/'output/parallel/practical-main-entries-root-1011';assert not base.exists();base.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files=[];patch=''
def edited(name,changes):
 global patch
 current=root/name;before=current.read_text(encoding='utf8');text=before
 for a,b in changes:
  assert text.count(a)==1,(name,a[:90],text.count(a));text=text.replace(a,b)
 saved=base/'before'/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(current,saved)
 target=base/'files'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf8',newline='\n')
 files.append({'target':name,'baselineSha256':sha(current),'sha256':sha(target),'source':str(target.resolve()),'kind':'modified'})
 patch+=''.join(difflib.unified_diff(before.splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name))
edited('src/components/TessellationPanel.tsx',[
 ("import {use", "import CustomMeshEditorDialog from './CustomMeshEditorDialog';\nimport {use"),
 ("{motherEditor,onOpenArray,params", "{motherEditor,onOpenArray,onOpenLinkedBands,params"),
 ("onOpenArray?:(kind:OriginalArrayKind)=>void;", "onOpenArray?:(kind:OriginalArrayKind)=>void;onOpenLinkedBands?:()=>void;"),
 ("useState<'help'|'checks'|'mesh'", "useState<'custom-source'|'help'|'checks'|'mesh'"),
 ("<button onClick={()=>onOpenArray('yoshimura-six')}>六度折筒</button></div>","<button onClick={()=>onOpenArray('yoshimura-six')}>六度折筒</button>{onOpenLinkedBands&&<button onClick={onOpenLinkedBands}>关联多带 CP</button>}</div>"),
 ("<button className=\"outline\" onClick={openJson}>编辑网格</button>","<button className=\"outline\" onClick={()=>setDialog('custom-source')}>编辑网格</button><button className=\"text-button\" onClick={openJson}>高级网格 JSON</button>"),
 ("    {dialog==='json'&&", "    {dialog==='custom-source'&&params.family==='custom'&&<CustomMeshEditorDialog initial={params} onApply={next=>{onCancelPreview?.();onChange(next);}} onClose={closeEditor}/>}\n    {dialog==='json'&&")])
edited('src/App.tsx',[
 ("import MiuraHuffmanCPDialog", "import LinkedBandsPlanarCP4086Dialog from './components/LinkedBandsPlanarCP4086Dialog';\nimport {readLinkedBandsPlanarCP4086Recipe,linkedBandsPlanarCP4086SourceMatches} from './app/linkedBandsPlanarCP4086';\nimport MiuraHuffmanCPDialog"),
 ("  const originalArraySource=", "  const linkedBands4086Recipe=useMemo(()=>readLinkedBandsPlanarCP4086Recipe(doc),[doc]);\n  const [linkedBands4086Dialog,setLinkedBands4086Dialog]=useState<{edit:boolean}|null>(null);\n  const originalArraySource="),
 ("  function adoptOriginalArrayCP(next:Doc):boolean{", "  function adoptLinkedBands4086CP(next:Doc):boolean{\n    try{if(!linkedBands4086Dialog||!linkedBandsPlanarCP4086SourceMatches(next))throw Error('关联多带参数、有限纸域或材料来源不一致，未采用。');\n      if(!approveReplace())return false;const regenerating=linkedBands4086Dialog.edit&&!!readLinkedBandsPlanarCP4086Recipe(docRef.current);\n      if(regenerating)next={...next,name:docRef.current.name};if(!replace(next,regenerating?projectId:null))return false;\n      setLinkedBands4086Dialog(null);inform('已采用关联多带二维 CP，保留原毫米位置、纸边及未知折痕。可编辑、保存和明确重建参数。');return true;\n    }catch(e){setError(errorText(e));return false;}\n  }\n  function adoptOriginalArrayCP(next:Doc):boolean{"),
 ("          {originalArraySource&&", "          {linkedBands4086Recipe&&<button onClick={()=>setLinkedBands4086Dialog({edit:true})}>修改关联多带纸面参数</button>}\n          {originalArraySource&&"),
 ("<TessellationPanel onOpenArray=", "<TessellationPanel onOpenLinkedBands={()=>setLinkedBands4086Dialog({edit:false})} onOpenArray="),
 ("    {originalArrayDialog?.kind==='wave-grid'", "    {linkedBands4086Dialog&&<LinkedBandsPlanarCP4086Dialog initial={linkedBands4086Dialog.edit?linkedBands4086Recipe??undefined:undefined} onAdoptCP={adoptLinkedBands4086CP} onClose={()=>setLinkedBands4086Dialog(null)}/>}\n    {originalArrayDialog?.kind==='wave-grid'")])
# Preserve mathematical candidate; only change its scheduling and view controls.
edited('src/components/LinkedBandsPlanarCP4086Dialog.tsx',[
 (" const svg=useRef<SVGSVGElement>(null),[size,setSize]=useState({w:660,h:460});", " const svg=useRef<SVGSVGElement>(null),[size,setSize]=useState({w:660,h:460}),[view,setView]=useState({zoom:1,x:0,y:0});\n const drag=useRef<{pointer:number;x:number;y:number;inverse:DOMMatrix;view:typeof view}|null>(null),wheel=useRef<(e:WheelEvent)=>void>(()=>{});\n wheel.current=e=>{e.preventDefault();const inverse=svg.current?.getScreenCTM()?.inverse();if(!inverse)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse),factor=Math.exp(Math.max(-.5,Math.min(.5,e.deltaY*.001)));setView(v=>({...v,zoom:Math.max(.05,Math.min(20,v.zoom*factor)),x:p.x-(p.x-v.x)*factor,y:p.y-(p.y-v.y)*factor}));};\n useEffect(()=>{const el=svg.current;if(!el)return;const fn=(e:WheelEvent)=>wheel.current(e);el.addEventListener('wheel',fn,{passive:false});return()=>el.removeEventListener('wheel',fn);},[]);"),
 ('viewBox={`${xmin-margin} ${ymin-margin} ${vw} ${vh}`} aria-label=', 'viewBox={`${(xmin+xmax)/2-vw*view.zoom/2+view.x} ${(ymin+ymax)/2-vh*view.zoom/2+view.y} ${vw*view.zoom} ${vh*view.zoom}`} style={{touchAction:\'none\',cursor:drag.current?\'grabbing\':\'grab\'}} onPointerDown={e=>{if(e.button!==0&&e.button!==1)return;const inverse=svg.current?.getScreenCTM()?.inverse();if(!inverse)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse);drag.current={pointer:e.pointerId,x:p.x,y:p.y,inverse,view};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.inverse);setView({...d.view,x:d.view.x+d.x-p.x,y:d.view.y+d.y-p.y});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} aria-label='),
 ('</svg><figcaption>{current?', '</svg><figcaption><button aria-label="多带视图缩小" onClick={()=>setView(v=>({...v,zoom:Math.min(20,v.zoom*1.3)}))}>−</button><button onClick={()=>setView({zoom:1,x:0,y:0})}>适合纸域</button><button aria-label="多带视图放大" onClick={()=>setView(v=>({...v,zoom:Math.max(.05,v.zoom/1.3)}))}>＋</button><span>{current?'),
 ("'黑 · 上一次有效纸域，当前参数尚不可采用'}</figcaption>", "'黑 · 上一次有效纸域，当前参数尚不可采用'}</span></figcaption>"),
 ("const timer=setTimeout(()=>{try{", "const timer=requestAnimationFrame(()=>{try{"),
 ("}}},150);", "}}});"),
 ("clearTimeout(timer);", "cancelAnimationFrame(timer);")])
edited('src/components/LinkedBandsPlanarCP4086Dialog.css',[
 ("grid-template-rows:minmax(0,1fr) 27px", "grid-template-rows:minmax(0,1fr) 34px"),
 (".linked4086-figure figcaption{font-size:11px;text-align:center;line-height:27px;color:#5c6b63}", ".linked4086-figure figcaption{font-size:11px;display:flex;align-items:center;justify-content:center;gap:5px;line-height:1.3;color:#5c6b63}.linked4086-figure figcaption button{padding:2px 5px;font-size:11px}.linked4086-figure figcaption span{margin-left:4px}")])
p=base/'entries.patch';p.write_text(patch,encoding='utf8',newline='\n')
(base/'manifest.json').write_text(json.dumps({'files':files,'patchSha256':sha(p),'rootEntries':True,'mathAndCoordinateConversionsUnchanged':True},ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared four root entry/view changes with exact baseline backups.')
