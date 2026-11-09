from pathlib import Path
import json

root = Path.cwd().resolve()


def write_new(file, text):
    target = root / file
    assert not target.exists(), file
    target.write_text(text, encoding='utf8')


def edit(text, old, new, count=1):
    assert text.count(old) == count, (old, text.count(old))
    return text.replace(old, new)


runner = (root / 'scripts/run-original-cone-four-plane-checks-1011.mjs').read_text(encoding='utf8')
runner = runner.replace('output/original-cone-four-plane-checks-1011', 'output/original-cone-four-plane-apex-checks-1011')
runner = edit(runner, "const baseFile='output/original-planar-ruled-checks-1011.json';", "const baseFile='output/original-cone-four-plane-checks-1011.json';")
runner = edit(runner, "const protectedInputs=base.inputs.filter(row=>row.file.startsWith('backend/')||row.file.startsWith('tests/fixtures/')||['scripts/test-tessellation.mjs','server.mjs','tess-worker.mjs','package.json','package-lock.json'].includes(row.file));",
    "const integration=JSON.parse(fs.readFileSync('output/parallel/original-cone-four-plane-apex-cp-4039-integrated-1010.json','utf8'));assert.equal(integration.verified,true);assert.equal(integration.files.length,5);\n"
    "const mapped=new Map(integration.files.map(row=>[row.file,row]));\n"
    "for(const row of integration.files){assert.equal(base.inputs.find(input=>input.file===row.file)?.sha256,row.before,row.file);assert.equal(hash(row.file),row.after,row.file);}\n"
    "const protectedInputs=base.inputs.filter(row=>(row.file.startsWith('backend/')||row.file.startsWith('tests/fixtures/')||['scripts/test-tessellation.mjs','server.mjs','tess-worker.mjs','package.json','package-lock.json'].includes(row.file))&&!mapped.has(row.file));")
runner = edit(runner,
    'Only the original In4039 finite cone four-band CP frontend, its App/panel connections and focused tests/new fixture changed after the completed P58 run with exact full-backend provenance. Original backend algorithms and all pre-existing shared numerical fixtures remain byte-identical. All planar TypeScript routines are rerun below; real In4039 API and independent source/format audits are verified separately.',
    'Only the original In4039 source-apex and explicit local-cut CP frontend, its dialog and focused tests/fixture changed after the completed P59 run with exact full-backend provenance. The sole replaced fixture is checked against the explicit five-file integration record; all backend algorithms and every other shared numerical fixture remain byte-identical. All planar TypeScript routines are rerun below; real In4039 API, actual old-v1 files and independent source/format audits are verified separately.')
runner = edit(runner, 'record.tests.buildModules>=1039', 'record.tests.buildModules>=1042')
write_new('scripts/run-original-cone-four-plane-apex-checks-1011.mjs', runner)

bundle = (root / 'scripts/verify-cone-four-plane-bundle-1011.mjs').read_text(encoding='utf8')
bundle = bundle.replace('original-cone-four-plane', 'original-cone-four-plane-apex')
bundle = edit(bundle, 'mainAppPassed:ui.passed,actualUserDownloads', 'mainAppPassed:ui.passed,mainAppChecks:ui.checks,actualUserDownloads')
write_new('scripts/verify-cone-apex-bundle-1011.mjs', bundle)

preservation = (root / 'scripts/verify-cone-four-plane-preservation-1011.py').read_text(encoding='utf8')
preservation = edit(preservation, 'output/audits/original-planar-ruled-final-1011.json', 'output/audits/original-cone-four-plane-final-1011.json')
preservation = edit(preservation, "['original-cone-four-plane-cp-4039','original-cone-four-plane-root-wiring']", "['original-cone-four-plane-apex-cp-4039']")
preservation = edit(preservation, 'output/original-cone-four-plane-preservation-1011.json', 'output/original-cone-four-plane-apex-preservation-1011.json')
write_new('scripts/verify-cone-apex-preservation-1011.py', preservation)

server = (root / 'scripts/start-original-cone-four-plane-server-1011.mjs').read_text(encoding='utf8')
server = edit(server, "'8871'", "'8872'")
server = edit(server, "['original-cone-four-plane-cp-4039','original-cone-four-plane-root-wiring']", "['original-cone-four-plane-apex-cp-4039']")
server = server.replace('output/original-cone-four-plane-', 'output/original-cone-four-plane-apex-')
server = edit(server, 'port:8871', 'port:8872')
write_new('scripts/start-original-cone-four-plane-apex-server-1011.mjs', server)
print(json.dumps(dict(preparedScripts=4, launched=False, productionWritten=False)))
