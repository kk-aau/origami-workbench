from pathlib import Path
import hashlib
import json
import shutil

root=Path.cwd()
target=root/'src/components/TessellationPanel.tsx'
backup=root/'output/parallel/integration-circle4-entry-label-1010-before'
assert not backup.exists()
before=target.read_bytes()
old='Huffman 六角尖角柱 · 只读'.encode('utf8')
new='Huffman 圆曲折 · 四参数／闭合例'.encode('utf8')
assert before.count(old)==2
after=before.replace(old,new)
backup.mkdir(parents=True)
shutil.copy2(target,backup/target.name)
target.write_bytes(after)
record={'verified':True,'files':[{'file':'src/components/TessellationPanel.tsx','before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}],'changedOnlyTwoVisibleLabels':True,'originalOptionValuesAndRoutesPreserved':True}
(root/'output/parallel/original-circle4-entry-label-integrated-1010.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print('Updated both Circle4 menu labels; option values/routes and all other file bytes preserved.')
