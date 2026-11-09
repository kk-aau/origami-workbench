from pathlib import Path
import json
root=Path.cwd().resolve();original=root/'scripts/run-original-arrays-checks-1011.mjs';target=root/'scripts/run-practical-construction-checks-1011.mjs';assert not target.exists()
text=original.read_text(encoding='utf8')
text=text.replace("const baseFile='output/practical-editors-checks-1011.json';","const baseFile='output/original-arrays-checks-1011.json';")
text=text.replace('output/original-arrays-checks-1011','output/practical-construction-checks-1011')
# Keep the prior actual P68 record as the immutable guarded baseline.
text=text.replace("const baseFile='output/practical-construction-checks-1011.json';","const baseFile='output/original-arrays-checks-1011.json';")
names=['nested-mother-visual-editor-root','nested-mother-visual-editor-delta-root','original-six-root-delivery','nested-mother-transfer-delta-root','nested-mother-focus-delta-root','original-static-spatial-root-delivery','woven-source-editor-root-delivery']
text=text.replace('["original-arrays-root-delivery"]',json.dumps(names))
text=text.replace('assert.equal(integrationRecords[0].files.length,18);','assert.deepEqual(integrationRecords.map(r=>r.files.length),[8,2,8,3,1,6,7]);')
start=text.index("reason:'Three original practical array constructors:");end=text.index("'}};",start)
text=text[:start]+"reason:'New original six-degree Yoshimura CP source, strict recipe reconstruction and three seed identities; checked signed-hinge static spatial previews for original Miura/Mars/Huffman and Yoshimura/Miura; line-group and source-boundary visual drafting; nested mother parameter controls and a real paper-transfer regression fix. Constructors retain raw geometry and the existing ordinary DXF conversion. All backend/core/export/dependency inputs remain exact SHA-identical. 1337 backend results reused under the same guard from P68; seven other project stages and 24 planar scripts execute afresh. Isolated candidate checks do not replace real App adoption, export readback or saved-source reopening. No package or publication.'"+text[end+1:]
target.write_text(text,encoding='utf8',newline='\n')
print('Prepared eight guarded project stages for 35 mapped records; no production inputs changed.')
