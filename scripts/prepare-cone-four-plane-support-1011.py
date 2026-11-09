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


runner = (root / 'scripts/run-original-planar-ruled-checks-1011.mjs').read_text(encoding='utf8')
runner = edit(runner, "const baseFile='output/original-conic-noncircle-checks-1011.json';", "const baseFile='output/original-planar-ruled-checks-1011.json';")
runner = runner.replace('output/original-planar-ruled-checks-1011', 'output/original-cone-four-plane-checks-1011')
# The previous check record remains the exact backend provenance base.
runner = edit(runner, "const baseFile='output/original-cone-four-plane-checks-1011.json';", "const baseFile='output/original-planar-ruled-checks-1011.json';")
runner = edit(runner,
    'Only the bounded original In4040 planar ruled CP frontend and the noncircle dialog layout, its two App/panel connections and focused tests/new fixtures changed after the completed noncircle run with exact full-backend provenance. Python backend and all pre-existing shared numerical fixtures remain byte-identical. All planar TypeScript routines are rerun below.',
    'Only the original In4039 finite cone four-band CP frontend, its App/panel connections and focused tests/new fixture changed after the completed P58 run with exact full-backend provenance. Original backend algorithms and all pre-existing shared numerical fixtures remain byte-identical. All planar TypeScript routines are rerun below; real In4039 API and independent source/format audits are verified separately.')
runner = edit(runner, 'record.tests.buildModules>=1036', 'record.tests.buildModules>=1039')
write_new('scripts/run-original-cone-four-plane-checks-1011.mjs', runner)

bundle = (root / 'scripts/verify-planar-ruled-bundle-1011.mjs').read_text(encoding='utf8')
bundle = bundle.replace('original-planar-ruled', 'original-cone-four-plane')
write_new('scripts/verify-cone-four-plane-bundle-1011.mjs', bundle)

preservation = (root / 'scripts/verify-planar-ruled-preservation-1011.py').read_text(encoding='utf8')
preservation = edit(preservation, 'output/audits/original-conic-noncircle-final-1011.json', 'output/audits/original-planar-ruled-final-1011.json')
preservation = edit(preservation, "['original-planar-ruled-cp-4040','original-planar-ruled-root-wiring','original-conic-noncircle-compact-ux']", "['original-cone-four-plane-cp-4039','original-cone-four-plane-root-wiring']")
preservation = edit(preservation, 'output/original-planar-ruled-preservation-1011.json', 'output/original-cone-four-plane-preservation-1011.json')
write_new('scripts/verify-cone-four-plane-preservation-1011.py', preservation)

server = (root / 'scripts/start-original-planar-ruled-server-1011.mjs').read_text(encoding='utf8')
server = edit(server, "'8870'", "'8871'")
server = edit(server, "['original-planar-ruled-cp-4040','original-planar-ruled-root-wiring','original-conic-noncircle-compact-ux']", "['original-cone-four-plane-cp-4039','original-cone-four-plane-root-wiring']")
server = server.replace('output/original-planar-ruled-', 'output/original-cone-four-plane-')
server = edit(server, 'port:8870', 'port:8871')
write_new('scripts/start-original-cone-four-plane-server-1011.mjs', server)
print(json.dumps(dict(preparedScripts=4, launched=False, productionWritten=False)))
