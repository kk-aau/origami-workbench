from pathlib import Path
import json,hashlib
p=Path('src/components/RingControls.tsx');before=p.read_bytes();t=before.decode('utf8')
old="  const original=params.ringMode==='origamica';"
assert t.count(old)==1;t=t.replace(old,old+"\n  const indexedVectors=!!params.outerVectorTemplate&&!!params.creaseVectorTemplate;")
old="outerVectorExpressions:undefined,creaseVectorExpressions:undefined,outerVectorTemplate:undefined,creaseVectorTemplate:undefined,vectorFunctionDefinitions:undefined})}/>"
new="outerVectorExpressions:undefined,creaseVectorExpressions:undefined,outerVectorTemplate:indexedVectors?params.outerVectorTemplate:undefined,creaseVectorTemplate:indexedVectors?params.creaseVectorTemplate:undefined,vectorFunctionDefinitions:indexedVectors?params.vectorFunctionDefinitions:undefined})}/>"
assert t.count(old)==1;t=t.replace(old,new)
saved=Path('output/parallel/integration-ring-count-source-1010-before/src/components/RingControls.tsx');assert not saved.exists();saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes(before)
p.write_text(t,encoding='utf8',newline='')
Path('output/original-ring-count-source-fix-1010.json').write_text(json.dumps({'file':str(p).replace('\\','/'),'before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(p.read_bytes()).hexdigest(),'scope':'changing propagation count retains indexed pfn/rfn templates and definitions; per-ring arrays keep existing reset behavior'},ensure_ascii=False,indent=2),encoding='utf8')
print('Retained indexed curve source and definitions when changing ring count; no curve edits or original constraints changed.')
