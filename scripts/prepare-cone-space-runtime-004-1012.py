from pathlib import Path

root = Path.cwd().resolve()
source = (root / 'scripts/prepare-cone-space-runtime-003-1012.py').read_text(encoding='utf8')
source = source.replace('003-1012', '004-1012').replace('downloads-003', 'downloads-004').replace('cli-config-003.json', 'cli-config-004.json').replace("folder/'cli-003'", "folder/'cli-004'").replace('cone-space-checks-007-1012.json', 'cone-space-checks-008-1012.json')
source = source.replace('cone-space-main-003.browser.js', 'cone-space-main-004.browser.js')
source = source.replace("scripts/prepare-cone-space-runtime-004-1012.py", "scripts/prepare-cone-space-runtime-003-1012.py")
exec(compile(source, str(root / 'scripts/prepare-cone-space-runtime-004-1012.py'), 'exec'))
