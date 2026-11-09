from pathlib import Path
root=Path.cwd().resolve();source=(root/'scripts/run-tube-strip-checks-001-1012.mjs').read_text(encoding='utf8')
source=source.replace('output/tube-strip-checks-001-1012','output/cone-space-checks-001-1012').replace("baseFile='output/path-array-checks-004-1012.json'", "baseFile='output/tube-strip-checks-001-1012.json'")
source=source.replace('serverWorker:base.tests.serverWorker}', 'serverWorker:base.tests.serverWorker,desktop:base.tests.desktop}').replace('backend:true,serverWorker:true,reason:', 'backend:true,serverWorker:true,desktop:true,reason:')
source=source.replace("['test:unit','test:desktop','build']", "['test:unit','build']").replace("output.tests.desktop=Number(text.match(/# pass (\\d+)/)?.[1]??passes[1]);", "")
source=source.replace('>=3416','>=3463')
p=root/'scripts/run-cone-space-checks-001-1012.mjs';assert not p.exists();p.write_text(source,encoding='utf8')
print('Prepared fresh full frontend/build runner with guarded unchanged backend/server/desktop inputs.')
