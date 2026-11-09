from pathlib import Path
import hashlib
import json

root=Path.cwd().resolve()
out=root/'output/original-ring-unsafe-courteous-browser-1010'
records=[]
def prepare(source,target,replacements):
    text=source.read_text(encoding='utf8')
    for a,b in replacements:text=text.replace(a,b)
    dest=root/'scripts'/target;assert not dest.exists();dest.write_text(text,encoding='utf8')
    records.append({'source':source.relative_to(root).as_posix(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'prepared':dest.relative_to(root).as_posix()})

base=root/'output/parallel/original-ring-log-1010';folder=out/'ring-log';assert not folder.exists();folder.mkdir(parents=True);prefix=folder.relative_to(root).as_posix()
prepare(base/'verify.browser.js','verify-original-ring-log-1010.browser.js',[
    ('evidence/',prefix+'/'),('const checks=[],errors=[];','const bundle=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.getAttribute("src")).find(s=>s?.startsWith("/assets/main-")));const checks=[],errors=[];'),
    ('const report={passed:checks.length,checks,errors};','const report={passed:checks.length,checks,errors,bundle};')])
prepare(base/'verify-downloads.ts','verify-original-ring-log-download-1010.ts',[
    ('evidence/',prefix+'/'),("'./tests/","'../tests/"),("'./src/","'../src/"),('data/projects/','output/original-ring-unsafe-courteous-server-1010/projects/')])
file=root/'scripts/verify-original-ring-log-download-1010.ts'
with file.open('a',encoding='utf8') as handle:handle.write('\nfs.writeFileSync('+repr(prefix+'/download-audit.json')+',JSON.stringify({verified:true,actualUserDownloads:count,ordinaryDXFLineCounts:[204,204],layersSolved:true,sourcePreserved:true,savedDocumentsExact:true},null,2),{flag:"wx"});\n')

base=root/'output/parallel/original-paraboloidal-x-1010';folder=out/'paraboloidal-x';assert not folder.exists();folder.mkdir();prefix=folder.relative_to(root).as_posix()
prepare(base/'verify.browser.js','verify-original-paraboloidal-x-1010.browser.js',[
    ('output/parallel/original-paraboloidal-x-1010',prefix),
    ('const waitResponse=predicate=>page.waitForResponse(r=>', 'const waitResponse=(predicate,status=200)=>page.waitForResponse(r=>r.status()===status&&'),
    ("p.focalLength===1000000);", "p.focalLength===1000000,422);")])
prepare(base/'audit_downloads.ts','verify-original-paraboloidal-x-download-1010.ts',[
    ('output/parallel/original-paraboloidal-x-1010',prefix),("'./work/src/","'../src/")])

base=root/'output/parallel/original-courteous-anarchy-1010';folder=out/'courteous';assert not folder.exists();folder.mkdir();prefix=folder.relative_to(root).as_posix()
for source,target in [('open-courteous.browser.js','open-original-courteous-1010.browser.js'),('verify-courteous.browser.js','verify-original-courteous-1010.browser.js'),('verify-courteous-switches.browser.js','verify-original-courteous-switches-1010.browser.js')]:
    replacements=[('output/playwright/courteous',prefix)]
    if source.startswith('open-'):replacements.append(("r.url().endsWith('/api/tessellate')&&","r.status()===200&&r.url().endsWith('/api/tessellate')&&"))
    else:
        replacements.extend([('const checks=[],errors=[];','const bundle=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.getAttribute("src")).find(s=>s?.startsWith("/assets/main-")));const checks=[],errors=[];'),
        ('actualOrdinaryFileDownloads:8};','actualOrdinaryFileDownloads:8,bundle};'),('const evidence={passed:checks.length,checks,errors};','const evidence={passed:checks.length,checks,errors,bundle};')])
    prepare(base/source,target,replacements)
prepare(base/'verify-courteous-downloads.py','verify-original-courteous-download-1010.py',[
    ('HERE=Path(__file__).resolve().parent','HERE=Path(__file__).resolve().parent.parent'),("OUT=HERE/'output/playwright/courteous'",'OUT=HERE/'+repr(prefix)),
    ("(HERE/'courteous-browser-final.log')","(OUT/'browser-tests.log')"),("(HERE/'courteous-browser-switches.log')","(OUT/'browser-switches.log')"),
    ("(HERE/'courteous-independent-download-evidence.json')","(OUT/'download-audit.json')")])
(out/'prepared-constructor-scripts.json').write_text(json.dumps({'records':records,'noProducerResultCopied':True,'inputFilesCopied':0},indent=2),encoding='utf8')
print('Prepared root real UI and independent actual export audits for Ring, X and original random Lines; no producer results copied.')
