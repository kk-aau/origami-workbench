from pathlib import Path
root=Path.cwd()
source=(root/'scripts/run-original-conic-circle-checks-1011.mjs').read_text(encoding='utf8')
source=source.replace('original-conic-circle-checks-1011','original-conic-noncircle-checks-1011')
source=source.replace('original-topology-factors-checks-finite-npoints-1011','original-conic-circle-checks-1011')
source=source.replace('bounded original conic-circle CP frontend','bounded original non-circle conic CP frontend')
source=source.replace('completed full N-point run','completed circle run with exact full-backend provenance')
source=source.replace('record.tests.buildModules>=1030','record.tests.buildModules>=1033')
target=root/'scripts/run-original-conic-noncircle-checks-1011.mjs'
assert not target.exists()
target.write_text(source,encoding='utf8')
print('Prepared next complete related checks; do not launch before reviewed source integration.')
