from pathlib import Path

root=Path.cwd()
base=root/'output/parallel/huffman-parabola-direct-1010'
out=root/'output/original-huffman-parabola-browser-1010'
out.mkdir(exist_ok=True)
text=(base/'verify.browser.js').read_text(encoding='utf8').replace('output/parallel/huffman-parabola-direct-1010','output/original-huffman-parabola-browser-1010')
(root/'scripts/verify-original-huffman-parabola-1010.browser.js').write_text(text,encoding='utf8')
text=(base/'audit_downloads.ts').read_text(encoding='utf8').replace("'./work/src/","'../src/")
text=text.replace('output/parallel/huffman-parabola-direct-1010','output/original-huffman-parabola-browser-1010').replace('browser-tests-delivery.log','browser-tests.log')
text=text.replace('`${out}/work/tests/fixtures/huffman-parabola-direct-20261010.json`',"'tests/fixtures/huffman-parabola-direct-20261010.json'")
text=text.replace('actualHttpResponses:12','actualHttpResponses:14')
text=text.replace('assert.equal(ui.passed,20);','assert.equal(ui.passed,20);assert.equal(ui.responses.length,4);')
(root/'scripts/verify-original-huffman-parabola-download-1010.ts').write_text(text,encoding='utf8')
print('Prepared real main UI/readback scripts; no producer results copied.')
