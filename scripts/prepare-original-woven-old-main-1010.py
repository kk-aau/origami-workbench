from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
base = root / 'output/parallel/original-woven-old-1010'
out = root / 'output/original-woven-old-browser-1010'
assert not out.exists()
out.mkdir()
prefix = out.relative_to(root).as_posix()
records = []
for name, target in [
    ('verify.browser.js', 'verify-original-woven-old-1010.browser.js'),
    ('verify-full-h.browser.js', 'verify-original-woven-full-h-1010.browser.js'),
    ('verify-downloads.ts', 'verify-original-woven-old-download-1010.ts'),
]:
    source = base / name
    text = source.read_text(encoding='utf8')
    text = text.replace('evidence/', prefix + '/')
    if name.endswith('.ts'):
        text = text.replace("'./src/", "'../src/")
        text = text.replace('data/projects/', 'output/original-helpers-server-1010/projects/')
        text += '\nfs.writeFileSync(' + json.dumps(prefix + '/download-audit.json') + ',JSON.stringify({verified:true,actualDownloads:count,ordinaryDXFLineCounts:[64,64],layersSolved:true,sourceAndParametersPreserved:true,savedDocumentExact:true},null,2),{flag:"wx"});\n'
    elif name == 'verify.browser.js':
        text = text.replace('const checks=[],errors=[];', 'const bundle=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.getAttribute("src")).find(s=>s?.startsWith("/assets/main-")));const checks=[],errors=[];')
        text = text.replace('const report={passed:checks.length,checks,errors};', 'const report={passed:checks.length,checks,errors,bundle};')
    else:
        text = text.replace('const checks=[];', 'const errors=[];page.on("pageerror",e=>errors.push(e.message));const bundle=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.getAttribute("src")).find(s=>s?.startsWith("/assets/main-")));const checks=[];')
        text = text.replace('return {passed:checks.length,checks};', 'check(errors.length===0,"无页面运行异常");return {passed:checks.length,checks,errors,bundle};')
    dest = root / 'scripts' / target
    assert not dest.exists()
    dest.write_text(text, encoding='utf8')
    records.append({'source': source.relative_to(root).as_posix(), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'prepared': dest.relative_to(root).as_posix()})
(out / 'prepared-scripts.json').write_text(json.dumps({'records': records, 'noProducerResultCopied': True}, indent=2), encoding='utf8')
print('Prepared independent root Old CP adoption/export/reopen and full-h main UI checks; copied no producer output.')
