from pathlib import Path
import hashlib
import json
import shutil

root=Path.cwd().resolve()
base=root/'output/parallel/original-unsafe-twist-range-1010'
out=root/'output/original-ring-unsafe-courteous-browser-1010/unsafe'
assert not out.exists();out.mkdir(parents=True)
prefix=out.relative_to(root).as_posix()
records=[]
for name,target in [('verify.browser.js','verify-original-unsafe-twist-range-1010.browser.js'),('audit_downloads.ts','verify-original-unsafe-twist-range-download-1010.ts')]:
    source=base/name
    text=source.read_text(encoding='utf8').replace('output/parallel/original-unsafe-twist-range-1010',prefix)
    if name.endswith('.ts'):
        text=text.replace("'./work/src/","'../src/").replace('browser-tests-delivery.log','browser-tests.log')
        text=text.replace('`${out}/work/tests/fixtures/unsafe-twist-range-20261010.json`',"'tests/fixtures/unsafe-twist-range-20261010.json'")
    dest=root/'scripts'/target;assert not dest.exists();dest.write_text(text,encoding='utf8')
    records.append({'source':source.relative_to(root).as_posix(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'prepared':dest.relative_to(root).as_posix()})
shutil.copy2(base/'invalid-parameters.json',out/'invalid-parameters.json')
(out/'prepared-scripts.json').write_text(json.dumps({'records':records,'copiedOnlyAuthoredInvalidInput':True,'noProducerResultCopied':True},indent=2),encoding='utf8')
print('Prepared root true five-input main UI and actual file reread; copied only invalid authored input, no agent output.')
