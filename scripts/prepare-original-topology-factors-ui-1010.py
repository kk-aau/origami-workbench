from pathlib import Path
import hashlib
import json

root = Path.cwd().resolve()
out = root / 'output/playwright/original-topology-factors-main-1010'
out.mkdir(parents=True, exist_ok=False)
records = []

def prepare(source, target, replacements):
    text = source.read_text(encoding='utf8')
    for old, new in replacements:
        assert old in text, (source, old)
        text = text.replace(old, new)
    destination = root / 'scripts' / target
    with destination.open('x', encoding='utf8') as stream:
        stream.write(text)
    records.append({'source': source.relative_to(root).as_posix(),
                    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'prepared': destination.relative_to(root).as_posix()})

folder = out / 'flasher'
folder.mkdir()
prefix = folder.relative_to(root).as_posix()
for source, target in [
    ('verify-original-flasher-factors-1010.browser.js', 'verify-root-original-flasher-factors-1010.browser.js'),
    ('verify-original-flasher-factors-download-1010.ts', 'verify-root-original-flasher-factors-download-1010.ts'),
]:
    prepare(root / 'scripts' / source, target, [('output/playwright/flasher-factors-1010', prefix)])

folder = out / 'dual'
folder.mkdir()
prefix = folder.relative_to(root).as_posix()
base = root / 'output/parallel/original-dual-faces-1010'
prepare(base / 'verify.browser.js', 'verify-root-original-dual-faces-1010.browser.js', [
    ('evidence/', prefix + '/'), ('output/playwright/', prefix + '/'),
    ('const report={verified:true,passed:checks.length,checks,errors};',
     'const report={verified:true,passed:checks.length,checks,errors,bundle:await page.locator(\'script[type="module"]\').getAttribute(\'src\')};'),
])
prepare(base / 'verify-reopen.browser.js', 'verify-root-original-dual-faces-reopen-1010.browser.js', [('evidence/', prefix + '/')])
prepare(base / 'verify-downloads.ts', 'verify-root-original-dual-faces-download-1010.ts', [
    ("'./src/", "'../src/"), ('evidence/', prefix + '/'),
    ('data/projects/', 'output/original-topology-factors-server-1010/projects/'),
])
with (out / 'prepared-scripts.json').open('x', encoding='utf8') as stream:
    json.dump({'noProducerResultsCopied': True, 'records': records}, stream, indent=2)
print('Prepared fresh root Flasher and DualFaces UI/download audits; original evidence unchanged.')
