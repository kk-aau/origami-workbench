from pathlib import Path
import hashlib,json,shutil,difflib
root=Path.cwd().resolve();base=root/'output/parallel/original-array-camera-realtime-delta-root-1011';assert not base.exists();base.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rows=[];patch=''
def edit(name,changes):
 global patch
 current=root/name;before=current.read_text(encoding='utf8');text=before
 for a,b in changes:
  assert text.count(a)==1,(name,a[:100],text.count(a));text=text.replace(a,b)
 old=base/'before'/name;old.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(current,old)
 after=base/'files'/name;after.parent.mkdir(parents=True,exist_ok=True);after.write_text(text,encoding='utf8',newline='\n')
 patch+=''.join(difflib.unified_diff(before.splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name))
 rows.append({'target':name,'baselineSha256':sha(current),'sha256':sha(after),'source':str(after.resolve()),'kind':'modified'})
edit('src/components/OriginalArrayStatic3DPlot.tsx',[
 ("type PointerEvent} from 'react';", "type PointerEvent,type Dispatch,type SetStateAction} from 'react';"),
 ("/** Camera operations affect only", "export type OriginalArrayCamera={azimuth:number;elevation:number;zoom:number};\nexport const INITIAL_ORIGINAL_ARRAY_CAMERA:OriginalArrayCamera={azimuth:-25,elevation:48,zoom:1};\n\n/** Camera operations affect only"),
 ("({reference,current}:{reference:OriginalArrayStatic3D;current:boolean})", "({reference,current,camera,onCameraChange}:{reference:OriginalArrayStatic3D;current:boolean;camera?:OriginalArrayCamera;onCameraChange?:Dispatch<SetStateAction<OriginalArrayCamera>>})"),
 ("[azimuth,setAzimuth]=useState(-25),[elevation,setElevation]=useState(48),[zoom,setZoom]=useState(1),[font,setFont]", "[localCamera,setLocalCamera]=useState<OriginalArrayCamera>(()=>({...INITIAL_ORIGINAL_ARRAY_CAMERA})),[font,setFont]"),
 ("scene=reference.scene;", "scene=reference.scene;\n const {azimuth,elevation,zoom}=camera??localCamera,setCamera=onCameraChange??setLocalCamera;"),
 ("useEffect(()=>{setAzimuth(-25);setElevation(48);setZoom(1);setVertex(0);}", "useEffect(()=>{if(!camera)setLocalCamera({...INITIAL_ORIGINAL_ARRAY_CAMERA});setVertex(0);}"),
 ("setZoom(z=>Math.max(.3,Math.min(5,z*Math.exp(-e.deltaY*.001))));", "setCamera(c=>({...c,zoom:Math.max(.3,Math.min(5,c.zoom*Math.exp(-e.deltaY*.001)))}));"),
 ("setAzimuth(d.a+(e.clientX-d.x)*.45);setElevation(Math.max(-85,Math.min(85,d.e+(e.clientY-d.y)*.35)));", "setCamera(c=>({...c,azimuth:d.a+(e.clientX-d.x)*.45,elevation:Math.max(-85,Math.min(85,d.e+(e.clientY-d.y)*.35))}));"),
 ("reset=()=>{setAzimuth(-25);setElevation(48);setZoom(1);};", "reset=()=>setCamera({...INITIAL_ORIGINAL_ARRAY_CAMERA});")])
edit('src/components/MiuraHuffmanCPDialog.tsx',[
 ("import OriginalArrayStatic3DPlot from", "import OriginalArrayStatic3DPlot,{INITIAL_ORIGINAL_ARRAY_CAMERA,type OriginalArrayCamera} from"),
 ("[view,setView]=useState<'cp'|'static-3d'>('cp');", "[view,setView]=useState<'cp'|'static-3d'>('cp'),[camera,setCamera]=useState<OriginalArrayCamera>(()=>({...INITIAL_ORIGINAL_ARRAY_CAMERA}));"),
 ("const timer=setTimeout(()=>", "const frame=requestAnimationFrame(()=>"),
 ("},130);return()=>clearTimeout(timer);", "});return()=>cancelAnimationFrame(frame);"),
 ("reference={spatial.reference} current={!!cp}/>", "reference={spatial.reference} current={!!cp} camera={camera} onCameraChange={setCamera}/>")])
edit('src/components/YoshimuraMiuraCP2534Dialog.tsx',[
 ("import OriginalArrayStatic3DPlot from", "import OriginalArrayStatic3DPlot,{INITIAL_ORIGINAL_ARRAY_CAMERA,type OriginalArrayCamera} from"),
 ("[view,setView]=useState<'cp'|'static-3d'>('cp');", "[view,setView]=useState<'cp'|'static-3d'>('cp'),[camera,setCamera]=useState<OriginalArrayCamera>(()=>({...INITIAL_ORIGINAL_ARRAY_CAMERA}));"),
 ("const timer=setTimeout(()=>", "const frame=requestAnimationFrame(()=>"),
 ("},130);return()=>clearTimeout(timer);", "});return()=>cancelAnimationFrame(frame);"),
 ("reference={spatial.reference} current={!!current&&state==='ready'}/>", "reference={spatial.reference} current={!!current&&state==='ready'} camera={camera} onCameraChange={setCamera}/>")])
file=base/'ui.patch';file.write_text(patch,encoding='utf8',newline='\n')
(base/'manifest.json').write_text(json.dumps({'files':rows,'patchSha256':sha(file),'actualFailure':'output/playwright/practical-spatial-ui-probe-1011/probe.json','scope':'UI-only: keep camera state in the dialog across CP/static tab remounts; coalesce latest source preview once per animation frame instead of waiting until dragging stops','mathAndCPHelpersUnchanged':True},ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared three camera/scheduling UI targets; mathematical source helpers untouched.')
