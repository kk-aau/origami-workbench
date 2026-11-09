from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();work=root/'output/parallel/cone-space-check-snapshot-005-1012/work';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();delta=json.loads((root/'output/parallel/cone-space-height-delta-1012/manifest.json').read_text(encoding='utf8'))
for r in delta['files']:assert sha(work/r['target'])==r['baselineSha256']
for r in delta['files']:shutil.copy2(r['source'],work/r['target']);assert sha(work/r['target'])==r['sha256']
text=(work/'scripts/run-cone-space-checks-005-1012.mjs').read_text(encoding='utf8')
text=text.replace("file='../../../cone-space-checks-005-1012.json',log='../../../cone-space-checks-005-1012.log',baseFile='../../../cone-space-checks-004-1012.json'", "file='../../../cone-space-checks-006-1012.json',log='../../../cone-space-checks-006-1012.log',baseFile='../../../cone-space-checks-005-1012.json'").replace('parallel/cone-space-layout-delta-1012/manifest.json','parallel/cone-space-height-delta-1012/manifest.json')
p=work/'scripts/run-cone-space-checks-006-1012.mjs';assert not p.exists();p.write_text(text,encoding='utf8')
print('Prepared one-CSS build rerun; all frontend source and geometry checks remain held fixed.')
