from pathlib import Path
import json
root=Path.cwd().resolve();target=root/'scripts/run-practical-construction-checks-002-1011.mjs';assert not target.exists()
text=(root/'scripts/run-practical-construction-checks-1011.mjs').read_text(encoding='utf8')
text=text.replace("const baseFile='output/original-arrays-checks-1011.json';","const baseFile='output/practical-construction-checks-1011.json';")
text=text.replace("const recordFile='output/practical-construction-checks-1011.json',logFile='output/practical-construction-checks-1011.log';","const recordFile='output/practical-construction-checks-002-1011.json',logFile='output/practical-construction-checks-002-1011.log';")
start=text.index('const integrationRecords=');end=text.index(".map(name=>",start)
names=['original-array-camera-realtime-delta-root','custom-mesh-editor-root','custom-mesh-connectivity-root','linked-bands-planar-root','original-six-static-root','practical-main-entries-root']
text=text[:start]+'const integrationRecords='+json.dumps(names)+text[end:]
text=text.replace('[8,2,8,3,1,6,7]','[3,4,2,5,3,4]')
start=text.index("reason:'");end=text.index("'}};",start)
reason="User-operable custom mesh source editing, linked-band planar CP literal-source constructor with an explicitly local numeric interpretation, and original six-degree static 3D guarded by complete hinge checks. Parent camera state persists across CP/3D tabs and numeric rendering is scheduled per animation frame. Existing core/backend/export/dependency SHA guards remain exact; 1337 backend tests are guarded reuse, other project stages run anew. Real App downloads and independent import readers run after this build. No device action, packaging or publishing."
text=text[:start]+"reason:"+json.dumps(reason)+text[end+1:]
target.write_text(text,encoding='utf8',newline='\n');print('Prepared 8 project stages against historical P69; 21 explicit sequential source records.')
