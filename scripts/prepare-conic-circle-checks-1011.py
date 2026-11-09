from pathlib import Path
root=Path.cwd()
source=(root/'scripts/run-original-cross-runtime-checks-1010.mjs').read_text(encoding='utf8')
source=source.replace('output/original-topology-factors-checks-constructible-retry-1010.json','output/original-topology-factors-checks-finite-npoints-1011.json')
source=source.replace('original-constructible-cross-runtime-checks-1010','original-conic-circle-checks-1011')
source=source.replace('Only frontend derived-number comparison and its focused TypeScript regression/fixture changed after the completed full run.', 'Only the bounded original conic-circle CP frontend, its two App/panel connections and focused tests/new fixtures changed after the completed full N-point run.')
source=source.replace('record.tests.backend>=1322&&record.tests.buildModules>=1029','record.tests.backend>=1337&&record.tests.buildModules>=1030')
target=root/'scripts/run-original-conic-circle-checks-1011.mjs';assert not target.exists();target.write_text(source,encoding='utf8')
print('Prepared complete related checks with unchanged full-1337-backend provenance and all planar TypeScript scripts rerun.')
