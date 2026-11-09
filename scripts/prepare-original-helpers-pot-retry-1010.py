from pathlib import Path
import hashlib
import json
import shutil

root=Path.cwd().resolve()
old=root/'output/original-helpers-browser-final-1010/pot-section'
out=root/'output/original-helpers-browser-final-1010/pot-section-final'
assert not out.exists()
out.mkdir()
shutil.copytree(old/'inputs',out/'inputs')
records=[]
for name,ext in [('open','browser.js'),('verify','browser.js'),('verify-download','py')]:
    source_name='verify-original-helpers-pot-section-download-1010.py' if name=='verify-download' else name+'-original-helpers-pot-section-1010.browser.js'
    source=root/'scripts'/source_name
    text=source.read_text(encoding='utf8').replace(old.relative_to(root).as_posix(),out.relative_to(root).as_posix())
    text=text.replace("r.url().endsWith('/api/tessellate')&&", "r.status()===200&&r.url().endsWith('/api/tessellate')&&")
    text=text.replace("r.url().endsWith('/api/tessellation/pot-cross-section-graphics')&&", "r.status()===200&&r.url().endsWith('/api/tessellation/pot-cross-section-graphics')&&")
    target=root/'scripts'/(source_name.replace('-1010.', '-retry-1010.'))
    assert not target.exists()
    target.write_text(text,encoding='utf8')
    records.append({'source':source.relative_to(root).as_posix(),'beforeSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'prepared':target.relative_to(root).as_posix(),'afterSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
(out/'prepared-scripts.json').write_text(json.dumps({'reason':'Wait only for actual successful response; concurrent requests can first receive an existing 409/429 busy reply and retry. Earlier failed harness log and files retained.','productionChanged':False,'records':records,'noProducerResultCopied':True},indent=2),encoding='utf8')
print('Prepared fresh main UI retry with successful-response predicate; retained earlier failed harness artifacts, changed no app code.')
