from pathlib import Path
import hashlib
import json
import shutil
root=Path.cwd()
target=root/'src/components/TessellationPanel.tsx'
backup=root/'output/parallel/integration-parabola-entry-label-1010-before'
assert not backup.exists()
before=target.read_bytes()
old='Huffman 共焦抛物线 · 部分完成'.encode('utf8')
new='Huffman 共焦抛物线 · 四参数／原部分完成'.encode('utf8')
assert before.count(old)==2
after=before.replace(old,new)
backup.mkdir(parents=True)
shutil.copy2(target,backup/target.name)
target.write_bytes(after)
record={'verified':True,'files':[{'file':'src/components/TessellationPanel.tsx','before':hashlib.sha256(before).hexdigest(),'after':hashlib.sha256(after).hexdigest()}],'changedOnlyTwoVisibleLabels':True,'originalOptionValuesAndRoutesPreserved':True}
(root/'output/parallel/original-parabola-entry-label-integrated-1010.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print('Both Parabola entries show four parameters and original partial status; other bytes unchanged.')
