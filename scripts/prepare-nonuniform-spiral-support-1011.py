from pathlib import Path
import json

root = Path.cwd().resolve()

def edit(text, old, new, count=1):
    assert text.count(old) == count, (old, text.count(old))
    return text.replace(old, new)

def write_new(name, text):
    p = root / name
    assert not p.exists(), name
    p.write_text(text, encoding='utf8')

runner = (root / 'scripts/run-original-cone-four-plane-apex-checks-1011.mjs').read_text(encoding='utf8')
runner = edit(runner, "const baseFile='output/original-cone-four-plane-checks-1011.json';", "const baseFile='output/original-cone-four-plane-apex-checks-1011.json';")
runner = runner.replace('output/original-cone-four-plane-apex-checks-1011', 'output/original-nonuniform-spiral-checks-1011')
runner = edit(runner, "const baseFile='output/original-nonuniform-spiral-checks-1011.json';", "const baseFile='output/original-cone-four-plane-apex-checks-1011.json';")
runner = edit(runner,
    "const integration=JSON.parse(fs.readFileSync('output/parallel/original-cone-four-plane-apex-cp-4039-integrated-1010.json','utf8'));assert.equal(integration.verified,true);assert.equal(integration.files.length,5);",
    "const integrationRecords=['original-nonuniform-spiral-cp-3968','original-nonuniform-spiral-root-wiring'].map(name=>JSON.parse(fs.readFileSync('output/parallel/'+name+'-integrated-1010.json','utf8')));\n"
    "assert.ok(integrationRecords.every(r=>r.verified===true));assert.equal(integrationRecords[0].files.length,5);assert.equal(integrationRecords[1].files.length,2);\n"
    "const integration={files:integrationRecords.flatMap(r=>r.files)};")
runner = edit(runner, "base.inputs.find(input=>input.file===row.file)?.sha256,row.before", "base.inputs.find(input=>input.file===row.file)?.sha256??null,row.before")
runner = edit(runner,
    'Only the original In4039 source-apex and explicit local-cut CP frontend, its dialog and focused tests/fixture changed after the completed P59 run with exact full-backend provenance. The sole replaced fixture is checked against the explicit five-file integration record; all backend algorithms and every other shared numerical fixture remain byte-identical. All planar TypeScript routines are rerun below; real In4039 API, actual old-v1 files and independent source/format audits are verified separately.',
    'Only the fixed saved In3968 finite local CP bridge/dialog, one new fixture/test and explicit App/panel entries changed after completed P60 checks. Existing backend algorithms and every pre-existing numerical fixture remain byte-identical. All planar TypeScript routines are rerun; actual In3968 native API, strict finite paper, source identity, widths and real user formats are independently verified separately. No Wolfram execution, interval ODE certificate, finite rigid 3D, device trial or packaged desktop result is implied.')
runner = edit(runner, 'record.tests.buildModules>=1042', 'record.tests.buildModules>=1044')
write_new('scripts/run-original-nonuniform-spiral-checks-1011.mjs', runner)

server = (root / 'scripts/start-original-cone-four-plane-apex-server-1011.mjs').read_text(encoding='utf8')
server = edit(server, "'8872'", "'8873'")
server = edit(server, "['original-cone-four-plane-apex-cp-4039']", "['original-nonuniform-spiral-cp-3968','original-nonuniform-spiral-root-wiring']")
server = server.replace('output/original-cone-four-plane-apex-', 'output/original-nonuniform-spiral-')
server = edit(server, 'port:8872', 'port:8873')
write_new('scripts/start-original-nonuniform-spiral-server-1011.mjs', server)
print(json.dumps(dict(prepared=2, launched=False, productionWritten=False)))
