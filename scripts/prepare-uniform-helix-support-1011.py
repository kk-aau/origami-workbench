from pathlib import Path
import json

root=Path.cwd().resolve()
record_names=['original-uniform-helix-cp-3951','original-uniform-helix-parent-cascade','original-uniform-helix-fixed-origin','original-uniform-helix-root-wiring']
runner=(root/'scripts/run-original-nonuniform-spiral-checks-1011.mjs').read_text(encoding='utf8')
runner=runner.replace('original-cone-four-plane-apex-checks-1011.json','original-nonuniform-spiral-checks-1011.json')
runner=runner.replace('original-nonuniform-spiral-checks-1011','original-uniform-helix-checks-1011')
# Correct the protected baseline after renaming the output filename.
runner=runner.replace("const baseFile='output/original-uniform-helix-checks-1011.json'", "const baseFile='output/original-nonuniform-spiral-checks-1011.json'")
start=runner.index('const integrationRecords=')
end=runner.index('const protectedInputs=',start)
runner=runner[:start]+"const integrationRecords="+json.dumps(record_names)+".map(name=>JSON.parse(fs.readFileSync('output/parallel/'+name+'-integrated-1010.json','utf8')));\n"+"assert.ok(integrationRecords.every(r=>r.verified===true));assert.equal(integrationRecords[0].files.length,5);assert.equal(integrationRecords[3].files.length,2);\nconst integration={files:integrationRecords.flatMap(r=>r.files)};\nconst baseline=new Map(base.inputs.map(row=>[row.file,row.sha256])),mapped=new Map();\nfor(const row of integration.files){assert.equal(baseline.get(row.file)??null,row.before,row.file);baseline.set(row.file,row.after);mapped.set(row.file,row);}\nfor(const row of mapped.values())assert.equal(hash(row.file),row.after,row.file);\n"+runner[end:]
start=runner.index("reason:'Only the fixed saved")
end=runner.index("'}};",start)
runner=runner[:start]+"reason:'Only original In3951 analytic uniform finite CP, its private preview/dialog, one fixture/test and explicit App/panel entries changed. Existing backend algorithms and pre-existing numerical fixtures are byte-identical to the completed P61 first eight-stage checks; its protected backend 1337 result is reused. All planar TypeScript routines are rerun. Uniform source is analytic and makes no native API request. Main user operations and actual ordinary-format export files require independent checks. No Wolfram execution, finite rigid 3D, device trial or packaged desktop result is implied."+runner[end:]
runner=runner.replace('record.tests.buildModules>=1044','record.tests.buildModules>=1047')
server=(root/'scripts/start-original-nonuniform-spiral-final-server-1011.mjs').read_text(encoding='utf8')
server=server.replace('original-nonuniform-spiral','original-uniform-helix').replace('8873','8874')
start=server.index('for(const name of [');end=server.index('){',start)+1
server=server[:start]+'for(const name of '+json.dumps(record_names)+server[end:]
preserve=(root/'scripts/verify-nonuniform-spiral-final-preservation-1011.py').read_text(encoding='utf8')
preserve=preserve.replace('original-cone-four-plane-apex-final-1011.json','original-nonuniform-spiral-final-1011.json').replace('3900','3645')
start=preserve.index('records = [');end=preserve.index('\nlatest =',start)
preserve=preserve[:start]+'records = '+repr(['output/parallel/'+v+'-integrated-1010.json' for v in record_names])+preserve[end:]
preserve=preserve.replace('output/original-nonuniform-spiral-final-preservation-1011.json','output/original-uniform-helix-preservation-1011.json')
bundle=(root/'scripts/verify-nonuniform-spiral-bundle-1011.mjs').read_text(encoding='utf8').replace('original-nonuniform-spiral','original-uniform-helix')
for name,text in [('scripts/run-original-uniform-helix-checks-1011.mjs',runner),('scripts/start-original-uniform-helix-server-1011.mjs',server),('scripts/verify-uniform-helix-preservation-1011.py',preserve),('scripts/verify-uniform-helix-bundle-1011.mjs',bundle)]:
 p=root/name; assert not p.exists(); p.write_text(text,encoding='utf8')
print('Uniform check runner, isolated runtime, source preservation and bundle capture prepared')
