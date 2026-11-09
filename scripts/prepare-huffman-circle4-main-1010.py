from pathlib import Path

root=Path.cwd()
base=root/'output/parallel/huffman-circle4-direct-1010'
out=root/'output/original-huffman-circle4-browser-1010'
out.mkdir(exist_ok=True)
text=(base/'verify.browser.js').read_text(encoding='utf8').replace('output/parallel/huffman-circle4-direct-1010','output/original-huffman-circle4-browser-1010')
(root/'scripts/verify-original-huffman-circle4-1010.browser.js').write_text(text,encoding='utf8')
text=(base/'audit_downloads.ts').read_text(encoding='utf8').replace("'./work/src/app/huffmanCircle4Direct'","'../src/app/huffmanCircle4Direct'")
text=text.replace('output/parallel/huffman-circle4-direct-1010','output/original-huffman-circle4-browser-1010').replace('browser-tests-delivery.log','browser-tests.log')
text=text.replace('`${out}/work/tests/fixtures/huffman-circle4-direct-20261010.json`',"'tests/fixtures/huffman-circle4-direct-20261010.json'")
(root/'scripts/verify-original-huffman-circle4-download-1010.ts').write_text(text,encoding='utf8')
print('Prepared actual main UI and readback scripts; no producer results copied.')
