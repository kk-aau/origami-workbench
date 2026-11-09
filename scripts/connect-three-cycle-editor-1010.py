from pathlib import Path
p=Path('src/components/ThreeCycleNativeControls.tsx');t=p.read_text(encoding='utf8')
changes=[("import {TessDialog} from './TessellationEditor';","import TessellationEditor,{TessDialog} from './TessellationEditor';"),
("[busy,setBusy]=useState(false),generation=useRef(0)","[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),generation=useRef(0)"),
(" const calculate=async()=>", " const input=(()=>{try{return readThreeCycleQuery({family:'three-cycle-critical-native',edges:JSON.parse(text),checkHalfPlane:check});}catch{return null;}})();\n const calculate=async()=>"),
("</p><label>原三边JSON<textarea", "</p><button className=\"outline\" disabled={!input} onClick={()=>setEditing(true)}>拖动三边端点</button><details><summary>精确端点 JSON</summary><label>原三边JSON<textarea"),
("style={{width:'100%',minHeight:80}}/></label><label>","style={{width:'100%',minHeight:80}}/></label></details><label>"),
("</p></TessDialog>;", "</p>{editing&&input&&<TessellationEditor title=\"原三条有向边端点\" initial={input.edges.flat()} edges={[[0,1],[2,3],[4,5]]} min={-1000} max={1000} xLabel=\"原X\" yLabel=\"原Y\" invertY minPoints={6} maxPoints={6} previewSummary={<span>点1→2、3→4、5→6；拖动端点，滚轮缩放，Alt／中键平移</span>} validateGeometry={p=>readThreeCycleQuery({...input,edges:[[p[0],p[1]],[p[2],p[3]],[p[4],p[5]]]})?'':'需要六个有限二维端点。'} onClose={()=>setEditing(false)} onApply={p=>{invalidate();setText(JSON.stringify([[p[0],p[1]],[p[2],p[3]],[p[4],p[5]]]));setEditing(false);}}/>}</TessDialog>;")]
for old,new in changes:
 assert t.count(old)==1,old;t=t.replace(old,new)
p.write_text(t,encoding='utf8')
print('Connected three directed-edge endpoints to the existing ruler, zoom, pan and exact coordinate editor; snap remains off.')
