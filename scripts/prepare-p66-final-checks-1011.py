from pathlib import Path

root = Path.cwd()
source = (root / 'scripts/run-original-uniform-helix-extended-checks-1011.mjs').read_text(encoding='utf-8')
replacements = {
    "const baseFile='output/original-nonuniform-helix-general-checks-1011.json';":
    "const baseFile='output/original-uniform-helix-extended-checks-1011.json';",
    "const recordFile='output/original-uniform-helix-extended-checks-1011.json',logFile='output/original-uniform-helix-extended-checks-1011.log';":
    "const recordFile='output/original-uniform-helix-extended-final-checks-1011.json',logFile='output/original-uniform-helix-extended-final-checks-1011.log';",
    '["original-uniform-helix-extended-root-delivery"]': '["original-uniform-helix-extended-final-layout-version"]',
    'integrationRecords[0].files.length,10': 'integrationRecords[0].files.length,6',
}
for before, after in replacements.items():
    assert source.count(before) == 1, before
    source = source.replace(before, after, 1)
start = source.index("reason:'")
end = source.index("'}};", start)
reason = ('Final P66 layout-only change in Dialog/CSS and 0.13.6 package/state/desktop explanatory version metadata. '
          'Source geometry helpers, Mode/App dispatch and core/backend stay unchanged. '
          'Package/lock dependency structures are compared exactly after excluding only the two root version fields. '
          'The backend 1337 result is reused from the earlier green P66 run by protected backend/source/fixture SHA; '
          '24 planar scripts and all seven other project stages are run again. Main 52 actual files and 24 parent states are separately rerun on this build. '
          'Prior before52 green and parent24 failed records remain immutable. This run does not claim machine import or pressing.')
source = source[:start] + "reason:'" + reason + source[end:]
marker = "const packageJson=JSON.parse(fs.readFileSync('package.json','utf8')),prefix="
assert source.count(marker) == 1
extra = """// Version metadata cannot change the protected dependency graph.
for(const file of ['package.json','package-lock.json']){
 const prior=JSON.parse(fs.readFileSync('output/parallel/integration-original-uniform-helix-extended-final-layout-version-1010-before/'+file,'utf8'));
 const current=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(prior.version,'0.13.5');assert.equal(current.version,'0.13.6');
 delete prior.version;delete current.version;
 if(file==='package-lock.json'){assert.equal(prior.packages[''].version,'0.13.5');assert.equal(current.packages[''].version,'0.13.6');delete prior.packages[''].version;delete current.packages[''].version;}
 assert.deepEqual(prior,current,'Version-only dependency graph '+file);
}
"""
source = source.replace(marker, extra + marker, 1)
target = root / 'scripts/run-original-uniform-helix-extended-final-checks-1011.mjs'
assert not target.exists()
target.write_text(source, encoding='utf-8')
print('Prepared final eight-stage runner, exact dependency metadata checks included.')
